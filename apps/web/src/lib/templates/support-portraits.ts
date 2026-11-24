/** Public portraits for the support starter. Safe to import from client previews. */
const portraits: Record<string, string> = {
  'Марина Соколова': 'marina.jpg',
  'Анна Волкова': 'anna.jpg',
  'Игорь Белов': 'igor.jpg',
  'Павел Смирнов': 'pavel.jpg',
  'Ирина Петрова': 'irina.jpg',
  'Пётр Орлов': 'petr.jpg',
  'Ольга Семёнова': 'olga.jpg',
  'Артём Ким': 'artem.jpg',
}

export function supportPortraitFile(name: unknown) {
  return typeof name === 'string' ? portraits[name] ?? null : null
}

export function supportPortraitUrl(name: unknown) {
  const file = supportPortraitFile(name)
  return file ? `/template-media/support/${file}` : null
}
