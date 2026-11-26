// buss.veebi.dev: Tallinn public transport with live times. Built by VeebiDev, MIT licence.
import { Router, decodePoly, DETOUR, ACCESS } from './router.js?v=a4e6ca5d';
import { walker } from './walk.js?v=2392f91c';
import { siri, delaysFor, vehicles, notices } from './live.js?v=0ce44c1c';
"use strict";
// guides that tell people to change something on their device speak the device's language (its menus are named in it):
// Estonian only on an Estonian device, else English
const EN=!/^et\b/i.test((navigator.languages&&navigator.languages[0])||navigator.language||'');
const L=(et,en)=>EN?en:et;
let FOLLOW=true,camAt=null,nearAt=null,resAt=null; // map follows you: see followMe
/* ================= icons ================= */
const S='fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I={
 refresh:`<svg viewBox="0 0 24 24" ${S}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>`,
 warn:`<svg viewBox="0 0 24 24" ${S}><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/></svg>`,
 bell:`<svg viewBox="0 0 24 24" ${S}><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`,
 search:`<svg viewBox="0 0 24 24" width="20" height="20" ${S}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>`,
 back:`<svg viewBox="0 0 24 24" width="22" height="22" ${S}><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
 swap:`<svg viewBox="0 0 24 24" width="20" height="20" ${S}><path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14m3.5-3.5L16 19l-3.5-3.5"/></svg>`,
 locate:`<svg viewBox="0 0 24 24" ${S}><path d="M20.5 3.5 3.5 10.6l7.2 2.7 2.7 7.2z"/></svg>`,
 sun:`<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`,
 moon:`<svg viewBox="0 0 24 24" ${S}><path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z"/></svg>`,
 heart:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.6s-7.6-4.6-7.6-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.6 2.8c0 5.8-7.6 10.4-7.6 10.4Z"/></svg>`,
 close:`<svg viewBox="0 0 24 24" width="18" height="18" ${S}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`,
 plus:`<svg viewBox="0 0 24 24" ${S}><path d="M12 5v14M5 12h14"/></svg>`,
 gear:`<svg viewBox="0 0 24 24" ${S}><path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20"/><circle cx="15" cy="7.5" r="2.5"/><circle cx="9" cy="16.5" r="2.5"/></svg>`,
 home:`<svg viewBox="0 0 24 24" ${S}><path d="M4 11.2 12 4.8l8 6.4"/><path d="M6.5 9.5V19h11V9.5"/><path d="M10.2 19v-4.6h3.6V19"/></svg>`,
 work:`<svg viewBox="0 0 24 24" ${S}><rect x="3.8" y="7.8" width="16.4" height="11.4" rx="2.6"/><path d="M9 7.8V6.3c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5v1.5M3.8 13h16.4"/></svg>`,
 star:`<svg viewBox="0 0 24 24" ${S}><path d="m12 4.6 2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>`,
 starf:`<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 4.6 2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>`,
 school:`<svg viewBox="0 0 24 24" ${S}><path d="M2.8 9.4 12 5.2l9.2 4.2L12 13.6z"/><path d="M6.6 11.3v4.1c0 1.5 2.4 3 5.4 3s5.4-1.5 5.4-3v-4.1M21.2 9.4v5"/></svg>`,
 gym:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M7 7.5v9M17 7.5v9M4 10v4M20 10v4M7 12h10"/></svg>`,
 shop:`<svg viewBox="0 0 24 24" ${S}><path d="M5.4 8.4h13.2l-1 11.2H6.4z"/><path d="M9 8.4V7a3 3 0 0 1 6 0v1.4"/></svg>`,
 fam:`<svg viewBox="0 0 24 24" ${S}><path d="M12 19.6s-7.2-4.4-7.2-9.6A4 4 0 0 1 12 7.6 4 4 0 0 1 19.2 10c0 5.2-7.2 9.6-7.2 9.6Z"/></svg>`,
 pen:`<svg viewBox="0 0 24 24" ${S}><path d="M5 19.2 6 15 15.6 5.4a2.1 2.1 0 0 1 3 3L9 18z"/><path d="m13.8 7.2 3 3"/></svg>`,
 grip:`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="9" cy="6.5" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17.5" r="1.6"/><circle cx="15" cy="17.5" r="1.6"/></svg>`,
 flag:`<svg viewBox="0 0 24 24" ${S}><path d="M6 20.5V4.5"/><path d="M6 5h11.5l-2.4 3.6 2.4 3.6H6"/></svg>`,
 trash:`<svg viewBox="0 0 24 24" ${S}><path d="M4.8 7h14.4M9.8 7V5.2h4.4V7M6.8 7l.9 12.2h8.6l.9-12.2"/></svg>`,
 auto:`<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="7.6"/><path d="M12 4.4a7.6 7.6 0 0 1 0 15.2z" fill="currentColor" stroke="none"/></svg>`,
 chev:`<svg viewBox="0 0 24 24" ${S}><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg>`,
 minus:`<svg viewBox="0 0 24 24" ${S}><path d="M5 12h14"/></svg>`,
 pin:`<svg viewBox="0 0 24 24" ${S}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
 clock:`<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
 live:`<svg viewBox="0 0 24 24" class="ic-live" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none"/><path d="M5 12.2a6.8 6.8 0 0 1 6.8 6.8M5 6.6A12.4 12.4 0 0 1 17.4 19"/></svg>`,
 bolt:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.2 2 5 13.4h6L9.8 22 19 10.2h-6.1z"/></svg>`,
 walk:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="13.2" cy="4.1" r="2.1"/><path d="M11.2 7.3c.5-.3 1.1-.4 1.7-.2.6.2 1 .6 1.3 1.1l.9 1.8c.6 1.1 1.7 1.9 3 2v2c-1.8-.1-3.4-1-4.4-2.3l-.6 2.9 2.2 2.1V22h-2v-4.6l-2.3-2.1-.7 3L6.8 22 5.4 20.6l3-3.2 1.4-6.3-1.6.8V14h-2V10.6z"/></svg>`,
 run:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="15.6" cy="3.9" r="2.1"/><path d="M10.6 7.3 13.4 6c.7-.3 1.5-.2 2 .3l1.9 1.9c.9.9 2.1 1.5 3.5 1.6v2c-1.8-.1-3.4-.8-4.6-1.9l-1.2 3.9 2.6 2.2V22h-2v-5.1l-2.8-2.3-1.3 3.4-5 3.6-1.2-1.6 4.4-3.2 2.4-7.1-1.6.7L9.3 13 7.4 12.3l1.4-3.8c.3-.5.9-1 1.8-1.2Z"/></svg>`,
 jog:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.4" cy="4.2" r="2.25" fill="currentColor" stroke="none"/><path d="M12.5 8.6 11.4 13.9"/><path d="M16.7 9.7 14.5 11.4 12.5 8.9 10.1 10.6 8.5 12.9"/><path d="M11.4 13.9 13.9 16.4 13.1 20.8"/><path d="M11.4 13.9 9.8 17.5 6.6 18.3"/></svg>`,
 bus:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2.5h10A2.5 2.5 0 0 1 19.5 5v12a2 2 0 0 1-1 1.7V21a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1.2H8.7V21a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-2.3a2 2 0 0 1-1-1.7V5A2.5 2.5 0 0 1 7 2.5Zm-.5 4v5h11v-5zm1.6 8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm7.8 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/></svg>`,
 tram:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 1.5h8V3h-3.3l-.5 1.6H16A2.5 2.5 0 0 1 18.5 7v10a2.4 2.4 0 0 1-1.3 2.1L18.6 22h-2.2l-1.1-2.2H8.7L7.6 22H5.4l1.4-2.9A2.4 2.4 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.6h2.4l.5-1.6H8zM7.5 8v4.5h9V8zm1.2 6.6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm6.6 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"/></svg>`,
 trol:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 1 2.6 4.2H9.2L6.6 1zm5 0 2.6 4.2h-1.4L11.6 1zM7 6h10a2.5 2.5 0 0 1 2.5 2.5V18a1.8 1.8 0 0 1-1 1.6V22h-3v-2H8.5v2h-3v-2.4a1.8 1.8 0 0 1-1-1.6V8.5A2.5 2.5 0 0 1 7 6Zm-.5 3v4.2h11V9zm1.6 6.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm7.8 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>`,
 train:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 2h8a3.5 3.5 0 0 1 3.5 3.5V16a3 3 0 0 1-2.2 2.9L19 22h-2.3l-1.5-2.6H8.8L7.3 22H5l1.7-3.1A3 3 0 0 1 4.5 16V5.5A3.5 3.5 0 0 1 8 2Zm-1.5 4v5h11V6zm2 7.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm7 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z"/></svg>`
};
Object.assign(I,{
 github:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2.2Z"/></svg>`,
 chat:`<svg viewBox="0 0 24 24" ${S}><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7.5L7 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="M8 10h8M8 13h5"/></svg>`,
 share:`<svg viewBox="0 0 24 24" ${S}><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5"/></svg>`,
 install:`<svg viewBox="0 0 24 24" ${S}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>`,
 info:`<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg>`,
 ext:`<svg viewBox="0 0 24 24" ${S}><path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5"/></svg>`
});
document.querySelectorAll('[data-i]').forEach(el=>{el.innerHTML=I[el.dataset.i]||''});
I.reg=I.bus;
const MODE={bus:'Buss',reg:'Maakonnabuss',tram:'Tramm',trol:'Troll',train:'Rong',walk:'Kõnni',run:'Jookse',jog:'Sörgi'};
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const isDesk=()=>matchMedia('(min-width: 900px)').matches;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/* ================= geometry ================= */
const KX=111320*Math.cos(59.43*Math.PI/180),KY=110574;
const m=(a,b)=>Math.hypot((b[0]-a[0])*KX,(b[1]-a[1])*KY);
function prep(p){const c=[0];for(let i=1;i<p.length;i++)c.push(c[i-1]+m(p[i-1],p[i]));return{p,c,L:c[c.length-1]}}
function at(Q,d){d=Math.max(0,Math.min(Q.L,d));let lo=0,hi=Q.c.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(Q.c[mid]<=d)lo=mid;else hi=mid}const a=Q.p[lo],b=Q.p[hi],s=(Q.c[hi]-Q.c[lo])||1,t=(d-Q.c[lo])/s;return{ll:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],brg:Math.atan2((b[0]-a[0])*KX,(b[1]-a[1])*KY)*180/Math.PI}}
function sub(Q,d0,d1){const o=[at(Q,d0).ll];for(let i=0;i<Q.p.length;i++)if(Q.c[i]>d0&&Q.c[i]<d1)o.push(Q.p[i]);o.push(at(Q,d1).ll);return o}
function nearD(Q,ll){let b=1e9,d=0;for(let i=0;i<Q.p.length;i++){const x=m(Q.p[i],ll);if(x<b){b=x;d=Q.c[i]}}return d}
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================= clock, timetable, live ================= */
const TZF=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function clock(){const p={};for(const x of TZF.formatToParts(new Date()))p[x.type]=+x.value;return{ymd:p.year*1e4+p.month*100+p.day,min:p.hour*60+p.minute+p.second/60}}
function addDays(ymd,k){const d=new Date(Date.UTC(Math.floor(ymd/1e4),Math.floor(ymd/100)%100-1,ymd%100+k));return d.getUTCFullYear()*1e4+(d.getUTCMonth()+1)*100+d.getUTCDate()}
const hm=t=>{t=Math.round(t);t=((t%1440)+1440)%1440;return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
const mins=x=>Math.max(0,Math.round(x));
const fmtM=d=>d>=1000?(d/1000).toFixed(1).replace('.',',')+' km':Math.round(d/10)*10+' m';
const WALK=walker(); // real street walks (OpenStreetMap), loaded around the start and the end when needed
let TT=null,RT=null,SHAPES=null,DELAYS=new Map(),DELAYS_AT=0;
const DEF_LL=[24.7445,59.4330]; // Vabaduse väljak, used until we know where you are
const API='https://veebi.dev/api/buss/';
let NOTES=[];
async function loadNotes(){try{NOTES=await notices(clock().ymd);if(state.view==='results')renderResults();else if(state.view==='route')renderRoute();else if(state.view==='home'&&NEAR.length)loadNear()}catch(e){}setTimeout(loadNotes,600000)}
const notesFor=(m,n)=>NOTES.filter(x=>x.routes.has(String(n))&&(!x.modes.size||x.modes.has(m)));
const legNotes=R=>{const seen=new Set(),o=[];for(const l of R.legs)if(l.n&&(l.m==='bus'||l.m==='tram'||l.m==='trol'))for(const x of notesFor(l.m,l.n))if(!seen.has(x.key)){seen.add(x.key);o.push([l,x])}return o};
function noteBox(x){return`<details class="ntc"><summary>${I.warn}<span>${esc(x.title)}</span></summary>${x.paras.map(t=>`<p>${esc(t)}</p>`).join('')}${x.links.map(k=>`<a href="${esc(k.href)}" target="_blank" rel="noopener">${esc(k.t)}</a>`).join(' · ')}</details>`}
async function loadData(){
 const r=await fetch('data/tt.json');if(!r.ok)throw new Error('tt');TT=await r.json();RT=new Router(TT);WALK.ready.then(()=>RT.setWalk(WALK.stops));
 fetch('data/shapes.json').then(r=>r.json()).then(s=>{SHAPES=s;SHQ.clear();if(state.view==='results'||state.view==='route')go(state.view,{instant:true,keepCam:true})}).catch(()=>{});
}
const SHQ=new Map();
function shapeQ(pi){const sh=TT.pats[pi].sh;if(!SHAPES||SHAPES[sh]==null)return null;if(!SHQ.has(sh))SHQ.set(sh,prep(decodePoly(SHAPES[sh])));return SHQ.get(sh)}
const stopLL=s=>RT.ll[s],stopName=s=>TT.stops.n[s];
function nearAfter(Q,ll,dmin){let b=1e9,d=dmin;for(let i=0;i<Q.p.length;i++){if(Q.c[i]<dmin-5)continue;const x=m(Q.p[i],ll);if(x<b){b=x;d=Q.c[i]}}return d}
/* distance along the line's path of every stop of a pattern (for drawing and the timetable "ghost") */
const STOPD=new Map();
function stopDs(pi){if(STOPD.has(pi))return STOPD.get(pi);const Q=shapeQ(pi);if(!Q)return null;let d=0;const a=TT.pats[pi].s.map(s=>d=nearAfter(Q,stopLL(s),d));STOPD.set(pi,a);return a}
function rideCoords(l){
 const r=l.raw,p=TT.pats[r.pi],Q=shapeQ(r.pi),ds=Q&&stopDs(r.pi);
 if(!Q||!ds||ds[r.i1]<=ds[r.i0])return p.s.slice(r.i0,r.i1+1).map(stopLL);
 return sub(Q,ds[r.i0],ds[r.i1]);
}
/* walks follow the streets (walk.js); until the shape is known (a few ms) the straight line stands in */
const WGEO=new Map();let walkRedraw=0;
function walkCoords(l){
 const r=l.raw,a=r.from||stopLL(r.fromStop),b=r.to||stopLL(r.toStop),k=a.join()+'|'+b.join();
 const g=WGEO.get(k);if(g)return g;
 if(!WGEO.has(k)){WGEO.set(k,null);WALK.path(a,b,r.fromStop??null,r.toStop??null).then(c=>{
  if(!c||c.length<2)return;c[0]=a;c[c.length-1]=b;WGEO.set(k,c);if(WGEO.size>400)WGEO.delete(WGEO.keys().next().value);
  clearTimeout(walkRedraw);walkRedraw=setTimeout(redrawWalks,60)}).catch(()=>{})}
 return[a,b];
}
// when walk shapes arrive: the drawn route again (after its reveal animation), and its labels
function redrawWalks(){
 if(!map||(state.view!=='results'&&state.view!=='route')||!ROUTES[state.sel])return;
 if(revealing){walkRedraw=setTimeout(redrawWalks,200);return}
 drawRoutes(curList(),state.sel,false);if(state.view==='route')labels(ROUTES[state.sel]);
}
function legCoords(l){return l.raw.m==='ride'?rideCoords(l):walkCoords(l)}

/* turn a planner journey into what the cards show */
const VERB={walk:'Kõnni',jog:'Sörgi',run:'Jookse'};
let JN=0;
function viewJ(j,ctx){
 const legs=[];let fastM=0,fastL=null;
 j.legs.forEach((r,i)=>{
  const prev=legs[legs.length-1];
  if(r.m==='ride'){
   const p=TT.pats[r.pi],ln=TT.routes[p.r];
   if(prev&&prev.b<r.a-.4)legs.push({m:'wait',a:prev.b,b:r.a,raw:{m:'wait'}});
   legs.push({m:ln[1],n:ln[0],a:r.a,b:r.b,from:stopName(r.fromStop),at:stopName(r.toStop),dir:p.h,stops:r.i1-r.i0,raw:r,live:liveOf(r,ctx)});
  }else{
   const to=r.toStop!=null?stopName(r.toStop):null,fr=r.fromStop!=null?stopName(r.fromStop):null;
   const t=r.eg?`${VERB.walk} sihtkohta`:fr&&fr===to?'Mine teise peatusse':`${VERB[r.m]||VERB.walk} ${to} peatusse`;
   const dm=r.b-r.a;
   const L={m:r.m,a:r.a,b:r.b,t,s:`${Math.max(1,Math.round(dm))} min · ${fmtM(r.d)}`,d:r.d,raw:r,to};
   if(r.m==='jog'||r.m==='run'){fastM+=r.d;if(!fastL||r.d>fastL.d)fastL=L;L.alt=`kõndides ${Math.max(1,Math.round(r.d/(state.pace.walk/3.6*60)))} min`}
   if(dm>0.2||r.eg||i===0)legs.push(L);
  }
 });
 const R={id:'j'+(++JN),dep:j.dep,arr:j.arr,legs,j,plan:!!ctx.plan,sig:j.legs.filter(l=>l.m==='ride').map(l=>l.key+'@'+l.i0).join('|')};
 const last=[...j.legs].reverse().find(l=>l.m==='ride');
 if(!ctx.plan&&last&&Math.abs(last.delay)>=1)R.ghost=j.arr-last.delay;
 if(fastL){R.run=fastL.m==='run'||legs.some(l=>l.m==='run')?'run':'jog';R.fastM=fastM;R.runNote=`${R.run==='run'?'Jooksed':'Sörgid'} ${fmtM(fastM)}${fastL.raw.fromStop!=null?' peatuste vahel':''}`;R.fastL=fastL}
 return R;
}
function liveOf(r,ctx){
 if(ctx.plan)return{st:'tt'};
 const known=DELAYS.has(r.key),d=r.delay||0;
 if(!known)return r.a-ctx.now>60?{st:'tt'}:{st:'tt0'};
 if(d>=1)return{st:'late',delay:Math.round(d),sched:hm(r.sched),clock:hm(r.a)};
 if(d<=-1)return{st:'early',delay:Math.round(-d),sched:hm(r.sched),clock:hm(r.a)};
 const w=r.a-ctx.now;return{st:'ok',txt:w<1?'väljub kohe':`tuleb ${mins(w)} min pärast`,clock:hm(r.a)};
}

/* what the Jõua kiiremini card says about the fast leg */
function runCard(R,best){
 const L=R.fastL,next=R.legs[R.legs.indexOf(L)+1]||R.legs[R.legs.indexOf(L)+2],ride=R.legs.slice(R.legs.indexOf(L)).find(l=>l.raw.m==='ride');
 if(!ride)return null;
 const nm=`${MODE[ride.m]} ${ride.n}`,lv=ride.live,late=lv&&lv.st==='late'?` hilineb ${lv.delay} min ja`:'';
 const arriveAt=hm(L.b),go=hm(ride.a);
 let why=`<b>${nm}</b>${late} väljub ${ride.from} peatusest ${go}. ${L.m==='jog'?'Sörkides':'Joostes'} oled peatuses ${arriveAt}`;
 if(L.m==='jog')why+=', joosta pole vaja.';else why+=L.raw.jogAt&&L.raw.jogAt>ride.a-.5?'. Sörkides jääksid maha.':'.';
 if(L.raw.walkAt)why+=` Kõndides jõuaksid ${hm(L.raw.walkAt)} ja jääksid maha.`;
 const gain=best?Math.round(best-R.arr):0;
 why+=` Kohal ${hm(R.arr)}${gain>=1?`, <b>${gain} min varem</b>`:''}.`;
 return{big:`${VERB[L.m]} ${fmtM(L.d)}`,rs:L.m==='jog'?`Rahulik sörk · ${Math.max(1,Math.round(L.b-L.a))} min ${L.to||''} peatusse`:`Kiirelt joostes · ${L.raw.fromStop!=null?'peatusest peatusse, ':''}${Math.max(1,Math.round(L.b-L.a))} min`,rf:why};
}

const state={view:'home',run:false,sel:null,when:{k:'now',day:0,t:17*60+30},theme:document.documentElement.dataset.theme,V:330,back:'home',
 themePref:['light','dark'].includes(LS.get('buss-theme'))?LS.get('buss-theme'):'auto',
 glass:!document.documentElement.classList.contains('noglass'),
 regTown:LS.get('buss-reg')==='1', // county buses between two Tallinn stops: off unless turned on
 pace:(()=>{const d={walk:5.5,jog:9,run:12,max:750,bw:1,bf:1};try{const x=JSON.parse(LS.get('buss-pace'));if(x&&x.jog&&x.run)return{...d,...x}}catch(e){}return d})(),
 me:null,from:null,to:null,list:[],best:null,walk:null,busy:false};
/* favourites and recent places live on the device: {n name, ic icon, p place name, a address, ll [lon,lat]} */
const loadJ=(k,d)=>{try{const x=JSON.parse(LS.get(k));return Array.isArray(x)?x:d}catch(e){return d}};
const FAVS=loadJ('buss-favs',[]);
const RECENT=loadJ('buss-recent',[]);
const saveFavs=()=>LS.set('buss-favs',JSON.stringify(FAVS)),saveRecent=()=>LS.set('buss-recent',JSON.stringify(RECENT.slice(0,8)));
const ROUTES={};

/* ================= map ================= */
const MAPC={
 light:{bg:'#EDF0F4',park:'#DCEADD',wood:'#D3E5D4',water:'#B5D2EC',res:'#E8EBF0',bld:'#DFE3E9',bldL:'#D2D7DF',minor:'#FFFFFF',major:'#FFFFFF',casing:'#D3D9E1',path:'#E2E6EC',rail:'#C3CAD4',railD:'#F2F4F7',label:'#5A6472',strong:'#1E252E',halo:'rgba(237,240,244,.9)',wl:'#3D6C99',aero:'#E4E8EE'},
 dark:{bg:'#0E1217',park:'#12201A',wood:'#13231B',water:'#0A1E30',res:'#11161C',bld:'#181E26',bldL:'#212833',minor:'#1D242D',major:'#28303B',casing:'#0A0D11',path:'#19202A',rail:'#2B3340',railD:'#0E1217',label:'#8792A2',strong:'#D3DAE4',halo:'rgba(14,18,23,.9)',wl:'#5E8CB6',aero:'#19202A'}
};
function rules(id,type){
 const r=[];const c=k=>({k});
 if(type==='background')r.push(['background-color','bg']);
 else if(id==='park')r.push(['fill-color','park']);
 else if(id==='landcover_wood')r.push(['fill-color','wood']);
 else if(id==='water')r.push(['fill-color','water']);
 else if(id.startsWith('landuse')||id.startsWith('landcover'))r.push(['fill-color','res']);
 else if(id==='waterway')r.push(['line-color','water']);
 else if(id==='building'){r.push(['fill-color','bld']);r.push(['fill-outline-color','bldL'])}
 else if(/casing/.test(id))r.push(['line-color','casing']);
 else if(/inner/.test(id))r.push(['line-color','major']);
 else if(id==='highway_minor')r.push(['line-color','minor']);
 else if(id==='highway_path')r.push(['line-color','path']);
 else if(/subtle/.test(id))r.push(['line-color','casing']);
 else if(id.startsWith('aeroway'))r.push([type==='fill'?'fill-color':'line-color','aero']);
 else if(id.startsWith('road_'))r.push([type==='fill'?'fill-color':'line-color','bg']);
 else if(/dashline/.test(id))r.push(['line-color','railD']);
 else if(id.startsWith('railway'))r.push(['line-color','rail']);
 else if(id.startsWith('boundary'))r.push(['line-color','casing']);
 else if(type==='symbol'){r.push(['text-color',/water/.test(id)?'wl':/label_(city|town|village)/.test(id)?'strong':'label']);r.push(['text-halo-color','halo'])}
 return r;
}
function patchStyle(style,theme){
 const C=MAPC[theme];
 style.layers=style.layers.filter(l=>!/^boundary|shield|label_country|label_state/.test(l.id));
 for(const l of style.layers){l.paint=l.paint||{};for(const [p,k] of rules(l.id,l.type))l.paint[p]=C[k];if(l.type==='symbol'&&l.layout&&JSON.stringify(l.layout['text-field']||'').includes('name'))l.layout['text-field']=['coalesce',['get','name:et'],['get','name']]}
 return style;
}
function recolorMap(theme){
 const C=MAPC[theme];
 for(const l of map.getStyle().layers){if(l.id.startsWith('rt-')||l.id.startsWith('gh-'))continue;for(const [p,k] of rules(l.id,l.type)){try{map.setPaintProperty(l.id,p,C[k])}catch(e){}}}
}
function fallbackStyle(theme){
 const v=theme==='dark'?'dark_all':'light_all';
 return{version:8,sources:{c:{type:'raster',tiles:['a','b','c'].map(s=>`https://${s}.basemaps.cartocdn.com/${v}/{z}/{x}/{y}@2x.png`),tileSize:256,attribution:'© OpenStreetMap © CARTO'}},layers:[{id:'background',type:'background',paint:{'background-color':MAPC[theme].bg}},{id:'c',type:'raster',source:'c'}]};
}
let map,firstSym;
async function initMap(){
 let style;
 try{const r=await fetch('https://tiles.openfreemap.org/styles/positron');if(!r.ok)throw 0;style=patchStyle(await r.json(),state.theme)}catch(e){style=fallbackStyle(state.theme)}
 if(!style.glyphs)style.glyphs='https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
 map=new maplibregl.Map({container:'map',style,center:state.me||DEF_LL,zoom:isDesk()?14.6:14.9,attributionControl:false,dragRotate:false,pitchWithRotate:false,maxZoom:18,minZoom:10});
 map.touchZoomRotate.disableRotation();
 if(isDesk())map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
 map.on('error',e=>{console.warn('map',e&&e.error&&e.error.message)});
 map.on('dragstart',e=>{if(e.originalEvent)setFollow(false)});
 map.on('load',()=>{
  firstSym=(map.getStyle().layers.find(l=>l.type==='symbol')||{}).id;
  addLayers();addVehLayers();meMarker();renderFavPins();
  $('#map').classList.add('ready');$('#maploading').classList.add('gone');
  go(state.view,{instant:true});
  map.on('moveend',()=>{if(LBL.length)schedPlace(60)});
  map.on('click','veh-c',e=>{const f=e.features&&e.features[0];if(f)vehPopup(VEHS.find(v=>v.id===f.properties.id))});
  map.on('mouseenter','veh-c',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','veh-c',()=>map.getCanvas().style.cursor='');
  requestAnimationFrame(tick);pollVeh();
 });
}
function addVehLayers(){
 map.addSource('veh',{type:'geojson',data:EMPTY});
 const big=['==',['get','key'],1],dim=['==',['get','dim'],1];
 map.addLayer({id:'veh-c',type:'circle',source:'veh',paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,['case',dim,2.5,4],14,['case',dim,5,9],17,['case',dim,7,12]],'circle-color':['get','col'],'circle-opacity':['case',dim,.45,1],'circle-stroke-color':css('--ring'),'circle-stroke-width':['case',dim,1,1.6],'circle-stroke-opacity':['case',dim,.5,1]},filter:['!',big]});
 map.addLayer({id:'veh-t',type:'symbol',source:'veh',minzoom:13.2,filter:['all',['!',big],['!',dim]],layout:{'text-field':['get','n'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],13,8,17,11],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#fff'}});
}

/* ---- draw journeys, the selected one highlighted, with a reveal ---- */
let reveal=null,revealing=false;
function drawRoutes(ids,sel,animate){
 const feats=[],stops=[];
 for(const id of ids){
  const R=ROUTES[id];if(!R)continue;const isSel=id===sel?1:0;
  for(const l of R.legs){
   if(l.m==='wait')continue;
   const k=['walk','run','jog'].includes(l.m)?l.m:'veh';
   if(!isSel&&k!=='veh')continue;
   const cc=legCoords(l);
   feats.push({type:'Feature',properties:{sel:isSel,k,col:col(l.m)},geometry:{type:'LineString',coordinates:cc}});
   if(isSel&&k==='veh'){
    stops.push(pt(cc[0],col(l.m),1),pt(cc[cc.length-1],col(l.m),1));
    const p=TT.pats[l.raw.pi];for(let i=l.raw.i0+1;i<l.raw.i1;i++)stops.push(pt(stopLL(p.s[i]),col(l.m),0));
   }
  }
 }
 const fc={type:'FeatureCollection',features:feats};
 map.getSource('rstops').setData({type:'FeatureCollection',features:animate&&!RM?[]:stops});
 if(!animate||RM){cancelAnimationFrame(reveal);revealing=false;map.getSource('rt').setData(fc);return}
 const selF=feats.filter(f=>f.properties.sel),other=feats.filter(f=>!f.properties.sel);
 const lens=selF.map(f=>prep(f.geometry.coordinates));const tot=lens.reduce((a,q)=>a+q.L,0)||1;
 const t0=performance.now(),dur=1100;cancelAnimationFrame(reveal);
 const step=now=>{
  const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);let left=e*tot;const out=[...other];
  selF.forEach((f,i)=>{if(left<=0)return;const Q=lens[i];const d=Math.min(Q.L,left);left-=Q.L;if(d>1)out.push({...f,geometry:{type:'LineString',coordinates:sub(Q,0,d)}})});
  map.getSource('rt').setData({type:'FeatureCollection',features:out});
  if(p<1)reveal=requestAnimationFrame(step);else{revealing=false;map.getSource('rstops').setData({type:'FeatureCollection',features:stops})}
 };
 revealing=true;reveal=requestAnimationFrame(step);
}
const pt=(c,colr,big)=>({type:'Feature',properties:{col:colr,big},geometry:{type:'Point',coordinates:c}});

const EMPTY={type:'FeatureCollection',features:[]};
function addLayers(){
 map.addSource('rt',{type:'geojson',data:EMPTY});
 map.addSource('rstops',{type:'geojson',data:EMPTY});
 map.addSource('gh',{type:'geojson',data:EMPTY});
 const W=(a,b)=>['interpolate',['linear'],['zoom'],12,a,16,b];
 const lay=(o)=>map.addLayer(o,firstSym);
 lay({id:'rt-alt',type:'line',source:'rt',filter:['all',['==',['get','sel'],0],['==',['get','k'],'veh']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(2.5,5),'line-opacity':.42}});
 lay({id:'rt-ap',type:'line',source:'rt',filter:['==',['get','k'],'ap'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(2,4),'line-opacity':.38}});
 lay({id:'rt-case',type:'line',source:'rt',filter:['all',['==',['get','sel'],1],['in',['get','k'],['literal',['veh','run','jog']]]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':css('--ring'),'line-width':W(7,13)}});
 lay({id:'rt-veh',type:'line',source:'rt',filter:['all',['==',['get','sel'],1],['==',['get','k'],'veh']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(4,8)}});
 lay({id:'rt-walk',type:'line',source:'rt',filter:['all',['==',['get','sel'],1],['==',['get','k'],'walk']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(4,6.5),'line-dasharray':[0,1.8]}});
 lay({id:'rt-run',type:'line',source:'rt',filter:['all',['==',['get','sel'],1],['==',['get','k'],'run']],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(4,8),'line-dasharray':[0,4,3]}});
 lay({id:'rt-jog',type:'line',source:'rt',filter:['all',['==',['get','sel'],1],['==',['get','k'],'jog']],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':['get','col'],'line-width':W(4,7.5),'line-dasharray':[1.5,1.1]}});
 map.addLayer({id:'rt-stops',type:'circle',source:'rstops',paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,['case',['==',['get','big'],1],4,2.4],16,['case',['==',['get','big'],1],7.5,4.2]],'circle-color':css('--ring'),'circle-stroke-color':['get','col'],'circle-stroke-width':['case',['==',['get','big'],1],3,2]}});
 map.addLayer({id:'gh-line',type:'line',source:'gh',layout:{'line-cap':'round'},paint:{'line-color':['get','col'],'line-width':2.4,'line-dasharray':[1.2,1.6],'line-opacity':.85}});
}
function col(mode){return css('--'+(mode==='wait'?'walk':mode))}
function clearRoutes(){cancelAnimationFrame(reveal);revealing=false;map.getSource('rt').setData(EMPTY);map.getSource('rstops').setData(EMPTY);map.getSource('gh').setData(EMPTY)}
/* ---- camera ---- */
function pad(){
 if(isDesk())return state.view==='route'?{top:110,bottom:120,left:16+420+90,right:200}:{top:96,bottom:80,left:16+420+70,right:120};
 const top=state.view==='home'?84:116;
 return{top,bottom:Math.min(state.V,innerHeight*.62)+28,left:44,right:52};
}
function bboxOf(coords){let a=[180,90,-180,-90];for(const c of coords){a[0]=Math.min(a[0],c[0]);a[1]=Math.min(a[1],c[1]);a[2]=Math.max(a[2],c[0]);a[3]=Math.max(a[3],c[1])}return[[a[0],a[1]],[a[2],a[3]]]}
function fitRoute(ids,instant){
 const cs=[fromLL(),state.to.ll];
 for(const id of ids){const R=ROUTES[id];if(R)for(const l of R.legs)if(l.m!=='wait')cs.push(...legCoords(l))}
 if(ids.length===1)for(const v of KEYV)if(v.ll)cs.push(v.ll);
 fitTo(bboxOf(cs),15.6,instant);
}

// own fit: MapLibre adds fitBounds padding on top of the map's current padding, so compute the camera here
function fitTo(bb,maxZ,instant,ex){
 const p=pad();if(ex)for(const k in ex)p[k]+=ex[k];const a=map.project(bb[0]),b=map.project(bb[1]),el=map.getContainer();
 const dx=Math.abs(b.x-a.x)||1,dy=Math.abs(b.y-a.y)||1,w=el.clientWidth-p.left-p.right,h=el.clientHeight-p.top-p.bottom;
 const z=Math.min(maxZ,map.getZoom()+Math.log2(Math.min(w/dx,h/dy)));
 map.easeTo({center:map.unproject([(a.x+b.x)/2,(a.y+b.y)/2]),zoom:z,padding:p,duration:instant||RM?0:1100});
}
function homeCam(instant){
 if(!map)return;const c=state.me||DEF_LL,lim=isDesk()?4500:2000,pts=[c,...FAVS.filter(f=>f.ll&&m(f.ll,c)<lim).map(f=>f.ll)];
 if(pts.length<2){map.easeTo({center:c,zoom:isDesk()?14.6:15.2,padding:pad(),duration:instant||RM?0:900});return}
 fitTo(bboxOf(pts),isDesk()?14.6:14.9,instant,{top:44,left:30,right:30});
}

let FAVM=[];
function renderFavPins(){
 if(!map)return;FAVM.forEach(x=>x.remove());FAVM=[];
 FAVS.forEach(f=>{if(!f.ll)return;const el=h(`<div class="fpw"><button class="fpin" aria-label="${esc(f.n)}, ${esc(f.a)}. Näita teed"><span class="fi">${I[f.ic]}</span>${esc(f.n)}</button><i class="fdot"></i></div>`);
  el.querySelector('.fpin').onclick=e=>{e.stopPropagation();pick(favPlace(f))};FAVM.push(mk(el,f.ll,'bottom',[0,5]))});
}

/* ---- markers: you, destination, labels ---- */
let tempMarkers=[];
function mk(el,ll,anchor='center',offset=[0,0]){const mm=new maplibregl.Marker({element:el,anchor,offset}).setLngLat(ll).addTo(map);return mm}
function h(html){const d=document.createElement('div');d.innerHTML=html.trim();return d.firstChild}
function clearTemp(){tempMarkers.forEach(x=>x.remove());tempMarkers=[]}
let LBL=[],plT=0;
const PL={e:g=>`translate(${g}px,-50%)`,w:g=>`translate(calc(-100% - ${g}px),-50%)`,n:g=>`translate(-50%,calc(-100% - ${g}px))`,s:g=>`translate(-50%,${g}px)`,
 ne:g=>`translate(${g*.7}px,calc(-100% - ${g*.7}px))`,nw:g=>`translate(calc(-100% - ${g*.7}px),calc(-100% - ${g*.7}px))`,se:g=>`translate(${g*.7}px,${g*.7}px)`,sw:g=>`translate(calc(-100% - ${g*.7}px),${g*.7}px)`};
function lbl(html,ll,cands,gap){
 const w=document.createElement('div');w.className='lw';const el=h(html);el.classList.add('lb');w.appendChild(el);
 const o={el,w,cands,gap,p:cands[0]};el.style.transform=PL[o.p](gap);
 tempMarkers.push(mk(w,ll));LBL.push(o);return o;
}
function labels(R){
 clearTemp();LBL=[];if(!R)return;
 tempMarkers.push(mk(h('<div class="dpin"></div>'),state.to.ll));
 const fv=favOf(state.to);
 lbl(`<div class="dtag">${fv?`<span class="dfi">${I[fv.ic]}</span>${esc(fv.n)}`:esc(state.to.n)} <b>${hm(R.arr)}</b></div>`,state.to.ll,['w','sw','nw','s','n','e','se','ne'],14);
 const first=R.legs.find(x=>x.from);
 for(const l of R.legs){
  if(l.m==='run'||l.m==='jog'){const Q=prep(legCoords(l));lbl(`<div class="runtag ${l.m}">${I[l.m]}${VERB[l.m]} ${fmtM(l.d)} · ${Math.max(1,Math.round(l.b-l.a))} min</div>`,at(Q,Q.L*.45).ll,['e','w','ne','nw','se','sw','n','s'],16)}
 }
 for(const l of R.legs){
  if(l.from){const xfer=l!==first;
   lbl(`<div class="slab ${xfer?'xfer':''}" style="--c:${col(l.m)}"><i></i>${esc(l.from)}${xfer?' · ümberistumine':''}</div>`,legCoords(l)[0],xfer?['sw','nw','se','ne','w','e','s','n']:['n','nw','ne','w','e','s'],10);
  }
 }
 schedPlace(RM?60:1250);
}

/* label placement: each label takes the first side that is free of other labels and the floating UI */
function rr(el,m){const r=el.getBoundingClientRect();return{l:r.left-m,t:r.top-m,r:r.right+m,b:r.bottom+m}}
function ov(a,b){const x=Math.min(a.r,b.r)-Math.max(a.l,b.l),y=Math.min(a.b,b.b)-Math.max(a.t,b.t);return x>0&&y>0?x*y:0}
function shown(e){const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;for(let x=e;x&&x!==document.body;x=x.parentElement){const c=getComputedStyle(x);if(c.display==='none'||c.visibility==='hidden'||+c.opacity<.05)return false}return true}
function blockers(){
 const o=[];$$('.searchpill,.fromto,.setbtn,.fab,.zoom,#sheet,#dpop,.dpin,.me').forEach(e=>{if(shown(e))o.push(rr(e,4))});
 const c=map.getContainer().getBoundingClientRect();o.view={l:c.left+6,t:c.top+6,r:c.right-6,b:c.bottom-6};return o;
}
function cost(r,occ){const V=occ.view;let s=0;
 const out=Math.max(0,V.l-r.l)+Math.max(0,r.r-V.r)+Math.max(0,V.t-r.t)+Math.max(0,r.b-V.b);if(out)s+=1e5+out*100;
 for(const q of occ)s+=ov(r,q);return s}
function choose(cands,cur,set,meas,occ){
 const order=cur&&cands.includes(cur)?[cur,...cands.filter(c=>c!==cur)]:cands;
 let best=order[0],bs=Infinity;
 for(const c of order){set(c);const s=cost(meas(),occ);if(s===0)return[c,0];if(s<bs){bs=s;best=c}}
 set(best);return[best,bs];
}
function schedPlace(ms){clearTimeout(plT);plT=setTimeout(placeAll,ms)}
/* every combination of sides is tried (at most ~5 labels), lowest overlap wins; earlier sides in each list are preferred */
function rectAt(x,y,w,h,c,g){const k=g*.7,M=4;let l,t;
 if(c==='e'){l=x+g;t=y-h/2}else if(c==='w'){l=x-g-w;t=y-h/2}else if(c==='n'){l=x-w/2;t=y-g-h}else if(c==='s'){l=x-w/2;t=y+g}
 else{l=c[1]==='e'?x+k:x-k-w;t=c[0]==='n'?y-k-h:y+k}
 return{l:l-M,t:t-M,r:l+w+M,b:t+h+M}}
function placeAll(){
 if(!map)return;const occ=blockers();
 const L=LBL.map(o=>{const a=o.w.getBoundingClientRect(),r=o.el.getBoundingClientRect();
  const opts=o.cands.map((c,i)=>{const R=rectAt(a.left,a.top,r.width,r.height,c,o.gap);return{c,R,base:cost(R,occ)+i*25}}).sort((x,y)=>x.base-y.base);
  return{o,opts}});
 let best=null,bestC=Infinity;const pick=[];
 (function dfs(i,acc){
  if(acc>=bestC)return;
  if(i===L.length){bestC=acc;best=pick.slice();return}
  for(const op of L[i].opts){let c=acc+op.base;for(let j=0;j<i&&c<bestC;j++)c+=ov(op.R,pick[j].R)*2;
   if(c<bestC){pick[i]=op;dfs(i+1,c)}}
 })(0,0);
 L.forEach((x,i)=>{const op=best?best[i]:x.opts[0];x.o.p=op.c;x.o.el.style.transform=PL[op.c](x.o.gap);occ.push(op.R);x.o.w.classList.add('on')});
 placeTags(occ);
}
/* ================= live vehicles (gps.txt every 5 s) ================= */
let tagOcc=null,lastTag=0;
let VEHS=[],KEYV=[],vehT=0,lastPoll=0;
/* ===== moving vehicles =====
   gps.txt changes only every 5-10 s and has no speed. Each vehicle is matched to its line's shape (by the feed's
   bearing), its speed comes from its last two fixes, and between fixes it drives on along the road at that speed,
   a few seconds ahead to make up for the feed's delay. It waits at the next stop until a fix shows it went past,
   new fixes are eased in (never backwards unless far off). Off its shape: straight-line guess. Less motion: raw fixes. */
const MOV=new Map(),LAG=3,HORIZ=14;
let PATS_BY=null;
function patsFor(mode,name){if(!PATS_BY){PATS_BY=new Map();TT.pats.forEach((p,pi)=>{const r=TT.routes[p.r],k=r[1]+'|'+r[0];if(!PATS_BY.has(k))PATS_BY.set(k,[]);PATS_BY.get(k).push(pi)})}return PATS_BY.get(mode+'|'+name)||[]}
function projQ(Q,ll){let best=1e18,bd=0;for(let i=1;i<Q.p.length;i++){const a=Q.p[i-1],b=Q.p[i],ax=(a[0]-ll[0])*KX,ay=(a[1]-ll[1])*KY,dx=(b[0]-a[0])*KX,dy=(b[1]-a[1])*KY,L2=dx*dx+dy*dy;let t=L2?-(ax*dx+ay*dy)/L2:0;t=t<0?0:t>1?1:t;const px=ax+dx*t,py=ay+dy*t,o=px*px+py*py;if(o<best){best=o;bd=Q.c[i-1]+(Q.c[i]-Q.c[i-1])*t}}return{d:bd,off:Math.sqrt(best)}}
const angD=(a,b)=>Math.abs(((a-b)%360+540)%360-180);
function matchShape(o,prev){
 if(!TT||!SHAPES)return null;let best=null;
 for(const pi of patsFor(o.mode,o.route)){const Q=shapeQ(pi);if(!Q)continue;const p=projQ(Q,o.ll);if(p.off>45)continue;
  let sc=p.off;if(Number.isFinite(o.brg)){const a=angD(at(Q,p.d).brg,o.brg);sc+=a>100?90:a/3}
  if(prev&&prev.pi===pi&&p.d>=prev.fd-30)sc-=15;
  if(!best||sc<best.sc)best={pi,Q,d:p.d,sc}}
 return best;
}
function nextStop(s){const ds=stopDs(s.pi);if(!ds)return s.Q.L;for(const x of ds)if(x>s.fd+15)return x;return s.Q.L}
function onFix(o,now){
 let s=MOV.get(o.id);const raw=o.ll[0]+','+o.ll[1];
 if(s&&s.raw===raw)return;
 const mt=matchShape(o,s);
 if(!s){s={ft:now,v:0,ll:o.ll.slice(),fx:o.ll,lt:now};MOV.set(o.id,s);if(mt){s.pi=mt.pi;s.Q=mt.Q;s.d=s.fd=mt.d;s.ll=at(mt.Q,mt.d).ll;s.cap=nextStop(s)}s.raw=raw;return}
 const dt=Math.max(1,(now-s.ft)/1000);
 if(mt&&s.Q&&s.pi===mt.pi){const v=mt.d<s.fd?0:Math.min(22,(mt.d-s.fd)/dt);s.v=s.v?s.v*.4+v*.6:v;s.fd=mt.d;if(s.d<mt.d-150||s.d>mt.d+150)s.d=mt.d}
 else if(mt){s.pi=mt.pi;s.Q=mt.Q;s.fd=mt.d;s.d=mt.d;s.v=Math.min(22,m(s.fx,o.ll)/dt)*.8}
 else{s.pi=null;s.Q=null;s.v=Math.min(22,m(s.fx,o.ll)/dt);s.vx=(o.ll[0]-s.fx[0])/dt;s.vy=(o.ll[1]-s.fx[1])/dt;if(s.v<.5)s.vx=s.vy=0}
 if(s.Q)s.cap=nextStop(s);
 s.ft=now;s.fx=o.ll;s.raw=raw;
}
function movPos(id,now,raw){
 const s=MOV.get(id);if(!s||RM)return raw;
 const age=Math.min((now-s.ft)/1000+LAG,HORIZ),dtf=Math.min(1,Math.max(0,now-s.lt)/1000),k=1-Math.exp(-dtf/.6);s.lt=now;
 if(s.Q){
  const target=Math.min(s.cap??s.Q.L,s.fd+s.v*age);
  if(target>s.d)s.d+=(target-s.d)*k;else if(s.d-target>40)s.d-=Math.min(s.d-target,4*dtf);
  const a=at(s.Q,s.d);s.ll=a.ll;s.brg=a.brg;return s.ll}
 const t=Math.min(age,8),tx=s.fx[0]+(s.vx||0)*t,ty=s.fx[1]+(s.vy||0)*t;
 s.ll=[s.ll[0]+(tx-s.ll[0])*k,s.ll[1]+(ty-s.ll[1])*k];return s.ll;
}
async function pollVeh(){
 clearTimeout(vehT);
 if(document.hidden){vehT=setTimeout(pollVeh,3000);return}
 try{
  const v=await vehicles();const now=performance.now(),seen=new Set();
  for(const o of v){onFix(o,now);seen.add(o.id)}
  for(const id of MOV.keys())if(!seen.has(id))MOV.delete(id);
  VEHS=v;lastPoll=Date.now();keyVehicles();
 }catch(e){}
 vehT=setTimeout(pollVeh,3000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastPoll>3000)pollVeh()});

/* the vehicles of the chosen route: the one coming to your stop, with its delay; and where the timetable says it should be */
function keyVehicles(){
 for(const k of KEYV)k.mk&&k.mk.remove(),k.gk&&k.gk.remove();KEYV=[];
 const R=(state.view==='route'||state.view==='results')&&ROUTES[state.sel];if(!R||R.plan||!map)return;
 const now=clock().min;let ord=0;
 for(const l of R.legs){
  if(!l.raw||l.raw.m!=='ride'||l.a-now>45)continue;
  const Q=shapeQ(l.raw.pi),ds=stopDs(l.raw.pi);if(!Q||!ds)continue;
  const dB=ds[l.raw.i0];let best=null,bd=-1;
  for(const v of VEHS){if(v.route!==l.n||v.mode!==l.m)continue;const d=nearD(Q,v.ll),off=m(at(Q,d).ll,v.ll);if(off>60||d>dB+40)continue;if(d>bd){bd=d;best=v}}
  const lv=l.live||{},late=lv.st==='late';
  const tag=lv.st==='late'?`<span class="st-late">hilineb ${lv.delay} min</span>`:lv.st==='early'?`<span class="st-early">${lv.delay} min varem</span>`:l.a-now<1?'väljub kohe':`tuleb ${mins(l.a-now)} min`;
  const o={leg:l,v:best,ord:ord++};
  if(best){
   const el=h(`<div class="veh ${l.m} key showtag"><span class="bk"></span><span class="dot">${esc(l.n)}</span><span class="vt">${tag}</span></div>`);
   el.style.setProperty('--b',best.brg+'deg');el.addEventListener('click',e=>{e.stopPropagation();vehPopup(best,l)});
   o.mk=mk(el,best.ll);o.el=el;o.ll=best.ll;o.d=bd;
  }
  // timetable ghost: where this trip would be with no delay
  if(late&&best){
   const tr=tripOf(l.raw);if(tr){const gd=schedD(l.raw.pi,tr,now);if(gd!=null&&Math.abs(gd-bd)>40){const el=h(`<div class="veh ${l.m} ghost showtag"><span class="bk"></span><span class="dot">${esc(l.n)}</span><span class="vt">graafik</span></div>`);o.gk=mk(el,at(Q,gd).ll);o.gd=gd;o.gel=el}}
  }
  KEYV.push(o);
 }
 ghostLines();
 const ids=new Set(KEYV.filter(k=>k.v).map(k=>k.v.id));VEHSKIP=ids;
}
let VEHSKIP=new Set();
function tripOf(r){const[pi,ti,off]=r.key.split(':').map(Number);const t=TT.pats[pi].t[ti];return t?{t0:t[1]+off,pr:TT.pats[pi].d[t[2]]}:null}
function schedD(pi,tr,now){const ds=stopDs(pi);if(!ds)return null;for(let i=0;i<ds.length-1;i++){const a=tr.t0+tr.pr[i],b=tr.t0+tr.pr[i+1];if(now>=a&&now<b)return ds[i]+(ds[i+1]-ds[i])*(b>a?(now-a)/(b-a):0)}return null}
function ghostLines(){
 if(!map||!map.getSource('gh'))return;const f=[];
 for(const k of KEYV){if(k.gd==null||k.d==null)continue;const Q=shapeQ(k.leg.raw.pi);f.push({type:'Feature',properties:{col:col(k.leg.m)},geometry:{type:'LineString',coordinates:sub(Q,Math.min(k.d,k.gd)+14,Math.max(k.d,k.gd)-14)}})}
 map.getSource('gh').setData({type:'FeatureCollection',features:f});
}
let lastFrame=0;
function tick(now){
 if(now-lastFrame>(RM?4000:66)&&map&&map.getSource('veh')){
  lastFrame=now;
  const focus=(state.view==='route'||state.view==='results')&&ROUTES[state.sel],lines=focus?new Set(ROUTES[state.sel].legs.filter(l=>l.n).map(l=>l.m+l.n)):null;
  const feats=[];
  for(const v of VEHS){if(VEHSKIP.has(v.id))continue;const ll=movPos(v.id,now,v.ll);v.cur=ll;
   feats.push({type:'Feature',properties:{id:v.id,n:v.route,col:col(v.mode),dim:lines&&!lines.has(v.mode+v.route)?1:0,key:0},geometry:{type:'Point',coordinates:ll}})}
  map.getSource('veh').setData({type:'FeatureCollection',features:feats});
  for(const k of KEYV)if(k.mk&&k.v){k.ll=movPos(k.v.id,now,k.v.ll);k.mk.setLngLat(k.ll);const b=MOV.get(k.v.id)?.brg;if(b!=null&&k.el)k.el.style.setProperty('--b',b+'deg')}
  if(now-lastTag>350){lastTag=now;placeTags()}
  runDash(now);
 }
 requestAnimationFrame(tick);
}
const DASH=[[0,4,3],[.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,.5],[3,4,0],[0,.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],[0,3,3,1],[0,3.5,3,.5]];
let dashI=0,lastDash=0;
function runDash(now){const R=ROUTES[state.sel];if(RM||!R||!R.legs.some(l=>l.m==='run')||now-lastDash<60)return;lastDash=now;dashI=(dashI+1)%DASH.length;map.setPaintProperty('rt-run','line-dasharray',DASH[dashI])}
let pop;
function vehPopup(v,leg){
 if(!v||!map)return;if(pop)pop.remove();
 const body=leg&&leg.live?`<div>${liveTxt(leg)}</div>`:'<div>Live-asukoht</div>';
 pop=new maplibregl.Popup({closeButton:false,offset:22,className:'vpop',maxWidth:'280px'}).setLngLat(v.cur||v.ll).setHTML(`<div class="vcard glass solidish"><div class="ln"><span class="lg ${v.mode}">${I[v.mode]}${esc(v.route)}</span>${v.head?'→ '+esc(v.head):MODE[v.mode]}</div>${body}</div>`).addTo(map);
}
function placeTags(base){
 if(base)tagOcc=base;if(!tagOcc)return;
 const occ=tagOcc.slice();occ.view=tagOcc.view;
 const vis=[];for(const k of KEYV){if(k.el)vis.push({el:k.el,ghost:0,ord:k.ord});if(k.gel)vis.push({el:k.gel,ghost:1,ord:k.ord})}
 for(const o of vis)occ.push(rr(o.el.querySelector('.dot'),1));
 vis.sort((a,b)=>a.ghost-b.ghost||a.ord-b.ord);
 for(const o of vis){
  const vt=o.el.querySelector('.vt'),self=rr(o.el.querySelector('.dot'),1);
  const occ2=occ.filter(q=>!(q.l===self.l&&q.t===self.t));occ2.view=occ.view;
  const set=c=>{o.el.dataset.p=c},meas=()=>rr(vt,3);
  const [c,sc]=choose(o.ghost?['w','e','sw','nw','n','s']:['s','n','se','sw','e','w','ne','nw'],o.el.dataset.p,set,meas,occ2);
  if(sc<60){set(c);occ.push(meas())}else o.el.dataset.p='x';
 }
}

/* ================= views ================= */
function liveTxt(l){
 const L=l.live;if(!L)return'';
 const nm=`${MODE[l.m]} ${l.n}`;
 if(L.st==='ok')return`<span>${I.live}${nm} ${L.txt}</span>`;
 if(L.st==='late')return`<span>${I.live}${nm} <span class="st-late">hilineb ${L.delay} min</span></span>`;
 if(L.st==='early')return`<span>${I.live}${nm} <span class="st-early">${L.delay} min varem</span></span>`;
 if(L.st==='tt0')return`<span>${I.clock}${nm} ${hm(l.a)} · live puudub</span>`;
 if(L.st==='tt')return`<span>${I.clock}${nm} ${hm(l.a)} · sõiduplaan</span>`;
 return'';
}
function chips(R){
 return R.legs.filter(l=>l.m!=='wait').map(l=>(l.m==='walk'||l.m==='run'||l.m==='jog')?`<span class="lg ${l.m}">${I[l.m]}${Math.max(1,Math.round(l.b-l.a))}</span>`:`<span class="lg ${l.m}">${I[l.m]}${esc(l.n)}</span>`).join('<span class="gt">›</span>');
}
let AX0=0,AX=44;
const pct=t=>((t-AX0)/AX*100).toFixed(2)+'%';
function strip(R){
 let s='';
 for(const l of R.legs){const w=(l.b-l.a)/AX*100;s+=`<span class="seg ${l.m}" style="left:${pct(l.a)};width:${w.toFixed(2)}%;--c:${col(l.m)}">${(l.n&&w>6)?`<b>${esc(l.n)}</b>`:''}</span>`}
 s+=`<span class="end" style="left:${pct(R.arr)}"></span>`;
 if(R.ghost!=null){const a=Math.min(R.arr,R.ghost),b=Math.max(R.arr,R.ghost);
  s+=`<span class="gl" style="left:calc(${pct(a)} + 5px);width:calc(${((b-a)/AX*100).toFixed(2)}% - 10px)"></span><span class="gd" style="left:${pct(R.ghost)}"></span><span class="gt" style="left:${pct(R.ghost)}">${hm(R.ghost)}</span>`}
 return`<div class="strip" aria-hidden="true">${s}</div>`;
}
const span=R=>`<span class="arr"><span class="t0">${hm(R.dep)}</span><span class="dash">-</span>${hm(R.arr)}</span>`;
const eff=R=>R.run==='jog'?'jog':'run';
const tightTxt=R=>'Buss jõuab veidi varem kui arvestatud. '+(R.tight<1?'Hakka kohe liikuma.':`Hakka liikuma ${R.tight} minuti jooksul.`);
const dur=R=>Math.round(R.arr-R.dep);
const badge=R=>R.badge?`<span class="badge ${R.badge[0]} ${R.run?eff(R):''}">${R.badge[0]==='gain'?I[eff(R)].replace('<svg','<svg width="13" height="13"'):''}${R.badge[1]}</span>`:'';
function routeCard(R,on){
 const lv=R.legs.filter(l=>l.live).slice(0,R.plan?1:2).map(l=>liveTxt(l)).join('');
 const runNote=R.runNote?`<span>${I[eff(R)].replace('<svg',`<svg style="color:var(--${eff(R)})"`)}${R.runNote}</span>`:'';
 const tn=R.tight!=null?`<span class="tnote">${I.warn}${tightTxt(R)}</span>`:'';
 const nt=legNotes(R).slice(0,1).map(([l])=>`<span class="ntl">${I.warn}${MODE[l.m]} ${esc(l.n)}: liiklusteade</span>`).join('');
 return`<div class="route ${on?'on':''}" role="button" tabindex="0" data-id="${R.id}" aria-label="Lahkud ${hm(R.dep)}, kohal ${hm(R.arr)}, ${dur(R)} minutit">
  ${R.badge?`<div class="rb">${badge(R)}</div>`:''}
  <div class="rt">${span(R)}<span class="dur">${dur(R)} min</span></div>
  <div class="legs">${chips(R)}</div>
  ${strip(R)}
  <div class="rlive">${tn}${runNote}${lv}${nt}</div></div>`;
}
const curList=()=>state.list.map(R=>R.id);
function renderResults(loading){
 const W=state.when,L=state.list,best=L[0],late=L.slice().sort((a,b)=>b.dep-a.dep)[0];
 let title=state.run&&W.k==='now'?`${L.length} ${L.length===1?'tee':'teed'}, jooksuga`:`${L.length} ${L.length===1?'tee':'teed'}`,sub=best?`Kiireim kohal ${hm(best.arr)}`:'';
 if(W.k==='arr'&&late)sub=`Lahku hiljemalt ${hm(late.dep)}`;
 if(W.k==='last'){title='Viimane ühendus';if(late)sub=`Viimane väljub ${hm(late.dep)}`}
 if(W.k==='first'){title='Esimene ühendus';if(best)sub=`Esimene kohal ${hm(best.arr)}`}
 $('#resTitle').textContent=loading?'Otsin teid':title;
 $('#resSub').innerHTML=loading?(whenLive()?'Arvutan live-aegadega…':'Arvutan sõiduplaani järgi…'):esc(state.to.n)+(sub?' · '+sub:'');
 if(loading){$('#resBody').innerHTML='<div class="loadbar"><i></i></div>';return}
 const c=clock();
 let out=`<div class="legend"><button class="whenchip" id="whenChip" aria-expanded="false" aria-controls="rWhen">${I.clock}${whenTxt()}<span class="cv">${I.chev}</span></button>${nowBtn()}${W.k==='now'?`<span><i class="l1"></i>live ${hm(c.min)}</span><span><i class="l2"></i>sõiduplaani järgi</span>`:whenLive()?`<span><i class="l1"></i>live</span>`:`<span><i class="l2"></i>kõik sõiduplaani järgi</span>`}</div><div class="when rw" id="rWhen" hidden></div>`;
 if(!L.length){
  out+=`<div class="note">${W.k==='first'||W.k==='last'?'Sel päeval ühendust ei leidnud.':'Ühistranspordiga ei leidnud kiiremat teed kui jalgsi.'} ${state.walk?`Jalgsi ${fmtM(state.walk.m)}, umbes ${mins(state.walk.min)} min.`:''}</div>${ATTR}`;
  $('#resBody').innerHTML=out;bindWhenChip();return;
 }
 AX0=Math.floor(Math.min(...L.map(R=>Math.min(R.dep,R.ghost??R.dep)))/5)*5;
 AX=Math.max(20,Math.ceil((Math.max(...L.map(R=>Math.max(R.arr,R.ghost??0)))-AX0+2)/5)*5);
 const step=AX>90?15:AX>45?10:5;
 const ticks=[];for(let t=Math.ceil(AX0/step)*step,i=0;t<AX0+AX;t+=step,i++)ticks.push(`<span style="left:${pct(t)}">${(isDesk()||i%2===1)?hm(t):''}</span>`);
 out+=`<div class="axis">${ticks.join('')}</div><div class="routes">`;
 L.forEach(R=>{out+=routeCard(R,R.id===state.sel)});
 out+='</div>';
 if(state.walk&&W.k==='now')out+=`<div class="walkline"><span class="lg walk">${I.walk}${mins(state.walk.min)}</span>Kogu tee jalgsi: ${fmtM(state.walk.m)}, kohal ${hm((state.t0?state.t0.min:c.min)+state.walk.min)}</div>`;
 out+=ATTR;
 $('#resBody').innerHTML=out;
 $$('#resBody .route').forEach(el=>{el.onclick=()=>{state.sel=el.dataset.id;go('route')};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}};el.onmouseenter=()=>{if(isDesk()&&state.view==='results')previewRoute(el.dataset.id)}});
 bindWhenChip();
}
function bindWhenChip(){$('#whenChip').onclick=()=>{const p=$('#rWhen');if(p.hidden){p.hidden=false;renderWhen(p,true);$('#whenChip').setAttribute('aria-expanded','true')}else applyResultsWhen()}}
function previewRoute(id){if(state.prev===id||!map)return;state.prev=id;state.sel=id;drawRoutes(curList(),id,false);labels(ROUTES[id]);keyVehicles();$$('#resBody .route').forEach(x=>x.classList.toggle('on',x.dataset.id===id))}
function stepLive(l){
 const L=l.live;if(!L)return'';
 if(L.st==='ok')return`<div class="livebox"><div class="l1">${I.live}${L.txt}</div><div>${L.clock} · graafikus</div></div>`;
 if(L.st==='late'||L.st==='early')return`<div class="livebox plus"><div class="l1">${I.live}${L.clock} ${L.st==='late'?`<span class="st-late">hilineb ${L.delay} min</span>`:`<span class="st-early">${L.delay} min varem</span>`}</div><div>Sõiduplaani järgi ${L.sched}</div></div>`;
 if(L.st==='tt0')return`<div class="livebox"><div class="l1">${I.clock}${hm(l.a)} · sõiduplaani järgi</div><div>Live-aega selle sõidu kohta veel pole.</div></div>`;
 if(L.st==='tt')return`<div class="livebox"><div class="l1">${I.clock}${hm(l.a)} · sõiduplaani järgi</div><div>Live-aeg tuleb ${state.when.k==='now'?'lähemal':'30 min enne väljumist'}.</div></div>`;
 return'';
}
function renderRoute(){
 const R=ROUTES[state.sel];if(!R){go('results');return}
 let s=`${t0Behind()>=1?`<div class="nowrow">Arvutatud kell ${hm(state.t0.min)}${nowBtn()}</div>`:''}<div class="dsum">${span(R)}</div><div class="dmeta"><span class="dur">${dur(R)} min</span>${badge(R)}</div>${ALARM&&ALARM.sig===R.sig?`<button class="alarmbtn on" id="alarmBtn">${I.bell}Teavitan ${hm(alarmLeave()-LEAD)} · tühista</button>`:alarmable(R)?`<button class="alarmbtn" id="alarmBtn">${I.bell}Teavita 5 min enne minekut</button>`:''}<div class="legs">${chips(R)}</div>`;
 if(R.tight!=null)s+=`<div class="tightbox">${I.warn}<span>${tightTxt(R)}</span></div>`;
 if(R.runcard)s+=`<div class="runcard ${eff(R)}"><span class="ri">${I[eff(R)]}</span><span class="big">${R.runcard.big}</span><span class="rs">${R.runcard.rs}</span><div class="rf">${R.runcard.rf}</div></div>`;
 const c=clock();
 s+='<ol class="steps">';
 s+=`<li class="stp stop"><time>${hm(R.dep)}</time><span class="nd"></span><div class="tx"><b>${esc(fromName())}</b><small>${R.plan?`Lahku ${state.when.day?dayLbl(state.when.day,true)+' ':''}${hm(R.dep)}`:R.dep-c.min>1?'Lahku '+hm(R.dep):'Lahku kohe'}</small></div></li>`;
 R.legs.forEach((l,i)=>{
  if(l.m==='wait')return;
  if(l.m==='walk'||l.m==='run'||l.m==='jog'){s+=`<li class="stp leg ${l.m}"><time></time><span class="nd"></span><div class="tx"><div class="ln"><span class="lg ${l.m}">${I[l.m]}${Math.max(1,Math.round(l.b-l.a))}</span>${esc(l.t)}</div><small>${l.s}${l.alt?' · '+l.alt:''}</small></div></li>`}
  else{
   const xf=R.legs.slice(0,i).some(x=>x.from);
   s+=`<li class="stp stop"><time>${hm(l.a)}</time><span class="nd"></span><div class="tx"><b>${esc(l.from)}</b>${xf?'<small>ümberistumine</small>':''}</div></li>`;
   s+=`<li class="stp leg" style="--c:${col(l.m)}"><time></time><span class="nd"></span><div class="tx"><div class="ln"><span class="lg ${l.m}">${I[l.m]}${esc(l.n)}</span>${MODE[l.m]} ${esc(l.n)} → ${esc(l.dir)}</div>${stepLive(l)}${(l.m==='bus'||l.m==='tram'||l.m==='trol')?notesFor(l.m,l.n).map(noteBox).join(''):''}<small>${l.stops} ${l.stops===1?'peatus':'peatust'} · ${Math.round(l.b-l.a)} min · välju: ${esc(l.at)}</small></div></li>`;
   s+=`<li class="stp stop"><time>${hm(l.b)}</time><span class="nd"></span><div class="tx"><b>${esc(l.at)}</b></div></li>`;
  }
 });
 const fv=favOf(state.to);
 s+=`<li class="stp stop end"><time>${hm(R.arr)}</time><span class="nd"></span><div class="tx"><div><b>${esc(state.to.n)}</b><small>${fv?esc(fv.n)+' · ':''}${esc(state.to.s||'')}</small></div>${starBtn(state.to)}</div></li></ol>${ATTR}`;
 $('#routeBody').innerHTML=s;
 $$('#routeBody .starbtn').forEach(b=>b.onclick=()=>openSave(PK.get(b.dataset.star),b));
 const ab=$('#alarmBtn');if(ab)ab.onclick=()=>{if(ALARM&&ALARM.sig===R.sig)clearAlarm();else setAlarm(R)};
}

