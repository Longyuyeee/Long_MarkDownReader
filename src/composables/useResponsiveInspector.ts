import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

export const useResponsiveInspector = (breakpoint = 760) => {
  const visible = ref(true)
  const instance = getCurrentInstance()
  let container: HTMLElement | undefined
  let observer: ResizeObserver | undefined
  let compact: boolean | undefined

  const syncViewport = () => {
    const width = container ? container.clientWidth : window.innerWidth
    if (!width) return
    const nextCompact = width <= breakpoint
    if (nextCompact !== compact) {
      compact = nextCompact
      visible.value = !nextCompact
    }
  }

  const toggle = () => {
    visible.value = !visible.value
  }

  onMounted(() => {
    if (instance?.vnode.el instanceof HTMLElement) {
      container = instance.vnode.el
      observer = new ResizeObserver(syncViewport)
      observer.observe(container)
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
  })
  onBeforeUnmount(() => { observer?.disconnect(); window.removeEventListener('resize', syncViewport) })

  return { inspectorVisible: visible, toggleInspector: toggle }
}
