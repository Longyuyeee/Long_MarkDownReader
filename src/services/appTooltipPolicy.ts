const nativeTooltipOptOutSelector = '[data-native-tooltip="allow"]'
const tooltipSelector = '[data-app-tooltip]'
const interactiveSelector = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [tabindex]'
const hostId = 'longedit-app-tooltip'
const popupSelector = '.n-dropdown-menu, .n-base-select-menu, .n-popover:not(.n-tooltip), .vditor-toolbar .vditor-hint, .vditor-toolbar .vditor-panel'

const tooltipText = (element: Element) => element.getAttribute('data-app-tooltip')?.trim() || ''

const adoptNativeTitle = (element: Element) => {
  if (element.matches(nativeTooltipOptOutSelector)) return
  const title = element.getAttribute('title')?.trim()
  if (!title) return
  element.removeAttribute('title')
  element.setAttribute('data-app-tooltip', title)
  element.setAttribute('data-app-tooltip-managed', 'true')
  if (element.matches(interactiveSelector) && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
    element.setAttribute('aria-label', title)
    element.setAttribute('data-app-tooltip-generated-label', 'true')
  } else if (element.getAttribute('data-app-tooltip-generated-label') === 'true') {
    element.setAttribute('aria-label', title)
  }
}

const adoptTitlesInside = (root: Node) => {
  if (!(root instanceof Element)) return
  if (root.hasAttribute('title')) adoptNativeTitle(root)
  root.querySelectorAll('[title]').forEach(adoptNativeTitle)
}

const tooltipTarget = (target: EventTarget | null) => target instanceof Element
  ? target.closest<HTMLElement>(tooltipSelector)
  : null

/**
 * Replaces Chromium's unstyleable title bubbles with one theme-aware desktop
 * tooltip surface. Existing title attributes remain the authoring contract;
 * this policy adopts static and dynamically updated titles at runtime.
 */
