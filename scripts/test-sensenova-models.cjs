// Offline-only models endpoint tests. No credentials, environment secrets or network.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const realFetch = global.fetch;
const key = 'offline-models-key';
const endpoint = '/api/sensenova/models';
let calls = 0;

function request(pathname = endpoint, init = {}) {
  return new Request(`https://site.test${pathname}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}`, Origin: 'https://site.test', ...init.headers },
    ...init,
  });
}

(async () => {
  const { handleSenseNovaModels: handle } = await import(pathToFileURL(path.resolve(__dirname, '../lib/sensenova-proxy.mjs')).href);
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://token.sensenova.cn/v1/models');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    return new Response(JSON.stringify({
      data: [
        { id: 'model-a', object: 'model', secret: key },
        { id: key },
        { id: `model-${key}` },
        { id: 42 },
        { object: 'missing-id' },
      ],
      debug: key,
    }), { status: 200, headers: { 'Set-Cookie': `secret=${key}` } });
  };

  let response = await handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [{ id: 'model-a' }] });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);

  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
    const before = calls;
    response = await handle(new Request(`https://site.test${endpoint}`, { method }));
    assert.equal(response.status, 405);
    assert.equal(calls, before);
  }
  for (const pathname of [`${endpoint}?url=https://evil.test`, '/api/sensenova/arbitrary']) {
    const before = calls;
    response = await handle(request(pathname));
    assert.equal(response.status, 400);
    assert.equal(calls, before);
  }
  for (const origin of ['https://evil.test', 'null']) {
    const before = calls;
    response = await handle(request(endpoint, { headers: { Origin: origin } }));
    assert.equal(response.status, 403);
    assert.equal(calls, before);
  }
  for (const site of ['cross-site', 'same-site']) {
    const before = calls;
    response = await handle(request(endpoint, { headers: { 'Sec-Fetch-Site': site } }));
    assert.equal(response.status, 403);
    assert.equal(calls, before);
  }
  {
    const before = calls;
    response = await handle(new Request(`https://site.test${endpoint}`, { method: 'GET', headers: { Origin: 'https://site.test' } }));
    assert.equal(response.status, 401);
    assert.equal(calls, before);
  }

  global.fetch = async () => new Response(JSON.stringify({ data: [{ id: key }] }), { status: 200 });
  response = await handle(request());
  assert.deepEqual(await response.json(), { data: [] });

  global.fetch = async () => new Response(JSON.stringify({ error: key }), { status: 302 });
  response = await handle(request());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(key));

  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < 33; i++) controller.enqueue(new Uint8Array(64 * 1024));
    controller.close();
  } }));
  response = await handle(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'upstream_response_too_large');

  global.fetch = realFetch;
  console.log(`SenseNova models offline tests passed (${calls} mocked upstream calls; no real network)`);
})().catch((error) => {
  global.fetch = realFetch;
  console.error(error);
  process.exitCode = 1;
});
