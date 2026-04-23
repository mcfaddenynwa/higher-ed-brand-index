import { useMemo, useState } from "react";
import {
  LENSES,
  buildCohort,
  analyzePillars,
  cohortTopLine,
  pillarNarrative,
  tierColor,
} from "../lib/insightFramework";

// ─────────────────────────────────────────────────────────────────────────
// InsightReport
// Per-school strategic readout shown after the assessment is complete.
// Lets the user toggle between peer lenses and surfaces strengths, gaps,
// and cohort top-line context.
// ─────────────────────────────────────────────────────────────────────────

export default function InsightReport({
  focal,            // { name, carnegieId, usNewsList, flags, intlGroup, scores, ...rawSocial }
  scoredPool,       // [{ name, carnegieId, scores, ... }, ...]
  axes,             // active axes for this carnegieId
  carnegieLabel,    // human-readable
}) {
  const [lensId, setLensId] = useState("carnegie");

  const cohort = useMemo(
    () => buildCohort({ focal, scoredPool, lensId }),
    [focal, scoredPool, lensId]
  );

  const pillarAnalysis = useMemo(
    () => analyzePillars({ focalScores: focal.scores, cohort, axes }),
    [focal.scores, cohort, axes]
  );

  const topLine = useMemo(
    () => cohortTopLine({ cohort, axes }),
    [cohort, axes]
  );

  const strengths = pillarAnalysis.filter((p) => p.tier === "leader" || p.tier === "strength");
  const gaps      = pillarAnalysis.filter((p) => p.tier === "gap" || p.tier === "critical-gap");

  const focalName = focal.name || "Your institution";

  return (
    <div style={{
      marginTop: 36,
      padding: '28px 28px 24px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
    }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.10)', paddingBottom: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 2.5, color: '#C8A96E', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
          STRATEGIC INSIGHT REPORT
        </div>
        <div style={{ fontSize: 28, fontFamily: "'Playfair Display', serif", color: '#e8e4dc', lineHeight: 1.2, marginBottom: 6 }}>
          A peer-relative view for {focalName}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, maxWidth: 720 }}>
          Strengths and gaps are measured as z-scores against your selected peer cohort, so a school
          can be excellent in five categories while still showing a clear gap in two. Toggle the lens
          below to test the read against different peer definitions.
        </div>
      </div>

      {/* Lens selector */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>
          PEER LENS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LENSES.map((l) => {
            const active = l.id === lensId;
            return (
              <button
                key={l.id}
                onClick={() => setLensId(l.id)}
                style={{
                  background: active ? 'rgba(200,169,110,0.16)' : 'transparent',
                  border: `1px solid ${active ? '#C8A96E' : 'rgba(255,255,255,0.18)'}`,
                  color: active ? '#C8A96E' : 'rgba(255,255,255,0.78)',
                  borderRadius: 6,
                  padding: '7px 13px',
                  fontSize: 12,
                  letterSpacing: 1,
                  fontWeight: active ? 700 : 500,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {l.short}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', marginTop: 8, lineHeight: 1.5 }}>
          {LENSES.find((l) => l.id === lensId)?.description} · <span style={{ color: 'rgba(255,255,255,0.75)' }}>{cohort.length} peer{cohort.length === 1 ? '' : 's'} matched</span>
        </div>
      </div>

      {/* Cohort top-line */}
      {topLine && (
        <div style={{
          background: 'rgba(200,169,110,0.05)',
          border: '1px solid rgba(200,169,110,0.18)',
          borderRadius: 10,
          padding: '16px 18px',
          marginBottom: 22,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#C8A96E', marginBottom: 10 }}>
            COHORT TOP-LINE · {carnegieLabel}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <Stat label="Cohort size" value={topLine.n} suffix="schools" />
            <Stat label="Cohort avg index" value={topLine.cohortAvg} suffix="/100" />
            {topLine.strongestPillar && (
              <Stat
                label="Cohort strongest"
                value={topLine.strongestPillar.label}
                suffix={`mean ${topLine.strongestPillar.mean}`}
                small
              />
            )}
            {topLine.weakestPillar && (
              <Stat
                label="Cohort weakest"
                value={topLine.weakestPillar.label}
                suffix={`mean ${topLine.weakestPillar.mean}`}
                small
              />
            )}
            {topLine.topInstitution && (
              <Stat
                label="Cohort leader (avg)"
                value={topLine.topInstitution.name}
                suffix={`${topLine.topInstitution.avg}/100`}
                small
              />
            )}
          </div>
        </div>
      )}

      {cohort.length < 3 ? (
        <div style={{
          padding: '16px 18px',
          background: 'rgba(232,168,124,0.08)',
          border: '1px solid rgba(232,168,124,0.30)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.78)',
          fontSize: 13,
          lineHeight: 1.55,
        }}>
          Only {cohort.length} peer{cohort.length === 1 ? '' : 's'} match this lens. Z-scores need at
          least 3 peers to be meaningful — try the <em style={{ color: '#C8A96E' }}>Carnegie</em> lens
          for the broadest read.
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
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>
            PILLAR-BY-PILLAR READOUT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pillarAnalysis.map((p) => (
              <PillarRow key={p.axis.key} p={p} focalName={focalName} />
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 22, fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
        Methodology: each pillar score is converted to a z-score against the selected peer cohort.
        Tiers: <span style={{ color: tierColor('leader') }}>Leader (z ≥ +1.5)</span> · <span style={{ color: tierColor('strength') }}>Strength (+0.5)</span> · <span style={{ color: tierColor('on-par') }}>On par</span> · <span style={{ color: tierColor('gap') }}>Gap (−0.5)</span> · <span style={{ color: tierColor('critical-gap') }}>Critical gap (−1.5)</span>.
        Cohorts require at least 3 peers; pillars with peer dispersion below 1 point are suppressed to avoid spurious z-scores.
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function Stat({ label, value, suffix, small }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: small ? 14 : 22, color: '#e8e4dc', fontFamily: small ? "'DM Sans', sans-serif" : "'DM Mono', monospace", lineHeight: 1.2, fontWeight: small ? 600 : 400 }}>
        {value}
      </div>
      {suffix && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>{suffix}</div>
      )}
    </div>
  );
}

function HeadlineCard({ title, tone, items, empty }) {
  const accent = tone === 'strength' ? '#7EB8A4' : '#E8A87C';
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${accent}33`,
      borderRadius: 10,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: accent, marginBottom: 12 }}>
        {title.toUpperCase()}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, fontStyle: 'italic' }}>
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
                  <div style={{ fontSize: 13, color: '#e8e4dc' }}>{p.axis.label}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{p.delta >= 0 ? '+' : ''}{p.delta}</span>
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
  // Position markers on a 0–100 axis
  const userPct = p.userScore != null ? Math.max(0, Math.min(100, p.userScore)) : null;
  const meanPct = p.peerMean != null ? Math.max(0, Math.min(100, p.peerMean)) : null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.axis.color }} />
          <div style={{ fontSize: 14, color: '#e8e4dc', fontWeight: 600 }}>{p.axis.label}</div>
          <span style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: color, border: `1px solid ${color}66`, borderRadius: 4, padding: '2px 7px', marginLeft: 4,
          }}>
            {p.tierLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.50)' }}>You {p.userScore ?? '–'}</span>
          <span style={{ color: 'rgba(255,255,255,0.50)' }}>Peer μ {p.peerMean ?? '–'}</span>
          {p.z != null && <span style={{ color }}>z {p.z >= 0 ? '+' : ''}{p.z}</span>}
        </div>
      </div>

      {/* Comparison bar */}
      {userPct != null && meanPct != null && (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 10 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: `${userPct}%`,
            background: p.axis.color, opacity: 0.85, borderRadius: 3,
          }} />
          <div style={{
            position: 'absolute', top: -3, left: `${meanPct}%`, width: 2, height: 12,
            background: 'rgba(255,255,255,0.85)', borderRadius: 1,
          }} title={`Peer mean ${p.peerMean}`} />
        </div>
      )}

      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55 }}>
        {pillarNarrative(p, focalName)}
      </div>
    </div>
  );
}