const ATTR='<div class="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · OpenFreeMap · sõiduandmed transport.tallinn.ee, peatus.ee · aadressid Maa-amet, Photon</div>';

/* ================= home: departures near you ================= */
let nearT=0,NEAR=[];
async function loadNear(force){
 clearTimeout(nearT);nearT=setTimeout(loadNear,20000);
 if(!RT||document.hidden||state.view!=='home')return;
 const c=state.me||DEF_LL,ns=RT.near(c,500).slice(0,10),ymd=clock().ymd;
 if(!ns.length){$('#nearSub').textContent='Lähedal peatusi pole';$('#near').innerHTML='';return}
 const st=ns[0];$('#nearSub').innerHTML=`${esc(stopName(st[0]))} · ${fmtM(st[1]*DETOUR)}${state.me?'':` · <button class="lnk" id="askLoc">luba asukoht</button>`}`;
 const ab=$('#askLoc');if(ab)ab.onclick=()=>locate(true);
 const rows=[];let now=null;
 let tried=0;
 await Promise.all(ns.map(async([s,d])=>{if(!TT.stops.siri[s])return;tried++;try{const r=await siri(TT.stops.siri[s],force?0:20000);now=now??r.now;for(const [k,v] of RT.matchSiri(s,r.rows,ymd))DELAYS.set(k,v);for(const x of r.rows)rows.push({...x,stop:s,d})}catch(e){}}));
 // county buses and trains have no live feed: their timetable times
 const nowS=now??Math.round(clock().min*60),plan=planNear(ns,ymd,nowS);rows.push(...plan);
 if(now==null&&tried&&!plan.length){$('#near').innerHTML='<div class="note">Live-aegu ei saanud. Proovin uuesti.</div>';return}
 now=nowS;
 const seen=new Set();
 NEAR=rows.filter(r=>r.exp>=now-20).sort((a,b)=>a.exp-b.exp).filter(r=>{const k=r.mode+r.route+r.head;if(seen.has(k))return false;seen.add(k);return true}).slice(0,5);
 $('#liveClock').textContent=hm(now/60);
 $('#near').innerHTML=NEAR.length?NEAR.map((d,i)=>{const dl=Math.round((d.exp-d.sched)/60),stt=d.plan?'<span class="st-ok">sõiduplaani järgi</span>':dl>=1?`<span class="st-late">hilineb ${dl} min</span>`:dl<=-1?`<span class="st-early">${-dl} min varem</span>`:'<span class="st-ok">graafikus</span>',mn=Math.max(0,Math.round((d.exp-now)/60));
  return`<button class="dep" data-i="${i}"><span class="lg ${d.mode}">${I[d.mode]||I.bus}${esc(d.route)}</span><span class="to">${esc(d.head)}<small>${notesFor(d.mode,d.route).length?`<span class="ntm">${I.warn}teade</span> · `:''}${MODE[d.mode]||'Buss'} · ${esc(stopName(d.stop))}</small></span><span class="when">${mn?mn+' min':'kohe'}<small>${stt}</small></span></button>`}).join(''):'<div class="note">Lähima tunni jooksul väljumisi pole.</div>';
 $$('#near .dep').forEach(b=>b.onclick=()=>{const d=NEAR[+b.dataset.i],sl=stopLL(d.stop);
  let v=null,bd=1e9;for(const x of VEHS){if(x.route!==d.route||x.mode!==d.mode)continue;const dd=m(x.ll,sl);if(dd<bd){bd=dd;v=x}}
  if(!map)return;const ll=v?(v.cur||v.ll):sl;map.easeTo({center:ll,zoom:15.6,padding:pad(),duration:RM?0:800});if(v)setTimeout(()=>vehPopup(v),RM?0:820)});
}
function planNear(ns,ymd,nowS){
 const day=RT.day(ymd),out=[],R=TT.routes;
 for(const [s,d] of ns)for(const [pi,i] of RT.byStop[s]){const p=TT.pats[pi],r=R[p.r];if(r[1]!=='reg'&&r[1]!=='train'||p.nbS?.has(i)||r[1]==='reg'&&!state.regTown&&RT.town[s])continue;
  for(const tr of day[pi]){const t=(tr.t0+tr.pr[i])*60;if(t<nowS-20)continue;if(t>nowS+3600)break;out.push({mode:r[1],route:r[0],exp:t,sched:t,head:p.h,stop:s,d,plan:1});break}}
 return out;
}
function renderHome(){renderFavChips();renderRecent();loadNear()}
function renderRecent(){
 const L=RECENT.filter(p=>!favOf(p)).slice(0,4);
 $('#recentSect').hidden=!L.length;
 $('#recentChips').innerHTML=L.map((p,i)=>`<button class="chip" data-i="${i}">${I.clock}${esc(p.n)}</button>`).join('');
 $$('#recentChips .chip').forEach(b=>b.onclick=()=>pick(L[+b.dataset.i]));
}
function renderFavChips(){
 const el=$('#favChips');if(!el)return;
 el.innerHTML=FAVS.map((f,i)=>`<button class="chip fc" data-i="${i}">${I[f.ic]}${esc(f.n)}</button>`).join('')+`<button class="chip add" id="favChipAdd" aria-label="Lisa lemmik">${I.plus}${FAVS.length?'':'Lisa lemmik'}</button>`;
 $$('#favChips .fc').forEach(b=>b.onclick=()=>pick(favPlace(FAVS[+b.dataset.i])));
 $('#favChipAdd').onclick=()=>{openSettings();setTimeout(()=>openFavAdd(true),RM?0:200)};
}

