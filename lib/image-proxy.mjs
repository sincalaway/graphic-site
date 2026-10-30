// Multi-provider image proxy. One same-origin entry point for several image APIs:
//   GET  /api/image/<provider>/models    read-only key check + model list
//   POST /api/image/<provider>/generate  text-to-image, or edit when `images` is present
//   POST /api/image/<provider>/task      async providers only: { task_id } -> pending, or the images
// The browser always sends one unified JSON body; each provider adapter turns it into that
// provider's own request and normalises the answer to { data: [{ b64_json, mime }] }.
// Upstream hosts are a fixed allowlist (no user-supplied URLs), keys are passed through from
// the Authorization header and never stored or logged, and image POSTs are never retried.

export const PROVIDERS = Object.freeze({
  sensenova: { base: "https://token.sensenova.cn/v1", models: true, maxN: 1, edit: "sensenova", watermark: true },
  "sensenova-intl": { base: "https://token.sensenova.ai/v1", models: true, maxN: 1, edit: "sensenova", watermark: true },
  openai: { base: "https://api.openai.com/v1", models: true, maxN: 4, edit: "multipart" },
  ark: { base: "https://ark.cn-beijing.volces.com/api/v3", models: true, maxN: 1, edit: "image-array", watermark: true, b64: true },
  siliconflow: { base: "https://api.siliconflow.cn/v1", models: true, maxN: 4, edit: "image-fields", nField: "batch_size" },
  zhipu: { base: "https://open.bigmodel.cn/api/paas/v4", models: false, maxN: 1, edit: null },
  // ModelScope API-Inference: image jobs are async (submit -> task_id -> poll /tasks/<id>).
  modelscope: { base: "https://api-inference.modelscope.cn/v1", models: true, maxN: 1, edit: "image-url-array", async: true },
});

const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_RESULT_IMAGE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 170000;
const MODELS_TIMEOUT_MS = 20000;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
const SIZE_RE = /^(?:\d{3,4}x\d{3,4}|[1-4]K|auto)$/i;
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const ALLOWED_FIELDS = new Set(["model", "prompt", "n", "images", "size", "watermark"]);
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}
function fail(status, code, extra = {}, headers) { return json({ error: { code, ...extra } }, status, headers); }

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin" || site === "none";
}

/** Accept the key however it was pasted: surrounding spaces/newlines/quotes or a doubled "Bearer ". */
export function normalizeKey(raw) {
  if (typeof raw !== "string") return "";
  let key = raw.replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  key = key.replace(/^Bearer\s+/i, "").replace(/^Bearer\s+/i, "").trim();
  key = key.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s+/g, "");
  return /^[\x21-\x7e]{8,4096}$/.test(key) ? key : "";
}
function bearer(request) { return normalizeKey(request.headers.get("Authorization") || ""); }

/** Remove anything secret-looking from a provider message before it is shown to the user. */
export function redact(message, key) {
  if (typeof message !== "string") return "";
  let text = message;
  if (key) text = text.split(key).join("***");
  text = text
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/\b(?:sk|ak|pk|rk)-[A-Za-z0-9_*.-]{4,}/gi, "***")
    .replace(/[A-Za-z0-9_\-]{24,}/g, "***")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim();
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
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

/** Safe error details from a provider error body: a short type/code and a redacted message. */
async function upstreamDetails(response, key) {
  const details = { upstream_status: response.status };
  try {
    if (!/json/i.test(response.headers.get("Content-Type") || "")) { await response.body?.cancel(); return details; }
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(response, 65536)));
    const err = value && typeof value.error === "object" && value.error ? value.error : value || {};
    const type = err.type ?? err.code ?? value?.code;
    if (typeof type === "string" || typeof type === "number") {
      const text = String(type);
      if (SAFE_TOKEN.test(text) && !text.includes(key)) details.upstream_type = text;
    }
    const message = err.message ?? value?.message ?? (typeof value?.error === "string" ? value.error : "");
    const clean = redact(typeof message === "string" ? message : "", key);
    if (clean) details.upstream_message = clean;
  } catch (_) { /* unreadable bodies only give the status */ }
  return details;
}

