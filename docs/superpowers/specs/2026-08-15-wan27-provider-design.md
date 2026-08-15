# 栖居万相 2.7 房间编辑接入设计

> 已废弃：本设计已被 `2026-08-15-minimax-provider-design.md` 取代。

## 决策

本文为历史设计记录；当前供应商接入以 `2026-08-15-minimax-provider-design.md` 为准。

## 目标

用户上传房间照片，选择预设风格或添加风格参考图后，服务端调用万相 2.7 生成一张 2K 房间改造图。提示词要求保持墙体、门窗、地板、吊顶、透视和相机机位，仅修改家具、灯光与软装。生成式编辑不能保证结构绝对不变，产品不作绝对承诺。

## 配置

- `DASHSCOPE_API_KEY`：阿里云百炼华北 2（北京）API Key。
- `WAN_API_URL`：可选。默认使用现有北京公共域名 `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`；生产环境可替换为业务空间专属域名。
- `WAN_MODEL`：可选，默认 `wan2.7-image-pro`。
- Key 仅由服务端读取，不进入浏览器、日志、错误响应或提交记录。

## 请求设计

- 使用同步 REST JSON 请求与 Bearer 鉴权。
- `input.messages` 只含一个 `user` 消息。
- 若有风格参考图，先传参考图；房间原图始终最后传，以继承房间原图比例。
- 图片以完整 `data:<mime>;base64,<data>` 传入，不上传至公开存储。
- 文本指令明确图 1、图 2 的职责，避免模型混淆参考图与待编辑房间。
- 参数固定为 `size: "2K"`、`n: 1`、`watermark: false`；编辑场景不传 `thinking_mode` 或 `negative_prompt`。

## 输入边界

- 沿用前端与路由的 JPG、PNG、WebP 支持；每张不超过 15 MB，因此满足万相单图 20 MB 上限。
- 由现有图片预处理保证实际图片可解码；Provider 仍验证 MIME 与非空字节。
- 预设风格仍限定为现有六种；参考图可与预设风格同时存在。
- 生成请求最多传两张图，低于万相 0 至 9 张限制。

## 响应与错误

- 从 `output.choices[].message.content[]` 读取首个 `type: "image"` 的 URL。
- 结果 URL 仅有效 24 小时，服务端必须立即下载为 Blob 字节后再返回前端，历史记录不保存临时 URL。
- 校验下载响应、大小和 PNG/JPEG/WebP 文件签名，再映射到统一 `GeneratedImage`。
- 未配置 Key 返回 `MINIMAX_NOT_CONFIGURED` 的旧错误码会改为通用的 `AI_NOT_CONFIGURED`；前端展示“AI 服务尚未配置”。
- HTTP 失败、顶层 `code`、缺失结果、下载失败、超时或坏图统一映射为 `UPSTREAM_ERROR`，不向前端泄露上游详情。

## 代码边界

1. 将 Provider 文件与工厂从 MiniMax 命名迁移为 Wan，保留统一 `GenerationProvider` 接口。
2. `createApp` 将 `ServerConfig` 注入 Wan Provider；`/api/health` 返回供应商中立的 `aiConfigured`。
3. 前端继续只调用 `/api/generate`，页面状态、历史结构与下载流程不改。
4. `.env.example` 与 README 改为万相配置，现有本地 MiniMax 变量不再读取但不自动删除。

## 测试与验收

- TDD 覆盖：配置注入、单图/双图顺序、Data URL、风格提示词、鉴权、固定参数、成功 URL 解析与立即下载。
- 覆盖未配置、HTTP/业务错误、超时、空结果、坏图片、下载失败与响应脱敏。
- 更新现有路由、健康检查和 E2E 对未配置状态的断言。
- 运行专项测试、全量测试、类型检查、构建和真实本地服务健康检查。
- 真实生成会产生费用；只有在 Key 已填入且用户明确要求试跑时执行一次，不打印 Key 或完整请求体。
