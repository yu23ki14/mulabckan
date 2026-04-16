"use client";

import { useEffect, useRef, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import type { DisplayMessage } from "./components/MessageBubble";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ApiMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

type DoneEvent = {
  text: string;
  toolCalls: string[];
  history: ApiMessage[];
};

export default function Page() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools, loading]);

  const send = async (override?: string) => {
    const userText = (override ?? input).trim();
    if (!userText || loading) return;
    setInput("");
    setLoading(true);
    setActiveTools([]);
    setMessages((prev) => [...prev, { role: "user", text: userText }]);

    const calledTools: string[] = [];
    let done: DoneEvent | null = null;
    let errorMsg: string | null = null;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: apiHistory, userText }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { value, done: d } = await reader.read();
        streamDone = d;
        if (value) buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let event = "message";
          let dataStr = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!dataStr) continue;

          const parsed = JSON.parse(dataStr);
          if (event === "tool_call") {
            calledTools.push(parsed.name);
            setActiveTools((prev) => [...prev, parsed.name]);
          } else if (event === "done") {
            done = parsed as DoneEvent;
          } else if (event === "error") {
            errorMsg = parsed.message;
          }
        }
      }

      if (errorMsg) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `⚠️ エラーが発生しました: ${errorMsg}`,
            toolCalls: [],
          },
        ]);
      } else if (done) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: done!.text,
            toolCalls: calledTools,
          },
        ]);
        setApiHistory(done.history);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `⚠️ エラーが発生しました: ${
            e instanceof Error ? e.message : String(e)
          }`,
          toolCalls: [],
        },
      ]);
    } finally {
      setLoading(false);
      setActiveTools([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const disabled = loading || !input.trim();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#f5f2ec",
        fontFamily:
          "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
        color: "#2a2a1e",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#2d4a29",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ fontSize: 22 }}>🌲</div>
        <div>
          <div
            style={{
              color: "#e8f0e6",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            西粟倉村 オープンデータ
          </div>
          <div
            style={{
              color: "rgba(232,240,230,0.6)",
              fontSize: 10,
              marginTop: 1,
            }}
          >
            ckan.nishiawakura-mulabo.jp
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            background: "rgba(232,240,230,0.15)",
            border: "1px solid rgba(232,240,230,0.25)",
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: 10,
            color: "rgba(232,240,230,0.7)",
          }}
        >
          AI Agent
        </div>
      </div>

      <ChatWindow
        messages={messages}
        loading={loading}
        activeTools={activeTools}
        onSuggestionClick={(s) => void send(s)}
        bottomRef={bottomRef}
      />

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          background: "#fff",
          borderTop: "1px solid rgba(74,103,65,0.15)",
          display: "flex",
          gap: 8,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="データについて質問してください…"
          rows={1}
          style={{
            flex: 1,
            border: "1px solid rgba(74,103,65,0.3)",
            borderRadius: 12,
            padding: "9px 12px",
            fontSize: 13,
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            background: "#f9f8f5",
            color: "#2a2a1e",
            lineHeight: 1.5,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#4a6741";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(74,103,65,0.3)";
          }}
        />
        <button
          onClick={() => void send()}
          disabled={disabled}
          style={{
            background: disabled ? "rgba(74,103,65,0.3)" : "#2d4a29",
            border: "none",
            borderRadius: 12,
            padding: "0 16px",
            cursor: disabled ? "not-allowed" : "pointer",
            color: "#e8f0e6",
            fontSize: 16,
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(74,103,65,0.3); border-radius: 2px; }
      `}</style>
    </div>
  );
}