function validInput(body, provider) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  for (const name of Object.keys(body)) if (!ALLOWED_FIELDS.has(name)) return null;
  const { model, prompt } = body;
  if (typeof model !== "string" || !MODEL_RE.test(model)) return null;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 32000) return null;
  const n = body.n === undefined ? 1 : body.n;
  if (!Number.isInteger(n) || n < 1 || n > provider.maxN) return { error: "invalid_n" };
  const size = body.size === undefined || body.size === "" ? "" : body.size;
  if (size && (typeof size !== "string" || !SIZE_RE.test(size))) return null;
  if (body.watermark !== undefined && typeof body.watermark !== "boolean") return null;
  const images = body.images === undefined ? [] : body.images;
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return { error: "invalid_images" };
  for (const image of images) {
    const match = typeof image === "string" && DATA_URL_RE.exec(image);
    if (!match || match[2].length * 0.75 > MAX_IMAGE_BYTES) return { error: "invalid_images" };
  }
  if (images.length && !provider.edit) return { error: "edit_not_supported" };
  return { model, prompt, n, size, images, watermark: body.watermark === true };
}

function dataUrlToBlob(dataUrl) {
  const [, mime, b64] = DATA_URL_RE.exec(dataUrl);
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** The provider-specific request for a unified input. */
export function buildUpstream(id, input) {
  const p = PROVIDERS[id];
  const url = p.base + (input.images.length && p.edit === "multipart" ? "/images/edits"
    : input.images.length && p.edit === "sensenova" ? "/images/edits" : "/images/generations");
  if (input.images.length && p.edit === "multipart") {
    const form = new FormData();
    form.set("model", input.model); form.set("prompt", input.prompt); form.set("n", String(input.n));
    input.images.forEach((image, i) => form.append("image[]", dataUrlToBlob(image), `reference-${i + 1}.png`));
    return { url, body: form };
  }
  const body = { model: input.model, prompt: input.prompt };
  if (p.nField) body[p.nField] = input.n; else if (id !== "ark" && id !== "zhipu" && !p.async) body.n = input.n;
  if (input.size) body[id === "siliconflow" ? "image_size" : "size"] = input.size;
  if (p.watermark) body.watermark = input.watermark;
  if (p.b64) body.response_format = "b64_json";
  if (input.images.length) {
    if (p.edit === "sensenova") body.images = input.images.map((image) => ({ image_url: image }));
    else if (p.edit === "image-array") body.image = input.images.length === 1 ? input.images[0] : input.images;
    else if (p.edit === "image-url-array") body.image_url = input.images;
    else if (p.edit === "image-fields") input.images.slice(0, 3).forEach((image, i) => { body[i ? `image${i + 1}` : "image"] = image; });
  } else if (id === "siliconflow" && !body.image_size) body.image_size = "1024x1024";
  return { url, body: JSON.stringify(body), json: true };
}

function publicHttps(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host === "localhost" || !host.includes(".") ||
        /\.(?:local|internal|localhost)$/i.test(host)) return null;
    return u.href;
  } catch (_) { return null; }
}

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Result images as base64 so the browser never needs CORS on a provider's CDN. */
async function normaliseResult(raw, key, signal) {
  const list = Array.isArray(raw?.data) && raw.data.length ? raw.data : Array.isArray(raw?.images) ? raw.images : null;
  if (!list || !list.length || list.length > 10) throw new Error("bad_response");
  const out = [];
  for (const item of list) {
    if (item && typeof item.b64_json === "string" && item.b64_json && !item.b64_json.includes(key)) {
      out.push({ b64_json: item.b64_json, mime: "image/" + (raw.output_format === "jpeg" || raw.output_format === "webp" ? raw.output_format : "png") });
      continue;
    }
    const href = item && typeof item.url === "string" && !item.url.includes(key) ? publicHttps(item.url) : null;
    if (!href) throw new Error("bad_response");
    const res = await fetch(href, { redirect: "follow", signal, headers: { Accept: "image/*" } });
    const mime = (res.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) { await res.body?.cancel(); throw new Error("image_fetch_failed"); }
    out.push({ b64_json: toBase64(await boundedBody(res, MAX_RESULT_IMAGE_BYTES)), mime });
  }
  return { data: out };
}

