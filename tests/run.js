// Server checks. Run with: node tests/run.js   (no packages needed; starts its own server on a temporary data folder)
const {spawn}=require("child_process"),fs=require("fs"),os=require("os"),path=require("path"),zlib=require("zlib"),http=require("http");
let bad=0;const T=(ok,m)=>{console.log((ok?"PASS ":"FAIL ")+m);if(!ok)bad++};
function start(env,reuse){
  const dir=reuse||fs.mkdtempSync(path.join(os.tmpdir(),"gl-")),port=3300+Math.floor(Math.random()*500);
  const p=spawn("node",[path.join(__dirname,"..","server.js")],{env:Object.assign({},process.env,{DATA_DIR:dir,PORT:port},env),stdio:"ignore"});
  return{dir,port,stop:(keep)=>{p.kill();if(!keep)fs.rmSync(dir,{recursive:true,force:true})}};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function listener(redirect){const L={hits:0,port:0};const srv=http.createServer((q,r)=>{L.hits++;q.resume();if(redirect){r.writeHead(302,{Location:redirect});r.end()}else{r.writeHead(200);r.end("ok")}});
  return new Promise(ok=>srv.listen(0,"127.0.0.1",()=>{L.port=srv.address().port;L.close=()=>srv.close();ok(L)}))}
function req(port,method,p,{body,tok,ct,headers}={}){
  return new Promise(ok=>{
    const h=Object.assign({},headers||{});if(tok)h.Authorization="Bearer "+tok;
    let data=body;if(body!==undefined&&typeof body!=="string"&&!Buffer.isBuffer(body)){data=JSON.stringify(body);h["Content-Type"]=ct||"application/json"}else if(data!==undefined)h["Content-Type"]=ct||"text/plain";
    const r=http.request({port,method,path:p,headers:h,agent:false},res=>{const c=[];res.on("data",x=>c.push(x));res.on("end",()=>{const b=Buffer.concat(c);let j=null;try{j=JSON.parse(b.toString())}catch(e){}ok({s:res.statusCode,j,b,h:res.headers})})});
    r.on("error",()=>ok({s:0,j:null,b:Buffer.alloc(0),h:{}}));if(data!==undefined)r.write(data);r.end();
  });
}
(async()=>{
  // ----- no accounts -----
  let S=start({});await wait(1200);let g=S.port;
  let r=await req(g,"GET","/healthz");T(r.s===200,"health check");
  r=await req(g,"POST","/api/accounts/setup",{body:'{"user":"evil","pass":"longpassword1"}',ct:"text/plain"});T(r.s===415,"plain-text POST can't turn accounts on");
  r=await req(g,"GET","/api/me");T(r.j&&r.j.accounts===false,"accounts still off after that attempt");
  r=await req(g,"PUT","/api/state",{body:'{"vehicles":[]}',ct:"text/plain"});T(r.s===415,"plain-text PUT refused");
  r=await req(g,"POST","/api/alert/test",{body:'{"url":"http://127.0.0.1:1/"}',ct:"text/plain"});T(r.s===415,"plain-text alert test refused");
  r=await req(g,"PUT","/api/state",{body:{vehicles:[{id:"a",name:"Truck 🚚"}],records:[],rev:0}});T(r.s===200,"save state");
  r=await req(g,"GET","/api/state",{headers:{"Accept-Encoding":"gzip"}});T(r.s===200&&JSON.parse(r.b.toString()).vehicles.length===1,"read state back");
  const big={vehicles:[],records:[],rev:1};for(let i=0;i<200;i++)big.vehicles.push({id:"v"+i,name:"Vehicle number "+i});
  r=await req(g,"PUT","/api/state",{body:big});r=await req(g,"GET","/api/state",{headers:{"Accept-Encoding":"gzip"}});
  T(r.h["content-encoding"]==="gzip"&&JSON.parse(zlib.gunzipSync(r.b).toString()).vehicles.length===200,"large state is gzipped and intact");
  r=await req(g,"GET","/",{headers:{"Accept-Encoding":"br"}});const html=zlib.brotliDecompressSync(r.b).toString();
  T(r.h["content-encoding"]==="br"&&/<title>/.test(html)&&!/__VERSION__/.test(html),"page is brotli compressed with the version filled in");
  const et=r.h.etag;r=await req(g,"GET","/",{headers:{"If-None-Match":et}});T(r.s===304,"page answers 304 when unchanged");
  r=await req(g,"GET","/");T(/frame-ancestors 'none'/.test(r.h["content-security-policy"]||"")&&r.h["x-frame-options"]==="DENY"&&r.h["x-content-type-options"]==="nosniff"&&r.h["referrer-policy"]==="no-referrer","security headers");
  r=await req(g,"GET","/calendar.ics");const ics=r.b.toString("utf8");T(r.s===200&&ics.includes("BEGIN:VCALENDAR"),"calendar served");
  S.stop();
  // calendar folding keeps emoji whole and lines under 76 bytes
  S=start({});await wait(1200);g=S.port;
  const st={vehicles:[{id:"x",name:"🚚".repeat(40)+" pickup",reg:"2030-01-15",kind:"truck"}],records:[],rev:0};
  await req(g,"PUT","/api/state",{body:st});r=await req(g,"GET","/calendar.ics");const lines=r.b.toString("utf8").split("\r\n");
  T(lines.every(l=>Buffer.byteLength(l)<=75)&&!r.b.toString("utf8").includes("�"),"calendar lines are 75 bytes or less and emoji aren't split");
  S.stop();
  // ----- accounts -----
  S=start({});await wait(1200);g=S.port;
  const P=(p,b,tok)=>req(g,"POST",p,{body:b,tok});
  r=await P("/api/accounts/setup",{user:"mike",pass:"password1"});T(r.s===200&&r.j.admin,"admin created");const A=r.j.token;
  r=await P("/api/users",{user:"kim",pass:"kimspass1"},A);T(r.s===200,"add user");
  const K=(await P("/api/login",{user:"kim",pass:"kimspass1"})).j.token;
  // alerts: the server contacts the saved address, so who may point it where matters (see the block further down)
  r=await P("/api/users/disable",{user:"kim",disabled:true},A);T(r.s===200&&(await req(g,"GET","/api/state",{tok:K})).s===401,"turned-off user is signed out");
  r=await P("/api/login",{user:"kim",pass:"kimspass1"});T(r.s===403,"turned-off user can't sign in");
  await P("/api/users/disable",{user:"kim",disabled:false},A);
  const K2=(await P("/api/login",{user:"kim",pass:"kimspass1"})).j.token;
  r=await P("/api/account/signout-all",{},K2);T(r.s===200&&(await req(g,"GET","/api/state",{tok:K2})).s===401,"sign out of every device");
  T((await req(g,"GET","/api/state",{tok:A})).s===200,"other users stay signed in");
  const mode=fs.statSync(path.join(S.dir,"users.json")).mode&0o777;T(process.platform==="win32"||mode===0o600,"users.json is private (mode "+mode.toString(8)+")");
  for(let i=0;i<8;i++)await P("/api/login",{user:"mike",pass:"wrong"+i});
  T((await P("/api/login",{user:"mike",pass:"password1"})).s===429,"8 wrong tries lock that sign-in");
  S.stop();
  // ----- photos and documents belong to one person -----
  S=start({});await wait(1200);g=S.port;
  const png=n=>Buffer.from("not-really-a-png-"+n+"-"+Math.random()),pdf=Buffer.from("%PDF-1.4 test "+Math.random());
  // before accounts: one shared garage, files in the shared folders
  const legacy=(await req(g,"POST","/api/photo",{body:png("legacy"),ct:"image/png"})).j.url;
  r=await req(g,"PUT","/api/state",{body:{vehicles:[{id:"a",name:"Truck",cover:legacy}],records:[],rev:0}});
  r=await req(g,"POST","/api/accounts/setup",{body:{user:"mike",pass:"password1"}});const MA=r.j.token,MM=r.j.media;
  T(r.s===200&&!!MM,"accounts turned on and a media link is issued");
  T(fs.existsSync(path.join(S.dir,"users","mike","photos",legacy.slice(7))),"existing photo was copied into the admin's own folder");
  T((await req(g,"GET","/"+legacy)).s===401,"old photo address needs sign-in now");
  T((await req(g,"GET","/"+legacy+"?t="+MM)).s===200,"admin's media link opens it");
  r=await req(g,"POST","/api/photo",{body:png("m1"),ct:"image/png",tok:MA});const mp=r.j.url;T(r.s===200&&fs.existsSync(path.join(S.dir,"users","mike","photos",mp.slice(7))),"new photo is saved in that person's folder");
  r=await req(g,"POST","/api/doc",{body:pdf,ct:"application/pdf",tok:MA});const md=r.j.url;T(r.s===200&&fs.existsSync(path.join(S.dir,"users","mike","docs",md.slice(5))),"new document is saved in that person's folder");
  T(!fs.existsSync(path.join(S.dir,"photos",mp.slice(7))),"nothing new lands in the shared folder");
  await req(g,"POST","/api/users",{body:{user:"kim",pass:"kimspass1"},tok:MA});
  r=await req(g,"POST","/api/login",{body:{user:"kim",pass:"kimspass1"}});const KA=r.j.token;const KM=(await req(g,"GET","/api/me",{tok:KA})).j.media;
  T((await req(g,"GET","/"+mp)).s===401,"no sign-in: photo refused");
  T((await req(g,"GET","/"+md)).s===401,"no sign-in: document refused");
  T((await req(g,"GET","/"+mp,{tok:MA})).s===200,"owner can open their photo (sign-in header)");
  T((await req(g,"GET","/"+mp+"?t="+MM)).s===200&&(await req(g,"GET","/"+md+"?t="+MM)).s===200,"owner can open photo and document (media link)");
  T((await req(g,"GET","/"+mp,{tok:KA})).s===404&&(await req(g,"GET","/"+mp+"?t="+KM)).s===404,"another person can't open it, even knowing the address");
  T((await req(g,"GET","/"+md+"?t="+KM)).s===404,"nor the document");
  r=await req(g,"GET","/api/readonly",{tok:MA});T((await req(g,"GET","/"+mp+"?ro="+r.j.t)).s===200,"view-only link opens the owner's photo");
  T((await req(g,"GET","/"+mp+"?t=mike.00000000000000000000000000000000")).s===401,"made-up link refused");
  // same bytes uploaded by two people stay separate
  const same=png("same");const u1=(await req(g,"POST","/api/photo",{body:same,ct:"image/png",tok:MA})).j.url,u2=(await req(g,"POST","/api/photo",{body:same,ct:"image/png",tok:KA})).j.url;
  T((await req(g,"GET","/"+u2+"?t="+KM)).s===200&&fs.existsSync(path.join(S.dir,"users","kim","photos",u2.slice(7))),"each person gets their own copy of identical files");
  // media link stops working when the password changes, the person signs out everywhere, or the account is turned off
  r=await req(g,"POST","/api/account/password",{body:{old:"kimspass1",new:"kimspass2"},tok:KA});T(r.s===200&&r.j.media&&r.j.media!==KM,"password change issues a new media link");
  T((await req(g,"GET","/"+u2+"?t="+KM)).s===401&&(await req(g,"GET","/"+u2+"?t="+r.j.media)).s===200,"old media link stops, new one works");
  await req(g,"POST","/api/users/disable",{body:{user:"kim",disabled:true},tok:MA});
  T((await req(g,"GET","/"+u2+"?t="+r.j.media)).s===401,"turned-off account's media link stops");
  // files that only the old shared folder held are copied on the next start (upgrade from an older version)
  S.stop(true);
  const old=path.join(S.dir,"users","mike","photos");fs.rmSync(old,{recursive:true,force:true});fs.rmSync(path.join(S.dir,"media-per-user.done"));
  fs.mkdirSync(path.join(S.dir,"photos"),{recursive:true});fs.copyFileSync(path.join(S.dir,"users","mike","docs",md.slice(5)),path.join(S.dir,"docs",md.slice(5))); // old layout
  fs.writeFileSync(path.join(S.dir,"photos",mp.slice(7)),"old photo");fs.rmSync(path.join(S.dir,"users","mike","docs"),{recursive:true,force:true});
  const S2=start({},S.dir);await wait(1500);g=S2.port;
  r=await req(g,"POST","/api/login",{body:{user:"mike",pass:"password1"}});
  const mdb=JSON.parse(fs.readFileSync(path.join(S.dir,"users","mike","db.json"),"utf8"));mdb.records=[{id:"z",vid:"a",type:"service",ph:[mp],rc:[]}];fs.writeFileSync(path.join(S.dir,"users","mike","db.json"),JSON.stringify(mdb));
  S2.stop(true);fs.rmSync(path.join(S.dir,"media-per-user.done"),{force:true});
  const S3=start({},S.dir);await wait(1500);g=S3.port;
  T(fs.existsSync(path.join(S.dir,"users","mike","photos",mp.slice(7))),"on the next start, files the data points to are copied from the old shared folder");
  S3.stop();
  // ----- alerts can't be used to reach machines on your network -----
  const ln=await listener(),ln2=await listener(),lr=await listener("http://127.0.0.1:"+ln2.port+"/");
  S=start({});await wait(1200);g=S.port;
  r=await req(g,"POST","/api/accounts/setup",{body:{user:"mike",pass:"password1"}});const AA=r.j.token;
  await req(g,"POST","/api/users",{body:{user:"kim",pass:"kimspass1"},tok:AA});const KK=(await req(g,"POST","/api/login",{body:{user:"kim",pass:"kimspass1"}})).j.token;
  const test=(url,tok)=>req(g,"POST","/api/alert/test",{body:{url},tok});
  r=await test("http://127.0.0.1:"+ln.port+"/",AA);T(r.s===200&&ln.hits===1,"admin can send an alert to an address on the network");
  let before=ln.hits;
  for(const[name,url]of[["a local address","http://127.0.0.1:"+ln.port+"/"],["a short local address","http://127.1:"+ln.port+"/"],["a number-style address","http://2130706433:"+ln.port+"/"],["an IPv4-in-IPv6 address","http://[::ffff:127.0.0.1]:"+ln.port+"/"],["localhost","http://localhost:"+ln.port+"/"],["the unspecified address","http://0.0.0.0:"+ln.port+"/"],["a LAN address","http://192.168.1.1/"],["a cloud metadata address","http://169.254.169.254/latest/meta-data/"],["a Tailscale address","http://100.100.100.100/"],["an address with a name and password","http://user:pw@127.0.0.1:"+ln.port+"/"]]){
    r=await test(url,KK);T(r.s===502&&/public web addresses/.test(r.j.msg||"")&&ln.hits===before,"other accounts can't send to "+name);
  }
  r=await test("http://127.1:"+ln.port+"/",AA);T(r.s===200&&ln.hits>before,"admin can use the same short address (so the refusals above are the check, not a failed connection)");
  before=ln2.hits;r=await test("http://127.0.0.1:"+lr.port+"/",AA);T(r.s===502&&ln2.hits===before,"a redirect is not followed");
  r=await test("ftp://example.com/",AA);T(r.s===502,"only http and https");
  S.stop();
  S=start({ALERT_HOSTS:"127.0.0.1"});await wait(1200);g=S.port;
  r=await req(g,"POST","/api/accounts/setup",{body:{user:"mike",pass:"password1"}});const A3=r.j.token;
  await req(g,"POST","/api/users",{body:{user:"kim",pass:"kimspass1"},tok:A3});const K3=(await req(g,"POST","/api/login",{body:{user:"kim",pass:"kimspass1"}})).j.token;
  before=ln.hits;r=await req(g,"POST","/api/alert/test",{body:{url:"http://127.0.0.1:"+ln.port+"/"},tok:K3});T(r.s===200&&ln.hits===before+1,"ALERT_HOSTS lets everyone use a listed internal server");
  r=await req(g,"POST","/api/alert/test",{body:{url:"http://[::ffff:127.0.0.1]:"+ln.port+"/"},tok:K3});T(r.s===502,"...but not other internal addresses");
  S.stop();
  // without accounts the owner may use any address
  S=start({});await wait(1200);g=S.port;before=ln.hits;
  r=await req(g,"POST","/api/alert/test",{body:{url:"http://127.0.0.1:"+ln.port+"/"}});T(r.s===200&&ln.hits===before+1,"without accounts any address works");
  S.stop();ln.close();ln2.close();lr.close();
  // ----- what a save may contain -----
  S=start({});await wait(1200);g=S.port;
  const okState=()=>({vehicles:[{id:"v1",name:"Truck",model:"",kind:"car",meter:"dist",color:"",cover:"",reg:"2027-03-01",regRep:24,ohv:"",wd:"",wo:"",soonDays:0,soonDist:0,specs:{},
      plist:[{l:"Oil",v:"5W-30"}],dts:[{id:"d1",l:"Inspection",date:"2027-05-01",rep:12}],docs:[{id:"x1",n:"Manual",url:"docs/0123456789abcdef.pdf",t:"application/pdf",at:"2026-11-01"}],
      tires:[{id:"t1",name:"Winter",size:"265/70R17",date:"2026-10-01",st:"on",mi:0,notes:"",tr:[{d:"2026-10-01",v:["9","9","9","9"]}]}],cls:[{id:"c1",name:"Before a trip",items:["Tires","Oil"]}]}],
    records:[{id:"r1",vid:"v1",type:"service",date:"2026-10-01",odo:50000,desc:"Oil",dl:["Rotate"],parts:"",pl:["Filter"],notes:"",by:"Me",ph:[],rc:[],done:false,nrid:"r2",next:5000,iu:[{id:"i1",n:"Oil",u:"qt",q:5}],rep:0},
      {id:"r2",vid:"v1",type:"reminder",date:"",odo:55000,desc:"Next: Oil",dl:[],parts:"",pl:[],notes:"",ph:[],rc:[],done:false,rep:0,wr:1}],
    inv:[{id:"i1",name:"Oil",cat:"Oil",qty:3,unit:"qt",notes:"",pns:["44855"],low:"",src:"",url:""}],
    cur:null,units:"imperial",presets:{car:[{n:"Oil",d:5000,h:"",m:6}]},lastNext:{},alert:{url:"https://ntfy.sh/x",fmt:"text",hour:8,tz:"America/Los_Angeles"},rev:0,somethingNew:{any:"thing"}});
  r=await req(g,"PUT","/api/state",{body:okState()});T(r.s===200,"a full save like the app makes is accepted (empty current equipment, spare fields and all)");
  const refuse=(name,edit)=>{const d=okState();edit(d);return req(g,"PUT","/api/state",{body:d}).then(x=>T(x.s===422&&!!(x.j&&x.j.msg),"refused: "+name+(x.j&&x.j.msg?" ("+x.j.msg+")":"")))};
  const cur=(await req(g,"GET","/api/state")).j;
  await refuse("records is not a list",d=>d.records={a:1});
  await refuse("records is empty (null)",d=>d.records=null);
  await refuse("records is text",d=>d.records="abc");
  await refuse("inv is not a list",d=>d.inv={});
  await refuse("a record that is not an entry",d=>d.records.push(null));
  await refuse("a record with a number for an id",d=>d.records[0].id=7);
  await refuse("a record without an id",d=>delete d.records[0].id);
  await refuse("a record without its equipment",d=>delete d.records[0].vid);
  await refuse("photos that are not a list",d=>d.records[0].ph="photos/x.jpg");
  await refuse("a photo that is not text",d=>d.records[0].ph=[5]);
  await refuse("a date that is not a date",d=>d.records[0].date="next week");
  await refuse("a date that doesn't exist",d=>d.vehicles[0].reg="2027-13-45");
  await refuse("a February 31",d=>d.vehicles[0].reg="2027-02-31");
  await refuse("a description that is a list",d=>d.records[0].desc=["x"]);
  await refuse("an odometer that is text",d=>d.records[0].odo="lots");
  await refuse("a vehicle without an id",d=>delete d.vehicles[0].id);
  await refuse("a vehicle id that is far too long",d=>d.vehicles[0].id="x".repeat(500));
  await refuse("a vehicle that is a number",d=>d.vehicles.push(5));
  await refuse("extra dates that are not a list",d=>d.vehicles[0].dts={});
  await refuse("an extra date label that is a number",d=>d.vehicles[0].dts[0].l=5);
  await refuse("documents that are not a list",d=>d.vehicles[0].docs="x");
  await refuse("units that are made up",d=>d.units="parsecs");
  await refuse("the current equipment is a number",d=>d.cur=5);
  await refuse("alert is a list",d=>d.alert=[]);
  await refuse("alert address is a number",d=>d.alert.url=5);
  await refuse("presets is a list",d=>d.presets=[]);
  await refuse("a checklist whose items are text",d=>d.vehicles[0].cls[0].items="Tires");
  await refuse("an inventory item with a made-up quantity",d=>d.inv[0].qty="plenty");
  r=await req(g,"PUT","/api/state",{body:[1,2]});T(r.s===422,"refused: the data itself is a list");
  r=await req(g,"PUT","/api/state",{body:"{not json",ct:"application/json"});T(r.s===400,"refused: not JSON at all");
  const after=(await req(g,"GET","/api/state")).j;T(JSON.stringify(after)===JSON.stringify(cur),"none of the refused saves changed what is stored");
  S.stop();
  // data that is already broken on disk (saved by an older version, or edited by hand) must not take the server down
  const bd=fs.mkdtempSync(path.join(os.tmpdir(),"gl-"));fs.writeFileSync(path.join(bd,"db.json"),JSON.stringify({vehicles:[null,{id:"a",name:"X",dts:{},reg:"2027-13-45",ohv:5},{id:"b",name:"Y",kind:"offroad",ohv:"2027-02-01",dts:[null,{id:"q",l:5,date:"2027-04-01"},{id:"r",l:"Smog",date:"2027-04-01"}]}],records:{x:1}}));
  S=start({},bd);await wait(1500);g=S.port;
  r=await req(g,"GET","/calendar.ics");T(r.s===200&&r.b.toString().includes("BEGIN:VCALENDAR")&&!/2027-13/.test(r.b.toString()),"calendar still works with broken data on disk");
  r=await req(g,"GET","/api/summary");T(r.s===200,"summary still works with broken data on disk");
  r=await req(g,"GET","/healthz");T(r.s===200,"server is still running afterwards");
  S.stop();
  // ----- behind a proxy -----
  S=start({TRUST_PROXY:"1"});await wait(1200);g=S.port;
  r=await req(g,"POST","/api/accounts/setup",{body:{user:"mike",pass:"password1"}});
  const L=(ip,pw)=>req(g,"POST","/api/login",{body:{user:"mike",pass:pw},headers:{"X-Forwarded-For":ip}});
  for(let i=0;i<8;i++)await L("9.9.9.9","bad"+i);
  T((await L("9.9.9.9","password1")).s===429,"attacker address is locked");
  T((await L("1.2.3.4","password1")).s===200,"a different address behind the same proxy still gets in");
  S.stop();
  console.log(bad?"FAILURES: "+bad:"ALL OK");process.exit(bad?1:0);
})();
