# Graphic：全流程 Logo 创作与图标素材库

Graphic 是一个**本地优先**的网站。默认进入 Logo 创作，保留原有图标素材库、参考图和作品管理功能；默认使用本地 demo，不会自动调用模型、上传数据或扣费。现在也可以从页面配置受支持的 API，包括 SenseNova 专用同源代理、ComfyUI 本机 API workflow 或高级浏览器直连：保存配置不会发请求，只有随后明确点击生成/编辑才会连接相应服务。

## 当前功能

- **素材库**：保留图标库分类切换、名称/分类/标签搜索、数量统计、预览、原图打开和预留空位。点击“素材库 / 创作”可往返切换。
- **五种工具**：`Logo`、`App Icon`、`手稿转 Logo`、`效果图 Mockup`、`图片转 SVG`。
  - **Logo**：默认本地模板演示；模板名称、主色和 Logo 名称可改。品牌概念、描述、references 会保留在 request，并显示在作品的项目说明中。
  - **App Icon**：三列手机样机预览，支持 5 种平台颜色模板。
  - **手稿转 Logo**：本地 canvas 绘图、图片上传、撤销、重做和续改，代码位于 `public/sketch-pad.js` / `public/sketch-pad.css`。
  - **效果图 Mockup**：6 个本地场景（含不套风格），支持本地排版、上传、从作品选择和样例。
  - **图片转 SVG**：明确是把位图嵌入 SVG 容器，不是矢量描摹；不会声称完成真实路径追踪。`graphic-json` 的 `vectorize` 也仍返回栅格容器，不是真正 SVG 路径实现。
- **我的作品**：按工具筛选、搜索、收藏、删除；可点开续改/预览，保存版本，修改名称，并下载 PNG 或 SVG。
- **账号界面**：微信扫码占位、邮箱登录/注册/重置密码均为前端演示；没有真实凭据校验、邮件发送、支付或账户后端。积分与服务待接入。
- **旧模块保留**：原有参考图上传/粘贴/拖放、删除、预览、压缩保存和参考取色继续可用。

## API 配置（默认仍是 demo）

顶部状态栏的 **“配置 API”**，以及“更多”菜单中的 **“API 接入状态”** 都会打开同一个配置面板。手机上按以下步骤操作：

1. 打开 **配置 API**，选择协议并填写协议所需字段：`graphic-json` / `openai-images` 是浏览器直连；专用 `sensenova-proxy` 仅使用同源 `/api/sensenova`，模型固定为 `sensenova-u1.5-lite`，`baseUrl` 运行时固定为 `location.origin + '/api/sensenova'`，不可改成通用代理。
2. 选择 `sensenova-proxy` 时，只在当前页面输入 SenseNova key；它仅放入当前标签页 `sessionStorage`，不读取平台保存的密钥；刷新时可读取本页会话配置。阅读安全提示并勾选确认（只有随后点击生成/编辑，key、提示词和使用的图片才会发送，可能计费）。
3. 点 **保存配置**。这一步只做本地格式校验和保存，不测试、不收费、不发请求。
   UI 将另提供 **“只读检查模型列表”** 按钮：使用当前表单中的 key 请求固定同源 `GET /api/sensenova/models`，只读取模型 ID，用于检查接口是否可访问以及是否包含 `sensenova-u1.5-lite`。这项检查不保存 key、不发图；列表可访问不证明图片生成权限或模型一定能生成。
4. 回到工具填写提示词/参考图，第一次点 **生成** 或 **编辑** 才会请求服务。失败不会默默回退 demo，也不会自动重试。
5. 不再使用时点 **清除配置**；配置会清空并回到 demo。

**ComfyUI 本机接口**：选择 `ComfyUI · 本机 API workflow`，地址填写 `http://127.0.0.1:8188`（或本机实际监听地址），再导入从 ComfyUI 导出的 **API 格式 workflow JSON**。导入与保存只在当前标签页校验和保存文件内容，不连接 ComfyUI；之后点生成才会把 workflow 原样提交并轮询历史、读取图片。项目不会猜测模型/节点，也不会把当前页面的品牌、提示词或参考图自动映射进 workflow；因此需要用户提供并导入适用于目标工作流的 API JSON。只有 workflow 内已有的提示词和节点参数会运行。此模式目前只支持生成，不支持续改或矢量化。若站点使用 HTTPS，浏览器访问本机 `http://127.0.0.1:8188` 可能被本地网络权限、混合内容或 ComfyUI 的 CORS 设置拦截；仓库提供配置框架，不保证已在所有浏览器环境连通。

