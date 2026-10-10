import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/runtime/app-shell', () => ({ AppShell: () => null }))
import { DEMO_SLUGS } from '@/components/marketing/solution-demo'
import { findSolution, INDUSTRIES, SOLUTIONS } from './solutions'
import { findTemplate, TEMPLATES } from './templates/catalog'

/**
 * Сайт обещает то, что продукт делает.
 *
 * Эти проверки нужны не ради покрытия: страница решения зовёт «взять шаблон»,
 * и если шаблон переименуют или уберут, кнопка приведёт в пустоту. Уже было —
 * на главной висели шесть связок, которых в продукте не существовало.
 */

describe('решения опираются на настоящие шаблоны', () => {
  it('у каждого решения, обещающего шаблон, этот шаблон есть', () => {
    for (const solution of SOLUTIONS) {
      if (solution.templateId === null) continue
      expect(findTemplate(solution.templateId), solution.slug).toBeDefined()
    }
  })

  it('решение без шаблона честно говорит об этом в границах', () => {
    for (const solution of SOLUTIONS) {
      if (solution.templateId !== null) continue
      expect(solution.limits.join(' '), solution.slug).toMatch(/шаблон/i)
    }
  })

  /*
   * Обратного требования нет намеренно: шаблон стоит дня работы, а страница
   * решения — недели содержания, и держать их в паре значит либо не добавлять
   * шаблоны, либо писать страницы впустую. Шаблон и без страницы решения
   * виден в каталоге и имеет собственную страницу.
   */
  it('шаблоны не повторяются и у каждого есть чем заполнить страницу', () => {
    const ids = TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const template of TEMPLATES) {
      expect(template.tagline.length, template.id).toBeGreaterThan(20)
      expect(template.audience.length, template.id).toBeGreaterThan(10)
      expect(template.gives.length, template.id).toBeGreaterThanOrEqual(3)
      expect(template.tables.length, template.id).toBeGreaterThan(0)
    }
  })

  it('отрасли ссылаются на существующие решения', () => {
    for (const industry of INDUSTRIES) {
      expect(industry.slugs.length).toBeGreaterThan(0)
      for (const slug of industry.slugs) {
        expect(findSolution(slug), `${industry.name} → ${slug}`).toBeDefined()
      }
    }
  })
})

describe('страницы решений заполнены целиком', () => {
  it('адреса уникальны и пригодны для ссылки', () => {
    const slugs = SOLUTIONS.map((solution) => solution.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('на каждой странице есть чем заполнить все блоки', () => {
    for (const solution of SOLUTIONS) {
      expect(solution.pains.length, solution.slug).toBeGreaterThanOrEqual(3)
      expect(solution.blocks, solution.slug).toHaveLength(4)
      expect(solution.workflow.length, solution.slug).toBeGreaterThanOrEqual(3)
      expect(solution.example.lines.length, solution.slug).toBeGreaterThanOrEqual(3)
      expect(solution.faq.length, solution.slug).toBeGreaterThanOrEqual(3)
      expect(solution.limits.length, solution.slug).toBeGreaterThanOrEqual(1)
    }
  })

  it('соседние решения существуют и не ведут на самих себя', () => {
    // Ссылка страницы на саму себя — тупик: человек нажимает и остаётся там же.
    for (const solution of SOLUTIONS) {
      expect(solution.related.length, solution.slug).toBeGreaterThan(0)
      for (const slug of solution.related) {
        expect(slug, solution.slug).not.toBe(solution.slug)
        expect(findSolution(slug), `${solution.slug} → ${slug}`).toBeDefined()
      }
    }
  })
})

describe('у каждого решения свой показ', () => {
  it('ни одно решение не осталось без экрана', () => {
    /*
     * Раньше у всех стоял один и тот же список строчек с числами: шесть
     * страниц про разную работу выглядели одинаково. Показ у каждого свой,
     * и без этой проверки новое решение снова окажется просто текстом.
     */
    const covered = new Set<string>(DEMO_SLUGS)
    for (const solution of SOLUTIONS) {
      expect(covered.has(solution.slug), solution.slug).toBe(true)
    }
  })

  it('показов не больше, чем решений', () => {
    const slugs = new Set(SOLUTIONS.map((solution) => solution.slug))
    for (const slug of DEMO_SLUGS) expect(slugs.has(slug), slug).toBe(true)
  })
})

describe('описания для поиска', () => {
  it('у каждой страницы свой заголовок и своё описание', () => {
    /*
     * Одно описание на весь сайт — самая частая ошибка: поисковик показывает
     * одинаковый текст под разными ссылками, и человек не понимает, куда идти.
     */
    const titles = SOLUTIONS.map((solution) => solution.seoTitle)
    const descriptions = SOLUTIONS.map((solution) => solution.description)
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  it('заголовки и описания разумной длины', () => {
    for (const solution of SOLUTIONS) {
      expect(solution.seoTitle.length, solution.slug).toBeGreaterThan(15)
      // С хвостом «· TableApp» заголовок должен оставаться читаемым в выдаче.
      expect(solution.seoTitle.length, solution.slug).toBeLessThanOrEqual(60)
      expect(solution.description.length, solution.slug).toBeGreaterThan(70)
      expect(solution.description.length, solution.slug).toBeLessThanOrEqual(170)
    }
  })
})
