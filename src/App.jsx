import { useState } from "react";

const API = "/api/gemini";

const SYSTEM_PROMPT = [
  "You are TalentRadar, a recruitment agent.",
  "Use web_search to find REAL candidates only. Never invent people.",
  "Run exactly 4 searches: 2 LinkedIn X-Ray, 1 Boolean variant, 1 alternative source.",
  "LinkedIn X-Ray: site:linkedin.com/in/ \"[title]\" \"[location]\"",
  "Boolean: site:linkedin.com/in/ (\"Title1\" OR \"Title2\") \"Location\"",
  "Alternative: site:wellfound.com/u OR site:crunchbase.com/person",
  "Return exactly 5 best real candidates. Quality over quantity.",
  "Score 0-100: title fit 25 + skills 25 + location 20 + company 15 + tenure 15.",
  "Hard rules: exclude anyone at excludedCompanies, exclude titles in excludedTitles, min 1yr tenure.",
  "Respond ONLY with valid JSON, no markdown, no explanation.",
  "Schema: {\"candidates\":[{\"name\":\"\",\"title\":\"\",\"company\":\"\",\"location\":\"\",\"linkedin_url\":\"\",\"match_score\":0,\"why\":\"one sentence\",\"years_exp\":0,\"skills\":[],\"past_companies\":[]}],\"search_summary\":\"\",\"total_found\":0}"
].join(" ");

function buildPrompt(f) {
  const lines = [];
  if (f.role)       lines.push("Role: " + f.role);
  if (f.location)   lines.push("Location: " + f.location);
  if (f.skills)     lines.push("Skills: " + f.skills);
  if (f.seniority)  lines.push("Seniority: " + f.seniority);
  if (f.companyUrl) lines.push("Company URL to fetch: " + f.companyUrl);
  if (f.company)    lines.push("Company background: " + f.company);
  if (f.targets)    lines.push("Source from: " + f.targets);
  if (f.exclude)    lines.push("Exclude companies: " + f.exclude);
  if (f.exTitles)   lines.push("Exclude title keywords: " + f.exTitles);
  if (f.jd)         lines.push("Job description: " + f.jd.slice(0, 400));
  lines.push("Find 5 real candidates. Return JSON only.");
  return lines.join("\n");
}

