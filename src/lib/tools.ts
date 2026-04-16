// CKAN tool definitions and server-side executor.
// Runs only on the server (invoked from /api/chat and /api/ckan routes).

export const CKAN_BASE =
  process.env.CKAN_BASE_URL ??
  "https://ckan.nishiawakura-mulabo.jp/api/3/action";

export type ToolInput = Record<string, unknown>;

export const TOOLS = [
  {
    name: "list_datasets",
    description:
      "西粟倉村CKANポータルに登録されているデータセットの一覧を取得する。何があるか調べるときに使う。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_datasets",
    description:
      "キーワードでデータセットを検索する。タイトル・説明文・タグなどにマッチするデータセットを返す。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索キーワード" },
        rows: { type: "integer", description: "取得件数 (default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_dataset",
    description:
      "特定のデータセットの詳細情報（説明、リソース一覧、メタデータ）を取得する。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "データセットのIDまたはname" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_data",
    description:
      "CKANのDatastoreに格納された実際のデータレコードを検索・取得する。resource_idが必要。",
    input_schema: {
      type: "object",
      properties: {
        resource_id: { type: "string", description: "リソースID" },
        q: { type: "string", description: "全文検索クエリ（省略可）" },
        limit: { type: "integer", description: "取得件数 (default 20)" },
        offset: { type: "integer", description: "オフセット (default 0)" },
      },
      required: ["resource_id"],
    },
  },
  {
    name: "get_resource",
    description: "特定リソースのメタデータを取得する。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "リソースID" },
      },
      required: ["id"],
    },
  },
  {
    name: "download_csv",
    description:
      "CSVリソースをダウンロードして行データとして返す。resource の datastore_active=false の場合はこれを使う（CKAN datastoreに登録されていないCSVの中身を読む手段）。Shift-JIS/UTF-8を自動判定し、ヘッダ行と指定件数の行を返す。",
    input_schema: {
      type: "object",
      properties: {
        resource_id: { type: "string", description: "CSVリソースのID" },
        max_rows: {
          type: "integer",
          description: "返す行数の上限 (default 50, max 200)",
        },
        offset: {
          type: "integer",
          description: "スキップする行数 (default 0)",
        },
      },
      required: ["resource_id"],
    },
  },
] as const;

// Minimal CSV parser. Handles quoted fields and escaped quotes ("").
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuote = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Decode bytes as UTF-8, falling back to Shift-JIS for legacy Japanese CSVs.
function decodeJapanese(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

async function ckanGet(path: string): Promise<unknown> {
  const r = await fetch(`${CKAN_BASE}/${path}`);
  const j = (await r.json()) as {
    success: boolean;
    result?: unknown;
    error?: { message?: string };
  };
  if (!j.success) throw new Error(j.error?.message || "CKAN error");
  return j.result;
}

export async function executeTool(
  name: string,
  input: ToolInput
): Promise<unknown> {
  try {
    switch (name) {
      case "list_datasets":
        return await ckanGet("package_list");
      case "search_datasets": {
        const q = encodeURIComponent(String(input.query ?? ""));
        const rows = Number(input.rows ?? 8);
        return await ckanGet(`package_search?q=${q}&rows=${rows}`);
      }
      case "get_dataset":
        return await ckanGet(
          `package_show?id=${encodeURIComponent(String(input.id ?? ""))}`
        );
      case "search_data": {
        const params = new URLSearchParams({
          resource_id: String(input.resource_id ?? ""),
          limit: String(input.limit ?? 20),
          offset: String(input.offset ?? 0),
        });
        if (input.q) params.set("q", String(input.q));
        return await ckanGet(`datastore_search?${params.toString()}`);
      }
      case "get_resource":
        return await ckanGet(
          `resource_show?id=${encodeURIComponent(String(input.id ?? ""))}`
        );
      case "download_csv": {
        const rid = String(input.resource_id ?? "");
        if (!rid) return { error: "resource_id is required" };
        const resource = (await ckanGet(
          `resource_show?id=${encodeURIComponent(rid)}`
        )) as { url?: string; format?: string; name?: string };
        if (!resource?.url) {
          return { error: "resource has no downloadable url" };
        }
        const r = await fetch(resource.url, { redirect: "follow" });
        if (!r.ok) {
          return { error: `download failed: HTTP ${r.status}` };
        }
        const buf = await r.arrayBuffer();
        const text = decodeJapanese(buf);
        const all = parseCSV(text);
        if (all.length === 0) {
          return {
            columns: [],
            rows: [],
            total_rows: 0,
            returned_rows: 0,
            offset: 0,
            truncated: false,
          };
        }
        const [header, ...dataRows] = all;
        const maxRows = Math.min(
          Math.max(Number(input.max_rows ?? 50), 1),
          200
        );
        const offset = Math.max(Number(input.offset ?? 0), 0);
        const slice = dataRows.slice(offset, offset + maxRows);
        return {
          resource_name: resource.name,
          format: resource.format,
          columns: header,
          rows: slice,
          total_rows: dataRows.length,
          returned_rows: slice.length,
          offset,
          truncated: offset + slice.length < dataRows.length,
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
