<template>
  <div ref="center" class="recovery-center">
    <div class="page-heading" :inert="actionsOpen"><button class="icon-button" :aria-label="backLabel" :disabled="busy || loading" @click="back"><ArrowLeft :size="22" /></button><h1 ref="heading" tabindex="-1"><template v-if="title==='核对这次保存'"><span class="recovery-write-title-part">核对</span><wbr><span class="recovery-write-title-part">这次保存</span></template><template v-else>{{ title }}</template></h1><MobileHelp topic="recovery" /><button v-if="view === 'review' && selected" ref="actionsTrigger" class="icon-button" aria-label="恢复操作" :disabled="busy || loading" @click="openActions"><MoreVertical :size="22" aria-hidden="true" /></button><button v-else-if="view === 'review'" class="icon-button" aria-label="刷新恢复记录" :disabled="busy || loading" @click="refresh"><RefreshCw :size="20" /></button></div>
    <div ref="body" class="recovery-body task-scroll" tabindex="0" role="region" :aria-label="title" :inert="actionsOpen">
      <template v-if="view === 'review'">
        <p v-if="error" tabindex="-1" class="recovery-error" role="alert">{{ error }}</p>
        <p v-if="!selected && listError" class="recovery-error" role="alert">{{ entries.length ? '记录未刷新，仍显示上次读取的列表。' : '恢复记录未能读取。' }}{{ listError }}</p>
        <p v-if="selected && detailReadError" tabindex="-1" class="recovery-error" role="alert">{{ detailReadError }}</p>
        <p v-if="selected && detailReadError && record" class="sheet-hint" role="status">仍显示上次读到的完整版本。</p>
      </template>
      <p v-if="busy || loading" role="status" class="subtle-message">{{ busy ? '正在处理，请稍候…' : '正在读取恢复记录…' }}</p>
      <section v-if="selected" v-show="view === 'review'" class="recovery-review-page" :inert="view !== 'review'">
        <div class="recovery-file"><span class="recovery-file-icon" aria-hidden="true"><FileText :size="28" /></span><span class="recovery-file-name"><h2>{{ (record || selected).relativePath }}</h2><p>{{ (record || selected).libraryName || '来源文件夹' }}<template v-if="!record"> · {{ formatDate(selected.created) }}</template></p></span></div>
        <template v-if="record">
          <p v-if="!isExport" class="recovery-warning">原文件的写入未确认</p>
          <div v-if="record.hasOriginal && !isExport" class="recovery-version-tabs" role="tablist" aria-label="恢复版本" @keydown="versionTabKeydown"><button id="recovery-original-tab" role="tab" :aria-selected="version==='original'" :tabindex="version==='original'?0:-1" aria-controls="recovery-original-panel" :disabled="busy" @click="chooseVersion('original')">写入前原文</button><button id="recovery-candidate-tab" role="tab" :aria-selected="version==='candidate'" :tabindex="version==='candidate'?0:-1" aria-controls="recovery-candidate-panel" :disabled="busy" @click="chooseVersion('candidate')">待保存草稿</button></div>
          <p v-else class="recovery-inline-label">{{ isExport?'导出内容':'待保存草稿' }}</p>
          <p class="recovery-inline-meta">保护时间：{{ formatDate(record.created) }}</p>
          <div v-for="v in availableVersions" :id="`recovery-${v}-panel`" :key="record.id+v" v-show="version===v" class="recovery-inline-preview" :role="record.hasOriginal&&!isExport?'tabpanel':undefined" :aria-labelledby="record.hasOriginal&&!isExport?`recovery-${v}-tab`:undefined" :inert="version!==v"><p v-if="longVersion(v)" class="recovery-inline-summary">{{ excerpt(v) }}</p><textarea v-else class="recovery-content recovery-inline-content" :aria-label="contentLabel(v)" readonly spellcheck="false" :value="textFor(v)"></textarea></div>
          <button class="recovery-read-full" :disabled="busy" @click="showPreview">查看完整内容<ChevronRight :size="20" aria-hidden="true" /></button>
          <button v-if="detailReadError" class="recovery-task-row" :disabled="busy" @click="copy"><Copy :size="24" aria-hidden="true" /><span><strong>{{ copyAction }}</strong><small>上次读到的完整版本</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
        </template>
      </section>
      <template v-for="v in previewMounted" :key="`${record?.id}:${v}`">
        <section v-if="record" v-show="view === 'preview' && version === v" class="recovery-preview-page" :inert="view !== 'preview' || version !== v">
          <h2 class="recovery-preview-subject">{{ record.relativePath }}</h2><p class="recovery-preview-version">{{ isExport ? '导出内容' : v === 'candidate' ? '准备保存的草稿' : '写入前的原文' }}</p>
          <RecoverySource :storage="storage" v-if="longVersion(v)" :identity="`${record.id}:${v}`" :label="contentLabel(v)" :content="textFor(v)" />
          <textarea v-else class="recovery-content" :aria-label="contentLabel(v)" readonly spellcheck="false" :value="textFor(v)"></textarea>
        </section>
      </template>
      <section v-if="record" v-show="view === 'export'" :inert="view !== 'export'">
        <div v-if="exportState !== 'ready'" class="recovery-export-result" :class="{'is-success':exportState === 'success'}"><h2>{{ exportState === 'success' ? storage.preview ? '已开始下载' : '已导出并核对' : exportState === 'cancelled' ? '已取消导出' : '导出未完成' }}</h2><p v-if="exportStatus" role="status">{{ exportStatus }}</p><p v-if="exportError" role="alert">{{ exportError }}</p></div>
        <div class="recovery-file"><FileText :size="24" aria-hidden="true" /><span><h2>{{ record.relativePath }}</h2><p>JSON恢复记录</p></span></div>
        <dl class="recovery-destination"><dt>包含的版本</dt><dd>{{ isExport ? '导出内容' : '准备保存的草稿' }}</dd><dd v-if="record.hasOriginal">写入前的原文</dd></dl>
      </section>
      <template v-if="!selected">
        <div v-if="!loading && !entries.length && !listError" class="empty-state"><ShieldCheck :size="34" /><h3>目前没有未确认的保存或导出</h3></div>
        <div v-else class="file-list"><button v-for="entry in entries" :key="entry.id" :data-recovery-id="entry.id" class="file-row" :disabled="busy || loading" @click="inspect(entry.id)"><span class="file-icon"><FileText :size="22" /></span><span class="file-info"><strong>{{ entry.relativePath }}</strong><small>{{ entry.purpose === 'text-export' ? '导出副本 · ' : '' }}{{ entry.libraryName || '来源文件夹' }} · {{ formatDate(entry.created) }}{{ entry.readable ? '' : ' · 读取未完成' }}</small></span><ChevronRight :size="18" /></button></div>
        <p v-if="truncated" class="subtle-message">先显示最近 25 条；其他记录继续保留在本机。</p>
      </template>
    </div>
    <footer v-if="(selected || listError) && view!=='preview'" class="recovery-task-footer" :inert="actionsOpen">
      <template v-if="view === 'review'">
        <button v-if="selected && (!record || detailReadError) || !selected && listError" class="button primary-button" :disabled="busy || loading" @click="refresh">{{ selected ? '重新读取这条恢复记录' : '重新读取恢复记录' }}</button>
        <button v-if="record && !detailReadError" class="button primary-button" :aria-label="copyLabel" :disabled="busy" @click="copy">{{ copyAction }}</button>
      </template>
      <template v-else>
        <button v-if="exportState === 'success'" class="button primary-button" :disabled="busy" @click="back">返回恢复核对</button>
        <button v-else class="button primary-button" :disabled="busy" @click="exportRecord">{{ exportAction }}</button>
        <button v-if="exportState === 'success'" class="text-button" :disabled="busy" @click="exportRecord">{{ storage.preview ? '再次下载恢复记录' : '再次导出恢复记录' }}</button>
        <button v-else-if="exportState !== 'ready'" class="text-button" :disabled="busy" @click="back">返回恢复核对</button>
      </template>
    </footer>
    <div v-if="actionsOpen" class="recovery-version-backdrop" @click.self="closeActions">
      <section ref="actionsDialog" class="recovery-version-dialog recovery-actions-dialog" role="dialog" aria-modal="true" aria-label="恢复操作" @keydown="actionsKeydown">
        <header><button ref="actionsBack" class="icon-button" aria-label="返回恢复核对" @click="closeActions"><ArrowLeft :size="22" aria-hidden="true" /></button><h2>恢复操作</h2></header>
        <div class="recovery-version-options"><button v-if="record" class="recovery-task-row" data-recovery-action="export" :disabled="busy" @click="showExport"><Download :size="24" aria-hidden="true" /><span><strong>导出完整恢复记录</strong><small>{{ exportCaption }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button><button class="recovery-task-row" :disabled="busy || loading" @click="refreshFromActions"><RefreshCw :size="22" aria-hidden="true" /><span>重新读取恢复记录</span></button></div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RecoverySource from './RecoverySource.vue'
import { sourceReadingReason } from './documentBudget'
import { mobileHelpOpen } from './mobileHelp'
import { ArrowLeft, ChevronRight, Copy, Download, MoreVertical, FileText, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { humanStorageError, type Document, type Storage, type RecoveryRecord, type RecoverySummary } from './storage'
import { captureTaskPosition, restoreTaskPosition, type TaskPosition } from './taskPosition'
import { focusableControls } from './accessibility'
type Version = 'candidate' | 'original'
type View = 'review' | 'preview' | 'export'
const actionsTrigger=ref<HTMLButtonElement>(),exportFromActions=ref(false)
const view = ref<View>('review'), actionsOpen = ref(false), actionsDialog = ref<HTMLElement>(), actionsBack = ref<HTMLButtonElement>()
const previewMounted = ref<Version[]>([]), previewPositions: Partial<Record<Version, TaskPosition>> = {}
let reviewPosition: TaskPosition | null = null
const exportState = ref<'ready' | 'success' | 'cancelled' | 'failed'>('ready'), exportError = ref(''), exportStatus = ref('')
const props = defineProps<{ storage: Storage; openDocument: (document: Document) => Promise<void>; returnLabel?: string }>()
const emit = defineEmits<{ back: []; busy: [value: boolean] }>()
const entries = ref<RecoverySummary[]>([]), record = ref<RecoveryRecord | null>(null), version = ref<'candidate' | 'original'>('candidate')
const loading = ref(false), busy = ref(false), truncated = ref(false), error = ref(''), status = ref(''), listError = ref(''), detailReadError = ref('')
const selected = ref<RecoverySummary | null>(null)
const title = computed(() => view.value === 'preview' ? '内容预览' : view.value === 'export' ? exportState.value === 'success' ? '导出结果' : '导出恢复记录' : selected.value ? !record.value && !selected.value.readable && !selected.value.purpose ? '核对恢复记录' : isExport.value ? '取回这次导出' : '核对这次保存' : '保存恢复记录')
const backLabel = computed(() => view.value !== 'review' ? exportFromActions.value&&view.value==='export'?'返回恢复操作':'返回恢复核对' : selected.value ? '返回恢复记录' : props.returnLabel || '返回设置')
const heading = ref<HTMLElement>(), center = ref<HTMLElement>(), body = ref<HTMLElement>()
const content = computed(() => record.value ? version.value === 'candidate' ? record.value.candidate : record.value.original || '' : '')
const isExport = computed(() => (record.value || selected.value)?.purpose === 'text-export')
const textFor = (v: Version) => record.value ? v === 'candidate' ? record.value.candidate : record.value.original || '' : ''
const excerpt=(v:Version)=>Array.from(textFor(v).replace(/^\uFEFF/,'').slice(0,480)).slice(0,240).join('')
const longVersion = (v: Version) => !!sourceReadingReason(textFor(v))
const contentLabel = (v: Version) => isExport.value ? '导出内容' : v === 'candidate' ? '草稿内容' : '原文内容'
const exportCaption = computed(() => exportState.value === 'success' ? props.storage.preview ? '已开始下载' : '已导出并核对' : exportState.value === 'failed' ? '导出未完成' : exportState.value === 'cancelled' ? '已取消导出' : record.value?.hasOriginal ? '包含2份完整版本' : '包含1份完整版本')
const exportAction = computed(() => props.storage.preview ? exportState.value === 'ready' ? '下载恢复记录' : '重试下载' : exportState.value === 'ready' ? '选择保存位置' : '重新选择位置导出')
const availableVersions=computed<Version[]>(()=>record.value?.hasOriginal&&!isExport.value?['original','candidate']:['candidate'])
const copyAction=computed(()=>pendingCopy.value?'打开已存副本':isExport.value?'存入导出副本':version.value==='candidate'?'存入草稿副本':'存入原文副本')
const copyLabel=computed(()=>pendingCopy.value?'打开已存副本':copyAction.value+'到手机资料库')
// A successful write and a failed document admission are different outcomes.
// Keep that copy's identity for retry instead of creating another file.
const copies = ref(new Map<string, Document>())
const copyKey = computed(() => `${record.value?.id}:${version.value}`)
const pendingCopy = computed(() => {
  const copy = copies.value.get(copyKey.value)
  return copy?.content === content.value ? copy : undefined
})
const versions = new Map<string, 'candidate' | 'original'>()
let listScroll = 0, selectedId = '', alive = true
function formatDate(time: number) { return new Date(time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function scroller() { return body.value }
function scrollTop() { return scroller()?.scrollTop ?? window.scrollY }
function scrollTo(top: number) { const element = scroller(); if (element) element.scrollTop = top; else window.scrollTo(0, top) }
async function load() {
  if (busy.value || loading.value) return
  loading.value = true
  try { const result = await props.storage.recoveries(); if (alive) { entries.value = result.entries; truncated.value = result.truncated; listError.value = '' } }
  catch (failure) { if (alive) listError.value = humanStorageError(failure) }
  finally { loading.value = false }
}
async function inspect(id: string) {
  if (busy.value || loading.value) return
  const refreshing = selected.value?.id === id, previousScroll = scrollTop()
  if (!refreshing) {
    const summary = entries.value.find(entry => entry.id === id); if (!summary) return
    clearPreviews(); actionsOpen.value=false;exportFromActions.value=false;view.value = 'review'; exportState.value = 'ready'; exportError.value = ''; exportStatus.value = ''; listScroll = previousScroll; selectedId = id; selected.value = summary; record.value = null; status.value = ''; detailReadError.value = ''; version.value = versions.get(id) || 'candidate'
  }
  busy.value = true; error.value = ''
  try {
    const result = await props.storage.recovery(id)
    if (!alive) return
    if (record.value && (record.value.candidate !== result.candidate || record.value.original !== result.original)) clearPreviews()
    record.value = result; selected.value = result; detailReadError.value = ''
    entries.value = entries.value.map(entry => entry.id === id ? { id: result.id, relativePath: result.relativePath, libraryName: result.libraryName, created: result.created, hasOriginal: result.hasOriginal, readable: result.readable, purpose: result.purpose } : entry)
    if (!refreshing) version.value = versions.get(id) || 'candidate'
    if (!result.hasOriginal || result.purpose === 'text-export') version.value = 'candidate'
  }
  catch (failure) { if (alive) detailReadError.value = humanStorageError(failure) }
  finally {
    busy.value = false; await nextTick(); if (!alive) return
    if (!refreshing) { scrollTo(0); heading.value?.focus({ preventScroll: true }) }
    else scrollTo(previousScroll)
  }
}
async function refresh() { if (selected.value) await inspect(selected.value.id); else await load() }
async function back() {
  if (busy.value || loading.value) return
  if (actionsOpen.value) { await closeActions(); return }
  if(view.value==='export'&&exportFromActions.value){view.value='review';actionsOpen.value=true;await nextTick();actionsDialog.value?.querySelector<HTMLElement>('[data-recovery-action=export]')?.focus({preventScroll:true});return}
  if (view.value !== 'review') { if (view.value === 'preview') previewPositions[version.value] = captureTaskPosition(body.value); view.value = 'review'; await nextTick(); restoreTaskPosition(reviewPosition); return }
  if (!selected.value) { emit('back'); return }
  if (record.value) versions.set(record.value.id, version.value)
  clearPreviews(); record.value = null; selected.value = null; detailReadError.value = ''; error.value = ''; status.value = ''; await nextTick(); scrollTo(listScroll)
  const row = [...(center.value?.querySelectorAll<HTMLElement>('[data-recovery-id]') || [])].find(item => item.dataset.recoveryId === selectedId)
  ;(row || heading.value)?.focus({ preventScroll: true })
}
async function copy() {
  if (!record.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const copy = pendingCopy.value || await props.storage.copyRecovery(record.value.id, version.value)
    copies.value.set(copyKey.value, copy)
    await props.openDocument(copy)
  }
  catch (failure) { error.value = (pendingCopy.value ? '副本已存入手机资料库，打开未完成。' : '') + humanStorageError(failure) }
  finally { busy.value = false }
}
function clearPreviews() { previewMounted.value = []; delete previewPositions.candidate; delete previewPositions.original }
async function showPreview() {
  if (busy.value || !record.value) return
  reviewPosition = captureTaskPosition(body.value)
  if (!previewMounted.value.includes(version.value)) previewMounted.value.push(version.value)
  view.value = 'preview'; await nextTick()
  if (previewPositions[version.value]) restoreTaskPosition(previewPositions[version.value]!)
  else { scrollTo(0); heading.value?.focus({ preventScroll: true }) }
}
async function openActions() {
  if (busy.value || loading.value || !selected.value) return
  reviewPosition = captureTaskPosition(body.value); actionsOpen.value = true; await nextTick(); actionsBack.value?.focus({ preventScroll: true })
}
async function closeActions() { actionsOpen.value = false; await nextTick(); restoreTaskPosition(reviewPosition);actionsTrigger.value?.focus({preventScroll:true}) }
async function refreshFromActions(){await closeActions();await refresh()}
function chooseVersion(v:Version){if(busy.value||!record.value||!availableVersions.value.includes(v))return;if(v!==version.value)error.value='';version.value=v}
function versionTabKeydown(event:KeyboardEvent){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy.value)return;event.preventDefault();const next:Version=event.key==='Home'?'original':event.key==='End'?'candidate':version.value==='candidate'?'original':'candidate';chooseVersion(next);void nextTick(()=>center.value?.querySelector<HTMLElement>('#recovery-'+next+'-tab')?.focus())}
function actionsKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void closeActions(); return }
  if (event.key !== 'Tab') return
  event.stopPropagation()
  const controls = focusableControls(actionsDialog.value), first = controls[0], last = controls[controls.length-1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
async function showExport() {
  if (busy.value || !record.value) return
  exportFromActions.value=actionsOpen.value;if(!actionsOpen.value)reviewPosition=captureTaskPosition(body.value);actionsOpen.value=false;view.value = 'export'; await nextTick(); scrollTo(0); heading.value?.focus({ preventScroll: true })
}
async function exportRecord() {
  if (!record.value || busy.value) return
  busy.value = true; exportError.value = ''; exportStatus.value = ''
  try {
    const result = await props.storage.exportRecovery(record.value.id)
    if (!alive) return
    exportState.value = result.exported ? 'success' : 'cancelled'
    exportStatus.value = result.exported ? props.storage.preview ? '浏览器已开始下载恢复记录，原记录继续保留。' : '恢复记录已导出并回读确认，原记录继续保留。' : '已取消导出，恢复记录继续保留。'
  }
  catch (failure) { if (alive) { exportState.value = 'failed'; exportError.value = humanStorageError(failure) } }
  finally { busy.value = false; await nextTick(); if (alive) { scrollTo(0); heading.value?.focus({ preventScroll: true }) } }
}
onMounted(async () => { await load(); await nextTick(); if (alive && !mobileHelpOpen.value) heading.value?.focus({ preventScroll: true }) })
watch([busy, loading], ([working, reading]) => emit('busy', working || reading), { flush: 'sync' })
onBeforeUnmount(() => { alive = false; emit('busy', false) })
defineExpose({ back, title, backLabel })
</script>
<style scoped>
.recovery-center{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--bg);color:var(--ink)}
.recovery-center>.page-heading{flex-shrink:0}.recovery-center h1{font-size:1.0625rem}
.recovery-body{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain}.recovery-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}
.recovery-body>.recovery-error,.recovery-export-result{color:var(--ink);background:var(--warning-soft);border:1px solid var(--warning-line);font-size:.875rem;line-height:1.7;margin:0 0 16px;padding:14px;border-radius:12px;overflow-wrap:anywhere}
.recovery-file{display:flex;gap:14px;align-items:flex-start;padding:8px 0;margin-bottom:16px;border:0;border-radius:0;background:none}.recovery-file>svg{flex-shrink:0;color:var(--primary);margin-top:5px}.recovery-file>span{flex:1;min-width:0}
.recovery-file h2{font-size:1.125rem;line-height:1.5;margin:0;overflow-wrap:anywhere}.recovery-file p{font-size:.875rem;line-height:1.5;color:var(--muted);margin:6px 0 0;overflow-wrap:anywhere}
.recovery-warning{margin:0 0 16px;font-size:.875rem;line-height:1.7}
.recovery-task-row{display:flex;align-items:center;gap:14px;width:100%;min-height:80px;padding:16px 0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none;color:var(--ink);text-align:left}
.recovery-task-row>svg{flex-shrink:0;color:var(--muted)}.recovery-task-row>span{flex:1;min-width:0}.recovery-task-row strong{display:block;font-size:1rem;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.recovery-task-row small{display:block;font-size:.875rem;line-height:1.5;color:var(--muted);margin:4px 0;overflow-wrap:anywhere}
.recovery-version-static{padding:16px 0;border-bottom:1px solid var(--line)}.recovery-version-static small{display:block;font-size:.875rem;color:var(--muted);line-height:1.5}.recovery-version-static strong{display:block;font-size:1rem;line-height:1.5;margin-top:4px}
.recovery-destination{margin:24px 0 16px;line-height:1.5}.recovery-destination dt{font-size:.875rem;color:var(--muted)}.recovery-destination dd{margin:6px 0 0;font-size:1rem;overflow-wrap:anywhere}
.recovery-preview-page{display:flex;flex-direction:column;height:100%;min-height:280px}.recovery-preview-subject{font-size:1rem;line-height:1.5;margin:0 0 6px;overflow-wrap:anywhere}.recovery-preview-version{font-size:.875rem;line-height:1.5;color:var(--muted);margin:0 0 16px}
.recovery-center .recovery-content{max-height:none;width:100%;height:auto;min-height:160px;flex:1;resize:none;font-size:.875rem;line-height:1.8;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)}.recovery-preview-page>.recovery-source{flex:1;min-height:0}
.recovery-task-footer{display:flex;flex-direction:column;gap:8px;padding:12px 16px max(16px,env(safe-area-inset-bottom));border-top:1px solid var(--line);flex-shrink:0}.recovery-task-footer .button,.recovery-task-footer .text-button{width:100%;min-height:48px;font-size:1rem;line-height:1.5;padding:10px 16px;margin:0;justify-content:center;overflow-wrap:anywhere}
.recovery-export-result.is-success{background:var(--primary-soft);border-color:var(--line)}
.recovery-export-result h2{font-size:1.125rem;line-height:1.5;margin:0 0 12px}.recovery-export-result p{margin:0;line-height:1.7;font-size:.875rem}
.recovery-version-backdrop{position:fixed;inset:0;z-index:66;display:flex;align-items:flex-end;justify-content:center;background:rgba(32,39,34,.28)}
.recovery-version-dialog{width:100%;max-width:600px;max-height:90dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border-radius:24px 24px 0 0;overflow:hidden;padding-bottom:max(16px,env(safe-area-inset-bottom))}
.recovery-version-dialog header{display:flex;align-items:center;gap:12px;padding:16px;flex-shrink:0}.recovery-version-dialog h2{flex:1;min-width:0;font-size:1.125rem;line-height:1.5;margin:0;overflow-wrap:anywhere}.recovery-version-dialog .icon-button{width:48px;height:48px;min-height:48px;flex-shrink:0}
.recovery-version-options{overflow:auto;overscroll-behavior:contain;padding:0 16px}.recovery-version-option{width:100%;display:flex;align-items:center;gap:16px;min-height:64px;padding:16px 8px;border:0;border-top:1px solid var(--line);background:none;color:var(--ink);text-align:left;font-size:1rem;line-height:1.5}.recovery-version-option>span{flex:1;min-width:0;overflow-wrap:anywhere}.recovery-version-option>svg{flex-shrink:0;color:var(--primary)}
.recovery-center h1{font-size:1.25rem;line-height:1.5}.recovery-write-title-part{display:inline-block;white-space:nowrap}.recovery-review-page{display:flex;flex-direction:column;min-height:100%}.recovery-file{align-items:center;margin-bottom:16px;gap:14px}.recovery-file>.recovery-file-icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:12px;background:var(--panel);color:var(--muted)}.recovery-file>.recovery-file-name{min-width:0;flex:1}.recovery-version-tabs{display:flex;flex:none;border-bottom:1px solid var(--line);margin:8px 0 20px}.recovery-version-tabs>button{position:relative;flex:1;min-width:0;min-height:56px;padding:12px 8px;font-size:1rem;line-height:1.5;color:var(--muted);border:0;background:none;overflow-wrap:anywhere}.recovery-version-tabs>button[aria-selected=true]{font-weight:700;color:var(--primary)}.recovery-version-tabs>button[aria-selected=true]:after{content:'';position:absolute;bottom:0;left:8px;right:8px;height:3px;border-radius:3px;background:var(--primary)}.recovery-center .recovery-warning{padding:0;border:0;background:none;color:var(--muted);margin:0 0 8px}.recovery-inline-meta{font-size:.875rem;line-height:1.6;margin:0 0 8px;color:var(--muted)}.recovery-inline-label{font-size:1rem;line-height:1.5;font-weight:600;margin:8px 0 16px}.recovery-inline-preview{display:flex;flex:1;min-height:220px}.recovery-inline-content{white-space:pre-wrap;overflow-wrap:anywhere}.recovery-inline-summary{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--line);border-radius:12px;padding:14px;margin:0;line-height:1.7;font-size:1rem;background:var(--surface)}.recovery-read-full{display:flex;align-items:center;justify-content:flex-start;gap:6px;flex:none;min-height:48px;margin-top:8px;border:0;background:none;padding:8px 4px;font-size:1rem;line-height:1.5;color:var(--primary)}.recovery-task-footer{border:0}.recovery-actions-dialog header{justify-content:flex-start;gap:8px;padding:8px}.recovery-actions-dialog .recovery-task-row{padding:16px;min-height:64px;font-size:1rem}.recovery-actions-dialog .recovery-version-options{padding:0}.recovery-actions-dialog .recovery-task-row:last-child{border:0}.recovery-actions-dialog header>h2{flex:1;font-size:1.25rem;line-height:1.5;margin:0}.recovery-center :deep(button){-webkit-tap-highlight-color:transparent}
.recovery-center .recovery-content{font-size:1rem;line-height:1.75}
@media(max-width:340px){
  .recovery-center>.page-heading h1{font-size:1.0625rem}
  .recovery-review-page>.recovery-file{padding-block:4px;min-height:0;margin-bottom:10px}
  .recovery-file-name h2{font-size:1rem;line-height:1.35}
  .recovery-file-name p{font-size:.8125rem;line-height:1.35}
  .recovery-center .recovery-warning{font-size:.8125rem;line-height:1.4}
  .recovery-version-tabs{margin:4px 0 8px}
  .recovery-version-tabs>button{padding:8px 4px;font-size:.8125rem}
  .recovery-inline-meta{font-size:.75rem;line-height:1.4}
  .recovery-center .recovery-inline-content{padding:10px}
}
</style>
