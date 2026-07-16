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
  name: "list_r1_institutions",
  title: "List R1 institutions",
  description:
    "List Carnegie R1 (Research 1) doctoral universities with core identity fields. Optionally filter by state.",
  inputSchema: {
    state: z.string().trim().length(2).optional().describe("Two-letter state code, e.g. 'CA'."),
    limit: z.number().int().min(1).max(300).optional().describe("Max rows (default 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ state, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("institutions")
      .select("unitid,name,city,state,sector,enrollment,research2025name")
      .eq("research2025", 1)
      .order("name", { ascending: true })
      .limit(limit ?? 200);
    if (state) q = q.eq("state", state.toUpperCase());
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { count: data?.length ?? 0, results: data ?? [] },
    };
  },
});
