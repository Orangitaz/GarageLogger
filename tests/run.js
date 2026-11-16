// Server checks. Run with: node tests/run.js   (no packages needed; starts its own server on a temporary data folder)
const {spawn}=require("child_process"),fs=require("fs"),os=require("os"),path=require("path"),zlib=require("zlib"),http=require("http");
let bad=0;const T=(ok,m)=>{console.log((ok?"PASS ":"FAIL ")+m);if(!ok)bad++};
function start(env){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"gl-")),port=3300+Math.floor(Math.random()*500);
  const p=spawn("node",[path.join(__dirname,"..","server.js")],{env:Object.assign({},process.env,{DATA_DIR:dir,PORT:port},env),stdio:"ignore"});
  return{dir,port,stop:()=>{p.kill();fs.rmSync(dir,{recursive:true,force:true})}};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
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
  r=await P("/api/alert/test",{url:"http://127.0.0.1:1/"},K);T(r.s===403,"non-admin can't use the alert test");
  r=await P("/api/alert/test",{url:"http://127.0.0.1:1/"},A);T(r.s===502,"admin can (and an unreachable address reports failure)");
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
