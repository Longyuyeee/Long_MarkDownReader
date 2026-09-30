import { onUnmounted } from 'vue'
import { createMarkdownFrameMonitor } from '../utils/markdownMotion'

export function useAdaptiveMarkdownMotion(getVditor: () => any) {
  let stop = () => {}
  const startAdaptiveMotion = () => {
    stop()
    const root = getVditor()?.vditor?.element as HTMLElement | undefined
    if (!root) return
    let request = 0, intersecting = false, degraded = false
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const reduced = preference.matches || degraded
      root.classList.toggle('markdown-motion-reduced', reduced)
      root.dataset.markdownMotion = reduced ? 'reduced' : 'full'
      root.dataset.markdownMotionReason = preference.matches ? 'preference' : degraded ? 'sustained-slow-frames' : 'normal'
    }
    const monitor = createMarkdownFrameMonitor(() => { degraded = true; apply() })
    const tick = (now: number) => {
      request = 0
      if (!document.hidden && document.hasFocus() && intersecting && !preference.matches && !degraded) {
        monitor.frame(now)
        if (!degraded) request = requestAnimationFrame(tick)
      }
    }
    const resume = () => {
      cancelAnimationFrame(request)
      request = 0
      monitor.reset(performance.now())
      apply()
      if (!document.hidden && document.hasFocus() && intersecting && !preference.matches && !degraded) request = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting)
      if (intersecting !== visible) { intersecting = visible; resume() }
    })
    observer.observe(root)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('blur', resume)
    preference.addEventListener('change', resume)
    resume()
    stop = () => {
      cancelAnimationFrame(request)
      observer.disconnect()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('blur', resume)
      preference.removeEventListener('change', resume)
      root.classList.remove('markdown-motion-reduced')
      delete root.dataset.markdownMotion
      delete root.dataset.markdownMotionReason
    }
  }
  onUnmounted(() => stop())
  return { startAdaptiveMotion }
}
