(function (global) {
  'use strict';

  var DEFAULT_TIMEOUT = 30000;
  var INPUT_FIELDS = [
    'tool', 'brand', 'concept', 'style', 'color', 'subtitle', 'description',
    'references', 'sourceImage', 'platform', 'scene', 'intelligence', 'count'
  ];
  var ENDPOINT_KEYS = ['generate', 'edit', 'vectorize', 'session', 'works', 'checkout'];
  var RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;
  var RASTER_PATH = /^\/(?!\/)(?:[^?#]*\.(?:png|jpe?g|webp|gif|avif))(?:[?#].*)?$/i;

  function ApiError(code, message, details) {
    this.name = 'GraphicAPIError';
    this.code = code;
    this.message = message;
    if (details !== undefined) this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function config() {
    return global.GRAPHIC_API_CONFIG || {
      mode: 'demo', baseUrl: '', timeoutMs: DEFAULT_TIMEOUT,
      endpoints: { generate: '', edit: '', vectorize: '', session: '', works: '', checkout: '' }
    };
  }

  function safeMode(value) {
    return value === 'remote' ? 'remote' : 'demo';
  }

  function buildRequest(input) {
    var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var request = {};
    INPUT_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(source, field)) request[field] = source[field];
    });
    return request;
  }

  function endpointUrl(operation) {
    var current = config();
    if (ENDPOINT_KEYS.indexOf(operation) === -1) {
      throw new ApiError('INVALID_OPERATION', '不支持的 API 操作');
    }
    var endpoint = current.endpoints && current.endpoints[operation];
    var base = current.baseUrl || '';
    if (typeof endpoint !== 'string' || !endpoint || endpoint.indexOf('\\') !== -1 || endpoint.indexOf('//') === 0 || /^[a-z][a-z\d+.-]*:/i.test(endpoint)) {
      throw new ApiError('API_NOT_CONFIGURED', '远端 API 未配置安全的同源相对 endpoint');
    }
    if (typeof base !== 'string' || !base || base.indexOf('\\') !== -1 || base.indexOf('//') === 0 || /^[a-z][a-z\d+.-]*:/i.test(base)) {
      throw new ApiError('API_NOT_CONFIGURED', '远端 API 未配置安全的同源相对 baseUrl');
    }
    var path = (base.replace(/\/$/, '') + '/' + endpoint.replace(/^\//, ''));
    if (!/^\/(?!\/)/.test(path)) path = '/' + path;
    if (!/^\/(?!\/)[^?#]*$/.test(path)) throw new ApiError('INVALID_ENDPOINT', 'API endpoint 必须是本站相对路径');
    return path;
  }

  function normalizeError(error) {
    if (error instanceof ApiError) return error;
    if (error && error.name === 'AbortError') return new ApiError('REQUEST_CANCELLED', '请求已取消');
    return new ApiError('NETWORK_ERROR', error && error.message ? error.message : 'API 请求失败');
  }

  function imageIsSafe(value) {
    if (typeof value !== 'string') return false;
    if (RASTER_DATA_URL.test(value)) return true;
    if (!RASTER_PATH.test(value) || /[\\\x00-\x20]/.test(value)) return false;
    try { var parsed = new URL(value, global.location.origin); return parsed.origin === global.location.origin; } catch (_) { return false; }
  }

  function validateItems(payload) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 10) throw new ApiError('INVALID_RESPONSE', 'API 响应缺少有效的 items 数组');
    return {
      items: payload.items.map(function (item) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string' || !imageIsSafe(item.imageUrl)) {
          throw new ApiError('INVALID_RESPONSE', 'API 响应包含不安全或无效的图像项');
        }
        return { id: item.id, imageUrl: item.imageUrl, name: item.name };
      })
    };
  }

  async function request(operation, input, options) {
    var current = config();
    if (safeMode(current.mode) !== 'remote') {
      throw new ApiError('API_NOT_CONFIGURED', '当前为 demo 模式，未配置真实 API；请使用本地示例数据');
    }
    var url = endpointUrl(operation);
    var opts = options || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var externalSignal = opts.signal;
    var abortExternal = function () { if (controller) controller.abort(); };
    if (externalSignal) {
      if (externalSignal.aborted) throw new ApiError('REQUEST_CANCELLED', '请求已取消');
      externalSignal.addEventListener('abort', abortExternal, { once: true });
    }
    try {
      timer = setTimeout(function () { if (controller) controller.abort(); }, Number(current.timeoutMs) > 0 ? Number(current.timeoutMs) : DEFAULT_TIMEOUT);
      var response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildRequest(input)),
        signal: controller ? controller.signal : externalSignal
      });
      var body;
      try { body = await response.json(); } catch (parseError) { throw new ApiError('INVALID_RESPONSE', 'API 未返回 JSON'); }
      if (!response.ok) {
        throw new ApiError((body && typeof body.code === 'string' ? body.code : 'API_ERROR'), (body && typeof body.message === 'string' ? body.message : 'API 请求失败'));
      }
      return validateItems(body);
    } catch (error) {
      throw normalizeError(error);
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', abortExternal);
    }
  }

  var api = {
    status: function () {
      var current = config();
      return {
        mode: safeMode(current.mode),
        configured: safeMode(current.mode) === 'remote' && !!(current.baseUrl && current.endpoints && current.endpoints.generate),
        demo: safeMode(current.mode) !== 'remote'
      };
    },
    buildRequest: buildRequest,
    generate: function (input, options) { return request('generate', input, options); },
    edit: function (input, options) { return request('edit', input, options); },
    vectorize: function (input, options) { return request('vectorize', input, options); }
  };

  global.GraphicAPI = api;
})(window);
