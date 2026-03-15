import { useState, useRef } from "react";

const API = "/api/claude";

const SYSTEM_PROMPT = `You are TalentRadar, a recruitment agent for Oren Israelson.

SEARCH RULES:
- Use web_search tool. NEVER invent candidates. Every candidate must come from a real search result.
- Run 4-8 searches minimum. Return 10 real candidates.
- LinkedIn X-Ray: site:linkedin.com/in/ "[title]" "[location]"
- Boolean: site:linkedin.com/in/ ("VP Sales" OR "Head of Sales") "Israel"
- Company targeting: site:linkedin.com/in/ "[title]" ("Company1" OR "Company2")
- Job changers: "[title]" "[location]" "new role" OR "joined" site:linkedin.com
- Other sources: site:wellfound.com/u, site:crunchbase.com/person, site:techcrunch.com
- Try 3-4 title variations per search
- If companyUrl given: fetch it first to understand culture

HARD FILTERS (zero exceptions):
- Remove anyone at excludedCompanies
- Remove anyone whose title contains excludedTitles keywords
- Remove anyone at current company less than 1 year
- Only include candidates speaking required languages

SCORING (0-100): Role fit 20 + Skills 20 + Industry 15 + Past companies 10 + Location 10 + Culture fit 25
Hot lead bonus: +5 for recent job change

Return ONLY valid JSON with these fields: company_profile, candidates array with name/title/company/location/linkedin_url/years_experience/current_company_months/match_score/culture_fit_score/success_prediction/lead_temperature/lead_temperature_reason/why_top_match/match_reasons/culture_fit_notes/background_summary/technologies/past_companies/languages/education/red_flags/sources/source_signals, plus total_searched/excluded_count/search_summary/pool_suggestions.`;
Commit ✅ Sonnet 4.6Claude is AI and can make mistakes. Please double-check responses.
const OUTREACH_SYSTEM = `You are TalentRadar, writing LinkedIn outreach for Oren Israelson.

RULES:
- Never say: "I came across your profile", "exciting opportunity", "competitive compensation"
- Open with something specific about their background
- Max 300 chars for connection note, max 5 sentences for InMail
- End with easy yes: "worth a quick chat?"

Return ONLY valid JSON:
{"connection_note":"","inmail":"","why_it_works":""}`;

const TYPO_FIXES = [
  [/\bpytohn\b/gi,"Python"],[/\breakt?\b/gi,"React"],[/\bangualr\b/gi,"Angular"],
  [/\bkuberntes\b/gi,"Kubernetes"],[/\bfintek\b/gi,"FinTech"],
  [/\bisreal\b/gi,"Israel"],[/\btel avive?\b/gi,"Tel Aviv"],
  [/\bmicrosodt\b/gi,"Microsoft"],[/\bnod(e)?\.?js\b/gi,"Node.js"],
];
const fix = str => str ? TYPO_FIXES.reduce((s,[re,v]) => s.replace(re,v), str) : str;

function buildPrompt(c) {
  const p = ["Find top LinkedIn candidates. Run 8-10 real searches. Return 8+ candidates.\n"];
  if (c.companyUrl)         p.push("COMPANY WEBSITE (fetch this): " + c.companyUrl);
  if (c.companyBackground)  p.push("HIRING COMPANY:\n" + c.companyBackground + "\n");
  if (c.sampleProfile)      p.push("SAMPLE PROFILE:\n" + c.sampleProfile + "\n");
  if (c.roleTitle)          p.push("Role: " + fix(c.roleTitle));
  if (c.seniority?.length)  p.push("Seniority: " + (Array.isArray(c.seniority)?c.seniority.join(", "):c.seniority));
  if (c.industry)           p.push("Industry: " + fix(c.industry));
  if (c.country)            p.push("Country: " + fix(c.country));
  if (c.city)               p.push("City: " + fix(c.city));
  if (c.languages)          p.push("Languages: " + fix(c.languages));
  if (c.technologies)       p.push("Skills: " + fix(c.technologies));
  if (c.targetCompanies)    p.push("Target companies: " + fix(c.targetCompanies));
  if (c.pastCompanies)      p.push("Preferred past companies: " + fix(c.pastCompanies));
  if (c.maxExperience)      p.push("Max experience: " + c.maxExperience + " years");
  if (c.excludedCompanies)  p.push("EXCLUDED companies: " + fix(c.excludedCompanies));
  if (c.excludedTitles)     p.push("EXCLUDED titles: " + fix(c.excludedTitles));
  if (c.jobDescription)     p.push("\nJob description:\n" + c.jobDescription);
  p.push("\nReturn ONLY JSON.");
  return p.join("\n");
}

async function callClaude(system, userContent, useSearch = false) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userContent }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("API error " + res.status + ": " + err);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const content = data.content || [];
  const text = content.filter(b => b.type === "text").map(b => b.text).join("");
  const searchCount = content.filter(b => b.type === "tool_use" || b.type === "tool_result").length;
  return { text, searchCount, raw: data };
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Could not parse response. Try again.");
  return JSON.parse(m[0]);
}

async function runSearch(criteria, onProgress) {
  onProgress("Searching LinkedIn & web...");
  const { text, searchCount } = await callClaude(SYSTEM_PROMPT, buildPrompt(criteria), true);
  if (searchCount > 0) onProgress("Ran " + searchCount + " searches, scoring candidates...");
  const result = parseJSON(text);
  onProgress("Found " + (result.candidates?.length ?? 0) + " candidates");
  return result;
}

async function generateOutreach(candidate, criteria) {
  const prompt = "Write LinkedIn outreach for:\nName: " + candidate.name +
    "\nTitle: " + candidate.title + "\nCompany: " + candidate.company +
    "\nBackground: " + candidate.background_summary +
    "\nWhy match: " + candidate.why_top_match +
    "\nRole hiring for: " + (criteria.roleTitle || "") +
    "\nCompany: " + (criteria.companyBackground || "");
  const { text } = await callClaude(OUTREACH_SYSTEM, prompt, false);
  return parseJSON(text);
}

function toCsv(v) {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g,'""') + '"' : s;
}

function downloadCsv(candidates, at) {
  const headers = ["Rank","Name","Match","Culture Fit","Success","Lead Temp","Title","Company",
    "Location","Yrs Exp","Months @ Co","Why Top Match","LinkedIn","Summary",
    "Match Reasons","Technologies","Past Companies","Languages","Education","Red Flags","Searched At"];
  const rows = candidates.map((c,i) => [
    i+1, c.name, c.match_score, c.culture_fit_score??"", c.success_prediction??"",
    c.lead_temperature??"", c.title, c.company, c.location,
    c.years_experience??"", c.current_company_months??"",
    c.why_top_match??"", c.linkedin_url??"", c.background_summary??"",
    (c.match_reasons??[]).join("; "), (c.technologies??[]).join("; "),
    (c.past_companies??[]).join("; "), (c.languages??[]).join("; "),
    c.education??"", (c.red_flags??[]).join("; "), at
  ].map(toCsv));
  const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})),
    download: "talentradar-" + Date.now() + ".csv"
  });
  a.click();
}

async function copyTsv(candidates) {
  const h = ["Rank","Name","Match","Culture","Success","Temp","Title","Company","Location",
    "Yrs","Months","Why Match","LinkedIn","Summary","Reasons","Technologies","Past Companies","Languages","Education"];
  const rows = candidates.map((c,i) => [
    i+1, c.name, c.match_score, c.culture_fit_score??"", c.success_prediction??"",
    c.lead_temperature??"", c.title, c.company, c.location,
    c.years_experience??"", c.current_company_months??"",
    c.why_top_match??"", c.linkedin_url??"", c.background_summary??"",
    (c.match_reasons??[]).join(" | "), (c.technologies??[]).join(", "),
    (c.past_companies??[]).join(", "), (c.languages??[]).join(", "), c.education??""
  ]);
  await navigator.clipboard.writeText(
    [h,...rows].map(r=>r.map(v=>String(v??"").replace(/\t/g," ")).join("\t")).join("\n")
  );
}

// Design tokens
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

