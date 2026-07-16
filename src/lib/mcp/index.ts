import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchInstitutions from "./tools/search_institutions";
import getInstitution from "./tools/get_institution";
import listR1Institutions from "./tools/list_r1_institutions";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "higher-ed-brand-index-mcp",
  title: "Higher Ed Brand Index",
  version: "0.1.0",
  instructions:
    "Tools for exploring the mcfadden+co Higher Ed Brand Index dataset of U.S. colleges and universities. Use `search_institutions` to find schools by name, `list_r1_institutions` to enumerate Carnegie R1 doctoral universities, and `get_institution` to fetch a full profile (identity, flags, rankings, metrics, finance) by UNITID.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchInstitutions, getInstitution, listR1Institutions],
});
