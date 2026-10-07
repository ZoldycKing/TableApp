'use client'

import { STORY } from './story-data'
import { useStoryProgress } from './use-story-progress'

/**
 * Вариация А3. Без внешней рамки: крупный заголовок сверху, сцена в белой
 * карточке, управление внизу — как главы у видео, полоска над подписью.
 * Читается спокойнее, чем панель вкладок, и не спорит с соседними секциями.
 *
 * Полоска идёт одним непрерывным движением: пройденные главы остаются
 * закрашенными, активная продолжает с того же места, а под курсором
 * движение замирает, а не сбрасывается.
 */
export function StoryChapters() {
  const { index, bars, show, hover, root } = useStoryProgress(STORY.length)
  const active = STORY[index]!
  const Scene = active.Scene

  return (
    <div ref={root} {...hover} className="@container">
      <div className="flex items-end justify-between gap-6">
        <div key={active.id} className="animate-screen-in min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-sage-700">
            {active.tab}
          </span>
          <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-[2rem]">
            {active.title}
          </h3>
        </div>

        <span className="hidden shrink-0 pb-1 text-sm tabular-nums text-ink-muted sm:block">
          0{index + 1} / 0{STORY.length}
        </span>
      </div>

      <p
        key={`${active.id}-text`}
        className="animate-screen-in mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft sm:min-h-[3.5rem]"
      >
        {active.text}
      </p>

      <div
        key={`${active.id}-scene`}
        className="animate-screen-in mt-6 rounded-[26px] border border-sand-200 bg-white p-3 shadow-soft sm:p-5"
      >
        <Scene />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STORY.map((item, position) => (
          <button
            key={item.id}
            type="button"
            onClick={() => show(position)}
            className="group text-left"
          >
            <span className="block h-[3px] overflow-hidden rounded-full bg-sand-200 transition-colors group-hover:bg-sand-300">
              <span
                ref={(node) => {
                  bars.current[position] = node
                }}
                className="block h-full origin-left rounded-full bg-ink"
              />
            </span>

            <span className="mt-2.5 flex items-baseline gap-2">
              <span className="text-[11px] tabular-nums text-ink-muted">0{position + 1}</span>
              <span
                className={`text-[13px] leading-tight transition-colors ${
                  position === index ? 'font-medium text-ink' : 'text-ink-muted'
                }`}
              >
                {item.tab}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