/* ================= places: favourites, recent, stops, addresses (Maa-amet In-ADS), places (Photon) ================= */
const pkey=p=>p.n+'|'+p.ll[0].toFixed(4)+','+p.ll[1].toFixed(4);
const PK=new Map(); // key -> place, for star buttons
const favPlace=f=>({n:f.p,s:f.a,ll:f.ll});
const favOf=p=>p&&p.ll?FAVS.find(f=>Math.abs(f.ll[0]-p.ll[0])<2e-4&&Math.abs(f.ll[1]-p.ll[1])<2e-4):null;
const starBtn=p=>{const k=pkey(p);PK.set(k,p);const on=!!favOf(p);return`<button class="starbtn" data-star="${esc(k)}" aria-pressed="${on}" aria-label="${on?'Muuda lemmikut':'Salvesta lemmikuks'}: ${esc(p.n)}">${on?I.starf:I.star}</button>`};
const dTxt=p=>{const c=state.me;return c?fmtM(m(c,p.ll)*DETOUR):''};
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function stopPlaces(q){
 const nq=norm(q),by=new Map();
 TT.stops.n.forEach((n,i)=>{if(!norm(n).includes(nq))return;const o=by.get(n)||{n,c:[]};o.c.push(RT.ll[i]);by.set(n,o)});
 const out=[...by.values()].map(o=>{const ll=[o.c.reduce((a,c)=>a+c[0],0)/o.c.length,o.c.reduce((a,c)=>a+c[1],0)/o.c.length];return{n:o.n,s:'Peatus',ll,stop:1,sc:norm(o.n).startsWith(nq)?0:1}});
 return out.sort((a,b)=>a.sc-b.sc||a.n.length-b.n.length).slice(0,4);
}
const geoCache=new Map();
async function geocode(q){
 if(geoCache.has(q))return geoCache.get(q);
 const c=state.me||DEF_LL,out=[];
 const ads=fetch(`https://inaadress.maaamet.ee/inaadress/gazetteer?address=${encodeURIComponent(q)}&results=10`).then(r=>r.json()).then(j=>{for(const a of j.addresses||[]){if(!a.viitepunkt_b)continue;const la=+a.viitepunkt_b,lo=+a.viitepunkt_l;if(la<59.25||la>59.6||lo<24.3||lo>25.2)continue;out.push({n:a.aadresstekst||a.ipikkaadress,s:[a.asustusyksus,a.omavalitsus].filter(Boolean).join(', '),ll:[+a.viitepunkt_l,+a.viitepunkt_b],src:'ads'})}}).catch(()=>{});
 const ph=fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${c[1].toFixed(3)}&lon=${c[0].toFixed(3)}&limit=6&lang=default&bbox=24.3,59.25,25.2,59.6`).then(r=>r.json()).then(j=>{for(const f of j.features||[]){const p=f.properties;if(!p.name&&!p.street)continue;if(/^(bus_stop|platform|stop_position|tram_stop|stop|halt)$/.test(p.osm_value)&&/^(highway|public_transport|railway)$/.test(p.osm_key))continue;const n=p.name||[p.street,p.housenumber].filter(Boolean).join(' ');out.push({n,s:[p.name?[p.street,p.housenumber].filter(Boolean).join(' '):'',p.district||p.city].filter(Boolean).join(', '),ll:f.geometry.coordinates,src:'ph'})}}).catch(()=>{});
 await Promise.all([ads,ph]);
 const nq=norm(q),sc=p=>(m(c,p.ll)>15000?1.2:0)+sc0(p),sc0=p=>{const n=norm(p.n);return n===nq?0:n.startsWith(nq)?1:n.includes(nq)?2:p.src==='ads'&&/\d/.test(q)?1.5:3};out.sort((x,y)=>sc(x)-sc(y)||m(c,x.ll)-m(c,y.ll));
 const seen=[];const res=out.filter(p=>{if(seen.some(o=>norm(o.n)===norm(p.n)&&m(o.ll,p.ll)<150))return false;seen.push(p);return true}).slice(0,8);
 geoCache.set(q,res);return res;
}
let gq=0,gT=0;
function renderPlaces(){
 const inp=FIELD==='from'?$('#fromIn'):$('#q'),raw=(FIELD==='from'&&inp.value===fromVal()?'':inp.value).trim(),q=norm(raw),has=t=>norm(t||'').includes(q);
 const mark=n=>{const i=q?norm(n).indexOf(q):-1;return i<0?esc(n):esc(n.slice(0,i))+'<mark>'+esc(n.slice(i,i+q.length))+'</mark>'+esc(n.slice(i+q.length))};
 const row=(p,ic,t,sub,hi)=>{const k=pkey(p);PK.set(k,p);return`<div class="prow"><button class="place ${hi?'hi':''}" data-k="${esc(k)}">${ic}<span class="pn"><b>${t}</b><small>${esc(sub||'')}</small></span><span class="pd">${dTxt(p)}</span></button>${starBtn(p)}</div>`};
 const favs=FAVS.filter(f=>!q||has(f.n)||has(f.p));
 let h='';
 if(FIELD==='from'&&(!q||has('Sinu asukoht')))h+=meRow();
 if(favs.length)h+='<div class="sect">Lemmikud</div>'+favs.map((f,i)=>row(favPlace(f),`<span class="pi fv">${I[f.ic]}</span>`,mark(f.n),f.a,q&&i===0)).join('');
 if(!q){
  const rest=RECENT.filter(p=>!favOf(p));
  if(rest.length)h+='<div class="sect">Viimati</div>'+rest.map(p=>row(p,`<span class="pi">${I.clock}</span>`,esc(p.n),p.s)).join('');
  if(!favs.length&&!rest.length)h+='<div class="note">Kirjuta aadress, koha või peatuse nimi, näiteks „Ülemiste keskus“ või „Balti jaam“.</div>';
 }else{
  const stops=stopPlaces(raw).filter(p=>!favOf(p));
  const geo=(geoCache.get(raw)||[]).filter(p=>!favOf(p));
  const first=!favs.length;
  if(geo.length)h+='<div class="sect">Kohad</div>'+geo.map((p,i)=>row(p,`<span class="pi">${I.pin}</span>`,mark(p.n),p.s,first&&i===0)).join('');
  if(stops.length)h+='<div class="sect">Peatused</div>'+stops.map((p,i)=>row(p,`<span class="pi">${I.bus}</span>`,mark(p.n),p.s,first&&!geo.length&&i===0)).join('');
  if(!geoCache.has(raw))h+='<div class="note">Otsin aadresse…</div>';
  else if(!favs.length&&!stops.length&&!geo.length)h+=`<div class="sect">Ei leidnud</div><div class="note">Proovi aadressi või koha nime, näiteks „Ülemiste“.</div>`;
  if(!geoCache.has(raw)){clearTimeout(gT);const my=++gq;gT=setTimeout(()=>geocode(raw).then(()=>{if(my===gq&&inp.value.trim()===raw)renderPlaces()}),220)}
 }
 $('#plist').innerHTML=h;
 $$('#plist .place').forEach(b=>b.onclick=()=>b.dataset.me?pickMe():pick(PK.get(b.dataset.k)));
 $$('#plist .starbtn').forEach(b=>b.onclick=()=>openSave(PK.get(b.dataset.star),b));
}
/* the "Kust" field: your location (asks for it when needed) or any place */
let FIELD='to',LOCST='prompt';
function locHelp(){
 return isIOS?L('iPhone: Seaded → Privaatsus ja turvalisus → Asukohateenused → Safari veebisaidid → „Rakenduse kasutamise ajal“. Siis ava leht uuesti.','iPhone: Settings → Privacy & Security → Location Services → Safari Websites → “While Using the App”. Then open the page again.')
  :isAndroid?L('Puuduta aadressiriba ees olevat ikooni → Load → Asukoht → Luba. Siis ava leht uuesti.','Tap the icon left of the address bar → Permissions → Location → Allow. Then open the page again.')
  :L('Klõpsa aadressiriba ees oleval ikoonil, luba asukoht ja laadi leht uuesti.','Click the icon left of the address bar, allow location and reload the page.');
}
function meRow(){
 const sub=state.me?'Praegune asukoht':LOCST==='denied'?L('Asukoha luba on keelatud','Location is blocked for this site'):L('Puuduta, et lubada asukoht','Tap to allow location');
 return `<div class="prow"><button class="place${!state.from&&state.me?' on':''}" data-me="1"><span class="pi fv">${I.locate}</span><span class="pn"><b>Sinu asukoht</b><small>${sub}</small></span></button></div>`
  +(LOCST==='denied'&&!state.me?(iosApp()?`<div class="note lochelp"><button class="lnk" data-lochelp>${L('Kuidas asukoht sisse lülitada','How to turn location on')}</button></div>`:`<div class="note lochelp">${esc(locHelp())}</div>`):'');
}
function setFrom(p){
 state.from=p;$('#fromIn').value=fromVal();$('#ftFrom').textContent=fromName();
 if(state.to&&!(p&&pkey(p)===pkey(state.to))){FIELD='to';$('#snote').innerHTML='';state.sel=null;freshLive();go('results',{fresh:true})}
 else{FIELD='to';$('#q').focus();renderPlaces()}
}
function pickMe(){
 if(state.me){setFrom(null);return}
 $('#fromIn').value='Otsin asukohta…';
 locate(true,ok=>{if(ok)setFrom(null);else{$('#fromIn').value=fromVal();renderPlaces()}});
}
function pick(p){
 if(!p)return;
 if(FIELD==='from'){const r={n:p.n,s:p.s||'',ll:p.ll};const i=RECENT.findIndex(x=>pkey(x)===pkey(p));if(i>=0)RECENT.splice(i,1);RECENT.unshift(r);RECENT.length=Math.min(RECENT.length,8);saveRecent();setFrom(r);return}
 state.to={n:p.n,s:p.s||'',ll:p.ll};
 const i=RECENT.findIndex(x=>pkey(x)===pkey(p));if(i>=0)RECENT.splice(i,1);RECENT.unshift({n:p.n,s:p.s||'',ll:p.ll});RECENT.length=Math.min(RECENT.length,8);saveRecent();
 $('#ftTo').textContent=p.n;$('#snote').innerHTML='';state.sel=null;
 ping('search');freshLive();
 go('results',{fresh:true});
 setTimeout(maybeInstall,8000);
}
const fromVal=()=>state.from||state.me?fromName():'';
const fromLL=()=>state.from?state.from.ll:(state.me||DEF_LL);
const fromName=()=>state.from?state.from.n:state.me?'Sinu asukoht':'Kesklinn (asukoht puudub)';

/* ================= time choice ================= */
const WK=[['now','Lahku kohe'],['dep','Lahku kell'],['arr','Jõua kohale'],['last','Viimane buss'],['first','Esimene buss']];
const DAYN=['P','E','T','K','N','R','L'];
const up=t=>t.charAt(0).toUpperCase()+t.slice(1);
function dayLbl(d,lower){if(d===0)return lower?'täna':'Täna';if(d===1)return lower?'homme':'Homme';const x=new Date();x.setDate(x.getDate()+d);return`${DAYN[x.getDay()]} ${x.getDate()}.${x.getMonth()+1}`}
const tStr=t=>`${Math.floor(t/60)%24}:${String(t%60).padStart(2,'0')}`;
const tVal=t=>`${String(Math.floor(t/60)%24).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
/* live data takes over when the trip leaves within 30 min; further ahead it is the timetable */
function whenLive(){const W=state.when;if(W.k==='now')return true;if(W.k!=='dep'&&W.k!=='arr')return false;return W.day*1440+(W.k==='arr'?W.t-30:W.t)-clock().min<=30}
// minutes the fixed start time is behind now (0 when not "Lahku kohe")
function t0Behind(){const W=state.when,T=state.t0;if(W.k!=='now'||!T)return 0;const c=clock();return (c.ymd>T.ymd?c.min+1440:c.min)-T.min}
function nowBtn(){return t0Behind()>=1?`<button class="nowbtn" data-now>${I.refresh}Praegu</button>`:''}
function toNow(){state.t0=null;freshLive();compute({})}
function whenTxt(){const W=state.when,d=W.day?dayLbl(W.day,true)+' ':'';if(W.k==='now'&&t0Behind()>=1)return`Lahku ${hm(state.t0.min)}`;
 return W.k==='now'?'Lahku kohe':W.k==='dep'?`Lahku ${d}${tStr(W.t)}`:W.k==='arr'?`Kohal ${d}${tStr(W.t)}`:W.k==='last'?`Viimane buss${W.day?' · '+dayLbl(W.day,true):''}`:`Esimene buss · ${dayLbl(W.day,true)}`}
function clampWhen(){const W=state.when,lo=W.day?0:nowLo();W.t=Math.max(lo,Math.min(23*60+55,W.t))}
function whenUI(inR){
 const W=state.when;
 let s=`<div class="wk" role="radiogroup" aria-label="Millal">${WK.map(([k,l])=>`<button role="radio" aria-checked="${W.k===k}" data-wk="${k}">${l}</button>`).join('')}</div>`;
 if(W.k!=='now'){
  s+=`<div class="wpick"><div class="wdays" role="radiogroup" aria-label="Päev">${[0,1,2,3,4,5].map(d=>`<button role="radio" aria-checked="${W.day===d}" data-day="${d}">${dayLbl(d)}</button>`).join('')}</div>`;
  if(W.k==='dep'||W.k==='arr'){const lo=W.day?0:nowLo();
   s+=`<div class="wtime"><span class="wl">${W.k==='dep'?'Lahkun':'Pean kohal olema'}</span><div class="step"><button data-ws="-5" aria-label="5 min varem" ${W.t<=lo?'disabled':''}>${I.minus}</button><input type="time" step="300" value="${tVal(W.t)}" aria-label="Kellaaeg"><button data-ws="5" aria-label="5 min hiljem" ${W.t>=23*60+55?'disabled':''}>${I.plus}</button></div></div>`}
  const lead=W.k==='last'?'Viimane ühendus, mis sind kohale viib. ':W.k==='first'?'Esimene ühendus hommikul. ':'';
  s+=whenLive()?`<p class="wcap live">${I.live}<span>Väljumiseni on alla 30 min, nii et näitan live-aegu.</span></p>`:`<p class="wcap">${I.clock}<span>${lead}Sõiduplaani järgi. Live-ajad tulevad 30 min enne väljumist.</span></p>`;
  s+='</div>';
 }
 if(inR)s+=`<button class="btn pri wgo">Näita teid</button>`;
 return s;
}
function renderWhen(el,inR){
 const a=document.activeElement,key=a&&el.contains(a)?['wk','day','ws'].map(k=>a.dataset[k]!=null?`[data-${k}="${a.dataset[k]}"]`:'').join('')||(a.type==='time'?'input':''):'';
 el.innerHTML=whenUI(inR);
 if(key){const b=el.querySelector(key);if(b&&!b.disabled)b.focus({preventScroll:true})}
 el.onclick=e=>{const b=e.target.closest('button');if(!b||!el.contains(b))return;const W=state.when;
  if(b.classList.contains('wgo')){applyResultsWhen();return}
  if(b.dataset.wk){if(b.dataset.wk===W.k)return;W.k=b.dataset.wk;W.day=W.k==='first'?1:0;if(W.k==='dep')W.t=nowLo()+25;if(W.k==='arr')W.t=nowLo()+55}
  else if(b.dataset.day!=null)W.day=+b.dataset.day;
  else if(b.dataset.ws)W.t+=+b.dataset.ws;
  else return;
  clampWhen();renderWhen(el,inR);lens()};
 el.onchange=e=>{if(e.target.type==='time'&&e.target.value){const [hh,mm]=e.target.value.split(':').map(Number);state.when.t=hh*60+mm;clampWhen();renderWhen(el,inR)}};
}
$('#zin').onclick=()=>map&&map.zoomIn();$('#zout').onclick=()=>map&&map.zoomOut();
const dpop=$('#dpop');
$('#donate').onclick=e=>{e.stopPropagation();const o=!dpop.classList.contains('open');dpop.classList.toggle('open',o);$('#donate').setAttribute('aria-expanded',o);if(o){lens();if(!isDesk()){dpop.style.top=($('#donate').getBoundingClientRect().top)+'px';dpop.style.right='76px'}}};
$('#dclose').onclick=()=>{dpop.classList.remove('open');$('#donate').setAttribute('aria-expanded',false)};
$('#dgo').onclick=()=>{dpop.classList.remove('open');toast('Aitäh! Makseviis lisandub peagi.')};
addEventListener('click',e=>{if(dpop.classList.contains('open')&&!dpop.contains(e.target)&&!$('#donate').contains(e.target))$('#dclose').click()});
let tt;function toast(t,ms){const el=$('#toast');el.textContent=t;el.classList.toggle('long',t.length>60);el.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('on'),ms||Math.max(2200,t.length*55))}
const mqDark=matchMedia('(prefers-color-scheme: dark)');
const resolveT=p=>p==='auto'?(mqDark.matches?'dark':'light'):p;
function syncSeg(){
 const ix=['light','dark','auto'].indexOf(state.themePref);
 $$('.seg button').forEach(b=>b.setAttribute('aria-checked',b.dataset.t===state.themePref));
 $('.seg .cell').style.transform=`translateX(${ix*100}%)`;
 $('#segcap').textContent=state.themePref==='auto'?`Järgib telefoni seadet, praegu ${state.theme==='dark'?'tume':'hele'}.`:'';
}
$$('.seg button').forEach(b=>b.onclick=()=>setTheme(b.dataset.t));
$('.seg').addEventListener('keydown',e=>{const k=['light','dark','auto'];let i=k.indexOf(state.themePref);
 if(e.key==='ArrowRight'||e.key==='ArrowDown')i=(i+1)%3;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')i=(i+2)%3;else return;
 e.preventDefault();setTheme(k[i]);$(`.seg [data-t=${k[i]}]`).focus()});
mqDark.addEventListener('change',()=>{if(state.themePref==='auto')setTheme('auto')});
function setTheme(p){
 state.themePref=p;LS.set('buss-theme',p);
 const t=resolveT(p);if(t===state.theme){syncSeg();return}
 state.theme=t;document.documentElement.dataset.theme=t;syncSeg();
 if(map&&map.isStyleLoaded()){recolorMap(t);map.setPaintProperty('rt-case','line-color',css('--ring'));map.setPaintProperty('rt-stops','circle-color',css('--ring'));if(map.getLayer('veh-c'))map.setPaintProperty('veh-c','circle-stroke-color',css('--ring'));go(state.view,{instant:true,keepCam:true})}
}
addEventListener('keydown',e=>{if(e.key==='/'&&state.view!=='search'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();go('search')}});
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{setSheet(snapFor(state.view),true);lens(true)},120)});
/* ================= settings ================= */
function openSettings(){if(state.view!=='settings')go('settings')}
function closeSettings(){go(state.back&&state.back!=='settings'?state.back:'home',{keepCam:true});$('#openSet').focus({preventScroll:true})}
$('#openSet').onclick=()=>state.view==='settings'?closeSettings():openSettings();
$('#setBack').onclick=closeSettings;
addEventListener('keydown',e=>{if(e.key==='Escape'&&state.view==='settings'&&!e.defaultPrevented){if(!$('#favAddBox').hidden){openFavAdd(false);$('#favAdd').focus();return}closeSettings()}});
function renderSettings(){openFavAdd(false,true);renderFavs();renderPace();syncSeg();$('#glassTog').setAttribute('aria-checked',state.glass);$('#regTog').setAttribute('aria-checked',state.regTown)}

