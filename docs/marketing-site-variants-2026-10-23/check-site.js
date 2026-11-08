async (page) => {
  const width=Number(new URL(page.url()).searchParams.get('auditWidth')||1440);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:3103/full/');
  const routes=await page.evaluate(()=>fetch('/full/routes.json').then(r=>r.json()));
  const errors=[],reports=[];
  page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));
  for(const route of routes) {
    const response=await page.goto(route.url,{waitUntil:'domcontentloaded'});
    await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);
    const result=await page.evaluate(()=>{
      const color=value=>{const m=value.match(/[\d.]+/g);return m&&m.length>=3?m.slice(0,3).map(Number):null};
      const luminance=rgb=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
      const pairs=new Map(),small=[];
      const background=element=>{for(let e=element;e;e=e.parentElement){const s=getComputedStyle(e),v=s.backgroundColor;if(v!=='rgba(0, 0, 0, 0)'&&v!=='transparent'){const m=v.match(/[\d.]+/g);if(m&&m.length<4||m&&Number(m[3])===1)return color(v);}}return[252,250,247]};
      for(const element of document.querySelectorAll('body *')) {
        if(!element.textContent.trim()||element.children.length||!element.checkVisibility())continue;
        const style=getComputedStyle(element),size=parseFloat(style.fontSize),weight=Number(style.fontWeight),foreground=color(style.color),bg=background(element);
        if(size<13)small.push({text:element.textContent.trim().slice(0,65),size,selector:element.tagName+'.'+element.className});
        if(!foreground||!bg)continue;
        const ratio=(Math.max(luminance(foreground),luminance(bg))+.05)/(Math.min(luminance(foreground),luminance(bg))+.05);
        const required=size>=24||(size>=18.67&&weight>=700)?3:4.5;
        if(ratio<required){const key=style.color+' / '+bg.join(',');if(!pairs.has(key))pairs.set(key,{foreground:style.color,background:bg,ratio:Number(ratio.toFixed(2)),required,examples:[]});const entry=pairs.get(key);if(entry.examples.length<3)entry.examples.push({text:element.textContent.trim().slice(0,70),selector:element.tagName+'.'+element.className,size});}
      }
      return{title:document.title,h1:document.querySelectorAll('main h1').length,main:document.querySelectorAll('main').length,header:!!document.querySelector('header'),footer:!!document.querySelector('footer'),height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,small:small.slice(0,12),contrast:[...pairs.values()],brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),links:[...document.querySelectorAll('a[href]')].map(a=>a.href)};
    });
    reports.push({variant:route.variant,path:route.path,type:route.type,width,status:response.status(),...result});
  }
  return{width,pages:reports.length,errors,reports};
}
