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

const CLARIFY_PROMPT = `You are a senior recruitment consultant helping to sharpen a LinkedIn candidate search.
Based on the partial search criteria provided, generate 4-6 targeted clarifying questions that would meaningfully improve the search.
Focus on gaps that could significantly affect results: unclear seniority boundaries, ambiguous role scope, missing deal-breakers, compensation expectations, team context, etc.
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
    try {
      const qs = await askClarifyingQuestions(f);
      setQuestions(qs);
      setAnswers({});
      setPhase("questions");
      setLoading(false);
      setTimeout(()=>clarifyRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),150);
    } catch(e) {
      setError(e.message);
      setLoading(false);
    }
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
          <h1 style={{fontFamily
