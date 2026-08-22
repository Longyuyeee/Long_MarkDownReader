const explicitNativeMenuSelector = '[data-native-context-menu="allow"]'
const explicitSuppressionSelector = '[data-native-context-menu="suppress"]'
const editableSurfaceSelector = '[contenteditable="true"], [contenteditable="plaintext-only"], .cm-content, .vditor-ir, .vditor-wysiwyg, .vditor-sv'
const textInputTypes = new Set([
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

const isEnabledTextControl = (element: Element) => {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (!(element instanceof HTMLInputElement)) return false
  return !element.disabled && !element.readOnly && textInputTypes.has(element.type.toLocaleLowerCase())
}

export const allowsNativeTextContextMenu = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  if (target.closest(explicitSuppressionSelector)) return false
  if (target.closest(explicitNativeMenuSelector)) return true
  if (isEnabledTextControl(target)) return true
  const editableSurface = target.closest(editableSurfaceSelector)
  return editableSurface ? !editableSurface.closest('[aria-disabled="true"]') : false
}

/**
 * Prevents Chromium/WebView menus from leaking into ordinary desktop surfaces.
 * Purpose-built Vue context menus still receive the event and open normally.
 * Native text operations remain available only on real editable controls.
 */
export const installContextMenuPolicy = () => {
  const handleContextMenu = (event: MouseEvent) => {
    if (allowsNativeTextContextMenu(event.target)) return
    event.preventDefault()
  }

  document.addEventListener('contextmenu', handleContextMenu, { capture: true })
  return () => document.removeEventListener('contextmenu', handleContextMenu, { capture: true })
}
