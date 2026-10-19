// Dedicated SenseNova transport. No bindings, persistence, logging or automatic retry.
const TARGETS = Object.freeze({
  "/api/sensenova/images/generations": "https://token.sensenova.cn/v1/images/generations",
  "/api/sensenova/images/edits": "https://token.sensenova.cn/v1/images/edits",
});
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 120000;
const ALLOWED_MODEL = "sensenova-u1.5-lite";
const ALLOWED_FIELDS = new Set(["model", "prompt", "n"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  if (request.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
  const url = new URL(request.url);
  // Even internal callers cannot construct a different upstream from a path.
  if (!Object.hasOwn(TARGETS, expectedPath) || url.pathname !== expectedPath || url.search) return fail(400, "invalid_path");
  if (!sameOrigin(request)) return fail(403, "origin_not_allowed");
  const bearer = auth(request);
  if (!bearer) return fail(401, "missing_authorization");
  if (request.signal.aborted) return fail(499, "request_cancelled");
  const contentType = request.headers.get("Content-Type") || "";
  const generation = expectedPath.endsWith("/generations");
  if (generation && !/^application\/json\s*(?:;|$)/i.test(contentType)) return fail(415, "json_required");
  if (!generation && !/^multipart\/form-data\s*(?:;|$)/i.test(contentType)) return fail(415, "multipart_required");
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
    return fail(error?.message === "too_large" ? 413 : 400, error?.message === "too_large" ? "request_too_large" : "invalid_request");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    if (request.signal.aborted) return fail(499, "request_cancelled");
    const upstream = await fetch(TARGETS[expectedPath], {
      method: "POST", headers: { Authorization: bearer, Accept: "application/json", ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
      body, redirect: "error", signal: controller.signal,
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error");
    }
    let bytes;
    try { bytes = await boundedBody(upstream, MAX_RESPONSE_BYTES); }
    catch (error) {
      if (error?.message === "too_large") return fail(502, "upstream_response_too_large");
      throw error;
    }
    try { return json(responseData(JSON.parse(new TextDecoder().decode(bytes)), bearer.slice(7))); }
    catch (_) { return fail(502, "invalid_upstream_response"); }
  } catch (error) {
    if (error?.name === "AbortError") return fail(504, "upstream_timeout_or_cancelled");
    return fail(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", cancel);
  }
}
