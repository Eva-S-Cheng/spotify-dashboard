import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { BarChart, Bar, LineChart, Line, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const REDIR = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read","user-read-recently-played","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-modify-public","playlist-modify-private","playlist-read-private","playlist-read-collaborative"].join(" ");
const WORLD_TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let rlUntil=0;// verrou global de rate-limit
function genV(n=128){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>c[b%c.length]).join("")}
async function genC(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
async function sp(e,t,o={},retries=2){const w=rlUntil-Date.now();if(w>0)await new Promise(r=>setTimeout(r,w));const r=await fetch(`https://api.spotify.com/v1${e}`,{headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},...o});if(r.status===204)return null;if(r.status===429){const ra=Math.min(parseInt(r.headers.get("Retry-After")||"5",10),60);rlUntil=Date.now()+(ra+1)*1000;if(retries>0){await new Promise(res=>setTimeout(res,(ra+1)*1000));return sp(e,t,o,retries-1)}const err=new Error("429");err.status=429;throw err}if(!r.ok){const err=new Error(`${r.status}`);err.status=r.status;throw err}return r.json()}

// Title Case par mot (affichage uniquement)
function tc(s){return String(s).toLowerCase().replace(/(^|[\s\-/&])([a-z])/g,(m,p1,p2)=>p1+p2.toUpperCase())}

function b64encode(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let bin="";bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}
function b64decode(str){const bin=atob(str.trim());const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}

const ISO={"AM":"Arménie","AR":"Argentine","AU":"Australie","AT":"Autriche","BD":"Bangladesh","BY":"Biélorussie","BE":"Belgique","BO":"Bolivie","BA":"Bosnie","BR":"Brésil","BG":"Bulgarie","CA":"Canada","CL":"Chili","CN":"Chine","CO":"Colombie","CR":"Costa Rica","HR":"Croatie","CU":"Cuba","CZ":"Tchéquie","DK":"Danemark","EG":"Égypte","EE":"Estonie","FI":"Finlande","FR":"France","GE":"Géorgie","DE":"Allemagne","GH":"Ghana","GR":"Grèce","GT":"Guatemala","HU":"Hongrie","IS":"Islande","IN":"Inde","ID":"Indonésie","IR":"Iran","IQ":"Irak","IE":"Irlande","IL":"Israël","IT":"Italie","JM":"Jamaïque","JP":"Japon","JO":"Jordanie","KZ":"Kazakhstan","KE":"Kenya","KR":"Corée du Sud","LV":"Lettonie","LB":"Liban","LT":"Lituanie","LU":"Luxembourg","MY":"Malaisie","MX":"Mexique","MA":"Maroc","NL":"Pays-Bas","NZ":"N.-Zélande","NG":"Nigeria","NO":"Norvège","PK":"Pakistan","PA":"Panama","PE":"Pérou","PH":"Philippines","PL":"Pologne","PT":"Portugal","RO":"Roumanie","RU":"Russie","SA":"Arabie Saoudite","SN":"Sénégal","RS":"Serbie","SG":"Singapour","SK":"Slovaquie","SI":"Slovénie","ZA":"Afr. du Sud","ES":"Espagne","SE":"Suède","CH":"Suisse","TW":"Taïwan","TH":"Thaïlande","TN":"Tunisie","TR":"Turquie","UA":"Ukraine","AE":"Émirats","GB":"Royaume-Uni","US":"États-Unis","UY":"Uruguay","VE":"Venezuela","VN":"Vietnam","XW":"Monde","XE":"Europe","PR":"Porto Rico"};
const A2_TO_NUM={AM:"051",AR:"032",AU:"036",AT:"040",BD:"050",BY:"112",BE:"056",BO:"068",BA:"070",BR:"076",BG:"100",CA:"124",CL:"152",CN:"156",CO:"170",CR:"188",HR:"191",CU:"192",CZ:"203",DK:"208",EG:"818",EE:"233",FI:"246",FR:"250",GE:"268",DE:"276",GH:"288",GR:"300",GT:"320",HU:"348",IS:"352",IN:"356",ID:"360",IR:"364",IQ:"368",IE:"372",IL:"376",IT:"380",JM:"388",JP:"392",JO:"400",KZ:"398",KE:"404",KR:"410",LV:"428",LB:"422",LT:"440",LU:"442",MY:"458",MX:"484",MA:"504",NL:"528",NZ:"554",NG:"566",NO:"578",PK:"586",PA:"591",PE:"604",PH:"608",PL:"616",PT:"620",RO:"642",RU:"643",SA:"682",SN:"686",RS:"688",SG:"702",SK:"703",SI:"705",ZA:"710",ES:"724",SE:"752",CH:"756",TW:"158",TH:"764",TN:"788",TR:"792",UA:"804",AE:"784",GB:"826",US:"840",UY:"858",VE:"862",VN:"704",PR:"630"};
const NUM_TO_A2={};Object.entries(A2_TO_NUM).forEach(([a2,num])=>{NUM_TO_A2[num]=a2});

// Filtre genres STRICT : rejette les termes génériques seuls (metal, rock…) ET les nationalités (swedish…), garde les composés
const STANDALONE=new Set(["metal","rock","pop","electronic","hip hop","hip-hop","jazz","classical","country","blues","folk","soul","punk","alternative","indie","r&b","rnb","dance","reggae","latin","electro","experimental","instrumental","acoustic","world","vocal","ambient","soundtrack"]);
const ROOTS=["metal","rock","pop","punk","core","wave","hop","rap","jazz","blues","folk","soul","funk","house","techno","trance","ambient","classical","country","reggae","ska","grunge","doom","death","thrash","groove","progressive","prog","symphonic","melodic","power","alternative","indie","emo","electronic","electro","synth","industrial","gothic","goth","noise","experimental","psychedelic","garage","shoegaze","math","hardcore","fusion","latin","gospel","disco","dubstep","trap","grime","drill","downtempo","breakbeat","jungle","darkwave","neofolk","dance","grindcore","deathcore","metalcore","stoner","sludge","speed","djent","screamo","swing","bebop","acid","lo-fi","lofi","chillwave","trip-hop","vapor","edm","dnb","afrobeat","cumbia","salsa","bossa","flamenco","fado","chanson","k-pop","j-pop","j-rock","post-rock","post-metal","post-punk","new wave","krautrock","glam","pirate","viking","pagan","drone","surf","britpop","dream pop","synthpop","electropop","coldwave","hyperpop","phonk","boom bap","opera","bluegrass","reggaeton","dancehall","soca","highlife","samba","tango"];
const ORIGINS=new Set(["swedish","finnish","norwegian","danish","icelandic","german","austrian","swiss","french","italian","spanish","portuguese","brazilian","british","english","american","canadian","australian","japanese","korean","chinese","russian","polish","czech","hungarian","romanian","greek","turkish","mexican","colombian","dutch","belgian","irish","scottish","welsh","south african","indian","thai","jamaican","european","scandinavian","nordic","african","asian","caribbean","armenian"]);
// IMPORTANT : isGenre travaille sur le texte BRUT en minuscule (avant tout passage en majuscule d'affichage)
function isGenre(t){const l=String(t).toLowerCase().trim();if(!l||ORIGINS.has(l)||STANDALONE.has(l))return false;return ROOTS.some(r=>l.includes(r))}

async function fetchMB(name){
  for(let a=0;a<2;a++){try{
    const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(name)}"&limit=1&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0 (eva-s-cheng.github.io)"}});
    if(r.status===503||r.status===429){await new Promise(r=>setTimeout(r,4000));continue}
    if(!r.ok)return null;const d=await r.json(),x=d.artists?.[0];if(!x||x.score<80)return null;
    const tags=(x.tags||[]).sort((a,b)=>(b.count||0)-(a.count||0)).map(t=>t.name);
    return{genres:tags.filter(isGenre).slice(0,5),country:x.country?ISO[x.country]||x.country:null,countryCode:x.country||null};
  }catch{if(a===0)await new Promise(r=>setTimeout(r,4000))}}return null}

