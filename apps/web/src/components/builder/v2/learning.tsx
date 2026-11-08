'use client'
import Link from 'next/link'
import { BUILDER_LEARNING_STEPS, builderLearningStep, type BuilderLearningProgress, type BuilderLearningStep } from '@/lib/builder-learning-types'
import { PrototypeDialog } from '../prototype/dialog'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

const lessons={
  list:{title:'Что показать на экране?',description:'Выберите, какие данные из таблицы увидят в приложении.',action:'Выбрать поля для экрана',help:'Что показывать на экране',name:'Настроить экран с данными'},
  record:{title:'Посмотрите карточку в приложении',description:'Откроем пример на ваших данных в предпросмотре.',action:'Показать карточку',help:'Что видно в карточке',name:'Посмотреть карточку'},
  save:{title:'Сохраните первую запись',description:'Заполните форму, чтобы увидеть, как данные сохраняются в таблицу.',action:'Открыть форму',help:'Как сохранить запись',name:'Сохранить запись'},
  access:{title:'Проверьте, кто сможет войти',description:'Выберите, кому открыть приложение и какие данные ему показать.',action:'Настроить доступ',help:'Как настроить доступ',name:'Проверить доступ'},
  publish:{title:'Получите ссылку на приложение',description:'Проверьте настройки перед публикацией.',action:'Открыть публикацию',help:'Как опубликовать приложение',name:'Опубликовать приложение'},
} as const
type LearningScreen = { screenName: string; tableName: string }

