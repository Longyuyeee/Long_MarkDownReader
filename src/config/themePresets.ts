export type ResolvedThemeName = 'white' | 'green' | 'blue' | 'pink' | 'cream' | 'purple' | 'amber' | 'dark' | 'contrast'
export type ThemeName = ResolvedThemeName | 'system'
export type ThemeMode = 'light' | 'dark' | 'high-contrast'
export type VisualStyle = 'soft' | 'neo' | 'glass' | 'airy' | 'minimal' | 'sharp'
export type ThemeMotionSpeed = 'calm' | 'swift' | 'expressive' | 'reduced'
export type ThemePresetTier = 'core' | 'scenario' | 'legacy'

export interface ThemeTone {
  id: ThemeName
  label: string
  mode: ThemeMode | 'system'
  swatch: string
  editorBackground: string
  preview: { background: string; surface: string; accent: string }
  ui: { primary: string; background: string; surface: string; text: string }
  chartPalette: readonly string[]
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  theme: ResolvedThemeName
  style: VisualStyle
  mode: ThemeMode
  vditorTheme: 'light' | 'dark'
  vditorCodeTheme: string
  icon?: string
  keywords: readonly string[]
  tier: ThemePresetTier
  scenario: string
  motionSpeed: ThemeMotionSpeed
}

const tone = (
  id: ThemeName,
  label: string,
  mode: ThemeTone['mode'],
  swatch: string,
  editorBackground: string,
  background: string,
  surface: string,
  text: string,
  chartPalette: readonly string[],
): ThemeTone => ({
  id, label, mode, swatch, editorBackground,
  preview: { background, surface, accent: swatch },
  ui: { primary: swatch, background, surface, text },
  chartPalette,
})

/**
 * 主题色调的唯一注册表。设置页、Naive UI、编辑器背景、图谱/图表和导出逻辑
 * 都通过这里识别主题，不再维护各自的主题名称或颜色清单。
 */
