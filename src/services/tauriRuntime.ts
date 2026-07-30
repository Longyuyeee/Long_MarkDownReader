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

export const listen = async <T>(
  eventName: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> => {
  if (!isTauriRuntime()) return () => undefined
  return tauriListen<T>(eventName, handler)
}
