# Wan 2.7 Final Fix Report

## RED evidence

### Finding 1: safe bounded result download

- Added real Provider regressions for a non-Aliyun HTTPS URL, redirect fail-closed behavior, oversized `Content-Length`, a streamed body above 25 MiB, and a valid Alibaba Cloud HTTPS URL.
- Isolated RED runs failed for the intended reasons:
  - non-Aliyun URL: download spy was called twice instead of once;
  - redirect: generation resolved instead of rejecting;
  - oversized declared length: generation resolved instead of rejecting;
  - oversized stream: outcome was `resolved` instead of `UPSTREAM_ERROR`;
  - valid Alibaba Cloud URL remained green.
- A follow-up mutation check removed the non-standard-port condition and made `拒绝阿里云 HTTPS 非标准端口结果 URL` fail (`2` fetches instead of `1`); restoring the condition returned it to green.

### Finding 2: combined direction prompt correctness

- Added one-image and combined reference-plus-preset prompt regressions, asserting the literal semantic fragments required by the brief.
- RED command: `npm test -- tests/server/wan-provider.test.ts -t '完整且不冲突|灯光列为'`.
- RED result: 2/2 failed. The combined prompt omitted `奶油风`; the one-image prompt omitted `仅调整家具、软装和灯光`.

### Finding 3: Wan input image constraints

- Replaced input header-only fixtures with minimal JPEG SOF, PNG IHDR, and WebP VP8/VP8L/VP8X metadata fixtures.
- Provider RED command: `npm test -- tests/server/wan-provider.test.ts -t 'Provider 防御性|Provider 独立'`.
- Provider RED result: 7/7 failed because invalid inputs returned `UPSTREAM_ERROR` and still crossed the Provider boundary instead of returning `INVALID_INPUT` locally.
- Route RED command: `npm test -- tests/server/generate.test.ts -t '稳定 INVALID_INPUT|MIME 与签名一致'`.
- Route RED result: all 5 valid metadata fixtures passed; all 5 invalid metadata cases failed with HTTP 503 instead of the required stable `INVALID_INPUT` 400.

### Minor: first valid result URL

- RED command: `npm test -- tests/server/wan-provider.test.ts -t '跳过较早'`.
- RED result: the Provider downloaded `https://attacker.example/first.png` instead of scanning later content and choices for the first trusted Alibaba Cloud URL.

## GREEN implementation

- Added a shared `isValidWanInputImage` validator that parses bounded JPEG SOF segments, PNG IHDR metadata, and WebP VP8/VP8L/VP8X dimensions.
- Enforced non-empty JPEG/PNG/WebP input, matching signature and MIME, dimensions in `[240, 8000]`, aspect ratio in `[1:8, 8:1]`, and rejection of PNG color types 4 and 6.
- Applied the validator both before route dispatch and independently inside `WanProvider`; Provider `INVALID_INPUT` is mapped to stable HTTP 400.
- Result selection now scans all content items and choices and only accepts HTTPS `aliyuncs.com` hosts on the default/443 port.
- Result download uses `redirect: 'error'`, rejects malformed or oversized declared length fail-closed, streams through a reader, aborts/cancels immediately above 25 MiB, and never calls unbounded `arrayBuffer()`.
- The existing 120-second controller and sanitized public errors remain shared across generation and download.
- One- and two-image prompts preserve wall, doors/windows, floor, ceiling, perspective, and camera position while allowing furniture, soft furnishings, and lighting changes. Combined requests name the two image roles, include the preset, and give the reference priority for color, material, and atmosphere.
- GREEN focused suites: Provider 28/28; route 38/38.

## Files

- `server/input-image.ts`
- `server/providers/wan.ts`
- `server/routes/generate.ts`
- `tests/helpers/image-fixtures.ts`
- `tests/server/wan-provider.test.ts`
- `tests/server/generate.test.ts`
- `tests/server/health.test.ts`
- `.superpowers/sdd/2026-08-15-wan27-provider/final-fix-report.md`

## Full verification

- Focused Provider, route, config, and frontend generation contracts: 7 files, 116/116 tests passed.
- `npm run typecheck`: passed.
- `npm test`: 18 files, 164/164 tests passed.
- `DASHSCOPE_API_KEY='' npm run build`: passed; Vite built 42 modules and server TypeScript compiled.
- `DASHSCOPE_API_KEY='' WAN_API_URL='http://127.0.0.1:9/disabled' WAN_MODEL='wan-disabled-e2e' PORT=3000 PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: Chrome 4/4 passed.
- `git diff --check`: passed.

The first full test run exposed one remaining old header-only upload in `health.test.ts` (163/164 passed). Replacing only that input fixture with the shared valid JPEG metadata fixture produced the fresh 164/164 result; no production behavior was loosened.

## Self-review

- Security boundaries fail closed: malformed result URLs/lengths and missing response bodies reject; trusted-host matching cannot be satisfied by a longer attacker suffix; redirects are not followed.
- Streaming stores at most 25 MiB of accepted chunks and cancels plus aborts on the first chunk that crosses the limit.
- Both route and Provider validate every supplied input image; a missing reference bytes/MIME pair is also rejected by the Provider.
- No frontend flow or response contract changed.
- No `.env` file was directly opened, printed, or modified. No external or paid Wan API request was made; Chrome E2E explicitly forced an empty API key and a disabled loopback URL.
- Independent final diff review found no Critical or Important issues and returned `Ready`; its only Minor noted that minimal metadata fixtures are intentionally not full decodable images, so they complement rather than replace the existing real-image compatibility coverage.

## Commit

- This report ships with `fix: harden wan production boundaries`; use `git log --oneline -1` for the final immutable commit identifier.

## Concerns

- No live paid Wan smoke test was run, as explicitly prohibited. A future live smoke test requires a configured regional key plus explicit cost and image-transfer authorization.
