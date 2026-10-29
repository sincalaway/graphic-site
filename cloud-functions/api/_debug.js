// TEMPORARY diagnostic endpoint (remove after EdgeOne body bug is fixed). Never echoes header values or body content.
export async function onRequest(context) {
  const r = context.request;
  const b = r.body;
  const info = {
    version: "debug-1",
    ctxKeys: Object.keys(context || {}),
    reqCtor: r?.constructor?.name, isRequest: typeof Request !== "undefined" && r instanceof Request,
    method: r.method, url: String(r.url).replace(/\?.*/, ""),
    headersType: r.headers?.constructor?.name, headersHasGet: typeof r.headers?.get === "function",
    headerNames: typeof r.headers?.keys === "function" ? [...r.headers.keys()] : Object.keys(r.headers || {}),
    bodyType: b === null ? "null" : typeof b, bodyCtor: b?.constructor?.name,
    bodyIsUint8: b instanceof Uint8Array, bodyHasGetReader: typeof b?.getReader === "function",
    bodyAsyncIter: !!(b && typeof b[Symbol.asyncIterator] === "function"), bodyLocked: b?.locked,
    bodyUsed: r.bodyUsed, hasArrayBuffer: typeof r.arrayBuffer === "function",
    bodyKeys: b && typeof b === "object" && !(b instanceof Uint8Array) && !b.getReader ? Object.keys(b).slice(0, 20) : undefined,
  };
  try { const ab = await r.arrayBuffer(); info.arrayBufferLen = ab.byteLength; info.bodyFirstChar = new TextDecoder().decode(new Uint8Array(ab).slice(0, 1)); } catch (e) { info.arrayBufferErr = String(e?.message || e).slice(0, 200); }
  return new Response(JSON.stringify(info, null, 1), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
