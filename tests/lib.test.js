// Checks for public/lib.js (shared logic) and for how the script files fit together. Run with: node tests/lib.test.js   (no packages needed)
const fs=require("fs"),path=require("path"),vm=require("vm");
let bad=0;const T=(ok,m)=>{console.log((ok?"PASS ":"FAIL ")+m);if(!ok)bad++};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pub=f=>path.join(__dirname,"..","public",f);

// Pretend it is 2026-11-06 (noon, local time) while these checks run.
const RealDate=Date,NOW=new RealDate(2026,10,6,12,0,0);
global.Date=class extends RealDate{constructor(...a){a.length?super(...a):super(NOW.getTime())}static now(){return NOW.getTime()}};
const L=require(pub("lib.js"));

T(L.esc('<a href="x">&</a>')==="&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"&&L.esc(null)===""&&L.esc(0)==="0","esc escapes markup and treats empty as text");
T(/^[a-z0-9]{1,8}$/.test(L.uid())&&L.uid()!==L.uid(),"uid gives short different ids");
T(L.today()==="2026-11-06","today is the local date");
T(L.addM("2026-01-31",1)==="2026-02-28"&&L.addM("2024-01-31",1)==="2024-02-29"&&L.addM("2026-11-30",3)==="2027-02-28","addM keeps month ends inside the month");
T(L.addM("2026-03-15",12)==="2027-03-15"&&L.addM("2026-03-15",-3)==="2025-12-15","addM adds and subtracts whole months");
T(L.addD("2026-02-27",3)==="2026-03-02"&&L.addD("2026-01-01",-1)==="2025-12-31","addD crosses month and year ends");
T(L.fmtD(new Date(2026,0,5))==="2026-01-05","fmtD pads month and day");
T(L.nextDate("2026-01-10",12)==="2027-01-10"&&L.nextDate("2026-10-01",1)==="2026-12-01"&&L.nextDate("",6)==="2027-05-06","nextDate steps forward until the date is in the future");
T(L.repTxt(12)==="year"&&L.repTxt(24)==="2 years"&&L.repTxt(6)==="6 months"&&L.repTxt(18)==="18 months","repTxt");
T(L.ago2(0)==="today"&&L.ago2(10)==="10 days"&&L.ago2(90)==="3 months"&&L.ago2(800)==="2.2 years","ago2");
T(L.fixUrl("example.com/x")==="https://example.com/x"&&L.fixUrl(" http://a.b ")==="http://a.b"&&L.fixUrl("")==="","fixUrl adds https and leaves real addresses alone");
T(L.fixUrl("javascript:alert(1)")===""&&L.fixUrl("not a url at all")==="","fixUrl refuses addresses that aren't web addresses");
T(eq(L.partsOf({parts:"Belt",pl:["Filter"],iu:[{n:"Oil",q:5,u:"qt"},{n:"Grease",q:1}]}),["Belt","Filter","Oil ×5 qt","Grease ×1"]),"partsOf lists bought and inventory parts");
const veh={id:"v",kind:"offroad",ohv:"2026-12-01",reg:"2027-01-01",dts:[{id:"a",l:"Inspection",date:"2027-02-01",rep:12},{id:"b",l:"",date:""}]};
T(eq(L.vDates(veh).map(x=>[x.k,x.l,x.date,x.rep]),[["ohv","OHV sticker expires","2026-12-01",24],["reg","Registration expires","2027-01-01",24],["dt:a","Inspection","2027-02-01",12]]),"vDates lists the expiry dates that are set");
T(eq(L.vDates({id:"m",kind:"mower",reg:"2027-01-01"}),[]),"mowers have no registration date");
T(L.seen(0)==="Never signed in"&&L.seen(Date.now()-30e3)==="Signed in just now"&&L.seen(Date.now()-30*6e4)==="Signed in 30 min ago"&&L.seen(Date.now()-90*6e4)==="Signed in 2 hours ago"&&L.seen(Date.now()-3*864e5)==="Signed in 3 days ago","seen");
const v1={id:"1",kind:"atv",specs:{oilW:"5W-30",other:"note"}};L.fixV(v1);
T(v1.kind==="offroad"&&v1.meter==="dist"&&v1.plist.some(x=>x.l==="Oil weight"&&x.v==="5W-30")&&v1.plist.some(x=>x.l==="Other"),"fixV upgrades older equipment (old kinds, old spec fields)");
const nn=L.norm({vehicles:[{id:"1"}],records:[{id:"a",type:"fuel"},{id:"b",type:"service"}]});
T(nn.records.length===1&&nn.vehicles[0].kind==="car"&&L.norm({}).vehicles.length===0,"norm drops retired fuel records and fills in defaults");
T(L.cmp({a:1,cur:"x",rev:5})===L.cmp({a:1,cur:"y",rev:9})&&L.cmp({a:1})!==L.cmp({a:2}),"cmp ignores the current equipment and revision");
const c0={a:{b:1}},c1=L.clone(c0);c1.a.b=2;T(c0.a.b===1,"clone is a deep copy");
T(L.b64("héllo")==="aMOpbGxv","b64 handles accents");

