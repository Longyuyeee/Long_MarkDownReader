import { canFocus } from './accessibility'

/** Transient task UI only: never serialize elements, filenames or pending dialogs. */
export interface TaskPosition {
  focus: HTMLElement | null
  scroller: HTMLElement | null
  top: number
}

export function captureTaskPosition(scrollerOverride?: HTMLElement): TaskPosition {
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const scroller = scrollerOverride || focus?.closest<HTMLElement>('.task-scroll, .pdf-intake-body, .bottom-sheet') || null
  return { focus, scroller, top: scroller?.scrollTop || 0 }
}

export function restoreTaskPosition(position: TaskPosition | null) {
  if (!position) return
  if (position.scroller?.isConnected) position.scroller.scrollTop = position.top
  if (canFocus(position.focus)) position.focus.focus({ preventScroll: true })
}

export function restoreTaskRecord(position: TaskPosition | null, attribute: string, id: string | undefined) {
  const focus = [...document.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(element => element.getAttribute(attribute) === id)
  restoreTaskPosition(position ? { ...position, focus: focus || position.focus } : null)
}
