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
    const rows = Array.isArray(body?.institutions) ? body.institutions : null;
    if (!rows) {
      return new Response(JSON.stringify({ error: "Expected { institutions: [...] }" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Whitelist columns. 2025 Carnegie fields are first-class columns now.
    const cleaned = rows.map((r: any) => ({
      unitid:           String(r.unitid),
      name:             r.name,
      city:             r.city ?? null,
      state:            r.state ?? null,
      sector:           r.sector ?? null,
      us_news_list:     r.us_news_list ?? null,
      flags:            r.flags ?? {},
      enrollment:       r.enrollment ?? null,
      fte:              r.fte ?? null,
      metrics:          r.metrics ?? {},
      finance:          r.finance ?? {},
      rankings:         r.rankings ?? {},
      fiscal_year:      r.fiscal_year ?? null,
      ic2025:           r.ic2025 ?? null,
      ic2025name:       r.ic2025name ?? null,
      ic2025group:      r.ic2025group ?? null,
      research2025:     r.research2025 ?? null,
      research2025name: r.research2025name ?? null,
      saec2025:         r.saec2025 ?? null,
      saec2025name:     r.saec2025name ?? null,
      access_ratio:     r.access_ratio ?? null,
      earnings_ratio:   r.earnings_ratio ?? null,
      pell_2023:        r.pell_2023 ?? null,
      updated_at:       new Date().toISOString(),
    }));

    const CHUNK = 250;
    let inserted = 0;
    for (let i = 0; i < cleaned.length; i += CHUNK) {
      const slice = cleaned.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("institutions")
        .upsert(slice, { onConflict: "unitid" });
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
