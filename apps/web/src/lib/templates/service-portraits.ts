/** Public portraits for the service-center starter. */
const portraits: Record<string, string> = {
  'Сергей Волков': 'sergey.jpg',
  'Андрей Морозов': 'andrey.jpg',
  'Игорь Белов': 'igor.jpg',
}

export function servicePortraitUrl(name: unknown) {
  if (typeof name !== 'string') return null
  const file = portraits[name]
  return file ? `/template-media/service/${file}` : null
}
