import { useState, useEffect, useRef, useMemo } from "react";
import InsightReport from "../components/InsightReport";
import { scorePool, buildCohort, cohortTopLine } from "../lib/insightFramework";
import financeSnapshot from "../data/financeSnapshot.json";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";

// Map a 2025 IC + Research Activity Designation to the legacy 12-bucket
// `carnegieId` used internally for weights, benchmarks and peer cohort lenses.
// Research 1/2/RCU dominates IC when present.
function deriveCarnegieId(ic2025, research2025) {
  if (research2025 === 1) return "r1";
  if (research2025 === 2) return "r2";
  if (research2025 === 3) return "rcu";
  if (ic2025 == null) return "";
  if ([6, 7, 8].includes(ic2025)) return "mixed_doc";
  if ([16, 17, 18].includes(ic2025)) return "prof_doc";
  if ([9, 10].includes(ic2025)) return "mixed_masters";
  if ([19, 20].includes(ic2025)) return "prof_masters";
  if (ic2025 === 22) return "bac_arts";
  if ([4, 5].includes(ic2025)) return "mixed_bac";
  if ([13, 14, 15].includes(ic2025)) return "prof_bac";
  if (ic2025 >= 21 && ic2025 <= 31) return "special";
  return "";
}

// 2025 Research Activity Designation (1=R1, 2=R2, 3=RCU) → legacy
// researchDesignation field (3=High, 2=Moderate, 1=Low, 0=None) used by scoring.
function research2025ToScoreVal(r) {
  if (r === 1) return 3;
  if (r === 2) return 2;
  if (r === 3) return 1;
  return 0;
}

// Flatten a row from the `institutions` table into the IPEDS_DB shape
// so the rest of the form / scoring code can stay untouched.
function flattenInstitutionRow(r) {
  const carnegieId = deriveCarnegieId(r.ic2025, r.research2025);
  return {
    name: r.name,
    unitid: r.unitid,
    city: r.city,
    state: r.state,
    carnegieId,
    ic2025: r.ic2025,
    ic2025name: r.ic2025name,
    ic2025group: r.ic2025group,
    research2025: r.research2025,
    research2025name: r.research2025name,
    saec2025: r.saec2025,
    saec2025name: r.saec2025name,
    accessRatio: r.access_ratio,
    earningsRatio: r.earnings_ratio,
    pellPct: r.pell_2023 != null ? Math.round(r.pell_2023 * 100) : undefined,
    usNewsList: r.us_news_list,
    flags: r.flags || {},
    fte: r.fte,
    enrollment: r.enrollment,
    ...(r.metrics || {}),
    ...(r.rankings || {}),
    ...(r.finance || {}),
  };
}

// 26 four-year IC2025 cohorts grouped for the Classify dropdown.
// Excludes ic 1, 2, 3, 11, 12 (Associate-only).
const IC2025_COHORTS = [
  // Associate / Baccalaureate
  { id: 4,  group: "Associate/Baccalaureate", label: "Mixed Associate/Baccalaureate" },
  { id: 13, group: "Associate/Baccalaureate", label: "Professions-focused Associate/Baccalaureate" },
  // Baccalaureate
  { id: 5,  group: "Baccalaureate", label: "Mixed Baccalaureate" },
  { id: 14, group: "Baccalaureate", label: "Professions-focused Baccalaureate Medium" },
  { id: 15, group: "Baccalaureate", label: "Professions-focused Baccalaureate Small" },
  // Master's
  { id: 9,  group: "Master's", label: "Mixed Undergraduate/Graduate-Master's Large/Medium" },
  { id: 10, group: "Master's", label: "Mixed Undergraduate/Graduate-Master's Small" },
  { id: 19, group: "Master's", label: "Professions-focused Undergraduate/Graduate-Master's Large/Medium" },
  { id: 20, group: "Master's", label: "Professions-focused Undergraduate/Graduate-Master's Small" },
  // Doctorate
  { id: 6,  group: "Doctorate", label: "Mixed Undergraduate/Graduate-Doctorate Large" },
  { id: 7,  group: "Doctorate", label: "Mixed Undergraduate/Graduate-Doctorate Medium" },
  { id: 8,  group: "Doctorate", label: "Mixed Undergraduate/Graduate-Doctorate Small" },
  { id: 16, group: "Doctorate", label: "Professions-focused Undergraduate/Graduate-Doctorate Large" },
  { id: 17, group: "Doctorate", label: "Professions-focused Undergraduate/Graduate-Doctorate Medium" },
  { id: 18, group: "Doctorate", label: "Professions-focused Undergraduate/Graduate-Doctorate Small" },
  // Special Focus
  { id: 21, group: "Special Focus", label: "Special Focus: Applied and Career Studies" },
  { id: 22, group: "Special Focus", label: "Special Focus: Arts and Sciences" },
  { id: 23, group: "Special Focus", label: "Special Focus: Arts, Music, and Design" },
  { id: 24, group: "Special Focus", label: "Special Focus: Business" },
  { id: 25, group: "Special Focus", label: "Special Focus: Graduate Studies" },
  { id: 26, group: "Special Focus", label: "Special Focus: Law" },
  { id: 27, group: "Special Focus", label: "Special Focus: Medical Schools and Centers" },
  { id: 28, group: "Special Focus", label: "Special Focus: Nursing" },
  { id: 29, group: "Special Focus", label: "Special Focus: Other Health Professions" },
  { id: 30, group: "Special Focus", label: "Special Focus: Technology, Engineering, and Sciences" },
  { id: 31, group: "Special Focus", label: "Special Focus: Theological Studies" },
];

const IC2025_GROUP_ORDER = ["Doctorate", "Master's", "Baccalaureate", "Associate/Baccalaureate", "Special Focus"];

// Short blurbs surfaced under the auto-detected classification.
const IC2025_DESCRIPTIONS = {
  4:  "Mix of associate and bachelor's programs across multiple fields.",
  5:  "Bachelor's-dominant institution with a balanced academic and professional mix.",
  6:  "Large doctoral institution with a balanced academic and professional mix.",
  7:  "Medium doctoral institution with a balanced academic and professional mix.",
  8:  "Small doctoral institution with a balanced academic and professional mix.",
  9:  "Master's-dominant institution (large/medium) with a balanced academic and professional mix.",
  10: "Master's-dominant institution (small) with a balanced academic and professional mix.",
  13: "Mix of associate and bachelor's programs concentrated in professional fields.",
  14: "Bachelor's-dominant institution (medium) concentrated in professional fields.",
  15: "Bachelor's-dominant institution (small) concentrated in professional fields.",
  16: "Large doctoral institution concentrated in professional fields.",
  17: "Medium doctoral institution concentrated in professional fields.",
  18: "Small doctoral institution concentrated in professional fields.",
  19: "Master's-dominant institution (large/medium) concentrated in professional fields.",
  20: "Master's-dominant institution (small) concentrated in professional fields.",
  21: "Special Focus institution centered on applied and career studies programs.",
  22: "Special Focus institution centered on the arts and sciences (liberal arts).",
  23: "Special Focus institution centered on arts, music, and design.",
  24: "Special Focus institution centered on business and management.",
  25: "Special Focus institution centered on graduate-only studies.",
  26: "Special Focus institution centered on law.",
  27: "Special Focus institution centered on medical schools and centers.",
  28: "Special Focus institution centered on nursing.",
  29: "Special Focus institution centered on other health professions.",
  30: "Special Focus institution centered on technology, engineering, and sciences.",
  31: "Special Focus institution centered on theological studies.",
};
// LOVABLE SETUP: Add this to your index.html <head>:
//

