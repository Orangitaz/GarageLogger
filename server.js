const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const DIR=process.env.DATA_DIR||"/data",FILE=path.join(DIR,"db.json"),PHOTOS=path.join(DIR,"photos"),BACKUPS=path.join(DIR,"backups"),ALERT_STATE=path.join(DIR,"alert-state.json"),PORT=+process.env.PORT||3000;
const VERSION=(()=>{try{return fs.readFileSync(path.join(__dirname,"VERSION"),"utf8").trim()}catch(e){return"dev"}})(),BUILD=String(process.env.GIT_SHA||"").slice(0,7);
const PASS=process.env.GARAGE_PASSWORD||"",sha=x=>crypto.createHash("sha256").update(String(x)).digest(),PASSH=PASS?sha(PASS):null;
const DOCS=path.join(DIR,"docs");
fs.mkdirSync(PHOTOS,{recursive:true});fs.mkdirSync(DOCS,{recursive:true});
const ST={"/manifest.webmanifest":"application/manifest+json","/sw.js":"text/javascript","/icon.svg":"image/svg+xml","/icon-192.png":"image/png","/icon-512.png":"image/png","/apple-touch-icon.png":"image/png"};
const EXT={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"},DEXT=Object.assign({"application/pdf":"pdf"},{"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}),MIME={jpg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"};
const JSON_H={"Content-Type":"application/json","Cache-Control":"no-store"};

// ---------- data file ----------
// One data context per person. Without accounts there is just one (LEG); with accounts each user gets DIR/users/<name>/.
const LEG={FILE,BACKUPS,ALERT_STATE};
const read=(c=LEG)=>{try{return JSON.parse(fs.readFileSync(c.FILE,"utf8"))}catch(e){return{}}};
const ymd=(tz,d=new Date())=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:tz||undefined}).format(d)}catch(e){return d.toISOString().slice(0,10)}};

