# Graphic：全流程 Logo 创作与图标素材库

Graphic 是一个**纯前端、本地优先**的网站。默认进入 Logo 创作，保留原有图标素材库、参考图和作品管理功能；默认使用本地 demo，不会自动调用模型、上传数据或扣费。现在也可以从页面配置受支持的真实 API，但这是浏览器直连：只有你明确保存配置并首次点击生成/编辑时才会发请求。

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

1. 打开 **配置 API**，选择协议，填写服务地址、模型和协议所需路径；`openai-images` 还必须填写 key。
2. 阅读安全提示并勾选确认（只有随后点击生成/编辑，key、提示词和使用的图片才会发送给所选服务，可能计费）。
3. 点 **保存配置**。这一步只做本地格式校验和保存，不测试、不收费、不发请求。
4. 回到工具填写提示词/参考图，第一次点 **生成** 或 **编辑** 才会请求服务。失败不会默默回退 demo，也不会自动重试。
5. 不再使用时点 **清除配置**；配置会清空并回到 demo。

配置只放在当前标签页的 `sessionStorage`：刷新通常保留，关闭标签页通常清除；浏览器的“恢复标签页”或复制标签页可能恢复或复制会话数据，因此不要把它当作密钥保险箱。key 仍能被页面脚本、浏览器扩展或 XSS 读取。建议使用低额度、短期 key，或使用自己的后端代理；绝不要把 key 写入源文件、作品、日志或仓库。

支持的协议、请求/响应 JSON、地址限制、CORS 和费用边界见 **[API_INTEGRATION.md](./API_INTEGRATION.md)**。没有真实 key，本项目不声称已完成真实推理；自动化测试只验证配置与传输行为。

## 本地数据与演示边界

作品和草稿使用当前浏览器的 `localStorage`；作品最多保留 60 条。参考图仍按旧模块规则处理（PNG/JPG/WebP、单张不超过 8 MB、最多 5 张），不会上传服务器或加入图标素材库，除非你主动保存 API 配置并发起真实请求。更换网址（包括从旧网址换到新临时地址）、设备或清除站点数据时，`localStorage` 不会同步，需重新添加或下载备份。

账号只是本地演示会话，请勿输入真实密码或个人信息。默认 demo 不提供语义理解、真实 AI 生成或真实矢量描摹；API 直连是否成功取决于你填写的服务及其能力，不代表本项目提供模型或后端。

## 旧 API 模式与代码边界

仍保留 `public/api-config.js` 的旧静态**同源 `remote` 模式**，供高级用户接入自有后端；它与现在的页面配置 UI 是两条路径。旧模式中的密钥不应放进静态文件，UI 模式优先，详细区别和兼容字段见 API 文档。

`public/api-config.js`、`public/api-contract.js` 和 `public/api-adapter.js` 负责配置、契约与传输；demo 默认不发网络请求。UI 支持 `graphic-json`（自有 POST JSON）与 `openai-images`（OpenAI 兼容 Images 协议，非任意供应商协议）。

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

打开 <http://localhost:8000>，停止服务器按 `Ctrl+C`。发布时**只上传 `public/` 的内容**，不要上传整个仓库。若要浏览器直连真实服务，发布站点和服务端需按文档配置 HTTPS/CORS。

## 文件结构

```text
graphic-site/
├── public/                   # 唯一公开发布目录
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
├── scripts/check-catalog.cjs  # 配置、路径和资源检查
├── scripts/test-api-settings.cjs # API 配置设置测试
├── scripts/test-api-ui.py     # API UI/传输自动化测试
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
python3 scripts/test-api-ui.py
# 另开终端运行静态服务器后，可选执行完整浏览器回归：
# python3 -m http.server 4206 --directory public
# python3 scripts/test-flow.py  # 需要 Playwright + Chromium
```

上述 API 自动化测试验证配置、请求传输与错误边界，不代表使用真实供应商完成推理。通过检查后，按 [部署说明](./DEPLOY_CLOUDFLARE.md) 发布。GitHub 提交不等于临时预览自动更新。

## 隐私与仓库

发布后的 `public/` 文件可被持有公开链接的人查看；仓库私有不代表网站内容私有。不要把密钥、个人信息或无权公开的图标放进 `public/`。源码仓库：<https://github.com/sincalaway/graphic-site>（私有，需要授权）。本次变更仅涉及 GitHub 仓库文档，没有部署网站。
