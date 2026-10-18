# YEELOGO 公开前端与只读 API 元数据 REA 证据报告

> **范围与边界**：仅分析 `/workspace/yeelogo-evidence/static/` 中已保存的公开首页资源，并对公开脚本已确认的 options URL 做 GET。未登录、未提交任何生成请求、未消耗积分、不猜测敏感路径；脚本均按静态文本/AST 解析，未执行站点脚本。

## 1. 证据身份

| 证据 | 内容 | SHA-256 / 位置 |
|---|---|---|
| 原始完整 REA | 全量静态目录分析（既有） | `/workspace/yeelogo-evidence/rea-analyze.json`；`4ed786d46841ac7bb6575fad480a99b123e239b3bfd37ca8f525e4aaa934fb05`（208 MB，未整读） |
| 聚焦 REA | 仅选择两个关键 JS 的新分析；命令为 `rea analyze-javascript-application ... --source-path 05... --source-path 08... --integrity-policy record-and-continue` | `/workspace/yeelogo-evidence/rea-focused.json`；`ea0322df539e4395df2463784f67ca7e58adbc27df6c1ea8c7b1f1cd776bc0aa`；Evidence ID `ev_4777502e4d4773c31c623f185b465767d4339c6a398a2aaa0914d75e5002e926` |
| 选定脚本 | `static/05-560-44e68692065534b0.js` | `ce73dfa84802abf27dd6f9989bb13ab98f83b9f2303bd9cb9a8479138a39ffd7` |
| 选定脚本 | `static/08-page-0760a0d0e8753232.js` | `14dd87de864eefc985aa5be6d8990509fa70303f71f9b94f2ce7fd590d1f77a0` |
| 只读 API 新证据 | `GET https://www.yeelogo.com/api/vector/options` | `/workspace/yeelogo-evidence/network/vector-options.json`；90 bytes；`24daad795ebccc5d86100ac0363fa55d188e84bea0ce37b5af172940b851484e`；headers 哈希 `6d99e576ff94bf1bf6c57e4d64244c51201decee359ab1f577b95b1d88fb306e` |

REA 聚焦分析明确记录：选择了 2 个文件，另有 9 个已盘点文件未纳入语义分析；代码按 inert text/AST 处理，未执行 bootstrap、push handler 或运行时请求；动态/混淆表达式和跨未选文件关系可能 unresolved。因此下述“静态存在”不等于“运行时一定调用”。

## 2. 直接证据（可复核）

### 2.1 客户端公开函数与端点构造

来源：`05-560-44e68692065534b0.js`，文件偏移按字节/字符索引记录；完整字节以文件 hash 为准。

- **通用请求层**：偏移约 `223196` 定义 `_0x6ce89b(path, options)`，负责请求选项、query/Content-Type 等通用处理；混淆导致部分字符串由索引/拼接表达式生成。
- **Logo options**：偏移 `242810` 的导出对象含 `logoOptions`，路径为混淆字符串拼接；此前网络证据已由公开页面脚本确认并保存为 `GET https://www.yeelogo.com/api/logo/options`（`network/logo-options.json`）。
- **Logo generate**：同一导出对象在约 `242810` 附近含 `generate`，把调用者 body 交给通用请求函数；这是客户端生成入口的静态证据，不是本轮执行证据。
- **Sketch**：偏移约 `244260`：`sketchGenerate(payload) -> _0x6ce89b(...+'etch', {method:..., body: payload})`；未将混淆索引擅自还原成未经确认的完整 URL。
- **Mockup**：偏移约 `244788–244876`：`mockupOptions()` 和 `mockupGenerate(payload)`；后者对 `...+'ckup'` 发送 body。
- **App Icon**：偏移约 `244996`：`appIconOptions()` 构造 `/logo/appicon/options`，并设置 `auth` 选项为假值；`appIconGenerate(payload)` 以 body 发送至以 `...+'picon'` 结尾的路径。公开 GET 已保存：`GET https://www.yeelogo.com/api/logo/appicon/options`（`network/appicon-options.json`）。
- **结果对象字段**：`08-page-0760a0d0e8753232.js` 偏移约 `408691–408700` 映射 `id`、`generate_id`、`seq`、`image_url`、`preview_url`、`svg_url`、`svg_ready`、`unlocked` 等字段。该字段集合支持“生成结果/资产状态对象”的推断，但不证明请求已成功或字段一定由后端返回。
- **提示词/手稿状态**：同文件约 `381562–384265` 出现 `prompt`、`prompts`、`setPrompt`；约 `175571` 出现“AI 配色”文案。它们是 UI/状态与功能文案证据，不是供应商或模型证据。

### 2.2 已 GET 的只读 options 元数据

