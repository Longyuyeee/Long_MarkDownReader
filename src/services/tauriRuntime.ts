import { invoke as tauriInvoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core'
import { listen as tauriListen, type Event, type UnlistenFn } from '@tauri-apps/api/event'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export class TauriRuntimeUnavailableError extends Error {
  readonly code = 'tauri-runtime-unavailable'

  constructor(operation: string) {
    super(`Tauri runtime is unavailable for operation: ${operation}`)
    this.name = 'TauriRuntimeUnavailableError'
  }
}

export class OperationTimeoutError extends Error {
  readonly code = 'operation-timeout'

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = 'OperationTimeoutError'
  }
}

export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs)
    promise.then(
      value => { window.clearTimeout(timer); resolve(value) },
      cause => { window.clearTimeout(timer); reject(cause) },
    )
  })

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

export const invoke = <T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> => {
  if (!isTauriRuntime()) {
    return Promise.reject(new TauriRuntimeUnavailableError(`invoke:${command}`))
  }
  return tauriInvoke<T>(command, args, options)
}

export const invokeWithTimeout = <T>(
  command: string,
  args?: InvokeArgs,
  timeoutMs = 5000,
): Promise<T> => withTimeout(invoke<T>(command, args), timeoutMs, `invoke:${command}`)

export const listen = async <T>(
  eventName: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> => {
  if (!isTauriRuntime()) return () => undefined
  return tauriListen<T>(eventName, handler)
}
