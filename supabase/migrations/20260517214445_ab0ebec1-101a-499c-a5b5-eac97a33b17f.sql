REVOKE EXECUTE ON FUNCTION public.upsert_institutions_full(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_institutions_full(jsonb) TO service_role;