// The merge used when two devices edit the same data
const base={vehicles:[{id:"v1",name:"Truck"}],records:[{id:"r1",desc:"Oil"},{id:"r2",desc:"Tires"}],inv:[],units:"imperial"};
const mine=L.clone(base);mine.records[0].desc="Oil & filter";mine.records.push({id:"r3",desc:"Brakes"});mine.records=mine.records.filter(r=>r.id!=="r2");mine.units="metric";
const d=L.diff(base,mine);
T(eq(d.records.ups.map(x=>x.id),["r1","r3"])&&eq(d.records.del,["r2"])&&d.units.set==="metric"&&!d.vehicles&&!d.inv,"diff finds changed, added and removed entries and changed settings");
const server=L.clone(base);server.records.push({id:"r9",desc:"From the phone"});server.vehicles[0].name="Truck (server)";
const merged=L.apply(server,d);
T(eq(merged.records.map(r=>r.id).sort(),["r1","r3","r9"])&&merged.records.find(r=>r.id==="r1").desc==="Oil & filter"&&merged.vehicles[0].name==="Truck (server)"&&merged.units==="metric","apply puts my edits on top of the server's newer data and keeps what the other device added");
T(eq(L.diff(base,L.clone(base)),{}),"no changes gives an empty diff");
const gone=L.clone(base);gone.alert=undefined;const withAlert=L.clone(base);withAlert.alert={url:"x"};
T(L.apply(L.clone(withAlert),L.diff(withAlert,gone)).alert===undefined,"removing a setting is carried over");

// How the files fit together
const lib=fs.readFileSync(pub("lib.js"),"utf8"),app=fs.readFileSync(pub("app.js"),"utf8"),html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let ok=true,why="";try{new vm.Script(lib+"\n"+app)}catch(e){ok=false;why=e.message}
T(ok,"lib.js and app.js load together without clashing names"+(ok?"":" ("+why+")"));
T(html.indexOf("lib.js")>0&&html.indexOf("lib.js")<html.indexOf("app.js")&&html.indexOf("APP_V")<html.indexOf("lib.js"),"index.html loads the version, then lib.js, then app.js");
T((html.match(/__VERSION__/g)||[]).length>=4&&!/__VERSION__|__BUILD__/.test(lib+app),"the version placeholders are only in index.html (the Android build fills them in there)");
// ----- equipment pictures -----
T(L.PICS.length===33&&new Set(L.PICS.map(p=>p[0])).size===33,"there are 33 distinct equipment pictures");
const gk=L.PGROUPS.flatMap(g=>g[1]);T(gk.length===33&&new Set(gk).size===33&&L.PICS.every(p=>gk.includes(p[0])),"the picker groups hold every picture exactly once");
T(L.PICS.every(p=>fs.existsSync(pub("images/equipment/"+p[0]+"-200.webp"))&&fs.existsSync(pub("images/equipment/"+p[0]+"-400.webp"))&&p[2]>0.3&&p[2]<1.6),"every picture has both sizes on disk and a sensible shape");
T(!fs.readdirSync(pub("images/equipment")).some(f=>!L.PICS.some(p=>f.startsWith(p[0]+"-"))),"no stray files in the pictures folder");
T(["car","offroad","trailer","mower"].every(k=>L.PICS.some(p=>p[0]===L.picOf({kind:k}))),"each existing equipment type has a default picture that exists");
T(L.picOf({kind:"other"})===""&&L.picOf({kind:"something-new"})===""&&L.picOf(null)==="","types without a picture (and odd data) give none, so the app falls back to an icon");
T(L.picOf({kind:"car",pic:"boat"})==="boat"&&L.picOf({kind:"car",pic:"gone.png"})==="car","a chosen picture wins; an unknown one is ignored");
const old={kind:"atv",specs:{}};L.fixV(old);T(old.kind==="offroad"&&old.pic===undefined,"old equipment keeps its type and gets no new stored field");
T(!/\b(S|view|tab|document|window|localStorage)\b/.test(lib.replace(/\/\/.*$/gm,"").replace(/typeof module/,"")),"lib.js doesn't touch the page or the app's state");
global.Date=RealDate;
console.log(bad?"FAILURES: "+bad:"ALL OK");process.exit(bad?1:0);
