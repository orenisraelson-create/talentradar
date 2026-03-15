import { useState, useRef } from "react";

const API = "/api/claude";

const SYSTEM_PROMPT = `You are TalentRadar — an elite LinkedIn recruitment intelligence agent built for Oren Israelson.

━━━ TYPO TOLERANCE ━━━
All fields may contain misspellings. Always infer intent and generate multiple spelling variants in searches. Never fail due to a typo.

━━━ COMPANY INTELLIGENCE ━━━
If companyBackground or companyUrl is provided:
1. Search the web to learn about the hiring company — culture, stage, product, values, tech stack
2. If a URL is given, fetch it to extract company information
3. Build a success profile: what kind of person thrives there?
4. Use this as a core scoring dimension (culture fit = 25 pts)

━━━ SAMPLE PROFILE MATCHING ━━━
If sampleProfile is provided (URL, pasted text, or description):
1. Extract: seniority, career trajectory, company types (stage/size/industry), skills, education tier, stability pattern
2. Use as a search TEMPLATE — find similar profiles, not the same person
3. Always override sample's location/company with the user's explicit filters

━━━ HARD FILTERS — zero exceptions ━━━
- excludedCompanies: remove anyone currently at these companies
- excludedTitles: remove anyone whose CURRENT title contains any of these title keywords (case-insensitive). e.g. if "VP, Founder, C-level, Director" is specified, remove anyone with VP/Founder/Co-Founder/CEO/CTO/CFO/Director in their current title
- maxExperience: remove candidates clearly exceeding this
- MINIMUM TENURE: remove anyone at their current company less than 1 year (if unverifiable, flag in red_flags)
- languages: only include candidates who speak the required languages

━━━ SOURCE SIGNALS — use to enrich and re-score ━━━
When you find a candidate's profile on a secondary source, extract signals and adjust scoring:
- GitHub: active repos, stars, contribution frequency, languages → boosts tech score
- Stack Overflow: reputation score, top tags, answers → boosts domain expertise score  
- Wellfound: open to roles, startup preference, equity interest → adds fit context
- Crunchbase: founded companies, board roles, exits → boosts leadership score
- Twitter: follower count, thought leadership, industry engagement → adds signal

Add these as "source_signals" strings. Adjust match_score up to +8 pts for strong positive signals.

━━━ SCORING (0–100) ━━━
Role & seniority alignment: 20 pts
Technologies & skills: 20 pts
Industry & domain fit: 15 pts
Past company relevance: 10 pts
Location match: 10 pts
Culture & success fit: 25 pts

━━━ POOL SUGGESTIONS ━━━
If you return fewer than 10 candidates, populate "pool_suggestions" with specific, actionable advice:
- "remove": filters that are most likely causing the small pool (e.g. "Remove the city filter — searching all of Germany instead of just Berlin would 3x the candidate pool")
- "include": additions that would surface more relevant candidates (e.g. "Add 'TypeScript' as an alternative to JavaScript — many equivalent profiles use this term")
Be specific. Name the exact field and explain the expected impact.

━━━ MULTI-SOURCE SEARCH STRATEGY ━━━
Run searches across ALL relevant platforms using Google X-Ray. Adapt sources to the role type:

ALWAYS search:
  LinkedIn:      site:linkedin.com/in/ [role] [skills] [location]
  GitHub:        site:github.com [name OR role] [skills] — look for public profiles with repos
  Wellfound:     site:wellfound.com/u [role] [location] — startup-focused professionals

FOR TECHNICAL ROLES (engineer, developer, architect, data, ML, devops):
  Stack Overflow: site:stackoverflow.com/users [skills/tags] — find high-rep contributors
  dev.to / Medium: site:dev.to OR site:medium.com [tech topic] — active technical writers

FOR LEADERSHIP / BUSINESS ROLES (CEO, VP, founder, sales, BD, product):
  Crunchbase:    site:crunchbase.com/person [role/industry] — executives and founders
  Twitter/X:     site:twitter.com [role] [industry] bio:

CROSS-REFERENCING:
  Once you find a candidate on LinkedIn, search their name on GitHub and Stack Overflow to find their profiles there.
  This enriches the candidate record significantly.

Run 8–12 total searches across platforms. Collect 15–25 raw profiles. Deduplicate by name.

━━━ OUTPUT — return ONLY valid JSON ━━━
{
  "company_profile": "2-3 sentences on what makes a successful hire here (omit if no company info provided)",
  "candidates": [
    {
      "name": "Full Name",
      "title": "Current Title",
      "company": "Current Company",
      "location": "City, Country",
      "linkedin_url": "https://linkedin.com/in/...",
      "years_experience": 7,
      "current_company_months": 18,
      "match_score": 88,
      "culture_fit_score": 82,
      "success_prediction": "High",
      "why_top_match": "1 punchy sentence naming the 2-3 decisive factors that drove this ranking",
      "match_reasons": ["Reason 1", "Reason 2", "Reason 3"],
      "culture_fit_notes": "Why this person will thrive at this specific company",
      "background_summary": "1-2 sentence professional summary",
      "technologies": ["React", "Node.js"],
      "past_companies": ["Company A", "Company B"],
      "languages": ["English", "German"],
      "education": "MSc Computer Science, TU Berlin",
      "red_flags": [],
      "sources": {
        "github_url": "https://github.com/username or null",
        "stackoverflow_url": "https://stackoverflow.com/users/... or null",
        "wellfound_url": "https://wellfound.com/u/username or null",
        "crunchbase_url": "https://crunchbase.com/person/... or null",
        "twitter_url": "https://twitter.com/username or null",
        "other_url": "any other relevant profile or null"
      },
      "source_signals": ["e.g. Active GitHub contributor — 800+ commits in last year", "Stack Overflow top 5% in React"]
    }
  ],
  "total_searched": 16,
  "excluded_count": 2,
  "search_summary": "What was searched and any corrections made",
  "pool_suggestions": {
    "include": ["Specific actionable suggestion to BROADEN or ADD to get more candidates — only if candidates < 10"],
    "remove": ["Specific filter to LOOSEN or REMOVE to get more candidates — only if candidates < 10"]
  }
}`;

const SCORE_PROMPT = `You are TalentRadar — an elite recruitment scoring engine.
The user has imported a list of candidates from Grok or another source.
Your job:
1. Parse the input to extract candidate names and/or LinkedIn URLs (handle any format — plain list, Grok output, copy-pasted text, numbered lists, tables, etc.)
2. For each candidate found, search the web to retrieve their actual LinkedIn profile and other available public information
3. Score and rank each candidate against the provided criteria using the same scoring rubric
4. Return the same JSON format as a standard TalentRadar search

━━━ SCORING (0–100) ━━━
Role & seniority alignment: 20 pts
Technologies & skills: 20 pts
Industry & domain fit: 15 pts
Past company relevance: 10 pts
Location match: 10 pts
Culture & success fit: 25 pts

━━━ HARD FILTERS — zero exceptions ━━━
- excludedCompanies: remove anyone currently at these companies
- excludedTitles: remove anyone whose CURRENT title contains any of these title keywords (case-insensitive). e.g. if "VP, Founder, C-level, Director" is specified, remove anyone with VP/Founder/Co-Founder/CEO/CTO/CFO/Director in their current title
- maxExperience: remove candidates clearly exceeding this
- MINIMUM TENURE: flag anyone at their current company less than 1 year in red_flags
- Apply all other hard filters from criteria

━━━ SOURCE SIGNALS ━━━
Search each candidate on GitHub, Stack Overflow, Wellfound, Crunchbase as relevant to the role.
Add found profiles to sources{} and add source_signals[].

━━━ OUTPUT — return ONLY valid JSON, same schema as standard search ━━━
{
  "company_profile": "omit if no company info",
  "candidates": [
    {
      "name": "Full Name",
      "title": "Current Title",
      "company": "Current Company",
      "location": "City, Country",
      "linkedin_url": "https://linkedin.com/in/...",
      "years_experience": 7,
      "current_company_months": 18,
      "match_score": 88,
      "culture_fit_score": 82,
      "success_prediction": "High",
      "why_top_match": "1 punchy sentence naming the 2-3 decisive factors",
      "match_reasons": ["Reason 1", "Reason 2", "Reason 3"],
      "culture_fit_notes": "Why this person will thrive here",
      "background_summary": "1-2 sentence professional summary",
      "technologies": ["React", "Node.js"],
      "past_companies": ["Company A", "Company B"],
      "languages": ["English"],
      "education": "Degree, University",
      "red_flags": [],
      "sources": {
        "github_url": null,
        "stackoverflow_url": null,
        "wellfound_url": null,
        "crunchbase_url": null,
        "twitter_url": null,
        "other_url": null
      },
      "source_signals": []
    }
  ],
  "total_searched": 20,
  "excluded_count": 2,
  "search_summary": "Parsed and scored N candidates from imported list. X excluded by filters.",
  "pool_suggestions": { "include": [], "remove": [] }
}`;

