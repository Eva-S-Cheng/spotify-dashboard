import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const REDIR = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read","user-read-recently-played","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-modify-public","playlist-modify-private","playlist-read-private","playlist-read-collaborative"].join(" ");

function genV(n=128){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>c[b%c.length]).join("")}
async function genC(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
async function sp(e,t,o={}){const r=await fetch(`https://api.spotify.com/v1${e}`,{headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},...o});if(r.status===204)return null;if(!r.ok)throw new Error(`${r.status}`);return r.json()}

const ISO={"AR":"Argentine","AU":"Australie","AT":"Autriche","BE":"Belgique","BR":"Brésil","BG":"Bulgarie","CA":"Canada","CL":"Chili","CN":"Chine","CO":"Colombie","HR":"Croatie","CU":"Cuba","CZ":"Tchéquie","DK":"Danemark","EG":"Égypte","EE":"Estonie","FI":"Finlande","FR":"France","DE":"Allemagne","GR":"Grèce","HU":"Hongrie","IS":"Islande","IN":"Inde","ID":"Indonésie","IE":"Irlande","IL":"Israël","IT":"Italie","JM":"Jamaïque","JP":"Japon","KR":"Corée du Sud","LV":"Lettonie","LT":"Lituanie","MX":"Mexique","NL":"Pays-Bas","NZ":"N.-Zélande","NG":"Nigeria","NO":"Norvège","PL":"Pologne","PT":"Portugal","RO":"Roumanie","RU":"Russie","RS":"Serbie","SK":"Slovaquie","SI":"Slovénie","ZA":"Afr. du Sud","ES":"Espagne","SE":"Suède","CH":"Suisse","TW":"Taïwan","TH":"Thaïlande","TR":"Turquie","UA":"Ukraine","AE":"Émirats","GB":"Royaume-Uni","US":"États-Unis","VN":"Vietnam","XW":"Monde","XE":"Europe","PR":"Porto Rico"};

const ROOTS=["metal","rock","pop","punk","core","wave","hop","rap","jazz","blues","folk","soul","funk","house","techno","trance","ambient","classical","country","reggae","ska","grunge","doom","death","thrash","groove","progressive","prog","symphonic","melodic","power","alternative","indie","emo","electronic","electro","synth","industrial","gothic","goth","noise","experimental","psychedelic","garage","shoegaze","math","hardcore","fusion","latin","gospel","disco","dubstep","trap","grime","drill","downtempo","breakbeat","jungle","darkwave","neofolk","dance","grindcore","deathcore","metalcore","stoner","sludge","speed","djent","screamo","swing","bebop","acid","lo-fi","lofi","chillwave","trip-hop","vapor","r&b","rnb","hip-hop","edm","dnb","afrobeat","cumbia","salsa","bossa","flamenco","fado","chanson","k-pop","j-pop","j-rock","post-rock","post-metal","post-punk","new wave","krautrock","glam","pirate","viking","pagan","drone","surf","britpop","dream pop","synthpop","electropop","coldwave","ethereal","witch house","hyperpop","phonk","boom bap","opera","bluegrass","reggaeton","dancehall","soca","highlife","mpb","samba","tango"];
const ORIGINS=new Set(["swedish","finnish","norwegian","danish","icelandic","german","austrian","swiss","french","italian","spanish","portuguese","brazilian","british","english","american","canadian","australian","japanese","korean","chinese","russian","polish","czech","hungarian","romanian","greek","turkish","mexican","colombian","dutch","belgian","irish","scottish","welsh","south african","indian","thai","jamaican","european","scandinavian","nordic","african","asian","caribbean"]);
function isGenre(t){const l=t.toLowerCase();if(ORIGINS.has(l))return false;return ROOTS.some(r=>l.includes(r))}

// SLOW MusicBrainz: 1 at a time, 2s gap, retry with 4s backoff
async function fetchMB(name){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0 (eva-s-cheng.github.io)"}});
      if(r.status===503){await new Promise(r=>setTimeout(r,4000));continue}
      if(!r.ok)return null;
      const d=await r.json(),a=d.artists?.[0];if(!a||a.score<80)return null;
      const tags=(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name);
      const genres=tags.filter(isGenre).slice(0,5);
      const code=a.country||null;
      return{genres,country:code?ISO[code]||code:null,countryCode:code};
    }catch{if(attempt===0)await new Promise(r=>setTimeout(r,4000))}
  }
  return null;
}

async function enrichAll(artists,onDone){
  const res={};
  // ONE at a time to avoid 503
  for(let i=0;i<artists.length;i++){
    const r=await fetchMB(artists[i].name);
    if(r)res[artists[i].id]=r;
    await new Promise(r=>setTimeout(r,1500));
  }
  onDone(res);return res;
}

