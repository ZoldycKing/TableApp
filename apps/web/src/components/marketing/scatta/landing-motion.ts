// @ts-nocheck
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import Lenis from 'lenis'

/** Ports the approved landing motion: Lenis, pinned scenes, hero sequence, magnetic CTAs. */
export function startScattaLanding(root: HTMLElement) {
  let dead = false
  let lenis: Lenis | null = null
  const listeners: Array<() => void> = []
  const listen = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn)
    listeners.push(() => target.removeEventListener(type, fn))
  }
  gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)
  const ctx = gsap.context(() => {}, root)
  const applyScale = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const z = w < 1100 ? 1 : w < 1441 ? Math.max(0.8, Math.min(1, w / 1440, h / 820)) : Math.min(2, Math.max(1, 0.91 * Math.min(w / 1440, h / 820)))
    window.__z = z
    root.style.setProperty('--z', String(z))
  }
  applyScale()


gsap.registerPlugin(ScrollTrigger,MotionPathPlugin);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches,SHOT=location.search.includes('shot'),FINE=matchMedia('(pointer:fine)').matches;
const E='expo.out',E2='power3.inOut',$=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
const fmt=n=>Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g,' ');
function splitLines(el){
  const nodes=[];el.childNodes.forEach(n=>{if(n.nodeName==='BR'){nodes.push({br:1});return}const cls=n.nodeType===3?'':n.className;n.textContent.split(/(\s+)/).forEach(t=>{if(t.trim())nodes.push({t,cls});else if(t)nodes.push({sp:1})})});
  el.innerHTML=nodes.map(n=>n.br?'<br>':n.sp?' ':`<span class="w ${n.cls}" style="display:inline-block">${n.t}</span>`).join('');
  const ws=[...el.querySelectorAll('.w')];const lines=[];let top=null,cur=[];
  ws.forEach(w=>{const t=w.offsetTop;if(top===null||Math.abs(t-top)>4){if(cur.length)lines.push(cur);cur=[];top=t}cur.push(w)});if(cur.length)lines.push(cur);
  el.innerHTML=lines.map(l=>'<span class="ln-m"><span class="ln-i">'+l.map(w=>w.outerHTML).join(' ')+'</span></span>').join('');
  return [...el.querySelectorAll('.ln-i')];
}
function wordsOf(el){el.innerHTML=el.innerHTML.split(/ (?![^<]*>)/).map(w=>`<span class="w">${w}</span>`).join(' ');return el.querySelectorAll('.w')}


