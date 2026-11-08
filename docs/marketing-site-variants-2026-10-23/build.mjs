import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { content } from './content.mjs';
import { ui, esc } from './ui.mjs';
import * as tasks from './variants/tasks.mjs';
import * as product from './variants/product.mjs';
import * as world from './variants/world.mjs';
import {buildPicker} from './picker.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const sourceDir=dirname(fileURLToPath(import.meta.url));
const projectRoot=resolve(sourceDir,'../..');
const outputDir=join(projectRoot,'docs/audit/marketing-directions-2026-10-23/full');
const readJson=name=>JSON.parse(readFileSync(join(sourceDir,name),'utf8').replace(/^\uFEFF/,''));
const data={...readJson('source-data.json'),legal:readJson('legal-source.json')};
const variants={tasks,product,world};
const version=createHash('sha256').update(['base.css','client.mjs','ui.mjs','content.mjs','micro-stories.mjs','micro-stories.css','micro-motion.mjs','premium-scenes.mjs','premium-scenes.css','premium-motion.mjs',...Object.keys(variants).flatMap(v=>['variants/'+v+'.css','variants/'+v+'.mjs'])].map(p=>readFileSync(join(sourceDir,p),'utf8')).join('\n')).digest('hex').slice(0,12);
export const pages=[
  {type:'home',path:'/',title:'Заказы, клиенты и склад'},
  {type:'features',path:'/features',title:'Возможности'},
  {type:'how',path:'/how-it-works',title:'Как начать работу'},
  {type:'solutions',path:'/solutions',title:'Решения для вашей работы'},
  {type:'templates',path:'/templates',title:'Готовые шаблоны'},
  {type:'pricing',path:'/pricing',title:'Тарифы'},
  {type:'demo',path:'/demo',title:'Попробуйте TableApp в демо'},
  ...data.solutions.map(item=>({type:'solution',path:'/solutions/'+item.slug,title:item.name,item})),
  ...data.templates.map(item=>({type:'template',path:'/templates/'+item.id,title:item.name,item})),
  ...[['privacy','Обработка персональных данных'],['terms','Условия использования'],['offer','Публичная оферта']].map(([slug,title])=>({type:'legal',path:'/legal/'+slug,title}))
];
mkdirSync(outputDir,{recursive:true});mkdirSync(join(outputDir,'assets'),{recursive:true});
cpSync(join(sourceDir,'assets'),join(outputDir,'assets'),{recursive:true});
for(const [from,to] of [['base.css','base.css'],['client.mjs','client.mjs'],['ui.mjs','ui.mjs'],['content.mjs','content.mjs'],['micro-motion.mjs','micro-motion.mjs'],['micro-stories.css','micro-stories.css'],['premium-scenes.css','premium-scenes.css'],['premium-motion.mjs','premium-motion.mjs']]) cpSync(join(sourceDir,from),join(outputDir,to));
for(const [name,mod] of Object.entries(variants)) {
  const root=`/full/${name}`;
  const h=path=>root+(path==='/'?'/':path.replace(/\/$/,'')+'/');
  for(const page of pages) {
    const ctx={variant:name,page,data,content,h,esc,ui,asset:name=>'/full/assets/'+name,start:id=>'http://127.0.0.1:3101/login'+(id?'?next='+encodeURIComponent('/templates?take='+id):'')};
    const main=mod.renderPage(ctx),header=mod.renderHeader(ctx),footer=mod.renderFooter(ctx);
    if((main.match(/<h1\b/g)||[]).length!==1) throw Error(`${name}${page.path}: expected exactly one h1`);
    if(/undefined|\[object Object\]|NaN/.test(main+header+footer))throw Error(`${name}${page.path}: unfinished content`);
    if(!header.includes('<header')||!footer.includes('<footer'))throw Error(`${name}${page.path}: missing shell`);
    const description=page.type==='template'?content.templates[page.item.id].description:page.type==='solution'?content.solutions[page.item.slug].description:content.hero.description;
    const html=`<!doctype html><html lang="ru" data-variant="${name}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${esc(page.title)} · TableApp</title><meta name="description" content="${esc(description)}"><link rel="icon" href="/full/assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/full/base.css"><link rel="stylesheet" href="/full/${name}.css">${page.type==='home'&&name!=='product'?'<link rel="stylesheet" href="/full/premium-scenes.css">':''}<script defer src="/full/assets/gsap.min.js"></script><script defer src="/full/assets/ScrollTrigger.min.js"></script><script type="module" src="/full/client.mjs"></script><noscript><style>.site-menu{display:flex!important;flex-wrap:wrap!important}.menu-toggle{display:none!important}</style></noscript></head><body><a class="skip-link" href="#main">Перейти к содержимому</a>${header}<main id="main">${main}</main>${footer}</body></html>`;
    const dir=join(outputDir,name,page.path==='/'?'':page.path.slice(1));mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'index.html'),html);
  }
  cpSync(join(sourceDir,'variants',name+'.css'),join(outputDir,name+'.css'));
}
if(existsSync(join(sourceDir,'lab.mjs'))) {
  const {buildLab}=await import('./lab.mjs');
  await buildLab({outputDir,data,content,ui,esc});
}
const routes=Object.keys(variants).flatMap(variant=>pages.map(page=>({variant,type:page.type,path:page.path,url:`http://127.0.0.1:3103/full/${variant}${page.path==='/'?'/':page.path+'/'}`})));
buildPicker(outputDir,pages);
writeFileSync(join(outputDir,'routes.json'),JSON.stringify(routes,null,2));
writeFileSync(join(outputDir,'sitemap.html'),`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Все страницы вариантов</title><link rel="stylesheet" href="/full/base.css"></head><body><main class="container section"><h1>Все страницы вариантов</h1>${Object.keys(variants).map(v=>`<section class="section"><h2>${v}</h2><ul>${routes.filter(r=>r.variant===v).map(r=>`<li><a class="text-link" href="${r.url}">${r.path}</a></li>`).join('')}</ul></section>`).join('')}</main></body></html>`);
writeFileSync(join(outputDir,'index.html'),`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Три полных сайта TableApp</title><link rel="stylesheet" href="/full/base.css"><style>body{background:#171918;color:#f7f7f2}.hub{padding:54px 32px;max-width:1360px;margin:auto}.hub h1{font:500 clamp(26px,4vw,42px)/1.3 Unbounded,Inter,sans-serif}.hub>p{color:#c4c7c1;margin:18px 0 36px;max-width:70ch}.hub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.hub-card{background:#252925;border:1px solid #525b50;border-radius:14px;padding:24px;min-width:0}.hub-card h2{font-size:24px;margin:0 0 16px}.hub-card>p{color:#c4c7c1;min-height:80px;margin-bottom:24px}.hub-links{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:20px}.hub-links a{font-size:14px;min-height:32px;display:inline-flex;align-items:center;text-decoration:underline;text-underline-offset:4px;color:#dcebd4}.hub-card .button{background:#eef3e9;color:#25221d;border-color:#eef3e9}.hub-foot{border-top:1px solid #525b50;margin-top:36px;padding-top:24px;display:flex;flex-wrap:wrap;gap:20px}.hub-foot a{text-decoration:underline;text-underline-offset:4px}a:focus-visible{outline-color:#dcebd4}@media(max-width:850px){.hub-grid{grid-template-columns:1fr}.hub-card>p{min-height:0}.hub{padding:32px 20px}}</style></head><body><main class="hub"><h1>Три полных сайта TableApp</h1><p>В каждом варианте — 25 страниц: от главной и готовых шаблонов до тарифов и правовых документов. Все ссылки внутри версии работают; в кабинет можно перейти через «Войти».</p><div class="hub-grid">${[['tasks','Сразу к своей задаче','Сначала знакомая задача, затем подходящий шаблон и рабочий результат.'],['product','Сначала показать','Крупные рабочие экраны объясняют сервис через понятные действия.'],['world','Путь одного заказа','Иллюстрации и анимация связывают клиента, команду и склад.']].map(([id,title,text],i)=>`<article class="hub-card"><p>0${i+1}</p><h2>${title}</h2><p>${text}</p><a class="button" href="/full/${id}/">Открыть весь сайт ${ui.icon('arrow')}</a><div class="hub-links">${[['features','Возможности'],['solutions','Решения'],['templates','Шаблоны'],['pricing','Тарифы'],['demo','Демо']].map(([p,l])=>`<a href="/full/${id}/${p}/">${l}</a>`).join('')}</div></article>`).join('')}</div><nav class="hub-foot" aria-label="Материалы сравнения"><a href="/full/compare.html">Сравнение главных</a><a href="/full/sitemap.html">Все 75 страниц</a><a href="/full/lab/">Состояния и проверка компонентов</a><a href="/full/assets/notebook-drawing.html">Векторная иллюстрация</a></nav></main></body></html>`);
const hub=join(outputDir,'index.html');
writeFileSync(hub,readFileSync(hub,'utf8').replace('<title>','<link rel="icon" href="/full/assets/mark.svg"><title>').replace('<a href="/full/compare.html">','<a href="/full/variants.html">Переключать полные сайты</a><a href="/full/compare.html">'));
// The preview stays open between iterations: changed code must not reuse cached modules.
for(const file of ['client.mjs','ui.mjs']) {
  const p=join(outputDir,file);
  writeFileSync(p,readFileSync(p,'utf8').replace(/from '(\.\/(?:ui|content|micro-motion|premium-motion)\.mjs)'/g,(_,ref)=>`from '${ref}?v=${version}'`));
}
function stampHtml(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    const p=join(dir,entry.name);
    if(entry.isDirectory()&&entry.name!=='assets')stampHtml(p);
    else if(entry.isFile()&&entry.name.endsWith('.html'))writeFileSync(p,readFileSync(p,'utf8').replace(/\/full\/((?:base|tasks|product|world|micro-stories|premium-scenes)\.css|client\.mjs)(?=["'])/g,(_,ref)=>`/full/${ref}?v=${version}`));
  }
}
stampHtml(outputDir);
const explorer=join(process.env.USERPROFILE||process.env.HOME||'','.codex/skills/oil-ui/scripts/build_explorer.py');
if(existsSync(explorer)) {
  execFileSync('python',[explorer,join(sourceDir,'explorer-manifest.json'),'--output',join(outputDir,'compare.html'),'--force']);
  execFileSync('python',[join(sourceDir,'tools/localize-explorer.py')]);
}
console.log(JSON.stringify({variants:3,pagesPerVariant:pages.length,total:routes.length,output:outputDir}));
