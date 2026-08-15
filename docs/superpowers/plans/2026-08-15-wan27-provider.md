# Wan 2.7 Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unavailable MiniMax boundary with a real, server-only Wan 2.7 image-editing provider while preserving the existing mobile UI and local-history flow.

**Architecture:** Express keeps the stable `/api/generate` multipart boundary and injects a configured `GenerationProvider`. The new Wan provider converts private image buffers to Data URLs, performs one synchronous `wan2.7-image-pro` request, immediately downloads the 24-hour result URL, validates its image signature, and returns bytes to the existing route.

**Tech Stack:** TypeScript, Express 5, Node `fetch`, Vitest, Supertest, Playwright, Vite/React.

## Global Constraints

- Use the Beijing-region `wan2.7-image-pro` synchronous image-editing API.
- Never send API keys to the browser, logs, error responses, or commits.
- Use `size: "2K"`, `n: 1`, and `watermark: false`.
- When a style reference exists, send it before the room image; always send the room image last.
- Preserve the existing frontend request, result, history, and download contracts.
- Map provider failures to stable local error codes; never surface upstream details.
- Implement every behavior with a failing test first.

---

### Task 1: Supplier-Neutral Configuration and Error Contract

**Files:**
- Modify: `shared/generation.ts`
- Modify: `server/config.ts`
- Modify: `server/routes/generate.ts`
- Modify: `src/services/generation-api.ts`
- Modify: `tests/unit/generation-contract.test.ts`
- Modify: `tests/unit/generation-api.test.ts`
- Modify: `tests/unit/use-generation.test.tsx`
- Modify: `tests/server/config.test.ts`

**Interfaces:**
- Produces: `GenerationErrorCode` containing `AI_NOT_CONFIGURED`.
- Produces: `ServerConfig` with `dashscopeApiKey?: string`, `wanApiUrl: string`, and `wanModel: string`.
- Produces: `createServerConfig(environment)` defaults for Beijing public sync URL and `wan2.7-image-pro`.

- [ ] **Step 1: Write failing contract and config tests**

Add assertions equivalent to:

```ts
expect(generationErrorMessage('AI_NOT_CONFIGURED')).toBe('AI 服务尚未配置，请稍后再试');
expect(createServerConfig({})).toMatchObject({
  dashscopeApiKey: undefined,
  wanApiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  wanModel: 'wan2.7-image-pro',
});
expect(createServerConfig({
  DASHSCOPE_API_KEY: ' key ', WAN_API_URL: ' https://example.test/wan ', WAN_MODEL: ' custom-model ',
})).toMatchObject({
  dashscopeApiKey: 'key', wanApiUrl: 'https://example.test/wan', wanModel: 'custom-model',
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/unit/generation-contract.test.ts tests/unit/generation-api.test.ts tests/unit/use-generation.test.tsx tests/server/config.test.ts`

Expected: compile/assertion failures for missing `AI_NOT_CONFIGURED` and missing Wan config.

- [ ] **Step 3: Implement the minimal contract/config rename**

