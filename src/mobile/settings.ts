/** Only implemented app preferences and settings destinations belong here. */
export const settingsPageLabels = { home: '设置', appearance: '外观', storage: '资料库', transfers: '导入与导出', about: '关于 Long编辑' } as const
export type SettingsPage = keyof typeof settingsPageLabels
export const themeOptions = [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }] as const
export type ThemePreference = typeof themeOptions[number]['id']
export const themePreferenceKey = 'longedit-mobile-theme-v1'
export function isThemePreference(value: unknown): value is ThemePreference { return themeOptions.some(option => option.id === value) }
