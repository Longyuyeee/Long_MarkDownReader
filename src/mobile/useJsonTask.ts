import { onBeforeUnmount, ref, watch } from 'vue'
import { JSON_SOURCE_BUDGET } from './jsonSource'
import type { JsonOperation } from './jsonOperations'
import type { JsonValuePatch } from './jsonStructure'
import type { JsonFieldMatches } from './jsonSearch'
export function useJsonTask(snapshot: () => { content: string; identity: string }) {
  const busy = ref(false), error = ref('')
  let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0
  function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined; busy.value = false }
  function run(request: { query?: string; id?: number; operation?: JsonOperation }, done: (value: { patch?: JsonValuePatch; matches?: JsonFieldMatches }) => void) {
    stop(); error.value = ''; const before = snapshot(), owner = generation
    if (before.content.length > JSON_SOURCE_BUDGET.characters) { error.value = '这份 JSON 较大，请使用源码操作。'; return }
    busy.value = true
    try {
      worker = new Worker(new URL('./jsonTask.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = event => {
        const now = snapshot()
        if (owner !== generation || now.content !== before.content || now.identity !== before.identity) return
        stop(); if (event.data.error) error.value = event.data.error; else done(event.data)
      }
      worker.onerror = event => { event.preventDefault(); if (owner === generation) { stop(); error.value = '暂时无法完成，请重试或使用源码。' } }
      timer = setTimeout(() => { if (owner === generation) { stop(); error.value = '处理时间较长，已停止；正文和草稿继续保留。' } }, JSON_SOURCE_BUDGET.milliseconds)
      worker.postMessage({ content: before.content, ...request })
    } catch { stop(); error.value = '暂时无法完成，请重试或使用源码。' }
  }
  watch(() => [snapshot().content, snapshot().identity], () => { stop(); error.value = '' }, { flush: 'sync' })
  onBeforeUnmount(stop)
  return { busy, error, run, stop }
}
