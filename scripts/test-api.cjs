#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = __dirname + '/../public';
const waits = ms => new Promise(resolve => setTimeout(resolve, ms));
function makeContext() {
  const context = { window: { location: { origin: 'http://local.test' } }, URL, AbortController, setTimeout, clearTimeout, console };
  context.fetch = async () => { throw new Error('network must not be called'); };
  vm.runInNewContext(fs.readFileSync(root + '/api-contract.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(root + '/api-config.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(root + '/api-adapter.js', 'utf8'), context);
  return context;
}
(async () => {
  const context = makeContext();
  const api = context.window.GraphicAPI;
  let calls = 0;
  context.fetch = async () => { calls++; throw new Error('must not call'); };

  // Empty/default config and every exposed operation status are safe and read-only.
  assert.equal(api.status().demo, true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.status().operations)), { generate:false, edit:false, vectorize:false, session:false, works:false, checkout:false, task:false });
  assert.deepEqual(JSON.parse(JSON.stringify(api.options())), { intelligence: JSON.parse(JSON.stringify(context.window.GRAPHIC_API_CONFIG.options.intelligence)) });
  assert.deepEqual(JSON.parse(JSON.stringify(api.taskQuery({}))), {});
  await assert.rejects(api.generate({tool:'generate'}), e => e.code === 'API_NOT_CONFIGURED');
  assert.equal(calls, 0);
  assert.equal(api.options().intelligence.length, 3);
  await assert.rejects(Promise.resolve().then(() => api.taskQuery({poll:true})), /字段/);

  // Contract and full-flow compatibility: UI vectorizer maps to transport vectorize;
  // references are a bounded array of image Data URLs.
  assert.deepEqual(JSON.parse(JSON.stringify(api.buildRequest({tool:'vectorizer', references:['data:image/png;base64,AAAA'], unknown:1}))), {tool:'vectorize', references:['data:image/png;base64,AAAA']});
  assert.throws(() => context.window.GraphicAPIContract.validateRequest({tool:'logo', count:11}), /count/);
  assert.throws(() => context.window.GraphicAPIContract.validateRequest({tool:'logo', sourceImage:'https://evil/x.png'}), /图像/);
  assert.throws(() => context.window.GraphicAPIContract.validateRequest({tool:'logo', references:['data:image/svg+xml;base64,AAAA']}), /图像/);

  const cfg = context.window.GRAPHIC_API_CONFIG = { mode:'remote', baseUrl:'/api', timeoutMs:25,
    endpoints:{generate:'/generate', edit:'/edit', vectorize:'/vectorize'} };
  const paths = ['/api', '/api/generate', '/api/%2e%2e/generate', '/api/%252e%252e/generate', '/api\\generate', '//evil', '/api?x=1', '/api#x', '/api/../x', '/api/. /x', '/api/ok~_-.x'];
  const safe = [true, true, false, false, false, false, false, false, false, false, true];
  for (let i = 0; i < paths.length; i++) {
    cfg.baseUrl = paths[i];
    assert.equal(api.status().operations.generate, safe[i], `base path ${paths[i]}`);
  }
  cfg.baseUrl = '/api';
  cfg.endpoints.generate = '/generate';
  for (const endpoint of ['/ok', '/%2e%2e/x', '/%252f/x', '/foo\\bar', '//evil', 'https://evil/x', '/a?b=1', '/a#b']) {
    cfg.endpoints.generate = endpoint;
    assert.equal(api.status().operations.generate, endpoint === '/ok', `endpoint ${endpoint}`);
  }
  cfg.endpoints.generate = '/generate';

  // Successful JSON response is validated and request fields are transported.
  context.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/generate');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'same-origin');
    return { ok:true, status:200, json: async () => ({items:[{id:'1', name:'x', imageUrl:'/assets/x.png'}]}) };
  };
  const success = await api.generate({tool:'generate', brand:'x'});
  assert.deepEqual(JSON.parse(JSON.stringify(success.items[0])), {id:'1', name:'x', imageUrl:'/assets/x.png'});
  assert.equal(calls, 1);

  // HTTP non-JSON is still HTTP_ERROR, not INVALID_RESPONSE.
  context.fetch = async () => ({ok:false, status:502, json:async()=>{ throw new Error('not json'); }});
  await assert.rejects(api.generate({tool:'generate'}), e => e.code === 'HTTP_ERROR' && e.details.status === 502);

  // Invalid successful JSON and zero retry.
  calls = 0;
  context.fetch = async () => { calls++; return {ok:true, json:async()=>{ throw new Error('bad json'); }}; };
  await assert.rejects(api.generate({tool:'generate'}), e => e.code === 'INVALID_RESPONSE');
  assert.equal(calls, 1);

  // Cancellation while fetch is running preserves cancellation.
  context.fetch = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { const e = new Error('cancel'); e.name = 'AbortError'; reject(e); }, {once:true});
  });
  const running = new AbortController();
  const runningPromise = api.generate({tool:'generate'}, {signal:running.signal});
  await waits(2); running.abort();
  await assert.rejects(runningPromise, e => e.code === 'REQUEST_CANCELLED');

  // Timeout while fetch is running wins over AbortError.
  cfg.timeoutMs = 5;
  await assert.rejects(api.generate({tool:'generate'}), e => e.code === 'REQUEST_TIMEOUT');

  // Timeout/cancel while reading JSON also retain the right reason.
  cfg.timeoutMs = 5;
  context.fetch = async () => ({ok:true, json:()=>new Promise((resolve, reject) => {
    setTimeout(() => { const e = new Error('read aborted'); e.name = 'AbortError'; reject(e); }, 30);
  })});
  await assert.rejects(api.generate({tool:'generate'}), e => e.code === 'REQUEST_TIMEOUT');
  cfg.timeoutMs = 50;
  context.fetch = async () => ({ok:true, json:()=>new Promise((resolve, reject) => {
    setTimeout(() => { const e = new Error('read cancelled'); e.name = 'AbortError'; reject(e); }, 30);
  })});
  const readCancel = new AbortController();
  const readPromise = api.generate({tool:'generate'}, {signal:readCancel.signal});
  await waits(2); readCancel.abort();
  await assert.rejects(readPromise, e => e.code === 'REQUEST_CANCELLED');

  console.log('API mock tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
