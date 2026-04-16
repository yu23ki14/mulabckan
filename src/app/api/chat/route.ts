import { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  TOOLS,
  executeTool,
  isPendingImages,
} from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_TURNS = 6;

const SYSTEM = `あなたは西粟倉村（岡山県）のオープンデータポータル（CKAN）のアシスタントです。
ユーザーの質問に答えるために、必要に応じてCKANのツールを呼び出してデータを調べてください。

データ取得の方針（resource の format に応じて使い分け）:
- まず何があるか分からない場合は list_datasets で一覧を確認
- 気になるデータセットは get_dataset で resources[] とその format / datastore_active を確認
- CSV:
  - datastore_active=true → search_data で datastore 経由取得
  - datastore_active=false → download_csv でファイル直接ダウンロード
- XLS / XLSX / ODS:
  - datastore_active=true → search_data
  - datastore_active=false → read_xlsx （シート名省略時は最初のシート）
- PDF → read_pdf でテキスト抽出（スキャン画像のみのPDFは抽出不可）
- MD / TXT / JSON などテキスト系 → read_text
- JPEG / PNG / WEBP など画像 → view_image（画像を直接「見て」分析する）
- ZIP はデフォルトでは読めないので、その旨を伝える

回答の方針:
- 日本語で丁寧かつ簡潔に回答する
- 表形式のデータは Markdown テーブルで整理して見やすく表示する
- データに基づいた分析・洞察も積極的に提供する
- 該当データが存在しない場合は無理に作らず、近いデータを提案する
- データセット名（name フィールド, romaji slug）から意味を類推してはいけない。必ず title フィールドまたは get_dataset の結果を使って説明する（例: uryou=漁業ではなく雨量、shokubunka=植物文化ではなく郷土料理）`;

interface ChatRequest {
  history: ChatCompletionMessageParam[];
  userText: string;
}

// Convert shared TOOLS (JSON Schema) into OpenAI's function-tool shape.
const OPENAI_TOOLS: ChatCompletionTool[] = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}));

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const openai = new OpenAI({ apiKey });
  const { history, userText } = (await req.json()) as ChatRequest;

  const reqId = Math.random().toString(36).slice(2, 10);
  const t0 = Date.now();
  const log = (event: string, data?: Record<string, unknown>) => {
    console.log(
      `[chat:${reqId}] ${event}${data ? " " + JSON.stringify(data) : ""}`
    );
  };
  const logErr = (event: string, err: unknown, extra?: Record<string, unknown>) => {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `[chat:${reqId}] ${event} ${JSON.stringify({ error: msg, ...extra })}`
    );
    if (stack) console.error(stack);
  };

  log("request", {
    model: MODEL,
    historyLen: history?.length ?? 0,
    userTextPreview: userText.slice(0, 80),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const messages: ChatCompletionMessageParam[] = [
          ...history,
          { role: "user", content: userText },
        ];
        const toolCalls: string[] = [];

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          log("turn_start", { turn, messages: messages.length });
          let completion;
          try {
            completion = await openai.chat.completions.create({
              model: MODEL,
              messages: [{ role: "system", content: SYSTEM }, ...messages],
              tools: OPENAI_TOOLS,
              tool_choice: "auto",
            });
          } catch (e) {
            logErr("openai_error", e, { turn });
            throw e;
          }

          const choice = completion.choices[0];
          const assistantMsg = choice.message;
          messages.push(assistantMsg);

          log("openai_response", {
            turn,
            finish_reason: choice.finish_reason,
            tool_calls:
              assistantMsg.tool_calls
                ?.filter((t) => t.type === "function")
                .map((t) => t.function.name) ?? [],
            text_len: (assistantMsg.content ?? "").length,
            usage: completion.usage,
          });

          if (
            choice.finish_reason === "tool_calls" &&
            assistantMsg.tool_calls?.length
          ) {
            // OpenAI requires every tool_call_id in the assistant message to
            // be answered by a contiguous run of role:"tool" messages, with no
            // other role interleaved. Image attachments from PendingImages
            // tools have to ride on a follow-up role:"user" message — so we
            // buffer those and append them only after all tool replies land.
            const pendingUserMessages: ChatCompletionMessageParam[] = [];

            for (const tc of assistantMsg.tool_calls) {
              if (tc.type !== "function") continue;
              const name = tc.function.name;
              let input: Record<string, unknown> = {};
              try {
                input = tc.function.arguments
                  ? JSON.parse(tc.function.arguments)
                  : {};
              } catch (e) {
                logErr("tool_args_parse", e, {
                  name,
                  raw: tc.function.arguments,
                });
                input = {};
              }
              toolCalls.push(name);
              send("tool_call", { name });
              log("tool_call", { name, input });

              const toolStart = Date.now();
              let result: unknown;
              try {
                result = await executeTool(name, input);
              } catch (e) {
                logErr("tool_exception", e, { name });
                result = { error: e instanceof Error ? e.message : String(e) };
              }
              const toolMs = Date.now() - toolStart;

              if (isPendingImages(result)) {
                log("tool_result", {
                  name,
                  ms: toolMs,
                  attached_images: result.images.length,
                  meta: result.meta,
                });
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    ...result.meta,
                    attached_images: result.images.length,
                  }),
                });
                pendingUserMessages.push({
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `以下に ${result.images.length} 件の画像を添付します。これらは実在するデータリソース（PDFのページなど）を画像化したものです。画像内に書かれている日本語テキスト・表・図を実際に目で読み取り、その内容を根拠にユーザーの質問に答えてください。「読み取れません」や「画像の内容を確認できません」と返答してはいけません。`,
                    },
                    ...result.images.map((img) => ({
                      type: "image_url" as const,
                      image_url: { url: img.data_url },
                    })),
                  ],
                });
              } else {
                const r = result as Record<string, unknown>;
                if (r && typeof r === "object" && "error" in r) {
                  log("tool_error", { name, ms: toolMs, error: r.error });
                } else {
                  const serialized = JSON.stringify(result);
                  log("tool_result", {
                    name,
                    ms: toolMs,
                    bytes: serialized.length,
                  });
                }
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                });
              }
            }

            messages.push(...pendingUserMessages);
            continue;
          }

          log("done", {
            totalMs: Date.now() - t0,
            toolCalls,
            turns: turn + 1,
          });
          send("done", {
            text: assistantMsg.content ?? "",
            toolCalls,
            history: messages,
          });
          controller.close();
          return;
        }

        log("max_turns_reached", { toolCalls });
        send("done", {
          text: "ツール呼び出しの上限に達しました。",
          toolCalls,
          history: messages,
        });
        controller.close();
      } catch (e) {
        logErr("fatal", e);
        send("error", {
          message: e instanceof Error ? e.message : String(e),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