/* favourites: tap a row to rename or change its icon, drag the handle to reorder, delete with undo */
const ICN={home:'Kodu',work:'Töö',school:'Kool',gym:'Trenn',shop:'Pood',fam:'Pere',star:'Täht',pin:'Koht'};
function renderFavs(flash){
 const L=$('#favList');
 if(!FAVS.length){L.innerHTML=`<div class="fempty"><span class="ico">${I.star}</span><div class="pt"><b>Lemmikuid pole veel</b><small>Lisa koht, kuhu sõidad tihti, või vajuta otsingus tähte. See jääb avalehele ühe puudutuse kaugusele.</small></div></div>`;return}
 L.innerHTML=FAVS.map((f,i)=>`<div class="fav ${i===flash?'fresh':''}" data-i="${i}">
  <button class="fm" aria-label="${esc(f.n)}, ${esc(f.a)}. Muuda"><span class="ico">${I[f.ic]}</span><span class="pt"><b>${esc(f.n)}</b><small>${esc(f.a)}</small></span><span class="pen">${I.pen}</span></button>
  <button class="grip" aria-label="Muuda järjekorda: ${esc(f.n)}. Nooleklahvid üles ja alla">${I.grip}</button>
 </div>`).join('');
 $$('#favList .fav').forEach(row=>{
  const i=+row.dataset.i;row.querySelector('.fm').onclick=e=>openSave(null,e.currentTarget,i);
  const g=row.querySelector('.grip');g.onpointerdown=e=>favDrag(e,g,i);g.onkeydown=e=>favKey(e,i);
 });
}
function favMove(i,to){if(to<0||to>=FAVS.length||to===i)return false;const [x]=FAVS.splice(i,1);FAVS.splice(to,0,x);saveFavs();renderFavChips();return true}
function favKey(e,i){
 const to=e.key==='ArrowUp'?i-1:e.key==='ArrowDown'?i+1:null;if(to===null)return;e.preventDefault();
 if(favMove(i,to)){renderFavs();$$('#favList .grip')[to].focus();say(`${FAVS[to].n}: ${to+1}. kohal`)}
}
function favDrag(e,g,i){
 if(e.button>0)return;e.preventDefault();
 const rows=$$('#favList .fav'),row=rows[i],H=row.getBoundingClientRect().height+2,y0=e.clientY;let to=i;
 g.setPointerCapture(e.pointerId);row.classList.add('lift');
 g.onpointermove=ev=>{const dy=Math.max(-i*H-8,Math.min((rows.length-1-i)*H+8,ev.clientY-y0));row.style.transform=`translateY(${dy}px) scale(1.02)`;
  to=Math.max(0,Math.min(rows.length-1,Math.round(i+dy/H)));
  rows.forEach((r,j)=>{if(j===i)return;const s=i<to&&j>i&&j<=to?-H:i>to&&j<i&&j>=to?H:0;r.style.transform=s?`translateY(${s}px)`:''})};
 g.onpointerup=g.onpointercancel=()=>{g.onpointermove=g.onpointerup=g.onpointercancel=null;
  if(favMove(i,to)){renderFavs();say(`${FAVS[to].n}: ${to+1}. kohal`)}else{row.classList.remove('lift');rows.forEach(r=>r.style.transform='')}};
}
function openFavAdd(on,quiet){
 const box=$('#favAddBox');box.hidden=!on;$('#favAdd').hidden=on;$('#favAdd').setAttribute('aria-expanded',on);
 if(!on)return;$('#favQ').value='';renderFavRes();if(!quiet){$('#favQ').focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:RM?'auto':'smooth'})}
}
$('#favAdd').onclick=()=>openFavAdd(true);
$('#favQ').oninput=renderFavRes;
$('#favQ').onkeydown=e=>{if(e.key==='Enter'){const f=$('#favRes .place');if(f)f.click()}};
let snT;function snack(t,undo){const el=$('#snack');el.querySelector('span').textContent=t;el.classList.add('on');$('#toast').classList.remove('on');
 el.querySelector('button').onclick=()=>{el.classList.remove('on');undo()};clearTimeout(snT);snT=setTimeout(()=>el.classList.remove('on'),5000)}
