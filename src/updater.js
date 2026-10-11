/* Shared static-atlas updater. Each app owns its preference and handoff keys. */
(() => {
 'use strict';
 const meta=name=>document.querySelector(`meta[name="${name}"]`)?.content;
 const app=meta('atlas-app'),current=meta('atlas-version'),built=meta('atlas-built');
 if(!app||!current)return;
 const online=/^https?:$/.test(location.protocol),base=new URL('.',location.href);
 const prefKey=`${app}-auto-update`,handoffKey=`${app}-update-handoff`,guardKey=`${app}-update-guard`;
 let enabled=true,pending=null,checking=null,applying=false,lastCheck=0,lastInput=Date.now(),snoozeUntil=0,retryAt=0,handoffUnavailable=false;
 const read=(store,key)=>{try{return JSON.parse(window[store].getItem(key));}catch{return null;}};
 const write=(store,key,value)=>{try{window[store].setItem(key,JSON.stringify(value));return true;}catch{return false;}};
 try{enabled=localStorage.getItem(prefKey)!=='off';}catch{}
 const about=document.querySelector('#about-dialog');
 const controls=document.createElement('section');controls.className='app-updates';controls.id='app-updates';
 controls.innerHTML=`<h3>Обновления приложения</h3><label class="update-toggle"><input id="auto-update" type="checkbox"><span>Автообновление</span></label><p class="update-status" id="update-status" role="status"></p><p class="update-help">Проверка при открытии, возвращении в приложение и раз в минуту, пока оно открыто. Текущее повторение не прерывается.</p><div class="update-actions"><button type="button" id="check-update" class="secondary-button">Проверить сейчас</button><button type="button" id="apply-update" class="secondary-button" hidden>Обновить</button></div><small class="update-version"></small>`;
 about?.append(controls);
 const banner=document.createElement('aside');banner.id='update-banner';banner.className='update-banner';banner.hidden=true;
 banner.setAttribute('aria-label','Обновление приложения');
 banner.innerHTML='<p id="update-banner-text" role="status"></p><div><button type="button" id="update-now">Обновить</button><button type="button" id="update-later">Позже</button></div>';
 document.body.append(banner);
 // Keep the footer and its controls reachable behind a fixed mobile banner.
 new ResizeObserver(()=>document.documentElement.style.setProperty('--update-banner-space',`${banner.offsetHeight+32}px`)).observe(banner);
 const toggle=controls.querySelector('#auto-update'),status=controls.querySelector('#update-status'),checkButton=controls.querySelector('#check-update'),applyButton=controls.querySelector('#apply-update');
 toggle.checked=enabled;toggle.disabled=!online;checkButton.disabled=!online;
 const versionDate=new Date(built);
 controls.querySelector('.update-version').textContent=Number.isNaN(versionDate.getTime())?'':`Версия от ${versionDate.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`;
 const setStatus=text=>{status.textContent=text;};
 function reviewBusy(){
  const session=document.querySelector('#review-session'),answer=document.querySelector('#recall-answer');
  return Boolean(window.atlasHasActiveReview||session&&!session.hidden||answer&&!answer.hidden||document.querySelector('details.engineering-recall[open]'));
 }
 function pageBusy(){
  return reviewBusy()||Boolean(document.querySelector('dialog[open],.viewer.expanded,.drawing-card.is-expanded'))||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
 }
 function showPending(){
  if(!pending)return;
  const unsaved=Boolean(window.atlasHasUnsavedProgress),busy=reviewBusy()||unsaved;
  const message=unsaved?'Обновление отложено: браузер не сохранил прогресс. Оставьте приложение открытым, чтобы не потерять повторения.':handoffUnavailable?'Автообновление отложено: браузер запретил временное сохранение. Можно обновить вручную.':Date.now()<retryAt?'Новая версия пока недоступна целиком. Повторим попытку позже.':busy?'Новая версия готова. Завершите повторение и выйдите из режима сравнения, чтобы обновить приложение.':enabled?'Новая версия готова. Приложение обновится автоматически; настройки и прогресс сохранятся.':'Доступна новая версия приложения.';
  setStatus(message);document.querySelector('#update-banner-text').textContent=message;
  banner.hidden=document.hidden||Date.now()<snoozeUntil;
  applyButton.hidden=false;applyButton.disabled=busy;document.querySelector('#update-now').disabled=busy;
 }
 async function request(url,type='json'){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(url,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
   if(!response.ok)throw new Error('HTTP '+response.status);
   return await response[type]();
  }finally{clearTimeout(timeout);}
 }
 async function check(force=false){
  if(!online||document.hidden||applying||checking)return checking;
  if(!force&&(!enabled||Date.now()-lastCheck<25000))return;
  lastCheck=Date.now();checkButton.disabled=true;if(force)setStatus('Проверяем новую версию…');
  checking=(async()=>{
   try{
    const url=new URL('version.json',base);url.searchParams.set('check',String(Date.now()));
    const release=await request(url);
    if(release.app!==app||!/^r-[a-f0-9]{20}$/.test(release.version)||!Number.isFinite(Date.parse(release.builtAt)))throw new Error('Invalid release');
    if(release.version===current){pending=null;banner.hidden=true;applyButton.hidden=true;setStatus('Установлена актуальная версия.');return;}
    if(pending?.version!==release.version){pending=release;snoozeUntil=0;retryAt=0;}
    showPending();
   }catch{setStatus('Не удалось проверить обновление. Попробуем при следующем подключении.');}
   finally{checking=null;checkButton.disabled=false;}
  })();
  return checking;
 }
 function rememberPosition(){
  const fields={};for(const id of ['text-size','peak-search','wonder-search','study-topic','study-kind','study-peak','study-wonder']){const e=document.getElementById(id);if(e)fields[id]=e.value;}
  return write('sessionStorage',handoffKey,{time:Date.now(),version:pending.version,scroll:scrollY,fields,range:document.querySelector('[data-range].active')?.dataset.range,point:document.querySelector('.point-button.active')?.dataset.point});
 }
 async function apply(manual=false){
  if(!pending||applying||document.hidden||reviewBusy()||window.atlasHasUnsavedProgress||!online)return;
  if(!manual&&(!enabled||handoffUnavailable||pageBusy()||Date.now()-lastInput<8000||Date.now()<snoozeUntil||Date.now()<retryAt))return;
  const guard=read('sessionStorage',guardKey);
  if(guard?.version===pending.version&&!manual){setStatus('Автообновление не завершилось. Повторите установку кнопкой «Обновить».');return;}
  applying=true;applyButton.disabled=true;document.querySelector('#update-now').disabled=true;
  const candidate=pending.version;
  const target=new URL('index.html',base);target.search=location.search;target.hash=location.hash;target.searchParams.set('__atlas_release',candidate);target.searchParams.set('__atlas_check',String(Date.now()));
  try{
   {
    const html=await request(target,'text'),doc=new DOMParser().parseFromString(html,'text/html');
    if(doc.querySelector('meta[name="atlas-app"]')?.content!==app||doc.querySelector('meta[name="atlas-version"]')?.content!==candidate)throw new Error('Release not ready');
   }
   // A user can start a card or open a dialog while the network request is in flight.
   if(reviewBusy()||window.atlasHasUnsavedProgress||document.hidden||!manual&&(pageBusy()||!enabled||Date.now()-lastInput<8000||Date.now()<snoozeUntil)){applying=false;showPending();return;}
   rememberPosition();
   if(!write('sessionStorage',guardKey,{version:candidate,time:Date.now()})){
    if(!manual){applying=false;handoffUnavailable=true;showPending();return;}
   }
   location.replace(target.href);
  }catch{applying=false;retryAt=Date.now()+60000;showPending();}
 }
 function restore(){
  const clean=new URL(location.href);clean.searchParams.delete('__atlas_release');clean.searchParams.delete('__atlas_check');try{history.replaceState(null,'',clean.href);}catch{}
  const saved=read('sessionStorage',handoffKey),guard=read('sessionStorage',guardKey);
  if(guard?.version===current){try{sessionStorage.removeItem(guardKey);}catch{}}
  if(!saved||saved.version!==current||Date.now()-saved.time>600000)return;
  try{sessionStorage.removeItem(handoffKey);}catch{}
  for(const [id,value] of Object.entries(saved.fields||{})){
   const e=document.getElementById(id);if(!e)continue;e.value=value;e.dispatchEvent(new Event(e.tagName==='INPUT'?'input':'change',{bubbles:true}));
  }
  if(saved.range)document.querySelector(`[data-range="${CSS.escape(saved.range)}"]`)?.click();
  if(saved.point)document.querySelector(`.point-button[data-point="${CSS.escape(saved.point)}"]`)?.click();
  requestAnimationFrame(()=>requestAnimationFrame(()=>scrollTo({top:saved.scroll,left:0,behavior:'instant'})));
 }
 toggle.addEventListener('change',()=>{enabled=toggle.checked;try{localStorage.setItem(prefKey,enabled?'on':'off');}catch{}if(enabled)check(true);else{setStatus('Автообновление выключено. Можно проверить версию вручную.');if(pending)showPending();}});
 checkButton.addEventListener('click',()=>check(true));applyButton.addEventListener('click',()=>apply(true));document.querySelector('#update-now').addEventListener('click',()=>apply(true));
 document.querySelector('#update-later').addEventListener('click',()=>{snoozeUntil=Date.now()+300000;banner.hidden=true;});
 ['pointerdown','keydown','input','wheel','touchmove'].forEach(event=>addEventListener(event,()=>{lastInput=Date.now();},{passive:true}));
 addEventListener('storage',e=>{if(e.key===prefKey){enabled=e.newValue!=='off';toggle.checked=enabled;if(enabled)check();}});
 const wake=()=>{if(!document.hidden){check();if(pending)showPending();}};
 addEventListener('online',()=>{lastCheck=0;check();});addEventListener('pageshow',wake);addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 if(online){setStatus(enabled?'Автообновление включено.':'Автообновление выключено.');restore();setTimeout(()=>check(),1200);setInterval(()=>check(),60000);setInterval(()=>{if(pending&&!document.hidden){showPending();apply();}},2000);}
 else{
  setStatus('Это автономный файл. Для обновлений откройте онлайн-версию.');controls.querySelector('.update-help').textContent='Сохранённый HTML остаётся самостоятельной копией приложения.';
  const link=document.createElement('a');link.href=`https://evgk724.github.io/reliq-atlas/`;link.textContent='Открыть онлайн-версию ↗';link.className='text-button';controls.append(link);
 }
})();
