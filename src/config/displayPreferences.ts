import type { VisualStyle } from './themePresets'

export interface DisplayPreferences {
  documentStyle: 'auto' | 'plain' | 'paper' | 'editorial'
  documentFont: 'auto' | 'sans' | 'serif' | 'mono' | 'yahei' | 'simsun' | 'kaiti' | 'fangsong' | 'notoSans' | 'notoSerif' | 'consolas' | 'custom'
  documentCustomFont: string
  documentLetterSpacing: number
  documentParagraphSpacing: number
  documentTextAlign: 'left' | 'justify'
  documentFontSize: number
  documentLineHeight: number
  fileDensity: 'auto' | 'compact' | 'comfortable' | 'spacious'
  fileRowStyle: 'auto' | 'flat' | 'cards'
  fileIconStyle: 'color' | 'muted'
}

export const DEFAULT_DISPLAY_PREFERENCES: Readonly<DisplayPreferences> = {
  documentStyle: 'auto', documentFont: 'auto', documentFontSize: 16, documentLineHeight: 1.75,
  documentCustomFont: '', documentLetterSpacing: 0, documentParagraphSpacing: 1, documentTextAlign: 'left',
  fileDensity: 'auto', fileRowStyle: 'auto', fileIconStyle: 'color',
}

const choice = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? value as T : fallback
const boundedNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  const input = value && typeof value === 'object' ? value as Partial<DisplayPreferences> : {}
  return {
    documentStyle: choice(input.documentStyle, ['auto', 'plain', 'paper', 'editorial'], 'auto'),
    documentFont: choice(input.documentFont, ['auto', 'sans', 'serif', 'mono', 'yahei', 'simsun', 'kaiti', 'fangsong', 'notoSans', 'notoSerif', 'consolas', 'custom'], 'auto'),
    documentCustomFont: typeof input.documentCustomFont === 'string' ? input.documentCustomFont.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) : '',
    documentLetterSpacing: boundedNumber(input.documentLetterSpacing, 0, 0, 4),
    documentParagraphSpacing: boundedNumber(input.documentParagraphSpacing, 1, 0, 3),
    documentTextAlign: choice(input.documentTextAlign, ['left', 'justify'], 'left'),
    documentFontSize: boundedNumber(input.documentFontSize, 16, 12, 28),
    documentLineHeight: boundedNumber(input.documentLineHeight, 1.75, 1.3, 2.4),
    fileDensity: choice(input.fileDensity, ['auto', 'compact', 'comfortable', 'spacious'], 'auto'),
    fileRowStyle: choice(input.fileRowStyle, ['auto', 'flat', 'cards'], 'auto'),
    fileIconStyle: choice(input.fileIconStyle, ['color', 'muted'], 'color'),
  }
}

export function documentTypographyStyle(preferences: DisplayPreferences): Record<string, string> {
  const names: Record<string, string> = { yahei: 'Microsoft YaHei', simsun: 'SimSun', kaiti: 'KaiTi', fangsong: 'FangSong', notoSans: 'Noto Sans SC', notoSerif: 'Noto Serif SC', consolas: 'Consolas' }
  const name = preferences.documentFont === 'custom' ? preferences.documentCustomFont.trim() : names[preferences.documentFont]
  const family = name ? `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", var(--font-sans)` : ''
  return {
    '--document-font-size': `${preferences.documentFontSize}px`,
    '--document-line-height': String(preferences.documentLineHeight),
    '--document-letter-spacing': `${preferences.documentLetterSpacing}px`,
    '--document-paragraph-spacing': `${preferences.documentParagraphSpacing}em`,
    '--document-text-align': preferences.documentTextAlign,
    '--document-font-family': family,
    '--document-heading-family': family,
  }
}

// Match the existing surface styles and make component-library radius changes reactive.
export const VISUAL_STYLE_RADII: Record<VisualStyle, { normal: string; small: string }> = {
  soft: { normal: '12px', small: '8px' }, neo: { normal: '4px', small: '3px' },
  glass: { normal: '14px', small: '10px' }, airy: { normal: '10px', small: '7px' },
  minimal: { normal: '6px', small: '4px' }, sharp: { normal: '0px', small: '0px' },
}

