import { initPremium } from './premium-motion.mjs';
import { demoPanel, icon, esc } from './ui.mjs';

const variant = document.documentElement.dataset.variant;
const assetRoot = '/full/assets/';
const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.getElementById('site-menu');
const breakpoint = { tasks:900, product:960, world:950 }[variant] || 950;
const narrow = window.matchMedia(`(max-width:${breakpoint}px)`);
let menuOpen = false;
function setMenu(open, restore=false) {
  menuOpen = open && narrow.matches;
  if(menu) { menu.hidden = narrow.matches && !menuOpen; menu.classList.toggle('is-open', menuOpen); }
  if(menuButton) { menuButton.setAttribute('aria-expanded', String(menuOpen)); menuButton.setAttribute('aria-label', menuOpen?'Закрыть меню':'Открыть меню'); }
  if(restore) menuButton?.focus();
}
menuButton?.addEventListener('click',()=>setMenu(!menuOpen));
narrow.addEventListener('change',()=>setMenu(false));
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && menuOpen) setMenu(false,true); });
document.addEventListener('pointerdown',e=>{ if(menuOpen && !menu?.contains(e.target) && !menuButton?.contains(e.target)) setMenu(false); });
menu?.addEventListener('click',e=>{ if(e.target.closest('a')) setMenu(false); });
setMenu(false);

// Keep wide data tables reachable by keyboard and disclose sideways scrolling.
const tableScrollObservers=new WeakMap();
function enhanceTables(container){
for(const table of container.querySelectorAll('.table-scroll')) {
  const hint=document.createElement('p');hint.className='table-scroll-hint';
  hint.textContent='Таблицу можно прокрутить →';table.before(hint);
  table.setAttribute('role','region');table.setAttribute('aria-label','Таблица рабочего примера');
  const update=()=>{const overflow=table.scrollWidth>table.clientWidth+1;hint.hidden=!overflow;if(overflow)table.tabIndex=0;else table.removeAttribute('tabindex');};
  const observer=new ResizeObserver(update);observer.observe(table);tableScrollObservers.set(table,observer);update();
}
}
enhanceTables(document);

const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
for(const browser of document.querySelectorAll('[data-template-browser]')) {
  const input = browser.querySelector('[data-template-search]');
  const cards = [...browser.querySelectorAll('[data-template]')];
  const count = browser.querySelector('[data-template-count]');
  const empty = browser.querySelector('[data-template-empty]');
  const query = new URLSearchParams(location.search);
  let group = ['client','team'].includes(query.get('group')) ? query.get('group') : 'all';
  input.value = query.get('q') || '';
  function filter(updateUrl=true) {
    const text = normalize(input.value.trim());
    let found = 0;
    for(const card of cards) {
      const visible = (group==='all'||card.dataset.category===group) && normalize(card.dataset.search).includes(text);
      card.hidden = !visible;
      if(visible) found++;
    }
    browser.querySelectorAll('[data-template-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.templateFilter===group)));
    const form = new Intl.PluralRules('ru-RU').select(found);
    count.textContent = `Найдено ${found} ${form==='one'?'шаблон':form==='few'?'шаблона':'шаблонов'}`;
    empty.hidden = found>0;
    if(updateUrl) {
      const url = new URL(location.href);
      input.value.trim()?url.searchParams.set('q',input.value.trim()):url.searchParams.delete('q');
      group==='all'?url.searchParams.delete('group'):url.searchParams.set('group',group);
      history.replaceState(null,'',url);
    }
  }
  input.addEventListener('input',()=>filter());
  browser.querySelectorAll('[data-template-filter]').forEach(button=>button.addEventListener('click',()=>{group=button.dataset.templateFilter;filter();}));
  browser.querySelector('[data-template-reset]').addEventListener('click',()=>{input.value='';group='all';filter();input.focus();});
  filter(false);
}

let modalTrigger = null;
function showOrder(id='1048',state={}) {
  const orderMap={1048:['Анна Смирнова',2,2400,'Новый'],1047:['Иван Крылов',1,1200,'Собирается'],1046:['Ольга Орлова',3,3600,'Новый'],1045:['Марк Белов',1,1200,'Отгружен']};
  const order=orderMap[id]||orderMap[1048];
  let dialog=document.getElementById('demo-order-dialog');
  if(!dialog) {
    dialog=document.createElement('dialog');dialog.id='demo-order-dialog';dialog.setAttribute('aria-labelledby','demo-dialog-title');document.body.append(dialog);
    dialog.addEventListener('click',e=>{if(e.target.closest('[data-close-dialog]'))dialog.close();});
    dialog.addEventListener('close',()=>modalTrigger?.focus());
  }
  dialog.innerHTML=`<div class="dialog-header"><h2 id="demo-dialog-title">Заказ №${esc(id)}</h2><button data-close-dialog aria-label="Закрыть заказ">${icon('close')}</button></div><div class="demo-line"><strong>${order[0]}</strong><span class="badge">${id==='1048'&&state.confirmed?'Собирается':order[3]}</span></div><div class="demo-product"><img src="${assetRoot}notebook.svg" width="55" height="65" alt="Ежедневник А5"><div><strong>Ежедневник А5</strong><p>${order[1]} шт. × 1 200 ₽</p></div><strong class="numeric">${new Intl.NumberFormat('ru-RU').format(order[2])} ₽</strong></div><p>Получение: самовывоз.</p><p class="demo-dialog-note">Это учебный заказ из демо. В рабочем приложении здесь будут данные вашей команды.</p>`;
  dialog.showModal();
}
for(const root of document.querySelectorAll('[data-demo-root][data-interactive=true]')) {
  let state={kind:root.dataset.demoKind,role:'staff',confirmed:false,received:0,time:null};
  const body=root.querySelector('.demo-body');
  const live=root.querySelector('.demo-live');
  function render(message) {
    root.dataset.demoKind=state.kind;
    body.querySelectorAll('.table-scroll').forEach(table=>tableScrollObservers.get(table)?.disconnect());
    body.innerHTML=demoPanel(state.kind,state.role,assetRoot,state);
    enhanceTables(body);
    root.querySelectorAll('[data-demo-kind-value]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.demoKindValue===state.kind)));
    root.querySelectorAll('.demo-controls [data-demo-role]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.demoRole===state.role)));
    root.querySelector('.demo-context').textContent=({orders:'Заказы',booking:'Запись клиентов',stock:'Остатки'})[state.kind]||'Рабочий экран';
    if(message) live.textContent=message;
  }
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.demoKindValue) {state.kind=button.dataset.demoKindValue;render('Открыт другой рабочий пример.');}
    else if(button.dataset.demoRole) {state.role=button.dataset.demoRole;render(state.role==='client'?'Показано, что доступно клиенту.':'Показан рабочий экран команды.');}
    else if(button.hasAttribute('data-demo-reset')) {state={kind:'orders',role:'staff',confirmed:false,received:0,time:null};render('Демо возвращено к исходному состоянию.');root.querySelector('[data-demo-kind-value=orders]').focus();}
    else if(button.dataset.demoAction==='confirm') {state.confirmed=true;render('В демо заказ подтверждён и перешёл в статус «Собирается».');root.querySelector('[data-demo-reset]').focus();}
    else if(button.dataset.demoAction==='receive') {state.received+=5;render(`В демо принято 5 ежедневников. Остаток: ${24+state.received} шт.`);root.querySelector('[data-demo-action=receive]').focus();}
    else if(button.dataset.demoTime) {state.time=button.dataset.demoTime;render(`Выбрано время ${state.time}. Это учебный пример записи.`);root.querySelector(`[data-demo-time="${state.time}"]`).focus();}
    else if(button.hasAttribute('data-open-order')) {modalTrigger=button;showOrder(button.dataset.openOrder||'1048',state);}
  });
}

