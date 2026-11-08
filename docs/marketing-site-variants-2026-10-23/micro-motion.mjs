export function initMicroStories(){
 const roots=[...document.querySelectorAll('[data-micro-story]')];if(!roots.length)return;
 const refreshers=[];let resizeFrame=0;
 const gsap=window.gsap,ST=window.ScrollTrigger,calm=matchMedia('(prefers-reduced-motion:reduce)');
 if(gsap&&ST)gsap.registerPlugin(ST);
 for(const root of roots){
  const steps=JSON.parse(root.dataset.microConfig),shell=root.querySelector('.micro-shell'),carry=root.querySelector('[data-micro-carry]'),track=root.querySelector('[data-micro-track]');
  const controls=[...root.querySelectorAll('[data-micro-step]')],bars=controls.map(c=>c.querySelector('i'));
  let selected=-1,progress=0,trigger=null,pinned=false;
  root.classList.add('micro-ready');
  root.querySelector('.micro-controls').hidden=false;
  function position(slot){if(!track)return{x:0,y:0,width:0};const a=track.getBoundingClientRect(),b=track.querySelector(`[data-micro-slot="${slot}"]`).getBoundingClientRect();return{x:b.left-a.left,y:b.top-a.top,width:b.width}}
  function paint(p){
   progress=Math.max(0,Math.min(steps.length-1,p));const index=Math.min(steps.length-1,Math.floor(progress+.3));
   if(index!==selected){selected=index;root.dataset.microIndex=String(index);const step=steps[index];root.querySelector('[data-micro-title]').textContent=step.title;root.querySelector('[data-micro-copy]').textContent=step.copy;root.querySelector('[data-micro-count]').textContent=`${index+1} из ${steps.length}`;
    for(const el of root.querySelectorAll('[data-micro-value]'))if(step.values[el.dataset.microValue]!==undefined)el.textContent=step.values[el.dataset.microValue];
    controls.forEach((c,i)=>c.setAttribute('aria-pressed',String(i===index)));
    root.querySelectorAll('[data-under-slot]').forEach(el=>el.hidden=Number(el.dataset.underSlot)===(step.slot||0));root.querySelectorAll('[data-under-first]').forEach(el=>el.hidden=index>0);root.querySelectorAll('[data-under-result]').forEach(el=>el.hidden=index===0);
    root.querySelectorAll('[data-under-purchase-catalog]').forEach(el=>el.hidden=index===3);root.querySelectorAll('[data-under-purchase-order]').forEach(el=>el.hidden=index!==3);
    root.querySelectorAll('[data-purchase-detail]').forEach(el=>el.hidden=index===2);root.querySelectorAll('[data-purchase-mail]').forEach(el=>el.hidden=index!==2);
   }
   bars.forEach((bar,i)=>bar.style.transform=`scaleX(${Math.max(0,Math.min(1,progress-i+1))})`);
   if(carry){const from=Math.min(steps.length-1,Math.floor(progress)),to=Math.min(steps.length-1,from+1),f=Math.max(0,Math.min(1,(progress-from-.4)/.3));const a=position(steps[from].slot||0),b=position(steps[to].slot||0);const eased=f*f*(3-2*f);const x=a.x+(b.x-a.x)*eased,y=a.y+(b.y-a.y)*eased;if(gsap)gsap.set(carry,{x,y,width:a.width+(b.width-a.width)*eased});else{carry.style.transform=`translate(${x}px,${y}px)`;carry.style.width=a.width+'px'}}
   const meter=root.querySelector('[data-stock-meter]');if(meter){const a=Math.min(steps.length-1,Math.floor(progress)),b=Math.min(steps.length-1,a+1),f=Math.max(0,Math.min(1,(progress-a-.4)/.3));meter.style.transform=`scaleX(${steps[a].values.fill+(steps[b].values.fill-steps[a].values.fill)*f})`;root.querySelector('[data-stock-reserve]').style.opacity=String(selected===2?1:0);const boxes=root.querySelector('.micro-boxes');const issued=Math.max(0,Math.min(1,(progress-2.4)/.3));if(gsap)gsap.set(boxes,{x:issued*44,y:issued*9,opacity:1-issued*.7});}
  }
  function stop(){trigger?.kill();if(carry)gsap?.killTweensOf(carry);trigger=null;root.classList.remove('micro-pinned');root.style.removeProperty('--micro-distance');root.style.removeProperty('--micro-height');pinned=false}
  function setup(){
   const old=progress;stop();root.classList.toggle('micro-reduced',calm.matches);
   if(gsap&&ST&&!calm.matches&&new URLSearchParams(location.search).get('motion')!=='off'){
    const h=shell.getBoundingClientRect().height;root.style.setProperty('--micro-height',h+'px');pinned=h<innerHeight-60;
    if(pinned){
     root.classList.add('micro-pinned');root.style.setProperty('--micro-distance',Math.round(Math.min(900,innerHeight*.9))+'px');
     trigger=ST.create({trigger:root,start:'top top',end:()=>'+='+Math.max(1,root.offsetHeight-shell.offsetHeight-100),invalidateOnRefresh:true,onUpdate:self=>paint(self.progress*(steps.length-1)),onRefresh:self=>paint(self.progress*(steps.length-1))});
    }
   }
   paint(trigger?trigger.progress*(steps.length-1):old);
  }
  // Story time follows native scroll; a selected step seeks that same scroll position.
  controls.forEach((button,index)=>button.addEventListener('click',()=>{
   root.querySelector('[data-micro-announcement]').textContent=steps[index].title+'. '+steps[index].copy;
   if(trigger&&pinned){window.scrollTo({top:trigger.start+(trigger.end-trigger.start)*index/(steps.length-1),behavior:'smooth'});return}
   const from=carry&&gsap?{x:gsap.getProperty(carry,'x'),y:gsap.getProperty(carry,'y'),width:carry.offsetWidth}:null;
   const oldFill=steps[selected].values.fill;gsap?.killTweensOf(carry);paint(index);
   if(gsap&&!calm.matches&&new URLSearchParams(location.search).get('motion')!=='off'){
    if(carry){const to=position(steps[index].slot||0);gsap.fromTo(carry,from,{...to,duration:.45,ease:'power2.inOut',overwrite:true})}
    const meter=root.querySelector('[data-stock-meter]');if(meter)gsap.fromTo(meter,{scaleX:oldFill},{scaleX:steps[index].values.fill,duration:.4,ease:'power2.out',overwrite:true});
   }
   // Controls may be lower than the explanation; reveal the newly selected action.
   requestAnimationFrame(()=>{const caption=root.querySelector('.micro-caption'),rect=caption.getBoundingClientRect();
    if(caption.checkVisibility()&&(rect.top<16||rect.bottom>innerHeight-16))window.scrollTo({top:scrollY+rect.top-24,behavior:calm.matches?'instant':'smooth'});
   });
  }));
  paint(0);setup();
  calm.addEventListener('change',()=>{setup();ST?.refresh()});
  refreshers.push(setup);
  root.querySelector('.micro-skip').addEventListener('click',()=>{paint(steps.length-1)});
 }
 const refresh=()=>{refreshers.forEach(fn=>fn());ST?.refresh()};
 addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(refresh)},{passive:true});
 document.fonts.ready.then(refresh);
 ST?.refresh();
}
