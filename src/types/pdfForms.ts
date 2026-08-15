export interface PdfFormFieldSummary {
  name: string
  fieldType: string
  value?: string | null
  defaultValue?: string | null
  optionCount: number
  widgetCount: number
  readOnly: boolean
  required: boolean
  multiline: boolean
  password: boolean
  hasActions: boolean
  fillableCandidate: boolean
}

export interface PdfFormWidgetSummary {
  objectId?: string | null
  page: number
  fieldName: string
  fieldType: string
  linkedToCanonicalField: boolean
  hasNormalAppearance: boolean
  hasActions: boolean
}

export interface PdfFormInspectionReport {
  status: 'no_form' | 'inspectable' | 'blocked'
  sourceDigest: string
  sourceBytes: number
  pageCount: number
  hasAcroForm: boolean
  needAppearances: boolean
  fieldCount: number
  widgetCount: number
  fieldTypeCounts: Record<string, number>
  duplicateFieldNames: string[]
  orphanWidgetCount: number
  missingAppearanceCount: number
  fillableCandidateCount: number
  blockers: string[]
  diagnostics: string[]
  fields: PdfFormFieldSummary[]
  widgets: PdfFormWidgetSummary[]
}
