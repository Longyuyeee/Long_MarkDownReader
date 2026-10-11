<template>
  <n-modal :show="show" :mask-closable="!busy" @update:show="value => { if (!value && !busy) emit('close') }">
    <section class="archive-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title" :aria-busy="busy">
      <h2 id="archive-title">{{ report ? '归档预检结果' : '归档到…' }}</h2>
      <p>文件仅在当前资料库内移动；同名不覆盖，不自动保存未保存的修改。</p>
      <label>目标目录<input v-model="target" :disabled="busy" placeholder="当前资料库内的目录" /></label>
      <div v-for="(item, index) in items" :key="item.sourcePath" class="archive-item">
        <small :title="item.sourcePath">{{ item.sourcePath }}</small>
        <label>目标文件名<input v-model="item.targetName" :disabled="busy" /></label>
        <div v-if="report" class="item-status"><strong>未执行</strong><p>{{ itemMessage(index) }}</p></div>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div v-if="report" role="status">
        <p>尚未移动任何文件。预检结果不代表归档完成。</p>
        <p v-if="report.windowConfirmationError">窗口核对未完成：{{ reasonLabel(report.windowConfirmationError) }}</p>
        <p v-if="windowStatus">{{ windowStatus }}</p>
        <details><summary>查看检查详情</summary><ul><li v-for="reason in report.pendingChecks" :key="reason">{{ reasonLabel(reason) }}</li></ul><small v-if="report.windowConfirmationError">诊断信息：{{ report.windowConfirmationError }}</small></details>
      </div>
      <footer>
        <button :disabled="busy" @click="emit('close')">关闭</button>
        <button v-if="report?.windowConfirmationRequestId" :disabled="busy" @click="checkWindows">核对窗口状态</button>
        <button class="primary" :disabled="busy || !target.trim() || !items.length" @click="preflight">{{ busy ? '正在检查…' : report ? '重新预检' : '检查归档条件' }}</button>
      </footer>
    </section>
  </n-modal>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { useAppStore } from '../store/app'
interface Report { items: { sourcePath: string; targetPath?: string; issues: { code: string; message: string }[]; dependencies?: { complete: boolean; limitations: string[] } }[]; canExecute: boolean; pendingChecks: string[]; windowConfirmationRequestId?: string; windowConfirmationError?: string }
const props = defineProps<{ show: boolean; libraryRoot: string; paths: string[] }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const target = ref(''), items = ref<{ sourcePath: string; targetName: string }[]>([])
const busy = ref(false), error = ref(''), report = ref<Report | null>(null), windowStatus = ref('')
let generation = 0
const reasonLabel = (code: string) => ({ window_state_not_clean: '有窗口尚未就绪、正在保存或有未保存修改，请先处理后重新预检', confirmation_already_pending: '另一轮窗口核对尚未结束，请稍后重新预检', confirmation_expired: '窗口确认已过期，请重新预检', confirmation_invalidated: '窗口状态已变化，请重新预检', links_and_attachments: '链接与附件一致性尚待确认', history_and_identity: '历史记录与文件身份尚待确认', execution_time_revalidation: '执行前仍需重新核对文件与目标' }[code] || '检查未完成，请展开详情查看原因')
watch([() => props.show, () => props.libraryRoot, () => props.paths], () => {
  generation++; busy.value = false; error.value = ''; report.value = null; windowStatus.value = ''
  target.value = props.libraryRoot
  items.value = props.paths.map(sourcePath => ({ sourcePath, targetName: sourcePath.split(/[\\/]/).pop() || '' }))
}, { immediate: true })
watch([target, items], () => { report.value = null; windowStatus.value = ''; generation++ }, { deep: true })
const itemMessage = (index: number) => {
  const item = report.value?.items[index]
  return item?.issues.length ? item.issues.map(issue => issue.message).join('；') : item?.dependencies && !item.dependencies.complete ? '关联引用检查尚未完整，不能执行移动' : '路径检查结束；执行与恢复安全检查仍未完成'
}
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const preflight = async () => {
  if (busy.value) return
  const request = ++generation, root = props.libraryRoot
  busy.value = true; error.value = ''; report.value = null
  try {
    const result = await invoke<Report>('preflight_archive', {
      libraryRoot: root, targetDir: target.value.trim(),
      items: items.value.map(item => ({ ...item, hasUnsavedChanges: store.tabs.some(tab => samePath(tab.path, item.sourcePath) && tab.isDirty) })),
    })
    if (request === generation && props.show && root === props.libraryRoot) report.value = result
  } catch (cause) { if (request === generation) error.value = `预检失败，文件未移动：${String(cause)}` }
  finally { if (request === generation) busy.value = false }
}
const checkWindows = async () => {
  const id = report.value?.windowConfirmationRequestId
  if (!id || busy.value) return
  const request = generation
  busy.value = true
  try {
    const status = await invoke<{ ready: boolean; canExecute: boolean }>('archive_window_confirmation_status', { requestId: id })
    if (request === generation) windowStatus.value = status.ready ? '各窗口已回复；执行安全条件仍待核验，不会移动文件' : '仍有窗口未回复，请稍后核对或重新预检'
  } catch (cause) { if (request === generation) windowStatus.value = `窗口确认失效，请重新预检：${String(cause)}` }
  finally { if (request === generation) busy.value = false }
}
</script>
<style scoped>
.archive-dialog { box-sizing: border-box; width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 24px; border-radius: 10px; background: var(--theme-bg, #fff); color: var(--theme-text, #222); border: 1px solid var(--workspace-border-color, #8885); }
h2 { margin: 0 0 12px; font-size: 20px; } p, small { font-size: 13px; overflow-wrap: anywhere; } label { display: grid; gap: 5px; font-size: 13px; } input { min-width: 0; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--workspace-border-color, #8885); border-radius: 4px; font: inherit; color: inherit; background: var(--theme-bg, #fff); } .archive-item { padding: 12px 0; border-bottom: 1px solid var(--workspace-border-color, #8885); } small { display: block; margin-bottom: 6px; } footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; } button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--workspace-border-color, #8885); border-radius: 4px; padding: 8px 12px; cursor: pointer; } button:disabled { opacity: .5; cursor: default; } .primary { background: var(--theme-primary, #27734f); color: #fff; } .item-status { margin-top: 8px; } .item-status p { margin: 4px 0; }
</style>
