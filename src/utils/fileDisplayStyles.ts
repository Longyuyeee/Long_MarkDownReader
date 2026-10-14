import type { FileDisplayStyle } from '../config/fileTreeAppearance'

/** Match Windows scan/canonical paths without changing POSIX case semantics. */
export const fileStylePathKey = (path: string) => {
  let key = path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
  key = key.replace(/\/+$/, '')
  return /^(?:[a-z]:|\/\/)/i.test(key) ? key.toLowerCase() : key
}

export const normalizeFileDisplayStyles = (styles: Record<string, FileDisplayStyle>) =>
  Object.fromEntries(Object.entries(styles).map(([path, style]) => [fileStylePathKey(path), style])) as Record<string, FileDisplayStyle>

export const moveFileDisplayStyleEntries = (styles: Record<string, FileDisplayStyle>, oldPath: string, newPath: string) => {
  const next = normalizeFileDisplayStyles(styles), oldKey = fileStylePathKey(oldPath), newKey = fileStylePathKey(newPath)
  const moving = Object.entries(next).filter(([key]) => key === oldKey || key.startsWith(`${oldKey}/`))
  for (const [key] of moving) delete next[key]
  for (const [key, style] of moving) next[`${newKey}${key.slice(oldKey.length)}`] = style
  return next
}

export const copyFileDisplayStyleEntries = (styles: Record<string, FileDisplayStyle>, oldPath: string, newPath: string) => {
  const next = normalizeFileDisplayStyles(styles), oldKey = fileStylePathKey(oldPath), newKey = fileStylePathKey(newPath)
  for (const [key, style] of Object.entries(next)) if (key === oldKey || key.startsWith(`${oldKey}/`)) next[`${newKey}${key.slice(oldKey.length)}`] = { ...style }
  return next
}

const channels = (color: string) => /^#[0-9a-f]{6}$/i.test(color)
  ? [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255) : null
const luminance = (color: string) => channels(color)?.reduce((sum, channel, index) =>
  sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index], 0) ?? 0
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
export const readableMarkerText = (background: string) => channels(background)
  ? (contrast(background, '#253041') >= contrast(background, '#f8fafc') ? '#253041' : '#f8fafc') : ''
export const markerTextColor = (style?: Partial<FileDisplayStyle>) => style?.textColor || readableMarkerText(style?.backgroundColor || '')

const selectedTint = (background: string) => {
  const values = channels(background)
  if (!values) return ''
  const toward = luminance(background) > .45 ? 0 : 1
  return '#' + values.map(value => Math.round((value * .86 + toward * .14) * 255).toString(16).padStart(2, '0')).join('')
}

export const fileMarkerColors = (style: Partial<FileDisplayStyle>) => {
  const text = markerTextColor(style) || 'var(--theme-text)'
  const selectionStyle = style.selectionStyle || 'fill'
  const background = style.backgroundColor || 'var(--file-row-bg)'
  const selectedBackground = selectionStyle === 'fill'
    ? style.selectedBackgroundColor || selectedTint(style.backgroundColor || '') || 'color-mix(in srgb, var(--theme-primary) 12%, var(--file-row-bg))'
    : background
  const selectedText = style.selectedTextColor || (channels(selectedBackground)
    ? (channels(text) && contrast(text, selectedBackground) >= 4.5 ? text : readableMarkerText(selectedBackground)) : text)
  const selectedAccent = style.selectedAccentColor || (style.backgroundColor || style.selectedBackgroundColor ? selectedText : 'var(--theme-primary)')
  return { background, text, selectedBackground, selectedText, selectedAccent }
}
