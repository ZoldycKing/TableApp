type Result = { ok: true } | { ok: false; error: string }

/** One writer per editor. A flush also saves edits made while an older save was in flight. */
export function createDraftSaveQueue<T>(initial: T, persist: (value: T) => Promise<Result>) {
  let latest = initial
  let saved = initial
  let running: Promise<Result> | null = null
  return {
    set(value: T) { latest = value },
    reset(value: T) { latest = value; saved = value },
    current() { return latest },
    dirty() { return latest !== saved },
    flush(): Promise<Result> {
      if (running) return running
      running = (async () => {
        while (latest !== saved) {
          const snapshot = latest
          let result: Result
          try { result = await persist(snapshot) }
          catch { return { ok: false as const, error: 'Не удалось сохранить черновик. Проверьте соединение и повторите сохранение.' } }
          if (!result.ok) return result
          saved = snapshot
        }
        return { ok: true as const }
      })().finally(() => { running = null })
      return running
    },
  }
}