/** A short, value-free description of an unusable provider answer: stage, size, content type, and JSON key names only. */
function diagText(stage, bytes, ctype, raw, error) {
  const parts = [stage];
  if (bytes) parts.push((bytes.byteLength / 1048576).toFixed(2) + "MB");
  if (/^[a-z0-9.+\/-]+$/.test(ctype)) parts.push(ctype);
  const keys = (v) => v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).filter((k) => SAFE_TOKEN.test(k)).slice(0, 12).join(",") : Array.isArray(v) ? "array" : typeof v;
  if (raw !== null && raw !== undefined) {
    parts.push("keys=" + keys(raw));
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.images) ? raw.images : null;
    if (list) parts.push("items=" + list.length + (list.length ? " item=" + keys(list[0]) : ""));
  }
  if (error) parts.push(String(error?.name || "Error").replace(/[^A-Za-z]/g, "").slice(0, 30));
  return parts.join(" ").slice(0, 200);
}

function withTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const cancel = () => controller.abort();
  request.signal?.addEventListener?.("abort", cancel, { once: true });
  return { signal: controller.signal, done() { clearTimeout(timer); request.signal?.removeEventListener?.("abort", cancel); } };
}


/** Hosts with a hard function limit (EdgeOne: 120 s) pass env.PROXY_TIMEOUT_MS so the proxy answers JSON before the platform cuts it off. */
function timeoutFrom(env, fallback) {
  const v = Number(env?.PROXY_TIMEOUT_MS);
  return Number.isFinite(v) && v >= 5000 && v < fallback ? v : fallback;
}

const TASK_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** One short status check of an async job; the browser repeats it, so no request comes near a host's time limit. */
async function pollTask(request, env, provider, key) {
  let id;
  try { id = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096)))?.task_id; }
  catch (_) { return fail(400, "invalid_request"); }
  if (typeof id !== "string" || !TASK_RE.test(id)) return fail(400, "invalid_request");
  const t = withTimeout(request, timeoutFrom(env, TIMEOUT_MS));
  try {
    const upstream = await fetch(provider.base + "/tasks/" + id, {
      method: "GET", redirect: "error", signal: t.signal,
      headers: { Authorization: "Bearer " + key, Accept: "application/json", "X-ModelScope-Task-Type": "image_generation" },
    });
    if (!upstream.ok) return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error", await upstreamDetails(upstream, key));
    let raw, bytes = null;
    try { bytes = await boundedBody(upstream, 2 * 1024 * 1024); raw = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (_) { return fail(502, "invalid_upstream_response", { diag: diagText("task_not_json", bytes, "", null, null) }); }
    const status = String(raw?.task_status || "").toUpperCase();
    if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
      const msg = redact(String(raw?.errors?.message ?? raw?.message ?? ""), key);
      return fail(502, "upstream_task_failed", msg ? { upstream_message: msg } : {});
    }
    if (status !== "SUCCEED" && status !== "SUCCEEDED") return json({ task_id: id, status: "pending" }, 202);
    const urls = Array.isArray(raw?.output_images) ? raw.output_images : [];
    try { return json(await normaliseResult({ data: urls.map((url) => ({ url })) }, key, t.signal)); }
    catch (error) {
      if (t.signal.aborted) throw error;
      return fail(502, error?.message === "image_fetch_failed" ? "result_image_unavailable" : "invalid_upstream_response",
        { diag: diagText("task_shape", bytes, "", raw, null) });
    }
  } catch (error) {
    if (t.signal.aborted || error?.name === "AbortError") return fail(504, "upstream_timeout_or_cancelled");
    return fail(502, "upstream_unavailable");
  } finally { t.done(); }
}

