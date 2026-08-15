# MiniMax 最终修复报告

## 提交

- 修复提交：`8908071 fix: bound minimax upstream responses`

## Finding 修复映射

| Finding | 修复 | 回归验证 |
| --- | --- | --- |
| Important `server/providers/minimax.ts:118` | 不再使用无上限的 `response.json()`；先拒绝并取消 `Content-Length` 超过 25 MiB 的响应，再流式累计字节，超过 25 MiB 立即取消 reader。Base64 解码后也拒绝超过 25 MiB 的图片。120 秒 AbortController 超时和统一 `UPSTREAM_ERROR` 保持不变。 | 声明长度超限和真实流累计超限均断言响应体被取消且公开错误为 `UPSTREAM_ERROR`。 |
| Minor `tests/server/minimax-provider.test.ts:106` | 新增直接网络拒绝、畸形 JSON，以及含 API Key、私密路径和上游文本的异常测试。 | 公开错误仅为 `GenerationProviderError(UPSTREAM_ERROR)`，`message`、`stack` 与 JSON 序列化均不含敏感文本。 |
| Minor `docs/superpowers/specs/2026-08-15-wan27-provider-design.md:5` | 文首和决策段都标明该 Wan 设计已废弃，当前以 `2026-08-15-minimax-provider-design.md` 为准。 | 文档人工复核。 |

## RED → GREEN 证据

### RED

命令：

```bash
npm test -- tests/server/minimax-provider.test.ts
```

结果：17 个测试中 2 个按预期失败。声明 `Content-Length` 超过 25 MiB 和流累计超过 25 MiB 两项都显示 `cancel` 调用次数为 0，证明原实现完整读取了响应，未取消超限体。

### GREEN

命令：

```bash
npm test -- tests/server/minimax-provider.test.ts
```

结果：19/19 通过。两项大小限制测试和 3 项异常脱敏边界均通过。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/server/minimax-provider.test.ts --coverage` | 未执行覆盖率报告：项目缺少 `@vitest/coverage-v8`，未为本轮修复改动依赖清单。 |
| `npm run typecheck:server` | 通过。 |
| `npm run typecheck` | 通过。 |
| `npm test` | 受限沙箱中因 Supertest 本地监听 `EPERM` 失败；获授权重跑后 18 个文件、154/154 测试通过。 |
| `npm run build` | 通过：Vite 构建和 server TypeScript 编译完成。 |
| `git diff --check` | 通过。 |

## 疑虑

唯一验证缺口是覆盖率报告依赖未安装；所有可运行的专项、类型、全量和构建验证均已通过。