async function scoreFromGrok(grokText, criteria, onProgress) {
  onProgress("Parsing imported candidates…");
  const criteriaStr = [
    criteria.companyUrl && `Company website: ${criteria.companyUrl}`,
    criteria.companyBackground && `Hiring company: ${criteria.companyBackground}`,
    criteria.roleTitle && `Role: ${criteria.roleTitle}`,
    criteria.seniority?.length && `Seniority: ${Array.isArray(criteria.seniority)?criteria.seniority.join(", "):criteria.seniority}`,
    criteria.industry && `Industry: ${criteria.industry}`,
    criteria.country && `Country: ${criteria.country}`,
    criteria.city && `City: ${criteria.city}`,
    criteria.technologies && `Technologies: ${fix(criteria.technologies)}`,
    criteria.languages && `Languages: ${criteria.languages}`,
    criteria.maxExperience && `Max experience: ${criteria.maxExperience} years`,
    criteria.excludedCompanies && `EXCLUDED companies: ${fix(criteria.excludedCompanies)}`,
    criteria.excludedTitles && `EXCLUDED title keywords: ${fix(criteria.excludedTitles)}`,

    criteria.targetCompanies && `Target companies: ${fix(criteria.targetCompanies)}`,
    criteria.jobDescription && `Job description: ${criteria.jobDescription.slice(0,600)}`,
  ].filter(Boolean).join("\n");

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      system: SCORE_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `IMPORTED CANDIDATE LIST:\n\n${grokText}\n\n━━━ SCORING CRITERIA ━━━\n${criteriaStr || "No specific criteria — score based on general professional quality and LinkedIn profile strength."}\n\nParse all candidates from the list above, research each one, and return scored JSON.`
      }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const n = data.content.filter(b => b.type === "tool_use" || b.type === "mcp_tool_use").length;
  if (n) onProgress(`Researched ${n} profiles · scoring against criteria…`);
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Could not parse candidates from imported text. Try a different format.");
  const result = JSON.parse(m[0]);
  onProgress(`Done — ${result.candidates?.length ?? 0} candidates scored`);
  return result;
}

const CLARIFY_PROMPT = `You are a recruitment assistant. Your job is to decide if clarifying questions are needed before searching for candidates.

STRICT RULES — follow exactly:
- Return MAXIMUM 2 questions. Never more.
- NEVER ask about salary, compensation, or pay.
- NEVER ask about languages if already specified in criteria.
- NEVER ask about industry if company URL or company background was provided.
- NEVER ask about location if country or city was provided.
- NEVER ask about seniority if seniority was already specified.
- NEVER ask about technologies if job description was provided.
- If you have role title + location → that is enough to search. Return 0 questions.
- Only ask if the answer would DRASTICALLY change who you sear

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "id": "q1",
      "question": "Clear, conversational question text",
      "hint": "Why this matters for the search",
      "type": "text"
    }
  ]
}`;

async function askClarifyingQuestions(criteria) {
  const summary = [
    criteria.roleTitle && `Role: ${criteria.roleTitle}`,
    criteria.seniority?.length && `Seniority: ${Array.isArray(criteria.seniority)?criteria.seniority.join(", "):criteria.seniority}`,
    criteria.industry && `Industry: ${criteria.industry}`,
    criteria.country && `Country: ${criteria.country}`,
    criteria.technologies && `Skills: ${criteria.technologies}`,
    criteria.jobDescription && `JD snippet: ${criteria.jobDescription.slice(0,300)}`,
  ].filter(Boolean).join("\n");

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: CLARIFY_PROMPT,
      messages: [{ role: "user", content: `Search criteria so far:\n${summary}\n\nGenerate targeted clarifying questions.` }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]).questions : [];
}

const TYPO_FIXES = [
  [/\bpytohn\b/gi,"Python"],[/\breakt?\b/gi,"React"],[/\bangualr\b/gi,"Angular"],
  [/\bkuberntes\b/gi,"Kubernetes"],[/\bfintek\b/gi,"FinTech"],
  [/\bisreal\b/gi,"Israel"],[/\btel avive?\b/gi,"Tel Aviv"],
  [/\bmicrosodt\b/gi,"Microsoft"],[/\bnod(e)?\.?js\b/gi,"Node.js"],
];
const fix = str => str ? TYPO_FIXES.reduce((s,[re,v]) => s.replace(re,v), str) : str;

function buildPrompt(c) {
  const p = ["Find top LinkedIn candidates. Correct typos and search multiple variants.\n"];
  if (c.companyUrl)         p.push(`COMPANY WEBSITE (fetch this to learn about the hiring company): ${c.companyUrl}`);
  if (c.companyBackground)  p.push(`HIRING COMPANY BACKGROUND:\n${c.companyBackground}\n`);
  if (c.sampleProfile)      p.push(`SAMPLE PROFILE TEMPLATE (find similar, override their location/company with filters below):\n${c.sampleProfile}\n`);
  if (c.roleTitle)          p.push(`Role title: ${fix(c.roleTitle)}`);
  if (c.seniority?.length)  p.push(`Seniority level(s): ${Array.isArray(c.seniority)?c.seniority.join(", "):c.seniority}`);
  if (c.industry)           p.push(`Industry: ${fix(c.industry)}`);
  if (c.country)            p.push(`Country: ${fix(c.country)}`);
  if (c.city)               p.push(`City/Region: ${fix(c.city)}`);
  if (c.languages)          p.push(`Required languages: ${fix(c.languages)}`);
  if (c.technologies)       p.push(`Desired technologies/skills: ${fix(c.technologies)}`);
  if (c.targetCompanies)    p.push(`Target companies to source from: ${fix(c.targetCompanies)}`);
  if (c.pastCompanies)      p.push(`Preferred past companies (boost score): ${fix(c.pastCompanies)}`);
  if (c.maxExperience)      p.push(`Max years experience (hard limit): ${c.maxExperience}`);
  if (c.excludedCompanies)  p.push(`EXCLUDED companies (hard filter): ${fix(c.excludedCompanies)}`);
  if (c.excludedTitles)     p.push(`EXCLUDED title keywords (hard filter — remove anyone whose current title contains these): ${fix(c.excludedTitles)}`);
  if (c.jobDescription)     p.push(`\nJob description:\n${c.jobDescription}`);
  p.push("\nApply all hard filters strictly. Return only the JSON.");
  return p.join("\n");
}

async function runSearch(criteria, onProgress) {
  onProgress("Analyzing company & building search strategy…");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 5000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: buildPrompt(criteria) }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const n = data.content.filter(b => b.type === "tool_use" || b.type === "mcp_tool_use").length;
  if (n) onProgress(`Ran ${n} searches · scoring candidates…`);
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No candidates found. Try broadening your criteria.");
  const result = JSON.parse(m[0]);
  onProgress(`Done — ${result.candidates?.length ?? 0} candidates ranked`);
  return result;
}

function toCsv(v) {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
}
function downloadCsv(candidates, at) {
  const headers = ["Rank","Name","Match","Culture Fit","Success","Title","Company","Location","Yrs Exp","Months @ Co","Why Top Match","LinkedIn","Summary","Match Reasons","Culture Notes","Technologies","Past Companies","Languages","Education","GitHub","Stack Overflow","Wellfound","Crunchbase","Source Signals","Flags","Searched At"];
  const rows = candidates.map((c,i) => [i+1,c.name,c.match_score,c.culture_fit_score??"",c.success_prediction??"",c.title,c.company,c.location,c.years_experience??"",c.current_company_months??"",c.why_top_match??"",c.linkedin_url??"",c.background_summary??"",(c.match_reasons??[]).join("; "),c.culture_fit_notes??"",(c.technologies??[]).join("; "),(c.past_companies??[]).join("; "),(c.languages??[]).join("; "),c.education??"",(c.red_flags??[]).join("; "),c.sources?.github_url??"",c.sources?.stackoverflow_url??"",c.sources?.wellfound_url??"",c.sources?.crunchbase_url??"",(c.source_signals??[]).join("; "),at].map(toCsv));
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})), download:`talentradar-${Date.now()}.csv` });
  a.click();
}
async function copyTsv(candidates) {
  const h = ["Rank","Name","Match","Culture","Success","Title","Company","Location","Yrs","Months","Why Match","LinkedIn","Summary","Reasons","Culture Notes","Technologies","Past Companies","Languages","Education"];
  const rows = candidates.map((c,i) => [i+1,c.name,c.match_score,c.culture_fit_score??"",c.success_prediction??"",c.title,c.company,c.location,c.years_experience??"",c.current_company_months??"",c.why_top_match??"",c.linkedin_url??"",c.background_summary??"",(c.match_reasons??[]).join(" | "),c.culture_fit_notes??"",(c.technologies??[]).join(", "),(c.past_companies??[]).join(", "),(c.languages??[]).join(", "),c.education??""]);
  await navigator.clipboard.writeText([h,...rows].map(r=>r.map(v=>String(v??"").replace(/\t/g," ")).join("\t")).join("\n"));
}