export async function handleImageProxy(request, _env, providerId, op) {
  if (!Object.hasOwn(PROVIDERS, providerId)) return fail(404, "unknown_provider");
  const provider = PROVIDERS[providerId];
  const url = new URL(request.url);
  if (url.search || url.pathname !== `/api/image/${providerId}/${op}`) return fail(400, "invalid_path");
  if (op === "models") {
    if (request.method !== "GET") return fail(405, "method_not_allowed", {}, { Allow: "GET" });
  } else if (op === "generate" || (op === "task" && provider.async)) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", {}, { Allow: "POST" });
  } else return fail(404, "unsupported_operation");
  if (!sameOrigin(request)) return fail(403, "origin_not_allowed");
  const key = bearer(request);
  if (!key) return fail(401, "missing_authorization");
  if (request.signal?.aborted) return fail(499, "request_cancelled");

  if (op === "models") {
    if (!provider.models) return fail(501, "models_not_supported");
    const t = withTimeout(request, MODELS_TIMEOUT_MS);
    try {
      const upstream = await fetch(provider.base + "/models", {
        method: "GET", headers: { Authorization: "Bearer " + key, Accept: "application/json" }, redirect: "error", signal: t.signal,
      });
      if (!upstream.ok) return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error", await upstreamDetails(upstream, key));
      const raw = JSON.parse(new TextDecoder().decode(await boundedBody(upstream, 2 * 1024 * 1024)));
      const list = Array.isArray(raw?.data) ? raw.data : [];
      const data = list.filter((m) => m && typeof m.id === "string" && MODEL_RE.test(m.id) && !m.id.includes(key)).slice(0, 2000).map((m) => ({ id: m.id }));
      return json({ data });
    } catch (error) {
      if (t.signal.aborted) return fail(504, "upstream_timeout_or_cancelled");
      return fail(502, error instanceof SyntaxError ? "invalid_upstream_response" : "upstream_unavailable");
    } finally { t.done(); }
  }

  if (!/^application\/json\s*(?:;|$)/i.test(request.headers.get("Content-Type") || "")) return fail(415, "json_required");
  if (op === "task") return pollTask(request, _env, provider, key);
  let input;
  try {
    input = validInput(JSON.parse(new TextDecoder().decode(await boundedBody(request, MAX_REQUEST_BYTES))), provider);
  } catch (error) {
    return error?.message === "too_large" ? fail(413, "request_too_large") : fail(400, "invalid_request");
  }
  if (!input) return fail(400, "invalid_request");
  if (input.error) return fail(400, input.error, input.error === "invalid_n" ? { max_n: provider.maxN } : {});
  if (request.signal?.aborted) return fail(499, "request_cancelled");

  const call = buildUpstream(providerId, input);
  const t = withTimeout(request, timeoutFrom(_env, TIMEOUT_MS));
  try {
    const upstream = await fetch(call.url, {
      method: "POST", redirect: "error", signal: t.signal, body: call.body,
      headers: { Authorization: "Bearer " + key, Accept: "application/json", ...(call.json ? { "Content-Type": "application/json" } : {}),
        ...(provider.async ? { "X-ModelScope-Async-Mode": "true" } : {}) },
    });
    if (!upstream.ok) return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, "upstream_error", await upstreamDetails(upstream, key));
    let raw, bytes = null;
    const ctype = (upstream.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase().slice(0, 40);
    try { bytes = await boundedBody(upstream, MAX_RESPONSE_BYTES); raw = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (error) {
      if (t.signal.aborted) throw error;
      const why = error?.message === "too_large" ? "too_large" : bytes ? "not_json" : "read_failed";
      return fail(502, why === "too_large" ? "upstream_response_too_large" : "invalid_upstream_response",
        { diag: diagText(why, bytes, ctype, null, why === "read_failed" ? error : null) });
    }
    if (provider.async) {
      const id = raw?.task_id;
      if (typeof id === "string" && TASK_RE.test(id) && !id.includes(key)) return json({ task_id: id, status: "pending" }, 202);
      return fail(502, "invalid_upstream_response", { diag: diagText("no_task_id", bytes, ctype, raw, null) });
    }
    try { return json(await normaliseResult(raw, key, t.signal)); }
    catch (error) {
      if (t.signal.aborted) throw error;
      return fail(502, error?.message === "image_fetch_failed" ? "result_image_unavailable" : "invalid_upstream_response",
        { diag: diagText(error?.message === "image_fetch_failed" ? "image_fetch_failed" : "shape", bytes, ctype, raw, null) });
    }
  } catch (error) {
    if (t.signal.aborted || error?.name === "AbortError") return fail(504, "upstream_timeout_or_cancelled");
    return fail(502, "upstream_unavailable");
  } finally { t.done(); }
}
