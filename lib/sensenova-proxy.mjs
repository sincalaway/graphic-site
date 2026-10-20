// Dedicated SenseNova transport. No bindings or content logging. Never retry image POSTs.
const TARGETS = Object.freeze({
  "/api/sensenova/images/generations": "https://token.sensenova.cn/v1/images/generations",
  "/api/sensenova/images/edits": "https://token.sensenova.cn/v1/images/edits",
});
const MODELS_PATH = "/api/sensenova/models";
const MODELS_TARGET = "https://token.sensenova.cn/v1/models";
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 120000;
const MODELS_MAX_ATTEMPTS = 3;
const MODELS_RETRY_DELAY_MS = 2000;
const ALLOWED_MODEL = "sensenova-u1.5-lite";
const ALLOWED_FIELDS = new Set(["model", "prompt", "n"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SAFE_UPSTREAM_CODES = new Set([
  "invalid_api_key", "invalid_request_error", "authentication_error", "permission_denied",
  "insufficient_quota", "rate_limit_exceeded", "model_not_found", "model_not_available",
  "content_policy_violation", "server_error", "internal_error", "service_unavailable",
]);
// Never log raw errors, headers, URLs, request/response bodies or provider messages.
function diagnostic(request) {
  const started = Date.now();
  const ray = request.headers.get("CF-Ray") || "";
  const requestId = /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(ray) ? ray : crypto.randomUUID();
  return (stage, upstreamStatus = null, errorCode = null) => {
    try {
      console.log(JSON.stringify({ stage, request_id: requestId, model: ALLOWED_MODEL,
        upstream_status: upstreamStatus, error_code: errorCode, elapsed_ms: Math.max(0, Date.now() - started) }));
    } catch (_) { /* Diagnostics must never change request handling. */ }
  };
}
function retryDelay(ms, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
async function upstreamErrorCode(response, secret) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") || "")) {
      await response.body?.cancel(); return "non_json_error";
    }
    const bytes = await boundedBody(response, 65536);
    const value = JSON.parse(new TextDecoder().decode(bytes));
    const code = value?.error?.code;
    return typeof code === "string" && code !== secret && SAFE_UPSTREAM_CODES.has(code) ? code : "unrecognized_error";
  } catch (_) { return "unreadable_error"; }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}
