import { onBeforeUnmount, onMounted, ref } from 'vue'

export const useResponsiveInspector = (breakpoint = 760) => {
  const visible = ref(true)
  let compact: boolean | undefined

  const syncViewport = () => {
    const nextCompact = window.innerWidth <= breakpoint
    if (nextCompact !== compact) {
      compact = nextCompact
      visible.value = !nextCompact
    }
  }

  const toggle = () => {
    visible.value = !visible.value
  }

  onMounted(() => {
    syncViewport()
    window.addEventListener('resize', syncViewport)
  })
  onBeforeUnmount(() => window.removeEventListener('resize', syncViewport))

  return { inspectorVisible: visible, toggleInspector: toggle }
}