// ─── SAMPLE IPEDS DATABASE (50 institutions) ───────────────────────────────
// Real build: replace with full IPEDS extract keyed by unitid
const IPEDS_DB = [
  { name: "Pennsylvania State University", unitid: "214777", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 331, theWorldRank: 161, usNewsLaw: 64, usNewsBiz: 37, usNewsEng: 20, nicheRank: 25, nicheGrade: 91, theImpactListed: 1, theImpactRank: 601, retentionRate: 93, gradRate4yr: 68, gradRate6yr: 86, carnegieId: "r1", usNews: 60, enrollTrend: 1.2, yieldRate: 26, acceptRate: 54, pellPct: 22, firstGen: 18, rAndD: 998, doctoralOutput: 820, researchDesignation: 3, caldwellListed: 1, caldwellRank: 58 },
  { name: "University of Michigan", unitid: "170976", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 23, theWorldRank: 26, usNewsLaw: 9, usNewsBiz: 11, usNewsEng: 5, nicheRank: 2, nicheGrade: 100, theImpactListed: 1, theImpactRank: 201, retentionRate: 97, gradRate4yr: 79, gradRate6yr: 92, carnegieId: "r1", usNews: 23, enrollTrend: 2.1, yieldRate: 40, acceptRate: 18, pellPct: 16, firstGen: 14, rAndD: 1621, doctoralOutput: 1120, researchDesignation: 3, caldwellListed: 1, caldwellRank: 12 },
  { name: "Ohio State University", unitid: "204796", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 171, theWorldRank: 121, usNewsLaw: 33, usNewsBiz: 25, usNewsEng: 19, nicheRank: 22, nicheGrade: 91, theImpactListed: 1, theImpactRank: 401, retentionRate: 94, gradRate4yr: 61, gradRate6yr: 84, carnegieId: "r1", usNews: 44, enrollTrend: 0.8, yieldRate: 35, acceptRate: 48, pellPct: 21, firstGen: 17, rAndD: 1089, doctoralOutput: 980, researchDesignation: 3, caldwellListed: 1, caldwellRank: 24 },
  { name: "University of Wisconsin-Madison", unitid: "240444", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 155, theWorldRank: 97, usNewsLaw: 33, usNewsBiz: 41, usNewsEng: 18, nicheRank: 8, nicheGrade: 100, theImpactListed: 1, theImpactRank: 301, retentionRate: 95, gradRate4yr: 60, gradRate6yr: 88, carnegieId: "r1", usNews: 35, enrollTrend: 1.5, yieldRate: 37, acceptRate: 51, pellPct: 18, firstGen: 15, rAndD: 1312, doctoralOutput: 890, researchDesignation: 3, caldwellListed: 1, caldwellRank: 18 },
  { name: "Indiana University Bloomington", unitid: "151351", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 0 },  qsRank: 531, theWorldRank: 301, usNewsLaw: null, usNewsBiz: 26, usNewsEng: null, nicheRank: 72, nicheGrade: 83, theImpactListed: 1, theImpactRank: 801, retentionRate: 90, gradRate4yr: 57, gradRate6yr: 77, carnegieId: "r1", usNews: 68, enrollTrend: -0.5, yieldRate: 28, acceptRate: 82, pellPct: 20, firstGen: 16, rAndD: 612, doctoralOutput: 610, researchDesignation: 3, caldwellListed: 1, caldwellRank: 95 },
  { name: "Purdue University", unitid: "243780", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 0, law: 0, aacsb: 1, eng: 1 },  qsRank: 241, theWorldRank: 201, usNewsLaw: null, usNewsBiz: null, usNewsEng: 8, nicheRank: 55, nicheGrade: 83, theImpactListed: 1, theImpactRank: 601, retentionRate: 92, gradRate4yr: 62, gradRate6yr: 80, carnegieId: "r1", usNews: 53, enrollTrend: 3.2, yieldRate: 32, acceptRate: 60, pellPct: 19, firstGen: 17, rAndD: 721, doctoralOutput: 720, researchDesignation: 3, caldwellListed: 1, caldwellRank: 72 },
  { name: "University of Illinois Urbana-Champaign", unitid: "145637", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 0, law: 1, aacsb: 1, eng: 1 },  qsRank: 82, theWorldRank: 71, usNewsLaw: 26, usNewsBiz: 23, usNewsEng: 4, nicheRank: 12, nicheGrade: 100, theImpactListed: 1, theImpactRank: 401, retentionRate: 93, gradRate4yr: 68, gradRate6yr: 84, carnegieId: "r1", usNews: 35, enrollTrend: 2.8, yieldRate: 37, acceptRate: 45, pellPct: 21, firstGen: 17, rAndD: 872, doctoralOutput: 850, researchDesignation: 3, caldwellListed: 1, caldwellRank: 31 },
  { name: "Michigan State University", unitid: "171100", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 0, aacsb: 1, eng: 1 },  qsRank: 331, theWorldRank: 251, usNewsLaw: null, usNewsBiz: 46, usNewsEng: 16, nicheRank: 45, nicheGrade: 91, theImpactListed: 1, theImpactRank: 601, retentionRate: 89, gradRate4yr: 52, gradRate6yr: 76, carnegieId: "r1", usNews: 73, enrollTrend: -1.1, yieldRate: 26, acceptRate: 76, pellPct: 24, firstGen: 20, rAndD: 748, doctoralOutput: 680, researchDesignation: 3, caldwellListed: 1, caldwellRank: 88 },
  { name: "University of Minnesota", unitid: "174066", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 241, theWorldRank: 121, usNewsLaw: 21, usNewsBiz: 32, usNewsEng: 24, nicheRank: 28, nicheGrade: 91, theImpactListed: 1, theImpactRank: 501, retentionRate: 93, gradRate4yr: 58, gradRate6yr: 81, carnegieId: "r1", usNews: 58, enrollTrend: 0.3, yieldRate: 32, acceptRate: 57, pellPct: 20, firstGen: 16, rAndD: 901, doctoralOutput: 790, researchDesignation: 3, caldwellListed: 1, caldwellRank: 44 },
  { name: "University of North Carolina Chapel Hill", unitid: "199120", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 155, theWorldRank: 73, usNewsLaw: 22, usNewsBiz: null, usNewsEng: null, nicheRank: 18, nicheGrade: 100, theImpactListed: 1, theImpactRank: 301, retentionRate: 97, gradRate4yr: 82, gradRate6yr: 91, carnegieId: "r1", usNews: 28, enrollTrend: 1.9, yieldRate: 44, acceptRate: 19, pellPct: 23, firstGen: 18, rAndD: 1102, doctoralOutput: 760, researchDesignation: 3, caldwellListed: 1, caldwellRank: 27 },
  { name: "University of Virginia", unitid: "234076", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 218, theWorldRank: 121, usNewsLaw: 27, usNewsBiz: null, usNewsEng: null, nicheRank: 20, nicheGrade: 100, theImpactListed: 1, theImpactRank: 401, retentionRate: 97, gradRate4yr: 87, gradRate6yr: 94, carnegieId: "r1", usNews: 25, enrollTrend: 1.4, yieldRate: 41, acceptRate: 21, pellPct: 14, firstGen: 12, rAndD: 512, doctoralOutput: 540, researchDesignation: 3, caldwellListed: 1, caldwellRank: 38 },
  { name: "Rutgers University-New Brunswick", unitid: "186380", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 531, theWorldRank: 401, usNewsLaw: null, usNewsBiz: null, usNewsEng: 33, nicheRank: 70, nicheGrade: 83, theImpactListed: 1, theImpactRank: 601, retentionRate: 90, gradRate4yr: 55, gradRate6yr: 72, carnegieId: "r1", usNews: 62, enrollTrend: 0.7, yieldRate: 24, acceptRate: 66, pellPct: 28, firstGen: 24, rAndD: 789, doctoralOutput: 680, researchDesignation: 3, caldwellListed: 1, caldwellRank: 81 },
  { name: "University of Iowa", unitid: "153658", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 531, theWorldRank: 401, usNewsLaw: null, usNewsBiz: 48, usNewsEng: null, nicheRank: 85, nicheGrade: 83, theImpactListed: 1, theImpactRank: 801, retentionRate: 86, gradRate4yr: 47, gradRate6yr: 71, carnegieId: "r1", usNews: 88, enrollTrend: -0.9, yieldRate: 30, acceptRate: 84, pellPct: 22, firstGen: 19, rAndD: 612, doctoralOutput: 580, researchDesignation: 3, caldwellListed: 1, caldwellRank: 112 },
  { name: "University of Pittsburgh", unitid: "215293", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 1, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 461, theWorldRank: 251, usNewsLaw: null, usNewsBiz: null, usNewsEng: 29, nicheRank: 65, nicheGrade: 83, theImpactListed: 1, theImpactRank: 601, retentionRate: 92, gradRate4yr: 61, gradRate6yr: 78, carnegieId: "r1", usNews: 52, enrollTrend: 1.8, yieldRate: 25, acceptRate: 56, pellPct: 19, firstGen: 16, rAndD: 831, doctoralOutput: 620, researchDesignation: 3, caldwellListed: 1, caldwellRank: 66 },
  { name: "University of Maryland", unitid: "163286", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 461, theWorldRank: 251, usNewsLaw: null, usNewsBiz: 44, usNewsEng: 21, nicheRank: 38, nicheGrade: 91, theImpactListed: 1, theImpactRank: 401, retentionRate: 94, gradRate4yr: 66, gradRate6yr: 83, carnegieId: "r1", usNews: 42, enrollTrend: 2.2, yieldRate: 29, acceptRate: 44, pellPct: 20, firstGen: 16, rAndD: 743, doctoralOutput: 710, researchDesignation: 3, caldwellListed: 1, caldwellRank: 52 },
  { name: "Texas A&M University", unitid: "228723", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 0, aacsb: 1, eng: 1 },  qsRank: 331, theWorldRank: 201, usNewsLaw: null, usNewsBiz: 42, usNewsEng: 13, nicheRank: 30, nicheGrade: 91, theImpactListed: 1, theImpactRank: 601, retentionRate: 90, gradRate4yr: 57, gradRate6yr: 79, carnegieId: "r1", usNews: 66, enrollTrend: 3.4, yieldRate: 38, acceptRate: 63, pellPct: 23, firstGen: 20, rAndD: 1021, doctoralOutput: 860, researchDesignation: 3, caldwellListed: 1, caldwellRank: 42 },
  { name: "University of Texas at Austin", unitid: "228778", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 65, theWorldRank: 67, usNewsLaw: 15, usNewsBiz: 17, usNewsEng: 11, nicheRank: 14, nicheGrade: 100, theImpactListed: 1, theImpactRank: 301, retentionRate: 96, gradRate4yr: 72, gradRate6yr: 83, carnegieId: "r1", usNews: 32, enrollTrend: 1.6, yieldRate: 38, acceptRate: 31, pellPct: 22, firstGen: 18, rAndD: 782, doctoralOutput: 810, researchDesignation: 3, caldwellListed: 1, caldwellRank: 35 },
  { name: "University of Florida", unitid: "134130", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 170, theWorldRank: 132, usNewsLaw: 23, usNewsBiz: 45, usNewsEng: 17, nicheRank: 35, nicheGrade: 91, theImpactListed: 1, theImpactRank: 201, retentionRate: 97, gradRate4yr: 68, gradRate6yr: 88, carnegieId: "r1", usNews: 28, enrollTrend: 2.9, yieldRate: 43, acceptRate: 24, pellPct: 24, firstGen: 20, rAndD: 912, doctoralOutput: 780, researchDesignation: 3, caldwellListed: 1, caldwellRank: 29 },
  { name: "University of Washington", unitid: "236948", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 59, theWorldRank: 29, usNewsLaw: 13, usNewsBiz: 19, usNewsEng: 10, nicheRank: 16, nicheGrade: 100, theImpactListed: 1, theImpactRank: 201, retentionRate: 94, gradRate4yr: 69, gradRate6yr: 84, carnegieId: "r1", usNews: 49, enrollTrend: 2.4, yieldRate: 34, acceptRate: 52, pellPct: 21, firstGen: 17, rAndD: 1421, doctoralOutput: 920, researchDesignation: 3, caldwellListed: 1, caldwellRank: 16 },
  { name: "Arizona State University", unitid: "104151", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 216, theWorldRank: 301, usNewsLaw: 26, usNewsBiz: 29, usNewsEng: 22, nicheRank: 42, nicheGrade: 91, theImpactListed: 1, theImpactRank: 201, retentionRate: 84, gradRate4yr: 45, gradRate6yr: 63, carnegieId: "r1", usNews: 117, enrollTrend: 5.8, yieldRate: 28, acceptRate: 88, pellPct: 32, firstGen: 28, rAndD: 612, doctoralOutput: 720, researchDesignation: 3, caldwellListed: 1, caldwellRank: 98 },
  { name: "University of Georgia", unitid: "139959", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 388, theWorldRank: 301, usNewsLaw: 26, usNewsBiz: null, usNewsEng: null, nicheRank: 50, nicheGrade: 91, theImpactListed: 1, theImpactRank: 601, retentionRate: 94, gradRate4yr: 65, gradRate6yr: 83, carnegieId: "r1", usNews: 46, enrollTrend: 2.1, yieldRate: 36, acceptRate: 45, pellPct: 21, firstGen: 17, rAndD: 481, doctoralOutput: 610, researchDesignation: 3, caldwellListed: 1, caldwellRank: 78 },
  { name: "Iowa State University", unitid: "153603", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 0, law: 0, aacsb: 1, eng: 1 },  qsRank: 591, theWorldRank: 401, usNewsLaw: null, usNewsBiz: null, usNewsEng: 28, nicheRank: 90, nicheGrade: 83, theImpactListed: 1, theImpactRank: 801, retentionRate: 83, gradRate4yr: 44, gradRate6yr: 64, carnegieId: "r1", usNews: 103, enrollTrend: -1.8, yieldRate: 28, acceptRate: 91, pellPct: 23, firstGen: 20, rAndD: 498, doctoralOutput: 520, researchDesignation: 3, caldwellListed: 1, caldwellRank: 148 },
  { name: "University of Colorado Boulder", unitid: "126614", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 0, law: 1, aacsb: 1, eng: 1 },  qsRank: 281, theWorldRank: 251, usNewsLaw: null, usNewsBiz: null, usNewsEng: 27, nicheRank: 60, nicheGrade: 83, theImpactListed: 1, theImpactRank: 601, retentionRate: 85, gradRate4yr: 47, gradRate6yr: 67, carnegieId: "r1", usNews: 90, enrollTrend: 1.4, yieldRate: 24, acceptRate: 80, pellPct: 18, firstGen: 15, rAndD: 612, doctoralOutput: 560, researchDesignation: 3, caldwellListed: 1, caldwellRank: 108 },
  { name: "University of Kansas", unitid: "155317", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 651, theWorldRank: null, nicheRank: 95, nicheGrade: 83, theImpactListed: 0, theImpactRank: null, retentionRate: 79, gradRate4yr: 38, gradRate6yr: 60, carnegieId: "r2", usNews: 148, enrollTrend: -2.1, yieldRate: 30, acceptRate: 92, pellPct: 25, firstGen: 22, rAndD: 312, doctoralOutput: 380, researchDesignation: 2, caldwellListed: 1, caldwellRank: 220 },
  { name: "University of Nebraska-Lincoln", unitid: "181464", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 1, aacsb: 1, eng: 1 },  qsRank: 651, theWorldRank: null, nicheRank: 100, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 82, gradRate4yr: 43, gradRate6yr: 62, carnegieId: "r1", usNews: 134, enrollTrend: -0.4, yieldRate: 35, acceptRate: 78, pellPct: 22, firstGen: 19, rAndD: 298, doctoralOutput: 360, researchDesignation: 2, caldwellListed: 1, caldwellRank: 242 },
  { name: "Virginia Tech", unitid: "233921", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 0, law: 0, aacsb: 1, eng: 1 },  qsRank: 388, theWorldRank: 401, usNewsLaw: null, usNewsBiz: null, usNewsEng: 15, nicheRank: 80, nicheGrade: 83, theImpactListed: 1, theImpactRank: 801, retentionRate: 91, gradRate4yr: 62, gradRate6yr: 82, carnegieId: "r1", usNews: 62, enrollTrend: 1.8, yieldRate: 33, acceptRate: 65, pellPct: 18, firstGen: 15, rAndD: 621, doctoralOutput: 580, researchDesignation: 3, caldwellListed: 1, caldwellRank: 84 },
  { name: "Auburn University", unitid: "100858", usNewsList: "natl_univ", flags: { bigFour: 1, d1: 0, health: 1, law: 0, aacsb: 1, eng: 1 },  qsRank: 731, theWorldRank: null, nicheRank: 110, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 87, gradRate4yr: 56, gradRate6yr: 72, carnegieId: "r1", usNews: 97, enrollTrend: 2.2, yieldRate: 28, acceptRate: 77, pellPct: 20, firstGen: 17, rAndD: 198, doctoralOutput: 420, researchDesignation: 2, caldwellListed: 1, caldwellRank: 189 },
  { name: "Drexel University", unitid: "214591", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 1, health: 1, law: 0, aacsb: 1, eng: 1 },  qsRank: 651, theWorldRank: null, nicheRank: 120, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 85, gradRate4yr: 46, gradRate6yr: 62, carnegieId: "r1", usNews: 96, enrollTrend: -3.2, yieldRate: 14, acceptRate: 78, pellPct: 26, firstGen: 22, rAndD: 142, doctoralOutput: 310, researchDesignation: 2, caldwellListed: 0, caldwellRank: null },
  { name: "Duquesne University", unitid: "212577", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 180, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 83, gradRate4yr: 52, gradRate6yr: 69, carnegieId: "r2", usNews: 162, enrollTrend: -1.9, yieldRate: 18, acceptRate: 74, pellPct: 28, firstGen: 23, rAndD: 42, doctoralOutput: 180, researchDesignation: 1, caldwellListed: 0, caldwellRank: null },
  { name: "American University", unitid: "131159", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 0 },  qsRank: 651, theWorldRank: null, nicheRank: 140, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 87, gradRate4yr: 58, gradRate6yr: 73, carnegieId: "r1", usNews: 81, enrollTrend: 0.4, yieldRate: 17, acceptRate: 35, pellPct: 21, firstGen: 18, rAndD: 28, doctoralOutput: 140, researchDesignation: 1, caldwellListed: 0, caldwellRank: null },
  { name: "Fordham University", unitid: "192439", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 0 },  qsRank: 651, theWorldRank: null, nicheRank: 160, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 88, gradRate4yr: 62, gradRate6yr: 76, carnegieId: "r2", usNews: 74, enrollTrend: 0.9, yieldRate: 20, acceptRate: 54, pellPct: 25, firstGen: 20, rAndD: 52, doctoralOutput: 280, researchDesignation: 2, caldwellListed: 0, caldwellRank: null },
  { name: "Marquette University", unitid: "178420", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 1 },  qsRank: 651, theWorldRank: null, nicheRank: 130, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 86, gradRate4yr: 56, gradRate6yr: 73, carnegieId: "r2", usNews: 92, enrollTrend: -0.8, yieldRate: 19, acceptRate: 82, pellPct: 24, firstGen: 19, rAndD: 38, doctoralOutput: 160, researchDesignation: 1, caldwellListed: 0, caldwellRank: null },
  { name: "Villanova University", unitid: "216597", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 1 },  qsRank: 651, theWorldRank: null, nicheRank: 115, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 91, gradRate4yr: 72, gradRate6yr: 84, carnegieId: "r2", usNews: 49, enrollTrend: 1.2, yieldRate: 22, acceptRate: 28, pellPct: 15, firstGen: 12, rAndD: 14, doctoralOutput: 80, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Butler University", unitid: "150136", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 0, aacsb: 1, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 200, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 88, gradRate4yr: 68, gradRate6yr: 78, carnegieId: "prof_doc", usNews: 4, enrollTrend: 0.6, yieldRate: 26, acceptRate: 68, pellPct: 21, firstGen: 18, rAndD: 4, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Elon University", unitid: "198464", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 0, aacsb: 1, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 220, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 88, gradRate4yr: 69, gradRate6yr: 79, carnegieId: "rcu", usNews: 7, enrollTrend: 1.4, yieldRate: 28, acceptRate: 72, pellPct: 18, firstGen: 15, rAndD: 2, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "James Madison University", unitid: "233277", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 0, aacsb: 1, eng: 1 },  qsRank: null, theWorldRank: null, nicheRank: 210, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 87, gradRate4yr: 67, gradRate6yr: 77, carnegieId: "r2", usNews: 5, enrollTrend: 0.9, yieldRate: 32, acceptRate: 78, pellPct: 22, firstGen: 19, rAndD: 8, doctoralOutput: 20, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Gonzaga University", unitid: "235316", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 190, nicheGrade: 75, theImpactListed: 0, theImpactRank: null, retentionRate: 91, gradRate4yr: 68, gradRate6yr: 79, carnegieId: "mixed_doc", usNews: 84, enrollTrend: 0.5, yieldRate: 21, acceptRate: 67, pellPct: 20, firstGen: 17, rAndD: 6, doctoralOutput: 30, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Quinnipiac University", unitid: "182795", usNewsList: "regional", flags: { bigFour: 0, d1: 1, health: 0, law: 1, aacsb: 1, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 240, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 84, gradRate4yr: 58, gradRate6yr: 71, carnegieId: "prof_doc", usNews: 156, enrollTrend: 1.8, yieldRate: 16, acceptRate: 74, pellPct: 22, firstGen: 18, rAndD: 5, doctoralOutput: 40, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Amherst College", unitid: "164465", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 48, nicheGrade: 91, theImpactListed: 0, theImpactRank: null, retentionRate: 97, gradRate4yr: 88, gradRate6yr: 94, carnegieId: "bac_arts", usNews: 2, enrollTrend: 0.8, yieldRate: 36, acceptRate: 11, pellPct: 22, firstGen: 18, rAndD: 8, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Williams College", unitid: "217156", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 40, nicheGrade: 91, theImpactListed: 0, theImpactRank: null, retentionRate: 97, gradRate4yr: 90, gradRate6yr: 96, carnegieId: "bac_arts", usNews: 1, enrollTrend: 0.4, yieldRate: 42, acceptRate: 12, pellPct: 20, firstGen: 16, rAndD: 6, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Bowdoin College", unitid: "161004", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 55, nicheGrade: 83, theImpactListed: 0, theImpactRank: null, retentionRate: 96, gradRate4yr: 87, gradRate6yr: 93, carnegieId: "bac_arts", usNews: 6, enrollTrend: 0.3, yieldRate: 46, acceptRate: 9, pellPct: 18, firstGen: 14, rAndD: 4, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Middlebury College", unitid: "230764", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 52, nicheGrade: 83, theImpactListed: 0, theImpactRank: null, retentionRate: 95, gradRate4yr: 86, gradRate6yr: 92, carnegieId: "bac_arts", usNews: 4, enrollTrend: 0.2, yieldRate: 38, acceptRate: 17, pellPct: 16, firstGen: 13, rAndD: 3, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Carleton College", unitid: "173258", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 62, nicheGrade: 83, theImpactListed: 0, theImpactRank: null, retentionRate: 96, gradRate4yr: 88, gradRate6yr: 93, carnegieId: "bac_arts", usNews: 7, enrollTrend: 0.6, yieldRate: 34, acceptRate: 18, pellPct: 19, firstGen: 15, rAndD: 2, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Gettysburg College", unitid: "213987", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 280, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 87, gradRate4yr: 69, gradRate6yr: 79, carnegieId: "bac_arts", usNews: 68, enrollTrend: -1.2, yieldRate: 22, acceptRate: 44, pellPct: 18, firstGen: 15, rAndD: 1, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Denison University", unitid: "202763", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 260, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 88, gradRate4yr: 72, gradRate6yr: 82, carnegieId: "bac_arts", usNews: 52, enrollTrend: 0.9, yieldRate: 24, acceptRate: 31, pellPct: 17, firstGen: 14, rAndD: 1, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Columbus State Community College", unitid: "203368", usNewsList: "best_colleges", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: null, nicheGrade: null, theImpactListed: 1, theImpactRank: 1001, retentionRate: 58, gradRate4yr: 14, gradRate6yr: 22, carnegieId: "associates", usNews: null, enrollTrend: -2.4, yieldRate: 88, acceptRate: 100, pellPct: 48, firstGen: 42, rAndD: 0, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Valencia College", unitid: "141862", usNewsList: "best_colleges", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: null, nicheGrade: null, theImpactListed: 1, theImpactRank: 801, retentionRate: 64, gradRate4yr: 18, gradRate6yr: 28, carnegieId: "associates", usNews: null, enrollTrend: 3.8, yieldRate: 92, acceptRate: 100, pellPct: 52, firstGen: 46, rAndD: 0, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Miami Dade College", unitid: "136172", usNewsList: "best_colleges", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: null, nicheGrade: null, theImpactListed: 1, theImpactRank: 1001, retentionRate: 66, gradRate4yr: 16, gradRate6yr: 26, carnegieId: "associates", usNews: null, enrollTrend: 1.2, yieldRate: 90, acceptRate: 100, pellPct: 58, firstGen: 52, rAndD: 0, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Thomas Jefferson University", unitid: "213783", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 0, health: 1, law: 0, aacsb: 0, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 350, nicheGrade: 58, theImpactListed: 0, theImpactRank: null, retentionRate: 86, gradRate4yr: 52, gradRate6yr: 68, carnegieId: "r2", usNews: null, enrollTrend: 2.1, yieldRate: 22, acceptRate: 62, pellPct: 18, firstGen: 14, rAndD: 148, doctoralOutput: 120, researchDesignation: 2, caldwellListed: 0, caldwellRank: null },
  { name: "MCPHS University", unitid: "166683", usNewsList: "natl_univ", flags: { bigFour: 0, d1: 0, health: 1, law: 0, aacsb: 1, eng: 0 },  qsRank: null, theWorldRank: null, nicheRank: 300, nicheGrade: 67, theImpactListed: 0, theImpactRank: null, retentionRate: 84, gradRate4yr: 58, gradRate6yr: 72, carnegieId: "special", usNews: null, enrollTrend: 1.4, yieldRate: 18, acceptRate: 74, pellPct: 24, firstGen: 20, rAndD: 22, doctoralOutput: 80, researchDesignation: 1, caldwellListed: 0, caldwellRank: null },
  { name: "Scripps College", unitid: "123165", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 0 }, qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 118, nicheGrade: 83, theImpactListed: 0, theImpactRank: null, retentionRate: 94, gradRate4yr: 61, gradRate6yr: 87, carnegieId: "bac_arts", usNews: 37, enrollTrend: 1.4, yieldRate: 25, acceptRate: 38, pellPct: 12, firstGen: 14, rAndD: 2, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
  { name: "Smith College", unitid: "167835", usNewsList: "lib_arts", flags: { bigFour: 0, d1: 0, health: 0, law: 0, aacsb: 0, eng: 1 },  qsRank: null, theWorldRank: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null, nicheRank: 75, nicheGrade: 91, theImpactListed: 1, theImpactRank: 601, retentionRate: 93, gradRate4yr: 70, gradRate6yr: 88, carnegieId: "bac_arts", usNews: 13, enrollTrend: -2.0, yieldRate: 33, acceptRate: 20, pellPct: 18, firstGen: 17, rAndD: 5, doctoralOutput: 0, researchDesignation: 0, caldwellListed: 0, caldwellRank: null },
];

