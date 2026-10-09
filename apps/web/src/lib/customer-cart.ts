export type CustomerCart = { requestId: string; items: { id: string; qty: number }[] }

export function parseCustomerCart(value: unknown): CustomerCart {
  if (typeof value !== 'string' || value.length > 20_000) throw new Error('Проверьте состав заказа')
  const parsed = JSON.parse(value) as Partial<CustomerCart> | null
  if (!parsed || typeof parsed.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(parsed.requestId) || !Array.isArray(parsed.items) || !parsed.items.length || parsed.items.length > 100) throw new Error('Проверьте состав заказа')
  if (parsed.items.some(item => !item || typeof item.id !== 'string' || !item.id.length || item.id.length > 100 || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 1000) || new Set(parsed.items.map(item => item.id)).size !== parsed.items.length) throw new Error('Проверьте состав заказа')
  return { requestId: parsed.requestId, items: parsed.items.map(item => ({ id: item.id, qty: item.qty })) }
}
