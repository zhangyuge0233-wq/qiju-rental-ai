# 栖居 MiniMax Provider 对接设计

## 目标

将现有固定返回 `MINIMAX_NOT_CONFIGURED` 的 Provider 替换为真实 MiniMax 图片生成请求，让用户可用已配置的 API Key 试跑预设风格房间重绘。该能力标记为实验性：MiniMax 官方图生图只支持 `character` 人物主体参考，不能承诺保持房间硬装结构。

## 范围

- 服务端读取现有 `MINIMAX_API_KEY` 与 `MINIMAX_API_URL`，密钥不进入浏览器、日志或响应。
- 使用 `image-01`、`response_format: base64`、`n: 1`。
- 将房间照片编码为完整 Data URL，放入唯一的 `subject_reference`。
- 将预设风格和“保留硬装结构”约束组成中文 prompt。
- 解码 MiniMax 返回的首张 Base64 图片，并按真实文件签名识别 JPEG、PNG 或 WebP。
- 网络失败、非 2xx、MiniMax 业务错误、空结果或坏图片统一映射为 `UPSTREAM_ERROR`。
- 未配置 Key 或 URL 继续返回 `MINIMAX_NOT_CONFIGURED`。

## MiniMax 限制

- 房间照片会实验性地传给只支持人物主体的 `subject_reference`；结果可能不保留结构。
- 官方单次只允许一张主体参考图，因此本轮始终优先传房间照片；用户额外上传的风格参考图不能同时传给 MiniMax。
- 先用预设风格验证链路。仅上传参考图时不伪造“已参考该图片”的提示词，返回稳定的上游失败提示。
- MiniMax Data URL 输入仅支持 JPG/JPEG/PNG 且小于 10 MB；WebP 房间图需在接入边界明确拒绝或转换。本轮采用拒绝并映射为稳定错误，避免服务端重新编码引入额外图像依赖。

## 结构与数据流

1. `createApp` 将服务端配置传给 `createMiniMaxProvider`。
2. Provider 校验配置、预设风格和输入图片限制。
3. Provider 通过可注入的 `fetch` 发起 JSON POST，请求设置 Bearer 鉴权和超时。
4. Provider 校验 HTTP 状态、`base_resp.status_code`、Base64 内容和图片签名。
5. 现有 `/api/generate` 将 Provider 输出转换为统一前端成功响应；现有前端继续负责解码、展示和写入历史。

## 测试与验收

- Provider 单测覆盖：未配置、请求头、请求体、Data URL、提示词、成功解码、MiniMax 业务失败、HTTP/网络失败、坏 Base64、坏图片、超限与不支持格式。
- 路由测试覆盖：配置确实进入 Provider，未配置行为保持不变。
- 运行全量测试、类型检查、构建和真实服务健康检查。
- 真实生成会产生费用，只在用户已明确要求试用时执行一次；不打印密钥或完整请求体。

