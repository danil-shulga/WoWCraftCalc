import type { z } from 'zod'

import type {
  referenceDatabaseSchema,
  referenceItemSchema,
  referenceRecipeSchema,
} from './reference-database.schema'

export type ReferenceDatabase = z.infer<typeof referenceDatabaseSchema>
export type ReferenceItem = z.infer<typeof referenceItemSchema>
export type ReferenceRecipe = z.infer<typeof referenceRecipeSchema>
