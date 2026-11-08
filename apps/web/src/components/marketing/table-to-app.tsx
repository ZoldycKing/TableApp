'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Icon } from '@/components/runtime/icons'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'
import { PRODUCTS } from './catalog-data'
import { ProductGlyph } from './product-glyph'
import { ProductObject } from './product-object'
import { useDemoRecords } from './demo-records'
import { tableStoryLayout } from './table-story-layout'
import styles from './table-to-app.module.css'

export const TABLE_CHAPTERS = [
  { label: 'Таблица', title: 'Начинается с таблицы', text: 'Ваши товары, цены и остатки.' },
  { label: 'Каталог', title: 'Строки стали карточками', text: 'У каждого товара своя карточка с изображением и ценой.' },
  { label: 'Телефон', title: 'Приложение всегда под рукой', text: 'Сотрудник открывает товары и принимает поставку с телефона.' },
  { label: 'Доступ', title: 'Свои экраны для разных людей', text: 'Клиент видит товар и цену. Сотрудник работает с остатками и приёмкой.' },
] as const

// Each transition has a separate reading stop. No timers or page scroll hijacking.
const STOPS = [0, 2.1, 4.2, 6.3]
const HERO_STOPS = [0, 3, 5.8, 8.6]

function Scene({ chapter = 0, animated = false, hero = false }: { chapter?: number; animated?: boolean; hero?: boolean }) {
  const products = useDemoRecords()?.products ?? PRODUCTS
  return <div className={styles.scene} data-story-scene data-ui data-layout={animated ? undefined : chapter} aria-hidden="true">
    <div className={styles.window} data-part="window">
      <div className={styles.chrome}><span className={styles.appMark}><Icon name="grid" className="size-4" /></span><span data-part="window-title">{chapter === 0 ? 'Склад.xlsx' : chapter === 1 ? 'Каталог инструментов' : chapter === 2 ? 'Склад' : 'Экран клиента'}</span><span className={styles.windowDots}>•••</span></div>
      <div className={styles.tableHead} data-part="table-head"><span>Товар</span><span>Цена, ₽</span><span>Остаток</span></div>
      <div className={styles.employeeLabel} data-part="employee"><Icon name="users" className="size-3.5" /> Кладовщик <span>Товары и приёмка</span></div>
      <div className={styles.phoneBar} data-part="phone-bar"><span><Icon name="grid" className="size-4" />Товары</span><span><Icon name="plus" className="size-4" />Приёмка</span><span><Icon name="users" className="size-4" />Профиль</span></div>
      <div className={styles.detailButton} data-part="detail-button">Подробнее о товаре <span>→</span></div>
    </div>
    {products.map((product, index) => <div key={product.code} className={styles.record} data-part="record" data-record={index}>
      <div data-part="photo" className={`${styles.photo} ${hero ? styles.productPhoto : product.tint} ${product.ink}`}>{hero ? <ProductObject kind={product.glyph} className={styles.object} /> : <ProductGlyph kind={product.glyph} className={styles.glyph} />}</div>
      <div data-part="name" className={styles.name}>{product.short}<span>{product.code}</span></div>
      <strong data-part="price" className={styles.price}>{product.price}<small> ₽</small></strong>
      <span data-part="stock" className={styles.stock}>{product.stock} шт</span>
    </div>)}
    <div className={styles.team} data-part="team">
      <div className={styles.teamTitle}><Icon name="users" className="size-4" /><strong>Экран сотрудника</strong><span>Кладовщик</span></div>
      <div className={styles.teamRecords}>{products.map((product) => <div key={product.code}><span className={`${product.tint} ${product.ink}`}><ProductGlyph kind={product.glyph} className="size-6" /></span><span>{product.short}</span><strong>{product.stock} шт</strong></div>)}</div>
      <div className={styles.receive}><Icon name="plus" className="size-4" />Принять товар</div>
    </div>
    <div className={styles.connection} data-part="connection"><svg viewBox="0 0 100 40" fill="none"><path d="M2 20H98" stroke="currentColor" strokeDasharray="3 6" /><circle cx="50" cy="20" r="5" fill="currentColor" /></svg><span>Общие данные</span></div>
  </div>
}

