# 栖居租房 AI

面向租房场景的移动端房间软装改造原型。上传房间照片后，可选择预设风格或添加风格参考图；生成成功的方案仅保存到当前浏览器的 IndexedDB 历史记录中。

## 环境配置

复制 `.env.example` 为 `.env` 后按需填写：

- `DASHSCOPE_API_KEY`：阿里云百炼华北 2（北京）地域的 API Key。
- `WAN_API_URL`：万相同步图像编辑接口；默认是北京公共地址，也可填写业务空间专属地址。
- `WAN_MODEL`：万相模型，默认 `wan2.7-image-pro`。
- `PORT`：Express 服务端口，默认 `3000`。

服务端通过万相 `wan2.7-image-pro` 同步图像编辑接口生成；提交一次即请求一张 2K 图，按该模型的 2K 单图规则计费。请使用北京地域 Key 并以百炼控制台的当前计费说明为准。

房间图与可选参考图仅在服务端编码为 Data URL 后传给万相，不会发送到浏览器以外的其他前端服务，也不会写入服务端历史。提示词会要求保留墙体、门窗、地板、吊顶、透视和机位，但生成结果不保证几何结构准确；不能用于施工尺寸、验房或安全决策。

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
