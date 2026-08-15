# Task 3 完成报告

## RED

- 先更新健康检查、配置加载夹具和供应商工厂接缝测试；未修改应用代码即运行：
  `npm test -- tests/server/health.test.ts tests/server/static.test.ts tests/server/env.test.ts tests/server/generate.test.ts`。
- 受限沙箱首次禁止 Supertest 监听回环端口（`listen EPERM`）；在获准本机回环监听后重跑，35 项中 32 项通过、3 项按预期失败：旧健康响应仍为 `minimaxConfigured`，且第三个 `providerFactory` 参数尚未被调用。

## GREEN

- `createApp(environment, clientDirectory, providerFactory?)` 默认注入 `createWanProvider`，健康接口改为 `{ ok: true, aiConfigured, provider: 'wan2.7' }`。
- 已保留可选工厂接缝：集成测试用已签名 JPEG 假 Provider 验证 Wan 三项配置进入工厂，健康和生成响应都不包含测试密钥。
- 同一聚焦命令重跑后：4 个文件、35 项测试全部通过。

## 环境、文档与 E2E

- `.env.example` 使用 `DASHSCOPE_API_KEY`、北京公共 `WAN_API_URL`、`wan2.7-image-pro` 和 `PORT`。
- README 说明同步 Wan、北京地域 Key、单次 2K 单图计费、仅服务端 Data URL 传输与几何结构不保证。
- E2E 首个场景改为供应商中立命名，未改变真实未配置 503 的流程。

## 完整验证

- `npm run typecheck`：通过。
- `npm test`：18 个测试文件、141 项测试通过。
- `npm run build`：通过。
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`：4 个场景通过。
- `git diff --check`：通过。

## 自检与疑虑

- 未读取、输出或修改 `.env`，也未发起付费 Wan 请求；配置接缝测试使用内存 Provider，E2E 走未配置 503。
- 接口成功体与 multipart 边界保持原样；健康检查只暴露配置布尔值和固定 Provider 标识。
- 疑虑：README 的计费描述只说明“2K 单图规则”，未写死价格；实际金额应以百炼控制台当日定价为准。

## 提交

- 本报告随 `feat: wire wan provider into qiju` 提交；最终提交标识以 `git log --oneline -1` 为准。