// IPEDS fields that can auto-populate

// ── International Institution Database ────────────────────────────────────────
// Fields mirror IPEDS where universal; pellPct replaced with accessPct (low-income/access %)
const INTL_FIELDS = ["qsRank","theWorldRank","theImpactListed","theImpactRank","retentionRate","gradRate4yr","gradRate6yr","enrollTrend","acceptRate","accessPct","rAndD","doctoralOutput","researchDesignation","caldwellListed","caldwellRank","endowmentPerStudent","totalRevenue"];

const INTL_DB = [
  { name: "University of Liverpool", country: "UK", intlId: "liverpool-uk", checkboxDefaults: ["chk_healthSystem","chk_lawSchool","chk_engineering"], qsRank: 165, theWorldRank: 160, theImpactListed: 1, theImpactRank: 201, retentionRate: 90, gradRate4yr: 85, gradRate6yr: 90, carnegieId: "special", intlGroup: "Russell Group", enrollTrend: 2.1, acceptRate: 14, accessPct: null, rAndD: 123, doctoralOutput: 520, researchDesignation: 3, caldwellListed: 1, caldwellRank: 312, endowmentPerStudent: 8, totalRevenue: 890 },
  { name: "Queen's University (Ontario)", country: "Canada", intlId: "queens-ca", checkboxDefaults: ["chk_lawSchool","chk_aacsb","chk_engineering"], qsRank: 193, theWorldRank: 275, theImpactListed: 1, theImpactRank: 8, retentionRate: 93, gradRate4yr: 89, gradRate6yr: 92, carnegieId: "intl_elite", intlGroup: "U15 Canada", enrollTrend: 1.8, acceptRate: 42, accessPct: null, rAndD: 85, doctoralOutput: 380, researchDesignation: 2, caldwellListed: 1, caldwellRank: 428, endowmentPerStudent: 33, totalRevenue: 800 },
];

const IPEDS_FIELDS = ["usNews","usNewsDisplay","usNewsHbcuRank","usNewsList","enrollTrend","yieldRate","acceptRate","pellPct","firstGen","rAndD","doctoralOutput","researchDesignation","caldwellListed","caldwellRank","retentionRate","gradRate4yr","gradRate6yr","theImpactListed","theImpactRank","nicheRank","nicheGrade","usNewsLaw","lawTier","usNewsBiz","bizTier","usNewsEng","engTier","theWorldRank","qsRank","qsRankDisplay"];

// 2025 Carnegie Classification — Research Activity Designations + Institutional Classification
// (collapsed from the official 31-grouping spectrum into the working benchmarking cohorts)
const CARNEGIE_CATEGORIES = [
  { id: "r1", label: "Research 1 — Very High Research Spending and Doctorate Production", short: "R1 (Research 1)", description: "≥ $50M research spending AND ≥ 70 research doctorates awarded annually (2025 Research Activity Designation)" },
  { id: "r2", label: "Research 2 — High Research Spending and Doctorate Production", short: "R2 (Research 2)", description: "≥ $5M research spending AND ≥ 20 research doctorates awarded annually (2025 Research Activity Designation)" },
  { id: "rcu", label: "Research Colleges & Universities (RCU)", short: "RCU", description: "≥ $2.5M research spending; not classified as R1 or R2 (new in 2025)" },
  { id: "mixed_doc", label: "Mixed Undergraduate/Graduate-Doctorate", short: "Mixed Doctoral", description: "Doctoral institutions with a balanced mix of academic and professional programs (no R1/R2/RCU designation)" },
  { id: "prof_doc", label: "Professions-focused Undergraduate/Graduate-Doctorate", short: "Professions-focused Doctoral", description: "Doctoral institutions concentrated in professional fields (business, education, health, etc.)" },
  { id: "mixed_masters", label: "Mixed Undergraduate/Graduate-Master's", short: "Mixed Master's", description: "Master's-dominant institutions with a balanced academic + professional mix (replaces M1/M2/M3)" },
  { id: "prof_masters", label: "Professions-focused Undergraduate/Graduate-Master's", short: "Professions-focused Master's", description: "Master's-dominant institutions concentrated in professional fields" },
  { id: "mixed_bac", label: "Mixed Baccalaureate", short: "Mixed Baccalaureate", description: "Baccalaureate institutions with a balanced academic + professional mix" },
  { id: "prof_bac", label: "Professions-focused Baccalaureate", short: "Professions-focused Baccalaureate", description: "Baccalaureate institutions concentrated in professional fields (replaces Bac/Diverse)" },
  { id: "bac_arts", label: "Special Focus: Arts and Sciences", short: "Arts & Sciences (Liberal Arts)", description: "Baccalaureate institutions with an arts & sciences emphasis (formerly Bac/A&S — Liberal Arts)" },
  { id: "associates", label: "Associate's / Mixed Associate", short: "Associate's", description: "Primarily associate degrees and certificates" },
  { id: "special", label: "Special Focus Institution", short: "Special Focus", description: "Single field or narrow programs (medicine, nursing, law, arts, theology, etc.)" },
  { id: "tribal", label: "Tribal College or University", short: "Tribal College", description: "Designated TCU under the 2025 Population Served filter" },
];


const INTL_CATEGORIES = [
  { id: "intl_elite", label: "Global Research Elite", short: "Research Elite", description: "Russell Group, U15 Canada, Go8 Australia, C9 China, leading European research universities" },
  { id: "intl_research", label: "Research University", short: "Research Univ.", description: "Strong research output and doctoral programs, not elite group membership" },
  { id: "intl_comprehensive", label: "Comprehensive University", short: "Comprehensive", description: "Broad programs across disciplines, some research, master's-dominant" },
  { id: "intl_teaching", label: "Teaching-Focused University", short: "Teaching-Focused", description: "Primarily undergraduate, limited research activity" },
  { id: "intl_specialist", label: "Specialist Institution", short: "Specialist", description: "Single field or narrow programs (medicine, arts, technology, business)" },
];

