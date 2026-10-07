import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomBytes } from 'node:crypto'

/**
 * Объектное хранилище. В разработке это MinIO, в продакшене — любой
 * S3-совместимый сервис: в РФ это Yandex Object Storage или VK Cloud.
 * Ключи файлов не угадываются, но доступ всё равно проверяется на сервере —
 * неугадываемый адрес не является правом доступа.
 */

const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000'
const bucket = process.env.S3_BUCKET ?? 'tableapp'

let client: S3Client | null = null
let bucketReady: Promise<void> | null = null

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'ru-central1',
      // MinIO не умеет виртуальные хосты без настройки DNS.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'tableapp',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'tableapp123',
      },
    })
  }
  return client
}

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await s3().send(new HeadBucketCommand({ Bucket: bucket }))
      } catch {
        await s3().send(new CreateBucketCommand({ Bucket: bucket }))
      }
    })().catch((error) => {
      // Неудачную проверку не кэшируем: хранилище могло просто ещё не подняться.
      bucketReady = null
      throw error
    })
  }
  return bucketReady
}

export type StoredFile = {
  key: string
  name: string
  mime: string
  size: number
}

const MAX_FILE_BYTES = 25 * 1024 * 1024

export const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
])

export function isAllowed(mime: string): boolean {
  return ALLOWED_MIME.has(mime)
}

export function fileKey(workspaceId: string, name: string): string {
  // Имя приходит от клиента, поэтому сначала отбрасываем путь и только потом
  // ищем расширение: «../../etc/passwd» не должен ни протащить слэши в ключ,
  // ни оставить в нём фрагмент своего имени.
  const basename = name.split(/[\\/]/).pop() ?? ''
  const dot = basename.lastIndexOf('.')
  const raw = dot > 0 ? basename.slice(dot + 1) : ''
  const safe = /^[A-Za-z0-9]{1,10}$/.test(raw) ? raw.toLowerCase() : ''
  const extension = safe ? `.${safe}` : ''
  return `${workspaceId}/${randomBytes(16).toString('hex')}${extension}`
}

export async function putFile(
  workspaceId: string,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<{ ok: true; stored: StoredFile } | { ok: false; error: string }> {
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: 'Файл больше 25 МБ' }
  }
  if (!isAllowed(file.type)) {
    return { ok: false, error: `Тип файла ${file.type || 'неизвестен'} не поддерживается` }
  }

  await ensureBucket()
  const key = fileKey(workspaceId, file.name)

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.bytes,
      ContentType: file.type,
      ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    }),
  )

  return { ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.byteLength } }
}

export async function getFile(key: string): Promise<{ body: ReadableStream; mime: string } | null> {
  await ensureBucket()
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.Body) return null
    return {
      body: result.Body.transformToWebStream(),
      mime: result.ContentType ?? 'application/octet-stream',
    }
  } catch {
    return null
  }
}
