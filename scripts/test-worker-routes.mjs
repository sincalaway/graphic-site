import assert from 'node:assert/strict';
import worker from '../worker.mjs';
let assetCalls = 0;
globalThis.fetch = () => { throw new Error('No upstream request permitted in this test'); };
const env = { ASSETS: { fetch: () => { assetCalls++; return new Response('asset-ok'); } } };
for (const [path, method, status, code] of [
  ['/api/sensenova/models', 'GET', 401, 'missing_authorization'],
  ['/api/sensenova/models', 'POST', 405, 'method_not_allowed'],
  ['/api/sensenova/models?url=https://attacker.invalid', 'GET', 400, 'invalid_path'],
  ['/api/sensenova/images/generations', 'POST', 401, 'missing_authorization'],
  ['/api/sensenova/images/edits', 'POST', 401, 'missing_authorization'],
  ['/api/sensenova/unknown', 'GET', 404, 'unsupported_operation'],
]) {
  const response = await worker.fetch(new Request('https://site.invalid' + path, { method }), env);
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
}
assert.equal(assetCalls, 0);
assert.equal(await (await worker.fetch(new Request('https://site.invalid/'), env)).text(), 'asset-ok');
assert.equal(assetCalls, 1);
console.log('Worker route offline tests passed: fixed models/images routing, no upstream or API asset fallback');
