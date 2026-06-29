import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const REDIRECT_URI = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read","user-read-recently-played","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-modify-public","playlist-modify-private","playlist-read-private","playlist-read-collaborative"].join(" ");

function genV(n=128){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>c[b%c.length]).join("")}
async function genC(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
async function sp(e,t,o={}){const r=await fetch(`https://api.spotify.com/v1${e}`,{headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},...o});if(r.status===204)return null;if(!r.ok)throw new Error(`${r.status}`);return r.json()}

const ISO={"AF":"Afghanistan","AL":"Albanie","DZ":"Algérie","AR":"Argentine","AM":"Arménie","AU":"Australie","AT":"Autriche","AZ":"Azerbaïdjan","BD":"Bangladesh","BY":"Biélorussie","BE":"Belgique","BO":"Bolivie","BA":"Bosnie-Herzégovine","BR":"Brésil","BG":"Bulgarie","CA":"Canada","CL":"Chili","CN":"Chine","CO":"Colombie","HR":"Croatie","CU":"Cuba","CY":"Chypre","CZ":"Tchéquie","DK":"Danemark","DO":"Rép. Dominicaine","EC":"Équateur","EG":"Égypte","EE":"Estonie","FI":"Finlande","FR":"France","GE":"Géorgie","DE":"Allemagne","GH":"Ghana","GR":"Grèce","GT":"Guatemala","HU":"Hongrie","IS":"Islande","IN":"Inde","ID":"Indonésie","IR":"Iran","IQ":"Irak","IE":"Irlande","IL":"Israël","IT":"Italie","JM":"Jamaïque","JP":"Japon","JO":"Jordanie","KZ":"Kazakhstan","KE":"Kenya","KR":"Corée du Sud","LV":"Lettonie","LB":"Liban","LT":"Lituanie","LU":"Luxembourg","MY":"Malaisie","MX":"Mexique","MA":"Maroc","NL":"Pays-Bas","NZ":"Nouvelle-Zélande","NG":"Nigeria","NO":"Norvège","PK":"Pakistan","PA":"Panama","PY":"Paraguay","PE":"Pérou","PH":"Philippines","PL":"Pologne","PT":"Portugal","RO":"Roumanie","RU":"Russie","SA":"Arabie Saoudite","SN":"Sénégal","RS":"Serbie","SG":"Singapour","SK":"Slovaquie","SI":"Slovénie","ZA":"Afrique du Sud","ES":"Espagne","SE":"Suède","CH":"Suisse","TW":"Taïwan","TH":"Thaïlande","TN":"Tunisie","TR":"Turquie","UA":"Ukraine","AE":"Émirats arabes unis","GB":"Royaume-Uni","US":"États-Unis","UY":"Uruguay","VE":"Venezuela","VN":"Vietnam","XW":"Monde","XE":"Europe","PR":"Porto Rico"};

// Words that are nationalities/origins, NOT genres
const ORIGINS=new Set(["swedish","finnish","norwegian","danish","icelandic","german","austrian","swiss","french","italian","spanish","portuguese","brazilian","british","english","american","canadian","australian","japanese","korean","chinese","russian","polish","czech","hungarian","romanian","greek","turkish","mexican","colombian","argentinian","chilean","peruvian","cuban","dutch","belgian","irish","scottish","welsh","south african","new zealand","indian","indonesian","thai","vietnamese","filipino","egyptian","moroccan","nigerian","ghanaian","kenyan","senegalese","jamaican","puerto rican","latin american","european","scandinavian","nordic","baltic","slavic","african","asian","middle eastern","caribbean"]);
const GENERIC=new Set(["rock","metal","pop","electronic","hip hop","jazz","classical","country","blues","folk","soul","punk","alternative","indie","r&b","dance","reggae","latin"]);

function filterGenres(tags){
  // Remove origin/nationality tags
  const cleaned=tags.filter(t=>!ORIGINS.has(t.toLowerCase())&&!t.toLowerCase().startsWith("british ")&&!t.toLowerCase().startsWith("american "));
  const specific=cleaned.filter(t=>!GENERIC.has(t.toLowerCase()));
  return specific.length>=2?specific.slice(0,5):[...specific,...cleaned.filter(t=>GENERIC.has(t.toLowerCase()))].slice(0,5);
}

async function fetchMB(name){
  try{
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});
    if(!r.ok)return null;const d=await r.json(),a=d.artists?.[0];if(!a||a.score<80)return null;
    const allTags=(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name);
    const genres=filterGenres(allTags);
    const code=a.country||null;
    return{genres,country:code?ISO[code]||code:null,countryCode:code};
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

