// Offline-only regression tests for the reviewed retry patch. No network or real secrets.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const realFetch = global.fetch;
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;
const realLog = console.log;
const KEY = 'FAKE_RETRY_FIXTURE_NOT_A_SECRET';
const MODELS = '/api/sensenova/models';
const GENERATIONS = '/api/sensenova/images/generations';
const EDITS = '/api/sensenova/images/edits';
const MODEL = 'sensenova-u1.5-lite';
let checks = 0;
let calls = 0;
let waits = [];
let records = [];
let onWait;
let timeoutNow = false;
const timers = new Set();

function request(endpoint = MODELS, signal) {
  const headers = { Authorization: `Bearer ${KEY}`, Origin: 'https://site.test' };
  if (endpoint === MODELS) return new Request(`https://site.test${endpoint}`, { headers, signal });
  let body;
  if (endpoint === EDITS) {
    body = new FormData();
    body.set('model', MODEL); body.set('prompt', 'offline fake prompt'); body.set('n', '1');
    body.append('image[]', new File(['offline fake image'], 'private.png', { type: 'image/png' }));
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ model: MODEL, prompt: 'offline fake prompt', n: 1 });
  }
  return new Request(`https://site.test${endpoint}`, { method: 'POST', headers, body, signal });
}
function response(status = 200) {
  return new Response(JSON.stringify(status === 200 ? { data: [{ id: MODEL }] } : { error: { message: KEY } }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
function mock(sequence, endpoint = MODELS) {
  calls = 0; waits = []; records = []; onWait = undefined; timeoutNow = false;
  global.fetch = async (url, options) => {
    assert.equal(url, `https://token.sensenova.cn/v1/${endpoint === MODELS ? 'models' : 'images/' + endpoint.split('/').pop()}`);
    assert.equal(options.method, endpoint === MODELS ? 'GET' : 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    assert.ok(calls < sequence.length, 'unexpected additional upstream attempt');
    const next = sequence[calls++];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(options) : response(next);
  };
}
function checkClean() {
  assert.equal(timers.size, 0, 'request must clean up deadline and backoff timers');
  for (const line of records) {
    const record = JSON.parse(line);
    assert.deepEqual(Object.keys(record).sort(), ['stage', 'request_id', 'model', 'upstream_status', 'error_code', 'elapsed_ms'].sort());
    assert.ok(record.error_code === null || typeof record.error_code === 'string');
    for (const marker of [KEY, 'Bearer', 'offline fake prompt', 'private.png', 'https://'])
      assert.ok(!line.includes(marker), 'diagnostics must not expose private content');
  }
  checks++;
}

(async () => {
  const { handleSenseNovaModels: models, handleSenseNova: images } = await import(pathToFileURL(path.resolve(__dirname, '../lib/sensenova-proxy.mjs')).href);
  console.log = (line) => records.push(line);
  global.clearTimeout = (timer) => { timers.delete(timer); realClearTimeout(timer); };
  global.setTimeout = (fn, ms) => {
    const timer = realSetTimeout(() => { timers.delete(timer); fn(); }, ms === 120000 ? (timeoutNow ? 0 : 1000) : 1);
    timers.add(timer);
    if (ms !== 120000) {
      waits.push(ms);
      if (onWait) onWait();
    }
    return timer;
  };

  // This is the attachment's broken branch: undefined log used to turn 503 into 502 after one call.
  for (const status of [502, 503, 504]) {
    mock([status, status, 200]);
    const result = await models(request());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { data: [{ id: MODEL }] });
    assert.equal(calls, 3); assert.deepEqual(waits, [2000, 4000]); checkClean();
  }
  for (const status of [502, 503, 504]) {
    mock([status, status, status]);
    const result = await models(request());
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), { error: { code: 'upstream_error' } });
    assert.equal(calls, 3); assert.deepEqual(waits, [2000, 4000]); checkClean();
  }
  for (const status of [302, 400, 401, 403, 404, 408, 429, 500, 501, 505]) {
    mock([status]);
    const result = await models(request());
    assert.equal(result.status, status === 302 ? 502 : status);
    assert.equal(calls, 1); assert.deepEqual(waits, []); checkClean();
  }
  mock([new TypeError(KEY), 200]);
  assert.equal((await models(request())).status, 200);
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]); checkClean();
  mock([new TypeError(KEY), new TypeError(KEY), new TypeError(KEY)]);
  let result = await models(request());
  assert.equal(result.status, 502); assert.ok(!(await result.text()).includes(KEY));
  assert.equal(calls, 3); checkClean();
  for (const error of [new Error(KEY), new DOMException(KEY, 'AbortError')]) {
    mock([error]); result = await models(request());
    assert.equal(result.status, error.name === 'AbortError' ? 504 : 502);
    assert.equal(calls, 1); assert.deepEqual(waits, []); checkClean();
  }

  // Retried response streams must be cancelled before the next attempt.
  let discarded = 0;
  mock([() => new Response(new ReadableStream({ cancel() { discarded++; } }), { status: 503 }), 200]);
  assert.equal((await models(request())).status, 200); assert.equal(discarded, 1); checkClean();

  // Cancellation during backoff stops immediately, including a non-AbortError caller reason.
  for (const reason of [undefined, new Error(KEY)]) {
    mock([503]);
    const controller = new AbortController();
    onWait = () => controller.abort(reason);
    result = await models(request(MODELS, controller.signal));
    assert.equal(result.status, 499);
    assert.deepEqual(await result.json(), { error: { code: 'request_cancelled' } });
    assert.equal(calls, 1); checkClean();
  }
  // One shared deadline covers all attempts and the wait; it must not start another fetch.
  mock([503]); timeoutNow = true;
  result = await models(request());
  assert.equal(result.status, 504); assert.equal(calls, 1); checkClean();

  mock([]);
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal((await models(request(MODELS, cancelled.signal))).status, 499);
  assert.equal(calls, 0); checkClean();

  // An interrupted in-flight GET must not restart on abort.
  mock([(options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))]);
  timeoutNow = true;
  result = await models(request());
  assert.equal(result.status, 504); assert.equal(calls, 1); checkClean();

  // Paid image generation AND editing remain strictly one attempt for every retryable status/exception.
  for (const endpoint of [GENERATIONS, EDITS]) {
    for (const failure of [502, 503, 504, new TypeError(KEY)]) {
      mock([failure], endpoint);
      result = await images(request(endpoint), {}, endpoint);
      assert.equal(result.status, typeof failure === 'number' ? failure : 502);
      assert.equal(calls, 1); assert.deepEqual(waits, []); checkClean();
    }
  }
  console.log = realLog;
  realLog(`SenseNova retry offline tests passed (${checks} scenarios; no real network)`);
})().catch((error) => {
  realLog(error);
  process.exitCode = 1;
}).finally(() => {
  for (const timer of timers) realClearTimeout(timer);
  global.fetch = realFetch; global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout; console.log = realLog;
});
