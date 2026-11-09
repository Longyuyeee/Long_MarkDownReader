<template>
  <div class="image-attachments" :class="{'is-missing': view === 'detail' && !preview}">
    <input v-if="note" ref="fileInput" class="attachment-file-input" type="file" tabindex="-1" accept="image/png,image/jpeg,image/webp" aria-label="选择要导入的图片文件" @change="fileChanged" @cancel="cancelPicker" />
    <div ref="body" class="image-task-body task-scroll" tabindex="0" role="region" :aria-label="title">
      <p v-if="error && !(view === 'detail' && !preview)" ref="errorElement" tabindex="-1" class="recovery-error" role="alert">{{ error }}</p>
      <p v-if="(working || status) && !(view === 'detail' && !preview)" class="image-task-status" role="status">{{ working ? '正在核对图片，请稍候…' : status }}</p>
      <section v-if="note" v-show="view === 'compose'">
        <div class="image-task-file"><strong>{{ note.relativePath.split('/').pop() }}</strong><small>{{ libraryName(note.rootId) }} · 插入位置：{{ placement }}</small></div>
        <p v-if="!canWrite" class="recovery-error">当前资料库只读，无法在此添加图片。</p>
        <label class="input-label" for="image-alt">图片说明</label><input id="image-alt" v-model="alt" class="name-input" aria-label="图片说明" placeholder="例如：路线示意" maxlength="120" :disabled="working" />
        <div class="image-task-links"><button class="image-task-row" :disabled="working" @click="showReferences"><span><strong>笔记中的图片</strong><small>{{ scan.references.length }} 处引用</small></span><ChevronRight :size="20" /></button><button class="image-task-row" :disabled="working" @click="showHistory"><span><strong>导入记录</strong></span><ChevronRight :size="20" /></button></div>
      </section>
      <section v-show="view === 'references'">
        <div class="image-task-toolbar"><button class="text-button" :disabled="working || checking" @click="checkReferences">{{ checking ? '检查中…' : '重新检查' }}</button></div>
        <p v-if="!scan.references.length" class="subtle-message">暂无可编辑的图片引用。</p>
        <button v-for="(reference, i) in scan.references.slice(0, 25)" :key="reference.from" :data-image-reference="reference.from" class="image-task-row image-reference-row" :disabled="working" @click="showReplacement(reference)"><span><strong>{{ reference.alt || `图片 ${i + 1}` }}</strong><small :class="{ 'image-problem': checks[reference.from] && checks[reference.from] !== '可读取' }">第 {{ i + 1 }} 处 · {{ checks[reference.from] || '等待检查…' }}</small></span><ChevronRight :size="20" /></button>
        <p v-if="scan.unlocated || scan.htmlImages || scan.references.length > 25" class="sheet-hint">部分引用无法定位，当前显示前 25 处。</p>
      </section>
      <section v-show="view === 'replace'">
        <div class="image-task-file"><strong>{{ replacement?.alt || '未填写说明' }}</strong><small>只替换第 {{ replacementNumber }} 处图片引用</small></div>
        <details><summary>引用位置</summary><code>{{ replacement?.href }}</code></details>
        <div class="image-task-links"><button class="image-task-row" :disabled="working" @click="showHistory"><span><strong>从导入记录选择</strong></span><ChevronRight :size="20" /></button></div>
      </section>
      <section v-show="view === 'history'">
        <div class="image-task-toolbar"><button class="icon-button" aria-label="刷新图片记录" :disabled="working" @click="refresh"><RefreshCw :size="21" /></button></div>
        <p v-if="unreadable" class="recovery-error">{{ unreadable }} 条记录暂时无法读取，恢复文件仍保留。</p>
        <p v-if="!records.length && !working && !error" class="subtle-message">暂无导入记录。</p>
        <button v-for="record in records" :key="record.id" :data-image-id="record.id" class="image-task-row image-import-record" :disabled="working" @click="inspect(record)"><span><strong>{{ record.name }}</strong><small>{{ record.status === 'ready' ? '图片副本已确认' : '导入未确认' }} · {{ record.width }} × {{ record.height }}</small><small v-if="!note">{{ libraryName(record.rootId) }} · {{ record.notePath }}</small></span><ChevronRight :size="20" /></button>
        <p v-if="truncated" class="sheet-hint">先显示最近 25 条，其他记录仍保留。</p>
      </section>
      <section v-show="view === 'detail'" :class="{'image-unavailable-page':!preview}">
        <template v-if="!preview">
          <div class="image-unavailable-illustration" aria-hidden="true"><ImageIcon class="image-unavailable-picture" :size="96" :stroke-width="1.5" /><Ban class="image-unavailable-badge" :size="42" aria-hidden="true" /></div>
          <h3>图片暂不可用</h3>
          <p class="image-unavailable-path">{{ selected?.imagePath || selected?.name }}</p>
          <p ref="errorElement" tabindex="-1" :role="error || selected?.error ? 'alert' : 'status'" class="image-unavailable-reason">{{ working ? '正在读取图片…' : error || selected?.error || '无法显示该图片：文件不存在或已损坏。' }}</p>
        </template>
        <template v-else>
          <div class="image-import-preview"><img :src="preview.dataUrl" :alt="replacement?.alt || alt || selected?.name || '图片预览'" /></div>
          <div class="image-task-file"><strong>{{ selected?.name }}</strong><small>{{ preview.width }} × {{ preview.height }} · {{ Math.ceil(preview.bytes / 1024) }} KiB</small><small v-if="!note && selected">{{ libraryName(selected.rootId) }} · {{ selected.notePath }}</small></div>
          <p v-if="selected?.status !== 'ready'" class="image-task-status">导入未确认，正文未改动</p>
          <p v-if="selected?.error && !error" class="recovery-error" role="alert">{{ selected.error }}</p>
          <details><summary>文件位置</summary><code>{{ selected?.imagePath || '尚未确认目标位置' }}</code><small v-if="!note">{{ selected?.notePath }}</small></details>
        </template>
        <details v-if="selected?.previousPaths?.length"><summary>较早尝试的副本位置</summary><code v-for="path in selected.previousPaths" :key="path">{{ path }}</code></details>
      </section>
    </div>
    <footer v-show="showFooter" class="image-task-footer">
      <button v-show="view === 'compose' || view === 'replace'" class="button primary-button" :disabled="working || !canWrite" @click="choose"><ImagePlus :size="19" />{{ view === 'replace' ? '选择新图片' : '选择图片' }}</button>
      <button v-if="view === 'detail' && !preview && note && canWrite" class="button primary-button" aria-label="重新选择图片" :disabled="working" @click="choose">重新选择</button>
      <button v-if="view === 'detail' && !preview" class="button" :class="{'primary-button':!note || !canWrite}" aria-label="重试：重新读取图片" :disabled="working" @click="readPreview">重试</button>
      <button v-show="view === 'detail' && !!preview && selected?.status !== 'ready'" class="button primary-button" :disabled="working || (!!note && !canWrite)" @click="retry">{{ note ? '重试导入' : '在原位置重试' }}</button>
      <button v-show="view === 'detail' && !!preview && selected?.status === 'ready' && note && canWrite" class="button primary-button" :disabled="working || !preview" @click="use">{{ replacement ? '替换这一处图片' : placement === '选中文字' ? '替换选中文字' : `插入${placement}` }}</button>
    </footer>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ChevronRight, ImagePlus, Image as ImageIcon, Ban, RefreshCw } from 'lucide-vue-next'
