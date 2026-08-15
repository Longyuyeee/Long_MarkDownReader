import type { PdfAnnotationRect } from './pdfAnnotations'

export type PdfRedactionColor = 'black' | 'white'

export interface PdfRedactionOverlay extends PdfAnnotationRect {
  id: string
  page: number
  color: PdfRedactionColor
}

export interface PdfRasterizedRedactionPage {
  page: number
  pngBase64: string
  redactions: Array<Omit<PdfRedactionOverlay, 'id' | 'page'>>
}

export interface PdfRedactionCopyReport {
  status: 'isolated_verified' | 'blocked'
  engine: string
  sourceDigest: string
  sourcePages: number
  outputPages: number
  redactionRects: number
  outputDigest?: string | null
  rasterInputBytes: number
  renderedPixels: number
  outputBytes: number
  blockers: string[]
  pageGeometryVerified: boolean
  redactionPixelsVerified: boolean
  structuralReparseVerified: boolean
  textAbsenceVerified: boolean
  sourceObjectIsolationVerified: boolean
}

export interface PdfSavedRedactionCopyReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourceDigest: string
  sourceUnchanged: boolean
  outputPages: number
  outputBytes: number
  structuralReopenVerified: boolean
  textAbsenceReopenVerified: boolean
  sourceObjectIsolationReopenVerified: boolean
}
