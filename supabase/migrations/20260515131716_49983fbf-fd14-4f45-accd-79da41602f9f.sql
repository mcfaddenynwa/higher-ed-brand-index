
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS ic2025 smallint,
  ADD COLUMN IF NOT EXISTS ic2025name text,
  ADD COLUMN IF NOT EXISTS ic2025group text,
  ADD COLUMN IF NOT EXISTS research2025 smallint,
  ADD COLUMN IF NOT EXISTS research2025name text,
  ADD COLUMN IF NOT EXISTS saec2025 smallint,
  ADD COLUMN IF NOT EXISTS saec2025name text,
  ADD COLUMN IF NOT EXISTS access_ratio numeric,
  ADD COLUMN IF NOT EXISTS earnings_ratio numeric,
  ADD COLUMN IF NOT EXISTS pell_2023 numeric;

CREATE INDEX IF NOT EXISTS institutions_ic2025group_idx ON public.institutions (ic2025group);
CREATE INDEX IF NOT EXISTS institutions_ic2025_idx ON public.institutions (ic2025);
