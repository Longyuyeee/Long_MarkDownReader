<template>
  <n-modal :show="true" preset="card" :title="title" class="session-transfer-dialog" :style="{ width: 'min(780px, 94vw)' }" :mask-closable="!writing" :closable="!writing" :close-on-esc="!writing" @close="close" @update:show="show => { if (!show) close() }">
    <div class="session-transfer-body">
      <p class="session-explanation">{{ mode === 'resume' ? '已按恢复目录匹配文件。选择要继续的文件；未保存内容保留，暂不可用的文件仍记在现场中。' : mode === 'import' ? '选择新资料库，核对文件后保存命名记录；不会自动切库或打开文件。' : mode === 'export' ? '导出文件顺序、固定标签和阅读位置。现场不包含正文，也不是内容备份。' : '核对文件后接着工作；缺失项会保留在命名记录中，当前草稿不会被替换。' }}</p>
      <div class="session-targets">
        <label>资料库<select v-model="target" :disabled="mode !== 'import' || writing"><option v-for="library in store.libraries" :key="library.path" :value="library.path">{{ library.name }}</option></select></label>
        <label v-if="mode === 'import'">现场名称<input v-model="name" aria-label="现场名称" :disabled="writing" maxlength="60" /></label>
        <div v-else class="session-record-name"><span>工作现场</span><strong>{{ bundle.name }}</strong></div>
      </div>
      <p class="session-target-path">{{ target }}</p>
      <div class="session-file-heading"><strong>{{ mode === 'export' ? `${bundle.files.length} 份文件` : `${readyCount} 份可用 · ${checks.length - readyCount} 份待处理` }}</strong><n-button v-if="mode !== 'export'" size="small" :loading="checking" :disabled="writing" @click="refresh">重新核对</n-button></div>
      <div class="session-file-list" :aria-busy="checking" aria-label="现场文件核对">
        <div v-for="file in shownPaths" :key="file" class="session-file-row">
          <input v-if="mode === 'resume'" type="checkbox" :aria-label="'接续 ' + file" :checked="!omitted.includes(file)" :disabled="writing || checking" @change="omitted = omitted.includes(file) ? omitted.filter(path=>path!==file) : [...omitted,file]" /><FileText :size="18" aria-hidden="true" /><span class="session-file-label"><strong>{{ file }}</strong><small>{{ mode === 'export' ? '仅记录位置，不包含文件内容' : status(file)?.reason || (status(file)?.state === 'ready' ? '文件可用' : checking ? '正在核对…' : '尚未核对') }}{{ isReferenceOnly(file) ? ' · 参考资料' : '' }}</small></span>
          <span v-if="mode !== 'export'" class="session-file-state" :class="{ ready: status(file)?.state === 'ready' }">{{ status(file)?.state === 'ready' ? '可用' : status(file)?.state === 'missing' ? '缺失' : checking ? '核对中' : '待处理' }}</span>
          <n-button v-if="mode !== 'export' && status(file)?.state !== 'ready'" size="small" :disabled="writing || checking" :aria-label="'重新定位 ' + file" @click="relocate(file)">重新定位</n-button><n-button v-if="mode === 'resume' && file.includes('/') && status(file)?.state !== 'ready'" size="small" :disabled="writing || checking" :aria-label="'重新定位文件夹 ' + file.slice(0,file.lastIndexOf('/'))" @click="relocateDirectory(file)">文件夹…</n-button>
        </div>
      </div>
      <label class="session-context-option"><input v-model="includeContext" type="checkbox" :disabled="writing" />{{ mode === 'export' ? '包含搜索条件和参考资料（文件名、搜索词可能含私人信息）' : mode === 'import' ? '同时导入搜索条件与参考位置' : '同时恢复搜索条件与参考位置' }}</label>
      <WorkspaceHelp v-if="mode === 'export'" label="说明：导出不包含正文、草稿、命中摘要、密钥" text="导出不包含正文、草稿、命中摘要、密钥或原资料库绝对路径；请另行复制原文件到新电脑。" />
      <p v-if="recordError || error" role="alert" class="session-transfer-error">{{ recordError || error }}</p>
      <p v-else-if="checking" role="status">正在核对真实文件位置…</p>
    </div>
    <template #footer><div class="session-transfer-actions"><span>{{ ['restore','resume'].includes(mode) ? '未保存内容保留，不自动代存' : mode === 'import' ? '只添加现场记录，不修改文件' : '只新建导出文件，不覆盖已有文件' }}</span><n-button :disabled="writing" @click="close">取消</n-button><n-button type="primary" :loading="writing" :disabled="writing || checking || !!recordError || (mode === 'import' && !name.trim()) || (['restore','resume'].includes(mode) && !readyTabCount)" @click="apply">{{ mode === 'export' ? '导出现场' : mode === 'import' ? '导入并保存记录' : mode === 'resume' ? '接续所选文件' : '继续可用文件' }}</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import WorkspaceHelp from './workspace/WorkspaceHelp.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import { FileText } from 'lucide-vue-next'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { beginWindowSave } from '../services/windowDrafts'
