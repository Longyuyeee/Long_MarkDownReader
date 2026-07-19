export interface PdfReferenceTarget {
  relativePath: string
  page: number
  annotationId: string
}

export interface PdfAnnotationReference {
  uri: string
  markdown: string
  label: string
}

export const parsePdfReferenceUri = (value: string): PdfReferenceTarget | null => {
  if (!/^longedit:\/\/pdf\/?\?/i.test(value.trim())) return null
  try {
    const url = new URL(value.trim())
    const relativePath = (url.searchParams.get('path') || '').replace(/\\/g, '/')
    const annotationId = url.searchParams.get('annotation') || ''
    const page = Number(url.searchParams.get('page'))
    const segments = relativePath.split('/')
    if (
      url.protocol !== 'longedit:' || url.hostname !== 'pdf'
      || !relativePath.toLowerCase().endsWith('.pdf')
      || relativePath.startsWith('/') || /^[a-z]:/i.test(relativePath)
      || segments.some(segment => !segment || segment === '.' || segment === '..')
      || !Number.isInteger(page) || page < 1 || page > 100_000
      || !annotationId || annotationId.length > 128
    ) return null
    return { relativePath, page, annotationId }
  } catch {
    return null
  }
}

export const resolveLibraryPdfPath = (libraryRoot: string, relativePath: string): string | null => {
  const normalizedRoot = libraryRoot.replace(/[\\/]+$/, '')
  if (!normalizedRoot) return null
  const separator = normalizedRoot.includes('\\') ? '\\' : '/'
  return `${normalizedRoot}${separator}${relativePath.replace(/\//g, separator)}`
}