async function doSearch(criteria, onStatus) {
  onStatus("Searching...");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(criteria) }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "API error " + res.status);
  const blocks = data.content || [];
  const searches = blocks.filter(b => b.type === "tool_use").length;
  if (searches) onStatus("Ran " + searches + " searches, ranking...");
  const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No results returned. Try broadening your search.");
  const result = JSON.parse(m[0]);
  onStatus("Done");
  return result;
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .fade-up { animation: fadeUp 0.35s ease forwards; }
  .card { transition: box-shadow 0.2s, transform 0.2s; cursor: pointer; }
  .card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); transform: translateY(-1px); }
  input, textarea {
    font-family: 'Inter', sans-serif;
    background: #f9f9f7;
    border: 1px solid #e8e6e0;
    border-radius: 9px;
    color: #1a1a1a;
    font-size: 14px;
    padding: 11px 14px;
    width: 100%;
    transition: border-color 0.15s, box-shadow 0.15s;
    outline: none;
  }
  input:focus, textarea:focus {
    border-color: #1a5c9e;
    box-shadow: 0 0 0 3px rgba(26,92,158,0.08);
    background: #fff;
  }
  input::placeholder, textarea::placeholder { color: #b0aba2; font-style: italic; }
  textarea { resize: vertical; line-height: 1.6; }
`;

const Label = ({ children }) => (
  <p style={{
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
    letterSpacing: "0.07em", textTransform: "uppercase", color: "#888", marginBottom: 6,
  }}>{children}</p>
);

const Field = ({ label, value, onChange, placeholder, textarea, rows = 3, half }) => (
  <div style={{ flex: half ? "1 1 calc(50% - 8px)" : "1 1 100%", minWidth: 180 }}>
    {label && <Label>{label}</Label>}
    {textarea
      ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
  </div>
);

const initials = name => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

const scoreStyle = score => {
  if (score >= 80) return { bg: "#f0faf5", color: "#16a34a", border: "#86efac" };
  if (score >= 60) return { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" };
  return { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" };
};

const avatarColor = (name) => {
  const colors = [
    { bg: "#eff6ff", color: "#1d4ed8" },
    { bg: "#f0fdf4", color: "#15803d" },
    { bg: "#fdf4ff", color: "#7e22ce" },
    { bg: "#fff7ed", color: "#c2410c" },
    { bg: "#f0f9ff", color: "#0369a1" },
  ];
  const i = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % colors.length;
  return colors[i];
};

const Tag = ({ label, green }) => (
  <span style={{
    fontSize: 11, padding: "3px 9px", borderRadius: 20, fontFamily: "'Inter'", fontWeight: 500,
    background: green ? "#f0faf5" : "#f5f4f1",
    color: green ? "#16a34a" : "#666",
    border: green ? "1px solid #86efac" : "none",
  }}>{label}</span>
);

const CandidateCard = ({ c, rank }) => {
  const [open, setOpen] = useState(false);
  const s = scoreStyle(c.match_score);
  const av = avatarColor(c.name || "X");
  const borderColor = c.match_score >= 80 ? "#16a34a" : c.match_score >= 60 ? "#d97706" : "#dc2626";

  return (
    <div className="card" onClick={() => setOpen(o => !o)} style={{
      background: "#fff",
      border: "1px solid #ece9e3",
      borderLeft: "3px solid " + borderColor,
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 10,
      boxShadow: open ? "0 4px 20px rgba(0,0,0,0.07)" : "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: av.bg, color: av.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 14, flexShrink: 0, fontFamily: "'Inter'",
        }}>{initials(c.name || "?")}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", fontFamily: "'Inter'" }}>{c.name}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
              background: s.bg, color: s.color, border: "1px solid " + s.border,
              fontFamily: "'Inter'",
            }}>{c.match_score}</span>
            {c.linkedin_url && c.linkedin_url.startsWith("http") && (
              <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  background: "#0077b5", color: "#fff", borderRadius: 5,
                  padding: "2px 9px", fontSize: 11, fontWeight: 600,
                  textDecoration: "none", fontFamily: "'Inter'",
                }}>LinkedIn</a>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#666", fontFamily: "'Inter'" }}>
            <span style={{ color: "#333", fontWeight: 500 }}>{c.title}</span>
            {c.company && <span style={{ color: "#888" }}> · {c.company}</span>}
            {c.location && <span style={{ color: "#aaa", marginLeft: 8 }}>{"  "}{c.location}</span>}
          </p>
          {c.why && (
            <p style={{ fontSize: 12, color: s.color, marginTop: 5, fontFamily: "'Inter'", lineHeight: 1.5 }}>
              {c.why}
            </p>
          )}
        </div>

        <div style={{
          fontSize: 14, color: "#bbb", flexShrink: 0,
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</div>
      </div>

      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          borderTop: "1px solid #f0ece5", padding: "14px 20px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
          animation: "fadeUp 0.2s ease", background: "#fdfcfb",
        }}>
          {c.years_exp > 0 && (
            <div>
              <Label>Experience</Label>
              <p style={{ fontSize: 13, color: "#333", fontFamily: "'Inter'" }}>{c.years_exp} years</p>
            </div>
          )}
          {c.past_companies?.length > 0 && (
            <div>
              <Label>Past companies</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {c.past_companies.map((co, i) => <Tag key={i} label={co} />)}
              </div>
            </div>
          )}
          {c.skills?.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Skills</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {c.skills.map((s, i) => <Tag key={i} label={s} green />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EMPTY = {
  role: "", location: "", skills: "", seniority: "",
  company: "", companyUrl: "", targets: "", exclude: "", exTitles: "", jd: "",
};

export default function App() {
  const [f, setF] = useState(EMPTY);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const canSearch = f.role.trim() || f.jd.trim();

  const handleSearch = async () => {
    if (!canSearch) { setError("Enter a role title to search."); return; }
    setError(""); setLoading(true); setResults(null);
    try {
      const data = await doSearch(f, setStatus);
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", fontFamily: "'Inter', sans-serif", color: "#1a1a1a" }}>
      <style>{css}</style>

      <nav style={{
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid #ece9e3", padding: "0 32px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "#1a5c9e",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 15, color: "#fff" }}>◎</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", color: "#1a1a1a" }}>TalentRadar</span>
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 2 }}>by Oren Israelson</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: "#aaa", fontWeight: 500 }}>X-Ray Search · Live</span>
        </div>
      </nav>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "44px 20px 100px" }}>

        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#1a5c9e", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
            AI Recruitment Intelligence
          </p>
          <h1 style={{
            fontSize: 40, fontWeight: 600, lineHeight: 1.1, marginBottom: 12,
            letterSpacing: "-0.02em", color: "#1a1a1a",
          }}>
            Find the right person.<br />
            <span style={{ color: "#1a5c9e" }}>Not just any person.</span>
          </h1>
          <p style={{ color: "#888", fontSize: 15, lineHeight: 1.7, maxWidth: 440, margin: "0 auto" }}>
            X-Ray search across LinkedIn, Wellfound and Crunchbase.
            5 precise candidates — ranked, scored, ready to contact.
          </p>
        </div>

        <div style={{
          background: "#fff", border: "1px solid #ece9e3",
          borderRadius: 18, padding: "28px 28px 24px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
            <Field half label="Role Title *" value={f.role} onChange={set("role")}
              placeholder="e.g. VP Sales, Head of Product, Senior Engineer" />
            <Field half label="Location" value={f.location} onChange={set("location")}
              placeholder="e.g. Israel, Tel Aviv, Germany" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
            <Field half label="Key Skills" value={f.skills} onChange={set("skills")}
              placeholder="e.g. B2B SaaS, Python, Cybersecurity" />
            <Field half label="Seniority" value={f.seniority} onChange={set("seniority")}
              placeholder="e.g. Senior, VP, Director, Manager" />
          </div>

          <div style={{ borderTop: "1px solid #f0ece5", paddingTop: 16, marginBottom: advanced ? 16 : 0 }}>
            <button onClick={() => setAdvanced(a => !a)} style={{
              background: "none", border: "none", color: "#aaa", fontSize: 12, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'Inter'", letterSpacing: "0.06em", padding: 0,
            }}>
              <span style={{ transform: advanced ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block", fontSize: 9 }}>▶</span>
              {advanced ? "HIDE ADVANCED OPTIONS" : "ADVANCED OPTIONS"}
            </button>
          </div>

          {advanced && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, animation: "fadeUp 0.25s ease" }}>
              <Field half label="Company Website" value={f.companyUrl} onChange={set("companyUrl")}
                placeholder="https://company.com" />
              <Field half label="Source From Companies" value={f.targets} onChange={set("targets")}
                placeholder="e.g. Check Point, Wiz, CrowdStrike" />
              <Field half label="Exclude Companies" value={f.exclude} onChange={set("exclude")}
                placeholder="e.g. Competitor A, Competitor B" />
              <Field half label="Exclude Title Keywords" value={f.exTitles} onChange={set("exTitles")}
                placeholder="e.g. Founder, C-Level, Director" />
              <Field label="Job Description / Company Background" value={f.jd} onChange={set("jd")}
                textarea rows={4}
                placeholder="Paste your JD or describe what makes a great hire here..." />
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 16, padding: "11px 15px", borderRadius: 10,
              background: "#fef2f2", border: "1px solid #fca5a5",
              fontSize: 13, color: "#dc2626", fontFamily: "'Inter'",
            }}>{error}</div>
          )}

          <button onClick={handleSearch} disabled={loading || !canSearch} style={{
            width: "100%", marginTop: 20, padding: "15px", borderRadius: 11, border: "none",
            cursor: loading ? "wait" : canSearch ? "pointer" : "not-allowed",
            background: loading || !canSearch
              ? "#e8e6e0"
              : "linear-gradient(135deg, #1a5c9e 0%, #2979c8 100%)",
            color: loading || !canSearch ? "#aaa" : "#fff",
            fontFamily: "'Inter'", fontSize: 14, fontWeight: 600, letterSpacing: "0.02em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.2s",
            boxShadow: loading || !canSearch ? "none" : "0 4px 18px rgba(26,92,158,0.3)",
          }}>
            {loading ? (
              <>
                <div style={{
                  width: 15, height: 15, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                }} />
                {status || "Searching..."}
              </>
            ) : "Search Candidates →"}
          </button>
        </div>

        {results && (
          <div className="fade-up" style={{ marginTop: 28 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 14, flexWrap: "wrap", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 600, color: "#1a5c9e" }}>
                  {results.candidates?.length ?? 0}
                </span>
                <span style={{ fontSize: 13, color: "#888" }}>
                  candidates
                  {results.total_found ? " · " + results.total_found + " profiles scanned" : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {[["#16a34a", "80+", "Strong"], ["#d97706", "60–79", "Good"], ["#dc2626", "<60", "Partial"]].map(([color, range, label]) => (
                  <div key={range} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#aaa" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                    <span style={{ color, fontWeight: 600 }}>{range}</span> {label}
                  </div>
                ))}
              </div>
            </div>

            {results.search_summary && (
              <div style={{
                padding: "10px 14px", borderRadius: 9, marginBottom: 14,
                background: "#eff6ff", border: "1px solid #bdd0f5",
                fontSize: 12, color: "#1a5c9e", fontFamily: "'Inter'", lineHeight: 1.55,
              }}>
                {results.search_summary}
              </div>
            )}

            <p style={{ fontSize: 11, color: "#bbb", textAlign: "right", marginBottom: 10, fontStyle: "italic" }}>
              Click a card to expand
            </p>

            {results.candidates?.sort((a, b) => b.match_score - a.match_score).map((c, i) => (
              <CandidateCard key={i} c={c} rank={i + 1} />
            ))}

            <button
              onClick={() => { setResults(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              style={{
                marginTop: 20, width: "100%", padding: "12px",
                borderRadius: 10, border: "1px solid #e8e6e0",
                background: "#fff", color: "#888", fontSize: 13,
                fontFamily: "'Inter'", cursor: "pointer", fontWeight: 500,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#aaa"; e.target.style.color = "#333"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#e8e6e0"; e.target.style.color = "#888"; }}
            >
              New Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
