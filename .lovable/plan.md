# Migration Plan

Run the uploaded SQL migration against the Lovable Cloud database.

## What it does
- Adds `carnegie2025` JSONB column to `institutions` (nullable)
- Enables `pg_trgm` extension
- Adds indexes: trigram on `name`, btree on `carnegie_id`, `state`, unique on `unitid`
- Re-affirms RLS public read policy (already exists as "Institutions are readable by everyone" — this adds a second equivalent "Public read access" policy)

## Steps
1. Execute the SQL via the migration tool (one call, full script as provided).
2. The `types.ts` file regenerates automatically after the migration is applied — no manual edit needed. `carnegie2025: Json | null` will appear in Row/Insert/Update.

## Note
The migration is additive and safe — no data loss, no breaking changes to existing code.
