<template>
  <n-modal :show="true" preset="card" title="整理所选笔记的标签" class="tag-edit-dialog" :style="{ width: 'min(700px, 94vw)' }" :mask-closable="!writing" :closable="!writing" :close-on-esc="!writing" @close="close" @update:show="value => { if (!value) close() }">
    <div class="tag-edit-body">
      <div class="tag-edit-fields"><label>整理方式<select v-model="kind" :disabled="writing || attempted"><option value="rename">重命名标签</option><option value="add">添加标签</option><option value="remove">移除标签</option></select></label><label v-if="kind !== 'remove'">{{ kind === 'rename' ? '新的标签名称' : '标签名称' }}<input v-model="target" aria-label="新的标签名称" :disabled="writing || attempted" maxlength="80" placeholder="例如：客户项目" /></label></div>
      <p class="tag-edit-explanation">{{ kind === 'rename' ? `将 #${tag} 改为 #${target || '新标签'}` : kind === 'remove' ? `移除 #${tag}` : `添加 #${target || '新标签'}` }}。这会修改所选已保存 Markdown 的正文，不移动文件，不自动保存草稿；原文保留在历史中。</p>
      <p class="tag-edit-explanation">沿用文内标签的识别规则（包括代码块中的同名标签）。请先预览范围，再明确确认。</p>
      <n-button v-if="!attempted" :loading="checking" :disabled="writing" @click="preview">{{ planId ? '重新预览' : '预览影响' }}</n-button>
      <div v-if="items.length" class="tag-edit-list" aria-label="标签修改预览">
        <label v-for="item in items" :key="item.index" class="tag-edit-row"><input v-model="selected" type="checkbox" :value="item.index" :disabled="writing || attempted || item.state !== 'ready'" /><span><strong>{{ relative(item.path) }}</strong><small>{{ result(item.index)?.message || item.message }}</small><small v-if="item.changes">{{ item.changes }} 处标签变化</small></span><span class="tag-edit-state">{{ result(item.index) ? outcomeLabel(result(item.index)!.outcome) : previewLabel(item.state) }}</span></label>
      </div>
      <p v-if="affected.length" class="tag-edit-explanation">以下集合的条件仍保留原标签，不会静默改写其含义：{{ affected.join('、') }}。如需改用新标签，请在集合的“修改条件”中调整。</p>
      <p v-if="error" role="alert" class="tag-edit-error">{{ error }}</p>
      <p v-if="report" role="status">处理完成：{{ report.items.filter(item => item.outcome === 'completed').length }} 份已完成；其余逐项保留，不会自动重试。</p>
      <p v-else-if="checking" role="status">正在读取实际文件，尚未写入正文…</p>
    </div>
    <template #footer><div class="tag-edit-footer"><span>{{ selected.length }} 份已选择 · 仅处理本次所选文件</span><n-button :disabled="writing" @click="close">{{ report ? '关闭结果' : '取消' }}</n-button><n-button v-if="!report" type="primary" :loading="writing" :disabled="checking || !planId || !selected.length" @click="apply">{{ attempted ? '核对此次执行结果' : `确认修改 ${selected.length} 份文件` }}</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NModal, NButton } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/app'
