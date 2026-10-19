# Cloudflare Pages 发布说明

本文只描述**文档流程**，本次不登录、不部署、不真实调用 SenseNova。用户明确授权后才可执行发布。

## 1. 发布边界与目录

站点静态资源输出目录是仓库根的 `public/`；Cloudflare Pages Functions 位于仓库根的 `functions/`，**不在 `public/` 内**。不要把整个仓库当静态资源公开，也不要把 `functions/` 复制进 `public/`。

SenseNova 专用模式 `protocol='sensenova-proxy'` 依赖同源 Pages Function。它只把 `/api/sensenova/images/generations` 与 `/api/sensenova/images/edits` 转发到固定的 `https://token.sensenova.cn/v1` 两路径；不需要服务器 SenseNova secret 或 environment binding，key 由用户当前页面输入并透传。Function 必须遵守 API 文档的静态错误、无日志/回显、禁止重定向和无重试边界。

仓库已提供 `public/_routes.json`，将 Function 调用范围限制为 `/api/sensenova/*`。不要把它误解为静态资源路由；最终以 Cloudflare Pages 路由规则核实为准。

## 2. 本地预览：区分静态 Python 与 Functions

仅看静态页面时，在仓库根运行：

```bash
python3 -m http.server 8000 --directory public
```

这只是静态 Python 预览，**不会执行或验证 `functions/`**，因此不能用来验证 `sensenova-proxy`。

要预览 Pages Functions，在仓库根运行（不是在 `public/` 中）：

```bash
npx wrangler pages dev public --compatibility-date=2026-06-24
```

本次使用 Wrangler 4.102.0 完成离线编译及本地运行时拒绝检查；显式兼容日期避免旧工具将系统当前日期当成尚不支持的运行时版本。可使用受支持的新版 Wrangler，但升级工具不等于自动部署。

该命令是 Cloudflare Pages 本地开发入口，不需要供应商 key 或 Cloudflare 登录即可做本地拒绝边界检查。注意：带有效 key 的请求即使在本地也会转发至真实上游并可能计费；本任务只运行 mock 测试和无 key 的拒绝检查。

## 3. Cloudflare Pages Git 配置

在 Cloudflare Pages 绑定已确认的 GitHub 仓库后，配置如下：

| 配置 | 值 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `exit 0`（静态站点无需构建） |
| Build output directory | `public` |
| Root directory | 留空，保持仓库根目录 |

仓库根目录必须保持为空配置；不要把 Root directory 改为 `public`，否则根目录的 `functions/` 不会按预期纳入 Pages Functions 部署。Dashboard 的 drag-and-drop 只上传静态 `public` 内容，**不会编译或部署 `functions/`**。

## 4. Direct Upload / Wrangler（仅文档，不执行）

先安装 Node.js（建议受当前 Wrangler 支持的 LTS 版本）。使用 `npx wrangler login` 完成 Cloudflare 授权。若尚未有 Pages 项目，用 `npx wrangler pages project create` 按提示创建并确认项目名及 production branch `main`；已有项目不要重复创建。然后在仓库根运行：

```bash
npx wrangler pages deploy public --project-name <confirmed> --branch main
```

这里的 `<confirmed>` 必须替换为已确认的真实 Pages project name；本次不猜测、不执行。从仓库根运行此命令时，Wrangler 会发现并编译根目录的 `functions/`，连同 `public/` 静态资源发布到指定 Pages 项目；Function 源码不会作为静态资源公开。确认 CLI 输出包括 Functions 编译成功和部署 URL。不要从 `public/` 目录执行命令，也不要用 dashboard 拖放替代。

旧命令：

```bash
wrangler deploy --temporary --assets ...
```

不会部署这些 Cloudflare Pages Functions，不得作为本项目专用模式的发布命令。

## 5. Git 集成、`[skip ci]` 与发布声明

本项目使用 GitHub Actions/Pages 时，未来用于文档或代码提交的 commit 可使用前缀：

```text
[skip ci] docs: ...
```

该前缀按 Cloudflare Pages 官方 Git 集成规则跳过自动部署，也用于跳过常规 GitHub Actions push / pull_request 工作流；其他自定义外部 webhook 不应仅靠此标记保证。**带 `[skip ci]` 的 commit 不能声称网站已更新**；跳过后如需真正发布，必须由维护者手动部署，或再提交一个不带 `[skip ci]` 的 commit 并确认构建完成。Git 提交本身也不等于临时预览已更新。

官方参考：

- [Pages Functions getting started](https://developers.cloudflare.com/pages/functions/get-started/)
- [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)

## 6. 发布前检查与发布后最小验证

发布前运行 `node scripts/test-sensenova-proxy.cjs`（完全离线 mock）及 README 的现有检查；本地浏览器测试启动静态服务器后执行 `python3 scripts/test-sensenova-ui.py`。Wrangler 仅编译验证可运行 `npx wrangler pages functions build --outdir /tmp/graphic-functions-build`，不会部署。用户授权后才可执行发布。

部署完成后，仅做不产生生成费用的最小检查：

1. 无 key 的 `GET /api/sensenova/...` 不应生成；
2. 无 `Authorization` 的 `POST` 不应生成；
3. 仅确认返回静态错误 `error.code` 与 HTTP 状态，不应出现上游错误正文、key 或重定向。

上述检查只能证明拒绝边界/路由存在，**不能证明模型可用或成功生成**。不要在未获授权时输入 key、调用上游或发布。

## 7. 重要限制

SenseNova 专用模式在本项目限制 `n=1..4`（不是供应商能力承诺）；单图不超过 8 MiB、最多 6 张 PNG/JPEG/WebP，整个请求不超过 20 MiB。无重试、无重定向；取消或超时仍可能计费。站点默认仍是本地 demo，浏览器直连的 `graphic-json` 与 `openai-images` 资料保留且不应与专用模式混淆。
