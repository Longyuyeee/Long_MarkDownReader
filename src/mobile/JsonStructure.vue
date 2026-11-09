<template>
  <section ref="panel" class="json-structure" aria-label="JSON 结构浏览">
    <div v-show="!renameOpened && !appendOpened && !removeOpened && !moveOpened" class="json-browser">
    <header class="json-task-header">
      <button class="json-task-icon" :aria-label="backLabel" @click="headerBack"><ArrowLeft :size="22" aria-hidden="true" /></button>
      <h1 ref="heading" tabindex="-1">{{ title }}</h1>
      <MobileHelp :topic="searchOpened && !fromSearch ? 'jsonFind' : 'json'" />
      <JsonOperations v-if="current && mode === 'detail' && (!searchOpened || fromSearch)" ref="operations" compact browse-actions request-editing :editing="editing" :can-filter="!isJsonScalar(current.kind)" :content="content" :identity="identity" :fields="fields!" :field="current" @filter="openFilter" @find="openGlobalSearch" @source="emit('locate',{source:content,offset:current.from})" @rename="openRename" @append="openAppend" @remove="openRemove" @move="openMove" />
      <button v-if="mode === 'edit'" class="json-task-icon" aria-label="取消修改" @click="cancelEdit"><X :size="21" aria-hidden="true" /></button>
    </header>
    <div v-if="current && mode === 'detail' && !searchOpened && current.parent === null && !isJsonScalar(current.kind)" class="json-view-tabs" role="group" aria-label="JSON 视图"><button aria-pressed="true">结构</button><button @click="emit('source')">源码</button></div>
    <div ref="body" class="json-task-body">
      <p v-if="message" role="status">{{ message }}</p>
      <button v-if="busy" class="button" @click="cancel">停止结构分析</button>
      <template v-else-if="!fields"><button class="button" @click="inspect">重新浏览结构</button><button v-if="errorOffset !== undefined" class="button" @click="emit('locate', { source: content, offset: errorOffset })">前往问题源码</button></template>
      <JsonFind v-if="fields && searchOpened" v-show="!fromSearch" ref="finder" embedded :content="content" :identity="identity" :fields="fields" @select="selectHit" @close="closeGlobalSearch" />
      <template v-if="current && (!searchOpened || fromSearch)">
        <div class="json-context"><Folder :size="22" aria-hidden="true" /><div class="json-location" role="group" aria-label="当前字段位置">{{ current.parent === null && !isJsonScalar(current.kind) ? '根目录' : displayLocation }}</div><span v-if="current.siblings > 1" class="json-duplicate">同名第 {{ current.occurrence }} / {{ current.siblings }} 项</span></div>
        <template v-if="mode === 'detail'">
          <template v-if="!isJsonScalar(current.kind)">
            <div v-if="filterOpened" class="json-level-search"><label class="assistive-status" for="json-level-filter">筛选本层字段或值</label><Search :size="19" aria-hidden="true" /><input id="json-level-filter" v-model="query" maxlength="128" type="search" class="name-input" placeholder="筛选本层" @input="page = 0" /></div>
            <div v-else-if="query" class="json-filter-summary"><button class="text-button" @click="openFilter">筛选：{{ query }}</button><button class="json-task-icon" aria-label="清除本层筛选" @click="query='';page=0"><X :size="18" /></button></div>
            <p v-if="pages > 1 || query" class="json-count" role="status">{{ matches.length }} 项<template v-if="pages > 1"> · 第 {{ page + 1 }} / {{ pages }} 页</template></p>
            <JsonFieldRows :fields="fields!" :rows="treeRows" :expanded="query ? undefined : expanded" :expandable="!query" label="JSON 字段树" @expand="toggleExpanded" @select="navigate($event)" />
            <p v-if="!matches.length">{{ query ? '本层没有匹配项，可清空筛选。' : '这一层没有字段。' }}</p>
            <div v-if="pages > 1" class="inline-actions"><button class="button" :disabled="page === 0" @click="changePage(-1)">上一页字段</button><button class="button" :disabled="page + 1 >= pages" @click="changePage(1)">下一页字段</button></div>
          </template>
          <template v-else>
            <section class="json-value-card" :class="`json-kind-${current.kind}`"><div class="json-value-type"><span>类型</span><span class="json-type-badge">{{ jsonTypeName(current.kind) }}</span></div><div class="json-value-content"><span>值</span><pre role="group" tabindex="0" aria-label="字段原值">{{ preview(raw) }}</pre></div></section>
            <template v-if="siblings.length"><h2 class="json-siblings-title">同级字段<span v-if="parentField && parentField.parent !== null">（{{ short(parentField.label) }}）</span></h2><JsonFieldRows :fields="fields!" :rows="siblingRows" :selected="selected" label="同级字段" @select="navigate($event,false)" /><div v-if="siblingPages > 1" class="inline-actions"><button class="button" :disabled="!siblingPage" @click="siblingPage--">上一页同级字段</button><button class="button" :disabled="siblingPage+1>=siblingPages" @click="siblingPage++">下一页同级字段</button></div></template>
            <p v-if="raw.length > JSON_STRUCTURE_BUDGET.valueCharacters">这个值较长，请前往源码编辑。</p>
          </template>
        </template>
        <form v-else-if="mode === 'edit' && edit" id="json-value-form" class="json-value-form" aria-label="修改 JSON 字段值" @submit.prevent="prepare">
          <label class="input-label" for="json-value-kind">类型</label><select id="json-value-kind" ref="kindInput" v-model="edit.kind" class="name-input" aria-label="值的类型" @change="changeKind"><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option></select>
          <template v-if="edit.kind === 'boolean'"><label class="input-label" for="json-boolean">值</label><select id="json-boolean" ref="booleanInput" v-model="edit.input" class="name-input" aria-label="新的布尔值"><option value="true">true</option><option value="false">false</option></select></template>
          <template v-else-if="edit.kind !== 'null'"><label class="input-label" for="json-value">值</label><input v-if="edit.kind === 'number'" id="json-value" ref="valueInput" v-model="edit.input" inputmode="decimal" class="json-number-input" aria-label="新的数值（保留完整写法）" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="!!edit.error" :aria-describedby="edit.error ? 'json-value-error' : undefined" spellcheck="false" @input="edit.error=''" /><textarea v-else id="json-value" ref="valueInput" v-model="edit.input" aria-label="新的文字（无需引号）" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="!!edit.error" :aria-describedby="edit.error ? 'json-value-error' : undefined" spellcheck="false" @input="edit.error = ''" /></template>
          <pre v-else class="json-null-value">null</pre><p v-if="edit.error" id="json-value-error" class="json-value-error" role="alert">{{ edit.error }}</p>
        </form>
        <div v-else-if="mode === 'review' && proposal" role="group" aria-label="核对字段修改"><section class="json-value-card" :class="`json-kind-${current.kind}`"><h2>原值 · {{ jsonKindLabel(current.kind) }}</h2><pre role="group" tabindex="0" aria-label="字段原值">{{ preview(raw) }}</pre></section><section class="json-value-card" :class="`json-kind-${edit!.kind}`"><h2>修改后 · {{ edit && jsonKindLabel(edit.kind) }}</h2><pre role="group" tabindex="0" aria-label="修改后的 JSON 值">{{ preview(proposal.text) }}</pre></section><p v-if="proposal.text === raw" role="status">原值无需修改。</p></div>
      </template>
    </div>
    <footer v-if="current && (!searchOpened || fromSearch) && isJsonScalar(current.kind)" class="json-task-footer">
      <template v-if="mode === 'detail'"><button v-if="raw.length <= JSON_STRUCTURE_BUDGET.valueCharacters" ref="editButton" class="button primary-button" @click="startEdit"><PenLine :size="21" aria-hidden="true" />{{ pending.has(selected) ? '继续修改' : '修改' }}</button><button class="button json-source-action" aria-label="前往这段源码" @click="emit('locate', { source: content, offset: current.from })"><Code2 :size="22" aria-hidden="true" /></button></template>
      <button v-else-if="mode === 'edit'" type="submit" form="json-value-form" class="button primary-button"><Check :size="22" aria-hidden="true" />核对修改</button>
      <template v-else><button class="button" @click="returnEdit">继续修改</button><button class="button primary-button" :disabled="!proposal || proposal.text === raw" @click="apply">应用到草稿</button></template>
    </footer>
    </div>
    <JsonMove v-if="fields" ref="move" :content="content" :identity="identity" :name="name" :location="location" :fields="fields" :editing="editing" @active="moveOpened = $event" @close="moveClosed" @apply="emit('apply', $event)" />
    <JsonRemove v-if="fields" ref="remove" :content="content" :identity="identity" :name="name" :location="location" :fields="fields" :editing="editing" @active="removeOpened = $event" @close="removeClosed" @apply="emit('apply', $event)" />
    <JsonAppend v-if="fields" ref="append" :content="content" :identity="identity" :name="name" :location="location" :fields="fields" :editing="editing" @active="appendOpened = $event" @close="appendClosed" @apply="emit('apply', $event)" />
    <JsonRename v-if="fields" ref="rename" :content="content" :identity="identity" :name="name" :location="location" :fields="fields" :editing="editing" @active="renameOpened = $event" @close="renameClosed" @apply="emit('apply', $event)" />
  </section>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import { ArrowLeft, Search, Folder, X, PenLine, Code2, Check } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { JSON_SOURCE_BUDGET } from './jsonSource'
