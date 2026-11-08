async(page)=>{
 const base='http://127.0.0.1:3103/full/',checks=[],errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)network.push(r.url())});
 const check=(label,pass,detail)=>checks.push({label,pass:!!pass,detail});
 async function choose(root,index){
  await root.locator('[data-micro-step="'+index+'"]').click();const pinned=await root.evaluate(e=>e.classList.contains('micro-pinned'));
  if(pinned){const id=await root.getAttribute('id');await page.waitForFunction(({id,index})=>{const t=window.ScrollTrigger.getAll().find(t=>t.trigger.id===id);if(!t)return false;const target=t.start+(t.end-t.start)*index/3;return Math.abs(scrollY-target)<3&&document.getElementById(id).dataset.microIndex===String(index)},{id,index},{timeout:7000})}
  else await page.waitForFunction(({id,index})=>document.getElementById(id).dataset.microIndex===String(index),{id:await root.getAttribute('id'),index});
  await page.waitForFunction(id=>{const r=document.getElementById(id),c=r.querySelector('[data-micro-carry]');if(!c)return true;const steps=JSON.parse(r.dataset.microConfig),step=steps[Number(r.dataset.microIndex)],a=c.getBoundingClientRect(),b=r.querySelector('[data-micro-slot="'+step.slot+'"]').getBoundingClientRect();return Math.abs(a.x-b.x)<3&&Math.abs(a.y-b.y)<3},await root.getAttribute('id'));
  await page.evaluate(()=>new Promise(resolve=>{let previous=scrollY,stable=0;function tick(){stable=Math.abs(scrollY-previous)<.5?stable+1:0;previous=scrollY;if(stable>=6)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
 }
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const v of ['tasks','world']){
   await page.goto(base+v+'/');await page.evaluate(()=>document.fonts.ready);await page.locator('.micro-ready').first().waitFor();check(v+width+' three independent stories',await page.locator('[data-micro-story]').count()===3);
   const roots=page.locator('[data-micro-story]');
   for(let n=0;n<3;n++){
    const root=roots.nth(n),id=await root.getAttribute('id');
    for(const index of [0,1,2,3,2,1,0]){
     await choose(root,index);const r=await root.evaluate(e=>({selected:Number(e.dataset.microIndex),pressed:e.querySelectorAll('[aria-pressed=true]').length,values:Object.fromEntries([...e.querySelectorAll('[data-micro-value]')].map(x=>[x.dataset.microValue,x.textContent])),overflow:document.documentElement.scrollWidth-innerWidth,carry:e.querySelector('[data-micro-carry]')?.getBoundingClientRect().height,slot:e.querySelector('[data-micro-slot]')?.getBoundingClientRect().height}));
     check(id+width+' step '+index,r.selected===index&&r.pressed===1&&r.overflow===0&&(!r.carry||r.carry<=r.slot+2),r);
     if(id.endsWith('stock')){const expected=[['24','0','24'],['24','0','24'],['24','2','22'],['22','0','22']][index];check(id+width+' inventory arithmetic '+index,['physical','reserved','available'].every((k,i)=>r.values[k]===expected[i]))}
     if(id==='world-purchase'&&index===3){const summary=root.locator('[data-under-purchase-order]');check(id+width+' customer cabinet shows complete order',await summary.isVisible()&&/Заказ №1048\s*Новый\s*2 400 ₽/.test(await summary.innerText())&&!(await root.locator('[data-under-purchase-catalog]').isVisible()))}
     if(id==='world-purchase'&&index===2)check(id+width+' email confirmation has a visible action',await root.locator('[data-purchase-mail]').isVisible()&&await root.locator('.micro-code>span').allTextContents().then(v=>v.join('')==='4826'));
     if(width!==1440){await page.waitForFunction(id=>{const c=document.getElementById(id).querySelector('.micro-caption').getBoundingClientRect();return c.top>=12&&c.bottom<=innerHeight-12},id);check(id+width+' new explanation is in view '+index,await root.locator('.micro-caption').isVisible())}
    }
   }
   check(v+width+' no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
 }
 // Restored scroll must immediately resolve the same stage after a reload.
 await page.setViewportSize({width:1440,height:900});
 for(const v of ['tasks','world']){await page.goto(base+v+'/');await page.evaluate(()=>document.fonts.ready);const root=page.locator('[data-micro-story]').nth(1);await choose(root,2);const id=await root.getAttribute('id');await page.reload();await page.locator('.micro-ready').first().waitFor();await page.waitForFunction(id=>document.getElementById(id).dataset.microIndex==='2',id);check(v+' reload keeps middle stage',await page.locator('#'+id).getAttribute('data-micro-index')==='2');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('.micro-pinned'));check(v+' reduced motion removes long pin and exposes all steps',await page.locator('.micro-reduced .micro-fallback li:visible').count()===12);await page.locator('#'+id+' [data-micro-step="3"]').focus();await page.keyboard.press('Enter');check(v+' keyboard step works without movement',await page.locator('#'+id).getAttribute('data-micro-index')==='3');await page.emulateMedia({reducedMotion:'no-preference'});}
 // No JavaScript: the complete story stays in the document in a static reading order.
 const context=await page.context().browser().newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const fallback=await context.newPage();for(const v of ['tasks','world']){await fallback.goto(base+v+'/');check(v+' no-JS story remains readable',await fallback.locator('.micro-fallback li:visible').count()===12);check(v+' no-JS has no inactive step controls',await fallback.locator('.micro-controls:visible').count()===0)}await context.close();
 return{checks:checks.length,failed:checks.filter(c=>!c.pass),errors,network};
}
