# MiniMax Text Generation Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Wan 2.7 with MiniMax `image-01` text-to-image while preserving upload, result comparison, and local history.

**Architecture:** Keep `/api/generate` and `GenerationProvider` stable. Replace the server configuration, provider, health metadata, tests, and operator docs as one atomic integration. Uploaded images remain local product inputs and are never sent upstream; MiniMax receives only a fixed Chinese room prompt plus the selected preset style.

**Tech Stack:** TypeScript, Express 5, native `fetch`, Vitest, Supertest, React/Vite.

## Global Constraints

- Default API URL: `https://api.minimaxi.com/v1/image_generation`.
- Default model: `image-01`.
- Request: `response_format: "base64"`, `n: 1`, `aspect_ratio: "3:4"`, `prompt_optimizer: false`.
- Never send `roomImage` or `referenceImage` to MiniMax.
- Never expose or log `MINIMAX_API_KEY`, complete request bodies, or image Base64.
- Preserve `AI_NOT_CONFIGURED`, `UPSTREAM_ERROR`, and `INVALID_INPUT` public contracts.
- Do not claim that MiniMax edits or structurally preserves the uploaded room.

---

### Task 1: Replace Wan with the MiniMax provider

**Files:**
- Create: `server/providers/minimax.ts`
- Create: `tests/server/minimax-provider.test.ts`
- Modify: `server/config.ts`
- Modify: `server/app.ts`
- Modify: `server/input-image.ts`
- Modify: `server/routes/generate.ts`
- Modify: `tests/server/config.test.ts`
- Modify: `tests/server/health.test.ts`
- Modify: `tests/server/static.test.ts`
- Modify: `tests/server/env.test.ts`
- Modify: `tests/fixtures/server.env`
- Delete: `server/providers/wan.ts`
- Delete: `tests/server/wan-provider.test.ts`

**Interfaces:**
- Produces: `ServerConfig { minimaxApiKey?: string; minimaxApiUrl: string; minimaxModel: string; port: number }`.
- Produces: `createMiniMaxProvider(config, fetchImpl?): GenerationProvider`.
- Produces: `/api/health -> { ok: true, aiConfigured: boolean, provider: "minimax" }`.
- Produces: generic `isValidGenerationInputImage(bytes, mimeType)` upload validator.
- Preserves: `GenerationProvider.generate(input: GenerationInput): Promise<GeneratedImage>` and `/api/generate` response schema.

- [ ] **Step 1: Rewrite configuration tests for MiniMax**

```ts
expect(createServerConfig({})).toEqual({
  minimaxApiKey: undefined,
  minimaxApiUrl: 'https://api.minimaxi.com/v1/image_generation',
  minimaxModel: 'image-01',
  port: 3000,
});

expect(createServerConfig({
  MINIMAX_API_KEY: '  configured-key  ',
  MINIMAX_API_URL: '  https://example.test/minimax  ',
  MINIMAX_MODEL: '  image-fixture  ',
})).toEqual({
  minimaxApiKey: 'configured-key',
  minimaxApiUrl: 'https://example.test/minimax',
  minimaxModel: 'image-fixture',
  port: 3000,
});
```

- [ ] **Step 2: Rewrite health and factory-injection tests**

```ts
expect(receivedConfig).toMatchObject({
  minimaxApiKey: apiKey,
  minimaxApiUrl: 'https://example.test/minimax',
  minimaxModel: 'image-fixture',
});
expect(health.body).toEqual({ ok: true, aiConfigured: true, provider: 'minimax' });
expect(JSON.stringify({ health: health.body, generated: generated.body })).not.toContain(apiKey);
```

Update unconfigured health expectations to `provider: 'minimax'` and keep `aiConfigured: false`.

- [ ] **Step 3: Add failing MiniMax provider tests**

```ts
const jpegBytes = createJpegFixture();
const config = {
  minimaxApiKey: 'fixture-secret',
  minimaxApiUrl: 'https://example.test/minimax',
  minimaxModel: 'image-01',
};
const input = (): GenerationInput => ({
  roomImage: createJpegFixture(),
  roomMimeType: 'image/jpeg',
  presetStyle: '奶油风',
  constraint: PRESERVE_STRUCTURE_CONSTRAINT,
});

it('sends one text-only request and never uploads room bytes', async () => {
  const fetchImpl = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'image-01',
      aspect_ratio: '3:4',
      response_format: 'base64',
      n: 1,
      prompt_optimizer: false,
    });
    expect(body.subject_reference).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(input().roomImage.toString('base64'));
    expect(body.prompt).toContain('奶油风');
    expect(body.prompt).toContain('固定正面广角机位');
    return new Response(JSON.stringify({
      data: { image_base64: [jpegBytes.toString('base64')] },
      metadata: { success_count: '1', failed_count: '0' },
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  await expect(createMiniMaxProvider(config, fetchImpl as typeof fetch).generate(input()))
    .resolves.toEqual({ bytes: jpegBytes, mimeType: 'image/jpeg' });
});
```

Add separate cases for Bearer auth, configured URL/model, missing key, non-2xx, non-zero `base_resp.status_code`, missing image, malformed Base64, invalid signature, JPEG/PNG/WebP detection, timeout, and `UPSTREAM_ERROR` mapping.

- [ ] **Step 4: Run the focused suite and verify RED**

Run: `npm test -- tests/server/config.test.ts tests/server/health.test.ts tests/server/static.test.ts tests/server/env.test.ts tests/server/minimax-provider.test.ts`

