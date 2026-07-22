import { useMemo, useState, useRef, useEffect } from "react";
import {
  buildCohort,
  analyzePillars,
  pillarNarrative,
  tierColor,
} from "../lib/insightFramework";
import {
  weightedOverall,
  blendWeights,
  getQsBand,
  QS_BAND_LABELS,
} from "../pages/HEBrandEquity";


// ─────────────────────────────────────────────────────────────────────────
// InsightReport
// Per-school strategic readout shown after the assessment is complete.
// Two view modes:
//   • "classification" — peers = same Carnegie / international classification
//   • "compare"        — peers = up to 5 user-selected institutions
// ─────────────────────────────────────────────────────────────────────────

const MAX_COMPARE = 8;

export default function InsightReport({
  focal,            // { name, carnegieId, scores, ... }
  scoredPool,       // [{ name, carnegieId, scores, ... }, ...]
  axes,             // active axes for this carnegieId
  carnegieLabel,    // human-readable
}) {
  const [mode, setMode] = useState("classification"); // "classification" | "compare"
  const [compareIds, setCompareIds] = useState([]);   // array of unitid/intlId
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef(null);

  // Build cohort based on mode
  const cohort = useMemo(() => {
    if (mode === "classification") {
      return buildCohort({ focal, scoredPool, lensId: "carnegie" });
    }
    // compare mode — selected schools only, exclude focal
    const idSet = new Set(compareIds);
    return scoredPool.filter(p => {
      const pid = p.unitid ?? p.intlId;
      return idSet.has(pid) && p.name !== focal.name && p.scores;
    });
  }, [mode, compareIds, focal, scoredPool]);

  const pillarAnalysis = useMemo(
    () => analyzePillars({ focalScores: focal.scores, cohort, axes }),
    [focal.scores, cohort, axes]
  );

  // Typeahead suggestions for compare mode
  const suggestions = useMemo(() => {
    if (mode !== "compare" || query.length < 2) return [];
    const q = query.toLowerCase();
    const idSet = new Set(compareIds);
    return scoredPool
      .filter(p => {
        const pid = p.unitid ?? p.intlId;
        return p.name !== focal.name &&
          !idSet.has(pid) &&
          p.name.toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [mode, query, compareIds, scoredPool, focal.name]);

  const compareSchools = useMemo(() => {
    const idSet = new Set(compareIds);
    return scoredPool.filter(p => idSet.has(p.unitid ?? p.intlId));
  }, [compareIds, scoredPool]);

  const addSchool = (school) => {
    if (compareIds.length >= MAX_COMPARE) return;
    const pid = school.unitid ?? school.intlId;
    setCompareIds(ids => ids.includes(pid) ? ids : [...ids, pid]);
    setQuery("");
    setShowSuggest(false);
    inputRef.current?.focus();
  };

  const removeSchool = (pid) => {
    setCompareIds(ids => ids.filter(x => x !== pid));
  };

  const strengths = pillarAnalysis.filter((p) => p.tier === "leader" || p.tier === "strength");
  const gaps      = pillarAnalysis.filter((p) => p.tier === "gap" || p.tier === "critical-gap");

  const focalName = focal.name || "Your institution";
  const minPeers = mode === "classification" ? 3 : 1;

  return (
    <div style={{
      marginTop: 36,
      padding: '28px 28px 24px',
      background: '#FAFBFC',
      border: '1px solid #EEF1F4',
      borderRadius: 14,
    }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #E9EDEE', paddingBottom: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 2.5, color: '#EB5600', fontFamily: "'Bitter', Georgia, serif", marginBottom: 8 }}>
          STRATEGIC INSIGHT REPORT
        </div>
        <div style={{ fontSize: 28, fontFamily: "'Young Serif', Georgia, serif", color: '#243551', lineHeight: 1.2, marginBottom: 6 }}>
          A peer-relative view for {focalName}
        </div>
        <div style={{ fontSize: 14, color: '#595959', lineHeight: 1.55, maxWidth: 720 }}>
          Each pillar is scored against your selected peer cohort, so a school can be excellent in
          several categories while still showing a clear gap in others. Switch between your full
          classification cohort and a hand-picked comparison set of up to {MAX_COMPARE} schools.
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#6B7585', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
          Choose your peer set
        </div>
        <div style={{ display: 'inline-flex', gap: 0, border: '1px solid #243551', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 2px rgba(36,53,81,0.10)' }}>
          {[
            { id: 'classification', label: 'By Classification' },
            { id: 'compare',        label: `Compare Schools (up to ${MAX_COMPARE})` },
          ].map(m => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                padding: '9px 20px', fontSize: 12, letterSpacing: 1, fontFamily: "'Bitter', Georgia, serif",
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: active ? '#EB5600' : '#243551',
                color: '#FFFFFF',
                opacity: active ? 1 : 0.78,
                fontWeight: active ? 700 : 500,
                textTransform: 'uppercase',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '0.78'; }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: '#6B7585', marginTop: 8, lineHeight: 1.5 }}>
          {mode === 'classification'
            ? <>Peers from your classification: <span style={{ color: '#3D4F6B' }}>{carnegieLabel} · {cohort.length} institution{cohort.length === 1 ? '' : 's'} matched</span></>
            : <>Hand-picked comparison set: <span style={{ color: '#3D4F6B' }}>{cohort.length} of {MAX_COMPARE} selected</span></>
          }
        </div>
      </div>

      {/* Compare typeahead + chips */}
      {mode === 'compare' && (
        <div style={{ marginBottom: 22 }}>
          {compareSchools.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {compareSchools.map(s => {
                const pid = s.unitid ?? s.intlId;
                return (
                  <span key={pid} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(28,54,120,0.08)', border: '1px solid rgba(28,54,120,0.25)',
                    color: '#243551', padding: '4px 8px 4px 10px', borderRadius: 6,
                    fontSize: 12, fontFamily: "'Bitter', Georgia, serif",
                  }}>
                    {s.name}
                    <button onClick={() => removeSchool(pid)} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: '#6B7585', fontSize: 14, lineHeight: 1, padding: 0,
                    }} aria-label={`Remove ${s.name}`}>×</button>
                  </span>
                );
              })}
            </div>
          )}
          {compareIds.length < MAX_COMPARE && (
            <div style={{ position: 'relative', maxWidth: 440 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder="Add an institution to compare..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#FFFFFF', border: '1px solid #D6DCE5',
                  borderRadius: 6, padding: '8px 12px',
                  color: '#243551', fontSize: 13,
                  fontFamily: "'Bitter', Georgia, serif", outline: 'none',
                }}
              />
              {showSuggest && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#FFFFFF', border: '1px solid #E4E8EE',
                  borderRadius: 8, marginTop: 4, overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(28,54,120,0.08)',
                }}>
                  {suggestions.map(s => (
                    <div key={s.unitid ?? s.intlId} onMouseDown={() => addSchool(s)} style={{
                      padding: '9px 13px', cursor: 'pointer', fontSize: 13,
                      borderBottom: '1px solid #F4F6F8',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(235,86,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{s.name}</span>
                      <span style={{ fontSize: 10, color: '#6B7585', letterSpacing: 1 }}>
                        {s.country || s.carnegieId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {compareIds.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#6B7585', fontStyle: 'italic' }}>
              Select up to {MAX_COMPARE} institutions to build a custom peer set.
            </div>
          )}
        </div>
      )}

      {cohort.length < minPeers ? (
        <div style={{
          padding: '16px 18px',
          background: 'rgba(235,86,0,0.08)',
          border: '1px solid rgba(235,86,0,0.30)',
          borderRadius: 8,
          color: '#3D4F6B',
          fontSize: 13,
          lineHeight: 1.55,
        }}>
          {mode === 'compare'
            ? <>Add at least one institution to begin the comparison. Comparisons are most reliable with 3+ peers.</>
            : <>Only {cohort.length} peer{cohort.length === 1 ? '' : 's'} match this classification. Comparisons are most reliable with 3+ peers.</>
          }
        </div>
      ) : (
        <>
          {/* Brand index — focal + peers */}
          <BrandIndexTable
            focal={focal}
            focalName={focalName}
            cohort={cohort}
            axes={axes}
            mode={mode}
          />

          {/* Weighting readout — how each dimension contributes to Overall */}
          <WeightingReadout
            focal={focal}
            axes={axes}
            carnegieLabel={carnegieLabel}
          />



          {/* Institutional profile matrix (Compare mode only) */}
          {mode === 'compare' && (
            <ProfileMatrix focal={focal} focalName={focalName} cohort={cohort} />
          )}

          {/* Cohort leaders by dimension */}
          <CohortLeadersGrid
            pillarAnalysis={pillarAnalysis}
            focalName={focalName}
          />

          {/* Headlines */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            <HeadlineCard
              title="Strengths to lead with"
              tone="strength"
              items={strengths}
              empty="No standout strengths above peer norm in this cohort. Look for parity pillars to differentiate against."
            />
            <HeadlineCard
              title="Gaps to address"
              tone="gap"
              items={gaps}
              empty="No material gaps below peer norm — this institution holds its own across the cohort."
            />
          </div>

          {/* Per-pillar deep dive */}
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#6B7585', marginBottom: 12 }}>
            PILLAR-BY-PILLAR READOUT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pillarAnalysis.map((p) => (
              <PillarRow key={p.axis.key} p={p} focalName={focalName} />
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 22, fontSize: 11, color: '#8A93A1', lineHeight: 1.6, borderTop: '1px solid #EEF1F4', paddingTop: 14 }}>
        How we score: each pillar compares your institution to the peer cohort you selected. Tiers reflect
        how far above or below the cohort average you sit:{' '}
        <span style={{ color: tierColor('leader') }}>Leader</span> · <span style={{ color: tierColor('strength') }}>Strength</span> · <span style={{ color: tierColor('on-par') }}>On par</span> · <span style={{ color: tierColor('gap') }}>Gap</span> · <span style={{ color: tierColor('critical-gap') }}>Critical gap</span>.
        Cohorts of 3+ schools give the most reliable read.
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function HeadlineCard({ title, tone, items, empty }) {
  const accent = tone === 'strength' ? '#1A9988' : '#EB5600';
  return (
    <div style={{
      background: '#FBFCFD',
      border: `1px solid ${accent}33`,
      borderRadius: 10,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: accent, marginBottom: 12 }}>
        {title.toUpperCase()}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6B7585', lineHeight: 1.55, fontStyle: 'italic' }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items
            .slice()
            .sort((a, b) => (tone === 'strength' ? (b.z ?? 0) - (a.z ?? 0) : (a.z ?? 0) - (b.z ?? 0)))
            .map((p) => (
              <div key={p.axis.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.axis.color }} />
                  <div style={{ fontSize: 13, color: '#243551' }}>{p.axis.label}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Bitter', Georgia, serif", fontSize: 12 }}>
                  <span style={{ color: tierColor(p.tier), fontWeight: 700 }}>
                    {p.delta >= 0 ? '+' : ''}{p.delta} vs peers
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function PillarRow({ p, focalName }) {
  const color = tierColor(p.tier);
  const userPct = p.userScore != null ? Math.max(0, Math.min(100, p.userScore)) : null;
  const meanPct = p.peerMean != null ? Math.max(0, Math.min(100, p.peerMean)) : null;

  return (
    <div style={{
      background: '#FBFCFD',
      border: '1px solid #EEF1F4',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.axis.color }} />
          <div style={{ fontSize: 14, color: '#243551', fontWeight: 600 }}>{p.axis.label}</div>
          <span style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: color, border: `1px solid ${color}66`, borderRadius: 4, padding: '2px 7px', marginLeft: 4,
          }}>
            {p.tierLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: "'Bitter', Georgia, serif" }}>
          <span style={{ fontSize: 18, color: '#243551', fontWeight: 700 }}>
            {p.userScore ?? '–'}
            <span style={{ fontSize: 11, color: '#8A93A1', fontWeight: 400, marginLeft: 4 }}>your score</span>
          </span>
          <span style={{ fontSize: 12, color: '#8A93A1' }}>
            peer avg {p.peerMean ?? '–'}
            {p.n != null && <span style={{ marginLeft: 4, color: '#A6ADBA' }}>(n={p.n})</span>}
          </span>
        </div>
      </div>

      {p.userScore != null && p.peerMean == null && (
        <div style={{ fontSize: 11, color: '#EB5600', marginBottom: 8 }}>
          No peer data for {p.axis.label.toLowerCase()} in this cohort.
        </div>
      )}

      {userPct != null && meanPct != null && (
        <div style={{ position: 'relative', height: 8, borderRadius: 4, background: '#EEF1F4', marginBottom: 10 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: `${userPct}%`,
            background: p.axis.color, opacity: 0.85, borderRadius: 4,
          }} />
          <div style={{
            position: 'absolute', top: -3, left: `${meanPct}%`, width: 2, height: 14,
            background: '#243551', borderRadius: 1,
          }} title={`Peer average: ${p.peerMean}`} />
        </div>
      )}

      <div style={{ fontSize: 13, color: '#3D4F6B', lineHeight: 1.55 }}>
        {pillarNarrative(p, focalName)}
      </div>
    </div>
  );
}

// ── Weighting readout ────────────────────────────────────────────────────
// Shows each pillar's % contribution to the focal school's Overall index.

function WeightingReadout({ focal, axes, carnegieLabel }) {
  const carnegieId = focal.carnegieId;
  const qsBand = getQsBand(focal.qsRank);
  const w = useMemo(() => blendWeights(carnegieId, qsBand), [carnegieId, qsBand]);

  const rows = axes
    .map(a => ({ key: a.key, label: a.label, color: a.color, weight: w[a.key] ?? 0 }))
    .sort((a, b) => b.weight - a.weight);

  const maxW = rows[0]?.weight || 1;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#6B7585', marginBottom: 10 }}>
        HOW THE OVERALL INDEX IS WEIGHTED
      </div>
      <div style={{
        border: '1px solid #EEF1F4', borderRadius: 10, background: '#FFFFFF',
        padding: '14px 18px',
      }}>
        <div style={{
          fontSize: 12, color: '#6B7585', marginBottom: 12, lineHeight: 1.5,
          fontFamily: "'Bitter', Georgia, serif",
        }}>
          Weights are set by your 2025 Carnegie classification
          {carnegieLabel ? <> — <strong style={{ color: '#243551' }}>{carnegieLabel}</strong></> : null}
          {focal.qsRank ? <>; QS band: <strong style={{ color: '#243551' }}>{QS_BAND_LABELS[qsBand]}</strong></> : null}.
          Each pillar's share below shows how much it moves the Overall number.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map(r => {
            const pct = Math.round(r.weight * 100);
            const barPct = (r.weight / maxW) * 100;
            return (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 48px', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 13, color: '#243551', fontFamily: "'Bitter', Georgia, serif" }}>
                  {r.label}
                </div>
                <div style={{ height: 8, background: '#F1F3F5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barPct}%`, height: '100%', background: r.color, borderRadius: 4,
                  }} />
                </div>
                <div style={{
                  fontSize: 13, color: '#243551', fontWeight: 700, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Brand index table ────────────────────────────────────────────────────
// One row per school (focal + up to 8 peers), one column per pillar + overall.


function overallIndex(scores, carnegieId, qsRank) {
  if (!scores) return null;
  const qsBand = getQsBand(qsRank);
  const w = weightedOverall(scores, carnegieId, qsBand);
  return w;
}


function cellTint(v, min, max, color) {
  if (v == null || max === min) return 'transparent';
  const t = (v - min) / (max - min); // 0..1
  const alpha = 0.08 + t * 0.32;
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function BrandIndexTable({ focal, focalName, cohort, axes, mode }) {
  const [sortKey, setSortKey] = useState("overall");

  const rows = useMemo(() => {
    const focalRow = {
      name: focalName,
      isFocal: true,
      scores: focal.scores || {},
      overall: overallIndex(focal.scores || {}, focal.carnegieId, focal.qsRank),
    };
    const peerRows = cohort.map(p => ({
      name: p.name,
      isFocal: false,
      scores: p.scores || {},
      overall: overallIndex(p.scores || {}, p.carnegieId, p.qsRank),
    }));

    // In Classification mode, cap at top 8 peers by overall
    const peers = mode === 'classification'
      ? peerRows.slice().sort((a, b) => (b.overall ?? -Infinity) - (a.overall ?? -Infinity)).slice(0, 8)
      : peerRows;

    const all = [focalRow, ...peers];
    const key = sortKey;
    const sorted = all.slice().sort((a, b) => {
      const av = key === 'overall' ? a.overall : a.scores[key];
      const bv = key === 'overall' ? b.overall : b.scores[key];
      return (bv ?? -Infinity) - (av ?? -Infinity);
    });
    return sorted;
  }, [focal, focalName, cohort, axes, mode, sortKey]);

  // Column min/max for tinting
  const colStats = useMemo(() => {
    const stats = {};
    axes.forEach(a => {
      const vals = rows.map(r => r.scores[a.key]).filter(v => v != null);
      stats[a.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    });
    const ovVals = rows.map(r => r.overall).filter(v => v != null);
    stats.overall = { min: Math.min(...ovVals), max: Math.max(...ovVals) };
    return stats;
  }, [rows, axes]);

  const th = (label, key) => (
    <th
      onClick={() => setSortKey(key)}
      style={{
        textAlign: 'left', padding: '8px 10px', fontSize: 10, letterSpacing: 1,
        color: sortKey === key ? '#EB5600' : '#6B7585', cursor: 'pointer',
        borderBottom: '1px solid #E9EDEE', fontWeight: 600, whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}
      title="Sort by this column"
    >
      {label} {sortKey === key ? '↓' : ''}
    </th>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#6B7585', marginBottom: 10 }}>
        BRAND INDEX — {rows.length} SCHOOLS
      </div>
      <div style={{
        overflowX: 'auto', border: '1px solid #EEF1F4', borderRadius: 10, background: '#FFFFFF',
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Bitter', Georgia, serif" }}>
          <thead>
            <tr>
              {th('Institution', 'name')}
              {axes.map(a => th(a.label, a.key))}
              {th('Overall', 'overall')}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} style={{
                background: r.isFocal ? 'rgba(235,86,0,0.06)' : (i % 2 ? '#FBFCFD' : '#FFFFFF'),
                borderTop: r.isFocal ? '2px solid #EB5600' : 'none',
                borderBottom: r.isFocal ? '2px solid #EB5600' : '1px solid #F1F3F5',
              }}>
                <td style={{
                  padding: '9px 10px', fontSize: 13, color: '#243551',
                  fontWeight: r.isFocal ? 700 : 500, whiteSpace: 'nowrap',
                  maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.isFocal && <span style={{ color: '#EB5600', marginRight: 6 }}>●</span>}
                  {r.name}
                </td>
                {axes.map(a => {
                  const v = r.scores[a.key];
                  const { min, max } = colStats[a.key] || {};
                  return (
                    <td key={a.key} style={{
                      padding: '9px 10px', fontSize: 13, textAlign: 'right', color: '#243551',
                      background: cellTint(v, min, max, a.color),
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {v != null ? Math.round(v) : '—'}
                    </td>
                  );
                })}
                <td style={{
                  padding: '9px 10px', fontSize: 13, textAlign: 'right',
                  color: '#243551', fontWeight: 700,
                  background: cellTint(r.overall, colStats.overall.min, colStats.overall.max, '#1C3678'),
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.overall != null ? Math.round(r.overall) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#8A93A1', marginTop: 6 }}>
        Click a column header to sort. Scores are on a 0–100 scale. Overall uses tier-weighted blend (see weighting readout below). Focal school highlighted.
      </div>
    </div>
  );
}

// ── Institutional profile matrix (compare mode) ──────────────────────────

const PROFILE_FLAGS = [
  { key: 'bigFour',    label: 'Big Four' },
  { key: 'd1',         label: 'D1 (non-B4)' },
  { key: 'health',     label: 'Med / Health' },
  { key: 'law',        label: 'Law' },
  { key: 'aacsb',      label: 'Biz (AACSB)' },
  { key: 'eng',        label: 'Engineering' },
  { key: 'landGrant',  label: 'Land Grant' },
];

const PROFILE_RANKS = [
  { key: 'usNews',       label: 'US News' },
  { key: 'usNewsLaw',    label: 'Law rank' },
  { key: 'usNewsBiz',    label: 'Biz rank' },
  { key: 'usNewsEng',    label: 'Eng rank' },
  { key: 'qsRank',       label: 'QS' },
  { key: 'theWorldRank', label: 'THE' },
  { key: 'retentionRate', label: 'Retention %' },
  { key: 'gradRate6yr',  label: '6-yr Grad %' },
];

function ProfileMatrix({ focal, focalName, cohort }) {
  const rows = [
    { name: focalName, isFocal: true, data: focal },
    ...cohort.map(p => ({ name: p.name, isFocal: false, data: p })),
  ];

  const cellStyle = { padding: '8px 10px', fontSize: 12, color: '#243551', borderBottom: '1px solid #F1F3F5', textAlign: 'center', whiteSpace: 'nowrap' };
  const headStyle = { padding: '8px 10px', fontSize: 10, letterSpacing: 1, color: '#6B7585', borderBottom: '1px solid #E9EDEE', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#6B7585', marginBottom: 10 }}>
        INSTITUTIONAL PROFILE — SIDE-BY-SIDE
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #EEF1F4', borderRadius: 10, background: '#FFFFFF' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Bitter', Georgia, serif" }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>Institution</th>
              {PROFILE_FLAGS.map(f => <th key={f.key} style={headStyle}>{f.label}</th>)}
              {PROFILE_RANKS.map(f => <th key={f.key} style={headStyle}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const flags = r.data.flags || {};
              return (
                <tr key={r.name} style={{
                  background: r.isFocal ? 'rgba(235,86,0,0.06)' : (i % 2 ? '#FBFCFD' : '#FFFFFF'),
                }}>
                  <td style={{ ...cellStyle, textAlign: 'left', fontWeight: r.isFocal ? 700 : 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.isFocal && <span style={{ color: '#EB5600', marginRight: 6 }}>●</span>}
                    {r.name}
                  </td>
                  {PROFILE_FLAGS.map(f => {
                    // D1 column is "non-Big Four" — suppress when Big Four is checked
                    const on = f.key === 'd1' ? (!!flags.d1 && !flags.bigFour) : !!flags[f.key];
                    return (
                    <td key={f.key} style={cellStyle}>
                      {on ? <span style={{ color: '#1A9988', fontWeight: 700 }}>✓</span> : <span style={{ color: '#C7CDD6' }}>—</span>}
                    </td>);
                  })
                  ))}
                  {PROFILE_RANKS.map(f => {
                    const v = r.data[f.key];
                    const isPct = f.key === 'retentionRate' || f.key === 'gradRate6yr';
                    const isRank = !isPct;
                    return (
                      <td key={f.key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>
                        {v != null ? (isRank ? `#${v}` : `${v}%`) : <span style={{ color: '#C7CDD6' }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#8A93A1', marginTop: 6 }}>
        Ranks shown as reported (US News grad-school ranks display beyond top 50 here for cross-comparison).
      </div>
    </div>
  );
}

// ── Cohort leaders by dimension ──────────────────────────────────────────

function CohortLeadersGrid({ pillarAnalysis, focalName }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#6B7585', marginBottom: 10 }}>
        COHORT LEADERS BY DIMENSION
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {pillarAnalysis.map(p => {
          const focalLeads = p.leaderName == null || (p.userScore != null && p.leaderScore != null && p.userScore >= p.leaderScore);
          const leaderDisplayName = focalLeads ? focalName : p.leaderName;
          const leaderDisplayScore = focalLeads ? p.userScore : p.leaderScore;
          const delta = (p.userScore != null && p.leaderScore != null && !focalLeads)
            ? p.userScore - p.leaderScore : null;
          return (
            <div key={p.axis.key} style={{
              background: focalLeads ? 'rgba(235,86,0,0.06)' : '#FBFCFD',
              border: `1px solid ${focalLeads ? '#EB5600' : '#EEF1F4'}`,
              borderRadius: 10, padding: '12px 14px',
              borderLeft: `4px solid ${p.axis.color}`,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#6B7585', textTransform: 'uppercase', marginBottom: 6 }}>
                {p.axis.label}
              </div>
              <div style={{ fontSize: 14, color: '#243551', fontWeight: 700, marginBottom: 4, lineHeight: 1.25 }}>
                {leaderDisplayName || '—'}
                {focalLeads && (
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: '#EB5600', marginLeft: 8,
                    border: '1px solid #EB5600', borderRadius: 3, padding: '1px 5px',
                    textTransform: 'uppercase', verticalAlign: 'middle', fontWeight: 700,
                  }}>You</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#6B7585', fontFamily: "'Bitter', Georgia, serif" }}>
                Score <span style={{ color: '#243551', fontWeight: 700 }}>{leaderDisplayScore ?? '—'}</span>
                {delta != null && (
                  <span style={{ marginLeft: 10, color: delta >= 0 ? '#1A9988' : '#D4786A' }}>
                    you {delta >= 0 ? '+' : ''}{delta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
