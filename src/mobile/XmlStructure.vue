<template>
  <section ref="panel" class="xml-structure structured-task" aria-label="XML 结构浏览">
    <header class="xml-task-header structured-header"><button class="xml-task-icon structured-icon" :aria-label="backLabel" @click="headerBack"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1"><template v-if="current?.parent===null&&mode==='detail'&&!attribute"><span>{{ name.replace(/\.[^.]+$/,'') }}</span><wbr /><span>{{ /\.[^.]+$/.exec(name)?.[0] }}</span></template><template v-else>{{ title }}</template></h1><button v-if="mode==='detail'&&!attribute" ref="filterButton" class="structured-icon" aria-label="筛选本层" :aria-expanded="filterOpened" @click="openFilter"><Search :size="21" /></button><MobileHelp topic="xmlValue" /><button v-if="mode==='edit'" class="structured-icon" aria-label="取消修改" @click="cancelEdit"><X :size="21" /></button></header>
    <div v-if="mode==='detail'&&current?.parent===null&&!attribute" class="structured-tabs" role="group" aria-label="XML 视图"><button aria-pressed="true">结构</button><button @click="emit('source')">源码</button></div>
    <div ref="body" class="xml-task-body structured-body">
      <div v-if="current?.parent!==null||attribute||mode!=='detail'" class="xml-context structured-context"><Folder :size="22" aria-hidden="true" /><div class="xml-location structured-location" role="group" aria-label="当前 XML 位置">{{ location }}</div><p class="xml-filename structured-filename">{{ name }}</p></div>
      <section v-if="!elements || mode === 'preparing'" class="xml-status-card structured-card structured-status-card">
        <div class="xml-status-result structured-status-result" :class="{ 'structured-status-error': status === 'error' && mode !== 'preparing' }"><svg v-if="busy" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="status === 'error' ? CircleAlert : CircleHelp" :size="22" aria-hidden="true" /><h2 class="xml-status-title" role="status">{{ mode === 'preparing' ? '正在核对修改…' : statusTitle }}</h2></div>
        <p v-if="message && mode !== 'preparing'" class="xml-message structured-message">{{ message }}</p>
      </section>
      <template v-else-if="current">
        <template v-if="mode === 'detail'">
          <template v-if="!attribute">
            <div v-if="filterOpened" class="structured-filter"><label class="assistive-status" for="xml-level-filter">筛选本层元素或属性</label><Search :size="20" /><input id="xml-level-filter" v-model="query" maxlength="128" type="search" class="name-input" placeholder="筛选本层" @input="page=0" /></div><div v-else-if="query" class="structured-filter-summary"><button class="text-button" @click="openFilter">筛选：{{ query }}</button><button class="structured-icon" aria-label="清除本层筛选" @click="query='';page=0"><X :size="20" /></button></div>
            <p v-if="query||pages>1" class="xml-count structured-count" role="status">{{ matches.length }} 项<template v-if="pages>1"> · 第 {{ page+1 }} / {{ pages }} 页</template></p>
            <StructuredRows format="xml" :rows="treeRows" :expanded="expanded" @expand="toggleExpanded" @select="selectTree" />
            <section v-if="!current.children.length&&!current.attributes.length" class="structured-card"><h2>元素源码</h2><SourceFragment :value="preview(content.slice(current.from,current.to))" language="xml" label="XML 元素原文" /></section>
            <p v-if="!matches.length&&!current.preview" class="xml-message structured-message">{{ query ? '本层没有匹配项，可清空筛选。' : '这个元素没有属性或子元素。' }}</p>
            <div v-if="pages > 1" class="inline-actions"><button class="button" :disabled="page === 0" @click="changePage(-1)">上一页项目</button><button class="button" :disabled="page + 1 >= pages" @click="changePage(1)">下一页项目</button></div>
          </template>
          <template v-else>
            <div class="xml-value-views structured-value-views" role="group" aria-label="属性显示方式"><button class="button" :aria-pressed="valueView === 'decoded'" @click="setView('decoded')">属性文字</button><button class="button" :aria-pressed="valueView === 'raw'" @click="setView('raw')">原始写法</button></div>
            <section class="xml-value-card structured-card"><h2>{{ valueView === 'decoded' ? '属性文字' : '引号内的原始写法' }}</h2><pre class="structured-value kind-string" ref="detailValue" role="group" tabindex="0" :aria-label="valueView === 'decoded' ? 'XML 属性文字' : 'XML 属性原文'">{{ preview(detailText) || '（空属性值）' }}</pre><p v-if="detailText.length > 1600" class="xml-preview-notice structured-notice">预览已省略中间部分，可前往源码查看全文。</p></section>
            <p v-if="!attribute.editable" class="xml-message structured-message">{{ attribute.reason }}</p>
          </template>
          <button v-if="!attribute||!attribute.editable" class="structured-secondary xml-source-action" @click="locate(attribute?.from ?? current.from)">前往这段源码</button>
        </template>
        <form v-else-if="mode === 'edit' && edit" id="xml-value-form" class="xml-value-form structured-form" aria-label="修改 XML 属性" @submit.prevent="prepare">
          <label class="input-label" for="xml-value">属性文字</label><textarea id="xml-value" ref="valueInput" aria-label="新的属性文字（无需引号或转义）" v-model="edit.input" :maxlength="XML_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="!!edit.error" :aria-describedby="edit.error ? 'xml-value-error' : undefined" spellcheck="false" @input="changedInput" @select="rememberInput" @scroll="rememberInput" @blur="rememberInput" />
          <p v-if="edit.error" id="xml-value-error" class="xml-value-error structured-error" role="alert">{{ edit.error }}</p>
        </form>
        <div v-else-if="mode === 'review' && proposal" class="xml-review structured-review" role="group" aria-label="核对 XML 属性修改">
          <section class="xml-value-card structured-card"><h2>原始写法</h2><pre class="structured-value kind-string" role="group" tabindex="0" aria-label="XML 属性原文">{{ preview(raw) || '（空属性值）' }}</pre><p v-if="raw.length > 1600" class="xml-preview-notice structured-notice">预览已省略中间部分，可前往源码查看全文。</p></section>
          <section class="xml-value-card structured-card is-candidate"><h2>修改后</h2><pre class="structured-value kind-string" role="group" tabindex="0" aria-label="修改后的 XML 属性原文">{{ preview(proposal.text) || '（空属性值）' }}</pre><p v-if="proposal.text.length > 1600" class="xml-preview-notice structured-notice">预览已省略中间部分；应用使用完整内容。</p></section>
          <p v-if="proposal.text === raw" class="xml-message structured-message" role="status">原值无需修改。</p>
        </div>
        <button v-if="mode==='review'" class="structured-secondary" @click="returnEdit">继续修改</button>
      </template>
    </div>
    <footer v-if="!elements||mode==='preparing'||attribute?.editable" class="xml-task-footer structured-footer"><template v-if="!elements"><button v-if="busy" class="button primary-button" @click="cancelInspect">停止结构分析</button><button v-else class="button primary-button" @click="errorOffset===undefined?inspect():locate(errorOffset)">{{ errorOffset===undefined?'重新浏览结构':'前往问题源码' }}</button></template><button v-else-if="mode==='preparing'" class="button primary-button" @click="cancelPrepare">停止核对</button><template v-else-if="mode==='detail'"><button ref="editButton" class="button primary-button" @click="startEdit"><PenLine :size="21" />{{ pending.has(attributeKey)?'继续修改':'修改' }}</button><button class="button structured-source-action" aria-label="前往这段源码" @click="locate(attribute!.from)"><Code2 :size="22" /></button></template><button v-else-if="mode==='edit'" type="submit" form="xml-value-form" class="button primary-button" @pointerdown="saveEdit"><Check :size="22" />核对这次修改</button><button v-else class="button primary-button" :disabled="!proposal||proposal.text===raw" @click="apply"><Check :size="22" />应用到草稿</button></footer>
  </section>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import StructuredRows from './StructuredRows.vue'
