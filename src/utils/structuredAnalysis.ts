const MEDIUM_SOURCE_CHARACTERS = 256 * 1024
const LARGE_SOURCE_CHARACTERS = 1024 * 1024

export const STRUCTURED_ANALYSIS_BUSY_RETRY_MS = 160

export const structuredAnalysisDelay = (characterCount: number) => {
  if (characterCount >= LARGE_SOURCE_CHARACTERS) return 900
  if (characterCount >= MEDIUM_SOURCE_CHARACTERS) return 520
  return 280
}
