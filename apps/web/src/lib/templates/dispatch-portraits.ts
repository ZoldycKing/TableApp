/** Public portraits for the field-service starter. Safe to import from client previews. */
const portraits: Record<string, string> = {
  'Сергей Волков': 'sergey.jpg',
  'Андрей Морозов': 'andrey.jpg',
  'Игорь Белов': 'igor.jpg',
  'Павел Смирнов': 'pavel.jpg',
}

export function dispatchPortraitFile(name: unknown) {
  return typeof name === 'string' ? portraits[name] ?? null : null
}

export function dispatchPortraitUrl(name: unknown) {
  const file = dispatchPortraitFile(name)
  return file ? `/template-media/dispatch/${file}` : null
}