export const themeTones = [
  tone('white', '专业浅色', 'light', '#2563eb', '#ffffff', '#f7f8fa', '#ffffff', '#171a1f', ['#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#be123c', '#475569']),
  tone('green', '护眼绿', 'light', '#1b8a5a', '#f0f9eb', '#f2f7f2', '#fbfdfb', '#17211c', ['#1b8a5a', '#2563eb', '#ca8a04', '#9333ea', '#dc2626', '#0f766e']),
  tone('blue', '清爽蓝', 'light', '#0b73d9', '#f0f7ff', '#f1f6fb', '#fbfdff', '#142033', ['#0b73d9', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a']),
  tone('pink', '玫瑰粉', 'light', '#cf3f72', '#fff5f7', '#fbf4f7', '#fffbfd', '#2a1820', ['#cf3f72', '#7c3aed', '#2563eb', '#0f766e', '#d97706', '#64748b']),
  tone('cream', '奶油纸', 'light', '#e67e4d', '#faf7f2', '#faf7f2', '#fffdfb', '#2d2416', ['#c2410c', '#a16207', '#0f766e', '#1d4ed8', '#7e22ce', '#be123c']),
  tone('purple', '紫梦幻', 'light', '#7c3aed', '#f6f4fb', '#f6f4fb', '#fdfcff', '#201833', ['#7c3aed', '#2563eb', '#db2777', '#0f766e', '#d97706', '#475569']),
  tone('amber', '琥珀', 'light', '#d97706', '#fef8f1', '#fef8f1', '#fffdfb', '#2d1f0a', ['#d97706', '#b45309', '#0f766e', '#2563eb', '#7c3aed', '#be123c']),
  tone('dark', '专业深色', 'dark', '#64d987', '#1c1c1e', '#111316', '#181b20', '#f4f6f8', ['#64d987', '#60a5fa', '#c084fc', '#fb7185', '#fbbf24', '#22d3ee']),
  tone('contrast', '高对比', 'high-contrast', '#ffd400', '#000000', '#000000', '#111111', '#ffffff', ['#ffd400', '#00e5ff', '#ff5cff', '#7cff00', '#ff7a00', '#ffffff']),
  tone('system', '跟随系统', 'system', '#707780', '#ffffff', '#e7e9ed', '#ffffff', '#171a1f', ['#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#be123c', '#475569']),
] as const satisfies readonly ThemeTone[]

export const themeToneById = Object.fromEntries(themeTones.map(item => [item.id, item])) as Record<ThemeName, ThemeTone>
export const THEME_EDITOR_BACKGROUNDS = Object.fromEntries(themeTones.map(item => [item.id, item.editorBackground])) as Record<ThemeName, string>

const preset = (
  id: string, name: string, description: string, theme: ResolvedThemeName, style: VisualStyle,
  vditorCodeTheme: string, icon: string, keywords: readonly string[],
  tier: ThemePresetTier = 'legacy', scenario = '更多外观组合', motionSpeed: ThemeMotionSpeed = 'calm',
): ThemePreset => ({
  id, name, description, theme, style,
  mode: themeToneById[theme].mode as ThemeMode,
  vditorTheme: themeToneById[theme].mode === 'light' ? 'light' : 'dark',
  vditorCodeTheme, icon, keywords, tier, scenario, motionSpeed,
})

export const themePresets = [
  preset('professional-light', '专业浅色', '高信息密度与清晰层级，适合管理和数据工作', 'white', 'minimal', 'github', '▦', ['professional', 'light', 'business', '专业', '浅色'], 'core', '管理与数据', 'swift'),
  preset('professional-dark', '专业深色', '低眩光深色工作面，适合夜间持续工作', 'dark', 'minimal', 'tokyo-night-dark', '◐', ['professional', 'dark', 'night', '专业', '深色'], 'core', '夜间办公', 'calm'),
  preset('high-contrast', '高对比', '强化文字、焦点和边界，满足高可辨识场景', 'contrast', 'sharp', 'github-dark', '◩', ['contrast', 'accessible', 'a11y', '高对比', '无障碍'], 'core', '无障碍与强辨识', 'reduced'),
  preset('cloud-paper', '云白纸张', '轻盈低干扰的长文阅读与审阅工作面', 'white', 'airy', 'github', '☁️', ['white', 'reading', 'paper', '长文', '阅读'], 'scenario', '长文阅读', 'reduced'),
  preset('tech-blue', '科技蓝霓虹', '未来感科技风，适合技术工作', 'blue', 'neo', 'atom-one-light', '⚡', ['blue', 'technology', 'code']),
  preset('forest-green', '森林绿柔和', '低饱和护眼色与柔和层级，适合资料研读', 'green', 'soft', 'github', '🌲', ['green', 'soft', 'reading', '护眼', '研读'], 'scenario', '护眼研读', 'calm'),
  preset('sakura-glass', '樱粉玻璃', '现代晶透，优雅柔和', 'pink', 'glass', 'github', '🌸', ['pink', 'glass']),
  preset('minimal-bw', '极简黑白', '纯粹专注，减少视觉干扰', 'white', 'minimal', 'github', '◻', ['minimal', 'white']),
  preset('dark-neon', '暗夜绿光', '深色代码工作面与清晰焦点，适合技术资料整理', 'dark', 'neo', 'native', '🌙', ['dark', 'neon', 'code', '编码', '技术'], 'scenario', '编码专注', 'swift'),
  preset('sharp-business', '锐利商务', '专业严谨的商务界面', 'white', 'sharp', 'github', '▣', ['business', 'sharp']),
  preset('cream-warmth', '奶油温暖', '温暖柔和的纸张质感', 'cream', 'soft', 'github', '🍂', ['cream', 'warm']),
  preset('purple-dream', '紫梦幻境', '强化节点、关系和灵感卡片的创意整理界面', 'purple', 'glass', 'github', '💜', ['purple', 'creative', 'graph', 'mindmap', '图谱', '思维导图'], 'scenario', '创意图谱', 'expressive'),
  preset('amber-vintage', '琥珀复古', '温暖复古，适合知识沉淀', 'amber', 'soft', 'github', '📜', ['amber', 'vintage']),
  preset('ocean-glass', '深海晶蓝', '清透蓝调，沉浸式整理思路', 'blue', 'glass', 'xcode', '🌊', ['blue', 'glass']),
  preset('midnight-glass', '午夜星河', '深色晶透，夜间写作更专注', 'dark', 'glass', 'tokyo-night-dark', '🌌', ['dark', 'glass']),
  preset('jade-airy', '青岚留白', '自然青绿，大留白轻阅读', 'green', 'airy', 'github', '🍃', ['green', 'airy']),
  preset('rose-soft', '玫瑰晨雾', '低饱和粉调，柔和不甜腻', 'pink', 'soft', 'github', '🌫️', ['pink', 'soft']),
  preset('cream-airy', '燕麦纸笺', '温润纸张感，适合长文创作', 'cream', 'airy', 'xcode', '📔', ['cream', 'airy']),
  preset('violet-neon', '霓虹紫电', '高辨识紫调，兼顾灵感与科技感', 'purple', 'neo', 'atom-one-light', '🔮', ['purple', 'neon']),
] as const satisfies readonly ThemePreset[]

export const professionalThemePresets = themePresets.filter(item => item.tier === 'core')
export const scenarioThemePresets = themePresets.filter(item => item.tier === 'scenario')
export const legacyThemePresets = themePresets.filter(item => item.tier === 'legacy')
export const releaseThemePresets = themePresets.filter(item => item.tier !== 'legacy')
export const themePresetGroups = [
  {
    id: 'release',
    label: '专业与场景预设',
    description: '经过契约门禁的核心预设与首批场景化方案',
    presets: releaseThemePresets,
  },
  {
    id: 'legacy',
    label: '更多外观组合',
    description: '保留已有组合与配置兼容，可继续按偏好使用',
    presets: legacyThemePresets,
  },
] as const

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in themeToneById
}

export function normalizeThemeName(value: unknown): ThemeName {
  return isThemeName(value) ? value : 'system'
}

export function resolveThemeName(theme: ThemeName, systemDark = false): ResolvedThemeName {
  return theme === 'system' ? (systemDark ? 'dark' : 'white') : theme
}

export function isDarkTheme(theme: ThemeName, systemDark = false): boolean {
  return themeToneById[resolveThemeName(theme, systemDark)].mode !== 'light'
}

export function isActiveThemeDark(theme: ThemeName): boolean {
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  return isDarkTheme(theme, systemDark)
}

export function getActiveThemeTone(theme: ThemeName): ThemeTone {
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  return getThemeTone(theme, systemDark)
}

export function getThemeTone(theme: ThemeName, systemDark = false): ThemeTone {
  return themeToneById[resolveThemeName(theme, systemDark)]
}

export function getThemePreset(presetId: string): ThemePreset | undefined {
  return themePresets.find(item => item.id === presetId)
}

export function findPresetByThemeStyle(theme: string, style: string): ThemePreset | undefined {
  return themePresets.find(item => item.theme === theme && item.style === style)
}

export function getVditorConfigForPreset(presetId: string) {
  const selected = getThemePreset(presetId)
  return selected ? { theme: selected.vditorTheme, codeTheme: selected.vditorCodeTheme } : null
}

const relativeLuminance = (hex: string): number => {
  const channels = hex.match(/[0-9a-f]{2}/gi)
  if (!channels || channels.length !== 3) return 0
  const [red, green, blue] = channels.map(channel => {
    const value = Number.parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastRatio = (foreground: string, background: string): number => {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

export function validateThemeRegistry(): void {
  const toneIds = new Set(themeTones.map(item => item.id))
  const presetIds = new Set(themePresets.map(item => item.id))
  if (toneIds.size !== themeTones.length || presetIds.size !== themePresets.length) throw new Error('Theme registry contains duplicate ids')
  for (const item of themePresets) {
    if (!toneIds.has(item.theme)) throw new Error(`Theme preset ${item.id} references an unknown tone`)
    if (item.keywords.length === 0 || item.vditorCodeTheme.length === 0 || item.scenario.length === 0) throw new Error(`Theme preset ${item.id} is incomplete`)
  }
  if (professionalThemePresets.length !== 3 || scenarioThemePresets.length !== 4) throw new Error('Theme release tiers are incomplete')
  for (const item of releaseThemePresets) {
    const colors = themeToneById[item.theme].ui
    if (contrastRatio(colors.text, colors.background) < 4.5 || contrastRatio(colors.text, colors.surface) < 4.5) {
      throw new Error(`Theme preset ${item.id} fails the WCAG AA text contrast baseline`)
    }
  }
}

validateThemeRegistry()
