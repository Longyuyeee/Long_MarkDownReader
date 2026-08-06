const HORIZONTAL_INTENT_SELECTOR = [
  '[data-horizontal-wheel="always"]',
  '[data-horizontal-wheel="headers"]',
  '[role="tablist"]',
  '[role="toolbar"]',
  'nav',
  'th',
  '[role="columnheader"]',
  '.table-header',
  '.sheet-header',
  '.column-header',
].join(',')

const NATIVE_WHEEL_CONTROL_SELECTOR = 'textarea, select, input[type="number"], input[type="range"]'

const wheelPixels = (event: WheelEvent) => {
  const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 28
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? Math.max(240, window.innerWidth * 0.8)
      : 1
  return event.deltaY * scale
}

const canMove = (element: HTMLElement, delta: number) => delta < 0
  ? element.scrollLeft > 1
  : element.scrollLeft + element.clientWidth < element.scrollWidth - 1

const isHorizontalScroller = (element: HTMLElement) => {
  if (element.scrollWidth <= element.clientWidth + 2) return false
  const overflowX = getComputedStyle(element).overflowX
  return overflowX === 'auto' || overflowX === 'scroll' || element.dataset.horizontalWheel !== undefined
}

const hasHorizontalIntent = (path: EventTarget[], scrollerIndex: number) => path
  .slice(0, scrollerIndex + 1)
  .some(target => target instanceof Element && target.matches(HORIZONTAL_INTENT_SELECTOR))

const findHorizontalScroller = (event: WheelEvent, delta: number) => {
  const path = event.composedPath()
  for (let index = 0; index < path.length; index += 1) {
    const target = path[index]
    if (!(target instanceof HTMLElement) || !isHorizontalScroller(target) || !canMove(target, delta)) continue
    if (target.dataset.horizontalWheel === 'off') continue

    const style = getComputedStyle(target)
    const onlyHorizontal = target.scrollHeight <= target.clientHeight + 2
      || style.overflowY === 'hidden'
      || style.overflowY === 'clip'
      || style.overflowY === 'visible'
    if (target.dataset.horizontalWheel === 'always' || onlyHorizontal || hasHorizontalIntent(path, index)) return target
  }
  return null
}

export const installHorizontalWheelNavigation = () => {
  const handleWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY) return
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    const origin = event.target
    if (origin instanceof Element && origin.closest(NATIVE_WHEEL_CONTROL_SELECTOR)) return

    const delta = wheelPixels(event)
    const scroller = findHorizontalScroller(event, delta)
    if (!scroller) return
    event.preventDefault()
    scroller.scrollBy({ left: delta, behavior: 'auto' })
  }

  document.addEventListener('wheel', handleWheel, { passive: false })
  return () => document.removeEventListener('wheel', handleWheel)
}