async function searchMBA(tags,cc,lim=15){
  try{const arr=(Array.isArray(tags)?tags:[tags]).filter(Boolean);if(!arr.length)return[];const tq=arr.map(t=>`tag:"${t}"`).join(" AND ");const q=cc?`${tq} AND country:${cc}`:tq;const r=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=${lim}&fmt=json`,{headers:{"User-Agent":"SpotifyDash/1.0"}});if(!r.ok)return[];const d=await r.json();return(d.artists||[]).filter(a=>a.score>70).map(a=>({name:a.name,country:a.country?ISO[a.country]||a.country:null,tags:(a.tags||[]).sort((x,y)=>(y.count||0)-(x.count||0)).map(t=>t.name).filter(isGenre).slice(0,3)}))}catch{return[]}}

async function enrichSug(groups,tok,gap=450){const cache={};let fails=0,stop=false;const out=[];for(const g of groups){const ea=[];for(const a of g.artists){const key=(a.name||"").toLowerCase();if(cache[key]!==undefined){ea.push({...a,...cache[key]});continue}if(stop){const v={sid:null,img:null};cache[key]=v;ea.push({...a,...v});continue}try{const r=await sp(`/search?q=${encodeURIComponent(a.name)}&type=artist&limit=1`,tok,{},0);const s=r?.artists?.items?.[0];const v={sid:s?.id,img:s?.images?.[0]?.url};cache[key]=v;ea.push({...a,...v});fails=0;await new Promise(r=>setTimeout(r,gap))}catch(e){const v={sid:null,img:null};cache[key]=v;ea.push({...a,...v});if(e&&e.status===429){fails++;if(fails>=4)stop=true}}}out.push({...g,artists:ea})}return out}

// ─── THEME ───
const C={bg:"#0A0B0D",sf:"#1B1F21",card:"#15181A",brd:"rgba(255,255,255,0.07)",brd2:"rgba(255,255,255,0.15)",grn:"#1DB954",grnB:"#1ED760",txt:"#F3F5F4",mut:"#8C928F",acc:"#B8FF66",dim:"#3A3F3D",red:"#FF6B6B"};
const CL=["#1ED760","#1DB954","#2DD4BF","#B8FF66","#34D399","#22D3EE","#A78BFA","#F472B6","#FBBF24","#FB7185","#60A5FA","#4ADE80","#F59E0B","#C084FC","#5EEAD4","#86EFAC"];
const GLOBAL_CSS=`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');
*{box-sizing:border-box}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:rgba(30,215,96,0.5);background-clip:padding-box}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes ucfade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes ucfadein{from{opacity:0}to{opacity:1}}
@keyframes ucpulse{0%,100%{opacity:.55}50%{opacity:1}}
.uc-fade{animation:ucfade .5s cubic-bezier(.2,.7,.2,1) both}
.uc-fadein{animation:ucfadein .45s ease both}
.uc-card{transition:transform .2s cubic-bezier(.2,.7,.2,1),box-shadow .2s ease,border-color .2s ease}
.uc-card.click{cursor:pointer}
.uc-card.click:hover{transform:translateY(-3px);border-color:rgba(30,215,96,0.42);box-shadow:0 18px 46px rgba(0,0,0,0.55),0 0 0 1px rgba(30,215,96,0.22),0 0 34px -8px rgba(30,215,96,0.45)}
button{transition:filter .15s ease,transform .1s ease,box-shadow .2s ease,background .2s ease,border-color .2s ease,color .2s ease}
button:not(:disabled):hover{filter:brightness(1.12)}
button:not(:disabled):active{transform:scale(.96)}
a{transition:color .15s ease,opacity .15s ease,transform .12s ease}
input,select,textarea{transition:border-color .15s ease,box-shadow .15s ease}
input:focus,select:focus,textarea:focus{border-color:rgba(30,215,96,0.55)!important;box-shadow:0 0 0 3px rgba(30,215,96,0.12)}
::selection{background:rgba(30,215,96,0.32)}
@media (max-width:640px){
.app-root{padding:14px 12px 116px!important}
.uc-card{padding:16px!important;border-radius:14px!important}
.uc-h1{font-size:19px!important}
.uc-hide-sm{display:none!important}
.uc-controls{justify-content:flex-start!important;width:100%}
}
@media (max-width:430px){.uc-card{padding:13px!important}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important}}`;
function Styles(){return<style>{GLOBAL_CSS}</style>}
const BG=`radial-gradient(1100px 540px at 50% -170px,rgba(30,215,96,0.11),transparent 62%),radial-gradient(800px 500px at 100% 10%,rgba(45,212,191,0.05),transparent 60%),${C.bg}`;
const FD="'Space Grotesk','Inter',sans-serif";
const PERIOD_LONG={short_term:"sur les 4 dernières semaines",medium_term:"sur les 6 derniers mois",long_term:"depuis toujours",recent:"sur tes 50 dernières écoutes"};
function Card({children,style={},onClick,className=""}){return<div onClick={onClick} className={`uc-card${onClick?" click":""} ${className}`} style={{background:"linear-gradient(165deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012))",backgroundColor:C.card,border:`1px solid ${C.brd}`,borderRadius:18,padding:24,cursor:onClick?"pointer":"default",boxShadow:"0 8px 28px rgba(0,0,0,0.38)",...style}}>{children}</div>}
function Lbl({children}){return<p style={{color:C.mut,fontSize:10.5,fontFamily:"monospace",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>{children}</p>}
function SC({label,value,sub,icon,onClick}){return<Card onClick={onClick} style={{padding:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><Lbl>{label}</Lbl>{icon&&<span style={{fontSize:15,filter:"drop-shadow(0 0 7px rgba(30,215,96,0.45))"}}>{icon}</span>}</div><div style={{fontSize:25,fontWeight:600,color:C.txt,fontFamily:FD,lineHeight:1,letterSpacing:"-0.015em"}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.mut,marginTop:7}}>{sub}</div>}</Card>}
function fmt(m){if(m<1)return"<1min";if(m<60)return`${Math.round(m)}min`;const h=Math.floor(m/60);return`${h}h${Math.round(m%60)>0?String(Math.round(m%60)).padStart(2,"0"):""}`}
// Genres d'un artiste (affichage Title Case, "Unknown" si vide)
function gl(m,k){const arr=(m&&m.genres&&m.genres.length)?m.genres:["unknown"];return(k?arr.slice(0,k):arr).map(tc).join(", ")}
function mapColor(count,max){if(!count)return C.sf;const t=Math.min(1,count/Math.max(max,1));const lerp=(a,b)=>Math.round(a+(b-a)*t);return `rgb(${lerp(26,29)},${lerp(46,185)},${lerp(31,84)})`}
function lerpHex(a,b,t){const ah=a.match(/\w\w/g).map(h=>parseInt(h,16)),bh=b.match(/\w\w/g).map(h=>parseInt(h,16));return `rgb(${ah.map((v,i)=>Math.round(v+(bh[i]-v)*t)).join(",")})`}


// helpers canvas (wrapped)
function wrapText(x,text,px,py,maxW,lh){const words=String(text).split(" ");let line="",yy=py;for(const w of words){const t=line?line+" "+w:w;if(x.measureText(t).width>maxW&&line){x.fillText(line,px,yy);line=w;yy+=lh}else line=t}if(line){x.fillText(line,px,yy);yy+=lh}return yy}
function loadImg(url){return new Promise(res=>{if(!url){res(null);return}const im=new Image();im.crossOrigin="anonymous";im.onload=()=>res(im);im.onerror=()=>res(null);im.src=url})}
function circ(x,im,cx,cy,r){x.save();x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.closePath();x.clip();x.drawImage(im,cx-r,cy-r,2*r,2*r);x.restore()}
function rimg(x,im,px,py,s,r){x.save();x.beginPath();x.moveTo(px+r,py);x.arcTo(px+s,py,px+s,py+s,r);x.arcTo(px+s,py+s,px,py+s,r);x.arcTo(px,py+s,px,py,r);x.arcTo(px,py,px+s,py,r);x.closePath();x.clip();x.drawImage(im,px,py,s,s);x.restore()}

const I={
  shuffle:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  prev:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5l-10 7 10 7z"/></svg>,
  next:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l10 7L4 19z"/></svg>,
  play:(s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>,
  pause:(s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>,
  repeat:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  repeatOne:(s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="9.5" y="15.8" fontSize="9" fill="currentColor" stroke="none" fontWeight="700" fontFamily="monospace">1</text></svg>
};
function PB({icon,active,onClick,big,label}){const sz=big?52:38;return<button title={label} onClick={onClick} style={{width:sz,height:sz,borderRadius:"50%",border:big?"none":`1.5px solid ${active?C.grn:C.brd}`,background:big?C.grn:active?"rgba(29,185,84,0.18)":"transparent",color:big?"#000":active?C.grn:C.txt,cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",boxShadow:active&&!big?`0 0 0 1px ${C.grn},0 0 12px rgba(29,185,84,0.4)`:"none"}}>{icon}</button>}

function DrillDown({title,items,onClose,onBack,canBack}){
  return(<div className="uc-fade" style={{position:"fixed",top:0,bottom:0,right:0,width:440,maxWidth:"94vw",background:"linear-gradient(180deg,rgba(24,28,30,0.97),rgba(13,15,17,0.98))",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",borderLeft:`1px solid rgba(30,215,96,0.35)`,boxShadow:"-22px 0 60px rgba(0,0,0,0.55)",zIndex:1000,overflowY:"auto",padding:24,boxSizing:"border-box"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
        {canBack&&<button onClick={onBack} title="Retour" style={{background:C.brd,border:"none",color:C.txt,width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>}
        <h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.grn,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h2>
      </div>
      <button onClick={onClose} title="Fermer" style={{background:C.brd,border:"none",color:C.txt,width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
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
  const[pl,setPl]=useState(null);const[devs,setDevs]=useState([]);const[drillStack,setDrillStack]=useState([]);
  const[pls,setPls]=useState([]);const[plCounts,setPlCounts]=useState({});
  const[sug,setSug]=useState([]);const[sugL,setSugL]=useState(false);
  const[cG,setCG]=useState("");const[cC,setCC]=useState("");const[cR,setCR]=useState([]);const[cL2,setCL2]=useState(false);
  const[ctxName,setCtxName]=useState("");
  const[plErr,setPlErr]=useState(null);const[toast,setToast]=useState(null);
  const[albumTks,setAlbumTks]=useState([]);
  const[hov,setHov]=useState(null);
  const[friendCode,setFriendCode]=useState("");const[compatRes,setCompatRes]=useState(null);const[compatErr,setCompatErr]=useState(null);const[copied,setCopied]=useState(false);
  const[simRes,setSimRes]=useState([]);const[simL,setSimL]=useState(false);
  const[evoData,setEvoData]=useState(null);const[evoL,setEvoL]=useState(false);const[evoView,setEvoView]=useState("artists");
  const[shareImg,setShareImg]=useState(null);const shareBlobRef=useRef(null);
  const[selGenre,setSelGenre]=useState(null);const[selCountry,setSelCountry]=useState(null);
  const pi=useRef(null);const lastCtx=useRef(null);const tabRef=useRef("overview");
  const runId=useRef(0);const simFn=useRef(null),evoFn=useRef(null),simForTr=useRef(null),evoRun=useRef(false),discForTr=useRef(null);
  useEffect(()=>{tabRef.current=tab},[tab]);
  // Auto-génération uniquement pour Évolution (léger). Similaires & Découvertes = bouton manuel.
  useEffect(()=>{if(tab==="evolution"&&!evoL&&!evoRun.current&&data&&tok){evoRun.current=true;evoFn.current&&evoFn.current()}},[tab,evoL,data,tok]);

  const pushDrill=(title,content)=>setDrillStack(s=>[...s,{title,content}]);
  const popDrill=()=>setDrillStack(s=>s.slice(0,-1));
  const closeDrill=()=>setDrillStack([]);
  const cur=drillStack[drillStack.length-1];

  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t)},[toast]);

  useEffect(()=>{const code=sessionStorage.getItem("sp_code");if(!code){setLd(false);return}const v=sessionStorage.getItem("sp_verifier"),s=sessionStorage.getItem("sp_client_id");if(!v||!s){setLd(false);return}sessionStorage.removeItem("sp_code");(async()=>{try{const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:s,grant_type:"authorization_code",code,redirect_uri:REDIR,code_verifier:v})});const j=await r.json();if(j.access_token){setTok(j.access_token);localStorage.setItem("sp_client_id",s)}else{setErr(j.error_description||j.error);setLd(false)}}catch(e){setErr(e.message);setLd(false)}})()},[]);

  // Chargement principal (dépend de la temporalité)
  useEffect(()=>{if(!tok)return;const myRun=++runId.current;setLd(true);setErr(null);setLm("Récupération…");(async()=>{try{
    const isRecent=tr==="recent";
    const[a1,a2,t1,t2,rec,prof]=await Promise.all([
      isRecent?Promise.resolve({items:[]}):sp(`/me/top/artists?limit=50&offset=0&time_range=${tr}`,tok),
      isRecent?Promise.resolve({items:[]}):sp(`/me/top/artists?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      isRecent?Promise.resolve({items:[]}):sp(`/me/top/tracks?limit=50&offset=0&time_range=${tr}`,tok),
      isRecent?Promise.resolve({items:[]}):sp(`/me/top/tracks?limit=49&offset=50&time_range=${tr}`,tok).catch(()=>({items:[]})),
      sp("/me/player/recently-played?limit=50",tok),sp("/me",tok)]);
    const ri=rec.items||[];
    const am={};ri.forEach(i=>{const t=i.track;if(!t)return;const d=(t.duration_ms||0)/60000;(t.artists||[]).forEach(a=>{if(!am[a.id])am[a.id]={name:a.name,id:a.id,min:0,plays:0};am[a.id].min+=d;am[a.id].plays++})});
    const abt=Object.values(am).sort((a,b)=>b.min-a.min);
    const tm={};ri.forEach(i=>{const t=i.track;if(!t)return;if(!tm[t.id])tm[t.id]={...t,plays:0};tm[t.id].plays++});
    const tbp=Object.values(tm).sort((a,b)=>b.plays-a.plays);
    const hr=Array(24).fill(0).map((_,h)=>({h:`${h}h`,nb:0,min:0}));ri.forEach(i=>{const h=new Date(i.played_at).getHours();hr[h].nb++;hr[h].min+=(i.track?.duration_ms||0)/60000});
    let tA,tT;
    if(isRecent){
      tT=tbp;// titres = écoutes récentes triées par nb de lectures (objets track complets)
      const ids=Object.values(am).sort((a,b)=>b.plays-a.plays).slice(0,50).map(a=>a.id).filter(Boolean);
      const playsById={};Object.values(am).forEach(a=>{playsById[a.id]=a.plays});
      let hydrated=[];
      try{if(ids.length){const ad=await sp(`/artists?ids=${ids.join(",")}`,tok);hydrated=(ad?.artists||[]).filter(Boolean)}}catch{}
      const byId={};hydrated.forEach(a=>{byId[a.id]=a});
      tA=ids.map(id=>({...(byId[id]||{id,name:am[id]?.name||"?",images:[]}),plays:playsById[id]||0}));
    }else{
      tA=[...(a1.items||[]),...(a2.items||[])];tT=[...(t1.items||[]),...(t2.items||[])];
    }
    const avgDur=tT.length>0?tT.reduce((s,t)=>s+(t.duration_ms||0),0)/tT.length/60000:0;
    if(runId.current!==myRun)return;
    setData({tA,tT,ri,prof,abt,tbp,hr,avgDur,isRecent});setLd(false);
    const cached={};tA.forEach(a=>{if(mbCache.current[a.id])cached[a.id]=mbCache.current[a.id]});setMb(cached);
    const toFetch=tA.filter(a=>!mbCache.current[a.id]);setMbT(tA.length);setMbP(tA.length-toFetch.length);
    if(toFetch.length>0){setMbL(true);for(const a of toFetch){if(runId.current!==myRun)return;const r=await fetchMB(a.name);if(runId.current!==myRun)return;const v=r||{genres:[],country:null,countryCode:null};mbCache.current[a.id]=v;setMb(prev=>({...prev,[a.id]:v}));setMbP(p=>p+1);await new Promise(r=>setTimeout(r,1500))}setMbL(false)}
  }catch(e){if(runId.current===myRun){setErr(e.message);setLd(false)}}})()},[tok,tr]);

  // Playlists : effet ISOLÉ (résiste si le chargement top échoue, retries via sp)
  useEffect(()=>{if(!tok)return;let live=true;(async()=>{try{const[p1,p2]=await Promise.all([sp("/me/playlists?limit=50&offset=0",tok),sp("/me/playlists?limit=50&offset=50",tok).catch(()=>({items:[]}))]);if(live){setPls([...(p1.items||[]),...(p2.items||[])]);setPlCounts({})}}catch{}})();return()=>{live=false}},[tok]);

  // Nombre de titres manquants — seulement sur l'onglet Playlists, lentement
  useEffect(()=>{if(tab!=="playlists"||!tok||!pls.length)return;const missing=pls.filter(p=>typeof p.tracks?.total!=="number"&&plCounts[p.id]===undefined).slice(0,40);if(!missing.length)return;let live=true;(async()=>{for(const p of missing){if(!live)return;try{const r=await sp(`/playlists/${p.id}?fields=tracks.total`,tok);if(live&&r?.tracks&&typeof r.tracks.total==="number")setPlCounts(c=>({...c,[p.id]:r.tracks.total}))}catch{}await new Promise(r=>setTimeout(r,500))}})();return()=>{live=false}},[tab,pls,tok]);

  // Découvertes — génération manuelle (bouton)
  const genDiscover=async()=>{
    if(!data||!tok||mbL||Object.keys(mb).length===0||sugL)return;
    const{tA,tT,ri}=data;const known=new Set();tA.forEach(a=>known.add(a.name.toLowerCase()));tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));
    const combos={};tA.forEach(a=>{const m=mb[a.id];if(!m||!m.countryCode||!m.genres?.length)return;m.genres.forEach(g=>{const k=`${g}|||${m.countryCode}`;if(!combos[k])combos[k]={genre:g,code:m.countryCode,country:m.country,count:0};combos[k].count++})});
    const topC=Object.values(combos).sort((a,b)=>b.count-a.count).slice(0,5);
    const gO={};tA.forEach(a=>{const m=mb[a.id];if(!m||!m.genres?.length)return;m.genres.forEach(g=>{gO[g]=(gO[g]||0)+1})});
    const topG=Object.entries(gO).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>({genre:g,code:null,country:null}));
    if(topC.length===0&&topG.length===0)return;
    setSugL(true);setSug([]);
    const results=[];for(const c of[...topC,...topG].slice(0,6)){const artists=await searchMBA(c.genre,c.code,20);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));if(f.length>0)results.push({genre:c.genre,country:c.country,artists:f.slice(0,5)});await new Promise(r=>setTimeout(r,1800))}
    const e=await enrichSug(results,tok);setSug(e);setSugL(false);
  };

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

  const cmd=async a=>{try{if(a==="play")await sp("/me/player/play",tok,{method:"PUT"});else if(a==="pause")await sp("/me/player/pause",tok,{method:"PUT"});else if(a==="next")await sp("/me/player/next",tok,{method:"POST"});else if(a==="prev")await sp("/me/player/previous",tok,{method:"POST"});else if(a==="shuffle")await sp(`/me/player/shuffle?state=${!pl?.shuffle_state}`,tok,{method:"PUT"});else if(a==="repeat"){const m=["off","context","track"];await sp(`/me/player/repeat?state=${m[(m.indexOf(pl?.repeat_state||"off")+1)%3]}`,tok,{method:"PUT"})}setTimeout(()=>sp("/me/player",tok,{},0).then(setPl).catch(()=>{}),300)}catch{}};
  const withDevice=async body=>{try{await sp("/me/player/play",tok,{method:"PUT",body:JSON.stringify(body)})}catch(e){let done=false;try{const d=await sp("/me/player/devices",tok);const dev=(d?.devices||[]).find(x=>x.is_active&&!x.is_restricted)||(d?.devices||[]).find(x=>!x.is_restricted)||(d?.devices||[])[0];if(dev){await sp(`/me/player/play?device_id=${dev.id}`,tok,{method:"PUT",body:JSON.stringify(body)});done=true}}catch{}if(!done)setToast({ok:false,msg:"Aucun appareil Spotify actif. Ouvre Spotify sur un téléphone ou un ordi, lance n'importe quel titre, puis réessaie."})}setTimeout(()=>sp("/me/player",tok,{},0).then(setPl).catch(()=>{}),400)};
  const play=u=>withDevice({uris:[u]});
  const playCtx=u=>withDevice({context_uri:u});
  const playArt=id=>withDevice({context_uri:`spotify:artist:${id}`});
  const playArtTop=async sid=>{if(!sid)return;try{const r=await sp(`/artists/${sid}/top-tracks`,tok);const u=r?.tracks?.[0]?.uri;if(u){await play(u);return}}catch{}try{await playArt(sid)}catch{}};
  const refreshPls=async()=>{try{setToast({ok:true,msg:"Rechargement des playlists…"});const[p1,p2]=await Promise.all([sp("/me/playlists?limit=50&offset=0",tok),sp("/me/playlists?limit=50&offset=50",tok).catch(()=>({items:[]}))]);setPls([...(p1.items||[]),...(p2.items||[])]);setToast({ok:true,msg:"Playlists rechargées ✓"})}catch{setToast({ok:false,msg:"Échec du rechargement des playlists."})}};
  const customSearch=async()=>{if(!cG)return;setCL2(true);setCR([]);const known=new Set();data.tA.forEach(a=>known.add(a.name.toLowerCase()));data.tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));data.ri.forEach(i=>(i.track?.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));const cc=cC?Object.entries(ISO).find(([,v])=>v===cC)?.[0]||null:null;const artists=await searchMBA(cG,cc,25);const f=artists.filter(a=>!known.has(a.name.toLowerCase()));const e=await enrichSug([{genre:cG,country:cC||null,artists:f.slice(0,12)}],tok);setCR(e);setCL2(false)};

  const login=useCallback(async()=>{if(!cid.trim())return;const v=genV(),ch=await genC(v);sessionStorage.setItem("sp_verifier",v);sessionStorage.setItem("sp_client_id",cid.trim());const u=new URL("https://accounts.spotify.com/authorize");u.searchParams.set("client_id",cid.trim());u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",REDIR);u.searchParams.set("scope",SCOPES);u.searchParams.set("code_challenge_method","S256");u.searchParams.set("code_challenge",ch);window.location.href=u.toString()},[cid]);
  const forceReauth=useCallback(()=>{sessionStorage.removeItem("sp_code");setMb({});mbCache.current={};setData(null);setTok(null);login()},[login]);

  const spin=<Styles/>;
  if(ld)return<div style={{background:BG,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut,fontSize:14}}>{lm}</p></div>{spin}</div>;
  if(err&&!tok)return<div style={{background:BG,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{textAlign:"center",maxWidth:400}}>{spin}<p style={{color:C.red,fontSize:14,marginBottom:20}}>{err}</p><button onClick={()=>setErr(null)} style={{padding:"12px 24px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}}>Réessayer</button></div></div>;
  if(!tok)return<div style={{background:BG,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:24}}><div style={{maxWidth:480,width:"100%"}} className="uc-fade">{spin}<div style={{textAlign:"center",marginBottom:40}}><div style={{fontSize:52,marginBottom:14,filter:"drop-shadow(0 0 24px rgba(30,215,96,0.5))"}}>🎧</div><h1 style={{fontSize:34,fontWeight:700,margin:0,fontFamily:FD,letterSpacing:"-0.03em",lineHeight:1.05,background:`linear-gradient(135deg,${C.grnB} 10%,${C.acc} 90%)`,WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>Your Spotify,<br/>Uncovered.</h1><p style={{color:C.mut,marginTop:12,fontSize:13,letterSpacing:"0.04em"}}>Ton analyse d'écoute, sans filtre.</p></div><Card><div style={{display:"flex",marginBottom:24,borderBottom:`1px solid ${C.brd}`}}>{[["input","Connexion"],["guide","Guide"]].map(([k,l])=><button key={k} onClick={()=>setSu(k)} style={{flex:1,padding:"10px",background:"none",border:"none",color:su===k?C.grn:C.mut,borderBottom:`2px solid ${su===k?C.grn:"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:500}}>{l}</button>)}</div>{su==="input"?<div><label style={{color:C.mut,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace"}}>Client ID</label><input type="text" value={cid} onChange={e=>setCid(e.target.value)} placeholder="Colle ton Client ID" onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",marginTop:8,padding:"12px 16px",background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}} /><p style={{color:C.mut,fontSize:11,marginTop:8}}>Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><button onClick={login} disabled={!cid.trim()} style={{width:"100%",marginTop:20,padding:"14px",background:cid.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:cid.trim()?"#000":C.mut,fontSize:15,fontWeight:700,cursor:cid.trim()?"pointer":"default"}}>Connecter →</button></div>:<div style={{fontSize:13,color:C.mut,lineHeight:1.8}}><p><span style={{color:C.grn,fontWeight:700}}>1.</span> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color:C.acc}}>developer.spotify.com/dashboard</a> → Create app</p><p><span style={{color:C.grn,fontWeight:700}}>2.</span> Redirect URI: <code style={{color:C.acc}}>{REDIR}</code></p><p><span style={{color:C.grn,fontWeight:700}}>3.</span> Web API → Copie Client ID → Connecte</p></div>}</Card></div></div>;
  if(!data)return<div style={{background:BG,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16,animation:"spin 1.5s linear infinite"}}>🎵</div><p style={{color:C.mut}}>{lm}</p></div>{spin}</div>;

  const{tA,tT,ri,prof,abt,tbp,hr,avgDur,isRecent}=data;
  // Agrégation genres/pays — "unknown" N'EST PAS compté dans les tops
  const gc={},cc={},abg={},abc={},ccByCode={},abcByCode={};
  tA.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(g=>{gc[g]=(gc[g]||0)+1;if(!abg[g])abg[g]=[];abg[g].push(a)});if(m.country){cc[m.country]=(cc[m.country]||0)+1;if(!abc[m.country])abc[m.country]=[];abc[m.country].push(a)}if(m.countryCode){ccByCode[m.countryCode]=(ccByCode[m.countryCode]||0)+1;if(!abcByCode[m.countryCode])abcByCode[m.countryCode]=[];abcByCode[m.countryCode].push(a)}});
  const allG=Object.entries(gc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const allC=Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c}));
  const maxC=allC.length?Math.max(...allC.map(c=>c.count)):1;
  // Agrégation filtrée (onglet Genres & Pays, filtrage croisé)
  const aggGenres=arts=>{const g={},by={};arts.forEach(a=>{const m=mb[a.id];if(!m)return;(m.genres||[]).forEach(x=>{g[x]=(g[x]||0)+1;(by[x]=by[x]||[]).push(a)})});return{list:Object.entries(g).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({name:n,count:c})),by}};
  const aggCountries=arts=>{const c={},by={},bc={},bbc={};arts.forEach(a=>{const m=mb[a.id];if(!m)return;if(m.country){c[m.country]=(c[m.country]||0)+1;(by[m.country]=by[m.country]||[]).push(a)}if(m.countryCode){bc[m.countryCode]=(bc[m.countryCode]||0)+1;(bbc[m.countryCode]=bbc[m.countryCode]||[]).push(a)}});return{list:Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([n,k])=>({name:n,count:k})),by,byCode:bc,byCodeArtists:bbc}};
  const gAgg=aggGenres(selCountry?tA.filter(a=>mb[a.id]?.country===selCountry):tA);
  const cAgg=aggCountries(selGenre?tA.filter(a=>(mb[a.id]?.genres||[]).includes(selGenre)):tA);
  const geoMaxC=cAgg.list.length?Math.max(...cAgg.list.map(c=>c.count)):1;
  const geoArtists=tA.filter(a=>{const m=mb[a.id];if(!m)return false;if(selGenre&&!(m.genres||[]).includes(selGenre))return false;if(selCountry&&m.country!==selCountry)return false;return !!(m.country||(m.genres&&m.genres.length))});
  const geoTitle=`Artistes${selGenre?" · "+tc(selGenre):""}${selCountry?" · "+selCountry:""}`;
  const gph=hr.map((_,idx)=>{const ht=ri.filter(i=>new Date(i.played_at).getHours()===idx);const hgc={};ht.forEach(i=>(i.track?.artists||[]).forEach(a=>{const m=mb[a.id];if(m&&m.genres?.length)m.genres.forEach(g=>{hgc[g]=(hgc[g]||0)+1})}));const top=Object.entries(hgc).sort((a,b)=>b[1]-a[1])[0];return{h:`${idx}h`,genre:top?top[0]:"—",nb:hr[idx].nb}}).filter(h=>h.nb>0);
  const hGenres=[...new Set(gph.map(h=>h.genre).filter(g=>g!=="—"))];
  const enr=Object.keys(mb).length;const TL={short_term:"4 sem.",medium_term:"6 mois",long_term:"Tout",recent:"50 écoutes"};
  const np=pl?.item;const npMb=np?.artists?.[0]?.id?mb[np.artists[0].id]:null;
  const anaTabs=[["overview","📊 Overview"],["artists","🎤 Artistes"],["tracks","🎵 Titres"],["geo","🌍 Genres & Pays"],["similar","✨ Similaires"],["discover","🔮 Découvertes"],["habits","🕐 Récent",true]];
  const pageTabs=[["evolution","📈 Évolution"],["playlists","📋 Playlists"],["player","🎮 Lecteur"],["compat","🤝 Compat"]];
  const isPage=pageTabs.some(([k])=>k===tab);
  const nowUri=pl?.context?.uri;
  const changeTr=k=>{setTr(k);setSimRes([]);simForTr.current=null;setSug([]);discForTr.current=null;if(isPage||(tab==="habits"&&k!=="recent"))setTab("overview")};

  const popVals=tA.map(a=>a.popularity).filter(p=>typeof p==="number");
  const obscurity=popVals.length?Math.round(100-popVals.reduce((s,p)=>s+p,0)/popVals.length):null;

  const dl=(name,content,type)=>{const b=new Blob([content],{type});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)};
  const exportJSON=()=>dl(`spotify-${tr}.json`,JSON.stringify({profil:prof.display_name,periode:TL[tr],genres:allG.map(g=>({...g,name:tc(g.name)})),pays:allC,artistes:tA.map(a=>({nom:a.name,popularite:a.popularity,genres:(mb[a.id]?.genres||[]).map(tc),pays:mb[a.id]?.country||null}))},null,2),"application/json");
  const exportCSV=()=>{const rows=[["#","Artiste","Popularité","Genres","Pays"]];tA.forEach((a,i)=>{const m=mb[a.id];rows.push([i+1,a.name,a.popularity??"",(m?.genres||[]).map(tc).join(" / ")||"Unknown",m?.country||""])});dl(`spotify-artistes-${tr}.csv`,"\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"),"text/csv")};

  // ─── PARTAGE : image enrichie, télécharge directement ───
  const generateShare=async()=>{
   try{
    setToast({ok:true,msg:"Génération de l'image…"});
    const W=1080;
    const[pImg,aImgs,tImgs]=await Promise.all([
      loadImg(prof.images?.[0]?.url),
      Promise.all(tA.slice(0,5).map(a=>loadImg(a.images?.[a.images.length>1?1:0]?.url))),
      Promise.all(tT.slice(0,5).map(t=>loadImg(t.album?.images?.[t.album.images.length>1?1:0]?.url)))
    ]);
    const rr=(x,px,py,w,h,r)=>{x.beginPath();x.moveTo(px+r,py);x.arcTo(px+w,py,px+w,py+h,r);x.arcTo(px+w,py+h,px,py+h,r);x.arcTo(px,py+h,px,py,r);x.arcTo(px,py,px+w,py,r);x.closePath()};
    const trunc=(x,s,maxW)=>{let v=s;if(x.measureText(v).width<=maxW)return v;while(v.length>2&&x.measureText(v+"…").width>maxW)v=v.slice(0,-1);return v+"…"};
    const draw=x=>{
      const H=x.canvas.height;
      x.textAlign="left";x.fillStyle="#0D0D0D";x.fillRect(0,0,W,H);x.fillStyle="#1DB954";x.fillRect(0,0,W,14);
      let hy=118;
      if(pImg){circ(x,pImg,150,hy+8,58);x.strokeStyle="#1DB954";x.lineWidth=5;x.beginPath();x.arc(150,hy+8,58,0,Math.PI*2);x.stroke()}
      const hx=pImg?240:70;
      x.fillStyle="#1DB954";x.font="bold 54px Inter,Arial,sans-serif";x.fillText("Your Spotify",hx,hy);
      x.fillStyle="#fff";x.fillText("Uncovered",hx,hy+60);
      x.fillStyle="#888";x.font="24px monospace";x.fillText(prof.display_name||"",hx,hy+102);
      hy+=168;
      // Période — gros pill bien visible
      x.font="bold 38px Inter,Arial,sans-serif";const pt=PERIOD_LONG[tr].toUpperCase();const pw=Math.min(W-140,x.measureText(pt).width+56);
      x.fillStyle="#1DB954";rr(x,70,hy,pw,64,32);x.fill();
      x.fillStyle="#0D0D0D";x.fillText(trunc(x,pt,pw-44),98,hy+43);
      hy+=104;
      // Encarts Top Artiste / Genre / Pays
      const a1=tA[0]?tA[0].name:"—",g1=allG[0]?tc(allG[0].name):"—",c1=allC[0]?allC[0].name:"—";
      const gap=18,bw=(W-140-2*gap)/3,bh=118;
      [["TOP ARTISTE",a1],["TOP GENRE",g1],["TOP PAYS",c1]].forEach(([lab,val],i)=>{const bx=70+i*(bw+gap);x.fillStyle="#1C1C1C";rr(x,bx,hy,bw,bh,16);x.fill();x.fillStyle="#B3FF5C";x.font="bold 17px monospace";x.fillText(lab,bx+18,hy+34);x.fillStyle="#fff";x.font="bold 25px Inter,Arial,sans-serif";x.fillText(trunc(x,val,bw-36),bx+18,hy+76)});
      hy+=bh+48;
      // Top 5 artistes (premier rang collé au titre)
      x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("TOP 5 ARTISTES",70,hy);hy+=22;
      tA.slice(0,5).forEach((a,i)=>{const iy=hy+34,im=aImgs[i];if(im)circ(x,im,98,iy,32);else{x.fillStyle=CL[i%CL.length];x.beginPath();x.arc(98,iy,32,0,Math.PI*2);x.fill()}x.fillStyle="#1DB954";x.font="bold 26px monospace";x.fillText(`${i+1}`,150,iy-2);x.fillStyle="#fff";x.font="30px Inter,Arial,sans-serif";x.fillText(trunc(x,a.name,W-280),198,iy-4);const mm=mb[a.id];const sub=[mm&&mm.genres&&mm.genres[0]?tc(mm.genres[0]):null,mm&&mm.country?mm.country:null].filter(Boolean).join("  ·  ");if(sub){x.fillStyle="#888";x.font="19px Inter,Arial,sans-serif";x.fillText(trunc(x,sub,W-280),198,iy+24)}hy+=78});
      hy+=40;
      // Top 5 titres
      x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("TOP 5 TITRES",70,hy);hy+=20;
      tT.slice(0,5).forEach((t,i)=>{const iy=hy+34,im=tImgs[i];if(im)rimg(x,im,68,iy-32,64,10);else{x.fillStyle=CL[i%CL.length];x.fillRect(68,iy-32,64,64)}x.fillStyle="#1DB954";x.font="bold 24px monospace";x.fillText(`${i+1}`,150,iy);x.fillStyle="#fff";x.font="28px Inter,Arial,sans-serif";x.fillText(trunc(x,t.name,W-260),190,iy-6);x.fillStyle="#888";x.font="20px Inter,Arial,sans-serif";x.fillText(trunc(x,(t.artists||[]).map(a=>a.name).join(", "),W-260),190,iy+22);hy+=80});
      hy+=46;
      // Genres
      x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("GENRES",70,hy);hy+=44;
      x.fillStyle="#fff";x.font="27px Inter,Arial,sans-serif";hy=wrapText(x,allG.slice(0,12).map(g=>tc(g.name)).join("   ·   ")||"—",70,hy,W-140,40)+22;
      // Pays
      x.fillStyle="#B3FF5C";x.font="bold 26px monospace";x.fillText("PAYS",70,hy);hy+=44;
      x.fillStyle="#fff";x.font="27px Inter,Arial,sans-serif";hy=wrapText(x,allC.slice(0,12).map(c=>c.name).join("   ·   ")||"—",70,hy,W-140,40)+18;
      x.fillStyle="#888";x.font="22px monospace";x.fillText(`${tA.length} artistes · ${allG.length} genres · ${allC.length} pays`,70,hy+14);hy+=24;
      return hy;
    };
    const m=document.createElement("canvas");m.width=W;m.height=3200;const finalY=draw(m.getContext("2d"));
    const H=Math.max(1200,Math.ceil(finalY+90));
    const cv=document.createElement("canvas");cv.width=W;cv.height=H;const x=cv.getContext("2d");draw(x);
    x.fillStyle="#555";x.font="20px monospace";x.textAlign="left";x.fillText("eva-s-cheng.github.io/spotify-dashboard",70,H-40);
    cv.toBlob(b=>{if(!b){setToast({ok:false,msg:"Échec de la génération."});return}shareBlobRef.current=b;if(shareImg)URL.revokeObjectURL(shareImg);setShareImg(URL.createObjectURL(b))},"image/png");
   }catch(e){setToast({ok:false,msg:"Erreur de génération de l'image : "+(e?.message||e)});}
  };
  const closeShare=()=>{if(shareImg)URL.revokeObjectURL(shareImg);setShareImg(null)};
  const downloadShare=()=>{const b=shareBlobRef.current;if(!b)return;const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`spotify-wrapped-${tr}.png`;a.click();URL.revokeObjectURL(u);setToast({ok:true,msg:"Image téléchargée ✓"})};
  const shareNative=async()=>{const b=shareBlobRef.current;if(!b)return;try{const file=new File([b],`spotify-wrapped-${tr}.png`,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:"Your Spotify, Uncovered",text:"Mes stats Spotify 🎧"})}else{setToast({ok:false,msg:"Partage direct indisponible sur ce navigateur — télécharge l'image puis partage-la."})}}catch(e){if(e&&e.name!=="AbortError")setToast({ok:false,msg:"Partage impossible."})}};

  // ─── Compatibilité ───
  const myCompat={n:prof.display_name,a:tA.slice(0,50).map(a=>a.name),g:allG.slice(0,15).map(g=>g.name),c:allC.slice(0,15).map(c=>c.name)};
  const myCode=b64encode(myCompat);
  const copyCode=()=>{navigator.clipboard?.writeText(myCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)}).catch(()=>{})};
  const compare=()=>{setCompatErr(null);setCompatRes(null);if(!friendCode.trim())return;try{
    const f=b64decode(friendCode);const lc=arr=>new Set((arr||[]).map(s=>String(s).toLowerCase()));
    const jac=(s1,s2)=>{const inter=[...s1].filter(x=>s2.has(x));const u=new Set([...s1,...s2]);return{score:u.size?inter.length/u.size:0,inter}};
    const aj=jac(lc(myCompat.a),lc(f.a)),gj=jac(lc(myCompat.g),lc(f.g)),cj=jac(lc(myCompat.c),lc(f.c));
    const score=Math.round((aj.score*0.5+gj.score*0.3+cj.score*0.2)*100);const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
    setCompatRes({name:f.n||"ton ami·e",score,artists:aj.inter.map(cap),genres:gj.inter.map(tc),countries:cj.inter.map(cap)});
  }catch{setCompatErr("Code invalide — vérifie que tu as bien collé le code entier.")}};

  // ─── Artistes similaires (You might also like) ───
  const genSimilar=async()=>{
    setSimL(true);setSimRes([]);
    const known=new Set();tA.forEach(a=>known.add(a.name.toLowerCase()));tT.forEach(t=>(t.artists||[]).forEach(a=>known.add(a.name.toLowerCase())));
    const groups=[];
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(const a of tA.slice(0,5)){
      const m=mb[a.id];if(!m||!m.genres?.length)continue;
      const g1=m.genres[0],g2=m.genres[1]||null,cc2=m.countryCode;
      const seen=new Set(),f=[];
      const add=arr=>arr.forEach(z=>{const k=z.name.toLowerCase();if(!known.has(k)&&!seen.has(k)){seen.add(k);f.push(z)}});
      // 1) croisement g1 + g2 + pays (priorité)
      if(g2&&cc2){add(await searchMBA([g1,g2],cc2,15));await wait(1200)}
      // 2) g1 + g2 sans pays
      if(f.length<3&&g2){add(await searchMBA([g1,g2],null,15));await wait(1200)}
      const crossUsed=g2&&f.length>0; // les étapes 1/2 (croisement g1+g2) ont produit qqch
      // 3) repli sur g1 seul + pays
      if(f.length<3){add(await searchMBA([g1],cc2,15));await wait(1200)}
      // 4) repli ultime : g1 seul
      if(f.length<3){add(await searchMBA([g1],null,15));await wait(1200)}
      if(f.length>0){groups.push({base:a.name,genre:crossUsed?`${g1} + ${g2}`:g1,country:m.country,artists:f.slice(0,4)});f.forEach(z=>known.add(z.name.toLowerCase()))}
      await wait(1200);
    }
    const e=await enrichSug(groups,tok);setSimRes(e);setSimL(false);
  };

  // ─── Comparaison des temporalités ───
  const genEvo=async()=>{setEvoL(true);try{const rs=["short_term","medium_term","long_term"];const[ar,tk]=await Promise.all([Promise.all(rs.map(r=>sp(`/me/top/artists?limit=30&time_range=${r}`,tok).catch(()=>({items:[]})))),Promise.all(rs.map(r=>sp(`/me/top/tracks?limit=50&time_range=${r}`,tok).catch(()=>({items:[]}))))]);const recA=[...abt].sort((x,y)=>y.plays-x.plays).slice(0,30);const recT=tbp.slice(0,50);setEvoData({short:{artists:ar[0].items||[],tracks:tk[0].items||[]},medium:{artists:ar[1].items||[],tracks:tk[1].items||[]},long:{artists:ar[2].items||[],tracks:tk[2].items||[]},recent:{artists:recA,tracks:recT}})}catch{}setEvoL(false)};
  const artistRecentTracks=id=>{const m={};ri.forEach(i=>{const t=i.track;if(!t)return;if((t.artists||[]).some(a=>a.id===id)){if(!m[t.id])m[t.id]={...t,plays:0};m[t.id].plays++}});return Object.values(m).sort((a,b)=>b.plays-a.plays)};
  const openEvoArtist=(name,id)=>{const trk=artistRecentTracks(id);const content=<div><p style={{color:C.mut,fontSize:12,marginBottom:12}}>{trk.length?`${trk.length} titre(s) dans tes 50 dernières écoutes`:"Aucune lecture dans tes 50 dernières écoutes"}</p>{trk.map(t=><div key={t.id} onClick={()=>play(t.uri)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{color:C.acc,fontSize:11,fontFamily:"monospace"}}>{t.plays}x</span></div>)}</div>;pushDrill(name,content)};
  const openNames=(title,items)=>{const content=<div><p style={{color:C.mut,fontSize:12,marginBottom:12}}>{items.length} artiste(s){items.length?" — clique pour voir leurs titres récents":""}</p>{items.length?items.map((it,i)=><div key={(it.id||i)+""} onClick={()=>it.id&&openEvoArtist(it.name,it.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:it.id?"pointer":"default"}}><span style={{color:C.mut,fontSize:10,width:22,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,minWidth:0,color:C.txt,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>{it.note&&<span style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{it.note}</span>}</div>):<p style={{color:C.mut,fontSize:12}}>Aucun</p>}</div>;pushDrill(title,content)};
  simFn.current=genSimilar;evoFn.current=genEvo;

  // ─── Drill-down (avec pile + retour) ───
  const openDrill=(title,artists)=>{
    const tracks=tT.filter(t=>(t.artists||[]).some(a=>artists.some(d=>d.id===a.id)));
    const content=<div>
      <p style={{color:C.mut,fontSize:12,marginBottom:12}}>{artists.length} artistes · {tracks.length} titres</p>
      {artists.map((a,i)=>{const m=mb[a.id];const at=tracks.filter(t=>(t.artists||[]).some(ta=>ta.id===a.id));return<div key={a.id} style={{marginBottom:10}}><div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:600}}>{a.name}</div><div style={{color:C.mut,fontSize:10}}>{gl(m)}{m?.country?` · ${m.country}`:""}</div></div></div>{at.length>0&&<div style={{marginLeft:64}}>{at.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"2px 0",cursor:"pointer",borderBottom:`1px solid ${C.brd}`}} onClick={()=>play(t.uri)}><div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><span style={{color:C.grn,fontSize:10}}>▶</span></div>)}</div>}</div>})}
    </div>;
    pushDrill(title,content);
  };
  const drillGenres=()=>pushDrill("Tous les genres",<div>{allG.map((g,i)=><div key={g.name} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(tc(g.name),abg[g.name]||[])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:12}}>{tc(g.name)}</div><span style={{color:C.mut,fontSize:10}}>{g.count}</span></div>)}</div>);
  const drillCountries=()=>pushDrill("Tous les pays",<div>{allC.map((c,i)=><div key={c.name} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(c.name,abc[c.name]||[])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,color:C.txt,fontSize:13}}>{c.name}</div><span style={{color:C.mut,fontSize:10}}>{c.count}</span></div>)}</div>);

  const SugRow=({a,fb})=>{const link=a.sid?`https://open.spotify.com/artist/${a.sid}`:`https://open.spotify.com/search/${encodeURIComponent(a.name)}`;return(<div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`}}>
    <div onClick={()=>a.sid&&playArtTop(a.sid)} title={a.sid?"Lire le 1er titre":""} style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0,cursor:a.sid?"pointer":"default"}}>
      {a.img?<img src={a.img} alt="" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:38,height:38,borderRadius:"50%",background:fb,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#000",fontWeight:700,flexShrink:0}}>{(a.name||"?")[0].toUpperCase()}</div>}
      <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(a.tags||[]).map(tc).join(", ")}{a.country?` · ${a.country}`:""}</div></div>
      {a.sid&&<span style={{color:C.grn,fontSize:11}}>▶</span>}
    </div>
    <a href={link} target="_blank" rel="noreferrer" title={a.sid?"Page Spotify":"Rechercher sur Spotify"} onClick={e=>e.stopPropagation()} style={{color:C.acc,fontSize:14,textDecoration:"none",padding:"4px 6px",flexShrink:0}}>↗</a>
  </div>)};

  return(
    <div className="uc-fadein app-root" style={{background:BG,minHeight:"100vh",fontFamily:"'Inter',sans-serif",color:C.txt,padding:"20px 16px 100px",maxWidth:1200,margin:"0 auto"}}>
      {spin}
      {cur&&createPortal(<><div onClick={closeDrill} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",zIndex:999}} /><DrillDown title={cur.title} items={cur.content} onClose={closeDrill} onBack={popDrill} canBack={drillStack.length>1} /></>,document.body)}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>{prof.images?.[0]&&<div style={{position:"relative",flexShrink:0}}><div style={{position:"absolute",inset:-3,borderRadius:"50%",background:`conic-gradient(from 180deg,${C.grnB},${C.acc},${C.grn},${C.grnB})`,filter:"blur(0.5px)"}} /><img src={prof.images[0].url} alt="" style={{position:"relative",width:46,height:46,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.bg}`}} /></div>}<div><h1 className="uc-h1" style={{margin:0,fontSize:22,fontWeight:600,fontFamily:FD,letterSpacing:"-0.02em"}}>{prof.display_name}</h1><p style={{margin:0,color:C.mut,fontSize:11,letterSpacing:"0.02em"}}>{isPage?(pageTabs.find(([k])=>k===tab)||[])[1]:`Analyse · ${TL[tr]}`}</p></div></div>
        <div className="uc-controls" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          {Object.entries(TL).map(([k,l])=>{const on=!isPage&&tr===k;return<span key={k} style={{display:"inline-flex",alignItems:"center",gap:6}}>{k==="recent"&&<span style={{width:1,height:18,background:C.brd2,margin:"0 1px"}} />}<button onClick={()=>changeTr(k)} style={{padding:"7px 14px",borderRadius:50,fontSize:11,background:on?`linear-gradient(135deg,${C.grnB},${C.grn})`:"rgba(255,255,255,0.04)",border:`1px solid ${on?"transparent":C.brd}`,color:on?"#04140A":C.mut,cursor:"pointer",fontWeight:on?700:500,boxShadow:on?`0 4px 16px -2px rgba(30,215,96,0.55)`:"none"}}>{l}</button></span>})}
          <span style={{width:1,height:22,background:C.brd2,margin:"0 4px"}} />
          {pageTabs.map(([k,l])=>{const on=tab===k;return<button key={k} onClick={()=>setTab(k)} style={{padding:"7px 14px",borderRadius:50,fontSize:11,background:on?`linear-gradient(135deg,${C.acc},#7CDB3F)`:"rgba(255,255,255,0.04)",border:`1px solid ${on?"transparent":C.brd}`,color:on?"#0A1A02":C.mut,cursor:"pointer",fontWeight:on?700:500,whiteSpace:"nowrap",boxShadow:on?`0 4px 16px -2px rgba(184,255,102,0.45)`:"none"}}>{l}</button>})}
        </div>
      </div>
      <p style={{color:C.mut,fontSize:10,marginTop:-6,marginBottom:12}}>Choisis une <b style={{color:C.grnB}}>période</b> pour l'analyse, ou un <b style={{color:C.acc}}>outil</b> indépendant de la période.</p>

      {!isPage&&<div style={{display:"flex",flexWrap:"wrap",gap:"2px 4px",marginBottom:14,borderBottom:`1px solid ${C.brd}`}}>{anaTabs.map(([k,l,recentOnly])=>{const disabled=recentOnly&&!isRecent;const on=tab===k;return<button key={k} disabled={disabled} onClick={()=>!disabled&&setTab(k)} title={disabled?"Disponible en mode « 50 écoutes »":""} style={{padding:"10px 13px",background:"none",border:"none",color:disabled?C.dim:on?C.grnB:C.mut,borderBottom:`2px solid ${on?C.grnB:"transparent"}`,cursor:disabled?"not-allowed":"pointer",fontSize:11.5,fontWeight:on?700:500,marginBottom:-1,whiteSpace:"nowrap",opacity:disabled?0.5:1,textShadow:on?"0 0 18px rgba(30,215,96,0.55)":"none"}}>{l}</button>})}</div>}
      {mbL&&<div style={{marginBottom:14,background:C.card,border:`1px solid ${C.brd}`,borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:12}}><div style={{width:14,height:14,border:`2px solid ${C.brd}`,borderTopColor:C.grn,borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}} /><span style={{color:C.mut,fontSize:12,whiteSpace:"nowrap"}}>Enrichissement des genres &amp; pays… ({mbT} artistes)</span><div style={{flex:1,height:6,background:C.brd,borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(100,(mbP/Math.max(mbT,1))*100)}%`,height:"100%",background:C.grn,borderRadius:3,transition:"width 0.4s"}} /></div></div>}

      {/* OVERVIEW */}
      {tab==="overview"&&<>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={generateShare} style={{padding:"9px 18px",background:`linear-gradient(135deg,${C.grnB},${C.grn})`,border:"none",borderRadius:50,color:"#04140A",fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 6px 20px -4px rgba(30,215,96,0.6)"}}>📸 Partager mes stats</button>
          <button onClick={exportJSON} style={{padding:"8px 16px",background:C.card,border:`1px solid ${C.brd}`,borderRadius:50,color:C.txt,fontSize:12,cursor:"pointer"}}>⬇ JSON</button>
          <button onClick={exportCSV} style={{padding:"8px 16px",background:C.card,border:`1px solid ${C.brd}`,borderRadius:50,color:C.txt,fontSize:12,cursor:"pointer"}}>⬇ CSV</button>
        </div>
        {/* Carte héros */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,marginBottom:20}}>
          {tA[0]&&<Card onClick={()=>openDrill(tA[0].name,[tA[0]])} style={{display:"flex",alignItems:"center",gap:18,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:`radial-gradient(220px 140px at 0% 50%,rgba(30,215,96,0.12),transparent 70%)`,pointerEvents:"none"}} />{tA[0].images?.[0]&&<img src={tA[0].images[0].url} alt="" style={{width:94,height:94,borderRadius:"50%",objectFit:"cover",border:`2px solid rgba(30,215,96,0.5)`,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",flexShrink:0}} />}<div style={{position:"relative",minWidth:0}}><Lbl>Artiste #1</Lbl><div style={{fontSize:23,fontWeight:600,fontFamily:FD,letterSpacing:"-0.02em",lineHeight:1.05,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tA[0].name}</div><div style={{color:C.mut,fontSize:11,marginTop:5}}>{gl(mb[tA[0].id],2)}</div></div></Card>}
          {tT[0]&&<Card onClick={()=>play(tT[0].uri)} style={{display:"flex",alignItems:"center",gap:18,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:`radial-gradient(220px 140px at 0% 50%,rgba(184,255,102,0.10),transparent 70%)`,pointerEvents:"none"}} />{tT[0].album?.images?.[0]&&<img src={tT[0].album.images[0].url} alt="" style={{width:94,height:94,borderRadius:14,objectFit:"cover",boxShadow:"0 8px 24px rgba(0,0,0,0.5)",flexShrink:0}} />}<div style={{position:"relative",minWidth:0}}><Lbl>Titre #1</Lbl><div style={{fontSize:21,fontWeight:600,fontFamily:FD,letterSpacing:"-0.02em",lineHeight:1.05,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tT[0].name}</div><div style={{color:C.mut,fontSize:11,marginTop:5}}>{(tT[0].artists||[]).map(a=>a.name).join(", ")}</div></div></Card>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          <SC label="Artistes" value={tA.length} icon="🎤" onClick={()=>openDrill("Tous les artistes",tA)} />
          <SC label="Durée moy." value={fmt(avgDur)} sub="par titre" icon="📏" />
          {obscurity!==null&&<SC label="Obscurité" value={`${obscurity}/100`} sub="100 = très underground" icon="🕳" />}
          {allG.length>0&&<SC label="Genre #1" value={tc(allG[0].name)} sub={`${allG[0].count} artistes`} icon="🎨" onClick={()=>openDrill(tc(allG[0].name),abg[allG[0].name]||[])} />}
          {allC.length>0&&<SC label="Pays #1" value={allC[0].name} sub={`${allC[0].count} artistes`} icon="🌍" onClick={()=>openDrill(allC[0].name,abc[allC[0].name]||[])} />}
          <SC label="Genres" value={allG.length} icon="🏷" onClick={drillGenres} />
          <SC label="Pays" value={allC.length} icon="🗺" onClick={drillCountries} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
          <Card><Lbl>Top 5 artistes</Lbl>{tA.slice(0,5).map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(a.name,[a])}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:34,height:34,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1}}><div style={{color:C.txt,fontSize:12,fontWeight:500}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{gl(m)}{m?.country?` · ${m.country}`:""}</div></div></div>})}</Card>
          <Card><Lbl>Top 5 titres</Lbl>{tT.slice(0,5).map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:34,height:34,borderRadius:6}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div></div>)}</Card>
        </div>
      </>}

      {/* ARTISTES — liste seule (le "temps d'écoute récent" est passé dans Récent) */}
      {tab==="artists"&&<><Card><Lbl>{isRecent?"Artistes les plus écoutés récemment":`Top ${tA.length} artistes`}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tA.map((a,i)=>{const m=mb[a.id];return<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>openDrill(a.name,[a])}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{a.images?.[0]?<img src={a.images[a.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}} />:<div style={{width:32,height:32,borderRadius:"50%",background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:C.mut,fontSize:9}}>{gl(m,2)}{m?.country?` · ${m.country}`:""}</div></div>{isRecent&&a.plays&&<span style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{a.plays}x</span>}</div>})}</div></Card></>}

      {/* TITRES */}
      {tab==="tracks"&&<><Card><Lbl>{isRecent?"Titres les plus écoutés récemment":`Top ${tT.length} titres`}</Lbl><div style={{maxHeight:800,overflowY:"auto"}}>{tT.map((t,i)=>{const d=t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:"";return<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:24,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]?<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:32,height:32,borderRadius:4}} />:<div style={{width:32,height:32,borderRadius:4,background:C.dim}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div>{isRecent&&t.plays?<span style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x</span>:<div style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{d}</div>}</div>})}</div></Card></>}

      {/* GENRES & PAYS — fusionnés, filtrage croisé */}
      {tab==="geo"&&(allG.length>0?<div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
          <button onClick={()=>openDrill(geoTitle,geoArtists)} style={{padding:"9px 18px",borderRadius:50,background:C.grn,border:"none",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer"}}>👥 Afficher les artistes ({geoArtists.length})</button>
          {(selGenre||selCountry)&&<><span style={{color:C.mut,fontSize:11}}>Filtre :</span>{selGenre&&<button onClick={()=>setSelGenre(null)} style={{padding:"5px 12px",borderRadius:50,background:C.acc,border:"none",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎨 {tc(selGenre)} ✕</button>}{selCountry&&<button onClick={()=>setSelCountry(null)} style={{padding:"5px 12px",borderRadius:50,background:C.grn,border:"none",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>🌍 {selCountry} ✕</button>}</>}
        </div>
        <p style={{color:C.mut,fontSize:10,marginTop:-6,marginBottom:14}}>Clique un genre pour filtrer les pays, un pays (carte ou liste) pour filtrer les genres. Reclique le filtre actif pour l'enlever. Le bouton ci-dessus liste les artistes correspondant aux filtres.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
          {/* Colonne PAYS (carte + liste), filtrée par le genre sélectionné */}
          <Card style={{position:"relative"}}><Lbl>Pays {selGenre?`· ${tc(selGenre)}`:""} ({cAgg.list.length})</Lbl>
            <div style={{position:"relative"}}>
              <ComposableMap projection="geoEqualEarth" projectionConfig={{scale:150}} style={{width:"100%",height:"auto"}}>
                <ZoomableGroup center={[10,15]} zoom={1} maxZoom={6}>
                  <Geographies geography={WORLD_TOPO}>
                    {({geographies})=>geographies.map(geo=>{const num=String(geo.id).padStart(3,"0");const code=NUM_TO_A2[num];const count=code?(cAgg.byCode[code]||0):0;const cname=code?(ISO[code]||geo.properties.name):geo.properties.name;const active=selCountry&&cname===selCountry;
                      return <Geography key={geo.rsmKey} geography={geo} fill={active?C.acc:mapColor(count,geoMaxC)} stroke={C.bg} strokeWidth={0.3}
                        onMouseEnter={()=>setHov({name:cname,count})} onMouseLeave={()=>setHov(null)}
                        onClick={()=>{if(count)setSelCountry(selCountry===cname?null:cname)}}
                        style={{default:{outline:"none",cursor:count?"pointer":"default"},hover:{fill:count?C.acc:C.brd,outline:"none"},pressed:{outline:"none"}}} />;})}
                  </Geographies>
                </ZoomableGroup>
              </ComposableMap>
              {hov&&<div style={{position:"absolute",top:8,left:8,background:C.bg,border:`1px solid ${C.brd}`,borderRadius:8,padding:"6px 12px",pointerEvents:"none"}}><span style={{color:C.txt,fontSize:12,fontWeight:600}}>{hov.name}</span>{hov.count>0&&<span style={{color:C.grn,fontSize:12,fontWeight:700}}> · {hov.count}</span>}</div>}
            </div>
            <div style={{maxHeight:300,overflowY:"auto",marginTop:10}}>{cAgg.list.map((c,i)=>{const active=selCountry===c.name;return<div key={c.name} onClick={()=>setSelCountry(active?null:c.name)} style={{display:"flex",alignItems:"center",gap:12,padding:"7px 8px",borderBottom:`1px solid ${C.brd}`,cursor:"pointer",background:active?"rgba(179,255,92,0.12)":"transparent",borderRadius:active?8:0}}><span style={{color:i<3?C.grn:C.mut,fontSize:12,width:26,textAlign:"right",fontFamily:"monospace",fontWeight:i<3?800:500}}>{i+1}</span><div style={{flex:1,color:active?C.acc:C.txt,fontSize:13,fontWeight:active||i<3?700:400}}>{c.name}</div><div style={{flex:1,maxWidth:110}}><div style={{height:6,borderRadius:3,background:active?C.acc:C.grn,width:`${(c.count/geoMaxC)*100}%`,opacity:0.5+0.5*(c.count/geoMaxC)}} /></div><span style={{color:C.mut,fontSize:11,fontFamily:"monospace",width:26,textAlign:"right"}}>{c.count}</span></div>})}{cAgg.list.length===0&&<p style={{color:C.mut,fontSize:12,textAlign:"center",padding:12}}>Aucun pays pour ce genre.</p>}</div>
          </Card>
          {/* Colonne GENRES, filtrée par le pays sélectionné */}
          <Card><Lbl>Genres {selCountry?`· ${selCountry}`:""} ({gAgg.list.length})</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Clique un genre pour filtrer la carte des pays.</p><div style={{maxHeight:620,overflowY:"auto"}}>{gAgg.list.map((g,i)=>{const active=selGenre===g.name;return<div key={g.name} onClick={()=>setSelGenre(active?null:g.name)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 8px",borderBottom:`1px solid ${C.brd}`,cursor:"pointer",background:active?"rgba(179,255,92,0.12)":"transparent",borderRadius:active?8:0}}><span style={{color:i<3?C.grn:C.mut,fontSize:11,width:26,textAlign:"right",fontFamily:"monospace",fontWeight:i<3?700:400}}>{i+1}</span><div style={{flex:1,minWidth:0}}><div style={{color:active?C.acc:C.txt,fontSize:12,fontWeight:active?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tc(g.name)}</div><div style={{height:4,marginTop:3,borderRadius:2,background:active?C.acc:lerpHex("1DB954","B3FF5C",gAgg.list.length>1?Math.min(1,i/24):0),opacity:0.8,width:`${(g.count/gAgg.list[0].count)*100}%`}} /></div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{g.count}</span></div>})}{gAgg.list.length===0&&<p style={{color:C.mut,fontSize:12,textAlign:"center",padding:12}}>Aucun genre pour ce pays.</p>}</div></Card>
        </div>
      </div>:<Card><p style={{color:C.mut,textAlign:"center"}}>{mbL?`Enrichissement ${Math.min(mbP,mbT)}/${mbT}`:"Pas de données"}</p></Card>)}

      {/* SIMILAIRES (You might also like) */}
      {tab==="similar"&&<div>
        <Card style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}><div><Lbl>You might also like</Lbl><p style={{color:C.mut,fontSize:12,margin:0}}>Artistes proches de ton top 5 ({TL[tr]}) : croisement genres 1 + 2 + pays, repli sur le 1er genre si besoin.</p></div>{(simL||mbL)?<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:14,height:14,border:`2px solid ${C.brd}`,borderTopColor:C.grn,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /><span style={{color:C.mut,fontSize:12}}>{mbL?"Enrichissement…":"Recherche…"}</span></div>:<button onClick={genSimilar} style={{padding:"10px 18px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{simRes.length?"↻ Relancer":"Lancer la recherche"}</button>}</div></Card>
        {simRes.length===0&&!simL&&!mbL&&<Card><p style={{color:C.mut,textAlign:"center",fontSize:12}}>Clique « Lancer la recherche » pour trouver des artistes similaires.</p></Card>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>{simRes.map((s,si)=><Card key={si} style={{padding:16,background:C.sf}}><div style={{marginBottom:10}}><span style={{color:C.mut,fontSize:10}}>Similaire à</span><div style={{color:C.acc,fontSize:14,fontWeight:700}}>{s.base}</div><div style={{color:C.mut,fontSize:9}}>{tc(s.genre)}{s.country?` · ${s.country}`:""}</div></div>{s.artists.map((a,ai)=><SugRow key={ai} a={a} fb={CL[(si*5+ai)%CL.length]} />)}</Card>)}</div>
      </div>}

      {/* DÉCOUVERTES */}
      {tab==="discover"&&<div><Card style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:6}}><Lbl>Suggestions par genre & pays</Lbl>{(sugL||mbL)?<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:14,height:14,border:`2px solid ${C.brd}`,borderTopColor:C.grn,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /><span style={{color:C.mut,fontSize:12}}>{mbL?"Enrichissement…":"Recherche…"}</span></div>:<button onClick={genDiscover} style={{padding:"10px 18px",background:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{sug.length?"↻ Relancer":"Lancer la recherche"}</button>}</div>{sug.length===0&&!sugL&&!mbL&&<p style={{color:C.mut,fontSize:12}}>Clique « Lancer la recherche » pour découvrir des artistes selon tes genres et pays dominants.</p>}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginTop:12}}>{sug.map((s,si)=><Card key={si} style={{padding:16,background:C.sf}}><div style={{marginBottom:10}}><span style={{color:C.acc,fontSize:13,fontWeight:600}}>{tc(s.genre)}</span>{s.country&&<span style={{color:C.mut,fontSize:10}}> · {s.country}</span>}</div>{s.artists.map((a,ai)=><SugRow key={ai} a={a} fb={CL[(si*5+ai)%CL.length]} />)}</Card>)}</div></Card><Card><Lbl>Recherche personnalisée</Lbl><div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><select value={cG} onChange={e=>setCG(e.target.value)} style={{flex:1,minWidth:140,padding:10,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Genre…</option>{allG.map(g=><option key={g.name} value={g.name}>{tc(g.name)} ({g.count})</option>)}</select><select value={cC} onChange={e=>setCC(e.target.value)} style={{flex:1,minWidth:140,padding:10,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:12,outline:"none"}}><option value="">Tous pays</option>{allC.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><button onClick={customSearch} disabled={!cG||cL2} style={{padding:"10px 20px",background:cG?C.grn:C.brd,border:"none",borderRadius:8,color:cG?"#000":C.mut,fontSize:12,fontWeight:600,cursor:cG?"pointer":"default"}}>{cL2?"…":"Chercher"}</button></div>{cR.map((s,si)=><div key={si}><div style={{color:C.acc,fontSize:13,fontWeight:600,marginBottom:8}}>{tc(s.genre)}{s.country?` · ${s.country}`:""}</div><div>{s.artists.map((a,ai)=><SugRow key={ai} a={a} fb={CL[ai%CL.length]} />)}</div></div>)}</Card></div>}

      {/* ÉVOLUTION */}
      {tab==="evolution"&&<div>
        <Card style={{marginBottom:16}}><Lbl>Évolution des goûts</Lbl><p style={{color:C.mut,fontSize:12,margin:0}}>Comparaison automatique de tes tops (30 artistes / 50 titres) sur les 3 périodes Spotify + tes 50 dernières écoutes.</p></Card>
        {!evoData&&<Card><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:30}}><div style={{width:18,height:18,border:`2px solid ${C.brd}`,borderTopColor:C.grn,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /><span style={{color:C.mut,fontSize:13}}>Analyse en cours…</span></div></Card>}
        {evoData&&(()=>{
          const aList=k=>(evoData[k]?.artists)||[];
          const idName={};["short","medium","long","recent"].forEach(k=>aList(k).forEach(a=>{if(!idName[a.id])idName[a.id]=a.name}));
          const rankOf=(k,id)=>{const arr=aList(k);const i=arr.findIndex(a=>a.id===id);return i<0?null:i+1};
          const setOf=k=>new Set(aList(k).map(a=>a.id));
          const sShort=setOf("short"),sMed=setOf("medium"),sLong=setOf("long"),sRec=setOf("recent");
          const newArtists=[...sShort].filter(id=>!sLong.has(id));
          const goneArtists=[...sLong].filter(id=>!sShort.has(id));
          const stable=[...sShort].filter(id=>sMed.has(id)&&sLong.has(id));
          const discoveries=[...sRec].filter(id=>!sShort.has(id)&&!sMed.has(id)&&!sLong.has(id));
          const inBoth=[...sShort].filter(id=>sLong.has(id));
          const movers=inBoth.map(id=>({id,name:idName[id],delta:rankOf("long",id)-rankOf("short",id)}));
          const risers=movers.filter(m=>m.delta>0).sort((a,b)=>b.delta-a.delta).slice(0,6);
          const fallers=movers.filter(m=>m.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,6);
          const mk=ids=>ids.map(id=>({id,name:idName[id]||"?"}));
          // Toutes les valeurs sûres dans le graphe (présents sur les 3 périodes), du mieux classé au moins bien
          const picked=stable.map(id=>({id,name:idName[id],best:Math.min(rankOf("short",id),rankOf("medium",id),rankOf("long",id))})).sort((a,b)=>a.best-b.best);
          const cols=[["long","Tout"],["medium","6 mois"],["short","4 sem"],["recent","50 écoutes"]];
          const maxRank=Math.max(2,...picked.flatMap(p=>cols.map(([k])=>rankOf(k,p.id)||0)));
          const chartData=cols.map(([k,l])=>{const row={p:l};picked.forEach(pk=>row[pk.id]=rankOf(k,pk.id));return row});
          const showLegend=picked.length<=14;
          return<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
              <SC label="Émergents" value={newArtists.length} sub="dans 4 sem, absents de Tout · voir" icon="🌱" onClick={()=>openNames("Émergents (4 sem, absents de Tout)",mk(newArtists))} />
              <SC label="Valeurs sûres" value={stable.length} sub="présents sur les 3 périodes · voir" icon="🪨" onClick={()=>openNames("Valeurs sûres (3 périodes)",mk(stable))} />
              <SC label="En recul" value={goneArtists.length} sub="dans Tout, sortis du 4 sem · voir" icon="📉" onClick={()=>openNames("En recul (sortis du 4 sem)",mk(goneArtists))} />
              <SC label="Découvertes" value={discoveries.length} sub="50 écoutes, hors tops · voir" icon="✨" onClick={()=>openNames("Découvertes (50 écoutes, hors tops)",mk(discoveries))} />
            </div>
            <Card style={{marginBottom:16}}><Lbl>Progression de rang — {picked.length} valeurs sûres</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:12}}>Position dans tes tops à travers le temps (plus haut = mieux classé), de Tout vers tes 50 dernières écoutes. Survole pour le classement à chaque période.</p>
              {picked.length>0?<ResponsiveContainer width="100%" height={Math.max(360,Math.min(620,picked.length*26))}><LineChart data={chartData} margin={{left:0,right:20,top:8,bottom:0}}><XAxis dataKey="p" tick={{fill:C.txt,fontSize:12}} axisLine={false} tickLine={false} /><YAxis reversed allowDecimals={false} domain={[1,maxRank]} tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={28} label={{value:"rang",angle:-90,position:"insideLeft",fill:C.mut,fontSize:10}} /><Tooltip contentStyle={{background:C.bg,border:`1px solid ${C.brd}`,borderRadius:8,color:C.txt,fontSize:11}} itemSorter={i=>i.value==null?9999:i.value} formatter={(v,n)=>[`#${v}`,n]} />{showLegend&&<Legend wrapperStyle={{fontSize:10,color:C.mut}} iconSize={8} />}{picked.map((pk,i)=><Line key={pk.id} type="monotone" dataKey={pk.id} name={pk.name} stroke={CL[i%CL.length]} strokeWidth={2.2} dot={{r:3}} activeDot={{r:5}} connectNulls />)}</LineChart></ResponsiveContainer>:<p style={{color:C.mut,fontSize:12,textAlign:"center",padding:20}}>Pas d'artiste commun aux 3 périodes pour tracer la progression.</p>}
            </Card>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,marginBottom:16}}>
              <Card><Lbl>📈 En hausse</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Mieux classés sur 4 sem que sur Tout.</p>{risers.length?risers.map(m=><div key={m.id} onClick={()=>openEvoArtist(m.name,m.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:C.grn,fontSize:14,width:20}}>↑</span><div style={{flex:1,minWidth:0,color:C.txt,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div><span style={{color:C.grn,fontSize:11,fontFamily:"monospace"}}>+{m.delta}</span></div>):<p style={{color:C.mut,fontSize:11}}>—</p>}</Card>
              <Card><Lbl>📉 En baisse</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Mieux classés sur Tout que sur 4 sem.</p>{fallers.length?fallers.map(m=><div key={m.id} onClick={()=>openEvoArtist(m.name,m.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:C.red,fontSize:14,width:20}}>↓</span><div style={{flex:1,minWidth:0,color:C.txt,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div><span style={{color:C.red,fontSize:11,fontFamily:"monospace"}}>{m.delta}</span></div>):<p style={{color:C.mut,fontSize:11}}>—</p>}</Card>
            </div>
            <Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}><Lbl>Comparaison détaillée</Lbl><div style={{display:"flex",gap:6}}>{[["artists","Artistes"],["tracks","Titres"]].map(([k,l])=><button key={k} onClick={()=>setEvoView(k)} style={{padding:"6px 14px",borderRadius:50,fontSize:11,background:evoView===k?C.grn:C.sf,border:`1px solid ${evoView===k?C.grn:C.brd}`,color:evoView===k?"#000":C.mut,cursor:"pointer",fontWeight:evoView===k?700:400}}>{l}</button>)}</div></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>{[["long","Tout le temps"],["medium","6 mois"],["short","4 semaines"],["recent","50 écoutes"]].map(([k,l])=>{const list=(evoData[k]||{})[evoView]||[];return<div key={k}><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{l}</div><div style={{maxHeight:480,overflowY:"auto"}}>{list.map((it,i)=>{const inOthers=Object.entries(evoData).some(([kk,v])=>kk!==k&&((v||{})[evoView]||[]).some(z=>z.id===it.id));
                if(evoView==="artists")return<div key={it.id+"-"+k} onClick={()=>openEvoArtist(it.name,it.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:C.mut,fontSize:10,width:18,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,minWidth:0,color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>{k==="recent"&&it.plays&&<span style={{color:C.acc,fontSize:9,fontFamily:"monospace"}}>{it.plays}x</span>}{!inOthers&&<span style={{color:C.acc,fontSize:9,fontWeight:700}}>NEW</span>}</div>;
                return<div key={it.id+"-"+k} onClick={()=>play(it.uri)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:C.mut,fontSize:10,width:18,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div><div style={{color:C.mut,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(it.artists||[]).map(a=>a.name).join(", ")}</div></div>{k==="recent"&&it.plays&&<span style={{color:C.acc,fontSize:9,fontFamily:"monospace"}}>{it.plays}x</span>}{!inOthers&&<span style={{color:C.acc,fontSize:9,fontWeight:700}}>NEW</span>}</div>;
              })}</div></div>})}</div>
              <p style={{color:C.mut,fontSize:10,marginTop:12}}>« NEW » = présent dans cette colonne mais dans aucune des autres. {evoView==="artists"&&"Clique un artiste pour voir ses titres récents et le nombre de lectures."}</p>
            </Card>
          </>;
        })()}
      </div>}

      {/* RÉCENT — toutes les analyses basées sur les 50 dernières écoutes, indépendant de la période */}
      {tab==="habits"&&<>
        <p style={{color:C.mut,fontSize:11,marginBottom:16}}>Analyse de tes <b style={{color:C.txt}}>50 dernières écoutes</b> par heure. Onglet réservé au mode « 50 écoutes ». La sélection des tops (artistes, titres, genres, pays) suit déjà la temporalité « 50 écoutes » en haut.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,marginBottom:16}}>
          <Card><Lbl>50 dernières écoutes</Lbl><div style={{maxHeight:420,overflowY:"auto"}}>{ri.map((item,i)=>{const t=item.track,diff=(Date.now()-new Date(item.played_at))/1000,ago=diff<3600?`${Math.floor(diff/60)}m`:diff<86400?`${Math.floor(diff/3600)}h`:`${Math.floor(diff/86400)}j`;return<div key={`${t.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:28,height:28,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><div style={{color:C.mut,fontSize:9}}>{(t.artists||[]).map(a=>a.name).join(", ")}</div></div><div style={{color:C.mut,fontSize:9,fontFamily:"monospace"}}>{ago}</div></div>})}</div></Card>
          <Card><Lbl>Plus joués récemment</Lbl><div style={{maxHeight:420,overflowY:"auto"}}>{tbp.map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}} onClick={()=>play(t.uri)}><span style={{color:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span>{t.album?.images?.[0]&&<img src={t.album.images[t.album.images.length>1?1:0].url} alt="" style={{width:28,height:28,borderRadius:4}} />}<div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div></div><div style={{color:C.acc,fontSize:10,fontFamily:"monospace"}}>{t.plays}x</div></div>)}</div></Card>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,marginBottom:16}}>
          <Card><Lbl>Temps d'écoute récent (artistes)</Lbl>{abt.length>0?<ResponsiveContainer width="100%" height={Math.min(500,abt.slice(0,15).length*32)}><BarChart data={abt.slice(0,15).map(a=>({name:a.name.length>14?a.name.slice(0,12)+"…":a.name,min:Math.round(a.min)}))} layout="vertical" margin={{left:4,right:16}}><XAxis type="number" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} unit=" min" /><YAxis type="category" dataKey="name" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} width={100} /><Tooltip cursor={{fill:"rgba(30,215,96,0.08)"}} contentStyle={{background:C.bg,border:`1px solid ${C.brd2}`,borderRadius:10,boxShadow:"0 10px 28px rgba(0,0,0,0.55)"}} itemStyle={{color:C.txt}} labelStyle={{color:C.grnB,fontWeight:700}} formatter={v=>[`${v} min`,"Écoute"]} /><Bar dataKey="min" radius={[0,6,6,0]}>{abt.slice(0,15).map((_,i,arr)=><Cell key={i} fill={lerpHex("1ED760","2DD4BF",arr.length>1?i/(arr.length-1):0)} />)}</Bar></BarChart></ResponsiveContainer>:<p style={{color:C.mut}}>Pas de données</p>}</Card>
          <Card><Lbl>Écoutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><defs><linearGradient id="gEc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1ED760"/><stop offset="100%" stopColor="#1DB954" stopOpacity="0.6"/></linearGradient></defs><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip cursor={{fill:"rgba(30,215,96,0.08)"}} contentStyle={{background:C.bg,border:`1px solid ${C.brd2}`,borderRadius:10,boxShadow:"0 10px 28px rgba(0,0,0,0.55)"}} itemStyle={{color:C.txt}} labelStyle={{color:C.grnB,fontWeight:700}} formatter={v=>[v,"Écoutes"]} /><Bar dataKey="nb" radius={[5,5,0,0]} name="Écoutes">{(()=>{const mx=Math.max(...hr.map(x=>x.nb));return hr.map((d,i)=><Cell key={i} fill={d.nb===mx&&mx>0?C.grnB:"url(#gEc)"} />)})()}</Bar></BarChart></ResponsiveContainer></Card>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
          <Card><Lbl>Minutes / heure</Lbl><ResponsiveContainer width="100%" height={250}><BarChart data={hr}><defs><linearGradient id="gMin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8FF66"/><stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.65"/></linearGradient></defs><XAxis dataKey="h" tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} interval={2} /><YAxis tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><Tooltip cursor={{fill:"rgba(30,215,96,0.08)"}} contentStyle={{background:C.bg,border:`1px solid ${C.brd2}`,borderRadius:10,boxShadow:"0 10px 28px rgba(0,0,0,0.55)"}} itemStyle={{color:C.txt}} labelStyle={{color:C.grnB,fontWeight:700}} formatter={v=>[`${Math.round(v)} min`,"Écoute"]} /><Bar dataKey="min" radius={[5,5,0,0]}>{(()=>{const mx=Math.max(...hr.map(x=>x.min));return hr.map((d,i)=><Cell key={i} fill={d.min===mx&&mx>0?C.acc:"url(#gMin)"} />)})()}</Bar></BarChart></ResponsiveContainer></Card>
          <Card><Lbl>Genre dominant / heure</Lbl><p style={{color:C.mut,fontSize:10,marginTop:-8,marginBottom:10}}>Le genre le plus écouté à chaque heure. Survole une barre pour le détail ; la légende donne le code couleur.</p><ResponsiveContainer width="100%" height={Math.max(200,gph.length*26)}><BarChart data={gph} layout="vertical" margin={{left:4,right:16}}><XAxis type="number" allowDecimals={false} tick={{fill:C.mut,fontSize:10}} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="h" tick={{fill:C.grnB,fontSize:11,fontWeight:700}} axisLine={false} tickLine={false} width={40} /><Tooltip cursor={{fill:"rgba(30,215,96,0.08)"}} contentStyle={{background:C.bg,border:`1px solid ${C.brd2}`,borderRadius:10,boxShadow:"0 10px 28px rgba(0,0,0,0.55)",padding:"8px 12px"}} itemStyle={{color:C.txt}} labelStyle={{color:C.grnB,fontWeight:700,marginBottom:2}} labelFormatter={l=>`À ${l}`} formatter={(v,n,p)=>[`${tc(p.payload.genre)} · ${v} écoute${v>1?"s":""}`,"Genre dominant"]} /><Bar dataKey="nb" radius={[0,6,6,0]}>{gph.map((d,i)=><Cell key={i} fill={CL[hGenres.indexOf(d.genre)%CL.length]||C.dim} />)}</Bar></BarChart></ResponsiveContainer><div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",marginTop:14,paddingTop:12,borderTop:`1px solid ${C.brd}`}}>{hGenres.map((g,i)=><div key={g} style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:11,height:11,borderRadius:3,background:CL[i%CL.length],flexShrink:0,boxShadow:`0 0 8px -1px ${CL[i%CL.length]}`}} /><span style={{color:C.mut,fontSize:10}}>{tc(g)}</span></div>)}</div></Card>
        </div>
      </>}

      {/* PLAYLISTS */}
      {tab==="playlists"&&<div><Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><Lbl>Mes playlists ({pls.length})</Lbl><button onClick={refreshPls} title="Recharger" style={{background:C.sf,border:`1px solid ${C.brd}`,borderRadius:50,color:C.txt,fontSize:11,padding:"5px 12px",cursor:"pointer"}}>↻ Recharger</button></div>{pls.length===0&&<p style={{color:C.mut,fontSize:12}}>Aucune playlist chargée. Clique « Recharger », et si ça persiste, reconnecte-toi.</p>}<div style={{maxHeight:760,overflowY:"auto"}}>{pls.map(p=>{const isPlaying=nowUri===p.uri;const n=plCounts[p.id]!==undefined?plCounts[p.id]:p.tracks?.total;return<div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:isPlaying?"8px":"8px 0",borderBottom:`1px solid ${C.brd}`,background:isPlaying?"rgba(29,185,84,0.1)":"transparent",borderRadius:isPlaying?10:0,marginBottom:isPlaying?4:0}}>
        {p.images?.[0]?<img src={p.images[0].url} alt="" style={{width:42,height:42,borderRadius:6,objectFit:"cover"}} />:<div style={{width:42,height:42,borderRadius:6,background:C.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>♪</div>}
        <div style={{flex:1,minWidth:0}}><div style={{color:isPlaying?C.grn:C.txt,fontSize:13,fontWeight:isPlaying?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>{(typeof n==="number"||isPlaying)&&<div style={{color:C.mut,fontSize:10}}>{typeof n==="number"?`${n} titres`:""}{typeof n==="number"&&isPlaying?" · ":""}{isPlaying&&<span style={{color:C.grn,fontWeight:700}}>En lecture</span>}</div>}</div>
        <a href={`https://open.spotify.com/playlist/${p.id}`} target="_blank" rel="noreferrer" title="Ouvrir dans Spotify" style={{color:C.acc,fontSize:15,textDecoration:"none",padding:"4px 6px"}}>↗</a>
        <button onClick={()=>(isPlaying&&pl?.is_playing)?cmd("pause"):playCtx(p.uri)} title={(isPlaying&&pl?.is_playing)?"Pause":"Lecture"} style={{background:isPlaying?C.grn:C.brd,border:"none",borderRadius:"50%",width:30,height:30,color:isPlaying?"#000":C.txt,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{(isPlaying&&pl?.is_playing)?I.pause(13):I.play(13)}</button>
      </div>})}</div></Card></div>}

      {/* LECTEUR */}
      {tab==="player"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}><Card>{np?<div><div style={{display:"flex",gap:16,marginBottom:20}}>{np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:140,height:140,borderRadius:12}} />}<div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{np.name}</div><div style={{color:C.mut,fontSize:13}}>{(np.artists||[]).map(a=>a.name).join(", ")}</div><a href={`https://open.spotify.com/album/${np.album?.id}`} target="_blank" rel="noreferrer" style={{color:C.acc,fontSize:11,textDecoration:"none",display:"block",marginTop:4}}>💿 {np.album?.name} ↗</a>{np.album?.release_date&&<div style={{color:C.mut,fontSize:10,marginTop:2}}>📅 {np.album.release_date.slice(0,4)}</div>}{npMb&&<div style={{marginTop:6}}><div style={{color:C.acc,fontSize:11}}>🎨 {gl(npMb)}</div>{npMb.country&&<div style={{color:C.acc,fontSize:11}}>🌍 {npMb.country}</div>}</div>}{ctxName&&<div style={{marginTop:6,padding:"4px 10px",background:C.sf,borderRadius:6,display:"inline-block"}}><span style={{color:C.grn,fontSize:11,fontWeight:600}}>{pl?.context?.type==="playlist"?"📋":"💿"} {ctxName}</span></div>}{pl?.progress_ms&&np.duration_ms&&<div style={{marginTop:10}}><div style={{width:"100%",height:4,background:C.brd,borderRadius:2}}><div style={{width:`${(pl.progress_ms/np.duration_ms)*100}%`,height:"100%",background:C.grn,borderRadius:2,transition:"width 1s linear"}} /></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(pl.progress_ms/60000)}</span><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{fmt(np.duration_ms/60000)}</span></div></div>}</div></div><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10}}><PB label="Aléatoire" icon={I.shuffle()} active={pl?.shuffle_state} onClick={()=>cmd("shuffle")} /><PB label="Précédent" icon={I.prev()} onClick={()=>cmd("prev")} /><PB label={pl?.is_playing?"Pause":"Lecture"} icon={pl?.is_playing?I.pause():I.play()} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} /><PB label="Suivant" icon={I.next()} onClick={()=>cmd("next")} /><PB label="Répéter" icon={pl?.repeat_state==="track"?I.repeatOne():I.repeat()} active={pl?.repeat_state!=="off"} onClick={()=>cmd("repeat")} /></div></div>:<div style={{textAlign:"center",padding:40}}><p style={{color:C.mut,fontSize:14}}>Ouvre Spotify sur un appareil</p></div>}</Card><div style={{display:"flex",flexDirection:"column",gap:16}}><Card><Lbl>Appareils ({devs.length})</Lbl>{devs.length>0?devs.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:18}}>{d.type==="Computer"?"💻":d.type==="Smartphone"?"📱":"🔊"}</span><div style={{flex:1}}><div style={{color:C.txt,fontSize:13,fontWeight:500}}>{d.name}</div><div style={{color:C.mut,fontSize:10}}>{d.type} · Vol. {d.volume_percent}%</div></div>{d.is_active&&<div style={{background:C.grn,color:"#000",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:50}}>ACTIF</div>}</div>):<p style={{color:C.mut}}>Aucun appareil</p>}</Card>{np&&albumTks.length>0&&<Card><Lbl>Album · {np.album?.name}</Lbl><div style={{maxHeight:300,overflowY:"auto"}}>{albumTks.map((t,i)=>{const cur2=t.id===np.id;return<div key={t.id} onClick={()=>play(t.uri)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer"}}><span style={{color:cur2?C.grn:C.mut,fontSize:10,width:20,textAlign:"right",fontFamily:"monospace"}}>{i+1}</span><div style={{flex:1,minWidth:0,color:cur2?C.grn:C.txt,fontSize:12,fontWeight:cur2?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div><span style={{color:C.mut,fontSize:10,fontFamily:"monospace"}}>{t.duration_ms?`${Math.floor(t.duration_ms/60000)}:${String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,"0")}`:""}</span></div>})}</div></Card>}</div></div>}

      {/* COMPAT */}
      {tab==="compat"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
        <Card><Lbl>Ton code de profil</Lbl><p style={{color:C.mut,fontSize:12,marginBottom:12}}>Envoie ce code à un·e ami·e qui utilise la même app. Rien ne quitte vos navigateurs.</p><textarea readOnly value={myCode} onFocus={e=>e.target.select()} style={{width:"100%",height:90,resize:"none",padding:12,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.mut,fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box",wordBreak:"break-all"}} /><button onClick={copyCode} style={{marginTop:10,padding:"10px 20px",background:copied?C.acc:C.grn,border:"none",borderRadius:50,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer"}}>{copied?"Copié ✓":"Copier mon code"}</button></Card>
        <Card><Lbl>Comparer avec un·e ami·e</Lbl><textarea value={friendCode} onChange={e=>setFriendCode(e.target.value)} placeholder="Colle ici le code de ton ami·e…" style={{width:"100%",height:90,resize:"none",padding:12,background:C.sf,border:`1px solid ${C.brd}`,borderRadius:10,color:C.txt,fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box",wordBreak:"break-all"}} /><button onClick={compare} disabled={!friendCode.trim()} style={{marginTop:10,padding:"10px 20px",background:friendCode.trim()?C.grn:C.brd,border:"none",borderRadius:50,color:friendCode.trim()?"#000":C.mut,fontSize:12,fontWeight:700,cursor:friendCode.trim()?"pointer":"default"}}>Comparer</button>{compatErr&&<p style={{color:C.red,fontSize:12,marginTop:12}}>{compatErr}</p>}{compatRes&&<div style={{marginTop:16}}><div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:48,fontWeight:800,color:C.grn,fontFamily:"monospace",lineHeight:1}}>{compatRes.score}%</div><div style={{color:C.mut,fontSize:12,marginTop:4}}>de compatibilité avec {compatRes.name}</div></div>{compatRes.artists.length>0&&<div style={{marginBottom:12}}><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Artistes en commun ({compatRes.artists.length})</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.artists.join(", ")}</div></div>}{compatRes.genres.length>0&&<div style={{marginBottom:12}}><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Genres en commun</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.genres.join(", ")}</div></div>}{compatRes.countries.length>0&&<div><div style={{color:C.acc,fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Pays en commun</div><div style={{color:C.txt,fontSize:12,lineHeight:1.6}}>{compatRes.countries.join(", ")}</div></div>}{compatRes.artists.length===0&&compatRes.genres.length===0&&compatRes.countries.length===0&&<p style={{color:C.mut,fontSize:12,textAlign:"center"}}>Aucun recouvrement — des goûts très différents !</p>}</div>}</Card>
      </div>}

      {shareImg&&<div onClick={closeShare} className="uc-fadein" style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(0,0,0,0.80)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{maxWidth:430,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
          <div style={{color:C.mut,fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",textTransform:"uppercase"}}>Aperçu — {PERIOD_LONG[tr]}</div>
          <img src={shareImg} alt="Aperçu de tes stats" style={{maxWidth:"100%",maxHeight:"70vh",borderRadius:18,boxShadow:"0 30px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(30,215,96,0.28)"}} />
          <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
            <button onClick={downloadShare} style={{padding:"12px 22px",borderRadius:50,border:"none",background:`linear-gradient(135deg,${C.grnB},${C.grn})`,color:"#04140A",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:"0 8px 24px -6px rgba(30,215,96,0.6)"}}>⬇ Télécharger</button>
            <button onClick={shareNative} style={{padding:"12px 22px",borderRadius:50,border:`1px solid ${C.brd2}`,background:"rgba(255,255,255,0.06)",color:C.txt,fontWeight:700,fontSize:13,cursor:"pointer"}}>↗ Partager</button>
            <button onClick={closeShare} style={{padding:"12px 22px",borderRadius:50,border:`1px solid ${C.brd}`,background:"transparent",color:C.mut,fontWeight:600,fontSize:13,cursor:"pointer"}}>Fermer</button>
          </div>
        </div>
      </div>}

      {toast&&<div className="uc-fade" style={{position:"fixed",bottom:np&&tab!=="player"?92:24,left:"50%",transform:"translateX(-50%)",background:toast.ok?`linear-gradient(135deg,${C.grnB},${C.grn})`:`linear-gradient(135deg,#FF8A8A,${C.red})`,color:toast.ok?"#04140A":"#fff",padding:"13px 24px",borderRadius:50,fontSize:13,fontWeight:700,zIndex:1100,boxShadow:"0 10px 34px rgba(0,0,0,0.5)",maxWidth:"90vw"}}>{toast.msg}</div>}

      {np&&tab!=="player"&&<div style={{position:"fixed",bottom:0,left:0,right:0,background:"linear-gradient(180deg,rgba(21,24,26,0.92),rgba(10,11,13,0.96))",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderTop:`1px solid rgba(30,215,96,0.35)`,boxShadow:"0 -8px 30px rgba(0,0,0,0.45),0 -1px 0 rgba(30,215,96,0.25)",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,zIndex:100}}>
        {np.album?.images?.[0]&&<img src={np.album.images[0].url} alt="" style={{width:40,height:40,borderRadius:6}} />}
        <div style={{flex:1,minWidth:0}}><div style={{color:C.txt,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{np.name}</div><div style={{color:C.mut,fontSize:10}}>{(np.artists||[]).map(a=>a.name).join(", ")}{ctxName?` · ${ctxName}`:""}</div></div>
        <div style={{display:"flex",gap:6}}><PB label="Précédent" icon={I.prev(13)} onClick={()=>cmd("prev")} /><PB label={pl?.is_playing?"Pause":"Lecture"} icon={pl?.is_playing?I.pause(18):I.play(18)} big onClick={()=>cmd(pl?.is_playing?"pause":"play")} /><PB label="Suivant" icon={I.next(13)} onClick={()=>cmd("next")} /></div>
      </div>}

      <div style={{textAlign:"center",marginTop:40,color:C.mut,fontSize:10}}>Spotify · MusicBrainz ({enr}/{tA.length}) · {allG.length} genres · {allC.length} pays · <button onClick={()=>{setTok(null);setData(null);setMb({});mbCache.current={};setSug([])}} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:10,textDecoration:"underline"}}>Déconnexion</button></div>
    </div>
  );
}