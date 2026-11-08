import { describe, expect, it } from 'vitest'
import { builderV2MediaItems } from './media-values'

describe('order line product photos', () => {
  it('exposes a scoped thumb url when photo data exists and skips empty values', () => {
    const photo = [{ key: 'workspace/photo-1.jpg', name: 'Стеллаж.jpg', mime: 'image/jpeg', size: 8192 }]
    expect(builderV2MediaItems(photo, 'shop').find(item => item.image)?.url).toBe('/api/files/workspace/photo-1.jpg?v2App=shop')
    expect(builderV2MediaItems([], 'shop').find(item => item.image)?.url).toBeUndefined()
    expect(builderV2MediaItems(undefined, 'shop').find(item => item.image)?.url).toBeUndefined()
  })
})
