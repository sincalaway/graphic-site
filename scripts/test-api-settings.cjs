#!/usr/bin/env node
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = __dirname + "/../public";
const storage = new Map();
const sessionStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
function context() {
  const c = {
    window: {
      location: { origin: "http://local.test", href: "http://local.test/" },
    },
    URL,
    AbortController,
    Blob,
    FormData,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    sessionStorage,
    console,
  };
  c.window.sessionStorage = sessionStorage;
  c.fetch = async () => {
    throw new Error("unexpected network");
  };
  vm.runInNewContext(fs.readFileSync(root + "/api-contract.js", "utf8"), c);
  vm.runInNewContext(fs.readFileSync(root + "/api-config.js", "utf8"), c);
  vm.runInNewContext(fs.readFileSync(root + "/api-providers.js", "utf8"), c);
  vm.runInNewContext(fs.readFileSync(root + "/api-settings.js", "utf8"), c);
  vm.runInNewContext(fs.readFileSync(root + "/api-adapter.js", "utf8"), c);
  return c;
}
(async () => {
  const c = context(),
    s = c.window.GraphicAPISettings,
    api = c.window.GraphicAPI;
  s.clear();
  assert.deepEqual(JSON.parse(JSON.stringify(s.get())), {
    enabled: false,
    protocol: "graphic-json",
    baseUrl: "",
    model: "",
    apiKey: "",
    generatePath: "/generate",
    editPath: "/edit",
    vectorizePath: "",
    workflowJson: "",
    provider: "",
    watermark: false,
    remember: false,
  });
  for (const bad of [
    "api.test/x",
    "/relative",
    "https://user:pass@api.test/x",
    "https://api.test/%2e%2e/x",
    "https://api.test/a/../x",
    "https://api.test/a\\x",
    "https://api.test/x?",
    "https://api.test/x#",
  ])
    assert.throws(() =>
      s.save({
        enabled: true,
        protocol: "graphic-json",
        baseUrl: bad,
        model: "m",
        generatePath: "/g",
        editPath: "",
        vectorizePath: "",
      }),
    );
  s.save({
    enabled: true,
    protocol: "graphic-json",
    baseUrl: "https://api.test/root",
    model: "own-model",
    apiKey: "secret",
    generatePath: "/g",
    editPath: "",
    vectorizePath: "",
  });
  let seen;
  c.fetch = async (url, o) => {
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ id: "1", name: "ok", imageUrl: "/assets/x.png" }],
      }),
    };
  };
  await api.generate({ tool: "logo", count: 2 });
  assert.equal(seen.url, "https://api.test/root/g");
  assert.equal(JSON.parse(seen.o.body).model, "own-model");
  assert.equal(api.status().operations.edit, false);
  s.save({
    enabled: true,
    protocol: "openai-images",
    baseUrl: "https://api.test/root",
    model: "explicit-model",
    apiKey: "test-key",
    generatePath: "/wrong",
    editPath: "",
    vectorizePath: "",
  });
  c.fetch = async (url, o) => {
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };
  const generated = await api.generate({ tool: "logo", count: 3 });
  assert.equal(seen.url, "https://api.test/root/images/generations");
  assert.equal(JSON.parse(seen.o.body).model, "explicit-model");
  assert.equal(generated.items[0].imageUrl, "data:image/png;base64,AAAA");
  c.fetch = async (url, o) => {
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: "https://cdn.test/a.png" }] }),
    };
  };
  c.fetch = async (url, o) => {
    seen = { url, o };
    if (url.includes("images/generations"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ url: "https://cdn.test/a.png" }] }),
      };
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([Buffer.from("png")], { type: "image/png" }),
    };
  };
  const downloaded = await api.generate({ tool: "logo" });
  assert.match(downloaded.items[0].imageUrl, /^data:image\/png;base64,/);
  assert.equal(seen.o.credentials, "omit");
  c.fetch = async (url, o) => {
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };
  await api.generate({
    tool: "logo",
    references: ["data:image/png;base64,AAAA"],
  });
  assert.equal(seen.url, "https://api.test/root/images/edits");
  assert.equal(seen.o.headers.Authorization, "Bearer test-key");
  assert.equal([...seen.o.body.keys()][3], "image[]");
  await assert.rejects(
    api.vectorize({ tool: "vectorize" }),
    (e) => e.code === "API_VECTORIZE_UNSUPPORTED",
  );
  const workflowJson = JSON.stringify({ "1": { class_type: "MockNode", inputs: { text: "fixed API workflow" } } });
  assert.throws(() => s.save({
    enabled: true, protocol: "comfyui-api", baseUrl: "https://public.example",
    workflowJson, generatePath: "/prompt", editPath: "", vectorizePath: "",
  }), /仅允许 localhost/);
  assert.throws(() => s.save({
    enabled: true, protocol: "comfyui-api", baseUrl: "http://127.0.0.1:8188",
    workflowJson: JSON.stringify({ nodes: [] }), generatePath: "/prompt",
  }), /API 格式 workflow/);
  assert.throws(
    () => s.validateWorkflow('"' + "中".repeat(700000) + '"'),
    /不能超过 2 MiB/,
  );
  s.save({
    enabled: true, protocol: "comfyui-api", baseUrl: "http://127.0.0.1:8188",
    workflowJson, apiKey: "must-not-be-kept", generatePath: "/prompt",
  });
  assert.equal(s.get().apiKey, "");
  assert.equal(s.get().model, "");
  assert.equal(api.status().protocol, "comfyui-api");
  assert.equal(api.status().operations.generate, true);
  assert.equal(api.status().operations.edit, false);
  const comfyCalls = [];
  const realSetTimeout = c.setTimeout;
  c.setTimeout = (fn, ms) => realSetTimeout(fn, ms === 1200 ? 1 : ms);
  c.fetch = async (url, o = {}) => {
    comfyCalls.push({ url, o });
    if (url.endsWith("/prompt")) {
      const submitted = JSON.parse(o.body);
      assert.deepEqual(JSON.parse(JSON.stringify(submitted.prompt)), JSON.parse(workflowJson));
      assert.equal(o.method, "POST");
      assert.equal(o.credentials, "omit");
      assert.equal(o.headers.Authorization, undefined);
      return { ok: true, status: 200, json: async () => ({ prompt_id: "mock-prompt-1" }) };
    }
    if (url.includes("/history/"))
      return { ok: true, status: 200, json: async () => ({ "mock-prompt-1": { outputs: { "2": { images: [{ filename: "mock.png", subfolder: "", type: "output" }] } } } }) };
    if (url.includes("/view?"))
      return { ok: true, status: 200, blob: async () => new Blob([Buffer.from("png")], { type: "image/png" }) };
    throw new Error("unexpected ComfyUI mock URL");
  };
  const comfyGenerated = await api.generate({
    tool: "logo", brand: "not-mapped", count: 99,
    sourceImage: "https://example.invalid/not-fetched.png",
    references: ["https://example.invalid/not-fetched-reference.png"],
  });
  assert.equal(comfyCalls.length, 3);
  assert.equal(comfyCalls[0].url, "http://127.0.0.1:8188/prompt");
  assert.match(comfyCalls[1].url, /\/history\/mock-prompt-1$/);
  assert.match(comfyGenerated.items[0].imageUrl, /^data:image\/png;base64,/);
  await assert.rejects(api.edit({ tool: "edit" }), (e) => e.code === "API_OPERATION_UNSUPPORTED");
  assert.equal(comfyCalls.length, 3, "unsupported operation must not call ComfyUI");
  c.setTimeout = realSetTimeout;
  await assert.rejects(
    api.vectorize({ tool: "vectorize" }),
    (e) => e.code === "API_OPERATION_UNSUPPORTED",
  );
  s.save({
    enabled: true,
    protocol: "openai-images",
    baseUrl: "https://api.test/root",
    model: "explicit-model",
    apiKey: "test-key",
    generatePath: "/ignored",
    editPath: "",
    vectorizePath: "",
  });
  c.fetch = async () => ({
    ok: false,
    status: 402,
    json: async () => ({ message: "leak test secret" }),
  });
  await assert.rejects(
    api.generate({ tool: "logo" }),
    (e) =>
      e.code === "HTTP_ERROR" &&
      e.details.status === 402 &&
      !e.message.includes("secret"),
  );
  const ac = new AbortController();
  c.fetch = async (u, o) =>
    new Promise((resolve, reject) =>
      o.signal.addEventListener("abort", () => {
        const e = new Error("x");
        e.name = "AbortError";
        reject(e);
      }),
    );
  const p = api.generate({ tool: "logo" }, { signal: ac.signal });
  await new Promise((r) => setTimeout(r, 2));
  ac.abort();
  await assert.rejects(p, (e) => e.code === "REQUEST_CANCELLED");
  s.clear();
  assert.equal(s.get().enabled, false);
  console.log("API settings/protocol tests passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
