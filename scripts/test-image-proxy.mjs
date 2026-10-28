// Offline tests for the multi-provider image proxy and its browser client. All network is mocked.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleImageProxy, normalizeKey, redact, buildUpstream } from "../lib/image-proxy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const realFetch = global.fetch;
const KEY = "sk-offlinetestkey1234";
const PNG = "data:image/png;base64," + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");
let calls = [];
let checks = 0;
function mock(handler) { calls = []; global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return handler(String(url), options); }; }
function ok(value) { return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }); }
function req(provider, op, body, init = {}) {
  return new Request(`https://site.test/api/image/${provider}/${op}`, {
    method: op === "models" ? "GET" : "POST",
    ...(op === "models" ? {} : { body: JSON.stringify(body) }),
    ...init,
    headers: { Authorization: "Bearer " + KEY, Origin: "https://site.test", "Content-Type": "application/json", ...(init.headers || {}) },
  });
}
const run = (provider, op, body, init) => handleImageProxy(req(provider, op, body, init), {}, provider, op);

// Key normalisation: everything people paste by accident is removed.
assert.equal(normalizeKey(`  Bearer "${KEY}"\n`), KEY);
assert.equal(normalizeKey(`Bearer Bearer ${KEY}`), KEY);
assert.equal(normalizeKey(`${KEY.slice(0, 8)}\n${KEY.slice(8)}`), KEY);
assert.equal(normalizeKey("short"), "");
assert.ok(!redact(`Incorrect API key provided: ${KEY}. See https://x.test/docs`, KEY).includes(KEY));
checks += 5;

// SenseNova text-to-image: JSON, n=1, watermark switch, fixed upstream.
mock(() => ok({ data: [{ b64_json: "AAAA" }], output_format: "png" }));
let r = await run("sensenova", "generate", { model: "sensenova-u1.5-lite", prompt: "logo", n: 1 },
  { headers: { Authorization: `Bearer "${KEY}"\n` } });
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { data: [{ b64_json: "AAAA", mime: "image/png" }] });
assert.equal(calls[0].url, "https://token.sensenova.cn/v1/images/generations");
assert.equal(calls[0].options.headers.Authorization, "Bearer " + KEY);
assert.deepEqual(JSON.parse(calls[0].options.body), { model: "sensenova-u1.5-lite", prompt: "logo", n: 1, watermark: false });
checks++;

// SenseNova edit: JSON images[].image_url, never multipart.
mock(() => ok({ data: [{ b64_json: "BBBB" }] }));
r = await run("sensenova", "generate", { model: "sensenova-u1.5-lite", prompt: "edit", images: [PNG], watermark: true });
assert.equal(r.status, 200);
assert.equal(calls[0].url, "https://token.sensenova.cn/v1/images/edits");
assert.deepEqual(JSON.parse(calls[0].options.body).images, [{ image_url: PNG }]);
assert.equal(JSON.parse(calls[0].options.body).watermark, true);
checks++;

// More images than the provider allows per call is a clear error, not a silent upstream 400.
r = await run("sensenova", "generate", { model: "sensenova-u1.5-lite", prompt: "x", n: 2 });
assert.equal(r.status, 400); assert.deepEqual((await r.json()).error, { code: "invalid_n", max_n: 1 }); checks++;

// OpenAI edits stay multipart image[].
let call = buildUpstream("openai", { model: "gpt-image-1", prompt: "p", n: 2, size: "", images: [PNG], watermark: false });
assert.equal(call.url, "https://api.openai.com/v1/images/edits");
assert.ok(call.body instanceof FormData); assert.equal(call.body.getAll("image[]").length, 1); checks++;

// Ark: b64 response requested, reference images in `image`, no `n`.
call = buildUpstream("ark", { model: "doubao-seedream-4-0-250828", prompt: "p", n: 1, size: "", images: [PNG, PNG], watermark: false });
let sent = JSON.parse(call.body);
assert.equal(call.url, "https://ark.cn-beijing.volces.com/api/v3/images/generations");
assert.equal(sent.response_format, "b64_json"); assert.deepEqual(sent.image, [PNG, PNG]); assert.equal(sent.n, undefined); checks++;

// SiliconFlow: batch_size/image_size; result URL is downloaded by the proxy (no browser CORS needed).
mock((url) => url.startsWith("https://api.siliconflow.cn")
  ? ok({ images: [{ url: "https://sc-maas.example.com/out.png" }] })
  : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } }));
r = await run("siliconflow", "generate", { model: "Kwai-Kolors/Kolors", prompt: "p", n: 2 });
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { data: [{ b64_json: Buffer.from([1, 2, 3]).toString("base64"), mime: "image/png" }] });
sent = JSON.parse(calls[0].options.body);
assert.equal(sent.batch_size, 2); assert.equal(sent.image_size, "1024x1024"); assert.equal(sent.n, undefined);
assert.equal(calls[1].url, "https://sc-maas.example.com/out.png"); checks++;

// Result URLs pointing at private hosts are refused.
for (const bad of ["http://cdn.example.com/x.png", "https://127.0.0.1/x.png", "https://localhost/x.png", "https://intranet/x.png"]) {
  mock(() => ok({ data: [{ url: bad }] }));
  r = await run("zhipu", "generate", { model: "cogview-4-250304", prompt: "p" });
  assert.equal(r.status, 502); assert.equal(calls.length, 1); checks++;
}

// Zhipu has no edits.
r = await run("zhipu", "generate", { model: "cogview-4-250304", prompt: "p", images: [PNG] });
assert.equal(r.status, 400); assert.equal((await r.json()).error.code, "edit_not_supported"); checks++;