export function TableToApp({ hero = false }: { hero?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const trigger = useRef<ScrollTrigger | null>(null)
  const player = useRef<gsap.core.Timeline | null>(null)
  const navigation = useRef<gsap.core.Tween | null>(null)
  const [chapter, setChapter] = useState(0)
  const [automatic, setAutomatic] = useState(true)
  const [paused, setPaused] = useState(false)
  const { playing, reduced } = useMotionPlayback(hero ? stage : root, hero ? .98 : .15, hero ? '-64px 0px 0px' : '0px')
  const playbackState = useRef({ playing, automatic, paused, reduced })
  playbackState.current = { playing, automatic, paused, reduced }
  const current = useRef(0)

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const node = root.current!
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      node.dataset.motion = 'scroll'
      const scene = stage.current!.querySelector<HTMLElement>('[data-story-scene]')!
      let context: gsap.Context | undefined
      let resizeFrame = 0
      let lastWidth = 0
      let lastMode = ''
      const build = () => {
        const width = scene.clientWidth
        const mode = hero ? 'auto' : window.innerHeight >= 741 ? 'scroll' : 'manual'
        // Ignore mobile browser chrome changing height during a gesture.
        if (Math.abs(width - lastWidth) < 1 && mode === lastMode && context) return
        lastWidth = width
        lastMode = mode
        const previousTime = hero ? player.current?.time() ?? 0 : 0
        context?.revert()
        navigation.current?.kill()
        node.dataset.motion = mode
        context = gsap.context(() => {
          const height = scene.clientHeight
          const part = (name: string) => scene.querySelector<HTMLElement>(`[data-part="${name}"]`)!
          node.dataset.chapter = '0'
          part('window-title').textContent = 'Склад.xlsx'
          current.current = 0
          setChapter(0)
          const records = Array.from(scene.querySelectorAll<HTMLElement>('[data-part="record"]'))
          const stops = hero ? HERO_STOPS : STOPS
          const firstTransition = hero ? 1.4 : .6
          const interval = hero ? 2.8 : 2.1
          const finalTransition = firstTransition + interval * 2
          const layouts = stops.map((_, index) => tableStoryLayout(width, height, index))
          const first = layouts[0]!
          gsap.set(part('window'), first.frame)
          records.forEach((record, index) => {
            const { photo, name, price, stock, ...box } = first.records[index]!
            gsap.set(record, box)
            gsap.set(record.querySelector('[data-part="photo"]'), photo)
            gsap.set(record.querySelector('[data-part="name"]'), name)
            gsap.set(record.querySelector('[data-part="price"]'), price)
            gsap.set(record.querySelector('[data-part="stock"]'), stock)
          })
          gsap.set([part('employee'), part('phone-bar'), part('detail-button'), part('team'), part('connection')], { autoAlpha: 0 })
          gsap.set(part('team'), { ...layouts[3]!.team, y: 32 })
          const timeline = gsap.timeline({ paused: true, defaults: { duration: 1.2, ease: 'power3.inOut' }, onComplete: () => { if (hero) setAutomatic(false) }, onUpdate: () => {
            const position = timeline.time()
            const index = position < firstTransition + .85 ? 0 : position < firstTransition + interval + .85 ? 1 : position < finalTransition + .85 ? 2 : 3
            node.dataset.chapter = String(index)
            part('window-title').textContent = ['Склад.xlsx', 'Каталог инструментов', 'Склад', 'Экран клиента'][index]!
            if (current.current !== index) { current.current = index; setChapter(index) }
          } })
          layouts.slice(1).forEach((layout, offset) => {
            const at = firstTransition + offset * interval
            timeline.to(part('window'), layout.frame, at)
            records.forEach((record, index) => {
              const { photo, name, price, stock, ...box } = layout.records[index]!
              const { opacity: priceOpacity, ...pricePosition } = price
              const { opacity: stockOpacity, ...stockPosition } = stock
              const delay = at + (offset === 2 && index !== 1 ? 0 : index * .045)
              timeline.to(record, { ...box, duration: offset === 2 && index !== 1 ? .4 : 1.2 }, delay)
              timeline.to(record.querySelector('[data-part="photo"]'), photo, delay)
              timeline.to(record.querySelector('[data-part="name"]'), name, delay)
              timeline.to(record.querySelector('[data-part="price"]'), pricePosition, delay)
              timeline.to(record.querySelector('[data-part="stock"]'), stockPosition, delay)
              // During the crossing, pictures carry identity; text returns at the reading stop.
              timeline.to(record.querySelectorAll('[data-part="name"], [data-part="price"], [data-part="stock"]'), { opacity: 0, duration: .24 }, delay)
              timeline.to(record.querySelector('[data-part="name"]'), { opacity: 1, duration: .28 }, delay + .94)
              timeline.to(record.querySelector('[data-part="price"]'), { opacity: priceOpacity, duration: .28 }, delay + .94)
              timeline.to(record.querySelector('[data-part="stock"]'), { opacity: stockOpacity, duration: .28 }, delay + .94)
              if (hero && offset < 2) {
                timeline.to(record, { rotation: (index % 2 ? 1 : -1) * (layout.small ? 1.2 : 2.4), y: layout.small ? -6 : -14, duration: .35, ease: 'power2.out' }, delay + .15)
                  .to(record, { rotation: 0, y: 0, duration: .6, ease: 'power2.inOut' }, delay + .6)
              }
            })
          })
          player.current = timeline
          timeline.to(part('table-head'), { autoAlpha: 0, duration: .3 }, firstTransition)
            .to(part('employee'), { autoAlpha: 1, duration: .3 }, firstTransition + interval + .9)
            .to(part('phone-bar'), { autoAlpha: 1, duration: .35 }, firstTransition + interval + 1)
            .to(part('employee'), { autoAlpha: 0, duration: .25 }, finalTransition)
            .to(part('phone-bar'), { autoAlpha: 0, duration: .25 }, finalTransition)
            .to(part('team'), { autoAlpha: 1, y: 0, duration: .75 }, finalTransition + .4)
            .to(part('detail-button'), { autoAlpha: 1, duration: .4 }, finalTransition + 1.05)
            .to(part('connection'), { autoAlpha: first.small ? 0 : 1, duration: .4 }, finalTransition + 1.1)
            .to({}, { duration: .5 }, stops[3]!)
          trigger.current = mode === 'scroll' ? ScrollTrigger.create({
            trigger: node, start: 'top 88px', end: () => `+=${node.offsetHeight - stage.current!.offsetHeight}`,
            animation: timeline, scrub: .55, invalidateOnRefresh: true,
          }) : null
          if (mode === 'auto') {
            timeline.timeScale(.6).time(previousTime)
            const state = playbackState.current
            if (state.playing && state.automatic && !state.paused && !state.reduced) timeline.play()
          }
          if (mode === 'manual') { current.current = 0; setChapter(0); node.dataset.chapter = '0' }
        }, scene)
      }
      build()
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(build)
      })
      resize.observe(scene)
      return () => {
        resize.disconnect()
        cancelAnimationFrame(resizeFrame)
        context?.revert()
        navigation.current?.kill()
        trigger.current = null
        player.current = null
        delete node.dataset.motion
        delete node.dataset.chapter
      }
    })
    return () => media.revert()
  }, [hero])

  useEffect(() => {
    if (!hero) return
    const timeline = player.current
    if (!timeline) return
    if (playing && automatic && !paused && !reduced) timeline.play()
    else timeline.pause()
  }, [hero, playing, automatic, paused, reduced])

  const show = (index: number) => {
    const scroll = trigger.current
    navigation.current?.kill()
    if (hero) { setAutomatic(false); setPaused(false); player.current?.pause() }
    if (!scroll) {
      if (player.current) navigation.current = player.current.tweenTo((hero ? HERO_STOPS : STOPS)[index]!, { duration: 1.4, ease: 'power2.inOut' })
      return
    }
    const target = scroll.start + (scroll.end - scroll.start) * STOPS[index]! / 6.8
    window.scrollTo({ top: target, behavior: 'smooth' })
  }

  const replay = () => {
    navigation.current?.kill()
    player.current?.pause(0)
    setAutomatic(true)
    setPaused(false)
    if (playing && !reduced) player.current?.play()
  }

  const chapters = <div className={styles.chapters} aria-label="Превращение таблицы в приложение">
    <span className={styles.indicator} style={{ '--chapter': chapter } as CSSProperties} />
    {TABLE_CHAPTERS.map((item, index) => <button key={item.label} type="button" onClick={() => show(index)} aria-pressed={chapter === index}>{item.label}</button>)}
  </div>

  return <div id="table-to-app" ref={root} className={styles.story} data-table-story data-presentation={hero ? 'hero' : undefined}>
    <div ref={stage} className={styles.stage}>
      <div className={styles.intro}>
        <div><h3>{TABLE_CHAPTERS[chapter]!.title}</h3><p>{TABLE_CHAPTERS[chapter]!.text}</p></div>
        <a href="#posle-istorii" className={styles.skip}>Дальше <span aria-hidden>↓</span></a>
      </div>
      {hero && <div className={styles.storyControls}>
        <div className={styles.toolbar}>{chapters}<div className={styles.playback}>
          {automatic && <button type="button" onClick={() => { navigation.current?.kill(); setPaused(value => !value) }} aria-label={paused ? 'Продолжить превращение' : 'Приостановить превращение'} title={paused ? 'Продолжить' : 'Пауза'}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>{paused ? <path d="m8 5 11 7-11 7z" /> : <path d="M7 5h3v14H7zM14 5h3v14h-3z" />}</svg>
          </button>}
          {!automatic && <button type="button" onClick={replay} aria-label="Повторить" title="Повторить"><Icon name="refresh" className="size-4" /></button>}
        </div></div>
        <p className={styles.storyCaption}>{TABLE_CHAPTERS[chapter]!.text}</p>
      </div>}
      <Scene animated hero={hero} />
      {!hero && <>{chapters}<p className={styles.scrollHint}><span>Листайте и следите за теми же четырьмя товарами</span><span>Выберите экран и посмотрите, как он устроен</span></p></>}
    </div>
    <div className={styles.fallback}>
      {TABLE_CHAPTERS.map((item, index) => <div key={item.label} className={styles.staticChapter}><h3>{item.title}</h3><p>{item.text}</p><Scene chapter={index} hero={hero} /></div>)}
    </div>
    <span id="posle-istorii" className={styles.exit} />
  </div>
}
