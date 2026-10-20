// Offline-only safe-diagnostics regression tests. Every upstream request is mocked.
// All credentials and content below are explicit fake fixtures; no secrets or network are used.
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const GENERATIONS = '/api/sensenova/images/generations';
const EDITS = '/api/sensenova/images/edits';
const UPSTREAM = 'https://token.sensenova.cn/v1/images';
const MODEL = 'sensenova-u1.5-lite';
const FAKE_KEY = 'FAKE_KEY_DO_NOT_USE_7b91';
const FAKE_PROMPT = 'FAKE_PROMPT_PRIVATE_cobalt-orbit';
const FAKE_IMAGE = 'FAKE_IMAGE_BYTES_private_4f2a';
const FAKE_AUTH = `Bearer ${FAKE_KEY}`;
const FAKE_FILENAME = 'private-upload-name.png';
const FAKE_RESPONSE = 'FAKE_RAW_UPSTREAM_RESPONSE_private';
const CF_RAY = 'a1b2c3d4e5f60718-SJC';
const RAY_REQUEST_ID = 'b2c3d4e5f6071829-LAX';
const LOG_KEYS = ['stage', 'request_id', 'model', 'upstream_status', 'error_code', 'elapsed_ms'];
const SECRET_MARKERS = [FAKE_KEY, FAKE_PROMPT, FAKE_IMAGE, FAKE_AUTH, FAKE_FILENAME, FAKE_RESPONSE,
  'https://site.test/', 'https://token.sensenova.cn/', 'Set-Cookie', 'Content-Type', 'Authorization'];
const realFetch = global.fetch;
const realLog = console.log;
let checks = 0;

function generationRequest({ body, ray = CF_RAY } = {}) {
  return new Request(`https://site.test${GENERATIONS}`, {
    method: 'POST',
    headers: {
      Authorization: FAKE_AUTH,
      Origin: 'https://site.test',
      'Content-Type': 'application/json',
      ...(ray ? { 'CF-Ray': ray } : {}),
    },
    body: JSON.stringify(body || { model: MODEL, prompt: FAKE_PROMPT, n: 1 }),
  });
}

function editRequest() {
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', FAKE_PROMPT);
  form.set('n', '1');
  form.append('image[]', new File([FAKE_IMAGE], FAKE_FILENAME, { type: 'image/png' }));
  return new Request(`https://site.test${EDITS}`, {
    method: 'POST',
    headers: { Authorization: FAKE_AUTH, Origin: 'https://site.test', 'CF-Ray': RAY_REQUEST_ID },
    body: form,
  });
}

function captureLogs() {
  const records = [];
  console.log = (...args) => {
    assert.equal(args.length, 1, 'logger must emit one serialized record');
    assert.equal(typeof args[0], 'string');
    records.push(args[0]);
  };
  return records;
}

function checkLogs(rawLines, expectedStages, expected = {}) {
  assert.deepEqual(rawLines.map((line) => JSON.parse(line).stage), expectedStages);
  for (const line of rawLines) {
    const log = JSON.parse(line);
    assert.deepEqual(Object.keys(log).sort(), [...LOG_KEYS].sort(), 'log schema must contain exactly the approved fields');
    assert.equal(log.model, MODEL);
    assert.equal(typeof log.request_id, 'string');
    assert.equal(typeof log.elapsed_ms, 'number');
    assert.ok(Number.isInteger(log.elapsed_ms) && log.elapsed_ms >= 0);
    assert.ok(log.upstream_status === null || Number.isInteger(log.upstream_status));
    assert.ok(log.error_code === null || typeof log.error_code === 'string');
    for (const marker of SECRET_MARKERS) assert.ok(!line.includes(marker), `log leaked forbidden marker: ${marker}`);
  }
  for (const [stage, details] of Object.entries(expected)) {
    const found = rawLines.map(JSON.parse).find((record) => record.stage === stage);
    assert.ok(found, `expected log stage ${stage}`);
    for (const [field, value] of Object.entries(details)) assert.equal(found[field], value, `${stage}.${field}`);
  }
  checks++;
}

async function scenario(fetchMock, run) {
  const logs = captureLogs();
  let fetchCalls = 0;
  global.fetch = async (...args) => {
    fetchCalls++;
    return fetchMock(...args);
  };
  try {
    const result = await run();
    return { ...result, logs, fetchCalls };
  } finally {
    global.fetch = realFetch;
    console.log = realLog;
  }
}