const sayEl=Object.assign(document.createElement('div'),{className:'vh'});sayEl.setAttribute('aria-live','polite');document.body.appendChild(sayEl);
function say(t){sayEl.textContent=t}

/* save sheet: name + icon. The icon follows the name (Estonian, English, Russian, Ukrainian) until the user picks one */
const GUESS={
 home:['kodu','koju','kodus','home','house','flat','apartment','дом','дома','домой','квартира','дім','додому','вдома','хата'],
 work:['töö','tööle','tööl','kontor','office','work','job','работа','офис','робота','офіс'],
 school:['kool','kooli','koolis','ülikool','lasteaed','lasteaeda','gümnaasium','school','uni','university','college','kindergarten','школа','университет','садик','детсад','університет','садочок','садок'],
 gym:['jõusaal','jõusaali','trenn','trenni','spordiklubi','spordihall','ujula','gym','fitness','workout','training','спортзал','тренировка','фитнес','бассейн','тренування','фітнес','басейн'],
 shop:['pood','poodi','turg','turule','shop','store','market','supermarket','магазин','рынок','ринок','крамниця'],
 fam:['ema','isa','vanaema','vanaisa','vanemad','pere','mom','mum','dad','parents','grandma','мама','папа','бабушка','родители','мати','тато','бабуся','батьки']
};
function guessIcon(t){const w=t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
 for(const k in GUESS)for(const x of w)if(GUESS[k].some(g=>x===g||(g.length>=4&&x.startsWith(g))))return k;return null}
let SV=null;
function renderIcons(){
 $('#saveIcons').innerHTML=Object.keys(ICN).map(k=>`<button role="radio" aria-checked="${SV.ic===k}" data-ic="${k}"><i>${I[k]}</i>${ICN[k]}</button>`).join('');
 $('#saveIc').innerHTML=I[SV.ic];
 $$('#saveIcons button').forEach(b=>b.onclick=()=>{SV.ic=b.dataset.ic;SV.lock=true;SV.guessed=false;renderIcons();guessCap();b2()});
 function b2(){const x=$(`#saveIcons [data-ic=${SV.ic}]`);if(x)x.focus({preventScroll:true})}
}
function guessCap(){
 const g=$('#guess'),v=$('#saveName').value.trim();
 g.innerHTML=SV.lock?'':SV.guessed?`${I.auto}<span>Ikoon valitud nime järgi. Saad seda muuta.</span>`:v?'':`<span>Ikoon tuleb nimest ise: kodu, home, дом, дім. Saad seda muuta.</span>`;
}
$('#saveName').addEventListener('input',()=>{
 if(!SV||SV.lock)return;const k=guessIcon($('#saveName').value),nk=k||'star';
 SV.guessed=!!k;if(nk!==SV.ic){SV.ic=nk;renderIcons();const pi=$('#saveIc');pi.classList.add('bump');setTimeout(()=>pi.classList.remove('bump'),260)}guessCap();
});
$('#saveName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#saveOk').click()}});
function refreshFavs(flash){
 renderFavChips();renderFavPins();renderRecent();
 if(state.view==='search')renderPlaces();
 if(state.view==='settings')renderFavs(flash);
 if(state.view==='route'){const t=sbody.scrollTop;renderRoute();sbody.scrollTop=t;labels(ROUTES[state.sel])}
}
$('#saveX').onclick=()=>closeSave();
$('#scrim').onclick=()=>closeSave();
document.addEventListener('keydown',e=>{
 if(!SV)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSave();return}
 if(e.key==='Tab'){const f=[...document.querySelectorAll('#save button,#save input')].filter(x=>!x.hidden&&x.offsetParent);const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
},true);
/* phone keyboard: lift the save sheet above it */
if(window.visualViewport){const vv=visualViewport,kb=()=>{const k=Math.max(0,innerHeight-vv.height-vv.offsetTop);document.documentElement.style.setProperty('--kb',(k>60?k:0)+'px')};vv.addEventListener('resize',kb);vv.addEventListener('scroll',kb)}
/* walk, jog and run speed in km/h (0,5 steps), each faster than the one before by at least 1 km/h; run limit in 250 m steps */
const LIM={walk:[3.5,7],jog:[6,11],run:[8,18],max:[250,1500],bw:[0,5],bf:[0,5]},STEP={walk:.5,jog:.5,run:.5,max:250,bw:.5,bf:.5};
const kmh=v=>String(v).replace('.',','),mss=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
function paceRange(k){const P=state.pace,[a,b]=LIM[k];
 return k==='walk'?[a,Math.min(b,P.jog-1)]:k==='jog'?[Math.max(a,P.walk+1),Math.min(b,P.run-1)]:k==='run'?[Math.max(a,P.jog+1),b]:[a,b]}
