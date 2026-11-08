import {appV2NavigationUrl} from '@tableapp/schema/app-v2'

export type BuilderV2MediaItem={url:string;name:string;image:boolean;size?:number}
const inlineImages=new Set(['image/jpeg','image/png','image/webp','image/gif'])
export function builderV2MediaItems(value:unknown,slug?:string):BuilderV2MediaItem[]{
  if(typeof value==='string'){
    const text=value.trim()
    if(text.startsWith('[')){try{value=JSON.parse(text)}catch{return []}}
    else value=text.split(/\r?\n/).filter(Boolean)
  }
  if(!Array.isArray(value))return []
  const result:BuilderV2MediaItem[]=[],seen=new Set<string>()
  for(const raw of value.slice(0,100)){
    const object=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null
    let url:string|null=null,image=true
    if(object&&typeof object.key==='string'){
      const parts=object.key.split('/')
      if(parts.some(part=>!part||part==='.'||part==='..')||/[\\\u0000-\u001f\u007f]/.test(object.key))continue
      url='/api/files/'+parts.map(encodeURIComponent).join('/')+(slug?'?v2App='+encodeURIComponent(slug):'')
      image=typeof object.mime==='string'&&inlineImages.has(object.mime.toLowerCase())
    }else{
      url=appV2NavigationUrl(typeof raw==='string'?raw:typeof object?.url==='string'?object.url:'')
      if(!url)continue
      if(slug&&url.startsWith('/api/files/')){const parsed=new URL(url,'https://tableapp.invalid');parsed.searchParams.set('v2App',slug);url=parsed.pathname+parsed.search}
      const mime=typeof object?.mime==='string'?object.mime.toLowerCase():null
      image=mime?inlineImages.has(mime):!(/\.(pdf|docx?|xlsx?|zip|txt|csv)(?:[?#]|$)/i.test(url))
    }
    if(!url||seen.has(url))continue
    seen.add(url)
    let name=typeof object?.name==='string'?object.name.trim().slice(0,255):''
    if(!name){try{name=decodeURIComponent(new URL(url,'https://tableapp.invalid').pathname.split('/').at(-1)??'')}catch{}}
    result.push({url,name:name||'Файл',image,...(typeof object?.size==='number'&&Number.isFinite(object.size)&&object.size>=0?{size:object.size}:{})})
  }
  return result
}
export function builderV2FileSize(size?:number){return size===undefined?'':size<1024?`${size} Б`:size<1024*1024?`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(size/1024)} КБ`:`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(size/1024/1024)} МБ`}
