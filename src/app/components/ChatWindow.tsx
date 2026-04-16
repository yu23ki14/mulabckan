import type { RefObject } from "react";
import { MessageBubble, type DisplayMessage } from "./MessageBubble";
import { ToolBadge } from "./ToolBadge";

const SUGGESTIONS = [
  "どんなデータがありますか？",
  "人口の推移を教えて",
  "郷土料理のレシピを紹介して",
  "雨量や気温のデータは？",
  "野生動物モニタリングの様子は？",
];

interface Props {
  messages: DisplayMessage[];
  loading: boolean;
  activeTools: string[];
  onSuggestionClick: (s: string) => void;
  bottomRef: RefObject<HTMLDivElement | null>;
}

export function ChatWindow({
  messages,
  loading,
  activeTools,
  onSuggestionClick,
  bottomRef,
}: Props) {
  const isEmpty = messages.length === 0;
  const uniqueActive = [...new Set(activeTools)];

  return (
    <div
      style={{
        flex: 1,
        // Flex children default to min-height:auto, which would let tall
        // content push this region past the parent and shove the input row
        // off-screen. min-height:0 restores the intended scrollable area.
        minHeight: 0,
        overflowY: "auto",
        padding: "20px 16px",
      }}
    >
      {isEmpty && (
        <div style={{ textAlign: "center", paddingTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌲</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#2d4a29",
              marginBottom: 6,
            }}
          >
            西粟倉村のデータと会話しよう
          </div>
          <div
            style={{ fontSize: 12, color: "#6b7a5e", marginBottom: 28 }}
          >
            村のオープンデータを AIが調べてわかりやすく答えます
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "center",
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestionClick(s)}
                style={{
                  background: "#fff",
                  border: "1px solid rgba(74,103,65,0.3)",
                  borderRadius: 20,
                  padding: "7px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#4a6741",
                  transition: "all 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "rgba(74,103,65,0.1)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#fff";
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m, i) => (
        <MessageBubble key={i} {...m} />
      ))}

      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#2d4a29",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            🌲
          </div>
          <div>
            {uniqueActive.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginBottom: 6,
                }}
              >
                {uniqueActive.map((t) => (
                  <ToolBadge key={t} name={t} />
                ))}
              </div>
            )}
            <div
              style={{
                background: "#fff",
                borderRadius: "16px 16px 16px 4px",
                padding: "12px 16px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                display: "flex",
                gap: 5,
                alignItems: "center",
              }}
            >
              {uniqueActive.length === 0 ? (
                <span style={{ fontSize: 12, color: "#6b7a5e" }}>
                  考えています…
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "#4a6741" }}>
                  データを取得中…
                </span>
              )}
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#4a6741",
                    opacity: 0.7,
                    animation: `bounce 1.2s ${j * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