import { snapshotWindowDrafts, dirtyDocumentPaths, beginWindowSave } from '../services/windowDrafts'
import { searchResultPath } from '../utils/searchResultPath'
import { sameWorkspacePath } from '../utils/savedCollections'
interface Item { index: number; path: string; state: 'ready' | 'unchanged' | 'excluded' | 'unavailable'; changes: number; message: string }
interface Result { index: number; path: string; outcome: 'completed' | 'notExecuted' | 'needsReview'; message: string }
interface Report { items: Result[] }
const props = defineProps<{ tag: string; paths: string[] }>()
const emit = defineEmits<{ close: []; completed: [] }>(), store = useAppStore(), root = store.libraryPath
const paths = [...props.paths], kind = ref<'rename' | 'add' | 'remove'>('rename'), target = ref('')
const planId = ref(''), items = ref<Item[]>([]), selected = ref<number[]>([]), report = ref<Report | null>(null)
const checking = ref(false), writing = ref(false), attempted = ref(false), error = ref('')
let generation = 0, disposed = false
const relative = (path: string) => searchResultPath(path, root)
const previewLabel = (state: Item['state']) => ({ ready: '可执行', unchanged: '无需改变', excluded: '已排除', unavailable: '不可用' })[state]
const outcomeLabel = (state: Result['outcome']) => ({ completed: '已完成', notExecuted: '未执行', needsReview: '需核对' })[state]
const result = (index: number) => report.value?.items.find(item => item.index === index)
const affected = computed(() => kind.value === 'add' ? [] : store.savedSearches.filter(entry => entry.libraryPath === root && [entry.filters?.tag, ...(entry.filters?.tags || [])].includes(props.tag)).map(entry => entry.name))
const retire = () => { const id = planId.value; planId.value = ''; if (id) void invoke('close_tag_edit', { planId: id }).catch(() => {}) }
const close = () => { if (writing.value) return; ++generation; retire(); emit('close') }
watch([kind, target], () => { if (!attempted.value) { ++generation; retire(); items.value = []; selected.value = []; error.value = ''; checking.value = false } })
watch(() => store.libraryPath, () => { if (!writing.value) close() })
async function preview() {
  if (checking.value || writing.value || attempted.value) return
  const token = ++generation; retire(); checking.value = true; error.value = ''; items.value = []; selected.value = []
  snapshotWindowDrafts()
  const excludedPaths = [...new Set([...store.tabs.filter(tab => tab.isDirty).map(tab => tab.path), ...dirtyDocumentPaths()])]
  const operation = kind.value === 'rename' ? { kind: 'rename', from: props.tag, to: target.value.trim().replace(/^#/, '') } : { kind: kind.value, tag: kind.value === 'remove' ? props.tag : target.value.trim().replace(/^#/, '') }
  try {
    const frame = await invoke<{ planId: string; items: Item[] }>('preview_tag_edit', { request: { libraryRoot: root, operation, paths, excludedPaths: excludedPaths.filter(path => paths.some(selected => sameWorkspacePath(path, selected))) } })
    if (disposed || token !== generation || root !== store.libraryPath) { void invoke('close_tag_edit', { planId: frame.planId }).catch(() => {}); return }
    planId.value = frame.planId; items.value = frame.items; selected.value = frame.items.filter(item => item.state === 'ready').map(item => item.index)
  } catch (cause) { if (token === generation && !disposed) error.value = String(cause) }
  finally { if (token === generation) checking.value = false }
}
async function apply() {
  if (writing.value || !planId.value || !selected.value.length || root !== store.libraryPath) return
  attempted.value = true; writing.value = true; error.value = ''
  const finish = beginWindowSave('relocation')
  try { report.value = await invoke<Report>('apply_tag_edit', { request: { planId: planId.value, selected: [...selected.value], confirmed: true } }); emit('completed') }
  catch (cause) { error.value = `本次未得到完成确认：${String(cause)}。不会自动全量重试；可核对此次结果，或关闭后重新预览。` }
  finally { writing.value = false; finish() }
}
onBeforeUnmount(() => { disposed = true; ++generation; retire() })
</script>
<style scoped>
.tag-edit-body { max-height: min(65vh, 650px); overflow: auto; padding-right: 4px; color: var(--theme-text); }.tag-edit-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.tag-edit-fields label { display: grid; gap: 7px; }.tag-edit-fields input, select { width: 100%; min-width: 0; min-height: 34px; border: var(--theme-border); border-radius: var(--theme-radius-sm); padding: 6px 9px; font: inherit; background: var(--theme-surface); color: var(--theme-text); }.tag-edit-explanation { font-size: var(--text-compact); line-height: 1.65; color: var(--theme-text-secondary); overflow-wrap: anywhere; }.tag-edit-list { margin: 14px 0; border-top: var(--theme-border); }.tag-edit-row { display: flex; gap: 10px; align-items: start; padding: 12px 0; border-bottom: var(--theme-border); }.tag-edit-row > span:first-of-type { flex: 1; min-width: 0; display: grid; gap: 5px; }.tag-edit-row strong { font-size: var(--text-sm); overflow-wrap: anywhere; }.tag-edit-row small { font-size: var(--text-compact); color: var(--theme-text-secondary); overflow-wrap: anywhere; }.tag-edit-state { font-size: var(--text-compact); flex-shrink: 0; }.tag-edit-error { color: var(--workspace-danger-text, var(--theme-text)); overflow-wrap: anywhere; }.tag-edit-footer { display: flex; flex-wrap: wrap; justify-content: end; align-items: center; gap: 9px; }.tag-edit-footer > span { margin-right: auto; font-size: var(--text-compact); color: var(--theme-text-secondary); }@media (max-width: 520px) { .tag-edit-fields { grid-template-columns: 1fr; }.tag-edit-state { max-width: 4em; }.tag-edit-footer > span { width: 100%; } }
</style>
