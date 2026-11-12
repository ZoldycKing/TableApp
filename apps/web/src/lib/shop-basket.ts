export type ShopBasket = { requestId: string; items: { id: string; qty: number }[] }

const key = (appId: string) => `tableapp-shop-basket:${appId}`
const eventName = 'tableapp-shop-basket'

export function emptyShopBasket(requestId = crypto.randomUUID()): ShopBasket {
  return { requestId, items: [] }
}

export function shopBasketPayload(basket: ShopBasket) {
  return JSON.stringify({ requestId: basket.requestId, items: basket.items })
}

export function addShopBasketItem(basket: ShopBasket, id: string, maxQty = 1000): ShopBasket {
  if (!id || id.length > 100) return basket
  const ceiling = Math.max(0, Math.min(1000, Math.trunc(maxQty) || 0))
  if (ceiling < 1) return basket
  const current = basket.items.find(item => item.id === id)
  const items = current
    ? basket.items.map(item => item.id === id ? { ...item, qty: Math.min(ceiling, item.qty + 1) } : item)
    : [...basket.items, { id, qty: 1 }].slice(0, 100)
  return { ...basket, items }
}

export function changeShopBasketQty(basket: ShopBasket, id: string, qty: number, maxQty = 1000): ShopBasket {
  const ceiling = Math.max(0, Math.min(1000, Math.trunc(maxQty) || 0))
  if (ceiling < 1) return { ...basket, items: basket.items.filter(item => item.id !== id) }
  const next = Math.max(1, Math.min(ceiling, Math.trunc(qty) || 1))
  return { ...basket, items: basket.items.map(item => item.id === id ? { ...item, qty: next } : item) }
}

export function removeShopBasketItem(basket: ShopBasket, id: string): ShopBasket {
  return { ...basket, items: basket.items.filter(item => item.id !== id) }
}

export function readShopBasket(appId: string): ShopBasket {
  if (typeof sessionStorage === 'undefined') return emptyShopBasket('pending')
  const stored = sessionStorage.getItem(key(appId))
  const accept = (value: Partial<ShopBasket> | null): ShopBasket | null => {
    if (!value || typeof value.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.requestId) || !Array.isArray(value.items)) return null
    const items = value.items.flatMap(item => item && typeof item.id === 'string' && Number.isSafeInteger(item.qty) && item.qty >= 1 && item.qty <= 1000 ? [{ id: item.id, qty: item.qty }] : [])
    return { requestId: value.requestId, items: items.slice(0, 100) }
  }
  try {
    const parsed = accept(stored ? JSON.parse(stored) as Partial<ShopBasket> : null)
    if (parsed) return parsed
  } catch { /* Replace a damaged basket with a new submission key. */ }
  const basket = emptyShopBasket()
  sessionStorage.setItem(key(appId), JSON.stringify(basket))
  return basket
}

export function writeShopBasket(appId: string, basket: ShopBasket) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(key(appId), JSON.stringify(basket))
  window.dispatchEvent(new CustomEvent(eventName, { detail: appId }))
}

export function clearShopBasket(appId: string) {
  writeShopBasket(appId, emptyShopBasket())
}

export function subscribeShopBasket(appId: string, listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const onCustom = (event: Event) => { if ((event as CustomEvent<string>).detail === appId) listener() }
  const onStorage = (event: StorageEvent) => { if (event.key === key(appId)) listener() }
  window.addEventListener(eventName, onCustom)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(eventName, onCustom); window.removeEventListener('storage', onStorage) }
}