- `GET https://www.yeelogo.com/api/logo/options`：响应 `msg: ok`；公开配置含 `levels` 1/2/3（普通/智能/专家）、`online`、`default_size`、`1K/2K/4K`、credits、`max_images`、`max_ref_images`、`region_edit`、styles 及部分 style fields。响应原文在 `network/logo-options.json`，请求头在 `network/logo-options.headers`。
- `GET https://www.yeelogo.com/api/logo/appicon/options`：响应 `msg: ok`；含三档 level、尺寸、credits、最大参考图数和 styles。响应原文在 `network/appicon-options.json`，请求头在 `network/appicon-options.headers`。
- `GET https://www.yeelogo.com/api/vector/options`：响应原文为 `{"msg":"ok","credits":1,"max_mb":8,"accept":[".png",".jpg",".jpeg",".webp",".bmp",".gif"]}`；这只说明公开矢量化上传配置，不说明转换任务实现。

### 2.3 页面/网络观察边界

`network/browser-observations.json` 记录公开页面观察到的 options fetch：首页与 `/sketch/` 的 logo options、`/appicon/` 的 appicon options、`/vectorizer/` 的 vector options；`/mockup/` 未见 fetch。它不是完整 HAR，不能证明其他请求绝不存在。未观察到浏览器直连 AI 供应商。

## 3. 推断（明确标注）

1. **架构形态（中等置信度）**：浏览器客户端通过统一请求封装访问站点自有 `/api/...` 路径；生成入口按 logo/sketch/mockup/appicon 分域，options 先提供能力/计费/输入约束，生成函数再提交 body。该判断来自静态函数关系与公开 options 响应，未执行生成链路。
2. **异步或资产状态（中等置信度）**：`generate_id`、`seq`、`image_url`、`preview_url`、`svg_ready`、`unlocked` 共同表明客户端准备处理“生成结果逐步可用/解锁”的状态模型；但当前证据不足以确定是轮询、SSE、WebSocket 还是单次响应后刷新。
3. **档位不是模型名**：options 中“智能/专家”及中文描述只是产品档位/文案；不能据此映射任何模型。当前材料没有可靠的模型供应商或具体模型名。
4. **服务端可能再调用供应商（未知）**：前端未见供应商名，也未观察到浏览器直连供应商；这既不能证明无供应商，也不能证明是哪一家，服务端调用保持未知。

## 4. 未知 / 未完成问题

- 未解析出足以安全、无猜测地确认的完整生成端点、HTTP method 的所有具体值、body schema、鉴权细节或错误码；混淆字符串索引仍需在不执行脚本的前提下做专门常量求值才可进一步确认。
- 未发现可直接归因于生成任务的公开 `status`/poll endpoint；REA/脚本中的 `pending`/`status` 命中也包含 React/Next 内部状态。不能把它们当作服务端任务状态 API。
- 未登录、未调用生成函数、未提交 body、未消耗 credits，故没有成功任务 ID、状态变迁、重试/取消/回调或计费扣除的运行时证据。
- 未找到 OpenAI、Anthropic、Gemini、DeepSeek、Qwen、Doubao、GPT、Claude 等供应商/模型名的直接命中；这只是已下载脚本范围内的有界负检索，不是全站或服务端不存在的证明。

## 5. 架构优化建议（设计建议，不冒充现状）

1. **把 options 与生成契约版本化**：公开 options 返回 `schema_version`/能力字段，并在生成请求中带 `options_version`；避免前端按混淆字符串和隐含字段耦合。
2. **显式异步任务协议**：若确为异步生成，建议统一返回 `{task_id, status, created_at}`，提供文档化的只读状态查询与幂等键；状态枚举明确 `queued/running/succeeded/failed/canceled`，并将 `generate_id` 与资产 ID 的关系写清楚。
3. **状态推送与降级**：优先 SSE/WebSocket 推送，轮询作为退化方案并带指数退避、超时和 Retry-After；避免以 `svg_ready` 等多个布尔字段拼装不一致状态。
4. **能力/计费前置校验**：客户端可用 options 做体验层校验，但服务端必须再次校验 level、size、max_images、credits 和引用图数量；错误响应应区分参数错误、未登录、额度不足、任务失败。
5. **供应商隔离**：前端只接触产品档位，不暴露供应商/模型名；服务端以 provider/model adapter 和可审计配置管理路由，避免把“智能/专家”硬编码为某一模型。
6. **可观测性与隐私**：以任务 ID 记录状态转移、耗时、provider adapter 版本和失败类别；日志脱敏 prompt、上传图和用户标识，且不要将供应商密钥或内部 endpoint 下发到浏览器。

## 6. 可复核原始材料

- `/workspace/yeelogo-evidence/static-evidence.md`（既有索引与偏移）
- `/workspace/yeelogo-evidence/static/05-560-44e68692065534b0.js`
- `/workspace/yeelogo-evidence/static/08-page-0760a0d0e8753232.js`
- `/workspace/yeelogo-evidence/static/direct-contexts.txt`
- `/workspace/yeelogo-evidence/network/{logo-options,appicon-options,vector-options}.{json,headers}`
- `/workspace/yeelogo-evidence/network/browser-observations.json`
- `/workspace/yeelogo-evidence/rea-focused.json`（REA Evidence ID 见上）
