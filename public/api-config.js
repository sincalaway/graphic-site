(function (global) {
  'use strict';

  global.GRAPHIC_API_CONFIG = {
    // 默认不发起网络请求；供应商、模型和密钥均未知且留空。
    mode: 'demo', provider: '', model: '', baseUrl: '', timeoutMs: 30000,
    endpoints: { generate: '', edit: '', vectorize: '', session: '', works: '', checkout: '', task: '' },
    // 只读 UI 元数据预留，不表示已接入任何模型或计费服务。
    options: { intelligence: [
      { id: 'fast', label: '快捷', description: '适合快速探索方向' },
      { id: 'smart', label: '智能', description: '平衡构图与细节' },
      { id: 'pro', label: '专家', description: '用于复杂设计的预留档位' }
    ] }
  };
})(window);