const Label = ({children,color=G.muted}) => (
  <p style={{fontSize:10.5,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",marginBottom:4,color}}>{children}</p>
);
const Hint = ({children}) => (
  <p style={{fontSize:11.5,color:G.subtle,marginBottom:6,lineHeight:1.45}}>{children}</p>
);
const inputBase = (extra={}) => ({
  width:"100%",borderRadius:10,padding:"11px 14px",fontSize:13.5,
  color:G.text,fontFamily:"'DM Sans',sans-serif",transition:"border-color .2s",
  border:"1.5px solid " + G.border,background:"#faf9f7",...extra
});

const TextField = ({label,hint,value,onChange,placeholder,textarea,rows=3,type="text",accent,danger}) => {
  const bg = danger?"#fff8f8":accent?accent+"08":"#faf9f7";
  const border = danger?G.redBorder:accent?accent+"55":G.border;
  return (
    <div style={{flex:"1 1 100%"}}>
      <Label color={danger?G.red:accent||G.muted}>{label}</Label>
      {hint && <Hint>{hint}</Hint>}
      {textarea
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
            style={{...inputBase({background:bg,border:"1.5px solid "+border,lineHeight:1.65,resize:"vertical"}),width:"100%"}}/>
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={inputBase({background:bg,border:"1.5px solid "+border})}/>}
    </div>
  );
};

const HalfField = (props) => (
  <div style={{flex:"1 1 calc(50% - 8px)",minWidth:180}}>
    <TextField {...props}/>
  </div>
);

const ChipGroup = ({label,hint,options,value,onChange,multi=false}) => {
  const arr = multi?(Array.isArray(value)?value:(value?[value]:[])):null;
  const isActive = opt => multi?arr.includes(opt):value===opt;
  const toggle = opt => {
    if (multi) { onChange(arr.includes(opt)?arr.filter(x=>x!==opt):[...arr,opt]); }
    else { onChange(value===opt?"":opt); }
  };
  return (
    <div style={{flex:"1 1 100%"}}>
      <Label>{label}{multi&&<span style={{fontWeight:400,color:G.subtle,fontSize:11,marginLeft:6}}>(multiple)</span>}</Label>
      {hint&&<Hint>{hint}</Hint>}
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {options.map(opt=>{
          const active=isActive(opt);
          return (
            <button key={opt} className="chip" onClick={()=>toggle(opt)}
              style={{background:active?G.blue:"#f5f3ef",color:active?"#fff":G.muted,
                borderColor:active?G.blue:G.border,boxShadow:active?"0 2px 8px rgba(26,92,158,.2)":"none"}}>
              {active&&<span style={{marginRight:4,fontSize:10}}>checkmark</span>}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Divider = ({icon,label}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 22px"}}>
    <div style={{width:30,height:30,borderRadius:8,background:"#f5f3ef",border:"1px solid "+G.border,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{icon}</div>
    <span style={{fontSize:10.5,fontWeight:700,color:G.subtle,letterSpacing:".14em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>
    <div style={{flex:1,height:1,background:G.border}}/>
  </div>
);

const ScoreRing = ({score,size=56,label}) => {
  const color = score>=80?G.green:score>=60?G.amber:G.red;
  const r=(size/2)-5,circ=2*Math.PI*r,dash=(score/100)*circ;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ede9e3" strokeWidth="4"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={dash+" "+(circ-dash)} strokeLinecap="round"/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:size>50?14:11,fontWeight:900,color}}>{score}</span>
        </div>
      </div>
      {label&&<span style={{fontSize:9,fontWeight:700,color:G.subtle,letterSpacing:".1em",textTransform:"uppercase"}}>{label}</span>}
    </div>
  );
};

const PredBadge = ({val}) => {
  const map={High:[G.greenLight,G.green,"High success"],Medium:[G.amberLight,G.amber,"Medium success"],Low:[G.redLight,G.red,"Low success"]};
  const [bg,color,text]=map[val]??map.Medium;
  return <span className="chip" style={{background:bg,color,borderColor:"transparent",cursor:"default"}}>{text}</span>;
};

const Tag = ({label,color=G.blue}) => (
  <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
    letterSpacing:".04em",background:color+"12",color,border:"1px solid "+color+"30"}}>{label}</span>
);

const OutreachModal = ({candidate,criteria,onClose}) => {
  const [loading,setLoading] = useState(false);
  const [result,setResult] = useState(null);
  const [error,setError] = useState("");
  const [copied,setCopied] = useState("");
  const generate = async () => {
    setLoading(true); setError("");
    try { setResult(await generateOutreach(candidate,criteria)); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };
  const copy = async (text,key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(()=>setCopied(""),2000);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:20,padding:"32px 36px",maxWidth:600,width:"100%",
        boxShadow:"0 20px 60px rgba(0,0,0,.2)",animation:"fadeUp .25s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700}}>
              Outreach for {candidate.name}
            </h2>
            <p style={{fontSize:13,color:G.muted,marginTop:3}}>{candidate.title} at {candidate.company}</p>
          </div>
          <button className="btn" onClick={onClose}
            style={{background:"#f5f3ef",border:"1px solid "+G.border,borderRadius:8,padding:"6px 12px",fontSize:13,color:G.muted}}>X</button>
        </div>
        {!result&&!loading&&(
          <button className="btn" onClick={generate}
            style={{width:"100%",padding:"14px",borderRadius:12,
              background:"linear-gradient(135deg,"+G.blue+",#2979c8)",
              color:"#fff",fontSize:14,fontWeight:700,boxShadow:"0 4px 18px rgba(26,92,158,.3)"}}>
            Generate Outreach Message
          </button>
        )}
        {loading&&(
          <div style={{textAlign:"center",padding:"30px",color:G.muted}}>
            <div style={{width:24,height:24,border:"3px solid "+G.border,borderTopColor:G.blue,
              borderRadius:"50%",animation:"spin .75s linear infinite",margin:"0 auto 12px"}}/>
            Writing personalized message...
          </div>
        )}
        {error&&<div style={{background:G.redLight,border:"1px solid "+G.redBorder,borderRadius:10,padding:"12px 16px",fontSize:13,color:G.red}}>{error}</div>}
        {result&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:G.blueLight,border:"1.5px solid "+G.blueBorder,borderRadius:12,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Label color={G.blue}>Connection Note (max 300 chars)</Label>
                <button className="btn" onClick={()=>copy(result.connection_note,"note")}
                  style={{background:copied==="note"?G.greenLight:G.blueLight,color:copied==="note"?G.green:G.blue,
                    border:"1px solid "+(copied==="note"?G.greenBorder:G.blueBorder),borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700}}>
                  {copied==="note"?"Copied!":"Copy"}
                </button>
              </div>
              <p style={{fontSize:13.5,color:"#333",lineHeight:1.65}}>{result.connection_note}</p>
              <p style={{fontSize:11,color:G.subtle,marginTop:6}}>{result.connection_note?.length} chars</p>
            </div>
            <div style={{background:"#f8f9fc",border:"1.5px solid "+G.border,borderRadius:12,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Label>InMail</Label>
                <button className="btn" onClick={()=>copy(result.inmail,"inmail")}
                  style={{background:copied==="inmail"?G.greenLight:"#f5f3ef",color:copied==="inmail"?G.green:G.muted,
                    border:"1px solid "+(copied==="inmail"?G.greenBorder:G.border),borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700}}>
                  {copied==="inmail"?"Copied!":"Copy"}
                </button>
              </div>
              <p style={{fontSize:13.5,color:"#333",lineHeight:1.65}}>{result.inmail}</p>
            </div>
            {result.why_it_works&&(
              <div style={{background:G.amberLight,border:"1px solid "+G.amberBorder,borderRadius:10,
                padding:"12px 16px",fontSize:12.5,color:"#92400e"}}>
                <strong>Why it works:</strong> {result.why_it_works}
              </div>
            )}
            <button className="btn" onClick={generate}
              style={{padding:"10px",borderRadius:10,background:"#f5f3ef",color:G.muted,fontSize:13,fontWeight:600,border:"1px solid "+G.border}}>
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const CandidateCard = ({c,rank,showCultureFit,criteria}) => {
  const [open,setOpen] = useState(false);
  const [showOutreach,setShowOutreach] = useState(false);
  const tier = c.match_score>=80
    ? {accent:G.green,pill:G.greenLight,pillText:"#15803d",label:"Strong Match"}
    : c.match_score>=60
    ? {accent:G.amber,pill:G.amberLight,pillText:"#92400e",label:"Good Match"}
    : {accent:G.red,pill:G.redLight,pillText:"#991b1b",label:"Partial"};
  const tenure=c.current_company_months;
  const tenureStr=tenure>=12?Math.floor(tenure/12)+"yr"+(Math.floor(tenure/12)>1?"s":""):tenure>0?tenure+"mo":null;
  return (
    <>
      {showOutreach&&<OutreachModal candidate={c} criteria={criteria} onClose={()=>setShowOutreach(false)}/>}
      <div className="lift" style={{background:G.surface,
        border:"1.5px solid "+(open?G.border+"88":"#ece8e1"),
        borderLeft:"4px solid "+tier.accent,borderRadius:14,
        padding:"18px 22px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,.045)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:"#f5f3ef",
            border:"1.5px solid "+G.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:900,color:G.subtle}}>#{rank}</span>
          </div>
          <ScoreRing score={c.match_score} label="Match"/>
          {showCultureFit&&c.culture_fit_score>0&&<ScoreRing score={c.culture_fit_score} size={46} label="Culture"/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:7,marginBottom:4}}>
              <h3 style={{fontSize:17,fontWeight:700,color:G.text,fontFamily:"'Cormorant Garamond',serif"}}>{c.name}</h3>
              <span className="chip" style={{background:tier.pill,color:tier.pillText,borderColor:"transparent",cursor:"default"}}>{tier.label}</span>
              {c.success_prediction&&<PredBadge val={c.success_prediction}/>}
              {c.lead_temperature==="Hot"&&<span className="chip" style={{background:"#fff7ed",color:"#c2410c",borderColor:"#fed7aa",cursor:"default"}}>Hot Lead</span>}
              {c.lead_temperature==="Warm"&&<span className="chip" style={{background:"#fefce8",color:"#a16207",borderColor:"#fde68a",cursor:"default"}}>Warm</span>}
              {c.years_experience>0&&<Tag label={c.years_experience+" yrs"} color={G.blue}/>}
              {tenureStr&&<Tag label={tenureStr+" @ current"} color={G.green}/>}
              {c.linkedin_url&&
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                  style={{background:"#0077b5",color:"#fff",borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                  LinkedIn
                </a>}
              <button className="btn" onClick={e=>{e.stopPropagation();setShowOutreach(true);}}
                style={{background:G.purpleLight,color:G.purple,border:"1px solid "+G.purpleBorder,
                  borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700}}>
                Outreach
              </button>
            </div>
            <p style={{fontSize:13.5,color:"#555"}}>
              <strong style={{color:"#333"}}>{c.title}</strong>
              {c.company&&<> at {c.company}</>}
              {c.location&&<span style={{color:G.subtle,marginLeft:8}}>{c.location}</span>}
            </p>
            {c.why_top_match&&(
              <p style={{fontSize:12.5,color:"#5a7ab5",marginTop:6,display:"flex",gap:6,lineHeight:1.5}}>
                <span style={{flexShrink:0}}>*</span><span>{c.why_top_match}</span>
              </p>
            )}
            {c.lead_temperature_reason&&(
              <p style={{fontSize:11.5,color:"#c2410c",marginTop:4}}>{c.lead_temperature_reason}</p>
            )}
          </div>
          <div className="arrow" onClick={()=>setOpen(o=>!o)}
            style={{fontSize:18,color:G.subtle,transform:open?"rotate(180deg)":"none",flexShrink:0,cursor:"pointer",padding:"4px 8px"}}>v</div>
        </div>
        {open&&(
          <div style={{marginTop:20,paddingTop:20,borderTop:"1.5px solid #f0ece5",animation:"fadeUp .2s ease"}}>
            {c.background_summary&&(
              <p style={{fontSize:13.5,color:"#555",lineHeight:1.7,marginBottom:18,padding:"12px 16px",
                background:"#faf9f7",borderRadius:9,borderLeft:"3px solid #ddd8d0",fontStyle:"italic"}}>
                "{c.background_summary}"
              </p>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:16}}>
              <div>
                <Label>Why they match</Label>
                {c.match_reasons?.map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
                    <span style={{color:G.green,fontSize:13,flexShrink:0}}>+</span>
                    <span style={{fontSize:13,color:"#444",lineHeight:1.55}}>{r}</span>
                  </div>
                ))}
              </div>
              <div>
                {c.culture_fit_notes&&(
                  <div style={{marginBottom:14}}>
                    <Label>Culture fit</Label>
                    <p style={{fontSize:13,color:"#555",lineHeight:1.6,padding:"10px 12px",
                      background:G.blueLight,borderRadius:8,borderLeft:"3px solid "+G.blueBorder}}>
                      {c.culture_fit_notes}
                    </p>
                  </div>
                )}
                {c.past_companies?.length>0&&(
                  <div style={{marginBottom:12}}>
                    <Label>Past companies</Label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {c.past_companies.map((co,i)=><Tag key={i} label={co} color={G.muted}/>)}
                    </div>
                  </div>
                )}
                {c.education&&<><Label>Education</Label><p style={{fontSize:12,color:"#666"}}>{c.education}</p></>}
                {c.red_flags?.length>0&&(
                  <div style={{marginTop:8}}>
                    <Label>Notes</Label>
                    {c.red_flags.map((f,i)=>(
                      <div key={i} style={{display:"flex",gap:7,marginBottom:5}}>
                        <span style={{color:G.amber,fontSize:12}}>!</span>
                        <span style={{fontSize:12,color:G.muted,lineHeight:1.5}}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {c.technologies?.length>0&&(
              <div>
                <Label>Technologies</Label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {c.technologies.map((t,i)=><Tag key={i} label={t} color={G.blue}/>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

const ExportBar = ({candidates,searchedAt}) => {
  const [copied,setCopied] = useState(false);
  const handleCopy = async () => { await copyTsv(candidates); setCopied(true); setTimeout(()=>setCopied(false),2500); };
  return (
    <div style={{background:G.surface,border:"1.5px solid "+G.border,borderRadius:14,
      padding:"14px 20px",marginBottom:20,display:"flex",alignItems:"center",
      justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <span style={{fontSize:18}}>Export</span>
        <p style={{fontSize:11,color:G.subtle}}>{candidates.length} candidates - {searchedAt}</p>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn" onClick={()=>downloadCsv(candidates,searchedAt)}
          style={{background:G.greenLight,color:G.green,borderRadius:9,padding:"8px 14px",
            fontSize:12.5,fontWeight:700,border:"1.5px solid "+G.greenBorder}}>
          Download CSV
        </button>
        <button className="btn" onClick={handleCopy}
          style={{background:copied?G.greenLight:G.amberLight,color:copied?G.green:G.amber,
            borderRadius:9,padding:"8px 14px",fontSize:12.5,fontWeight:700,
            border:"1.5px solid "+(copied?G.greenBorder:G.amberBorder)}}>
          {copied?"Copied!":"Copy for Google Sheets"}
        </button>
        <a href="https://sheets.new" target="_blank" rel="noopener noreferrer"
          style={{background:G.blueLight,color:G.blue,borderRadius:9,padding:"8px 14px",
            fontSize:12.5,fontWeight:700,textDecoration:"none",border:"1.5px solid "+G.blueBorder}}>
          Open Google Sheets
        </a>
      </div>
    </div>
  );
};

const PoolSuggestions = ({suggestions,onRevise,loading}) => {
  const allItems = [
    ...(suggestions?.remove||[]).map(s=>({type:"remove",text:s})),
    ...(suggestions?.include||[]).map(s=>({type:"include",text:s})),
  ];
  const [votes,setVotes] = useState(()=>Object.fromEntries(allItems.map((_,i)=>[i,null])));
  if (allItems.length===0) return null;
  const accepted=allItems.filter((_,i)=>votes[i]==="go");
  const toggle=(i,val)=>setVotes(p=>({...p,[i]:p[i]===val?null:val}));
  return (
    <div style={{background:"#fffbf0",border:"1.5px solid "+G.amberBorder,borderRadius:16,padding:"22px 26px",marginBottom:22}}>
      <p style={{fontSize:14,fontWeight:700,color:G.amber,marginBottom:8}}>Fewer than 10 candidates found</p>
      <p style={{fontSize:12.5,color:"#92400e",marginBottom:16}}>Mark suggestions Go or No to run a revised search.</p>
      {allItems.map((item,i)=>{
        const vote=votes[i];
        return (
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",
            borderRadius:11,marginBottom:8,background:vote==="go"?"#f0fdf4":vote==="no"?"#f8f8f8":G.surface,
            border:"1.5px solid "+(vote==="go"?G.greenBorder:G.border)}}>
            <span style={{flex:1,fontSize:13,color:"#44403c",lineHeight:1.6}}>{item.text}</span>
            <div style={{display:"flex",gap:6}}>
              <button className="btn" onClick={()=>toggle(i,"go")}
                style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                  background:vote==="go"?G.green:"transparent",color:vote==="go"?"#fff":G.green,
                  border:"1.5px solid "+G.green}}>Go</button>
              <button className="btn" onClick={()=>toggle(i,"no")}
                style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                  background:vote==="no"?"#6b7280":"transparent",color:vote==="no"?"#fff":G.muted,
                  border:"1.5px solid "+G.border}}>No</button>
            </div>
          </div>
        );
      })}
      {accepted.length>0&&(
        <div style={{paddingTop:16,display:"flex",justifyContent:"flex-end"}}>
          <button className="btn" onClick={()=>onRevise(accepted)} disabled={loading}
            style={{padding:"11px 22px",borderRadius:11,
              background:loading?"#ccc":"linear-gradient(135deg,"+G.amber+",#d97706)",
              color:"#fff",fontSize:13.5,fontWeight:700}}>
            {loading?"Searching...":"Run Revised Search"}
          </button>
        </div>
      )}
    </div>
  );
};

const EMPTY = {
  companyBackground:"",companyUrl:"",sampleProfile:"",
  roleTitle:"",seniority:[],industry:"",
  country:"",city:"",languages:"",
  technologies:"",targetCompanies:"",pastCompanies:"",
  maxExperience:"",excludedCompanies:"",excludedTitles:"",
  jobDescription:""
};

export default function App() {
  const [f,setF] = useState(EMPTY);
  const set = k => v => setF(p=>({...p,[k]:v}));
  const [loading,setLoading] = useState(false);
  const [progress,setProgress] = useState("");
  const [results,setResults] = useState(null);
  const [searchedAt,setSearchedAt] = useState("");
  const [error,setError] = useState("");
  const resultsRef = useRef(null);
  const hasCompany = f.companyBackground.trim().length>10||f.companyUrl.trim().length>5;

  const handleSearch = async () => {
    if (!f.roleTitle&&!f.industry&&!f.jobDescription&&!f.sampleProfile) {
      setError("Fill in at least a Role Title, Industry, Job Description, or Sample Profile.");
      return;
    }
    setError(""); setLoading(true); setResults(null);
    try {
      const data = await runSearch(f,setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString());
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setProgress(""); }
  };

  const handleRevise = async (acceptedSuggestions) => {
    const instructions = acceptedSuggestions.map(s=>(s.type==="remove"?"LOOSEN: ":"ADD: ")+s.text).join("\n");
    setLoading(true); setResults(null); setProgress("Applying suggestions...");
    try {
      const revised = {...f,jobDescription:(f.jobDescription+"\n\nREVISED: apply these changes:\n"+instructions).trim()};
      const data = await runSearch(revised,setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString()+" (revised)");
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setProgress(""); }
  };

  return (
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"'DM Sans',sans-serif",color:G.text}}>
      <style>{css}</style>
      <nav style={{background:G.surface,borderBottom:"1px solid "+G.border,padding:"0 28px",height:56,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 12px rgba(0,0,0,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:34,height:34,background:"linear-gradient(135deg,"+G.blue+",#2979c8)",
            borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:16}}>TR</span>
          </div>
          <div>
            <span style={{fontWeight:700,fontSize:15.5}}>TalentRadar</span>
            <span style={{fontSize:11,color:G.subtle,marginLeft:8}}>by Oren Israelson</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:G.green,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:10.5,color:G.subtle,fontWeight:600}}>Live - Claude AI</span>
        </div>
      </nav>

      <div style={{maxWidth:860,margin:"0 auto",padding:"44px 20px 90px"}}>
        <div style={{marginBottom:40}}>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:46,fontWeight:700,lineHeight:1.05,marginBottom:14}}>
            Find Your Next<br/><span style={{color:G.blue}}>Top Candidate.</span>
          </h1>
          <p style={{color:G.muted,fontSize:14.5,maxWidth:520,lineHeight:1.7}}>
            X-Ray search across LinkedIn, Wellfound, Crunchbase and more. Real candidates, ranked by fit and culture match.
          </p>
        </div>

        <div style={{background:G.surface,borderRadius:20,border:"1.5px solid "+G.border,
          padding:"34px 36px",marginBottom:28,boxShadow:"0 4px 28px rgba(0,0,0,.06)"}}>

          <Divider icon="🏛" label="Hiring Company"/>
          <div style={{background:"linear-gradient(135deg,"+G.blueLight+",#f8faff)",
            border:"1.5px solid "+G.blueBorder,borderRadius:14,padding:"18px 20px",marginBottom:28}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
              <HalfField label="Company Website URL" hint="Agent fetches and reads it automatically"
                value={f.companyUrl} onChange={set("companyUrl")}
                placeholder="https://www.yourcompany.com" accent={G.blue}/>
              <div style={{flex:"1 1 100%"}}>
                <Label color={G.blue}>About Your Company</Label>
                <Hint>Stage, culture, tech stack, values, team size</Hint>
                <textarea value={f.companyBackground} onChange={e=>set("companyBackground")(e.target.value)}
                  rows={3} placeholder="e.g. Series B CyberSecurity startup, 60 people, flat culture, value ownership and startup experience"
                  style={{...inputBase({background:"#f5f8ff",border:"1.5px solid "+G.blueBorder,lineHeight:1.65,resize:"vertical"}),width:"100%"}}/>
              </div>
            </div>
          </div>

          <Divider icon="💼" label="Role"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Job Title" value={f.roleTitle} onChange={set("roleTitle")}
              placeholder="e.g. VP Sales, Senior Backend Engineer, Head of Product"/>
            <ChipGroup label="Seniority" value={f.seniority} onChange={set("seniority")}
              options={["Junior","Mid","Senior","Lead","Manager","Director","VP","C-Level"]} multi/>
          </div>

          <Divider icon="📍" label="Location"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Country" value={f.country} onChange={set("country")} placeholder="e.g. Israel, Germany, USA"/>
            <HalfField label="City" value={f.city} onChange={set("city")} placeholder="e.g. Tel Aviv, Berlin, New York"/>
          </div>

          <Divider icon="🎓" label="Candidate Profile"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Required Languages" value={f.languages} onChange={set("languages")} placeholder="e.g. English, Hebrew"/>
            <HalfField label="Skills & Technologies" value={f.technologies} onChange={set("technologies")} placeholder="e.g. React, Python, B2B SaaS sales"/>
            <HalfField label="Max Years Experience" type="number" value={f.maxExperience} onChange={set("maxExperience")} placeholder="e.g. 10"/>
          </div>

          <Divider icon="🏢" label="Company Filters"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <TextField label="Target Companies" hint="Agent prioritizes these"
              value={f.targetCompanies} onChange={set("targetCompanies")} placeholder="e.g. Check Point, CrowdStrike, Wiz"/>
            <TextField label="Preferred Past Companies" hint="Boosts score"
              value={f.pastCompanies} onChange={set("pastCompanies")} placeholder="e.g. Unit 8200, Google, McKinsey"/>
            <TextField danger label="Excluded Companies" hint="Hard filter"
              value={f.excludedCompanies} onChange={set("excludedCompanies")} placeholder="e.g. Competitor A, Competitor B"/>
            <TextField danger label="Excluded Titles" hint="Hard filter - remove anyone with these title keywords"
              value={f.excludedTitles} onChange={set("excludedTitles")} placeholder="e.g. VP, Director, Founder"/>
          </div>

          <Divider icon="👤" label="Sample Profile"/>
          <div style={{marginBottom:28}}>
            <div style={{background:G.purpleLight,border:"1.5px solid "+G.purpleBorder,borderRadius:14,padding:"18px 20px"}}>
              <Hint>Paste a LinkedIn URL, profile text, or describe your ideal candidate</Hint>
              <TextField value={f.sampleProfile} onChange={set("sampleProfile")} textarea rows={3}
                placeholder="https://linkedin.com/in/example  OR  Senior Engineer at Stripe, ex-Google, 8 yrs, payments"
                accent={G.purple}/>
            </div>
          </div>

          <Divider icon="📋" label="Job Description"/>
          <div style={{marginBottom:28}}>
            <TextField textarea rows={5} label="Full Job Description"
              hint="The richer the description, the smarter the match"
              value={f.jobDescription} onChange={set("jobDescription")}
              placeholder="Paste full JD here..."/>
          </div>

          {error&&(
            <div style={{background:G.redLight,border:"1.5px solid "+G.redBorder,borderRadius:10,
              padding:"12px 16px",marginBottom:18,fontSize:13.5,color:G.red,display:"flex",gap:8}}>
              <span>!</span> {error}
            </div>
          )}

          <button className="btn" onClick={handleSearch} disabled={loading} style={{
            width:"100%",padding:"16px 20px",borderRadius:12,
            background:loading?"#93b4d4":"linear-gradient(135deg,"+G.blue+",#2979c8)",
            color:"#fff",fontSize:15,fontWeight:700,
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow:loading?"none":"0 4px 18px rgba(26,92,158,.3)",
            cursor:loading?"not-allowed":"pointer"
          }}>
            {loading?(
              <>
                <div style={{width:17,height:17,border:"2.5px solid rgba(255,255,255,.3)",
                  borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/>
                <span>{progress||"Searching..."}</span>
              </>
            ):(
              <span>{hasCompany?"Run Intelligent Search":"Run Candidate Search"}</span>
            )}
          </button>
        </div>

        {results&&(
          <div ref={resultsRef} style={{animation:"fadeUp .4s ease"}}>
            {results.company_profile&&(
              <div style={{background:"linear-gradient(135deg,"+G.blueLight+",#f5f8ff)",
                border:"1.5px solid "+G.blueBorder,borderRadius:14,padding:"18px 22px",marginBottom:20}}>
                <p style={{fontSize:11,fontWeight:700,color:G.blue,letterSpacing:".12em",textTransform:"uppercase",marginBottom:5}}>Company Success Profile</p>
                <p style={{fontSize:13.5,color:"#3a5580",lineHeight:1.65}}>{results.company_profile}</p>
              </div>
            )}
            {(results.candidates?.length??0)<10&&results.pool_suggestions&&(
              <PoolSuggestions suggestions={results.pool_suggestions} onRevise={handleRevise} loading={loading}/>
            )}
            <ExportBar candidates={results.candidates?.sort((a,b)=>b.match_score-a.match_score)??[]} searchedAt={searchedAt}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
              {[
                {val:results.candidates?.length??0,label:"Candidates",color:G.blue},
                {val:results.total_searched??"?",label:"Searched",color:G.green},
                {val:results.excluded_count??0,label:"Excluded",color:G.red},
                {val:results.candidates?.filter(c=>c.match_score>=80).length??0,label:"Strong 80+",color:G.amber},
              ].map(({val,label,color})=>(
                <div key={label} style={{background:G.surface,border:"1.5px solid "+G.border,borderRadius:14,
                  padding:"16px 18px",borderTop:"3px solid "+color}}>
                  <div style={{fontSize:30,fontWeight:900,color,fontFamily:"'Cormorant Garamond',serif"}}>{val}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.muted,marginTop:4}}>{label}</div>
                </div>
              ))}
            </div>
            {results.search_summary&&(
              <div style={{background:G.blueLight,border:"1.5px solid "+G.blueBorder,borderRadius:10,
                padding:"11px 16px",marginBottom:18,fontSize:13,color:"#1e40af"}}>
                {results.search_summary}
              </div>
            )}
            <p style={{fontSize:11.5,color:G.subtle,marginBottom:14,textAlign:"right",fontStyle:"italic"}}>Click card to expand - Outreach button to generate message</p>
            {results.candidates?.sort((a,b)=>b.match_score-a.match_score).map((c,i)=>(
              <CandidateCard key={i} c={c} rank={i+1} showCultureFit={hasCompany} criteria={f}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
      "current_company_months": 18,
      "match_score": 88,
      "culture_fit_score": 82,
      "success_prediction": "High",
      "why_top_match": "1 punchy sentence with the 2-3 decisive factors",
      "match_reasons": ["Reason 1", "Reason 2", "Reason 3"],
      "culture_fit_notes": "Why this person thrives at this company",
      "background_summary": "1-2 sentence professional summary",
      "technologies": ["React", "Node.js"],
      "past_companies": ["Company A", "Company B"],
      "languages": ["English", "Hebrew"],
      "education": "Degree, University",
      "lead_temperature": "Hot",
      "lead_temperature_reason": "Recently changed jobs — new VP Sales at Wiz since Jan 2026",
      "red_flags": [],
      "sources": {
        "github_url": null,
        "wellfound_url": null,
        "crunchbase_url": null,
        "other_url": null
      },
      "source_signals": []
    }
  ],
  "total_searched": 18,
  "excluded_count": 2,
  "search_summary": "What was searched and corrections made",
  "pool_suggestions": {
    "include": [],
    "remove": []
  }
}`;

const OUTREACH_SYSTEM = `You are an expert at writing LinkedIn outreach messages for passive candidates.

PHILOSOPHY:
Passive candidates are NOT looking. They need to feel:
1. SEEN — you noticed them specifically, not just their title
2. INTRIGUED — something about this role is genuinely exciting
3. LOW-PRESSURE — this is a conversation, not a job application

NEVER use: "I came across your profile", "exciting opportunity", "competitive compensation", "hope this finds you well"

RULES:
- Open with something specific about their background
- Make the role sound like a next chapter, not a lateral move
- End with an easy yes: "worth a quick chat?" or "curious to hear your take?"
- Short sentences, active verbs, zero corporate fluff
- No emojis unless company culture calls for it
- Connection note: max 300 characters
- InMail: max 5 sentences

OUTPUT: Return ONLY valid JSON:
{
  "connection_note": "Short message under 300 chars",
  "inmail": "Longer message up to 5 sentences",
  "why_it_works": "1-2 lines explaining the hook used"
}`;

const TYPO_FIXES = [
  [/\bpytohn\b/gi,"Python"],[/\breakt?\b/gi,"React"],[/\bangualr\b/gi,"Angular"],
  [/\bkuberntes\b/gi,"Kubernetes"],[/\bfintek\b/gi,"FinTech"],
  [/\bisreal\b/gi,"Israel"],[/\btel avive?\b/gi,"Tel Aviv"],
  [/\bmicrosodt\b/gi,"Microsoft"],[/\bnod(e)?\.?js\b/gi,"Node.js"],
];
const fix = str => str ? TYPO_FIXES.reduce((s,[re,v]) => s.replace(re,v), str) : str;

function buildPrompt(c) {
  const p = ["Find top LinkedIn candidates using X-Ray Google search. Run at least 10-15 searches. Return minimum 8 real candidates.\n"];
  if (c.companyUrl)         p.push(`COMPANY WEBSITE (fetch this): ${c.companyUrl}`);
  if (c.companyBackground)  p.push(`HIRING COMPANY:\n${c.companyBackground}\n`);
  if (c.sampleProfile)      p.push(`SAMPLE PROFILE TEMPLATE:\n${c.sampleProfile}\n`);
  if (c.roleTitle)          p.push(`Role: ${fix(c.roleTitle)}`);
  if (c.seniority?.length)  p.push(`Seniority: ${Array.isArray(c.seniority)?c.seniority.join(", "):c.seniority}`);
  if (c.industry)           p.push(`Industry: ${fix(c.industry)}`);
  if (c.country)            p.push(`Country: ${fix(c.country)}`);
  if (c.city)               p.push(`City: ${fix(c.city)}`);
  if (c.languages)          p.push(`Required languages: ${fix(c.languages)}`);
  if (c.technologies)       p.push(`Skills/Technologies: ${fix(c.technologies)}`);
  if (c.targetCompanies)    p.push(`Target companies: ${fix(c.targetCompanies)}`);
  if (c.pastCompanies)      p.push(`Preferred past companies: ${fix(c.pastCompanies)}`);
  if (c.maxExperience)      p.push(`Max experience: ${c.maxExperience} years`);
  if (c.excludedCompanies)  p.push(`EXCLUDED companies (hard filter): ${fix(c.excludedCompanies)}`);
  if (c.excludedTitles)     p.push(`EXCLUDED titles (hard filter): ${fix(c.excludedTitles)}`);
  if (c.jobDescription)     p.push(`\nJob description:\n${c.jobDescription}`);
  p.push("\nReturn ONLY the JSON. No markdown, no explanation.");
  return p.join("\n");
}

async function callClaude(system, userContent, useSearch = false) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: userContent }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  // Extract text from Anthropic response
  const content = data.content || [];
  const text = content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  const searchCount = content.filter(b =>
    b.type === "tool_use" || b.type === "tool_result"
  ).length;

  return { text, searchCount, raw: data };
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Could not parse response. Try again.");
  return JSON.parse(m[0]);
}

async function runSearch(criteria, onProgress) {
  onProgress("🔍 Starting X-Ray search across LinkedIn & web...");
  const { text, searchCount } = await callClaude(
    SYSTEM_PROMPT,
    buildPrompt(criteria),
    true
  );
  if (searchCount > 0) {
    onProgress(`✓ Ran ${searchCount} searches · scoring candidates...`);
  }
  const result = parseJSON(text);
  onProgress(`✓ Found ${result.candidates?.length ?? 0} candidates`);
  return result;
}

async function generateOutreach(candidate, criteria) {
  const prompt = `Generate a LinkedIn outreach message for this candidate:

CANDIDATE:
Name: ${candidate.name}
Title: ${candidate.title}
Company: ${candidate.company}
Background: ${candidate.background_summary}
Why they match: ${candidate.why_top_match}
Past companies: ${(candidate.past_companies||[]).join(", ")}

ROLE WE'RE HIRING FOR:
${criteria.roleTitle || ""}
${criteria.companyBackground || ""}
${criteria.jobDescription ? `Job description: ${criteria.jobDescription.slice(0,300)}` : ""}

Write a punchy, specific outreach message.`;

  const { text } = await callClaude(OUTREACH_SYSTEM, prompt, false);
  return parseJSON(text);
}

function toCsv(v) {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g,'""')}"` : s;
}

function downloadCsv(candidates, at) {
  const headers = ["Rank","Name","Match","Culture Fit","Success","Title","Company","Location",
    "Yrs Exp","Months @ Co","Why Top Match","LinkedIn","Summary","Match Reasons",
    "Culture Notes","Technologies","Past Companies","Languages","Education","Red Flags","Searched At"];
  const rows = candidates.map((c,i) => [
    i+1, c.name, c.match_score, c.culture_fit_score??"", c.success_prediction??"",
    c.title, c.company, c.location, c.years_experience??"", c.current_company_months??"",
    c.why_top_match??"", c.linkedin_url??"", c.background_summary??"",
    (c.match_reasons??[]).join("; "), c.culture_fit_notes??"",
    (c.technologies??[]).join("; "), (c.past_companies??[]).join("; "),
    (c.languages??[]).join("; "), c.education??"", (c.red_flags??[]).join("; "), at
  ].map(toCsv));
  const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})),
    download: `talentradar-${Date.now()}.csv`
  });
  a.click();
}

async function copyTsv(candidates) {
  const h = ["Rank","Name","Match","Culture","Success","Title","Company","Location",
    "Yrs","Months","Why Match","LinkedIn","Summary","Reasons","Technologies","Past Companies","Languages","Education"];
  const rows = candidates.map((c,i) => [
    i+1, c.name, c.match_score, c.culture_fit_score??"", c.success_prediction??"",
    c.title, c.company, c.location, c.years_experience??"", c.current_company_months??"",
    c.why_top_match??"", c.linkedin_url??"", c.background_summary??"",
    (c.match_reasons??[]).join(" | "), (c.technologies??[]).join(", "),
    (c.past_companies??[]).join(", "), (c.languages??[]).join(", "), c.education??""
  ]);
  await navigator.clipboard.writeText(
    [h,...rows].map(r=>r.map(v=>String(v??"").replace(/\t/g," ")).join("\t")).join("\n")
  );
}

// ─── Design tokens ───────────────────────────────────────────────────────────
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

// ─── Small UI components ──────────────────────────────────────────────────────
const Label = ({children,color=G.muted}) => (
  <p style={{fontSize:10.5,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",marginBottom:4,color}}>{children}</p>
);
const Hint = ({children}) => (
  <p style={{fontSize:11.5,color:G.subtle,marginBottom:6,lineHeight:1.45}}>{children}</p>
);
const inputBase = (extra={}) => ({
  width:"100%",borderRadius:10,padding:"11px 14px",fontSize:13.5,
  color:G.text,fontFamily:"'DM Sans',sans-serif",transition:"border-color .2s",
  border:`1.5px solid ${G.border}`,background:"#faf9f7",...extra
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
            style={{...inputBase({background:bg,border:`1.5px solid ${border}`,lineHeight:1.65,resize:"vertical"}),width:"100%"}}/>
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={inputBase({background:bg,border:`1.5px solid ${border}`})}/>}
    </div>
  );
};

const HalfField = (props) => (
  <div style={{flex:"1 1 calc(50% - 8px)",minWidth:180}}>
    <TextField {...props}/>
  </div>
);

const ChipGroup = ({label,hint,options,value,onChange,multi=false}) => {
  const arr = multi?(Array.isArray(value)?value:(value?[value]:[])):null;
  const isActive = opt => multi?arr.includes(opt):value===opt;
  const toggle = opt => {
    if (multi) { onChange(arr.includes(opt)?arr.filter(x=>x!==opt):[...arr,opt]); }
    else { onChange(value===opt?"":opt); }
  };
  return (
    <div style={{flex:"1 1 100%"}}>
      <Label>{label}{multi&&<span style={{fontWeight:400,color:G.subtle,fontSize:11,marginLeft:6}}>(multiple)</span>}</Label>
      {hint&&<Hint>{hint}</Hint>}
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {options.map(opt=>{
          const active=isActive(opt);
          return (
            <button key={opt} className="chip" onClick={()=>toggle(opt)}
              style={{background:active?G.blue:"#f5f3ef",color:active?"#fff":G.muted,
                borderColor:active?G.blue:G.border,boxShadow:active?"0 2px 8px rgba(26,92,158,.2)":"none"}}>
              {active&&<span style={{marginRight:4,fontSize:10}}>✓</span>}{opt}
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
    <div style={{flex:1,height:1,background:G.border}}/>
  </div>
);

const ScoreRing = ({score,size=56,label}) => {
  const color = score>=80?G.green:score>=60?G.amber:G.red;
  const r=(size/2)-5,circ=2*Math.PI*r,dash=(score/100)*circ;
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
      {label&&<span style={{fontSize:9,fontWeight:700,color:G.subtle,letterSpacing:".1em",textTransform:"uppercase"}}>{label}</span>}
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

// ─── Outreach Modal ───────────────────────────────────────────────────────────
const OutreachModal = ({candidate, criteria, onClose}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await generateOutreach(candidate, criteria);
      setResult(r);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(()=>setCopied(""), 2000);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:20,padding:"32px 36px",maxWidth:600,width:"100%",
        boxShadow:"0 20px 60px rgba(0,0,0,.2)",animation:"fadeUp .25s ease"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700}}>
              Outreach for {candidate.name}
            </h2>
            <p style={{fontSize:13,color:G.muted,marginTop:3}}>{candidate.title} · {candidate.company}</p>
          </div>
          <button className="btn" onClick={onClose}
            style={{background:"#f5f3ef",border:`1px solid ${G.border}`,borderRadius:8,
              padding:"6px 12px",fontSize:13,color:G.muted}}>✕</button>
        </div>

        {!result && !loading && (
          <button className="btn" onClick={generate}
            style={{width:"100%",padding:"14px",borderRadius:12,
              background:`linear-gradient(135deg,${G.blue},#2979c8)`,
              color:"#fff",fontSize:14,fontWeight:700,
              boxShadow:"0 4px 18px rgba(26,92,158,.3)"}}>
            ✍️ Generate Outreach Message
          </button>
        )}

        {loading && (
          <div style={{textAlign:"center",padding:"30px",color:G.muted}}>
            <div style={{width:24,height:24,border:`3px solid ${G.border}`,borderTopColor:G.blue,
              borderRadius:"50%",animation:"spin .75s linear infinite",margin:"0 auto 12px"}}/>
            Writing personalized message...
          </div>
        )}

        {error && (
          <div style={{background:G.redLight,border:`1px solid ${G.redBorder}`,borderRadius:10,
            padding:"12px 16px",fontSize:13,color:G.red}}>{error}</div>
        )}

        {result && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:G.blueLight,border:`1.5px solid ${G.blueBorder}`,borderRadius:12,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Label color={G.blue}>Connection Note (≤300 chars)</Label>
                <button className="btn" onClick={()=>copy(result.connection_note,"note")}
                  style={{background:copied==="note"?G.greenLight:G.blueLight,
                    color:copied==="note"?G.green:G.blue,border:`1px solid ${copied==="note"?G.greenBorder:G.blueBorder}`,
                    borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700}}>
                  {copied==="note"?"✓ Copied!":"Copy"}
                </button>
              </div>
              <p style={{fontSize:13.5,color:"#333",lineHeight:1.65}}>{result.connection_note}</p>
              <p style={{fontSize:11,color:G.subtle,marginTop:6}}>{result.connection_note?.length} chars</p>
            </div>

            <div style={{background:"#f8f9fc",border:`1.5px solid ${G.border}`,borderRadius:12,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Label>InMail (longer version)</Label>
                <button className="btn" onClick={()=>copy(result.inmail,"inmail")}
                  style={{background:copied==="inmail"?G.greenLight:"#f5f3ef",
                    color:copied==="inmail"?G.green:G.muted,border:`1px solid ${copied==="inmail"?G.greenBorder:G.border}`,
                    borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700}}>
                  {copied==="inmail"?"✓ Copied!":"Copy"}
                </button>
              </div>
              <p style={{fontSize:13.5,color:"#333",lineHeight:1.65}}>{result.inmail}</p>
            </div>

            {result.why_it_works && (
              <div style={{background:G.amberLight,border:`1px solid ${G.amberBorder}`,borderRadius:10,
                padding:"12px 16px",fontSize:12.5,color:"#92400e"}}>
                <strong>Why it works:</strong> {result.why_it_works}
              </div>
            )}

            <button className="btn" onClick={generate}
              style={{padding:"10px",borderRadius:10,background:"#f5f3ef",
                color:G.muted,fontSize:13,fontWeight:600,border:`1px solid ${G.border}`}}>
              🔄 Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Candidate Card ───────────────────────────────────────────────────────────
const CandidateCard = ({c, rank, showCultureFit, criteria}) => {
  const [open, setOpen] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);

  const tier = c.match_score>=80
    ? {accent:G.green,pill:G.greenLight,pillText:"#15803d",label:"Strong Match"}
    : c.match_score>=60
    ? {accent:G.amber,pill:G.amberLight,pillText:"#92400e",label:"Good Match"}
    : {accent:G.red,pill:G.redLight,pillText:"#991b1b",label:"Partial"};

  const tenure = c.current_company_months;
  const tenureStr = tenure>=12
    ? `${Math.floor(tenure/12)}yr${Math.floor(tenure/12)>1?"s":""}` : tenure>0 ? `${tenure}mo` : null;

  return (
    <>
      {showOutreach && (
        <OutreachModal candidate={c} criteria={criteria} onClose={()=>setShowOutreach(false)}/>
      )}
      <div className="lift" style={{
        background:G.surface,border:`1.5px solid ${open?G.border+"88":"#ece8e1"}`,
        borderLeft:`4px solid ${tier.accent}`,borderRadius:14,
        padding:"18px 22px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,.045)"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:"#f5f3ef",
            border:`1.5px solid ${G.border}`,display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:900,color:G.subtle}}>#{rank}</span>
          </div>
          <ScoreRing score={c.match_score} label="Match"/>
          {showCultureFit&&c.culture_fit_score>0&&<ScoreRing score={c.culture_fit_score} size={46} label="Culture"/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:7,marginBottom:4}}>
              <h3 style={{fontSize:17,fontWeight:700,color:G.text,
                fontFamily:"'Cormorant Garamond',serif",letterSpacing:"-.01em"}}>{c.name}</h3>
              <span className="chip" style={{background:tier.pill,color:tier.pillText,
                borderColor:"transparent",cursor:"default"}}>{tier.label}</span>
              {c.success_prediction&&<PredBadge val={c.success_prediction}/>}
              {c.years_experience>0&&<Tag label={`${c.years_experience} yrs`} color={G.blue}/>}
              {tenureStr&&<Tag label={`${tenureStr} @ current`} color={G.green}/>}
              {c.lead_temperature==="Hot"&&(
                <span className="chip" style={{background:"#fff7ed",color:"#c2410c",
                  borderColor:"#fed7aa",cursor:"default"}}>🔥 Hot Lead</span>
              )}
              {c.lead_temperature==="Warm"&&(
                <span className="chip" style={{background:"#fefce8",color:"#a16207",
                  borderColor:"#fde68a",cursor:"default"}}>🤝 Warm</span>
              )}
              {c.linkedin_url&&(
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                  onClick={e=>e.stopPropagation()}
                  style={{background:"#0077b5",color:"#fff",borderRadius:5,padding:"3px 9px",
                    fontSize:11,fontWeight:700,textDecoration:"none"}}>
                  LinkedIn ↗
                </a>
              )}
              <button className="btn" onClick={e=>{e.stopPropagation();setShowOutreach(true);}}
                style={{background:G.purpleLight,color:G.purple,border:`1px solid ${G.purpleBorder}`,
                  borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700}}>
                ✍️ Outreach
              </button>
            </div>
            <p style={{fontSize:13.5,color:"#555"}}>
              <strong style={{color:"#333"}}>{c.title}</strong>
              {c.company&&<> · {c.company}</>}
              {c.location&&<span style={{color:G.subtle,marginLeft:8}}>📍 {c.location}</span>}
            </p>
            {c.why_top_match&&(
              <p style={{fontSize:12.5,color:"#5a7ab5",marginTop:6,display:"flex",gap:6,lineHeight:1.5}}>
                <span style={{flexShrink:0}}>✦</span><span>{c.why_top_match}</span>
              </p>
            )}
          </div>
          <div className="arrow" onClick={()=>setOpen(o=>!o)}
            style={{fontSize:18,color:G.subtle,transform:open?"rotate(180deg)":"none",
              flexShrink:0,cursor:"pointer",padding:"4px 8px"}}>▾</div>
        </div>

        {open&&(
          <div style={{marginTop:20,paddingTop:20,borderTop:`1.5px solid #f0ece5`,animation:"fadeUp .2s ease"}}>
            {c.background_summary&&(
              <p style={{fontSize:13.5,color:"#555",lineHeight:1.7,marginBottom:18,
                padding:"12px 16px",background:"#faf9f7",borderRadius:9,
                borderLeft:"3px solid #ddd8d0",fontStyle:"italic"}}>
                "{c.background_summary}"
              </p>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:16}}>
              <div>
                <Label>Why they match</Label>
                {c.match_reasons?.map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
                    <span style={{color:G.green,fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
                    <span style={{fontSize:13,color:"#444",lineHeight:1.55}}>{r}</span>
                  </div>
                ))}
              </div>
              <div>
                {c.culture_fit_notes&&(
                  <div style={{marginBottom:14}}>
                    <Label>Culture fit</Label>
                    <p style={{fontSize:13,color:"#555",lineHeight:1.6,padding:"10px 12px",
                      background:G.blueLight,borderRadius:8,borderLeft:`3px solid ${G.blueBorder}`}}>
                      {c.culture_fit_notes}
                    </p>
                  </div>
                )}
                {c.past_companies?.length>0&&(
                  <div style={{marginBottom:12}}>
                    <Label>Past companies</Label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {c.past_companies.map((co,i)=><Tag key={i} label={co} color={G.muted}/>)}
                    </div>
                  </div>
                )}
                {(c.languages?.length>0||c.education)&&(
                  <div>
                    {c.languages?.length>0&&<>
                      <Label>Languages</Label>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                        {c.languages.map((l,i)=><Tag key={i} label={l} color={G.purple}/>)}
                      </div>
                    </>}
                    {c.education&&<><Label>Education</Label>
                      <p style={{fontSize:12,color:"#666"}}>{c.education}</p></>}
                  </div>
                )}
                {c.red_flags?.length>0&&(
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
            {c.technologies?.length>0&&(
              <div>
                <Label>Technologies</Label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {c.technologies.map((t,i)=><Tag key={i} label={t} color={G.blue}/>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Export Bar ───────────────────────────────────────────────────────────────
const ExportBar = ({candidates,searchedAt}) => {
  const [copied,setCopied] = useState(false);
  const handleCopy = async () => {
    await copyTsv(candidates);
    setCopied(true);
    setTimeout(()=>setCopied(false),2500);
  };
  return (
    <div style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,
      padding:"14px 20px",marginBottom:20,display:"flex",alignItems:"center",
      justifyContent:"space-between",flexWrap:"wrap",gap:12,
      boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
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
            borderRadius:9,padding:"8px 14px",fontSize:12.5,fontWeight:700,
            border:`1.5px solid ${G.greenBorder}`}}>
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
    </div>
  );
};

// ─── Pool Suggestions ─────────────────────────────────────────────────────────
const PoolSuggestions = ({suggestions,onRevise,loading}) => {
  const allItems = [
    ...(suggestions?.remove||[]).map(s=>({type:"remove",text:s})),
    ...(suggestions?.include||[]).map(s=>({type:"include",text:s})),
  ];
  const [votes,setVotes] = useState(()=>Object.fromEntries(allItems.map((_,i)=>[i,null])));
  if (allItems.length===0) return null;

  const accepted = allItems.filter((_,i)=>votes[i]==="go");
  const anyVoted = Object.values(votes).some(v=>v!==null);
  const toggle = (i,val) => setVotes(p=>({...p,[i]:p[i]===val?null:val}));

  return (
    <div style={{background:"#fffbf0",border:`1.5px solid ${G.amberBorder}`,borderRadius:16,
      padding:"22px 26px",marginBottom:22,animation:"fadeUp .3s ease"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:18}}>
        <span style={{fontSize:22,flexShrink:0}}>📉</span>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:G.amber}}>Fewer than 10 candidates found</p>
          <p style={{fontSize:12.5,color:"#92400e",lineHeight:1.5,marginTop:2}}>
            Mark suggestions <strong>Go</strong> or <strong>No</strong> to run a revised search.
          </p>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {allItems.map((item,i)=>{
          const isRemove=item.type==="remove";
          const vote=votes[i];
          return (
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",
              borderRadius:11,background:vote==="go"?(isRemove?"#fff7ed":"#f0fdf4"):vote==="no"?"#f8f8f8":G.surface,
              border:`1.5px solid ${vote==="go"?(isRemove?G.amberBorder:G.greenBorder):G.border}`,
              opacity:vote==="no"?0.55:1,transition:"all .18s"}}>
              <div style={{flexShrink:0,marginTop:2}}>
                {isRemove
                  ? <span style={{fontSize:12,fontWeight:700,color:G.amber,background:"#fef3c7",
                      border:`1px solid ${G.amberBorder}`,borderRadius:5,padding:"1px 7px"}}>🔓 Loosen</span>
                  : <span style={{fontSize:12,fontWeight:700,color:G.green,background:G.greenLight,
                      border:`1px solid ${G.greenBorder}`,borderRadius:5,padding:"1px 7px"}}>➕ Add</span>}
              </div>
              <span style={{flex:1,fontSize:13,color:"#44403c",lineHeight:1.6}}>{item.text}</span>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn" onClick={()=>toggle(i,"go")}
                  style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                    background:vote==="go"?G.green:"transparent",
                    color:vote==="go"?"#fff":G.green,border:`1.5px solid ${G.green}`}}>✓ Go</button>
                <button className="btn" onClick={()=>toggle(i,"no")}
                  style={{padding:"5px 13px",borderRadius:8,fontSize:12,fontWeight:700,
                    background:vote==="no"?"#6b7280":"transparent",
                    color:vote==="no"?"#fff":G.muted,border:`1.5px solid ${G.border}`}}>✕ No</button>
              </div>
            </div>
          );
        })}
      </div>
      {anyVoted&&accepted.length>0&&(
        <div style={{borderTop:`1.5px solid ${G.amberBorder}`,paddingTop:16,display:"flex",
          justifyContent:"flex-end",animation:"fadeUp .2s ease"}}>
          <button className="btn" onClick={()=>onRevise(accepted)} disabled={loading}
            style={{display:"flex",alignItems:"center",gap:8,padding:"11px 22px",borderRadius:11,
              background:loading?"#ccc":`linear-gradient(135deg,${G.amber},#d97706)`,
              color:"#fff",fontSize:13.5,fontWeight:700,
              boxShadow:loading?"none":"0 4px 14px rgba(217,119,6,.3)"}}>
            {loading
              ? <><div style={{width:15,height:15,border:"2px solid rgba(255,255,255,.3)",
                  borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/> Searching…</>
              : <><span>🔁</span> Run Revised Search</>}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const EMPTY = {
  companyBackground:"",companyUrl:"",sampleProfile:"",
  roleTitle:"",seniority:[],industry:"",
  country:"",city:"",languages:"",
  technologies:"",targetCompanies:"",pastCompanies:"",
  maxExperience:"",excludedCompanies:"",excludedTitles:"",
  jobDescription:""
};

export default function App() {
  const [f,setF] = useState(EMPTY);
  const set = k => v => setF(p=>({...p,[k]:v}));
  const [loading,setLoading] = useState(false);
  const [progress,setProgress] = useState("");
  const [results,setResults] = useState(null);
  const [searchedAt,setSearchedAt] = useState("");
  const [error,setError] = useState("");
  const resultsRef = useRef(null);

  const hasCompany = f.companyBackground.trim().length>10||f.companyUrl.trim().length>5;

  const handleSearch = async () => {
    if (!f.roleTitle&&!f.industry&&!f.jobDescription&&!f.sampleProfile) {
      setError("Fill in at least a Role Title, Industry, Job Description, or Sample Profile.");
      return;
    }
    setError("");
    setLoading(true);
    setResults(null);
    try {
      const data = await runSearch(f, setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString());
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setProgress(""); }
  };

  const handleRevise = async (acceptedSuggestions) => {
    const instructions = acceptedSuggestions.map(s=>
      s.type==="remove"?`LOOSEN/REMOVE: ${s.text}`:`ADD/INCLUDE: ${s.text}`
    ).join("\n");
    setLoading(true);
    setResults(null);
    setProgress("Applying suggestions...");
    try {
      const revised = {
        ...f,
        jobDescription:[f.jobDescription,
          "\n\n━━━ REVISED: apply these changes ━━━\n"+instructions
        ].filter(Boolean).join("")
      };
      const data = await runSearch(revised, setProgress);
      setResults(data);
      setSearchedAt(new Date().toLocaleString()+" (revised)");
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setProgress(""); }
  };

  return (
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"'DM Sans',sans-serif",color:G.text}}>
      <style>{css}</style>

      {/* Nav */}
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

        {/* Hero */}
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
            Define your role, set your filters — the agent searches LinkedIn, GitHub, Wellfound and more via X-Ray Google search, ranking candidates by fit and predicted success.
          </p>
          <div style={{display:"flex",gap:16,marginTop:18,flexWrap:"wrap"}}>
            {[["🔍","X-Ray Google search"],["📅","Min 1yr tenure enforced"],["🎯","Culture fit scoring"],["✍️","Auto outreach generator"]].map(([icon,label])=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.muted}}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{background:G.surface,borderRadius:20,border:`1.5px solid ${G.border}`,
          padding:"34px 36px",marginBottom:28,boxShadow:"0 4px 28px rgba(0,0,0,.06)"}}>

          <Divider icon="🏛️" label="Hiring Company"/>
          <div style={{background:`linear-gradient(135deg,${G.blueLight},#f8faff)`,
            border:`1.5px solid ${G.blueBorder}`,borderRadius:14,padding:"18px 20px",marginBottom:28}}>
            <p style={{fontSize:13,fontWeight:600,color:G.blue,marginBottom:4}}>
              The more you share about your company, the smarter the matching.
            </p>
            <p style={{fontSize:12.5,color:"#6b82a8",lineHeight:1.6,marginBottom:16}}>
              The agent fetches your site, builds a success profile, and scores each candidate on culture fit.
            </p>
            <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
              <HalfField label="Company Website URL" hint="Agent fetches and reads it automatically"
                value={f.companyUrl} onChange={set("companyUrl")}
                placeholder="https://www.yourcompany.com" accent={G.blue}/>
              <div style={{flex:"1 1 100%"}}>
                <Label color={G.blue}>About Your Company</Label>
                <Hint>Stage, culture, tech stack, values, team size — or paste from your careers page</Hint>
                <textarea value={f.companyBackground} onChange={e=>set("companyBackground")(e.target.value)}
                  rows={3} placeholder="e.g. Series B CyberSecurity startup (~60 people). Engineering culture is flat and product-driven. We value ownership and startup experience. Best hires came from other security or infra companies."
                  style={{...inputBase({background:"#f5f8ff",border:`1.5px solid ${G.blueBorder}`,lineHeight:1.65,resize:"vertical"}),width:"100%"}}/>
              </div>
            </div>
          </div>

          <Divider icon="💼" label="Role"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Job Title" value={f.roleTitle} onChange={set("roleTitle")}
              placeholder="e.g. Senior Backend Engineer, VP Sales, Head of Product…"/>
            <ChipGroup label="Seniority Level" value={f.seniority} onChange={set("seniority")}
              options={["Junior","Mid","Senior","Lead","Manager","Director","VP","C-Level"]} multi/>
          </div>

          <Divider icon="📍" label="Location"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Country" value={f.country} onChange={set("country")}
              placeholder="e.g. Israel, Germany, United States…"/>
            <HalfField label="City / Region" value={f.city} onChange={set("city")}
              placeholder="e.g. Tel Aviv, Berlin, New York…"/>
          </div>

          <Divider icon="🎓" label="Candidate Profile"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <HalfField label="Required Languages" hint="Comma-separated"
              value={f.languages} onChange={set("languages")}
              placeholder="e.g. English, Hebrew, German…"/>
            <HalfField label="Skills & Technologies" hint="Comma-separated"
              value={f.technologies} onChange={set("technologies")}
              placeholder="e.g. React, Python, AWS, B2B SaaS sales…"/>
            <HalfField label="Max Years of Experience" type="number"
              value={f.maxExperience} onChange={set("maxExperience")}
              placeholder="e.g. 10  (blank = no limit)"/>
          </div>

          <Divider icon="🏢" label="Company Filters"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:28}}>
            <TextField label="Target Companies to Source From"
              hint="Agent prioritizes these in searches"
              value={f.targetCompanies} onChange={set("targetCompanies")}
              placeholder="e.g. Check Point, CrowdStrike, Palo Alto Networks…"/>
            <TextField label="Preferred Past Companies"
              hint="Candidates with experience here score higher"
              value={f.pastCompanies} onChange={set("pastCompanies")}
              placeholder="e.g. Unit 8200, Google, Wiz…"/>
            <TextField danger label="⛔ Excluded Companies"
              hint="Hard filter — anyone currently here is removed"
              value={f.excludedCompanies} onChange={set("excludedCompanies")}
              placeholder="e.g. Competitor A, Competitor B…"/>
            <TextField danger label="⛔ Excluded Titles"
              hint="Hard filter — remove anyone whose title contains these"
              value={f.excludedTitles} onChange={set("excludedTitles")}
              placeholder="e.g. VP, Director, Founder, C-Level…"/>
          </div>

          <Divider icon="👤" label="Sample Profile"/>
          <div style={{marginBottom:28}}>
            <div style={{background:G.purpleLight,border:`1.5px solid ${G.purpleBorder}`,
              borderRadius:14,padding:"18px 20px"}}>
              <p style={{fontSize:13,fontWeight:600,color:G.purple,marginBottom:8}}>
                Paste a LinkedIn URL, profile text, or describe your ideal candidate
              </p>
              <TextField value={f.sampleProfile} onChange={set("sampleProfile")} textarea rows={3}
                placeholder="https://linkedin.com/in/example  OR  Senior Engineer at Stripe, ex-Google, 8 yrs, payments specialist"
                accent={G.purple}/>
            </div>
          </div>

          <Divider icon="📋" label="Job Description"/>
          <div style={{marginBottom:28}}>
            <TextField textarea rows={5} label="Full Job Description"
              hint="The richer the description, the smarter the match"
              value={f.jobDescription} onChange={set("jobDescription")}
              placeholder="Paste your full JD here — responsibilities, must-haves, nice-to-haves, team context…"/>
          </div>

          {error&&(
            <div style={{background:G.redLight,border:`1.5px solid ${G.redBorder}`,borderRadius:10,
              padding:"12px 16px",marginBottom:18,fontSize:13.5,color:G.red,
              display:"flex",gap:8,alignItems:"flex-start"}}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button className="btn" onClick={handleSearch} disabled={loading} style={{
            width:"100%",padding:"16px 20px",borderRadius:12,
            background:loading?"#93b4d4":`linear-gradient(135deg,${G.blue},#2979c8)`,
            color:"#fff",fontSize:15,fontWeight:700,letterSpacing:".04em",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow:loading?"none":"0 4px 18px rgba(26,92,158,.3)",
            cursor:loading?"not-allowed":"pointer"
          }}>
            {loading ? (
              <>
                <div style={{width:17,height:17,border:"2.5px solid rgba(255,255,255,.3)",
                  borderTopColor:"#fff",borderRadius:"50%",animation:"spin .75s linear infinite"}}/>
                <span style={{animation:"shimmer 1.5s infinite"}}>{progress||"Searching..."}</span>
              </>
            ) : (
              <>
                <span>{hasCompany?"Run Intelligent Search":"Run Candidate Search"}</span>
                <span style={{opacity:.55,fontSize:16}}>→</span>
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {results&&(
          <div ref={resultsRef} style={{animation:"fadeUp .4s ease"}}>
            {results.company_profile&&(
              <div style={{background:`linear-gradient(135deg,${G.blueLight},#f5f8ff)`,
                border:`1.5px solid ${G.blueBorder}`,borderRadius:14,padding:"18px 22px",marginBottom:20}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:20,flexShrink:0}}>🏛️</span>
                  <div>
                    <p style={{fontSize:11,fontWeight:700,color:G.blue,letterSpacing:".12em",
                      textTransform:"uppercase",marginBottom:5}}>Company Success Profile</p>
                    <p style={{fontSize:13.5,color:"#3a5580",lineHeight:1.65}}>{results.company_profile}</p>
                  </div>
                </div>
              </div>
            )}

            {(results.candidates?.length??0)<10&&results.pool_suggestions&&(
              <PoolSuggestions suggestions={results.pool_suggestions} onRevise={handleRevise} loading={loading}/>
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
                <div key={label} style={{background:G.surface,border:`1.5px solid ${G.border}`,
                  borderRadius:14,padding:"16px 18px",boxShadow:"0 2px 8px rgba(0,0,0,.04)",
                  borderTop:`3px solid ${color}`}}>
                  <div style={{fontSize:30,fontWeight:900,color,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{val}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.muted,marginTop:4}}>{label}</div>
                  <div style={{fontSize:10.5,color:G.subtle}}>{sub}</div>
                </div>
              ))}
            </div>

            {results.search_summary&&(
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
              <span style={{marginLeft:"auto",fontSize:11.5,color:G.subtle,fontStyle:"italic"}}>Click card to expand · ✍️ to generate outreach</span>
            </div>

            {results.candidates?.sort((a,b)=>b.match_score-a.match_score).map((c,i)=>(
              <CandidateCard key={i} c={c} rank={i+1} showCultureFit={hasCompany} criteria={f}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
