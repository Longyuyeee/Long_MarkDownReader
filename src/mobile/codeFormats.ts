import { mobileCodeFormats } from '../../shared/mobile-code-formats.ts'
export const codeFormats = mobileCodeFormats
export type CodeFormat = typeof codeFormats[number]
export type CodeLanguage = CodeFormat['language'] | 'json' | 'yaml' | 'xml' | 'toml'
export const codeExtensions = codeFormats.flatMap(format => [...format.extensions])
export const mobileTextPattern = new RegExp('\\.(?:md|txt|json|ya?ml|xml|toml|' + codeExtensions.join('|') + ')$', 'i')
export const textFileExtension = (path: string) => mobileTextPattern.exec(path)?.[0] || ''
export const codeFileInfo = (path: string) => { const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase(); return codeFormats.find(format => (format.extensions as readonly string[]).includes(extension || '')) }
// JSON shares the source reader/editor shell; it keeps its own storage/import
// registration and range-based structure/format engines.
export const sourceFileInfo = (path: string) => codeFileInfo(path) || (/\.json$/i.test(path) ? {label:'JSON',language:'json' as const} : /\.ya?ml$/i.test(path) ? {label:'YAML',language:'yaml' as const} : /\.xml$/i.test(path) ? {label:'XML',language:'xml' as const} : /\.toml$/i.test(path) ? {label:'TOML',language:'toml' as const} : undefined)
export function codeMimeFile(mime: string) {
  const value = mime.split(';')[0]!.trim().toLowerCase()
  const format = codeFormats.find(format => ([format.mime, ...format.aliases] as readonly string[]).includes(value))
  return format ? '导入源码.' + format.extensions[0] : ''
}
export const codeFileAccept = [...codeExtensions.map(ext => '.' + ext), ...codeFormats.flatMap(format => [format.mime, ...format.aliases])].join(',')
