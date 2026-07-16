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
  name: "get_institution",
  title: "Get institution profile",
  description:
    "Fetch the full institutional profile (identity, flags, rankings, metrics, finance) for a single UNITID.",
  inputSchema: {
    unitid: z.string().trim().min(1).describe("IPEDS UNITID of the institution."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ unitid }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("institutions")
      .select("*")
      .eq("unitid", unitid)
      .maybeSingle();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return { content: [{ type: "text", text: `No institution found for UNITID ${unitid}` }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { institution: data },
    };
  },
});
