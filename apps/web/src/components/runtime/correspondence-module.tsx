'use client'

/**
 * Переписка — reusable customer-communication module.
 *
 * Attach to any record via (slug, tableId, rowId). Staff see the unified
 * timeline (messages + amber internal notes with lock), Клиенту/Заметка
 * composer tabs, paperclip, pending chips with ×, and Отправить. Clients see
 * only public messages for their own records. Attachments use the secure
 * upload pipeline (type whitelist, ClamAV statuses, blocked chips, thumbnails).
 *
 * Live reads/writes go through conversation-actions → conversations.ts.
 * Shot harnesses pass fixture / fixtureFiles / fixtureAlert and skip the network.
 */
import type { Attachment } from '@tableapp/schema'
import { ConversationPanel } from './conversation-panel'
import type { ConversationPage } from '@/lib/conversation-types'
import type { UploadAlertInfo } from './conversation-file-ui'

export type CorrespondenceModuleProps = {
  /** Published app slug (or demo slug in shot harnesses). */
  slug: string
  /** Entity / table id the thread is bound to. */
  tableId: string
  /** Record id within that table. */
  rowId: string
  /** When false and there is no existing thread, the panel stays hidden. */
  configured?: boolean
  /** Owner/staff business circuit (never exposes notes to a client session). */
  business?: boolean
  /** Show the context title above the thread (off when embedded in a detail card). */
  showContext?: boolean
  /** Optional SLA / overdue chip rendered above the timeline (desk only). */
  slaBadge?: string | null
  /** Fixture page for visual shots; skips network reads when provided. */
  fixture?: ConversationPage
  fixtureFiles?: Attachment[]
  fixtureAlert?: UploadAlertInfo | null
}

/** Public mount point for Переписка on any record card or inbox. */
export function CorrespondenceModule({
  slug,
  tableId,
  rowId,
  configured = true,
  business = false,
  showContext = true,
  slaBadge = null,
  fixture,
  fixtureFiles,
  fixtureAlert = null,
}: CorrespondenceModuleProps) {
  return (
    <div data-correspondence-module="" data-table={tableId} data-row={rowId}>
      {slaBadge ? (
        <p className="mb-3 inline-flex items-center rounded-lg bg-[#A93232]/12 px-2.5 py-1 text-xs font-semibold text-[#A93232]" data-correspondence-sla>
          {slaBadge}
        </p>
      ) : null}
      <ConversationPanel
        slug={slug}
        tableId={tableId}
        rowId={rowId}
        configured={configured}
        business={business}
        showContext={showContext}
        fixture={fixture}
        fixtureFiles={fixtureFiles}
        fixtureAlert={fixtureAlert}
      />
    </div>
  )
}

export type { ConversationPage, UploadAlertInfo }
