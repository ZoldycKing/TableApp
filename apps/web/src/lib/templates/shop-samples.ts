export const SHOP_SAMPLE_PRODUCTS = [
  { code: 'ORG-01', name: 'Органайзер для стола', price: 1290, category: 'Хранение', description: 'Три отделения для ручек и мелочей.' },
  { code: 'LMP-02', name: 'Настольная лампа', price: 3490, category: 'Освещение', description: 'Тёплый свет и три уровня яркости.' },
  { code: 'MOU-03', name: 'Коврик для мыши', price: 890, category: 'Аксессуары', description: 'Тканевая поверхность, 30 × 25 см.' },
  { code: 'CAB-04', name: 'Держатель для кабелей', price: 450, category: 'Аксессуары', description: 'Силиконовый держатель на три кабеля.' },
  { code: 'STN-05', name: 'Подставка для ноутбука', price: 2790, category: 'Аксессуары', description: 'Складная алюминиевая подставка.' },
  { code: 'NTE-06', name: 'Блокнот в точку', price: 590, category: 'Канцтовары', description: 'Формат A5, 80 листов.' },
] as const

export function shopSampleImage(name: unknown) {
  const product = SHOP_SAMPLE_PRODUCTS.find(item => item.name === name)
  return product ? `${product.code}.webp` : undefined
}
