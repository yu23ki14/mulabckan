import { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  TOOLS,
  executeTool,
  isPendingImage,
  PENDING_IMAGE_MARKER,
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
- 該当データが存在しない場合は無理に作らず、近いデータを提案する`;

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
          const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [{ role: "system", content: SYSTEM }, ...messages],
            tools: OPENAI_TOOLS,
            tool_choice: "auto",
          });

          const choice = completion.choices[0];
          const assistantMsg = choice.message;
          messages.push(assistantMsg);

          if (
            choice.finish_reason === "tool_calls" &&
            assistantMsg.tool_calls?.length
          ) {
            for (const tc of assistantMsg.tool_calls) {
              if (tc.type !== "function") continue;
              const name = tc.function.name;
              let input: Record<string, unknown> = {};
              try {
                input = tc.function.arguments
                  ? JSON.parse(tc.function.arguments)
                  : {};
              } catch {
                input = {};
              }
              toolCalls.push(name);
              send("tool_call", { name });
              const result = await executeTool(name, input);

              if (isPendingImage(result)) {
                // Keep the tool_result lightweight (don't embed the base64
                // in the tool message — that would duplicate it in history).
                const { data_url, ...meta } = result;
                const metaWithoutMarker: Record<string, unknown> = {
                  ...meta,
                };
                delete metaWithoutMarker[PENDING_IMAGE_MARKER];
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    ...metaWithoutMarker,
                    note: "image attached in the next user message",
                  }),
                });
                // Inject the image as the next user turn. gpt-4o-mini (and
                // any other vision-capable model) will see it on the next
                // assistant invocation.
                messages.push({
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `[${result.resource_name ?? "image"}] を添付しました。画像の内容を確認して回答に活用してください。`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: data_url },
                    },
                  ],
                });
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                });
              }
            }
            continue;
          }

          send("done", {
            text: assistantMsg.content ?? "",
            toolCalls,
            history: messages,
          });
          controller.close();
          return;
        }

        send("done", {
          text: "ツール呼び出しの上限に達しました。",
          toolCalls,
          history: messages,
        });
        controller.close();
      } catch (e) {
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
