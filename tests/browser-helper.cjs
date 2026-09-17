const fs=require('fs'),http=require('http'),vm=require('vm'),cp=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
exports.run=async function(site,test,{baseline=false}={}) {
 const root=require('node:path').resolve(__dirname,'..');
 const source=baseline?cp.execFileSync('git',['-C',root,'show','origin/main:worker.js'],{encoding:'utf8',maxBuffer:100*1024*1024}):fs.readFileSync(root+'/worker.js','utf8');
 const worker=vm.runInNewContext(source.replace('export default','globalThis.worker =')+';worker',{URL,Response,Request,console});
 const server=http.createServer(async(req,res)=>{try{const r=await worker.fetch(new Request('http://localhost'+req.url),{},{});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>route.request().url().includes('cdn.tailwindcss.com')?route.fulfill({contentType:'application/javascript',body:'window.tailwind = {};'}):route.abort());
 try{return await test(page,origin,errors);}finally{await browser.close();server.close();}
};
