import { findFileFormat } from '../config/fileFormats'

export const externalRouteForFile = (path: string, navigationKey = Date.now()) => {
  const format = findFileFormat(path)
  if (!format || !['edit', 'preview'].includes(format.externalPolicy)) return null

  const query = { path, external: '1', t: navigationKey }
  if (format.id === 'markdown') return { name: 'TempMode', query }
  return { name: format.routeName, query }
}