function fail(status, code, headers) { return json({ error: { code } }, status, headers); }
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("Sec-Fetch-Site");
  // Reject same-site sibling origins too. Missing metadata allows non-browser clients;
  // these checks are defense in depth, not authentication or rate limiting.
  return !site || site === "same-origin" || site === "none";
}
function auth(request) {
  const value = request.headers.get("Authorization");
  return value && /^Bearer [^\s\x00-\x1f\x7f]{1,4096}$/i.test(value) ? value : null;
}
function validCommon(fields) {
  for (const key of fields.keys()) if (!ALLOWED_FIELDS.has(key)) return false;
  if (fields.get("model") !== ALLOWED_MODEL) return false;
  const prompt = fields.get("prompt");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 100000) return false;
  const n = fields.get("n");
  if (!["string", "number"].includes(typeof n) || !/^[1-4]$/.test(String(n))) return false;
  return { model: ALLOWED_MODEL, prompt, n: Number(n) };
}
async function boundedBody(message, limit) {
  const length = message.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error("too_large");
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error("too_large"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}
function responseData(raw, key) {
  if (!raw || !Array.isArray(raw.data) || raw.data.length < 1 || raw.data.length > 4) throw new Error("bad_response");
  const data = raw.data.map((item) => {
    if (!item || typeof item !== "object") throw new Error("bad_response");
    if (typeof item.b64_json === "string" && item.b64_json && item.b64_json.length <= MAX_RESPONSE_BYTES)
      return { b64_json: item.b64_json };
    if (typeof item.url === "string" && item.url.length <= 8192) {
      const url = new URL(item.url);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("bad_response");
      // No server-side fetching of returned URLs. Browser downloads without credentials.
      if (decodeURIComponent(url.href).includes(key)) throw new Error("bad_response");
      return { url: url.href };
    }
    throw new Error("bad_response");
  });
  const result = JSON.stringify({ data });
  if (result.length > MAX_RESPONSE_BYTES || result.includes(key)) throw new Error("bad_response");
  return { data };
}
export async function handleSenseNova(request, _env, expectedPath) {
  const log = diagnostic(request);
  log("received");
  const reject = (status, code, headers) => { log("rejected", null, code); return fail(status, code, headers); };
  if (request.method !== "POST") return reject(405, "method_not_allowed", { Allow: "POST" });
  const url = new URL(request.url);
  // Even internal callers cannot construct a different upstream from a path.
  if (!Object.hasOwn(TARGETS, expectedPath) || url.pathname !== expectedPath || url.search) return reject(400, "invalid_path");
  if (!sameOrigin(request)) return reject(403, "origin_not_allowed");
  const bearer = auth(request);
  if (!bearer) return reject(401, "missing_authorization");
  if (request.signal.aborted) return reject(499, "request_cancelled");
  const contentType = request.headers.get("Content-Type") || "";
  const generation = expectedPath.endsWith("/generations");
  if (generation && !/^application\/json\s*(?:;|$)/i.test(contentType)) return reject(415, "json_required");
  if (!generation && !/^multipart\/form-data\s*(?:;|$)/i.test(contentType)) return reject(415, "multipart_required");
  let body;
  try {
    const bytes = await boundedBody(request, MAX_REQUEST_BYTES);
    if (generation) {
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || Array.isArray(body) || typeof body !== "object") return fail(400, "invalid_request");
      const clean = validCommon(new Map(Object.entries(body)));
      if (!clean) return fail(400, "invalid_request");
      body = JSON.stringify(clean);
    } else {
      const form = await new Request("https://proxy.invalid", { method: "POST", headers: { "Content-Type": contentType }, body: bytes }).formData();
      const values = new Map();
      for (const [key, value] of form.entries()) {
        if (key === "image[]") continue;
        if (values.has(key) || !ALLOWED_FIELDS.has(key) || typeof value !== "string") return fail(400, "invalid_request");
        values.set(key, value);
      }
      const clean = validCommon(values); if (!clean) return fail(400, "invalid_request");
      const images = form.getAll("image[]");
      if (!images.length || images.length > MAX_IMAGES || images.some((image) => !(image instanceof File) || !IMAGE_TYPES.has(image.type.toLowerCase()) || image.size < 1 || image.size > MAX_IMAGE_BYTES)) return fail(400, "invalid_images");
      const out = new FormData(); out.set("model", clean.model); out.set("prompt", clean.prompt); out.set("n", String(clean.n));
      // Do not forward user filenames or multipart metadata.
      images.forEach((image, i) => out.append("image[]", image, `reference-${i + 1}`));
      body = out;
    }
  } catch (error) {
    return reject(error?.message === "too_large" ? 413 : 400, error?.message === "too_large" ? "request_too_large" : "invalid_request");
  }
  log("validated");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    if (request.signal.aborted) return reject(499, "request_cancelled");
    log("upstream_start");
    const upstream = await fetch(TARGETS[expectedPath], {
      method: "POST", headers: { Authorization: bearer, Accept: "application/json", ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
      body, redirect: "error", signal: controller.signal,
    });
    log("upstream_response", upstream.status);
    if (!upstream.ok) {
      const code = await upstreamErrorCode(upstream, bearer.slice(7));
      log("upstream_error", upstream.status, code);
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error");
    }
    let bytes;
    try { bytes = await boundedBody(upstream, MAX_RESPONSE_BYTES); }
    catch (error) {
      if (error?.message === "too_large") { log("response_rejected", upstream.status, "upstream_response_too_large"); return fail(502, "upstream_response_too_large"); }
      throw error;
    }
    try {
      const result = responseData(JSON.parse(new TextDecoder().decode(bytes)), bearer.slice(7));
      log("completed", upstream.status);
      return json(result);
    }
    catch (_) { log("response_rejected", upstream.status, "invalid_upstream_response"); return fail(502, "invalid_upstream_response"); }
  } catch (error) {
    if (error?.name === "AbortError") { log("upstream_exception", null, "upstream_timeout_or_cancelled"); return fail(504, "upstream_timeout_or_cancelled"); }
    log("upstream_exception", null, "upstream_unavailable");
    return fail(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", cancel);
  }
}

function modelResponseData(raw, secret) {
  if (!raw || !Array.isArray(raw.data)) throw new Error("bad_response");
  const data = raw.data.reduce((models, item) => {
    if (item && typeof item === "object" && typeof item.id === "string" && item.id.length <= 8192 && !item.id.includes(secret)) {
      models.push({ id: item.id });
    }
    return models;
  }, []);
  const result = JSON.stringify({ data });
  if (result.length > 1024 * 1024 || result.includes(secret)) throw new Error("bad_response");
  return { data };
}

export async function handleSenseNovaModels(request, _env, expectedPath = MODELS_PATH) {
  const log = diagnostic(request);
  if (request.method !== "GET") return fail(405, "method_not_allowed", { Allow: "GET" });
  const url = new URL(request.url);
  if (expectedPath !== MODELS_PATH || url.pathname !== MODELS_PATH || url.search) return fail(400, "invalid_path");
  if (!sameOrigin(request)) return fail(403, "origin_not_allowed");
  const bearer = auth(request);
  if (!bearer) return fail(401, "missing_authorization");
  if (request.signal.aborted) return fail(499, "request_cancelled");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    if (request.signal.aborted) return fail(499, "request_cancelled");
    // Only the read-only GET is safe to replay. Image POSTs above stay single-attempt.
    let upstream;
    for (let attempt = 1; attempt <= MODELS_MAX_ATTEMPTS; attempt++) {
      controller.signal.throwIfAborted();
      try {
        upstream = await fetch(MODELS_TARGET, {
          method: "GET", headers: { Authorization: bearer, Accept: "application/json" },
          redirect: "error", signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError" || !(error instanceof TypeError) || attempt === MODELS_MAX_ATTEMPTS) throw error;
        log("upstream_retry", null, "retryable_network_error");
        await retryDelay(MODELS_RETRY_DELAY_MS * attempt, controller.signal);
        continue;
      }
      if (![502, 503, 504].includes(upstream.status) || attempt === MODELS_MAX_ATTEMPTS) break;
      await upstream.body?.cancel();
      log("upstream_retry", upstream.status, "retryable_http_status");
      await retryDelay(MODELS_RETRY_DELAY_MS * attempt, controller.signal);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error");
    }
    let bytes;
    try { bytes = await boundedBody(upstream, 1024 * 1024); }
    catch (error) {
      if (error?.message === "too_large") return fail(502, "upstream_response_too_large");
      throw error;
    }
    try { return json(modelResponseData(JSON.parse(new TextDecoder().decode(bytes)), bearer.slice(7))); }
    catch (_) { return fail(502, "invalid_upstream_response"); }
  } catch (error) {
    if (request.signal.aborted) return fail(499, "request_cancelled");
    if (controller.signal.aborted || error?.name === "AbortError") return fail(504, "upstream_timeout_or_cancelled");
    return fail(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", cancel);
  }
}
