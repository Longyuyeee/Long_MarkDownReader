export interface PdfOcrSource {
  pdfFile: string
  size: number
  modifiedAt: number
  fingerprint?: string
}

export interface PdfOcrProvider {
  id: 'tesseract-wasm'
  version: string
  languages: string[]
}

export interface PdfOcrPage {
  page: number
  text: string
  confidence: number
  processedAt: number
  width: number
  height: number
}

export interface PdfOcrDocument {
  schemaVersion: 1
  source: PdfOcrSource
  provider: PdfOcrProvider
  updatedAt: number
  pages: PdfOcrPage[]
}

export type PdfOcrTaskState = 'idle' | 'preparing' | 'running' | 'completed' | 'cancelled' | 'failed'

