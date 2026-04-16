import { NextRequest } from "next/server";
import { TOOLS, executeTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 6;

const SYSTEM = `あなたは西粟倉村（岡山県）のオープンデータポータル（CKAN）のアシスタントです。
ユーザーの質問に答えるために、必要に応じてCKANのツールを呼び出してデータを調べてください。
- まず何があるか分からない場合は list_datasets で一覧を確認する
- データの中身が必要なら search_data でレコードを取得する
- 日本語で丁寧かつ簡潔に回答する
- 表形式のデータは Markdown テーブルで整理して見やすく表示する
- データに基づいた分析・洞察も積極的に提供する`;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ApiMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

interface ChatRequest {
  history: ApiMessage[];
  userText: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

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
        const messages: ApiMessage[] = [
          ...history,
          { role: "user", content: userText },
        ];
        const toolCalls: string[] = [];

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 4096,
              system: SYSTEM,
              tools: TOOLS,
              messages,
            }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            send("error", { message: `Anthropic API error: ${errText}` });
            controller.close();
            return;
          }

          const data = (await resp.json()) as {
            content: ContentBlock[];
            stop_reason: string;
          };

          messages.push({ role: "assistant", content: data.content });

          const textBlocks = data.content.filter(
            (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
          );
          const toolUseBlocks = data.content.filter(
            (b): b is Extract<ContentBlock, { type: "tool_use" }> =>
              b.type === "tool_use"
          );

          if (data.stop_reason === "end_turn") {
            send("done", {
              text: textBlocks.map((b) => b.text).join(""),
              toolCalls,
              history: messages,
            });
            controller.close();
            return;
          }

          if (data.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
            const toolResults: ContentBlock[] = [];
            for (const tb of toolUseBlocks) {
              toolCalls.push(tb.name);
              send("tool_call", { name: tb.name });
              const result = await executeTool(tb.name, tb.input);
              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: JSON.stringify(result),
              });
            }
            messages.push({ role: "user", content: toolResults });
            continue;
          }

          // Unexpected stop reason — return what we have.
          send("done", {
            text: textBlocks.map((b) => b.text).join(""),
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
