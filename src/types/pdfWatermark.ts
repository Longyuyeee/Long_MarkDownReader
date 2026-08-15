export interface PdfWatermarkSpec {
  text: string
  angleDegrees: number
  opacity: number
  gray: number
}

export interface PdfWatermarkCopyReport {
  status: 'blocked' | 'isolated_verified'
  engine: string
  blockers: string[]
  sourceDigest: string
  outputDigest?: string
  sourcePages: number
  watermarkedPages: number
  outputBytes: number
  watermarkText: string
  angleDegrees: number
  opacity: number
  gray: number
  minimumFontSizePoints?: number
  maximumFontSizePoints?: number
  structuralReopenVerified: boolean
  pageGeometryVerified: boolean
  preservedStructureVerified: boolean
  watermarkStreamsVerified: boolean
  watermarkTextVerified: boolean
  fullRewriteVerified: boolean
}

export interface PdfSavedWatermarkCopyReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourceDigest: string
  sourceUnchanged: boolean
  watermarkedPages: number
  outputBytes: number
  watermarkText: string
  structuralReopenVerified: boolean
  pageGeometryVerified: boolean
  preservedStructureVerified: boolean
  watermarkStreamsVerified: boolean
  watermarkTextVerified: boolean
  fullRewriteVerified: boolean
}
