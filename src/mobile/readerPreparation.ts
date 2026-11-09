import { READING_BUDGET, sourceReadingReason } from './documentBudget'
import {sourceFileInfo} from './codeFormats'

/** Terminating the worker also interrupts pathological parser input. */
export async function prepareReading(content: string, path: string, signal: AbortSignal): Promise<{ html?: string; reason?: string } | null> {
  if (signal.aborted) return null
  const reason = sourceReadingReason(content)
  if (reason) return { reason }
  return new Promise(resolve => {
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, done = false
    const finish = (value: { html?: string; reason?: string } | null) => {
      if (done) return
      done = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); worker?.terminate(); resolve(value)
    }
    const cancel = () => finish(null)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      worker = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = event => finish(event.data)
      worker.onerror = event => { event.preventDefault(); finish({ reason: '暂时无法完成排版' }) }
      timer = setTimeout(() => finish({ reason: '排版准备时间较长' }), READING_BUDGET.preparationMs)
      worker.postMessage({ content, markdown: /\.md$/i.test(path),code:sourceFileInfo(path)?.language })
    } catch { finish({ reason: '暂时无法完成排版' }) }
  })
}
