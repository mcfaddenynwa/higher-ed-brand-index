import { useMemo } from "react";
import { Link } from "react-router-dom";
import insights from "@/data/insights.json";

const FONT = "'DM Sans', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
const MONO = "'DM Mono', monospace";

const AXIS = {
  visibility: { label: "Visibility & Reach", color: "#C8A96E" },
  enrollment: { label: "Enrollment & Retention", color: "#7EB8A4" },
  financial: { label: "Financial Strength", color: "#9B8EC4" },
  profile: { label: "Institutional Profile", color: "#B8A0D4" },
  research: { label: "Academic & Research", color: "#D4786A" },
  diversity: { label: "Diversity & Access", color: "#6AA8D4" },
  alumni: { label: "Alumni Engagement", color: "#E8A87C" },
};

function Eyebrow({ children, color = "#C8A96E" }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 11, letterSpacing: 2.5, color, textTransform: "uppercase", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, lead }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 36, lineHeight: 1.15, color: "#fff", margin: "8px 0 10px" }}>{title}</h2>
      {lead && <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, maxWidth: 720, margin: 0 }}>{lead}</p>}
      <div style={{ marginTop: 16, height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}

function StatCard({ value, label, accent = "#C8A96E" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "20px 22px" }}>
      <div style={{ fontFamily: MONO, fontSize: 36, color: "#fff", fontWeight: 500, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, color: accent, textTransform: "uppercase", marginTop: 10, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Bar({ value, max = 100, color = "#C8A96E", height = 8 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ width: "100%", height, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

function LeaderRow({ rank, name, score, type, color = "#C8A96E", maxScore = 100 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 80px 60px", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{String(rank).padStart(2, "0")}</div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#fff", fontWeight: 500 }}>{name}</div>
        {type && <div style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: 1, marginTop: 2, textTransform: "uppercase" }}>{type}</div>}
      </div>
      <Bar value={score} max={maxScore} color={color} />
      <div style={{ fontFamily: MONO, fontSize: 16, color: "#fff", textAlign: "right", fontWeight: 500 }}>{typeof score === "number" ? Math.round(score) : score}</div>
    </div>
  );
}

function Card({ children, accent = "#C8A96E" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `2px solid ${accent}`, borderRadius: 6, padding: 24 }}>
      {children}
    </div>
  );
}