Replace `MINIMAX_NOT_CONFIGURED` with `AI_NOT_CONFIGURED` across the shared contract, API decoder, hook tests, and route 503 mapping. Extend `ServerConfig` and `createServerConfig` with the exact fields/defaults above; stop reading MiniMax variables.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/generation.ts server/config.ts server/routes/generate.ts src/services/generation-api.ts tests/unit tests/server/config.test.ts
git commit -m "refactor: make ai configuration provider neutral"
```

### Task 2: Wan Request Composition and Result Download

**Files:**
- Create: `server/providers/wan.ts`
- Create: `tests/server/wan-provider.test.ts`
- Delete: `server/providers/minimax.ts`

**Interfaces:**
- Consumes: `GenerationInput`, `GeneratedImage`, `GenerationProvider`, `GenerationProviderError`.
- Produces: `createWanProvider(config: Pick<ServerConfig, 'dashscopeApiKey' | 'wanApiUrl' | 'wanModel'>, fetchImpl?: typeof fetch): GenerationProvider`.
- Produces: `WanProvider.generate(input): Promise<GeneratedImage>`.

- [ ] **Step 1: Write failing request-composition tests**

Use an injected `fetchImpl` and assert the first call contains:

```ts
expect(url).toBe(config.wanApiUrl);
expect(init.headers).toMatchObject({
  Authorization: `Bearer ${config.dashscopeApiKey}`,
  'Content-Type': 'application/json',
});
expect(JSON.parse(String(init.body))).toEqual({
  model: 'wan2.7-image-pro',
  input: { messages: [{ role: 'user', content: [
    { image: 'data:image/jpeg;base64,/9j/' },
    { text: expect.stringContaining('保留墙体、门窗、地板、吊顶、透视和相机机位') },
  ] }] },
  parameters: { size: '2K', n: 1, watermark: false },
});
```

Add a second test proving reference Data URL precedes room Data URL and the prompt labels their roles.

- [ ] **Step 2: Run the provider test and verify RED**

Run: `npm test -- tests/server/wan-provider.test.ts`

Expected: module-not-found failure for `server/providers/wan.ts`.

- [ ] **Step 3: Implement request construction**

Implement small helpers in `wan.ts`:

```ts
const toDataUrl = (bytes: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${bytes.toString('base64')}`;

const content = referenceImage
  ? [{ image: referenceDataUrl }, { image: roomDataUrl }, { text: twoImagePrompt }]
  : [{ image: roomDataUrl }, { text: oneImagePrompt }];
```

If the key is absent, throw `new GenerationProviderError('AI_NOT_CONFIGURED')`. Use the configured URL/model and do not log request data.

- [ ] **Step 4: Run the request tests and verify GREEN**

Run the Step 2 command. Expected: request tests pass.

- [ ] **Step 5: Write failing response/error tests**

Cover:

```ts
// Success JSON -> second fetch downloads signed PNG -> returns bytes and image/png.
// HTTP non-2xx, top-level `code`, missing image URL, fetch rejection, download non-2xx,
// empty bytes, and invalid signature -> GenerationProviderError('UPSTREAM_ERROR').
```

Assert no thrown message contains the API key, upstream `message`, request body, or local paths.

- [ ] **Step 6: Run response/error tests and verify RED**

Run: `npm test -- tests/server/wan-provider.test.ts`

Expected: failures because response parsing/downloading is absent.

- [ ] **Step 7: Implement response parsing, timeout, download, and signature detection**

Read the first `output.choices[].message.content[]` item with `type === 'image'` and a valid HTTPS URL. Download it immediately with the same abort signal. Identify JPEG, PNG, or WebP by bytes; return `{ bytes, mimeType }`. Convert every provider-side failure to a fresh `GenerationProviderError('UPSTREAM_ERROR')`.

- [ ] **Step 8: Run provider tests and typecheck**

Run: `npm test -- tests/server/wan-provider.test.ts && npm run typecheck:server`

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add server/providers/wan.ts server/providers/minimax.ts tests/server/wan-provider.test.ts
git commit -m "feat: add wan 2.7 image editing provider"
```

### Task 3: Application Wiring, Health Contract, and Documentation

**Files:**
- Modify: `server/app.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/server/health.test.ts`
- Modify: `tests/server/static.test.ts`
- Modify: `tests/server/env.test.ts`
- Modify: `tests/server/generate.test.ts`
- Modify: `tests/e2e/mobile-flow.spec.ts`
- Modify: `tests/fixtures/server.env`

**Interfaces:**
- Consumes: `createWanProvider(config)` from Task 2.
- Produces: `createApp(environment, clientDirectory, providerFactory?)`, where `providerFactory(config: ServerConfig): GenerationProvider` defaults to `createWanProvider`.
- Produces: `/api/health -> { ok: true, aiConfigured: boolean, provider: 'wan2.7' }`.
- Preserves: `POST /api/generate` multipart form and success body.

- [ ] **Step 1: Write failing app integration and health tests**

Update assertions to require:

```ts
expect(health.body).toEqual({ ok: true, aiConfigured: false, provider: 'wan2.7' });
```

Add a configured-app test using the optional `providerFactory(config)` argument. Capture the received config, return a provider that produces a signed JPEG buffer, and assert the three Wan values reach the factory while `/api/health` and `/api/generate` never contain the key.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/server/health.test.ts tests/server/static.test.ts tests/server/env.test.ts tests/server/generate.test.ts`

Expected: old MiniMax health/provider assertions fail.

- [ ] **Step 3: Wire Wan Provider and update docs/config examples**

Change `createApp` to call `createWanProvider(config)`. Update `.env.example` to:

```env
DASHSCOPE_API_KEY=
WAN_API_URL=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
WAN_MODEL=wan2.7-image-pro
PORT=
```

Document synchronous Wan usage, Beijing-key requirement, 2K/one-image pricing behavior, private Data URL transmission, and the fact that generated geometry is not guaranteed.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all pass.

- [ ] **Step 5: Update E2E wording and run the full verification suite**

Update the E2E name from MiniMax-specific to provider-neutral without changing the real unconfigured-flow behavior. Run:

```bash
npm run typecheck
npm test
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Expected: typecheck/build exit 0, all Vitest and four Playwright scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add server/app.ts .env.example README.md tests
git commit -m "feat: wire wan provider into qiju"
```

### Task 4: Local Configuration and Live Smoke Test

**Files:**
- Modify locally, ignored by Git: `.env`

**Interfaces:**
- Consumes: user-managed `DASHSCOPE_API_KEY`.
- Produces: running LAN-accessible app at `http://192.168.2.152:5173/` for this session.

- [ ] **Step 1: Add non-secret Wan defaults without deleting user secrets**

Ensure `.env` contains `WAN_API_URL` and `WAN_MODEL`. Add an empty `DASHSCOPE_API_KEY=` only if the key is not already present. Do not print `.env` or its values.

- [ ] **Step 2: Verify configuration presence without exposing values**

Report only `DASHSCOPE_API_KEY=SET/EMPTY`, exact URL match status, and exact model match status.

- [ ] **Step 3: Restart the LAN dev services**

Run: `npx concurrently "vite --host 0.0.0.0" "tsx watch server/index.ts"`

Expected: Vite exposes `http://192.168.2.152:5173/`; Express listens on the configured port.

- [ ] **Step 4: Verify health and one real generation only when key is set**

First call `/api/health` and require `aiConfigured: true`. A real generation costs money and transmits the selected room/reference photos to Alibaba Cloud; perform one only after the user explicitly supplies/selects a test image and confirms that exact transmission. If the key is empty, stop after health reports `aiConfigured: false` and tell the user exactly how to paste it locally.