function renderPace(){
 for(const k of ['walk','jog','run','max','bw','bf']){const v=state.pace[k],r=$(`.pace[data-k=${k}]`),[lo,hi]=paceRange(k);
  r.querySelector('output').innerHTML=k==='max'?`${v}<small>m</small>`:k[0]==='b'?`${kmh(v)}<small>min</small>`:`${kmh(v)}<small>km/h</small>`;
  if(k!=='max'&&k[0]!=='b')r.querySelector('.mpk').textContent=`${mss(3600/v)} min/km`;
  r.querySelector('[data-d="-1"]').disabled=v<=lo;r.querySelector('[data-d="1"]').disabled=v>=hi}
 const t={walk:640/state.pace.walk*3.6,jog:640/state.pace.jog*3.6,run:640/state.pace.run*3.6};
 for(const k in t){const b=$(`.pb.${k}`);b.querySelector('i').style.setProperty('--w',(t[k]/t.walk*100).toFixed(1)+'%');b.querySelector('b').textContent=mss(t[k])}
}
$$('.pace .step button').forEach(b=>b.onclick=()=>{const k=b.closest('.pace').dataset.k,[lo,hi]=paceRange(k);
 state.pace[k]=Math.max(lo,Math.min(hi,state.pace[k]+(+b.dataset.d)*STEP[k]));LS.set('buss-pace',JSON.stringify(state.pace));renderPace()});

/* liquid glass on or off */
function setGlass(on){state.glass=on;document.documentElement.classList.toggle('noglass',!on);LS.set('buss-glass',on?'1':'0');$('#glassTog').setAttribute('aria-checked',on);if(on)lens(true)}
$('#glassTog').onclick=()=>setGlass(!state.glass);
/* county buses inside Tallinn on or off (off by default) */
$('#regTog').onclick=()=>{state.regTown=!state.regTown;LS.set('buss-reg',state.regTown?'1':'0');$('#regTog').setAttribute('aria-checked',state.regTown);if(state.to)compute()};

/* ================= liquid glass refraction (Chromium) ================= */
const LENS=/Chrome\/\d+/.test(navigator.userAgent)&&!/CriOS|FxiOS|EdgiOS|Mobile Safari\/(?!537)/.test(navigator.userAgent)&&!matchMedia('(prefers-reduced-transparency: reduce)').matches;
if(LENS)document.documentElement.classList.add('lens');
const NS='http://www.w3.org/2000/svg';let lensN=0;const lensCache={};
function dispMap(W,H,rad,bevel,mag){
 const k=[W,H,rad,bevel,mag].join('_');if(lensCache[k])return lensCache[k];
 const sc=.5,w=Math.max(2,Math.round(W*sc)),hh=Math.max(2,Math.round(H*sc));
 const cv=document.createElement('canvas');cv.width=w;cv.height=hh;const x=cv.getContext('2d');const im=x.createImageData(w,hh);const d=im.data;
 const hw=W/2,hh2=H/2,r=Math.min(rad,hw,hh2);
 for(let j=0;j<hh;j++)for(let i=0;i<w;i++){
  const px=(i+.5)/sc-hw,py=(j+.5)/sc-hh2;const qx=Math.abs(px)-(hw-r),qy=Math.abs(py)-(hh2-r);
  let dist,nx,ny;
  if(qx>0&&qy>0){const L=Math.hypot(qx,qy)||1;dist=r-L;nx=qx/L*Math.sign(px);ny=qy/L*Math.sign(py)}
  else if(qx>qy){dist=-qx+r*0;dist=(hw)-Math.abs(px);nx=Math.sign(px);ny=0}
  else{dist=(hh2)-Math.abs(py);nx=0;ny=Math.sign(py)}
  if(qx>0&&qy>0)dist=r-Math.hypot(qx,qy);
  let dx=0,dy=0;
  if(dist<bevel){const t=1-Math.max(0,dist)/bevel;const s=t*t*(3-2*t);dx=-nx*s;dy=-ny*s}
  // mild lens bulge inside
  dx+=-px/hw*mag;dy+=-py/hh2*mag;
  const o=(j*w+i)*4;d[o]=128+Math.max(-1,Math.min(1,dx))*127;d[o+1]=128+Math.max(-1,Math.min(1,dy))*127;d[o+2]=128;d[o+3]=255;
 }
 x.putImageData(im,0,0);return lensCache[k]=cv.toDataURL();
}
function lens(force){
 if(!LENS||!state.glass)return;
 requestAnimationFrame(()=>{
 for(const el of $$('.glass')){
  if(el.classList.contains('vcard'))continue;
  const r=el.getBoundingClientRect();const W=Math.round(r.width),H=Math.round(r.height);if(W<4||H<4)continue;
  const cs=getComputedStyle(el);const rad=Math.min(parseFloat(cs.borderTopLeftRadius)||0,W/2,H/2);
  const big=W*H>60000;const bevel=big?26:Math.min(W,H)*.42;const mag=big?.035:.12;const scale=big?54:Math.min(W,H)*.9;const blur=big?(state.theme==='dark'?5:7):1.6;
  const key=[W,H,rad,state.theme].join('_');if(el._lk===key&&!force)continue;el._lk=key;
  const id=el._lid||(el._lid='lg'+(++lensN));
  let f=document.getElementById(id);
  if(!f){f=document.createElementNS(NS,'filter');f.id=id;$('#lensdefs').appendChild(f)}
  f.setAttribute('x','0');f.setAttribute('y','0');f.setAttribute('width',W);f.setAttribute('height',H);f.setAttribute('filterUnits','userSpaceOnUse');f.setAttribute('primitiveUnits','userSpaceOnUse');f.setAttribute('color-interpolation-filters','sRGB');
  const url=dispMap(W,H,rad,bevel,mag);
  f.innerHTML=`<feImage href="${url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="m"/>
   <feGaussianBlur in="SourceGraphic" stdDeviation="${(blur*.35).toFixed(2)}" result="s"/>
   <feDisplacementMap in="s" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
   <feDisplacementMap in="s" in2="m" scale="${scale*.94}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
   <feDisplacementMap in="s" in2="m" scale="${scale*.88}" xChannelSelector="R" yChannelSelector="G" result="db"/>
   <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>
   <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>
   <feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>
   <feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="rgb"/>
   <feGaussianBlur in="rgb" stdDeviation="${blur}" result="bl"/>
   <feColorMatrix in="bl" type="saturate" values="1.7"/>`;
  el.style.backdropFilter=`url(#${id})`;el.style.webkitBackdropFilter=`url(#${id})`;
 }});
}
/* ================= planning: timetable + live delays ================= */
const nowLo=()=>Math.ceil((clock().min+1)/5)*5;
let CMP=0,refT=0;
/* Real walks to the stops around the start and from the stops around the end (and walking the whole way). Falls back to
   the straight-line guess when the streets are not mapped there or the street data is slow to come. */
async function realWalks(q){
 try{
  const cut=new Promise(r=>setTimeout(()=>r(null),2500));
  const [a,b]=await Promise.race([Promise.all([WALK.from(q.from,RT.near(q.from,ACCESS)),WALK.from(q.to,RT.near(q.to,ACCESS))]),cut.then(()=>[null,null])]);
  const use=w=>w&&w.list.filter(([,m])=>m!==Infinity).map(([s,m,sl])=>[s,m==null?sl:m/DETOUR]);
  if(a){q.acc=use(a);const d=a.to(q.to);if(d<Infinity)q.directM=d}
  if(b)q.egr=use(b);
 }catch(e){}
}
async function compute(o={}){
 clearTimeout(refT);
 if(!RT||!state.to)return;
 const my=++CMP,W=state.when,c=clock(),live=whenLive();
 if(Date.now()-DELAYS_AT>45000)freshLive()
 // "Lahku kohe" plans from the moment the search started; the refresh / "Praegu" button moves it to now
 const T0=W.k==='now'?(state.t0||(state.t0={ymd:c.ymd,min:c.min})):null;
 const ymd=T0?T0.ymd:addDays(c.ymd,W.day),t=T0?T0.min:W.t;
 const P=state.pace,q={from:fromLL(),to:state.to.ll,ymd,t,walk:P.walk,jog:P.jog,run:P.run,maxFast:P.max,board:P.bw,boardFast:P.bf,fast:0,noReg:!state.regTown,delays:live?DELAYS:new Map()};
 await realWalks(q);if(my!==CMP)return;
 const fast=state.run&&W.k==='now';
 const goNowOk=()=>W.k==='now'&&!fast&&(P.bw||0)>0;
 const run=()=>W.k==='arr'?RT.arriveBy(q):W.k==='last'?RT.lastOne(q):W.k==='first'?RT.firstOne(q):fast?RT.fastPlan(q):RT.plan(q);
 let r=run();
 if(live){
  for(let pass=0;pass<2;pass++){
   const stops=new Set();for(const j of r.journeys)if(j)for(const l of j.legs)if(l.m==='ride')stops.add(l.fromStop);
   if(fast){const n=RT.plan(q);for(const j of n.journeys)for(const l of j.legs)if(l.m==='ride')stops.add(l.fromStop)}
   if(goNowOk()){const n=RT.plan({...q,boardFirst:0},3);for(const j of n.journeys)for(const l of j.legs)if(l.m==='ride')stops.add(l.fromStop)}
   const need=[...stops].filter(s=>!SEEN.has(s));if(!need.length)break;
   await delaysFor(RT,need,ymd,DELAYS);need.forEach(s=>SEEN.add(s));
   if(my!==CMP)return;
   r=run();
  }
 }
 if(my!==CMP)return;
 // "go now": a bus that comes a bit sooner than the margin allows, shown as an extra choice (live time known)
 let tight=null;
 if(goNowOk()){
  const sg=j=>j.legs.filter(l=>l.m==='ride').map(l=>l.key+'@'+l.i0).join('|'),have=new Set(r.journeys.filter(Boolean).map(sg));
  const bestA=Math.min(Infinity,...r.journeys.filter(Boolean).map(j=>j.arr),r.walk?q.t+r.walk.min:Infinity);
  const rides=Math.min(9,...r.journeys.filter(Boolean).map(j=>j.rides));
  tight=RT.plan({...q,boardFirst:0},3).journeys.filter(j=>{if(!j||have.has(sg(j))||j.arr>bestA-1||j.dep<c.min||j.rides>rides)return false;const f=j.legs.find(l=>l.m==='ride');return!live||DELAYS.has(f.key)}).sort((a,b)=>a.arr-b.arr)[0]||null;
 }
 let bestWalk=null;
 if(fast){const n=RT.plan(q);if(n.journeys.length)bestWalk=Math.min(...n.journeys.map(j=>j.arr))}
 const ctx={plan:!live,now:c.min};
 const prevSig=state.sel&&ROUTES[state.sel]?ROUTES[state.sel].sig:null;
 const L=r.journeys.filter(Boolean).map(j=>viewJ(j,ctx));
 for(const k in ROUTES)delete ROUTES[k];
 L.forEach(R=>ROUTES[R.id]=R);
 if(L.length){
  const late=L.slice().sort((a,b)=>b.dep-a.dep)[0];
  if(W.k==='now'||W.k==='dep')L[0].badge=['ink','Kiireim'];
  if(W.k==='arr')late.badge=['ink','Lahkud kõige hiljem'];
  if(W.k==='last')late.badge=['ink','Viimane'];
  if(W.k==='first')L[0].badge=['ink','Esimene'];
  if(tight){const T=viewJ(tight,ctx);T.tight=Math.max(0,Math.floor(tight.dep-c.min));T.badge=['tight','Kiirusta'];ROUTES[T.id]=T;L.unshift(T)}
  if(fast)for(const R of L){if(!R.run)continue;const g=bestWalk!=null?Math.round(bestWalk-R.arr):0;if(g>=1)R.badge=['gain',`${g} min varem`];R.runcard=runCard(R,bestWalk)}
 }
 state.list=L;state.walk=r.walk;
 const keep=L.find(R=>R.sig===prevSig);
 const safe=L.find(R=>R.tight==null)||L[0];
 state.sel=o.first||!keep?(safe&&safe.id):keep.id;
 if(state.view==='results'){renderResults(false);drawFor('results',{instant:!o.fresh,keepCam:!o.fresh})}
 else if(state.view==='route'){if(!state.sel){go('results');return}const t=sbody.scrollTop;renderRoute();sbody.scrollTop=t;drawFor('route',{instant:!o.fresh,keepCam:!o.fresh})}
 lens();
 if(W.k==='now'||live)refT=setTimeout(()=>{if(!document.hidden&&(state.view==='results'||state.view==='route')){freshLive();compute()}else refT=setTimeout(()=>compute(),5000)},30000);
}
/* ===== "Mine 5 min pärast": a reminder for one chosen trip =====
   Follows the first ride's live delay (SIRI at its stop, every minute) and tells you 5 minutes before you have to
   leave: a system notification when allowed, plus a sound-free in-app banner and a buzz. With notifications allowed
   the reminder is also sent to the server (worker/push.js), which follows the same delay and sends a Web Push, so it
   comes with the phone locked and the app closed (iPhone: only the app on the home screen, iOS 16.4+). */
const LEAD=5;
let ALARM=(()=>{try{return JSON.parse(LS.get('buss-alarm')||'null')}catch(e){return null}})(),alarmT=0;
const alarmNow=()=>{const c=clock();return ALARM&&c.ymd>ALARM.ymd?c.min+1440:c.min};
const alarmLeave=()=>ALARM.sched+ALARM.delay-ALARM.lead;
function saveAlarm(){if(ALARM)LS.set('buss-alarm',JSON.stringify(ALARM));else try{localStorage.removeItem('buss-alarm')}catch(e){}}
function alarmable(R){
 if(!R||R.run)return false;const W=state.when,c=clock();
 if(W.k!=='now'&&!(W.k==='dep'&&!W.day))return false;
 const f=R.j.legs.find(l=>l.m==='ride');return !!f&&R.dep>c.min+.5&&R.dep<c.min+720;
}
function setAlarm(R){
 const f=R.j.legs.find(l=>l.m==='ride'),p=TT.pats[f.pi],r=TT.routes[p.r];
 unpush();
 ALARM={ymd:clock().ymd,sig:R.sig,key:f.key,stop:f.fromStop,sched:f.sched,delay:f.delay||0,lead:f.a-R.dep,m:r[1],n:r[0],to:state.to.n,fired:0,rides:alarmRides(R)};
 saveAlarm();
 const ask=window.Notification&&Notification.permission==='default'?Notification.requestPermission():Promise.resolve();
 ask.catch(()=>{}).then(()=>Promise.race([pushAlarm(),new Promise(r=>setTimeout(()=>r(false),8000))])).then(ok=>{const left=alarmLeave()-LEAD-alarmNow();
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent)&&!standalone();
  toast(left<=0?'Mine kohe!':`Teavitan kell ${hm(alarmLeave()-LEAD)}, 5 min enne minekut.`+(ok?'':window.Notification&&Notification.permission==='denied'?' '+notifHelp():ios?' '+L('Lukus telefonile teavituse saamiseks lisa äpp avaekraanile. Praegu hoia äpp lahti.','To get it on a locked iPhone, add the app to your Home Screen. For now, keep the app open.'):' '+L('Hoia äpp lahti.','Keep the app open.')));
  tickAlarm();if(state.view==='route')renderRoute()});
}
function notifHelp(){
 return isIOS?L('Teavitused on keelatud: Seaded → Teavitused → buss → „Luba teavitused“.','Notifications are off: Settings → Notifications → buss → “Allow Notifications”.')
  :isAndroid?L('Teavitused on keelatud: puuduta aadressiriba ees olevat ikooni → Load → Teavitused → Luba.','Notifications are blocked: tap the icon left of the address bar → Permissions → Notifications → Allow.')
  :L('Teavitused on keelatud: klõpsa aadressiriba ees oleval ikoonil ja luba teavitused.','Notifications are blocked: click the icon left of the address bar and allow notifications.');
}
// the trip's rides, so transfers can be watched on the way: stop indexes, scheduled times, walk minutes before each
function alarmRides(R){
 const out=[];let w=0;
 for(const l of R.j.legs){if(l.m==='walk'){if(out.length)w+=(l.b-l.a)||0;continue}
  const r=TT.routes[TT.pats[l.pi].r];out.push({m:r[1],n:r[0],key:l.key,s0:l.fromStop,s1:l.toStop,t0:l.sched,t1:l.schedB,w:Math.round(w*10)/10});w=0}
 return out.length>1?out:null;
}
// the server copy of the reminder (Web Push): needs notifications allowed and a push service
async function pushAlarm(){
 try{
  if(!ALARM||!('PushManager' in window)||!navigator.serviceWorker||!window.Notification||Notification.permission!=='granted')return false;
  const a=ALARM,reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub){const {key}=await (await fetch('/api/push/key')).json();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})}
  const res=await fetch('/api/push/alarm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sub:sub.toJSON(),ymd:a.ymd,siri:TT.stops.siri[a.stop]||0,mode:a.m,route:a.n,sched:a.sched,lead:a.lead,delay:a.delay,stop:stopName(a.stop),dest:a.to,legs:a.rides?a.rides.map(x=>({m:x.m,n:x.n,s0:TT.stops.siri[x.s0]||0,s1:TT.stops.siri[x.s1]||0,t0:x.t0,t1:x.t1,n0:stopName(x.s0),n1:stopName(x.s1),w:x.w})):undefined})});
  if(!res.ok)return false;
  const {id}=await res.json();if(ALARM!==a){fetch('/api/push/alarm?id='+id,{method:'DELETE'}).catch(()=>{});return false}
  a.pid=id;saveAlarm();return true;
 }catch(e){return false}
}
function unpush(){if(ALARM&&ALARM.pid)fetch('/api/push/alarm?id='+ALARM.pid,{method:'DELETE',keepalive:true}).catch(()=>{})}
function clearAlarm(){unpush();ALARM=null;saveAlarm();clearTimeout(alarmT);$('#alarmBar')?.remove();if(state.view==='route')renderRoute()}
async function tickAlarm(){
 clearTimeout(alarmT);if(!ALARM)return;
 if(alarmNow()>alarmLeave()+2){
  const X=ALARM.rides,last=X&&X[X.length-1];
  if(!last||alarmNow()>last.t0+(last.d0||0)+3){clearAlarm();return}
  $('#alarmBar')?.remove();await watchXfer();if(ALARM)alarmT=setTimeout(tickAlarm,30000);return;
 }
 // the first ride's live delay
 if(RT&&TT.stops.siri[ALARM.stop]&&!ALARM.fired&&alarmLeave()-alarmNow()<60){try{const r=await siri(TT.stops.siri[ALARM.stop],30000);const d=RT.matchSiri(ALARM.stop,r.rows,ALARM.ymd).get(ALARM.key);if(d!=null&&ALARM){ALARM.delay=d;saveAlarm()}}catch(e){}}
 if(!ALARM)return;
 const left=alarmLeave()-alarmNow();
 if(!ALARM.fired&&left<=LEAD+.1){ALARM.fired=1;saveAlarm();fireAlarm(Math.max(0,Math.round(left)))}
 alarmBar();
 alarmT=setTimeout(tickAlarm,ALARM.fired?20000:15000);
}
/* On the way: when the ride you are on gets off and the next one leaves (SIRI at both stops); once per transfer a
   warning when the next one will be gone before you can walk to it. The server does the same as a push. */
