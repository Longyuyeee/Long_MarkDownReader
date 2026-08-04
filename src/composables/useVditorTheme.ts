import { watch } from 'vue'
import { useAppStore } from '../store/app'
import { resolveMarkdownEditorAppearance } from '../config/markdownCodeTheme'

export function useVditorTheme(getVditor: () => any) {
  const store = useAppStore()

  watch(() => store.theme, (newTheme) => {
    const vditor = getVditor()
    if (!vditor) return
    const appearance = resolveMarkdownEditorAppearance(newTheme, store.codeTheme)
    vditor.setTheme(appearance.editorTheme, appearance.contentTheme, appearance.codeTheme)
  })

  watch(() => store.codeTheme, (newCodeTheme) => {
    const vditor = getVditor()
    if (!vditor) return
    const appearance = resolveMarkdownEditorAppearance(store.theme, newCodeTheme)
    vditor.setTheme(appearance.editorTheme, appearance.contentTheme, appearance.codeTheme)
  })
}
