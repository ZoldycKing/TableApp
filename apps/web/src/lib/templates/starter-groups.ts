/** Task choices shared by marketing and the installer, without template data in the client bundle. */
export const STARTER_GROUPS = [
  {
    id: 'client-apps', name: 'Приложение для клиентов',
    description: 'Клиент выбирает товар, услугу или объект, оформляет обращение и следит за ним в кабинете вашего бизнеса.',
    templateIds: ['zakazy', 'salon', 'service', 'zayavki', 'nedvizhimost', 'dostavka'],
  },
  {
    id: 'internal-tools', name: 'Внутренний учёт',
    description: 'Для владельца и команды: клиенты и сделки, движение товаров, выпуск продукции. Публичный каталог и кабинет покупателя здесь не нужны.',
    templateIds: ['crm', 'sklad', 'proizvodstvo'],
  },
] as const