async function searchMBArtists(tag,cc,limit=15){
  try{
    const q=cc?`tag:"${tag}" AND country:${cc}`:`tag:"${tag}"`;
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=${limit}&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});
    if(!r.ok)return[];const d=await r.json();
    return(d.artists||[]).filter(a=>a.score>70).map(a=>({name:a.name,mbid:a.id,country:a.country?ISO[a.country]||a.country:null,tags:filterGenres((a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name)),type:a.type}));
  }catch{return[]}
}

// Enrich suggestions with Spotify data (images + URI)
async function enrichSuggestionsWithSpotify(suggestions,token){
  const enriched=[];
  for(const group of suggestions){
    const ea=[];
    for(const a of group.artists){
      try{
        const r=await sp(`/search?q=${encodeURIComponent(a.name)}&type=artist&limit=1`,token);
        const sa=r?.artists?.items?.[0];
        ea.push({...a,spotifyId:sa?.id||null,image:sa?.images?.[0]?.url||null,uri:sa?.uri||null});
      }catch{ea.push({...a,spotifyId:null,image:null,uri:null})}
    }
    enriched.push({...group,artists:ea});
  }
  return enriched;
}

const C={bg:"#0D0D0D",sf:"#161616",card:"#1C1C1C",brd:"#2A2A2A",grn:"#1DB954",txt:"#FFF",mut:"#888",acc:"#B3FF5C",dim:"#333",red:"#FF6B6B"};
const CL=["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD","#10AC84","#FDA7DF","#C44569","#3DC1D3","#778BEB","#E77F67"];

