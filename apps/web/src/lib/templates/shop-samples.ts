export const SHOP_SAMPLE_PRODUCTS = [
  {
    code: 'ORG-01', name: 'Органайзер для стола', price: 1290, category: 'Хранение',
    description: 'Три отделения для ручек и мелочей.',
    stock: 18, size: '24 × 12 × 8 см', color: 'Графит', material: 'ABS-пластик',
  },
  {
    code: 'LMP-02', name: 'Настольная лампа', price: 3490, category: 'Освещение',
    description: 'Тёплый свет и три уровня яркости.',
    stock: 2, size: 'Высота 42 см', color: 'Белый', material: 'Металл / пластик',
  },
  {
    code: 'MOU-03', name: 'Коврик для мыши', price: 890, category: 'Аксессуары',
    description: 'Тканевая поверхность, 30 × 25 см.',
    stock: 0, size: '30 × 25 см', color: 'Чёрный', material: 'Ткань / резина',
  },
  {
    code: 'CAB-04', name: 'Держатель для кабелей', price: 450, category: 'Аксессуары',
    description: 'Силиконовый держатель на три кабеля.',
    stock: 3, size: '8 × 3 см', color: 'Серый', material: 'Силикон',
  },
  {
    code: 'STN-05', name: 'Подставка для ноутбука', price: 2790, category: 'Аксессуары',
    description: 'Складная алюминиевая подставка.',
    stock: 11, size: 'до 15″', color: 'Серебристый', material: 'Алюминий',
  },
  {
    code: 'NTE-06', name: 'Блокнот в точку', price: 590, category: 'Канцтовары',
    description: 'Формат A5, 80 листов.',
    stock: 1, size: 'A5', color: 'Кремовый', material: 'Бумага 80 г/м²',
  },
] as const

export function shopSampleImage(name: unknown) {
  const product = SHOP_SAMPLE_PRODUCTS.find(item => item.name === name)
  return product ? `${product.code}.webp` : undefined
}
