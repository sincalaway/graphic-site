// TEMPORARY diagnostic endpoint (remove after EdgeOne body bug is fixed). Never echoes header values or body content.
import { onRequest as imageRoute } from "./image/[provider]/[op].js";
import { onRequest as snGen } from "./sensenova/images/generations.js";

export async function onRequest(context) {
  const r = context.request;
  const raw = await r.text().catch(() => null);
  const info = { version: "debug-3", rawLen: raw?.length, bodyType: typeof r.body, bodyCtor: r.body?.constructor?.name };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { info.upstream = { url: String(url), method: opts?.method, bodyLen: opts?.body ? String(opts.body).length : 0 }; return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }); };
  const mk = (path) => {
    const req = new Request("https://graphic-site.edgeone.dev" + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer sk-debugdebugdebug", origin: "https://graphic-site.edgeone.dev", host: "graphic-site.edgeone.dev" }, body: raw || "{}" });
    return req;
  };
  for (const [name, fn, path, params] of [["image", imageRoute, "/api/image/siliconflow/generate", { provider: "siliconflow", op: "generate" }], ["sensenova", snGen, "/api/sensenova/images/generations", {}]]) {
    try { const res = await fn({ request: mk(path), env: {}, params }); info[name] = { status: res.status, body: (await res.text()).slice(0, 300) }; }
    catch (e) { info[name] = { err: String(e?.stack || e).slice(0, 800) }; }
  }
  globalThis.fetch = realFetch;
  return new Response(JSON.stringify(info, null, 1), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
