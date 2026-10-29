// EdgeOne Makers Cloud Functions (Node.js) adapter helper.
// 1. The proxy's same-origin check compares the browser Origin with new URL(request.url).origin.
//    Behind EdgeOne the function may see an internal URL, so rebuild the request URL from the
//    public Host / X-Forwarded-* headers before handing it to the shared proxy code in lib/.
// 2. EdgeOne's Node runtime does not always hand over a standard web ReadableStream body
//    (it can be a Node stream, a Buffer/string, or an already parsed object). Buffer the body
//    once, whatever its shape, and give lib/ a plain standard Request with a byte body.
const HOST_RE = /^[A-Za-z0-9.-]{1,253}(?::\d{1,5})?$/;
const MAX_BODY_BYTES = 64 * 1024 * 1024; // hard safety cap; lib/ applies the real per-route limits
const DROP_HEADERS = new Set(["content-length", "transfer-encoding", "connection", "expect"]);

function toHeaders(raw) {
  const out = new Headers();
  if (!raw) return out;
  const entries = typeof raw.entries === "function" && typeof raw.get === "function" ? raw.entries() : Object.entries(raw);
  for (const [name, value] of entries) {
    if (value === undefined || value === null || DROP_HEADERS.has(String(name).toLowerCase())) continue;
    try { out.append(name, Array.isArray(value) ? value.join(", ") : String(value)); } catch (_) { /* skip invalid header */ }
  }
  return out;
}

function header(raw, name) {
  if (!raw) return "";
  if (typeof raw.get === "function") return raw.get(name) || "";
  const hit = Object.keys(raw).find((k) => k.toLowerCase() === name);
  const v = hit ? raw[hit] : "";
  return Array.isArray(v) ? v.join(",") : String(v || "");
}

function tooLarge() { return new Error("too_large"); }

async function collect(iterable) {
  const chunks = []; let total = 0;
  for await (const part of iterable) {
    const bytes = typeof part === "string" ? new TextEncoder().encode(part) : new Uint8Array(part.buffer ? part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) : part);
    total += bytes.byteLength;
    if (total > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(bytes);
  }
  const out = new Uint8Array(total); let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

async function readBody(request) {
  const body = request.body;
  if (body === undefined || body === null) {
    if (typeof request.arrayBuffer === "function" && !request.bodyUsed) return new Uint8Array(await request.arrayBuffer());
    return new Uint8Array();
  }
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body); // includes Node Buffer
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body.getReader === "function") {
    if (!request.bodyUsed && typeof request.arrayBuffer === "function") {
      try { return new Uint8Array(await request.arrayBuffer()); } catch (_) { /* fall back to the stream */ }
    }
    if (body.locked) throw new Error("body_unreadable");
    return collect(body);
  }
  if (typeof body[Symbol.asyncIterator] === "function") return collect(body); // Node Readable
  if (typeof body === "object") return new TextEncoder().encode(JSON.stringify(body)); // already parsed JSON
  return new TextEncoder().encode(String(body));
}

export async function publicRequest(request) {
  const url = new URL(request.url, "http://localhost");
  const raw = request.headers;
  // EdgeOne passes the public hostname in EO-Pages-Host; Host / request.url are the internal SCF address.
  const eoHost = header(raw, "eo-pages-host").split(",")[0].trim();
  const host = header(raw, "x-forwarded-host").split(",")[0].trim() || eoHost || header(raw, "host").split(",")[0].trim();
  const proto = header(raw, "x-forwarded-proto").split(",")[0].trim().toLowerCase() || (eoHost ? "https" : "");
  if (proto === "https" || proto === "http") url.protocol = proto + ":";
  if (host && HOST_RE.test(host)) {
    const [name, port = ""] = host.split(":");
    url.hostname = name;
    url.port = port; // empty = default port for the protocol
  }
  const method = String(request.method || "GET").toUpperCase();
  const init = { method, headers: toHeaders(raw), redirect: "manual", signal: request.signal instanceof AbortSignal ? request.signal : undefined };
  if (method !== "GET" && method !== "HEAD") {
    const bytes = await readBody(request);
    if (bytes.byteLength) init.body = bytes;
  }
  return new Request(url.href, init);
}

/** Wrap a handler so an adapter crash returns JSON instead of EdgeOne's 545 page. */
export async function runProxy(handler) {
  try {
    const res = await handler();
    try { res.headers.set("X-Graphic-Adapter", "2"); } catch (_) { /* immutable headers */ }
    return res;
  } catch (error) {
    const code = error?.message === "too_large" ? "request_too_large" : "adapter_error";
    return new Response(JSON.stringify({ error: { code } }), {
      status: code === "request_too_large" ? 413 : 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
