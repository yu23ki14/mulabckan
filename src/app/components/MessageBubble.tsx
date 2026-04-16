import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolBadge } from "./ToolBadge";

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
}

export function MessageBubble({ role, text, toolCalls }: DisplayMessage) {
  const uniqueTools = toolCalls ? [...new Set(toolCalls)] : [];
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 14,
      }}
    >
      {!isUser && (
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
            marginRight: 8,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          🌲
        </div>
      )}
      <div style={{ maxWidth: "82%" }}>
        {!isUser && uniqueTools.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 6,
            }}
          >
            {uniqueTools.map((t) => (
              <ToolBadge key={t} name={t} />
            ))}
          </div>
        )}
        <div
          style={{
            background: isUser ? "#2d4a29" : "#fff",
            color: isUser ? "#e8f0e6" : "#2a2a1e",
            borderRadius: isUser
              ? "16px 16px 4px 16px"
              : "16px 16px 16px 4px",
            padding: "10px 14px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: isUser ? "pre-wrap" : undefined,
          }}
        >
          {isUser ? text : <MarkdownRenderer text={text} />}
        </div>
      </div>
    </div>
  );
}
