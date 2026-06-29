import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Treemap } from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const REDIR = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read","user-read-recently-played","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-modify-public","playlist-modify-private","playlist-read-private","playlist-read-collaborative"].join(" ");
const WORLD_TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function genV(n=128){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>c[b%c.length]).join("")}
async function genC(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
let rlUntil=0;// verrou global de rate-limit (timestamp jusqu'auquel on attend)
async function sp(e,t,o={},retries=2){const w=rlUntil-Date.now();if(w>0)await new Promise(r=>setTimeout(r,w));const r=await fetch(`https://api.spotify.com/v1${e}`,{headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},...o});if(r.status===204)return null;if(r.status===429){const ra=Math.min(parseInt(r.headers.get("Retry-After")||"5",10),60);rlUntil=Date.now()+(ra+1)*1000;if(retries>0){await new Promise(res=>setTimeout(res,(ra+1)*1000));return sp(e,t,o,retries-1)}const err=new Error("429");err.status=429;throw err}if(!r.ok){const err=new Error(`${r.status}`);err.status=r.status;throw err}return r.json()}

// Title Case par mot : "heavy metal" -> "Heavy Metal", "k-pop" -> "K-Pop", "r&b" -> "R&B"
function tc(s){return String(s).toLowerCase().replace(/(^|[\s\-/&])([a-z])/g,(m,p1,p2)=>p1+p2.toUpperCase())}

// UTF-8 safe base64 — pour le partage de profil (compatibilité)
function b64encode(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let bin="";bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}
function b64decode(str){const bin=atob(str.trim());const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}

const ISO={"AM":"Arménie","AR":"Argentine","AU":"Australie","AT":"Autriche","BD":"Bangladesh","BY":"Biélorussie","BE":"Belgique","BO":"Bolivie","BA":"Bosnie","BR":"Brésil","BG":"Bulgarie","CA":"Canada","CL":"Chili","CN":"Chine","CO":"Colombie","CR":"Costa Rica","HR":"Croatie","CU":"Cuba","CZ":"Tchéquie","DK":"Danemark","EG":"Égypte","EE":"Estonie","FI":"Finlande","FR":"France","GE":"Géorgie","DE":"Allemagne","GH":"Ghana","GR":"Grèce","GT":"Guatemala","HU":"Hongrie","IS":"Islande","IN":"Inde","ID":"Indonésie","IR":"Iran","IQ":"Irak","IE":"Irlande","IL":"Israël","IT":"Italie","JM":"Jamaïque","JP":"Japon","JO":"Jordanie","KZ":"Kazakhstan","KE":"Kenya","KR":"Corée du Sud","LV":"Lettonie","LB":"Liban","LT":"Lituanie","LU":"Luxembourg","MY":"Malaisie","MX":"Mexique","MA":"Maroc","NL":"Pays-Bas","NZ":"N.-Zélande","NG":"Nigeria","NO":"Norvège","PK":"Pakistan","PA":"Panama","PE":"Pérou","PH":"Philippines","PL":"Pologne","PT":"Portugal","RO":"Roumanie","RU":"Russie","SA":"Arabie Saoudite","SN":"Sénégal","RS":"Serbie","SG":"Singapour","SK":"Slovaquie","SI":"Slovénie","ZA":"Afr. du Sud","ES":"Espagne","SE":"Suède","CH":"Suisse","TW":"Taïwan","TH":"Thaïlande","TN":"Tunisie","TR":"Turquie","UA":"Ukraine","AE":"Émirats","GB":"Royaume-Uni","US":"États-Unis","UY":"Uruguay","VE":"Venezuela","VN":"Vietnam","XW":"Monde","XE":"Europe","PR":"Porto Rico"};

const A2_TO_NUM={AM:"051",AR:"032",AU:"036",AT:"040",BD:"050",BY:"112",BE:"056",BO:"068",BA:"070",BR:"076",BG:"100",CA:"124",CL:"152",CN:"156",CO:"170",CR:"188",HR:"191",CU:"192",CZ:"203",DK:"208",EG:"818",EE:"233",FI:"246",FR:"250",GE:"268",DE:"276",GH:"288",GR:"300",GT:"320",HU:"348",IS:"352",IN:"356",ID:"360",IR:"364",IQ:"368",IE:"372",IL:"376",IT:"380",JM:"388",JP:"392",JO:"400",KZ:"398",KE:"404",KR:"410",LV:"428",LB:"422",LT:"440",LU:"442",MY:"458",MX:"484",MA:"504",NL:"528",NZ:"554",NG:"566",NO:"578",PK:"586",PA:"591",PE:"604",PH:"608",PL:"616",PT:"620",RO:"642",RU:"643",SA:"682",SN:"686",RS:"688",SG:"702",SK:"703",SI:"705",ZA:"710",ES:"724",SE:"752",CH:"756",TW:"158",TH:"764",TN:"788",TR:"792",UA:"804",AE:"784",GB:"826",US:"840",UY:"858",VE:"862",VN:"704",PR:"630"};
const NUM_TO_A2={};Object.entries(A2_TO_NUM).forEach(([a2,num])=>{NUM_TO_A2[num]=a2});

// Genre filtering: on garde les genres (y compris génériques type "metal"), on rejette seulement les nationalités
const ROOTS=["metal","rock","pop","punk","core","wave","hop","rap","jazz","blues","folk","soul","funk","house","techno","trance","ambient","classical","country","reggae","ska","grunge","doom","death","thrash","groove","progressive","prog","symphonic","melodic","power","alternative","indie","emo","electronic","electro","synth","industrial","gothic","goth","noise","experimental","psychedelic","garage","shoegaze","math","hardcore","fusion","latin","gospel","disco","dubstep","trap","grime","drill","downtempo","breakbeat","jungle","darkwave","neofolk","dance","grindcore","deathcore","metalcore","stoner","sludge","speed","djent","screamo","swing","bebop","acid","lo-fi","lofi","chillwave","trip-hop","vapor","edm","dnb","afrobeat","cumbia","salsa","bossa","flamenco","fado","chanson","k-pop","j-pop","j-rock","post-rock","post-metal","post-punk","new wave","krautrock","glam","pirate","viking","pagan","drone","surf","britpop","dream pop","synthpop","electropop","coldwave","hyperpop","phonk","boom bap","opera","bluegrass","reggaeton","dancehall","soca","highlife","samba","tango","r&b","rnb","hip hop","hip-hop"];
const ORIGINS=new Set(["swedish","finnish","norwegian","danish","icelandic","german","austrian","swiss","french","italian","spanish","portuguese","brazilian","british","english","american","canadian","australian","japanese","korean","chinese","russian","polish","czech","hungarian","romanian","greek","turkish","mexican","colombian","dutch","belgian","irish","scottish","welsh","south african","indian","thai","jamaican","european","scandinavian","nordic","african","asian","caribbean","armenian"]);
function isGenre(t){const l=t.toLowerCase().trim();if(!l||ORIGINS.has(l))return false;return ROOTS.some(r=>l.includes(r))}

async function fetchMB(name){
  for(let a=0;a<2;a++){try{
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0 (eva-s-cheng.github.io)"}});
    if(r.status===503||r.status===429){await new Promise(r=>setTimeout(r,4000));continue}
    if(!r.ok)return null;const d=await r.json(),x=d.artists?.[0];if(!x||x.score<80)return null;
    const tags=(x.tags||[]).sort((a,b)=>(b.count||0)-(a.count||0)).map(t=>t.name);
    return{genres:tags.filter(isGenre).slice(0,5),country:x.country?ISO[x.country]||x.country:null,countryCode:x.country||null};
  }catch{if(a===0)await new Promise(r=>setTimeout(r,4000))}}return null}

