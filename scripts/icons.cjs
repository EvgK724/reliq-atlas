/* Rasterize the original, code-native SVG icon. */
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),assets=path.join(root,'docs/assets');
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({deviceScaleFactor:1});
 const svg=fs.readFileSync(path.join(assets,'reliq-icon.svg'),'utf8');
 for(const [size,name] of [[512,'icon-512.png'],[192,'icon-192.png'],[180,'apple-touch-icon.png'],[96,'mark-96.png'],[32,'favicon-32.png']]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#080f14}svg{display:block;width:100%;height:100%}</style>${svg}`);
  await page.screenshot({path:path.join(assets,name)});
 }
 await browser.close();console.log('Five app icons rendered.');
})().catch(e=>{console.error(e);process.exit(1);});
