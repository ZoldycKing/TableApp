// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BuilderV2Gallery,BuilderV2Files} from './media'
import {builderV2FileSize,builderV2MediaItems} from './media-values'
import {BuilderV2Inspector} from './inspector'
import {BuilderV2MediaSettings} from './media-settings'
import {appV2Fixture,fixtureTables} from './fixture.test-utils'
import {addNode,duplicateNode,nodeContext,createCollectionCard} from './model'
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
vi.mock('@/app/builder-v2-workflow-actions',()=>({readBuilderV2WorkflowRunsAction:vi.fn()}))
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
const photos=[{key:'workspace/photo-1.jpg',name:'Стеллаж.jpg',mime:'image/jpeg',size:8192},{key:'workspace/photo-2.png',name:'Полка.png',mime:'image/png',size:2048}]
it('rejects unsafe links and storage traversal, scopes stored files, deduplicates and keeps document metadata',()=>{
 const items=builderV2MediaItems([...photos,{key:'../secret',name:'bad',mime:'image/png'},'javascript:alert(1)','data:text/html,hello','//evil.test/x',{key:'workspace/contract.pdf',name:'Договор.pdf',mime:'application/pdf',size:1536},photos[0]],'my-work')
 expect(items).toHaveLength(3);expect(items[0]!.url).toBe('/api/files/workspace/photo-1.jpg?v2App=my-work');expect(items[2]).toMatchObject({name:'Договор.pdf',image:false,size:1536})
 expect(builderV2FileSize(1536)).toBe('1,5 КБ');expect(builderV2MediaItems('/api/files/x?a=1','work')[0]!.url).toBe('/api/files/x?a=1&v2App=work');expect(builderV2MediaItems('[bad')).toEqual([])
 expect(builderV2MediaItems(Array.from({length:120},(_,i)=>`/photo-${i}.png`))).toHaveLength(100)
})
it('opens photos, advances with keyboard and returns focus when the viewer closes',()=>{
 render(<BuilderV2Gallery value={photos} caption="Фотографии заказа" slug="work"/>);const trigger=screen.getByRole('button',{name:'Открыть фото 1: Стеллаж.jpg'});trigger.focus();fireEvent.click(trigger)
 const dialog=screen.getByRole('dialog',{name:'Фотографии заказа'});expect(dialog.querySelector('img')?.getAttribute('src')).toContain('photo-1.jpg?v2App=work')
 fireEvent.keyDown(dialog.querySelector('[class*="galleryViewer"]')!,{key:'ArrowRight'});expect(dialog.querySelector('img')?.getAttribute('src')).toContain('photo-2.png');expect(screen.getByText('2 из 2')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Закрыть окно'}));expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(trigger)
})
it('loads thumbnails lazily, displays a failed image honestly and reveals the remaining photos',()=>{
 render(<BuilderV2Gallery value={Array.from({length:14},(_,i)=>`/photo-${i}.jpg`)} caption=""/>);expect(screen.getAllByRole('button',{name:/Открыть фото/})).toHaveLength(12)
 const first=screen.getByRole('button',{name:/Открыть фото 1:/}).querySelector('img')!;expect(first.getAttribute('loading')).toBe('lazy');fireEvent.error(first);expect(screen.getByText('Фото недоступно')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Показать ещё фото (2)'}));expect(screen.getAllByRole('button',{name:/Открыть фото/})).toHaveLength(14)
})
it('renders a safe file list and distinct empty states without author instructions for end users',()=>{
 const view=render(<BuilderV2Files value={[{...photos[0],name:'<script>.jpg'},'https://example.test/contract.pdf','javascript:bad']} caption="Документы" slug="work"/>);expect(screen.getAllByRole('link')).toHaveLength(2);expect(screen.getByRole('link',{name:/<script>/}).getAttribute('rel')).toBe('noopener noreferrer');expect(screen.getByRole('link',{name:/<script>/}).getAttribute('download')).toBe('<script>.jpg')
 expect(view.container.querySelector('script')).toBeNull();view.rerender(<BuilderV2Gallery value={[]} caption=""/>);expect(screen.getByText('Фотографий пока нет.')).toBeTruthy();expect(screen.queryByText(/Выберите поле/)).toBeNull()
 view.rerender(<BuilderV2Files value={[]} caption="" editing/>);expect(screen.getByText(/Выберите поле с файлами/)).toBeTruthy()
})
it('provides only useful record fields, uses a context attachment by default and duplicates bindings without grants',()=>{
 const app=appV2Fixture(),tables=fixtureTables.map(table=>table.id==='requests'?{...table,fields:[...table.fields,{id:'photos',name:'Фото',type:'image' as const},{id:'docs',name:'Документы',type:'attachment' as const}]}:table),gallery=addNode(app,'detail','gallery',tables,null,''),node=gallery.app.nodes.find(node=>node.id===gallery.id)!
 expect(node.type).toBe('gallery');if(node.type!=='gallery')throw new Error('No gallery');expect(node.value).toEqual({kind:'row',fieldId:'photos'});expect(nodeContext(gallery.app,'detail',node.id).rowTableId).toBe('requests')
 const duplicated=duplicateNode(gallery.app,'detail',node.id);expect(duplicated.app.policy).toEqual(app.policy)
 const change=vi.fn();render(<BuilderV2MediaSettings node={node} table={tables.find(table=>table.id==='requests')} onChange={change}/>);expect(screen.getByRole('option',{name:'Фото'})).toBeTruthy();expect(screen.queryByRole('option',{name:'r_amount'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Источник фотографий'),{target:{value:'literal'}});expect(change.mock.calls.at(-1)![0].value).toEqual({kind:'literal',value:''})
})

it('builds usable photo and file components in a newly created record card',()=>{
 const app=appV2Fixture(),tables=fixtureTables.map(table=>table.id==='requests'?{...table,fields:[table.fields[0]!,{id:'photo',name:'Фото',type:'image' as const},{id:'doc',name:'Документы',type:'attachment' as const}]}:table),result=createCollectionCard(app,'request_list',tables),page=result.app.screens.find(screen=>screen.id===result.screenId)!
 expect(page.rootIds.map(id=>result.app.nodes.find(node=>node.id===id)?.type)).toEqual(['heading','gallery','files']);expect(result.app.policy).toEqual(app.policy)
})

it('shows one clear source control in the inspector instead of duplicating the generic value editor',()=>{
 const app=appV2Fixture(),added=addNode(app,'detail','gallery',fixtureTables,null,''),node=added.app.nodes.find(node=>node.id===added.id)!,noop=vi.fn()
 render(<BuilderV2Inspector app={added.app} screenId="detail" selected={node} tables={fixtureTables} onNode={noop} onScreen={noop} onHome={noop} onMove={noop} onDuplicate={noop} onDelete={noop} onPlace={noop} onSource={noop} onSourceSettings={noop} onMoveScreen={noop} onDeleteScreen={noop}/>)
 expect(screen.getByLabelText('Источник фотографий')).toBeTruthy();expect(screen.queryByLabelText('Источник значения')).toBeNull();expect(screen.getAllByLabelText('Ссылки')).toHaveLength(1)
})
