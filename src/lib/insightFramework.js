// ───────────────────────────────────────────────────────────────────────────
// Insight Framework
// Per-school strategic report: compare an institution's pillar scores to a
// configurable peer cohort using z-scores, surface strengths/gaps, and
// generate cohort top-line findings. Pure functions, no React.
// ───────────────────────────────────────────────────────────────────────────

// ── Peer lens definitions ──────────────────────────────────────────────────
// Each lens returns the subset of `pool` (already-scored institutions) that
// counts as a peer for the focal institution.

export const LENSES = [
  {
    id: "carnegie",
    label: "Carnegie classification",
    short: "Carnegie",
    description: "Institutions sharing your Carnegie / international classification.",
    match: (focal, p) => p.carnegieId === focal.carnegieId,
  },
  {
    id: "size",
    label: "Carnegie + enrollment band",
    short: "Carnegie + size",
    description: "Same classification and a similar enrollment footprint (social-reach proxy).",
    match: (focal, p) => p.carnegieId === focal.carnegieId && sameSizeBand(focal, p),
  },
  {
    id: "sector",
    label: "Carnegie + US News list",
    short: "Carnegie + list",
    description: "Same classification and the same US News ranking list (sector proxy).",
    match: (focal, p) =>
      p.carnegieId === focal.carnegieId &&
      (focal.usNewsList ? p.usNewsList === focal.usNewsList : true),
  },
  {
    id: "conference",
    label: "Athletic / affiliation peers",
    short: "Affiliation",
    description: "Big Four, D1, or international elite-group peers — affinity-based brand cohort.",
    match: (focal, p) => sameAffiliation(focal, p),
  },
];

function sameSizeBand(focal, p) {
  const a = totalSocial(focal);
  const b = totalSocial(p);
  if (a == null || b == null) return true; // don't filter when we can't measure
  // Bands: <300K, 300–800K, 800–1800K, 1800K+
  const band = (v) => (v < 300 ? 0 : v < 800 ? 1 : v < 1800 ? 2 : 3);
  return band(a) === band(b);
}

function totalSocial(s) {
  const f = ["socialIg", "socialLi", "socialX", "socialFb", "socialYt"];
  let sum = 0, hasAny = false;
  f.forEach((k) => {
    const v = parseFloat(s[k]);
    if (!isNaN(v)) { sum += v; hasAny = true; }
  });
  return hasAny ? sum : null;
}

function sameAffiliation(focal, p) {
  const fFlags = focal.flags || {};
  const pFlags = p.flags || {};
  if (focal.intlGroup && p.intlGroup) return focal.intlGroup === p.intlGroup;
  if (fFlags.bigFour && pFlags.bigFour) return true;
  if (fFlags.d1 && pFlags.d1 && !fFlags.bigFour && !pFlags.bigFour) return true;
  // Fallback: same Carnegie if no affiliation signal
  if (!fFlags.bigFour && !fFlags.d1 && !focal.intlGroup) {
    return p.carnegieId === focal.carnegieId;
  }
  return false;
}

// ── Statistics ─────────────────────────────────────────────────────────────

