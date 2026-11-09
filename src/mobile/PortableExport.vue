<template>
  <div class="portable-export" :class="{'pack-source-check': sourceCheck,'pack-record-read':recordTask,'pack-review-task':reviewTask,'pack-actions-open':actionsOpen}">
    <div ref="body" class="pack-export-body task-scroll" :tabindex="sourceCheck || recordTask || reviewTask ? 0 : undefined" :role="sourceCheck || recordTask || reviewTask ? 'region' : undefined" :aria-label="sourceCheck ? '附件检查内容' : recordTask || reviewTask ? title : undefined">
      <p v-if="busy && !sourceCheck" role="status" class="sheet-hint">{{ progress }}</p>
      <p v-if="error && !removing && !sourceCheck && view !== 'result'" role="alert" class="recovery-error">{{ view === 'history' && listLoaded ? '列表未刷新，仍显示上次读取的记录。' : '' }}{{ error }}</p>
      <p v-if="view === 'detail' && detailReadError && detail" class="sheet-hint" role="status">仍显示上次核对的完整清单。</p>
      <p v-if="status && view !== 'result'" ref="statusElement" role="status" tabindex="-1" class="sheet-hint">{{ status }}</p>
      <div v-if="snapshot" v-show="view === 'preview'">
        <div v-if="prepared" class="pack-review-file"><span class="pack-file-icon" aria-hidden="true"><FileText :size="28" /></span><span><h3>{{ snapshot.relativePath }}</h3><small>{{ textMetadata }}</small></span></div>
        <div v-else class="pack-export-file"><FileText :size="24" class="pack-source-file-icon" aria-hidden="true" /><div><h3>{{ snapshot.relativePath }}</h3></div></div>
        <p v-if="snapshot.dirty" class="pack-export-warning">包含未保存的修改</p>
        <template v-if="prepared">
          <section class="pack-review-summary"><h3>预览</h3><div><strong v-if="snippetTitle">{{ snippetTitle }}</strong><p>{{ snippetBody || (snippetTitle?'':'（空白正文）') }}</p></div></section>
          <button class="pack-export-row pack-full-row" :disabled="busy" @click="showContent"><span class="pack-review-row-icon" aria-hidden="true"><AlignLeft :size="22" /></span><span><strong>完整内容</strong><small>打包正文包含全部内容</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
          <button class="pack-export-row" :disabled="busy" @click="showManifest"><span class="pack-review-row-icon" aria-hidden="true"><Paperclip :size="22" /></span><span><strong>附件清单</strong><small>{{ prepared.assets.length }} 个附件 · {{ size(assetBytes) }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
          <div class="pack-review-output"><span class="pack-review-row-icon" aria-hidden="true"><PencilLine :size="22" /></span><dl><dt>建议文件名</dt><dd>{{ packName(snapshot.relativePath) }}</dd></dl></div>
        </template>
        <template v-if="needsCheck"><p v-if="busy" role="status" class="sheet-hint">{{ progress }}</p><p v-if="error" class="pack-source-error" role="alert">{{ error }}</p></template>
      </div>
      <div v-if="prepared && snapshot" v-show="view === 'manifest'">
        <div class="pack-export-file"><span class="pack-file-icon" aria-hidden="true"><Package :size="28" /></span><div><h3 ref="manifestHeading" tabindex="-1">{{ packName(snapshot.relativePath) }}</h3><small>{{ prepared.assets.length }} 个附件 · {{ size(assetBytes) }}</small></div></div>
        <ul class="pack-manifest" aria-label="将携带的附件"><li v-for="asset in prepared.assets" :key="asset.sourcePath"><span class="pack-asset-icon" aria-hidden="true"><Paperclip :size="22" /></span><span><template v-for="(part,index) in asset.sourcePath.split('/')" :key="index"><template v-if="index">/<wbr></template>{{ part }}</template><small>{{ size(asset.bytes) }}</small></span></li></ul>
      </div>
      <section v-if="contentMounted && prepared" v-show="view === 'content'" :inert="view !== 'content'" class="pack-content-page"><h3>{{ prepared.relativePath }}</h3><p class="sheet-hint">{{ textMetadata }}</p><RecoverySource :storage="storage" v-if="longContent" :identity="'pack:'+prepared.packId" :content="prepared.content" label="打包正文" subject="打包" /><textarea v-else aria-label="打包正文" readonly spellcheck="false" :value="prepared.content" /></section>
      <section v-if="results.preview.state !== 'idle' || results.detail.state !== 'idle'" v-show="view === 'result'" :inert="view !== 'result'" class="pack-result-page">
        <div class="pack-result-card" :class="{'is-success':result.state === 'success'}"><span v-if="result.state === 'success'" class="pack-success-icon" aria-hidden="true"><Check :size="34" :stroke-width="3" /></span><h3>{{ busy ? '正在等待导出结果' : resultCaption(resultParent) }}</h3><p v-if="result.state === 'success' && !busy">{{ storage.preview?'请到下载记录核对。':'文件已保存到所选位置。' }}</p><p v-if="result.error && !busy" role="alert">{{ result.error }}</p><p v-if="result.state !== 'success' && resultDetail && !busy" role="status">{{ resultDetail }}</p></div>
        <div class="pack-result-details"><div><FileText :size="25" aria-hidden="true" /><dl><dt>{{ storage.preview || result.state!=='success'?'建议文件名':'文件名' }}</dt><dd>{{ displayedName }}</dd></dl></div><div><Folder :size="25" aria-hidden="true" /><dl><dt>位置</dt><dd>{{ result.state==='success'?storage.preview?'浏览器下载记录':'系统所选位置':'尚未确认导出位置' }}</dd></dl></div></div>
      </section>
      <div v-show="view === 'history'">
        <div v-show="listLoaded" class="pack-export-section"><h3>{{ entries.length }} 条记录</h3><button class="icon-button" aria-label="刷新导出记录" :disabled="busy" @click="refresh"><RefreshCw :size="20" /></button></div>
        <p v-if="!entries.length && !busy && !error" class="sheet-hint">还没有保留的附件包。</p>
        <button v-for="entry in entries" :key="entry.id" :data-pack-id="entry.id" class="pack-record pack-export-row" :disabled="busy" @click="inspect(entry)"><span class="pack-file-icon" aria-hidden="true"><Package :size="26" /></span><span><strong>{{ entry.name }}</strong><small>{{ entry.count }} 个附件 · {{ size(entry.bytes) }}</small><small>{{ formatDate(entry.created) }}{{ !entry.readable ? ' · 暂时无法读取' : '' }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
      <div v-if="selected" v-show="view === 'detail'">
        <div class="pack-export-file"><span class="pack-file-icon" aria-hidden="true"><Package :size="28" /></span><div><h3 ref="detailHeading" tabindex="-1">{{ selected.name }}</h3><small>{{ selected.count }} 个附件 · {{ size(selected.bytes) }}</small></div></div>
        <template v-if="detail"><h4>包内附件</h4><ul class="pack-manifest" aria-label="包内附件"><li v-for="asset in detail.assets" :key="asset.archivePath"><span class="pack-asset-icon" aria-hidden="true"><Paperclip :size="22" /></span><span><template v-for="(part,index) in asset.sourcePath.split('/')" :key="index"><template v-if="index">/<wbr></template>{{ part }}</template><small>{{ size(asset.bytes) }}</small></span></li></ul></template>
      </div>
      <div v-for="owner in actionOwners" v-show="actionsOpen && actionParent===owner" :key="owner" class="pack-action-list"><button v-show="owner==='preview'||owner==='result' && resultParent==='preview'" class="pack-export-row" :disabled="busy" @click="showHistory"><History :size="24" aria-hidden="true" /><span>查看附件包导出记录</span><ChevronRight :size="20" aria-hidden="true" /></button><button v-show="owner==='result' && resultParent==='preview' && prepared" class="pack-export-row" @click="manifestFromActions"><Paperclip :size="24" aria-hidden="true" /><span>附件清单</span><ChevronRight :size="20" aria-hidden="true" /></button><button v-show="owner!=='result' && results[owner==='detail'?'detail':'preview'].state!=='idle'" class="pack-export-row" @click="resultFromActions"><Check :size="24" aria-hidden="true" /><span>查看导出结果</span><ChevronRight :size="20" aria-hidden="true" /></button><button v-show="owner==='result' && result.state==='success'" class="pack-export-row" @click="retryFromActions"><Download :size="24" aria-hidden="true" /><span>{{ storage.preview?'再次下载附件包':'再次导出附件包' }}</span></button><button v-show="owner==='detail'" class="pack-export-row pack-remove-action" :disabled="busy" @click="requestRemoval"><Trash2 :size="24" aria-hidden="true" /><span>移除记录</span></button></div>
    </div>
    <footer v-show="view === 'preview' || view === 'detail' || view === 'result' || historyRetry" class="pack-export-footer">
      <template v-if="snapshot"><button v-if="needsCheck" v-show="view === 'preview'" class="button primary-button" :disabled="busy" :aria-busy="busy" @click="prepare">{{ busy ? '正在检查附件…' : '重新检查附件' }}</button><button v-if="prepared" v-show="view === 'preview'" class="button primary-button" :disabled="busy" @click="exportCurrent">{{ storage.preview ? '下载笔记与附件' : '选择位置导出' }}</button></template>
      <button v-if="view === 'result'" ref="resultAction" class="button primary-button" :disabled="busy" :aria-busy="busy" :aria-label="result.state==='success'?resultParent==='preview'?'完成，返回文档':'完成，返回附件包详情':undefined" @click="result.state === 'success' ? finishResult() : retryResult()">{{ result.state === 'success' ? '完成' : storage.preview ? '重试下载' : '重新选择位置' }}</button>
      <button v-if="prepared" v-show="view==='result' && resultParent==='preview'" class="button pack-result-preview" :disabled="busy" @click="showContent">查看内容</button>
      <button v-if="historyRetry" class="button primary-button" :disabled="busy" :aria-busy="busy" @click="refresh">{{ busy ? '正在读取记录…' : '重新读取记录' }}</button>
      <template v-if="selected"><button ref="recordRetry" v-show="view === 'detail' && (!detail || detailReadError)" class="button primary-button" :disabled="busy" :aria-busy="busy" @click="inspect(selected)">{{ busy ? '正在核对清单…' : '重新核对清单' }}</button><button ref="recordExport" v-show="view === 'detail' && detail && !detailReadError" class="button primary-button" :disabled="busy || !detail" @click="retry(selected.id)">{{ storage.preview ? '再次下载' : '再次导出' }}</button></template>
    </footer>
    <MobileConfirmation v-if="removing && selected" title="移除导出记录？" :subject="selected.name" consequence="移除本机保留的附件包后，无法从此记录再次导出。原笔记、附件及已导出文件仍会保留。" :busy="busy" :error="removalError" @cancel="cancelRemoval" @confirm="remove" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { ChevronRight, RefreshCw, FileText, AlignLeft, Paperclip, Check, Package, PencilLine, Folder, History, Download, Trash2 } from 'lucide-vue-next'
import MobileConfirmation from './MobileConfirmation.vue'
import { captureTaskPosition, restoreTaskPosition, restoreTaskRecord, type TaskPosition } from './taskPosition'
import { humanStorageError, type Storage } from './storage'
import { packName, preparePack, type PreparedPack, type PackSummary, type PackInfo } from './portablePack'
import RecoverySource from './RecoverySource.vue'
import { sourceReadingReason } from './documentBudget'
import type { TextExportSnapshot, TextExportResult } from './textExport'
const props = defineProps<{ storage: Storage; snapshot: TextExportSnapshot | null }>()
const emit = defineEmits<{ busy: [value: boolean]; close: [] }>()
type View = 'preview' | 'manifest' | 'history' | 'detail' | 'content' | 'result' | 'actions'
const view = ref<View>(props.snapshot ? 'preview' : 'history')
const messages = reactive<Record<View, { error: string; status: string }>>({ preview: { error: '', status: '' }, manifest: { error: '', status: '' }, history: { error: '', status: '' }, detail: { error: '', status: '' }, content: { error: '', status: '' }, result: { error: '', status: '' }, actions:{error:'',status:''} })
const error = computed(() => messages[view.value].error), status = computed(() => messages[view.value].status)
const busy = ref(false), progress = ref(''), entries = ref<PackSummary[]>([]), selected = shallowRef<PackSummary | null>(null), detail = shallowRef<PackInfo | null>(null), prepared = shallowRef<PreparedPack | null>(null), removing = ref(false), removalError = ref('')
type ResultParent = 'preview' | 'detail'
const results = reactive<Record<ResultParent,{state:'idle'|'success'|'cancelled'|'failed';error:string;status:string;displayName?:string|null}>>({preview:{state:'idle',error:'',status:''},detail:{state:'idle',error:'',status:''}})
const resultParent = ref<ResultParent>('preview'), result = computed(() => results[resultParent.value]), contentMounted = ref(false)
const resultDetail = computed(() => result.value.status.replace(/^已取消导出。\s*/, '').replace(/^已开始下载，/, '').replace(/^附件包已导出并回读确认。\s*/, ''))
const displayedName = computed(() => result.value.state==='success'&&!props.storage.preview?result.value.displayName||'系统未提供文件名':resultParent.value==='preview'&&props.snapshot?packName(props.snapshot.relativePath):selected.value?.name||'')
const snippet = computed(() => Array.from((prepared.value?.content||'').replace(/^\uFEFF/,'').slice(0,480)).slice(0,240).join('')), snippetTitle = computed(()=>snippet.value.split(/\r\n|\r|\n/)[0]?.replace(/^#{1,6}\s+/,'')), snippetBody = computed(()=>snippet.value.split(/\r\n|\r|\n/).slice(1).join('\n').trim().split(/\n\s*\n/)[0])
const longContent = computed(() => !!prepared.value && !!sourceReadingReason(prepared.value.content))
const textMetadata = computed(() => prepared.value ? `${/\.md$/i.test(prepared.value.relativePath) ? 'Markdown' : '纯文字'} · ${size(new TextEncoder().encode(prepared.value.content).length)}` : '')
const reviewTask = computed(() => !!props.snapshot && ['preview','manifest','content','result'].includes(view.value) && !sourceCheck.value || view.value === 'result')
const actionsOpen = computed(()=>view.value==='actions'),actionsAvailable = computed(()=>view.value==='result'?resultParent.value==='preview'||result.value.state==='success':['preview','detail'].includes(view.value))
type ActionParent='preview'|'detail'|'result'
const actionOwners:ActionParent[]=['preview','result','detail']
const actionParent=ref<ActionParent>('preview')
let actionPosition:TaskPosition|null=null,actionChildPosition:TaskPosition|null=null
let historyActionParent:ActionParent='preview',historyActionPosition:TaskPosition|null=null,historyActionChildPosition:TaskPosition|null=null
const backLabel = computed(() => view.value==='actions'?actionParent.value==='result'?'返回导出结果':actionParent.value==='detail'?'返回附件包详情':needsCheck.value?'返回附件检查':'返回导出核对':view.value === 'result' ? resultParent.value === 'preview' ? '返回导出核对' : '返回附件包详情' : view.value === 'content' || view.value === 'manifest' ? childParent==='actions'?'返回附件包操作':childParent === 'result' ? '返回导出结果' : '返回导出核对' : view.value === 'detail' ? '返回导出记录' : view.value === 'history' ? historyParent==='actions'?'返回附件包操作':props.snapshot ? historyParent === 'result' ? '返回导出结果' : needsCheck.value ? '返回附件检查' : '返回导出核对' : '返回设置' : '返回文档')
function resultCaption(owner:ResultParent) { return results[owner].state === 'success' ? props.storage.preview ? '已发起下载' : '附件包已导出' : results[owner].state === 'cancelled' ? '已取消导出' : '导出未完成' }
let historyResultParent:ResultParent='preview'
let childParent:'preview'|'result'|'actions'='preview',historyParent:'preview'|'result'|'actions'='preview',contentPosition:TaskPosition|null=null,manifestPosition:TaskPosition|null=null,resultPosition:TaskPosition|null=null
const parentPositions:Record<ResultParent,TaskPosition|null>={preview:null,detail:null}
const recordRetry = ref<HTMLElement>(), recordExport = ref<HTMLElement>(), resultAction = ref<HTMLButtonElement>()
const body = ref<HTMLElement>(), statusElement = ref<HTMLElement>(), manifestHeading = ref<HTMLElement>(), detailHeading = ref<HTMLElement>()
const assetBytes = computed(() => prepared.value?.assets.reduce((sum, item) => sum + item.bytes, 0) || 0)
const listLoaded = ref(false), detailReadError = ref('')
const recordTask = computed(() => view.value === 'history' || view.value === 'detail')
const historyRetry = computed(() => view.value === 'history' && (!!messages.history.error || busy.value))
const needsCheck = computed(() => !!props.snapshot && !prepared.value)
const sourceCheck = computed(() => needsCheck.value && view.value === 'preview')
const title = computed(() => sourceCheck.value ? '检查附件' : ({ preview: '导出附件包', manifest: '附件清单', history: '附件包导出记录', detail: '附件包详情', content:'正文预览', result:'导出结果', actions:'附件包操作' }[view.value]))
const inHistory = computed(() => view.value === 'history' || view.value === 'detail'||actionsOpen.value&&actionParent.value==='detail')
const canBack = computed(() => removing.value || actionsOpen.value || view.value === 'detail' || view.value === 'manifest' || view.value === 'content' || view.value === 'result' || (view.value === 'history' && (!!props.snapshot||historyParent==='actions')))
let alive = true, previewPosition: TaskPosition | null = null, historyPosition: TaskPosition | null = null, removalPosition: TaskPosition | null = null
function scroller() { return body.value && getComputedStyle(body.value).overflowY === 'visible' ? body.value.closest<HTMLElement>('.bottom-sheet') || body.value : body.value }
function position() { return captureTaskPosition(scroller()) }
function revealRestoredFocus() {
  const focus = document.activeElement as HTMLElement | null, container = scroller()
  if (!focus?.closest('.portable-export') || !container) return
  const box = focus.getBoundingClientRect(), viewport = container.getBoundingClientRect()
  const top = Math.max(viewport.top, body.value?.closest('.bottom-sheet')?.querySelector('.sheet-heading')?.getBoundingClientRect().bottom || 0)
  if (box.top < top || box.bottom > viewport.bottom) {
    focus.scrollIntoView({ block: 'nearest' })
    const restored = focus.getBoundingClientRect()
    if (restored.top < top) container.scrollTop -= top - restored.top
  }
}
const formatDate = (created: number) => new Date(created).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const size = (bytes: number) => bytes < 1024 ? `${bytes}\u00A0B` : `${(bytes / 1024).toFixed(1)}\u00A0KiB`
async function run(message: string, action: () => Promise<void>, removal = false, owner:View = view.value) {
  if (busy.value) return
  busy.value = true; emit('busy', true); progress.value = message
  if (removal) removalError.value = ''; else messages[owner] = { error: '', status: '' }
  try { await action() } catch (failure) { if (alive) { if (removal) removalError.value = humanStorageError(failure); else messages[owner].error = humanStorageError(failure) } }
  finally { if (alive) { busy.value = false; emit('busy', false) } }
}
const refresh = () => run('正在读取保留的附件包…', async () => { const result = await props.storage.packExports(); if (alive) { entries.value = result.entries; listLoaded.value = true } })
async function prepare() {
  if (busy.value) return
  await run('正在逐一检查正文和附件…', async () => { if (props.snapshot) { const result = await preparePack(props.storage, props.snapshot); if (alive) prepared.value = result } })
  await nextTick(); if (alive && view.value === 'preview') { if (body.value) body.value.scrollTop = 0; focusTaskHeading() }
}
async function outcome(id: string, action: () => ReturnType<Storage['retryPack']>, owner:View = view.value) {
  try {
    const result = await action()
    if (alive) messages[owner].status = result.exported ? props.storage.preview ? '已开始下载，请在下载目录核对。' : '附件包已导出并回读确认。' : result.cancelled ? '已取消导出。' : '导出未完成，可重试。'
    if(alive && result.retained)messages[owner].status += ' 本机附件包仍保留，可稍后再次导出。'
    return result
  } catch (failure) {
    let retained = false
    try { retained = (await props.storage.packExports()).entries.some(item => item.id === id) } catch { /* Check persistence before promising a retained copy. */ }
    throw new Error(`${humanStorageError(failure)}${retained ? ' 本机附件包记录仍保留，可在记录页重试。' : ' 请检查记录页；原笔记和草稿仍保留。'}`)
  }
}
function storeResult(owner:ResultParent, reply?:TextExportResult) {
  results[owner] = {state:messages[owner].error ? 'failed' : reply?.exported ? 'success' : reply?.cancelled ? 'cancelled' : 'failed',...messages[owner],displayName:typeof reply?.displayName==='string'&&reply.displayName.trim()&&reply.displayName.length<=1024?reply.displayName:null}
  messages[owner] = {error:'',status:''}; resultParent.value=owner; view.value='result'
}
async function showResult(owner:ResultParent) { if(busy.value)return; parentPositions[owner]=position(); resultParent.value=owner; view.value='result'; await nextTick(); scroller()?.scrollTo(0,0); focusTaskHeading() }
async function exportCurrent() {
  if(busy.value||!prepared.value)return
  if(view.value!=='result')parentPositions.preview=position()
  let reply:TextExportResult|undefined
  await run('正在保留附件包并等待导出结果…',async()=>{reply=await outcome(prepared.value!.packId,()=>props.storage.exportPack(prepared.value!),'preview')},false,'preview')
  if(alive){storeResult('preview',reply);await revealExportResult()}
}
async function revealExportResult() {
  await nextTick()
  scroller()?.scrollTo(0, 0)
  if (result.value.state === 'cancelled') resultAction.value?.focus({ preventScroll: true })
  else focusTaskHeading()
}
function retryResult(){if(resultParent.value==='preview')void exportCurrent();else if(selected.value)void retry(selected.value.id)}
function finishResult(){if(busy.value)return;if(resultParent.value==='preview')emit('close');else void back()}

async function retry(id: string) {
  if (busy.value) return
  if(view.value!=='result')parentPositions.detail=position()
  const previous = parentPositions.detail || position()
  let verified=false,reply:TextExportResult|undefined
  await run('正在核对附件包并等待导出结果…', async () => {
    try { const result = await props.storage.packExport(id); if (!alive) return; detail.value = result; detailReadError.value = ''; verified=true }
    catch (failure) { if (alive) detailReadError.value = humanStorageError(failure); throw failure }
    reply = await outcome(id, () => props.storage.retryPack(id),'detail')
  },false,'detail')
  if(alive && verified){storeResult('detail',reply);await revealExportResult()}
  else if (alive && detailReadError.value) { view.value='detail'; await nextTick(); restoreTaskPosition({ ...previous, focus: recordRetry.value || previous.focus }) }
}
async function inspect(entry: PackSummary) {
  if (busy.value) return
  if (view.value === 'history') historyPosition = position()
  const refreshing = view.value === 'detail' && selected.value?.id === entry.id, previous = position()
  selected.value = entry; if (!refreshing) { detail.value = null; detailReadError.value = '';results.detail={state:'idle',error:'',status:''} }; view.value = 'detail'
  await run('正在核对完整附件包…', async () => { const result = await props.storage.packExport(entry.id); if (alive) detail.value = result })
  if (!alive) return
  detailReadError.value = messages.detail.error
  await nextTick(); if (refreshing) { restoreTaskPosition(previous); if (!detailReadError.value) recordExport.value?.focus({ preventScroll: true }) }; if (!refreshing) { scroller()?.scrollTo(0, 0); detailHeading.value?.focus({ preventScroll: true }) }
}
function focusTaskHeading() {
  const heading = body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('.sheet-heading h2')
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
}
async function showHistory() {
  if (busy.value) return
  historyResultParent=resultParent.value; historyParent=actionsOpen.value?'actions':view.value==='result'?'result':'preview'; if(historyParent==='actions'){actionChildPosition=position();historyActionParent=actionParent.value;historyActionPosition=actionPosition;historyActionChildPosition=actionChildPosition}else if(historyParent==='result')resultPosition=position();else previewPosition=position(); view.value = 'history'
  await refresh(); await nextTick(); scroller()?.scrollTo(0, 0); focusTaskHeading()
}
async function showManifest() {
  if (busy.value || !prepared.value) return
  childParent=actionsOpen.value?'actions':view.value==='result'?'result':'preview';if(childParent==='actions')actionChildPosition=position();else if(childParent==='result')resultPosition=position();else previewPosition=position();view.value='manifest'
  await nextTick();if(manifestPosition)restoreTaskPosition(manifestPosition);else{scroller()?.scrollTo(0,0);manifestHeading.value?.focus({preventScroll:true})}
}
async function showContent(){if(busy.value||!prepared.value)return;childParent=view.value==='result'?'result':'preview';if(childParent==='result')resultPosition=position();else previewPosition=position();contentMounted.value=true;view.value='content';await nextTick();if(contentPosition)restoreTaskPosition(contentPosition);else{scroller()?.scrollTo(0,0);focusTaskHeading()}}
async function returnTo(viewName: 'history' | 'preview' | 'result' | 'actions') {
  view.value = viewName; await nextTick()
  if (viewName === 'history') restoreTaskRecord(historyPosition, 'data-pack-id', selected.value?.id)
  else restoreTaskPosition(viewName==='actions'?actionChildPosition:viewName==='result'?resultPosition:previewPosition)
  revealRestoredFocus()
}
async function openActions(){if(busy.value||!actionsAvailable.value)return;actionParent.value=view.value as ActionParent;actionPosition=position();view.value='actions';await nextTick();scroller()?.scrollTo(0,0);focusTaskHeading()}
async function closeActions(){view.value=actionParent.value;await nextTick();restoreTaskPosition(actionPosition);body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('[data-focus-key=pack-export-actions]')?.focus({preventScroll:true})}
function manifestFromActions(){void showManifest()}
async function resultFromActions(){const owner=actionParent.value==='detail'?'detail':'preview';await closeActions();await showResult(owner)}
async function retryFromActions(){await closeActions();retryResult()}
function requestRemoval() { if (!busy.value) { removalPosition = position(); removalError.value = ''; removing.value = true } }
async function cancelRemoval() { if (busy.value) return; removing.value = false; await nextTick(); restoreTaskPosition(removalPosition) }
async function remove() {
  const id = selected.value?.id; if (!id) return
  let completed = false
  await run('正在移除本机记录…', async () => {
    await props.storage.removePack(id)
    if(prepared.value?.packId===id){results.preview.status=results.preview.status.replace('本机附件包仍保留，可稍后再次导出。','本机记录已移除，已导出文件继续保留。');results.preview.error=results.preview.error.replace(' 本机附件包记录仍保留，可在记录页重试。',' 本机记录已移除，原笔记和草稿继续保留。')}
    results.detail={state:'idle',error:'',status:''}
    entries.value = entries.value.filter(entry => entry.id !== id); selected.value = null; detail.value = null; removing.value = false; view.value = 'history'
    messages.history = { error: '', status: '本机记录已移除，原笔记、附件和已导出文件仍保留。' }
    try { const result = await props.storage.packExports(); if (!alive) return; entries.value = result.entries; listLoaded.value = true } catch (failure) { messages.history.error = humanStorageError(failure) }
    completed = true
  }, true)
  if (completed && alive) { await nextTick(); statusElement.value?.focus(); statusElement.value?.scrollIntoView({ block: 'center' }) }
}
function back() {
  if (busy.value) return true
  if (removing.value) { void cancelRemoval(); return true }
  if(actionsOpen.value){void closeActions();return true}
  if(view.value==='result'){const owner=resultParent.value;view.value=owner;void nextTick(()=>restoreTaskPosition(parentPositions[owner]));return true}
  if(view.value==='content'||view.value==='manifest'){if(view.value==='content')contentPosition=position();else manifestPosition=position();void returnTo(childParent);return true}
  if (view.value === 'detail') { void returnTo('history'); return true }
  if (view.value === 'history' && (props.snapshot||historyParent==='actions')) { if(historyParent==='result'||historyParent==='actions')resultParent.value=historyResultParent;if(historyParent==='actions'){actionParent.value=historyActionParent;actionPosition=historyActionPosition;actionChildPosition=historyActionChildPosition}void returnTo(historyParent); return true }
  return false
}
defineExpose({ back, canBack, confirming: removing, inHistory, title, sourceCheck, recordTask, reviewTask, backLabel,actionsOpen,actionsAvailable,openActions })
onMounted(() => props.snapshot ? prepare() : refresh())
onBeforeUnmount(() => { alive = false; emit('busy', false) })
</script>
<style scoped>
.portable-export{--pack-remove-ink:#88530a;display:flex;flex-direction:column;min-height:0;flex:1;overflow:hidden;color:var(--ink)}.pack-export-body{padding:16px;overflow:auto;min-height:0;flex:1;overscroll-behavior:contain}.pack-export-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}.portable-export button{-webkit-tap-highlight-color:transparent}.pack-export-row:active{background:var(--primary-soft)}.pack-export-row:focus-visible{outline-offset:-2px}
.pack-review-file,.pack-export-file{display:flex;align-items:center;gap:14px;margin:0 0 24px;padding:8px 0;min-height:64px}.pack-review-file>span:last-child,.pack-export-file>div{flex:1;min-width:0}.pack-file-icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:12px;background:var(--panel);color:var(--muted)}.pack-review-file h3,.pack-export-file h3{font-size:1.125rem;line-height:1.5;margin:0;font-weight:650;overflow-wrap:anywhere}.pack-review-file small,.pack-export-file small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted)}.pack-source-file-icon{flex:none;color:var(--primary)}
.pack-review-summary>h3{margin:0 0 8px;font-size:.875rem;line-height:1.5;color:var(--muted);font-weight:500}.pack-review-summary>div{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-size:1rem;line-height:1.65;overflow-wrap:anywhere;display:block}.pack-review-summary strong{display:block}.pack-review-summary p{margin:8px 0 0;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.pack-review-summary p:empty{display:none}
.pack-export-row{scroll-margin-top:72px;background:transparent;color:inherit;font:inherit;border:0;display:flex;align-items:center;gap:12px;width:100%;min-height:80px;padding:14px 4px;border-bottom:1px solid var(--line);text-align:left}.pack-export-row>span:not(.pack-file-icon,.pack-review-row-icon){flex:1;min-width:0;overflow-wrap:anywhere}.pack-export-row>svg{flex:none;color:var(--primary)}.pack-export-row>svg:last-child{color:var(--muted)}.pack-export-row strong{display:block;font-size:1rem;line-height:1.5;font-weight:600}.pack-export-row small{display:block;font-size:.875rem;line-height:1.5;color:var(--muted);margin-top:4px}.pack-full-row{margin-top:24px;border-top:1px solid var(--line)}.pack-review-output{display:flex;align-items:center;gap:12px;padding:16px 4px;border-bottom:1px solid var(--line)}.pack-review-row-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:10px;background:var(--primary-soft);color:var(--primary)}.pack-review-output>dl{flex:1;min-width:0;margin:0}.pack-review-output dt{font-size:1rem;line-height:1.5;font-weight:600}.pack-review-output dd{font-size:.875rem;line-height:1.6;color:var(--muted);margin:4px 0 0;overflow-wrap:anywhere}
.pack-manifest{padding:0;margin:0;list-style:none}.pack-manifest li{display:flex;gap:14px;align-items:center;padding:16px 0;min-height:80px;border-bottom:1px solid var(--line);font-size:1rem;line-height:1.5}.pack-manifest li>span:last-child{flex:1;min-width:0;overflow-wrap:anywhere}.pack-manifest small{display:block;margin-top:4px;font-size:.875rem;line-height:1.6;color:var(--muted)}.pack-asset-icon{display:grid;place-items:center;flex:0 0 44px;min-height:44px;border-radius:10px;background:var(--panel);color:var(--muted)}.pack-export-file+h4{font-size:1rem;line-height:1.5;font-weight:600;margin:0;padding-bottom:12px;border-bottom:1px solid var(--line)}.pack-export-section{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}.pack-export-section h3{font-size:.875rem;line-height:1.5;font-weight:500;color:var(--muted);margin:0}.pack-record{gap:14px;padding:16px 0}
.pack-content-page{display:flex;flex-direction:column;height:100%;min-height:280px}.pack-content-page h3{font-size:1rem;line-height:1.5;margin:0 0 6px;overflow-wrap:anywhere}.pack-content-page>.sheet-hint{margin:0 0 16px}.pack-content-page>textarea{width:100%;flex:1;min-height:160px;resize:none;max-height:none;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font:inherit;font-size:1rem;line-height:1.7;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere}.pack-content-page>.recovery-source{flex:1;min-height:0}
.pack-result-card{padding:24px 0;text-align:center;color:var(--ink);display:flex;flex-direction:column;align-items:center}.pack-result-card.is-success{padding:72px 0 28px}.pack-success-icon{display:grid;place-items:center;flex:none;width:60px;height:60px;background:#159936;color:white;border-radius:50%}.pack-result-card h3{font-size:1.75rem;line-height:1.4;margin:20px 0 0;overflow-wrap:anywhere}.pack-result-card p{font-size:1rem;line-height:1.6;margin:12px 0 0;color:var(--muted);overflow-wrap:anywhere}.pack-result-card p[role=alert]{padding:14px;border:1px solid var(--warning-line);border-radius:12px;color:var(--ink);background:var(--warning-soft)}.pack-result-details{border:1px solid var(--line);border-radius:12px;padding:0 16px}.pack-result-details>div{display:flex;gap:14px;align-items:center;padding:16px 0;min-height:80px}.pack-result-details>div+div{border-top:1px solid var(--line)}.pack-result-details svg{flex:none;color:var(--muted)}.pack-result-details dl{flex:1;min-width:0;margin:0}.pack-result-details dt{font-size:1rem;line-height:1.5;font-weight:600}.pack-result-details dd{margin:4px 0 0;font-size:.875rem;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}
.pack-export-footer{flex:none;display:flex;flex-direction:column;gap:12px;background:var(--bg);padding:16px 16px max(16px,env(safe-area-inset-bottom))}.pack-export-footer>.button{font-size:1rem;line-height:1.5;font-weight:600;padding:12px;width:100%;min-height:48px;justify-content:center;border-radius:10px}.pack-result-preview{color:var(--primary);border-color:var(--primary);background:transparent}.portable-export .sheet-hint{font-size:.875rem;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.pack-export-warning,.pack-source-error,.portable-export .recovery-error{font-size:.875rem;line-height:1.6;color:var(--ink);background:var(--warning-soft);border:1px solid var(--warning-line);border-radius:12px;padding:12px;margin:16px 0 0;overflow-wrap:anywhere}.pack-source-error,.portable-export .recovery-error{margin:0 0 16px}
.pack-action-list .pack-export-row{padding:16px 4px;min-height:64px;font-size:1rem;line-height:1.5}.pack-action-list .pack-export-row:last-child{border:0}.pack-remove-action{color:var(--pack-remove-ink)}.pack-remove-action>svg{color:inherit}.portable-export.pack-actions-open>.pack-export-body{padding:0 16px}
:global(.theme-dark .portable-export){--pack-remove-ink:#ffce87}
.pack-review-file:has(+ .pack-export-warning){margin-bottom:8px}
.pack-export-warning{width:fit-content;margin:0 0 14px;padding:4px 10px;line-height:1.4}
@media(max-height:600px){.pack-result-card.is-success{padding-top:24px}.pack-export-footer{gap:8px}}
@media(max-width:340px){
  .pack-review-file,.pack-export-file{margin-bottom:14px;padding-block:4px;gap:10px}
  .pack-file-icon{flex-basis:44px;width:44px;height:44px}
  .pack-review-file h3,.pack-export-file h3{font-size:1rem;line-height:1.35}
  .pack-review-file small,.pack-export-file small,.pack-record small{font-size:.8125rem;line-height:1.4}
  .pack-record strong,.pack-manifest li{line-height:1.4}
  .pack-export-warning{font-size:.8125rem;margin-bottom:10px}
  .pack-review-summary p{-webkit-line-clamp:3}
  .pack-content-page>.sheet-hint{margin-bottom:10px}
  .pack-result-card.is-success{padding:8px 0 16px}
  .pack-result-card h3{font-size:1.5rem;margin-top:12px}
  .pack-result-card p{font-size:.875rem;margin-top:8px}
  .pack-result-details>div{padding-block:12px}
  .pack-result-details dd{font-size:.8125rem}
  .pack-success-icon{width:52px;height:52px}
}
</style>