let __rz;listen(window,'resize',()=>{clearTimeout(__rz);__rz=setTimeout(()=>{const w=innerWidth,h=innerHeight,z=w<1100?1:w<1441?Math.max(.8,Math.min(1,w/1440,h/820)):Math.min(2,Math.max(1,.91*Math.min(w/1440,h/820)));if(Math.abs(z-(window.__z||1))>.01){window.__z=z;root.style.setProperty('--z',String(z));window.__z=z;ScrollTrigger.refresh()}},200)});
const fitBB=()=>root.querySelectorAll(".bb").forEach(b=>{b.classList.remove("tight");if(b.clientWidth&&b.scrollWidth>b.clientWidth+1)b.classList.add("tight")});document.fonts.ready.then(()=>setTimeout(fitBB,50));listen(window,"resize",()=>setTimeout(fitBB,260));
const fitFlow=()=>{const cv=root.querySelector(".sw .lc .cv"),w=root.querySelector(".sw .lc .cvw");if(!cv||!w||innerWidth<1100)return;const z=window.__z||1,s=Math.max(.7,Math.min(1.45,(cv.clientWidth-56*z)/(760*z),(cv.clientHeight-48*z)/(460*z)));w.style.setProperty("--fs",s.toFixed(3))};fitFlow();document.fonts.ready.then(fitFlow);listen(window,"resize",()=>setTimeout(fitFlow,260));
document.fonts.ready.then(()=>{if(dead)return;ctx.add(()=>{
 
 if(!RM){lenis=new Lenis({duration:1.15,easing:t=>1-Math.pow(1-t,4),smoothWheel:true});window.lenis=lenis;lenis.on('scroll',ScrollTrigger.update);const __raf=t=>{lenis&&lenis.raf(t*1000)};gsap.ticker.add(__raf);listeners.push(()=>gsap.ticker.remove(__raf));gsap.ticker.lagSmoothing(0)}
 const hdr=$('#hdr');let last=0;
 ScrollTrigger.create({start:0,end:'max',onUpdate:s=>{const y=s.scroll();hdr.classList.toggle('solid',y>20);hdr.classList.toggle('hide',y>400&&y>last);last=y}});
 const quoteWords=[];
 // mobile: each story step gets its own window
 const URLm=['vint.scatta.app/клиенты','glina.scatta.app/расписание','splav.scatta.app/сценарии'];
 $$('.step').forEach((st,i)=>{const l=$$('.sw .lyr')[i];if(!l)return;const f=document.createElement('div');f.className='frame mfr';f.innerHTML='<div class="wtop"><i></i><i></i><i></i><span class="url">'+URLm[i]+'</span></div>';const c=l.cloneNode(true);c.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));c.style.clipPath='none';f.appendChild(c);st.appendChild(f)});
 // odometer build
 $$('.odo').forEach(o=>{const v=o.dataset.v,s=o.dataset.s||'';o.innerHTML=[...v].map(d=>`<span class="dg"><span class="dc">${[...Array(20)].map((_,i)=>`<span>${i%10}</span>`).join('')}<span>${d}</span></span></span>`).join('')+(s?`<span class="sf2">${s.replace(/ /g,'&nbsp;')}</span>`:'')});
 // marquee
 window.__ready0=true;window.__ev=()=>{};
 if(matchMedia('(min-width:1100px)').matches){$$('.sw .lyr').forEach((el,i)=>{if(i)el.style.clipPath='inset(100% 0% 0% 0%)'});const steps=$$('.step');if(steps[0])steps[0].classList.add('on')}
 if(RM){quoteWords.forEach(w=>w.style.opacity=1);$$('.dc').forEach(c=>c.style.transform='translateY(-95.238%)');$('#pok').style.opacity=1;window.__ready=true;return}
 const mm=gsap.matchMedia();
 // ---- background decor (faint, tinted, never behind text)
 const DG={
  spark:[120,36,'<polyline points="2,30 20,23 36,26 54,13 72,17 90,6 116,11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="116" cy="11" r="2.6" fill="currentColor"/>'],
  bars:[70,40,'<rect x="0" y="22" width="9" height="18" rx="2" fill="currentColor"/><rect x="15" y="12" width="9" height="28" rx="2" fill="currentColor"/><rect x="30" y="18" width="9" height="22" rx="2" fill="currentColor"/><rect x="45" y="4" width="9" height="36" rx="2" fill="currentColor"/><rect x="60" y="14" width="9" height="26" rx="2" fill="currentColor"/>'],
  time:[150,16,'<text y="12" font-family="inherit" font-size="11" fill="currentColor">09:00   09:30   10:00</text>'],
  check:[26,26,'<circle cx="13" cy="13" r="11.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 13.5l3.3 3.3L18.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'],
  cursor:[18,24,'<path d="M2 2l13 11-6 .8 3.6 7.2-2.6 1.3-3.6-7.2L2 19z" fill="currentColor"/>'],
  conn:[130,50,'<path d="M2 46 C40 46 50 6 96 6 H118" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round"/><path d="M114 1.5l6 4.5-6 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="46" r="3" fill="currentColor"/>'],
  dots:[44,34,[...Array(12)].map((_,i)=>`<circle cx="${3+(i%4)*12.5}" cy="${3+Math.floor(i/4)*14}" r="1.8" fill="currentColor"/>`).join('')],
  cal:[64,44,[...Array(12)].map((_,i)=>`<rect x="${(i%4)*17}" y="${Math.floor(i/4)*16}" width="13" height="12" rx="3" fill="${i==6?'currentColor':'none'}" stroke="currentColor" stroke-width="1.3"/>`).join('')],
  ring:[30,30,'<circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".45"/><path d="M15 3a12 12 0 0 1 11.4 15.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
  plus:[16,16,'<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'],
  tl:[160,14,'<path d="M0 7H160" stroke="currentColor" stroke-width="1.2"/>'+[0,40,80,120,160].map(x=>`<path d="M${x} 2V12" stroke="currentColor" stroke-width="1.2"/>`).join('')+'<circle cx="92" cy="7" r="4" fill="currentColor"/>']
 };
 const DECO={
  pinL:[['spark',6,13],['time',22,17],['dots',37,24],['ring',34,62,1],['plus',95,21,1]],
  pin:[['spark',4,32],['time',20,36],['dots',33,31,1],['plus',39,20,1]]
 };
 const DECOM={pinL:[['spark',62,.5]],pin:[['dots',82,.6]]};
 const mob=matchMedia('(max-width:1099px)').matches;
 Object.entries(mob?DECOM:DECO).forEach(([id,list])=>{const host=root.querySelector('#'+id);if(!host)return;const L=document.createElement('div');L.className='deco';L.setAttribute('aria-hidden','true');
  L.innerHTML=list.map(([g,x,y,m])=>{const [w,h,b]=DG[g];return `<svg class="d${m?' dm':''}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="left:${x}%;top:${y}%">${b}</svg>`}).join('');
  host.prepend(L);
  if(!RM&&!SHOT)L.querySelectorAll('svg').forEach((s,i)=>gsap.to(s,{y:(i%2?1:-1)*(6+i%3*3),x:(i%3-1)*4,duration:9+i%4*2.5,ease:'sine.inOut',yoyo:true,repeat:-1,delay:-i*1.3}));});

 // ---- intro
 const heroLines=$$('#h1 .ln-i');gsap.set(heroLines,{yPercent:112});
 const intro=gsap.timeline({defaults:{ease:E}});
 intro.from('.hdr .lm rect',{x:i=>[-16,12,-10,18][i],y:i=>[-12,-16,14,12][i],rotation:i=>[-45,30,25,-80][i],opacity:0,duration:1.5,stagger:.07},0)
  .from('.hdr .logo,.hdr nav a,.hdr .r>*',{opacity:0,y:-8,duration:1,stagger:.04},.1)
  .to(heroLines,{yPercent:0,duration:1.3,stagger:.1},.15)
  .from('.hero .rv',{y:26,opacity:0,duration:1.1,stagger:.08},.6)
  .add(heroSeq(),.7);
 function heroSeq(){
  const tl=gsap.timeline({defaults:{ease:E}});
  tl.from('#hpan',{scale:.94,opacity:0,transformOrigin:'60% 50%',duration:1.6},0)
   .from('#hpan .hmk i',{scale:0,rotation:-30,duration:1.1,stagger:.08},.5)
   .from('#hb',{y:60,opacity:0,duration:1.4},.25)
   .from('#hr2',{y:46,opacity:0,duration:1.3},.4)
   .from('#hs2',{y:46,opacity:0,duration:1.3},.55)
   .fromTo('#hrf',{scaleX:0},{scaleX:1,duration:.9,ease:'power3.inOut'},1.1)
   .fromTo('#hseg i',{'--f':0},{'--f':1,duration:.5,stagger:.18,ease:'power2.out'},1.2)
   .from('#hst',{opacity:0,x:-8,duration:.6},1.9)
   .to('#hslot .sf',{scale:1,duration:.7,ease:'power3.out'},1.5).to('#hslot em',{color:'#fff',duration:.3},1.55)
   .to('#hbtn .b1',{yPercent:-100,opacity:0,duration:.5,ease:'power3.in'},1.75).fromTo('#hbtn .b2',{yPercent:100,opacity:0},{yPercent:0,opacity:1,duration:.7},1.9)
   .to('#hbtn',{backgroundColor:'#266DF0',duration:.6,ease:'power2.inOut'},1.9)
   .from('#hn',{y:30,opacity:0,scale:.96,duration:1.2},2.3);
  if(SHOT)tl.progress(1);
  return tl}
 mm.add('(min-width:1100px)',()=>{if(SHOT)return;
  gsap.to('#hb',{yPercent:-6,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:.8}});
  gsap.to('#hr2',{yPercent:-10,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:.8}});
  gsap.to('#hn',{yPercent:-30,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:.8}});
  gsap.to('#hs2',{yPercent:-18,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:.8}});
 });
 // ---- section heads
 $$('.split').forEach(el=>{const ls=splitLines(el);gsap.set(ls,{yPercent:112});gsap.to(ls,{yPercent:0,duration:1.25,ease:E,stagger:.09,scrollTrigger:{trigger:el,start:'top 84%'}})});
 $$('.shd').forEach(s=>gsap.from(s.querySelectorAll('.eb'),{opacity:0,y:10,duration:.9,ease:E,stagger:.06,scrollTrigger:{trigger:s,start:'top 86%'}}));
 // ---- LINK scene
 const scene=$('#scene'),wire=$('#wire'),wp=$('#wp'),wc=$('#wc'),fly=$('#fly'),tap=$('#tap'),slot=$('#slot'),pbtn=$('#pbtn'),tgt=$('#tgt'),nb=$('#nb');
 function rel(el){const a=el.getBoundingClientRect(),s=scene.getBoundingClientRect();return {x:a.left-s.left,y:a.top-s.top,w:a.width,h:a.height}}
 let G={};
 function geo(){const w=scene.offsetWidth,h=scene.offsetHeight;wire.setAttribute('width',w);wire.setAttribute('height',h);wire.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const b=rel(pbtn),t=rel(tgt),s=rel(slot);const S={x:b.x+b.w*.5,y:b.y+b.h*.5},T={x:t.x+t.w*.5,y:t.y+t.h*.5};const vert=Math.abs(T.x-S.x)<w*.3;
  const d=vert?`M${S.x},${S.y} C${S.x},${S.y+(T.y-S.y)*.55} ${T.x},${T.y-(T.y-S.y)*.5} ${T.x},${T.y}`:`M${S.x},${S.y} C${S.x+(T.x-S.x)*.6},${S.y} ${T.x-(T.x-S.x)*.55},${T.y} ${T.x},${T.y}`;
  wp.setAttribute('d',d);const L=wp.getTotalLength();G={S,T,s,b,L};gsap.set(wp,{strokeDasharray:L,strokeDashoffset:L});gsap.set(wc,{attr:{cx:T.x,cy:T.y}});return G}
 const bts=$$('.bt');const okc=$('#okc'),okp=$('#okp');const okL=okc.getTotalLength(),okpL=okp.getTotalLength();
 function linkTl(){geo();
  gsap.set(okc,{strokeDasharray:okL,strokeDashoffset:okL});gsap.set(okp,{strokeDasharray:okpL,strokeDashoffset:okpL});gsap.set('#pok',{opacity:0,y:20});
  const cnt={v:23},lk=$('#lkN');
  const tl=gsap.timeline({paused:true,defaults:{ease:'power2.inOut'}});
  tl.set(tap,{x:()=>G.s.x+G.s.w*.5+90,y:()=>G.s.y+G.s.h*.5+120},0)
   .to(tap,{opacity:1,duration:.04},.01)
   .to(tap,{x:()=>G.s.x+G.s.w*.5,y:()=>G.s.y+G.s.h*.5,duration:.12},.02)
   .to(tap,{scale:.75,duration:.025,ease:'power2.in'},.145).to(tap,{scale:1,duration:.05,ease:'power2.out'},.17)
   .to('#slot .sf',{scale:1,duration:.07,ease:'power3.out'},.15).to('#slot em',{color:'#fff',duration:.03},.16)
   .to('#pbtn .b1',{yPercent:-100,opacity:0,duration:.05},.19).fromTo('#pbtn .b2',{yPercent:100,opacity:0},{yPercent:0,opacity:1,duration:.06},.2)
   .to(pbtn,{backgroundColor:'#266DF0',duration:.06},.2)
   .to(tap,{x:()=>G.b.x+G.b.w*.62,y:()=>G.b.y+G.b.h*.5,duration:.12},.25)
   .to(tap,{scale:.75,duration:.025},.375).to(pbtn,{scale:.965,duration:.025},.375).to([tap,pbtn],{scale:1,duration:.05},.4)
   .to(tap,{opacity:0,duration:.05},.44)
   .fromTo(fly,{opacity:0,scale:.6},{opacity:1,scale:1,duration:.06,ease:'power2.out'},.42)
   .fromTo(fly,{motionPath:{path:wp,align:wp,alignOrigin:[.5,.5],start:0,end:0}},{motionPath:{path:wp,align:wp,alignOrigin:[.5,.5],start:0,end:1},duration:.3,ease:'power1.inOut',immediateRender:false},.42)
   .to(wp,{strokeDashoffset:0,duration:.28,ease:'power1.inOut'},.43)
   .to('#pok',{opacity:1,y:0,duration:.08,ease:'power3.out'},.5).to(okc,{strokeDashoffset:0,duration:.12},.53).to(okp,{strokeDashoffset:0,duration:.06},.6)
   .to(fly,{scale:.55,opacity:0,duration:.05,ease:'power2.in'},.72)
   .to(tgt,{opacity:0,duration:.04},.73)
   .fromTo(nb,{scaleX:0},{scaleX:1,duration:.08,ease:'power3.out'},.73).fromTo('#nb .nfl',{opacity:.9},{opacity:0,duration:.14},.78)
   .to(cnt,{v:24,duration:.06,ease:'none',onUpdate:()=>lk.textContent=Math.round(cnt.v)},.74)
   .add(()=>{},.75).to('#clog',{opacity:0,duration:.03},.76).add(()=>{},.79)
   .to(wp,{opacity:0,duration:.1},.8)
   .to(bts[0],{opacity:1,'--p':1,duration:.2},.02).to(bts[0],{opacity:.4,duration:.05},.24)
   .to(bts[1],{opacity:1,'--p':1,duration:.25},.25).to(bts[1],{opacity:.4,duration:.05},.68)
   .to(bts[2],{opacity:1,'--p':1,duration:.2},.7)
   .to({},{duration:.1},.9);
  // clog text swap via progress
  tl.eventCallback('onUpdate',()=>{const p=tl.progress();const t=p>.76?'<b>Елена Орлова</b> · SUP-доска, 14:00 — напоминание 27.11.2026':'Ждём новых броней…';const c=$('#clog');if(c.dataset.t!==t){c.dataset.t=t;c.innerHTML=t;gsap.fromTo(c,{opacity:0},{opacity:1,duration:.4})}});
  return tl}
 mm.add('(min-width:1100px)',()=>{const tl=linkTl();
  const st=ScrollTrigger.create({trigger:'#pinL',start:'top top',end:'+=1700',pin:true,scrub:.8,animation:tl,invalidateOnRefresh:true,onRefreshInit:()=>{tl.progress(0)},onRefresh:()=>{geo();tl.invalidate()}});
  st.fr=[.3,.6,1];window.__pins=window.__pins||[];window.__pins[0]=st;});
 mm.add('(max-width:1099px)',()=>{const tl=linkTl();tl.timeScale(.2);
  if(SHOT){tl.progress(1)}else ScrollTrigger.create({trigger:'#scene',start:'top 45%',once:true,onEnter:()=>{geo();tl.invalidate();tl.play(0)}});});
 // ---- template cards
 $$('.tc').forEach((c,i)=>gsap.from(c,{y:46,opacity:0,duration:1.2,ease:E,delay:(i%3)*.08,scrollTrigger:{trigger:c,start:'top 90%'}}));
 // ---- story pin (desktop)
 mm.add('(min-width:1100px)',()=>{
  const steps=gsap.utils.toArray('.step'),lyr=gsap.utils.toArray('.sw .lyr'),bars=gsap.utils.toArray('#prog b'),url=$('#swUrl');
  const URLS=['vint.scatta.app/клиенты','glina.scatta.app/расписание','splav.scatta.app/сценарии'];
  steps.forEach((s,k)=>s.classList.toggle('on',k==0));gsap.set(lyr.slice(1),{clipPath:'inset(100% 0% 0% 0%)'});
  const paths=$$('#flow path');paths.forEach(p=>{const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L});
  const nds=gsap.utils.toArray('.sw .lc .nd');gsap.set(nds,{opacity:0,y:12});
  const bbs=gsap.utils.toArray('.sw .lb .bb');gsap.set(bbs,{scaleX:0});
  const tl=gsap.timeline({defaults:{ease:'power2.inOut'},scrollTrigger:{trigger:'#pin',start:'top top',end:'+=2000',pin:true,scrub:.8,
    onUpdate:s=>{const i=s.progress<.3?0:s.progress<.64?1:2;if(url.dataset.i!=i){url.dataset.i=i;url.textContent=URLS[i];steps.forEach((s,k)=>s.classList.toggle('on',k==i))}}}});
  tl.to(bars[0],{scaleX:1,duration:.85,ease:'none'},0)
   
   .to(lyr[1],{clipPath:'inset(0% 0% 0% 0%)',duration:.35,ease:'power3.inOut'},.8)
   .to(bbs,{scaleX:1,duration:.3,stagger:.012,ease:'power3.out'},.98)
   .to(bars[1],{scaleX:1,duration:.85,ease:'none'},1.05)
   
   .to(lyr[2],{clipPath:'inset(0% 0% 0% 0%)',duration:.35,ease:'power3.inOut'},1.85)
   .to(nds,{opacity:1,y:0,duration:.25,stagger:.04,ease:'power3.out'},2.05)
   .to(paths,{strokeDashoffset:0,duration:.35,stagger:.05,ease:'power2.inOut'},2.1)
   .to(bars[2],{scaleX:1,duration:.9,ease:'none'},2.1).to({},{duration:.01},3);
  window.__pins=window.__pins||[];window.__pins[1]=tl.scrollTrigger;window.__pinST=tl.scrollTrigger;
 });
 mm.add('(max-width:1099px)',()=>{gsap.utils.toArray('.mfr').forEach(f=>gsap.from(f,{y:40,opacity:0,duration:1.1,ease:E,scrollTrigger:{trigger:f,start:'top 85%'}}))});
 // marquee, speed follows scroll velocity
 const mqT=$('#mqT');const mqTw=gsap.to(mqT,{xPercent:-50,duration:38,ease:'none',repeat:-1});
 if(lenis){let ts=1;lenis.on('scroll',e=>{const v=e.velocity||0;ts=gsap.utils.clamp(-6,6,1+v*.18);gsap.to(mqTw,{timeScale:ts,duration:.3,overwrite:true,onComplete:()=>gsap.to(mqTw,{timeScale:Math.sign(ts)||1,duration:1.2})})})}
 // ledger odometer
 $$('.lr').forEach((r,i)=>{gsap.from(r,{opacity:0,y:26,duration:1,ease:E,scrollTrigger:{trigger:r,start:'top 90%'}});
  const cols=r.querySelectorAll('.dc');gsap.set(cols,{yPercent:0});
  ScrollTrigger.create({trigger:r,start:'top 86%',once:true,onEnter:()=>gsap.to(cols,{yPercent:-100*20/21,duration:2.2,ease:'expo.inOut',stagger:{each:.12,from:'end'},delay:.1})});});
 gsap.from('.form,.next',{opacity:0,y:24,duration:1.1,ease:E,stagger:.1,scrollTrigger:{trigger:'.form',start:'top 92%'}});
 // big wordmark + mark assemble
 const wl=$$('#wm span'),bm=$$('#bigm rect');
 if(SHOT){}else{gsap.fromTo(wl,{yPercent:105},{yPercent:0,ease:'none',stagger:.06,scrollTrigger:{trigger:'#big',start:'top 98%',end:'bottom bottom',scrub:.8}});
  gsap.fromTo(bm,{x:i=>[-30,40,-50,60][i],y:i=>[-60,-30,40,-80][i],rotation:i=>[-60,45,30,-120][i]},{x:0,y:0,rotation:0,ease:'none',scrollTrigger:{trigger:'#big',start:'top 98%',end:'bottom bottom',scrub:.8}});}
 // magnetic buttons
 if(FINE){$$('.mag').forEach(el=>{const inner=el.querySelector('.bt2');const xT=gsap.quickTo(el,'x',{duration:.6,ease:'power3'}),yT=gsap.quickTo(el,'y',{duration:.6,ease:'power3'}),xi=gsap.quickTo(inner,'x',{duration:.6,ease:'power3'}),yi=gsap.quickTo(inner,'y',{duration:.6,ease:'power3'});
  listen(el,'mousemove',e=>{const r=el.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;xT(dx*.25);yT(dy*.35);xi(dx*.12);yi(dy*.16)});
  listen(el,'mouseleave',()=>{xT(0);yT(0);xi(0);yi(0)})});
 }
 window.__ev=()=>{};
 ScrollTrigger.refresh();
 window.__ready=true;
})});

  return () => {
    dead = true
    listeners.forEach(fn => fn())
    lenis?.destroy()
    delete window.lenis
    ctx.revert()
  }
}
