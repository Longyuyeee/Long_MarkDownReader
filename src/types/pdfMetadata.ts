export interface PdfMetadataValues {
  title: string
  author: string
  subject: string
  keywords: string
}

export interface PdfMetadataCopyReport {
  status: 'blocked' | 'isolated_verified'
  engine: string
  blockers: string[]
  sourceDigest: string
  outputDigest?: string
  sourcePages: number
  outputBytes: number
  existingValues: PdfMetadataValues
  requestedValues: PdfMetadataValues
  updatedFields: string[]
  removedFields: string[]
  structuralReopenVerified: boolean
  metadataReopenVerified: boolean
  preservedInfoVerified: boolean
  preservedStructureVerified: boolean
  fullRewriteVerified: boolean
}

export interface PdfSavedMetadataCopyReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourceDigest: string
  sourceUnchanged: boolean
  sourcePages: number
  outputBytes: number
  requestedValues: PdfMetadataValues
  updatedFields: string[]
  removedFields: string[]
  structuralReopenVerified: boolean
  metadataReopenVerified: boolean
  preservedInfoVerified: boolean
  preservedStructureVerified: boolean
  fullRewriteVerified: boolean
}