// International weight profiles — visibility and research weighted higher baseline
// since global standing is inherently more central for international institutions
const INTL_WEIGHTS = {
  intl_elite:        { visibility: 0.24, enrollment: 0.13, financial: 0.14, profile: 0.13, research: 0.26, diversity: 0.10 },
  intl_research:     { visibility: 0.21, enrollment: 0.16, financial: 0.16, profile: 0.12, research: 0.23, diversity: 0.12 },
  intl_comprehensive:{ visibility: 0.19, enrollment: 0.21, financial: 0.16, profile: 0.12, research: 0.15, diversity: 0.17 },
  intl_teaching:     { visibility: 0.17, enrollment: 0.26, financial: 0.16, profile: 0.10, research: 0.10, diversity: 0.21 },
  intl_specialist:   { visibility: 0.22, enrollment: 0.14, financial: 0.17, profile: 0.16, research: 0.18, diversity: 0.13 },
};

const WEIGHTS = {
  // 6 dimensions: profile = institutional assets (law, med, biz, eng)
  // Aligned to 2025 Carnegie cohorts.
  r1:            { visibility: 0.24, enrollment: 0.14, financial: 0.15, profile: 0.11, research: 0.24, diversity: 0.12 },
  r2:            { visibility: 0.22, enrollment: 0.16, financial: 0.16, profile: 0.11, research: 0.22, diversity: 0.13 },
  rcu:           { visibility: 0.21, enrollment: 0.17, financial: 0.16, profile: 0.11, research: 0.20, diversity: 0.15 },
  mixed_doc:     { visibility: 0.21, enrollment: 0.18, financial: 0.16, profile: 0.13, research: 0.17, diversity: 0.15 },
  prof_doc:      { visibility: 0.21, enrollment: 0.18, financial: 0.16, profile: 0.16, research: 0.15, diversity: 0.14 },
  mixed_masters: { visibility: 0.20, enrollment: 0.22, financial: 0.16, profile: 0.13, research: 0.11, diversity: 0.18 },
  prof_masters:  { visibility: 0.20, enrollment: 0.22, financial: 0.16, profile: 0.16, research: 0.10, diversity: 0.16 },
  mixed_bac:     { visibility: 0.21, enrollment: 0.22, financial: 0.17, profile: 0.10, research: 0.09, diversity: 0.21 },
  prof_bac:      { visibility: 0.20, enrollment: 0.22, financial: 0.16, profile: 0.13, research: 0.09, diversity: 0.20 },
  bac_arts:      { visibility: 0.23, enrollment: 0.21, financial: 0.18, profile: 0.10, research: 0.08, diversity: 0.20 },
  associates:    { visibility: 0.15, enrollment: 0.26, financial: 0.16, profile: 0.07, research: 0.05, diversity: 0.31 },
  special:       { visibility: 0.23, enrollment: 0.15, financial: 0.17, profile: 0.16, research: 0.16, diversity: 0.13 },
  tribal:        { visibility: 0.13, enrollment: 0.21, financial: 0.17, profile: 0.07, research: 0.09, diversity: 0.33 },
};


// US News ranking list by Carnegie type
// Used to auto-suggest which list an institution is on
const USNEWS_LIST_MAP = {
  r1: "natl_univ", r2: "natl_univ", rcu: "natl_univ",
  mixed_doc: "natl_univ", prof_doc: "natl_univ",
  mixed_masters: "regional", prof_masters: "regional",
  bac_arts: "lib_arts",
  mixed_bac: "regional", prof_bac: "regional",
  associates: "best_colleges",
  special: null, tribal: null,
  intl_elite: null, intl_research: null, intl_comprehensive: null,
  intl_teaching: null, intl_specialist: null,
};

const USNEWS_LIST_LABELS = {
  natl_univ:    "National Universities",
  lib_arts:     "National Liberal Arts Colleges",
  regional:     "Regional Universities",
  best_colleges:"Best Colleges",
};

const USNEWS_LIST_MAX = {
  natl_univ:    500,
  lib_arts:     250,
  regional:     250,
  best_colleges:150,
};

const AXES = [
  {
    key: "visibility", label: "Visibility & Reach", color: "#EB5600",
    description: "Rankings, Caldwell, QS/THE/Niche footprint, THE Impact, athletics conference",
    hiddenFor: ["associates", "tribal"],
    checkboxes: [
      { id: "chk_bigFour", label: "Big Four athletic conference (ACC, Big Ten, Big 12, SEC)" },
      { id: "chk_d1athletics", label: "Division I athletics (non-Big Four)" },
    ],
    inputs: [
      { id: "usNewsList", label: "US News ranking list", usNewsListSelector: true },
      { id: "usNews", label: "US News Rank", placeholder: "e.g. 45", max: 500, invert: true, emptyScore: 10, usNewsRank: true, dynamic: true },
      { id: "qsRank", label: "QS World University Rank (blank if not listed)", placeholder: "e.g. 300", max: 1000, invert: true, emptyScore: 5 },
      { id: "theWorldRank", label: "THE World University Rank (blank if not listed)", placeholder: "e.g. 250", max: 1000, invert: true, emptyScore: 5 },
      { id: "caldwellListed", label: "Listed on American Caldwell Visibility Index? (1=Yes, 0=No)", placeholder: "0 or 1", max: 1, binary: true },
      { id: "caldwellRank", label: "American Caldwell rank (1–1000; blank if not listed)", placeholder: "e.g. 312", max: 1000, invert: true, emptyScore: null },
      { id: "theImpactListed", label: "Listed in THE Impact Rankings? (1=Yes, 0=No)", placeholder: "0 or 1", max: 1, binary: true },
      { id: "theImpactRank", label: "THE Impact Rank (blank if not listed)", placeholder: "e.g. 401", max: 2526, invert: true, emptyScore: null },
      { id: "nicheRank", label: "Niche Best Colleges Rank (blank if unranked)", placeholder: "e.g. 180", max: 1500, invert: true, emptyScore: 5 },
      { id: "nicheGrade", label: "Niche Overall Grade (A+=100, A=91, A-=83, B+=75, B=67, B-=58, C+=50, C=42 or below)", placeholder: "e.g. 91", max: 100, nicheGrade: true },
    ]
  },
  {
    key: "enrollment", label: "Enrollment & Retention", color: "#1A9988",
    description: "5-yr headcount trend, yield rate, acceptance rate, 1st-to-2nd year retention, 4-yr and 6-yr graduation rates (IPEDS)",
    inputs: [
      { id: "enrollTrend", label: "5-yr enrollment change (%)", placeholder: "e.g. -3 or +8", min: -30, max: 30, centered: true },
      { id: "yieldRate", label: "Yield rate (%)", placeholder: "e.g. 28", max: 100 },
      { id: "acceptRate", label: "Acceptance rate (%) — lower signals stronger selectivity", placeholder: "e.g. 62", max: 100, invert: true },
      { id: "retentionRate", label: "1st-to-2nd year retention rate (%)", placeholder: "e.g. 88", max: 100 },
      { id: "gradRate4yr", label: "4-year graduation rate (%)", placeholder: "e.g. 62", max: 100 },
      { id: "gradRate6yr", label: "6-year graduation rate (%)", placeholder: "e.g. 78", max: 100 },
    ]
  },
  {
    key: "financial", label: "Financial Strength", color: "#243551",
    description: "Endowment per student, total operating revenue. Auto-populated for US institutions from IPEDS Finance + NACUBO via the Urban Institute Education Data Portal (annual refresh). International institutions: manual entry, USD equivalent.",
    inputs: [
      { id: "endowmentPerStudent", label: "Endowment per student ($K)", labelIntl: "Endowment per student (USD equiv. $K)", placeholder: "e.g. 45", max: 600 },
      { id: "totalRevenue", label: "Total annual revenue ($M)", labelIntl: "Total annual revenue (USD equiv. $M)", placeholder: "e.g. 800", max: 5000 },
    ]
  },
  {
    key: "profile", label: "Institutional Profile", color: "#3F5A8A",
    description: "Academic medical center, law school, business school, engineering — auto-populated from institutional database (annual review recommended)",
    checkboxes: [
      { id: "chk_healthSystem", label: "Academic medical center / health system" },
      { id: "chk_lawSchool", label: "Law school", rankId: "usNewsLaw", rankLabel: "US News Law Rank", rankMax: 50 },
      { id: "chk_aacsb", label: "AACSB-accredited business school", rankId: "usNewsBiz", rankLabel: "US News Business Rank", rankMax: 50 },
      { id: "chk_engineering", label: "College of Engineering", rankId: "usNewsEng", rankLabel: "US News Engineering Rank", rankMax: 50 },
    ],
    inputs: [],
  },
  {
    key: "research", label: "Academic & Research Reputation", color: "#1C3678",
    description: "Federal R&D expenditures (NSF HERD), doctoral degrees awarded, 2025 Research Activity Designation",
    hiddenFor: ["associates", "tribal", "bac_arts", "mixed_bac", "prof_bac", "intl_teaching", "intl_specialist"],
    inputs: [
      { id: "rAndD", label: "Annual federal R&D expenditures ($M)", placeholder: "e.g. 120", max: 1000 },
      { id: "doctoralOutput", label: "Doctoral degrees awarded annually", placeholder: "e.g. 340", max: 2000 },
      { id: "researchDesignation", label: "2025 Research Activity Designation (3=High, 2=Moderate, 1=Low, 0=None)", placeholder: "0–3", max: 3 },
    ],

  },
  {
    key: "diversity", label: "Diversity & Access", color: "#6AA4C8",
    description: "Pell Grant recipients %, first-generation students % (IPEDS)",
    inputs: [
      { id: "pellPct", label: "Pell Grant recipients (%)", labelIntl: "Low-income / access students (%)", placeholder: "e.g. 32", max: 100 },
      { id: "firstGen", label: "First-generation students (%)", placeholder: "e.g. 22", max: 100 },
    ]
  },
];

// Minimum cohort size to show aggregate overlay
const MIN_N = 3;


function normalizeAxis(axis, values) {
  const inputScores = axis.inputs.map(input => {
    if (input.id === 'usNewsList') return null; // selector only, not scored
    const raw = parseFloat(values[input.id]);
    if (isNaN(raw)) return input.emptyScore ?? null;
    if (input.binary) return raw >= 1 ? 100 : 0;
    const min = input.min ?? 0;
    // Use list-aware max for usNews rank
    const max = (input.id === 'usNews' && values.usNewsList)
      ? (USNEWS_LIST_MAX[values.usNewsList] ?? input.max ?? 100)
      : (input.max ?? 100);
    let pct = Math.max(0, Math.min(100, ((raw - min) / (max - min)) * 100));
    if (input.invert) pct = 100 - pct;
    return pct;
  }).filter(v => v !== null);

  // Checkboxes: presence score + optional US News rank bonus for law/biz/eng
  // Weighted at 30% of axis score when checkboxes exist
  let checkboxScore = null;
  if (axis.checkboxes && axis.checkboxes.length > 0) {
    // Each checkbox contributes 1 base point; ranked programs get a rank bonus
    let totalPoints = 0;
    const maxPoints = axis.checkboxes.length * 2; // max 2 pts each (1 presence + 1 rank)
    axis.checkboxes.forEach(c => {
      // Tier multiplier for grad program ranks (law/biz/eng):
      //   top_20 → 1.0, 21_50 → 0.6, null/missing → 1.0 (backward compatible)
      const tierKey = c.rankId === 'usNewsLaw' ? 'lawTier'
                    : c.rankId === 'usNewsBiz' ? 'bizTier'
                    : c.rankId === 'usNewsEng' ? 'engTier'
                    : null;
      const tier = tierKey ? values[tierKey] : null;
      const tierMult = tier === 'top_20' ? 1.0 : tier === '21_50' ? 0.6 : 1.0;

      if (values[c.id] === true) {
        totalPoints += 1; // presence point
        if (c.rankId) {
          const rank = parseFloat(values[c.rankId]);
          if (!isNaN(rank) && rank > 0) {
            const rankBonus = Math.max(0, 1 - ((rank - 1) / (c.rankMax - 1)));
            totalPoints += rankBonus * tierMult;
          }
        } else {
          totalPoints += 1;
        }
      } else {
        if (c.rankId) {
          const rank = parseFloat(values[c.rankId]);
          if (!isNaN(rank) && rank > 0) {
            const rankBonus = Math.max(0, 1 - ((rank - 1) / (c.rankMax - 1)));
            totalPoints += 0.5 * rankBonus * tierMult;
          }
        }
      }
    });
    checkboxScore = Math.min(100, (totalPoints / maxPoints) * 100);
  }

  if (inputScores.length === 0 && checkboxScore === null) return null;

  if (checkboxScore !== null && inputScores.length > 0) {
    const inputAvg = inputScores.reduce((a, b) => a + b, 0) / inputScores.length;
    return inputAvg * 0.70 + checkboxScore * 0.30;
  }
  if (checkboxScore !== null) return checkboxScore;
  return inputScores.reduce((a, b) => a + b, 0) / inputScores.length;
}


// QS World University Rankings bands — weight profiles
// Higher bands emphasize visibility & research; lower/unranked shift to enrollment, diversity, brand
const QS_BAND_WEIGHTS = {
  top100:    { visibility: 0.28, enrollment: 0.13, financial: 0.14, profile: 0.11, research: 0.26, diversity: 0.08 },
  r101_200:  { visibility: 0.25, enrollment: 0.14, financial: 0.14, profile: 0.11, research: 0.24, diversity: 0.12 },
  r201_400:  { visibility: 0.22, enrollment: 0.16, financial: 0.16, profile: 0.11, research: 0.21, diversity: 0.14 },
  r401_600:  { visibility: 0.20, enrollment: 0.19, financial: 0.16, profile: 0.12, research: 0.17, diversity: 0.16 },
  r601plus:  { visibility: 0.17, enrollment: 0.21, financial: 0.17, profile: 0.11, research: 0.13, diversity: 0.21 },
  unranked:  { visibility: 0.14, enrollment: 0.23, financial: 0.17, profile: 0.10, research: 0.11, diversity: 0.25 },
};

