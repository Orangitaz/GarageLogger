// Garage Log shared logic: dates, text helpers and the merge used when two devices have edited the same data.
// Nothing here touches the page or the app's own state, so it is loaded first by the app and can be tested directly with Node (tests/lib.test.js).
const b64=t=>btoa(unescape(encodeURIComponent(t)));
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const addM=(s,n)=>{const d=new Date(s+"T00:00:00"),day=d.getDate();d.setMonth(d.getMonth()+n);if(d.getDate()!==day)d.setDate(0);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const repTxt=n=>n%12===0?(n===12?"year":n/12+" years"):n+" months";
const nextDate=(d,n)=>{let x=addM(d||today(),n),i=0;while(x<=today()&&i++<60)x=addM(x,n);return x};
const vDates=v=>[v.kind==="offroad"&&v.ohv&&{k:"ohv",l:"OHV sticker expires",date:v.ohv,rep:v.ohvRep??24},v.kind!=="mower"&&v.reg&&{k:"reg",l:"Registration expires",date:v.reg,rep:v.regRep??24}].filter(Boolean).concat((v.dts||[]).filter(x=>x.date).map(x=>({k:"dt:"+x.id,l:x.l||"Other date",date:x.date,rep:x.rep??24})));
const partsOf=r=>(r.parts?[r.parts]:[]).concat(r.pl||[]).concat((r.iu||[]).map(x=>x.n+" ×"+x.q+(x.u?" "+x.u:"")));
const fmtD=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const addD=(s,n)=>{const d=new Date(s+"T00:00:00");d.setDate(d.getDate()+n);return fmtD(d)};
const ago2=d=>d<=0?"today":d<60?d+" days":d<730?Math.round(d/30.4)+" months":(d/365).toFixed(1)+" years";
const fixUrl=u=>{u=String(u||"").trim();if(!u)return"";if(!/^https?:\/\//i.test(u))u="https://"+u;try{new URL(u);return u}catch(e){return""}};
const seen=t=>{if(!t)return"Never signed in";const m=Math.round((Date.now()-t)/6e4);return"Signed in "+(m<2?"just now":m<60?m+" min ago":m<2880?Math.round(m/60)+" hours ago":Math.round(m/1440)+" days ago")};
const clone=o=>JSON.parse(JSON.stringify(o));
const norm=o=>{o.records=(o.records||[]).filter(r=>r.type!=="fuel");o.vehicles=o.vehicles||[];o.vehicles.forEach(fixV);return o};
const cmp=o=>JSON.stringify(Object.assign({},o,{cur:null,rev:0}));
const SPECS=[["oilW","Oil weight","5W-30"],["oilC","Oil capacity","4.5 qt"],["oilF","Oil filter #",""],["airF","Air filter #",""],["blade","Blade / belt #",""],["fuelF","Fuel filter #",""],["plug","Spark plugs",""],["tire","Tire size",""]];
const fixV=v=>{v.specs=v.specs||{};if(!v.plist){const sp=v.specs;v.plist=SPECS.filter(([k])=>sp[k]).map(([k,l])=>({l,v:sp[k]}));if(sp.other)v.plist.push({l:"Other",v:sp.other})}if(!v.pclean){v.plist=v.plist.filter(r=>r.v||!SPECS.some(x=>x[1]===r.l));v.pclean=1}v.kind=v.kind==="atv"||v.kind==="bike"?"offroad":v.kind||"car";v.meter=v.meter||"dist"};
const AK=["vehicles","records","inv"],SK=["units","presets","alert","lastNext"];
function diff(a,b){
  const o={};
  for(const k of AK){
    const am=new Map((a[k]||[]).map(x=>[x.id,JSON.stringify(x)])),bm=new Map((b[k]||[]).map(x=>[x.id,x])),ups=[];
    for(const[id,x]of bm)if(am.get(id)!==JSON.stringify(x))ups.push(x);
    const del=[...am.keys()].filter(id=>!bm.has(id));
    if(ups.length||del.length)o[k]={ups,del};
  }
  for(const k of SK)if(JSON.stringify(a[k])!==JSON.stringify(b[k]))o[k]={set:b[k]};
  return o;
}
function apply(T,o){
  for(const k of AK)if(o[k]){const m=new Map((T[k]||[]).map(x=>[x.id,x]));o[k].del.forEach(id=>m.delete(id));o[k].ups.forEach(x=>m.set(x.id,x));T[k]=[...m.values()]}
  for(const k of SK)if(o[k]){if(o[k].set===undefined)delete T[k];else T[k]=o[k].set}
  return T;
}

if(typeof module!=="undefined")module.exports={b64,esc,uid,today,addM,repTxt,nextDate,vDates,partsOf,fmtD,addD,ago2,fixUrl,seen,clone,norm,cmp,SPECS,fixV,AK,SK,diff,apply};