配置只放在当前标签页的 `sessionStorage`：刷新通常保留，关闭标签页通常清除；浏览器的“恢复标签页”或复制标签页可能恢复或复制会话数据，因此不要把它当作密钥保险箱。key 仍能被页面脚本、浏览器扩展或 XSS 读取。建议使用低额度、短期 key，或使用自己的后端代理；绝不要把 key 写入源文件、作品、日志或仓库。

支持的协议、SenseNova 专用请求/响应、ComfyUI workflow、地址限制、CORS、错误诊断和费用边界见 **[API_INTEGRATION.md](./API_INTEGRATION.md)**。本次不读取真实 key、不调用真实生成或编辑，自动化测试只用 mock 验证配置与传输行为。错误提示不会暴露原始错误 body、URL 或 key；图像请求不会自动重试或回退。失败或超时后服务端可能仍在处理，重试前先查服务端记录。

固定同源 `GET /api/sensenova/models` 只转发到 `https://token.sensenova.cn/v1/models`，成功响应裁剪为 `{ "data": [{ "id": "..." }] }`，仅保留模型 ID；缺少或无效 `Authorization: Bearer <key>` 返回 `401`。它与生成/编辑共用同源来源、Fetch Metadata、禁止重定向、无开放 CORS 和静态错误边界。`403` 通过自身安全 `error.code` 区分来源拒绝与上游拒绝；`502`–`504` 的 `upstream_error`、`upstream_unavailable`、`invalid_upstream_response`、`upstream_timeout_or_cancelled` 等白名单码会在页面细分显示，未知码及原始正文不会展示。模型列表可访问不代表图片生成能力。

## 本地数据与演示边界

作品和草稿使用当前浏览器的 `localStorage`；作品最多保留 60 条。参考图仍按旧模块规则处理（PNG/JPG/WebP、单张不超过 8 MB、最多 5 张），不会上传服务器或加入图标素材库，除非你主动保存 API 配置并发起真实请求。更换网址（包括从旧网址换到新临时地址）、设备或清除站点数据时，`localStorage` 不会同步，需重新添加或下载备份。

账号只是本地演示会话，请勿输入真实密码或个人信息。默认 demo 不提供语义理解、真实 AI 生成或真实矢量描摹；API 直连是否成功取决于你填写的服务及其能力，不代表本项目提供模型或后端。

## 旧 API 模式与代码边界

仍保留 `public/api-config.js` 的旧静态**同源 `remote` 模式**，供高级用户接入自有后端；它与现在的页面配置 UI 是两条路径。旧模式中的密钥不应放进静态文件，UI 模式优先，详细区别和兼容字段见 API 文档。

`public/api-config.js`、`public/api-contract.js` 和 `public/api-adapter.js` 负责配置、契约与传输；demo 默认不发网络请求。UI 支持 `sensenova-proxy`（固定目标的专用同源模式）、`comfyui-api`（本机 API workflow 原样提交）、`graphic-json`（自有 POST JSON）与 `openai-images`（OpenAI 兼容 Images 协议，非任意供应商协议）。

原站公开资源的 REA 分析见 **[公开证据摘要](./docs/REA_EVIDENCE.md)**：可确认档位配置和客户端流程，无法确认私有服务端实现、具体模型或成功推理。智能/专家是产品档位，不是模型名；本项目的契约也不是原站后端协议。

## 以后主要改这一个文件

**[`public/catalog.js`](./public/catalog.js)** 是分类与图标配置。每个分类包含一个 `icons` 数组，新增一项就多一个图标；复制一个分类对象就多一个分类，网页会自动换行和统计数量。分类数和每类图标数不需要相同，也不设固定上限。

- 图片上传到 `public/assets/icons/<分类ID>/`，配置路径写为 `assets/icons/<分类ID>/文件名.svg`。
- `reservedSlots: 4` 表示额外显示 4 个“待添加”空位，不是容量上限；设为 `0` 即可隐藏。
- `icons: []` 可以先建立空分类，也可用 `placeholder: true` 添加有名称的占位。
- 分类及图标 ID 必须全局唯一，使用小写英文、数字与连字符。

详细复制示例、GitHub 添加步骤及常见问题见 **[添加分类与图标.md](./添加分类与图标.md)**；页面中“如何添加分类与图标”也有简短指引。

## 本地打开

无需安装依赖、构建或 Webdev。在仓库根目录运行：

```bash
python3 -m http.server 8000 --directory public
```