export const installAppTooltipPolicy = () => {
  const host = document.createElement('div')
  host.id = hostId
  host.className = 'app-tooltip-surface'
  host.setAttribute('role', 'tooltip')
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)

  let activeTarget: HTMLElement | null = null
  let activeDescribedBy: string | null = null
  let showTimer = 0
  let popupOpen = false
  const popupRoots = new Set<Element>()
  const previousPopupState = document.body.getAttribute('data-app-popup-open')

  const cancelShow = () => {
    if (!showTimer) return
    window.clearTimeout(showTimer)
    showTimer = 0
  }

  const hide = () => {
    cancelShow()
    host.dataset.visible = 'false'
    host.setAttribute('aria-hidden', 'true')
    if (activeTarget) {
      if (activeDescribedBy === null) activeTarget.removeAttribute('aria-describedby')
      else activeTarget.setAttribute('aria-describedby', activeDescribedBy)
    }
    activeTarget = null
    activeDescribedBy = null
  }

  const dismiss = () => {
    hide()
  }

  const refreshPopupState = () => {
    popupOpen = [...popupRoots].some(element => element.isConnected
      && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    if (document.body.dataset.appPopupOpen !== String(popupOpen)) document.body.dataset.appPopupOpen = String(popupOpen)
    if (popupOpen) dismiss()
  }
  // Observe popup surfaces only. Editor changes and pointer movement do not
  // cause a document-wide class/style scan.
  const popupObserver = new MutationObserver(refreshPopupState)
  const observePopup = (element: Element) => {
    popupObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] })
    const follower = element.closest('.v-binder-follower-container')
    if (follower) popupObserver.observe(follower, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  const collectPopups = (root: Node) => {
    if (!(root instanceof Element)) return false
    const elements = [...root.querySelectorAll(popupSelector)]
    if (root.matches(popupSelector)) elements.push(root)
    for (const element of elements) {
      if (popupRoots.has(element)) continue
      popupRoots.add(element)
      observePopup(element)
    }
    return elements.length > 0
  }

  const position = (target: HTMLElement) => {
    const targetRect = target.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    const margin = 8
    const gap = 8
    const left = Math.min(
      window.innerWidth - hostRect.width - margin,
      Math.max(margin, targetRect.left + (targetRect.width - hostRect.width) / 2),
    )
    const below = targetRect.bottom + gap
    const top = below + hostRect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, targetRect.top - hostRect.height - gap)
    host.style.left = `${Math.round(left)}px`
    host.style.top = `${Math.round(top)}px`
  }

  const show = (target: HTMLElement) => {
    const text = tooltipText(target)
    if (!text || !target.isConnected || popupOpen) return
    if (activeTarget && activeTarget !== target) hide()
    activeTarget = target
    activeDescribedBy = target.getAttribute('aria-describedby')
    host.textContent = text
    host.dataset.visible = 'true'
    host.setAttribute('aria-hidden', 'false')
    const describedBy = activeDescribedBy?.split(/\s+/).filter(Boolean) || []
    if (!describedBy.includes(hostId)) target.setAttribute('aria-describedby', [...describedBy, hostId].join(' '))
    position(target)
  }

  const scheduleShow = (target: HTMLElement, delay: number) => {
    if (popupOpen) return
    if (activeTarget === target && host.dataset.visible === 'true') return
    cancelShow()
    showTimer = window.setTimeout(() => {
      showTimer = 0
      show(target)
    }, delay)
  }

  const handlePointerOver = (event: PointerEvent) => {
    const target = tooltipTarget(event.target)
    if (target) scheduleShow(target, 420)
  }
  const handlePointerOut = (event: PointerEvent) => {
    const target = tooltipTarget(event.target)
    if (!target || target.contains(event.relatedTarget as Node | null)) return
    hide()
  }
  const handleFocusIn = (event: FocusEvent) => {
    const target = tooltipTarget(event.target)
    if (target) scheduleShow(target, 80)
  }
  const handleFocusOut = (event: FocusEvent) => {
    const target = tooltipTarget(event.target)
    if (!target || target.contains(event.relatedTarget as Node | null)) return
    hide()
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4', 'F10'].includes(event.key)) dismiss()
  }

  adoptTitlesInside(document.documentElement)
  collectPopups(document.documentElement)
  refreshPopupState()
  const observer = new MutationObserver(records => {
    let popupStructureChanged = false
    for (const record of records) {
      if (record.type === 'attributes') adoptNativeTitle(record.target as Element)
      record.addedNodes.forEach(node => {
        adoptTitlesInside(node)
        if (collectPopups(node)) popupStructureChanged = true
      })
      record.removedNodes.forEach(node => {
        if (node instanceof Element && [...popupRoots].some(element => node.contains(element))) popupStructureChanged = true
      })
    }
    if (popupStructureChanged) {
      popupObserver.disconnect()
      for (const element of popupRoots) {
        if (element.isConnected) observePopup(element)
        else popupRoots.delete(element)
      }
      refreshPopupState()
    }
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['title'], childList: true, subtree: true })
  document.addEventListener('pointerover', handlePointerOver, true)
  document.addEventListener('pointerout', handlePointerOut, true)
  document.addEventListener('focusin', handleFocusIn, true)
  document.addEventListener('focusout', handleFocusOut, true)
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('pointerdown', dismiss, true)
  document.addEventListener('click', dismiss, true)
  document.addEventListener('contextmenu', dismiss, true)
  document.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)

  return () => {
    hide()
    observer.disconnect()
    popupObserver.disconnect()
    if (previousPopupState === null) delete document.body.dataset.appPopupOpen
    else document.body.setAttribute('data-app-popup-open', previousPopupState)
    document.removeEventListener('pointerover', handlePointerOver, true)
    document.removeEventListener('pointerout', handlePointerOut, true)
    document.removeEventListener('focusin', handleFocusIn, true)
    document.removeEventListener('focusout', handleFocusOut, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('pointerdown', dismiss, true)
    document.removeEventListener('click', dismiss, true)
    document.removeEventListener('contextmenu', dismiss, true)
    document.removeEventListener('scroll', hide, true)
    window.removeEventListener('resize', hide)
    host.remove()
  }
}
