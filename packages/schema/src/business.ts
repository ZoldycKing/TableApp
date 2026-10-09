import { z } from 'zod'

/** Deliberately public identity; workspace names and owner contacts stay private. */
export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название бизнеса').max(100),
  location: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(40).default(''),
})
export type BusinessProfile = z.infer<typeof businessProfileSchema>