async function watchXfer(){
 const X=ALARM.rides,now=alarmNow(),ymd=ALARM.ymd;let ch=false;
 const live=async(stop,key)=>{if(!TT.stops.siri[stop]||!RT)return null;try{const r=await siri(TT.stops.siri[stop],20000);const d=RT.matchSiri(stop,r.rows,ymd).get(key);return d??null}catch(e){return null}};
 if(X[0].d0==null&&ALARM.delay)X[0].d0=ALARM.delay;
 for(let i=1;i<X.length;i++){
  const a=X[i-1],b=X[i];
  if(b.x||now>b.t0+(b.d0||0)+2||b.t0-now>40||now<a.t0+(a.d0||0)-2)continue;
  const d1=await live(a.s1,a.key),d0=await live(b.s0,b.key);if(!ALARM)return;
  if(d1!=null){a.d1=d1;ch=true}if(d0!=null){b.d0=d0;ch=true}
  const arrive=a.t1+(a.d1??a.d0??0),leaves=b.t0+(b.d0||0);
  if(leaves-(arrive+b.w)<0&&(d1!=null||d0!=null)){
   b.x=1;ch=true;
   const title='Ümberistumine võib jääda ära',body=`${MODE[a.m]} ${a.n} jõuab peatusesse ${stopName(a.s1)} ${hm(arrive)}, ${MODE[b.m].toLowerCase()} ${b.n} väljub ${b.s0!==a.s1?`peatusest ${stopName(b.s0)} `:''}${hm(leaves)}. Ava äpp, et leida uus teekond.`;
   try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
   if(window.Notification&&Notification.permission==='granted'&&!ALARM.pid){const o={body,tag:'buss-xfer',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',renotify:true};(navigator.serviceWorker?navigator.serviceWorker.getRegistration():Promise.resolve(null)).then(r=>r?r.showNotification(title,o):new Notification(title,o)).catch(()=>{})}
   toast(`${title}: ${body}`);
  }
 }
 if(ch)saveAlarm();
}
function fireAlarm(min){
 const title=min>=1?`Mine ${min} min pärast`:'Mine kohe',body=`${MODE[ALARM.m]} ${ALARM.n} väljub ${hm(ALARM.sched+ALARM.delay)} peatusest ${stopName(ALARM.stop)} · ${ALARM.to}`;
 try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
 if(window.Notification&&Notification.permission==='granted'&&!ALARM.pid){ // with pid the server's push brings it
  const o={body,tag:'buss-leave',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',renotify:true,vibrate:[200,100,200]};
  (navigator.serviceWorker?navigator.serviceWorker.getRegistration():Promise.resolve(null)).then(r=>r?r.showNotification(title,o):new Notification(title,o)).catch(()=>{try{new Notification(title,o)}catch(e){}});
 }
 toast(`${title}: ${body}`);
}
// a slim bar on every screen while a reminder is set
function alarmBar(){
 if(!ALARM){$('#alarmBar')?.remove();return}
 let b=$('#alarmBar');if(!b){b=document.createElement('div');b.id='alarmBar';b.className='alarmbar glass';b.setAttribute('role','status');document.body.appendChild(b)}
 const at=alarmLeave()-LEAD,left=Math.round(alarmLeave()-alarmNow());
 b.innerHTML=`${I.bell}<span>${ALARM.fired?(left>0?`Mine ${left} min pärast`:'Mine kohe'):`Teavitan ${hm(at)}`} · ${MODE[ALARM.m]} ${esc(ALARM.n)}${ALARM.delay>=1?` <span class="st-late">+${Math.round(ALARM.delay)}</span>`:''}</span><button aria-label="Tühista meeldetuletus">${I.close}</button>`;
 b.querySelector('button').onclick=clearAlarm;
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ALARM)tickAlarm()});
const SEEN=new Set(); // stops whose live departures are in DELAYS for this round
// new round of live times: forget the old delays and the stops they came from together, so the next compute polls again
function freshLive(){DELAYS=new Map();DELAYS_AT=Date.now();SEEN.clear()}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(state.view==='results'||state.view==='route')&&whenLive()&&Date.now()-DELAYS_AT>30000){freshLive();compute()}});
function applyResultsWhen(){$('#rWhen')&&($('#rWhen').hidden=true);state.sel=null;freshLive();go('results',{fresh:true})}

/* ================= navigation ================= */
function go(v,o={}){
 if(v==='results'&&o.fresh){state.t0=null;resAt=state.me}camAt=state.me;
 const prevV=state.view;state.view=v;document.body.dataset.view=v;state.prev=null;if(prevV!==v)sbody.scrollTop=0;
 if(pop){pop.remove();pop=null}
 if(v!=='results'&&v!=='route'&&v!=='settings')clearTimeout(refT);
 if(v==='home'){renderHome();setSheet(snapFor('home'),o.instant)}
 if(v==='search'){setSheet(snapFor('search'),o.instant);FIELD=o.field||'to';$('#fromIn').value=fromVal();if(o.field)$('#q').value=state.to?state.to.n:'';renderWhen($('#sWhen'),false);renderPlaces();if(isDesk()||!o.noFocus)setTimeout(()=>{const f=FIELD==='from'?$('#fromIn'):$('#q');f.focus({preventScroll:true});if(FIELD==='from'||o.field)f.select()},RM?0:250)}
 if(v==='results'){setSheet(snapFor('results'),o.instant);
  if(o.fresh||!state.list.length){state.list=[];renderResults(true);if(map&&map.getSource('rt')){clearRoutes();clearTemp();LBL=[];keyVehicles();fitTo(bboxOf([fromLL(),state.to.ll]),15.6,o.instant)}
   setTimeout(()=>compute({fresh:true,first:true}),RM?0:60)}
  else renderResults(false)}
 if(v==='route'){renderRoute();setSheet(snapFor('route'),o.instant)}
 if(v==='settings'){if(prevV!=='settings')state.back=prevV;renderSettings();setSheet(snapFor('settings'),o.instant)}
 $('#openSet').setAttribute('aria-expanded',v==='settings');
 $('#ftFrom').textContent=fromName();if(state.to)$('#ftTo').textContent=state.to.n;
 syncRun();
 if(v==='settings'){lens();return}
 if(!map||!map.getSource('rt')){lens();return}
 if(!(v==='results'&&(o.fresh||!state.list.length)))drawFor(v,o);
 lens();
}
function drawFor(v,o={}){
 if(!map||!map.getSource('rt'))return;
 const ids=curList();
 if(v==='home'||v==='search'){clearRoutes();clearTemp();LBL=[];keyVehicles();if(v==='home'&&!o.keepCam)homeCam(o.instant);return}
 if(v==='results'){
  if(!ids.length){clearRoutes();clearTemp();LBL=[];keyVehicles();tempMarkers.push(mk(h('<div class="dpin"></div>'),state.to.ll));if(!o.keepCam)fitTo(bboxOf([fromLL(),state.to.ll]),15.6,o.instant);return}
  const s=ids.includes(state.sel)?state.sel:ids[0];drawRoutes(ids,s,!o.instant);labels(ROUTES[s]);keyVehicles();if(!o.keepCam)fitRoute(ids,o.instant)}
 if(v==='route'&&ROUTES[state.sel]){drawRoutes([state.sel],state.sel,!o.instant);labels(ROUTES[state.sel]);keyVehicles();if(!o.keepCam)fitRoute([state.sel],o.instant)}
}
function syncRun(){const on=state.when.k==='now';$$('[data-run]').forEach(b=>{b.setAttribute('aria-checked',state.run&&on);b.classList.toggle('off',!on);b.setAttribute('aria-disabled',!on)})}
$$('[data-run]').forEach(b=>b.onclick=()=>{
 if(state.when.k!=='now'){toast('Jõua kiiremini töötab live-aegadega, kui lahkud kohe');return}
 state.run=!state.run;LS.set('buss-run',state.run?'1':'0');syncRun();
 toast(state.run?`Jõua kiiremini: sörgid või jooksed kuni ${state.pace.max} m`:'Jooks välja lülitatud');
 if(state.view==='results')renderResults(true);
 compute({fresh:true,first:true});
});

/* from and to: swap turns the trip around (your location becomes the destination) */
function swap(){
 if(!state.to)return;
 const a=state.from||{n:fromName(),s:'',ll:fromLL(),me:1},b=state.to;
 state.from=b.me?null:b;state.to=a;
 $('#ftFrom').textContent=fromName();$('#ftTo').textContent=state.to.n;
 state.sel=null;freshLive();go('results',{fresh:true});
}

/* ================= sheet (phone): drag the top bar. Down to a small bar, up to full height; Seaded and search close when dragged down ================= */
const sheet=$('#sheet'),sbody=$('#sbody');
const dockH=()=>!isDesk()&&state.view==='home'?66:0,minV=()=>dockH()?92:78;
const full=()=>state.view==='search'||state.view==='settings';
function sheetH(){const top=full()?10:state.view==='home'?80:104;return innerHeight-top-8}
function snapFor(v){const H=innerHeight;return v==='search'||v==='settings'?sheetH():v==='home'?Math.min(400,H*.48):v==='results'?Math.round(H*.56):Math.round(Math.min(H*.5,420))}
function setSheet(V,instant){
 if(isDesk()){sheet.style.height='';sheet.style.transform='';sbody.style.height='';state.V=0;document.body.classList.remove('tall','mini');return}
 const H=sheetH();V=Math.max(minV(),Math.min(H,V));state.V=V;
 if(instant)sheet.classList.add('dragging');
 sheet.style.height=H+'px';sheet.style.transform=`translateY(${H-V}px)`;sbody.style.height=Math.max(0,V-26-dockH())+'px';tallChk(V);
 document.body.classList.toggle('mini',V<=minV()+2);
 if(instant)requestAnimationFrame(()=>sheet.classList.remove('dragging'));
 if(LBL.length)schedPlace(instant?30:420);
}
let drag=null;
function dStart(e){
 if(isDesk()||e.button>0)return;if(e.target.closest('button,input,a')&&!e.target.closest('#grab'))return;
 drag={y:e.clientY,V:state.V,moved:0,t:performance.now(),ly:e.clientY,lt:performance.now(),vy:0};sheet.classList.add('dragging');
 try{e.currentTarget.setPointerCapture(e.pointerId)}catch(x){}
}
function dMove(e){
 if(!drag)return;const dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.abs(dy));
 const now=performance.now();if(now-drag.lt>0){drag.vy=(e.clientY-drag.ly)/(now-drag.lt)*.6+drag.vy*.4;drag.ly=e.clientY;drag.lt=now}
 if(drag.moved<4)return;
 const H=sheetH();let V=drag.V-dy;
 if(full()){V=Math.min(H,V);V=Math.max(H*.25,V)}else{V=Math.min(H,V);if(V<minV())V=minV()-(minV()-V)*.25}
 state.V=V;sheet.style.transform=`translateY(${H-V}px)`;sbody.style.height=Math.max(0,V-26-dockH())+'px';tallChk(V);
}
function tallChk(V){document.body.classList.toggle('tall',innerHeight-8-V<(state.view==='home'?196:218))}
function dEnd(){
 if(!drag)return;sheet.classList.remove('dragging');const d=drag;drag=null;
 const H=sheetH(),V=state.V;
 if(full()){
  if(d.moved>=4&&(H-V>110||d.vy>.6)){if(state.view==='settings')closeSettings();else go(state.to&&state.list.length?'results':'home');return}
  setSheet(H);return;
 }
 const pk=snapFor(state.view),snaps=[minV(),pk,H];
 let to;
 if(d.moved<4){to=V<=minV()+2?pk:V>pk+20?pk:H}
 else if(Math.abs(d.vy)>.5){const up=d.vy<0;to=up?snaps.find(s=>s>V+8)??H:[...snaps].reverse().find(s=>s<V-8)??minV()}
 else to=snaps.reduce((a,b)=>Math.abs(b-V)<Math.abs(a-V)?b:a);
 setSheet(to);
}
const grab=$('#grab');
for(const el of [grab,...$$('.shead')])el.addEventListener('pointerdown',dStart);
addEventListener('pointermove',dMove);addEventListener('pointerup',dEnd);addEventListener('pointercancel',dEnd);
grab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const H=sheetH();if(full()){if(state.view==='settings')closeSettings();else go('home');return}setSheet(state.V<=minV()+2?snapFor(state.view):state.V<H-10?H:minV())}});

/* ================= controls ================= */
$('#openSearch').onclick=()=>{state.from=null;go('search')};
function placeSearch(){const b=$('#openSearch'),dock=!isDesk();b.classList.toggle('glass',!dock);if(dock){if(b.parentNode!==$('#sdock'))$('#sdock').prepend(b)}else if(b.parentNode!==$('.top'))$('.top').prepend(b)}
placeSearch();matchMedia('(min-width: 900px)').addEventListener('change',()=>{placeSearch();setSheet(snapFor(state.view),true);lens(true)});
$('#refresh').onclick=()=>{const b=$('#refresh');b.classList.remove('spin');void b.offsetWidth;b.classList.add('spin');pollVeh();loadNear(true);if(state.view==='results'||state.view==='route')toNow()};
$('#sBack').onclick=()=>go('home');
$('#ftBack').onclick=()=>go(state.view==='route'?'results':'home');
$('#rBack').onclick=()=>go('results');
document.addEventListener('click',e=>{if(e.target.closest('[data-now]')){e.stopPropagation();toNow()}});
$('#ftSwap').onclick=swap;
$('#ftFrom').parentNode.onclick=()=>go('search',{field:'from'});
$('#ftTo').parentNode.onclick=()=>go('search',{field:'to'});
$('#fromIn').addEventListener('focus',()=>{if(FIELD!=='from'){FIELD='from';renderPlaces()}$('#fromIn').select()});
$('#fromIn').addEventListener('input',()=>{FIELD='from';$('#snote').innerHTML='';renderPlaces()});
$('#fromIn').addEventListener('keydown',e=>{if(e.key==='Enter'){const f=$('#plist .place');if(f)f.click()}if(e.key==='Escape')go('home')});
$('#fromIn').addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==$('#fromIn')&&!$('#fromIn').value.trim())$('#fromIn').value=fromVal()},200));
$('#q').addEventListener('focus',()=>{if(FIELD!=='to'){FIELD='to';if(!$('#fromIn').value.trim()||$('#fromIn').value!==fromVal())$('#fromIn').value=fromVal();renderPlaces()}});
$('#q').addEventListener('input',()=>{$('#snote').innerHTML='';renderPlaces()});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){const f=$('#plist .place');if(f)f.click()}if(e.key==='Escape')go('home')});
$('#fclr').onclick=e=>{e.preventDefault();$('#fromIn').value='';FIELD='from';renderPlaces();$('#fromIn').focus()};
$('#qclr').onclick=e=>{e.preventDefault();$('#q').value='';renderPlaces();$('#q').focus()};
$('#locate').onclick=()=>{setFollow(true);if(state.me&&map)map.easeTo({center:state.me,zoom:Math.max(map.getZoom(),16),padding:pad(),duration:RM?0:700});else locate(true)};

/* ================= your location ================= */
let meMk=null,watchId=null,outside=false;
/* the map moves with you (home and route views) until you drag it; the locate button turns it back on */
function setFollow(on){FOLLOW=on;$('#locate').classList.toggle('on',on&&!!state.me)}
function followMe(ll){
 if(!map||!FOLLOW||!(state.view==='home'||state.view==='route'))return;
 if(camAt&&m(camAt,ll)<25)return;camAt=ll;
 map.easeTo({center:ll,padding:pad(),duration:RM?0:800});
}
function meMarker(){if(!map)return;const el=h('<div class="me" aria-label="Sinu asukoht"></div>');meMk=mk(el,state.me||DEF_LL);el.style.display=state.me?'':'none'}
const inArea=ll=>ll[0]>24.3&&ll[0]<25.3&&ll[1]>59.25&&ll[1]<59.62;
function setMe(ll,center){
 if(!inArea(ll)){if(!outside){outside=true;toast(L('Oled Tallinnast väljas. Näitan teid kesklinnast.','You’re outside Tallinn. Showing routes from the city centre.'))}return}
 const first=!state.me;state.me=ll;
 if(meMk){meMk.setLngLat(ll);meMk.getElement().style.display=''}
 if(first){LS.set('buss-loc','1');if(state.view==='results'&&!state.from&&state.to)go('results',{fresh:true});if(state.view==='home'){loadNear();if(!center)homeCam()}if(state.view==='search')renderPlaces()}
 if(center&&map){camAt=ll;map.easeTo({center:ll,zoom:16,padding:pad(),duration:RM?0:700})}
 if(first){camAt=ll;nearAt=ll;resAt=ll;setFollow(FOLLOW);return}
 followMe(ll);
 // moved on: nearby stops now, and routes from "your location" from the new spot (the leave time stays)
 if(state.view==='home'&&(!nearAt||m(nearAt,ll)>100)){nearAt=ll;loadNear()}
 if(state.view==='results'&&!state.from&&state.to&&(!resAt||m(resAt,ll)>200)){resAt=ll;compute({})}
}
/* location. A tap always really asks (iPhone only shows its prompt again on a tap). A "denied" answer is believed only
   when the browser's permission state says denied too: iPhone also answers "denied" for a moment after waking, after a
   dismissed prompt, or with location set to "Ask", so then we try once more and keep asking later. */
