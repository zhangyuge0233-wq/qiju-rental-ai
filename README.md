# 栖居租房 AI

面向租房场景的移动端房间软装改造原型。上传房间照片后，可选择预设风格或添加风格参考图；生成成功的方案仅保存到当前浏览器的 IndexedDB 历史记录中。

## 环境配置

复制 `.env.example` 为 `.env` 后按需填写：

- `MINIMAX_API_KEY`：MiniMax 服务密钥。
- `MINIMAX_API_URL`：MiniMax 图片生成接口地址。
- `PORT`：Express 服务端口，默认 `3000`。

当前版本的 `server/providers/minimax.ts` 只保留接口边界，尚未接入正式 MiniMax 调用。即使填写环境变量，也会返回真实的 `503` 响应和“AI 服务尚未配置，请稍后再试”；不会伪造生成图片、清空已上传图片，或写入历史记录。正式接口资料到位后，只需替换该 Provider 并补充服务端测试。

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

`test:e2e` 使用真实本地 Vite、Express 和未配置的 MiniMax `503`，只覆盖错误提示、输入保留、空历史导航和移动端布局；不会 mock 出成功生成结果。Playwright 始终以无头模式运行。

首次运行 E2E，请先安装默认的 Playwright Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

默认配置使用 Playwright Chromium，适合标准 CI。若本机已安装 Chrome、但尚未下载 Playwright Chromium，可仅在本机临时指定通道：

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```
