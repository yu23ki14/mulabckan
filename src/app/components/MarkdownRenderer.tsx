import type { ReactNode } from "react";

// Minimal inline markdown renderer:
// - `|` lines form tables (with a `|---|` separator after the header)
// - `#`/`##`/`###` headings
// - **bold** and `code` spans
// Intentionally lightweight so we can keep all styling inline.
export function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table
    if (line.startsWith("|") && lines[i + 1]?.match(/^\|[-| ]+\|/)) {
      const headers = line
        .split("|")
        .filter((c) => c.trim())
        .map((c) => c.trim());
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(
          lines[i]
            .split("|")
            .filter((c) => c.trim())
            .map((c) => c.trim())
        );
        i++;
      }
      elements.push(
        <div key={`t-${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table
            style={{
              borderCollapse: "collapse",
              fontSize: 12,
              width: "100%",
            }}
          >
            <thead>
              <tr>
                {headers.map((h, j) => (
                  <th
                    key={j}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(74,103,65,0.15)",
                      border: "1px solid rgba(74,103,65,0.2)",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{
                    background:
                      ri % 2 ? "rgba(74,103,65,0.04)" : "transparent",
                  }}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: "4px 10px",
                        border: "1px solid rgba(74,103,65,0.15)",
                        fontSize: 11,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={i}
          style={{ margin: "12px 0 4px", fontSize: 13, color: "#2d4a29" }}
        >
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          style={{ margin: "14px 0 4px", fontSize: 14, color: "#2d4a29" }}
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={i}
          style={{ margin: "14px 0 4px", fontSize: 15, color: "#2d4a29" }}
        >
          {line.slice(2)}
        </h1>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
    } else {
      // Inline: bold + code. We render via dangerouslySetInnerHTML,
      // so escape HTML in the raw line first.
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const rendered = escaped
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(
          /`(.*?)`/g,
          "<code style=\"background:rgba(74,103,65,0.1);padding:1px 4px;border-radius:3px;font-size:11px\">$1</code>"
        );
      elements.push(
        <p
          key={i}
          style={{ margin: "2px 0", lineHeight: 1.65, fontSize: 13 }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      );
    }
    i++;
  }

  return <div>{elements}</div>;
}
