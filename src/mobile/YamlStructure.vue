<template>
  <section ref="panel" class="yaml-structure structured-task" aria-label="YAML 结构浏览">
    <header class="yaml-task-header structured-header"><button class="yaml-task-icon structured-icon" :aria-label="backLabel" @click="headerBack"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1"><template v-if="current?.parent===null&&mode==='detail'"><span>{{ name.replace(/\.[^.]+$/,'') }}</span><wbr /><span>{{ /\.[^.]+$/.exec(name)?.[0] }}</span></template><template v-else>{{ title }}</template></h1><button v-if="mode==='detail'&&container" ref="filterButton" class="structured-icon" aria-label="筛选本层" :aria-expanded="filterOpened" @click="openFilter"><Search :size="21" /></button><MobileHelp topic="yamlValue" /><button v-if="mode==='edit'" class="structured-icon" aria-label="取消修改" @click="cancelEdit"><X :size="21" /></button></header>
    <div v-if="mode==='detail'&&current?.parent===null" class="structured-tabs" role="group" aria-label="YAML 视图"><button aria-pressed="true">结构</button><button @click="emit('source')">源码</button></div>
    <div ref="body" class="yaml-task-body structured-body">
      <div v-if="current?.parent!==null||mode!=='detail'" class="yaml-context structured-context"><Folder :size="22" aria-hidden="true" /><div class="yaml-location structured-location" role="group" aria-label="当前 YAML 位置">{{ displayLocation }}</div><p class="yaml-filename structured-filename">{{ name }}</p></div>
      <section v-if="!fields||mode==='preparing'" class="yaml-status-card structured-card structured-status-card"><div class="yaml-status-result structured-status-result" :class="{'structured-status-error':status==='error'&&mode!=='preparing'}"><component :is="status==='error'?CircleAlert:CircleHelp" :size="24" aria-hidden="true" /><h2 class="yaml-status-title" role="status">{{ mode==='preparing'?'正在核对修改…':statusTitle }}</h2></div><p v-if="message&&mode!=='preparing'" class="yaml-message structured-message">{{ message }}</p><button v-if="!busy&&errorOffset!==undefined" class="structured-retry" @click="inspect">重新浏览结构</button></section>
      <template v-else-if="current">
        <template v-if="mode==='detail'">
          <template v-if="container">
            <div v-if="filterOpened" class="structured-filter"><label class="assistive-status" for="yaml-level-filter">筛选本层字段或值</label><Search :size="20" /><input id="yaml-level-filter" v-model="query" maxlength="128" type="search" class="name-input" placeholder="筛选本层" @input="page=0" /></div><div v-else-if="query" class="structured-filter-summary"><button class="text-button" @click="openFilter">筛选：{{ query }}</button><button class="structured-icon" aria-label="清除本层筛选" @click="query='';page=0"><X :size="20" /></button></div>
            <p v-if="query||pages>1" class="yaml-count structured-count" role="status">{{ matches.length }} 项<template v-if="pages>1"> · 第 {{ page+1 }} / {{ pages }} 页</template></p>
            <StructuredRows format="yaml" :rows="treeRows" :expanded="expanded" @expand="toggleExpanded" @select="navigate(Number($event))" />
            <p v-if="!matches.length" class="structured-message">{{ query?'本层没有匹配项，可清空筛选。':'这一层没有字段。' }}</p><div v-if="pages>1" class="inline-actions"><button class="button" :disabled="page===0" @click="changePage(-1)">上一页字段</button><button class="button" :disabled="page+1>=pages" @click="changePage(1)">下一页字段</button></div>
          </template>
          <template v-else><section class="yaml-value-card structured-card"><h2>{{ yamlKindLabel(current.kind) }} · 第 {{ current.line }} 行，第 {{ current.column }} 列</h2><SourceFragment :kind="current.kind" :value="preview(raw)" language="yaml" label="YAML 字段原值" /><p v-if="raw.length>1600" class="structured-notice">预览已省略中间部分，可前往源码查看全文。</p></section><p v-if="!current.editable" class="structured-message">{{ current.reason }}</p></template>
          <button v-if="container||!current.editable" class="structured-secondary yaml-source-action" @click="locate(current.from)">前往这段源码</button>
        </template>
        <form v-else-if="mode==='edit'&&edit" id="yaml-value-form" class="yaml-value-form structured-form" aria-label="修改 YAML 字段值" @submit.prevent="prepare"><label class="input-label" for="yaml-value-kind">类型</label><select id="yaml-value-kind" ref="kindInput" v-model="edit.kind" class="name-input" aria-label="值的类型" @pointerdown="saveEdit" @focus="edit.focus='kind'" @change="changeKind"><option value="string">文字</option><option value="number">数值</option><option value="boolean">布尔值</option><option value="null">空值 null</option></select>
          <template v-if="edit.kind==='boolean'"><label class="input-label" for="yaml-boolean">值</label><select id="yaml-boolean" ref="booleanInput" v-model="edit.input" class="name-input" aria-label="新的布尔值" @focus="edit.focus='boolean'" @change="changedInput"><option value="true">true</option><option value="false">false</option></select></template>
          <template v-else-if="edit.kind!=='null'"><label class="input-label" for="yaml-value">值</label><input v-if="edit.kind==='number'" id="yaml-value" ref="valueInput" v-model="edit.input" inputmode="decimal" aria-label="新的数值（保留完整写法）" :maxlength="YAML_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="!!edit.error" :aria-describedby="edit.error?'yaml-value-error':undefined" spellcheck="false" @focus="edit.focus='value'" @input="changedInput" @select="rememberInput" @scroll="rememberInput" @blur="rememberInput" /><textarea v-else id="yaml-value" ref="valueInput" v-model="edit.input" aria-label="新的文字（无需引号）" :maxlength="YAML_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="!!edit.error" :aria-describedby="edit.error?'yaml-value-error':undefined" spellcheck="false" @focus="edit.focus='value'" @input="changedInput" @select="rememberInput" @scroll="rememberInput" @blur="rememberInput" /></template><output v-else class="structured-value kind-null">null</output><p v-if="edit.error" id="yaml-value-error" class="yaml-value-error structured-error" role="alert">{{ edit.error }}</p>
        </form>
        <div v-else-if="mode==='review'&&proposal" class="yaml-review structured-review" role="group" aria-label="核对 YAML 字段修改"><section class="yaml-value-card structured-card"><h2>原值 · {{ yamlKindLabel(current.kind) }}</h2><SourceFragment :kind="current.kind" :value="preview(raw)" language="yaml" label="YAML 字段原值" /></section><section class="yaml-value-card structured-card is-candidate"><h2>修改后 · {{ edit&&yamlKindLabel(edit.kind) }}</h2><SourceFragment :kind="edit?.kind" :value="preview(proposal.text)" language="yaml" label="修改后的 YAML 值" /><p v-if="proposal.text.length>1600" class="structured-notice">预览已省略中间部分；应用使用完整内容。</p></section><p v-if="proposal.text===raw" class="structured-message" role="status">原值无需修改。</p></div>
        <button v-if="mode==='review'" class="structured-secondary" @click="returnEdit">继续修改</button>
      </template>
    </div>
    <footer v-if="!fields||mode==='preparing'||current?.editable" class="yaml-task-footer structured-footer"><template v-if="!fields"><button v-if="busy" class="button primary-button" @click="cancelInspect">停止结构分析</button><button v-else class="button primary-button" @click="errorOffset===undefined?inspect():locate(errorOffset)">{{ errorOffset===undefined?'重新浏览结构':'前往问题源码' }}</button></template><button v-else-if="mode==='preparing'" class="button primary-button" @click="cancelPrepare">停止核对</button><template v-else-if="mode==='detail'"><button ref="editButton" class="button primary-button" @click="startEdit"><PenLine :size="21" aria-hidden="true" />{{ pending.has(selected)?'继续修改':'修改' }}</button><button class="button structured-source-action" aria-label="前往这段源码" @click="locate(current!.from)"><Code2 :size="22" /></button></template><button v-else-if="mode==='edit'" type="submit" form="yaml-value-form" class="button primary-button" @pointerdown="saveEdit"><Check :size="22" />核对这次修改</button><button v-else class="button primary-button" :disabled="!proposal||proposal.text===raw" @click="apply"><Check :size="22" />应用到草稿</button></footer>
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
import { YAML_SOURCE_BUDGET } from './yamlSource'
import { YAML_STRUCTURE_BUDGET, yamlKindLabel, yamlFieldLocation, type YamlField, type YamlScalarKind, type YamlStructure, type YamlValuePatch } from './yamlStructure'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ apply: [value: YamlValuePatch]; locate: [value: { source: string; offset: number }]; close: []; edit: []; source: [] }>()
type Mode = 'detail' | 'edit' | 'preparing' | 'review'
type InputPosition = { start: number; end: number; direction: 'forward' | 'backward' | 'none'; top: number; left: number }
type ValueEdit = { kind: YamlScalarKind; activeKind: YamlScalarKind; input: string; error: string; values: Partial<Record<YamlScalarKind, string>>; positions: Partial<Record<YamlScalarKind, InputPosition>>; bodyScroll: number; focus: 'value' | 'kind' | 'boolean' }
const panel = ref<HTMLElement>(), body = ref<HTMLElement>(), heading = ref<HTMLElement>(), valueInput = ref<HTMLInputElement|HTMLTextAreaElement>(), kindInput = ref<HTMLSelectElement>(), booleanInput = ref<HTMLSelectElement>(), editButton = ref<HTMLButtonElement>()
const fields = shallowRef<YamlField[]>(), selected = ref(0), query = ref(''), page = ref(0), busy = ref(false), message = ref(''), errorOffset = ref<number>(), mode = ref<Mode>('detail')
const status = ref<'loading' | 'error' | 'unavailable' | 'stopped' | 'changed'>('loading')
const edit = ref<ValueEdit | null>(null), pending = ref(new Map<number, ValueEdit>()), proposal = shallowRef<YamlValuePatch | null>(null)
const expanded=ref(new Set<string>()),filterOpened=ref(false),filterButton=ref<HTMLButtonElement>();let editRequested=false;const trail:number[]=[]
const nodes=computed(()=>new Map((fields.value||[]).map(field=>[String(field.id),{key:String(field.id),label:field.label,kind:field.kind,value:props.content.slice(field.from,field.to).slice(0,160),children:field.children.map(String),container:['map','sequence','stream','table','inline-table','array','array-tables'].includes(field.kind)} satisfies StructuredNode])))
const treeRows=computed(()=>structuredTreeRows(nodes.value,visible.value.map(field=>String(field.id)),expanded.value))
const editError=computed(()=>edit.value?.error||'')
useJsonFieldVisibility(body,()=>active&&mode.value==='edit',editError)
function toggleExpanded(key:string){const next=new Set(expanded.value);if(next.has(key))next.delete(key);else next.add(key);expanded.value=next}
async function openFilter(){filterOpened.value=true;await nextTick();panel.value?.querySelector<HTMLInputElement>('input[type=search]')?.focus()}
const current = computed(() => fields.value?.[selected.value]), raw = computed(() => current.value ? props.content.slice(current.value.from, current.value.to) : '')
const container = computed(() => current.value && ['map', 'sequence', 'stream'].includes(current.value.kind))
const matches = computed(() => (current.value?.children || []).map(id => fields.value![id]!).filter(field => !query.value || (field.label + '\n' + props.content.slice(field.from, field.to)).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / YAML_STRUCTURE_BUDGET.page)))
const visible = computed(() => matches.value.slice(page.value * YAML_STRUCTURE_BUDGET.page, (page.value + 1) * YAML_STRUCTURE_BUDGET.page))
const location = computed(() => fields.value ? yamlFieldLocation(fields.value, selected.value) : '')
const displayLocation=computed(()=>{const root=fields.value?.[0],prefix=(root?.label||'')+' / ';return root?.kind!=='stream'&&location.value.startsWith(prefix)?location.value.slice(prefix.length):location.value})
const title = computed(() => mode.value === 'review' || mode.value === 'preparing' ? '核对修改' : mode.value === 'edit' ? '修改字段值' : current.value?.parent !== null && current.value?.parent !== undefined ? current.value.label || '（空名称）' : props.name)
const backLabel = computed(() => mode.value === 'review' || mode.value === 'preparing' ? '返回修改' : mode.value === 'edit' ? '返回字段详情' : current.value?.parent !== null && current.value?.parent !== undefined ? '返回上一层' : '返回源码')
const statusTitle = computed(() => ({ loading: '正在读取结构…', error: '暂时无法浏览', unavailable: '暂不浏览', stopped: '分析已停止', changed: '需要重新读取' })[status.value])
const places = new Map<number, { query: string; page: number; scroll: number; focus?: number }>()
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, active = true, needsInspect = false, reviewScroll = 0
function preview(text: string) {
  if (text.length <= 1600) return text
  const splitPair = (at: number) => text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff
  return text.slice(0, splitPair(1200) ? 1199 : 1200) + '\n…\n' + text.slice(splitPair(text.length - 400) ? text.length - 399 : text.length - 400)
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined; busy.value = false }
function reset() { stop();trail.length=0; expanded.value=new Set();filterOpened.value=false;editRequested=false; fields.value = undefined; edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail'; errorOffset.value = undefined; places.clear(); selected.value = 0; query.value = ''; page.value = 0; reviewScroll = 0 }
function task(input: object, done: (value: YamlStructure & { patch?: YamlValuePatch; error?: string }) => void, fail: (text: string) => void) {
  stop(); const source = props.content, identity = props.identity, owner = generation
  if (source.length > YAML_SOURCE_BUDGET.characters) { fail('这份 YAML 较大，请使用源码查找；正文仍完整保留。'); return }
  busy.value = true
  const failed = (text: string) => { stop(); fail(text) }
  try {
    worker = new Worker(new URL('./yamlStructure.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => { if (!active || owner !== generation || source !== props.content || identity !== props.identity) return; stop(); done(event.data) }
    worker.onerror = event => { event.preventDefault(); if (active && owner === generation) failed('暂时无法完成结构任务，请返回源码或重试；正文与草稿继续保留。') }
    timer = setTimeout(() => { if (active && owner === generation) failed('结构任务时间较长，已停止；正文与草稿继续保留。') }, YAML_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source, ...input })
  } catch { failed('暂时无法完成结构任务，请返回源码或重试；正文与草稿继续保留。') }
}
function inspect() {
  needsInspect = false; reset(); status.value = 'loading'; message.value = ''
  task({}, value => { fields.value = value.fields; expanded.value=initialStructuredExpansion(nodes.value,fields.value?.[0]?.children.map(String)||[]); if (!value.fields) { status.value = 'error'; message.value = value.message || value.error || '暂时无法浏览结构，请返回源码或重试。'; errorOffset.value = value.offset }; void focusHeading() }, text => { status.value = props.content.length > YAML_SOURCE_BUDGET.characters ? 'unavailable' : 'error'; message.value = text; void focusHeading() })
}
function cancelInspect() { stop(); status.value = 'stopped'; message.value = ''; void focusHeading() }
async function focusHeading() { await nextTick(); if (active) heading.value?.focus({ preventScroll: true }) }
function savePlace() { const target = document.activeElement?.closest<HTMLElement>('[data-node-id]'); places.set(selected.value, { query: query.value, page: page.value, scroll: body.value?.scrollTop || 0, focus: target ? Number(target.dataset.nodeId) : undefined }) }
async function restorePlace(focus?: number) { await nextTick(); if (!active) return; const place = places.get(selected.value); if (body.value) body.value.scrollTop = place?.scroll || 0; const target = panel.value?.querySelector<HTMLElement>('[data-node-id="' + (focus ?? place?.focus) + '"]'); (target || heading.value)?.focus({ preventScroll: true }) }
function rememberInput() { const input = valueInput.value, value = edit.value; if (!input || !value || mode.value !== 'edit') return; value.positions[value.activeKind] = { start: input.selectionStart??0, end: input.selectionEnd??0, direction: input.selectionDirection??'none', top: input.scrollTop, left: input.scrollLeft } }
function saveEdit() { const value = edit.value; if (!value) return; rememberInput(); value.bodyScroll = body.value?.scrollTop || 0; value.values[value.activeKind] = value.input; pending.value.set(selected.value, { ...value, values: { ...value.values }, positions: { ...value.positions } }) }
function changedInput() { if (!edit.value) return; edit.value.error = ''; edit.value.values[edit.value.kind] = edit.value.input; rememberInput() }
function navigate(id: number,push=true) { if(id===selected.value)return;savePlace();if(push)trail.push(selected.value); selected.value = id; const place = places.get(id); query.value = place?.query || ''; page.value = place?.page || 0; edit.value = null; proposal.value = null; mode.value = 'detail'; void restorePlace() }
async function up() { const node = current.value; if (!node || node.parent === null) return; navigate(trail.pop()??node.parent,false); await restorePlace(node.id) }
async function changePage(direction: number) { page.value += direction; await nextTick(); body.value?.scrollTo(0, 0); panel.value?.querySelector<HTMLElement>('.yaml-field')?.focus({ preventScroll: true }) }
async function restoreEdit() {
  await nextTick(); const value = edit.value; if (!active || !value) return
  if (body.value) body.value.scrollTop = value.bodyScroll
  const input = valueInput.value
  if (input) { const place = value.positions[value.kind]; input.setSelectionRange(place?.start ?? 0, place?.end ?? 0, place?.direction); input.scrollTop = place?.top || 0; input.scrollLeft = place?.left || 0 }
  const target = value.focus === 'kind' ? kindInput.value : booleanInput.value || input || kindInput.value
  target?.focus({ preventScroll: true })
}
async function startEdit() {
  const field = current.value
  if (!field?.editable) return
  if(!props.editing){editRequested=true;emit('edit');return}
  savePlace(); const kind = field.kind as YamlScalarKind, input = field.input || ''
  const continuing = pending.value.has(selected.value)
  edit.value = pending.value.get(selected.value) || { kind, activeKind: kind, input, error: '', values: { [kind]: input }, positions: {}, bodyScroll: 0, focus: kind === 'boolean' ? 'boolean' : kind === 'null' ? 'kind' : 'value' }
  proposal.value = null; mode.value = 'edit'; await restoreEdit()
  if (!continuing) (valueInput.value || booleanInput.value || kindInput.value)?.scrollIntoView({ block: 'nearest' })
}
async function detail() { saveEdit(); mode.value = 'detail'; proposal.value = null; await restorePlace(); editButton.value?.focus({ preventScroll: true }) }
async function cancelEdit() { stop(); pending.value.delete(selected.value); edit.value = null; proposal.value = null; mode.value = 'detail'; await restorePlace(); editButton.value?.focus({ preventScroll: true }) }
async function returnEdit() { mode.value = 'edit'; proposal.value = null; await restoreEdit() }
async function changeKind() {
  const value = edit.value; if (!value) return
  rememberInput(); value.values[value.activeKind] = value.input; value.activeKind = value.kind
  value.input = value.values[value.kind] ?? (value.kind === 'boolean' ? 'true' : value.kind === 'null' ? 'null' : '')
  value.error = ''; value.focus = value.kind === 'boolean' ? 'boolean' : value.kind === 'null' ? 'kind' : 'value'
  await restoreEdit()
}
function prepare() {
  if (!edit.value || !current.value || !props.editing) return
  saveEdit(); edit.value.error = ''; proposal.value = null; mode.value = 'preparing'; message.value = ''; if (body.value) body.value.scrollTop = 0; void focusHeading()
  const failed = (text: string) => { if (!edit.value || !props.editing) return; edit.value.error = text; mode.value = 'edit'; void restoreEdit().then(() => panel.value?.querySelector('#yaml-value-error')?.scrollIntoView({ block: 'nearest' })) }
  task({ id: current.value.id, kind: edit.value.kind, input: edit.value.input }, value => { if (!edit.value || !props.editing) return; if (!value.patch) { failed(value.error || '无法核对这次修改，请返回源码或重试。'); return }; proposal.value = value.patch; mode.value = 'review'; reviewScroll = 0; if (body.value) body.value.scrollTop = 0; void focusHeading() }, failed)
}
function cancelPrepare() { stop(); if (edit.value) edit.value.error = '核对已停止，可继续修改。'; mode.value = 'edit'; proposal.value = null; void restoreEdit() }
function apply() { if (mode.value === 'review' && proposal.value && props.editing && proposal.value.source === props.content && proposal.value.text !== raw.value) emit('apply', proposal.value) }
function locate(offset: number) { stop(); emit('locate', { source: props.content, offset }) }
function back() { if(mode.value==='detail'&&container.value&&filterOpened.value){filterOpened.value=false;void nextTick(()=>filterButton.value?.focus());return true}; if (mode.value === 'preparing') cancelPrepare(); else if (mode.value === 'review') void returnEdit(); else if (mode.value === 'edit') void detail(); else if (current.value?.parent !== null && current.value?.parent !== undefined) void up(); else return false; return true }
function headerBack() { if (!back()) emit('close') }
function suspend() { if (mode.value === 'preparing') { stop(); mode.value = 'edit' }; if (mode.value === 'edit') saveEdit(); else if (mode.value === 'detail' && current.value) savePlace(); else if (mode.value === 'review') reviewScroll = body.value?.scrollTop || 0; if (busy.value && !fields.value) needsInspect = true; stop(); active = false }
function resume() { active = true; if (needsInspect || (!busy.value && !fields.value && !message.value && status.value === 'loading')) inspect(); else if (mode.value === 'edit') void restoreEdit(); else if (mode.value === 'detail' && current.value) void restorePlace(); else { void nextTick(() => { if (body.value) body.value.scrollTop = reviewScroll }); void focusHeading() } }
watch(() => [props.content, props.identity], () => { reset(); needsInspect = true; status.value = 'changed'; message.value = '正文已有变化，请重新浏览结构。' }, { flush: 'sync' })
watch(() => props.editing, editing => { if (!editing) { if (mode.value === 'preparing') stop(); edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail' } else if(editRequested){editRequested=false;void nextTick(startEdit)} })
defineExpose({ back, suspend, resume })
onMounted(inspect); onBeforeUnmount(stop)
</script>
