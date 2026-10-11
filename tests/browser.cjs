/* Functional browser regression suite. Serve docs/ locally before running. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = (process.env.BASE_URL || 'http://localhost:8771/').replace(/\/?$/, '/');
const output = path.resolve(process.env.QA_OUTPUT || path.join(root, '../reliq-qa/browser.json'));
const content = JSON.parse(fs.readFileSync(path.join(root, 'content.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'));
const key = 'reliq-learning-v1';
const reports = [];
const visible = async (page, selector) => assert.equal(await page.locator(selector).isVisible(), true, `${selector} should be visible`);
const hidden = async (page, selector) => assert.equal(await page.locator(selector).isVisible(), false, `${selector} should be hidden`);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), key);
async function closeDialog(page, id) { await page.locator(`${id} .close-dialog`).click(); await hidden(page, id); }
async function nav(page, mode) { await page.locator(`.main-nav [data-mode="${mode}"]`).click(); await visible(page, `#${mode}-view`); }
function watch(page) { const errors=[]; page.on('pageerror',error=>errors.push(error.message)); return errors; }
async function contextPage(browser) { const context=await browser.newContext({viewport:{width:1100,height:900}});const page=await context.newPage();page.setDefaultTimeout(8000);return {context,page,errors:watch(page)}; }
async function sourceLinks(page, expected) {
  await visible(page, '#sources-dialog');
  const actual=await page.locator('#sources-list h3 a').evaluateAll(items=>items.map(el=>({url:el.href,rel:el.rel})));
  assert.deepEqual(actual.map(v=>v.url).sort(), [...new Set(expected)].map(id=>new URL(sources[id].url).href).sort());
  assert.ok(actual.every(v=>/^https?:/.test(v.url)&&v.rel.includes('noopener')&&v.rel.includes('noreferrer')));
  await closeDialog(page,'#sources-dialog');
}
async function svgIntegrity(page) {
  const result=await page.evaluate(()=>{
    const all=[...document.querySelectorAll('[id]')],counts=new Map();for(const el of all)counts.set(el.id,(counts.get(el.id)||0)+1);
    const duplicate=[...counts].filter(([,n])=>n>1).map(([id])=>id),missing=[];
    for(const svg of document.querySelectorAll('svg'))for(const el of svg.querySelectorAll('*'))for(const attr of el.attributes){
      const refs=[...attr.value.matchAll(/url\(#([^\)]+)\)/g)].map(m=>m[1]);
      if(['href','xlink:href'].includes(attr.name)&&attr.value.startsWith('#'))refs.push(attr.value.slice(1));
      if(['aria-labelledby','aria-describedby'].includes(attr.name))refs.push(...attr.value.split(/\s+/));
      for(const id of refs)if(!document.getElementById(id))missing.push(id);
    }
    return {duplicate,missing};
  });
  assert.deepEqual(result,{duplicate:[],missing:[]});
}

async function catalogue(browser) {
  const {context,page,errors}=await contextPage(browser);const checks=[];
  try {
    await page.goto(base);await visible(page,'#object-name');assert.equal(await page.locator('#object-list button').count(),7);
    for(const object of content.objects){
      await page.locator(`#object-list [data-object="${object.id}"]`).click();
      assert.equal(await page.locator('#object-name').textContent(),object.name);assert.equal(new URL(page.url()).searchParams.get('object'),object.id);
      for(const layer of ['object','detail']){
        await page.locator(`[data-view="${layer}"]`).click();
        assert.equal(new URL(page.url()).searchParams.get('view'),layer);
        for(const candidate of ['object','detail'])assert.equal(await page.locator(`#diagram-art [data-layer="${candidate}"]`).isVisible(),candidate===layer);
        assert.equal(await page.locator('#viewer-note').textContent(),object.captions[layer]);
      }
      for(let index=0;index<object.clues.length;index++){
        await page.locator(`[data-clue="${index}"]`).click();
        assert.equal(await page.locator('#clue-title').textContent(),object.clues[index].title);
      }
      await page.locator('#object-source').click();await sourceLinks(page,object.sources);
      for(let index=0;index<object.hypotheses.length;index++){
        const detail=page.locator('#hypothesis-list details').nth(index);await detail.locator('summary').click();
        await detail.locator('[data-source]').click();await sourceLinks(page,object.hypotheses[index].sources);
      }
      assert.ok(await page.locator('#object-related button').count()>0);await svgIntegrity(page);
    }
    checks.push('Seven objects, all fourteen vector layers, twenty-one clues, all object/hypothesis citations, unique DOM IDs and resolved SVG references');
    await page.locator('#object-list [data-object="lycurgus"]').click();await page.locator('[data-view="object"]').click();await visible(page,'#light-controls');
    for(const light of ['back','front']){await page.locator(`[data-light-mode="${light}"]`).click();await visible(page,`#diagram-art [data-light="${light}"]`);await hidden(page,`#diagram-art [data-light="${light==='front'?'back':'front'}"]`);}
    await page.locator('[data-view="detail"]').click();await hidden(page,'#light-controls');
    await page.locator('#zoom-in').click();assert.equal(await page.locator('#zoom-label').textContent(),'1.25×');
    const parent=await page.locator('#object-viewer').evaluate(el=>el.parentElement.id||el.parentElement.className);
    await page.locator('#expand-viewer').click();await visible(page,'#viewer-dialog');assert.equal(await page.locator('#viewer-dialog #object-viewer').count(),1);
    await page.keyboard.press('Escape');await hidden(page,'#viewer-dialog');await page.waitForFunction(()=>document.querySelector('#object-viewer').parentElement.id!=='viewer-dialog');assert.equal(await page.locator('#object-viewer').evaluate(el=>el.parentElement.id||el.parentElement.className),parent);
    await page.locator('#reset-viewer').click();assert.equal(await page.locator('#zoom-label').textContent(),'1×');
    await page.locator('#diagram-viewport').focus();await page.keyboard.press('+');assert.equal(await page.locator('#zoom-label').textContent(),'1.25×');await page.keyboard.press('0');
    checks.push('Lycurgus reflected/transmitted light; zoom buttons and keyboard; fullscreen Escape restores viewer position');
    await page.locator('#qr-button').click();await visible(page,'#qr-dialog');assert.equal(await page.locator('#qr-dialog svg').count(),1);await closeDialog(page,'#qr-dialog');
    await page.locator('#all-sources').click();await sourceLinks(page,Object.keys(sources));
    await page.locator('#about-button').click();await visible(page,'#about-dialog');await visible(page,'#auto-update');await closeDialog(page,'#about-dialog');
    checks.push('QR, full bibliography and about/update dialogs');
    await nav(page,'compare');
    await hidden(page,'#comparison-answer');
    await page.locator('#compare-a').selectOption('antikythera');await page.locator('#compare-b').selectOption('sabu');
    assert.equal(new URL(page.url()).searchParams.get('a'),'antikythera');assert.equal(new URL(page.url()).searchParams.get('b'),'sabu');assert.equal(await page.locator('#compare-grid article').count(),2);
    await svgIntegrity(page);await page.locator('#reveal-comparison').click();await visible(page,'#comparison-answer');
    await page.locator('#compare-b').selectOption('antikythera');assert.notEqual(await page.locator('#compare-a').inputValue(),await page.locator('#compare-b').inputValue());await hidden(page,'#comparison-answer');
    const comparison={a:await page.locator('#compare-a').inputValue(),b:await page.locator('#compare-b').inputValue()};await page.reload();await visible(page,'#compare-view');
    assert.equal(await page.locator('#compare-a').inputValue(),comparison.a);assert.equal(await page.locator('#compare-b').inputValue(),comparison.b);await hidden(page,'#comparison-answer');await svgIntegrity(page);
    checks.push('Comparison uses two distinct objects, preserves both in URL/reload, starts with hidden memory support and resets reveal on selection');
    assert.deepEqual(errors,[]);return checks;
  } finally {await context.close();}
}

async function recall(browser) {
  const {context,page,errors}=await contextPage(browser);
  try {
    await page.goto(base);await nav(page,'learn');assert.equal(await page.locator('#total-count').textContent(),'28');assert.deepEqual(await saved(page),{});
    for(const topic of ['all',...content.objects.map(o=>o.id)])for(const kind of ['all','fact','link','case']){
      await page.locator('#study-topic').selectOption(topic);await page.locator('#study-kind').selectOption(kind);
      const expected=content.cards.filter(c=>(topic==='all'||c.topic===topic)&&(kind==='all'||c.kind===kind)).length;
      assert.equal(Number(await page.locator('#total-count').textContent()),expected);assert.equal(await page.locator('#start-review').isDisabled(),!expected);
    }
    await page.locator('#study-topic').selectOption('all');await page.locator('#study-kind').selectOption('all');await page.locator('#start-review').click();
    const question=await page.locator('#card-question').textContent(),position=await page.locator('#session-position').textContent();await hidden(page,'#card-back');await hidden(page,'#rating-buttons');
    await page.locator('#reveal-answer').click();await visible(page,'#card-back');assert.deepEqual(await saved(page),{});
    await page.locator('#card-context button').first().click();await visible(page,'#atlas-view');await visible(page,'#return-to-study');assert.equal(await page.evaluate(()=>window.atlasHasActiveReview),true);
    await page.locator('#resume-review').click();assert.equal(await page.locator('#card-question').textContent(),question);assert.equal(await page.locator('#session-position').textContent(),position);await visible(page,'#card-back');await visible(page,'#rating-buttons');
    await page.locator('[data-grade="good"]').click();const one=await saved(page);assert.equal(Object.keys(one).length,1);const first=Object.values(one)[0];assert.equal(first.reviews,1);assert.equal(first.due-first.last,86400000);await hidden(page,'#card-back');
    await page.locator('#end-review').click();assert.equal(await page.evaluate(()=>window.atlasHasActiveReview),false);await page.reload();assert.deepEqual(await saved(page),one);assert.equal(await page.locator('#seen-count').textContent(),'1');
    await page.locator('#practice-all').click();const observed=[];
    for(let index=0;index<28;index++){
      await hidden(page,'#card-back');const before=await saved(page),q=await page.locator('#card-question').textContent(),card=content.cards.find(c=>c.q===q);assert.ok(card);observed.push(card.id);
      await page.locator('#reveal-answer').click();assert.equal(await page.locator('#card-answer').textContent(),card.a);assert.equal(await page.locator('#card-anchor').textContent(),card.anchor);assert.deepEqual(await saved(page),before);
      await page.locator('#answer-source').click();await sourceLinks(page,card.sources);assert.deepEqual(await saved(page),before);
      await page.locator('[data-grade="again"]').click();const after=await saved(page);assert.equal(after[card.id].reviews,(before[card.id]?.reviews||0)+1);assert.equal(after[card.id].due-after[card.id].last,600000);
    }
    assert.equal(new Set(observed).size,28);await visible(page,'#review-complete');assert.equal(await page.evaluate(()=>window.atlasHasActiveReview),false);assert.equal(Object.keys(await saved(page)).length,28);
    assert.deepEqual(errors,[]);
    return ['All 32 object/kind filter combinations; 28 actual questions/answers/anchors and citations; reveal and sources never save history; explicit grades use correct intervals; context/resume preserves revealed card; completion and reload persistence'];
  } finally {await context.close();}
}

async function fakeRelease(context) {
  const release='r-0123456789abcdefabcd';let fetches=0;
  const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8').replace(/(<meta name="atlas-version" content=")[^"]+/,'$1'+release);
  await context.route(url=>url.pathname.endsWith('/version.json'),route=>route.fulfill({contentType:'application/json',body:JSON.stringify({app:'reliq',version:release,builtAt:new Date().toISOString()})}));
  await context.route(url=>url.pathname.endsWith('/index.html')&&url.searchParams.get('__atlas_release')===release,route=>{fetches++;return route.fulfill({contentType:'text/html',body:html});});
  return {release,fetches:()=>fetches};
}
async function checkRelease(page) {await page.locator('#check-update').click();await page.waitForFunction(()=>!document.querySelector('#check-update').disabled&&!document.querySelector('#apply-update').hidden);}
async function update(browser) {
  const {context,page,errors}=await contextPage(browser);const candidate=await fakeRelease(context);
  try {
    await page.clock.install({time:new Date()});await page.goto(base);await page.locator('#text-size').selectOption('xlarge');await nav(page,'learn');await page.locator('#start-review').click();await page.locator('#reveal-answer').click();
    const question=await page.locator('#card-question').textContent();await page.locator('#about-button').click();await checkRelease(page);assert.equal(await page.locator('#apply-update').isDisabled(),true);assert.equal(await page.locator('#update-now').isDisabled(),true);await closeDialog(page,'#about-dialog');
    await page.clock.fastForward(12000);assert.equal(candidate.fetches(),0);assert.equal(await page.locator('#card-question').textContent(),question);await visible(page,'#card-back');
    await page.locator('#card-context button').first().click();assert.equal(await page.evaluate(()=>window.atlasHasActiveReview),true);await page.clock.fastForward(12000);assert.equal(candidate.fetches(),0);
    await page.locator('#about-button').click();await checkRelease(page);assert.equal(await page.locator('#apply-update').isDisabled(),true);await closeDialog(page,'#about-dialog');
    await page.locator('#resume-review').click();assert.equal(await page.locator('#card-question').textContent(),question);await visible(page,'#card-back');await page.locator('[data-grade="good"]').click();await page.locator('#end-review').click();
    const progress=await saved(page);await page.locator('#study-topic').selectOption('sabu');await page.locator('#study-kind').selectOption('case');const before=new URL(page.url());
    await page.locator('#about-button').click();await checkRelease(page);assert.equal(await page.locator('#apply-update').isDisabled(),false);await page.locator('#apply-update').click();
    await page.waitForFunction(release=>document.querySelector('meta[name="atlas-version"]').content===release,candidate.release);
    await page.waitForFunction(()=>document.querySelector('#study-topic').value==='sabu'&&document.querySelector('#study-kind').value==='case');
    assert.equal(await page.locator('#text-size').inputValue(),'xlarge');assert.equal(await page.locator('html').getAttribute('data-text-size'),'xlarge');assert.deepEqual(await saved(page),progress);
    const after=new URL(page.url());for(const param of ['mode','object','view','a','b'])assert.equal(after.searchParams.get(param),before.searchParams.get(param));assert.equal(after.hash,before.hash);assert.equal(after.searchParams.has('__atlas_release'),false);assert.ok(candidate.fetches()>=2);
    assert.deepEqual(errors,[]);return ['Pending auto-update never fetches candidate during active queue, including 12 seconds in contextual reading; end enables verified update; new release retains font, both filters, full route and saved progress'];
  } finally {await context.close();}
}

async function storageFailure(browser) {
  const {context,page,errors}=await contextPage(browser);const candidate=await fakeRelease(context);
  await context.addInitScript(k=>{const original=Storage.prototype.setItem;window.__failProgressWrites=true;Storage.prototype.setItem=function(name,value){if(name===k&&window.__failProgressWrites)throw new DOMException('Test quota failure','QuotaExceededError');return original.call(this,name,value);};},key);
  try {
    await page.goto(base);await nav(page,'learn');await page.locator('#start-review').click();await page.locator('#reveal-answer').click();await page.locator('[data-grade="good"]').click();
    assert.deepEqual(await saved(page),{});assert.equal(await page.evaluate(()=>window.atlasHasUnsavedProgress),true);await visible(page,'#save-notice');assert.match(await page.locator('#save-notice').textContent(),/Не удалось сохранить/);assert.match(await page.locator('#toast').textContent(),/не сохранено/);
    await page.locator('#end-review').click();assert.equal(await page.evaluate(()=>window.atlasHasActiveReview),false);await page.locator('#about-button').click();await checkRelease(page);assert.equal(await page.locator('#apply-update').isDisabled(),true);assert.match(await page.locator('#update-status').textContent(),/не сохранил прогресс/);assert.equal(candidate.fetches(),0);await closeDialog(page,'#about-dialog');
    await page.evaluate(()=>window.__failProgressWrites=false);await page.locator('#start-review').click();await page.locator('#reveal-answer').click();await page.locator('[data-grade="good"]').click();
    assert.equal(Object.keys(await saved(page)).length,2);assert.equal(await page.evaluate(()=>window.atlasHasUnsavedProgress),false);await hidden(page,'#save-notice');assert.deepEqual(errors,[]);
    return ['Quota failure preserves in-memory rating, exposes persistent save failure, blocks update after session ends, and retries previous plus new rating on later successful save'];
  } finally {await context.close();}
}

async function offline(browser) {
  const {context,page,errors}=await contextPage(browser);const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await context.route(/^https?:/,route=>route.abort('internetdisconnected'));
  try {
    await page.goto(pathToFileURL(path.join(root,'docs/RELIQ.html')).href);await visible(page,'#object-name');assert.equal(await page.locator('#object-list button').count(),7);
    for(const object of content.objects){await page.locator(`#object-list [data-object="${object.id}"]`).click();await page.locator('[data-view="detail"]').click();await visible(page,'#diagram-art [data-layer="detail"]');}
    await nav(page,'compare');await page.locator('#reveal-comparison').click();await visible(page,'#comparison-answer');await nav(page,'learn');await page.locator('#start-review').click();await page.locator('#reveal-answer').click();await page.locator('[data-grade="again"]').click();await page.locator('#end-review').click();await page.locator('#about-button').click();
    assert.equal(await page.locator('#check-update').isDisabled(),true);assert.match(await page.locator('#update-status').textContent(),/автономный файл/);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
    return ['Standalone file opens with every HTTP(S) request aborted; seven illustrations, comparison and recall work; update disabled; zero external requests'];
  } finally {await context.close();}
}

(async()=>{
  assert.equal(content.objects.length,7);assert.equal(content.cards.length,28);
  for(const engine of ['chromium','webkit']){
    const executable=process.env.CHROMIUM_EXECUTABLE;
    const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&executable?{executablePath:executable}:{})});
    try {for(const [suite,run] of Object.entries({catalogue,recall,update,storageFailure,offline})){
      const started=Date.now();try{const checks=await run(browser);reports.push({engine,suite,passed:true,milliseconds:Date.now()-started,checks});process.stdout.write(`PASS ${engine} ${suite}\n`);}
      catch(error){reports.push({engine,suite,passed:false,milliseconds:Date.now()-started,error:error.stack});process.stdout.write(`FAIL ${engine} ${suite}: ${error.message}\n`);}
      fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({checked:new Date().toISOString(),base,reports},null,2)+'\n');
    }} finally {await browser.close();}
  }
  process.stdout.write(`Result: ${output}\n`);if(reports.some(r=>!r.passed))process.exitCode=1;
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
