CREATE OR REPLACE FUNCTION public.upsert_institutions_full(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(payload) AS x(
      unitid text, name text, city text, state text,
      sector text, carnegie_id text, us_news_list text,
      flags jsonb, enrollment integer, fte integer,
      metrics jsonb, finance jsonb, rankings jsonb,
      carnegie2025 jsonb, fiscal_year text
    )
  )
  INSERT INTO public.institutions
    (unitid, name, city, state, sector, carnegie_id, us_news_list,
     flags, enrollment, fte, metrics, finance, rankings, carnegie2025, fiscal_year)
  SELECT unitid, name, city, state, sector, carnegie_id, us_news_list,
     COALESCE(flags, '{}'::jsonb), enrollment, fte,
     COALESCE(metrics, '{}'::jsonb), COALESCE(finance, '{}'::jsonb),
     COALESCE(rankings, '{}'::jsonb), carnegie2025, fiscal_year
  FROM src
  ON CONFLICT (unitid) DO UPDATE SET
    name         = EXCLUDED.name,
    city         = EXCLUDED.city,
    state        = EXCLUDED.state,
    sector       = EXCLUDED.sector,
    carnegie_id  = EXCLUDED.carnegie_id,
    us_news_list = EXCLUDED.us_news_list,
    flags        = EXCLUDED.flags,
    enrollment   = EXCLUDED.enrollment,
    fte          = EXCLUDED.fte,
    metrics      = EXCLUDED.metrics,
    finance      = EXCLUDED.finance,
    rankings     = EXCLUDED.rankings,
    carnegie2025 = COALESCE(EXCLUDED.carnegie2025, public.institutions.carnegie2025),
    fiscal_year  = EXCLUDED.fiscal_year,
    updated_at   = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;