async function searchMBA(tag,cc,lim=15){
  try{const q=cc?`tag:"${tag}" AND country:${cc}`:`tag:"${tag}"`;const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=${lim}&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});if(!r.ok)return[];const d=await r.json();return(d.artists||[]).filter(a=>a.score>70).map(a=>({name:a.name,country:a.country?ISO[a.country]||a.country:null,tags:(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name).filter(isGenre).slice(0,3)}))}catch{return[]}}

// Enrichit chaque suggestion avec image Spotify + id (pour lien & lecture)
async function enrichSug(groups,tok){const out=[];for(const g of groups){const ea=[];for(const a of g.artists){try{const r=await sp(`/search?q=${encodeURIComponent(a.name)}&type=artist&limit=1`,tok);const s=r?.artists?.items?.[0];ea.push({...a,sid:s?.id,img:s?.images?.[0]?.url})}catch{ea.push({...a,sid:null,img:null})}}out.push({...g,artists:ea})}return out}

// ─── THEME ───
const C={bg:"#0D0D0D",sf:"#161616",card:"#1C1C1C",brd:"#2A2A2A",grn:"#1DB954",txt:"#FFF",mut:"#888",acc:"#B3FF5C",dim:"#333",red:"#FF6B6B"};
const CL=["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD","#10AC84","#FDA7DF","#C44569","#3DC1D3","#778BEB","#E77F67"];
function Card({children,style={},onClick}){return<div onClick={onClick} style={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:16,padding:24,cursor:onClick?"pointer":"default",...style}}>{children}</div>}
function Lbl({children}){return<p style={{color:C.mut,fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>{children}</p>}
function SC({label,value,sub,icon,onClick}){return<Card onClick={onClick} style={{padding:18,transition:"border-color 0.2s"}}><div style={{display:"flex",justifyContent:"space-between"}}><Lbl>{label}</Lbl>{icon&&<span style={{fontSize:16}}>{icon}</span>}</div><div style={{fontSize:22,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.mut,marginTop:6}}>{sub}</div>}</Card>}
function fmt(m){if(m<1)return"<1min";if(m<60)return`${Math.round(m)}min`;const h=Math.floor(m/60);return`${h}h${Math.round(m%60)>0?String(Math.round(m%60)).padStart(2,"0"):""}`}

// Genres d'un artiste pour affichage (Title Case, "Unknown" si vide)
function gl(m,k){const arr=(m&&m.genres&&m.genres.length)?m.genres:["unknown"];return(k?arr.slice(0,k):arr).map(tc).join(", ")}

function mapColor(count,max){if(!count)return C.sf;const t=Math.min(1,count/Math.max(max,1));const lerp=(a,b)=>Math.round(a+(b-a)*t);return `rgb(${lerp(26,29)},${lerp(46,185)},${lerp(31,84)})`}

// Cellule custom du treemap genres
function TreemapCell(props){
  const{x,y,width,height}=props;
  const name=props.name,count=props.count??props.size??props.value,f=props.fill||CL[(props.index||0)%CL.length];
  const big=width>46&&height>22;
  return(<g style={{cursor:"pointer"}}>
    <rect x={x} y={y} width={width} height={height} style={{fill:f,stroke:C.bg,strokeWidth:2}} />
    {big&&<text x={x+6} y={y+15} fill="#0D0D0D" fontSize={11} fontWeight={700} style={{pointerEvents:"none"}}>{tc(name)}</text>}
    {big&&height>34&&<text x={x+6} y={y+30} fill="#0D0D0D" fontSize={10} fontWeight={600} style={{pointerEvents:"none"}}>{count}</text>}
  </g>);
}

// ─── ICÔNES SVG (lecteur) ───
const I={
  shuffle:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  prev:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5l-10 7 10 7z"/></svg>,
  next:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l10 7L4 19z"/></svg>,
  play:(s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>,
  pause:(s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>,
  repeat:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  repeatOne:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="9.5" y="15.8" fontSize="9" fill="currentColor" stroke="none" fontWeight="700" fontFamily="monospace">1</text></svg>
};

function PB({icon,active,onClick,big,label}){
  const sz=big?52:38;
  return<button title={label} onClick={onClick} style={{
    width:sz,height:sz,borderRadius:"50%",
    border:big?"none":`1.5px solid ${active?C.grn:C.brd}`,
    background:big?C.grn:active?"rgba(29,185,84,0.18)":"transparent",
    color:big?"#000":active?C.grn:C.txt,cursor:"pointer",padding:0,
    display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",
    boxShadow:active&&!big?`0 0 0 1px ${C.grn},0 0 12px rgba(29,185,84,0.4)`:"none"
  }}>{icon}</button>;
}

function DrillDown({title,items,onClose}){
  return(<div style={{position:"fixed",top:0,right:0,width:420,maxWidth:"90vw",height:"100vh",background:C.card,borderLeft:`2px solid ${C.grn}`,zIndex:1000,overflowY:"auto",padding:24,boxSizing:"border-box"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.grn}}>{title}</h2>
      <button onClick={onClose} style={{background:C.brd,border:"none",color:C.txt,width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
    </div>
    {items}
  </div>);
}

export default function App(){
  const[cid,setCid]=useState(()=>localStorage.getItem("sp_client_id")||"");
  const[tok,setTok]=useState(null);const[ld,setLd]=useState(true);const[lm,setLm]=useState("Connexion…");
  const[err,setErr]=useState(null);const[data,setData]=useState(null);
  const[mb,setMb]=useState({});const[mbL,setMbL]=useState(false);const[mbP,setMbP]=useState(0);const[mbT,setMbT]=useState(0);
  const mbCache=useRef({});
  const[tr,setTr]=useState("medium_term");const[tab,setTab]=useState("overview");const[su,setSu]=useState("input");
  const[pl,setPl]=useState(null);const[devs,setDevs]=useState([]);const[drill,setDrill]=useState(null);
  const[pls,setPls]=useState([]);const[plCounts,setPlCounts]=useState({});
  const[sug,setSug]=useState([]);const[sugL,setSugL]=useState(false);
  const[cG,setCG]=useState("");const[cC,setCC]=useState("");const[cR,setCR]=useState([]);const[cL2,setCL2]=useState(false);
  const[ctxName,setCtxName]=useState("");
  const[plErr,setPlErr]=useState(null);const[toast,setToast]=useState(null);
  const[albumTks,setAlbumTks]=useState([]);
  const[hov,setHov]=useState(null);
  const[friendCode,setFriendCode]=useState("");const[compatRes,setCompatRes]=useState(null);const[compatErr,setCompatErr]=useState(null);const[copied,setCopied]=useState(false);
  const pi=useRef(null);const lastCtx=useRef(null);const tabRef=useRef("overview");
  useEffect(()=>{tabRef.current=tab},[tab]);

  // Toast auto-dismiss
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t)},[toast]);

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
    setPls([...(p1.items||[]),...(p2.items||[])]);setPlCounts({});
    const am={};ri.forEach(i=>{const t=i.track;if(!t)return;const d=(t.duration_ms||0)/60000;(t.artists||[]).forEach(a=>{if(!am[a.id])am[a.id]={name:a.name,id:a.id,min:0,plays:0};am[a.id].min+=d;am[a.id].plays++})});
    const abt=Object.values(am).sort((a,b)=>b.min-a.min);
    const tm={};ri.forEach(i=>{const t=i.track;if(!t)return;if(!tm[t.id])tm[t.id]={...t,plays:0};tm[t.id].plays++});
    const tbp=Object.values(tm).sort((a,b)=>b.plays-a.plays);
    const hr=Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0}));ri.forEach(i=>{const h=new Date(i.played_at).getHours();hr[h].nb++;hr[h].min+=(i.track?.duration_ms||0)/60000});
    const avgDur=tT.length>0?tT.reduce((s,t)=>s+(t.duration_ms||0),0)/tT.length/60000:0;
    setData({tA,tT,ri,prof,abt,tbp,hr,avgDur});
    setLd(false);

    const cached={};tA.forEach(a=>{if(mbCache.current[a.id])cached[a.id]=mbCache.current[a.id]});
    setMb(cached);
    const toFetch=tA.filter(a=>!mbCache.current[a.id]);
    setMbT(tA.length);setMbP(tA.length-toFetch.length);
    if(toFetch.length>0){
      setMbL(true);
      for(const a of toFetch){
        const r=await fetchMB(a.name);
        if(r){mbCache.current[a.id]=r;setMb(prev=>({...prev,[a.id]:r}))}
        else{mbCache.current[a.id]={genres:[],country:null,countryCode:null};setMb(prev=>({...prev,[a.id]:mbCache.current[a.id]}))}
        setMbP(p=>p+1);
        await new Promise(r=>setTimeout(r,1500));
      }
      setMbL(false);
    }
  }catch(e){setErr(e.message);setLd(false)}})()},[tok,tr]);

  // Récupère le nombre de titres manquants — UNIQUEMENT sur l'onglet Playlists, lentement (évite le 429)
  useEffect(()=>{if(tab!=="playlists"||!tok||!pls.length)return;const missing=pls.filter(p=>typeof p.tracks?.total!=="number"&&plCounts[p.id]===undefined).slice(0,40);if(!missing.length)return;let live=true;(async()=>{for(const p of missing){if(!live)return;try{const r=await sp(`/playlists/${p.id}?fields=tracks.total`,tok);if(live&&r?.tracks&&typeof r.tracks.total==="number")setPlCounts(c=>({...c,[p.id]:r.tracks.total}))}catch{}await new Promise(r=>setTimeout(r,500))}})();return()=>{live=false}},[tab,pls,tok]);

  // Suggestions
  useEffect(()=>{
    if(mbL||!data||!tok||Object.keys(mb).length===0)return;
    const{tA,tT,ri}=data;const known=new Set();tA.forEach(a=>known.add(a.name.toLowerCase()));tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));
    const combos={};tA.forEach(a=>{const m=mb[a.id];if(!m||!m.countryCode||!m.genres?.length)return;m.genres.forEach(g=>{const k=`${g}|||${m.countryCode}`;if(!combos[k])combos[k]={genre:g,code:m.countryCode,country:m.country,count:0};combos[k].count++})});
    const topC=Object.values(combos).sort((a,b)=>b.count-a.count).slice(0,5);
    const gO={};tA.forEach(a=>{const m=mb[a.id];if(!m||!m.genres?.length)return;m.genres.forEach(g=>{gO[g]=(gO[g]||0)+1})});
    const topG=Object.entries(gO).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>({genre:g,code:null,country:null}));
    if(topC.length===0&&topG.length===0)return;
    setSugL(true);
    (async()=>{const results=[];for(const c of[...topC,...topG].slice(0,6)){const artists=await searchMBA(c.genre,c.code,20);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));if(f.length>0)results.push({genre:c.genre,country:c.country,artists:f.slice(0,8)});await new Promise(r=>setTimeout(r,2000))}const e=await enrichSug(results,tok);setSug(e);setSugL(false)})();
  },[mb,mbL]);

  useEffect(()=>{if(!tok)return;
    const f=async()=>{
      if(document.hidden)return;
      try{const p=await sp("/me/player",tok,{},0);setPl(p);
        const uri=p?.context?.uri||null;
        if(uri!==lastCtx.current){lastCtx.current=uri;
          if(uri){const id=uri.split(":")[2],ty=p.context.type;
            try{if(ty==="playlist"){const r=await sp(`/playlists/${id}?fields=name`,tok,{},0);setCtxName(r?.name||"")}
            else if(ty==="album"){const r=await sp(`/albums/${id}?fields=name`,tok,{},0);setCtxName(r?.name||"")}
            else setCtxName("")}catch{setCtxName("")}
          }else setCtxName("");
        }
      }catch{}
      if(tabRef.current==="player"){sp("/me/player/devices",tok,{},0).then(d=>setDevs(d?.devices||[])).catch(()=>{})}
    };
    f();pi.current=setInterval(f,15000);
    const onVis=()=>{if(!document.hidden)f()};document.addEventListener("visibilitychange",onVis);
    return()=>{clearInterval(pi.current);document.removeEventListener("visibilitychange",onVis)}},[tok]);

  useEffect(()=>{const id=pl?.item?.album?.id;if(!id||!tok){setAlbumTks([]);return}let live=true;sp(`/albums/${id}/tracks?limit=50`,tok).then(r=>{if(live)setAlbumTks(r?.items||[])}).catch(()=>{if(live)setAlbumTks([])});return()=>{live=false}},[pl?.item?.album?.id,tok]);

  const cmd=async a=>{try{if(a==="play")await sp("/me/player/play",tok,{method:"PUT"});else if(a==="pause")await sp("/me/player/pause",tok,{method:"PUT"});else if(a==="next")await sp("/me/player/next",tok,{method:"POST"});else if(a==="prev")await sp("/me/player/previous",tok,{method:"POST"});else if(a==="shuffle")await sp(`/me/player/shuffle?state=${!pl?.shuffle_state}`,tok,{method:"PUT"});else if(a==="repeat"){const m=["off","context","track"];await sp(`/me/player/repeat?state=${m[(m.indexOf(pl?.repeat_state||"off")+1)%3]}`,tok,{method:"PUT"})}setTimeout(()=>sp("/me/player",tok).then(setPl).catch(()=>{}),300)}catch{}};
  const play=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({uris:[u]})})}catch{}};
  const playCtx=async u=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:u})})}catch{}};
  const playArt=async id=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify({context_uri:`spotify:artist:${id}`})})}catch{}};
  // Joue le 1er titre (top track) d'un artiste de suggestion
  const playArtTop=async sid=>{if(!sid)return;try{const r=await sp(`/artists/${sid}/top-tracks`,tok);const u=r?.tracks?.[0]?.uri;if(u){await play(u);return}}catch{}try{await playArt(sid)}catch{}};
  const mkPl=async(n,uris)=>{if(!uris?.length){setToast({ok:false,msg:"Aucun titre à mettre dans cette playlist."});return}try{const p=await sp(`/users/${data.prof.id}/playlists`,tok,{method:"POST",body:JSON.stringify({name:n,public:false})});if(!p?.id)throw new Error("réponse vide");for(let i=0;i<uris.length;i+=100)await sp(`/playlists/${p.id}/tracks`,tok,{method:"POST",body:JSON.stringify({uris:uris.slice(i,i+100)})});setToast({ok:true,msg:`« ${n} » créée — ${uris.length} titres ✓`})}catch(e){if(e.status===403){setPlErr("Spotify a refusé la création (403). Ton autorisation date d'avant l'ajout des permissions playlist — révoque l'app puis reconnecte-toi.")}else{setPlErr(`Échec de la création (erreur ${e.status||e.message}). Essaie de te reconnecter.`)}}};
  const customSearch=async()=>{if(!cG)return;setCL2(true);setCR([]);const known=new Set();data.tA.forEach(a=>known.add(a.name.toLowerCase()));data.tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));data.ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));const cc=cC?Object.entries(ISO).find(([,v])=>v===cC)?.[0]||null:null;const artists=await searchMBA(cG,cc,25);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));const e=await enrichSug([{genre:cG,country:cC||null,artists:f.slice(0,12)}],tok);setCR(e);setCL2(false)};

  const login=useCallback(async()=>{if(!cid.trim())return;const v=genV(),ch=await genC(v);sessionStorage.setItem("sp_verifier",v);sessionStorage.setItem("sp_client_id",cid.trim());const u=new URL("https://accounts.spotify.com/authorize");u.searchParams.set("client_id",cid.trim());u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",REDIR);u.searchParams.set("scope",SCOPES);u.searchParams.set("code_challenge_method","S256");u.searchParams.set("code_challenge",ch);window.location.href=u.toString()},[cid]);
  const forceReauth=useCallback(()=>{sessionStorage.removeItem("sp_code");setMb({});mbCache.current={};setData(null);setTok(null);login()},[login]);

  const spin=<style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>;
  if(ld)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut,fontSize:14}}>{lm}</p></div>{spin}</div>;
  if(err&&!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}><p style={{color:C.red,fontSize:14,marginBottom:20}}>{err}</p><button onClick={()=>setErr(null)} style={{padding:"12px 24px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if(!tok)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}}><div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:48,marginBottom:12}}>🎧</div><h1 style={{color:C.txt,fontSize:28,fontWeight:700,margin:0}}>Your Spotify, Uncovered.</h1><p style={{color:C.mut,marginTop:8,fontSize:14}}>Ton analyse complète</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.brd}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSu(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:su===k?C.grn:C.mut,borderBottom:`2px solid ${su===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{su==="input"?<div><label style={{color:C.mut,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={cid} onChange={e=>setCid(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.mut,fontSize:11,marginTop:8}}>Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><button onClick={login} disabled={!cid.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:cid.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:cid.trim()?"#000":C.mut,fontSize:15,fontWeight:700,cursor:cid.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.mut,lineHeight:1.8}}><p><span style={{color:C.grn,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.acc}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.grn,fontWeight:700}}>2.</span> Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><p><span style={{color:C.grn,fontWeight:700}}>3.</span> Web API → Copie Client ID → Connecte</p></div>}</Card></div></div>;
  if(!data)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut}}>{lm}</p></div>{spin}</div>;

  const{tA,tT,ri,prof,abt,tbp,hr,avgDur}=data;
  const gc={},cc={},abg={},abc={},ccByCode={},abcByCode={};
  tA.forEach(a=>{const m=mb[a.id];if(!m)return;const gs=(m.genres&&m.genres.length)?m.genres:["unknown"];gs.forEach(g=>{gc[g]=(gc[g]||0)+1;if(!abg[g])abg[g]=[];abg[g].push(a)});if(m.country){cc[m.country]=(cc[m.country]||0)+1;if(!abc[m.country])abc[m.country]=[];abc[m.country].push(a)}if(m.countryCode){ccByCode[m.countryCode]=(ccByCode[m.countryCode]||0)+1;if(!abcByCode[m.countryCode])abcByCode[m.countryCode]=[];abcByCode[m.countryCode].push(a)}});
  const allG=Object.entries(gc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const allC=Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const treeData=allG.map((g,i)=>({name:g.name,size:g.count,count:g.count,fill:CL[i%CL.length]}));
  const maxC=allC.length?Math.max(...allC.map(c=>c.count)):1;
  const gph=hr.map((_,idx)=>{const ht=ri.filter(i=>new Date(i.played_at).getHours()===idx);const hgc={};ht.forEach(i=>(i.track?.artists||[]).forEach(a=>{const m=mb[a.id];if(m&&m.genres?.length)m.genres.forEach(g=>{hgc[g]=(hgc[g]||0)+1})}));const top=Object.entries(hgc).sort((a,b)=>b[1]-a[1])[0];return{h:`${idx}h`,genre:top?top[0]:"—",nb:hr[idx].nb}}).filter(h=>h.nb>0);
  const hGenres=[...new Set(gph.map(h=>h.genre).filter(g=>g!=="—"))];
  const enr=Object.keys(mb).length;const TL={short_term:"4 sem.",medium_term:"6 mois",long_term:"Tout"};
  const np=pl?.item;const npMb=np?.artists?.[0]?.id?mb[np.artists[0].id]:null;
  const tabs=[["overview","📊 Overview"],["artists","🎤 Artistes"],["tracks","🎵 Titres"],["genres","🎨 Genres"],["countries","🌍 Carte"],["trends","📈 Tendances"],["discover","🔮 Découvertes"],["playlists","📋 Playlists"],["history","🕐 Historique"],["player","🎮 Lecteur"],["compat","🤝 Compat"]];
  const nowUri=pl?.context?.uri;
  const changeTr=k=>{setTr(k);setTab("overview")};

  const popVals=tA.map(a=>a.popularity).filter(p=>typeof p==="number");
  const obscurity=popVals.length?Math.round(100-popVals.reduce((s,p)=>s+p,0)/popVals.length):null;

  const dl=(name,content,type)=>{const b=new Blob([content],{type});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)};
  const exportJSON=()=>dl(`spotify-${tr}.json`,JSON.stringify({profil:prof.display_name,periode:TL[tr],obscurite:obscurity,genres:allG.map(g=>({...g,name:tc(g.name)})),pays:allC,artistes:tA.map(a=>({nom:a.name,popularite:a.popularity,genres:(mb[a.id]?.genres||[]).map(tc),pays:mb[a.id]?.country||null}))},null,2),"application/json");
  const exportCSV=()=>{const rows=[["#","Artiste","Popularité","Genres","Pays"]];tA.forEach((a,i)=>{const m=mb[a.id];rows.push([i+1,a.name,a.popularity??"",(m?.genres||[]).map(tc).join(" / ")||"Unknown",m?.country||""])});dl(`spotify-artistes-${tr}.csv`,"\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"),"text/csv")};

  // ─── PARTAGE (image enrichie) ───
  const generateShare=()=>{const W=1080,H=1920,cv=document.createElement("canvas");cv.width=W;cv.height=H;const x=cv.getContext("2d");
    x.fillStyle="#0D0D0D";x.fillRect(0,0,W,H);x.fillStyle="#1DB954";x.fillRect(0,0,W,14);
    let cy=120;
    x.fillStyle="#1DB954";x.font="bold 66px Inter,Arial,sans-serif";x.fillText("Your Spotify",70,cy);
    x.fillStyle="#fff";x.fillText("Uncovered",70,cy+80);cy+=130;
    x.fillStyle="#888";x.font="26px monospace";x.fillText(`${prof.display_name} · ${TL[tr]}`,70,cy);cy+=80;
    x.fillStyle="#B3FF5C";x.font="bold 28px monospace";x.fillText("TOP 5 ARTISTES",70,cy);
    tA.slice(0,5).forEach((a,i)=>{cy+=56;x.fillStyle="#1DB954";x.font="bold 34px monospace";x.fillText(`${i+1}`,70,cy);x.fillStyle="#fff";x.font="36px Inter,Arial,sans-serif";x.fillText(a.name.slice(0,28),130,cy)});
    cy+=80;
    x.fillStyle="#B3FF5C";x.font="bold 28px monospace";x.fillText("TOP 5 TITRES",70,cy);
    tT.slice(0,5).forEach((t,i)=>{cy+=70;x.fillStyle="#1DB954";x.font="bold 30px monospace";x.fillText(`${i+1}`,70,cy);x.fillStyle="#fff";x.font="30px Inter,Arial,sans-serif";x.fillText(t.name.slice(0,30),130,cy);x.fillStyle="#888";x.font="22px Inter,Arial,sans-serif";x.fillText((t.artists||[]).map(a=>a.name).join(", ").slice(0,36),130,cy+28)});
    cy+=90;
    const tiles=[["GENRE #1",allG[0]?tc(allG[0].name):"—"],["PAYS #1",allC[0]?allC[0].name:"—"],["OBSCURITÉ",obscurity!==null?`${obscurity}/100`:"—"]];
    tiles.forEach((t,i)=>{const tx=70+i*(W-140-2*20)/3+i*20*0,bw=(W-140-40)/3;const X=70+i*(bw+20);x.fillStyle="#161616";x.fillRect(X,cy,bw,150);x.fillStyle="#B3FF5C";x.font="bold 20px monospace";x.fillText(t[0],X+18,cy+42);x.fillStyle="#fff";x.font="bold 30px Inter,Arial,sans-serif";x.fillText(String(t[1]).slice(0,11),X+18,cy+96)});
    cy+=210;
    x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("GENRES",70,cy);cy+=44;
    x.fillStyle="#fff";x.font="26px Inter,Arial,sans-serif";x.fillText(allG.slice(0,6).map(g=>tc(g.name)).join(" · ").slice(0,54),70,cy);cy+=66;
    x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("PAYS",70,cy);cy+=44;
    x.fillStyle="#fff";x.font="26px Inter,Arial,sans-serif";x.fillText(allC.slice(0,6).map(c=>c.name).join(" · ").slice(0,54),70,cy);cy+=80;
    x.fillStyle="#888";x.font="24px monospace";x.fillText(`${tA.length} artistes · ${allG.length} genres · ${allC.length} pays`,70,cy);
    x.fillStyle="#555";x.font="22px monospace";x.fillText("eva-s-cheng.github.io/spotify-dashboard",70,H-60);
    cv.toBlob(async b=>{const f=new File([b],"spotify-wrapped.png",{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:"Your Spotify, Uncovered"});return}catch{}}const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="spotify-wrapped.png";a.click();URL.revokeObjectURL(u)},"image/png")};

  // ─── Compatibilité ───
  const myCompat={n:prof.display_name,a:tA.slice(0,50).map(a=>a.name),g:allG.slice(0,15).map(g=>g.name),c:allC.slice(0,15).map(c=>c.name)};
  const myCode=b64encode(myCompat);
  const copyCode=()=>{navigator.clipboard?.writeText(myCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)}).catch(()=>{})};
  const compare=()=>{setCompatErr(null);setCompatRes(null);if(!friendCode.trim())return;try{
    const f=b64decode(friendCode);const lc=arr=>new Set((arr||[]).map(s=>String(s).toLowerCase()));
    const jac=(s1,s2)=>{const inter=[...s1].filter(x=>s2.has(x));const u=new Set([...s1,...s2]);return{score:u.size?inter.length/u.size:0,inter}};
    const aj=jac(lc(myCompat.a),lc(f.a)),gj=jac(lc(myCompat.g),lc(f.g)),cj=jac(lc(myCompat.c),lc(f.c));
    const score=Math.round((aj.score*0.5+gj.score*0.3+cj.score*0.2)*100);
    const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
    setCompatRes({name:f.n||"ton ami·e",score,artists:aj.inter.map(cap),genres:gj.inter.map(tc),countries:cj.inter.map(cap)});
  }catch{setCompatErr("Code invalide — vérifie que tu as bien collé le code entier.")}};

  const openDrill=(title,artists)=>{
    const tracks=tT.filter(t=>(t.artists||[]).some(a=>artists.some(d=>d.id===a.id)));
    setDrill({title,content:<div>
      <p style={{color:C.mut,fontSize:12,marginBottom:12}}>{artists.length} artistes · {tracks.length} titres</p>
      {tracks.length>0&&<button onClick={()=>mkPl(`${title} Mix`,tracks.map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:16}}>Créer playlist</button>}
      {artists.map((a,i)=>{const m=mb[a.id];const at=tracks.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id));return<div key={a.id} style={{marginBottom:10}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:600}}>{a.name}</div><div style={{color:C.mut,fontSize:10}}>{gl(m)}{m?.country?` · ${m.country}`:""}</div></div></div>{at.length>0&&<div style={{marginLeft:64}}>{at.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"2px 0",cursor:"pointer",borderBottom:`1px solid ${C.brd}`}} onClick={()=>play(t.uri)}><div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{color:C.grn,fontSize:10}}>▶</span></div>)}</div>}</div>})}
    </div>});
  };

  // Ligne d'artiste suggéré : image Spotify, clic = 1er titre, lien ↗ page Spotify
  const SugRow=({a,fb})=>(<div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`}}>
    <div onClick={()=>a.sid&&playArtTop(a.sid)} title={a.sid?"Lire le 1er titre":""} style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0,cursor:a.sid?"pointer":"default"}}>
      {a.img?<img src={a.img} alt="" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:38,height:38,borderRadius:"50%",background:fb,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#000",fontWeight:700}}>{a.name[0]}</div>}
      <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{(a.tags||[]).map(tc).join(", ")}</div></div>
      {a.sid&&<span style={{color:C.grn,fontSize:11}}>▶</span>}
    </div>
    {a.sid&&<a href={`https://open.spotify.com/artist/${a.sid}`} target="_blank" rel="noreferrer" title="Page Spotify" onClick={e=>e.stopPropagation()} style={{color:C.acc,fontSize:14,textDecoration:"none",padding:"4px 6px"}}>↗</a>}
  </div>);

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.txt,padding:"20px 16px 100px",maxWidth:1200,margin:"0 auto"}}>
      {drill&&<><div onClick={()=>setDrill(null)} style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.6)",zIndex:999}} /><DrillDown title={drill.title} items={drill.content} onClose={()=>setDrill(null)} /></>}

      {plErr&&<div style={{background:"rgba(255,107,107,0.12)",border:`1px solid ${C.red}`,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{color:C.red,fontSize:12,flex:1,minWidth:200}}>{plErr}</span>
        <button onClick={()=>window.open("https://www.spotify.com/account/apps/","_blank","noreferrer")} style={{padding:"8px 14px",background:C.brd,border:"none",borderRadius:50,color:C.txt,fontSize:11,fontWeight:600,cursor:"pointer"}}>Gérer les apps ↗</button>
        <button onClick={forceReauth} style={{padding:"8px 14px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>Révoquer & reconnecter</button>
        <button onClick={()=>setPlErr(null)} style={{background:"none",border:"none",color:C.mut,cursor:"pointer"}}>✕</button>
      </div>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>{prof.images?.[0]&&<img src={prof.images[0].url} alt="" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.grn}`}} />}<div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>{prof.display_name}</h1><p style={{margin:0,color:C.mut,fontSize:11}}>{TL[tr]}</p></div></div>
        <div style={{display:"flex",gap:6}}>{Object.entries(TL).map(([k,l])=><button key={k} onClick={()=>changeTr(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:tr===k?C.grn:C.card,border:`1px solid ${tr===k?C.grn:C.brd}`,color:tr===k?"#000":C.mut,cursor:"pointer",fontWeight:tr===k?700:400}}>{l}</button>)}</div>
      </div>

      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.brd}`,overflowX:"auto"}}>{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"10px 12px",background:"none",border:"none",color:tab===k?C.grn:C.mut,borderBottom:`2px solid ${tab===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:11,fontWeight:tab===k?600:400,marginBottom:-1,whiteSpace:"nowrap"}}>{l}</button>)}</div>
      {mbL&&<div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:C.mut,fontSize:11}}>Enrichissement en cours…</span><span style={{color:C.mut,fontSize:11}}>{mbP}/{mbT}</span></div><div style={{width:"100%",height:3,background:C.brd,borderRadius:2}}><div style={{width:`${(mbP/Math.max(mbT,1))*100}%`,height:"100%",background:C.grn,borderRadius:2,transition:"width 0.5s"}} /></div></div>}

      {/* OVERVIEW */}
      {tab==="overview"&&<>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={generateShare} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer"}}>📸 Partager mes stats</button>
          <button onClick={exportJSON} style={{padding:"8px 16px",background:C.card,border:`1px solid ${C.brd}`,borderRadius:50,color:C.txt,fontSize:12,cursor:"pointer"}}>⬇ JSON</button>
          <button onClick={exportCSV} style={{padding:"8px 16px",background:C.card,border:`1px solid ${C.brd}`,borderRadius:50,color:C.txt,fontSize:12,cursor:"pointer"}}>⬇ CSV</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <SC label="Artistes" value={tA.length} icon="🎤" onClick={()=>openDrill("Tous les artistes",tA)} />
          <SC label="Durée moy." value={fmt(avgDur)} sub="par titre" icon="📏" />
          {obscurity!==null&&<SC label="Obscurité" value={`${obscurity}/100`} sub="100 = très underground" icon="🕳" />}
          {allG.length>0&&<SC label="Genre #1" value={tc(allG[0].name)} sub={`${allG[0].count} artistes`} icon="🎨" onClick={()=>openDrill(tc(allG[0].name),abg[allG[0].name]||[])} />}
          {allC.length>0&&<SC label="Pays #1" value={allC[0].name} sub={`${allC[0].count} artistes`} icon="🌍" onClick={()=>openDrill(allC[0].name,abc[allC[0].name]||[])} />}
          <SC label="Genres" value={allG.length} icon="🏷" onClick={()=>setDrill({title:"Tous les genres",content:<div>{allG.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(tc(g.name),abg[g.name]||[])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:12}}>{tc(g.name)}</div><span style={{color:C.mut,fontSize:10}}>{g.count}</span></div>)}</div>})} />
          <SC label="Pays" value={allC.length} icon="🗺" onClick={()=>setDrill({title:"Tous les pays",content:<div>{allC.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(c.name,abc[c.name]||[])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:13}}>{c.name}</div><span style={{color:C.mut,fontSize:10}}>{c.count}</span></div>)}</div>})} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><Lbl>Top 5 artistes</Lbl>{tA.slice(0,5).map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(a.name,[a])}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1}}><div style={{color:C.txt,fontSize:12,fontWeight:500}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{gl(m)}{m?.country?` · ${m.country}`:""}</div></div></div>})}</Card>
          <Card><Lbl>Top 5 titres</Lbl>{tT.slice(0,5).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:6}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div></div>)}</Card>
        </div>
      </>}

      {tab==="artists"&&<><div style={{marginBottom:16}}><button onClick={()=>{const uris=[];tA.forEach(a=>{tT.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id)).forEach(t=>{if(!uris.includes(t.uri))uris.push(t.uri)})});mkPl(`Top Artistes — ${TL[tr]}`,uris)}} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer playlist top artistes</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tA.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tA.map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(a.name,[a])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:30,height:30,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{gl(m,2)}{m?.country?` · ${m.country}`:""}</div></div></div>})}</div></Card><Card><Lbl>Temps d'écoute récent</Lbl>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(600,abt.slice(0,15).length*36)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.min)}))} layout="vertical"><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i)=><Cell key={i} fill={CL[i%CL.length]} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.mut}}>Pas de données</p>}</Card></div></>}

      {tab==="tracks"&&<><div style={{marginBottom:16}}><button onClick={()=>mkPl(`Top ${tT.length} Titres — ${TL[tr]}`,tT.map(t=>t.uri))} style={{padding:"8px 16px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer playlist ({tT.length} titres)</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Top {tT.length}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";return<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />:<div style={{width:30,height:30,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{d}</div></div>})}</div></Card><Card><Lbl>Plus joués récemment</Lbl>{tbp.map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:30,height:30,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><div style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x</div></div>)}</Card></div></>}

      {/* GENRES — treemap au lieu du camembert */}
      {tab==="genres"&&(allG.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Genres ({allG.length})</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Taille = nombre d'artistes. Clique un bloc pour le détail.</p><ResponsiveContainer width="100%" height={Math.max(360,Math.min(560,allG.length*26))}><Treemap data={treeData} dataKey="size" stroke={C.bg} isAnimationActive={false} content={<TreemapCell/>} onClick={node=>{const nm=node?.name;if(nm&&abg[nm])openDrill(tc(nm),abg[nm])}} /></ResponsiveContainer></Card>
        <Card><Lbl>Classement ({allG.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allG.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(tc(g.name),abg[g.name]||[])}><span style={{color:i<3?C.grn:C.mut,fontSize:11,width:26,textAlign:"right",fontFamily:"monospace",fontWeight:i<3?700:400}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:12}}>{tc(g.name)}</div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{g.count}</span></div>)}</div></Card>
      </div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`Enrichissement ${mbP}/${mbT}`:"Pas de données"}</p></Card>)}

      {/* CARTE — liste pays en classement (pas de couleur par pays) */}
      {tab==="countries"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card style={{position:"relative"}}><Lbl>Carte ({allC.length} pays)</Lbl>
          {allC.length===0&&<p style={{color:C.mut,textAlign:"center"}}>{mbL?`Enrichissement ${mbP}/${mbT}`:"Pas de données"}</p>}
          <div style={{position:"relative"}}>
            <ComposableMap projection="geoEqualEarth" projectionConfig={{scale:150}} style={{width:"100%",height:"auto"}}>
              <ZoomableGroup center={[10,15]} zoom={1} maxZoom={6}>
                <Geographies geography={WORLD_TOPO}>
                  {({geographies})=>geographies.map(geo=>{
                    const num=String(geo.id).padStart(3,"0");const code=NUM_TO_A2[num];const count=code?(ccByCode[code]||0):0;
                    return <Geography key={geo.rsmKey} geography={geo} fill={mapColor(count,maxC)} stroke={C.bg} strokeWidth={0.3}
                      onMouseEnter={()=>setHov({name:code?(ISO[code]||geo.properties.name):geo.properties.name,count})}
                      onMouseLeave={()=>setHov(null)}
                      onClick={()=>{if(count&&code&&abcByCode[code])openDrill(ISO[code]||geo.properties.name,abcByCode[code])}}
                      style={{default:{outline:"none",cursor:count?"pointer":"default"},hover:{fill:count?C.acc:C.brd,outline:"none"},pressed:{outline:"none"}}} />;
                  })}
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
            {hov&&<div style={{position:"absolute",top:8,left:8,background:C.bg,border:`1px solid ${C.brd}`,borderRadius:8,padding:"6px 12px",pointerEvents:"none"}}><span style={{color:C.txt,fontSize:12,fontWeight:600}}>{hov.name}</span>{hov.count>0&&<span style={{color:C.grn,fontSize:12,fontWeight:700}}> · {hov.count}</span>}</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}><span style={{color:C.mut,fontSize:10}}>0</span><div style={{flex:1,height:8,borderRadius:4,background:`linear-gradient(90deg,${C.sf},${mapColor(maxC/2,maxC)},${C.grn})`}} /><span style={{color:C.mut,fontSize:10}}>{maxC} artistes</span></div>
          <p style={{color:C.mut,fontSize:10,marginTop:6}}>Survole un pays · clique pour les artistes · zoom à la molette.</p>
        </Card>
        <Card><Lbl>Classement ({allC.length})</Lbl><div style={{maxHeight:600,overflowY:"auto"}}>{allC.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(c.name,abc[c.name]||[])}><span style={{color:i<3?C.grn:C.mut,fontSize:13,width:30,textAlign:"right",fontFamily:"monospace",fontWeight:i<3?800:500}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:13,fontWeight:i<3?600:400}}>{c.name}</div><div style={{flex:1,maxWidth:120}}><div style={{height:6,borderRadius:3,background:C.grn,width:`${(c.count/maxC)*100}%`,opacity:0.5+0.5*(c.count/maxC)}} /></div><span style={{color:C.mut,fontSize:11,fontFamily:"monospace",width:30,textAlign:"right"}}>{c.count}</span></div>)}</div></Card>
      </div>}

      {tab==="trends"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Écoutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} /><Bar dataKey="nb" fill={C.grn} radius={[4,4,0,0]} name="Écoutes" /></BarChart></ResponsiveContainer></Card><Card><Lbl>Minutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={v=>[`${Math.round(v)} min`]} /><Bar dataKey="min" fill={C.acc} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></Card><Card style={{gridColumn:"span 2"}}><Lbl>Genre dominant / heure</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Pour chaque heure où tu as écouté, le genre le plus présent. Longueur = nombre d'écoutes. Survole pour le genre.</p><ResponsiveContainer width="100%" height={Math.max(200,gph.length*28)}><BarChart data={gph} layout="vertical"><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="h" tick={{fill:C.grn,fontSize:11,fontWeight:700}} axisLine={false} tickLine={false} width={40} /><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt}} formatter={(v,n,p)=>[`${v} écoutes — ${tc(p.payload.genre)}`]} /><Bar dataKey="nb" radius={[0,6,6,0]}>{gph.map((d,i)=><Cell key={i} fill={CL[hGenres.indexOf(d.genre)%CL.length]||C.dim} />)}</Bar></BarChart></ResponsiveContainer><div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>{hGenres.map((g,i)=><div key={g} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>openDrill(tc(g),abg[g]||[])}><div style={{width:8,height:8,borderRadius:"50%",background:CL[i%CL.length]}} /><span style={{color:C.mut,fontSize:10}}>{tc(g)}</span></div>)}</div></Card></div>}

      {/* DÉCOUVERTES — images + clic = 1er titre + lien Spotify */}
      {tab==="discover"&&<div><Card style={{marginBottom:16}}><Lbl>Suggestions automatiques</Lbl>{sugL&&<p style={{color:C.mut,fontSize:11}}>Recherche en cours…</p>}{sug.length===0&&!sugL&&<p style={{color:C.mut,fontSize:12}}>Disponible après enrichissement.</p>}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>{sug.map((s,si)=><Card key={si} style={{padding:16,background:C.sf}}><div style={{marginBottom:10}}><span style={{color:C.acc,fontSize:13,fontWeight:600}}>{tc(s.genre)}</span>{s.country&&<span style={{color:C.mut,fontSize:10}}> · {s.country}</span>}</div>{s.artists.map((a,ai)=><SugRow key={ai} a={a} fb={CL[(si*5+ai)%CL.length]} />)}</Card>)}</div></Card><Card><Lbl>Recherche personnalisée</Lbl><div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><select value={cG} onChange={e=>setCG(e.target.value)} style={{flex:1,minWidth:140,padding:10,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Genre…</option>{allG.map(g=><option key={g.name} value={g.name}>{tc(g.name)} ({g.count})</option>)}</select><select value={cC} onChange={e=>setCC(e.target.value)} style={{flex:1,minWidth:140,padding:10,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Tous pays</option>{allC.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><button onClick={customSearch} disabled={!cG||cL2} style={{padding:"10px 20px",background:cG?C.grn:C.brd,border:"none",borderRadius:8,color:cG?"#000":C.mut,fontSize:12,fontWeight:600,cursor:cG?"pointer":"default"}}>{cL2?"…":"Chercher"}</button></div>{cR.map((s,si)=><div key={si}><div style={{color:C.acc,fontSize:13,fontWeight:600,marginBottom:8}}>{tc(s.genre)}{s.country?` · ${s.country}`:""}</div><div>{s.artists.map((a,ai)=><SugRow key={ai} a={a} fb={CL[ai%CL.length]} />)}</div></div>)}</Card></div>}

      {/* PLAYLISTS */}
      {tab==="playlists"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card><Lbl>Mes playlists ({pls.length})</Lbl><div style={{maxHeight:700,overflowY:"auto"}}>{pls.map(p=>{const isPlaying=nowUri===p.uri;const n=plCounts[p.id]!==undefined?plCounts[p.id]:p.tracks?.total;return<div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:isPlaying?"8px":"8px 0",borderBottom:`1px solid ${C.brd}`,background:isPlaying?"rgba(29,185,84,0.1)":"transparent",borderRadius:isPlaying?10:0,marginBottom:isPlaying?4:0}}>
        {p.images?.[0]?<img src={p.images[0].url} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover"}} />:<div style={{width:42,height:42,borderRadius:6,background:C.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>♪</div>}
        <div style={{flex:1,minWidth:0}}><div style={{color:isPlaying?C.grn:C.txt,fontSize:12,fontWeight:isPlaying?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div><div style={{color:C.mut,fontSize:10}}>{typeof n==="number"?`${n} titres`:"…"}{isPlaying&&<span style={{color:C.grn,fontWeight:700}}> · En lecture</span>}</div></div>
        <a href={`https://open.spotify.com/playlist/${p.id}`} target="_blank" rel="noreferrer" title="Ouvrir dans Spotify" style={{color:C.acc,fontSize:15,textDecoration:"none",padding:"4px 6px"}}>↗</a>
        <button onClick={()=>(isPlaying&&pl?.is_playing)?cmd("pause"):playCtx(p.uri)} title={(isPlaying&&pl?.is_playing)?"Pause":"Lecture"} style={{background:isPlaying?C.grn:C.brd,border:"none",borderRadius:"50%",width:30,height:30,color:isPlaying?"#000":C.txt,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{(isPlaying&&pl?.is_playing)?I.pause(13):I.play(13)}</button>
      </div>})}</div></Card><Card><Lbl>Créer des playlists</Lbl>{allG.slice(0,3).map(g=><button key={g.name} onClick={()=>{const a=abg[g.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);mkPl(`Best of ${tc(g.name)}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🎨 Best of {tc(g.name)}</button>)}{allC.slice(0,3).map(c=><button key={c.name} onClick={()=>{const a=abc[c.name]||[];const u=tT.filter(t=>(t.artists||[]).some(ar=>a.some(x=>x.id===ar.id))).map(t=>t.uri);mkPl(`Best of ${c.name}`,u)}} style={{display:"block",width:"100%",padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>🌍 Best of {c.name}</button>)}<p style={{color:C.mut,fontSize:10,marginTop:8}}>Un bouton crée une playlist privée à partir de tes top titres du genre/pays.</p></Card></div>}

      {tab==="history"&&<Card><Lbl>50 dernières écoutes</Lbl><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:26,height:26,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>})}</div></Card>}

      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><Card>{np?<div><div style={{display:"flex",gap:16,marginBottom:20}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:140,height:140,borderRadius:12}} />}<div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div><div style={{color:C.mut,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div><a href={`https://open.spotify.com/album/${np.album?.id}`} target="_blank" rel="noreferrer" style={{color:C.acc,fontSize:11,textDecoration:"none",display:"block",marginTop:4}}>💿 {np.album?.name} ↗</a>{np.album?.release_date&&<div style={{color:C.mut,fontSize:10,marginTop:2}}>📅 {np.album.release_date.slice(0,4)}</div>}{npMb&&<div style={{marginTop:6}}><div style={{color:C.acc,fontSize:11}}>🎨 {gl(npMb)}</div>{npMb.country&&<div style={{color:C.acc,fontSize:11}}>🌍 {npMb.country}</div>}</div>}{ctxName&&<div style={{marginTop:6,padding:"4px 10px",background:C.sf,borderRadius:6,display:"inline-block"}}><span style={{color:C.grn,fontSize:11,fontWeight:600}}>{pl?.context?.type==="playlist"?"📋":"💿"} {ctxName}</span></div>}{pl?.progress_ms&&np.duration_ms&&<div style={{marginTop:10}}><div style={{width:"100%",height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(pl.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.grn,borderRadius:2,transition:"width 1s linear"}} /></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(pl.progress_ms/60000)}</span><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div></div>}</div></div><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10}}><PB label="Aléatoire" icon={I.shuffle()} active={pl?.shuffle_state} onClick={()=>cmd("shuffle")} /><PB label="Précédent" icon={I.prev()} onClick={()=>cmd("prev")} /><PB label={pl?.is_playing?"Pause":"Lecture"} icon={pl?.is_playing?I.pause():I.play()} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} /><PB label="Suivant" icon={I.next()} onClick={()=>cmd("next")} /><PB label="Répéter" icon={pl?.repeat_state==="track"?I.repeatOne():I.repeat()} active={pl?.repeat_state!=="off"} onClick={()=>cmd("repeat")} /></div></div>:<div style={{textAlign:"center",padding:40}}><p style={{color:C.mut,fontSize:14}}>Ouvre Spotify sur un appareil</p></div>}</Card><div style={{display:"flex",flexDirection:"column",gap:16}}><Card><Lbl>Appareils ({devs.length})</Lbl>{devs.length>0?devs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":"🔊"}</span><div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.mut,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<div style={{background:C.grn,color:"#000",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:50}}>ACTIF</div>}</div>):<p style={{color:C.mut}}>Aucun appareil</p>}</Card>{np&&albumTks.length>0&&<Card><Lbl>Album · {np.album?.name}</Lbl><div style={{maxHeight:300,overflowY:"auto"}}>{albumTks.map((t,i)=>{const cur=t.id===np.id;return<div key={t.id} onClick={()=>play(t.uri)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:cur?C.grn:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,minWidth:0,color:cur?C.grn:C.txt,fontSize:12,fontWeight:cur?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:""}</span></div>})}</div></Card>}</div></div>}

      {/* COMPAT */}
      {tab==="compat"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card><Lbl>Ton code de profil</Lbl><p style={{color:C.mut,fontSize:12,marginBottom:12}}>Envoie ce code à un·e ami·e qui utilise la même app. Il compare vos goûts. Rien ne quitte vos navigateurs.</p><textarea readOnly value={myCode} onFocus={e=>e.target.select()} style={{width:"100%",height:90,resize:"none",padding:12,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.mut,fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box",wordBreak:"break-all"}} /><button onClick={copyCode} style={{marginTop:10,padding:"10px 20px",background:copied?C.acc:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer"}}>{copied?"Copié ✓":"Copier mon code"}</button></Card>
        <Card><Lbl>Comparer avec un·e ami·e</Lbl><textarea value={friendCode} onChange={e=>setFriendCode(e.target.value)} placeholder="Colle ici le code de ton ami·e…" style={{width:"100%",height:90,resize:"none",padding:12,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box",wordBreak:"break-all"}} /><button onClick={compare} disabled={!friendCode.trim()} style={{marginTop:10,padding:"10px 20px",background:friendCode.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:friendCode.trim()?"#000":C.mut,fontSize:12,fontWeight:700,cursor:friendCode.trim()?"pointer":"default"}}>Comparer</button>{compatErr&&<p style={{color:C.red,fontSize:12,marginTop:12}}>{compatErr}</p>}{compatRes&&<div style={{marginTop:16}}><div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:48,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{compatRes.score}%</div><div style={{color:C.mut,fontSize:12,marginTop:4}}>de compatibilité avec {compatRes.name}</div></div>{compatRes.artists.length>0&&<div style={{marginBottom:12}}><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Artistes en commun ({compatRes.artists.length})</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.artists.join(", ")}</div></div>}{compatRes.genres.length>0&&<div style={{marginBottom:12}}><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Genres en commun</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.genres.join(", ")}</div></div>}{compatRes.countries.length>0&&<div><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Pays en commun</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.countries.join(", ")}</div></div>}{compatRes.artists.length===0&&compatRes.genres.length===0&&compatRes.countries.length===0&&<p style={{color:C.mut,fontSize:12,textAlign:"center"}}>Aucun recouvrement — des goûts très différents !</p>}</div>}</Card>
      </div>}

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",bottom:np&&tab!=="player"?90:24,left:"50%",transform:"translateX(-50%)",background:toast.ok?C.grn:C.red,color:toast.ok?"#000":"#fff",padding:"12px 22px",borderRadius:50,fontSize:13,fontWeight:600,zIndex:1100,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",maxWidth:"90vw"}}>{toast.msg}</div>}

      {/* MINI PLAYER */}
      {np&&tab!=="player"&&<div style={{position:"fixed",bottom:0,left:0,right:0,background:C.card,borderTop:`2px solid ${C.grn}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:12,zIndex:100}}>
        {np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:40,height:40,borderRadius:6}} />}
        <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{np.name}</div><div style={{color:C.mut,fontSize:10}}>{(np.artists||[]).map(a=>a.name).join(", ")}{ctxName?` · ${ctxName}`:""}</div></div>
        <div style={{display:"flex",gap:6}}><PB label="Précédent" icon={I.prev(13)} onClick={()=>cmd("prev")} /><PB label={pl?.is_playing?"Pause":"Lecture"} icon={pl?.is_playing?I.pause(18):I.play(18)} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} /><PB label="Suivant" icon={I.next(13)} onClick={()=>cmd("next")} /></div>
      </div>}

      <div style={{textAlign:"center",marginTop:40,color:C.mut,fontSize:10}}>Spotify · MusicBrainz ({enr}/{tA.length}) · {allG.length} genres · {allC.length} pays · <button onClick={()=>{setTok(null);setData(null);setMb({});mbCache.current={};setSug([])}} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}