const QS_BAND_LABELS = {
  top100:   "QS Top 100",
  r101_200: "QS 101–200",
  r201_400: "QS 201–400",
  r401_600: "QS 401–600",
  r601plus: "QS 601+",
  unranked: "QS Unranked",
};

function getQsBand(qsRank) {
  const r = parseFloat(qsRank);
  if (isNaN(r) || !qsRank) return "unranked";
  if (r <= 100)  return "top100";
  if (r <= 200)  return "r101_200";
  if (r <= 400)  return "r201_400";
  if (r <= 600)  return "r401_600";
  return "r601plus";
}

function blendWeights(carnegieId, qsBand) {
  const cw = INTL_WEIGHTS[carnegieId] ?? WEIGHTS[carnegieId] ?? WEIGHTS["mixed_masters"];
  const qw = QS_BAND_WEIGHTS[qsBand] ?? QS_BAND_WEIGHTS["unranked"];
  const blended = {};
  Object.keys(cw).forEach(k => {
    blended[k] = (cw[k] + (qw[k] ?? cw[k])) / 2;
  });
  // Normalize so weights sum to 1
  const total = Object.values(blended).reduce((a, b) => a + b, 0);
  Object.keys(blended).forEach(k => { blended[k] = blended[k] / total; });
  return blended;
}

function weightedOverall(scores, carnegieId, qsBand = "unranked") {
  const w = blendWeights(carnegieId, qsBand);
  let total = 0, wSum = 0;
  Object.entries(scores).forEach(([key, val]) => {
    if (val != null && w[key] != null) { total += val * w[key]; wSum += w[key]; }
  });
  return wSum > 0 ? Math.round(total / wSum) : null;
}

function computeAggregates(scoredPool, carnegieId, focalName) {
  const allKeys = AXES.map(a => a.key);
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Exclude the focal institution from its own peer averages
  const others = scoredPool.filter(s => s.name !== focalName);
  const carnegiePeers = others.filter(s => s.carnegieId === carnegieId);

  const buildOverlay = (subs) => {
    if (subs.length < MIN_N) return null;
    const result = {};
    const counts = {};
    allKeys.forEach(key => {
      const vals = subs.map(s => s.scores?.[key]).filter(v => v != null);
      result[key] = vals.length ? avg(vals) : null;
      counts[key] = vals.length;
    });
    return { scores: result, counts, n: subs.length };
  };

  return {
    carnegieAvg: buildOverlay(carnegiePeers),
    globalAvg: buildOverlay(others),
  };
}