export default function Insights() {
  const top = insights.topOverall;
  const bottom = insights.bottomOverall;
  const byType = Object.entries(insights.byCarnegie).sort((a, b) => b[1].meanOverall - a[1].meanOverall);
  const qsBands = insights.qsBands;
  const qsLabels = { top100: "QS Top 100", r101_200: "QS 101–200", r201_400: "QS 201–400", r401_600: "QS 401–600", r601plus: "QS 601+", unranked: "QS Unranked" };

  const findings = useMemo(() => ([
    {
      h: "Brand equity tracks Carnegie classification — but only loosely.",
      p: <>R1 Doctoral institutions average <b>{insights.byCarnegie["R1 Doctoral"]?.meanOverall}</b>, more than double Liberal Arts colleges at <b>{insights.byCarnegie["Liberal Arts"]?.meanOverall}</b>. Yet the highest-scoring liberal arts institution outperforms the lowest R1 by 8 points. Classification is a baseline, not a ceiling.</>
    },
    {
      h: "Visibility and research are nearly the same signal (r = +0.94).",
      p: "These two dimensions move together so tightly that institutions investing in one are effectively investing in the other. Standalone marketing-only campaigns rarely move brand equity without research narrative behind them."
    },
    {
      h: "Big Four conference membership is worth ~27 points of brand equity.",
      p: <>Big Four schools (n={insights.bigFourComparison.bigFour.n}) average <b>{insights.bigFourComparison.bigFour.meanOverall}</b> overall vs. <b>{insights.bigFourComparison.other.meanOverall}</b> for non-Big Four (n={insights.bigFourComparison.other.n}). Athletic affiliation is the single largest discrete brand asset in this dataset.</>
    },
    {
      h: "Diversity & access run inversely to visibility (r = −0.28).",
      p: "The schools serving the most Pell-eligible and first-gen students score lowest on the visibility axis. A sector-wide narrative gap, not an institutional failure — access-focused schools are systematically under-told."
    },
    {
      h: "A small cohort is materially out-marketing its research base.",
      p: "Six institutions show a visibility-over-research gap of 35+ points (Villanova, Butler, Elon, JMU, Smith, Gonzaga). These are the brand-building case studies — what they're doing replicably is the question for everyone else."
    },
  ]), []);

  return (
    <div style={{ minHeight: "100vh", background: "#0e1016", color: "#fff", fontFamily: FONT }}>
      {/* Header bar */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 12, letterSpacing: 2, fontWeight: 600 }}>
          ← BACK TO ASSESSMENT
        </Link>
        <a href="/HE_Brand_Equity_Insights.pdf" download
           style={{ background: "#C8A96E", color: "#0e1016", padding: "10px 18px", borderRadius: 4, fontSize: 11, letterSpacing: 1.5, fontWeight: 700, textDecoration: "none", textTransform: "uppercase" }}>
          ↓ Download PDF Report
        </a>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 32px 100px" }}>

        {/* Hero */}
        <Eyebrow>Higher Education Brand Index</Eyebrow>
        <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 56, lineHeight: 1.05, color: "#fff", margin: "12px 0 18px", letterSpacing: -0.5 }}>
          Strategic Insights
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: "rgba(255,255,255,0.7)", maxWidth: 760, lineHeight: 1.45, margin: 0 }}>
          A cross-sectional analysis of brand equity across {insights.totalInstitutions} institutions, surfacing visibility gaps, marketing leverage, and growth signals.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 40 }}>
          <StatCard value={insights.totalInstitutions} label="Institutions analyzed" />
          <StatCard value="7" label="Brand equity dimensions" accent="#7EB8A4" />
          <StatCard value={top[0].overall} label={`Top score · ${top[0].name.split(" ").slice(0, 3).join(" ")}`} accent="#D4786A" />
          <StatCard value={`+${insights.bigFourComparison.bigFour.meanOverall - insights.bigFourComparison.other.meanOverall}`} label="Big Four lift (pts)" accent="#9B8EC4" />
        </div>

        {/* Executive summary */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 01" title="Five things stand out"
            lead="Each finding points to a strategic question marketing and enrollment leadership should be ready to answer." />
          <div style={{ display: "grid", gap: 16 }}>
            {findings.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 20, padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color: "#C8A96E", paddingTop: 4 }}>{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 8 }}>{f.h}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{f.p}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboards */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 02" title="The leaderboard"
            lead="Composite score (0–100) blends seven dimensions, weighted by Carnegie type and QS band." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <Card accent="#7EB8A4">
              <Eyebrow color="#7EB8A4">Top 10</Eyebrow>
              <div style={{ marginTop: 16 }}>
                {top.map((d, i) => (
                  <LeaderRow key={d.name} rank={i + 1} name={d.name} score={d.overall} type={d.carnegieLabel} color="#7EB8A4" />
                ))}
              </div>
            </Card>
            <Card accent="#D4786A">
              <Eyebrow color="#D4786A">Bottom 10</Eyebrow>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 8, lineHeight: 1.5 }}>
                Lower composite scores often reflect mission focus rather than brand weakness — they show where dimension weights diverge most from peer norms.
              </p>
              <div style={{ marginTop: 16 }}>
                {bottom.map((d, i) => (
                  <LeaderRow key={d.name} rank={insights.totalInstitutions - bottom.length + i + 1} name={d.name} score={d.overall} type={d.carnegieLabel} color="#D4786A" />
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* By Carnegie */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 03" title="By classification & ranking band"
            lead="Mean composite scores normalize for type-specific weight profiles, so cross-type comparison reflects relative dimension strength." />
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32 }}>
            <Card accent="#C8A96E">
              <Eyebrow>Carnegie Classification</Eyebrow>
              <div style={{ marginTop: 16 }}>
                {byType.map(([k, v]) => (
                  <LeaderRow key={k} rank={v.n} name={k} type={`n = ${v.n}`} score={v.meanOverall} color="#C8A96E" />
                ))}
              </div>
            </Card>
            <Card accent="#6AA8D4">
              <Eyebrow color="#6AA8D4">QS Ranking Band</Eyebrow>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 8, lineHeight: 1.5 }}>
                Global ranking position remains the single most predictive external signal of overall brand equity.
              </p>
              <div style={{ marginTop: 16 }}>
                {Object.entries(qsBands).map(([k, v]) => (
                  <LeaderRow key={k} rank={v.n} name={qsLabels[k] || k} type={`n = ${v.n}`} score={v.meanOverall} color="#6AA8D4" />
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Axis leaders */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 04" title="Dimension leaders"
            lead="The institutions setting the bar on each of the seven brand equity dimensions." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            {Object.entries(insights.axisLeaders).map(([ax, leaders]) => {
              if (!leaders || !leaders.length) return null;
              const meta = AXIS[ax] || { label: ax, color: "#888" };
              return (
                <Card key={ax} accent={meta.color}>
                  <Eyebrow color={meta.color}>{meta.label}</Eyebrow>
                  <div style={{ marginTop: 14 }}>
                    {leaders.map((p, i) => (
                      <LeaderRow key={p.name} rank={i + 1} name={p.name} score={p.score} color={meta.color} />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Visibility–Research gap */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 05" title="The visibility–research gap"
            lead="Where is the brand story out-running the substance? And where is the substance out-running the brand?" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <Card accent="#C8A96E">
              <Eyebrow>Marketing-Forward</Eyebrow>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.55 }}>
                Visibility scores meaningfully exceed research scores. These are the brand machines — primarily teaching-focused universities punching above their R&D weight class.
              </p>
              <div style={{ marginTop: 16 }}>
                {insights.marketingForward.map((d, i) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 50px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{d.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: "#C8A96E", textAlign: "right" }}>{Math.round(d.visibility)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: "#D4786A", textAlign: "right" }}>{Math.round(d.research)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#fff", textAlign: "right", fontWeight: 700 }}>+{Math.round(d.gap)}</div>
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 50px", gap: 10, fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginTop: 10, textTransform: "uppercase" }}>
                  <div /><div style={{ textAlign: "right" }}>VIS</div><div style={{ textAlign: "right" }}>RES</div><div style={{ textAlign: "right" }}>GAP</div>
                </div>
              </div>
            </Card>
            <Card accent="#D4786A">
              <Eyebrow color="#D4786A">Under-Leveraged Research</Eyebrow>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.55 }}>
                Research output exceeds visibility — substantive work the broader market is not pricing into the brand. Marketing investment here typically returns the most.
              </p>
              <div style={{ marginTop: 16 }}>
                {insights.underLeveraged.length > 0 ? insights.underLeveraged.map((d) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 50px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{d.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: "#D4786A", textAlign: "right" }}>{Math.round(d.research)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: "#C8A96E", textAlign: "right" }}>{Math.round(d.visibility)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#fff", textAlign: "right", fontWeight: 700 }}>+{Math.round(d.gap)}</div>
                  </div>
                )) : (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
                    No institutions in the dataset show a research-over-visibility gap above 15 points. The dataset's research-heavy schools are also visibility-heavy.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Enrollment */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 06" title="Enrollment momentum"
            lead="Five-year headcount trends — the leading indicator of demand-side brand health." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <Card accent="#7EB8A4">
              <Eyebrow color="#7EB8A4">Fastest Growing</Eyebrow>
              <div style={{ marginTop: 16 }}>
                {insights.enrollmentGrowth.map((d, i) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "32px 1fr 80px", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{String(i + 1).padStart(2, "0")}</div>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: "#fff" }}>{d.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, color: "#7EB8A4", textAlign: "right", fontWeight: 600 }}>+{d.trend.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card accent="#D4786A">
              <Eyebrow color="#D4786A">Sharpest Declines</Eyebrow>
              <div style={{ marginTop: 16 }}>
                {insights.enrollmentDecline.map((d, i) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "32px 1fr 80px", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{String(i + 1).padStart(2, "0")}</div>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: "#fff" }}>{d.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, color: "#D4786A", textAlign: "right", fontWeight: 600 }}>{d.trend.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Correlations */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Section 07" title="How the dimensions move together"
            lead="Pairwise correlations across the dataset reveal which brand levers are independent — and which are effectively the same." />
          <Card accent="#9B8EC4">
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 80px 1.5fr", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.15)", fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 600 }}>
              <div>Dimension A</div><div>Dimension B</div><div style={{ textAlign: "right" }}>r</div><div>Reading</div>
            </div>
            {insights.correlations.map((c, i) => {
              const r = c.r;
              const reading = r > 0.6 ? "Strong positive" : r > 0.3 ? "Moderate positive" : r > 0.1 ? "Weak positive" : Math.abs(r) <= 0.1 ? "No relationship" : r > -0.3 ? "Weak negative" : r > -0.6 ? "Moderate negative" : "Strong negative";
              const color = r > 0.6 ? "#7EB8A4" : r > 0.1 ? "rgba(126,184,164,0.7)" : Math.abs(r) <= 0.1 ? "rgba(255,255,255,0.4)" : r > -0.3 ? "rgba(212,120,106,0.7)" : "#D4786A";
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 80px 1.5fr", gap: 16, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#fff", textTransform: "capitalize" }}>{c.a}</div>
                  <div style={{ fontSize: 13, color: "#fff", textTransform: "capitalize" }}>{c.b}</div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color, textAlign: "right", fontWeight: 600 }}>{r >= 0 ? "+" : ""}{r.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{reading}</div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: 80 }}>
          <SectionTitle eyebrow="Appendix" title="Methodology" />
          <div style={{ display: "grid", gap: 16, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, maxWidth: 820 }}>
            <p><b style={{ color: "#fff" }}>Source data.</b> {insights.totalInstitutions} institutions drawn from the IPEDS extract embedded in the application. Fields include US News, QS, THE, Niche, and Caldwell rankings; IPEDS retention and graduation rates; NSF HERD R&D expenditures; doctoral degree output; Carnegie classification; and self-reported social audience footprint.</p>
            <p><b style={{ color: "#fff" }}>Seven dimensions.</b> Visibility & Reach, Enrollment & Retention, Financial Strength, Institutional Profile, Academic & Research Reputation, Diversity & Access, and Alumni Engagement. Each dimension is scored 0–100 by normalizing inputs against expected ranges.</p>
            <p><b style={{ color: "#fff" }}>Composite weighting.</b> The overall score blends two weight profiles — Carnegie classification and QS band — averaged and re-normalized.</p>
            <p><b style={{ color: "#fff" }}>What this is not.</b> A working analytical model, not an authoritative ranking. Alumni inputs are sparse in the current sample; financial inputs are not populated for U.S. institutions. Treat absolute scores as directional and use peer-relative gaps for decision-making.</p>
          </div>
        </div>

        <div style={{ marginTop: 100, paddingTop: 30, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Higher Education Brand Index · Insights · April 2026
          </div>
          <a href="/HE_Brand_Equity_Insights.pdf" download
             style={{ background: "transparent", color: "#C8A96E", border: "1px solid #C8A96E", padding: "10px 18px", borderRadius: 4, fontSize: 11, letterSpacing: 1.5, fontWeight: 700, textDecoration: "none", textTransform: "uppercase" }}>
            ↓ Download Full Report (PDF)
          </a>
        </div>
      </div>
    </div>
  );
}
