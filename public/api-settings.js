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
  };
  var PROTOCOLS = ["graphic-json", "openai-images"];
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
  function valid(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("API 设置无效");
    var v = copy(Object.assign({}, DEFAULTS, value));
    if (typeof v.enabled !== "boolean" || PROTOCOLS.indexOf(v.protocol) < 0)
      throw new Error("API 设置无效");
    if (v.enabled && !base(v.baseUrl)) throw new Error("API 服务地址无效");
    if (!v.enabled && v.baseUrl !== "" && !base(v.baseUrl))
      throw new Error("API 服务地址无效");
    if (
      typeof v.model !== "string" ||
      v.model.length > 200 ||
      (v.enabled && !v.model.trim())
    )
      throw new Error("API 模型必须填写");
    if (
      typeof v.apiKey !== "string" ||
      v.apiKey.length > 4096 ||
      (v.enabled && v.protocol === "openai-images" && !v.apiKey)
    )
      throw new Error("OpenAI Images 必须填写 API key");
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
