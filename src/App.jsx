import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const REDIRECT_URI = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read","user-read-recently-played","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-modify-public","playlist-modify-private","playlist-read-private","playlist-read-collaborative"].join(" ");

function genV(n=128){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>c[b%c.length]).join("")}
async function genC(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
async function sp(e,t,o={}){const r=await fetch(`https://api.spotify.com/v1${e}`,{headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},...o});if(r.status===204)return null;if(!r.ok)throw new Error(`${r.status}`);return r.json()}

const COUNTRIES={"AF":"Afghanistan","AL":"Albanie","DZ":"Algérie","AD":"Andorre","AO":"Angola","AR":"Argentine","AM":"Arménie","AU":"Australie","AT":"Autriche","AZ":"Azerbaïdjan","BD":"Bangladesh","BY":"Biélorussie","BE":"Belgique","BO":"Bolivie","BA":"Bosnie-Herzégovine","BR":"Brésil","BG":"Bulgarie","CA":"Canada","CL":"Chili","CN":"Chine","CO":"Colombie","HR":"Croatie","CU":"Cuba","CY":"Chypre","CZ":"Tchéquie","DK":"Danemark","DO":"Rép. Dominicaine","EC":"Équateur","EG":"Égypte","EE":"Estonie","ET":"Éthiopie","FI":"Finlande","FR":"France","GE":"Géorgie","DE":"Allemagne","GH":"Ghana","GR":"Grèce","GT":"Guatemala","HT":"Haïti","HN":"Honduras","HU":"Hongrie","IS":"Islande","IN":"Inde","ID":"Indonésie","IR":"Iran","IQ":"Irak","IE":"Irlande","IL":"Israël","IT":"Italie","JM":"Jamaïque","JP":"Japon","JO":"Jordanie","KZ":"Kazakhstan","KE":"Kenya","KR":"Corée du Sud","KW":"Koweït","LV":"Lettonie","LB":"Liban","LT":"Lituanie","LU":"Luxembourg","MY":"Malaisie","MX":"Mexique","MA":"Maroc","NL":"Pays-Bas","NZ":"Nouvelle-Zélande","NG":"Nigeria","NO":"Norvège","PK":"Pakistan","PA":"Panama","PY":"Paraguay","PE":"Pérou","PH":"Philippines","PL":"Pologne","PT":"Portugal","QA":"Qatar","RO":"Roumanie","RU":"Russie","SA":"Arabie Saoudite","SN":"Sénégal","RS":"Serbie","SG":"Singapour","SK":"Slovaquie","SI":"Slovénie","ZA":"Afrique du Sud","ES":"Espagne","LK":"Sri Lanka","SE":"Suède","CH":"Suisse","TW":"Taïwan","TH":"Thaïlande","TN":"Tunisie","TR":"Turquie","UA":"Ukraine","AE":"Émirats arabes unis","GB":"Royaume-Uni","US":"États-Unis","UY":"Uruguay","VE":"Venezuela","VN":"Vietnam","XW":"Monde","XE":"Europe","PR":"Porto Rico","XC":"Caraïbes"};

const GENERIC=new Set(["rock","metal","pop","electronic","hip hop","jazz","classical","country","blues","folk","soul","punk","alternative","indie","r&b","dance","reggae","latin"]);

async function fetchMB(name){
  try{
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});
    if(!r.ok)return null;const d=await r.json(),a=d.artists?.[0];if(!a||a.score<80)return null;
    const allTags=(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name);
    const specific=allTags.filter(t=>!GENERIC.has(t.toLowerCase()));
    const genres=specific.length>=2?specific.slice(0,4):[...specific,...allTags.filter(t=>GENERIC.has(t.toLowerCase()))].slice(0,4);
    const code=a.country||null;
    return{genres,country:code?COUNTRIES[code]||code:null,countryCode:code};
  }catch{return null}
}

async function enrichAll(artists,onProgress){
  const res={};
  for(let i=0;i<artists.length;i+=5){
    const batch=artists.slice(i,i+5);
    const ps=await Promise.all(batch.map(a=>fetchMB(a.name).then(r=>({id:a.id,data:r}))));
    ps.forEach(p=>{if(p.data)res[p.id]=p.data});
    if(onProgress)onProgress({...res},Math.min(i+5,artists.length));
    if(i+5<artists.length)await new Promise(r=>setTimeout(r,1200));
  }
  return res;
}