import { useAppStore } from '../store/app'
import { availableSessionName, importWorkSessionRecord, portableSessionFingerprint } from '../services/workSessionTransfer'
import { sameWorkspacePath } from '../utils/savedCollections'
import { readWorkSessions, type WorkSession } from '../utils/workSessions'
import { materializeWorkSession, portableSessionPaths, remapPortableFile, validatePortableWorkSession, type PortableWorkSession, type SessionFileCheck, type SessionPreflight, remapPortableDirectory, relativeSessionPath } from '../utils/portableWorkSession'
const props = defineProps<{ mode: 'import' | 'export' | 'restore' | 'resume'; bundle: PortableWorkSession; root: string; sourceRoot?: string; resume?: (bundle: PortableWorkSession, frame: SessionPreflight, paths: string[], includeContext: boolean) => Promise<void>; expected?: WorkSession; restore?: (bundle: PortableWorkSession, frame: SessionPreflight, expected: WorkSession, includeContext: boolean) => Promise<void> }>()
const emit = defineEmits<{ close: []; imported: [entry: WorkSession, duplicate: boolean]; exported: [] }>()
const store = useAppStore(), mode = props.mode, bundle = ref(validatePortableWorkSession(props.bundle))
const target = ref(props.root), name = ref(bundle.value.name), includeContext = ref(mode !== 'export')
const omitted = ref<string[]>([])
const checking = ref(false), writing = ref(false), error = ref(''), recordError = ref(''), checks = ref<SessionFileCheck[]>([])
let generation = 0, disposed = false
const title = computed(() => mode === 'resume' ? '接续恢复后的工作现场' : mode === 'import' ? '导入工作现场' : mode === 'export' ? '导出工作现场' : '恢复工作现场')
const shownPaths = computed(() => mode === 'export' && !includeContext.value ? bundle.value.files.map(file=>file.relativePath) : portableSessionPaths(bundle.value))
const readyCount = computed(() => checks.value.filter(file => file.state === 'ready').length)
const readyTabCount = computed(() => bundle.value.files.filter(file => !omitted.value.includes(file.relativePath) && status(file.relativePath)?.state === 'ready').length)
const status = (file: string) => checks.value.find(item => item.relativePath.toLowerCase() === file.toLowerCase())
const isReferenceOnly = (file: string) => !bundle.value.files.some(item => item.relativePath === file)
const assertLive = (token: number, root = target.value) => {
  if (disposed || token !== generation || root !== target.value || !store.libraries.some(library => sameWorkspacePath(library.path, root)) || !sameWorkspacePath(props.sourceRoot ?? props.root, store.libraryPath)) throw Error('资料库或核对内容已变化，请重新打开现场')
}
async function refresh() {
  if (mode === 'export' || writing.value) return
  const token = ++generation, root = target.value; checking.value = true; error.value = ''; checks.value = []
  try { const frame = await invoke<SessionPreflight>('preflight_work_session', { libraryRoot: root, relativePaths: shownPaths.value }); assertLive(token, root); checks.value = frame.files }
  catch (cause) { if (!disposed && token === generation) error.value = String(cause) }
  finally { if (token === generation) checking.value = false }
}
async function relocateDirectory(file: string) {
  const token = generation, root = target.value, from = file.slice(0,file.lastIndexOf('/'))
  try {
    const selected = await open({title:'重新定位文件夹：' + from,defaultPath:root,multiple:false,directory:true});assertLive(token,root)
    if(typeof selected!=='string')return
    const to = sameWorkspacePath(root,selected) ? '' : relativeSessionPath(root,selected)
    bundle.value = remapPortableDirectory(bundle.value,from,to);omitted.value=[];await refresh()
  } catch(cause) {if(!disposed)error.value=String(cause)}
}
async function relocate(file: string) {
  const token = generation, root = target.value
  try {
    const selected = await open({ title: '选择目标资料库内的文件', defaultPath: root, multiple: false, directory: false }); assertLive(token, root)
    if (typeof selected !== 'string') return
    const located = await invoke<SessionFileCheck>('locate_work_session_file', { libraryRoot: root, path: selected }); assertLive(token, root)
    if (located.state !== 'ready') throw Error('所选文件暂时不可用')
    bundle.value = remapPortableFile(bundle.value, file, located.relativePath); omitted.value=[]; await refresh()
  } catch (cause) { if (!disposed) error.value = String(cause) }
}
function close() { if (!writing.value) { ++generation; emit('close') } }
async function apply() {
  if (writing.value || checking.value || recordError.value) return
  const token = generation, root = target.value; writing.value = true; error.value = ''
  try {
    assertLive(token, root)
    const full = validatePortableWorkSession(bundle.value)
    const selected = includeContext.value ? full : validatePortableWorkSession({ ...full, search: undefined, reference: undefined })
    if (mode === 'export') {
      const targetPath = await save({ title: '导出工作现场（请选择新文件）', defaultPath: full.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.longedit-session.json', filters: [{ name: '工作现场', extensions: ['longedit-session.json'] }] }); assertLive(token, root)
      if (!targetPath) return
      const finish = beginWindowSave()
      try { await invoke('export_work_session_bundle', { targetPath, bundle: selected }); assertLive(token, root); emit('exported'); emit('close') }
      finally { finish() }
    } else {
      const frame = await invoke<SessionPreflight>('preflight_work_session', { libraryRoot: root, relativePaths: shownPaths.value }); assertLive(token, root)
      if (JSON.stringify(frame.files) !== JSON.stringify(checks.value)) { checks.value = frame.files; throw Error('文件情况刚发生变化，已更新核对结果，请确认后再继续') }
      if (mode === 'resume') {
        if (!props.resume) throw Error('接续入口不可用')
        await props.resume(full, frame, shownPaths.value.filter(path=>!omitted.value.includes(path)), includeContext.value); emit('close')
      } else if (mode === 'import') {
        // Fingerprint the original source, not the user's relocated/name/context
        // choices. Reimporting that same source must not duplicate the record.
        const fingerprint = await portableSessionFingerprint(props.bundle); assertLive(token, root)
        const entry = materializeWorkSession(selected, root, crypto.randomUUID(), name.value, fingerprint)
        const result = importWorkSessionRecord(localStorage, entry, fingerprint); emit('imported', result.entry, result.duplicate); emit('close')
      } else {
        if (!props.expected) throw Error('原工作现场已变化，请重新打开')
        if (!props.restore) throw Error('现场恢复入口不可用')
        await props.restore(full, frame, props.expected, includeContext.value); emit('close')
      }
    }
  } catch (cause) { if (!disposed) error.value = String(cause) }
  finally { writing.value = false }
}
watch(target, () => {
  recordError.value = ''
  try { if (mode === 'import') name.value = availableSessionName(bundle.value.name, readWorkSessions(localStorage, target.value)) }
  catch (cause) { recordError.value = `目标资料库的现场记录暂时无法读取，原数据未改写：${String(cause)}` }
  void refresh()
}, { immediate: true })
watch(() => store.libraryPath, () => { ++generation; emit('close') })
onBeforeUnmount(() => { disposed = true; ++generation })
</script>
<style scoped>
.session-transfer-dialog { color: var(--theme-text); background: var(--theme-surface); transition: box-shadow .2s ease, opacity .2s ease, transform .2s ease; }
.session-transfer-dialog :deep(.n-card-header__main) { color: var(--theme-text); }
.session-transfer-body { max-height: 64vh; overflow-y: auto; min-width: 0; }
.session-explanation, .session-target-path { margin: 0 0 14px; color: var(--theme-text-secondary); font-size: var(--text-sm); line-height: 1.6; overflow-wrap: anywhere; }
.session-targets { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.session-targets label, .session-record-name { display: grid; gap: 6px; min-width: 0; }
.session-targets input, .session-targets select { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; padding: 8px 10px; color: var(--theme-text); background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); }
.session-target-path { margin-top: 8px; font-family: var(--font-mono, monospace); }
.session-record-name strong { overflow-wrap: anywhere; }
.session-file-heading, .session-file-row, .session-transfer-actions { display: flex; align-items: center; gap: 10px; }
.session-file-heading { justify-content: space-between; margin: 16px 0 8px; }
.session-file-list { border: var(--theme-border); border-radius: var(--theme-radius-sm); overflow: hidden; }
.session-file-row { padding: 12px; border-bottom: var(--theme-border); }
.session-file-row:last-child { border-bottom: 0; }
.session-file-row>svg { flex-shrink: 0; color: var(--theme-text-secondary); }
.session-file-label { display: grid; gap: 4px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.session-file-label strong { font-weight: 500; }.session-file-label small { color: var(--theme-text-secondary); }
.session-file-state { font-size: var(--text-sm); color: var(--status-warning); white-space: nowrap; }.session-file-state.ready { color: var(--status-success); }
.session-context-option { display: flex; align-items: flex-start; gap: 7px; margin: 16px 0 10px; line-height: 1.6; }.session-context-option input { accent-color: var(--theme-primary); margin-top: 5px; }
.session-transfer-actions { flex-wrap: wrap; }.session-transfer-actions>span { flex: 1; min-width: 120px; font-size: var(--text-sm); color: var(--theme-text-secondary); }
.session-transfer-error { color: var(--status-danger); overflow-wrap: anywhere; }
@media(max-width:520px) { .session-targets { grid-template-columns: 1fr; }.session-file-row { flex-wrap: wrap; }.session-file-label { flex-basis: calc(100% - 36px); }.session-file-state { margin-left: 28px; }.session-file-row>.n-button { margin-left: auto; }.session-transfer-actions>span { flex-basis: 100%; }.session-transfer-body { max-height: 60vh; } }
</style>