const G = {
  blue:"#1a5c9e", blueLight:"#eff6ff", blueBorder:"#bdd0f5",
  green:"#16a34a", greenLight:"#f0faf5", greenBorder:"#86efac",
  amber:"#d97706", amberLight:"#fffbeb", amberBorder:"#fcd34d",
  red:"#dc2626", redLight:"#fef2f2", redBorder:"#fca5a5",
  purple:"#7c3aed", purpleLight:"#faf5ff", purpleBorder:"#d8b4fe",
  bg:"#f2f0ec", surface:"#fff", border:"#e5e0d6",
  text:"#1a1a1a", muted:"#888", subtle:"#bbb",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#eae7e1;}
  ::-webkit-scrollbar-thumb{background:#cec8be;border-radius:2px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
  @keyframes shimmer{0%,100%{opacity:.65;}50%{opacity:1;}}
  @keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.15);}}
  .lift{transition:box-shadow .2s,transform .2s;}
  .lift:hover{box-shadow:0 10px 32px rgba(0,0,0,.1)!important;transform:translateY(-1px);}
  input:focus,textarea:focus{outline:none;border-color:${G.blue}!important;box-shadow:0 0 0 3px rgba(26,92,158,.1);}
  input::placeholder,textarea::placeholder{color:#c2bdb6;font-style:italic;font-size:13px;}
  .btn{transition:background .2s,transform .1s,box-shadow .2s;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;}
  .btn:hover:not(:disabled){filter:brightness(1.06);transform:translateY(-1px);}
  .btn:active:not(:disabled){transform:translateY(0);}
  .chip{display:inline-flex;align-items:center;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;border:1.5px solid transparent;transition:all .15s;user-select:none;}
  .arrow{transition:transform .25s ease;}
  select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23aaa'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:30px!important;}
`;

const Label = ({children, color=G.muted}) => (
  <p style={{fontSize:10.5,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",marginBottom:4,color}}>{children}</p>
);
const Hint = ({children}) => (
  <p style={{fontSize:11.5,color:G.subtle,marginBottom:6,lineHeight:1.45}}>{children}</p>
);
const inputBase = (extra={}) => ({
  width:"100%", borderRadius:10, padding:"11px 14px", fontSize:13.5,
  color:G.text, fontFamily:"'DM Sans',sans-serif", transition:"border-color .2s",
  border:`1.5px solid ${G.border}`, background:"#faf9f7", ...extra
});

const TextField = ({label,hint,value,onChange,placeholder,textarea,rows=3,type="text",accent,danger}) => {
  const bg = danger?"#fff8f8":accent?`${accent}08`:"#faf9f7";
  const border = danger?G.redBorder:accent?`${accent}55`:G.border;
  return (
    <div style={{flex:"1 1 100%"}}>
      <Label color={danger?G.red:accent||G.muted}>{label}</Label>
      {hint && <Hint>{hint}</Hint>}
      {textarea
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
            style={{...inputBase({background:bg,border:`1.5px solid ${border}`,lineHeight:1.65,resize:"vertical"}), width:"100%"}} />
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={inputBase({background:bg,border:`1.5px solid ${border}`})} />}
    </div>
  );
};

const HalfField = (props) => (
  <div style={{flex:"1 1 calc(50% - 8px)",minWidth:180}}>
    <TextField {...props} />
  </div>
);

const SelectField = ({label,hint,value,onChange,options}) => (
  <div style={{flex:"1 1 calc(50% - 8px)",minWidth:180}}>
    <Label>{label}</Label>
    {hint && <Hint>{hint}</Hint>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{...inputBase(),cursor:"pointer",background:"#faf9f7"}}>
      {options.map(([v,t])=><option key={v} value={v}>{t}</option>)}
    </select>
  </div>
);

const ChipGroup = ({label,hint,options,value,onChange,multi=false}) => {
  // value: string (single) or array (multi)
  const arr = multi ? (Array.isArray(value) ? value : (value ? [value] : [])) : null;
  const isActive = opt => multi ? arr.includes(opt) : value === opt;
  const toggle = opt => {
    if (multi) {
      const next = arr.includes(opt) ? arr.filter(x=>x!==opt) : [...arr, opt];
      onChange(next);
    } else {
      onChange(value === opt ? "" : opt);
    }
  };
  return (
    <div style={{flex:"1 1 100%"}}>
      <Label>{label}{multi && <span style={{fontWeight:400,color:G.subtle,fontSize:11,marginLeft:6}}>(בחירה מרובה)</span>}</Label>
      {hint && <Hint>{hint}</Hint>}
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {options.map(opt => {
          const active = isActive(opt);
          return (
            <button key={opt} className="chip" onClick={()=>toggle(opt)}
              style={{background:active?G.blue:"#f5f3ef",color:active?"#fff":G.muted,
                borderColor:active?G.blue:G.border,
                boxShadow:active?"0 2px 8px rgba(26,92,158,.2)":"none"}}>
              {active && <span style={{marginRight:4,fontSize:10}}>✓</span>}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Divider = ({icon,label}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 22px"}}>
    <div style={{width:30,height:30,borderRadius:8,background:"#f5f3ef",border:`1px solid ${G.border}`,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{icon}</div>
    <span style={{fontSize:10.5,fontWeight:700,color:G.subtle,letterSpacing:".14em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>
    <div style={{flex:1,height:1,background:G.border}} />
  </div>
);

const ScoreRing = ({score,size=56,label}) => {
  const color = score>=80?G.green:score>=60?G.amber:G.red;
  const r=(size/2)-5, circ=2*Math.PI*r, dash=(score/100)*circ;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ede9e3" strokeWidth="4"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:size>50?14:11,fontWeight:900,color}}>{score}</span>
        </div>
      </div>
      {label && <span style={{fontSize:9,fontWeight:700,color:G.subtle,letterSpacing:".1em",textTransform:"uppercase"}}>{label}</span>}
    </div>
  );
};

const PredBadge = ({val}) => {
  const map={High:[G.greenLight,G.green,"▲ High"],Medium:[G.amberLight,G.amber,"◆ Medium"],Low:[G.redLight,G.red,"▼ Low"]};
  const [bg,color,text]=map[val]??map.Medium;
  return <span className="chip" style={{background:bg,color,borderColor:"transparent",cursor:"default"}}>{text} success</span>;
};

const Tag = ({label,color=G.blue,bg}) => (
  <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
    letterSpacing:".04em",background:bg||`${color}12`,color,border:`1px solid ${color}30`}}>{label}</span>
);

const SOURCE_META = {
  linkedin:    { label:"LinkedIn",      icon:"💼", color:"#0077b5", bg:"#e8f4fc" },
  github:      { label:"GitHub",        icon:"🐙", color:"#24292e", bg:"#f0f0f0" },
  stackoverflow:{ label:"Stack Overflow",icon:"⚡", color:"#f48024", bg:"#fff3e8" },
  wellfound:   { label:"Wellfound",     icon:"🚀", color:"#16a34a", bg:"#f0faf5" },
  crunchbase:  { label:"Crunchbase",    icon:"💡", color:"#0288d1", bg:"#e3f2fd" },
  twitter:     { label:"Twitter/X",    icon:"🐦", color:"#1d9bf0", bg:"#e8f5fe" },
  other:       { label:"Profile",       icon:"🔗", color:"#7c3aed", bg:"#faf5ff" },
};

const SourceBadges = ({ sources, source_signals }) => {
  if (!sources) return null;
  const links = [
    sources.github_url      && ["github",       sources.github_url],
    sources.stackoverflow_url && ["stackoverflow",sources.stackoverflow_url],
    sources.wellfound_url   && ["wellfound",    sources.wellfound_url],
    sources.crunchbase_url  && ["crunchbase",   sources.crunchbase_url],
    sources.twitter_url     && ["twitter",      sources.twitter_url],
    sources.other_url       && ["other",        sources.other_url],
  ].filter(Boolean).filter(([,url]) => url && url !== "null");

  if (links.length === 0 && (!source_signals || source_signals.length === 0)) return null;

  return (
    <div style={{marginTop:8}}>
      {links.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom: source_signals?.length ? 8 : 0}}>
          {links.map(([key, url]) => {
            const m = SOURCE_META[key] ?? SOURCE_META.other;
            return (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{display:"inline-flex",alignItems:"center",gap:4,
                  padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,
                  background:m.bg,color:m.color,textDecoration:"none",
                  border:`1px solid ${m.color}30`,transition:"opacity .15s"}}
                onMouseEnter={e=>e.currentTarget.style.opacity=".75"}
                onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                <span>{m.icon}</span>{m.label} ↗
              </a>
            );
          })}
        </div>
      )}
      {source_signals?.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {source_signals.map((sig,i) => (
            <span key={i} style={{fontSize:11,color:"#555",background:"#f5f3ef",
              border:"1px solid #e5e0d6",borderRadius:20,padding:"2px 9px"}}>
              {sig}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const CandidateCard = ({c,rank,showCultureFit}) => {
  const [open,setOpen] = useState(false);
  const tier = c.match_score>=80
    ? {accent:G.green,pill:G.greenLight,pillText:"#15803d",label:"Strong Match"}
    : c.match_score>=60
    ? {accent:G.amber,pill:G.amberLight,pillText:"#92400e",label:"Good Match"}
    : {accent:G.red,pill:G.redLight,pillText:"#991b1b",label:"Partial"};
  const tenure = c.current_company_months;
  const tenureStr = tenure >= 12
    ? `${Math.floor(tenure/12)}yr${Math.floor(tenure/12)>1?"s":""}` : tenure > 0 ? `${tenure}mo` : null;

  return (
    <div className="lift" onClick={()=>setOpen(o=>!o)} style={{
      background:G.surface, border:`1.5px solid ${open?G.border+"88":"#ece8e1"}`,
      borderLeft:`4px solid ${tier.accent}`, borderRadius:14,
      padding:"18px 22px", cursor:"pointer", marginBottom:8,
      boxShadow:"0 2px 8px rgba(0,0,0,.045)"
    }}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:26,height:26,borderRadius:"50%",background:"#f5f3ef",border:`1.5px solid ${G.border}`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:900,color:G.subtle}}>#{rank}</span>
        </div>
        <ScoreRing score={c.match_score} label="Match" />
        {showCultureFit && c.culture_fit_score > 0 && <ScoreRing score={c.culture_fit_score} size={46} label="Culture" />}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:7,marginBottom:4}}>
            <h3 style={{fontSize:17,fontWeight:700,color:G.text,fontFamily:"'Cormorant Garamond',serif",letterSpacing:"-.01em"}}>{c.name}</h3>
            <span className="chip" style={{background:tier.pill,color:tier.pillText,borderColor:"transparent",cursor:"default"}}>{tier.label}</span>
            {c.success_prediction && <PredBadge val={c.success_prediction} />}
            {c.years_experience > 0 && <Tag label={`${c.years_experience} yrs exp`} color={G.blue} />}
            {tenureStr && <Tag label={`${tenureStr} @ current`} color={G.green} />}
            {c.linkedin_url &&
              <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                style={{background:"#0077b5",color:"#fff",borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                LinkedIn ↗
              </a>}
          </div>
          <p style={{fontSize:13.5,color:"#555"}}>
            <strong style={{color:"#333"}}>{c.title}</strong>
            {c.company && <> · {c.company}</>}
            {c.location && <span style={{color:G.subtle,marginLeft:8}}>📍 {c.location}</span>}
          </p>
          {c.why_top_match && (
            <p style={{fontSize:12.5,color:"#5a7ab5",marginTop:6,display:"flex",gap:6,alignItems:"flex-start",lineHeight:1.5}}>
              <span style={{flexShrink:0}}>✦</span><span>{c.why_top_match}</span>
            </p>
          )}
          <SourceBadges sources={c.sources} source_signals={c.source_signals} />
        </div>
        <div className="arrow" style={{fontSize:18,color:G.subtle,transform:open?"rotate(180deg)":"none",flexShrink:0}}>▾</div>
      </div>

      {open && (
        <div style={{marginTop:20,paddingTop:20,borderTop:`1.5px solid #f0ece5`,animation:"fadeUp .2s ease"}}>
          {c.background_summary && (
            <p style={{fontSize:13.5,color:"#555",lineHeight:1.7,marginBottom:18,padding:"12px 16px",
              background:"#faf9f7",borderRadius:9,borderLeft:"3px solid #ddd8d0",fontStyle:"italic"}}>
              "{c.background_summary}"
            </p>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:16}}>
            <div>
              <Label>Why they match the role</Label>
              {c.match_reasons?.map((r,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
                  <span style={{color:G.green,fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
                  <span style={{fontSize:13,color:"#444",lineHeight:1.55}}>{r}</span>
                </div>
              ))}
            </div>
            <div>
              {c.culture_fit_notes && (
                <div style={{marginBottom:14}}>
                  <Label>Culture & success fit</Label>
                  <p style={{fontSize:13,color:"#555",lineHeight:1.6,padding:"10px 12px",
                    background:G.blueLight,borderRadius:8,borderLeft:`3px solid ${G.blueBorder}`}}>
                    {c.culture_fit_notes}
                  </p>
                </div>
              )}
              {c.past_companies?.length > 0 && (
                <div style={{marginBottom:12}}>
                  <Label>Past companies</Label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {c.past_companies.map((co,i)=><Tag key={i} label={co} color={G.muted} />)}
                  </div>
                </div>
              )}
              {(c.languages?.length > 0 || c.education) && (
                <div>
                  {c.languages?.length > 0 && <><Label>Languages</Label><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>{c.languages.map((l,i)=><Tag key={i} label={l} color={G.purple} />)}</div></>}
                  {c.education && <><Label>Education</Label><p style={{fontSize:12,color:"#666"}}>{c.education}</p></>}
                </div>
              )}
              {c.red_flags?.length > 0 && (
                <div style={{marginTop:8}}>
                  <Label>Notes</Label>
                  {c.red_flags.map((f,i)=>(
                    <div key={i} style={{display:"flex",gap:7,marginBottom:5}}>
                      <span style={{color:G.amber,fontSize:12,flexShrink:0}}>⚠</span>
                      <span style={{fontSize:12,color:G.muted,lineHeight:1.5}}>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {c.technologies?.length > 0 && (
            <div>
              <Label>Technologies</Label>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {c.technologies.map((t,i)=><Tag key={i} label={t} color={G.blue} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ClarifyPanel = ({ questions, answers, onChange, onSearch, onSkip, loading }) => (
  <div style={{background:G.surface,borderRadius:20,border:`1.5px solid ${G.border}`,
    padding:"34px 36px",marginBottom:28,boxShadow:"0 4px 28px rgba(0,0,0,.06)",animation:"fadeUp .3s ease"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:24}}>
      <div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(135deg,${G.purple},#9c4eed)`,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        boxShadow:"0 2px 8px rgba(124,58,237,.3)"}}>
        <span style={{fontSize:19}}>🤔</span>
      </div>
      <div>
        <h2 style={{fontSize:18,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",marginBottom:4}}>
          A few quick questions
        </h2>
        <p style={{fontSize:13,color:G.muted,lineHeight:1.5}}>
          Answering these helps the agent find much more precise candidates. Skip any you'd rather not answer.
        </p>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:18,marginBottom:28}}>
      {questions.map((q,i) => (
        <div key={q.id} style={{borderLeft:`3px solid ${G.purpleBorder}`,paddingLeft:16}}>
          <label style={{display:"block",fontSize:13.5,fontWeight:600,color:G.text,marginBottom:3}}>
            {i+1}. {q.question}
          </label>
          {q.hint && <p style={{fontSize:11.5,color:G.subtle,marginBottom:7,lineHeight:1.4}}>{q.hint}</p>}
          <input value={answers[q.id]||""} onChange={e=>onChange(q.id, e.target.value)}
            placeholder="Your answer (or leave blank to skip)"
            style={{width:"100%",borderRadius:9,padding:"10px 13px",fontSize:13.5,color:G.text,
              fontFamily:"'DM Sans',sans-serif",border:`1.5px solid ${G.purpleBorder}`,
              background:G.purpleLight,transition:"border-color .2s"}}
            onFocus={e=>{e.target.style.borderColor=G.purple;e.target.style.boxShadow=`0 0 0 3px rgba(124,58,237,.1)`;}}
            onBlur={e=>{e.target.style.borderColor=G.purpleBorder;e.target.style.boxShadow="none";}} />
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:10}}>
      <button className="btn" onClick={onSearch} disabled={loading} style={{
        flex:1,padding:"14px 20px",borderRadius:12,
        background:`linear-gradient(135deg,${G.blue},#2979c8)`,
        color:"#fff",fontSize:14,fontWeight:700,letterSpacing:".04em",
        boxShadow:"0 4px 18px rgba(26,92,158,.3)",
        display:"flex",alignItems:"center",justifyContent:"center",gap:8
      }}>
        {loading
          ? <><div style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/> Searching…</>
          : <><span>Search with these answers</span><span style={{opacity:.55}}>→</span></>}
      </button>
      <button className="btn" onClick={onSkip} disabled={loading} style={{
        padding:"14px 20px",borderRadius:12,background:"#f5f3ef",
        color:G.muted,fontSize:14,fontWeight:600,border:`1.5px solid ${G.border}`
      }}>
        Skip & search anyway
      </button>
    </div>
  </div>
);

const PoolSuggestions = ({ suggestions, onRevise, loading }) => {
  const allItems = [
    ...(suggestions?.remove || []).map(s => ({ type:"remove", text:s })),
    ...(suggestions?.include || []).map(s => ({ type:"include", text:s })),
  ];
  const [votes, setVotes] = useState(() => Object.fromEntries(allItems.map((_,i) => [i, null])));
  if (allItems.length === 0) return null;

  const accepted = allItems.filter((_,i) => votes[i] === "go");
  const anyVoted = Object.values(votes).some(v => v !== null);
  const allVoted = Object.values(votes).every(v => v !== null);

  const toggle = (i, val) => setVotes(p => ({ ...p, [i]: p[i] === val ? null : val }));

  return (
    <div style={{background:"#fffbf0",border:`1.5px solid ${G.amberBorder}`,borderRadius:16,
      padding:"22px 26px",marginBottom:22,animation:"fadeUp .3s ease"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:18}}>
        <span style={{fontSize:22,flexShrink:0}}>📉</span>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:G.amber}}>Fewer than 10 candidates found</p>
          <p style={{fontSize:12.5,color:"#92400e",lineHeight:1.5,marginTop:2}}>
            The agent suggests changes to expand your pool.
            Mark each suggestion <strong>Go</strong> or <strong>No</strong>, then run a revised search.
          </p>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {allItems.map((item, i) => {
          const isRemove = item.type === "remove";
          const vote = votes[i];
          return (
            <div key={i} style={{
              display:"flex",alignItems:"flex-start",gap:12,
              padding:"13px 16px",borderRadius:11,
              background: vote==="go" ? (isRemove?"#fff7ed":"#f0fdf4") : vote==="no" ? "#f8f8f8" : G.surface,
              border:`1.5px solid ${vote==="go" ? (isRemove?G.amberBorder:G.greenBorder) : vote==="no" ? G.border : G.border}`,
              opacity: vote==="no" ? 0.55 : 1,
              transition:"all .18s"
            }}>
              <div style={{flexShrink:0,marginTop:2}}>
                {isRemove
                  ? <span style={{fontSize:13,fontWeight:700,color:G.amber,background:"#fef3c7",
                      border:`1px solid ${G.amberBorder}`,borderRadius:5,padding:"1px 7px"}}>🔓 Loosen</span>
                  : <span style={{fontSize:13,fontWeight:700,color:G.green,background:G.greenLight,
                      border:`1px solid ${G.greenBorder}`,borderRadius:5,padding:"1px 7px"}}>➕ Add</span>
                }
              </div>
              <span style={{flex:1,fontSize:13,color:"#44403c",lineHeight:1.6}}>{item.text}</span>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn" onClick={()=>toggle(i,"go")}
                  style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                    background: vote==="go" ? G.green : "transparent",
                    color: vote==="go" ? "#fff" : G.green,
                    border:`1.5px solid ${G.green}`,transition:"all .15s"}}>
                  ✓ Go
                </button>
                <button className="btn" onClick={()=>toggle(i,"no")}
                  style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                    background: vote==="no" ? "#6b7280" : "transparent",
                    color: vote==="no" ? "#fff" : G.muted,
                    border:`1.5px solid ${G.border}`,transition:"all .15s"}}>
                  ✕ No
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {anyVoted && (
        <div style={{borderTop:`1.5px solid ${G.amberBorder}`,paddingTop:16,display:"flex",alignItems:"center",
          justifyContent:"space-between",flexWrap:"wrap",gap:12,animation:"fadeUp .2s ease"}}>
          <div style={{fontSize:12.5,color:"#78350f"}}>
            {accepted.length > 0
              ? <><strong>{accepted.length}</strong> change{accepted.length>1?"s":""} accepted — agent will apply {accepted.length>1?"them":"it"} and re-search</>
              : <span style={{color:G.muted}}>No changes accepted — select at least one to run a revised search</span>
            }
          </div>
          {accepted.length > 0 && (
            <button className="btn" onClick={()=>onRevise(accepted)} disabled={loading}
              style={{display:"flex",alignItems:"center",gap:8,padding:"11px 22px",borderRadius:11,
                background: loading?"#ccc":`linear-gradient(135deg,${G.amber},#d97706)`,
                color:"#fff",fontSize:13.5,fontWeight:700,
                boxShadow:loading?"none":"0 4px 14px rgba(217,119,6,.3)"}}>
              {loading
                ? <><div style={{width:15,height:15,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/> Searching…</>
                : <><span>🔁</span> Run Revised Search</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ExportBar = ({candidates,searchedAt}) => {
  const [copied,setCopied] = useState(false);
  const handleCopy = async () => { await copyTsv(candidates); setCopied(true); setTimeout(()=>setCopied(false),2500); };
  return (
    <div style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,
      padding:"14px 20px",marginBottom:20,display:"flex",alignItems:"center",
      justifyContent:"space-between",flexWrap:"wrap",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <span style={{fontSize:18}}>📊</span>
        <div>
          <p style={{fontSize:12.5,fontWeight:700,color:"#333"}}>Export results</p>
          <p style={{fontSize:11,color:G.subtle}}>{candidates.length} candidates · {searchedAt}</p>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn" onClick={()=>downloadCsv(candidates,searchedAt)}
          style={{display:"flex",alignItems:"center",gap:6,background:G.greenLight,color:G.green,
            borderRadius:9,padding:"8px 14px",fontSize:12.5,fontWeight:700,border:`1.5px solid ${G.greenBorder}`}}>
          ⬇ Download CSV
        </button>
        <button className="btn" onClick={handleCopy}
          style={{display:"flex",alignItems:"center",gap:6,
            background:copied?G.greenLight:G.amberLight,
            color:copied?G.green:G.amber,borderRadius:9,padding:"8px 14px",fontSize:12.5,fontWeight:700,
            border:`1.5px solid ${copied?G.greenBorder:G.amberBorder}`}}>
          {copied?"✓ Copied!":"📋 Copy for Google Sheets"}
        </button>
        <a href="https://sheets.new" target="_blank" rel="noopener noreferrer"
          style={{display:"flex",alignItems:"center",gap:6,background:G.blueLight,color:G.blue,
            borderRadius:9,padding:"8px 14px",fontSize:12.5,fontWeight:700,textDecoration:"none",
            border:`1.5px solid ${G.blueBorder}`}}>
          ↗ Open Google Sheets
        </a>
      </div>
      {copied && (
        <div style={{width:"100%",background:G.blueLight,border:`1px solid ${G.blueBorder}`,borderRadius:8,
          padding:"9px 14px",fontSize:12,color:G.blue,display:"flex",gap:8,animation:"fadeUp .2s ease"}}>
          <span>💡</span> Open Google Sheets → click cell A1 → press <strong>Ctrl+V</strong> (Cmd+V on Mac). All columns populate automatically.
        </div>
      )}
    </div>
  );
};

const EMPTY = {
  companyBackground:"", companyUrl:"",
  sampleProfile:"",
  roleTitle:"", seniority:[], industry:"",
  country:"", city:"",
  languages:"",
  technologies:"", targetCompanies:"", pastCompanies:"",
  maxExperience:"", excludedCompanies:"", excludedTitles:"",
  jobDescription:""
};

export default function App() {
  const [f, setF] = useState(EMPTY);
  const set = k => v => setF(p=>({...p,[k]:v}));
  const [activeTab, setActiveTab] = useState("search");
  const [grokText, setGrokText] = useState("");
  const [importResults, setImportResults] = useState(null);
  const [importedAt, setImportedAt] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importError, setImportError] = useState("");
  const importResultsRef = useRef(null);
  const [loading,setLoading] = useState(false);
  const [progress,setProgress] = useState("");
  const [results,setResults] = useState(null);
  const [searchedAt,setSearchedAt] = useState("");
  const [error,setError] = useState("");
  const [phase,setPhase] = useState("form");
  const [questions,setQuestions] = useState([]);
  const [answers,setAnswers] = useState({});
  const resultsRef = useRef(null);
  const clarifyRef = useRef(null);

  const hasCompany = f.companyBackground.trim().length > 10 || f.companyUrl.trim().length > 5;
  const hasSample = f.sampleProfile.trim().length > 5;
  const isIntelligent = hasCompany || hasSample;

  const mergedCriteria = () => {
    const extra = Object.entries(answers).filter(([,v])=>v.trim()).map(([k,v])=>`${k}: ${v}`).join("\n");
    return { ...f, jobDescription: [f.jobDescription, extra].filter(Boolean).join("\n\nAdditional context from clarifying questions:\n") };
  };

const handleSearch = async () => {
    if (!f.roleTitle && !f.industry && !f.jobDescription && !f.sampleProfile) {
      setError("Fill in at least a Role Title, Industry, Job Description, or Sample Profile.");
      return;
    }
    setError("");
    setLoading(true);
    setResults(null);
    setPhase("searching");
    try {
      const data = await runSearch(f, setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString());
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setPhase("done"); }
  };
  const runActualSearch = async () => {
    setLoading(true);
    setResults(null);
    setPhase("searching");
    try {
      const data = await runSearch(mergedCriteria(), setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString());
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setPhase("done"); }
  };

  const handleRevise = async (acceptedSuggestions) => {
    // Build a revised criteria string that incorporates accepted suggestions
    const instructions = acceptedSuggestions.map(s =>
      s.type === "remove" ? `LOOSEN/REMOVE: ${s.text}` : `ADD/INCLUDE: ${s.text}`
    ).join("\n");
    setLoading(true);
    setResults(null);
    setPhase("searching");
    setProgress("Applying accepted suggestions…");
    try {
      const revised = {
        ...mergedCriteria(),
        jobDescription: [mergedCriteria().jobDescription,
          "\n\n━━━ REVISED SEARCH — apply these changes from previous run ━━━\n" + instructions
        ].filter(Boolean).join("")
      };
      const data = await runSearch(revised, setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString() + " (revised)");
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setPhase("done"); }
  };

  const handleImport = async () => {
    if (!grokText.trim()) { setImportError("Paste some candidate data first."); return; }
    setImportError(""); setImportLoading(true); setImportResults(null);
    try {
      const data = await scoreFromGrok(grokText, f, setImportProgress);
      setImportResults(data);
      setImportedAt(new Date().toLocaleString());
      setTimeout(()=>importResultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setImportError(e.message); }
    finally { setImportLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"'DM Sans',sans-serif",color:G.text}}>
      <style>{css}</style>

      <nav style={{background:G.surface,borderBottom:`1px solid ${G.border}`,padding:"0 28px",height:56,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 12px rgba(0,0,0,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:34,height:34,background:`linear-gradient(135deg,${G.blue},#2979c8)`,
            borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 2px 8px rgba(26,92,158,.3)"}}>
            <span style={{fontSize:16}}>🔍</span>
          </div>
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontWeight:700,fontSize:15.5,letterSpacing:"-.01em"}}>TalentRadar</span>
              <span style={{fontSize:11,color:G.subtle}}>by Oren Israelson</span>
            </div>
            <div style={{fontSize:10.5,color:G.subtle,marginTop:-1}}>LinkedIn Candidate Intelligence</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:G.green,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:10.5,color:G.subtle,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase"}}>Live · Claude AI</span>
        </div>
      </nav>

      <div style={{maxWidth:860,margin:"0 auto",padding:"44px 20px 90px"}}>

        <div style={{marginBottom:40}}>
          <p style={{fontSize:11,fontWeight:700,color:G.blue,letterSpacing:".2em",textTransform:"uppercase",marginBottom:10}}>
            AI Recruitment Intelligence
          </p>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:46,fontWeight:700,
            color:G.text,lineHeight:1.05,marginBottom:14}}>
            Find Your Next<br/>
            <span style={{color:G.blue}}>Top Candidate.</span>
          </h1>
          <p style={{color:G.muted,fontSize:14.5,maxWidth:520,lineHeight:1.7}}>
            Define your role, set your filters, describe your company — and the agent performs deep X-Ray searches across LinkedIn, ranking candidates by fit <em>and</em> predicted success.
          </p>
          <div style={{display:"flex",gap:16,marginTop:18,flexWrap:"wrap"}}>
            {[["✏️","Typo-tolerant search"],["📅","Min. 1yr tenure enforced"],["🎯","Culture fit scoring"],["🌐","5 sources: LinkedIn · GitHub · Stack Overflow · Wellfound · Crunchbase"]].map(([icon,label])=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.muted}}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>

        <div style={{display:"flex",gap:0,marginBottom:28,background:G.surface,borderRadius:16,
          border:`1.5px solid ${G.border}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.05)"}}>
          {[
            {id:"search", icon:"🔍", label:"AI Search", sub:"Find new candidates"},
            {id:"import", icon:"📥", label:"Import from Grok", sub:"Score a list you already have"},
          ].map(tab => (
            <button key={tab.id} className="btn" onClick={()=>setActiveTab(tab.id)}
              style={{flex:1,padding:"16px 20px",textAlign:"left",borderRadius:0,
                background: activeTab===tab.id ? `linear-gradient(135deg,${G.blue},#2979c8)` : "transparent",
                color: activeTab===tab.id ? "#fff" : G.muted,
                borderRight: tab.id==="search" ? `1.5px solid ${G.border}` : "none",
                transition:"all .2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>{tab.icon}</span>
                <div>
                  <div style={{fontSize:13.5,fontWeight:700}}>{tab.label}</div>
                  <div style={{fontSize:11,opacity:.7,marginTop:1}}>{tab.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {activeTab === "import" && (
          <div style={{background:G.surface,borderRadius:20,border:`1.5px solid ${G.border}`,
            padding:"34px 36px",marginBottom:28,boxShadow:"0 4px 28px rgba(0,0,0,.06)"}}>

            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:22}}>
              <div style={{width:44,height:44,borderRadius:12,
                background:"linear-gradient(135deg,#1c1c1e,#3a3a3c)",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                boxShadow:"0 2px 10px rgba(0,0,0,.3)"}}>
                <span style={{fontSize:22}}>𝕏</span>
              </div>
              <div>
                <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,marginBottom:4}}>
                  Import & Score from Grok
                </h2>
                <p style={{fontSize:13,color:G.muted,lineHeight:1.6,maxWidth:560}}>
                  Got a list of candidates from Grok, another AI, or a spreadsheet?
                  Paste it below — any format works. TalentRadar will research each person,
                  verify their profiles, and score them against your criteria.
                </p>
              </div>
            </div>

            <div style={{background:"#f8f9fc",border:`1.5px dashed ${G.blueBorder}`,borderRadius:14,
              padding:"14px 18px",marginBottom:20,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>💡</span>
              <div style={{fontSize:12.5,color:"#4a5568",lineHeight:1.6}}>
                <strong>How to use Grok:</strong> Go to{" "}
                <a href="https://grok.com" target="_blank" rel="noopener noreferrer"
                  style={{color:G.blue,fontWeight:600}}>grok.com</a>{" "}
                (free) → ask <em>"Find me 20 Senior React developers in Berlin with startup experience, give me their LinkedIn URLs"</em> → copy the response and paste it here.
                TalentRadar will score and rank them for you.
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:12.5,fontWeight:700,color:G.text,marginBottom:6,letterSpacing:".03em"}}>
                Paste candidate list
              </label>
              <p style={{fontSize:11.5,color:G.subtle,marginBottom:8}}>Any format: names, LinkedIn URLs, Grok output, numbered list, table — anything works</p>
              <textarea
                value={grokText}
                onChange={e=>setGrokText(e.target.value)}
                rows={12}
                placeholder={"Examples of supported formats:\n\n1. John Smith – Senior React Dev at Stripe – linkedin.com/in/johnsmith\n2. Sarah Chen, Staff Engineer @ Airbnb\n\nOR paste Grok's full response directly.\n\nOR a list of LinkedIn URLs:\nhttps://linkedin.com/in/johnsmith\nhttps://linkedin.com/in/sarahchen"}
                style={{width:"100%",borderRadius:12,padding:"14px 16px",fontSize:13,
                  fontFamily:"'DM Sans',sans-serif",color:G.text,lineHeight:1.65,resize:"vertical",
                  border:`1.5px solid ${G.blueBorder}`,background:"#f5f8ff",transition:"border-color .2s"}}
                onFocus={e=>{e.target.style.borderColor=G.blue;e.target.style.boxShadow=`0 0 0 3px rgba(26,92,158,.1)`;}}
                onBlur={e=>{e.target.style.borderColor=G.blueBorder;e.target.style.boxShadow="none";}}
              />
            </div>

            <div style={{background:G.blueLight,border:`1.5px solid ${G.blueBorder}`,borderRadius:12,
              padding:"14px 18px",marginBottom:24,fontSize:12.5,color:"#2a4a7a",lineHeight:1.6}}>
              <strong>🎯 Tip:</strong> Fill in the <strong>Hiring Company</strong> and <strong>Role</strong> fields in the Search tab first
              — the scoring will be much more accurate with your criteria.
              <span style={{marginLeft:8,color:G.blue,cursor:"pointer",fontWeight:600,textDecoration:"underline"}}
                onClick={()=>setActiveTab("search")}>
                Add criteria →
              </span>
            </div>

            {importError && (
              <div style={{background:"#fef2f2",border:`1.5px solid ${G.redBorder}`,borderRadius:10,
                padding:"10px 14px",marginBottom:16,fontSize:13,color:G.red,display:"flex",gap:8}}>
                <span>⚠️</span> {importError}
              </div>
            )}

            <button className="btn" onClick={handleImport} disabled={importLoading} style={{
              width:"100%",padding:"16px 24px",borderRadius:14,
              background:importLoading?"#ccc":`linear-gradient(135deg,#1c1c1e,#3a3a3c)`,
              color:"#fff",fontSize:15,fontWeight:700,letterSpacing:".03em",
              boxShadow:importLoading?"none":"0 4px 18px rgba(0,0,0,.25)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:10
            }}>
              {importLoading
                ? <><div style={{width:17,height:17,border:"2.5px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/> <span>{importProgress || "Processing…"}</span></>
                : <><span>𝕏</span><span>Score & Rank Imported Candidates</span><span style={{opacity:.5}}>→</span></>}
            </button>
          </div>
        )}

        {activeTab === "import" && importResults && (
          <div ref={importResultsRef} style={{animation:"fadeUp .4s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,
              padding:"12px 18px",background:"#f0faf5",border:`1.5px solid ${G.greenBorder}`,borderRadius:12}}>
              <span style={{fontSize:18}}>✅</span>
              <div>
                <p style={{fontSize:13.5,fontWeight:700,color:G.green}}>Import scored successfully</p>
                <p style={{fontSize:12,color:"#166534"}}>{importResults.candidates?.length ?? 0} candidates ranked · imported from Grok · {importedAt}</p>
              </div>
            </div>

            <ExportBar
              candidates={importResults.candidates?.sort((a,b)=>b.match_score-a.match_score)??[]}
              searchedAt={importedAt}
            />

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
              {[
                {val:importResults.candidates?.length??0,label:"Scored",sub:"from import",color:G.blue},
                {val:importResults.total_searched??"—",label:"Profiles",sub:"researched",color:G.green},
                {val:importResults.excluded_count??0,label:"Excluded",sub:"by filters",color:G.red},
                {val:importResults.candidates?.filter(c=>c.match_score>=80).length??0,label:"Strong",sub:"matches 80+",color:G.amber},
              ].map(({val,label,sub,color})=>(
                <div key={label} style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,
                  padding:"16px 18px",boxShadow:"0 2px 8px rgba(0,0,0,.04)",borderTop:`3px solid ${color}`}}>
                  <div style={{fontSize:30,fontWeight:900,color,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{val}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.muted,marginTop:4}}>{label}</div>
                  <div style={{fontSize:10.5,color:G.subtle}}>{sub}</div>
                </div>
              ))}
            </div>

            {importResults.search_summary && (
              <div style={{background:G.blueLight,border:`1.5px solid ${G.blueBorder}`,borderRadius:10,
                padding:"11px 16px",marginBottom:18,fontSize:13,color:"#1e40af",display:"flex",gap:8}}>
                <span>ℹ️</span> {importResults.search_summary}
              </div>
            )}

            <div style={{display:"flex",gap:18,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              {[[G.green,"80–100","Strong"],[G.amber,"60–79","Good"],[G.red,"0–59","Partial"]].map(([color,range,label])=>(
                <div key={range} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:G.muted}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:color}}/>
                  <span style={{color,fontWeight:700}}>{range}</span>{label}
                </div>
              ))}
              <span style={{marginLeft:"auto",fontSize:11.5,color:G.subtle,fontStyle:"italic"}}>Click any card to expand</span>
            </div>

            {importResults.candidates?.sort((a,b)=>b.match_score-a.match_score).map((c,i)=>(
              <CandidateCard key={i} c={c} rank={i+1} showCultureFit={hasCompany} />
            ))}
          </div>
        )}

        {activeTab === "search" && (
          <>
            <div style={{background:G.surface,borderRadius:20,border:`1.5px solid ${G.border}`,
              padding:"34px 36px",marginBottom:28,boxShadow:"0 4px 28px rgba(0,0,0,.06)"}}>


          <Divider icon="🏛️" label="Hiring Company" />
          <div style={{background:`linear-gradient(135deg,${G.blueLight},#f8faff)`,border:`1.5px solid ${G.blueBorder}`,
            borderRadius:14,padding:"18px 20px",marginBottom:28}}>
            <p style={{fontSize:13,fontWeight:600,color:G.blue,marginBottom:4}}>
              The more you share about your company, the smarter the matching.
            </p>
            <p style={{fontSize:12.5,color:"#6b82a8",lineHeight:1.6,marginBottom:16}}>
              The agent researches your company, builds a success profile, and scores each candidate on their likelihood of thriving in your specific environment.
            </p>
            <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
              <HalfField label="Company Website URL"
                hint="Agent will fetch and read your site automatically"
                value={f.companyUrl} onChange={set("companyUrl")}
                placeholder="https://www.yourcompany.com" accent={G.blue} />
              <div style={{flex:"1 1 100%"}}>
                <Label color={G.blue}>About Your Company</Label>
                <Hint>Stage, culture, tech stack, values, team size, what makes a great hire here — or just paste from your careers page</Hint>
                <textarea value={f.companyBackground} onChange={e=>set("companyBackground")(e.target.value)}
                  rows={4} placeholder="e.g. Series B FinTech (~80 people) building B2B payments for SMBs in Europe. Engineering culture is flat and product-driven. We value ownership, comfort with ambiguity, and scrappy startup experience. Stack: Go + Postgres + Kafka on AWS. Best hires came from other FinTech or infrastructure companies."
                  style={{...inputBase({background:"#f5f8ff",border:`1.5px solid ${G.blueBorder}`,lineHeight:1.65,resize:"vertical"}),width:"100%"}}/>
              </div>
            </div>
          </div>

          <Divider icon="💼" label="Role" />
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Job Title" value={f.roleTitle} onChange={set("roleTitle")} placeholder="e.g. Senior Backend Engineer, Head of Product…" />
            <ChipGroup label="Seniority Level" value={f.seniority} onChange={set("seniority")}
              options={["Intern","Junior","Mid","Senior","Lead / Staff","Manager","Director","VP","C-Level"]} multi />
          </div>

          <Divider icon="📍" label="Location & Work Style" />
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Country" value={f.country} onChange={set("country")} placeholder="e.g. Germany, United States, Israel…" />
            <HalfField label="City / Region" value={f.city} onChange={set("city")} placeholder="e.g. Berlin, New York, Tel Aviv Area…" />

          </div>

          <Divider icon="🎓" label="Candidate Profile" />
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Required Languages" hint="Comma-separated" value={f.languages} onChange={set("languages")} placeholder="e.g. English, German, Hebrew…" />

            <HalfField label="Desired Technologies & Skills" hint="Comma-separated — typos auto-corrected"
              value={f.technologies} onChange={set("technologies")} placeholder="e.g. React, Python, AWS, Kubernetes, SQL…" />
            <HalfField label="Max Years of Experience" type="number"
              value={f.maxExperience} onChange={set("maxExperience")} placeholder="e.g. 10  (blank = no limit)" />
          </div>

          <Divider icon="🏢" label="Company Filters" />
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <TextField label="Target Companies to Source From"
              hint="Comma-separated — agent prioritizes these in searches"
              value={f.targetCompanies} onChange={set("targetCompanies")}
              placeholder="e.g. Google, Stripe, Wix, Monday.com, Palantir…" />
            <TextField label="Preferred Past Companies"
              hint="Candidates with experience here score higher"
              value={f.pastCompanies} onChange={set("pastCompanies")}
              placeholder="e.g. McKinsey, Goldman Sachs, any FAANG…" />
            <TextField danger label="⛔ Excluded Companies — Do NOT Source From"
              hint="Hard filter — anyone currently at these companies is removed"
              value={f.excludedCompanies} onChange={set("excludedCompanies")}
              placeholder="e.g. Competitor A, Competitor B…" />
            <TextField danger label="⛔ Excluded Titles — Filter Out These Roles"
              hint="Hard filter — anyone whose current title contains these keywords is removed. Useful to exclude overqualified or misaligned seniority."
              value={f.excludedTitles} onChange={set("excludedTitles")}
              placeholder="e.g. VP, Director, C-Level, Founder, Co-Founder, Head of…" />
          </div>

          <Divider icon="👤" label="Sample Candidate — Find Similar Profiles" />
          <div style={{marginBottom:28}}>
            <div style={{background:G.purpleLight,border:`1.5px solid ${G.purpleBorder}`,
              borderRadius:14,padding:"18px 20px"}}>
              <p style={{fontSize:13,fontWeight:600,color:G.purple,marginBottom:4}}>
                Paste a LinkedIn profile URL, raw profile text, or describe the ideal candidate
              </p>
              <p style={{fontSize:12.5,color:"#9a6bc4",lineHeight:1.6,marginBottom:14}}>
                The agent extracts career patterns and finds similar profiles — applying all your location, company, and other filters on top. A US sample + Germany filter = Germany-based people with the same profile shape.
              </p>
              <TextField value={f.sampleProfile} onChange={set("sampleProfile")} textarea rows={4}
                placeholder={"https://linkedin.com/in/example\n\nOR paste text: Senior Engineer at Stripe, ex-Google, Stanford CS, 8 yrs, payments & infra specialist, led team of 5.\n\nOR describe: Someone like a senior backend from top-tier US fintech, 6-10 yrs, has led small teams."}
                accent={G.purple} />
            </div>
            {hasSample && (
              <div style={{marginTop:10,background:G.purpleLight,border:`1px solid ${G.purpleBorder}`,
                borderRadius:9,padding:"9px 14px",fontSize:12,color:G.purple,display:"flex",gap:8}}>
                <span>✦</span> Sample profile detected — career patterns will be extracted and used as a search template.
              </div>
            )}
          </div>

          <Divider icon="📋" label="Job Description" />
          <div style={{marginBottom:28}}>
            <TextField textarea rows={6} label="Free-Text Job Description & Requirements"
              hint="The richer the description, the smarter the match — include responsibilities, must-haves, nice-to-haves, team context"
              value={f.jobDescription} onChange={set("jobDescription")}
              placeholder="e.g. We're looking for a Senior Backend Engineer with 5+ years building distributed systems at scale. Must have Go or Rust, strong DB knowledge, AWS. Startup experience and team leadership a strong plus. Will own the payments service end-to-end and work closely with product." />
          </div>

          {error && (
            <div style={{background:G.redLight,border:`1.5px solid ${G.redBorder}`,borderRadius:10,
              padding:"12px 16px",marginBottom:18,fontSize:13.5,color:G.red,
              display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{flexShrink:0}}>⚠️</span> {error}
            </div>
          )}

          <button className="btn" onClick={handleSearch} disabled={loading} style={{
            width:"100%",padding:"16px 20px",borderRadius:12,
            background: loading?"#93b4d4":`linear-gradient(135deg,${G.blue},#2979c8)`,
            color:"#fff",fontSize:15,fontWeight:700,letterSpacing:".04em",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow:loading?"none":"0 4px 18px rgba(26,92,158,.3)",
            cursor:loading?"not-allowed":"pointer"
          }}>
            {loading ? (
              <>
                <div style={{width:17,height:17,border:"2.5px solid rgba(255,255,255,.3)",
                  borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/>
                <span style={{animation:"shimmer 1.5s infinite"}}>{progress}</span>
              </>
            ) : (
              <>
                <span>{isIntelligent?"Run Intelligent Candidate Search":"Run Candidate Search"}</span>
                {isIntelligent && <span style={{fontSize:12,opacity:.7,fontWeight:400}}>· culture fit + success prediction</span>}
                {!isIntelligent && <span style={{fontSize:12,opacity:.5,fontWeight:400}}>· then a few quick questions</span>}
                <span style={{opacity:.55,fontSize:16}}>→</span>
              </>
            )}
          </button>
        </div>

        {phase === "questions" && questions.length > 0 && (
          <div ref={clarifyRef}>
            <ClarifyPanel
              questions={questions}
              answers={answers}
              onChange={(id,val)=>setAnswers(p=>({...p,[id]:val}))}
              onSearch={runActualSearch}
              onSkip={runActualSearch}
              loading={loading && phase==="searching"}
            />
          </div>
        )}

        {results && (
          <div ref={resultsRef} style={{animation:"fadeUp .4s ease"}}>
            {results.company_profile && (
              <div style={{background:`linear-gradient(135deg,${G.blueLight},#f5f8ff)`,
                border:`1.5px solid ${G.blueBorder}`,borderRadius:14,padding:"18px 22px",marginBottom:20}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:20,flexShrink:0}}>🏛️</span>
                  <div>
                    <p style={{fontSize:11,fontWeight:700,color:G.blue,letterSpacing:".12em",textTransform:"uppercase",marginBottom:5}}>
                      Agent's Company Success Profile
                    </p>
                    <p style={{fontSize:13.5,color:"#3a5580",lineHeight:1.65}}>{results.company_profile}</p>
                  </div>
                </div>
              </div>
            )}

            {(results.candidates?.length??0) < 10 && results.pool_suggestions && (
              <PoolSuggestions suggestions={results.pool_suggestions} onRevise={handleRevise} loading={loading} />
            )}

            <ExportBar
              candidates={results.candidates?.sort((a,b)=>b.match_score-a.match_score)??[]}
              searchedAt={searchedAt}
            />

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
              {[
                {val:results.candidates?.length??0,label:"Candidates",sub:"returned",color:G.blue},
                {val:results.total_searched??"—",label:"Profiles",sub:"scanned",color:G.green},
                {val:results.excluded_count??0,label:"Excluded",sub:"by filters",color:G.red},
                {val:results.candidates?.filter(c=>c.match_score>=80).length??0,label:"Strong",sub:"matches 80+",color:G.amber},
              ].map(({val,label,sub,color})=>(
                <div key={label} style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,
                  padding:"16px 18px",boxShadow:"0 2px 8px rgba(0,0,0,.04)",borderTop:`3px solid ${color}`}}>
                  <div style={{fontSize:30,fontWeight:900,color,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{val}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.muted,marginTop:4}}>{label}</div>
                  <div style={{fontSize:10.5,color:G.subtle}}>{sub}</div>
                </div>
              ))}
            </div>

            {results.search_summary && (
              <div style={{background:G.blueLight,border:`1.5px solid ${G.blueBorder}`,borderRadius:10,
                padding:"11px 16px",marginBottom:18,fontSize:13,color:"#1e40af",display:"flex",gap:8}}>
                <span>ℹ️</span> {results.search_summary}
              </div>
            )}

            <div style={{display:"flex",gap:18,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              {[[G.green,"80–100","Strong"],[G.amber,"60–79","Good"],[G.red,"0–59","Partial"]].map(([color,range,label])=>(
                <div key={range} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:G.muted}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:color}}/>
                  <span style={{color,fontWeight:700}}>{range}</span>{label}
                </div>
              ))}
              {hasCompany && (
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#6b82a8"}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:"#2979c8"}}/>Culture ring = company fit
                </div>
              )}
              <span style={{marginLeft:"auto",fontSize:11.5,color:G.subtle,fontStyle:"italic"}}>Click any card to expand</span>
            </div>

            {results.candidates?.sort((a,b)=>b.match_score-a.match_score).map((c,i)=>(
              <CandidateCard key={i} c={c} rank={i+1} showCultureFit={hasCompany} />
            ))}
          </div>
        )}
          </>
        )}

      </div>
    </div>
  );
}