export function BuilderLearningBar({progress,loading,busy,error,onAction,onPause,onSkip,onHelp,onRetry,saveAction,saveDescription,listScreen}:{progress:BuilderLearningProgress|null;loading:boolean;busy:boolean;error:string;onAction:()=>void;onPause:()=>void;onSkip:()=>void;onHelp:(step:BuilderLearningStep)=>void;onRetry:()=>void;saveAction?:string;saveDescription?:string;listScreen?:LearningScreen}){
  if(loading)return <div className={ui.learningBar} role="status">Подготавливаем первые шаги…</div>
  if(!progress||progress.paused)return error?<div className={styles.errorBanner} role="alert"><span>{error}</span><button type="button" className={styles.textButton} disabled={busy} onClick={onRetry}>Повторить</button></div>:null
  const step=builderLearningStep(progress),missingTarget=(step==='list'||step==='record')&&!progress.target,complete=BUILDER_LEARNING_STEPS.every(step=>progress[step]==='done')
  const stepTitle = missingTarget ? 'Выберите раздел для примера' : step === 'list' && listScreen ? `Что показать в разделе «${listScreen.screenName}»?` : step === 'record' && listScreen ? `Как выглядит карточка в разделе «${listScreen.screenName}»?` : step ? lessons[step].title : 'Первое знакомство завершено'
  const description = missingTarget ? 'Откройте раздел, который связан с таблицей.' : step ? step === 'save' && saveDescription ? saveDescription : lessons[step].description : complete ? 'Приложение опубликовано.' : 'К пропущенным шагам можно вернуться через «Первые шаги».'
  return <section className={ui.learningBar} aria-label="Первые шаги" aria-busy={busy}>
    <span className={ui.learningIcon}><ProtoIcon name="book" size={21} /></span>
    <div className={ui.learningCopy} aria-live="polite">
      {step && <span className={ui.learningProgress}>Подсказка · {BUILDER_LEARNING_STEPS.indexOf(step) + 1} из {BUILDER_LEARNING_STEPS.length}</span>}
      <strong>{stepTitle}</strong><p>{description}</p>
      <div className={ui.learningActions}>
        <button type="button" disabled={busy} className={styles.primary} onClick={step?onAction:onPause}>{missingTarget?'Выбрать раздел':step?step==='save'&&saveAction?saveAction:lessons[step].action:'Продолжить работу'}</button>
        {step && <div className={ui.learningLinks}>
          {step !== 'record' && <button type="button" disabled={busy} aria-label="Помощь с этим шагом" onClick={()=>onHelp(step)}>Подробнее</button>}
          <button type="button" disabled={busy} onClick={onSkip}>Пропустить шаг</button>
        </div>}
      </div>
      {error && <p className={ui.learningError} role="alert">{error}{step !== 'record' && <button type="button" className={styles.textButton} disabled={busy} onClick={onRetry}>Повторить</button>}</p>}
    </div>
    <button type="button" disabled={busy} className={styles.iconButton} aria-label="Закрыть обучение" title="Можно продолжить позже" onClick={onPause}><ProtoIcon name="close"/></button>
  </section>
}
export function BuilderLearningDialog({mode,progress,busy,error,onClose,onContinue,onRetryStep,listScreen,onOpenFields}:{mode:'overview'|BuilderLearningStep;progress:BuilderLearningProgress|null;busy:boolean;error:string;onClose:()=>void;onContinue:()=>void;onRetryStep:(step:BuilderLearningStep)=>void;listScreen?:LearningScreen;onOpenFields?:()=>void}){
 if(mode==='list')return <PrototypeDialog title={listScreen ? `Экран «${listScreen.screenName}»` : lessons.list.help} onClose={onClose}><div className={ui.learningHelp}>
  <p>{listScreen ? `Экран «${listScreen.screenName}» показывает данные из таблицы «${listScreen.tableName}». Выберите, какие из них будут видны в приложении.` : 'Выберите, что из вашей таблицы будет видно на экране приложения.'}</p>
  <ul>
   <li><strong>Главное поле</strong> — что увидят первым. Например, название товара.</li>
   <li><strong>Дополнительное поле</strong> — что показать под ним. Например, цену.</li>
   <li><strong>Внешний вид</strong> — как расположить записи списком, карточками или таблицей.</li>
  </ul>
  <p>Измените любую настройку. Вы сразу увидите результат в предпросмотре, а черновик сохранится автоматически.</p>
  <button type="button" className={styles.primary} disabled={busy} onClick={onOpenFields ?? onClose}>{onOpenFields ? lessons.list.action : 'Закрыть подсказку'}</button>
 </div></PrototypeDialog>
 return <PrototypeDialog title={mode==='overview'?'Первые шаги':lessons[mode].help} onClose={onClose}><div className={ui.learningHelp}>
  {mode==='overview'?<><p>Пять коротких шагов на ваших данных. Можно пропустить любой и продолжить позже.</p><ol className={ui.learningSteps}>{BUILDER_LEARNING_STEPS.map(id=><li key={id}><div><strong>{lessons[id].name}</strong><span>{progress?.[id]==='done'?'Выполнено':progress?.[id]==='skipped'?'Пропущено':'Ещё не выполнено'}</span></div>{progress?.[id]==='skipped'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>onRetryStep(id)}>Вернуться</button>}</li>)}</ol><button type="button" className={styles.primary} disabled={busy} onClick={onContinue}>{!progress?'Начать':builderLearningStep(progress)?'Продолжить обучение':'Продолжить работу'}</button></>:<>
   {mode==='record'?<><p>Откройте список в режиме просмотра и нажмите на строку. Появится карточка с полями этой записи.</p><p>Если список пуст, добавьте свои данные в исходную таблицу или пропустите шаг.</p>{progress?.target&&<Link className={styles.secondary} href={`/t/${encodeURIComponent(progress.target.tableId)}`} target="_blank" rel="noreferrer">Открыть исходную таблицу<ProtoIcon name="arrow"/></Link>}</>:mode==='save'?<><p>Если формы ещё нет, нажмите «Добавить форму». В её свойствах выберите сохранение после отправки и разрешённую роль.</p><p>Затем откройте рабочую форму, введите свои данные и нажмите «Сохранить». В таблице появится запись или сохранятся ваши изменения.</p><p>После успеха нажмите «Посмотреть список». Проверка формы без сохранения этот шаг не завершает.</p></>:mode==='access'?<><p>В окне «Доступ» проверьте три раздела:</p><ul><li><strong>Вход</strong> — адреса и роли пользователей.</li><li><strong>Экраны</strong> — разделы, которые увидит каждая роль.</li><li><strong>Данные</strong> — видимые поля и все записи или только свои.</li></ul><p>Нажмите «Сохранить доступ». Шаг завершится после сохранения и проверки настроек.</p></>:<><p>Нажмите «Открыть публикацию», проверьте способ входа и подтвердите публикацию.</p><p>Появится рабочая ссылка. Позже вы сможете менять черновик — пользователи увидят правки только после новой публикации.</p><p>Шаг завершится после успешной публикации.</p></>}
   <button type="button" className={styles.primary} onClick={onClose}>Понятно</button>
  </>}{error&&<p role="alert" className={ui.learningError}>{error}</p>}
 </div></PrototypeDialog>
}
