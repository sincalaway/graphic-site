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
  s.save({
    enabled: true,
    protocol: "stability-ai",
    baseUrl: "https://attacker.invalid/ignored",
    model: "user-model-is-ignored",
    apiKey: "mock-stability-key",
  });
  assert.equal(s.get().baseUrl, "https://api.stability.ai");
  assert.equal(s.get().model, "sd3.5-large");
  let stabilityCalls = 0;
  c.fetch = async (url, o) => {
    stabilityCalls++;
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([Buffer.from("png")], { type: "image/png" }),
    };
  };
  const stabilityGenerated = await api.generate({ tool: "logo", brand: "mock" });
  assert.equal(seen.url, "https://api.stability.ai/v2beta/stable-image/generate/sd3");
  assert.equal(seen.o.method, "POST");
  assert.equal(seen.o.credentials, "omit");
  assert.equal(seen.o.redirect, "error");
  assert.equal(seen.o.headers.Authorization, "Bearer mock-stability-key");
  assert.equal(seen.o.headers.Accept, "image/*");
  assert.equal(seen.o.headers["Content-Type"], undefined);
  assert.equal(seen.o.body.get("model"), "sd3.5-large");
  assert.match(seen.o.body.get("prompt"), /品牌: mock/);
  assert.match(stabilityGenerated.items[0].imageUrl, /^data:image\/png;base64,/);
  assert.equal(stabilityCalls, 1);
  await assert.rejects(
    api.generate({ tool: "logo", count: 2 }),
    (e) => e.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    api.generate({ tool: "logo", references: ["data:image/png;base64,AAAA", "data:image/png;base64,AAAA"] }),
    (e) => e.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    api.edit({ tool: "edit" }),
    (e) => e.code === "INVALID_REQUEST",
  );
  assert.equal(stabilityCalls, 1, "unsupported Stability inputs must be rejected before fetch");
  c.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(
    api.generate({ tool: "logo" }),
    (e) => e.code === "STABILITY_CONTENT_FILTERED" && e.details.status === 403,
  );
  c.fetch = async () => ({ ok: false, status: 402 });
  await assert.rejects(
    api.generate({ tool: "logo" }),
    (e) => e.code === "STABILITY_CREDITS_UNAVAILABLE" && e.details.status === 402,
  );
  c.fetch = async (url, o) => {
    seen = { url, o };
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([Buffer.from("png")], { type: "image/png" }),
    };
  };
  await api.generate({ tool: "logo", sourceImage: "data:image/png;base64,AAAA" });
  assert.equal(seen.o.body.get("mode"), "image-to-image");
  assert.equal(seen.o.body.get("strength"), "0.65");
  assert.equal(seen.o.body.get("image").type, "image/png");
  assert.equal(seen.o.body.get("image").name, "source-image.png");
  await assert.rejects(
    api.vectorize({ tool: "vectorize" }),
    (e) => e.code === "API_VECTORIZE_UNSUPPORTED",
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
