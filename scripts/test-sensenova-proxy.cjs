// All upstream requests use a mock. No credentials, environment secrets or network.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const realFetch = global.fetch;
const realSetTimeout = global.setTimeout;
const generation = '/api/sensenova/images/generations';
const edits = '/api/sensenova/images/edits';
const key = 'offline-test-key';
const common = { model: 'sensenova-u1.5-lite', prompt: 'draw', n: 1 };
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
let calls = [], checks = 0;
function mockResult(value = { data: [{ b64_json: 'AAAA' }] }, status = 200) {
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'upstream=secret' } });
  };
}
function req(path = generation, body = common, init = {}) {
  return new Request('https://site.test' + path, {
    method: 'POST', body: JSON.stringify(body), ...init,
    headers: { Authorization: `Bearer ${key}`, Origin: 'https://site.test', 'Content-Type': 'application/json', ...init.headers },
  });
}
function form(images = [new File([png], 'private-name.png', { type: 'image/png' })]) {
  const f = new FormData();
  for (const [k, v] of Object.entries(common)) f.append(k, String(v));
  for (const image of images) f.append('image[]', image);
  return f;
}
function editRequest(f) {
  return new Request('https://site.test' + edits, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Origin: 'https://site.test' }, body: f });
}
(async () => {
  const { handleSenseNova: handle } = await import(pathToFileURL(require('node:path').resolve(__dirname, '../lib/sensenova-proxy.mjs')).href);
  async function expectRejected(request, status, path = generation) {
    const before = calls.length;
    const r = await handle(request, {}, path);
    assert.equal(r.status, status); assert.equal(calls.length, before, 'rejected input must never reach upstream');
    assert.ok(!(await r.text()).includes(key)); checks++;
  }
  mockResult({ data: [{ b64_json: 'AAAA', revised_prompt: key }], debug: key });
  let r = await handle(req(), {}, generation);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { data: [{ b64_json: 'AAAA' }] });
  assert.equal(r.headers.get('set-cookie'), null); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://token.sensenova.cn/v1/images/generations');
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.headers.Authorization, `Bearer ${key}`);
  assert.deepEqual(JSON.parse(calls[0].options.body), common); checks++;
  r = await handle(editRequest(form()), {}, edits);
  assert.equal(r.status, 200); assert.equal(calls[1].url, 'https://token.sensenova.cn/v1/images/edits');
  // SenseNova edits take JSON images[].image_url data URLs, never multipart or user filenames.
  const forwarded = JSON.parse(calls[1].options.body);
  assert.deepEqual(forwarded.images, [{ image_url: 'data:image/png;base64,' + Buffer.from(png).toString('base64') }]);
  assert.equal(forwarded.model, common.model); assert.ok(!calls[1].options.body.includes('private-name'));
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json'); checks++;
  for (const method of ['GET','PUT','DELETE','PATCH','OPTIONS','HEAD'])
    await expectRejected(new Request('https://site.test' + generation, { method }), 405);
  await expectRejected(req(generation + '?url=https://evil.test'), 400);
  await expectRejected(req('/api/sensenova/images/arbitrary'), 400, '/api/sensenova/images/arbitrary');
  await expectRejected(req('/different'), 400);
  for (const origin of ['https://evil.test', 'null', 'https://sibling.site.test'])
    await expectRejected(req(generation, common, { headers: { Origin: origin } }), 403);
  for (const site of ['cross-site','same-site'])
    await expectRejected(req(generation, common, { headers: { 'Sec-Fetch-Site': site } }), 403);
  for (const authorization of ['', 'Basic abc', 'Bearer a b', 'Bearer ' + 'x'.repeat(4097)])
    await expectRejected(req(generation, common, { headers: { Authorization: authorization } }), 401);
  await expectRejected(req(generation, common, { headers: { 'Content-Type': 'text/plain' } }), 415);
  await expectRejected(req(edits), 415, edits);
  for (const body of [null, [], {}, {...common, model:'other'}, {...common,n:0}, {...common,n:5}, {...common,n:true}, {...common,n:[1]}, {...common,prompt:''}, {...common,prompt:'x'.repeat(100001)}, {...common,url:'https://evil.test'}, {...common,apiKey:key}, {...common,stream:true}])
    await expectRejected(req(generation, body), 400);
  await expectRejected(req(generation, common, { body:'{' }), 400);
  await expectRejected(req(generation, common, { headers: { 'Content-Length': String(20*1024*1024 + 1) } }), 413);
  // Actual streaming limit, without Content-Length, not just a header assertion.
  const stream = new ReadableStream({ start(c) { for (let i=0;i<21;i++) c.enqueue(new Uint8Array(1024*1024)); c.close(); } });
  await expectRejected(req(generation, common, { body:stream, duplex:'half' }), 413);
  await expectRejected(editRequest(form([])), 400, edits);
  await expectRejected(editRequest(form(Array.from({length:7}, () => new File([png], 'x.png', {type:'image/png'})))), 400, edits);
  await expectRejected(editRequest(form([new File([new Uint8Array(8*1024*1024 + 1)], 'x.png', {type:'image/png'})])), 400, edits);
  await expectRejected(editRequest(form([new File([png], 'x.gif', {type:'image/gif'})])), 400, edits);
  await expectRejected(editRequest(form(['https://evil.test/x.png'])), 400, edits);
  const duplicate = form(); duplicate.append('model', common.model); await expectRejected(editRequest(duplicate), 400, edits);
  const unknown = form(); unknown.append('url', 'https://evil.test'); await expectRejected(editRequest(unknown), 400, edits);
  const ac = new AbortController(); ac.abort(); await expectRejected(req(generation, common, {signal:ac.signal}), 499);
  // Cancellation while consuming the body must never start a paid upstream request.
  const duringBody = new AbortController();
  const cancellingBody = new ReadableStream({ pull(c) {
    c.enqueue(new TextEncoder().encode(JSON.stringify(common))); duringBody.abort(); c.close();
  }});
  await expectRejected(req(generation, common, {body:cancellingBody,duplex:'half',signal:duringBody.signal}),499);
  // Missing Origin is accepted for non-browser clients, not considered authentication.
  const client = req(); client.headers.delete('Origin'); r = await handle(client, {}, generation); assert.equal(r.status,200); checks++;
  mockResult({ data: [{ url:'https://cdn.example/image.png?signature=public-token' }], debug:key });
  r=await handle(req(),{},generation); assert.deepEqual(await r.json(),{data:[{url:'https://cdn.example/image.png?signature=public-token'}]}); checks++;
  for (const data of [[{b64_json:key}], [{url:'https://cdn.example/'+key}], [{url:'https://cdn.example/'+encodeURIComponent(key).replace('o','%6f')}], [{url:'http://cdn.example/x'}], [{url:'https://user:pass@cdn.example/x'}], [], [{task:'1'}]]) {
    mockResult({data}); r=await handle(req(),{},generation); assert.equal(r.status,502); assert.ok(!(await r.text()).includes(key)); checks++;
  }
  for (const status of [302,400,401,403,404,413,415,429,500,503]) {
    mockResult({error:key},status); const before=calls.length; r=await handle(req(),{},generation);
    assert.equal(r.status,status===302?502:status); assert.ok(!(await r.text()).includes(key)); assert.equal(calls.length,before+1); checks++;
  }
  let tries=0;
  global.fetch=async()=>{tries++;throw new TypeError('network or redirect '+key);};
  r=await handle(req(),{},generation); assert.equal(r.status,502); assert.equal(tries,1); assert.ok(!(await r.text()).includes(key)); checks++;
  // Exercise the actual timer and AbortSignal rather than directly throwing AbortError.
  global.setTimeout=(fn, ms)=>realSetTimeout(fn, ms===120000?5:ms);
  global.fetch=async(_u,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('stopped','AbortError'))));
  r=await handle(req(),{},generation); assert.equal(r.status,504); global.setTimeout=realSetTimeout; checks++;
  global.fetch=async()=>new Response(new ReadableStream({ start(c) {for(let i=0;i<21;i++)c.enqueue(new Uint8Array(1024*1024));c.close();} }));
  r=await handle(req(),{},generation); assert.equal(r.status,502); assert.equal((await r.json()).error.code,'upstream_response_too_large'); checks++;
  global.fetch=realFetch; console.log(`SenseNova proxy offline tests passed (${checks} checks; no real network)`);
})().catch((e)=>{global.fetch=realFetch;global.setTimeout=realSetTimeout;console.error(e);process.exitCode=1;});
