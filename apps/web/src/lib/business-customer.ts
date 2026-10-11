import { apps, businessCustomerApps, businessCustomers, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { normalizeEmail } from './auth'
import type { Transaction } from './db-transaction'

/** Caller has already verified the email. Tenant is taken from the stored app, never the browser. */
export async function ensureBusinessCustomer(appId: string, email: string, legacyName: string | null = null) {
  const normalized = normalizeEmail(email)
  return db.transaction(async tx => {
    const [app] = await tx.select({ workspaceId: apps.workspaceId }).from(apps).where(eq(apps.id, appId)).limit(1)
    if (!app) return null
    await tx.insert(businessCustomers).values({ id: newId('businessCustomer'), workspaceId: app.workspaceId, email: normalized, name: legacyName }).onConflictDoNothing()
    const [profile] = await tx.select().from(businessCustomers)
      .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, normalized))).limit(1)
    if (!profile) return null
    await tx.insert(businessCustomerApps).values({ workspaceId: app.workspaceId, customerId: profile.id, appId }).onConflictDoNothing()
    return profile
  })
}

/** Only confirmed client input; runs in the same transaction as the successfully created record. */
export async function updateBusinessCustomerContact(tx: Transaction, workspaceId: string, email: string, name: unknown, phone: unknown) {
  if (typeof name !== 'string' || typeof phone !== 'string') return
  await tx.insert(businessCustomers).values({ id: newId('businessCustomer'), workspaceId, email: normalizeEmail(email), name: name.trim(), phone: phone.trim() })
    .onConflictDoUpdate({ target: [businessCustomers.workspaceId, businessCustomers.email], set: { name: name.trim(), phone: phone.trim(), updatedAt: new Date() } })
}
