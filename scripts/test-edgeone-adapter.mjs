// Offline check for the EdgeOne Makers Cloud Functions adapter (cloud-functions/). No real upstream calls.
import assert from "node:assert/strict";
import { onRequest as image } from "../cloud-functions/api/image/[provider]/[op].js";
import { publicRequest } from "../cloud-functions/_lib/public-request.mjs";

const pub = { host: "graphic.example.com", "x-forwarded-proto": "https" };
assert.equal(publicRequest(new Request("http://10.0.0.5:9000/x", { headers: pub })).url, "https://graphic.example.com/x");

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
console.log("edgeone adapter: ok");