import { JSON_STRUCTURE_BUDGET, isJsonScalar, jsonKindLabel, prepareJsonValuePatch, type JsonField, type JsonScalarKind, type JsonStructure, type JsonValuePatch } from './jsonStructure'
import JsonFind from './JsonFind.vue'
import JsonFieldRows from './JsonFieldRows.vue'
import {jsonTreeRows,initialJsonExpansion,jsonTypeName} from './jsonTree'
import JsonOperations from './JsonOperations.vue'
import JsonRename from './JsonRename.vue'
import JsonAppend from './JsonAppend.vue'
import JsonRemove from './JsonRemove.vue'
import JsonMove from './JsonMove.vue'
import { useJsonFieldVisibility } from './useJsonFieldVisibility'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ apply: [value: JsonValuePatch]; locate: [value: { source: string; offset: number }]; close: [];edit:[];source:[] }>()
const panel = ref<HTMLElement>(), body = ref<HTMLElement>(), heading = ref<HTMLElement>(), valueInput = ref<HTMLInputElement|HTMLTextAreaElement>(), kindInput = ref<HTMLSelectElement>(), booleanInput = ref<HTMLSelectElement>(), editButton = ref<HTMLButtonElement>()
const expanded=ref(new Set<number>()),filterOpened=ref(false),siblingPage=ref(0);let editRequested=false,pendingStructureAction:{id:number;identity:string;source:string;action:()=>void}|undefined
const fields = shallowRef<JsonField[]>(), selected = ref(0), query = ref(''), page = ref(0), busy = ref(false), message = ref(''), errorOffset = ref<number>(), mode = ref<'detail' | 'edit' | 'review'>('detail')
type ValueEdit = { kind: JsonScalarKind; input: string; error: string; start?: number; end?: number; scroll?: number; bodyScroll?: number }
const edit = ref<ValueEdit | null>(null), pending = ref(new Map<number, ValueEdit>()), proposal = shallowRef<JsonValuePatch | null>(null)
const searchOpened = ref(false), fromSearch = ref(false), finder = ref<InstanceType<typeof JsonFind>>(), operations = ref<InstanceType<typeof JsonOperations>>()
const rename = ref<InstanceType<typeof JsonRename>>(), renameOpened = ref(false)
const append = ref<InstanceType<typeof JsonAppend>>(), appendOpened = ref(false)
const remove = ref<InstanceType<typeof JsonRemove>>(), removeOpened = ref(false)
const move = ref<InstanceType<typeof JsonMove>>(), moveOpened = ref(false)
const trail:number[]=[]
let lastSearchHit=0,searchOrigin = 0, searchScroll = 0, active = true, needsInspect = false
const places = new Map<number, { query: string; page: number; scroll: number; filterOpened:boolean;focus?: number }>()
const current = computed(() => fields.value?.[selected.value]), raw = computed(() => current.value ? props.content.slice(current.value.from, current.value.to) : '')
const matches = computed(() => (current.value?.children || []).map(id => fields.value![id]!).filter(field => !query.value || (field.label + '\n' + (isJsonScalar(field.kind) ? props.content.slice(field.from, field.to) : field.preview)).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / JSON_STRUCTURE_BUDGET.page)))
const visible = computed(() => matches.value.slice(page.value * JSON_STRUCTURE_BUDGET.page, (page.value + 1) * JSON_STRUCTURE_BUDGET.page))
const treeRows=computed(()=>jsonTreeRows(fields.value||[],visible.value.map(f=>f.id),query.value?new Set():expanded.value))
const parentField=computed(()=>current.value?.parent===null?undefined:fields.value?.[current.value?.parent??-1]),siblings=computed(()=>parentField.value?.children||[]),siblingPages=computed(()=>Math.max(1,Math.ceil(siblings.value.length/30))),siblingRows=computed(()=>siblings.value.slice(siblingPage.value*30,(siblingPage.value+1)*30).map(id=>({id,depth:0})))
const displayLocation=computed(()=>location.value.startsWith('$ / ')?location.value.slice(4):location.value)
function toggleExpanded(id:number){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next}
async function openFilter(){filterOpened.value=true;await nextTick();panel.value?.querySelector<HTMLInputElement>('#json-level-filter')?.focus()}
const short = (text: string) => text.length > 160 ? text.slice(0, 160) + '…' : text || '（空名称）'
const preview = (text: string) => text.length > 1600 ? text.slice(0, 1200) + '\n…\n' + text.slice(-400) : text
const location = computed(() => { const parts: string[] = []; let node = current.value; while (node && node.parent !== null) { const parent = fields.value?.[node.parent], label = short(node.label); parts.unshift((parent?.kind === 'array' || /^[A-Za-z_$][\w$]*$/.test(label) ? label : JSON.stringify(label)) + (node.siblings > 1 ? `（同名第 ${node.occurrence} / ${node.siblings} 项）` : '')); node = parent }; return ['$'].concat(parts).join(' / ') })
const title = computed(() => mode.value === 'review' ? '核对修改' : mode.value === 'edit' ? '修改值' : searchOpened.value && !fromSearch.value ? '查找整个 JSON' : current.value && current.value.parent !== null ? short(current.value.label) : props.name)
const backLabel = computed(() => mode.value === 'review' ? '返回修改' : mode.value === 'edit' ? '返回字段详情' : searchOpened.value && fromSearch.value ? '返回查找结果' : searchOpened.value ? '结束全树查找' : current.value?.parent !== null && current.value?.parent !== undefined ? '返回上一层' : '返回源码操作')
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined; busy.value = false }
function reset() { pendingStructureAction=undefined;trail.length=0;expanded.value=new Set();filterOpened.value=false;editRequested=false; moveOpened.value = false; removeOpened.value = false; appendOpened.value = false; renameOpened.value = false; stop(); fields.value = undefined; edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail'; errorOffset.value = undefined; places.clear(); selected.value = 0; query.value = ''; page.value = 0; searchOpened.value = false; fromSearch.value = false }
function cancel() { reset(); message.value = '已停止结构分析，正文保持原样。' }
function inspect() {
  needsInspect = false; reset(); const source = props.content, identity = props.identity, owner = generation
  if (source.length > JSON_SOURCE_BUDGET.characters) { message.value = '这份 JSON 较大，请使用源码查找；本次不构建结构，正文仍完整保留。'; return }
  busy.value = true; message.value = '正在分析 JSON 结构…'
  try {
    worker = new Worker(new URL('./jsonStructure.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (!active || owner !== generation || source !== props.content || identity !== props.identity) return
      const value = event.data as JsonStructure; stop(); fields.value = value.fields;if(value.fields)expanded.value=initialJsonExpansion(value.fields); message.value = value.fields ? '' : value.message; errorOffset.value = value.offset; void focusHeading()
    }
    worker.onerror = event => { event.preventDefault(); if (active && owner === generation) { reset(); message.value = '暂时无法浏览结构，请返回源码或重试。' } }
    timer = setTimeout(() => { if (active && owner === generation) { reset(); message.value = '结构分析时间较长，已停止；正文与草稿继续保留。' } }, JSON_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source })
  } catch { reset(); message.value = '暂时无法浏览结构，请返回源码或重试。' }
}
async function focusHeading() { await nextTick(); if (active) heading.value?.focus({ preventScroll: true }) }
function savePlace() { const target = document.activeElement?.closest<HTMLElement>('[data-node-id]'); places.set(selected.value, { query: query.value, page: page.value, filterOpened:filterOpened.value,scroll: body.value?.scrollTop || 0, focus: target ? Number(target.dataset.nodeId) : undefined }) }
async function restorePlace(focus?: number) { await nextTick(); if (!active) return; const place = places.get(selected.value); if (body.value) body.value.scrollTop = place?.scroll || 0; const target = panel.value?.querySelector<HTMLElement>(`[data-node-id="${focus ?? place?.focus}"]`); (target || heading.value)?.focus({ preventScroll: true }) }
function saveEdit() { if (!edit.value) return; const input = valueInput.value; if (input) { edit.value.start = input.selectionStart??undefined; edit.value.end = input.selectionEnd??undefined; edit.value.scroll = input.scrollTop }; edit.value.bodyScroll = body.value?.scrollTop || 0; pending.value.set(selected.value, { ...edit.value }) }
function navigate(id: number, remember = true) {
  if (remember){savePlace();trail.push(selected.value)}; selected.value = id;siblingPage.value=Math.max(0,Math.floor((fields.value?.[fields.value[id]?.parent??-1]?.children.indexOf(id)??0)/30))
  const place = places.get(id); query.value = place?.query || ''; page.value = place?.page || 0;filterOpened.value=place?.filterOpened||false; edit.value = null; proposal.value = null; mode.value = 'detail'; void restorePlace()
}
async function up() { const node = current.value; if (!node || node.parent === null) return; navigate(trail.pop()??node.parent,false); await restorePlace(node.id) }
async function changePage(direction: number) { page.value += direction; await nextTick(); body.value?.scrollTo(0, 0); panel.value?.querySelector<HTMLElement>('.json-field')?.focus({ preventScroll: true }) }
async function restoreEdit() { await nextTick(); if (!active) return; const input = valueInput.value; if (input && edit.value) { input.focus({ preventScroll: true }); input.setSelectionRange(edit.value.start ?? 0, edit.value.end ?? 0); input.scrollTop = edit.value.scroll || 0 } else (booleanInput.value || kindInput.value)?.focus({ preventScroll: true }); if (body.value) body.value.scrollTop = edit.value?.bodyScroll || 0 }
async function startEdit() {
  if (!current.value || !isJsonScalar(current.value.kind) || raw.value.length > JSON_STRUCTURE_BUDGET.valueCharacters) return
  if(!props.editing){editRequested=true;emit('edit');return}
  savePlace(); edit.value = pending.value.get(selected.value) || { kind: current.value.kind, input: current.value.kind === 'string' ? JSON.parse(raw.value) : raw.value, error: '' }; proposal.value = null; mode.value = 'edit'; await restoreEdit()
}
async function detail() { saveEdit(); mode.value = 'detail'; proposal.value = null; await restorePlace(); editButton.value?.focus({ preventScroll: true }) }
async function cancelEdit() { pending.value.delete(selected.value); edit.value = null; mode.value = 'detail'; proposal.value = null; await restorePlace(); editButton.value?.focus({ preventScroll: true }) }
async function returnEdit() { mode.value = 'edit'; proposal.value = null; await restoreEdit() }
function changeKind() { if (!edit.value) return; edit.value.error = ''; if (edit.value.kind === 'boolean' && edit.value.input !== 'true' && edit.value.input !== 'false') edit.value.input = 'true' }
function prepare() {
  if (!edit.value || !current.value || !props.editing) return
  saveEdit()
  try { proposal.value = prepareJsonValuePatch(props.content, current.value, edit.value.kind, edit.value.input); edit.value.error = ''; mode.value = 'review'; if (body.value) body.value.scrollTop = 0; void focusHeading() }
  catch (error) {
    proposal.value = null
    edit.value.error = String(error).replace(/^Error: /, '')
    void nextTick(() => {
      (valueInput.value || booleanInput.value || kindInput.value)?.focus({ preventScroll: true })
      panel.value?.querySelector('#json-value-error')?.scrollIntoView({ block: 'nearest' })
    })
  }
}
function apply() { if (!proposal.value || !props.editing || proposal.value.source !== props.content) return; emit('apply', proposal.value) }
function openGlobalSearch() { savePlace(); searchOrigin = selected.value; searchOpened.value = true; fromSearch.value = false; if (body.value) body.value.scrollTop = 0 }
function selectHit(id: number) { lastSearchHit=id;searchScroll = body.value?.scrollTop || 0; navigate(id, false); fromSearch.value = true }
async function returnResults() { fromSearch.value = false; await nextTick(); await finder.value?.focusResult(lastSearchHit); if (body.value) body.value.scrollTop = searchScroll }
function closeGlobalSearch() { searchOpened.value = false; fromSearch.value = false; selected.value = searchOrigin; const place = places.get(searchOrigin); query.value = place?.query || ''; page.value = place?.page || 0;filterOpened.value=place?.filterOpened||false; void restorePlace() }
function requestStructureAction(action:()=>void){if(!props.editing){pendingStructureAction={id:selected.value,identity:props.identity,source:props.content,action};emit('edit')}else action()}
function openRename() { savePlace();requestStructureAction(()=>{void rename.value?.open(selected.value)}) }
async function renameClosed() { await nextTick(); if (active && !renameOpened.value) await operations.value?.openMenu('rename') }
function openAppend() { savePlace();requestStructureAction(()=>{void append.value?.open(selected.value)}) }
async function appendClosed() { await nextTick(); if (active && !appendOpened.value) await operations.value?.openMenu('append') }
function openRemove() { savePlace();requestStructureAction(()=>{void remove.value?.open(selected.value)}) }
async function removeClosed() { await nextTick(); if (active && !removeOpened.value) await operations.value?.openMenu('remove') }
function openMove(direction: -1 | 1) { savePlace();requestStructureAction(()=>{void move.value?.open(selected.value,direction)}) }
async function moveClosed(direction: -1 | 1) { await nextTick(); if (active && !moveOpened.value) await operations.value?.openMenu(direction === -1 ? 'previous' : 'next') }
function back() {
  if (moveOpened.value) return move.value?.back() || true
  if (removeOpened.value) return remove.value?.back() || true
  if (appendOpened.value) return append.value?.back() || true
  if (renameOpened.value) return rename.value?.back() || true
  if (mode.value === 'review') void returnEdit()
  else if (mode.value === 'edit') void detail()
  else if (operations.value?.back()) return true
  else if (searchOpened.value) { if (fromSearch.value) void returnResults(); else closeGlobalSearch() }
  else if(filterOpened.value){filterOpened.value=false;void focusHeading()}
  else if (current.value?.parent !== null && current.value?.parent !== undefined) void up()
  else return false
  return true
}
function headerBack() { if (!back()) emit('close') }
function suspend() { move.value?.suspend(); remove.value?.suspend(); append.value?.suspend(); rename.value?.suspend(); if (mode.value === 'edit') saveEdit(); else if (mode.value === 'detail' && !searchOpened.value) savePlace(); active = false; if (busy.value) { stop(); message.value = '已停止结构分析，正文保持原样。' }; finder.value?.stop() }
function resume() { active = true; if (needsInspect || (!fields.value && !message.value)) inspect(); else if (moveOpened.value) move.value?.resume(); else if (removeOpened.value) remove.value?.resume(); else if (appendOpened.value) append.value?.resume(); else if (renameOpened.value) rename.value?.resume(); else if (mode.value === 'edit') void restoreEdit(); else void focusHeading() }
watch(() => [props.content, props.identity], () => { reset(); needsInspect = true; message.value = '正文已有变化，请重新浏览结构。' }, { flush: 'sync' })
watch(() => props.editing, value => {if(value&&editRequested){editRequested=false;void startEdit()};if(value&&pendingStructureAction){const task=pendingStructureAction;pendingStructureAction=undefined;void nextTick(()=>{if(active&&task.id===selected.value&&task.identity===props.identity&&task.source===props.content)task.action()})}; if (!value) { edit.value = null; pending.value.clear(); proposal.value = null; mode.value = 'detail' } })
defineExpose({ back, suspend, resume })
const editError = computed(() => edit.value?.error || '')
const revealEditField = useJsonFieldVisibility(body, () => active && mode.value === 'edit', editError)
watch([mode, () => edit.value?.kind], revealEditField, { flush: 'post' })
onMounted(inspect)
onBeforeUnmount(stop)
</script>
<style scoped>
.json-structure{--bg:#fafbf8;--surface:#fff;--ink:#172a24;--muted:#56675e;--line:#dce5df;--primary:#267458;--primary-soft:#e4f2eb;--json-error:#a13e32;--json-string:#166b28;--json-number:#9b5900;--json-boolean:#6540a4;--json-type-bg:#eee7ff;--json-type-ink:#4f279f;display:flex;flex-direction:column;flex:1;min-height:0;background:var(--bg);color:var(--ink)}
.json-browser{display:flex;flex-direction:column;flex:1;min-height:0}.json-task-header{flex:none;display:flex;align-items:center;gap:0;padding:4px 8px;min-height:64px;border-bottom:1px solid var(--line)}.json-task-icon{display:grid;place-items:center;flex:none;min-width:48px;min-height:48px;padding:0;border:0;background:transparent;color:var(--ink)}h1{flex:1;min-width:0;margin:0;padding:0 8px;font-size:1.125rem;line-height:1.4;letter-spacing:0;font-weight:650;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:anywhere}.json-view-tabs{display:flex;flex:none;margin:12px 16px 0;padding:0;border-radius:9px;background:var(--panel)}.json-view-tabs button{flex:1;min-height:48px;border:0;border-radius:9px;background:none;color:var(--ink);font:inherit}.json-view-tabs [aria-pressed=true]{background:var(--primary);color:var(--bg);font-weight:600}.json-task-body{flex:1;min-height:0;overflow:auto;padding:0 16px 24px;overscroll-behavior:contain}.json-context{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:56px;padding:12px 0;color:var(--primary)}.json-context>svg{flex:none}.json-location{flex:1;min-width:0;font-size:1rem;line-height:1.5;overflow-wrap:anywhere}.json-duplicate{flex-basis:100%;font-size:.8125rem;color:var(--muted)}.json-level-search{display:flex;align-items:center;gap:8px;min-height:48px;margin-bottom:12px;border:1px solid var(--line);border-radius:9px;padding:0 10px;background:var(--surface);color:var(--muted)}.json-level-search input{flex:1;min-width:0;border:0;background:none;padding:8px 0;margin:0}.json-filter-summary{display:flex;align-items:center}.json-filter-summary>.text-button{flex:1;min-width:0;overflow-wrap:anywhere;text-align:left}.json-count{margin:8px 0;font-size:.8125rem;color:var(--muted)}.input-label{font-size:1rem;line-height:1.5;margin:20px 0 8px}.name-input{display:block;width:100%;min-height:48px;border-radius:9px;padding:10px 12px;line-height:1.5;font:inherit;background:var(--surface);color:var(--ink);border:1px solid var(--line)}.json-value-card{margin:4px 0 24px;padding:0;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}.json-value-type,.json-value-content{display:flex;align-items:baseline;gap:20px;min-height:56px;padding:12px}.json-value-type>span:first-child,.json-value-content>span:first-child{flex:0 0 76px;white-space:nowrap}.json-value-content{border-top:1px solid var(--line)}.json-type-badge{background:var(--json-type-bg);color:var(--json-type-ink);border-radius:6px;padding:3px 9px;font-size:.875rem}.json-value-card h2{margin:0;padding:12px 14px;border-bottom:1px solid var(--line);font-size:.875rem;font-weight:500;color:var(--muted);letter-spacing:0}.json-value-card>pre{padding:12px 14px}.json-siblings-title{margin:0 0 12px;font-size:1rem;line-height:1.5;letter-spacing:0}.json-value-card pre{flex:1;min-width:0;max-height:36dvh;overflow:auto;margin:0;font:1.125rem/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.json-kind-number pre,.json-number-input{color:var(--json-number)}.json-kind-string pre{color:var(--json-string)}.json-kind-boolean pre{color:var(--json-boolean)}.json-task-footer{display:flex;flex:none;gap:12px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);max-height:42dvh;overflow:auto}.button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 14px;border-radius:9px;font-size:1rem;line-height:1.5;letter-spacing:0}.json-task-footer>.button{flex:1;min-width:0}.json-task-footer>.json-source-action{flex:0 0 48px;padding:0}.json-value-form .input-label:first-child{margin-top:4px}.json-number-input,textarea{display:block;width:100%;min-height:48px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);font:1rem/1.5 ui-monospace,Consolas,monospace}.json-number-input{font-size:1.25rem}textarea{height:160px;resize:vertical;color:var(--ink)}input:focus,textarea:focus,select:focus{outline:2px solid var(--primary);outline-offset:-1px}input[aria-invalid=true],textarea[aria-invalid=true]{border-color:var(--json-error)}.json-value-error{font-size:.875rem;line-height:1.5;color:var(--json-error);margin:12px 0}.json-null-value{font:1.25rem/1.5 ui-monospace,monospace;color:var(--muted)}
:global(.theme-dark .json-structure){--bg:#111c28;--surface:#172c36;--ink:#eef5f5;--muted:#b0c2c9;--line:#3c545d;--primary:#6cdda9;--primary-soft:#173a32;--json-error:#ffb4a8;--json-string:#a9d994;--json-number:#ffc784;--json-boolean:#d6b6ff;--json-type-bg:#30234d;--json-type-ink:#dbc1ff}
@media(max-width:340px){.json-task-header{padding-inline:4px}.json-task-footer{gap:8px}.json-value-type>span:first-child,.json-value-content>span:first-child{flex-basis:max(48px,2em)}}@media(max-height:400px){.json-task-header{min-height:56px}.json-task-footer{padding-block:6px}.json-context{min-height:48px;padding-block:8px}}@media(max-height:200px){.json-task-header{min-height:48px;padding-block:0}.json-context{display:none}.json-task-footer{max-height:48dvh}}
</style>