(async () => {
  const { handleSenseNova: handle } = await import(pathToFileURL(path.resolve(__dirname, '../lib/sensenova-proxy.mjs')).href);

  // Successful JSON generation: preserve model and fixed upstream path; CF-Ray remains correlatable.
  {
    const result = await scenario(async (url, options) => {
      assert.equal(url, `${UPSTREAM}/generations`);
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { model: MODEL, prompt: FAKE_PROMPT, n: 1 });
      return new Response(JSON.stringify({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }], debug: FAKE_RESPONSE }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': `private=${FAKE_KEY}` },
      });
    }, async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }] });
      return { response };
    });
    assert.equal(result.fetchCalls, 1);
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'completed'], {
      received: { request_id: CF_RAY, upstream_status: null, error_code: null },
      upstream_response: { upstream_status: 200, error_code: null },
      completed: { upstream_status: 200, error_code: null },
    });
  }

  // Image-edit route retains its upstream path, model, and only forwards a sanitized fake image filename.
  {
    const result = await scenario(async (url, options) => {
      assert.equal(url, `${UPSTREAM}/edits`);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, FAKE_AUTH);
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('model'), MODEL);
      assert.equal(options.body.get('prompt'), FAKE_PROMPT);
      assert.equal(options.body.get('image[]').name, 'reference-1');
      assert.equal(await options.body.get('image[]').text(), FAKE_IMAGE);
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2UtZWRpdA==' }] }), { status: 200 });
    }, async () => {
      const response = await handle(editRequest(), {}, EDITS);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: [{ b64_json: 'aW1hZ2UtZWRpdA==' }] });
      return { response };
    });
    assert.equal(result.fetchCalls, 1);
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'completed'], {
      received: { request_id: RAY_REQUEST_ID },
    });
  }

  // Unknown provider code and sensitive payload/header content are reduced to a fixed safe code.
  {
    const result = await scenario(async (url) => {
      assert.equal(url, `${UPSTREAM}/generations`);
      return new Response(JSON.stringify({ error: {
        code: `provider-${FAKE_KEY}`, message: `${FAKE_PROMPT} ${FAKE_IMAGE} ${FAKE_AUTH} ${FAKE_RESPONSE}`,
      } }), { status: 502, headers: { 'Content-Type': 'application/json', Authorization: FAKE_AUTH, 'Set-Cookie': FAKE_KEY } });
    }, async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: { code: 'upstream_error' } });
      return { response };
    });
    assert.equal(result.fetchCalls, 1, 'failed fetch must not retry');
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'upstream_error'], {
      upstream_error: { upstream_status: 502, error_code: 'unrecognized_error' },
    });
  }

  // A provider code from the explicit allowlist is retained, but no provider message/body is logged.
  {
    const result = await scenario(async () => new Response(JSON.stringify({ error: {
      code: 'rate_limit_exceeded', message: `${FAKE_KEY} ${FAKE_PROMPT} ${FAKE_IMAGE}`,
    } }), { status: 429, headers: { 'Content-Type': 'application/json', 'X-Private': FAKE_AUTH } }), async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 429);
      return { response };
    });
    assert.equal(result.fetchCalls, 1, 'failed fetch must not retry');
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'upstream_error'], {
      upstream_error: { upstream_status: 429, error_code: 'rate_limit_exceeded' },
    });
  }

  // Non-JSON error content is not parsed into or copied to diagnostics.
  {
    const result = await scenario(async () => new Response(
      `<!doctype html>${FAKE_KEY} ${FAKE_PROMPT} ${FAKE_IMAGE} ${FAKE_AUTH} ${FAKE_RESPONSE}`,
      { status: 502, headers: { 'Content-Type': 'text/html', 'Set-Cookie': FAKE_KEY } }), async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 502);
      return { response };
    });
    assert.equal(result.fetchCalls, 1, 'failed fetch must not retry');
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'upstream_error'], {
      upstream_error: { upstream_status: 502, error_code: 'non_json_error' },
    });
  }

  // Network TypeError containing private details produces one attempt and a fixed diagnostic code.
  {
    const result = await scenario(async () => {
      throw new TypeError(`offline fake network detail ${FAKE_KEY} ${FAKE_PROMPT} ${FAKE_IMAGE} ${FAKE_AUTH} ${FAKE_RESPONSE}`);
    }, async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: { code: 'upstream_unavailable' } });
      return { response };
    });
    assert.equal(result.fetchCalls, 1, 'network failure must not retry');
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_exception'], {
      upstream_exception: { upstream_status: null, error_code: 'upstream_unavailable' },
    });
  }

  // A successful HTTP response with incompatible shape is rejected without exposing its raw body.
  {
    const result = await scenario(async () => new Response(JSON.stringify({
      data: [{ task: `${FAKE_KEY} ${FAKE_PROMPT} ${FAKE_IMAGE}` }], debug: FAKE_RESPONSE,
    }), { status: 200, headers: { 'Content-Type': 'application/json', Authorization: FAKE_AUTH } }), async () => {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: { code: 'invalid_upstream_response' } });
      return { response };
    });
    assert.equal(result.fetchCalls, 1, 'invalid response must not retry');
    checkLogs(result.logs, ['received', 'validated', 'upstream_start', 'upstream_response', 'response_rejected'], {
      response_rejected: { upstream_status: 200, error_code: 'invalid_upstream_response' },
    });
  }

  // Invalid field validation currently returns fail() directly (without a rejected-stage log).
  // Still assert the emitted received record is schema-safe and the request never reaches fetch.
  {
    const result = await scenario(async () => {
      throw new Error('rejected input unexpectedly reached mocked upstream');
    }, async () => {
      const response = await handle(generationRequest({ body: {
        model: MODEL, prompt: `${FAKE_PROMPT} ${FAKE_KEY} ${FAKE_IMAGE}`, n: 0,
      } }), {}, GENERATIONS);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } });
      return { response };
    });
    assert.equal(result.fetchCalls, 0, 'rejected input must not reach upstream');
    checkLogs(result.logs, ['received'], {
      received: { request_id: CF_RAY },
    });
  }

  // A throwing logger must not alter the successful request/response path.
  {
    let fetchCalls = 0;
    global.fetch = async (url) => {
      fetchCalls++;
      assert.equal(url, `${UPSTREAM}/generations`);
      return new Response(JSON.stringify({ data: [{ b64_json: 'b2s=' }] }), { status: 200 });
    };
    console.log = () => { throw new Error(`fake logger failure ${FAKE_KEY} ${FAKE_PROMPT}`); };
    try {
      const response = await handle(generationRequest(), {}, GENERATIONS);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: [{ b64_json: 'b2s=' }] });
      assert.equal(fetchCalls, 1);
      checks++;
    } finally {
      global.fetch = realFetch;
      console.log = realLog;
    }
  }

  console.log(`SenseNova safe-logs offline tests passed (${checks} scenarios; no real network)`);
})().catch((error) => {
  global.fetch = realFetch;
  console.log = realLog;
  console.error(error);
  process.exitCode = 1;
});