打开 <http://localhost:8000>，停止服务器按 `Ctrl+C`。静态资源输出目录为 `public/`，不要公开整个仓库；使用同源模式时还必须从仓库根通过 Pages 编译并部署 `functions/`，不能仅上传静态文件。若要浏览器直连真实服务，发布站点和服务端需按文档配置 HTTPS/CORS。Cloudflare Pages Functions 的本地预览应使用 `npx wrangler pages dev public`；仅 `python3 -m http.server` 不能执行 Functions。

## 文件结构

```text
graphic-site/
├── public/                   # 静态资源与 Pages 构建输出
│   ├── index.html            # 页面结构（含 API 配置入口）
│   ├── style.css             # 原有创作样式
│   ├── catalog.css            # 素材库样式
│   ├── full-flow.js           # 五工具、作品和账号演示流程
│   ├── full-flow.css          # 全流程样式
│   ├── sketch-pad.js          # 手稿 canvas 与撤销/重做
│   ├── sketch-pad.css         # 手稿绘图样式
│   ├── api-config.js          # 旧静态配置与默认 demo
│   ├── api-contract.js        # 自有输入/响应与任务查询校验
│   ├── api-settings.js        # sessionStorage 配置与校验
│   ├── api-settings-ui.js     # 个人 API 配置面板
│   ├── api-adapter.js         # API 传输、超时、取消和错误归一化
│   ├── app.js                 # 原有本地模板生成器
│   ├── references.js          # 原有参考图模块
│   ├── catalog.js             # 分类和图标配置
│   ├── catalog-ui.js          # 素材库渲染、搜索和筛选
│   └── assets/                # 示例图标资源
├── lib/sensenova-proxy.mjs    # 受限转发与白名单校验
├── functions/                # Cloudflare Pages Functions（仓库根目录，部署时不放入 public/）
├── scripts/check-catalog.cjs  # 配置、路径和资源检查
├── scripts/test-api-settings.cjs # API 配置设置测试
├── scripts/test-api-errors.cjs # API 错误归一化测试
├── scripts/test-api-ui.py     # API UI/传输自动化测试
├── scripts/test-api-errors-ui.py # API 错误提示 UI 测试
├── 添加分类与图标.md           # 分类扩展教程
├── API_INTEGRATION.md          # API 请求/响应契约
├── DEPLOY_CLOUDFLARE.md       # 发布说明
└── README.md
```

## 检查与发布

```bash
node scripts/check-catalog.cjs
node scripts/test-api.cjs
node scripts/test-api-settings.cjs
node scripts/test-api-errors.cjs
node scripts/test-sensenova-proxy.cjs
# 以下浏览器测试需先启动静态服务器（默认 4206 端口）
python3 scripts/test-sensenova-ui.py
python3 scripts/test-api-ui.py
python3 scripts/test-api-errors-ui.py
# 另开终端运行静态服务器后，可选执行完整浏览器回归：
# python3 -m http.server 4206 --directory public
# python3 scripts/test-flow.py  # 需要 Playwright + Chromium
```

上述 API 自动化测试验证配置、请求传输与错误边界，不代表使用真实供应商完成推理。通过检查后，按 [部署说明](./DEPLOY_CLOUDFLARE.md) 发布。GitHub 提交不等于临时预览自动更新。

## 隐私与仓库

此仓库为公开仓库，源代码和发布后的站点文件都可被公众查看。部署到 Pages 时只把 `public/` 作为静态输出目录，不要把仓库根目录当作站点资源目录；不要提交密钥、个人信息或无权公开的素材。源码仓库：<https://github.com/sincalaway/graphic-site>。部署状态以实际发布环境为准；发布或更新网站请按 [部署说明](./DEPLOY_CLOUDFLARE.md) 操作。

诊断离线回归：`node scripts/test-sensenova-models.cjs`；启动静态服务器后运行 `GRAPHIC_TEST_URL=http://127.0.0.1:4210/ python3 scripts/test-sensenova-diagnostics.py`。全部使用 mock，不读取真实 key 或连接供应商。

本站同源代理请求使用 `credentials: same-origin`，让 Cloudflare 安全验证 cookie 能随本站请求发送；高级跨域直连仍使用 `omit`。Worker 仅显式转发 Authorization/Accept（图像请求另含必要 Content-Type），不向 SenseNova 转发浏览器 cookie。若 403 标记 `cf-mitigated: challenge` 或返回 HTML，UI 显示「本站前置安全验证」，不把它误判为上游拒绝，不显示原始正文。
