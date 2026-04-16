const ICONS: Record<string, string> = {
  list_datasets: "📋",
  search_datasets: "🔍",
  get_dataset: "📦",
  search_data: "🗃️",
  get_resource: "📄",
  download_csv: "⬇️",
  read_pdf: "📕",
  read_text: "📝",
  view_image: "🖼️",
  read_xlsx: "📊",
};

const LABELS: Record<string, string> = {
  list_datasets: "データセット一覧",
  search_datasets: "データセット検索",
  get_dataset: "データセット詳細",
  search_data: "データ検索",
  get_resource: "リソース情報",
  download_csv: "CSVダウンロード",
  read_pdf: "PDF読み取り",
  read_text: "テキスト読み取り",
  view_image: "画像を見る",
  read_xlsx: "Excel読み取り",
};

export function ToolBadge({ name }: { name: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "rgba(74,103,65,0.12)",
        border: "1px solid rgba(74,103,65,0.3)",
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 11,
        color: "#4a6741",
        fontFamily: "monospace",
        fontWeight: 600,
      }}
    >
      {ICONS[name] ?? "⚙️"} {LABELS[name] ?? name}
    </span>
  );
}
