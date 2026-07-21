import { watch } from 'vue'
import { useAppStore } from '../store/app'
import { isActiveThemeDark } from '../config/themePresets'

export function useVditorTheme(getVditor: () => any) {
  const store = useAppStore()

  watch(() => store.theme, (newTheme) => {
    const vditor = getVditor()
    if (!vditor) return
    const isDark = isActiveThemeDark(newTheme)
    vditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', store.codeTheme || 'github')
  })

  watch(() => store.codeTheme, (newCodeTheme) => {
    const vditor = getVditor()
    if (!vditor) return
    const isDark = isActiveThemeDark(store.theme)
    vditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', newCodeTheme || 'github')
  })
}
