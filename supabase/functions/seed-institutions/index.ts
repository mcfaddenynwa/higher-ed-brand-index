import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = await req.json();
    // Accept either { institutions: { unitid: row, ... } } (new seed JSON shape)
    // or { institutions: [...] } (legacy array shape).
    let rows: any[] | null = null;
    if (body?.institutions) {
      rows = Array.isArray(body.institutions)
        ? body.institutions
        : Object.values(body.institutions);
    }
    if (!rows) {
      return new Response(JSON.stringify({ error: "Expected { institutions: [...] | {...} }" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = rows.map((r: any) => ({
      unitid:       String(r.unitid),
      name:         r.name ?? null,
      city:         r.city ?? null,
      state:        r.state ?? null,
      sector:       r.sector ?? null,
      carnegie_id:  r.carnegie_id ?? null,
      us_news_list: r.us_news_list ?? null,
      flags:        r.flags ?? {},
      enrollment:   r.enrollment ?? null,
      fte:          r.fte ?? null,
      metrics:      r.metrics ?? {},
      finance:      r.finance ?? {},
      rankings:     r.rankings ?? {},
      carnegie2025: r.carnegie2025 ?? null,
      fiscal_year:  r.fiscal_year ?? null,
    }));

    const CHUNK = 300;
    let inserted = 0;
    for (let i = 0; i < cleaned.length; i += CHUNK) {
      const slice = cleaned.slice(i, i + CHUNK);
      const { error } = await supabase.rpc("upsert_institutions_full", { payload: slice });
      if (error) throw new Error(`Chunk ${i}: ${error.message}`);
      inserted += slice.length;
    }

    return new Response(JSON.stringify({ ok: true, inserted, totalReceived: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("seed-institutions error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
