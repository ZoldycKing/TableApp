import sharp from 'sharp'
import { INLINE_IMAGE_MIME, imageMime } from './file-policy'

export type ScrubbedImage = {
  bytes: Uint8Array
  mime: string
  width: number
  height: number
  /** Original filename with a safe extension matching the output MIME. */
  name: string
}

function outputName(name: string, mime: string): string {
  const base = (name.split(/[\\/]/).pop() ?? 'image').replace(/\.[^.]+$/, '') || 'image'
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'bin'
  return `${base.slice(0, 200)}.${ext}`
}

/**
 * Re-encode raster/HEIC images server-side to strip EXIF and other metadata.
 * HEIC/HEIF are converted to JPEG when libvips supports them; otherwise an error is returned.
 */
export async function reencodeImage(file: { name: string; bytes: Uint8Array; mime?: string }): Promise<
  { ok: true; image: ScrubbedImage } | { ok: false; error: string }
> {
  const detected = imageMime(file.bytes)
  if (!detected) return { ok: false, error: 'Содержимое файла не соответствует формату изображения' }

  try {
    // sharp strips EXIF/metadata by default; rotate() applies orientation first.
    const pipeline = sharp(Buffer.from(file.bytes), {
      animated: detected === 'image/gif' || detected === 'image/webp',
      limitInputPixels: 40_000_000,
    }).rotate()

    let mime = detected
    let buffer: Buffer
    if (detected === 'image/heic' || detected === 'image/heif') {
      mime = 'image/jpeg'
      buffer = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    } else if (detected === 'image/jpeg') {
      buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    } else if (detected === 'image/png') {
      buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    } else if (detected === 'image/webp') {
      buffer = await pipeline.webp({ quality: 90 }).toBuffer()
    } else if (detected === 'image/gif') {
      buffer = await pipeline.gif().toBuffer()
    } else {
      return { ok: false, error: 'Этот формат изображения не поддерживается' }
    }

    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return { ok: false, error: 'Не удалось обработать изображение' }
    if (!INLINE_IMAGE_MIME.has(mime)) return { ok: false, error: 'Этот формат изображения не поддерживается' }

    return {
      ok: true,
      image: {
        bytes: new Uint8Array(buffer),
        mime,
        width: meta.width,
        height: meta.height,
        name: outputName(file.name, mime),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (detected === 'image/heic' || detected === 'image/heif' || /heif|heic|compression/i.test(message)) {
      return { ok: false, error: 'HEIC/HEIF не удалось обработать на сервере. Сохраните фото в JPEG или PNG и загрузите снова.' }
    }
    return { ok: false, error: 'Не удалось обработать изображение. Попробуйте другой файл.' }
  }
}

export function isImageUpload(mime: string): boolean {
  return mime.startsWith('image/')
}
