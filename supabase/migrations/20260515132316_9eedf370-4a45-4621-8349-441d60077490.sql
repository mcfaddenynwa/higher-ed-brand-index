
CREATE OR REPLACE FUNCTION public.upsert_institutions_2025(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(payload) AS x(
      unitid text, name text, city text, state text,
      ic2025 smallint, ic2025name text, ic2025group text,
      research2025 smallint, research2025name text,
      saec2025 smallint, saec2025name text,
      access_ratio numeric, earnings_ratio numeric, pell_2023 numeric
    )
  )
  INSERT INTO public.institutions
    (unitid, name, city, state,
     ic2025, ic2025name, ic2025group,
     research2025, research2025name,
     saec2025, saec2025name,
     access_ratio, earnings_ratio, pell_2023)
  SELECT unitid, name, city, state,
         ic2025, ic2025name, ic2025group,
         research2025, research2025name,
         saec2025, saec2025name,
         access_ratio, earnings_ratio, pell_2023
  FROM src
  ON CONFLICT (unitid) DO UPDATE SET
    name             = COALESCE(public.institutions.name, EXCLUDED.name),
    city             = COALESCE(public.institutions.city, EXCLUDED.city),
    state            = COALESCE(public.institutions.state, EXCLUDED.state),
    ic2025           = EXCLUDED.ic2025,
    ic2025name       = EXCLUDED.ic2025name,
    ic2025group      = EXCLUDED.ic2025group,
    research2025     = EXCLUDED.research2025,
    research2025name = EXCLUDED.research2025name,
    saec2025         = EXCLUDED.saec2025,
    saec2025name     = EXCLUDED.saec2025name,
    access_ratio     = EXCLUDED.access_ratio,
    earnings_ratio   = EXCLUDED.earnings_ratio,
    pell_2023        = EXCLUDED.pell_2023,
    updated_at       = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_institutions_2025(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_institutions_2025(jsonb) TO service_role;