import { humanStorageError, type Identity, type ImageImport, type Library, type Storage, type StoredImage } from './storage'
import { scanImageReferences, type ImageReference } from './imageReferences'
import { relativeImagePath } from './readingState'
import { captureTaskPosition, restoreTaskPosition, type TaskPosition } from './taskPosition'
const props = defineProps<{ storage: Storage; libraries?: Library[]; note?: Identity; content: string; canWrite: boolean; placement: string; place: (image: ImageImport, reference: ImageReference | null, alt: string) => Promise<void> }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
type View = 'compose' | 'references' | 'replace' | 'history' | 'detail'
const view = ref<View>(props.note ? 'compose' : 'history'), body = ref<HTMLElement>(), fileInput = ref<HTMLInputElement>(), errorElement = ref<HTMLElement>()
const alt = ref(''), busy = ref(false), picking = ref(false), moving = ref(false), working = computed(() => busy.value || picking.value || moving.value), checking = ref(false)
const records = ref<ImageImport[]>([]), truncated = ref(false), unreadable = ref(0), replacement = ref<ImageReference | null>(null)
const selected = ref<ImageImport | null>(null), preview = ref<StoredImage | null>(null), checks = ref<Record<number, string>>({})
const messages = reactive<Record<View, { error: string; status: string }>>(Object.fromEntries(['compose','references','replace','history','detail'].map(v => [v, { error: '', status: '' }])) as Record<View, { error: string; status: string }>)
const error = computed(() => messages[view.value].error), status = computed(() => messages[view.value].status)
const scan = computed(() => props.note ? scanImageReferences(props.content) : { references: [], unlocated: 0, htmlImages: false })
const replacementNumber = computed(() => scan.value.references.findIndex(reference => reference.from === replacement.value?.from) + 1)
const title = computed(() => ({ compose: '图片与附件', references: '笔记中的图片', replace: '替换图片', history: '图片导入记录', detail: selected.value?.name || '图片详情' }[view.value]))
const frames: { view: View; position: TaskPosition; replacement: ImageReference | null }[] = []
const depth = ref(0), canBack = computed(() => depth.value > 0)
const showFooter = computed(() => view.value === 'compose' || view.value === 'replace' || (view.value === 'detail' && (!preview.value || selected.value?.status !== 'ready' || (!!props.note && props.canWrite))))
let alive = true, generation = 0, pickerPosition: TaskPosition | null = null
function libraryName(id: string) { return props.libraries?.find(library => library.id === id)?.name || (id === 'local' ? '手机资料库' : '来源资料库') }
function scroller() { const sheet = body.value?.closest<HTMLElement>('.bottom-sheet'); return sheet && getComputedStyle(sheet).overflowY === 'auto' ? sheet : body.value }
function position() { return captureTaskPosition(scroller()) }
function revealFocus() {
  const element = document.activeElement as HTMLElement | null, scroll = scroller(), header = body.value?.closest('.bottom-sheet')?.querySelector('.sheet-heading')?.getBoundingClientRect()
  if (!element || !scroll?.contains(element)) return
  const box = element.getBoundingClientRect(), bounds = scroll.getBoundingClientRect()
  if (box.top < Math.max(bounds.top, header?.bottom || 0) || box.bottom > bounds.bottom) element.scrollIntoView({ block: 'center' })
}
async function focusHeading() { await nextTick(); const heading = body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('.sheet-heading h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) } }
async function enter(next: View, parentPosition = position()) {
  moving.value = true
  try { frames.push({ view: view.value, position: parentPosition, replacement: replacement.value }); depth.value = frames.length
    view.value = next; await nextTick(); scroller()?.scrollTo(0, 0); await focusHeading()
  } finally { moving.value = false }
}
async function run(action: () => Promise<void>) {
  if (working.value) return
  const owner = view.value; busy.value = true; messages[owner].error = ''; messages[owner].status = ''
  try { await action() } catch (failure) { if (alive) messages[view.value].error = humanStorageError(failure) }
  finally { busy.value = false; await nextTick(); if (alive && error.value) { errorElement.value?.focus({ preventScroll: true }); errorElement.value?.scrollIntoView({ block: 'nearest' }) } }
}
async function load() { const result = await props.storage.imageImports(props.note); if (alive) { records.value = result.entries; truncated.value = result.truncated; unreadable.value = result.unreadable || 0 } }
const refresh = () => run(load)
async function showHistory() { if (working.value) return; await enter('history'); await refresh() }
async function showReferences() { if (working.value) return; await enter('references'); void checkReferences() }
async function showReplacement(reference: ImageReference) { if (working.value) return; await enter('replace'); replacement.value = reference }
async function loadPreview() { preview.value = null; if (selected.value) { const image = await props.storage.imageImportPreview(selected.value.id); if (alive) preview.value = image } }
const readPreview = () => run(loadPreview)
async function inspect(record: ImageImport) { if (working.value) return; selected.value = record; preview.value = null; messages.detail = { error: '', status: '' }; await enter('detail'); await readPreview() }
async function review(record: ImageImport, parentPosition: TaskPosition) {
  selected.value = record; preview.value = null; messages.detail = { error: '', status: '' };
  const merged = [record, ...records.value.filter(item => item.id !== record.id)].sort((a,b) => b.created-a.created)
  truncated.value ||= merged.length > 25; records.value = merged.slice(0,25)
  if (view.value === 'detail') { await nextTick(); scroller()?.scrollTo(0, 0); await focusHeading() }
  else await enter('detail', parentPosition)
  await loadPreview()
}
function choose(event: MouseEvent) {
  if (working.value || !props.note || !props.canWrite) return
  pickerPosition = { ...position(), focus: event.currentTarget as HTMLElement }
  if (props.storage.preview) { picking.value = true; fileInput.value?.click() }
  else void importSelected(pickerPosition)
}
async function importSelected(parent: TaskPosition, file?: File) {
  pickerPosition = parent
  const owner = view.value, previous = { ...messages[owner] }; let cancelled = false
  await run(async () => { const record = await props.storage.importImage(props.note!, file); if (!alive) return
    if (!record) { messages[owner] = previous; cancelled = true }
    else { pickerPosition = null; await review(record, parent) }
  })
  if (!alive) return
  if (cancelled) await cancelPicker()
  else pickerPosition = null
}
async function cancelPicker() { picking.value = false; messages[view.value].status = ''; await nextTick(); restoreTaskPosition(pickerPosition); pickerPosition = null }
function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], parent = pickerPosition || position()
  input.value = ''; picking.value = false; pickerPosition = null
  if (file && props.note && props.canWrite) void importSelected(parent, file)
  else { pickerPosition = parent; void cancelPicker() }
}
const retry = () => run(async () => {
  if (!selected.value) return
  const result = await props.storage.retryImage(selected.value.id)
  if (!alive) return
  selected.value = result; records.value = records.value.map(r => r.id === result.id ? result : r)
  await loadPreview()
})
const use = () => run(async () => {
  if (!props.note || !props.canWrite || selected.value?.status !== 'ready' || !preview.value) return
  const reviewed = preview.value
  preview.value = null
  const current = await props.storage.imageImportPreview(selected.value.id)
  if (!alive) return
  preview.value = current
  if (current.dataUrl !== reviewed.dataUrl || current.width !== reviewed.width || current.height !== reviewed.height || current.bytes !== reviewed.bytes) throw new Error('图片内容已变化，请重新核对后再确认；正文未改动。')
  await props.place(selected.value, replacement.value, alt.value || selected.value.name.replace(/\.[^.]+$/, ''))
})
async function checkReferences() {
  if (!props.note) return
  const owner = ++generation, cache = new Map<string, string>(); checking.value = true
  for (const reference of scan.value.references.slice(0, 25)) {
    if (!alive || owner !== generation) return
    const path = relativeImagePath(props.note.relativePath, reference.href)
    let result = '地址不支持'
    if (path) { result = cache.get(path) || ''; if (!result) { try { await props.storage.readImage({ rootId: props.note.rootId, relativePath: path }); result = '可读取' } catch (failure) { result = humanStorageError(failure) }; cache.set(path, result) } }
    if (alive && owner === generation) checks.value[reference.from] = result
  }
  if (alive && owner === generation) checking.value = false
}
function back() {
  if (working.value) return true
  const frame = frames.pop(); if (!frame) return false
  depth.value = frames.length; view.value = frame.view; replacement.value = frame.replacement
  void nextTick().then(() => { if (alive) { restoreTaskPosition(frame.position); revealFocus() } })
  return true
}
watch(working, value => emit('busy', value), { flush: 'sync' })
onMounted(() => { if (!props.note) void refresh() })
onBeforeUnmount(() => { alive = false; generation++; emit('busy', false) })
defineExpose({ back, canBack, title })
</script>
<style scoped>
.image-attachments{display:flex;flex-direction:column;flex:1;min-height:0}.image-task-body{padding:16px;overflow:auto;min-height:0;flex:1;overscroll-behavior:contain}.image-task-file{padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.image-task-file strong{display:block;font-size:1.125rem;line-height:1.6;overflow-wrap:anywhere}.image-task-file small,.image-task-row small{display:block;font-size:.875rem;color:var(--muted);line-height:1.6;overflow-wrap:anywhere}.image-task-body>.recovery-error{margin-top:0}.image-task-body .input-label{font-size:.875rem;margin:24px 0 8px}.image-task-links{margin-top:24px}.image-task-row{display:flex;align-items:center;gap:12px;text-align:left;width:100%;min-height:80px;padding:16px 8px;border:0;border-bottom:1px solid var(--line);background:transparent;color:inherit;font:inherit;border-radius:0;margin:0}.image-task-row>span{flex:1;min-width:0}.image-task-row strong{display:block;font-size:1rem;line-height:1.6}.image-task-row>svg{flex-shrink:0}.image-task-row:focus-visible{outline-offset:-2px}.image-task-row:active{background:var(--primary-soft)}.image-task-toolbar{display:flex;justify-content:flex-end;min-height:48px}.image-task-body details{font-size:.875rem;margin-top:24px;overflow-wrap:anywhere}.image-task-body summary{min-height:48px;display:list-item;padding:12px 0;cursor:pointer}.image-task-body code{font-size:.875rem;line-height:1.7}.image-task-status{font-size:.875rem;line-height:1.6;background:var(--primary-soft);padding:12px;border-radius:12px;margin:16px 0}.image-import-preview{height:224px;margin-bottom:16px;display:grid;place-items:center;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.image-import-preview img{max-width:100%;max-height:100%;height:auto;object-fit:contain;display:block;margin:0}.image-task-footer{flex-shrink:0;border-top:1px solid var(--line);padding:12px 16px max(16px,env(safe-area-inset-bottom));background:var(--bg)}.image-task-footer .button,.image-task-footer .text-button{width:100%;min-height:48px;font-size:1rem;line-height:1.5;padding:10px 16px}.image-attachments button{-webkit-tap-highlight-color:transparent}.image-task-body .sheet-hint{font-size:.875rem;line-height:1.6}
.image-import-preview.is-unavailable{height:96px;color:var(--muted)}
.image-task-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}
.image-task-body .recovery-error{color:var(--ink);background:var(--warning-soft);border:1px solid var(--warning-line);font-size:.875rem;line-height:1.7;overflow-wrap:anywhere}
.image-task-footer{display:flex;flex-direction:column;gap:8px}.image-task-footer .button,.image-task-footer .text-button{margin:0;justify-content:center}
.image-unavailable-page{text-align:center;flex:none;margin-top:auto}.image-unavailable-illustration{position:relative;display:grid;place-items:center;width:164px;height:164px;margin:0 auto 16px;background:linear-gradient(160deg,var(--panel),var(--line));border-radius:16px;color:var(--muted)}.image-unavailable-picture{opacity:.62}.image-unavailable-badge{position:absolute;right:22px;bottom:22px;padding:3px;border-radius:50%;background:var(--line)}.image-unavailable-page h3{font-size:1.25rem;line-height:1.5;margin:0 0 8px}.image-unavailable-path,.image-unavailable-reason{overflow-wrap:anywhere;font-size:1rem;line-height:1.6;color:var(--muted);margin:8px 0}.image-unavailable-reason:focus{outline:none}.image-attachments.is-missing>.image-task-body{display:flex;flex-direction:column;justify-content:flex-start;padding:32px 16px 24px}.is-missing>.image-task-footer{border:0;padding:12px 16px max(16px,26dvh)}.is-missing>.image-task-footer>.button:not(.primary-button){border-color:var(--primary);color:var(--primary);background:transparent}
@media(max-height:700px){.image-attachments.is-missing>.image-task-body{display:block;padding-top:24px}.is-missing>.image-task-footer{padding-bottom:max(16px,env(safe-area-inset-bottom))}.image-unavailable-illustration{width:112px;height:112px}.image-unavailable-picture{width:68px;height:68px}.image-unavailable-badge{right:12px;bottom:12px;width:32px;height:32px}}
@media(max-width:340px) and (max-height:650px){.image-attachments.is-missing>.image-task-body{padding-top:12px}.image-unavailable-illustration{width:84px;height:84px;margin-bottom:12px}.image-unavailable-picture{width:52px;height:52px}.image-unavailable-badge{right:7px;bottom:7px;width:26px;height:26px}}
</style>
