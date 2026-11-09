<template>
  <div class="incoming-center">
    <section v-show="view === 'list'" :inert="view !== 'list'" ref="list" class="incoming-list task-scroll" aria-label="本次收到的内容" tabindex="-1">
      <p v-if="error" class="recovery-error" role="alert">{{ error }}</p>
      <p v-if="refreshing" class="sheet-hint" role="status">正在读取收到的内容…</p>
      <button v-for="entry in entries" :key="itemKey(entry)" class="incoming-row" :data-incoming-key="itemKey(entry)" :disabled="busy" @click="inspect(entry)">
        <span v-if="entry.kind === 'pack'" class="incoming-type incoming-pack-icon" aria-hidden="true"><Layers :size="27" /></span><MobileFileIcon v-else :name="entry.name" />
        <span class="incoming-name"><strong>{{ entry.name }}</strong><small>{{ entry.kind === 'pack' ? `${entry.count ?? 0} 项` : incomingSize(entry.bytes) }} · {{ incomingDate(entry.created) }}</small></span><span class="incoming-status-pill" :class="{'is-imported':entry.status === 'imported','is-viewed':!entry.incoming && entry.status !== 'failed' && entry.status !== 'imported'}">{{ entry.status === 'imported' ? '已存入' : entry.status === 'failed' ? '未完成' : entry.incoming ? '未核对' : '已查看' }}</span><ChevronRight :size="18" aria-hidden="true" />
      </button>
      <button v-if="status.error" class="incoming-row" data-incoming-key="error" :disabled="busy" @click="inspectError"><i class="incoming-type" aria-hidden="true">!</i><span><strong>有一次接收未完成</strong><small>{{ kindLabel(status.errorKind) }} · 查看原因</small></span><ChevronRight :size="18" aria-hidden="true" /></button>
      <p v-if="!entries.length && !status.error && !refreshing" class="sheet-hint">没有待核对的内容。</p>
      <div class="incoming-toolbar"><span class="assistive-status">{{ entries.length }} 项</span><button class="icon-button" aria-label="刷新收到的内容" :disabled="busy" @click="refresh"><RefreshCw :size="20" aria-hidden="true" /></button></div>
    </section>
    <FileImportPanel v-if="view === 'text'" ref="textPanel" :storage="storage" :initial-id="selected!.id" source-task :open-document="openText" @busy="childBusy = $event" @updated="emit('updated')" @back="returnToList" />
    <div v-if="view === 'pack'" class="incoming-pack"><PackImportPanel ref="packPanel" :storage="storage" :initial-id="selected!.id" source-task :open-document="openPack" @busy="childBusy = $event" @updated="emit('updated')" @back="returnToList" /></div>
    <PdfImportPanel v-if="view === 'pdf'" ref="pdfPanel" :storage="storage" :initial-id="selected!.id" initial-error="" source-task :open-document="openPdf" @busy="childBusy = $event" @updated="emit('updated')" @back="returnToList" @close="returnToList" />
    <section v-if="view === 'error'" class="incoming-error-page">
      <div class="incoming-error-body task-scroll"><div ref="errorCard" class="incoming-error-card" role="alert" tabindex="-1"><strong>{{ kindLabel(errorSnapshot.kind) }}接收未完成</strong><p>{{ humanStorageError(errorSnapshot.message) }}</p></div><p v-if="error" class="recovery-error" role="alert">{{ error }}</p></div>
      <footer class="incoming-error-footer"><button class="button primary-button full-width" :disabled="busy" @click="acknowledgeError">知道了</button></footer>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronRight, RefreshCw, Layers } from 'lucide-vue-next'
import MobileFileIcon from './MobileFileIcon.vue'
import FileImportPanel from './FileImportPanel.vue'
import PackImportPanel from './PackImportPanel.vue'
import PdfImportPanel from './PdfImportPanel.vue'
import { humanStorageError, type Identity, type Storage } from './storage'
import type { FileImportSummary, IncomingStatus } from './textImport'
import { captureTaskPosition, restoreTaskRecord, type TaskPosition } from './taskPosition'
import { canFocus } from './accessibility'

