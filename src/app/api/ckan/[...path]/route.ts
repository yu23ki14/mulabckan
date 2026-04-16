import { NextRequest } from "next/server";
import { CKAN_BASE } from "@/lib/tools";

export const runtime = "nodejs";

// Thin server-side proxy for CKAN. Resolves CORS when the client
// needs to hit CKAN directly (e.g. future CSV downloads).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const upstream = `${CKAN_BASE}/${path.join("/")}${search}`;

  const resp = await fetch(upstream);
  const body = await resp.arrayBuffer();
  return new Response(body, {
    status: resp.status,
    headers: {
      "content-type":
        resp.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
