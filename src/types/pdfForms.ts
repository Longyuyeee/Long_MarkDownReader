export interface PdfFormFieldSummary {
  name: string
  fieldType: string
  value?: string | null
  defaultValue?: string | null
  optionCount: number
  buttonKind?: 'checkbox' | 'radio' | 'pushbutton'
  buttonExportValues: string[]
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
  appearanceStates: string[]
  appearanceState?: string | null
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

export interface PdfFormTextChange { fieldName: string; value: string }
export interface PdfFormTextFillReport {
  status: 'isolated_verified' | 'blocked'
  engine: string
  sourceDigest: string
  outputDigest?: string | null
  outputBytes: number
  changedFields: string[]
  appearanceStreamsWritten: number
  widgetStatesWritten: number
  fieldTreeVerified: boolean
  widgetAppearancesVerified: boolean
  blockers: string[]
}
export interface PdfSavedFormTextReport {
  status: 'saved_verified'
  targetPath: string
  targetDigest: string
  sourceUnchanged: boolean
  changedFields: string[]
  widgetStatesWritten: number
}
