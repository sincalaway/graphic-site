(function (global) {
  'use strict';
  var DEFAULT_TIMEOUT = 30000;
  var ENDPOINT_KEYS = ['generate', 'edit', 'vectorize', 'session', 'works', 'checkout', 'task'];
  var contract = global.GraphicAPIContract;

  function ApiError(code, message, details) { this.name = 'GraphicAPIError'; this.code = code; this.message = message; if (details !== undefined) this.details = details; if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError); }
  ApiError.prototype = Object.create(Error.prototype); ApiError.prototype.constructor = ApiError;
  function cfg() { return global.GRAPHIC_API_CONFIG || { mode:'demo', baseUrl:'', timeoutMs:DEFAULT_TIMEOUT, provider:'', model:'', endpoints:{} }; }
  function mode(c) { return c.mode === 'remote' ? 'remote' : 'demo'; }
  function configured(operation) {
    var c = cfg(), e = c.endpoints && c.endpoints[operation], b = c.baseUrl;
    return mode(c) === 'remote' && safePath(b, true) && typeof e === 'string' && e.length > 0 && safeEndpoint(e);
  }
  function safePath(value, base) {
    // Static configuration never needs URL encoding: reject every encoded or
    // otherwise non-portable path character, not just encoded separators.
    if (typeof value !== 'string' || !value || !/^\/[A-Za-z0-9._~/-]*$/.test(value) || value.indexOf('//') !== -1 || /(?:^|\/)\.\.?(?:\/|$)/.test(value)) return false;
    return base ? value === '/' || value.charAt(0) === '/' : value.charAt(0) === '/';
  }
  function safeEndpoint(value) { return safePath(value, false); }
  function endpointUrl(operation) {
    var c = cfg();
    if (ENDPOINT_KEYS.indexOf(operation) === -1) throw new ApiError('INVALID_OPERATION', '不支持的 API 操作');
    if (!configured(operation)) throw new ApiError('API_NOT_CONFIGURED', '该操作尚未配置安全的同源 endpoint');
    var base = c.baseUrl === '/' ? '' : c.baseUrl.replace(/\/$/, '');
    var endpoint = c.endpoints[operation];
    var url = base + (endpoint.charAt(0) === '/' ? endpoint : '/' + endpoint);
    if (!/^\/[A-Za-z0-9._~/-]*$/.test(url) || url.indexOf('//') !== -1 || /(?:^|\/)\.{1,2}(?:\/|$)/.test(url)) throw new ApiError('INVALID_ENDPOINT', 'API endpoint 必须是安全的本站相对路径');
    return url;
  }
  function normalize(error, timedOut) {
    if (timedOut) return new ApiError('REQUEST_TIMEOUT', 'API 请求超时');
    if (error instanceof ApiError) return error;
    if (error && typeof error.code === 'string') return new ApiError(error.code, error.message, error.details);
    if (error && error.name === 'AbortError') return new ApiError('REQUEST_CANCELLED', '请求已取消');
    return new ApiError('NETWORK_ERROR', error && error.message ? error.message : 'API 请求失败');
  }
  function errorBody(response) {
    return response.json().then(function (body) { return body; }, function (error) {
      if (error && error.name === 'AbortError') throw error;
      return null;
    });
  }
  async function request(operation, input, options) {
    var c = cfg();
    if (mode(c) !== 'remote') throw new ApiError('API_NOT_CONFIGURED', '当前为 demo 模式，未配置真实 API；请使用本地示例数据');
    var requestBody;
    try { requestBody = contract.validateRequest(input); } catch (e) { throw e instanceof ApiError ? e : new ApiError(e.code || 'INVALID_REQUEST', e.message); }
    var url = endpointUrl(operation), opts = options || {}, external = opts.signal;
    if (external && external.aborted) throw new ApiError('REQUEST_CANCELLED', '请求已取消');
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false, timer = null;
    function abortExternal() { if (controller) controller.abort(); }
    if (external && external.addEventListener) external.addEventListener('abort', abortExternal, { once:true });
    try {
      var timeout = Number(c.timeoutMs); if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300000) timeout = DEFAULT_TIMEOUT;
      timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, timeout);
      var response = await fetch(url, { method:'POST', credentials:'same-origin', redirect:'error', headers:{'Content-Type':'application/json', Accept:'application/json'}, body:JSON.stringify(requestBody), signal:controller ? controller.signal : external });
      if (!response || !response.ok) {
        var errorJson = response ? await errorBody(response) : null;
        throw new ApiError((errorJson && typeof errorJson.code === 'string' ? errorJson.code : 'HTTP_ERROR'), (errorJson && typeof errorJson.message === 'string' ? errorJson.message : 'API 返回 HTTP ' + (response && response.status)), { status: response && response.status });
      }
      var body; try { body = await response.json(); } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        throw new ApiError('INVALID_RESPONSE', 'API 未返回 JSON');
      }
      return contract.validateItems(body, global.location && global.location.origin);
    } catch (error) { throw normalize(error, timedOut); }
    finally { if (timer) clearTimeout(timer); if (external && external.removeEventListener) external.removeEventListener('abort', abortExternal); }
  }
  var api = {
    status: function () { var c = cfg(), operations = {}; ENDPOINT_KEYS.forEach(function (k) { operations[k] = configured(k); }); return { mode:mode(c), configured:!!operations.generate, demo:mode(c) !== 'remote', operations:operations, provider:typeof c.provider === 'string' ? c.provider : '', model:typeof c.model === 'string' ? c.model : '' }; },
    buildRequest: contract.buildRequest,
    options: function () { var c = cfg(); var list = c.options && Array.isArray(c.options.intelligence) ? c.options.intelligence.map(function (item) { return Object.freeze({ id: item.id, label: item.label, description: item.description }); }) : []; return Object.freeze({ intelligence: Object.freeze(list) }); },
    taskQuery: contract.validateTaskQuery,
    generate: function (input, options) { return request('generate', input, options); },
    edit: function (input, options) { return request('edit', input, options); },
    vectorize: function (input, options) { return request('vectorize', input, options); }
  };
  global.GraphicAPI = api;
})(typeof window !== 'undefined' ? window : globalThis);
