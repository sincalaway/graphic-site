(function (global) {
  "use strict";
  var KEY = "graphic-api-settings-v1";
  var DEFAULTS = {
    enabled: false,
    protocol: "graphic-json",
    baseUrl: "",
    model: "",
    apiKey: "",
    generatePath: "/generate",
    editPath: "/edit",
    vectorizePath: "",
    workflowJson: "",
  };
  var PROTOCOLS = ["graphic-json", "openai-images", "sensenova-proxy", "comfyui-api"];
  function copy(v) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = v[k];
    });
    return out;
  }
  function path(v, optional) {
    if (optional && v === "") return true;
    return (
      typeof v === "string" &&
      /^\/[A-Za-z0-9._~/-]*$/.test(v) &&
      v.indexOf("//") < 0 &&
      v.indexOf("%") < 0 &&
      v.indexOf("\\") < 0 &&
      !/(^|\/)\.{1,2}(\/|$)/.test(v)
    );
  }
  function base(v) {
    if (
      typeof v !== "string" ||
      !v ||
      /[\x00-\x20\\%?#]/.test(v) ||
      !/^(?:https:\/\/|http:\/\/)/i.test(v)
    )
      return false;
    var rawPath = v.replace(/^[a-z]+:\/\/[^\/]*(\/.*)?$/i, "$1") || "/";
    if (/(^|\/)\.{1,2}(\/|$)/.test(rawPath)) return false;
    try {
      var u = new URL(v);
      if (u.username || u.password || u.search || u.hash || u.origin === "null")
        return false;
      if (
        u.protocol !== "https:" &&
        !(
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].indexOf(u.hostname) >= 0
        )
      )
        return false;
      if (u.pathname.indexOf("%") >= 0 || !path(u.pathname || "/"))
        return false;
      return true;
    } catch (_) {
      return false;
    }
  }
  function comfyBase(v) {
    if (typeof v !== "string" || !v || /[\x00-\x20\\%?#]/.test(v)) return false;
    try {
      var u = new URL(v);
      return !u.username && !u.password && !u.search && !u.hash && u.pathname === "/" &&
        (u.protocol === "http:" || u.protocol === "https:") &&
        ["localhost", "127.0.0.1", "[::1]"].indexOf(u.hostname) >= 0;
    } catch (_) { return false; }
  }
  function validWorkflow(raw) {
    var size = typeof raw === "string"
      ? typeof Blob === "function" ? new Blob([raw]).size : raw.length
      : Infinity;
    if (typeof raw !== "string" || size > 2 * 1024 * 1024)
      throw new Error("ComfyUI API workflow 不能超过 2 MiB");
    var workflow;
    try { workflow = JSON.parse(raw); }
    catch (_) { throw new Error("请导入有效的 ComfyUI API workflow JSON"); }
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow))
      throw new Error("workflow 顶层必须是 ComfyUI API 节点对象");
    var ids = Object.keys(workflow);
    if (!ids.length || ids.length > 5000) throw new Error("workflow 节点数量无效");
    ids.forEach(function (id) {
      var node = workflow[id];
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !node || typeof node !== "object" ||
          typeof node.class_type !== "string" || !node.class_type ||
          !node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs))
        throw new Error("这不是 ComfyUI 导出的 API 格式 workflow JSON");
    });
    return workflow;
  }
  function valid(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("API 设置无效");
    var v = copy(Object.assign({}, DEFAULTS, value));
    if (typeof v.enabled !== "boolean" || PROTOCOLS.indexOf(v.protocol) < 0)
      throw new Error("API 设置无效");
    if (v.protocol === "sensenova-proxy") {
      var origin = global.location && global.location.origin;
      if (!origin || !base(origin)) throw new Error("同源代理需要 HTTPS 或 localhost 页面");
      // Never trust a stored/input URL for the dedicated proxy.
      v.baseUrl = origin + "/api/sensenova";
      v.model = "sensenova-u1.5-lite";
      v.generatePath = "/images/generations";
      v.editPath = "/images/edits";
      v.vectorizePath = "";
    }
    if (v.protocol === "comfyui-api") {
      v.model = "";
      v.apiKey = "";
      v.generatePath = "/prompt";
      v.editPath = "";
      v.vectorizePath = "";
      if (v.workflowJson) validWorkflow(v.workflowJson);
      if (v.enabled && !v.workflowJson) throw new Error("请先导入 ComfyUI 导出的 API workflow JSON");
      if (v.enabled && !comfyBase(v.baseUrl)) throw new Error("ComfyUI 地址仅允许 localhost / 127.0.0.1 / [::1]");
    } else if (typeof v.workflowJson !== "string" || v.workflowJson !== "") {
      v.workflowJson = "";
    }
    if (v.protocol !== "comfyui-api" && v.enabled && !base(v.baseUrl)) throw new Error("API 服务地址无效");
    if (v.protocol !== "comfyui-api" && !v.enabled && v.baseUrl !== "" && !base(v.baseUrl))
      throw new Error("API 服务地址无效");
    if (
      typeof v.model !== "string" ||
      v.model.length > 200 ||
      (v.enabled && v.protocol !== "comfyui-api" && !v.model.trim())
    )
      throw new Error("API 模型必须填写");
    if (
      typeof v.apiKey !== "string" ||
      v.apiKey.length > 4096 ||
      /[\x00-\x20\x7f]/.test(v.apiKey) ||
      (v.enabled && ["openai-images", "sensenova-proxy"].indexOf(v.protocol) >= 0 && !v.apiKey)
    )
      throw new Error("API key 必须填写且不能包含空白或控制字符");
    if (
      !path(v.generatePath, false) ||
      !path(v.editPath, true) ||
      !path(v.vectorizePath, true)
    )
      throw new Error("API 路径无效");
    return v;
  }
  function storage() {
    try {
      return global.sessionStorage;
    } catch (_) {
      return null;
    }
  }
  var api = {
    validateWorkflow: function (raw) { validWorkflow(raw); return true; },
    get: function () {
      var s = storage(),
        raw;
      if (!s) return copy(DEFAULTS);
      try {
        raw = s.getItem(KEY);
      } catch (_) {
        return copy(DEFAULTS);
      }
      if (!raw) return copy(DEFAULTS);
      try {
        return copy(valid(JSON.parse(raw)));
      } catch (_) {
        return copy(DEFAULTS);
      }
    },
    save: function (value) {
      var v = valid(value),
        s = storage();
      if (!s) throw new Error("当前浏览器不支持会话存储");
      try {
        s.setItem(KEY, JSON.stringify(v));
      } catch (_) {
        throw new Error("无法保存 API 设置");
      }
      return copy(v);
    },
    clear: function () {
      var s = storage();
      if (s) {
        try {
          s.removeItem(KEY);
        } catch (_) {
          throw new Error("无法清除 API 设置");
        }
      }
      return copy(DEFAULTS);
    },
  };
  global.GraphicAPISettings = api;
})(typeof window !== "undefined" ? window : globalThis);
