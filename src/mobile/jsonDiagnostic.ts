import { JSON_SOURCE_BUDGET } from './jsonSource.ts'
import { sourceDiagnosticLines, type SourceDiagnosticLine } from './sourceDiagnostic.ts'

export type JsonDiagnosticLine = SourceDiagnosticLine
export function jsonDiagnosticLines(source: string, offset: number): JsonDiagnosticLine[] {
  return sourceDiagnosticLines(source, offset, JSON_SOURCE_BUDGET.characters)
}
