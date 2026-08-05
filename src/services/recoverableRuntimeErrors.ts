const recoverableResizeObserverMessages = new Set([
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications.',
])

export const isRecoverableLayoutError = (value: unknown) => {
  const message = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : ''
  return recoverableResizeObserverMessages.has(message.trim())
}

export const installRecoverableLayoutErrorBoundary = (target: Window = window) => {
  const handleError = (event: ErrorEvent) => {
    if (!isRecoverableLayoutError(event.message) && !isRecoverableLayoutError(event.error)) return
    event.preventDefault()
    console.debug('[LongEdit] Recovered a transient ResizeObserver layout notification.')
  }

  target.addEventListener('error', handleError, true)
  return () => target.removeEventListener('error', handleError, true)
}