// One copy of db.json per day (taken before the first change of that day), newest 14 kept.
function snapshot(c=LEG){
  try{
    if(!fs.existsSync(c.FILE))return;
    fs.mkdirSync(c.BACKUPS,{recursive:true});
    const f=path.join(c.BACKUPS,"db-"+ymd()+".json");
    if(fs.existsSync(f))return;
    fs.copyFileSync(c.FILE,f);
    const all=fs.readdirSync(c.BACKUPS).filter(x=>/^db-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
    while(all.length>14)fs.unlinkSync(path.join(c.BACKUPS,all.shift()));
  }catch(e){console.error("backup failed:",e.message)}
}
function write(d,c=LEG){
  fs.mkdirSync(path.dirname(c.FILE),{recursive:true});
  snapshot(c);
  try{fs.copyFileSync(c.FILE,c.FILE+".bak")}catch(e){}
  fs.writeFileSync(c.FILE+".tmp",JSON.stringify(d));fs.renameSync(c.FILE+".tmp",c.FILE);
}

// ---------- accounts (optional; turned on from Settings) ----------
const USERS=path.join(DIR,"users.json"),UDIR=path.join(DIR,"users"),DAYMS=864e5;
let ACC=null;
const loadAcc=()=>{try{const a=JSON.parse(fs.readFileSync(USERS,"utf8"));ACC=a&&a.users&&a.secret?a:null}catch(e){ACC=null}};
const saveAcc=()=>{fs.writeFileSync(USERS+".tmp",JSON.stringify(ACC));fs.renameSync(USERS+".tmp",USERS)};
loadAcc();
const uctx=n=>({FILE:path.join(UDIR,n,"db.json"),BACKUPS:path.join(UDIR,n,"backups"),ALERT_STATE:path.join(UDIR,n,"alert-state.json")});
const UNAME=/^[a-z0-9][a-z0-9._-]{1,31}$/;
const hmac=(k,x)=>crypto.createHmac("sha256",k).update(x).digest("hex");
const scrypt=(pw,salt)=>new Promise((ok,no)=>crypto.scrypt(String(pw),salt,32,{N:16384,r:8,p:1},(e,k)=>e?no(e):ok(k)));
async function mkPw(pw){const salt=crypto.randomBytes(16);return{s:salt.toString("hex"),h:(await scrypt(pw,salt)).toString("hex")}}
async function checkPw(u,pw){if(!u)return false;const k=await scrypt(pw,Buffer.from(u.s,"hex"));return crypto.timingSafeEqual(k,Buffer.from(u.h,"hex"))}
const pv=u=>crypto.createHash("sha256").update(u.h).digest("hex").slice(0,8);
const b64u=x=>Buffer.from(x).toString("base64url");
const mkTok=n=>{const p=b64u(JSON.stringify({u:n,e:Date.now()+90*DAYMS,v:pv(ACC.users[n])}));return p+"."+hmac(ACC.secret,"s:"+p)};
function userOf(req){
  if(!ACC)return null;
  const m=/^Bearer (.+)$/i.exec(req.headers.authorization||"");if(!m)return null;
  const[p,sig]=m[1].split(".");if(!p||!sig)return null;
  const want=hmac(ACC.secret,"s:"+p);if(sig.length!==want.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(want)))return null;
  try{const j=JSON.parse(Buffer.from(p,"base64url").toString()),u=ACC.users[j.u];if(u&&j.e>Date.now()&&j.v===pv(u))return j.u}catch(e){}
  return null;
}
// Links that can't send a password (calendar feed, view-only link) carry user.signature instead.
const linkTok=(n,kind)=>n+"."+hmac(ACC.secret,kind+":"+n).slice(0,32);
function linkUser(req,kind){
  if(!ACC)return null;
  const q=new URLSearchParams(req.url.split("?")[1]||""),t=q.get("t")||q.get("ro")||"",i=t.lastIndexOf(".");if(i<1)return null;
  const n=t.slice(0,i);if(!ACC.users[n])return null;
  const want=linkTok(n,kind);return t.length===want.length&&crypto.timingSafeEqual(Buffer.from(t),Buffer.from(want))?n:null;
}
const fails=new Map();
const throttled=k=>{const f=fails.get(k);return !!f&&f.n>=8&&Date.now()<f.until};
const failed=k=>{const f=fails.get(k)||{n:0};if(Date.now()>=(f.until||0))f.n=0;f.n++;f.until=Date.now()+15*60e3;fails.set(k,f)};

