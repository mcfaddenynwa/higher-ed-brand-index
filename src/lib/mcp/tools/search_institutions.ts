import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_institutions",
  title: "Search institutions",
  description:
    "Search higher-ed institutions by name (case-insensitive). Returns up to 25 matches with core identity fields.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Substring to match against institution name."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("institutions")
      .select(
        "unitid,name,city,state,sector,carnegie_id,research2025name,ic2025group,enrollment"
      )
      .ilike("name", `%${query}%`)
      .limit(limit ?? 25);
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
