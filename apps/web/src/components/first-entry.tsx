import { StartChoices } from './start-choices'

export function FirstEntry() {
  return <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
    <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">С чего начнём?</h1>
    <StartChoices />
  </main>
}
