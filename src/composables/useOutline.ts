import { ref, computed } from 'vue'
import type { TreeOption } from 'naive-ui'

export interface OutlineItem { id: string; text: string; level: number }

export function useOutline(getVditor: () => any) {
  const outlineItems = ref<OutlineItem[]>([])
  let outlineObserver: MutationObserver | null = null

  const outlineTreeData = computed(() => {
    const result: TreeOption[] = []
    const stack: { level: number; children: TreeOption[] }[] = [{ level: 0, children: result }]
    outlineItems.value.forEach(item => {
      const node: TreeOption = { label: item.text, key: item.id, level: item.level, children: [] }
      while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop()
      stack[stack.length - 1].children.push(node)
      stack.push({ level: item.level, children: node.children as TreeOption[] })
    })
    const clean = (nodes: TreeOption[]) => {
      nodes.forEach(n => { if (n.children && n.children.length === 0) delete n.children; else if (n.children) clean(n.children) })
    }
    clean(result); return result
  })

  const syncOutlineManual = () => {
    const vditor = getVditor()
    if (!vditor) return
    const contentEl = vditor.vditor?.wysiwyg?.element
    if (!contentEl) return
    const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const newItems: OutlineItem[] = []
    headings.forEach((h: HTMLElement, index: number) => {
      if (!h.id) h.id = `heading-${index}`
      const id = h.getAttribute('data-id') || h.id
      newItems.push({ id: id, text: h.innerText.trim() || '未命名标题', level: parseInt(h.tagName.substring(1)) })
    })
    outlineItems.value = newItems
  }

  const scrollToHeading = (id: string) => {
    const vditor = getVditor()
    if (!vditor) return
    const wysiwygEl = vditor.vditor?.wysiwyg?.element
    const targetEl = wysiwygEl?.querySelector(`[data-id="${id}"]`) || wysiwygEl?.querySelector(`#${id}`)
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else {
      // 兼容 IR/SV 模式
      const previewEl = vditor.vditor?.ir?.element || vditor.vditor?.preview?.element
      const node = previewEl?.querySelector(`[data-id="${id}"]`) || previewEl?.querySelector(`#${id}`)
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const setupOutlineObserver = (extraCallback?: () => void) => {
    const vditor = getVditor()
    if (!vditor) return
    const contentEl = vditor.vditor?.wysiwyg?.element
    if (!contentEl) return
    outlineObserver = new MutationObserver(() => {
      syncOutlineManual()
      if (extraCallback) extraCallback()
    })
    outlineObserver.observe(contentEl, { childList: true, subtree: true, characterData: true })
  }

  const destroyOutlineObserver = () => {
    if (outlineObserver) { outlineObserver.disconnect(); outlineObserver = null }
  }

  return {
    outlineItems,
    outlineTreeData,
    syncOutlineManual,
    scrollToHeading,
    setupOutlineObserver,
    destroyOutlineObserver
  }
}