function Card({children,style={},onClick}){return<div onClick={onClick} style={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:16,padding:24,cursor:onClick?"pointer":"default",...style}}>{children}</div>}
function Lbl({children}){return<p style={{color:C.mut,fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>{children}</p>}
function SC({label,value,sub,icon,onClick}){return<Card onClick={onClick} style={{padding:18,transition:"border-color 0.2s"}}><div style={{display:"flex",justifyContent:"space-between"}}><Lbl>{label}</Lbl>{icon&&<span style={{fontSize:18}}>{icon}</span>}</div><div style={{fontSize:24,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.mut,marginTop:6}}>{sub}</div>}</Card>}
function fmt(m){if(m<1)return"<1min";if(m<60)return`${Math.round(m)}min`;const h=Math.floor(m/60);return`${h}h${Math.round(m%60)>0?String(Math.round(m%60)).padStart(2,"0"):""}`}

function DrillDown({title,artists,tracks,mb,onClose,onPlay,onMkPl}){
  return(<div style={{position:"fixed",top:0,right:0,width:500,maxWidth:"100vw",height:"100vh",background:C.card,borderLeft:`1px solid ${C.brd}`,zIndex:1000,overflowY:"auto",padding:24,boxSizing:"border-box"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.txt}}>{title}</h2><button onClick={onClose} style={{background:"none",border:"none",color:C.mut,fontSize:24,cursor:"pointer"}}>✕</button></div>
    <Lbl>{artists.length} artistes</Lbl>
    {tracks.length>0&&<button onClick={()=>onMkPl(`${title} Mix`,tracks.slice(0,100).map(t=>t.uri))} style={{padding:"6px 14px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:16}}>📋 Playlist ({Math.min(tracks.length,100)} titres)</button>}
    {artists.map((a,i)=>{const m=mb[a.id];const at=tracks.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id));return<div key={a.id||i} style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🎤</div>}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:600}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:10}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>{at.length>0&&<div style={{marginLeft:66}}>{at.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",cursor:"pointer",borderBottom:`1px solid ${C.brd}`}} onClick={()=>onPlay(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:22,height:22,borderRadius:3}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{fontSize:9,color:C.grn}}>▶</span></div>)}</div>}</div>})}
  </div>);
}

export default function App(){
  const[cid,setCid]=useState(()=>localStorage.getItem("sp_client_id")||"");
  const[tok,setTok]=useState(null);const[ld,setLd]=useState(true);const[lm,setLm]=useState("Connexion…");
  const[err,setErr]=useState(null);const[data,setData]=useState(null);
  const[mb,setMb]=useState({});const[mbL,setMbL]=useState(false);const[mbP,setMbP]=useState("");
  const[tr,setTr]=useState("medium_term");const[tab,setTab]=useState("overview");const[su,setSu]=useState("input");
  const[pl,setPl]=useState(null);const[devs,setDevs]=useState([]);const[drill,setDrill]=useState(null);
  const[playlists,setPlaylists]=useState([]);
  const[sug,setSug]=useState([]);const[sugL,setSugL]=useState(false);
  const[customG,setCustomG]=useState("");const[customC,setCustomC]=useState("");const[customRes,setCustomRes]=useState([]);const[customL,setCustomL]=useState(false);
  const pi=useRef(null);

  useEffect(()=>{const code=sessionStorage.getItem("sp_code");if(!code){setLd(false);return}const v=sessionStorage.getItem("sp_verifier"),s=sessionStorage.getItem("sp_client_id");if(!v||!s){setLd(false);return}sessionStorage.removeItem("sp_code");(async()=>{try{const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:s,grant_type:"authorization_code",code,redirect_uri:REDIRECT_URI,code_verifier:v})});const j=await r.json();if(j.access_token){setTok(j.access_token);localStorage.setItem("sp_client_id",s)}else{setErr(j.error_description||j.error);setLd(false)}}catch(e){setErr(e.message);setLd(false)}})()},[]);

  useEffect(()=>{if(!tok)return;setLd(true);setErr(null);setLm("Récupération…");(async()=>{try{
    const[a1,a2,t1,t2,rec,prof,pls]=await Promise.all([
      sp(`/me/top/artists?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/artists?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp(`/me/top/tracks?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/tracks?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp("/me/player/recently-played?limit=50",tok),sp("/me",tok),
      sp("/me/playlists?limit=50&offset=0",tok).catch(()=>({items:[]}))]);
    const pls2=await sp("/me/playlists?limit=50&offset=50",tok).catch(()=>({items:[]}));
    const tA=[...(a1.items||[]),...(a2.items||[])],tT=[...(t1.items||[]),...(t2.items||[])],ri=rec.items||[];
    setPlaylists([...(pls.items||[]),...(pls2.items||[])]);
    const totMin=ri.reduce((s,i)=>s+(i.track?.duration_ms||0),0)/60000;
    const am={};ri.forEach(i=>{const t=i.track;if(!t)return;const d=(t.duration_ms||0)/60000;(t.artists||[]).forEach(a=>{if(!am[a.id])am[a.id]={name:a.name,id:a.id,min:0,plays:0};am[a.id].min+=d;am[a.id].plays++})});
    const abt=Object.values(am).sort((a,b)=>b.min-a.min);
    const tm={};ri.forEach(i=>{const t=i.track;if(!t)return;if(!tm[t.id])tm[t.id]={...t,plays:0,totMin:0};tm[t.id].plays++;tm[t.id].totMin+=(t.duration_ms||0)/60000});
    const tbp=Object.values(tm).sort((a,b)=>b.plays-a.plays);
    const hr=Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0}));ri.forEach(i=>{const h=new Date(i.played_at).getHours();hr[h].nb++;hr[h].min+=(i.track?.duration_ms||0)/60000});
    const avgDur=tT.length>0?tT.reduce((s,t)=>s+(t.duration_ms||0),0)/tT.length/60000:0;
    const uaSet=new Set();tT.forEach(t=>(t.artists||[]).forEach(a=>uaSet.add(a.id)));
    const diversity=Math.round((uaSet.size/Math.max(tT.length,1))*100);
    setData({tA,tT,ri,prof,totMin,abt,tbp,hr,avgDur,diversity});
    setMbL(true);setMbP(`0/${tA.length}`);
    enrichAll(tA,(partial,done)=>{setMb(partial);setMbP(`${done}/${tA.length}`)}).then(r=>{setMb(r);setMbL(false)});
  }catch(e){setErr(e.message)}finally{setLd(false)}})()},[tok,tr]);

  // Suggestions
  useEffect(()=>{
    if(mbL||!data||!tok||Object.keys(mb).length===0)return;
    const tA=data.tA;const known=new Set(tA.map(a=>a.name.toLowerCase()));
    const combos={};
    tA.forEach(a=>{const m=mb[a.id];if(!m||!m.countryCode)return;(m.genres||[]).forEach(g=>{const k=`${g}|||${m.countryCode}`;if(!combos[k])combos[k]={genre:g,code:m.countryCode,country:m.country,count:0};combos[k].count++})});
    const topC=Object.values(combos).sort((a,b)=>b.count-a.count).slice(0,6);
    const gOnly={};tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gOnly[g]=(gOnly[g]||0)+1})});
    const topG=Object.entries(gOnly).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>({genre:g,code:null,country:null,count:0}));
    setSugL(true);
    (async()=>{
      const results=[];
      for(const c of[...topC,...topG].slice(0,8)){
        const artists=await searchMBArtists(c.genre,c.code,20);
        const filtered=artists.filter(a=>!known.has(a.name.toLowerCase()));
        if(filtered.length>0)results.push({genre:c.genre,country:c.country,artists:filtered.slice(0,8)});
        await new Promise(r=>setTimeout(r,1200));
      }
      // Enrich with Spotify images
      const enriched=await enrichSuggestionsWithSpotify(results,tok);
      setSug(enriched);setSugL(false);
    })();
  },[mb,mbL,data,tok]);

  useEffect(()=>{if(!tok)return;const f=()=>{sp("/me/player",tok).then(setPl).catch(()=>setPl(null));sp("/me/player/devices",tok).then(d=>setDevs(d?.devices||[])).catch(()=>{})};f();pi.current=setInterval(f,5000);return()=>clearInterval(pi.current)},[tok]);

  const cmd=async a=>{try{if(a==="play")await sp("/me/player/play",tok,{method:"PUT"});else if(a==="pause")await sp("/me/player/pause",tok,{method:"PUT"});else if(a==="next")await sp("/me/player/next",tok,{method:"POST"});else if(a==="prev")await sp("/me/player/previous",tok,{method:"POST"});else if(a==="shuffle")await sp(`/me/player/shuffle?state=${!pl?.shuffle_state}`,tok,{method:"PUT"});else if(a==="repeat"){const m=["off","context","track"];await sp(`/me/player/repeat?state=${m[(m.indexOf(pl?.repeat_state||"off")+1)%3]}`,tok,{method:"PUT"})}setTimeout(()=>sp("/me/player",tok).then(setPl).catch(()=>{}),500)}catch{}};
  const play=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({uris:[u]})})}catch{}};
  const playCtx=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:u})})}catch{}};
  const playArtist=async id=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:`spotify:artist:${id}`})})}catch{}};
  const mkPl=async(n,uris)=>{try{const p=await sp(`/users/${data.prof.id}/playlists`,tok,{method:"POST",body:JSON.stringify({name:n,public:false})});if(p?.id){for(let i=0;i<uris.length;i+=100){await sp(`/playlists/${p.id}/tracks`,tok,{method:"POST",body:JSON.stringify({uris:uris.slice(i,i+100)})});}alert(`Playlist "${n}" créée (${uris.length} titres) !`)}}catch{alert("Erreur")}};

  const customSearch=async()=>{
    if(!customG)return;setCustomL(true);setCustomRes([]);
    const known=new Set(data.tA.map(a=>a.name.toLowerCase()));
    // Find country code from ISO map
    const cc=customC?Object.entries(ISO).find(([k,v])=>v===customC)?.[0]||null:null;
    const artists=await searchMBArtists(customG,cc,25);
    const filtered=artists.filter(a=>!known.has(a.name.toLowerCase()));
    const enriched=await enrichSuggestionsWithSpotify([{genre:customG,country:customC||null,artists:filtered.slice(0,12)}],tok);
    setCustomRes(enriched);setCustomL(false);
  };

  const login=useCallback(async()=>{if(!cid.trim())return;const v=genV(),ch=await genC(v);sessionStorage.setItem("sp_verifier",v);sessionStorage.setItem("sp_client_id",cid.trim());const u=new URL("https://accounts.spotify.com/authorize");u.searchParams.set("client_id",cid.trim());u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",REDIRECT_URI);u.searchParams.set("scope",SCOPES);u.searchParams.set("code_challenge_method","S256");u.searchParams.set("code_challenge",ch);window.location.href=u.toString()},[cid]);

  const spin=<style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>;
  if(ld)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut,fontSize:14}}>{lm}</p></div>{spin}</div>;
  if(err&&!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}><p style={{color:C.red,fontSize:14,marginBottom:20}}>{err}</p><button onClick={()=>setErr(null)} style={{padding:"12px 24px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if(!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}}><div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:48,marginBottom:12}}>🎧</div><h1 style={{color:C.txt,fontSize:28,fontWeight:700,margin:0}}>Your Spotify, Uncovered.</h1><p style={{color:C.mut,marginTop:8,fontSize:14}}>Ton analyse complète</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.brd}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSu(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:su===k?C.grn:C.mut,borderBottom:`2px solid ${su===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{su==="input"?<div><label style={{color:C.mut,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={cid} onChange={e=>setCid(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.mut,fontSize:11,marginTop:8}}>Redirect URI: <code style={{color:C.acc}}>{REDIRECT_URI}</code></p><button onClick={login} disabled={!cid.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:cid.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:cid.trim()?"#000":C.mut,fontSize:15,fontWeight:700,cursor:cid.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.mut,lineHeight:1.8}}><p><span style={{color:C.grn,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.acc}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.grn,fontWeight:700}}>2.</span> Redirect URI: <code style={{color:C.acc}}>{REDIRECT_URI}</code></p><p><span style={{color:C.grn,fontWeight:700}}>3.</span> Web API</p><p><span style={{color:C.grn,fontWeight:700}}>4.</span> Copie Client ID → colle → connecte</p></div>}</Card></div></div>;
  if(!data)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut}}>{lm}</p></div>{spin}</div>;

  const{tA,tT,ri,prof,totMin,abt,tbp,hr,avgDur,diversity}=data;
  // ALL genres/countries, no limit
  const gc={},cc={},abg={},abc={};
  tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gc[g]=(gc[g]||0)+1;if(!abg[g])abg[g]=[];abg[g].push(a)});if(m.country){cc[m.country]=(cc[m.country]||0)+1;if(!abc[m.country])abc[m.country]=[];abc[m.country].push(a)}});
  const allGenres=Object.entries(gc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const allCountries=Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  // For pie: show all with count>1, group count==1 as "Autre"
  const gMain=allGenres.filter(g=>g.count>1),gMinor=allGenres.filter(g=>g.count===1);
  const pieGenres=gMinor.length>0?[...gMain,{name:"Autre",count:gMinor.length}]:gMain;
  const cMain=allCountries.filter(c=>c.count>1),cMinor=allCountries.filter(c=>c.count===1);
  const pieCountries=cMinor.length>0?[...cMain,{name:"Autre",count:cMinor.length}]:cMain;

  // Genre per hour
  const gph=hr.map((_,idx)=>{const ht=ri.filter(i=>new Date(i.played_at).getHours()===idx);const hgc={};ht.forEach(i=>(i.track?.artists||[]).forEach(a=>{const m=mb[a.id];if(m)(m.genres||[]).forEach(g=>{hgc[g]=(hgc[g]||0)+1})}));const top=Object.entries(hgc).sort((a,b)=>b[1]-a[1])[0];return{h:`${idx}h`,genre:top?top[0]:"—",nb:hr[idx].nb}});
  // Unique genres in hour data for color mapping
  const hourGenres=[...new Set(gph.map(h=>h.genre).filter(g=>g!=="—"))];
  const gphData=gph.filter(h=>h.nb>0);

  const enriched=Object.keys(mb).length;
  const TL={short_term:"4 semaines",medium_term:"6 mois",long_term:"Tout le temps"};
  const np=pl?.item;
  const tabs=[["overview","📊"],["artists","🎤"],["tracks","🎵"],["genres","🎨"],["countries","🌍"],["trends","📈"],["discover","🔮"],["playlists","📋"],["history","🕐"],["player","🎮"]];
  const tabNames={overview:"Overview",artists:"Artistes",tracks:"Titres",genres:"Genres",countries:"Pays",trends:"Tendances",discover:"Découvertes",playlists:"Playlists",history:"Historique",player:"Lecteur"};
  const drillA=drill?drill.artists:[];const drillT=drill?tT.filter(t=>(t.artists||[]).some(a=>drillA.some(d=>d.id===a.id))):[];

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.txt,padding:"20px 16px 80px",maxWidth:1200,margin:"0 auto"}}>
      {drill&&<><div onClick={()=>setDrill(null)} style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.6)",zIndex:999}} /><DrillDown title={drill.title} artists={drillA} tracks={drillT} mb={mb} onClose={()=>setDrill(null)} onPlay={play} onMkPl={mkPl} /></>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>{prof.images?.[0]&&<img src={prof.images[0].url} alt="" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.grn}`}} />}<div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>{prof.display_name}</h1><p style={{margin:0,color:C.mut,fontSize:11}}>{TL[tr]}</p></div></div>
        <div style={{display:"flex",gap:6}}>{Object.entries(TL).map(([k,l])=><button key={k} onClick={()=>setTr(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:tr===k?C.grn:C.card,border:`1px solid ${tr===k?C.grn:C.brd}`,color:tr===k?"#000":C.mut,cursor:"pointer",fontWeight:tr===k?700:400}}>{l}</button>)}</div>
      </div>
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.brd}`,overflowX:"auto"}}>{tabs.map(([k,icon])=><button key={k} onClick={()=>setTab(k)} style={{padding:"10px 12px",background:"none",border:"none",color:tab===k?C.grn:C.mut,borderBottom:`2px solid ${tab===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:12,fontWeight:tab===k?600:400,marginBottom:-1,whiteSpace:"nowrap"}}>{icon} {tabNames[k]}</button>)}</div>
      {mbL&&<p style={{color:C.mut,fontSize:11,marginBottom:12,fontStyle:"italic"}}>⏳ MusicBrainz {mbP}</p>}

      {/* OVERVIEW */}
      {tab==="overview"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <SC label="Artistes" value={tA.length} icon="🎤" onClick={()=>setTab("artists")} />
          <SC label="Durée moy." value={fmt(avgDur)} sub="par titre" icon="📏" onClick={()=>setTab("tracks")} />
          {allGenres.length>0&&<SC label="Genre #1" value={allGenres[0].name} sub={`${allGenres[0].count} artistes`} icon="🎨" onClick={()=>{if(abg[allGenres[0].name])setDrill({title:`Genre: ${allGenres[0].name}`,artists:abg[allGenres[0].name]})}} />}
          {allCountries.length>0&&<SC label="Pays #1" value={allCountries[0].name} sub={`${allCountries[0].count} artistes`} icon="🌍" onClick={()=>{if(abc[allCountries[0].name])setDrill({title:`Pays: ${allCountries[0].name}`,artists:abc[allCountries[0].name]})}} />}
          <SC label="Genres" value={allGenres.length} icon="🏷" onClick={()=>setTab("genres")} />
          <SC label="Pays" value={allCountries.length} icon="🗺" onClick={()=>setTab("countries")} />
        </div>
        {np&&<Card style={{marginBottom:20,background:`linear-gradient(135deg,${C.card},${C.sf})`}}><div style={{display:"flex",alignItems:"center",gap:16}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:56,height:56,borderRadius:8}} />}<div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{np.name}</div><div style={{color:C.mut,fontSize:12}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{display:"flex",gap:8}}><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.txt,fontSize:16,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(pl?.is_playing?"pause":"play")} style={{background:C.grn,border:"none",color:"#000",fontSize:16,cursor:"pointer",borderRadius:"50%",width:36,height:36}}>{pl?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.txt,fontSize:16,cursor:"pointer"}}>⏭</button></div></div></Card>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><Lbl>Top 5 artistes</Lbl>{tA.slice(0,5).map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>🎤</div>}<div style={{flex:1}}><div style={{color:C.txt,fontSize:12,fontWeight:500}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:9}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</Card>
          <Card><Lbl>Top 5 titres</Lbl>{tT.slice(0,5).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:6}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><span style={{fontSize:9,opacity:0.4}}>▶</span></div>)}</Card>
        </div>
      </>}

      {/* ARTISTS */}
      {tab==="artists"&&<><div style={{marginBottom:16}}><button onClick={()=>mkPl(`Top — ${TL[tr]}`,tT.map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Créer playlist ({tT.length} titres)</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tA.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tA.map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:30,height:30,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>🎤</div>}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:9}}>{(m.genres||[]).slice(0,2).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</div></Card><Card><Lbl>Temps d'écoute récent</Lbl>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(600,abt.slice(0,15).length*36)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.min)}))} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${v} min`]} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.mut}}>Pas de données</p>}</Card></div></>}

      {/* TRACKS */}
      {tab==="tracks"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tT.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";;return<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />:<div style={{width:30,height:30,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{d}</div></div>})}</div></Card><Card><Lbl>Plus joués récemment</Lbl>{tbp.map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x</div></div>)}</Card></div>}

      {/* GENRES — ALL */}
      {tab==="genres"&&(allGenres.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Genres ({allGenres.length})</Lbl><ResponsiveContainer width="100%" height={340}><PieChart><Pie data={pieGenres} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={50} paddingAngle={2} label={({name,percent})=>percent>0.04?name:""} labelLine={false} onClick={d=>{if(d.name!=="Autre"&&abg[d.name])setDrill({title:`Genre: ${d.name}`,artists:abg[d.name]})}}>{pieGenres.map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Lbl>Tous les genres ({allGenres.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allGenres.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abg[g.name])setDrill({title:`Genre: ${g.name}`,artists:abg[g.name]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:12}}>{g.name}</div><div style={{width:60,height:3,background:C.brd,borderRadius:2}}><div style={{width:`${(g.count/allGenres[0].count)*100}%`,height:"100%",borderRadius:2,background:CL[i%CL.length]}} /></div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace",width:20,textAlign:"right"}}>{g.count}</span></div>)}</div></Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`⏳ ${mbP}`:"Pas de données"}</p></Card>)}

      {/* COUNTRIES — ALL */}
      {tab==="countries"&&(allCountries.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Pays ({allCountries.length})</Lbl><ResponsiveContainer width="100%" height={340}><PieChart><Pie data={pieCountries} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={50} paddingAngle={2} label={({name,percent})=>percent>0.04?name:""} labelLine={false} onClick={d=>{if(d.name!=="Autre"&&abc[d.name])setDrill({title:`Pays: ${d.name}`,artists:abc[d.name]})}}>{pieCountries.map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Lbl>Tous les pays ({allCountries.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allCountries.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abc[c.name])setDrill({title:`Pays: ${c.name}`,artists:abc[c.name]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:13}}>{c.name}</div><div style={{width:60,height:3,background:C.brd,borderRadius:2}}><div style={{width:`${(c.count/allCountries[0].count)*100}%`,height:"100%",borderRadius:2,background:CL[i%CL.length]}} /></div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace",width:20,textAlign:"right"}}>{c.count}</span></div>)}</div></Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`⏳ ${mbP}`:"Pas de données"}</p></Card>)}

      {/* TRENDS */}
      {tab==="trends"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Écoutes par heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${v}`,"Écoutes"]} /><Bar dataKey="nb" fill={C.grn} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card>
        <Card><Lbl>Minutes par heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${Math.round(v)} min`]} /><Bar dataKey="min" fill={C.acc} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card>
        <Card style={{gridColumn:"span 2"}}><Lbl>Genre dominant par heure</Lbl>
          <ResponsiveContainer width="100%" height={Math.max(200,gphData.length*28)}>
            <BarChart data={gphData} layout="vertical" margin={{left:0,right:10}}>
              <XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="h" tick={{fill:C.grn,fontSize:11,fontWeight:700}} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n,p)=>[`${v} écoutes — ${p.payload.genre}`]} />
              <Bar dataKey="nb" radius={[0,6,6,0]}>
                {gphData.map((d,i)=>{const gi=hourGenres.indexOf(d.genre);return<Cell key={i} fill={gi>=0?CL[gi%CL.length]:C.dim} />})}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>{hourGenres.slice(0,12).map((g,i)=><div key={g} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>{if(abg[g])setDrill({title:`Genre: ${g}`,artists:abg[g]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length]}} /><span style={{color:C.mut,fontSize:10}}>{g}</span></div>)}</div>
        </Card>
      </div>}

      {/* DISCOVER */}
      {tab==="discover"&&<div>
        <Card style={{marginBottom:16}}><Lbl>🔮 Découvertes — {TL[tr]}</Lbl><p style={{color:C.mut,fontSize:12,marginBottom:8}}>Artistes que tu n'écoutes pas encore, trouvés en croisant tes genres × pays. Clique pour écouter.</p>
          {sugL&&<p style={{color:C.mut,fontSize:11,fontStyle:"italic"}}>⏳ Recherche de suggestions + images Spotify…</p>}
          {sug.length===0&&!sugL&&<p style={{color:C.mut}}>Attends la fin de l'enrichissement MusicBrainz.</p>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:16}}>
            {sug.map((s,si)=><Card key={si} style={{padding:18,background:C.sf}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:14}}>🎯</span><div><div style={{color:C.acc,fontSize:13,fontWeight:600}}>{s.genre}</div>{s.country&&<div style={{color:C.mut,fontSize:10}}>{s.country}</div>}</div></div>
              {s.artists.map((a,ai)=><div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(a.spotifyId)playArtist(a.spotifyId)}}>
                {a.image?<img src={a.image} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:CL[(si*5+ai)%CL.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#000",fontWeight:700}}>{a.name[0]}</div>}
                <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).join(", ")}{a.country?` · ${a.country}`:""}</div></div>
                {a.spotifyId&&<span style={{fontSize:11,color:C.grn}}>▶</span>}
              </div>)}
            </Card>)}
          </div>
        </Card>
        <Card style={{marginTop:16}}>
          <Lbl>🔍 Recherche personnalisée</Lbl>
          <p style={{color:C.mut,fontSize:12,marginBottom:12}}>Choisis un genre et/ou un pays pour chercher des artistes que tu ne connais pas encore.</p>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <select value={customG} onChange={e=>setCustomG(e.target.value)} style={{flex:1,minWidth:150,padding:"10px 12px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}>
              <option value="">— Genre —</option>
              {allGenres.map(g=><option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
            </select>
            <select value={customC} onChange={e=>setCustomC(e.target.value)} style={{flex:1,minWidth:150,padding:"10px 12px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}>
              <option value="">— Tous les pays —</option>
              {allCountries.map(c=><option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
            </select>
            <button onClick={customSearch} disabled={!customG||customL} style={{padding:"10px 20px",background:customG?C.grn:C.brd,border:"none",borderRadius:8,color:customG?"#000":C.mut,fontSize:12,fontWeight:600,cursor:customG?"pointer":"default"}}>
              {customL?"⏳…":"Chercher"}
            </button>
          </div>
          {customRes.length>0&&<div>
            {customRes.map((s,si)=><div key={si}>
              <div style={{color:C.acc,fontSize:13,fontWeight:600,marginBottom:8}}>{s.genre}{s.country?` · ${s.country}`:""} — {s.artists.length} résultats</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {s.artists.map((a,ai)=><div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:"8px",background:C.sf,borderRadius:10,cursor:"pointer",border:`1px solid ${C.brd}`}} onClick={()=>{if(a.spotifyId)playArtist(a.spotifyId)}}>
                  {a.image?<img src={a.image} alt="" style={{width:40,height:40,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:40,height:40,borderRadius:"50%",background:CL[ai%CL.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#000",fontWeight:700}}>{a.name[0]}</div>}
                  <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).join(", ")}{a.country?` · ${a.country}`:""}</div></div>
                  {a.spotifyId&&<span style={{fontSize:12,color:C.grn}}>▶</span>}
                </div>)}
              </div>
            </div>)}
          </div>}
        </Card>
      </div>}

      {/* PLAYLISTS */}
      {tab==="playlists"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Mes playlists ({playlists.length})</Lbl><div style={{maxHeight:700,overflowY:"auto"}}>{playlists.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>playCtx(p.uri)}>{p.images?.[0]?<img src={p.images[0].url} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover"}} />:<div style={{width:42,height:42,borderRadius:6,background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📋</div>}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div><div style={{color:C.mut,fontSize:10}}>{p.tracks?.total||0} titres</div></div><span style={{fontSize:10,color:C.grn}}>▶</span></div>)}</div></Card><Card><Lbl>Créer des playlists</Lbl>
        <button onClick={()=>mkPl(`Top — ${TL[tr]}`,tT.map(t=>t.uri))} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>📋 Top {TL[tr]} ({tT.length} titres)</button>
        <button onClick={()=>mkPl("Most Replayed",tbp.map(t=>t.uri))} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🔁 Most Replayed ({tbp.length} titres)</button>
        {allGenres.slice(0,3).map(g=><button key={g.name} onClick={()=>{const a=abg[g.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);if(u.length)mkPl(`Best of ${g.name}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🎨 Best of {g.name} ({g.count} artistes)</button>)}
        {allCountries.slice(0,3).map(c=><button key={c.name} onClick={()=>{const a=abc[c.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);if(u.length)mkPl(`Best of ${c.name}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🌍 Best of {c.name} ({c.count} artistes)</button>)}
      </Card></div>}

      {/* HISTORY */}
      {tab==="history"&&<Card><Lbl>50 dernières écoutes</Lbl><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:26,height:26,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>})}</div></Card>}

      {/* PLAYER */}
      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card>{np?<div><div style={{display:"flex",gap:16,marginBottom:20}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:120,height:120,borderRadius:12}} />}<div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div><div style={{color:C.mut,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div><div style={{color:C.mut,fontSize:11,marginTop:4}}>{np.album?.name}</div>{pl?.progress_ms&&np.duration_ms&&<div style={{marginTop:12}}><div style={{width:"100%",height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(pl.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.grn,borderRadius:2}} /></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(pl.progress_ms/60000)}</span><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div></div>}</div></div><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12}}><button onClick={()=>cmd("shuffle")} style={{background:"none",border:"none",color:pl?.shuffle_state?C.grn:C.mut,fontSize:16,cursor:"pointer"}}>🔀</button><button onClick={()=>cmd("prev")} style={{background:"none",border:"none",color:C.txt,fontSize:20,cursor:"pointer"}}>⏮</button><button onClick={()=>cmd(pl?.is_playing?"pause":"play")} style={{background:C.grn,border:"none",color:"#000",fontSize:22,cursor:"pointer",borderRadius:"50%",width:52,height:52}}>{pl?.is_playing?"⏸":"▶"}</button><button onClick={()=>cmd("next")} style={{background:"none",border:"none",color:C.txt,fontSize:20,cursor:"pointer"}}>⏭</button><button onClick={()=>cmd("repeat")} style={{background:"none",border:"none",color:pl?.repeat_state!=="off"?C.grn:C.mut,fontSize:16,cursor:"pointer"}}>{pl?.repeat_state==="track"?"🔂":"🔁"}</button></div></div>:<div style={{textAlign:"center",padding:40}}><div style={{fontSize:40,opacity:0.3}}>🎵</div><p style={{color:C.mut,fontSize:13,marginTop:16}}>Ouvre Spotify</p></div>}</Card><Card><Lbl>Appareils</Lbl>{devs.length>0?devs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":d.type==="Speaker"?"🔊":"📺"}</span><div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.mut,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<span style={{color:C.grn,fontSize:10,fontWeight:600}}>ACTIF</span>}</div>):<p style={{color:C.mut,fontSize:13}}>Aucun appareil</p>}</Card></div>}

      <div style={{textAlign:"center",marginTop:40,color:C.mut,fontSize:10}}>Spotify · MusicBrainz ({enriched}/{tA.length}) · {allGenres.length} genres · {allCountries.length} pays · <button onClick={()=>{setTok(null);setData(null);setMb({});setSug([])}} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}