if(window.gsap && window.ScrollTrigger && new URLSearchParams(location.search).get('motion')!=='off') {
  const { gsap, ScrollTrigger }=window;gsap.registerPlugin(ScrollTrigger);
  const media=gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)',()=>{
    for(const section of document.querySelectorAll('[data-reveal]')) {
      gsap.from(section,{opacity:0,y:12,filter:'blur(4px)',duration:.3,ease:'power2.out',scrollTrigger:{trigger:section,start:'top 94%',once:true}});
    }
    const heading=document.querySelector('main h1');
    if(heading&&!document.querySelector('[data-premium]')) gsap.from(heading,{opacity:0,y:12,filter:'blur(4px)',duration:.3,ease:'power2.out'});
  });
  media.add('(min-width:1000px) and (min-height:700px) and (prefers-reduced-motion:no-preference)',()=>{
    const resets=[];
    for(const story of document.querySelectorAll('.scroll-story')) {
      const visual=story.querySelector('.story-visual');
      const stage=story.querySelector('.story-stage');
      const beats=[...story.querySelectorAll('.story-beat')];
      const scenes=[...story.querySelectorAll('[data-story-scene]')];
      if(!visual||!stage||beats.length<2||!scenes.length)continue;
      story.classList.add('is-story-enhanced');
      function activate(index) {
        story.dataset.activeBeat=String(index);
        beats.forEach((beat,i)=>beat.classList.toggle('is-active',i===index));
        scenes.forEach((scene,i)=>scene.inert=i!==index);
        const status=story.querySelector('[data-story-status]');
        if(status)status.textContent=beats[index].dataset.storyLabel||['Новый заказ','В работе','Готов к выдаче'][index];
      }
      activate(0);
      beats.forEach((beat,index)=>ScrollTrigger.create({trigger:beat,start:'top 65%',end:'bottom 65%',onEnter:()=>activate(index),onEnterBack:()=>activate(index)}));
      gsap.fromTo(visual,{scale:1,xPercent:0},{scale:1.18,xPercent:variant==='world'?-3:0,ease:'none',scrollTrigger:{trigger:story,start:'top 55%',end:'bottom 45%',scrub:true}});
      resets.push(()=>{story.classList.remove('is-story-enhanced');delete story.dataset.activeBeat;beats.forEach(b=>b.classList.remove('is-active'));scenes.forEach(s=>s.inert=false);});
    }
    ScrollTrigger.refresh();
    return()=>resets.forEach(fn=>fn());
  });
}



initPremium();
