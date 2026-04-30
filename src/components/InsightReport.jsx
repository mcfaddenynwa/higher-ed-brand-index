import { useMemo, useState, useRef, useEffect } from "react";
import {
  buildCohort,
  analyzePillars,
  pillarNarrative,
  tierColor,
} from "../lib/insightFramework";

// ─────────────────────────────────────────────────────────────────────────
// InsightReport
// Per-school strategic readout shown after the assessment is complete.
// Two view modes:
//   • "classification" — peers = same Carnegie / international classification
//   • "compare"        — peers = up to 5 user-selected institutions
// ─────────────────────────────────────────────────────────────────────────

const MAX_COMPARE = 5;

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
      .slice(0, 8);
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
        <div style={{ display: 'flex', gap: 0, width: 'fit-content', border: '1px solid #E4E8EE', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { id: 'classification', label: 'By Classification' },
            { id: 'compare',        label: `Compare Schools (up to ${MAX_COMPARE})` },
          ].map(m => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                padding: '8px 18px', fontSize: 12, letterSpacing: 1, fontFamily: "'Bitter', Georgia, serif",
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: active ? '#EB5600' : '#F8FAFB',
                color: active ? '#FFFFFF' : '#6B7585',
                fontWeight: active ? 700 : 400,
                textTransform: 'uppercase',
              }}>
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
            ? <>Add at least one institution to begin the comparison. Z-scores stabilize with 3+ peers.</>
            : <>Only {cohort.length} peer{cohort.length === 1 ? '' : 's'} match this classification. Z-scores need at least 3 peers to be meaningful.</>
          }
        </div>
      ) : (
        <>
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
        Methodology: each pillar score is converted to a z-score against the selected peer cohort.
        Tiers: <span style={{ color: tierColor('leader') }}>Leader (z ≥ +1.5)</span> · <span style={{ color: tierColor('strength') }}>Strength (+0.5)</span> · <span style={{ color: tierColor('on-par') }}>On par</span> · <span style={{ color: tierColor('gap') }}>Gap (−0.5)</span> · <span style={{ color: tierColor('critical-gap') }}>Critical gap (−1.5)</span>.
        Cohorts of 3+ are recommended; pillars with peer dispersion below 1 point are suppressed to avoid spurious z-scores.
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
                  <span style={{ color: '#6B7585' }}>{p.delta >= 0 ? '+' : ''}{p.delta}</span>
                  <span style={{ color: tierColor(p.tier), fontWeight: 700 }}>z {p.z >= 0 ? '+' : ''}{p.z}</span>
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
        <div style={{ display: 'flex', gap: 14, fontFamily: "'Bitter', Georgia, serif", fontSize: 12 }}>
          <span style={{ color: '#6B7585' }}>You {p.userScore ?? '–'}</span>
          <span style={{ color: '#6B7585' }}>Peer μ {p.peerMean ?? '–'}</span>
          {p.z != null && <span style={{ color }}>z {p.z >= 0 ? '+' : ''}{p.z}</span>}
        </div>
      </div>

      {userPct != null && meanPct != null && (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: '#EEF1F4', marginBottom: 10 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: `${userPct}%`,
            background: p.axis.color, opacity: 0.85, borderRadius: 3,
          }} />
          <div style={{
            position: 'absolute', top: -3, left: `${meanPct}%`, width: 2, height: 12,
            background: '#243551', borderRadius: 1,
          }} title={`Peer mean ${p.peerMean}`} />
        </div>
      )}

      <div style={{ fontSize: 13, color: '#3D4F6B', lineHeight: 1.55 }}>
        {pillarNarrative(p, focalName)}
      </div>
    </div>
  );
}
