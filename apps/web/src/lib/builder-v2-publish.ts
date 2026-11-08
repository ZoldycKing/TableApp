import {builderV2EnterAction} from './builder-v2-enter-action'
import {appV2ChildIds,type AppV2} from '@tableapp/schema/app-v2'
import {builderV2ButtonAction,builderV2NodeAction} from './builder-v2-button-action'
import {builderV2DeleteAction} from './builder-v2-delete-action'
import {builderV2SaveFormAction} from './builder-v2-form-action'
import {builderV2WorkingPath,builderV2ButtonContext,builderV2ActionContext} from './builder-v2-working-scope'
import {builderV2FormInputs} from './builder-v2-form-types'
export function builderV2PublicationError(app:AppV2):string|null {
  if(!app.screens.some(screen=>!screen.contextTableId))return 'Добавьте обычный стартовый экран со списком или формой'
  for(const screen of app.screens){
    if(screen.events.enter&&!builderV2EnterAction(app,screen.id))return `Экран «${screen.name}»: проверьте действие при открытии`
    const visit=(ids:readonly string[],repeated=false):string|null=>{for(const id of ids){const node=app.nodes.find(node=>node.id===id);if(!node)continue
      if(repeated&&node.type==='collection')return `Список «${node.name}»: разместите вложенный список на отдельном экране карточки.`
      if(node.type==='button'&&node.events.press){
        const scope=builderV2ButtonContext(app,screen.id,id),chain=builderV2ButtonAction(app,node),deletion=builderV2DeleteAction(app,node)
        if(!scope||!chain&&!(builderV2WorkingPath(app,screen.id,id)&&screen.contextTableId&&deletion?.step.tableId===screen.contextTableId))return `Кнопка «${node.name}»: проверьте действие. Цепочки доступны на экране, в карточке и в строке списка; удаление требует отдельной кнопки карточки.`
      }
      if(node.type==='form'){if(!node.events.submit||!builderV2SaveFormAction(app,node)||!builderV2WorkingPath(app,screen.id,id))return `Форма «${node.name}»: настройте сохранение на экране или в карточке`;if(builderV2FormInputs(app,node).some(input=>input.visibleTo||input.visibleWhen))return `Форма «${node.name}»: уберите условное скрытие полей перед публикацией`}
      if(node.type==='collection'||node.type==='metric'){const source=app.sources.find(source=>source.id===node.sourceId);if(source&&!app.policy.tables.some(rule=>rule.tableId===source.tableId&&rule.grants.some(grant=>grant.read)))return `Элемент «${node.name}»: разрешите чтение таблицы в разделе «Доступ»`}
      if(node.type==='collection'&&node.events.itemPress&&(!builderV2NodeAction(app,node)||!builderV2ActionContext(app,screen.id,node.id)))return `Список «${node.name}»: настройте открытие карточки или цепочку действий для строки`
      const error=visit(appV2ChildIds(node),repeated||node.type==='collection');if(error)return error
    }return null}
    const error=visit(screen.rootIds);if(error)return error
  }
  return null
}
