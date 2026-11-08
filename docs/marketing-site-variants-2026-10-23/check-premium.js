async(page)=>{
 const base='http://127.0.0.1:3103/full/',checks=[],errors=[],network=[],shots=[];
 const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)network.push(r.url())});
 async function choose(root,i){
  await root.locator('[data-pr-step]').nth(i).click();const id=await root.getAttribute('id');
  await page.waitForFunction(({id,i})=>{const root=document.getElementById(id),pane=root.querySelectorAll('[data-pr-pane]')[i],t=window.ScrollTrigger?.getAll().find(t=>t.trigger===root);return root.dataset.prIndex===String(i)&&getComputedStyle(pane).opacity>.98&&(!t||Math.abs(scrollY-(t.start+(t.end-t.start)*i/3))<3)},{id,i});
  await page.evaluate(()=>new Promise(resolve=>{let previous=scrollY,stable=0;function tick(){stable=Math.abs(previous-scrollY)<.5?stable+1:0;previous=scrollY;if(stable>=8)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
 }
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:width>700?900:844});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const variant of ['tasks','world']){
   await page.goto(base+variant+'/');await page.evaluate(()=>document.fonts.ready);const root=page.locator('[data-pr-story]');await root.locator('.pr-story-controls').waitFor({state:'visible'});
   for(const [position,i] of [0,1,2,3,2,1,0].entries()){
    await choose(root,i);const r=await root.evaluate(e=>({index:e.dataset.prIndex,pressed:e.querySelectorAll('[data-pr-step][aria-pressed=true]').length,inert:[...e.querySelectorAll('[data-pr-pane]')].map(p=>p.inert),overflow:document.documentElement.scrollWidth-innerWidth,labelsFit:[...e.querySelectorAll('[data-pr-step]')].every(b=>b.scrollWidth<=b.clientWidth+1),visible:[...e.querySelectorAll('[data-pr-pane]')].map(p=>({visibility:getComputedStyle(p).visibility,opacity:getComputedStyle(p).opacity})),caption:e.querySelector('[data-pr-title]').textContent}));
    check(variant+width+' state '+i,r.index===String(i)&&r.pressed===1&&r.inert.every((v,n)=>v===(n!==i))&&r.overflow===0&&r.labelsFit,r);
    if(width<1000){const view=await root.evaluate(e=>({top:e.querySelector('.pr-story-head').getBoundingClientRect().top,bottom:e.querySelector('.pr-stage').getBoundingClientRect().bottom,height:innerHeight}));check(variant+width+' explanation and scene fit after selection '+i,view.top>=70&&view.top<=110&&view.bottom<=view.height+32,view)}
    if(position<4&&[1440,390].includes(width)){const file='D:/Projects/TableApp/docs/audit/marketing-directions-2026-10-23/premium-qa/'+variant+'-'+width+'-step'+i+'.png';await page.screenshot({path:file});shots.push({variant,width,i,file})}
   }
   check(variant+width+' all headings fit at most two lines',await page.locator('.pr-page h1,.pr-page h2,.pr-page h3').evaluateAll(es=>es.filter(e=>e.checkVisibility()).every(e=>e.offsetHeight/parseFloat(getComputedStyle(e).lineHeight)<2.1)));
   if(variant==='tasks'){
    for(const expected of [['Собирается',['24','2','22']],['Выдан',['22','0','22']],['Новый',['24','0','24']]]){await page.locator('.pr-sync [data-pr-confirm]').click();const r=await page.evaluate(()=>({statuses:[...document.querySelectorAll('[data-pr-status]')].map(e=>e.textContent),numbers:[...document.querySelectorAll('[data-pr-number]')].map(e=>e.textContent)}));check('tasks'+width+' shared action '+expected[0],r.statuses.every(s=>s===expected[0])&&JSON.stringify(r.numbers)===JSON.stringify(expected[1]),r)}
   }else{await page.locator('[data-demo-kind-value=booking]').click();await page.locator('[data-demo-time]').first().click();check('world'+width+' booking is interactive',await page.locator('[data-demo-time]').first().getAttribute('aria-pressed')==='true')}
  }
 }
 await page.setViewportSize({width:1440,height:900});
 for(const variant of ['tasks','world']){
  await page.goto(base+variant+'/');await page.evaluate(()=>document.fonts.ready);const root=page.locator('[data-pr-story]');await choose(root,2);await page.reload();await page.waitForFunction(()=>document.querySelector('[data-pr-story]').dataset.prIndex==='2');check(variant+' reload restores stage',true);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('.pr-pinned'));check(variant+' reduced motion exposes all explanations',await page.locator('.pr-story-fallback li:visible').count()===4);await root.locator('[data-pr-step]').nth(3).focus();await page.keyboard.press('Enter');check(variant+' keyboard chooses step',await root.getAttribute('data-pr-index')==='3');await page.emulateMedia({reducedMotion:'no-preference'});
 }
 const context=await page.context().browser().newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),fallback=await context.newPage();
 for(const variant of ['tasks','world']){await fallback.goto(base+variant+'/');check(variant+' no JS keeps complete narrative',await fallback.locator('.pr-story-fallback li:visible').count()===4&&await fallback.locator('.pr-story-controls:visible').count()===0);}
 await context.close();return{checks:checks.length,failed:checks.filter(c=>!c.pass),errors,network,shots};
}