export function mean(arr) {
  const xs = arr.filter((v) => v != null && !isNaN(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(arr) {
  const xs = arr.filter((v) => v != null && !isNaN(v));
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function median(arr) {
  const xs = arr.filter((v) => v != null && !isNaN(v)).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// ── Strength / gap classification ──────────────────────────────────────────

export function classifyZ(z) {
  if (z == null || isNaN(z)) return { tier: "insufficient", label: "Insufficient peer data" };
  if (z >= 1.5)  return { tier: "leader",      label: "Category leader" };
  if (z >= 0.5)  return { tier: "strength",    label: "Notable strength" };
  if (z > -0.5)  return { tier: "on-par",      label: "On par with peers" };
  if (z > -1.5)  return { tier: "gap",         label: "Notable gap" };
  return            { tier: "critical-gap", label: "Critical gap" };
}

const TIER_COLORS = {
  "leader":       "#7EB8A4",
  "strength":     "#9BC9B6",
  "on-par":       "rgba(255,255,255,0.55)",
  "gap":          "#E8A87C",
  "critical-gap": "#D4786A",
  "insufficient": "rgba(255,255,255,0.35)",
};

export function tierColor(tier) {
  return TIER_COLORS[tier] || TIER_COLORS["on-par"];
}

// ── Cohort builder ─────────────────────────────────────────────────────────
// Given a list of scored peer institutions and a lens, return an array of
// peers. Each peer must have `.scores` (pillar→0-100). The focal institution
// is excluded by name match if present.

export function buildCohort({ focal, scoredPool, lensId }) {
  const lens = LENSES.find((l) => l.id === lensId) || LENSES[0];
  return scoredPool.filter(
    (p) => p.name !== focal.name && lens.match(focal, p) && p.scores
  );
}

// ── Per-pillar analysis ────────────────────────────────────────────────────

export function analyzePillars({ focalScores, cohort, axes }) {
  return axes.map((axis) => {
    const peerVals = cohort.map((p) => p.scores[axis.key]).filter((v) => v != null);
    const m = mean(peerVals);
    const sd = stdev(peerVals);
    const med = median(peerVals);
    const userScore = focalScores[axis.key];
    const z = (userScore != null && m != null && sd && sd > 1) ? (userScore - m) / sd : null;
    const cls = classifyZ(z);

    // Cohort leader on this pillar
    let leader = null;
    if (cohort.length) {
      leader = cohort.reduce(
        (best, p) => (p.scores[axis.key] != null && (!best || p.scores[axis.key] > best.scores[axis.key]) ? p : best),
        null
      );
    }

    return {
      axis,
      userScore: userScore != null ? Math.round(userScore) : null,
      peerMean: m != null ? Math.round(m) : null,
      peerMedian: med != null ? Math.round(med) : null,
      peerStdev: sd != null ? Math.round(sd * 10) / 10 : null,
      n: peerVals.length,
      z: z != null ? Math.round(z * 100) / 100 : null,
      tier: cls.tier,
      tierLabel: cls.label,
      delta: userScore != null && m != null ? Math.round(userScore - m) : null,
      leaderName: leader ? leader.name : null,
      leaderScore: leader && leader.scores[axis.key] != null ? Math.round(leader.scores[axis.key]) : null,
    };
  });
}

// ── Top-line cohort findings ───────────────────────────────────────────────

export function cohortTopLine({ cohort, axes }) {
  if (!cohort.length) return null;
  // Average overall (mean of pillar means)
  const pillarMeans = axes.map((a) => mean(cohort.map((p) => p.scores[a.key])));
  const validPillarMeans = pillarMeans.filter((v) => v != null);
  const cohortAvg = validPillarMeans.length
    ? Math.round(validPillarMeans.reduce((a, b) => a + b, 0) / validPillarMeans.length)
    : null;

  // Strongest and weakest pillars across the cohort (highest / lowest mean)
  const ranked = axes
    .map((a, i) => ({ axis: a, mean: pillarMeans[i] }))
    .filter((r) => r.mean != null)
    .sort((a, b) => b.mean - a.mean);
  const strongestPillar = ranked[0] || null;
  const weakestPillar = ranked[ranked.length - 1] || null;

  // Cohort overall leader (mean of available pillar scores per institution)
  let topInstitution = null;
  let topAvg = -Infinity;
  cohort.forEach((p) => {
    const vals = axes.map((a) => p.scores[a.key]).filter((v) => v != null);
    if (!vals.length) return;
    const a = vals.reduce((x, y) => x + y, 0) / vals.length;
    if (a > topAvg) { topAvg = a; topInstitution = { name: p.name, avg: Math.round(a) }; }
  });

  return {
    n: cohort.length,
    cohortAvg,
    strongestPillar: strongestPillar ? { key: strongestPillar.axis.key, label: strongestPillar.axis.label, mean: Math.round(strongestPillar.mean) } : null,
    weakestPillar:   weakestPillar   ? { key: weakestPillar.axis.key,   label: weakestPillar.axis.label,   mean: Math.round(weakestPillar.mean) }   : null,
    topInstitution,
  };
}

// ── Narrative copy ─────────────────────────────────────────────────────────

export function pillarNarrative(p, focalName) {
  const name = focalName || "Your institution";
  if (p.tier === "insufficient") {
    return `Not enough peers in this cohort to position ${name} on ${p.axis.label.toLowerCase()}. Broaden the lens for a fuller read.`;
  }
  const absDelta = p.delta != null ? Math.abs(p.delta) : null;
  const aboveBy = absDelta != null ? `${absDelta} pts above the peer average` : "above the peer average";
  const belowBy = absDelta != null ? `${absDelta} pts below the peer average` : "below the peer average";
  const leader = p.leaderName ? ` Cohort leader: ${p.leaderName} (${p.leaderScore}).` : "";

  switch (p.tier) {
    case "leader":
      return `${name} is a category leader on ${p.axis.label.toLowerCase()}, sitting ${aboveBy}. This is a defensible brand asset to lead with in market positioning.${leader}`;
    case "strength":
      return `${name} runs ${aboveBy} on ${p.axis.label.toLowerCase()}. Worth amplifying in storytelling and recruitment messaging.${leader}`;
    case "on-par":
      return `${name} performs roughly at peer parity on ${p.axis.label.toLowerCase()}. Neither a competitive advantage nor a liability — opportunity to differentiate.${leader}`;
    case "gap":
      return `${name} trails the peer average on ${p.axis.label.toLowerCase()} by ${absDelta ?? "a few"} pts. Worth a focused investment plan if this pillar is strategically important.${leader}`;
    case "critical-gap":
      return `${name} is materially behind the cohort on ${p.axis.label.toLowerCase()}, ${belowBy}. High-priority gap — consider whether to invest aggressively or de-emphasize in positioning.${leader}`;
    default:
      return "";
  }
}

// ── Score the institutional database against AXES ──────────────────────────
// Wraps the app's `normalizeAxis` so we can build a scored peer pool from
// IPEDS_DB / INTL_DB without changing existing scoring logic.

export function scorePool(rawDb, axes, normalizeAxis) {
  return rawDb.map((row) => {
    const scores = {};
    axes.forEach((axis) => {
      // hide pillars that don't apply to this carnegieId
      if (axis.hiddenFor && axis.hiddenFor.includes(row.carnegieId)) return;
      const s = normalizeAxis(axis, row);
      if (s != null) scores[axis.key] = s;
    });
    return { ...row, scores };
  });
}
