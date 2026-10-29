// Offline check for the EdgeOne Makers Cloud Functions adapter (cloud-functions/). No real upstream calls.
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { onRequest as image } from "../cloud-functions/api/image/[provider]/[op].js";
import { publicRequest } from "../cloud-functions/_lib/public-request.mjs";

const pub = { host: "graphic.example.com", "x-forwarded-proto": "https" };
assert.equal((await publicRequest(new Request("http://10.0.0.5:9000/x", { headers: pub }))).url, "https://graphic.example.com/x");

let r = await image({ request: new Request("http://10.0.0.5:9000/api/image/siliconflow/models", { headers: { ...pub, origin: "https://graphic.example.com", "sec-fetch-site": "same-origin" } }), env: {}, params: { provider: "siliconflow", op: "models" } });
assert.equal(r.status, 401, "same-origin request without key reaches the proxy");

r = await image({ request: new Request("http://10.0.0.5:9000/api/image/siliconflow/models", { headers: { ...pub, origin: "https://evil.example", authorization: "Bearer sk-aaaaaaaaaaaa" } }), env: {}, params: { provider: "siliconflow", op: "models" } });
assert.equal(r.status, 403, "cross-origin request is rejected");

const realFetch = globalThis.fetch; let calls = 0;
globalThis.fetch = async (url, opts) => { calls++; assert.equal(String(url), "https://token.sensenova.cn/v1/images/generations"); assert.equal(opts.method, "POST");
  return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }] }), { status: 200, headers: { "content-type": "application/json" } }); };
r = await image({ request: new Request("http://10.0.0.5:9000/api/image/sensenova/generate", { method: "POST", body: JSON.stringify({ model: "sensenova-u1.5-lite", prompt: "logo", n: 1 }),
  headers: { ...pub, origin: "https://graphic.example.com", "sec-fetch-site": "same-origin", "content-type": "application/json", authorization: "Bearer sk-aaaaaaaaaaaaaaaa" } }), env: {}, params: { provider: "sensenova", op: "generate" } });
globalThis.fetch = realFetch;
assert.equal(r.status, 200); assert.equal(calls, 1);

// EdgeOne's Node runtime may hand over non-standard request objects: Node streams, Buffers, parsed JSON, plain-object headers.
const payload = { model: "sensenova-u1.5-lite", prompt: "logo", n: 1 };
const hdrs = { ...pub, origin: "https://graphic.example.com", "sec-fetch-site": "same-origin", "content-type": "application/json", "content-length": "999", authorization: "Bearer sk-aaaaaaaaaaaaaaaa" };
const shapes = {
  nodeStream: () => Readable.from([Buffer.from(JSON.stringify(payload).slice(0, 10)), Buffer.from(JSON.stringify(payload).slice(10))]),
  buffer: () => Buffer.from(JSON.stringify(payload)),
  string: () => JSON.stringify(payload),
  parsed: () => ({ ...payload }),
};
for (const [name, make] of Object.entries(shapes)) {
  let seen = 0;
  globalThis.fetch = async (url, opts) => { seen++; return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  const fake = { url: "http://10.0.0.5:9000/api/image/sensenova/generate", method: "POST", headers: hdrs, body: make() };
  const res = await image({ request: fake, env: {}, params: { provider: "sensenova", op: "generate" } });
  globalThis.fetch = realFetch;
  assert.equal(res.status, 200, "body shape " + name + " -> " + res.status + " " + (await res.clone().text()));
  assert.equal(seen, 1);
}
const boom = await image({ request: { url: "http://10.0.0.5:9000/api/image/sensenova/generate", method: "POST", headers: hdrs, get body() { throw new Error("x"); } }, env: {}, params: { provider: "sensenova", op: "generate" } });
assert.equal(boom.status, 500, "adapter crash returns JSON 500, not a platform 545");
assert.equal((await publicRequest(new Request("http://pages-pro-1.qcloudteo.com/api/x", { headers: { host: "pages-pro-1.qcloudteo.com", "eo-pages-host": "graphic.example.com" } }))).url, "https://graphic.example.com/api/x", "EO-Pages-Host gives the public origin");
console.log("edgeone adapter: ok");
