/* Image providers reachable through this site's own proxy (/api/image/<id>/...).
   Keep ids, maxN and edit support in sync with lib/image-proxy.mjs. */
(function (global) {
  "use strict";
  var LIST = [
    { id: "sensenova", label: "SenseNova 商汤日日新（国内）", maxN: 1, edit: true, models: true, watermark: true,
      keyUrl: "https://platform.sensenova.cn/console/keys", suggested: ["sensenova-u1.5-lite"],
      keyHint: "sk- 开头，在 platform.sensenova.cn 控制台创建" },
    { id: "sensenova-intl", label: "SenseNova 国际版（sensenova.ai）", maxN: 1, edit: true, models: true, watermark: true,
      keyUrl: "https://platform.sensenova.ai/", suggested: ["sensenova-u1.5-lite"],
      keyHint: "在 platform.sensenova.ai 创建的 key 只能用于国际版" },
    { id: "ark", label: "火山方舟 · 豆包 Seedream", maxN: 1, edit: true, models: true, watermark: true,
      keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
      suggested: ["doubao-seedream-4-0-250828", "doubao-seedream-4-5-251128", "doubao-seedream-5-0-260128"],
      keyHint: "方舟控制台的 API Key（通常是 UUID 格式），模型需先在控制台开通" },
    { id: "siliconflow", label: "硅基流动 SiliconFlow", maxN: 4, edit: true, models: true,
      keyUrl: "https://cloud.siliconflow.cn/account/ak",
      suggested: ["Kwai-Kolors/Kolors", "Qwen/Qwen-Image", "Qwen/Qwen-Image-Edit-2509", "black-forest-labs/FLUX.1-schnell"],
      keyHint: "sk- 开头；带参考图时请选 Edit / Kontext 类模型" },
    { id: "zhipu", label: "智谱 BigModel · CogView", maxN: 1, edit: false, models: false,
      keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", suggested: ["cogview-4-250304", "cogview-3-flash", "glm-image"],
      keyHint: "格式为 id.secret（中间有一个点）；仅支持文生图" },
    { id: "modelscope", label: "魔搭 ModelScope", maxN: 1, edit: true, models: true, async: true,
      keyUrl: "https://modelscope.cn/my/myaccesstoken",
      suggested: ["Qwen/Qwen-Image", "Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-Edit-2509"],
      keyHint: "ms- 开头的访问令牌；账号需先绑定阿里云并实名。出图是排队任务，页面会自动等待结果" },
    { id: "openai", label: "OpenAI Images", maxN: 4, edit: true, models: true,
      keyUrl: "https://platform.openai.com/api-keys", suggested: ["gpt-image-1", "gpt-image-1-mini", "dall-e-3"],
      keyHint: "sk-proj- / sk- 开头" },
  ];
  var BY_ID = {};
  LIST.forEach(function (p) { BY_ID[p.id] = Object.freeze(p); });

  /** Accept a key however it was pasted: spaces, line breaks, quotes or a "Bearer " prefix. */
  function normalizeKey(raw) {
    if (typeof raw !== "string") return "";
    var key = raw.replace(/[\u200b-\u200d\ufeff]/g, "").trim();
    key = key.replace(/^Bearer\s+/i, "").replace(/^Bearer\s+/i, "").trim();
    key = key.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s+/g, "");
    return key;
  }

  /** Providers this key could belong to, most likely first (format only, no network). */
  function guess(rawKey) {
    var key = normalizeKey(rawKey);
    if (!key) return [];
    if (/^[0-9a-f]{32}\.[A-Za-z0-9]{10,}$/i.test(key)) return ["zhipu"];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return ["ark"];
    if (/^sk-(?:proj|svcacct|admin)-/.test(key)) return ["openai"];
    if (/^ms-/.test(key)) return ["modelscope"];
    if (/^sk-/.test(key)) return ["sensenova", "siliconflow", "sensenova-intl", "openai"];
    return LIST.map(function (p) { return p.id; });
  }

  global.GraphicImageProviders = Object.freeze({
    list: function () { return LIST.slice(); },
    get: function (id) { return BY_ID[id] || null; },
    ids: function () { return LIST.map(function (p) { return p.id; }); },
    normalizeKey: normalizeKey,
    guess: guess,
  });
})(typeof window !== "undefined" ? window : globalThis);