function SpiderChart({ scores, carnegieAvg, globalAvg, axes }) {
  const size = 480;
  const cx = size / 2, cy = size / 2, r = 155;
  const n = axes.length;
  const angleOffset = -Math.PI / 2;
  const ptsFn = vals => axes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n + angleOffset;
    const val = (vals[i] ?? 0) / 100;
    return [cx + r * val * Math.cos(angle), cy + r * val * Math.sin(angle)];
  });
  const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';

  // Interpolate missing axis values using neighbors so a single missing peer
  // axis doesn't drag the cohort polygon to the center (which made it look
  // like peer financial data was missing entirely).
  const fillNulls = (overlay) => {
    if (!overlay) return null;
    const raw = axes.map(a => overlay.scores?.[a.key]);
    const out = raw.slice();
    for (let i = 0; i < out.length; i++) {
      if (out[i] != null) continue;
      // find nearest non-null neighbors (circular)
      let prev = null, next = null;
      for (let k = 1; k <= out.length; k++) {
        const li = (i - k + out.length) % out.length;
        if (raw[li] != null) { prev = raw[li]; break; }
      }
      for (let k = 1; k <= out.length; k++) {
        const ri = (i + k) % out.length;
        if (raw[ri] != null) { next = raw[ri]; break; }
      }
      if (prev != null && next != null) out[i] = (prev + next) / 2;
      else if (prev != null) out[i] = prev;
      else if (next != null) out[i] = next;
      else out[i] = 0;
    }
    return out;
  };

  const userVals = axes.map(a => scores[a.key] ?? 0);
  const carnVals = fillNulls(carnegieAvg) ?? axes.map(() => 0);
  const globVals = fillNulls(globalAvg) ?? axes.map(() => 0);
  const hasScore = userVals.some(v => v > 0);

  const labelDist = r + 44;

  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1.0].map(level => {
        const pts = axes.map((_, i) => {
          const angle = (2 * Math.PI * i) / n + angleOffset;
          return [cx + r * level * Math.cos(angle), cy + r * level * Math.sin(angle)];
        });
        return <polygon key={level} points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#E4E8EE" strokeWidth="1" />;
      })}
      {axes.map((_, i) => {
        const angle = (2 * Math.PI * i) / n + angleOffset;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#E4E8EE" strokeWidth="1" />;
      })}

      {globalAvg && (
        <path d={toPath(ptsFn(globVals))}
          fill="rgba(100,140,200,0.04)"
          stroke="rgba(106,164,200,0.35)"
          strokeWidth="1.5"
          strokeDasharray="2 4"
        />
      )}
      {carnegieAvg && (
        <path d={toPath(ptsFn(carnVals))}
          fill="#F4F6F8"
          stroke="#6B7585"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
      )}
      {hasScore && (
        <path d={toPath(ptsFn(userVals))}
          fill="rgba(235,86,0,0.14)"
          stroke="#EB5600"
          strokeWidth="2"
        />
      )}
      {hasScore && ptsFn(userVals).map((pt, i) => (
        <circle key={i} cx={pt[0]} cy={pt[1]} r="4" fill={axes[i].color} stroke="#FFFFFF" strokeWidth="1.5" />
      ))}

      {axes.map((axis, i) => {
        const angle = (2 * Math.PI * i) / n + angleOffset;
        const lx = cx + labelDist * Math.cos(angle);
        const ly = cy + labelDist * Math.sin(angle);
        const s = scores[axis.key];
        const peerN = carnegieAvg?.counts?.[axis.key];
        // Split label into words for vertical stacking
        const words = axis.label.toUpperCase().split(' ');
        const lineH = 13;
        const totalH = words.length * lineH;
        const scoreOffset = totalH / 2 + 2;
        return (
          <g key={i}>
            {words.map((word, wi) => (
              <text key={wi}
                x={lx}
                y={ly - totalH / 2 + wi * lineH + lineH * 0.8}
                textAnchor="middle"
                fontSize="11"
                fontFamily="'Bitter', Georgia, serif"
                fontWeight="700"
                fill={axis.color}
                letterSpacing="0.6"
              >{word}</text>
            ))}
            {s != null && (
              <text x={lx} y={ly + scoreOffset + 12}
                textAnchor="middle"
                fontSize="12"
                fontFamily="'Bitter', Georgia, serif"
                fill="#3D4F6B"
              >{Math.round(s)}</text>
            )}
            {peerN != null && (
              <text x={lx} y={ly + scoreOffset + 26}
                textAnchor="middle"
                fontSize="9"
                fontFamily="'Bitter', Georgia, serif"
                fill="#8A93A1"
                letterSpacing="0.5"
              >{`peer data n=${peerN}`}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Note: localStorage submission flow removed — every institution is auto-scored
// from IPEDS and lives in scoredPool from the start.


// ── Benchmark reference data (NACUBO, CASE, CUPA-HR, IPEDS aggregates) ─────────
const BENCHMARKS = {
  financial: {
    endowmentPerStudent: {
      label: "Endowment per Student ($K)",
      byType: {
        r1:            { min: 8,  median: 62,  mean: 118, max: 600 },
        r2:            { min: 3,  median: 28,  mean: 52,  max: 280 },
        rcu:           { min: 2,  median: 18,  mean: 34,  max: 180 },
        mixed_doc:     { min: 2,  median: 16,  mean: 30,  max: 160 },
        prof_doc:      { min: 2,  median: 14,  mean: 26,  max: 140 },
        mixed_masters: { min: 1,  median: 12,  mean: 24,  max: 120 },
        prof_masters:  { min: 1,  median: 10,  mean: 20,  max: 100 },
        bac_arts:      { min: 4,  median: 55,  mean: 120, max: 600 },
        mixed_bac:     { min: 1,  median: 14,  mean: 28,  max: 140 },
        prof_bac:      { min: 1,  median: 10,  mean: 22,  max: 110 },
        associates:    { min: 0,  median: 4,   mean: 8,   max: 45  },
        tribal:        { min: 0,  median: 2,   mean: 4,   max: 18  },
        special:       { min: 1,  median: 18,  mean: 36,  max: 180 },
      }
    },
    totalRevenue: {
      label: "Total Annual Revenue ($M)",
      byType: {
        r1:            { min: 120, median: 680, mean: 1100, max: 5000 },
        r2:            { min: 60,  median: 280, mean: 420,  max: 1800 },
        rcu:           { min: 30,  median: 160, mean: 240,  max: 900  },
        mixed_doc:     { min: 25,  median: 140, mean: 210,  max: 800  },
        prof_doc:      { min: 25,  median: 130, mean: 200,  max: 750  },
        mixed_masters: { min: 15,  median: 80,  mean: 120,  max: 450  },
        prof_masters:  { min: 12,  median: 65,  mean: 95,   max: 350  },
        bac_arts:      { min: 30,  median: 140, mean: 200,  max: 800  },
        mixed_bac:     { min: 10,  median: 60,  mean: 90,   max: 350  },
        prof_bac:      { min: 8,   median: 45,  mean: 70,   max: 280  },
        associates:    { min: 10,  median: 55,  mean: 80,   max: 400  },
        tribal:        { min: 2,   median: 18,  mean: 28,   max: 100  },
        special:       { min: 8,   median: 55,  mean: 90,   max: 420  },
      }
    }
  },
  brand: {
    mktgBudgetPct: {
      label: "Marketing Spend (% of Total Expenditure)",
      byType: {
        r1:            { min: 0.3, median: 0.8, mean: 1.0, max: 3.2 },
        r2:            { min: 0.4, median: 1.1, mean: 1.3, max: 4.0 },
        rcu:           { min: 0.5, median: 1.4, mean: 1.6, max: 4.5 },
        mixed_doc:     { min: 0.5, median: 1.4, mean: 1.7, max: 4.8 },
        prof_doc:      { min: 0.6, median: 1.6, mean: 1.9, max: 5.0 },
        mixed_masters: { min: 0.6, median: 1.7, mean: 2.0, max: 5.4 },
        prof_masters:  { min: 0.7, median: 1.9, mean: 2.2, max: 5.6 },
        bac_arts:      { min: 0.8, median: 2.0, mean: 2.3, max: 6.0 },
        mixed_bac:     { min: 0.6, median: 1.7, mean: 2.0, max: 5.5 },
        prof_bac:      { min: 0.7, median: 1.9, mean: 2.2, max: 5.6 },
        associates:    { min: 0.4, median: 1.2, mean: 1.5, max: 4.2 },
        tribal:        { min: 0.3, median: 0.9, mean: 1.1, max: 3.5 },
        special:       { min: 0.5, median: 1.4, mean: 1.7, max: 5.0 },
      }
    },
    mktgFTE: {
      label: "Central Marketing FTE",
      byType: {
        r1:            { min: 8, median: 38, mean: 48, max: 150 },
        r2:            { min: 4, median: 20, mean: 26, max: 80  },
        rcu:           { min: 3, median: 14, mean: 18, max: 60  },
        mixed_doc:     { min: 3, median: 13, mean: 17, max: 55  },
        prof_doc:      { min: 3, median: 12, mean: 16, max: 50  },
        mixed_masters: { min: 2, median: 9,  mean: 12, max: 40  },
        prof_masters:  { min: 1, median: 7,  mean: 10, max: 32  },
        bac_arts:      { min: 2, median: 10, mean: 13, max: 42  },
        mixed_bac:     { min: 1, median: 6,  mean: 8,  max: 28  },
        prof_bac:      { min: 1, median: 5,  mean: 7,  max: 24  },
        associates:    { min: 1, median: 5,  mean: 7,  max: 25  },
        tribal:        { min: 0, median: 2,  mean: 3,  max: 10  },
        special:       { min: 1, median: 6,  mean: 8,  max: 28  },
      }
    }
  }
};

function BenchmarkDropdown({ field, carnegieId, color }) {
  const [open, setOpen] = useState(false);
  const data = BENCHMARKS[field.section]?.[field.id]?.byType[carnegieId];
  const label = BENCHMARKS[field.section]?.[field.id]?.label;
  if (!data || !carnegieId) return null;

  return (
    <div style={{ marginTop: 5 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'transparent', border: 'none', padding: 0,
        color: open ? color : '#A6ADBA',
        fontSize: 10, letterSpacing: 1, cursor: 'pointer',
        fontFamily: "'Bitter', Georgia, serif", display: 'flex', alignItems: 'center', gap: 4,
        textDecoration: 'none',
      }}>
        <span style={{ fontSize: 9 }}>{open ? '▾' : '▸'}</span>
        {open ? 'HIDE BENCHMARKS' : 'SEE BENCHMARKS FOR YOUR CARNEGIE TYPE'}
      </button>
      {open && (
        <div style={{
          marginTop: 7, padding: '10px 12px',
          background: '#F8FAFB',
          border: `1px solid ${color}44`,
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#8A93A1', marginBottom: 8, textTransform: 'uppercase' }}>
            {label} — Carnegie Peer Benchmarks
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[['MIN', data.min], ['MEDIAN', data.median], ['MEAN', data.mean], ['MAX', data.max]].map(([lbl, val]) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#8A93A1', letterSpacing: 1, marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 14, fontFamily: "'Bitter', Georgia, serif", color, fontWeight: 500 }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#C7CCD4', marginTop: 8 }}>
            Source: NACUBO, CASE, IPEDS aggregates. Figures are approximate sector medians.
          </div>
        </div>
      )}
    </div>
  );
}

const iStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#FFFFFF',
  border: '1px solid #D6DCE5',
  borderRadius: 6, padding: '9px 12px',
  color: '#243551', fontSize: 14,
  fontFamily: "'Bitter', Georgia, serif", outline: 'none',
};

export default function App() {
  const [step, setStep] = useState("carnegie");
  const [carnegieId, setCarnegieId] = useState("");
  const [institution, setInstitution] = useState("");
  const [unitid, setUnitid] = useState("");
  const [selectedIc2025, setSelectedIc2025] = useState(null);
  const [institutionSAEC, setInstitutionSAEC] = useState(null);
  const [institutionResearch, setInstitutionResearch] = useState(null);
  const [values, setValues] = useState({});
  const [activeAxis, setActiveAxis] = useState(0);
  const [autoPopulated, setAutoPopulated] = useState([]);
  const [isIntl, setIsIntl] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  const selectedCarnegie = CARNEGIE_CATEGORIES.find(c => c.id === carnegieId) ?? INTL_CATEGORIES.find(c => c.id === carnegieId);
  const activeAxes = AXES.filter(a => !a.hiddenFor || !a.hiddenFor.includes(carnegieId));

  const scores = {};
  activeAxes.forEach(axis => {
    const s = normalizeAxis(axis, values);
    if (s !== null) scores[axis.key] = s;
  });

  const qsBand = getQsBand(values.qsRank);
  const overall = carnegieId ? weightedOverall(scores, carnegieId, qsBand) : null;
  const curAxis = activeAxes[Math.min(activeAxis, activeAxes.length - 1)];

  // Load the full US institution catalogue (~1,800 rows) once on mount.
  // Falls back to the hardcoded IPEDS_DB if the network call fails so the
  // form keeps working offline / during a deploy blip.
  const [usDb, setUsDb] = useState(IPEDS_DB);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("institutions")
        .select("unitid,name,city,state,us_news_list,flags,enrollment,fte,metrics,rankings,finance,ic2025,ic2025name,ic2025group,research2025,research2025name,saec2025,saec2025name,access_ratio,earnings_ratio,pell_2023")
        .order("name", { ascending: true })
        .range(0, 2499);
      if (cancelled) return;
      if (error || !data?.length) {
        console.warn("institutions fetch failed, using bundled IPEDS_DB", error);
        return;
      }
      setUsDb(data.map(flattenInstitutionRow));
    })();
    return () => { cancelled = true; };
  }, []);

  // Score the institutional database for the insight framework's peer cohort.
  // Memoized — only recomputes when the active axes change (i.e. on classification change).
  const scoredPool = useMemo(() => {
    if (!carnegieId) return [];
    // Enrich US peer rows with IPEDS finance snapshot (endowment/revenue) so
    // those two axes have real cohort comparisons, not a sea of nulls.
    const combined = [...usDb, ...INTL_DB].map(s => {
      if (!s.unitid) return s;
      const fin = financeSnapshot[s.unitid];
      if (!fin) return s;
      return {
        ...s,
        endowmentPerStudent: s.endowmentPerStudent ?? fin.endowmentPerStudent,
        totalRevenue:        s.totalRevenue        ?? fin.totalRevenue,
      };
    });
    return scorePool(combined, AXES, normalizeAxis);
  }, [carnegieId, usDb]);

  // Cohort overlays for the spider chart — derived from the same auto-scored pool
  // that powers the cohort size in the header card.
  const { carnegieAvg, globalAvg } = useMemo(
    () => computeAggregates(scoredPool, carnegieId, institution),
    [scoredPool, carnegieId, institution]
  );

  // Classification cohort stats — surfaced in the Weighted Brand Index header card.
  const classificationCohort = useMemo(() => {
    if (!carnegieId) return [];
    const focal = { name: institution, carnegieId };
    return buildCohort({ focal, scoredPool, lensId: "carnegie" });
  }, [carnegieId, institution, scoredPool]);

  const classificationTopLine = useMemo(
    () => cohortTopLine({ cohort: classificationCohort, axes: activeAxes }),
    [classificationCohort, activeAxes]
  );
  const classificationCohortSize = classificationCohort.length;
  const classificationCohortAvg = classificationTopLine?.cohortAvg ?? null;

  // Institution typeahead
  // For US schools we query the backend directly because PostgREST caps the
  // initial bulk load at ~1000 alphabetical rows — schools like "University of
  // Vermont" never land in the local cache. International list is small enough
  // to filter in-memory.
  const rankMatches = (rows, q) => rows
    .map(s => {
      const n = (s.name || '').toLowerCase();
      if (!n.includes(q)) return null;
      let rank = 3;
      if (n.startsWith(q)) rank = 0;
      else if (n.includes(' ' + q)) rank = 1;
      else if (n.includes('-' + q)) rank = 2;
      return { s, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name))
    .slice(0, 10)
    .map(x => x.s);

  const searchSeqRef = useRef(0);
  const handleInstitutionInput = async (val) => {
    setInstitution(val);
    if (val.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = val.toLowerCase();

    if (isIntl) {
      setSuggestions(rankMatches(INTL_DB, q));
      setShowSuggestions(true);
      return;
    }

    // Show local cache immediately for snappy UX
    const localHits = rankMatches(usDb, q);
    if (localHits.length) {
      setSuggestions(localHits);
      setShowSuggestions(true);
    }

    // Then query the backend for the authoritative match set
    const seq = ++searchSeqRef.current;
    const escaped = val.replace(/[%_,]/g, ' ').trim();
    const { data, error } = await supabase
      .from("institutions")
      .select("unitid,name,city,state,us_news_list,flags,enrollment,fte,metrics,rankings,finance,ic2025,ic2025name,ic2025group,research2025,research2025name,saec2025,saec2025name,access_ratio,earnings_ratio,pell_2023")
      .ilike("name", `%${escaped}%`)
      .order("name", { ascending: true })
      .limit(25);
    if (seq !== searchSeqRef.current) return; // stale response
    if (error || !data) {
      if (!localHits.length) { setSuggestions([]); setShowSuggestions(false); }
      return;
    }
    const ranked = rankMatches(data.map(flattenInstitutionRow), q);
    setSuggestions(ranked);
    setShowSuggestions(ranked.length > 0);
  };

  const selectInstitution = (school) => {
    setInstitution(school.name);
    setUnitid(school.unitid ?? school.intlId ?? '');
    setCarnegieId(school.carnegieId);
    const populated = {};
    const autoFields = [];
    // Auto-set US News list from school DB or Carnegie default
    const defaultList = school.usNewsList ?? USNEWS_LIST_MAP[school.carnegieId] ?? null;
    if (defaultList) { populated.usNewsList = defaultList; }
    const fields = isIntl ? INTL_FIELDS : IPEDS_FIELDS;
    fields.forEach(field => {
      if (school[field] != null) {
        // Map accessPct → pellPct for international schools (same axis input)
        const targetField = (isIntl && field === 'accessPct') ? 'pellPct' : field;
        populated[targetField] = String(school[field]);
        autoFields.push(targetField);
      }
    });
    if (!isIntl && school.flags) {
      // Auto-check from hardcoded flags (annual review recommended)
      if (school.flags.bigFour) { populated.chk_bigFour = true; }
      if (school.flags.d1 && !school.flags.bigFour) { populated.chk_d1athletics = true; }
      if (school.flags.health) { populated.chk_healthSystem = true; }
      if (school.flags.law) { populated.chk_lawSchool = true; }
      if (school.flags.aacsb) { populated.chk_aacsb = true; }
      if (school.flags.eng) { populated.chk_engineering = true; }
      // US News ranks still populate as before
      if (school.usNewsLaw != null) { populated.chk_lawSchool = true; }
      if (school.usNewsBiz != null) { populated.chk_aacsb = true; }
      if (school.usNewsEng != null) { populated.chk_engineering = true; }
    } else if (!isIntl) {
      if (school.usNewsLaw != null) { populated.chk_lawSchool = true; }
      if (school.usNewsBiz != null) { populated.chk_aacsb = true; }
      if (school.usNewsEng != null) { populated.chk_engineering = true; }
    }
    // Auto-check defaults (international programs)
    if (school.checkboxDefaults) { school.checkboxDefaults.forEach(id => { populated[id] = true; }); }
    // Merge live IPEDS Finance / NACUBO snapshot (US institutions only).
    // Snapshot wins over hardcoded values for US rows; intl rows stay manual.
    if (!isIntl && school.unitid && financeSnapshot[school.unitid]) {
      const fin = financeSnapshot[school.unitid];
      if (fin.endowmentPerStudent != null) {
        populated.endowmentPerStudent = String(fin.endowmentPerStudent);
        autoFields.push('endowmentPerStudent');
      }
      if (fin.totalRevenue != null) {
        populated.totalRevenue = String(fin.totalRevenue);
        autoFields.push('totalRevenue');
      }
    }
    // 2025 Carnegie data — straight from the institutions row.
    if (!isIntl) {
      if (school.research2025 != null) {
        populated.researchDesignation = String(research2025ToScoreVal(school.research2025));
        autoFields.push('researchDesignation');
      }
      if (school.saec2025 != null) {
        populated.saecScore = String(school.saec2025);
        autoFields.push('saecScore');
      }
      if (school.accessRatio != null) {
        populated.accessRatio = String(school.accessRatio);
        autoFields.push('accessRatio');
      }
      setSelectedIc2025(school.ic2025 ?? null);
      setInstitutionSAEC(school.saec2025name ?? null);
      setInstitutionResearch(school.research2025name ?? null);
    } else {
      setSelectedIc2025(null);
      setInstitutionSAEC(null);
      setInstitutionResearch(null);
    }
    setValues(prev => ({ ...prev, ...populated }));
    setAutoPopulated(autoFields);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: "'Bitter', Georgia, serif", color: '#243551' }}>

      {/* Brand color rule */}
      <div style={{ height: 4, background: 'linear-gradient(to right, #1C3678 0%, #1C3678 35%, #EB5600 35%, #EB5600 55%, #6AA4C8 55%, #6AA4C8 75%, #E9EDEE 75%)' }} />

      {/* Header */}
      <div style={{ borderBottom: '1px solid #E9EDEE', padding: '20px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#595959', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Higher Education Brand Index</div>
            <div style={{ fontSize: 28, fontFamily: "'Young Serif', Georgia, serif", color: '#243551', lineHeight: 1 }}>mcfadden<span style={{ color: '#243551' }}>+</span>co</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {["carnegie","data","results"].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                opacity: step === s ? 1 : 0.45,
                cursor: (s !== "carnegie" && !carnegieId) ? 'not-allowed' : 'pointer',
              }} onClick={() => { if (s !== "carnegie" && !carnegieId) return; setStep(s); }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: step === s ? '#1C3678' : '#E9EDEE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: step === s ? '#FFFFFF' : '#243551',
                  fontFamily: "'Young Serif', Georgia, serif",
                }}>{i + 1}</div>
                <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: step === s ? 700 : 500, color: '#243551' }}>
                  {s === "carnegie" ? "Classify" : s === "data" ? "Enter Data" : "Results"}
                </span>
              </div>
              {i < 2 && <span style={{ color: '#A6ADBA', fontSize: 11 }}>›</span>}
            </div>
          ))}
        </div>
        {overall !== null
          ? <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#595959', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase' }}>Weighted Score</div>
              <div style={{ fontSize: 36, fontFamily: "'Young Serif', Georgia, serif", color: '#1C3678', lineHeight: 1 }}>{overall}</div>
              <div style={{ fontSize: 12, color: '#595959' }}>/100 · {selectedCarnegie?.short}</div>
            </div>
          : <div style={{ width: 80 }} />
        }
      </div>

      {/* STEP 1: Classify */}
      {step === "carnegie" && (
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 36px' }}>
          <div style={{ fontSize: 22, fontFamily: "'Young Serif', Georgia, serif", marginBottom: 8 }}>Identify Your Institution</div>
          <div style={{ fontSize: 14, color: '#243551', marginBottom: 20, lineHeight: 1.6, maxWidth: 560 }}>
            {isIntl
              ? "Start typing your institution’s name. International institutions are sourced from our global database. Revenue and endowment fields use USD equivalents."
              : "Start typing your institution’s name. If it’s in our database, we’ll pre-fill your IPEDS data automatically and suggest your Carnegie classification."}
          </div>

          {/* US / International toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 24, width: 'fit-content', border: '1px solid #E4E8EE', borderRadius: 8, overflow: 'hidden' }}>
            {[{ label: 'US Institution', val: false }, { label: 'International', val: true }].map(({ label, val }) => (
              <button key={label} onClick={() => { setIsIntl(val); setInstitution(''); setSuggestions([]); setUnitid(''); setAutoPopulated([]); }}
                style={{
                  padding: '8px 20px', fontSize: 12, letterSpacing: 1, fontFamily: "'Bitter', Georgia, serif",
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: isIntl === val ? '#EB5600' : '#F8FAFB',
                  color: isIntl === val ? '#FFFFFF' : '#6B7585',
                  fontWeight: isIntl === val ? 700 : 400,
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Typeahead */}
          <div style={{ marginBottom: 28, position: 'relative', maxWidth: 440 }}>
            <label style={{ fontSize: 14, letterSpacing: 2, color: '#243551', display: 'block', marginBottom: 8 }}>INSTITUTION NAME</label>
            <input
              ref={inputRef}
              value={institution}
              onChange={e => handleInstitutionInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Start typing your institution..."
              style={{ ...iStyle }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#FFFFFF', border: '1px solid #F4F6F8',
                borderRadius: 8, marginTop: 4, overflow: 'hidden',
              }}>
                {suggestions.map(s => (
                  <div key={s.unitid ?? s.intlId} onMouseDown={() => selectInstitution(s)} style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid #F4F6F8',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(235,86,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontSize: 14, color: '#243551', fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#595959', marginTop: 2 }}>
                      {s.city && s.state ? `${s.city}, ${s.state} · ` : ''}
                      {s.country
                        ? `${s.country}${s.intlGroup ? ' · ' + s.intlGroup : ''}`
                        : (CARNEGIE_CATEGORIES.find(c => c.id === s.carnegieId)?.short ?? s.carnegieId ?? '')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {autoPopulated.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#1A9988', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>✓</span>
                {autoPopulated.length} fields pre-filled from IPEDS · Carnegie classification confirmed
              </div>
            )}
          </div>

          {/* International keeps the legacy card grid */}
          {isIntl && (
            <>
              <div style={{ fontSize: 14, color: '#243551', marginBottom: 14 }}>
                {autoPopulated.length > 0 ? "Confirm or change your international classification:" : "Select your international classification:"}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
                {INTL_CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => { setCarnegieId(cat.id); if (USNEWS_LIST_MAP[cat.id]) setValues(p => ({ ...p, usNewsList: USNEWS_LIST_MAP[cat.id] })); }} style={{
                    textAlign: 'left', padding: '14px 16px',
                    background: carnegieId === cat.id ? '#FFFFFF' : '#F4F6F8',
                    border: carnegieId === cat.id ? '2px solid #1C3678' : '1px solid #E9EDEE',
                    borderRadius: 0, cursor: 'pointer', transition: 'all 0.12s',
                    boxShadow: carnegieId === cat.id ? 'inset 4px 0 0 0 #EB5600' : 'none',
                  }}>
                    <div style={{ fontSize: 14, fontFamily: "'Young Serif', Georgia, serif", color: '#243551', marginBottom: 4 }}>{cat.short}</div>
                    <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.5 }}>{cat.description}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* US: single auto-detected 2025 classification card with override dropdown */}
          {!isIntl && (() => {
            const matched = IC2025_COHORTS.find(c => c.id === selectedIc2025);
            const matchedName = matched?.label ?? null;
            const description = matched ? IC2025_DESCRIPTIONS[matched.id] : null;
            const groups = IC2025_GROUP_ORDER.map(g => ({
              group: g,
              items: IC2025_COHORTS.filter(c => c.group === g),
            }));
            const handlePick = (icId) => {
              const cohort = IC2025_COHORTS.find(c => c.id === icId);
              if (!cohort) return;
              setSelectedIc2025(icId);
              // Re-derive the legacy carnegieId, preferring the existing
              // research2025 designation if the institution had one.
              const r = parseFloat(values.researchDesignation);
              // researchDesignation field is 3=R1, 2=R2, 1=RCU, 0=None — invert
              const research2025 = r === 3 ? 1 : r === 2 ? 2 : r === 1 ? 3 : null;
              const newCid = deriveCarnegieId(icId, research2025);
              setCarnegieId(newCid);
              if (USNEWS_LIST_MAP[newCid]) setValues(p => ({ ...p, usNewsList: USNEWS_LIST_MAP[newCid] }));
            };
            return (
              <div style={{
                background: '#FFFFFF',
                border: '2px solid #1C3678',
                boxShadow: 'inset 4px 0 0 0 #EB5600',
                padding: '20px 22px',
                marginBottom: 28,
              }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: '#1C3678', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
                  2025 Carnegie Classification
                </div>
                {matched ? (
                  <>
                    <div style={{ fontSize: 18, fontFamily: "'Young Serif', Georgia, serif", color: '#243551', lineHeight: 1.25, marginBottom: 4 }}>
                      {matchedName}
                    </div>
                    {institutionResearch && (
                      <div style={{ fontSize: 13, color: '#EB5600', fontWeight: 600, marginBottom: 10 }}>
                        {institutionResearch}
                      </div>
                    )}
                    {description && (
                      <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.55, marginBottom: 14 }}>
                        {description}
                      </div>
                    )}
                    {institutionSAEC && (
                      <div style={{ fontSize: 12, color: '#595959', marginBottom: 14 }}>
                        <span style={{ color: '#1C3678', fontWeight: 600 }}>2025 SAEC:</span> {institutionSAEC}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: '#595959', marginBottom: 14, lineHeight: 1.55 }}>
                    Search for your institution above, or pick a 2025 classification below.
                  </div>
                )}

                <div style={{ borderTop: '1px solid #E9EDEE', paddingTop: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#595959', textTransform: 'uppercase', marginBottom: 8 }}>
                    {matched ? 'Classification incorrect? Change it:' : 'Choose a classification:'}
                  </div>
                  <Select
                    value={selectedIc2025 != null ? String(selectedIc2025) : undefined}
                    onValueChange={v => handlePick(parseInt(v, 10))}
                  >
                    <SelectTrigger
                      className="h-11 w-full rounded-none border-2 border-[#1C3678] bg-white px-3 text-[14px] text-[#243551] font-['Bitter',Georgia,serif] shadow-none hover:bg-[#F5F7FA] focus:ring-2 focus:ring-[#1C3678] focus:ring-offset-0 [&>svg]:text-[#EB5600] [&>svg]:opacity-100"
                    >
                      <SelectValue placeholder="Select a 2025 IC classification…" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      avoidCollisions={false}
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="z-[100] max-h-[360px] rounded-none border-2 border-[#1C3678] bg-white font-['Bitter',Georgia,serif] shadow-[0_12px_32px_-12px_rgba(28,54,120,0.35)]"
                    >
                      {groups.map((g, gi) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel
                            className="px-3 pb-1 pt-3 pl-3 font-['Young_Serif',Georgia,serif] text-[11px] uppercase tracking-[2px] text-[#1C3678] font-normal flex items-center gap-2"
                          >
                            <span className="inline-block h-[2px] w-6 bg-[#6AA4C8]" />
                            {g.group}
                          </SelectLabel>
                          {g.items.map(c => (
                            <SelectItem
                              key={c.id}
                              value={String(c.id)}
                              className="rounded-none px-3 py-2 pl-8 text-[14px] text-[#243551] focus:bg-[#E9EDEE] focus:text-[#1C3678] data-[state=checked]:text-[#1C3678] [&>span:first-child>span>svg]:text-[#EB5600]"
                            >
                              {c.label}
                            </SelectItem>
                          ))}
                          {gi < groups.length - 1 && <div className="my-1 h-px bg-[#E9EDEE]" />}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })()}

          {carnegieId
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={() => setStep("data")} style={{
                  background: '#EB5600', color: '#FFFFFF', border: 'none',
                  borderRadius: 6, padding: '9px 22px', fontSize: 14, fontWeight: 700,
                  letterSpacing: 1.5, cursor: 'pointer', fontFamily: "'Bitter', Georgia, serif",
                }}>CONTINUE →</button>
              </div>
            : <div style={{ fontSize: 14, color: '#3D4F6B', fontStyle: 'italic' }}>Select a classification to continue</div>
          }

        </div>
      )}

      {/* STEP 2: Data entry */}
      {step === "data" && (
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 73px)' }}>
          <div style={{ width: 370, borderRight: '1px solid #F4F6F8', padding: '22px 24px', overflowY: 'auto' }}>
            {(() => {
              const ic = IC2025_COHORTS.find(c => c.id === selectedIc2025);
              return (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: '#1C3678', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>2025 Carnegie</div>
                    {ic && <div style={{ fontSize: 14, fontFamily: "'Young Serif', Georgia, serif", color: '#243551', lineHeight: 1.3 }}>{ic.label}</div>}
                    {institutionResearch && <div style={{ fontSize: 12, color: '#EB5600', fontWeight: 600, marginTop: 2 }}>{institutionResearch}</div>}
                    {institution && <div style={{ fontSize: 14, color: '#243551', marginTop: 6 }}>{institution}</div>}
                    {institutionSAEC && (
                      <div style={{ fontSize: 11, color: '#595959', marginTop: 4 }}>
                        <span style={{ color: '#1C3678', fontWeight: 600 }}>SAEC:</span> {institutionSAEC}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setStep("carnegie")} style={{ fontSize: 11, letterSpacing: 1.5, color: '#595959', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0 }}>← BACK</button>
                </div>
              );
            })()}
            {autoPopulated.length > 0 && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(26,153,136,0.08)', border: '1px solid rgba(26,153,136,0.25)', borderRadius: 8, fontSize: 14, color: '#1A9988', lineHeight: 1.5 }}>
                ✓ {autoPopulated.length} fields pre-filled from IPEDS. Review and complete remaining inputs.
              </div>
            )}

            {/* Axis tabs */}
            <div style={{ fontSize: 14, letterSpacing: 2, color: '#243551', marginBottom: 8 }}>DIMENSIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 16 }}>
              {activeAxes.map((a, i) => {
                const s = scores[a.key];
                const isAuto = a.inputs.some(inp => autoPopulated.includes(inp.id));
                return (
                  <button key={a.key} onClick={() => setActiveAxis(i)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: activeAxis === i ? '#F4F6F8' : 'transparent',
                    border: activeAxis === i ? `1px solid ${a.color}44` : '1px solid transparent',
                    borderRadius: 6, padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: activeAxis === i ? '#243551' : '#243551', fontWeight: activeAxis === i ? 600 : 400 }}>{a.label}</span>
                      {isAuto && <span style={{ fontSize: 14, color: '#1A9988', letterSpacing: 0.5 }}>IPEDS</span>}
                    </span>
                    {s != null && <span style={{ fontSize: 14, fontFamily: "'Bitter', Georgia, serif", color: a.color }}>{Math.round(s)}</span>}
                  </button>
                );
              })}
            </div>

            {curAxis && (
              <div style={{ background: '#F4F6F8', border: `1px solid ${curAxis.color}33`, borderRadius: 10, padding: '14px' }}>
                <div style={{ fontSize: 14, color: curAxis.color, fontWeight: 700, marginBottom: 3 }}>{curAxis.label}</div>
                <div style={{ fontSize: 14, color: '#243551', marginBottom: 13, lineHeight: 1.5 }}>{curAxis.description}</div>
                {curAxis.inputs.map(input => {
                  const isAutoPop = autoPopulated.includes(input.id);
                  return (
                    <div key={input.id} style={{ marginBottom: 11 }}>
                      <label style={{ fontSize: 14, color: isAutoPop ? '#1A9988' : '#243551', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, lineHeight: 1.4 }}>
                        {input.id === 'usNews' && values.usNewsList
                          ? `US News ${USNEWS_LIST_LABELS[values.usNewsList]} Rank`
                          : (isIntl && input.labelIntl) ? input.labelIntl : input.label}
                        {isAutoPop && <span style={{ fontSize: 8, letterSpacing: 1, color: '#1A9988' }}>IPEDS</span>}
                      </label>
                      {input.usNewsListSelector ? (
                        <div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(['natl_univ','lib_arts','regional','best_colleges']).map(lst => (
                              <button key={lst} onClick={() => setValues(p => ({ ...p, usNewsList: lst }))}
                                style={{
                                  padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                                  fontFamily: "'Bitter', Georgia, serif", border: 'none', transition: 'all 0.12s',
                                  background: values.usNewsList === lst ? '#EB5600' : '#EEF1F4',
                                  color: values.usNewsList === lst ? '#FFFFFF' : '#6B7585',
                                  fontWeight: values.usNewsList === lst ? 700 : 400,
                                }}>
                                {USNEWS_LIST_LABELS[lst]}
                              </button>
                            ))}
                          </div>
                          {values.usNewsList && (
                            <div style={{ fontSize: 10, color: '#A6ADBA', marginTop: 5 }}>
                              Auto-suggested: {USNEWS_LIST_LABELS[USNEWS_LIST_MAP[carnegieId]]}
                              {USNEWS_LIST_MAP[carnegieId] !== values.usNewsList && ' (overridden)'}
                            </div>
                          )}
                        </div>
                      ) : isAutoPop ? (
                        <div style={{ ...iStyle, fontFamily: "'Bitter', Georgia, serif", background: 'rgba(26,153,136,0.06)', borderColor: 'rgba(26,153,136,0.30)', color: '#243551', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'not-allowed' }}>
                          <span>{input.nicheGrade ? (['A+','A','A-','B+','B','B-','C+','C','C-','D','F'][['100','91','83','75','67','58','50','42','33','25','0'].indexOf(String(values[input.id]))] ?? values[input.id]) : (values[input.id] ?? '—')}</span>
                          <span style={{ fontSize: 9, letterSpacing: 1, color: '#1A9988', opacity: 0.8 }}>LOCKED</span>
                        </div>
                      ) : input.nicheGrade ? (
                        <select value={values[input.id] ?? ''} onChange={e => setValues(p => ({ ...p, [input.id]: e.target.value }))}
                          style={{ ...iStyle, fontFamily: "'Bitter', Georgia, serif", cursor: 'pointer' }}>
                          <option value="">-- Select grade --</option>
                          <option value="100">A+</option>
                          <option value="91">A</option>
                          <option value="83">A-</option>
                          <option value="75">B+</option>
                          <option value="67">B</option>
                          <option value="58">B-</option>
                          <option value="50">C+</option>
                          <option value="42">C</option>
                          <option value="33">C-</option>
                          <option value="25">D</option>
                          <option value="0">F / Not graded</option>
                        </select>
                      ) : (
                        <input type="number" value={values[input.id] ?? ''} onChange={e => setValues(p => ({ ...p, [input.id]: e.target.value }))}
                          placeholder={input.placeholder} style={{ ...iStyle, fontFamily: "'Bitter', Georgia, serif", borderColor: '#D6DCE5' }} />
                      )}
                      {['endowmentPerStudent','totalRevenue'].includes(input.id) && (
                        <BenchmarkDropdown field={{ id: input.id, section: 'financial' }} carnegieId={carnegieId} color="#1C3678" />
                      )}
                      {['mktgBudgetPct','mktgFTE'].includes(input.id) && (
                        <BenchmarkDropdown field={{ id: input.id, section: 'brand' }} carnegieId={carnegieId} color="#A8C46A" />
                      )}
                    </div>
                  );
                })}

                {curAxis.checkboxes && curAxis.checkboxes.length > 0 && (
                  <div style={{ marginTop: 14, borderTop: '1px solid #E9EDEE', paddingTop: 14 }}>
                    <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#6B7585', marginBottom: 8, textTransform: 'uppercase' }}>
                      {curAxis.key === 'visibility' ? 'Athletic Conference Visibility' : curAxis.key === 'profile' ? 'Institutional Profile Assets' : 'Academic & Institutional Assets'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7585', marginBottom: 10, lineHeight: 1.5 }}>
                      {curAxis.key === 'visibility'
                        ? 'Check all that apply. Athletic conferences drive significant national brand exposure.'
                        : curAxis.key === 'profile'
                        ? 'Auto-populated from institutional database. Ranked programs score higher. Review annually.'
                        : 'Check all that apply. Ranked programs contribute bonus credit; unranked = presence credit only.'}
                    </div>
                    {curAxis.checkboxes.map(chk => (
                      <div key={chk.id} style={{ marginBottom: 6 }}>
                        <div onClick={() => setValues(p => ({ ...p, [chk.id]: !p[chk.id] }))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                            borderRadius: values[chk.id] && chk.rankId ? '6px 6px 0 0' : 6,
                            cursor: 'pointer',
                            background: values[chk.id] ? '#E4E8EE' : '#FAFBFC',
                            border: values[chk.id] ? '1px solid #8A93A1' : '1px solid #E9EDEE',
                            transition: 'all 0.12s',
                          }}>
                          <div style={{
                            width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                            background: values[chk.id] ? '#1C3678' : 'transparent',
                            border: values[chk.id] ? '1px solid #1C3678' : '1px solid #A6ADBA',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {values[chk.id] && <span style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 13, color: values[chk.id] ? '#ffffff' : '#595959', lineHeight: 1.4 }}>{chk.label}</span>
                        </div>
                        {values[chk.id] && chk.rankId && (
                          <div style={{
                            padding: '8px 10px 10px',
                            background: '#EEF1F4',
                            border: '1px solid #8A93A1',
                            borderTop: 'none',
                            borderRadius: '0 0 6px 6px',
                          }}>
                            <label style={{ fontSize: 10, color: autoPopulated.includes(chk.rankId) ? '#1A9988' : '#6B7585', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              {chk.rankLabel} <span style={{ color: '#A6ADBA' }}>(blank if unranked in top {chk.rankMax})</span>
                              {autoPopulated.includes(chk.rankId) && <span style={{ fontSize: 8, letterSpacing: 1, color: '#1A9988' }}>IPEDS</span>}
                            </label>
                            {autoPopulated.includes(chk.rankId) ? (
                              <div style={{ ...iStyle, fontFamily: "'Bitter', Georgia, serif", fontSize: 13, padding: '6px 10px', background: 'rgba(26,153,136,0.06)', borderColor: 'rgba(26,153,136,0.30)', color: '#243551', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'not-allowed' }}>
                                <span>{values[chk.rankId] ?? '—'}</span>
                                <span style={{ fontSize: 9, letterSpacing: 1, color: '#1A9988' }}>LOCKED</span>
                              </div>
                            ) : (
                              <input type="number" value={values[chk.rankId] ?? ''}
                                onChange={e => setValues(p => ({ ...p, [chk.rankId]: e.target.value }))}
                                placeholder="e.g. 12"
                                onClick={e => e.stopPropagation()}
                                style={{ ...iStyle, fontFamily: "'Bitter', Georgia, serif", fontSize: 13, padding: '6px 10px' }} />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 11, color: '#8A93A1' }}>
                      {curAxis.checkboxes.filter(c => values[c.id] === true).length} of {curAxis.checkboxes.length} selected
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setStep("results")} disabled={overall === null} style={{
              width: '100%', marginTop: 14,
              background: overall !== null ? '#EB5600' : '#F4F6F8',
              color: overall !== null ? '#FFFFFF' : '#3D4F6B',
              border: 'none', borderRadius: 6, padding: '10px',
              fontSize: 14, fontWeight: 700, letterSpacing: 1.5,
              cursor: overall !== null ? 'pointer' : 'not-allowed',
              fontFamily: "'Bitter', Georgia, serif",
            }}>VIEW RESULTS →</button>
          </div>

          {/* Live chart */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '20px 32px', gap: 14 }}>
            {institution && <div style={{ fontSize: 16, fontFamily: "'Young Serif', Georgia, serif" }}>{institution}</div>}
            <SpiderChart scores={scores} carnegieAvg={carnegieAvg} globalAvg={globalAvg} axes={activeAxes} />
            <div style={{ display: 'flex', gap: 18, fontSize: 14, color: '#243551', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 16, height: 2, background: '#EB5600', display: 'inline-block' }} /> Your Institution
              </span>
              {carnegieAvg
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 16, height: 0, border: '1px dashed #595959', display: 'inline-block' }} /> {selectedCarnegie?.short} avg (n={carnegieAvg.n})
                  </span>
                : <span style={{ color: '#6B7585' }}>{selectedCarnegie?.short} avg: insufficient cohort</span>
              }
              {globalAvg
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 16, height: 0, border: '1px dotted rgba(106,164,200,0.5)', display: 'inline-block' }} /> All institutions avg (n={globalAvg.n})
                  </span>
                : <span style={{ color: '#6B7585' }}>All avg: insufficient cohort</span>
              }
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Results */}
      {step === "results" && (
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 24 }}>
            <div>
              {institution && <div style={{ fontSize: 22, fontFamily: "'Young Serif', Georgia, serif", marginBottom: 6 }}>{institution}</div>}
              <div style={{ fontSize: 14, color: '#243551', marginBottom: 3 }}>
                {selectedCarnegie?.label}
                {values.qsRank && (
                  <span style={{ marginLeft: 10, fontSize: 11, letterSpacing: 1, color: '#EB5600', background: 'rgba(235,86,0,0.12)', border: '1px solid rgba(235,86,0,0.30)', borderRadius: 4, padding: '2px 7px' }}>
                    {QS_BAND_LABELS[qsBand]}
                  </span>
                )}
              </div>
              {unitid && <div style={{ fontSize: 14, color: '#6B7585' }}>IPEDS Unit ID: {unitid}</div>}
            </div>
            {overall !== null && (
              <div style={{ background: 'rgba(235,86,0,0.08)', border: '1px solid #EB560033', borderRadius: 12, padding: '16px 22px', flexShrink: 0, minWidth: 280 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: '#243551', marginBottom: 10 }}>WEIGHTED BRAND INDEX</div>
                    <div style={{ fontSize: 50, fontFamily: "'Bitter', Georgia, serif", color: '#EB5600', lineHeight: 1 }}>{overall}</div>
                    <div style={{ fontSize: 12, color: '#6B7585', marginTop: 2 }}>
                      /100 · {selectedCarnegie?.short}
                      {values.qsRank && <span style={{ marginLeft: 6, color: 'rgba(235,86,0,0.70)', fontSize: 11 }}>· {QS_BAND_LABELS[qsBand]}</span>}
                    </div>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: '#EB560033' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#6B7585', marginBottom: 6 }}>COHORT SIZE</div>
                      <div style={{ fontSize: 18, fontFamily: "'Bitter', Georgia, serif", color: '#243551', lineHeight: 1 }}>
                        {classificationCohortSize}
                        <span style={{ fontSize: 11, color: '#6B7585', marginLeft: 4 }}>schools</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#6B7585', marginBottom: 6 }}>COHORT AVG INDEX</div>
                      <div style={{ fontSize: 18, fontFamily: "'Bitter', Georgia, serif", color: '#243551', lineHeight: 1 }}>
                        {classificationCohortAvg ?? '–'}
                        <span style={{ fontSize: 11, color: '#6B7585', marginLeft: 4 }}>/100</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <SpiderChart scores={scores} carnegieAvg={carnegieAvg} globalAvg={globalAvg} axes={activeAxes} />
              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#243551' }}>
                  <span style={{ width: 20, height: 2, background: '#EB5600', display: 'inline-block', borderRadius: 1 }} />
                  {institution || "Your institution"}
                </span>
                {carnegieAvg
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#243551' }}>
                      <span style={{ width: 20, height: 0, border: '1.5px dashed #595959', display: 'inline-block' }} />
                      {selectedCarnegie?.short} average (n={carnegieAvg.n})
                    </span>
                  : <span style={{ fontSize: 14, color: '#6B7585', fontStyle: 'italic' }}>
                      {selectedCarnegie?.short} avg requires n≥{MIN_N}
                    </span>
                }
                {globalAvg
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(106,164,200,0.6)' }}>
                      <span style={{ width: 20, height: 0, border: '1.5px dotted rgba(106,164,200,0.5)', display: 'inline-block' }} />
                      All institutions average (n={globalAvg.n})
                    </span>
                  : <span style={{ fontSize: 14, color: '#6B7585', fontStyle: 'italic' }}>
                      Global avg requires n≥{MIN_N}
                    </span>
                }
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 14, letterSpacing: 2, color: '#243551', marginBottom: 10 }}>DIMENSION BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeAxes.map(a => {
                  const s = scores[a.key];
                  const ca = carnegieAvg?.scores[a.key];
                  const ga = globalAvg?.scores[a.key];
                  const caN = carnegieAvg?.counts?.[a.key];
                  const gaN = globalAvg?.counts?.[a.key];
                  const delta = (s != null && ca != null) ? Math.round(s - ca) : null;
                  const w = WEIGHTS[carnegieId]?.[a.key] ?? 0;
                  return (
                    <div key={a.key} style={{
                      background: '#F4F6F8', border: `1px solid ${a.color}1a`,
                      borderRadius: 8, padding: '10px 13px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.color }} />
                          <span style={{ fontSize: 14, color: '#595959' }}>{a.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {delta !== null && <span style={{ fontSize: 14, color: delta >= 0 ? '#1A9988' : '#EB5600' }}>{delta >= 0 ? '+' : ''}{delta} vs {selectedCarnegie?.short}</span>}
                          <span style={{ fontSize: 17, fontFamily: "'Bitter', Georgia, serif", color: s != null ? '#243551' : '#6B7585' }}>{s != null ? Math.round(s) : '–'}</span>
                          <span style={{ fontSize: 14, color: '#6B7585' }}>{Math.round(w * 100)}%</span>
                        </div>
                      </div>
                      {s != null && (
                        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: '#F4F6F8' }}>
                          <div style={{ width: `${s}%`, height: '100%', background: a.color, borderRadius: 2, position: 'absolute', top: 0, left: 0 }} />
                          {ca != null && <div style={{ width: 2, height: 8, background: '#243551', position: 'absolute', top: -2, left: `${ca}%`, borderRadius: 1 }} title={`${selectedCarnegie?.short} avg: ${Math.round(ca)} (n=${caN})`} />}
                          {ga != null && <div style={{ width: 2, height: 8, background: 'rgba(106,164,200,0.5)', position: 'absolute', top: -2, left: `${ga}%`, borderRadius: 1 }} title={`All institutions avg: ${Math.round(ga)} (n=${gaN})`} />}
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 10, color: '#8A93A1', letterSpacing: 0.3 }}>
                        {ca != null
                          ? <>Peer data: {caN} {selectedCarnegie?.short} {caN === 1 ? 'school' : 'schools'}{gaN != null ? ` · ${gaN} all institutions` : ''}</>
                          : <span style={{ color: '#EB5600' }}>No peer data available for this pillar in the current cohort.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Strategic Insight Report — peer-relative readout */}
          {overall !== null && Object.keys(scores).length > 0 && (
            <InsightReport
              focal={{
                name: institution || "Your institution",
                carnegieId,
                usNewsList: values.usNewsList,
                flags: {
                  bigFour: values.chk_bigFour ? 1 : 0,
                  d1:      values.chk_d1athletics ? 1 : 0,
                },
                intlGroup: scoredPool.find(p => p.name === institution)?.intlGroup,
                scores,
              }}
              scoredPool={scoredPool}
              axes={activeAxes}
              carnegieLabel={selectedCarnegie?.short || selectedCarnegie?.label || ''}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button onClick={() => setStep("data")} style={{ background: 'transparent', color: '#243551', border: '1px solid #A6ADBA', borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: 'pointer', fontFamily: "'Bitter', Georgia, serif" }}>← EDIT DATA</button>
            <button onClick={() => { setStep("carnegie"); setCarnegieId(''); setValues({}); setInstitution(''); setUnitid(''); setAutoPopulated([]); setSubmitted(false); }} style={{ background: 'transparent', color: '#243551', border: '1px solid rgba(28,54,120,0.22)', borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: 'pointer', fontFamily: "'Bitter', Georgia, serif" }}>START OVER</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 14, color: '#6B7585', lineHeight: 1.6, borderTop: '1px solid #F4F6F8', paddingTop: 14 }}>
            Weightings calibrated per the 2025 Carnegie Institutional Classification (ACE / Carnegie Foundation). Data sources: IPEDS Finance (F1A/F2), DRVEF enrollment, NSF HERD, VSE survey, American Caldwell Visibility Index / QS / Times. Aggregate overlays require a minimum of {MIN_N} institutions per classification.
          </div>
        </div>
      )}
    </div>
  );
}