// iPhone Home Screen app: iOS keeps its location permission apart from Safari's, and its permission state is not to be
// trusted (it says "denied" while location works), so there only a real request counts
const iosApp=()=>isIOS&&standalone();
async function permState(){if(iosApp())return null;try{const p=navigator.permissions&&await navigator.permissions.query({name:'geolocation'});return p?p.state:null}catch(e){return null}}
function appLocHelp(){
 $('#locT').textContent=L('Asukoht on avaekraani äpis keelatud','Location is blocked for the Home Screen app');
 $('#locP').textContent=L('iPhone hoiab avaekraani äpi asukohaloa Safarist eraldi. Safaris töötab, aga see äpp vajab oma luba.','iPhone keeps the Home Screen app’s location permission separate from Safari’s. It works in Safari, but this app needs its own.');
 $('#locSteps').innerHTML=(L(['Kustuta buss avaekraanilt (hoia ikooni all → „Eemalda äpp“).','Ava buss.veebi.dev Safaris ja lisa uuesti avaekraanile.','Ava äpp, puuduta asukohanuppu ja vali „Luba“.','Kui ikka ei tööta: Seaded → Üldine → Teisalda või lähtesta iPhone → Lähtesta → „Lähtesta asukoht ja privaatsus“. Siis küsivad kõik äpid luba uuesti.'],
  ['Delete buss from the Home Screen (touch and hold the icon → “Remove App”).','Open buss.veebi.dev in Safari and add it to the Home Screen again.','Open the app, tap the location button and choose “Allow”.','If it still doesn’t work: Settings → General → Transfer or Reset iPhone → Reset → “Reset Location & Privacy”. All apps will then ask for permission again.'])).map(t=>`<li>${esc(t)}</li>`).join('');
 openDlg('#locDlg');
}
function sysHelp(){
 return isIOS?L('Kontrolli: Seaded → Privaatsus ja turvalisus → Asukohateenused on sees ja Safari veebisaidid → „Rakenduse kasutamise ajal“.','Check: Settings → Privacy & Security → Location Services is on, and Safari Websites → “While Using the App”.')
  :isAndroid?L('Kontrolli, et telefoni asukoht on sisse lülitatud (kiirseadetes).','Check that Location is turned on in the phone’s quick settings.')
  :L('Kontrolli, et arvuti asukohateenused on brauseri jaoks sisse lülitatud.','Check that the computer’s location services are on for this browser.');
}
function locate(ask,cb,again){
 if(!navigator.geolocation){if(ask)toast(L('See brauser ei anna asukohta','This browser can’t share your location'));cb&&cb(false);return}
 navigator.geolocation.getCurrentPosition(p=>{LOCST='granted';setMe([p.coords.longitude,p.coords.latitude],ask&&!cb);watch();cb&&cb(!!state.me)},async e=>{
  const ps=e.code===1?await permState():null;
  if(e.code===1&&ps!=='denied'&&!again){setTimeout(()=>locate(ask,cb,1),500);return}
  if(e.code===1&&iosApp()&&again){LOCST='denied';LS.set('buss-loc','0');if(state.view==='search')renderPlaces();if(state.view==='home')renderHome();if(ask)appLocHelp();cb&&cb(false);return}
  if(e.code===1&&ps==='denied'){LOCST='denied';LS.set('buss-loc','0');if(state.view==='search')renderPlaces();if(state.view==='home')renderHome()}
  if(ask)toast(e.code!==1?L('Asukohta ei leitud. Proovi uuesti.','Couldn’t find your location. Try again.')
   :ps==='denied'?L('Asukoha luba on keelatud. ','Location is blocked for this site. ')+locHelp()
   :ps==='granted'?L('Brauser lubab asukoha, aga seade ei andnud seda. ','The browser allows location, but the device didn’t give it. ')+sysHelp()
   :L('Asukohta ei saanud. Puuduta uuesti ja vali „Luba“.','Couldn’t get your location. Tap again and choose “Allow”.'),e.code===1?9000:undefined);
  cb&&cb(false)},again?{enableHighAccuracy:false,timeout:15000,maximumAge:120000}:{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}
function watch(){if(watchId==null&&navigator.geolocation)watchId=navigator.geolocation.watchPosition(p=>{LOCST='granted';setMe([p.coords.longitude,p.coords.latitude])},e=>{if(e.code===1){navigator.geolocation.clearWatch(watchId);watchId=null}},{enableHighAccuracy:true,maximumAge:15000})}
// back in the app (iPhone stops location while it is in the background): pick it up again quietly
document.addEventListener('visibilitychange',()=>{if(document.hidden||!navigator.geolocation)return;if(state.me){watch();return}permState().then(ps=>{if(ps&&ps!==LOCST){LOCST=ps;if(state.view==='search')renderPlaces()}if(ps==='granted'||(ps==null&&LS.get('buss-loc')==='1'))locate(false)})});

/* ================= favourites in settings: search with the same address search ================= */
let fT=0;
function renderFavRes(){
 const raw=$('#favQ').value.trim(),q=norm(raw);let list;
 if(!q)list=RECENT.filter(p=>!favOf(p)).slice(0,5);
 else{list=[...(geoCache.get(raw)||[]),...stopPlaces(raw)].filter(p=>!favOf(p)).slice(0,6);
  if(!geoCache.has(raw)){clearTimeout(fT);fT=setTimeout(()=>geocode(raw).then(()=>{if($('#favQ').value.trim()===raw)renderFavRes()}),220)}}
 $('#favRes').innerHTML=list.map(p=>{const k=pkey(p);PK.set(k,p);return`<button class="place" data-k="${esc(k)}"><span class="pi">${!q?I.clock:p.stop?I.bus:I.pin}</span><span class="pn"><b>${esc(p.n)}</b><small>${esc(p.s||'')}</small></span><span class="pd">${dTxt(p)}</span></button>`}).join('')
  ||`<div class="note">${q?(geoCache.has(raw)?'Ei leidnud. Proovi aadressi või koha nime.':'Otsin…'):'Kirjuta koha nimi või aadress.'}</div>`;
 $$('#favRes .place').forEach(b=>b.onclick=()=>{openFavAdd(false);openSave(PK.get(b.dataset.k),$('#favAdd'))});
}
function openSave(p,opener,iFav){
 const i=iFav!=null?iFav:FAVS.indexOf(favOf(p)),f=FAVS[i];
 SV={i,p:f?f.p:p.n,a:f?f.a:(p.s||''),ll:f?f.ll:p.ll,ic:f?f.ic:'star',lock:!!f,guessed:false,opener,key:f?pkey(favPlace(f)):pkey(p)};
 $('#saveT').textContent=f?'Muuda lemmikut':'Salvesta lemmikuks';
 $('#saveP').textContent=SV.p;$('#saveA').textContent=SV.a;$('#saveName').value=f?f.n:'';
 $('#saveDel').hidden=!f;$('#saveOk').textContent=f?'Valmis':'Salvesta';
 renderIcons();guessCap();
 $('#save').classList.add('open');$('#scrim').classList.add('on');lens();
 if(isDesk())setTimeout(()=>$('#saveName').focus({preventScroll:true}),RM?0:260);else setTimeout(()=>$('#saveX').focus({preventScroll:true}),RM?0:260);
}
function closeSave(focusStar){
 if(!SV)return;const o=SV.opener,k=SV.key;SV=null;$('#save').classList.remove('open');$('#scrim').classList.remove('on');
 const st=focusStar&&$$('.starbtn').find(b=>b.dataset.star===k&&b.offsetParent);
 if(st){st.classList.add('pop');st.focus({preventScroll:true})}else if(o&&document.contains(o)&&o.offsetParent)o.focus({preventScroll:true});
}
$('#saveOk').onclick=()=>{
 const n=$('#saveName').value.trim()||SV.p,isNew=SV.i<0,key=SV.key;let at=SV.i;
 if(isNew){FAVS.push({n,ic:SV.ic,p:SV.p,a:SV.a,ll:SV.ll});at=FAVS.length-1}else Object.assign(FAVS[SV.i],{n,ic:SV.ic});
 saveFavs();closeSave();refreshFavs(at);
 const st=$$('.starbtn').find(b=>b.dataset.star===key&&b.offsetParent);if(st){st.classList.add('pop');st.focus({preventScroll:true})}
 else if(state.view==='settings'){const r=$$('#favList .fm')[at];if(r)r.focus({preventScroll:true})}
 toast(isNew?`Salvestatud: ${n}`:'Muudetud');
};
$('#saveDel').onclick=()=>{
 const i=SV.i,[x]=FAVS.splice(i,1);saveFavs();closeSave();refreshFavs();
 snack(`${x.n} eemaldatud lemmikutest`,()=>{FAVS.splice(i,0,x);saveFavs();refreshFavs(i)});
};

/* ================= device id, usage count, suggestions (to the VeebiDev admin) ================= */
const UA=navigator.userAgent;
const isIOS=/iPhone|iPad|iPod/.test(UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isAndroid=/Android/.test(UA);
const PLAT=isIOS?'ios':isAndroid?'android':/Mac/.test(UA)?'mac':/Win/.test(UA)?'windows':/Linux|CrOS/.test(UA)?'linux':'other';
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const DEV=(()=>{let id=LS.get('buss-id');if(!id||id.length<16){id=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/-/g,'');LS.set('buss-id',id)}return id})();
function ping(ev){
 if(/HeadlessChrome/.test(UA)||location.hostname==='localhost')return;
 try{fetch(API+'ping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:DEV,ev,plat:PLAT,sa:standalone()?1:0}),keepalive:true}).catch(()=>{})}catch(e){}
}
function openDlg(id){$$('.dlg.open').forEach(d=>d.classList.remove('open'));$(id).classList.add('open');$('#scrim').classList.add('on');lens()}
function closeDlg(id){$(id).classList.remove('open');if(!SV&&!$$('.dlg.open').length)$('#scrim').classList.remove('on')}
$('#scrim').onclick=()=>{if(SV)closeSave();$$('.dlg.open').forEach(d=>closeDlg('#'+d.id))};
addEventListener('keydown',e=>{if(e.key==='Escape'){const d=$('.dlg.open');if(d){e.preventDefault();closeDlg('#'+d.id)}}});
function openSuggest(){$('#sugText').value=LS.get('buss-sug-draft')||'';$('#sugOk').disabled=false;openDlg('#sug');setTimeout(()=>$('#sugText').focus({preventScroll:true}),RM?0:260)}
$('#sugText').oninput=()=>LS.set('buss-sug-draft',$('#sugText').value);
$('#sugX').onclick=()=>closeDlg('#sug');
$('#sugOk').onclick=async()=>{
 const text=$('#sugText').value.trim(),contact=$('#sugContact').value.trim();
 if(text.length<3){toast('Kirjuta paar sõna, mida soovid');$('#sugText').focus();return}
 $('#sugOk').disabled=true;
 try{const r=await fetch(API+'suggest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:DEV,text,contact,plat:PLAT,sa:standalone()?1:0})});if(!r.ok)throw 0;
  LS.set('buss-sug-draft','');$('#sugText').value='';$('#sugContact').value='';closeDlg('#sug');toast('Aitäh! Soovitus jõudis arendajani.')}
 catch(e){$('#sugOk').disabled=false;toast('Ei saanud saata. Proovi hiljem uuesti.')}
};

/* ================= add to home screen, worded for the device ================= */
let BIP=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();BIP=e});
addEventListener('appinstalled',()=>{BIP=null;closeDlg('#inst');ping('install')});
function installSteps(){
 const sh=`<span class="ki">${I.share}</span>`,dots='<span class="ki">⋮</span>';
 if(isIOS){
  const pad=/iPad/.test(UA)||(navigator.platform==='MacIntel');
  if(/CriOS/.test(UA))return L([`Vajuta aadressiribal jagamisnuppu ${sh}`,'Vali „Lisa avakuvale“','Vajuta „Lisa“'],[`Tap the share button ${sh} in the address bar`,'Choose “Add to Home Screen”','Tap “Add”']);
  if(/FxiOS/.test(UA))return L(['Vajuta all menüünuppu <span class="ki">☰</span>','Vali „Jaga“','Vali „Lisa avakuvale“'],['Tap the menu button <span class="ki">☰</span>','Choose “Share”','Choose “Add to Home Screen”']);
  if(/EdgiOS/.test(UA))return L(['Vajuta all menüünuppu <span class="ki">⋯</span>','Vali „Lisa telefoni“'],['Tap the menu button <span class="ki">⋯</span> at the bottom','Choose “Add to phone”']);
  return L([`Vajuta ${pad?'üleval':'all'} jagamisnuppu ${sh}`,'Keri alla ja vali „Lisa avakuvale“','Vajuta „Lisa“'],[`Tap the share button ${sh} at the ${pad?'top':'bottom'}`,'Scroll down and choose “Add to Home Screen”','Tap “Add”']);
 }
 if(isAndroid){
  if(/SamsungBrowser/.test(UA))return L(['Vajuta all menüünuppu <span class="ki">☰</span>','Vali „Lisa leht“','Vali „Avaekraan“'],['Tap the menu button <span class="ki">☰</span> at the bottom','Choose “Add page to”','Choose “Home screen”']);
  if(/Firefox/.test(UA))return L([`Vajuta menüünuppu ${dots}`,'Vali „Paigalda“'],[`Tap the menu button ${dots}`,'Choose “Install”']);
  return L([`Vajuta paremal üleval ${dots}`,'Vali „Lisa avaekraanile“ või „Installi rakendus“'],[`Tap ${dots} at the top right`,'Choose “Add to Home screen” or “Install app”']);
 }
 if(/Macintosh/.test(UA)&&/Safari/.test(UA)&&!/Chrome|Chromium|Edg|Firefox/.test(UA))return L(['Vali menüüst „Fail“','Vali „Lisa Dokki“'],['Open the “File” menu','Choose “Add to Dock”']);
 if(/Chrome|Edg/.test(UA))return L(['Vajuta aadressiriba paremas otsas paigaldamise ikooni',`või menüü ${dots} › „Salvesta ja jaga“ › „Installi“`],['Click the install icon at the right end of the address bar',`or menu ${dots} › “Cast, save, and share” › “Install page as app”`]);
 return null;
}
function openInstall(auto){
 if(standalone()){toast(L('Rakendus on juba avaekraanil','The app is already on your home screen'));return}
 const st=BIP?null:installSteps();
 if(!BIP&&!st){if(!auto)toast(L('Selles brauseris ei saa avaekraanile lisada. Proovi Chrome\'i või Safarit.','This browser can’t add apps to the home screen. Try Chrome or Safari.'));return}
 const ph=isIOS||isAndroid;
 $('#instT').textContent=ph?L('Lisa avaekraanile','Add to Home Screen'):L('Paigalda arvutisse','Install on this computer');
 $('#instP').textContent=L('Siis avaneb buss.veebi.dev nagu äpp: ühe puudutusega, ilma aadressiribata.','Then buss.veebi.dev opens like an app: one tap, no address bar.');
 $('#instNo').textContent=L('Hiljem','Later');
 $('#instSteps').innerHTML=st?st.map(s=>`<li>${s}</li>`).join(''):'';
 $('#instSteps').hidden=!st;
 $('#instOk').textContent=BIP?(ph?L('Lisa avaekraanile','Add'):L('Paigalda','Install')):L('Selge','Got it');
 if(isIOS&&!BIP)$('#inst').dataset.arrow=/iPad|Macintosh/.test(UA)?'up':(/CriOS|EdgiOS/.test(UA)?'up':'down');else delete $('#inst').dataset.arrow;
 openDlg('#inst');if(auto)LS.set('buss-inst-at',String(Date.now()));
}
$('#instOk').onclick=async()=>{if(BIP){const e=BIP;BIP=null;e.prompt();try{await e.userChoice}catch(x){}}closeDlg('#inst')};
$('#instNo').onclick=()=>{LS.set('buss-inst-at',String(Date.now()));closeDlg('#inst')};
$('#instX').onclick=()=>closeDlg('#inst');
$('#locX').onclick=$('#locOk').onclick=()=>closeDlg('#locDlg');
document.addEventListener('click',e=>{if(e.target.closest('[data-lochelp]'))appLocHelp()});
let instDone=false;
function maybeInstall(){
 if(instDone||standalone()||LS.get('buss-tut')!=='1'||$('.dlg.open')||SV||$('#tut').classList.contains('on'))return;
 if(!isIOS&&!isAndroid&&!BIP)return; // computers: only when the browser itself offers it
 const last=+(LS.get('buss-inst-at')||0);if(Date.now()-last<21*864e5)return;
 instDone=true;openInstall(true);
}

/* ================= first-time guide ================= */
const TUT=[
 {t:'Tere tulemast',p:'Siit leiad kiireima tee Tallinnas ja selle ümber: buss, tramm, troll, maakonnabuss, Elroni rong ja kõnd. Linnaliinid live-aegadega otse transport.tallinn.ee-st.'},
 {el:'#openSearch',t:'Kuhu lähed?',p:'Kirjuta aadress, koha või peatuse nimi. Näitan mitut teed ja millal kohale jõuad. Lahkumise või kohalejõudmise aja saad ise valida.'},
 {el:'#near',t:'Lähedal',p:'Väljumised lähimatest peatustest, hilinemised kohe näha. Puuduta rida ja näed sõidukit kaardil.'},
 {el:'#grab',phone:1,t:'Lohista riba',p:'Tõmba riba alla, kui tahad kaarti näha, ja üles, kui tahad rohkem näha. Seaded sulgevad samamoodi.'},
 {el:'#favChips',t:'Lemmikud',p:'Vajuta otsingus tähte ja koht jääb siia ühe puudutuse kaugusele. Kodu, töö, trenn.'},
 {t:'Jõua kiiremini',ic:'run',p:'Teede juures on lüliti „Jõua kiiremini“. See näitab, kus tasub sörkida või kiirelt joosta, et varasemale bussile jõuda.'},
 {t:L('Luba asukoht','Allow location'),ic:'locate',p:L('Siis näitan lähimaid peatusi ja teed otse sinu juurest. Asukoht jääb sinu seadmesse.','Then I show the nearest stops and routes straight from where you are. Your location stays on your device.'),loc:1}
];
let tutI=0,tutL=[];
function startTut(){
 if(state.view!=='home')go('home',{instant:true});
 tutL=TUT.filter(s=>!(s.phone&&isDesk())&&!(s.loc&&state.me));tutI=0;
 $('#tut').classList.add('on');showTut();ping('tutorial');
}
function showTut(){
 const s=tutL[tutI],box=$('#tutBox'),ring=$('#tutRing');
 $('#tutT').textContent=s.t;$('#tutP').textContent=s.p;
 $('#tutIc').innerHTML=s.ic?I[s.ic]:'';$('#tutIc').hidden=!s.ic;
 $('#tutDots').innerHTML=tutL.map((_,i)=>`<i class="${i===tutI?'on':''}"></i>`).join('');
 const last=tutI===tutL.length-1;
 $('#tutNext').textContent=s.loc?L('Luba asukoht','Allow location'):last?'Valmis':'Edasi';
 $('#tutSkip').textContent=s.loc?L('Hiljem','Later'):last?'':'Jäta vahele';$('#tutSkip').hidden=last&&!s.loc;
 const el=s.el&&$(s.el),r=el&&el.offsetParent?el.getBoundingClientRect():null;
 if(r&&r.width){const pdg=6;Object.assign(ring.style,{left:r.left-pdg+'px',top:r.top-pdg+'px',width:r.width+pdg*2+'px',height:Math.min(r.height,innerHeight*.4)+pdg*2+'px'});ring.classList.add('on');
  const bh=box.offsetHeight||200,below=r.bottom+16+bh<innerHeight-12;box.style.top=(below?Math.min(r.bottom+16,innerHeight-bh-12):Math.max(12,r.top-16-bh))+'px';box.classList.remove('mid')}
 else{ring.classList.remove('on');box.style.top='';box.classList.add('mid')}
 lens();
}
function endTut(){$('#tut').classList.remove('on');LS.set('buss-tut','1')}
$('#tutNext').onclick=()=>{const s=tutL[tutI];if(s.loc){locate(true);endTut();return}if(tutI<tutL.length-1){tutI++;showTut()}else endTut()};
$('#tutSkip').onclick=()=>{const loc=tutL[tutI].loc;endTut();if(!loc)locate(false)}; // skipped the tour: still ask for the location ("Hiljem" on the location step: next visit)
addEventListener('keydown',e=>{if($('#tut').classList.contains('on')){if(e.key==='Escape')endTut();if(e.key==='ArrowRight'||e.key==='Enter'){e.preventDefault();$('#tutNext').click()}}});
addEventListener('resize',()=>{if($('#tut').classList.contains('on'))setTimeout(showTut,150)});

/* ================= Rakendus rows in settings ================= */
$('#appSug').onclick=openSuggest;
$('#appInst').onclick=()=>openInstall(false);
$('#appTut').onclick=()=>{closeSettings();setTimeout(startTut,RM?0:350)};
$('#appInst').hidden=standalone();

/* ================= start ================= */
state.run=LS.get('buss-run')==='1';
renderHome();setSheet(snapFor('home'),true);lens();syncRun();
loadData().then(()=>{loadNotes();if(ALARM)tickAlarm();renderHome();if(state.to)go(state.view)}).catch(()=>{$('#nearSub').textContent='Sõiduplaani ei saanud laadida';toast('Sõiduplaani ei saanud laadida. Kontrolli internetiühendust.')});
if(window.maplibregl)initMap();else{$('#maploading').textContent='Kaarti ei saanud laadida. Kontrolli internetiühendust.'}
document.fonts&&document.fonts.ready.then(()=>lens(true));
/* location: used at once when allowed; asked on every visit until it is allowed or blocked (the tutorial asks on its last step) */
(async()=>{let st='prompt';if(iosApp()){if(LS.get('buss-loc')==='1')locate(false);return}try{const p=navigator.permissions&&await navigator.permissions.query({name:'geolocation'});if(p){st=p.state;LOCST=st;p.onchange=()=>{LOCST=p.state;if(p.state==='granted')locate(false);if(state.view==='search')renderPlaces()}}else if(LS.get('buss-loc')==='1')st='granted'}catch(e){}
 if(st==='granted')locate(false);else if(st==='prompt'&&LS.get('buss-tut')==='1')setTimeout(()=>locate(false),700)})();
ping('open');
if(LS.get('buss-tut')!=='1')setTimeout(startTut,RM?200:900);
else{const v=+(LS.get('buss-visits')||0)+1;LS.set('buss-visits',String(v));if(v>=2)setTimeout(maybeInstall,6000)}
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.BUSS={get map(){return map},state,ROUTES,get RT(){return RT},MOV,get VEHS(){return VEHS}}; // for tests in the browser console
// for the headless tests only (?debug): no effect otherwise
if(/[?&]debug\b/.test(location.search))window.__buss={get map(){return map},state,ROUTES,WALK,get RT(){return RT}};
