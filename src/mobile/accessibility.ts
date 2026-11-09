/** Only visible, enabled controls can receive modal focus or restore a task. */
export function canFocus(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element?.isConnected && !element.closest('[inert],[hidden]') && !element.matches(':disabled') &&
    getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0
}

export function focusableControls(container: HTMLElement | undefined): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]') || [])]
    .filter(element => element.tabIndex >= 0 && canFocus(element))
}

export function focusPageHeading() {
  const heading = document.querySelector<HTMLElement>('.mobile-workspace h1')
  if (canFocus(heading)) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
}
