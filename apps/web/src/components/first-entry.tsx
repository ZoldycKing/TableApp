import { StartChoices } from './start-choices'

export function FirstEntry() {
  return <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
    <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">С чего начнём?</h1>
    <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">Добавьте данные и подготовьте удобные экраны для себя, команды и клиентов.</p>
    <StartChoices />
  </main>
}
