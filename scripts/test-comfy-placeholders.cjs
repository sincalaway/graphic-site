#!/usr/bin/env node
// ComfyUI placeholders: {{prompt}} {{brand}} {{seed}} {{batch}} {{image}} are filled before /prompt.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = __dirname + "/../public";
const storage = new Map();
const sessionStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
const realSetTimeout = setTimeout;
const c = {
  window: { location: { origin: "http://local.test", href: "http://local.test/" } },
  URL, AbortController, Blob, FormData, atob, btoa, clearTimeout, sessionStorage, console,
  setTimeout: (fn, ms) => realSetTimeout(fn, ms === 1200 ? 1 : ms),
};
c.window.sessionStorage = sessionStorage;
for (const f of ["api-contract.js", "api-config.js", "api-providers.js", "api-settings.js", "api-adapter.js"])
  vm.runInNewContext(fs.readFileSync(root + "/" + f, "utf8"), c);
const s = c.window.GraphicAPISettings, api = c.window.GraphicAPI;
const png = "data:image/png;base64," + fs.readFileSync(root + "/assets/blank-canvas.png").toString("base64");
const sample = JSON.parse(fs.readFileSync(__dirname + "/../docs/comfyui-qwen-image-logo.json", "utf8"));
sample["11"] = { class_type: "LoadImage", inputs: { image: "{{image}}" } };
sample["12"] = { class_type: "Note", inputs: { text: "brand={{brand}}" } };
s.save({ enabled: true, protocol: "comfyui-api", baseUrl: "http://127.0.0.1:8188", workflowJson: JSON.stringify(sample), generatePath: "/prompt" });
let submitted = null, uploaded = 0;
c.fetch = async (url, o = {}) => {
  if (url.endsWith("/assets/blank-canvas.png")) { const b = fs.readFileSync(root + "/assets/blank-canvas.png"); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; }
  if (url.endsWith("/upload/image")) { uploaded++; assert.ok(o.body instanceof FormData); return { ok: true, status: 200, json: async () => ({ name: "ref.png", subfolder: "graphic", type: "input" }) }; }
  if (url.endsWith("/prompt")) { submitted = JSON.parse(o.body).prompt; return { ok: true, status: 200, json: async () => ({ prompt_id: "p1" }) }; }
  if (url.includes("/history/")) return { ok: true, status: 200, json: async () => ({ p1: { outputs: { "10": { images: [{ filename: "o.png", subfolder: "", type: "output" }] } } } }) };
  if (url.includes("/view?")) return { ok: true, status: 200, blob: async () => new Blob([fs.readFileSync(root + "/assets/blank-canvas.png")], { type: "image/png" }) };
  throw new Error("unexpected " + url);
};
(async () => {
  const r = await api.generate({ tool: "logo", brand: "Nova", style: "极简", styleIndex: 0, color: "#1d4ed8", references: [png], count: 2 });
  assert.equal(r.items.length, 1);
  assert.equal(uploaded, 1);
  assert.match(submitted["5"].inputs.text, /Logo design for the brand "Nova"/);
  assert.equal(typeof submitted["8"].inputs.seed, "number");
  assert.equal(submitted["7"].inputs.batch_size, 2);
  assert.equal(submitted["11"].inputs.image, "graphic/ref.png");
  assert.equal(submitted["12"].inputs.text, "brand=Nova");
  assert.equal(submitted["8"].inputs.steps, 20);
  // {{image}} without any reference → blank canvas is uploaded, so one workflow serves Logo and Sketch
  submitted = null;
  await api.generate({ tool: "logo", brand: "Nova", styleIndex: 0, count: 1 });
  assert.equal(uploaded, 2);
  assert.match(submitted["5"].inputs.text, /blank white canvas/);
  // a sketch fills the same slot with the drawing
  await api.generate({ tool: "sketch", brand: "Nova", sourceImage: png, count: 1 });
  assert.equal(uploaded, 3);
  assert.doesNotMatch(submitted["5"].inputs.text, /blank white canvas/);
  console.log("ComfyUI placeholder tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
// A sketch (sourceImage) with a workflow that has no {{image}} slot must not run silently.
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  s.save({ enabled: true, protocol: "comfyui-api", baseUrl: "http://127.0.0.1:8188", workflowJson: JSON.stringify({ "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } } }), generatePath: "/prompt" });
  let posted = false; c.fetch = async () => { posted = true; throw new Error("no network expected"); };
  await assert.rejects(api.generate({ tool: "sketch", sourceImage: png, count: 1 }), (e) => e.code === "COMFYUI_NEEDS_IMAGE_SLOT");
  assert.equal(posted, false);
  console.log("ComfyUI sketch slot test passed");
})().catch((e) => { console.error(e); process.exit(1); });
