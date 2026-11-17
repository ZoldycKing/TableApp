/** Public portraits for the projects starter. Safe to import from client previews. */
const portraits: Record<string, string> = {
  'Марина Соколова': 'marina.jpg',
  'Алексей Громов': 'alexey.jpg',
  'Анна Волкова': 'anna.jpg',
  'Игорь Белов': 'igor.jpg',
  'Светлана Морозова': 'svetlana.jpg',
  'Павел Смирнов': 'pavel.jpg',
}

export function projectsPortraitFile(name: unknown) {
  return typeof name === 'string' ? portraits[name] ?? null : null
}

export function projectsPortraitUrl(name: unknown) {
  const file = projectsPortraitFile(name)
  return file ? `/template-media/projects/${file}` : null
}
