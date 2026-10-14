const http=require("http"),fs=require("fs"),path=require("path");
const DIR=process.env.DATA_DIR||"/data",FILE=path.join(DIR,"db.json"),PORT=+process.env.PORT||3000;
fs.mkdirSync(DIR,{recursive:true});
const ST={"/manifest.webmanifest":"application/manifest+json","/sw.js":"text/javascript","/icon.svg":"image/svg+xml","/icon-192.png":"image/png","/icon-512.png":"image/png","/apple-touch-icon.png":"image/png"};
http.createServer((req,res)=>{
  const u=req.url.split("?")[0];
  if(u==="/api/state"){
    if(req.method==="GET"){
      let d="{}";try{d=fs.readFileSync(FILE,"utf8")}catch(e){}
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});return res.end(d);
    }
    if(req.method==="PUT"){
      const b=[];let n=0;
      req.on("data",c=>{n+=c.length;if(n>200e6){res.writeHead(413).end();req.destroy()}else b.push(c)});
      req.on("end",()=>{try{
        const t=Buffer.concat(b).toString();JSON.parse(t);
        try{fs.copyFileSync(FILE,FILE+".bak")}catch(e){}
        fs.writeFileSync(FILE+".tmp",t);fs.renameSync(FILE+".tmp",FILE);res.writeHead(204).end();
      }catch(e){res.writeHead(400).end()}});
      return;
    }
  }
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