// ---------- photos are stored as files, not inside db.json ----------
function saveFile(dir,buf,ext){
  const name=crypto.createHash("sha1").update(ACC?Buffer.concat([buf,Buffer.from(ACC.secret)]):buf).digest("hex").slice(0,16)+"."+ext,f=path.join(dir,name);
  if(!fs.existsSync(f))fs.writeFileSync(f,buf);
  return name;
}
const savePhoto=(buf,ext)=>saveFile(PHOTOS,buf,ext);
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
  for(const v of (S.vehicles||[]).filter(v=>!v.arch)){
    const hrs=v.meter==="hrs",unit=hrs?"hrs":units,sd=+v.soonDays||30,sm=+v.soonDist||(hrs?10:500);
    const lo=Math.max(0,...R.filter(r=>r.vid===v.id&&r.type!=="reminder"&&r.odo!==""&&r.odo!=null).map(r=>+r.odo||0));
    const info=r=>{
      let st=0;const p=[];
      if(r.date){const d=days(r.date);st=d<0?2:d<=sd?1:0;p.push(d<0?`${-d}d overdue`:d===0?"due today":`in ${d}d`)}
      if(r.odo!==""&&r.odo!=null){const d=r.odo-lo;st=Math.max(st,d<=0?2:d<=sm?1:0);p.push(d<=0?`${-d} ${unit} over`:`in ${d} ${unit}`)}
      return{st,txt:p.join(" / ")};
    };
    for(const r of R.filter(r=>r.vid===v.id&&r.type==="reminder"&&!r.done)){const i=info(r);if(i.st>=1)out.push({id:r.id,vid:v.id,name:v.name,what:r.desc||"Reminder",st:i.st,txt:i.txt})}
    // Dates that fall on the same day (registration with inspection/emissions, say) are reported as one item.
    const ds=[];
    if(v.kind==="offroad"&&v.ohv)ds.push({k:"ohv:"+v.id,w:"OHV sticker expires",date:v.ohv});
    if(v.kind!=="mower"&&v.reg)ds.push({k:"reg:"+v.id,w:"Registration expires",date:v.reg});
    for(const x of v.dts||[])if(x.date)ds.push({k:"dt:"+x.id,w:x.l||"Other date",date:x.date});
    const g=new Map();for(const x of ds)g.set(x.date,[...(g.get(x.date)||[]),x]);
    for(const[date,a]of g){const i=info({date,odo:""});if(i.st>=1)out.push({id:a.map(x=>x.k).join("+"),vid:v.id,name:v.name,what:a.length===1?a[0].w:a.map(x=>x.w.replace(/ expires$/,"")).join(" + ")+" expire",st:i.st,txt:i.txt})}
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
  try{for(const c of ACC?Object.keys(ACC.users).map(uctx):[LEG])await runAlertsFor(c)}finally{alertRunning=false}
}
async function runAlertsFor(c){
  try{
    const S=read(c),a=S.alert;
    if(!a||!/^https?:\/\//.test(a.url||""))return;
    const tz=a.tz||undefined,hour=+new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",hourCycle:"h23"}).format(new Date());
    if(hour<(+a.hour||8))return;
    const items=dueItems(S,tz),today=ymd(tz);
    let st={};try{st=JSON.parse(fs.readFileSync(c.ALERT_STATE,"utf8"))}catch(e){}
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
    fs.writeFileSync(c.ALERT_STATE,JSON.stringify({sent:next}));
  }catch(e){console.error("alert failed:",e.message)}
}
setTimeout(runAlerts,20000);setInterval(runAlerts,15*60e3);


// ---------- http ----------
const body=(req,limit,cb)=>{
  const b=[];let n=0,dead=false;
  req.on("data",c=>{n+=c.length;if(n>limit){dead=true;req.destroy()}else b.push(c)});
  req.on("end",()=>{if(!dead)cb(Buffer.concat(b))});
  req.on("error",()=>{});
};
// Calendar subscriptions can't send a password, so when one is set the feed uses a private link instead.
const CALT=PASS?crypto.createHmac("sha256",PASS).update("garagelog-calendar").digest("hex").slice(0,32):"";
const ROT=PASS?crypto.createHmac("sha256",PASS).update("garagelog-readonly").digest("hex").slice(0,32):"";
const roOk=req=>{if(!ROT)return false;const q=new URLSearchParams(req.url.split("?")[1]||""),t=q.get("t")||q.get("ro")||"";return t.length===ROT.length&&crypto.timingSafeEqual(Buffer.from(t),Buffer.from(ROT))};
const calOk=req=>{if(!CALT)return true;const t=new URLSearchParams(req.url.split("?")[1]||"").get("t")||"";return t.length===CALT.length&&crypto.timingSafeEqual(Buffer.from(t),Buffer.from(CALT))};
const icsText=s=>String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
const icsFold=l=>(l.match(/[\s\S]{1,72}/g)||[l]).join("\r\n ");
const d8=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||"")?s.replace(/-/g,""):null;
function calendar(S){
  const ev=[],now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  for(const v of (S.vehicles||[]).filter(v=>!v.arch)){
    for(const r of (S.records||[]).filter(r=>r.vid===v.id&&r.type==="reminder"&&!r.done&&d8(r.date)))ev.push({uid:r.id,date:r.date,sum:v.name+": "+(r.desc||"Reminder")});
    const ds=[];
    if(v.kind==="offroad"&&v.ohv)ds.push({k:"ohv",w:"OHV sticker expires",date:v.ohv});
    if(v.kind!=="mower"&&v.reg)ds.push({k:"reg",w:"Registration expires",date:v.reg});
    for(const x of v.dts||[])if(x.date)ds.push({k:"dt"+x.id,w:x.l||"Other date",date:x.date});
    const g=new Map();for(const x of ds)if(d8(x.date))g.set(x.date,[...(g.get(x.date)||[]),x]);
    for(const[date,a]of g)ev.push({uid:v.id+"-"+a.map(x=>x.k).join("+"),date,sum:v.name+": "+(a.length===1?a[0].w:a.map(x=>x.w.replace(/ expires$/,"")).join(" + ")+" expire")});
  }
  const out=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Garage Log//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:Garage Log","REFRESH-INTERVAL;VALUE=DURATION:PT12H","X-PUBLISHED-TTL:PT12H"];
  for(const e of ev){
    const nx=new Date(e.date+"T00:00:00Z");nx.setUTCDate(nx.getUTCDate()+1);
    out.push("BEGIN:VEVENT","UID:"+icsText(e.uid)+"@garagelog","DTSTAMP:"+now,"DTSTART;VALUE=DATE:"+d8(e.date),"DTEND;VALUE=DATE:"+nx.toISOString().slice(0,10).replace(/-/g,""),"SUMMARY:"+icsText(e.sum),"TRANSP:TRANSPARENT",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsText(e.sum),"TRIGGER:-PT15H","END:VALARM","BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsText(e.sum),"TRIGGER:PT9H","END:VALARM","END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.map(icsFold).join("\r\n")+"\r\n";
}
function authed(req){
  if(!PASS)return true;
  const m=/^Basic (.+)$/i.exec(req.headers.authorization||"");if(!m)return false;
  const t=Buffer.from(m[1],"base64").toString(),i=t.indexOf(":");
  return i>=0&&crypto.timingSafeEqual(sha(t.slice(i+1)),PASSH);
}
// The Android app talks to this server from its own origin, so only those origins (plus any in CORS_ORIGINS) get CORS headers.
const ORIGINS=["http://localhost","https://localhost","capacitor://localhost","ionic://localhost",...String(process.env.CORS_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean)];
http.createServer((req,res)=>{
  const u=req.url.split("?")[0],og=req.headers.origin;
  if(og&&ORIGINS.includes(og)){
    res.setHeader("Access-Control-Allow-Origin",og);res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");res.setHeader("Access-Control-Allow-Methods","GET, PUT, POST, OPTIONS");res.setHeader("Access-Control-Max-Age","86400");
  }
  if(req.method==="OPTIONS"){res.writeHead(204).end();return}
  // Accounts: everything except the app shell, photos and the login calls needs a signed-in user.
  let c=LEG,U=null,linkOnly=false;
  if(ACC){
    U=userOf(req);
    const pub=ST[u]||u==="/healthz"||u==="/api/me"||u==="/api/login"||u==="/api/version"||u.startsWith("/photos/")||u.startsWith("/docs/")||u==="/"||u==="/index.html";
    if(!pub&&!U){
      const kind=u==="/api/state"&&req.method==="GET"?"ro":(u==="/calendar.ics"||u==="/api/summary")&&req.method==="GET"?"cal":null,L=kind&&linkUser(req,kind);
      if(L){U=L;linkOnly=true}
      else{req.resume();res.writeHead(401,JSON_H);return res.end('{"login":true}')}
    }
    if(U)c=uctx(U);
  }
  if(u==="/api/me"&&req.method==="GET"){res.writeHead(200,JSON_H);return res.end(JSON.stringify(ACC?{accounts:true,user:U,admin:!!(U&&ACC.users[U].admin)}:{accounts:false}))}
  const jb=(limit,cb)=>body(req,limit,async buf=>{let j;try{j=JSON.parse(buf.toString())}catch(e){res.writeHead(400,JSON_H);return res.end('{"ok":false}')}
    try{await cb(j||{})}catch(e){res.writeHead(500,JSON_H);res.end('{"ok":false}')}});
  const out=(code,o)=>{res.writeHead(code,JSON_H);res.end(JSON.stringify(o))};
  const ip=req.socket.remoteAddress||"";
  if(u==="/api/login"&&req.method==="POST"){
    if(!ACC){req.resume();return out(404,{ok:false})}
    return jb(4e3,async j=>{
      const n=String(j.user||"").trim().toLowerCase(),k=ip+"|"+n;
      if(throttled(k))return out(429,{ok:false,msg:"Too many tries. Wait 15 minutes and try again."});
      if(UNAME.test(n)&&ACC.users[n]&&await checkPw(ACC.users[n],j.pass||"")){fails.delete(k);return out(200,{ok:true,token:mkTok(n),user:n,admin:!!ACC.users[n].admin})}
      failed(k);await new Promise(r=>setTimeout(r,400));out(401,{ok:false,msg:"Wrong username or password."});
    });
  }
  // Turning accounts on: the first account is the admin and takes over the data that is already on the server.
  if(u==="/api/accounts/setup"&&req.method==="POST"){
    if(ACC){req.resume();return out(409,{ok:false,msg:"Accounts are already on."})}
    return jb(4e3,async j=>{
      const n=String(j.user||"").trim().toLowerCase(),pw=String(j.pass||"");
      if(!UNAME.test(n))return out(400,{ok:false,msg:"Username: 2 to 32 letters, numbers, dot, dash or underscore."});
      if(pw.length<8)return out(400,{ok:false,msg:"Password needs at least 8 characters."});
      const nc=uctx(n);fs.mkdirSync(path.dirname(nc.FILE),{recursive:true});
      try{if(fs.existsSync(FILE))fs.copyFileSync(FILE,nc.FILE);if(fs.existsSync(ALERT_STATE))fs.copyFileSync(ALERT_STATE,nc.ALERT_STATE);
        if(fs.existsSync(BACKUPS)){fs.mkdirSync(nc.BACKUPS,{recursive:true});for(const f of fs.readdirSync(BACKUPS))fs.copyFileSync(path.join(BACKUPS,f),path.join(nc.BACKUPS,f))}}
      catch(e){return out(500,{ok:false,msg:"Couldn't copy your data. Nothing was changed."})}
      ACC={secret:crypto.randomBytes(32).toString("hex"),users:{[n]:Object.assign(await mkPw(pw),{admin:true,created:Date.now()})}};
      saveAcc();out(200,{ok:true,token:mkTok(n),user:n,admin:true});
    });
  }
  if(ACC&&U&&!linkOnly&&u.startsWith("/api/")&&(u==="/api/account/password"||u==="/api/users"||u.startsWith("/api/users/"))){
    const admin=!!ACC.users[U].admin;
    if(u==="/api/account/password"&&req.method==="POST")return jb(4e3,async j=>{
      const pw=String(j.new||"");
      if(!await checkPw(ACC.users[U],j.old||""))return out(403,{ok:false,msg:"The current password is wrong."});
      if(pw.length<8)return out(400,{ok:false,msg:"Password needs at least 8 characters."});
      Object.assign(ACC.users[U],await mkPw(pw));saveAcc();out(200,{ok:true,token:mkTok(U)});
    });
    if(!admin){req.resume();return out(403,{ok:false,msg:"Only the admin can do that."})}
    if(u==="/api/users"&&req.method==="GET")return out(200,Object.keys(ACC.users).sort().map(n=>({name:n,admin:!!ACC.users[n].admin})));
    if(u==="/api/users"&&req.method==="POST")return jb(4e3,async j=>{
      const n=String(j.user||"").trim().toLowerCase(),pw=String(j.pass||"");
      if(!UNAME.test(n))return out(400,{ok:false,msg:"Username: 2 to 32 letters, numbers, dot, dash or underscore."});
      if(ACC.users[n])return out(409,{ok:false,msg:"That username is taken."});
      if(pw.length<8)return out(400,{ok:false,msg:"Password needs at least 8 characters."});
      ACC.users[n]=Object.assign(await mkPw(pw),{admin:false,created:Date.now()});fs.mkdirSync(path.dirname(uctx(n).FILE),{recursive:true});saveAcc();out(200,{ok:true});
    });
    if(u==="/api/users/password"&&req.method==="POST")return jb(4e3,async j=>{
      const n=String(j.user||""),pw=String(j.pass||"");
      if(!ACC.users[n])return out(404,{ok:false,msg:"No such user."});
      if(pw.length<8)return out(400,{ok:false,msg:"Password needs at least 8 characters."});
      Object.assign(ACC.users[n],await mkPw(pw));saveAcc();out(200,{ok:true});
    });
    if(u==="/api/users/remove"&&req.method==="POST")return jb(4e3,async j=>{
      const n=String(j.user||"");
      if(!ACC.users[n])return out(404,{ok:false,msg:"No such user."});
      if(n===U)return out(400,{ok:false,msg:"You can't remove your own account."});
      // Their files are moved aside, not deleted.
      try{const to=path.join(DIR,"removed-users");fs.mkdirSync(to,{recursive:true});fs.renameSync(path.join(UDIR,n),path.join(to,n+"-"+Date.now()))}catch(e){}
      delete ACC.users[n];saveAcc();out(200,{ok:true});
    });
  }
  // Optional password (GARAGE_PASSWORD). The icons, manifest and health check stay open so installing the app still works.
  if(!ACC&&PASS&&!ST[u]&&u!=="/healthz"&&!((u==="/calendar.ics"||u.startsWith("/photos/")||u.startsWith("/docs/"))&&(calOk(req)||(u!=="/calendar.ics"&&roOk(req))))&&!((u==="/api/state"||u==="/"||u==="/index.html")&&req.method==="GET"&&roOk(req))&&!authed(req)){
    req.resume();
    return setTimeout(()=>{res.writeHead(401,{"WWW-Authenticate":'Basic realm="Garage Log", charset="UTF-8"',"Content-Type":"text/plain"});res.end("Password required")},400);
  }
  if(u==="/api/state"){
    if(req.method==="GET"){
      let d="{}";try{d=fs.readFileSync(c.FILE,"utf8")}catch(e){}
      if(ACC?linkOnly:!authed(req)){try{const j=JSON.parse(d);delete j.alert;d=JSON.stringify(j)}catch(e){d="{}"}}
      res.writeHead(200,JSON_H);return res.end(d);
    }
    if(req.method==="PUT")return body(req,300e6,buf=>{
      try{
        const d=JSON.parse(buf.toString());
        if(!d||typeof d!=="object"||!Array.isArray(d.vehicles))throw 0;
        const cur=read(c);
        // Another device saved since this one last synced: hand back the latest so the app can merge.
        if((d.rev|0)!==(cur.rev|0)){res.writeHead(409,JSON_H);return res.end(JSON.stringify(cur))}
        movePhotos(d);d.rev=(cur.rev|0)+1;write(d,c);
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
  if(u==="/api/doc"&&req.method==="POST"){
    const ext=DEXT[(req.headers["content-type"]||"").split(";")[0]];
    if(!ext){req.resume();res.writeHead(415).end();return}
    return body(req,25e6,buf=>{
      if(!buf.length){res.writeHead(400).end();return}
      try{res.writeHead(200,JSON_H);res.end(JSON.stringify({url:"docs/"+saveFile(DOCS,buf,ext)}))}catch(e){res.writeHead(500).end()}
    });
  }
  if(u.startsWith("/docs/")){
    const n=u.slice(6);
    if(!/^[a-f0-9]{16}\.(pdf|jpg|png|webp|gif)$/.test(n)){res.writeHead(404).end();return}
    try{const b=fs.readFileSync(path.join(DOCS,n));res.writeHead(200,{"Content-Type":n.endsWith(".pdf")?"application/pdf":MIME[n.split(".")[1]],"Content-Disposition":"inline","X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=31536000, immutable"});return res.end(b)}
    catch(e){res.writeHead(404).end();return}
  }
  // Read-only status for dashboards (Home Assistant etc.): what is overdue or due soon, per equipment.
  if(u==="/api/summary"&&req.method==="GET"){
    const S=read(c),items=dueItems(S,(S.alert||{}).tz||undefined);
    const vehicles=(S.vehicles||[]).filter(v=>!v.arch).map(v=>{
      const it=items.filter(i=>i.vid===v.id),over=it.filter(i=>i.st===2).length;
      return{id:v.id,name:v.name,kind:v.kind,status:over?"overdue":it.length?"due_soon":"ok",overdue:over,due_soon:it.length-over,items:it.map(i=>({what:i.what,status:i.st===2?"overdue":"due_soon",detail:i.txt}))};
    });
    const overdue=items.filter(i=>i.st===2).length;
    res.writeHead(200,JSON_H);return res.end(JSON.stringify({overdue,due_soon:items.length-overdue,total:items.length,vehicles}));
  }
  if(u==="/calendar.ics"&&req.method==="GET"){res.writeHead(200,{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"no-store"});return res.end(calendar(read(c)))}
  if(u==="/api/readonly"&&req.method==="GET"){res.writeHead(200,JSON_H);return res.end(JSON.stringify({t:ACC?linkTok(U,"ro"):ROT}))}
  if(u==="/api/calendar"&&req.method==="GET"){const ct=ACC?linkTok(U,"cal"):CALT;res.writeHead(200,JSON_H);return res.end(JSON.stringify({path:"calendar.ics"+(ct?"?t="+ct:""),t:ct}))}
  if(u==="/api/backups"&&req.method==="GET"){
    let L=[];try{L=fs.readdirSync(c.BACKUPS).filter(x=>/^db-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse().map(n=>({name:n,date:n.slice(3,13),size:fs.statSync(path.join(c.BACKUPS,n)).size}))}catch(e){}
    res.writeHead(200,JSON_H);return res.end(JSON.stringify(L));
  }
  if(u.startsWith("/backups/")&&req.method==="GET"){
    const n=u.slice(9);
    if(!/^db-\d{4}-\d{2}-\d{2}\.json$/.test(n)){res.writeHead(404).end();return}
    try{const b=fs.readFileSync(path.join(c.BACKUPS,n));res.writeHead(200,{"Content-Type":"application/json","Content-Disposition":'attachment; filename="garage-log-'+n.slice(3)+'"',"Cache-Control":"no-store"});return res.end(b)}
    catch(e){res.writeHead(404).end();return}
  }
  if(u.startsWith("/photos/")){
    const n=u.slice(8);
    if(!/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(n)){res.writeHead(404).end();return}
    try{const b=fs.readFileSync(path.join(PHOTOS,n));res.writeHead(200,{"Content-Type":MIME[n.split(".")[1]],"Cache-Control":"public, max-age=31536000, immutable"});return res.end(b)}
    catch(e){res.writeHead(404).end();return}
  }
  if(u==="/api/version"&&req.method==="GET"){res.writeHead(200,JSON_H);return res.end(JSON.stringify({version:VERSION,build:BUILD}))}
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
    return res.end(fs.readFileSync(path.join(__dirname,"index.html"),"utf8").replace("__VERSION__",VERSION).replace("__BUILD__",BUILD));
  }
  res.writeHead(404).end();
}).listen(PORT,"0.0.0.0",()=>console.log("Garage Log listening on "+PORT));
for(const sg of ["SIGTERM","SIGINT"])process.on(sg,()=>process.exit(0));
