#!/usr/bin/env node
/* API error contract tests. No real key, network, or paid provider is used. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = __dirname + '/../public';
const storage = new Map();
const sessionStorage = { getItem:k=>storage.has(k)?storage.get(k):null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
const wait = ms => new Promise(r=>setTimeout(r,ms));

function makeContext() {
  const c = { window:{location:{origin:'http://local.test',href:'http://local.test/'}}, URL, AbortController, Blob, FormData, atob, btoa, setTimeout, clearTimeout, sessionStorage, console };
  c.window.sessionStorage = sessionStorage;
  c.fetch = async()=>{ throw new Error('unexpected network'); };
  for (const file of ['api-contract.js','api-config.js','api-settings.js','api-adapter.js'])
    vm.runInNewContext(fs.readFileSync(root+'/'+file,'utf8'), c);
  c.window.GraphicAPISettings.clear();
  c.window.GraphicAPISettings.save({enabled:true, protocol:'openai-images', baseUrl:'https://mock-api.example/v1', model:'mock-model', apiKey:'placeholder-not-real', generatePath:'/ignored', editPath:'/ignored', vectorizePath:''});
  return c;
}
function response(status, body) { return {ok:status>=200&&status<300, status, json:async()=>body, blob:async()=>new Blob(['x'],{type:'image/png'})}; }
async function rejects(p, code) { await assert.rejects(p, e=>e.code===code); }

(async()=>{
  const c=makeContext(), api=c.window.GraphicAPI;
  assert.equal(typeof api.errorInfo, 'function', 'GraphicAPI.errorInfo must be public');
  const info=api.errorInfo(Object.assign(new Error('secret key/provider body'), {code:'HTTP_ERROR', details:{status:401}}));
  assert.equal(info.code,'HTTP_ERROR'); assert.equal(info.status,401);
  assert.equal(typeof info.title,'string'); assert.equal(typeof info.message,'string'); assert.equal(typeof info.hint,'string');
  assert(!JSON.stringify(info).includes('secret')); assert(!JSON.stringify(info).includes('provider'));

  // Network errors never echo the thrown message or request credentials.
  c.fetch=async()=>{ throw new TypeError('secret-key raw provider message'); };
  await rejects(api.generate({tool:'logo'}),'NETWORK_ERROR');
  const network=api.errorInfo({code:'NETWORK_ERROR',message:'secret-key raw provider message'});
  assert.equal(network.code,'NETWORK_ERROR'); assert(!JSON.stringify(network).includes('secret-key'));

  // HTTP mapping is status-only and never reads an error response body.
  for (const status of [401,403,404,405,400,422,408,504,413,415,429,500,502]) {
    let bodyRead=false;
    c.fetch=async()=>({ok:false,status,get json(){bodyRead=true;throw new Error('response secret');}});
    await assert.rejects(api.generate({tool:'logo'}), e=>e.code==='HTTP_ERROR' && e.details.status===status);
    const mapped=api.errorInfo({code:'HTTP_ERROR',details:{status}});
    assert.equal(mapped.code,'HTTP_ERROR'); assert.equal(mapped.status,status); assert(!bodyRead, 'error body must not be read');
  }

  // Valid and malformed JSON, empty data, and item/task schemas.
  c.fetch=async()=>response(200,{data:[{b64_json:'AAAA'}]});
  const generated=await api.generate({tool:'logo',count:1}); assert.match(generated.items[0].imageUrl,/^data:image\/png;base64,AAAA$/);
  for (const body of [{},{data:[]},{data:[{}]}]) { c.fetch=async()=>response(200,body); await rejects(api.generate({tool:'logo'}),'INVALID_RESPONSE'); }
  const task=api.taskQuery({taskId:'t-1',cursor:'c',limit:2});
  assert.equal(task.taskId,'t-1'); assert.equal(task.cursor,'c'); assert.equal(task.limit,2);
  assert.throws(()=>api.taskQuery({unknown:true}),e=>e.code==='INVALID_REQUEST');
  await rejects(api.generate({tool:'logo',count:11}),'INVALID_REQUEST');
  assert.throws(()=>c.window.GraphicAPIContract.validateItems({items:[{id:1,name:'x',imageUrl:'data:image/png;base64,AAAA'}]},'http://local.test'),e=>e.code==='INVALID_RESPONSE');
  assert.throws(()=>c.window.GraphicAPIContract.validateItems({items:[{id:'x',name:'x',imageUrl:'data:image/png;base64,%%'}]},'http://local.test'),e=>e.code==='INVALID_RESPONSE');

  // Returned image download has its own stable error code.
  c.fetch=async(url)=> url.includes('/images/generations') ? response(200,{data:[{url:'https://cdn.example/x.png'}]}) : response(503,{});
  await rejects(api.generate({tool:'logo'}),'IMAGE_FETCH_FAILED');
  assert.equal(api.errorInfo({code:'IMAGE_FETCH_FAILED'}).code,'IMAGE_FETCH_FAILED');

  // Generation route and reference-image multipart edit route.
  let seen=[]; c.fetch=async(url,o)=>{ seen.push({url,o}); return response(200,{data:[{b64_json:'AAAA'}]}); };
  await api.generate({tool:'logo'}); assert.equal(seen.at(-1).url,'https://mock-api.example/v1/images/generations');
  await api.generate({tool:'logo',references:['data:image/png;base64,AAAA']});
  assert.equal(seen.at(-1).url,'https://mock-api.example/v1/images/edits');
  assert(seen.at(-1).o.body instanceof FormData); assert([...seen.at(-1).o.body.keys()].includes('image[]'));

  // User timeout is 180 seconds; fake timer invokes it without waiting 180 seconds.
  const realSetTimeout=c.setTimeout, realClearTimeout=c.clearTimeout;
  c.setTimeout=(fn,ms)=>{ if(ms===180000) return realSetTimeout(fn,5); return realSetTimeout(fn,ms); };
  c.window.setTimeout=c.setTimeout; c.clearTimeout=realClearTimeout;
  c.fetch=async(url,o)=>new Promise((resolve,reject)=>{ const fail=()=>{const e=new Error('raw');e.name='AbortError';reject(e);}; if(o.signal.aborted) fail(); else o.signal.addEventListener('abort',fail,{once:true}); });
  await rejects(api.generate({tool:'logo'}),'REQUEST_TIMEOUT');
  c.window.setTimeout=realSetTimeout; c.setTimeout=realSetTimeout;
  const ac=new AbortController(); c.fetch=async(url,o)=>new Promise((resolve,reject)=>{ const fail=()=>{const e=new Error('raw');e.name='AbortError';reject(e);}; if(o.signal.aborted) fail(); else o.signal.addEventListener('abort',fail,{once:true}); });
  const pending=api.generate({tool:'logo'},{signal:ac.signal}); await wait(1); ac.abort(); await rejects(pending,'REQUEST_CANCELLED');

  // Details are safe phase/status metadata only and errorInfo returns a stable shape.
  const phased=api.errorInfo({code:'HTTP_ERROR',details:{phase:'response',status:422,secret:'drop'}});
  assert.deepEqual(Object.keys(phased).sort(),['code','hint','message','status','title']); assert.equal(phased.status,422); assert(!JSON.stringify(phased).includes('drop'));
  console.log('API error, response/schema, image, route, timeout/cancel tests passed');
})().catch(e=>{ console.error(e); process.exitCode=1; });
