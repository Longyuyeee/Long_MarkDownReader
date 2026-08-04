import { getActiveThemeTone, type ThemeName } from './themePresets'

const LIGHT_CODE_THEMES = ['github', 'atom-one-light', 'xcode'] as const
const DARK_CODE_THEMES = ['atom-one-dark', 'github-dark', 'dracula', 'tokyo-night-dark', 'monokai', 'native'] as const
const CONTRAST_CODE_THEMES = ['a11y-dark', 'github-dark'] as const

export interface MarkdownEditorAppearance {
  editorTheme: 'classic' | 'dark'
  contentTheme: 'light' | 'dark'
  codeTheme: string
}

export function markdownCodeThemeChoices(theme: ThemeName): readonly string[] {
  const mode = getActiveThemeTone(theme).mode
  if (mode === 'high-contrast') return CONTRAST_CODE_THEMES
  return mode === 'dark' ? DARK_CODE_THEMES : LIGHT_CODE_THEMES
}

export function resolveMarkdownEditorAppearance(theme: ThemeName, preferredCodeTheme: string): MarkdownEditorAppearance {
  const mode = getActiveThemeTone(theme).mode
  const choices = markdownCodeThemeChoices(theme)
  const codeTheme = choices.some(choice => choice === preferredCodeTheme) ? preferredCodeTheme : choices[0]
  const dark = mode !== 'light'
  return {
    editorTheme: dark ? 'dark' : 'classic',
    contentTheme: dark ? 'dark' : 'light',
    codeTheme,
  }
}
