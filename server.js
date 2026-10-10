const http=require("http"),fs=require("fs"),path=require("path");
const CORS={"Access-Control-Allow-Origin":"null","Access-Control-Allow-Methods":"GET,PUT,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
const DIR=process.env.DATA_DIR||"/data",FILE=path.join(DIR,"db.json"),PORT=+process.env.PORT||3000;
fs.mkdirSync(DIR,{recursive:true});
http.createServer((req,res)=>{
  const u=req.url.split("?")[0];
  if(u==="/api/state"){
    if(req.method==="OPTIONS"){res.writeHead(204,CORS);return res.end()}
    if(req.method==="GET"){
      let d="{}";try{d=fs.readFileSync(FILE,"utf8")}catch(e){}
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store",...CORS});return res.end(d);
    }
    if(req.method==="PUT"){
      const b=[];let n=0;
      req.on("data",c=>{n+=c.length;if(n>200e6){res.writeHead(413,CORS).end();req.destroy()}else b.push(c)});
      req.on("end",()=>{try{
        const t=Buffer.concat(b).toString();JSON.parse(t);
        try{fs.copyFileSync(FILE,FILE+".bak")}catch(e){}
        fs.writeFileSync(FILE+".tmp",t);fs.renameSync(FILE+".tmp",FILE);res.writeHead(204,CORS).end();
      }catch(e){res.writeHead(400,CORS).end()}});
      return;
    }
  }
  if(u==="/healthz"){res.writeHead(200,{"Content-Type":"text/plain"});return res.end("ok")}
  if(u==="/"||u==="/index.html"){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
    return res.end(fs.readFileSync(path.join(__dirname,"index.html")));
  }
  res.writeHead(404).end();
}).listen(PORT,"0.0.0.0",()=>console.log("Garage Log listening on "+PORT));
for(const sg of ["SIGTERM","SIGINT"])process.on(sg,()=>process.exit(0));
