(function (global) {
  'use strict';

  var MAX = { brand: 80, concept: 120, style: 80, color: 32, subtitle: 120,
    description: 4000, platform: 32, scene: 32, intelligence: 16 };
  var TOOLS = ['generate', 'edit', 'vectorize', 'logo', 'appicon', 'sketch', 'mockup'];
  var IMAGE_DATA = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;
  var IMAGE_PATH = /^\/(?!\/)(?:[^?#\\\x00-\x20%]*\.(?:png|jpe?g|webp|gif|avif))(?:[?#].*)?$/i;

  function ContractError(code, message, details) {
    this.name = 'GraphicAPIContractError'; this.code = code; this.message = message;
    if (details !== undefined) this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ContractError);
  }
  ContractError.prototype = Object.create(Error.prototype);
  ContractError.prototype.constructor = ContractError;

  function text(value, name, limit) {
    if (value === undefined) return;
    if (typeof value !== 'string' || value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
      throw new ContractError('INVALID_REQUEST', name + ' 必须是长度不超过 ' + limit + ' 的文本');
  }
  function image(value, name) {
    if (value === undefined || value === '') return;
    if (typeof value !== 'string' || (!IMAGE_DATA.test(value) && !IMAGE_PATH.test(value)))
      throw new ContractError('INVALID_REQUEST', name + ' 不是允许的本站图像');
  }
  function buildRequest(input) {
    var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var fields = ['tool','brand','concept','style','styleIndex','color','subtitle','description','references','sourceImage','platform','scene','intelligence','count'];
    var request = {};
    fields.forEach(function (field) { if (Object.prototype.hasOwnProperty.call(source, field)) request[field] = source[field]; });
    // full-flow uses the UI name "vectorizer"; the transport contract uses "vectorize".
    if (request.tool === 'vectorizer') request.tool = 'vectorize';
    return request;
  }
  function validateRequest(input) {
    var request = buildRequest(input);
    if (!request.tool || TOOLS.indexOf(request.tool) === -1) throw new ContractError('INVALID_REQUEST', 'tool 不是支持的操作');
    ['brand','concept','style','color','subtitle','description','platform','scene','intelligence'].forEach(function (k) { text(request[k], k, MAX[k]); });
    if (request.styleIndex !== undefined && (!Number.isInteger(request.styleIndex) || request.styleIndex < 0 || request.styleIndex > 9)) throw new ContractError('INVALID_REQUEST', 'styleIndex 必须是 0 至 9 的整数');
    if (request.count !== undefined && (!Number.isInteger(request.count) || request.count < 1 || request.count > 10)) throw new ContractError('INVALID_REQUEST', 'count 必须是 1 至 10 的整数');
    if (request.intelligence !== undefined && ['fast','smart','pro','balanced'].indexOf(request.intelligence) === -1) throw new ContractError('INVALID_REQUEST', 'intelligence 档位无效');
    image(request.sourceImage, 'sourceImage');
    if (request.references !== undefined) {
      if (!Array.isArray(request.references) || request.references.length > 5) throw new ContractError('INVALID_REQUEST', 'references 最多 5 项');
      request.references.forEach(function (item, i) { image(item, 'references[' + i + ']'); });
    }
    return request;
  }
  function isSafeImage(value, origin) {
    if (typeof value !== 'string') return false;
    if (IMAGE_DATA.test(value)) return true;
    if (!IMAGE_PATH.test(value)) return false;
    try { return new URL(value, origin || 'http://graphic.invalid').origin === (origin || 'http://graphic.invalid'); } catch (_) { return false; }
  }
  function validateItems(payload, origin) {
    if (!payload || !Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 10) throw new ContractError('INVALID_RESPONSE', 'API 响应缺少有效的 items 数组');
    return { items: payload.items.map(function (item) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 120 || typeof item.name !== 'string' || item.name.length > 200 || !isSafeImage(item.imageUrl, origin)) throw new ContractError('INVALID_RESPONSE', 'API 响应包含不安全或无效的图像项');
      return { id: item.id, imageUrl: item.imageUrl, name: item.name };
    }) };
  }
  function validateTaskQuery(input) {
    var value = input && typeof input === 'object' ? input : {};
    if (Object.keys(value).some(function (key) { return ['taskId','cursor','limit'].indexOf(key) === -1; })) throw new ContractError('INVALID_REQUEST', '任务查询字段不在契约内');
    if (value.taskId !== undefined && (typeof value.taskId !== 'string' || value.taskId.length < 1 || value.taskId.length > 160)) throw new ContractError('INVALID_REQUEST', 'taskId 无效');
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length > 512)) throw new ContractError('INVALID_REQUEST', 'cursor 无效');
    if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 10)) throw new ContractError('INVALID_REQUEST', 'limit 必须是 1 至 10 的整数');
    return { taskId: value.taskId, cursor: value.cursor, limit: value.limit };
  }
  global.GraphicAPIContract = { ContractError: ContractError, buildRequest: buildRequest, validateRequest: validateRequest, validateItems: validateItems, validateTaskQuery: validateTaskQuery, isSafeImage: isSafeImage };
})(typeof window !== 'undefined' ? window : globalThis);
