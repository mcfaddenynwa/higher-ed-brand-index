ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS carnegie2025 JSONB DEFAULT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm
  ON public.institutions USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_institutions_carnegie
  ON public.institutions (carnegie_id);

CREATE INDEX IF NOT EXISTS idx_institutions_state
  ON public.institutions (state);

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_unitid
  ON public.institutions (unitid);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.institutions;
CREATE POLICY "Public read access"
  ON public.institutions FOR SELECT
  USING (true);