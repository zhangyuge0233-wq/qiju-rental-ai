# 栖居租房 AI

面向租房场景的移动端房间软装改造原型。上传房间照片后，可选择预设风格或添加风格参考图；生成成功的方案仅保存到当前浏览器的 IndexedDB 历史记录中。

## 环境配置

复制 `.env.example` 为 `.env` 后按需填写：

- `MINIMAX_API_KEY`：MiniMax API Key，由你自行填写。
- `MINIMAX_API_URL`：MiniMax 图像生成接口，默认 `https://api.minimaxi.com/v1/image_generation`。
- `MINIMAX_MODEL`：MiniMax 图像生成模型，默认 `image-01`。
- `PORT`：Express 服务端口，默认 `3000`。

服务端通过 MiniMax 生成一张新房间效果图；以 MiniMax 控制台的当前计费说明为准。每次点击「生成」都会向 MiniMax 发起外部请求，可能产生使用费用。

房间图与可选风格参考图会保留在本地产品流程中，用于浏览器展示、输入校验和历史记录；它们不会发送给 MiniMax。MiniMax 只接收文本提示词，因此结果是一张新生成的房间图，不是对上传房间照片的编辑，也不保证结构或空间细节得到保留；不能用于施工尺寸、验房或安全决策。

## 启动

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动 Vite 前端（默认 `http://127.0.0.1:5173`）和 Express API（默认 `http://127.0.0.1:3000`）；Vite 会将 `/api` 请求代理给 Express。请用手机浏览器的设备模拟模式或窄屏窗口访问前端地址，上传 JPG、PNG 或 WebP 房间照片后选择风格并提交。

生产启动：

```bash
npm run build
npm run start
```

构建后，`npm run start` 会由 Express 同时提供 `dist` 前端静态页面和 `/api` 接口，访问 `http://127.0.0.1:3000`。

## 本地历史边界

历史记录保存在浏览器当前设备、当前浏览器配置文件的 IndexedDB 中；不会同步到其他浏览器、手机或账号。清除站点数据、使用无痕窗口或更换浏览器后，历史记录可能不可用。

## 免费生成次数

第一版不接登录和支付。每个浏览器默认有 3 次免费生成额度，只有 AI 成功返回效果图后才扣除 1 次；失败请求不会扣除。额度保存在当前浏览器的 localStorage 中，清除站点数据或更换浏览器后会重新开始计算。这是 MVP 的轻量限制，不等同于账号级配额。

## 验证命令

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`test:e2e` 使用真实本地 Vite、Express 和未配置 AI Provider 的 `503`，只覆盖错误提示、输入保留、空历史导航和移动端布局；不会 mock 出成功生成结果。Playwright 始终以无头模式运行。

首次运行 E2E，请先安装默认的 Playwright Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

默认配置使用 Playwright Chromium，适合标准 CI。若本机已安装 Chrome、但尚未下载 Playwright Chromium，可仅在本机临时指定通道：

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```
