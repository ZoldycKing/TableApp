/** Оттенки акцента: сплошной для кнопок, мягкий для активного пункта меню. */
export function accentTones(accent: string): {
  solid: string
  text: string
  soft: string
  ring: string
} {
  const map: Record<string, { solid: string; text: string; soft: string; ring: string }> = {
    gray: { solid: 'bg-gray-600', text: 'text-gray-700', soft: 'bg-gray-50', ring: 'ring-gray-500' },
    red: { solid: 'bg-red-600', text: 'text-red-700', soft: 'bg-red-50', ring: 'ring-red-500' },
    orange: { solid: 'bg-orange-700', text: 'text-orange-700', soft: 'bg-orange-50', ring: 'ring-orange-500' },
    yellow: { solid: 'bg-yellow-700', text: 'text-yellow-700', soft: 'bg-yellow-50', ring: 'ring-yellow-500' },
    lime: { solid: 'bg-lime-700', text: 'text-lime-700', soft: 'bg-lime-50', ring: 'ring-lime-500' },
    cyan: { solid: 'bg-cyan-700', text: 'text-cyan-700', soft: 'bg-cyan-50', ring: 'ring-cyan-500' },
    purple: { solid: 'bg-purple-600', text: 'text-purple-700', soft: 'bg-purple-50', ring: 'ring-purple-500' },
    pink: { solid: 'bg-pink-600', text: 'text-pink-700', soft: 'bg-pink-50', ring: 'ring-pink-500' },
    blue: { solid: 'bg-blue-600', text: 'text-blue-700', soft: 'bg-blue-50', ring: 'ring-blue-500' },
    green: { solid: 'bg-green-700', text: 'text-green-700', soft: 'bg-green-50', ring: 'ring-green-500' },
    violet: { solid: 'bg-violet-600', text: 'text-violet-700', soft: 'bg-violet-50', ring: 'ring-violet-500' },
    rose: { solid: 'bg-rose-600', text: 'text-rose-700', soft: 'bg-rose-50', ring: 'ring-rose-500' },
    amber: { solid: 'bg-amber-700', text: 'text-amber-700', soft: 'bg-amber-50', ring: 'ring-amber-500' },
    teal: { solid: 'bg-teal-700', text: 'text-teal-700', soft: 'bg-teal-50', ring: 'ring-teal-500' },
    indigo: { solid: 'bg-indigo-600', text: 'text-indigo-700', soft: 'bg-indigo-50', ring: 'ring-indigo-500' },
  }
  return map[accent] ?? map.blue!
}