// Search MusicBrainz for artists by tag+country combo
async function searchMBArtists(tag,countryCode,limit=10){
  try{
    const q=countryCode?`tag:"${tag}" AND country:${countryCode}`:`tag:"${tag}"`;
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=${limit}&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});
    if(!r.ok)return[];const d=await r.json();
    return(d.artists||[]).filter(a=>a.score>70).map(a=>({
      name:a.name,mbid:a.id,country:a.country?COUNTRIES[a.country]||a.country:null,
      tags:(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).slice(0,3).map(t=>t.name),
      type:a.type,
    }));
  }catch{return[]}
}

const C={bg:"#0D0D0D",sf:"#161616",card:"#1C1C1C",brd:"#2A2A2A",grn:"#1DB954",txt:"#FFF",mut:"#888",acc:"#B3FF5C",dim:"#333",red:"#FF6B6B"};
const CL=["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD","#10AC84","#FDA7DF","#C44569","#3DC1D3"];

function Card({children,style={}}){return<div style={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:16,padding:24,...style}}>{children}</div>}
function Lbl({children}){return<p style={{color:C.mut,fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>{children}</p>}
function SC({label,value,sub,icon}){return<Card style={{padding:18}}><div style={{display:"flex",justifyContent:"space-between"}}><Lbl>{label}</Lbl>{icon&&<span style={{fontSize:18}}>{icon}</span>}</div><div style={{fontSize:24,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.mut,marginTop:6}}>{sub}</div>}</Card>}
function fmt(m){if(m<1)return"<1min";if(m<60)return`${Math.round(m)}min`;const h=Math.floor(m/60);return`${h}h${Math.round(m%60)>0?String(Math.round(m%60)).padStart(2,"0"):""}`}

function DrillDown({title,artists,tracks,mb,onClose,onPlay,onMkPl}){
  return(<div style={{position:"fixed",top:0,right:0,width:480,maxWidth:"100vw",height:"100vh",background:C.card,borderLeft:`1px solid ${C.brd}`,zIndex:1000,overflowY:"auto",padding:24,boxSizing:"border-box"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.txt}}>{title}</h2><button onClick={onClose} style={{background:"none",border:"none",color:C.mut,fontSize:24,cursor:"pointer"}}>✕</button></div>
    <Lbl>{artists.length} artistes</Lbl>
    {tracks.length>0&&<button onClick={()=>onMkPl(`${title} Mix`,tracks.slice(0,50).map(t=>t.uri))} style={{padding:"6px 14px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:16}}>📋 Playlist ({Math.min(tracks.length,50)} titres)</button>}
    {artists.map((a,i)=>{const m=mb[a.id];const at=tracks.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id));return<div key={a.id||i} style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🎤</div>}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:600}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:10}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>{at.length>0&&<div style={{marginLeft:66}}>{at.slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer",borderBottom:`1px solid ${C.brd}`}} onClick={()=>onPlay(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:24,height:24,borderRadius:3}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{fontSize:9,color:C.mut}}>▶</span></div>)}</div>}</div>})}
  </div>);
}

export default function App(){
  const[cid,setCid]=useState(()=>localStorage.getItem("sp_client_id")||"");
  const[tok,setTok]=useState(null);
  const[ld,setLd]=useState(true);const[lm,setLm]=useState("Connexion…");
  const[err,setErr]=useState(null);const[data,setData]=useState(null);
  const[mb,setMb]=useState({});const[mbL,setMbL]=useState(false);const[mbP,setMbP]=useState("");
  const[tr,setTr]=useState("medium_term");const[tab,setTab]=useState("overview");const[su,setSu]=useState("input");
  const[pl,setPl]=useState(null);const[devs,setDevs]=useState([]);const[drill,setDrill]=useState(null);
  const[playlists,setPlaylists]=useState([]);
  const[suggestions,setSuggestions]=useState([]);const[sugL,setSugL]=useState(false);
  const pi=useRef(null);

  useEffect(()=>{const code=sessionStorage.getItem("sp_code");if(!code){setLd(false);return}const v=sessionStorage.getItem("sp_verifier"),s=sessionStorage.getItem("sp_client_id");if(!v||!s){setLd(false);return}sessionStorage.removeItem("sp_code");(async()=>{try{const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:s,grant_type:"authorization_code",code,redirect_uri:REDIRECT_URI,code_verifier:v})});const j=await r.json();if(j.access_token){setTok(j.access_token);localStorage.setItem("sp_client_id",s)}else{setErr(j.error_description||j.error);setLd(false)}}catch(e){setErr(e.message);setLd(false)}})()},[]);

  useEffect(()=>{if(!tok)return;setLd(true);setErr(null);setLm("Récupération…");(async()=>{try{
    const[a1,a2,t1,t2,rec,prof,pls]=await Promise.all([
      sp(`/me/top/artists?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/artists?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp(`/me/top/tracks?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/tracks?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp("/me/player/recently-played?limit=50",tok),sp("/me",tok),
      sp("/me/playlists?limit=50",tok).catch(()=>({items:[]})),
    ]);
    const tA=[...(a1.items||[]),...(a2.items||[])],tT=[...(t1.items||[]),...(t2.items||[])],ri=rec.items||[];
    setPlaylists(pls.items||[]);
    const totMin=ri.reduce((s,i)=>s+(i.track?.duration_ms||0),0)/60000;
    const am={};ri.forEach(i=>{const t=i.track;if(!t)return;const d=(t.duration_ms||0)/60000;(t.artists||[]).forEach(a=>{if(!am[a.id])am[a.id]={name:a.name,id:a.id,min:0,plays:0};am[a.id].min+=d;am[a.id].plays++})});
    const abt=Object.values(am).sort((a,b)=>b.min-a.min);
    const tm={};ri.forEach(i=>{const t=i.track;if(!t)return;if(!tm[t.id])tm[t.id]={...t,plays:0,totMin:0};tm[t.id].plays++;tm[t.id].totMin+=(t.duration_ms||0)/60000});
    const tbp=Object.values(tm).sort((a,b)=>b.plays-a.plays);
    const hr=Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0}));ri.forEach(i=>{const h=new Date(i.played_at).getHours();hr[h].nb++;hr[h].min+=(i.track?.duration_ms||0)/60000});
    const avgDur=tT.length>0?tT.reduce((s,t)=>s+(t.duration_ms||0),0)/tT.length/60000:0;
    // Diversity: unique artists / total tracks
    const uaSet=new Set();tT.forEach(t=>(t.artists||[]).forEach(a=>uaSet.add(a.id)));
    const diversity=Math.round((uaSet.size/Math.max(tT.length,1))*100);

    setData({tA,tT,ri,prof,totMin,abt,tbp,hr,avgDur,diversity});
    setMbL(true);setMbP(`0/${tA.length}`);
    enrichAll(tA,(partial,done)=>{setMb(partial);setMbP(`${done}/${tA.length}`)}).then(r=>{setMb(r);setMbL(false)});
  }catch(e){setErr(e.message)}finally{setLd(false)}})()},[tok,tr]);

  // Generate suggestions when mb data is ready
  useEffect(()=>{
    if(mbL||!data||Object.keys(mb).length===0)return;
    const tA=data.tA;const knownNames=new Set(tA.map(a=>a.name.toLowerCase()));
    // Build genre+country combos ranked by frequency
    const combos={};
    tA.forEach(a=>{const m=mb[a.id];if(!m||!m.countryCode)return;(m.genres||[]).forEach(g=>{const k=`${g}|||${m.countryCode}`;if(!combos[k])combos[k]={genre:g,code:m.countryCode,country:m.country,count:0};combos[k].count++})});
    const topCombos=Object.values(combos).sort((a,b)=>b.count-a.count).slice(0,6);
    // Also add top genres without country constraint
    const genreOnly={};
    tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{genreOnly[g]=(genreOnly[g]||0)+1})});
    const topGenresOnly=Object.entries(genreOnly).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g,c])=>({genre:g,code:null,country:null,count:c}));
    const allSearches=[...topCombos,...topGenresOnly];

    setSugL(true);
    (async()=>{
      const results=[];
      for(const combo of allSearches.slice(0,8)){
        const artists=await searchMBArtists(combo.genre,combo.code,15);
        const filtered=artists.filter(a=>!knownNames.has(a.name.toLowerCase()));
        if(filtered.length>0){
          results.push({genre:combo.genre,country:combo.country,artists:filtered.slice(0,6)});
        }
        await new Promise(r=>setTimeout(r,1200));
      }
      setSuggestions(results);setSugL(false);
    })();
  },[mb,mbL,data]);

  useEffect(()=>{if(!tok)return;const f=()=>{sp("/me/player",tok).then(setPl).catch(()=>setPl(null));sp("/me/player/devices",tok).then(d=>setDevs(d?.devices||[])).catch(()=>{})};f();pi.current=setInterval(f,5000);return()=>clearInterval(pi.current)},[tok]);

  const cmd=async a=>{try{if(a==="play")await sp("/me/player/play",tok,{method:"PUT"});else if(a==="pause")await sp("/me/player/pause",tok,{method:"PUT"});else if(a==="next")await sp("/me/player/next",tok,{method:"POST"});else if(a==="prev")await sp("/me/player/previous",tok,{method:"POST"});else if(a==="shuffle")await sp(`/me/player/shuffle?state=${!pl?.shuffle_state}`,tok,{method:"PUT"});else if(a==="repeat"){const m=["off","context","track"];await sp(`/me/player/repeat?state=${m[(m.indexOf(pl?.repeat_state||"off")+1)%3]}`,tok,{method:"PUT"})}setTimeout(()=>sp("/me/player",tok).then(setPl).catch(()=>{}),500)}catch{}};
  const play=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({uris:[u]})})}catch{}};
  const playCtx=async uri=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:uri})})}catch{}};
  const mkPl=async(n,uris)=>{try{const p=await sp(`/users/${data.prof.id}/playlists`,tok,{method:"POST",body:JSON.stringify({name:n,public:false})});if(p?.id)await sp(`/playlists/${p.id}/tracks`,tok,{method:"POST",body:JSON.stringify({uris:uris.slice(0,100)})});alert(`Playlist "${n}" créée !`)}catch{alert("Erreur")}};
  // Search Spotify for an artist name and play their top track
  const searchAndPlay=async name=>{try{const r=await sp(`/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,tok);const a=r?.artists?.items?.[0];if(a){const uri=`spotify:artist:${a.id}`;await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:uri})})}}catch{}};

  const login=useCallback(async()=>{if(!cid.trim())return;const v=genV(),ch=await genC(v);sessionStorage.setItem("sp_verifier",v);sessionStorage.setItem("sp_client_id",cid.trim());const u=new URL("https://accounts.spotify.com/authorize");u.searchParams.set("client_id",cid.trim());u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",REDIRECT_URI);u.searchParams.set("scope",SCOPES);u.searchParams.set("code_challenge_method","S256");u.searchParams.set("code_challenge",ch);window.location.href=u.toString()},[cid]);

  const spin=<style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>;
  if(ld)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut,fontSize:14}}>{lm}</p></div>{spin}</div>;
  if(err&&!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}><p style={{color:C.red,fontSize:14,marginBottom:20}}>{err}</p><button onClick={()=>setErr(null)} style={{padding:"12px 24px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if(!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}}><div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:48,marginBottom:12}}>🎧</div><h1 style={{color:C.txt,fontSize:28,fontWeight:700,margin:0}}>Your Spotify, Uncovered.</h1><p style={{color:C.mut,marginTop:8,fontSize:14}}>Ton analyse complète</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.brd}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSu(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:su===k?C.grn:C.mut,borderBottom:`2px solid ${su===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{su==="input"?<div><label style={{color:C.mut,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={cid} onChange={e=>setCid(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.mut,fontSize:11,marginTop:8}}>Redirect URI: <code style={{color:C.acc}}>{REDIRECT_URI}</code></p><button onClick={login} disabled={!cid.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:cid.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:cid.trim()?"#000":C.mut,fontSize:15,fontWeight:700,cursor:cid.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.mut,lineHeight:1.8}}><p><span style={{color:C.grn,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.acc}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.grn,fontWeight:700}}>2.</span> Redirect URI: <code style={{color:C.acc}}>{REDIRECT_URI}</code></p><p><span style={{color:C.grn,fontWeight:700}}>3.</span> APIs: Web API</p><p><span style={{color:C.grn,fontWeight:700}}>4.</span> Copie Client ID → colle → connecte</p></div>}</Card></div></div>;
  if(!data)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut}}>{lm}</p></div>{spin}</div>;

  const{tA,tT,ri,prof,totMin,abt,tbp,hr,avgDur,diversity}=data;
  const gc={},cc={},abg={},abc={};
  tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gc[g]=(gc[g]||0)+1;if(!abg[g])abg[g]=[];abg[g].push(a)});if(m.country){cc[m.country]=(cc[m.country]||0)+1;if(!abc[m.country])abc[m.country]=[];abc[m.country].push(a)}});
  const tg=Object.entries(gc).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([n,c])=>({name:n,count:c}));
  const tc=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({name:n,count:c}));

  // Genre per hour from recent plays
  const genrePerHour=hr.map((h,idx)=>{
    const hourTracks=ri.filter(i=>new Date(i.played_at).getHours()===idx);
    const hgc={};
    hourTracks.forEach(i=>{(i.track?.artists||[]).forEach(a=>{const m=mb[a.id];if(m)(m.genres||[]).forEach(g=>{hgc[g]=(hgc[g]||0)+1})})});
    const top=Object.entries(hgc).sort((a,b)=>b[1]-a[1])[0];
    return{...h,genre:top?top[0]:null};
  });

  const enriched=Object.keys(mb).length;
  const TL={short_term:"4 semaines",medium_term:"6 mois",long_term:"Tout le temps"};
  const np=pl?.item;
  const tabs=[["overview","📊 Overview"],["artists","🎤 Artistes"],["tracks","🎵 Titres"],["genres","🎨 Genres"],["countries","🌍 Pays"],["trends","📈 Tendances"],["discover","🔮 Découvertes"],["playlists","📋 Playlists"],["history","🕐 Historique"],["player","🎮 Lecteur"]];
  const drillA=drill?drill.artists:[];const drillT=drill?tT.filter(t=>(t.artists||[]).some(a=>drillA.some(d=>d.id===a.id))):[];

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.txt,padding:"20px 16px 80px",maxWidth:1200,margin:"0 auto"}}>
      {drill&&<><div onClick={()=>setDrill(null)} style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.6)",zIndex:999}} /><DrillDown title={drill.title} artists={drillA} tracks={drillT} mb={mb} onClose={()=>setDrill(null)} onPlay={play} onMkPl={mkPl} /></>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>{prof.images?.[0]&&<img src={prof.images[0].url} alt="" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.grn}`}} />}<div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>{prof.display_name}</h1><p style={{margin:0,color:C.mut,fontSize:11}}>{TL[tr]} · {tA.length} artistes · {tT.length} titres</p></div></div>
        <div style={{display:"flex",gap:6}}>{Object.entries(TL).map(([k,l])=><button key={k} onClick={()=>setTr(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:tr===k?C.grn:C.card,border:`1px solid ${tr===k?C.grn:C.brd}`,color:tr===k?"#000":C.mut,cursor:"pointer",fontWeight:tr===k?700:400}}>{l}</button>)}</div>
      </div>
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.brd}`,overflowX:"auto"}}>{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"10px 12px",background:"none",border:"none",color:tab===k?C.grn:C.mut,borderBottom:`2px solid ${tab===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:12,fontWeight:tab===k?600:400,marginBottom:-1,whiteSpace:"nowrap"}}>{l}</button>)}</div>
      {mbL&&<p style={{color:C.mut,fontSize:11,marginBottom:12,fontStyle:"italic"}}>⏳ MusicBrainz… {mbP}</p>}

      {/* ═══ OVERVIEW ═══ */}
      {tab==="overview"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <SC label="Artistes" value={tA.length} icon="🎤" />
          <SC label="Titres" value={tT.length} icon="🎵" />
          <SC label="Temps écouté" value={fmt(totMin)} sub="50 dernières" icon="⏱" />
          <SC label="Diversité" value={`${diversity}%`} sub="artistes/titres" icon="🎲" />
          {tg.length>0&&<SC label="Genre #1" value={tg[0].name} sub={`${tg[0].count} artistes`} icon="🎨" />}
          {tc.length>0&&<SC label="Pays #1" value={tc[0].name} sub={`${tc[0].count} artistes`} icon="🌍" />}
        </div>
        {np&&<Card style={{marginBottom:20,background:`linear-gradient(135deg,${C.card},${C.sf})`}}><Lbl>En cours</Lbl><div style={{display:"flex",alignItems:"center",gap:16}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:56,height:56,borderRadius:8}} />}<div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>{np.name}</div><div style={{color:C.mut,fontSize:12}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{display:"flex",gap:8}}><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.txt,fontSize:18,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(pl?.is_playing?"pause":"play")} style={{background:C.grn,border:"none",color:"#000",fontSize:18,cursor:"pointer",borderRadius:"50%",width:40,height:40}}>{pl?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.txt,fontSize:18,cursor:"pointer"}}>⏭</button></div></div></Card>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><Lbl>Top 5 artistes — {TL[tr]}</Lbl>{tA.slice(0,5).map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:11,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>🎤</div>}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:10}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</Card>
          <Card><Lbl>Top 5 titres — {TL[tr]}</Lbl>{tT.slice(0,5).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:11,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:6}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:10}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><span style={{fontSize:10,opacity:0.4}}>▶</span></div>)}</Card>
        </div>
      </>}

      {/* ═══ ARTISTS ═══ */}
      {tab==="artists"&&<><div style={{marginBottom:16}}><button onClick={()=>mkPl(`Top Mix — ${TL[tr]}`,tT.slice(0,50).map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Créer playlist top 50</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tA.length} — {TL[tr]}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tA.map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:32,height:32,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🎤</div>}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:9}}>{(m.genres||[]).slice(0,2).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</div></Card><Card><Lbl>Temps d'écoute récent</Lbl>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(600,abt.slice(0,15).length*36)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.min)}))} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${v} min`]} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.mut}}>Pas de données</p>}</Card></div></>}

      {/* ═══ TRACKS ═══ */}
      {tab==="tracks"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tT.length} — {TL[tr]}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";;return<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />:<div style={{width:32,height:32,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{d}</div><span style={{fontSize:10,opacity:0.4}}>▶</span></div>})}</div></Card><Card><Lbl>Plus joués récemment</Lbl>{tbp.slice(0,20).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x · {fmt(t.totMin)}</div></div>)}</Card></div>}

      {/* ═══ GENRES ═══ */}
      {tab==="genres"&&(tg.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Genres — {TL[tr]}</Lbl><ResponsiveContainer width="100%" height={340}><PieChart><Pie data={tg.slice(0,10)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={50} paddingAngle={3} label={({name,percent})=>percent>0.04?name:""} labelLine={false} onClick={d=>{if(abg[d.name])setDrill({title:`Genre: ${d.name}`,artists:abg[d.name]})}}>{tg.slice(0,10).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer><p style={{color:C.mut,fontSize:10,textAlign:"center",fontStyle:"italic"}}>Clique pour voir les artistes</p></Card><Card><Lbl>Détail — {TL[tr]}</Lbl>{tg.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abg[g.name])setDrill({title:`Genre: ${g.name}`,artists:abg[g.name]})}}><div style={{width:10,height:10,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:12}}>{g.name}</div><div style={{width:80,height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(g.count/tg[0].count)*100}%`,height:"100%",borderRadius:2,background:CL[i%CL.length]}} /></div><span style={{color:C.mut,fontSize:11,fontFamily:"monospace",width:24,textAlign:"right"}}>{g.count}</span></div>)}</Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`⏳ ${mbP}`:"Pas de données"}</p></Card>)}

      {/* ═══ COUNTRIES ═══ */}
      {tab==="countries"&&(tc.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Pays — {TL[tr]}</Lbl><ResponsiveContainer width="100%" height={340}><PieChart><Pie data={tc.slice(0,10)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={50} paddingAngle={3} label={({name,percent})=>percent>0.04?name:""} labelLine={false} onClick={d=>{if(abc[d.name])setDrill({title:`Pays: ${d.name}`,artists:abc[d.name]})}}>{tc.slice(0,10).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer><p style={{color:C.mut,fontSize:10,textAlign:"center",fontStyle:"italic"}}>Clique pour voir les artistes</p></Card><Card><Lbl>Détail — {TL[tr]}</Lbl>{tc.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abc[c.name])setDrill({title:`Pays: ${c.name}`,artists:abc[c.name]})}}><div style={{width:10,height:10,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:13}}>{c.name}</div><div style={{width:80,height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(c.count/tc[0].count)*100}%`,height:"100%",borderRadius:2,background:CL[i%CL.length]}} /></div><span style={{color:C.mut,fontSize:11,fontFamily:"monospace",width:24,textAlign:"right"}}>{c.count}</span></div>)}</Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`⏳ ${mbP}`:"Pas de données"}</p></Card>)}

      {/* ═══ TRENDS (genre per hour) ═══ */}
      {tab==="trends"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Écoutes par heure</Lbl><ResponsiveContainer width="100%" height={300}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${v} écoutes`]} /><Bar dataKey="nb" fill={C.grn} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card>
        <Card><Lbl>Genre dominant par heure</Lbl>
          <div style={{maxHeight:500,overflowY:"auto"}}>
            {genrePerHour.filter(h=>h.nb>0).map((h,i)=>(
              <div key={h.h} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:h.genre&&abg[h.genre]?"pointer":"default"}} onClick={()=>{if(h.genre&&abg[h.genre])setDrill({title:`Genre ${h.h}: ${h.genre}`,artists:abg[h.genre]})}}>
                <span style={{color:C.grn,fontSize:13,fontWeight:700,fontFamily:"monospace",width:32}}>{h.h}</span>
                <div style={{flex:1}}>
                  {h.genre?<span style={{color:C.txt,fontSize:12,fontWeight:500}}>{h.genre}</span>:<span style={{color:C.mut,fontSize:12}}>—</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:60,height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(h.nb/Math.max(...hr.map(x=>x.nb),1))*100}%`,height:"100%",borderRadius:2,background:CL[i%CL.length]}} /></div>
                  <span style={{color:C.mut,fontSize:10,fontFamily:"monospace",width:16}}>{h.nb}</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{color:C.mut,fontSize:9,marginTop:12,fontStyle:"italic"}}>Basé sur les 50 dernières écoutes. Clique pour voir les artistes du genre.</p>
        </Card>
      </div>}

      {/* ═══ DISCOVER ═══ */}
      {tab==="discover"&&<div>
        <Card style={{marginBottom:16}}>
          <Lbl>🔮 Suggestions basées sur ton profil — {TL[tr]}</Lbl>
          <p style={{color:C.mut,fontSize:12,marginBottom:16}}>
            Artistes que tu ne connais pas encore, trouvés en croisant tes genres et pays préférés via MusicBrainz.
            Clique pour écouter sur Spotify.
          </p>
          {sugL&&<p style={{color:C.mut,fontSize:11,fontStyle:"italic"}}>⏳ Recherche de suggestions…</p>}
          {suggestions.length===0&&!sugL&&<p style={{color:C.mut,fontSize:12}}>Pas encore de suggestions. Attends que l'enrichissement MusicBrainz se termine.</p>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {suggestions.map((s,si)=>(
              <Card key={si} style={{padding:18,background:C.sf}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:14}}>🎯</span>
                  <div>
                    <div style={{color:C.acc,fontSize:13,fontWeight:600}}>{s.genre}</div>
                    {s.country&&<div style={{color:C.mut,fontSize:10}}>{s.country}</div>}
                  </div>
                </div>
                {s.artists.map((a,ai)=>(
                  <div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>searchAndPlay(a.name)}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:CL[(si*3+ai)%CL.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#000",fontWeight:700}}>{a.name[0]}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                      <div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).join(", ")}{a.country?` · ${a.country}`:""}</div>
                    </div>
                    <span style={{fontSize:10,color:C.grn}}>▶</span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </Card>
      </div>}

      {/* ═══ PLAYLISTS ═══ */}
      {tab==="playlists"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <Lbl>Mes playlists ({playlists.length})</Lbl>
          <div style={{maxHeight:700,overflowY:"auto"}}>
            {playlists.map((p,i)=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>playCtx(p.uri)}>
                {p.images?.[0]?<img src={p.images[0].url} alt="" style={{width:44,height:44,borderRadius:6,objectFit:"cover"}} />:<div style={{width:44,height:44,borderRadius:6,background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📋</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.txt,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                  <div style={{color:C.mut,fontSize:10}}>{p.tracks?.total||0} titres · {p.owner?.display_name}</div>
                </div>
                <span style={{fontSize:10,color:C.grn}}>▶</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Lbl>Playlists dans tes écoutes récentes</Lbl>
          {(()=>{
            // Match recent tracks to playlists (by track presence)
            const recentTrackIds=new Set(ri.map(i=>i.track?.id).filter(Boolean));
            // We can't easily match without fetching playlist tracks, so show a note
            return<div>
              <p style={{color:C.mut,fontSize:12,lineHeight:1.6,marginBottom:16}}>
                Les playlists les plus écoutées sont visibles dans l'onglet Historique.
                Clique sur une playlist à gauche pour la jouer directement.
              </p>
              <Lbl>Actions rapides</Lbl>
              <button onClick={()=>mkPl(`Top ${TL[tr]}`,tT.slice(0,50).map(t=>t.uri))} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                📋 Créer "Top {TL[tr]}" ({Math.min(tT.length,50)} titres)
              </button>
              <button onClick={()=>{const uris=tbp.slice(0,30).map(t=>t.uri);mkPl("Most Replayed",uris)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                🔁 Créer "Most Replayed" ({Math.min(tbp.length,30)} titres)
              </button>
              {tg.length>0&&<button onClick={()=>{const artists=abg[tg[0].name]||[];const uris=tT.filter(t=>(t.artists||[]).some(a=>artists.some(ar=>ar.id===a.id))).slice(0,50).map(t=>t.uri);if(uris.length)mkPl(`Best of ${tg[0].name}`,uris)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                🎨 Créer "Best of {tg[0].name}" (top genre)
              </button>}
              {tc.length>0&&<button onClick={()=>{const artists=abc[tc[0].name]||[];const uris=tT.filter(t=>(t.artists||[]).some(a=>artists.some(ar=>ar.id===a.id))).slice(0,50).map(t=>t.uri);if(uris.length)mkPl(`Best of ${tc[0].name}`,uris)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",textAlign:"left"}}>
                🌍 Créer "Best of {tc[0].name}" (top pays)
              </button>}
            </div>;
          })()}
        </Card>
      </div>}

      {/* ═══ HISTORY ═══ */}
      {tab==="history"&&<Card><Lbl>50 dernières écoutes</Lbl><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:28,height:28,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>})}</div></Card>}

      {/* ═══ PLAYER ═══ */}
      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card>{np?<div><div style={{display:"flex",gap:16,marginBottom:20}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:120,height:120,borderRadius:12}} />}<div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div><div style={{color:C.mut,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div><div style={{color:C.mut,fontSize:11,marginTop:4}}>{np.album?.name}</div>{pl?.progress_ms&&np.duration_ms&&<div style={{marginTop:12}}><div style={{width:"100%",height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(pl.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.grn,borderRadius:2}} /></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(pl.progress_ms/60000)}</span><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div></div>}</div></div><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12}}><button onClick={()=>cmd("shuffle")} style={{background:"none",border:"none",color:pl?.shuffle_state?C.grn:C.mut,fontSize:16,cursor:"pointer"}}>🔀</button><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.txt,fontSize:20,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(pl?.is_playing?"pause":"play")} style={{background:C.grn,border:"none",color:"#000",fontSize:22,cursor:"pointer",borderRadius:"50%",width:52,height:52}}>{pl?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.txt,fontSize:20,cursor:"pointer"}}>⏭</button><button onClick={()=>cmd("repeat")} style={{background:"none",border:"none",color:pl?.repeat_state!=="off"?C.grn:C.mut,fontSize:16,cursor:"pointer"}}>{pl?.repeat_state==="track"?"🔂":"🔁"}</button></div></div>:<div style={{textAlign:"center",padding:40}}><div style={{fontSize:40,opacity:0.3}}>🎵</div><p style={{color:C.mut,fontSize:13,marginTop:16}}>Ouvre Spotify quelque part</p></div>}</Card><Card><Lbl>Appareils</Lbl>{devs.length>0?devs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":d.type==="Speaker"?"🔊":"📺"}</span><div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.mut,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<span style={{color:C.grn,fontSize:10,fontWeight:600}}>ACTIF</span>}</div>):<p style={{color:C.mut,fontSize:13}}>Aucun appareil</p>}</Card></div>}

      <div style={{textAlign:"center",marginTop:40,color:C.mut,fontSize:10}}>Spotify API · MusicBrainz ({enriched}/{tA.length}) · <button onClick={()=>{setTok(null);setData(null);setMb({});setSuggestions([])}} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}