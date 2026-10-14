const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const DIR=process.env.DATA_DIR||"/data",FILE=path.join(DIR,"db.json"),PHOTOS=path.join(DIR,"photos"),BACKUPS=path.join(DIR,"backups"),ALERT_STATE=path.join(DIR,"alert-state.json"),PORT=+process.env.PORT||3000;
fs.mkdirSync(PHOTOS,{recursive:true});
const ST={"/manifest.webmanifest":"application/manifest+json","/sw.js":"text/javascript","/icon.svg":"image/svg+xml","/icon-192.png":"image/png","/icon-512.png":"image/png","/apple-touch-icon.png":"image/png"};
const EXT={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"},MIME={jpg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"};
const JSON_H={"Content-Type":"application/json","Cache-Control":"no-store"};

// ---------- data file ----------
const read=()=>{try{return JSON.parse(fs.readFileSync(FILE,"utf8"))}catch(e){return{}}};
const ymd=(tz,d=new Date())=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:tz||undefined}).format(d)}catch(e){return d.toISOString().slice(0,10)}};

// One copy of db.json per day (taken before the first change of that day), newest 14 kept.
function snapshot(){
  try{
    if(!fs.existsSync(FILE))return;
    fs.mkdirSync(BACKUPS,{recursive:true});
    const f=path.join(BACKUPS,"db-"+ymd()+".json");
    if(fs.existsSync(f))return;
    fs.copyFileSync(FILE,f);
    const all=fs.readdirSync(BACKUPS).filter(x=>/^db-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
    while(all.length>14)fs.unlinkSync(path.join(BACKUPS,all.shift()));
  }catch(e){console.error("backup failed:",e.message)}
}
function write(d){
  snapshot();
  try{fs.copyFileSync(FILE,FILE+".bak")}catch(e){}
  fs.writeFileSync(FILE+".tmp",JSON.stringify(d));fs.renameSync(FILE+".tmp",FILE);
}

// ---------- photos are stored as files, not inside db.json ----------
function savePhoto(buf,ext){
  const name=crypto.createHash("sha1").update(buf).digest("hex").slice(0,16)+"."+ext,f=path.join(PHOTOS,name);
  if(!fs.existsSync(f))fs.writeFileSync(f,buf);
  return name;
}
function dataUrlToFile(u){
  if(typeof u!=="string"||!u.startsWith("data:image/"))return u;
  const i=u.indexOf(";base64,"),ext=i<0?null:EXT[u.slice(5,i)];
  return ext?"photos/"+savePhoto(Buffer.from(u.slice(i+8),"base64"),ext):u;
}
function movePhotos(d){
  let changed=false;
  const f=u=>{const r=dataUrlToFile(u);if(r!==u)changed=true;return r};
  (d.vehicles||[]).forEach(v=>{if(v.cover)v.cover=f(v.cover)});
  (d.records||[]).forEach(r=>{if(Array.isArray(r.ph))r.ph=r.ph.map(f);if(Array.isArray(r.rc))r.rc=r.rc.map(f)});
  return changed;
}
// Existing installs: move photos out of db.json once, keeping a copy of the original first.
{
  const d=read();
  if(Array.isArray(d.vehicles)&&movePhotos(d)){
    try{fs.mkdirSync(BACKUPS,{recursive:true});const f=path.join(BACKUPS,"db-before-photo-move.json");if(!fs.existsSync(f))fs.copyFileSync(FILE,f)}catch(e){}
    write(d);console.log("Moved photos out of db.json");
  }
}

// ---------- reminder alerts ----------
const DAY=864e5;
function dueItems(S,tz){
  const out=[],today=ymd(tz),units=S.units==="metric"?"km":"mi",R=S.records||[];
  const days=s=>Math.round((new Date(s+"T00:00:00Z")-new Date(today+"T00:00:00Z"))/DAY);
  for(const v of S.vehicles||[]){
    const hrs=v.meter==="hrs",unit=hrs?"hrs":units,sd=+v.soonDays||30,sm=+v.soonDist||(hrs?10:500);
    const lo=Math.max(0,...R.filter(r=>r.vid===v.id&&r.type!=="reminder"&&r.odo!==""&&r.odo!=null).map(r=>+r.odo||0));
    const info=r=>{
      let st=0;const p=[];
      if(r.date){const d=days(r.date);st=d<0?2:d<=sd?1:0;p.push(d<0?`${-d}d overdue`:d===0?"due today":`in ${d}d`)}
      if(r.odo!==""&&r.odo!=null){const d=r.odo-lo;st=Math.max(st,d<=0?2:d<=sm?1:0);p.push(d<=0?`${-d} ${unit} over`:`in ${d} ${unit}`)}
      return{st,txt:p.join(" / ")};
    };
    for(const r of R.filter(r=>r.vid===v.id&&r.type==="reminder"&&!r.done)){const i=info(r);if(i.st>=1)out.push({id:r.id,name:v.name,what:r.desc||"Reminder",st:i.st,txt:i.txt})}
    if(v.kind==="offroad"&&v.ohv){const i=info({date:v.ohv,odo:""});if(i.st>=1)out.push({id:"ohv:"+v.id,name:v.name,what:"OHV sticker expires",st:i.st,txt:i.txt})}
  }
  return out.sort((a,b)=>b.st-a.st);
}
async function sendAlert(a,title,message,urgent){
  const h={};let body;
  if(a.fmt==="json"){h["Content-Type"]="application/json";body=JSON.stringify({title,message,priority:urgent?8:5})}
  else{h["Content-Type"]="text/plain";h.Title=title;h.Tags="wrench";h.Priority=urgent?"high":"default";body=message}
  const r=await fetch(a.url,{method:"POST",headers:h,body,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error("HTTP "+r.status);
}
let alertRunning=false;
async function runAlerts(){
  if(alertRunning)return;alertRunning=true;
  try{
    const S=read(),a=S.alert;
    if(!a||!/^https?:\/\//.test(a.url||""))return;
    const tz=a.tz||undefined,hour=+new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",hourCycle:"h23"}).format(new Date());
    if(hour<(+a.hour||8))return;
    const items=dueItems(S,tz),today=ymd(tz);
    let st={};try{st=JSON.parse(fs.readFileSync(ALERT_STATE,"utf8"))}catch(e){}
    const sent=st.sent||{};
    // Tell me when something first becomes due soon, again when it goes overdue, then weekly while it stays overdue.
    const fresh=items.filter(i=>{const s=sent[i.id];return !s||s.st<i.st||(i.st===2&&(Date.parse(today)-Date.parse(s.at))/DAY>=7)});
    const next={};
    if(fresh.length){
      const over=items.filter(i=>i.st===2).length,soon=items.length-over;
      const title="Garage Log: "+[over&&over+" overdue",soon&&soon+" due soon"].filter(Boolean).join(", ");
      await sendAlert(a,title,items.map(i=>`${i.name}: ${i.what} (${i.txt})`).join("\n"),over>0);
      for(const i of items)next[i.id]={st:i.st,at:today};
    }else for(const i of items)if(sent[i.id])next[i.id]=sent[i.id];
    fs.writeFileSync(ALERT_STATE,JSON.stringify({sent:next}));
  }catch(e){console.error("alert failed:",e.message)}
  finally{alertRunning=false}
}
setTimeout(runAlerts,20000);setInterval(runAlerts,15*60e3);

// ---------- http ----------
const body=(req,limit,cb)=>{
  const b=[];let n=0,dead=false;
  req.on("data",c=>{n+=c.length;if(n>limit){dead=true;req.destroy()}else b.push(c)});
  req.on("end",()=>{if(!dead)cb(Buffer.concat(b))});
  req.on("error",()=>{});
};
http.createServer((req,res)=>{
  const u=req.url.split("?")[0];
  if(u==="/api/state"){
    if(req.method==="GET"){
      let d="{}";try{d=fs.readFileSync(FILE,"utf8")}catch(e){}
      res.writeHead(200,JSON_H);return res.end(d);
    }
    if(req.method==="PUT")return body(req,300e6,buf=>{
      try{
        const d=JSON.parse(buf.toString());
        if(!d||typeof d!=="object"||!Array.isArray(d.vehicles))throw 0;
        const cur=read();
        // Another device saved since this one last synced: hand back the latest so the app can merge.
        if((d.rev|0)!==(cur.rev|0)){res.writeHead(409,JSON_H);return res.end(JSON.stringify(cur))}
        movePhotos(d);d.rev=(cur.rev|0)+1;write(d);
        res.writeHead(200,JSON_H);res.end(JSON.stringify({rev:d.rev}));
      }catch(e){res.writeHead(400).end()}
    });
  }
  if(u==="/api/photo"&&req.method==="POST"){
    const ext=EXT[(req.headers["content-type"]||"").split(";")[0]];
    if(!ext){res.writeHead(415).end();return}
    return body(req,25e6,buf=>{
      if(!buf.length){res.writeHead(400).end();return}
      try{res.writeHead(200,JSON_H);res.end(JSON.stringify({url:"photos/"+savePhoto(buf,ext)}))}catch(e){res.writeHead(500).end()}
    });
  }
  if(u.startsWith("/photos/")){
    const n=u.slice(8);
    if(!/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(n)){res.writeHead(404).end();return}
    try{const b=fs.readFileSync(path.join(PHOTOS,n));res.writeHead(200,{"Content-Type":MIME[n.split(".")[1]],"Cache-Control":"public, max-age=31536000, immutable"});return res.end(b)}
    catch(e){res.writeHead(404).end();return}
  }
  if(u==="/api/alert/test"&&req.method==="POST")return body(req,10e3,async buf=>{
    try{
      const a=JSON.parse(buf.toString());
      if(!/^https?:\/\//.test(a.url||""))throw 0;
      await sendAlert({url:a.url,fmt:a.fmt},"Garage Log test","This is a test message from Garage Log.",false);
      res.writeHead(200,JSON_H);res.end('{"ok":true}');
    }catch(e){res.writeHead(502,JSON_H);res.end('{"ok":false}')}
  });
  if(ST[u]){
    try{const b=fs.readFileSync(path.join(__dirname,"public",u));res.writeHead(200,{"Content-Type":ST[u],"Cache-Control":u==="/sw.js"?"no-cache":"public, max-age=86400"});return res.end(b)}
    catch(e){res.writeHead(404).end();return}
  }
  if(u==="/healthz"){res.writeHead(200,{"Content-Type":"text/plain"});return res.end("ok")}
  if(u==="/"||u==="/index.html"){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
    return res.end(fs.readFileSync(path.join(__dirname,"index.html")));
  }
  res.writeHead(404).end();
}).listen(PORT,"0.0.0.0",()=>console.log("Garage Log listening on "+PORT));
for(const sg of ["SIGTERM","SIGINT"])process.on(sg,()=>process.exit(0));
