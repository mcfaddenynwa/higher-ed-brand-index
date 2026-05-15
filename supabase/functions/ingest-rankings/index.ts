import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Shared-token auth (so the public anon key alone can't write)
  const expected = Deno.env.get("INGEST_RANKINGS_TOKEN");
  if (!expected) return json({ error: "Server missing INGEST_RANKINGS_TOKEN" }, 500);
  const provided = req.headers.get("x-ingest-token");
  if (provided !== expected) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const source = body?.source;
  const rankings = body?.rankings;
  if (source !== "niche" && source !== "usnews") {
    return json({ error: "source must be 'niche' or 'usnews'" }, 400);
  }
  if (!rankings || typeof rankings !== "object" || Array.isArray(rankings)) {
    return json({ error: "rankings must be an object keyed by unitid" }, 400);
  }
  const entries = Object.entries(rankings as Record<string, Record<string, unknown>>);
  if (entries.length === 0) return json({ error: "rankings is empty" }, 400);
  if (entries.length > 10000) return json({ error: "Too many records (max 10000)" }, 400);

  for (const [unitid, fields] of entries) {
    if (!unitid || typeof unitid !== "string") {
      return json({ error: `Invalid unitid: ${unitid}` }, 400);
    }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return json({ error: `Fields for ${unitid} must be an object` }, 400);
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let updated = 0;
  let failed = 0;
  const skipped: string[] = [];
  const errors: Array<{ unitid: string; error: string }> = [];

  for (const [unitid, fields] of entries) {
    try {
      const { data: current, error: fetchErr } = await supabase
        .from("institutions")
        .select("rankings, us_news_list")
        .eq("unitid", unitid)
        .maybeSingle();

      if (fetchErr) {
        failed++;
        errors.push({ unitid, error: fetchErr.message });
        continue;
      }
      if (!current) {
        skipped.push(unitid);
        continue;
      }

      const merged = { ...(current.rankings || {}), ...(fields as Record<string, unknown>) };
      const updates: Record<string, unknown> = { rankings: merged };

      // For US News payloads, mirror the dedicated us_news_list column too
      if (source === "usnews" && typeof (fields as any).usNewsList === "string") {
        updates.us_news_list = (fields as any).usNewsList;
      }

      const { error: updErr } = await supabase
        .from("institutions")
        .update(updates)
        .eq("unitid", unitid);

      if (updErr) {
        failed++;
        errors.push({ unitid, error: updErr.message });
      } else {
        updated++;
      }
    } catch (e) {
      failed++;
      errors.push({ unitid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({
    ok: true,
    source,
    received: entries.length,
    updated,
    failed,
    skipped,
    errors: errors.slice(0, 20), // cap response size
  });
});