type Kind = 'text' | 'pack' | 'pdf'
type Item = FileImportSummary & { kind: Kind; count?: number }
const props = defineProps<{ storage: Storage; status: IncomingStatus; openText: (document: Identity) => Promise<void>; openPack: (document: Identity) => Promise<void>; openPdf: (document: Identity) => Promise<void> }>()
const emit = defineEmits<{ busy: [boolean]; updated: [] }>()
const entries = ref<Item[]>([]), view = ref<'list' | Kind | 'error'>('list'), selected = ref<Item | null>(null)
const error = ref(''), refreshing = ref(false), childBusy = ref(false), acknowledging = ref(false), list = ref<HTMLElement>(), errorCard = ref<HTMLElement>()
const textPanel = ref<InstanceType<typeof FileImportPanel>>(), packPanel = ref<InstanceType<typeof PackImportPanel>>(), pdfPanel = ref<InstanceType<typeof PdfImportPanel>>()
const errorSnapshot = ref<{ message: string; kind?: Kind }>({ message: '' })
let alive = true, listPosition: TaskPosition | null = null, returnKey: string | undefined
const itemKey = (entry: Item) => `${entry.kind}:${entry.id}`
const incomingSize=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:bytes>=1024?`${Math.ceil(bytes/1024)} KB`:`${bytes} B`
function incomingDate(created:number){const date=new Date(created),today=new Date();return `${date.toDateString()===today.toDateString()?'今天':date.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}`}
const kindLabel = (kind?: Kind) => kind === 'pdf' ? 'PDF' : kind === 'pack' ? '笔记与附件' : kind === 'text' ? '文字' : '内容'
const pendingItems = (status: IncomingStatus): Item[] => [...status.entries.map(entry => ({ ...entry, kind: 'text' as const })), ...(status.packs || []).map(entry => ({ ...entry, kind: 'pack' as const })), ...(status.pdfs || []).map(entry => ({ ...entry, kind: 'pdf' as const }))]
// Keep viewed receipts in this task. A later arrival never replaces an active review.
watch(() => props.status, status => {
  const merged = new Map(entries.value.map(entry => [itemKey(entry), entry]))
  for (const entry of pendingItems(status)) merged.set(itemKey(entry), entry)
  entries.value = [...merged.values()].sort((a, b) => b.created - a.created || itemKey(a).localeCompare(itemKey(b)))
}, { immediate: true })
const busy = computed(() => refreshing.value || childBusy.value || acknowledging.value)
watch(busy, value => emit('busy', value), { flush: 'sync' })
const currentPanel = computed(() => view.value === 'text' ? textPanel.value : view.value === 'pack' ? packPanel.value : pdfPanel.value)
const confirming = computed(() => view.value !== 'list' && view.value !== 'error' && !!currentPanel.value?.confirming)
const confirmationTitle = computed(() => view.value === 'pdf' ? '移除这条 PDF 接收记录？' : view.value === 'pack' ? '移除这份导入记录？' : '移除这条导入记录？')
const actionsOpen=computed(()=>!!(['text','pack'].includes(view.value)&&currentPanel.value&&'actionsOpen' in currentPanel.value&&currentPanel.value.actionsOpen)),actionsAvailable=computed(()=>!!(['text','pack'].includes(view.value)&&currentPanel.value&&'actionsAvailable' in currentPanel.value&&currentPanel.value.actionsAvailable))
function openActions(){if(view.value==='text')void textPanel.value?.openActions();else if(view.value==='pack')void packPanel.value?.openActions()}
const textTask = computed(() => view.value === 'text')
const packTask = computed(() => view.value === 'pack')
const backLabel = computed(() => textTask.value ? textPanel.value?.backLabel || '返回收到的内容' : packTask.value ? packPanel.value?.backLabel || '返回收到的内容' : '返回上一层')
const title = computed(() => textTask.value ? textPanel.value?.title || '核对文字' : packTask.value ? packPanel.value?.title || '核对笔记与附件' : ({ list: '收到的内容', text: '核对文字', pack: '核对笔记与附件', pdf: '核对 PDF', error: '接收未完成' })[view.value])
const helpTopic = computed(() => view.value === 'text' ? 'import' : view.value === 'pack' ? 'packImport' : view.value === 'pdf' ? 'pdfImport' : 'incoming')
function inspect(entry: Item) { if (busy.value) return; listPosition = captureTaskPosition(list.value); returnKey = itemKey(entry); selected.value = entry; error.value = ''; view.value = entry.kind }
async function inspectError() { if (busy.value) return; listPosition = captureTaskPosition(list.value); returnKey = 'error'; errorSnapshot.value = { message: props.status.error, kind: props.status.errorKind }; error.value = ''; view.value = 'error'; await nextTick(); errorCard.value?.focus({ preventScroll: true }) }
async function refresh() {
  if (busy.value) return
  refreshing.value = true; error.value = ''
  try {
    const [text, packs, pdfs] = await Promise.all([props.storage.fileImports(), props.storage.packImports(), props.storage.pdfImports()])
    if (!alive) return
    const all = new Map(pendingItems({ entries: text.entries, packs: packs.entries, pdfs: pdfs.entries, error: '' }).map(entry => [itemKey(entry), entry]))
    // A bounded text history can omit an older receipt without deleting it.
    entries.value = entries.value.flatMap(entry => { const latest = all.get(itemKey(entry)); return latest ? [latest] : entry.kind === 'text' && text.truncated ? [entry] : [] })
    emit('updated')
  } catch (cause) { if (alive) error.value = humanStorageError(cause) }
  finally { refreshing.value = false }
}
async function returnToList() {
  if (busy.value) return
  view.value = 'list'; selected.value = null; error.value = ''
  await refresh(); await nextTick()
  if (!alive) return
  restoreTaskRecord(listPosition, 'data-incoming-key', returnKey)
  const focus = document.activeElement as HTMLElement | null
  if (canFocus(focus) && list.value?.contains(focus)) {
    focus.scrollIntoView({ block: 'nearest' })
  } else {
    list.value?.focus({ preventScroll: true })
  }
}
async function acknowledgeError() {
  if (busy.value) return
  acknowledging.value = true; error.value = ''
  try {
    const latest = await props.storage.incomingStatus()
    if (!alive) return
    if (latest.error && (latest.error !== errorSnapshot.value.message || latest.errorKind !== errorSnapshot.value.kind)) {
      errorSnapshot.value = { message: latest.error, kind: latest.errorKind }; error.value = '又收到一条接收提示，请核对后再确认。'; emit('updated'); return
    }
    if (latest.error) await props.storage.acknowledgeIncoming()
    emit('updated'); acknowledging.value = false; await returnToList()
  } catch (cause) { if (alive) error.value = humanStorageError(cause) }
  finally { acknowledging.value = false }
}
function back() {
  if (busy.value) return true
  if (view.value === 'list') return false
  if (view.value !== 'error' && currentPanel.value?.back()) return true
  void returnToList(); return true
}
defineExpose({ back, title, confirming, confirmationTitle, helpTopic, packTask, textTask, backLabel, actionsOpen, actionsAvailable, openActions })
onBeforeUnmount(() => { alive = false; emit('busy', false) })
</script>
<style scoped>
.incoming-center,.incoming-error-page { display:flex; flex:1; flex-direction:column; min-height:0; }
.incoming-list,.incoming-pack,.incoming-error-body { padding:16px; overflow:auto; flex:1; min-height:40px; overscroll-behavior:contain; }
.incoming-toolbar { display:flex; align-items:center; justify-content:flex-end; min-height:48px; margin-bottom:8px; font-size:.875rem; color:var(--muted); }
.incoming-row { display:flex; gap:12px; width:100%; min-height:88px; align-items:center; padding:16px 8px; text-align:left; border:0; border-bottom:1px solid var(--line); background:none; }
.incoming-row>.incoming-name { flex:1; min-width:0; overflow-wrap:anywhere; }
.incoming-row strong { display:block; font-size:1rem; line-height:1.5; }
.incoming-row small { display:block; font-size:.875rem; line-height:1.5; color:var(--muted); margin-top:4px; }
.incoming-type { width:38px; height:38px; flex-shrink:0; display:grid; place-items:center; border-radius:10px; background:var(--primary-soft); color:var(--primary); font-size:.75rem; font-style:normal; }
.incoming-error-card { background:var(--warning-soft); border:1px solid var(--warning-line); border-radius:12px; padding:16px; margin-top:24px; overflow-wrap:anywhere; }
.incoming-error-card p { margin:8px 0 0; font-size:.875rem; line-height:1.7; }
.incoming-error-footer { padding:12px 16px 16px; border-top:1px solid var(--line); flex-shrink:0; }
.incoming-error-footer .button { min-height:48px; justify-content:center; margin:0; font-size:1rem; line-height:1.5; padding:10px; }
.incoming-row{padding:16px 0;gap:12px}.incoming-row>.phone-file-icon,.incoming-type{width:46px;height:46px;flex:0 0 46px;border-radius:10px}.incoming-pack-icon{background:#eee5f6;color:#8553ac}.incoming-row>.incoming-status-pill{position:static;flex:none;max-width:5em;border-radius:999px;padding:4px 10px;background:var(--warning-soft);color:var(--incoming-status-color);font-size:.8125rem;line-height:1.4;overflow-wrap:anywhere}.incoming-row>.incoming-status-pill.is-imported{background:var(--primary-soft);color:var(--primary)}.incoming-row>.incoming-status-pill.is-viewed{background:var(--panel);color:var(--muted)}.incoming-row>svg{flex:none;color:var(--muted)}.incoming-toolbar{margin:8px 0 0}.incoming-row:active{background:var(--primary-soft)}
.incoming-center{--incoming-status-color:#85550a}:global(.theme-dark .incoming-center){--incoming-status-color:#ffd49b}
:global(.theme-dark .incoming-pack-icon){background:#493357;color:#dfb9fa}
@media(max-width:340px){.incoming-row{gap:8px}.incoming-row>.phone-file-icon,.incoming-type{width:40px;height:40px;flex-basis:40px}.incoming-row>.incoming-status-pill{padding:4px 8px}}
</style>
