import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from "recharts";

const REDIRECT_URI = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = [
  "user-top-read", "user-read-recently-played", "user-read-private",
  "user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing",
  "playlist-modify-public", "playlist-modify-private",
].join(" ");

// ─── PKCE ────────────────────────────────────────────────────────────────────
function genVerifier(n = 128) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => c[b % c.length]).join("");
}
async function genChallenge(v) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── SPOTIFY API ─────────────────────────────────────────────────────────────
async function sp(endpoint, token, opts = {}) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...opts });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return res.json();
}

// ─── MUSICBRAINZ (free, no auth — genres + country) ──────────────────────────
async function fetchMB(name) {
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`, {
      headers: { "User-Agent": "SpotifyDashboard/1.0 (github)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.artists?.[0];
    if (!a || a.score < 80) return null;
    return {
      genres: (a.tags || []).sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 3).map(t => t.name),
      country: a.area?.name || null,
      countryCode: a.country || null,
    };
  } catch { return null; }
}

async function enrichArtists(artists, max = 30) {
  const results = {};
  const list = artists.slice(0, max);
  for (let i = 0; i < list.length; i += 5) {
    const batch = list.slice(i, i + 5);
    const res = await Promise.all(batch.map(a => fetchMB(a.name).then(r => ({ id: a.id, data: r }))));
    res.forEach(r => { if (r.data) results[r.id] = r.data; });
    if (i + 5 < list.length) await new Promise(r => setTimeout(r, 1200));
  }
  return results;
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = { bg: "#0D0D0D", surface: "#161616", card: "#1C1C1C", border: "#2A2A2A", green: "#1DB954", text: "#FFF", muted: "#888", accent: "#B3FF5C", dim: "#333", red: "#FF6B6B" };
const COLORS = ["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD","#10AC84","#FDA7DF"];

function Card({ children, style = {} }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, ...style }}>{children}</div>; }
function Label({ children }) { return <p style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14, marginTop: 0 }}>{children}</p>; }
function StatCard({ label, value, sub, icon }) {
  return <Card style={{ padding: 18 }}><div style={{ display: "flex", justifyContent: "space-between" }}><Label>{label}</Label>{icon && <span style={{ fontSize: 18 }}>{icon}</span>}</div><div style={{ fontSize: 26, fontWeight: 800, color: C.green, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>{sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>{sub}</div>}</Card>;
}
function fmt(m) { if (m < 1) return "<1min"; if (m < 60) return `${Math.round(m)}min`; const h = Math.floor(m / 60); return `${h}h${Math.round(m % 60) > 0 ? String(Math.round(m % 60)).padStart(2, "0") : ""}`; }

export default function App() {
  const [clientId, setClientId] = useState(() => localStorage.getItem("sp_client_id") || "");
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Connexion…");
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [mb, setMb] = useState({});
  const [mbLoading, setMbLoading] = useState(false);
  const [timeRange, setTimeRange] = useState("medium_term");
  const [tab, setTab] = useState("overview");
  const [setup, setSetup] = useState("input");
  const [player, setPlayer] = useState(null);
  const [devices, setDevices] = useState([]);
  const pi = useRef(null);

  useEffect(() => {
    const code = sessionStorage.getItem("sp_code");
    if (!code) { setLoading(false); return; }
    const v = sessionStorage.getItem("sp_verifier"), sid = sessionStorage.getItem("sp_client_id");
    if (!v || !sid) { setLoading(false); return; }
    sessionStorage.removeItem("sp_code");
    (async () => {
      try {
        const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: sid, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: v }) });
        const j = await r.json();
        if (j.access_token) { setToken(j.access_token); localStorage.setItem("sp_client_id", sid); }
        else { setError(j.error_description || j.error); setLoading(false); }
      } catch (e) { setError(e.message); setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true); setError(null); setLoadMsg("Récupération des données…");
    (async () => {
      try {
        const [a1, a2, t1, t2, rec, prof] = await Promise.all([
          sp(`/me/top/artists?limit=50&offset=0&time_range=${timeRange}`, token),
          sp(`/me/top/artists?limit=49&offset=50&time_range=${timeRange}`, token).catch(() => ({ items: [] })),
          sp(`/me/top/tracks?limit=50&offset=0&time_range=${timeRange}`, token),
          sp(`/me/top/tracks?limit=49&offset=50&time_range=${timeRange}`, token).catch(() => ({ items: [] })),
          sp("/me/player/recently-played?limit=50", token),
          sp("/me", token),
        ]);
        const topA = [...(a1.items||[]),...(a2.items||[])], topT = [...(t1.items||[]),...(t2.items||[])], ri = rec.items||[];
        const totalMin = ri.reduce((s,i) => s + (i.track?.duration_ms||0), 0) / 60000;
        const atM = {}; ri.forEach(i => { const t = i.track; if (!t) return; const d = (t.duration_ms||0)/60000; (t.artists||[]).forEach(a => { if (!atM[a.id]) atM[a.id]={name:a.name,id:a.id,minutes:0,plays:0}; atM[a.id].minutes+=d; atM[a.id].plays++; }); });
        const abt = Object.values(atM).sort((a,b) => b.minutes - a.minutes);
        const ttM = {}; ri.forEach(i => { const t = i.track; if (!t) return; if (!ttM[t.id]) ttM[t.id]={...t,plays:0,totalMin:0}; ttM[t.id].plays++; ttM[t.id].totalMin+=(t.duration_ms||0)/60000; });
        const tbp = Object.values(ttM).sort((a,b) => b.plays - a.plays);
        const hr = Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0})); ri.forEach(i => { const h = new Date(i.played_at).getHours(); hr[h].nb++; hr[h].min+=(i.track?.duration_ms||0)/60000; });
        const dM = {}; ri.forEach(i => { const d = new Date(i.played_at).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}); if(!dM[d]) dM[d]={date:d,nb:0,min:0}; dM[d].nb++; dM[d].min+=(i.track?.duration_ms||0)/60000; });
        const ua = new Set(); ri.forEach(i => (i.track?.artists||[]).forEach(a => ua.add(a.id)));
        setData({ topA, topT, ri, prof, totalMin, abt, tbp, hr, daily: Object.values(dM).reverse(), ua: ua.size });
        setMbLoading(true); setLoadMsg("Genres et pays…");
        enrichArtists(topA, 30).then(r => { setMb(r); setMbLoading(false); });
      } catch (e) { setError(e.message); } finally { setLoading(false); }
    })();
  }, [token, timeRange]);

  useEffect(() => {
    if (!token) return;
    const f = () => { sp("/me/player",token).then(setPlayer).catch(()=>setPlayer(null)); sp("/me/player/devices",token).then(d=>setDevices(d?.devices||[])).catch(()=>{}); };
    f(); pi.current = setInterval(f, 5000);
    return () => clearInterval(pi.current);
  }, [token]);

  const cmd = async a => {
    try {
      if (a==="play") await sp("/me/player/play",token,{method:"PUT"});
      else if (a==="pause") await sp("/me/player/pause",token,{method:"PUT"});
      else if (a==="next") await sp("/me/player/next",token,{method:"POST"});
      else if (a==="prev") await sp("/me/player/previous",token,{method:"POST"});
      else if (a==="shuffle") await sp(`/me/player/shuffle?state=${!player?.shuffle_state}`,token,{method:"PUT"});
      else if (a==="repeat") { const m=["off","context","track"]; await sp(`/me/player/repeat?state=${m[(m.indexOf(player?.repeat_state||"off")+1)%3]}`,token,{method:"PUT"}); }
      setTimeout(()=>sp("/me/player",token).then(setPlayer).catch(()=>{}),500);
    } catch{}
  };
  const play = async u => { try { await sp("/me/player/play",token,{method:"PUT",body:JSON.stringify({uris:[u]})}); } catch{} };
  const mkPl = async (n, uris) => {
    try { const p = await sp(`/users/${data.prof.id}/playlists`,token,{method:"POST",body:JSON.stringify({name:n,public:false})}); if(p?.id) await sp(`/playlists/${p.id}/tracks`,token,{method:"POST",body:JSON.stringify({uris})}); alert(`Playlist "${n}" créée !`); } catch { alert("Erreur"); }
  };

  const login = useCallback(async () => {
    if (!clientId.trim()) return;
    const v = genVerifier(), ch = await genChallenge(v);
    sessionStorage.setItem("sp_verifier", v); sessionStorage.setItem("sp_client_id", clientId.trim());
    const u = new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id",clientId.trim()); u.searchParams.set("response_type","code"); u.searchParams.set("redirect_uri",REDIRECT_URI); u.searchParams.set("scope",SCOPES); u.searchParams.set("code_challenge_method","S256"); u.searchParams.set("code_challenge",ch);
    window.location.href = u.toString();
  }, [clientId]);

  if (loading) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.muted,fontSize:14}}>{loadMsg}</p></div><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;
  if (error && !token) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}><p style={{color:C.red,fontSize:14,marginBottom:20}}>{error}</p><button onClick={()=>setError(null)} style={{padding:"12px 24px",background:C.green,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if (!token) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}}><div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:48,marginBottom:12}}>🎧</div><h1 style={{color:C.text,fontSize:28,fontWeight:700,margin:0}}>Your Spotify, Uncovered.</h1><p style={{color:C.muted,marginTop:8,fontSize:14}}>Ton analyse complète</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.border}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSetup(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:setup===k?C.green:C.muted,borderBottom:`2px solid ${setup===k?C.green:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{setup==="input"?<div><label style={{color:C.muted,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.muted,fontSize:11,marginTop:8}}>Redirect URI : <code style={{color:C.accent}}>{REDIRECT_URI}</code></p><button onClick={login} disabled={!clientId.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:clientId.trim()?C.green:C.border,border:"none",borderRadius:50,color:clientId.trim()?"#000":C.muted,fontSize:15,fontWeight:700,cursor:clientId.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.muted,lineHeight:1.8}}><p><span style={{color:C.green,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.accent}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.green,fontWeight:700}}>2.</span> Redirect URI : <code style={{color:C.accent}}>{REDIRECT_URI}</code></p><p><span style={{color:C.green,fontWeight:700}}>3.</span> APIs : Web API</p><p><span style={{color:C.green,fontWeight:700}}>4.</span> Copie Client ID → colle → connecte</p></div>}</Card></div></div>;
  if (!data) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.muted}}>{loadMsg}</p></div><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;

  const { topA, topT, ri, prof, totalMin, abt, tbp, hr, daily, ua } = data;
  const gc = {}, cc = {};
  topA.forEach(a => { const m = mb[a.id]; if (m) { (m.genres||[]).forEach(g => { gc[g]=(gc[g]||0)+1; }); if (m.country) cc[m.country]=(cc[m.country]||0)+1; } });
  const tg = Object.entries(gc).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({name:n,count:c}));
  const tc = Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([n,c])=>({name:n,count:c}));
  const TL = { short_term:"4 sem.", medium_term:"6 mois", long_term:"Tout" };
  const np = player?.item;
  const tabs = [["overview","📊 Overview"],["artists","🎤 Artistes"],["tracks","🎵 Titres"],["genres","🎨 Genres"],["countries","🌍 Pays"],["trends","📈 Tendances"],["history","🕐 Historique"],["player","🎮 Lecteur"]];

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.text,padding:"20px 16px 80px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {prof.images?.[0]&&<img src={prof.images[0].url} alt="" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.green}`}} />}
          <div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>{prof.display_name}</h1><p style={{margin:0,color:C.muted,fontSize:11}}>{TL[timeRange]} · {topA.length} artistes · {topT.length} titres</p></div>
        </div>
        <div style={{display:"flex",gap:6}}>{Object.entries(TL).map(([k,l])=><button key={k} onClick={()=>setTimeRange(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:timeRange===k?C.green:C.card,border:`1px solid ${timeRange===k?C.green:C.border}`,color:timeRange===k?"#000":C.muted,cursor:"pointer",fontWeight:timeRange===k?700:400}}>{l}</button>)}</div>
      </div>
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"10px 12px",background:"none",border:"none",color:tab===k?C.green:C.muted,borderBottom:`2px solid ${tab===k?C.green:"transparent"}`,cursor:"pointer",fontSize:12,fontWeight:tab===k?600:400,marginBottom:-1,whiteSpace:"nowrap"}}>{l}</button>)}</div>
      {mbLoading&&<p style={{color:C.muted,fontSize:11,marginBottom:12,fontStyle:"italic"}}>⏳ Chargement genres/pays…</p>}

      {tab==="overview"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <StatCard label="Artistes" value={topA.length} icon="🎤" />
          <StatCard label="Titres" value={topT.length} icon="🎵" />
          <StatCard label="Temps écouté" value={fmt(totalMin)} sub="50 dernières" icon="⏱" />
          <StatCard label="Artistes récents" value={ua} icon="👥" />
          {tg.length>0&&<StatCard label="Genre #1" value={tg[0].name} icon="🎨" />}
          {tc.length>0&&<StatCard label="Pays #1" value={tc[0].name} icon="🌍" />}
        </div>
        {np&&<Card style={{marginBottom:20,background:`linear-gradient(135deg,${C.card},${C.surface})`}}>
          <Label>En cours</Label>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            {np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:56,height:56,borderRadius:8}} />}
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>{np.name}</div><div style={{color:C.muted,fontSize:12}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div></div>
            <div style={{display:"flex",gap:8}}><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.text,fontSize:18,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(player?.is_playing?"pause":"play")} style={{background:C.green,border:"none",color:"#000",fontSize:18,cursor:"pointer",borderRadius:"50%",width:40,height:40}}>{player?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.text,fontSize:18,cursor:"pointer"}}>⏭</button></div>
          </div>
        </Card>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><Label>Top 5 artistes</Label>{topA.slice(0,5).map((a,i)=>{const m=mb[a.id];return <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:11,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>🎤</div>}<div style={{flex:1}}><div style={{color:C.text,fontSize:13,fontWeight:500}}>{a.name}</div>{m&&<div style={{color:C.muted,fontSize:10}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>;})}</Card>
          <Card><Label>Plus joués (temps)</Label>{abt.slice(0,5).map((a,i)=><div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:11,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{width:36,height:36,borderRadius:"50%",background:COLORS[i%COLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎤</div><div style={{flex:1}}><div style={{color:C.text,fontSize:13,fontWeight:500}}>{a.name}</div><div style={{color:C.muted,fontSize:10}}>{a.plays} écoutes</div></div><div style={{color:C.accent,fontSize:12,fontFamily:"monospace"}}>{fmt(a.minutes)}</div></div>)}</Card>
        </div>
      </>}

      {tab==="artists"&&<><div style={{marginBottom:16}}><button onClick={()=>mkPl(`Top Mix — ${TL[timeRange]}`,topT.slice(0,50).map(t=>t.uri))} style={{padding:"8px 16px",background:C.green,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Créer playlist</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Label>Top {topA.length} artistes</Label><div style={{maxHeight:800,overflowY:"auto"}}>{topA.map((a,i)=>{const m=mb[a.id];return <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:32,height:32,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🎤</div>}<div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>{m&&<div style={{color:C.muted,fontSize:9}}>{(m.genres||[]).slice(0,2).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>;})}</div></Card><Card><Label>Temps d'écoute récent</Label>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(600,abt.slice(0,15).length*36)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.minutes)}))} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={v=>[`${v} min`]} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.muted}}>Pas de données</p>}</Card></div></>}

      {tab==="tracks"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Label>Top {topT.length} titres</Label><div style={{maxHeight:800,overflowY:"auto"}}>{topT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";;return <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.muted,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />:<div style={{width:32,height:32,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.muted,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.muted,fontSize:10,fontFamily:"monospace"}}>{d}</div><span style={{fontSize:10,opacity:0.4}}>▶</span></div>;})}</div></Card><Card><Label>Plus joués récemment</Label>{tbp.slice(0,20).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.muted,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.muted,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.accent,fontSize:10,fontFamily:"monospace"}}>{t.plays}x · {fmt(t.totalMin)}</div></div>)}<p style={{color:C.muted,fontSize:9,marginTop:12,fontStyle:"italic"}}>Basé sur 50 dernières écoutes. Clique pour jouer.</p></Card></div>}

      {tab==="genres"&&(tg.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Label>Genres</Label><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={tg.slice(0,8)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={3} label={({name,percent})=>percent>0.05?name:""} labelLine={false}>{tg.slice(0,8).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Label>Détail</Label>{tg.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><div style={{width:10,height:10,borderRadius:"50%",background:COLORS[i%COLORS.length],flexShrink:0}} /><div style={{flex:1,color:C.text,fontSize:12}}>{g.name}</div><div style={{width:80,height:4,background:C.border,borderRadius:2}}><div style={{width:`${(g.count/tg[0].count)*100}%`,height:"100%",borderRadius:2,background:COLORS[i%COLORS.length]}} /></div><span style={{color:C.muted,fontSize:11,fontFamily:"monospace",width:20}}>{g.count}</span></div>)}</Card></div>:<Card><p style={{color:C.muted,textAlign:"center"}}>{mbLoading?"⏳ Chargement…":"Pas de données de genres"}</p></Card>)}

      {tab==="countries"&&(tc.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Label>Pays d'origine</Label><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={tc.slice(0,8)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={3} label={({name,percent})=>percent>0.05?name:""} labelLine={false}>{tc.slice(0,8).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Label>Détail par pays</Label>{tc.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}><div style={{width:10,height:10,borderRadius:"50%",background:COLORS[i%COLORS.length],flexShrink:0}} /><div style={{flex:1,color:C.text,fontSize:13}}>{c.name}</div><div style={{width:80,height:4,background:C.border,borderRadius:2}}><div style={{width:`${(c.count/tc[0].count)*100}%`,height:"100%",borderRadius:2,background:COLORS[i%COLORS.length]}} /></div><span style={{color:C.muted,fontSize:11,fontFamily:"monospace",width:20}}>{c.count}</span></div>)}</Card></div>:<Card><p style={{color:C.muted,textAlign:"center"}}>{mbLoading?"⏳ Chargement…":"Pas de données de pays"}</p></Card>)}

      {tab==="trends"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Label>Écoutes par heure</Label><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={v=>[`${v} écoutes`]} /><Bar dataKey="nb" fill={C.green} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card><Card><Label>Minutes par heure</Label><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={v=>[`${Math.round(v)} min`]} /><Bar dataKey="min" fill={C.accent} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card><Card style={{gridColumn:"span 2"}}><Label>Activité par jour</Label>{daily.length>1?<ResponsiveContainer width="100%" height={250}><LineChart data={daily}><XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} /><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} /><Line type="monotone" dataKey="nb" stroke={C.green} strokeWidth={2} dot={{fill:C.green,r:3}} name="Écoutes" /><Line type="monotone" dataKey="min" stroke={C.accent} strokeWidth={2} dot={{fill:C.accent,r:3}} name="Minutes" /></LineChart></ResponsiveContainer>:<p style={{color:C.muted}}>Pas assez de données</p>}<div style={{display:"flex",gap:16,marginTop:8}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:12,height:3,background:C.green,borderRadius:2}} /><span style={{color:C.muted,fontSize:10}}>Écoutes</span></div><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:12,height:3,background:C.accent,borderRadius:2}} /><span style={{color:C.muted,fontSize:10}}>Minutes</span></div></div></Card></div>}

      {tab==="history"&&<Card><Label>50 dernières écoutes</Label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return <div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:28,height:28,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.muted,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.muted,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>;})}</div></Card>}

      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card>{np?<div><div style={{display:"flex",gap:16,marginBottom:20}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:120,height:120,borderRadius:12}} />}<div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div><div style={{color:C.muted,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div><div style={{color:C.muted,fontSize:11,marginTop:4}}>{np.album?.name}</div>{player?.progress_ms&&np.duration_ms&&<div style={{marginTop:12}}><div style={{width:"100%",height:4,background:C.border,borderRadius:2}}><div style={{width:`${(player.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.green,borderRadius:2}} /></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.muted,fontSize:10,fontFamily:"monospace"}}>{fmt(player.progress_ms/60000)}</span><span style={{color:C.muted,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div></div>}</div></div><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12}}><button onClick={()=>cmd("shuffle")} style={{background:"none",border:"none",color:player?.shuffle_state?C.green:C.muted,fontSize:16,cursor:"pointer"}}>🔀</button><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.text,fontSize:20,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(player?.is_playing?"pause":"play")} style={{background:C.green,border:"none",color:"#000",fontSize:22,cursor:"pointer",borderRadius:"50%",width:52,height:52}}>{player?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.text,fontSize:20,cursor:"pointer"}}>⏭</button><button onClick={()=>cmd("repeat")} style={{background:"none",border:"none",color:player?.repeat_state!=="off"?C.green:C.muted,fontSize:16,cursor:"pointer"}}>{player?.repeat_state==="track"?"🔂":"🔁"}</button></div></div>:<div style={{textAlign:"center",padding:40}}><div style={{fontSize:40,opacity:0.3}}>🎵</div><p style={{color:C.muted,fontSize:13,marginTop:16}}>Rien en cours — ouvre Spotify</p></div>}</Card><Card><Label>Appareils</Label>{devices.length>0?devices.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":d.type==="Speaker"?"🔊":"📺"}</span><div style={{flex:1}}><div style={{color:C.text,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.muted,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<span style={{color:C.green,fontSize:10,fontWeight:600}}>ACTIF</span>}</div>):<p style={{color:C.muted,fontSize:13}}>Aucun appareil. Ouvre Spotify.</p>}</Card></div>}

      <div style={{textAlign:"center",marginTop:40,color:C.muted,fontSize:10}}>Spotify API · Genres/pays via MusicBrainz · Stats sur 50 dernières écoutes · <button onClick={()=>{setToken(null);setData(null);setMb({});}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}