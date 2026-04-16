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
] as const;

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
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
