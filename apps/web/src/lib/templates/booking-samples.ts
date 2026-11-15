const photos: Record<string, string> = { 'Женская стрижка': 'haircut.webp', 'Мужская стрижка': 'barber.webp', 'Окрашивание в один тон': 'color.webp', 'Маникюр с покрытием': 'manicure.webp', 'Укладка': 'styling.webp' }
export function bookingSampleImage(name: unknown) { return typeof name === 'string' ? photos[name] ?? null : null }
