/* Resize the approved generated artwork into browser and app icons. */
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),assets=path.join(root,'docs/assets');
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({deviceScaleFactor:1});
 const artwork='data:image/png;base64,'+fs.readFileSync(path.join(assets,'reliq-icon-art.png')).toString('base64');
 for(const [size,name] of [[512,'icon-512.png'],[192,'icon-192.png'],[180,'apple-touch-icon.png'],[96,'mark-96.png'],[32,'favicon-32.png']]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#080f14}img{display:block;width:100%;height:100%}</style><img src="${artwork}">`);
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:path.join(assets,name)});
 }
 await page.setViewportSize({width:512,height:512});
 await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#040a0e}body{display:grid;place-items:center}img{display:block;width:84%;height:84%}</style><img src="${artwork}">`);
 await page.locator('img').evaluate(img=>img.decode());
 await page.screenshot({path:path.join(assets,'icon-maskable-512.png')});
 await browser.close();console.log('Six app icons rendered.');
})().catch(e=>{console.error(e);process.exit(1);});
