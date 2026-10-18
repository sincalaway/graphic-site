# Graphic 静态前端演示

这是一个无需后端的中文品牌视觉交互演示页面。它在浏览器中提供 Logo、App Icon、手稿转 Logo、效果图和图片转 SVG 等入口；生成结果是预定义的本地 SVG 模板预览，不是在线 AI 服务。

> **重要说明**：项目没有真实 AI/API key、后端接口、登录、支付或积分服务。界面中的“智能”“AI 配色”和“积分/张”等文字仅用于还原演示界面，不会调用模型、扣费或上传内容。

## 功能概览

- 选择 10 种预置视觉风格，并填写品牌名称、副标题、主题和补充描述。
- 切换浅色/深色主题。
- 在浏览器本地选择或粘贴 PNG、JPG、WebP 图片，作为参考图、手稿或 Logo 预览。
- 用浏览器内置 JavaScript 生成预定义 SVG 模板，并可下载 SVG。
- “图片转 SVG”只生成一个包含原图的 SVG 图片容器；**不进行真正的矢量路径描摹**。
- 生成的作品和主题偏好保存在当前浏览器的 `localStorage` 中，最多保留 12 个作品。

## 本地运行

项目没有 `package.json`、依赖安装步骤或构建脚本。可以直接双击 `index.html`，但推荐通过本地静态服务器访问，以获得更一致的资源和浏览器存储行为：

源码仓库：<https://github.com/sincalaway/graphic-site>（当前为私有仓库，访问和克隆前需要获得仓库授权）。授权后可使用：

```bash
git clone https://github.com/sincalaway/graphic-site.git
cd graphic-site
```

在已进入的项目目录运行：

```bash
python3 -m http.server 8000
```

然后打开 <http://localhost:8000>。

停止服务器：在运行服务器的终端按 `Ctrl+C`。

## 目录与文件

```text
graphic-site/
├── index.html       # 页面结构、文案、图片选择器与脚本引用
├── style.css        # 页面样式、布局、响应式与主题样式
├── app.js           # 本地交互、SVG 模板、图片读取、下载和 localStorage
├── assets/
│   ├── style-0.png
│   ├── ...
│   └── style-9.png # 十张风格示例图
├── README.md        # 项目说明
└── DEPLOY_CLOUDFLARE.md # Cloudflare Pages 部署说明
```

部署时请保留 `index.html` 在发布目录的顶层，并一起上传 `style.css`、`app.js` 和 `assets/`。不要只上传 HTML 文件，否则样式、脚本或风格图片会缺失。

## 数据、隐私与安全

- **无真实 AI 或远程 API**：源码没有读取 API key、环境变量或后端服务；浏览器不会因为点击生成而访问模型服务。
- **本地图片处理**：上传图片通过浏览器 `FileReader` 读取为 Data URL，仅用于当前页面预览和导出的 SVG；源码没有把图片发送到服务器的上传请求。单张图片限制为 8 MB，参考图最多 5 张。
- **本地存储**：作品使用 `localStorage` 键 `yeelogo-demo-works` 保存，主题使用 `yeelogo-demo-theme` 保存。数据属于当前浏览器和当前站点来源；清除站点数据、换浏览器或隐私模式可能使其消失。
- **下载文件**：下载 SVG 是在浏览器中创建文件，不代表作品已上传到云端。
- **未来接入服务的安全边界**：若以后接入 AI 或其他业务 API，应由受保护的后端读取密钥（例如 `MODEL_API_KEY`），不要把真实密钥写进 HTML、JavaScript、图片、公开仓库或前端环境变量。当前部署不需要配置任何密钥。
- **内容边界**：这是独立的前端复刻演示，不代表原产品，也不提供账号、密码、支付、积分或版权审核服务。请勿上传不应保存在浏览器中的敏感图片或个人信息。

## 已知限制

- 生成器是本地预定义图形模板，不理解自然语言，也不会生成新的 AI 图像或品牌策略。
- “手稿转 Logo”和“效果图”只做本地图片预览/嵌入；“图片转 SVG”不执行像素到矢量路径的描摹。
- `localStorage` 容量受浏览器限制；图片较大时可能无法保存作品，即使预览或下载仍可能成功。
- 作品只在当前浏览器中保存，不提供跨设备同步、云端备份或协作。
- 该项目是静态站点，不包含服务器端路由、数据库、用户鉴权或管理后台。

## Cloudflare Pages 部署

推荐先阅读同目录的 [DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md)。其中包含：

- Git 集成部署（GitHub/GitLab）；
- 无框架项目的构建命令和输出目录填写方式；
- 直接上传（拖放或 Wrangler）备选方案；
- `*.pages.dev` 地址、自定义域名和后续更新；
- 常见部署检查项与项目限制。

本项目不需要在 Cloudflare Pages 中配置环境变量或 API key。部署前只需确认发布目录中存在顶层 `index.html` 和全部静态资源。

## 官方参考链接

- [Cloudflare Pages：静态 HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [Cloudflare Pages：Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages：构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages：直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages：自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)

仓库地址：<https://github.com/sincalaway/graphic-site>（私有仓库，需先获得访问授权）。
