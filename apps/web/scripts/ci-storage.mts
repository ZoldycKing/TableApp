import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const envFile = resolve(import.meta.dirname, '../../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const endpoint = process.env.S3_ENDPOINT
if (!endpoint || !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)) throw new Error('CI storage must be local')
let ready = false
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    ready = (await fetch(`${endpoint}/minio/health/ready`, { signal: AbortSignal.timeout(2000) })).ok
    if (ready) break
  } catch { /* Container may still be starting. */ }
  await new Promise((done) => setTimeout(done, 500))
}
if (!ready) throw new Error('MinIO did not become ready')
const client = new S3Client({ endpoint, region: 'ru-central1', forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } })
try {
  await client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET! }))
} catch (error) {
  if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes((error as Error).name)) throw error
} finally { client.destroy() }
console.log('Local CI storage is ready')
