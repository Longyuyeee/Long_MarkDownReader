export type PdfAnnotationKind = 'highlight' | 'area' | 'comment'
export type PdfAnnotationColor = 'yellow' | 'green' | 'pink' | 'blue'

export interface PdfAnnotationRect { x: number; y: number; width: number; height: number }
export interface PdfAnnotationSource { pdfFile: string; size: number; modifiedAt: number; fingerprint?: string }
export interface PdfAnnotation {
  id: string
  kind: PdfAnnotationKind
  page: number
  color: PdfAnnotationColor
  rects: PdfAnnotationRect[]
  quote: string
  comment: string
  createdAt: number
  updatedAt: number
}
export interface PdfAnnotationDocument { schemaVersion: 1; source: PdfAnnotationSource; annotations: PdfAnnotation[] }