// Upstream errors keep their status and give a safe, redacted explanation.
mock(() => new Response(JSON.stringify({ error: { type: "authentication_error", code: "401", message: `Invalid key ${KEY}` } }),
  { status: 401, headers: { "Content-Type": "application/json" } }));
r = await run("sensenova", "generate", { model: "sensenova-u1.5-lite", prompt: "p" });
let text = await r.text();
assert.equal(r.status, 401); assert.ok(!text.includes(KEY));
assert.equal(JSON.parse(text).error.upstream_type, "authentication_error");
assert.equal(JSON.parse(text).error.upstream_status, 401); checks++;

// Model list: ids only, filtered.
mock(() => ok({ data: [{ id: "sensenova-u1.5-lite", owned_by: "x" }, { id: KEY }, { id: "bad id" }] }));
r = await run("sensenova", "models");
assert.deepEqual(await r.json(), { data: [{ id: "sensenova-u1.5-lite" }] });
assert.equal(calls[0].url, "https://token.sensenova.cn/v1/models"); checks++;

// Rejections that never reach upstream.
mock(() => { throw new Error("must not be called"); });
for (const [provider, op, body, init, status] of [
  ["nope", "generate", {}, {}, 404],
  ["sensenova", "generate", { model: "m", prompt: "p" }, { headers: { Origin: "https://evil.test" } }, 403],
  ["sensenova", "generate", { model: "m", prompt: "p" }, { headers: { Authorization: "" } }, 401],
  ["sensenova", "generate", { model: "bad model", prompt: "p" }, {}, 400],
  ["sensenova", "generate", { model: "m", prompt: "p", url: "https://evil.test" }, {}, 400],
  ["sensenova", "generate", { model: "m", prompt: "p", images: ["https://evil.test/a.png"] }, {}, 400],
  ["zhipu", "models", undefined, {}, 501],
]) {
  r = await run(provider, op, body, init);
  assert.equal(r.status, status, `${provider}/${op} -> ${status}`); assert.equal(calls.length, 0); checks++;
}
r = await handleImageProxy(new Request("https://site.test/api/image/sensenova/generate", { method: "GET" }), {}, "sensenova", "generate");
assert.equal(r.status, 405); checks++;

// Browser client: count is split into single-image calls and 401 maps to a clear key message.
const storage = new Map();
const sessionStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
const ctx = { window: { location: { origin: "https://site.test" } }, URL, AbortController, Blob, FormData, atob, btoa, setTimeout, clearTimeout, sessionStorage, localStorage: sessionStorage, console };
ctx.window.sessionStorage = sessionStorage;
ctx.fetch = async (url, options) => global.fetch(url, options);
for (const file of ["api-contract.js", "api-config.js", "api-providers.js", "api-settings.js", "api-adapter.js"])
  vm.runInNewContext(fs.readFileSync(path.join(here, "../public", file), "utf8"), ctx);
const settings = ctx.window.GraphicAPISettings, api = ctx.window.GraphicAPI;
settings.save({ enabled: true, protocol: "sensenova-proxy", apiKey: ` Bearer ${KEY} \n`, model: "" });
let saved = settings.get();
assert.equal(saved.protocol, "multi-proxy"); assert.equal(saved.provider, "sensenova"); assert.equal(saved.apiKey, KEY);
assert.equal(saved.model, "sensenova-u1.5-lite"); checks++;
mock(() => ok({ data: [{ b64_json: "AAAA", mime: "image/png" }] }));
const out = await api.generate({ tool: "logo", brand: "Graphic", count: 2 });
assert.equal(out.items.length, 2); assert.equal(calls.length, 2);
assert.equal(JSON.parse(calls[0].options.body).n, 1);
assert.equal(calls[0].url, "https://site.test/api/image/sensenova/generate"); checks++;
mock(() => new Response(JSON.stringify({ error: { code: "upstream_error", upstream_status: 401, upstream_message: "invalid api key" } }),
  { status: 401, headers: { "Content-Type": "application/json" } }));
await assert.rejects(api.generate({ tool: "logo", brand: "Graphic", count: 1 }), (e) => {
  const info = api.errorInfo(e);
  assert.equal(info.title, "API key 无效或已失效"); assert.ok(info.message.includes("invalid api key"));
  return true;
}); checks++;
// An undeployed proxy (static HTML 404) is reported as such, not as a bad key.
mock(() => new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html" } }));
await assert.rejects(api.generate({ tool: "logo", brand: "Graphic", count: 1 }), (e) => api.errorInfo(e).title === "本站代理未部署"); checks++;
// Key detection: a sk- key tries SenseNova first and stops at the provider that accepts it.
mock((url) => url.includes("/sensenova/") ? new Response(JSON.stringify({ error: { code: "upstream_error", upstream_status: 401 } }), { status: 401, headers: { "Content-Type": "application/json" } })
  : ok({ data: [{ id: "Kwai-Kolors/Kolors" }, { id: "Qwen/Qwen3-8B" }] }));
const found = await api.detectProvider(KEY);
assert.equal(found.provider, "siliconflow"); assert.deepEqual(found.imageModels, ["Kwai-Kolors/Kolors"]); checks++;
// Remembered settings move to localStorage-compatible storage and clear removes both.
settings.clear(); assert.equal(settings.get().enabled, false); checks++;

global.fetch = realFetch;
console.log(`Image proxy offline tests passed (${checks} checks; no real network)`);
