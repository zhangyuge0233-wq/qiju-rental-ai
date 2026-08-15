# Task 1 Report: Supplier-Neutral Configuration and Error Contract

## RED

Command:

```sh
npm test -- tests/unit/generation-contract.test.ts tests/unit/generation-api.test.ts tests/unit/use-generation.test.tsx tests/server/config.test.ts
```

Result before implementation: 4 test files failed, with 6 failed and 26 passed tests. Expected failures proved that `AI_NOT_CONFIGURED` was not decoded or mapped, and that WAN configuration defaults, trimming, and legacy MiniMax-variable isolation did not exist.

## Files changed

- `shared/generation.ts`
- `server/config.ts`
- `server/routes/generate.ts`
- `src/services/generation-api.ts`
- `tests/unit/generation-contract.test.ts`
- `tests/unit/generation-api.test.ts`
- `tests/unit/use-generation.test.tsx`
- `tests/server/config.test.ts`
- `tests/server/generate.test.ts`
- `server/app.ts`
- `server/providers/minimax.ts`

The final two production files and the server route test were minimal follow-up exceptions explicitly authorized by the task owner: the existing names otherwise prevented type checking or asserted the removed contract.

## GREEN and type checking

Commands:

```sh
npm test -- tests/unit/generation-contract.test.ts tests/unit/generation-api.test.ts tests/unit/use-generation.test.tsx tests/server/config.test.ts
npm run typecheck
npm test
```

Results: focused tests passed 32/32; type checking passed; full test suite passed 127/127. The full suite was run outside the sandbox because Supertest requires a temporary local listening port.

## Self-review findings

- `GenerationErrorCode` and client decoding use only `AI_NOT_CONFIGURED` for the unavailable-AI case.
- `createServerConfig` trims `DASHSCOPE_API_KEY`, `WAN_API_URL`, and `WAN_MODEL`; it defaults the URL and model exactly as specified and does not read MiniMax variables.
- The route maps `AI_NOT_CONFIGURED` to HTTP 503 and continues using the shared user-safe message map.
- No API key values were read, logged, returned, or committed.

## Commit hash

`9a1e07bcea5e99a4dda1f3ed061e9ecb0d857155` — `refactor: make ai configuration provider neutral`

## Concerns

None.