async function searchMBA(tag,cc,limit=15){
  try{const q=cc?`tag:"${tag}" AND country:${cc}`:`tag:"${tag}"`;const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=${limit}&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});if(!r.ok)return[];const d=await r.json();return(d.artists||[]).filter(a=>a.score>70).map(a=>({name:a.name,country:a.country?ISO[a.country]||a.country:null,tags:(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name).filter(isGenre).slice(0,3)}))}catch{return[]}
}
async function enrichSug(groups,token){const out=[];for(const g of groups){const ea=[];for(const a of g.artists){try{const r=await sp(`/search?q=${encodeURIComponent(a.name)}&type=artist&limit=1`,token);const sa=r?.artists?.items?.[0];ea.push({...a,sid:sa?.id||null,img:sa?.images?.[0]?.url||null})}catch{ea.push({...a,sid:null,img:null})}}out.push({...g,artists:ea})}return out}

const C={bg:"#0D0D0D",sf:"#161616",card:"#1C1C1C",brd:"#2A2A2A",grn:"#1DB954",txt:"#FFF",mut:"#888",acc:"#B3FF5C",dim:"#333",red:"#FF6B6B"};
const CL=["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD","#10AC84","#FDA7DF","#C44569","#3DC1D3","#778BEB","#E77F67"];
function Card({children,style={},onClick}){return<div onClick={onClick} style={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:16,padding:24,cursor:onClick?"pointer":"default",...style}}>{children}</div>}
function Lbl({children}){return<p style={{color:C.mut,fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>{children}</p>}
function SC({label,value,sub,icon,onClick}){return<Card onClick={onClick} style={{padding:18}}><div style={{display:"flex",justifyContent:"space-between"}}><Lbl>{label}</Lbl>{icon&&<span style={{fontSize:18}}>{icon}</span>}</div><div style={{fontSize:24,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.mut,marginTop:6}}>{sub}</div>}</Card>}
function fmt(m){if(m<1)return"<1min";if(m<60)return`${Math.round(m)}min`;const h=Math.floor(m/60);return`${h}h${Math.round(m%60)>0?String(Math.round(m%60)).padStart(2,"0"):""}`}

// Player buttons — proper styled, not emoji
function PBtn({icon,active,onClick,big}){
  const s=big?52:36;
  return<button onClick={onClick} style={{width:s,height:s,borderRadius:"50%",border:big?"none":`2px solid ${active?C.grn:C.brd}`,background:big?C.grn:"transparent",color:big?"#000":active?C.grn:C.txt,fontSize:big?20:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",fontWeight:700}}>{icon}</button>
}

function DrillDown({title,artists,tracks,mb,onClose,onPlay,onMkPl}){
  return(<div style={{position:"fixed",top:0,right:0,width:500,maxWidth:"100vw",height:"100vh",background:C.card,borderLeft:`1px solid ${C.brd}`,zIndex:1000,overflowY:"auto",padding:24,boxSizing:"border-box"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.txt}}>{title}</h2><button onClick={onClose} style={{background:"none",border:"none",color:C.mut,fontSize:24,cursor:"pointer",lineHeight:1}}>✕</button></div>
    <Lbl>{artists.length} artistes · {tracks.length} titres</Lbl>
    {tracks.length>0&&<button onClick={()=>onMkPl(`${title} Mix`,tracks.map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:16}}>Créer playlist ({tracks.length} titres)</button>}
    {artists.map((a,i)=>{const m=mb[a.id];const at=tracks.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id));return<div key={a.id||i} style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:36,height:36,borderRadius:"50%",background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>♪</div>}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:600}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:10}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>{at.length>0&&<div style={{marginLeft:66}}>{at.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",cursor:"pointer",borderBottom:`1px solid ${C.brd}`}} onClick={()=>onPlay(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:22,height:22,borderRadius:3}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{fontSize:9,color:C.grn}}>▶</span></div>)}</div>}</div>})}
  </div>);
}

export default function App(){
  const[cid,setCid]=useState(()=>localStorage.getItem("sp_client_id")||"");
  const[tok,setTok]=useState(null);const[ld,setLd]=useState(true);const[lm,setLm]=useState("Connexion…");
  const[err,setErr]=useState(null);const[data,setData]=useState(null);
  const[mb,setMb]=useState({});const[mbL,setMbL]=useState(false);const[mbP,setMbP]=useState(0);const[mbT,setMbT]=useState(0);
  const[tr,setTr]=useState("medium_term");const[tab,setTab]=useState("overview");const[su,setSu]=useState("input");
  const[pl,setPl]=useState(null);const[devs,setDevs]=useState([]);const[drill,setDrill]=useState(null);
  const[pls,setPls]=useState([]);const[plTk,setPlTk]=useState({});const[plO,setPlO]=useState(null);
  const[sug,setSug]=useState([]);const[sugL,setSugL]=useState(false);
  const[cG,setCG]=useState("");const[cC,setCC]=useState("");const[cR,setCR]=useState([]);const[cL,setCL2]=useState(false);
  const[ctxName,setCtxName]=useState("");
  const pi=useRef(null);

  useEffect(()=>{const code=sessionStorage.getItem("sp_code");if(!code){setLd(false);return}const v=sessionStorage.getItem("sp_verifier"),s=sessionStorage.getItem("sp_client_id");if(!v||!s){setLd(false);return}sessionStorage.removeItem("sp_code");(async()=>{try{const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:s,grant_type:"authorization_code",code,redirect_uri:REDIR,code_verifier:v})});const j=await r.json();if(j.access_token){setTok(j.access_token);localStorage.setItem("sp_client_id",s)}else{setErr(j.error_description||j.error);setLd(false)}}catch(e){setErr(e.message);setLd(false)}})()},[]);

  useEffect(()=>{if(!tok)return;setLd(true);setErr(null);setLm("Récupération…");(async()=>{try{
    const[a1,a2,t1,t2,rec,prof,p1,p2]=await Promise.all([
      sp(`/me/top/artists?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/artists?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp(`/me/top/tracks?limit=50&offset=0&time_range=${tr}`,tok),
      sp(`/me/top/tracks?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp("/me/player/recently-played?limit=50",tok),sp("/me",tok),
      sp("/me/playlists?limit=50&offset=0",tok).catch(()=>({items:[]})),
      sp("/me/playlists?limit=50&offset=50",tok).catch(()=>({items:[]}))]);
    const tA=[...(a1.items||[]),...(a2.items||[])],tT=[...(t1.items||[]),...(t2.items||[])],ri=rec.items||[];
    setPls([...(p1.items||[]),...(p2.items||[])]);
    const am={};ri.forEach(i=>{const t=i.track;if(!t)return;const d=(t.duration_ms||0)/60000;(t.artists||[]).forEach(a=>{if(!am[a.id])am[a.id]={name:a.name,id:a.id,min:0,plays:0};am[a.id].min+=d;am[a.id].plays++})});
    const abt=Object.values(am).sort((a,b)=>b.min-a.min);
    const tm={};ri.forEach(i=>{const t=i.track;if(!t)return;if(!tm[t.id])tm[t.id]={...t,plays:0};tm[t.id].plays++});
    const tbp=Object.values(tm).sort((a,b)=>b.plays-a.plays);
    const hr=Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0}));ri.forEach(i=>{const h=new Date(i.played_at).getHours();hr[h].nb++;hr[h].min+=(i.track?.duration_ms||0)/60000});
    const avgDur=tT.length>0?tT.reduce((s,t)=>s+(t.duration_ms||0),0)/tT.length/60000:0;
    setData({tA,tT,ri,prof,abt,tbp,hr,avgDur});
    // Enrich — 1 at a time, update state ONCE at end
    setMbL(true);setMbT(tA.length);setMbP(0);
    const res={};
    for(let i=0;i<tA.length;i++){
      const r=await fetchMB(tA[i].name);
      if(r)res[tA[i].id]=r;
      setMbP(i+1);
      await new Promise(r=>setTimeout(r,1500));
    }
    setMb(res);setMbL(false);
  }catch(e){setErr(e.message)}finally{setLd(false)}})()},[tok,tr]);

  // Suggestions after MB done
  useEffect(()=>{
    if(mbL||!data||!tok||Object.keys(mb).length===0)return;
    const{tA,tT,ri}=data;
    const known=new Set();tA.forEach(a=>known.add(a.name.toLowerCase()));tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));
    const combos={};tA.forEach(a=>{const m=mb[a.id];if(!m||!m.countryCode)return;(m.genres||[]).forEach(g=>{const k=`${g}|||${m.countryCode}`;if(!combos[k])combos[k]={genre:g,code:m.countryCode,country:m.country,count:0};combos[k].count++})});
    const topC=Object.values(combos).sort((a,b)=>b.count-a.count).slice(0,5);
    const gO={};tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gO[g]=(gO[g]||0)+1})});
    const topG=Object.entries(gO).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>({genre:g,code:null,country:null}));
    setSugL(true);
    (async()=>{const results=[];for(const c of[...topC,...topG].slice(0,6)){const artists=await searchMBA(c.genre,c.code,20);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));if(f.length>0)results.push({genre:c.genre,country:c.country,artists:f.slice(0,8)});await new Promise(r=>setTimeout(r,2000))}const e=await enrichSug(results,tok);setSug(e);setSugL(false)})();
  },[mb,mbL]);

  // Player polling + context name
  useEffect(()=>{if(!tok)return;
    const f=async()=>{
      try{const p=await sp("/me/player",tok);setPl(p);
        if(p?.context?.uri&&tok){
          const uri=p.context.uri;
          if(p.context.type==="playlist"){try{const id=uri.split(":")[2];const pl=await sp(`/playlists/${id}?fields=name`,tok);setCtxName(pl?.name||"")}catch{}}
          else if(p.context.type==="album"){try{const id=uri.split(":")[2];const al=await sp(`/albums/${id}?fields=name`,tok);setCtxName(al?.name||"")}catch{}}
          else setCtxName("")
        }else setCtxName("")
      }catch{setPl(null)}
      sp("/me/player/devices",tok).then(d=>setDevs(d?.devices||[])).catch(()=>{});
    };
    f();pi.current=setInterval(f,5000);return()=>clearInterval(pi.current)},[tok]);

  const cmd=async a=>{try{if(a==="play")await sp("/me/player/play",tok,{method:"PUT"});else if(a==="pause")await sp("/me/player/pause",tok,{method:"PUT"});else if(a==="next")await sp("/me/player/next",tok,{method:"POST"});else if(a==="prev")await sp("/me/player/previous",tok,{method:"POST"});else if(a==="shuffle")await sp(`/me/player/shuffle?state=${!pl?.shuffle_state}`,tok,{method:"PUT"});else if(a==="repeat"){const m=["off","context","track"];await sp(`/me/player/repeat?state=${m[(m.indexOf(pl?.repeat_state||"off")+1)%3]}`,tok,{method:"PUT"})}setTimeout(()=>sp("/me/player",tok).then(setPl).catch(()=>{}),500)}catch{}};
  const play=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({uris:[u]})})}catch{}};
  const playCtx=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:u})})}catch{}};
  const playArt=async id=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:`spotify:artist:${id}`})})}catch{}};
  const mkPl=async(n,uris)=>{
    if(!uris||uris.length===0){alert("Aucun titre à ajouter");return}
    try{const p=await sp(`/users/${data.prof.id}/playlists`,tok,{method:"POST",body:JSON.stringify({name:n,public:false,description:"Créée par Your Spotify, Uncovered."})});
    if(p?.id){for(let i=0;i<uris.length;i+=100){await sp(`/playlists/${p.id}/tracks`,tok,{method:"POST",body:JSON.stringify({uris:uris.slice(i,i+100)})})}alert(`"${n}" créée avec ${uris.length} titres !`)}else alert("Erreur de création")}catch(e){alert("Erreur : "+e.message)}};

  const loadPlTk=async id=>{if(plO===id){setPlO(null);return}if(plTk[id]){setPlO(id);return}try{const r=await sp(`/playlists/${id}/tracks?limit=50`,tok);setPlTk(p=>({...p,[id]:(r?.items||[]).filter(i=>i.track)}));setPlO(id)}catch{setPlO(id)}};

  const customSearch=async()=>{if(!cG)return;setCL2(true);setCR([]);
    const known=new Set();data.tA.forEach(a=>known.add(a.name.toLowerCase()));data.tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));data.ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));
    const cc=cC?Object.entries(ISO).find(([,v])=>v===cC)?.[0]||null:null;
    const artists=await searchMBA(cG,cc,25);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));
    const e=await enrichSug([{genre:cG,country:cC||null,artists:f.slice(0,12)}],tok);setCR(e);setCL2(false)};

  const login=useCallback(async()=>{if(!cid.trim())return;const v=genV(),ch=await genC(v);sessionStorage.setItem("sp_verifier",v);sessionStorage.setItem("sp_client_id",cid.trim());const u=new URL("https://accounts.spotify.com/authorize");u.searchParams.set("client_id",cid.trim());u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",REDIR);u.searchParams.set("scope",SCOPES);u.searchParams.set("code_challenge_method","S256");u.searchParams.set("code_challenge",ch);window.location.href=u.toString()},[cid]);

  const spin=<style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>;
  if(ld)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut,fontSize:14}}>{lm}</p></div>{spin}</div>;
  if(err&&!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}><p style={{color:C.red,fontSize:14,marginBottom:20}}>{err}</p><button onClick={()=>setErr(null)} style={{padding:"12px 24px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if(!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}}><div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:48,marginBottom:12}}>🎧</div><h1 style={{color:C.txt,fontSize:28,fontWeight:700,margin:0}}>Your Spotify, Uncovered.</h1><p style={{color:C.mut,marginTop:8,fontSize:14}}>Ton analyse complète</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.brd}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSu(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:su===k?C.grn:C.mut,borderBottom:`2px solid ${su===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{su==="input"?<div><label style={{color:C.mut,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={cid} onChange={e=>setCid(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.mut,fontSize:11,marginTop:8}}>Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><button onClick={login} disabled={!cid.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:cid.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:cid.trim()?"#000":C.mut,fontSize:15,fontWeight:700,cursor:cid.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.mut,lineHeight:1.8}}><p><span style={{color:C.grn,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.acc}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.grn,fontWeight:700}}>2.</span> Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><p><span style={{color:C.grn,fontWeight:700}}>3.</span> Web API → Copie Client ID → Connecte</p></div>}</Card></div></div>;
  if(!data)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut}}>{lm}</p></div>{spin}</div>;

  const{tA,tT,ri,prof,abt,tbp,hr,avgDur}=data;
  const gc={},cc={},abg={},abc={};
  tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gc[g]=(gc[g]||0)+1;if(!abg[g])abg[g]=[];abg[g].push(a)});if(m.country){cc[m.country]=(cc[m.country]||0)+1;if(!abc[m.country])abc[m.country]=[];abc[m.country].push(a)}});
  const allG=Object.entries(gc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const allC=Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const gM=allG.filter(g=>g.count>1),gm=allG.filter(g=>g.count===1);
  const pieG=gm.length>0?[...gM,{name:"Autre",count:gm.length}]:gM;
  const cM=allC.filter(c=>c.count>1),cm=allC.filter(c=>c.count===1);
  const pieC=cm.length>0?[...cM,{name:"Autre",count:cm.length}]:cM;
  const gph=hr.map((_,idx)=>{const ht=ri.filter(i=>new Date(i.played_at).getHours()===idx);const hgc={};ht.forEach(i=>(i.track?.artists||[]).forEach(a=>{const m=mb[a.id];if(m)(m.genres||[]).forEach(g=>{hgc[g]=(hgc[g]||0)+1})}));const top=Object.entries(hgc).sort((a,b)=>b[1]-a[1])[0];return{h:`${idx}h`,genre:top?top[0]:"—",nb:hr[idx].nb}}).filter(h=>h.nb>0);
  const hGenres=[...new Set(gph.map(h=>h.genre).filter(g=>g!=="—"))];
  const enr=Object.keys(mb).length;
  const TL={short_term:"4 sem.",medium_term:"6 mois",long_term:"Tout"};
  const np=pl?.item;const npMb=np?.artists?.[0]?.id?mb[np.artists[0].id]:null;
  const tabs=[["overview","📊 Overview"],["artists","🎤 Artistes"],["tracks","🎵 Titres"],["genres","🎨 Genres"],["countries","🌍 Pays"],["trends","📈 Tendances"],["discover","🔮 Découvertes"],["playlists","📋 Playlists"],["history","🕐 Historique"],["player","🎮 Lecteur"]];
  const drillA=drill?drill.artists:[];const drillT=drill?tT.filter(t=>(t.artists||[]).some(a=>drillA.some(d=>d.id===a.id))):[];

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.txt,padding:"20px 16px 80px",maxWidth:1200,margin:"0 auto"}}>
      {drill&&<><div onClick={()=>setDrill(null)} style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.6)",zIndex:999}} /><DrillDown title={drill.title} artists={drillA} tracks={drillT} mb={mb} onClose={()=>setDrill(null)} onPlay={play} onMkPl={mkPl} /></>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>{prof.images?.[0]&&<img src={prof.images[0].url} alt="" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.grn}`}} />}<div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>{prof.display_name}</h1><p style={{margin:0,color:C.mut,fontSize:11}}>{TL[tr]}</p></div></div>
        <div style={{display:"flex",gap:6}}>{Object.entries(TL).map(([k,l])=><button key={k} onClick={()=>setTr(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:tr===k?C.grn:C.card,border:`1px solid ${tr===k?C.grn:C.brd}`,color:tr===k?"#000":C.mut,cursor:"pointer",fontWeight:tr===k?700:400}}>{l}</button>)}</div>
      </div>
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.brd}`,overflowX:"auto"}}>{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"10px 12px",background:"none",border:"none",color:tab===k?C.grn:C.mut,borderBottom:`2px solid ${tab===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:11,fontWeight:tab===k?600:400,marginBottom:-1,whiteSpace:"nowrap"}}>{l}</button>)}</div>
      {mbL&&<div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:C.mut,fontSize:11}}>Enrichissement MusicBrainz</span><span style={{color:C.mut,fontSize:11}}>{mbP}/{mbT}</span></div><div style={{width:"100%",height:3,background:C.brd,borderRadius:2}}><div style={{width:`${(mbP/Math.max(mbT,1))*100}%`,height:"100%",background:C.grn,borderRadius:2,transition:"width 0.3s"}} /></div></div>}

      {/* OVERVIEW */}
      {tab==="overview"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <SC label="Artistes" value={tA.length} icon="🎤" onClick={()=>setTab("artists")} />
          <SC label="Durée moy." value={fmt(avgDur)} sub="par titre" icon="📏" onClick={()=>setTab("tracks")} />
          {allG.length>0&&<SC label="Genre #1" value={allG[0].name} sub={`${allG[0].count} artistes`} icon="🎨" onClick={()=>{if(abg[allG[0].name])setDrill({title:allG[0].name,artists:abg[allG[0].name]})}} />}
          {allC.length>0&&<SC label="Pays #1" value={allC[0].name} sub={`${allC[0].count} artistes`} icon="🌍" onClick={()=>{if(abc[allC[0].name])setDrill({title:allC[0].name,artists:abc[allC[0].name]})}} />}
          <SC label="Genres" value={allG.length} icon="🏷" onClick={()=>setTab("genres")} />
          <SC label="Pays" value={allC.length} icon="🗺" onClick={()=>setTab("countries")} />
        </div>
        {np&&<Card style={{marginBottom:20,background:`linear-gradient(135deg,${C.card},${C.sf})`}}><div style={{display:"flex",alignItems:"center",gap:16}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:56,height:56,borderRadius:8}} />}<div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{np.name}</div><div style={{color:C.mut,fontSize:12}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div>{ctxName&&<div style={{color:C.acc,fontSize:10,marginTop:2}}>{pl?.context?.type==="playlist"?"📋":"💿"} {ctxName}</div>}</div><div style={{display:"flex",gap:6}}><PBtn icon="⏮" onClick={()=>cmd("prev")} /><PBtn icon={pl?.is_playing?"⏸":"▶"} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} /><PBtn icon="⏭" onClick={()=>cmd("next")} /></div></div></Card>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><Lbl>Top 5 artistes</Lbl>{tA.slice(0,5).map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1}}><div style={{color:C.txt,fontSize:12,fontWeight:500}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:9}}>{(m.genres||[]).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</Card>
          <Card><Lbl>Top 5 titres</Lbl>{tT.slice(0,5).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:6}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div></div>)}</Card>
        </div>
      </>}

      {/* ARTISTS */}
      {tab==="artists"&&<><div style={{marginBottom:16}}><button onClick={()=>{const uris=[];tA.forEach(a=>{tT.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id)).forEach(t=>{if(!uris.includes(t.uri))uris.push(t.uri)})});mkPl(`Top Artistes — ${TL[tr]}`,uris)}} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer playlist top artistes</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tA.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tA.map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>setDrill({title:a.name,artists:[a]})}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:30,height:30,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>{m&&<div style={{color:C.mut,fontSize:9}}>{(m.genres||[]).slice(0,2).join(", ")}{m.country?` · ${m.country}`:""}</div>}</div></div>})}</div></Card><Card><Lbl>Temps d'écoute récent</Lbl>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(600,abt.slice(0,15).length*36)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.min)}))} layout="vertical"><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.mut}}>Pas de données</p>}</Card></div></>}

      {/* TRACKS */}
      {tab==="tracks"&&<><div style={{marginBottom:16}}><button onClick={()=>mkPl(`Top ${tT.length} Titres — ${TL[tr]}`,tT.map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer playlist ({tT.length} titres)</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tT.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";;return<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />:<div style={{width:30,height:30,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{d}</div></div>})}</div></Card><Card><Lbl>Plus joués récemment</Lbl>{tbp.map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><div style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x</div></div>)}</Card></div></>}

      {/* GENRES — NO ANIMATION */}
      {tab==="genres"&&(allG.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Genres ({allG.length})</Lbl><ResponsiveContainer width="100%" height={Math.max(340,pieG.length*18)}><PieChart><Pie data={pieG} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={Math.min(140,50+pieG.length*3)} innerRadius={50} paddingAngle={1} isAnimationActive={false} label={({name,percent})=>percent>0.03?name:""} labelLine={false} onClick={d=>{if(d.name!=="Autre"&&abg[d.name])setDrill({title:d.name,artists:abg[d.name]})}}>{pieG.map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Lbl>Tous ({allG.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allG.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abg[g.name])setDrill({title:g.name,artists:abg[g.name]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:12}}>{g.name}</div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{g.count}</span></div>)}</div></Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`Chargement ${mbP}/${mbT}`:"Pas de données"}</p></Card>)}

      {/* COUNTRIES — NO ANIMATION */}
      {tab==="countries"&&(allC.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Pays ({allC.length})</Lbl><ResponsiveContainer width="100%" height={Math.max(340,pieC.length*20)}><PieChart><Pie data={pieC} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={Math.min(140,50+pieC.length*5)} innerRadius={50} paddingAngle={1} isAnimationActive={false} label={({name,percent})=>percent>0.03?name:""} labelLine={false} onClick={d=>{if(d.name!=="Autre"&&abc[d.name])setDrill({title:d.name,artists:abc[d.name]})}}>{pieC.map((_,i)=><Cell key={i} fill={CL[i%CL.length]} style={{cursor:"pointer"}} />)}</Pie><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n)=>[`${v} artistes`,n]} /></PieChart></ResponsiveContainer></Card><Card><Lbl>Tous ({allC.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allC.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>{if(abc[c.name])setDrill({title:c.name,artists:abc[c.name]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length],flexShrink:0}} /><div style={{flex:1,color:C.txt,fontSize:13}}>{c.name}</div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{c.count}</span></div>)}</div></Card></div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`Chargement ${mbP}/${mbT}`:"Pas de données"}</p></Card>)}

      {/* TRENDS */}
      {tab==="trends"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Écoutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} /><Bar dataKey="nb" fill={C.grn} radius={[4,4,0,0]} name="Écoutes" /></BarChart></ResponsiveContainer></Card>
        <Card><Lbl>Minutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${Math.round(v)} min`]} /><Bar dataKey="min" fill={C.acc} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card>
        <Card style={{gridColumn:"span 2"}}><Lbl>Genre dominant / heure</Lbl>
          <ResponsiveContainer width="100%" height={Math.max(200,gph.length*28)}><BarChart data={gph} layout="vertical"><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="h" tick={{fill:C.grn,fontSize:11,fontWeight:700}} axisLine={false} tickLine={false} width={40} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n,p)=>[`${v} — ${p.payload.genre}`]} /><Bar dataKey="nb" radius={[0,6,6,0]}>{gph.map((d,i)=><Cell key={i} fill={CL[hGenres.indexOf(d.genre)%CL.length]||C.dim} />)}</Bar></BarChart></ResponsiveContainer>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>{hGenres.map((g,i)=><div key={g} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>{if(abg[g])setDrill({title:g,artists:abg[g]})}}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length]}} /><span style={{color:C.mut,fontSize:10}}>{g}</span></div>)}</div>
        </Card>
      </div>}

      {/* DISCOVER */}
      {tab==="discover"&&<div>
        <Card style={{marginBottom:16}}><Lbl>Suggestions automatiques</Lbl>
          {sugL&&<p style={{color:C.mut,fontSize:11}}>Recherche en cours…</p>}
          {sug.length===0&&!sugL&&<p style={{color:C.mut,fontSize:12}}>Disponible après l'enrichissement MusicBrainz.</p>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
            {sug.map((s,si)=><Card key={si} style={{padding:16,background:C.sf}}>
              <div style={{marginBottom:10}}><span style={{color:C.acc,fontSize:13,fontWeight:600}}>{s.genre}</span>{s.country&&<span style={{color:C.mut,fontSize:10}}> · {s.country}</span>}</div>
              {s.artists.map((a,ai)=><div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:a.sid?"pointer":"default"}} onClick={()=>{if(a.sid)playArt(a.sid)}}>
                {a.img?<img src={a.img} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:CL[(si*5+ai)%CL.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#000",fontWeight:700}}>{a.name[0]}</div>}
                <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).join(", ")}</div></div>
                {a.sid&&<span style={{color:C.grn,fontSize:11}}>▶</span>}
              </div>)}
            </Card>)}
          </div>
        </Card>
        <Card><Lbl>Recherche personnalisée</Lbl>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <select value={cG} onChange={e=>setCG(e.target.value)} style={{flex:1,minWidth:140,padding:"10px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Genre…</option>{allG.map(g=><option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}</select>
            <select value={cC} onChange={e=>setCC(e.target.value)} style={{flex:1,minWidth:140,padding:"10px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Tous pays</option>{allC.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>
            <button onClick={customSearch} disabled={!cG||cL} style={{padding:"10px 20px",background:cG?C.grn:C.brd,border:"none",borderRadius:8,color:cG?"#000":C.mut,fontSize:12,fontWeight:600,cursor:cG?"pointer":"default"}}>{cL?"…":"Chercher"}</button>
          </div>
          {cR.map((s,si)=><div key={si}><div style={{color:C.acc,fontSize:13,fontWeight:600,marginBottom:8}}>{s.genre}{s.country?` · ${s.country}`:""}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{s.artists.map((a,ai)=><div key={ai} style={{display:"flex",alignItems:"center",gap:10,padding:8,background:C.sf,borderRadius:10,cursor:a.sid?"pointer":"default",border:`1px solid ${C.brd}`}} onClick={()=>{if(a.sid)playArt(a.sid)}}>{a.img?<img src={a.img} alt="" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:38,height:38,borderRadius:"50%",background:CL[ai%CL.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#000",fontWeight:700}}>{a.name[0]}</div>}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).join(", ")}</div></div>{a.sid&&<span style={{color:C.grn}}>▶</span>}</div>)}</div></div>)}
        </Card>
      </div>}

      {/* PLAYLISTS */}
      {tab==="playlists"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Mes playlists ({pls.length})</Lbl><div style={{maxHeight:700,overflowY:"auto"}}>{pls.map(p=><div key={p.id}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>loadPlTk(p.id)}>
            {p.images?.[0]?<img src={p.images[0].url} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover"}} />:<div style={{width:42,height:42,borderRadius:6,background:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>♪</div>}
            <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div><div style={{color:C.mut,fontSize:10}}>{p.tracks?.total||0} titres</div></div>
            <button onClick={e=>{e.stopPropagation();playCtx(p.uri)}} style={{background:C.grn,border:"none",borderRadius:"50%",width:28,height:28,color:"#000",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>▶</button>
            <span style={{color:C.mut,fontSize:14,marginLeft:4}}>{plO===p.id?"▼":"▶"}</span>
          </div>
          {plO===p.id&&<div style={{marginLeft:54,marginBottom:8,borderLeft:`2px solid ${C.brd}`,paddingLeft:12}}>
            {plTk[p.id]?plTk[p.id].map((item,i)=>{const t=item.track;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:22,height:22,borderRadius:3}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{color:C.grn,fontSize:9}}>▶</span></div>}):<p style={{color:C.mut,fontSize:11}}>Chargement…</p>}
          </div>}
        </div>)}</div></Card>
        <Card><Lbl>Créer des playlists</Lbl>
          {allG.slice(0,3).map(g=><button key={g.name} onClick={()=>{const a=abg[g.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);mkPl(`Best of ${g.name}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🎨 Best of {g.name}</button>)}
          {allC.slice(0,3).map(c=><button key={c.name} onClick={()=>{const a=abc[c.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);mkPl(`Best of ${c.name}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🌍 Best of {c.name}</button>)}
        </Card>
      </div>}

      {/* HISTORY */}
      {tab==="history"&&<Card><Lbl>50 dernières écoutes</Lbl><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:26,height:26,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>})}</div></Card>}

      {/* PLAYER — proper buttons, context info */}
      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>{np?<div>
          <div style={{display:"flex",gap:16,marginBottom:20}}>
            {np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:140,height:140,borderRadius:12}} />}
            <div style={{flex:1}}>
              <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div>
              <div style={{color:C.mut,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div>
              <div style={{color:C.mut,fontSize:11,marginTop:4}}>💿 {np.album?.name}</div>
              {np.album?.release_date&&<div style={{color:C.mut,fontSize:10,marginTop:2}}>📅 {np.album.release_date.slice(0,4)}</div>}
              {npMb&&<div style={{marginTop:6}}>
                {(npMb.genres||[]).length>0&&<div style={{color:C.acc,fontSize:11}}>🎨 {npMb.genres.join(", ")}</div>}
                {npMb.country&&<div style={{color:C.acc,fontSize:11}}>🌍 {npMb.country}</div>}
              </div>}
              {ctxName&&<div style={{marginTop:6,padding:"4px 10px",background:C.sf,borderRadius:6,display:"inline-block"}}>
                <span style={{color:C.grn,fontSize:11,fontWeight:600}}>{pl?.context?.type==="playlist"?"📋 Playlist":"💿 Album"}: {ctxName}</span>
              </div>}
              {pl?.progress_ms&&np.duration_ms&&<div style={{marginTop:10}}>
                <div style={{width:"100%",height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(pl.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.grn,borderRadius:2,transition:"width 1s linear"}} /></div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(pl.progress_ms/60000)}</span><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div>
              </div>}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10}}>
            <PBtn icon="🔀" active={pl?.shuffle_state} onClick={()=>cmd("shuffle")} />
            <PBtn icon="⏮" onClick={()=>cmd("prev")} />
            <PBtn icon={pl?.is_playing?"⏸":"▶"} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} />
            <PBtn icon="⏭" onClick={()=>cmd("next")} />
            <PBtn icon={pl?.repeat_state==="track"?"🔂":"🔁"} active={pl?.repeat_state!=="off"} onClick={()=>cmd("repeat")} />
          </div>
        </div>:<div style={{textAlign:"center",padding:40}}><p style={{color:C.mut,fontSize:14}}>Ouvre Spotify sur un appareil</p></div>}</Card>
        <Card><Lbl>Appareils ({devs.length})</Lbl>{devs.length>0?devs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":"🔊"}</span><div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.mut,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<div style={{background:C.grn,color:"#000",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:50}}>ACTIF</div>}</div>):<p style={{color:C.mut}}>Aucun appareil. Ouvre Spotify.</p>}</Card>
      </div>}

      <div style={{textAlign:"center",marginTop:40,color:C.mut,fontSize:10}}>Spotify · MusicBrainz ({enr}/{tA.length}) · {allG.length} genres · {allC.length} pays · <button onClick={()=>{setTok(null);setData(null);setMb({});setSug([])}} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}