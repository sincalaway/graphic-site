(function (global) {
  'use strict';

  global.GRAPHIC_API_CONFIG = {
    // 默认不发起网络请求；仅由本地示例数据驱动。
    mode: 'demo',
    baseUrl: '',
    timeoutMs: 30000,
    endpoints: {
      generate: '',
      edit: '',
      vectorize: '',
      session: '',
      works: '',
      checkout: ''
    }
  };
})(window);