Expected: FAIL because the server still exposes Wan configuration and `server/providers/minimax.ts` does not exist.

- [ ] **Step 5: Implement MiniMax configuration**

```ts
export interface ServerConfig {
  minimaxApiKey?: string;
  minimaxApiUrl: string;
  minimaxModel: string;
  port: number;
}

const defaultMiniMaxApiUrl = 'https://api.minimaxi.com/v1/image_generation';
const defaultMiniMaxModel = 'image-01';

export const createServerConfig = (environment: Environment): ServerConfig => ({
  minimaxApiKey: readOptionalValue(environment.MINIMAX_API_KEY),
  minimaxApiUrl: readOptionalValue(environment.MINIMAX_API_URL) ?? defaultMiniMaxApiUrl,
  minimaxModel: readOptionalValue(environment.MINIMAX_MODEL) ?? defaultMiniMaxModel,
  port: resolvePort(environment),
});
```

- [ ] **Step 6: Implement the text-only MiniMax provider**

Build the prompt exactly from these four clauses:

```ts
const buildPrompt = (input: GenerationInput) => [
  `生成一张${input.presetStyle ?? '温馨实用'}的年轻人出租屋室内设计效果图。`,
  '单一真实房间，固定正面广角机位，保持自然透视和真实比例。',
  '完整展示墙面、门窗、地面和吊顶，门窗位置不变，不改变空间边界。',
  '仅调整家具、软装、材质与灯光，生活化、温馨、可落地，不要豪宅感。',
].join('');
```

POST with Bearer auth and this JSON only:

```ts
{
  model: config.minimaxModel,
  prompt: buildPrompt(input),
  aspect_ratio: '3:4',
  response_format: 'base64',
  n: 1,
  prompt_optimizer: false,
  aigc_watermark: false,
}
```

Use a 120-second `AbortController`. Require HTTP success, `base_resp.status_code === 0`, and a non-empty `data.image_base64[0]`. Decode Base64 and detect JPEG/PNG/WebP by signature. Missing key throws `AI_NOT_CONFIGURED`; every upstream, parse, timeout, or output-validation failure throws `UPSTREAM_ERROR`.

- [ ] **Step 7: Wire the provider and remove Wan**

Change `server/app.ts` to import `createMiniMaxProvider`, make it the default factory, and return:

```ts
response.json({
  ok: true,
  aiConfigured: Boolean(config.minimaxApiKey),
  provider: 'minimax',
});
```

Delete `server/providers/wan.ts` and `tests/server/wan-provider.test.ts`. Update env fixtures to use only non-secret MiniMax fixture values.

Rename `isValidWanInputImage` to `isValidGenerationInputImage` in `server/input-image.ts` and `server/routes/generate.ts`; preserve its validation behavior and existing route coverage.

- [ ] **Step 8: Run focused tests and server typecheck for GREEN**

Run:

```bash
npm test -- tests/server/config.test.ts tests/server/health.test.ts tests/server/static.test.ts tests/server/env.test.ts tests/server/minimax-provider.test.ts
npm run typecheck:server
```

Expected: all commands PASS with no Wan imports or fields remaining.

- [ ] **Step 9: Commit Task 1**

```bash
git add server tests/server tests/fixtures/server.env
git commit -m "feat: switch generation to minimax"
```

---

### Task 2: Configure, document, and verify the complete flow

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify locally, never commit: `.env`
- Verify unchanged: `tests/e2e/mobile-flow.spec.ts`

**Interfaces:**
- Consumes: MiniMax health contract and unchanged `/api/generate` browser flow.
- Produces: documented MiniMax setup and a locally runnable application.

- [ ] **Step 1: Update public configuration documentation**

Set `.env.example` to:

```dotenv
MINIMAX_API_KEY=
MINIMAX_API_URL=https://api.minimaxi.com/v1/image_generation
MINIMAX_MODEL=image-01
PORT=
```

Update `README.md` to state that the room and optional style-reference images remain in the local product flow but are not sent to MiniMax; the result is a newly generated room, not an edit of the uploaded image.

- [ ] **Step 2: Verify stale Wan wording is gone**

Run: `rg -n "DASHSCOPE|WAN_API|WAN_MODEL|wan2.7|isValidWanInputImage" .env.example README.md server tests`

Expected: no matches.

- [ ] **Step 3: Prepare local `.env` without exposing secrets**

Ensure `.env` contains these names:

```dotenv
MINIMAX_API_KEY=
MINIMAX_API_URL=https://api.minimaxi.com/v1/image_generation
MINIMAX_MODEL=image-01
PORT=
```

The user supplies `MINIMAX_API_KEY`. Confirm `.env` is ignored before editing it. Never print the key; report only `SET` or `EMPTY`.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Expected: all commands PASS.

- [ ] **Step 5: Start the app and verify health**

Run `npm run dev`, then request `/api/health`.

Expected:

```json
{"ok":true,"aiConfigured":true,"provider":"minimax"}
```

- [ ] **Step 6: Run one paid generation only after action-time confirmation**

Upload a non-sensitive room fixture and select one preset style. Immediately before clicking Generate, confirm the external MiniMax request and its usage cost with the user. Verify result rendering and history persistence without printing the API key, request body, or image Base64.

- [ ] **Step 7: Commit Task 2**

```bash
git add .env.example README.md
git commit -m "docs: describe minimax generation setup"
```
