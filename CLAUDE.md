@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — run Next.js dev server (Turbopack).
- `pnpm build` / `pnpm start` — production build and server.
- `pnpm lint` — ESLint (uses `eslint-config-next` core-web-vitals + typescript).

There is no test suite. `pnpm-lock.yaml` is the lockfile (ignore `package-lock.json` if present).

Required env vars (set in `.env.local`):
- `OPENAI_API_KEY` — required; `/api/chat` returns 500 without it.
- `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`. Must be a vision-capable model for `view_image` and the `read_pdf` image fallback to work.
- `CKAN_BASE_URL` — optional, defaults to `https://ckan.nishiawakura-mulabo.jp/api/3/action`.

## Architecture

This is a Japanese-language chat UI over the 西粟倉村 (Nishiawakura) CKAN open-data portal. The agent discovers datasets and reads their resources via OpenAI function-calling.

**Agentic loop** (`src/app/api/chat/route.ts`): streams SSE back to the client. Each turn calls OpenAI with the full history + `TOOLS` from `src/lib/tools.ts`. Tool results are appended as `role: "tool"` messages and the loop continues up to `MAX_TURNS` (6). `tool_call` SSE events update the UI's tool badges in real time; the final `done` event carries the assistant text and the full message history (client sends it back unchanged on the next turn).

**Tool catalog** lives in `src/lib/tools.ts` as a single `TOOLS` array plus an `executeTool(name, input)` switch. Everything — JSON Schema, descriptions, and server-side execution — is defined in that one file. The system prompt in `route.ts` tells the model which tool to pick based on a resource's `format` and `datastore_active`:
- CSV + `datastore_active=true` → `search_data` (CKAN datastore); else `download_csv`.
- XLSX/XLS/ODS → `search_data` if datastore-active, else `read_xlsx`.
- PDF → `read_pdf`; MD/TXT/JSON → `read_text`; images → `view_image`.

**PendingImages pattern** — how images reach the vision model across a tool boundary. OpenAI's function-tool role cannot carry `image_url` parts, so `view_image` and the `read_pdf` image fallback return a sentinel object `{ __pending_images__: true, images, meta }` (see `PENDING_IMAGES_MARKER` / `isPendingImages`). The route handler detects it, writes a small JSON stub as the `tool` reply, then pushes a follow-up `role: "user"` message whose `content` is a multi-part array mixing a directive text block and `image_url` parts. The directive text is deliberately forceful — without it the model often refused to "read" the image. When adding new tools that need vision input, return `PendingImages` the same way rather than inventing a new path.

**Ordering invariant for parallel tool calls**: OpenAI requires every `tool_call_id` from an assistant message to be answered by a contiguous run of `role: "tool"` messages with no other role interleaved. When the model issues several tool calls in one turn and any of them returns `PendingImages`, the follow-up `role: "user"` image message **must** be buffered and appended only after all `role: "tool"` replies have been pushed. Interleaving a `user` message between tool responses causes OpenAI to reject the next turn with "tool_call_ids did not have response messages".

**PDF text vs. image fallback** — `read_pdf` first tries `pdf-parse` text extraction, then runs `pdfTextLooksGarbled()` on the result. CID-font PDFs without a ToUnicode map come back as NULs/control chars; in that case (or when `force_images=true`) it renders pages via `parser.getScreenshot()` and returns them as `PendingImages`. This is why `@napi-rs/canvas` is a dependency.

**CKAN proxy** (`src/app/api/ckan/[...path]/route.ts`) — a pass-through to `CKAN_BASE` for CORS-sensitive client-side fetches. The agent loop talks to CKAN directly from the server via `ckanGet()`.

**`next.config.ts` contains load-bearing build config** — do not simplify:
- `serverExternalPackages: ["pdf-parse", "pdfjs-dist", "xlsx", "@napi-rs/canvas"]` — these do runtime `fs`/`url` imports and ship worker entrypoints; bundling them via Turbopack broke `pdf-parse` text extraction.
- `outputFileTracingIncludes` for `/api/chat` — force-includes `pdfjs-dist/cmaps/**` and `standard_fonts/**` on Vercel. Without these, non-Latin (Japanese) PDFs fail at runtime because Next's file tracer doesn't follow runtime `fs` reads.

**Runtime** — `/api/chat` and `/api/ckan/*` both declare `runtime = "nodejs"` (needed by `pdf-parse`, `xlsx`, `@napi-rs/canvas`). `/api/chat` is also `dynamic = "force-dynamic"` for the SSE stream.

**Logging** — chat requests are tagged with a short `reqId`; tool calls log inputs, durations, and result byte sizes (`[chat:<id>]` / `[tool:<name>]` prefixes). These are the primary way to debug production issues on Vercel.

**Client** — single-page chat in `src/app/page.tsx`; presentational pieces in `src/app/components/`. `apiHistory` is opaque to the client — it's the server-shaped `ChatCompletionMessageParam[]` including tool messages and is echoed back verbatim on the next turn. Don't mutate it.

## Naming pitfall the system prompt guards against

Dataset `name` fields are romaji slugs (e.g. `uryou`, `shokubunka`). The model loves to guess meanings from them ("uryou=漁業", actually 雨量; "shokubunka=植物文化", actually 郷土料理). The system prompt in `route.ts` and `list_datasets`' description both forbid slug-based inference — always rely on `title` or `get_dataset`. Preserve this guidance when editing either.