import SourceFragment from './SourceFragment.vue'
import {structuredTreeRows,initialStructuredExpansion,type StructuredNode} from './structuredTree'
import {useJsonFieldVisibility} from './useJsonFieldVisibility'
import { ArrowLeft, CircleAlert, CircleHelp, Search, Folder, X, Check, Code2, PenLine } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { XML_SOURCE_BUDGET } from './xmlBudget'
import { XML_STRUCTURE_BUDGET } from './xmlStructureBudget'
import type { XmlAttributePatch, XmlElement, XmlStructure } from './xmlStructure'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ apply: [value: XmlAttributePatch]; locate: [value: { source: string; offset: number }]; close: []; edit: []; source: [] }>()
type Mode = 'detail' | 'edit' | 'preparing' | 'review'
type ValueView = 'decoded' | 'raw'
type Position = { start: number; end: number; direction: 'forward' | 'backward' | 'none'; top: number; left: number }
type ValueEdit = { input: string; error: string; position?: Position; bodyScroll: number }
type DetailPlace = { view: ValueView; scroll: number; values: Partial<Record<ValueView, { top: number; left: number }>> }
const panel = ref<HTMLElement>(), body = ref<HTMLElement>(), heading = ref<HTMLElement>(), valueInput = ref<HTMLTextAreaElement>(), detailValue = ref<HTMLElement>(), editButton = ref<HTMLButtonElement>()
const elements = shallowRef<XmlElement[]>(), selected = ref(0), selectedAttribute = ref<number | null>(null), query = ref(''), page = ref(0), busy = ref(false), message = ref(''), errorOffset = ref<number>(), mode = ref<Mode>('detail'), valueView = ref<ValueView>('decoded')
const status = ref<'loading' | 'error' | 'unavailable' | 'stopped' | 'changed'>('loading')
const edit = ref<ValueEdit | null>(null), pending = ref(new Map<string, ValueEdit>()), proposal = shallowRef<XmlAttributePatch | null>(null)
const current = computed(() => elements.value?.[selected.value]), attribute = computed(() => selectedAttribute.value === null ? undefined : current.value?.attributes[selectedAttribute.value]), attributeKey = computed(() => selected.value + ':' + selectedAttribute.value)
const raw = computed(() => attribute.value ? props.content.slice(attribute.value.from, attribute.value.to) : ''), detailText = computed(() => valueView.value === 'raw' ? raw.value : attribute.value?.value || '')
const label = (element: XmlElement) => element.name + '[' + element.occurrence + ']'
const short = (text: string, limit: number) => { const points = Array.from(text); return points.slice(0, limit).join('') + (points.length > limit ? '…' : '') }
const entries = computed(() => !current.value ? [] : [
  ...current.value.attributes.map((a, i) => ({ key: 'a' + i, attribute: i as number | null, id: selected.value, label: '@' + a.name, preview: '属性 · ' + (short(a.value, 160) || '（空）'), search: a.name + '\n' + a.value })),
  ...current.value.children.map(id => { const element = elements.value![id]!, preview = element.attributes.filter(a => a.name !== 'xmlns' && !a.name.startsWith('xmlns:')).slice(0, 3).map(a => a.name + '=' + short(a.value, 60)).join(' · '); return { key: 'e' + id, attribute: null as number | null, id, label: label(element), preview: preview || element.attributes.length + ' 个属性 · ' + element.children.length + ' 个子元素', search: element.name + '\n' + preview } })
])
const matches = computed(() => entries.value.filter(field => !query.value || field.search.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / XML_STRUCTURE_BUDGET.page))), visible = computed(() => matches.value.slice(page.value * XML_STRUCTURE_BUDGET.page, (page.value + 1) * XML_STRUCTURE_BUDGET.page))
const location = computed(() => { const path: string[] = []; let element = current.value; while (element) { path.unshift(label(element)); element = element.parent === null ? undefined : elements.value![element.parent] }; return '/' + path.join('/') + (attribute.value ? '/@' + attribute.value.name : '') })
const title = computed(() => mode.value === 'review' || mode.value === 'preparing' ? '核对修改' : mode.value === 'edit' ? '修改属性' : attribute.value ? '@' + attribute.value.name : current.value?.parent !== null && current.value?.parent !== undefined ? label(current.value) : props.name)
const backLabel = computed(() => mode.value === 'review' || mode.value === 'preparing' ? '返回修改' : mode.value === 'edit' ? '返回属性详情' : attribute.value || current.value?.parent !== null && current.value?.parent !== undefined ? '返回上一层' : '返回源码')
const statusTitle = computed(() => ({ loading: '正在读取结构…', error: '暂时无法浏览', unavailable: '暂不浏览', stopped: '分析已停止', changed: '需要重新读取' })[status.value])
const places = new Map<number, { query: string; page: number; scroll: number; focus?: string }>(), details = new Map<string, DetailPlace>()
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, active = true, needsInspect = false, reviewScroll = 0
const expanded=ref(new Set<string>()),filterOpened=ref(false),filterButton=ref<HTMLButtonElement>();let editRequested=false;const trail:number[]=[]
const nodes = computed(() => {
  const result = new Map<string, StructuredNode>(), counts = new Map<string, number>()
  for (const element of elements.value || []) {
    const key = JSON.stringify([element.parent, element.name])
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  for (const element of elements.value || []) {
    const key = 'e' + element.id
    const repeated = (counts.get(JSON.stringify([element.parent, element.name])) || 0) > 1
    const container = element.children.length > 0 || element.attributes.length > 0
    const attributes = element.attributes.filter(a => a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
      .slice(0, 3).map(a => a.name + '=' + short(a.value, 60))
    result.set(key, {
      key,
      label: element.name + (repeated ? '[' + element.occurrence + ']' : ''),
      kind: container ? 'element' : 'string',
      value: element.textPreview || element.preview,
      children: element.children.map(id => 'e' + id),
      container,
      attributes,
    })
  }
  current.value?.attributes.forEach((attribute, index) => {
    const key = 'a' + index
    result.set(key, { key, label: '@' + attribute.name, kind: 'string', value: short(attribute.value, 160), children: [], container: false })
  })
  return result
})
const treeRoots=computed(()=>current.value?.parent===null&&!query.value?['e'+selected.value]:visible.value.map(field=>field.key))
const treeRows=computed(()=>structuredTreeRows(nodes.value,treeRoots.value,expanded.value))
const editError=computed(()=>edit.value?.error||'')
useJsonFieldVisibility(body,()=>active&&mode.value==='edit',editError)
function toggleExpanded(key:string){const next=new Set(expanded.value);if(next.has(key))next.delete(key);else next.add(key);expanded.value=next}
function selectTree(key:string){if(key.startsWith('e'))navigate(Number(key.slice(1)));else{const field=entries.value.find(v=>v.key===key);if(field)select(field)}}
async function openFilter(){filterOpened.value=true;await nextTick();panel.value?.querySelector<HTMLInputElement>('input[type=search]')?.focus()}
function preview(text: string) {
  if (text.length <= 1600) return text
  const splitPair = (at: number) => text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff
  return text.slice(0, splitPair(1200) ? 1199 : 1200) + '\n…\n' + text.slice(splitPair(text.length - 400) ? text.length - 399 : text.length - 400)
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined; busy.value = false }
function reset() { stop();trail.length=0; expanded.value=new Set();filterOpened.value=false;editRequested=false; elements.value = undefined; edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail'; errorOffset.value = undefined; places.clear(); details.clear(); selected.value = 0; selectedAttribute.value = null; query.value = ''; page.value = 0; reviewScroll = 0 }
function task(input: object, done: (value: XmlStructure & { patch?: XmlAttributePatch; error?: string }) => void, fail: (text: string) => void) {
  stop(); const source = props.content, identity = props.identity, owner = generation
  if (source.length > XML_SOURCE_BUDGET.characters) { fail('这份 XML 较大，请使用源码查找；正文仍完整保留。'); return }
  busy.value = true
  const failed = (text: string) => { stop(); fail(text) }
  try {
    worker = new Worker(new URL('./xmlStructure.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => { if (!active || owner !== generation || source !== props.content || identity !== props.identity) return; stop(); done(event.data) }
    worker.onerror = event => { event.preventDefault(); if (active && owner === generation) failed('暂时无法完成结构任务，请返回源码或重试；正文与草稿继续保留。') }
    timer = setTimeout(() => { if (active && owner === generation) failed('结构任务时间较长，已停止；正文与草稿继续保留。') }, XML_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source, ...input })
  } catch { failed('暂时无法完成结构任务，请返回源码或重试；正文与草稿继续保留。') }
}
function inspect() { needsInspect = false; reset(); status.value = 'loading'; message.value = ''; task({}, value => { elements.value = value.elements; expanded.value=initialStructuredExpansion(nodes.value,treeRoots.value); if (!value.elements) { status.value = 'error'; message.value = value.message || value.error || '暂时无法浏览结构，请返回源码或重试。'; errorOffset.value = value.offset }; void focusHeading() }, text => { status.value = props.content.length > XML_SOURCE_BUDGET.characters ? 'unavailable' : 'error'; message.value = text; void focusHeading() }) }
function cancelInspect() { stop(); status.value = 'stopped'; message.value = ''; void focusHeading() }
async function focusHeading() { await nextTick(); if (active) heading.value?.focus({ preventScroll: true }) }
function savePlace() { const target = document.activeElement?.closest<HTMLElement>('[data-field-key]'); places.set(selected.value, { query: query.value, page: page.value, scroll: body.value?.scrollTop || 0, focus: target?.dataset.fieldKey }) }
async function restorePlace(focus?: string) { await nextTick(); if (!active) return; const place = places.get(selected.value); if (body.value) body.value.scrollTop = place?.scroll || 0; const target = panel.value?.querySelector<HTMLElement>('[data-field-key="' + (focus ?? place?.focus) + '"]'); (target || heading.value)?.focus({ preventScroll: true }) }
function saveDetail() { if (!attribute.value) return; const place = details.get(attributeKey.value) || { view: valueView.value, scroll: 0, values: {} }; place.view = valueView.value; place.scroll = body.value?.scrollTop || 0; place.values[valueView.value] = { top: detailValue.value?.scrollTop || 0, left: detailValue.value?.scrollLeft || 0 }; details.set(attributeKey.value, place) }
async function restoreDetail() { const place = details.get(attributeKey.value); valueView.value = place?.view || 'decoded'; await nextTick(); if (!active) return; if (body.value) body.value.scrollTop = place?.scroll || 0; if (detailValue.value) { detailValue.value.scrollTop = place?.values[valueView.value]?.top || 0; detailValue.value.scrollLeft = place?.values[valueView.value]?.left || 0 }; heading.value?.focus({ preventScroll: true }) }
async function setView(view: ValueView) { saveDetail(); valueView.value = view; const place = details.get(attributeKey.value); if (place) place.view = view; await nextTick(); if (detailValue.value) { detailValue.value.scrollTop = place?.values[view]?.top || 0; detailValue.value.scrollLeft = place?.values[view]?.left || 0 } }
function navigate(id: number,push=true) { if(id===selected.value)return;savePlace();if(push)trail.push(selected.value); selected.value = id; selectedAttribute.value = null; const place = places.get(id); query.value = place?.query || ''; page.value = place?.page || 0; mode.value = 'detail'; edit.value = null; proposal.value = null; void restorePlace() }
function select(field: typeof entries.value[number]) { if (field.attribute === null) navigate(field.id); else { savePlace(); selectedAttribute.value = field.attribute; mode.value = 'detail'; void restoreDetail() } }
async function up() { if (attribute.value) { const key = 'a' + selectedAttribute.value; saveDetail(); selectedAttribute.value = null; await restorePlace(key) } else { const node = current.value; if (!node || node.parent === null) return; navigate(trail.pop()??node.parent,false); await restorePlace('e' + node.id) } }
async function changePage(direction: number) { page.value += direction; await nextTick(); body.value?.scrollTo(0, 0); panel.value?.querySelector<HTMLElement>('.xml-field')?.focus({ preventScroll: true }) }
function rememberInput() { const input = valueInput.value, value = edit.value; if (!input || !value || mode.value !== 'edit') return; value.position = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection, top: input.scrollTop, left: input.scrollLeft } }
function saveEdit() { const value = edit.value; if (!value) return; rememberInput(); value.bodyScroll = body.value?.scrollTop || 0; pending.value.set(attributeKey.value, { ...value, position: value.position && { ...value.position } }) }
function changedInput() { if (edit.value) edit.value.error = ''; rememberInput() }
async function restoreEdit() { await nextTick(); if (!active || !edit.value) return; if (body.value) body.value.scrollTop = edit.value.bodyScroll; const input = valueInput.value, place = edit.value.position; if (input) { input.setSelectionRange(place?.start ?? 0, place?.end ?? 0, place?.direction); input.scrollTop = place?.top || 0; input.scrollLeft = place?.left || 0; input.focus({ preventScroll: true }) } }
async function startEdit() { if (!attribute.value?.editable) return; if(!props.editing){editRequested=true;emit('edit');return}; saveDetail(); const continuing = pending.value.has(attributeKey.value); edit.value = pending.value.get(attributeKey.value) || { input: attribute.value.value, error: '', bodyScroll: 0 }; proposal.value = null; mode.value = 'edit'; await restoreEdit(); if (!continuing) valueInput.value?.scrollIntoView({ block: 'nearest' }) }
async function detail() { saveEdit(); mode.value = 'detail'; proposal.value = null; await restoreDetail(); editButton.value?.focus({ preventScroll: true }) }
async function cancelEdit() { stop(); pending.value.delete(attributeKey.value); edit.value = null; proposal.value = null; mode.value = 'detail'; await restoreDetail(); editButton.value?.focus({ preventScroll: true }) }
async function returnEdit() { mode.value = 'edit'; proposal.value = null; await restoreEdit() }
function prepare() {
  if (!edit.value || !attribute.value?.editable || !props.editing) return
  saveEdit(); edit.value.error = ''; proposal.value = null; mode.value = 'preparing'; if (body.value) body.value.scrollTop = 0; void focusHeading()
  const failed = (text: string) => { if (!edit.value || !props.editing) return; edit.value.error = text; mode.value = 'edit'; void restoreEdit().then(() => panel.value?.querySelector('#xml-value-error')?.scrollIntoView({ block: 'nearest' })) }
  task({ id: selected.value, attribute: selectedAttribute.value, input: edit.value.input }, value => { if (!edit.value || !props.editing) return; if (!value.patch) { failed(value.error || '无法核对这次修改，请返回源码或重试。'); return }; proposal.value = value.patch; mode.value = 'review'; reviewScroll = 0; if (body.value) body.value.scrollTop = 0; void focusHeading() }, failed)
}
function cancelPrepare() { stop(); if (edit.value) edit.value.error = '核对已停止，可继续修改。'; mode.value = 'edit'; proposal.value = null; void restoreEdit() }
function apply() { if (mode.value === 'review' && proposal.value && props.editing && proposal.value.source === props.content && proposal.value.text !== raw.value) emit('apply', proposal.value) }
function locate(offset: number) { stop(); emit('locate', { source: props.content, offset }) }
function back() { if(mode.value==='detail'&&!attribute.value&&filterOpened.value){filterOpened.value=false;void nextTick(()=>filterButton.value?.focus());return true}; if (mode.value === 'preparing') cancelPrepare(); else if (mode.value === 'review') void returnEdit(); else if (mode.value === 'edit') void detail(); else if (attribute.value || current.value?.parent !== null && current.value?.parent !== undefined) void up(); else return false; return true }
function headerBack() { if (!back()) emit('close') }
function suspend() { if (mode.value === 'preparing') { stop(); mode.value = 'edit' }; if (mode.value === 'edit') saveEdit(); else if (mode.value === 'detail' && current.value) { if (attribute.value) saveDetail(); else savePlace() }; if (mode.value === 'review') reviewScroll = body.value?.scrollTop || 0; if (busy.value && !elements.value) needsInspect = true; stop(); active = false }
function resume() { active = true; if (needsInspect || (!busy.value && !elements.value && !message.value && status.value === 'loading')) inspect(); else if (mode.value === 'edit') void restoreEdit(); else if (mode.value === 'detail' && current.value) { if (attribute.value) void restoreDetail(); else void restorePlace() } else { void nextTick(() => { if (body.value) body.value.scrollTop = reviewScroll }); void focusHeading() } }
watch(() => [props.content, props.identity], () => { reset(); needsInspect = true; status.value = 'changed'; message.value = '正文已有变化，请重新浏览结构。' }, { flush: 'sync' })
watch(() => props.editing, editing => { if (!editing) { if (mode.value === 'preparing') stop(); edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail' } else if(editRequested){editRequested=false;void nextTick(startEdit)} })
defineExpose({ back, suspend, resume })
onMounted(inspect); onBeforeUnmount(stop)
</script>
