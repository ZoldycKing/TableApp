/** Coordinates are measured in the scene, so labels keep their real font size. */
export function tableStoryLayout(width: number, height: number, chapter: number) {
  const small = width < 650
  const narrow = width < 340
  const frameWidth = chapter === 0 ? Math.min(width - 24, 850)
    : chapter === 1 ? Math.min(width - 24, 740)
    : chapter === 2 ? Math.min(width - 32, 332)
    : small ? Math.min(width - 32, 306) : 310
  const frameHeight = chapter === 0 ? (small ? 306 : 364)
    : chapter === 1 ? (small ? 404 : 406)
    : chapter === 2 ? 384 : small ? 286 : 420
  const left = chapter === 3 && !small ? Math.min(width * .56, width - frameWidth - 16) : (width - frameWidth) / 2
  const top = chapter === 0 && small ? 14 : chapter === 3 && small ? 142 : Math.max(8, (height - frameHeight) / 2)
  const frame = { left, top, width: frameWidth, height: frameHeight, borderRadius: chapter >= 2 ? 28 : 16 }
  const records = Array.from({ length: 4 }, (_, index) => {
    const gridWidth = (frameWidth - 36) / 2
    const detail = chapter === 3
    return {
      left: left + (chapter === 1 ? 12 + (index % 2) * (gridWidth + 12) : 12),
      top: top + (chapter === 0 ? 82 + index * (small ? 48 : 62) : chapter === 1 ? 56 + Math.floor(index / 2) * 168 : detail ? 54 : 60 + index * 66),
      width: chapter === 1 ? gridWidth : frameWidth - 24,
      height: chapter === 0 ? (small ? 48 : 62) : chapter === 1 ? 156 : detail ? (small ? 204 : 330) : 59,
      borderRadius: chapter === 0 ? 0 : 12,
      opacity: detail && index !== 1 ? 0 : 1,
      photo: {
        opacity: chapter === 0 && narrow ? 0 : 1,
        left: chapter === 0 ? 10 : 10,
        top: chapter === 0 ? (small ? 9 : 12) : 10,
        width: chapter === 0 ? (small ? 28 : 38) : chapter === 1 ? gridWidth - 20 : detail ? frameWidth - 44 : 38,
        height: chapter === 0 ? (small ? 28 : 38) : chapter === 1 ? (small ? 57 : 78) : detail ? (small ? 90 : 174) : 38,
      },
      name: { left: chapter === 0 ? (narrow ? 10 : small ? 46 : 64) : chapter === 1 || detail ? 12 : 60, top: chapter === 0 ? (small ? 9 : 16) : chapter === 1 ? (small ? 78 : 101) : detail ? (small ? 116 : 204) : 12 },
      price: { right: chapter === 0 ? (small ? 54 : 94) : 12, top: chapter === 0 ? (small ? 15 : 23) : chapter === 1 ? 128 : detail ? (small ? 152 : 246) : 22, opacity: chapter === 2 ? 0 : 1 },
      stock: { right: 12, top: chapter === 0 ? (small ? 16 : 24) : chapter === 1 ? 130 : detail ? (small ? 156 : 250) : 22, opacity: chapter === 1 || detail ? 0 : 1 },
    }
  })
  return { frame, records, small, team: small ? { left: 12, top: 8, width: width - 24, height: 118 } : { left: width * .06, top: (height - 322) / 2, width: width * .38, height: 322 } }
}
