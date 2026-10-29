<template>
  <div class="workspace toml-workspace" :data-dirty="dirty" :data-saving="saving" :data-loading="loading" :data-analysis-current="!analysisPending && analyzedSource === content">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />
    <header class="workspace-document-header">
      <div class="identity">
        <n-button quaternary circle size="small" :title="isExternal ? '返回资料库' : '返回知识库'" @click="router.push({ name: 'LibraryMode' })">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="FileCodeIcon" size="22" class="accent" />
        <div class="workspace-document-copy"><strong class="workspace-file-name">{{ fileName }}</strong><span aria-live="polite"><template v-if="isExternal">外部文件 · </template>TOML · {{ readOnly ? '只读' : dirty ? '有未保存修改' : '已保存' }}<template v-if="isExternal && !readOnly"> · 仅点击保存写回</template></span></div>
      </div>
      <div class="actions" data-command-strip data-horizontal-wheel="always">
        <n-button quaternary size="small" title="查找" @click="editor && openSearchPanel(editor)"><template #icon><n-icon :component="SearchIcon" /></template>查找</n-button>
        <n-button quaternary circle size="small" title="折叠全部" @click="editor && foldAll(editor)"><template #icon><n-icon :component="FoldIcon" /></template></n-button>
        <n-button quaternary circle size="small" title="展开全部" @click="editor && unfoldAll(editor)"><template #icon><n-icon :component="UnfoldIcon" /></template></n-button>
        <n-button quaternary circle size="small" title="重新读取" :disabled="loading" @click="reload"><template #icon><n-icon :component="RefreshIcon" /></template></n-button>
        <n-button quaternary size="small" :title="inspectorVisible ? '隐藏配置分区与问题' : '显示配置分区与问题'" :aria-pressed="inspectorVisible" @click="toggleInspector"><template #icon><n-icon :component="InspectorIcon" /></template>分区与问题</n-button>
        <StructuredHistoryMenu :session="session" :available="!isExternal" :read-only="readOnly" :busy="loading || saving || !session.hasDocument()" />
        <n-button type="primary" size="small" :loading="saving" :disabled="loading || readOnly || !dirty || !session.hasDocument()" @click="save()"><template #icon><n-icon :component="SaveIcon" /></template>{{ saving ? '保存中' : dirty ? '保存' : '已保存' }}</n-button>
      </div>
    </header>
    <main :class="{ 'inspector-hidden': !inspectorVisible }">
      <section class="source">
        <div v-if="loading" class="state"><n-spin size="small" /><strong>正在读取 TOML</strong></div>
        <div v-else-if="loadError" class="state error"><n-icon :component="AlertIcon" size="24" /><strong>无法打开 TOML</strong><p>{{ loadError }}</p><n-button size="small" @click="load(true)">重试</n-button></div>
        <div ref="editorHost" class="editor" :class="{ hidden: loading || loadError }" />
      </section>
      <aside>
        <div class="heading">
          <div><strong>配置分区与问题</strong><span>{{ analysisPending ? '正在更新结构分析，编辑不受影响' : '点击分区或键可定位到对应源码' }}</span></div>
          <n-spin v-if="analysisPending" size="small" />
          <n-icon v-else :component="analysis?.valid ? ValidIcon : AlertIcon" :class="analysis?.valid ? 'accent' : 'error'" size="20" />
        </div>
        <div class="metrics">
          <div><strong>{{ analysis?.tableCount ?? 0 }}</strong><span>表</span></div>
          <div><strong>{{ analysis?.arrayOfTablesCount ?? 0 }}</strong><span>表数组</span></div>
          <div><strong>{{ analysis?.valueCount?.toLocaleString() ?? 0 }}</strong><span>值</span></div>
          <div><strong>{{ analysis?.maxDepth ?? 0 }}</strong><span>深度</span></div>
        </div>
        <button v-for="item in analysis?.diagnostics || []" :key="item.code" class="diagnostic" @click="reveal(item)">
          <n-icon :component="AlertIcon" /><span><strong>语法错误</strong><small>第 {{ item.line }} 行，第 {{ item.column }} 列</small><small>{{ item.message }}</small></span>
        </button>
        <div v-if="analysis?.valid" class="valid"><n-icon :component="ValidIcon" /><span>语法有效</span><WorkspaceHelp label="说明：语法有效，注释、顺序与字面量由源码保" text="语法有效，注释、顺序与字面量由源码保留" /></div>
        <n-input v-model:value="query" @keydown.enter.prevent="filteredOutline[0] && reveal(filteredOutline[0])" clearable size="small" placeholder="筛选键路径或值"><template #prefix><n-icon :component="SearchIcon" /></template></n-input>
        <div :ref="outlineNav.element" role="group" aria-label="TOML 结构提纲" class="outline" @contextmenu.self="openRootFieldMenu">
          <template v-for="item in filteredOutline" :key="`${item.start}:${item.path}`">
            <div class="outline-node">
              <button :aria-current="item === outlineNav.selected.value ? 'true' : undefined" :data-outline-node="outlineNav.key(item)" :tabindex="outlineNav.tabIndex(item)" @focus="outlineNav.select(item)" @keydown="outlineNav.keydown($event, item)" :style="{ paddingLeft: `${10 + Math.min(item.depth, 8) * 14}px` }" @click="reveal(item)" @contextmenu.prevent.stop="nodeMenu.open($event, item)">
                <n-icon :component="item.array || item.kind==='array-item' ? ArrayIcon : item.kind === 'value' ? KeyIcon : TableIcon" />
                <span><strong>{{ item.label }}</strong><small>{{ item.path }}</small><small v-if="item.preview">{{ item.preview }}</small></span>
              </button>
              <button v-if="item.array" class="array-toggle" :aria-label="(expandedArrays[item.path]?'收起数组 ':'展开数组 ')+item.path" :aria-expanded="!!expandedArrays[item.path]" :disabled="arrayLoading[item.path] || analysisPending || analyzedSource!==content" @click="toggleArray(item)">
                <n-spin v-if="arrayLoading[item.path]" size="small" /><n-icon v-else :component="expandedArrays[item.path]?UnfoldArrayIcon:FoldArrayIcon" />
              </button>
            </div>
            <div v-if="item.array && expandedArrays[item.path] && arrayErrors[item.path]" class="array-error" role="alert">{{ arrayErrors[item.path] }} <n-button text size="small" @click="reveal(item)">定位源码</n-button></div>
          </template>
          <p v-if="!filteredOutline.length" @contextmenu="openRootFieldMenu">{{ analysis?.valid ? (analysis.outline.length ? '没有匹配的键路径' : '空文档 · 右键新增字段') : '修复语法后显示提纲' }}</p>
          <p v-if="analysis?.outlineTruncated" class="warning">结构过大，仅显示受限范围</p>
        </div>
      </aside>
    </main>
    <footer><span>{{ readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span><span>{{ encoding.toUpperCase() }}</span><span>{{ lines }} 行</span><span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span></footer>

    <SourceNodeMenu v-if="nodeMenu.menu.value" :x="nodeMenu.menu.value.x" :y="nodeMenu.menu.value.y" :options="nodeMenu.items.value" @select="nodeMenu.select" @close="nodeMenu.close" />
    <n-modal v-model:show="valueEditVisible" preset="card" class="toml-value-edit-dialog" :title="valueIsMultiline ? '修改 TOML 多行文字' : valueEntry?.kind==='array-item' ? '修改 TOML 数组项' : valueDatetimeKind ? '修改 TOML '+valueDatetimeKind : '修改 TOML 值'" :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}"
      :mask-closable="!valueEditPending" :closable="!valueEditPending" :close-on-esc="!valueEditPending"
      @after-enter="valueInput?.select()" @after-leave="finishValueDialog">
      <code>{{ valueEntry?.path }}</code>
      <n-input ref="valueInput" v-model:value="valueText" :type="!valueIsMultiline && (valueEntry?.kind==='array-item'||valueDatetimeKind) ? 'text' : 'textarea'" :autosize="!valueIsMultiline && (valueEntry?.kind==='array-item'||valueDatetimeKind) ? false : {minRows:3,maxRows:8}" style="width:100%"
        :disabled="valueEditPending || valueReadFailed" :input-props="{'aria-label':valueEntry?.kind==='array-item' ? 'TOML 数组项值' : 'TOML 字段值'}" autofocus @keydown.enter="onValueEnter" />
      <p v-if="valueError" role="alert" class="error">{{ valueError }} <n-button v-if="valueReadFailed" text :disabled="valueEditPending" @click="valueEntry && openValueEdit(valueEntry)">重新读取</n-button> <n-button text :disabled="valueEditPending" @click="revealValueSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="valueEditPending" @click="valueEditVisible=false">取消</n-button>
        <n-button type="primary" :loading="valueEditPending" :disabled="valueReadFailed" @click="previewValueEdit">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="renameVisible" preset="card" class="toml-key-rename-dialog" title="重命名 TOML 字段"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!renamePending" :closable="!renamePending" :close-on-esc="!renamePending"
      @after-enter="renameInput?.select()" @after-leave="finishRenameDialog">
      <code>{{ renameEntry?.path }}</code>
      <label for="toml-key-name">字段名</label>
      <n-input ref="renameInput" v-model:value="renameName" :disabled="renamePending" :input-props="{id:'toml-key-name','aria-label':'TOML 字段名'}" @keydown.enter="onRenameEnter" />
      <p v-if="renameError" role="alert" class="error">{{ renameError }} <n-button text :disabled="renamePending" @click="revealRenameSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="renamePending" @click="renameVisible=false">取消</n-button>
        <n-button type="primary" :loading="renamePending" @click="previewRename">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="duplicateVisible" preset="card" class="toml-field-copy-dialog toml-key-rename-dialog" title="复制为新字段"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!duplicatePending" :closable="!duplicatePending" :close-on-esc="!duplicatePending"
      @after-enter="duplicateInput?.select()" @after-leave="finishDuplicateDialog">
      <code>{{ duplicateEntry?.path }}</code>
      <label for="toml-copy-field-name">新字段名</label>
      <n-input ref="duplicateInput" v-model:value="duplicateName" :disabled="duplicatePending" :input-props="{id:'toml-copy-field-name','aria-label':'新 TOML 字段名'}" @keydown.enter="onDuplicateEnter" />
      <p v-if="duplicateError" role="alert" class="value-edit-error">{{ duplicateError }} <n-button text :disabled="duplicatePending" @click="revealDuplicateSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="duplicatePending" @click="duplicateVisible=false">取消</n-button><n-button type="primary" :loading="duplicatePending" @click="previewDuplicate">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="fieldVisible" preset="card" class="toml-field-dialog" :title="fieldMode==='add' ? '新增 TOML 字段' : '删除 TOML 字段'"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!fieldPending" :closable="!fieldPending" :close-on-esc="!fieldPending"
      @after-enter="fieldInput?.select()" @after-leave="finishFieldDialog">
      <code>{{ fieldEntry?.path || '$' }}</code>
      <template v-if="fieldMode==='add'">
        <label for="toml-new-field">字段名</label><n-input ref="fieldInput" v-model:value="fieldName" :disabled="fieldPending" :input-props="{id:'toml-new-field','aria-label':'新增 TOML 字段名'}" @keydown.enter="onFieldEnter" />
        <label for="toml-new-value">值</label><n-input v-model:value="fieldValue" :disabled="fieldPending" placeholder="例如：'内容'、42、true、[1, 2]" :input-props="{id:'toml-new-value','aria-label':'新增 TOML 字段值'}" @keydown.enter="onFieldEnter" />
      </template>
      <p v-if="fieldError" role="alert" class="error">{{ fieldError }} <n-button text :disabled="fieldPending" @click="revealFieldSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="fieldPending" @click="fieldVisible=false">取消</n-button><n-button type="primary" :loading="fieldPending" @click="previewFieldChange">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="arrayVisible" preset="card" class="toml-array-dialog" :title="arrayMode==='remove' ? '删除 TOML 数组项' : '新增 TOML 数组项'"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!arrayPending" :closable="!arrayPending" :close-on-esc="!arrayPending"
      @after-enter="arrayInput?.select()" @after-leave="finishArrayDialog">
      <code>{{ arrayEntry?.path || '$' }}</code>
      <p v-if="arrayMode==='remove'">保留注释和其他项，只修改草稿。</p>
      <template v-else>
        <label for="toml-array-value">值</label><n-input ref="arrayInput" v-model:value="arrayValue" :disabled="arrayPending" placeholder="例如：'内容'、42、true、2026-10-24" :input-props="{id:'toml-array-value','aria-label':'新增 TOML 数组项值'}" @keydown.enter="onArrayEnter" />
      </template>
      <p v-if="arrayError" role="alert" class="error">{{ arrayError }} <n-button text :disabled="arrayPending" @click="revealArraySource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="arrayPending" @click="arrayVisible=false">取消</n-button><n-button type="primary" :loading="arrayPending" @click="previewArrayChange">预览修改</n-button></div></template>
    </n-modal>
    <TextConflictDialog v-if="session.conflict.value" :path="session.conflict.value.path" :library-root="session.conflict.value.external ? undefined : session.conflict.value.root" :draft="session.conflict.value.source" :format-id="session.conflict.value.format" :is-current="() => session.unchanged(session.conflict.value)" @close="session.closeConflict" @reload="session.applyConflict" @copy="session.finishCopy" />
    <n-modal :show="!!copyError" preset="card" title="暂时无法复制这项" class="toml-copy-error-dialog" style="width:min(480px,94vw);max-height:calc(100dvh - 24px)" @update:show="(value: boolean)=>{if(!value)copyError=''}" @after-leave="finishCopyError">
      <p role="alert">{{ copyError }}</p>
      <template #footer><div class="value-edit-actions"><n-button @click="copyError=''">关闭</n-button><n-button type="primary" @click="revealCopySource">定位源码</n-button></div></template>
    </n-modal>
    <n-modal :show="!!moveError" preset="card" title="暂时无法移动这项" class="toml-move-error-dialog" style="width:min(480px,94vw);max-height:calc(100dvh - 24px)" @update:show="(value: boolean)=>{if(!value)moveError=''}" @after-leave="finishMoveError">
      <p role="alert">{{ moveError }}</p>
      <template #footer><div class="value-edit-actions"><n-button @click="moveError=''">关闭</n-button><n-button type="primary" @click="revealMoveSource">定位源码</n-button></div></template>
    </n-modal>
    <StructuredReplacementDialog :search="session.sourceSearch" />
    <StructuredChangeDialog v-if="session.preview.value" :title="session.preview.value.title" :current="session.preview.value.owner.source" :target="session.preview.value.target" :error="session.previewError.value" @apply="session.applyChange" @cancel="session.cancelChange" />
</div>
</template>

<script setup lang="ts">
import { useSourceOutlineNavigation } from '../composables/useSourceOutlineNavigation'
import { useStructuredOutlineState } from '../composables/useStructuredOutlineState'
import WorkspaceHelp from '../components/workspace/WorkspaceHelp.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { basicSetup } from 'codemirror'
import { StreamLanguage } from '@codemirror/language'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage, type InputInst } from 'naive-ui'
import { List as ArrayIcon, ChevronRight as FoldArrayIcon, ChevronDown as UnfoldArrayIcon, AlertTriangle as AlertIcon, ArrowLeft as ArrowLeftIcon, CheckCircle2 as ValidIcon, FileCode2 as FileCodeIcon, FoldVertical as FoldIcon, KeyRound as KeyIcon, PanelRight as InspectorIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Search as SearchIcon, TableProperties as TableIcon, UnfoldVertical as UnfoldIcon } from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import TextConflictDialog from '../components/TextConflictDialog.vue'
import StructuredReplacementDialog from '../components/StructuredReplacementDialog.vue'
import StructuredChangeDialog from '../components/StructuredChangeDialog.vue'
import StructuredHistoryMenu from '../components/StructuredHistoryMenu.vue'
import SourceNodeMenu from '../components/SourceNodeMenu.vue'
import { useSourceNodeMenu } from '../composables/useSourceNodeMenu'
import { useStructuredSession } from '../composables/useStructuredSession'
import { useResponsiveInspector } from '../composables/useResponsiveInspector'
import { findFileFormat } from '../config/fileFormats'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { type TabInfo, useAppStore } from '../store/app'
import { STRUCTURED_ANALYSIS_BUSY_RETRY_MS, structuredAnalysisDelay } from '../utils/structuredAnalysis'

interface Snapshot { path: string; content: string; encoding: string; signature: string; size: number; modified: number; readOnlyReason?: string }
interface Range { start: number; end: number }
interface Diagnostic extends Range { code: string; message: string; line: number; column: number }
interface Entry extends Range { multilineBasic?:boolean; literal?:boolean; index?:number; array?:boolean; childCount?:number; arrayParent?:Range; field?: { name:string;start:number;end:number;renameUnavailableReason?:string }; path: string; label: string; kind: string; depth: number; preview: string; editable?: boolean; editUnavailableReason?: string }
interface Analysis { valid: boolean; tableCount: number; arrayOfTablesCount: number; valueCount: number; maxDepth: number; outline: Entry[]; outlineTruncated: boolean; diagnostics: Diagnostic[] }

const route = useRoute(), router = useRouter(), store = useAppStore(), dialog = useDialog(), message = useMessage()
const { inspectorVisible, toggleInspector } = useResponsiveInspector()
const editorHost = ref<HTMLElement | null>(null), path = computed(() => String(route.query.path || '')), format = computed(() => findFileFormat(path.value))
const isExternal = computed(() => route.query.external === '1')
const fileName = computed(() => path.value.split(/[\\/]/).pop() || '未命名 TOML'), currentTab = computed(() => store.tabs.find(tab => tab.path === path.value))
const outlineState = useStructuredOutlineState({ tab: () => currentTab.value, path: () => path.value, root: () => store.libraryPath, external: () => isExternal.value, format: () => format.value?.id || '' })
const loading = ref(true), saving = ref(false), dirty = ref(false), analysisPending = ref(false), loadError = ref(''), query = outlineState.query
const content = ref(''), signature = ref(''), encoding = ref('utf-8'), readOnlyReason = ref(''), fileSize = ref(0), modified = ref(0), lines = ref(1), cursorLine = ref(1), cursorColumn = ref(1)
const analysis = ref<Analysis | null>(null), readOnly = computed(() => Boolean(readOnlyReason.value))
function emptyArrayRecord<T>():Record<string,T>{return Object.create(null)}
function updateArrayRecord<T>(record:Record<string,T>,key:string,value:T):Record<string,T>{return Object.assign(emptyArrayRecord<T>(),record,{[key]:value})}
// Paths are user data: avoid both inherited keys and Vue's proxy flag names.
const expandedArrays=computed({get:()=>Object.assign(emptyArrayRecord<boolean>(),Object.fromEntries(outlineState.expanded.value.map(path=>[path,true]))),set:(value:Record<string,boolean>)=>{outlineState.expanded.value=Object.keys(value).filter(path=>value[path])}}),arrayItems=shallowRef(emptyArrayRecord<Entry[]>()),arrayErrors=shallowRef(emptyArrayRecord<string>()),arrayLoading=shallowRef(emptyArrayRecord<boolean>())
const arraySource=ref('')
const outlineEntries = computed(() => {
  const rows:Entry[]=[]
  for(const entry of analysis.value?.outline||[]){
    const children=arraySource.value===content.value&&expandedArrays.value[entry.path]?(arrayItems.value[entry.path]||[]):[]
    rows.push(entry, ...children)
  }
  return rows
})
const filteredOutline = computed(() => {
  const q=query.value.trim().toLowerCase(),rows:Entry[]=[]
  for(const entry of analysis.value?.outline||[]){
    const children=arraySource.value===content.value&&expandedArrays.value[entry.path]?(arrayItems.value[entry.path]||[]):[]
    const matches=(e:Entry)=>!q||`${e.path} ${e.preview}`.toLowerCase().includes(q)
    if(matches(entry)||children.some(matches))rows.push(entry)
    rows.push(...children.filter(matches))
  }
  return rows.slice(0,500)
})

let editor: EditorView | null = null, applying = false, loadId = 0, analysisId = 0, timer: ReturnType<typeof setTimeout> | null = null
const errorText = (cause: unknown) => { const e = cause as { message?: string; suggestion?: string }; const text = e?.message || String(cause).replace(/^Error:\s*/, ''); return e?.suggestion ? `${text} · ${e.suggestion}` : text }
const clearTimer = () => { if (timer) clearTimeout(timer); timer = null }
const selectedFieldStart = ref<number>()
const analyzedSource = ref('')
const outlineNav = useSourceOutlineNavigation({
  selection: outlineState.selection,
  entries: () => outlineEntries.value, visible: () => filteredOutline.value,
  identity: () => [path.value, isExternal.value, store.libraryPath].join('\0'),
  ready: () => !loading.value && !analysisPending.value && analyzedSource.value === content.value && !Object.values(arrayLoading.value).some(Boolean),
  preferredOffset: () => selectedFieldStart.value,
})
const session = useStructuredSession({
  positionPanes: () => ({ outline: outlineNav.element.value, inspector: outlineNav.element.value?.closest('aside') || null }),
  positionReady: () => !analysisPending.value && analyzedSource.value === content.value && !Object.values(arrayLoading.value).some(Boolean),
  path: () => path.value, external: () => isExternal.value, format: () => format.value?.id || '',
  generation: () => loadId, editor: () => editor, store, dialog, message, loading, saving, dirty, signature, encoding, fileSize, modified, readOnlyReason,
  analyze: source => analyze(source), clearAnalysis: () => clearTimer(), scheduleAnalysis: () => schedule(),
  applySnapshot: snapshot => apply(snapshot), load: discard => load(discard),
})
const valueEditVisible = ref(false), valueEditPending = ref(false), valueText = ref(''), valueError = ref(''), valueReadFailed = ref(false)
const valueInput = ref<InputInst | null>(null), valueEntry = ref<Entry | null>(null)
let valueOwner: ReturnType<typeof session.capture>, pendingValuePreview: (() => void) | undefined, resumeValue = false
const finishValueDialog = () => { const offer = pendingValuePreview; pendingValuePreview = undefined; offer?.() }
const renameVisible = ref(false), renamePending = ref(false), renameName = ref(''), renameError = ref('')
const renameInput = ref<InputInst | null>(null), renameEntry = ref<Entry | null>(null)
let renameOwner: ReturnType<typeof session.capture>, pendingRename: (() => void) | undefined, resumeRename = false
const finishRenameDialog = () => { const offer = pendingRename; pendingRename = undefined; offer?.() }
const revealRenameSource = () => {
  const owner = renameOwner, field = renameEntry.value?.field
  if (!owner || !field || !session.unchanged(owner)) return
  resumeRename = true; pendingRename = () => { if (session.unchanged(owner)) reveal(field) }; renameVisible.value = false
}
const openRename = (entry: Entry) => {
  if (editDisabled.value || !entry.field) return
  if (resumeRename && renameOwner && session.unchanged(renameOwner) && renameEntry.value?.field?.start === entry.field.start) {
    resumeRename = false; renameVisible.value = true; return
  }
  resumeRename = false; renameOwner = session.capture()
  if (!renameOwner) return
  renameEntry.value = entry; renameName.value = entry.field.name
  renameError.value = entry.field.renameUnavailableReason || ''; renameVisible.value = true
}
const onRenameEnter = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault(); void previewRename()
}
const previewRename = async () => {
  const owner = renameOwner, field = renameEntry.value?.field
  if (!owner || !field || renamePending.value) return
  if (!session.unchanged(owner)) { renameError.value = '文件或草稿已变化，请重新选择字段；输入与内容仍保留'; return }
  renamePending.value = true; renameError.value = ''
  try {
    const result = await invoke<{content:string;start:number;end:number}>('rename_toml_key_source', {content:owner.source,start:field.start,end:field.end,name:renameName.value})
    if (renameOwner !== owner) return
    if (!session.unchanged(owner)) { renameError.value = '草稿已继续编辑，未应用旧结果；输入与内容仍保留'; return }
    const bytes = new TextEncoder().encode(result.content), point = (offset:number) => new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,offset)).length
    pendingRename = () => session.offerChange(owner,'重命名 TOML 字段',result.content,point(result.start),() => {
      query.value = ''; selectedFieldStart.value = result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    renameVisible.value = false
  } catch (cause) { if (renameOwner === owner && session.owns(owner)) renameError.value = errorText(cause) }
  finally { if (renameOwner === owner && session.owns(owner)) renamePending.value = false }
}
const duplicateVisible=ref(false),duplicatePending=ref(false),duplicateName=ref(''),duplicateError=ref('')
const duplicateInput=ref<InputInst|null>(null),duplicateEntry=ref<Entry|null>(null)
let duplicateOwner:ReturnType<typeof session.capture>,pendingDuplicate:(()=>void)|undefined,resumeDuplicate=false
const finishDuplicateDialog=()=>{const action=pendingDuplicate;pendingDuplicate=undefined;if(action)void nextTick(action)}
const revealDuplicateSource=()=>{
  const owner=duplicateOwner,field=duplicateEntry.value?.field
  if(!owner||!field||!session.unchanged(owner))return
  resumeDuplicate=true;pendingDuplicate=()=>{if(session.unchanged(owner))reveal(field)};duplicateVisible.value=false
}
const openDuplicate=(entry:Entry)=>{
  if(editDisabled.value||!entry.field)return
  if(resumeDuplicate&&duplicateOwner&&session.unchanged(duplicateOwner)&&duplicateEntry.value?.field?.start===entry.field.start){resumeDuplicate=false;duplicateVisible.value=true;return}
  resumeDuplicate=false;duplicateOwner=session.capture();if(!duplicateOwner)return
  const entries=analysis.value?.outline||[],index=entries.indexOf(entry)
  let from=index,to=index+1
  while(from>0&&entries[from-1]!.depth>=entry.depth)from--
  while(to<entries.length&&entries[to]!.depth>=entry.depth)to++
  const names=new Set(entries.slice(from,to).filter(e=>e.depth===entry.depth).map(e=>e.field?.name))
  // Leave room for the suffix even when the original name reaches the byte limit.
  const base=Array.from(entry.field.name).slice(0,900).join('')+'_copy'
  let name=base,n=2;while(names.has(name))name=base+n++
  duplicateEntry.value=entry;duplicateName.value=name;duplicateError.value='';duplicateVisible.value=true
}
const onDuplicateEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewDuplicate()}
const previewDuplicate=async()=>{
  const owner=duplicateOwner,field=duplicateEntry.value?.field
  if(!owner||!field||duplicatePending.value)return
  if(!session.unchanged(owner)){duplicateError.value='文件或草稿已变化，请重新选择字段；名称与内容仍保留';return}
  duplicatePending.value=true;duplicateError.value=''
  try{
    const result=await invoke<{content:string;start:number;end:number}>('copy_toml_field_source',{content:owner.source,start:field.start,end:field.end,name:duplicateName.value})
    if(duplicateOwner!==owner)return
    if(!session.unchanged(owner)){duplicateError.value='草稿已继续编辑，未应用旧结果；名称与内容仍保留';return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    pendingDuplicate=()=>session.offerChange(owner,'复制 TOML 字段',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    duplicateVisible.value=false
  }catch(cause){if(duplicateOwner===owner&&session.owns(owner))duplicateError.value=errorText(cause)}
  finally{if(duplicateOwner===owner&&session.owns(owner))duplicatePending.value=false}
}
const fieldVisible=ref(false), fieldPending=ref(false), fieldMode=ref<'add'|'remove'>('add'), fieldName=ref(''), fieldValue=ref("''"), fieldError=ref('')
const fieldInput=ref<InputInst|null>(null), fieldEntry=ref<Entry|null>(null)
const openRootFieldMenu=(event:MouseEvent)=>{
  if(!analysis.value?.valid)return
  event.preventDefault();event.stopPropagation()
  nodeMenu.open(event,{path:'$',label:'文档根部',kind:'root',start:0,end:0,depth:0,preview:''})
}
let fieldOwner:ReturnType<typeof session.capture>, pendingField:(()=>void)|undefined, resumeField=false
const finishFieldDialog=()=>{const offer=pendingField;pendingField=undefined;if(offer)void nextTick(offer)}
const revealFieldSource=()=>{
  const owner=fieldOwner,entry=fieldEntry.value
  if(!owner||!entry||!session.unchanged(owner))return
  resumeField=true;pendingField=()=>{if(session.unchanged(owner))reveal(entry.field||entry)};fieldVisible.value=false
}
const openFieldChange=(entry:Entry,mode:'add'|'remove')=>{
  if(editDisabled.value)return
  if(resumeField&&fieldMode.value===mode&&fieldOwner&&session.unchanged(fieldOwner)&&fieldEntry.value?.path===entry.path){resumeField=false;fieldVisible.value=true;return}
  resumeField=false;fieldOwner=session.capture();if(!fieldOwner)return
  fieldEntry.value=entry;fieldMode.value=mode;fieldName.value='';fieldValue.value="''";fieldError.value=''
  if(mode==='add')fieldVisible.value=true;else void previewFieldChange()
}
const onFieldEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewFieldChange()}
const previewFieldChange=async()=>{
  const owner=fieldOwner,entry=fieldEntry.value,mode=fieldMode.value
  if(!owner||!entry||fieldPending.value)return
  if(!session.unchanged(owner)){fieldError.value='文件或草稿已变化，请重新选择；当前输入与内容仍保留';fieldVisible.value=true;return}
  fieldPending.value=true;fieldError.value=''
  try{
    const field=entry.field
    const result=await invoke<{content:string;start:number;end:number;valueType?:string}>(mode==='add'?'add_toml_field_source':'remove_toml_field_source',{
      content:owner.source,...(mode==='add'?{start:['table','root'].includes(entry.kind)?entry.start:field?.start??0,end:['table','root'].includes(entry.kind)?entry.end:field?.end??0,inside:['table','root'].includes(entry.kind),name:fieldName.value,value:fieldValue.value}:{start:field?.start,end:field?.end})})
    if(fieldOwner!==owner)return
    if(!session.unchanged(owner)){fieldError.value='草稿已继续编辑，未应用旧结果；当前输入与内容仍保留';fieldVisible.value=true;return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    const offer=()=>session.offerChange(owner,mode==='add'?`新增 TOML 字段${result.valueType?' · '+result.valueType:''}`:'删除 TOML 字段',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=result.end>result.start?result.start:undefined
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    if(fieldVisible.value){pendingField=offer;fieldVisible.value=false}else offer()
  }catch(cause){if(fieldOwner===owner&&session.owns(owner)){fieldError.value=errorText(cause);fieldVisible.value=true}}
  finally{if(fieldOwner===owner&&session.owns(owner))fieldPending.value=false}
}
const arrayVisible=ref(false), arrayPending=ref(false), arrayMode=ref<'append'|'after'|'remove'>('append'), arrayValue=ref("''"), arrayError=ref('')
const arrayInput=ref<InputInst|null>(null), arrayEntry=ref<Entry|null>(null)
let arrayOwner:ReturnType<typeof session.capture>, pendingArray:(()=>void)|undefined, resumeArray=false
const finishArrayDialog=()=>{const offer=pendingArray;pendingArray=undefined;if(offer)void nextTick(offer)}
const revealArraySource=()=>{
  const owner=arrayOwner,entry=arrayEntry.value
  if(!owner||!entry||!session.unchanged(owner))return
  resumeArray=true;pendingArray=()=>{if(session.unchanged(owner))reveal(entry)};arrayVisible.value=false
}
const openArrayChange=(entry:Entry,mode:'append'|'after'|'remove')=>{
  if(editDisabled.value)return
  if(resumeArray&&arrayMode.value===mode&&arrayOwner&&session.unchanged(arrayOwner)&&arrayEntry.value?.path===entry.path){resumeArray=false;arrayVisible.value=true;return}
  resumeArray=false;arrayOwner=session.capture();if(!arrayOwner)return
  arrayEntry.value=entry;arrayMode.value=mode;arrayValue.value="''";arrayError.value=''
  if(mode!=='remove')arrayVisible.value=true;else void previewArrayChange()
}
const onArrayEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewArrayChange()}
const previewArrayChange=async()=>{
  const owner=arrayOwner,entry=arrayEntry.value,mode=arrayMode.value
  if(!owner||!entry||arrayPending.value)return
  if(!session.unchanged(owner)){arrayError.value='文件或草稿已变化，请重新选择；当前输入与内容仍保留';arrayVisible.value=true;return}
  arrayPending.value=true;arrayError.value=''
  try{
    const parent=entry.arrayParent||entry
    const result=await invoke<{content:string;start:number;end:number;valueType?:string}>(mode==='remove'?'remove_toml_array_item_source':'add_toml_array_item_source',{
      content:owner.source,start:parent.start,end:parent.end,...(mode==='remove'?{itemStart:entry.start,itemEnd:entry.end}:{...(mode==='after'?{afterStart:entry.start,afterEnd:entry.end}:{}),value:arrayValue.value})})
    if(arrayOwner!==owner)return
    if(!session.unchanged(owner)){arrayError.value='草稿已继续编辑，未应用旧结果；当前输入与内容仍保留';arrayVisible.value=true;return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    const offer=()=>session.offerChange(owner,mode!=='remove'?`新增 TOML 数组项${result.valueType?' · '+result.valueType:''}`:'删除 TOML 数组项',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=mode==='remove'?result.start:undefined
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    if(arrayVisible.value){pendingArray=offer;arrayVisible.value=false}else offer()
  }catch(cause){if(arrayOwner===owner&&session.owns(owner)){arrayError.value=errorText(cause);arrayVisible.value=true}}
  finally{if(arrayOwner===owner&&session.owns(owner))arrayPending.value=false}
}
let arrayRequests=emptyArrayRecord<object>()
const loadArrayItems=async(entry:Entry)=>{
  const owner=session.capture();if(!owner)return
  const request={};arrayRequests[entry.path]=request
  arrayLoading.value=updateArrayRecord(arrayLoading.value,entry.path,true);arrayErrors.value=updateArrayRecord(arrayErrors.value,entry.path,'')
  try{
    const items=await invoke<{index:number;start:number;end:number;preview:string;editable:boolean;literal?:boolean;multilineBasic?:boolean}[]>('inspect_toml_array_items_source',{content:owner.source,start:entry.start,end:entry.end})
    if(arrayRequests[entry.path]!==request||!session.unchanged(owner))return
    arraySource.value=owner.source;arrayItems.value=updateArrayRecord(arrayItems.value,entry.path,items.map(item=>({...item,path:`${entry.path}[${item.index}]`,label:`[${item.index}]`,kind:'array-item',depth:entry.depth+1,arrayParent:{start:entry.start,end:entry.end}})))
  }catch(cause){if(arrayRequests[entry.path]===request&&session.unchanged(owner))arrayErrors.value=updateArrayRecord(arrayErrors.value,entry.path,errorText(cause))}
  finally{if(arrayRequests[entry.path]===request&&session.owns(owner))arrayLoading.value=updateArrayRecord(arrayLoading.value,entry.path,false)}
}
const toggleArray=async(entry:Entry)=>{
  if(arrayLoading.value[entry.path]||loading.value||analysisPending.value||analyzedSource.value!==content.value)return
  if(expandedArrays.value[entry.path]){expandedArrays.value=updateArrayRecord(expandedArrays.value,entry.path,false);return}
  expandedArrays.value=updateArrayRecord(expandedArrays.value,entry.path,true);await loadArrayItems(entry)
}
const clearArrayItems=()=>{arrayRequests=emptyArrayRecord<object>();arrayItems.value=emptyArrayRecord<Entry[]>();arrayErrors.value=emptyArrayRecord<string>();arrayLoading.value=emptyArrayRecord<boolean>();arraySource.value=''}
const refreshExpandedArrays=(result:Analysis)=>{
  if(!result.valid)return
  const paths=new Set(result.outline.filter(entry=>entry.array).map(entry=>entry.path))
  outlineState.expanded.value=outlineState.expanded.value.filter(path=>paths.has(path))
  for(const entry of result.outline)if(entry.array&&expandedArrays.value[entry.path])void loadArrayItems(entry)
}
watch(content,clearArrayItems,{flush:'sync'})
const copyPending=ref(false),copyError=ref(''),copyEntry=ref<Entry|null>(null)
let copyRequest:object|undefined,pendingCopyReveal:(()=>void)|undefined
let copyOwner:ReturnType<typeof session.capture>
const finishCopyError=()=>{const reveal=pendingCopyReveal;pendingCopyReveal=undefined;if(reveal)void nextTick(reveal)}
const copyItem=async(entry:Entry)=>{
  if(editDisabled.value)return
  const owner=session.capture();if(!owner)return
  const request={};copyRequest=request;copyOwner=owner;pendingCopyReveal=undefined;copyPending.value=true;copyError.value='';copyEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('copy_toml_array_item_source',{content:owner.source,start:entry.arrayParent?.start,end:entry.arrayParent?.end,itemStart:entry.start,itemEnd:entry.end})
    if(copyRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,'复制TOML 数组项',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=undefined
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(copyRequest===request&&session.unchanged(owner))copyError.value=errorText(cause)}
  finally{if(copyRequest===request&&session.owns(owner))copyPending.value=false}
}
const revealCopySource=()=>{const owner=copyOwner,entry=copyEntry.value;if(owner&&entry&&session.unchanged(owner))pendingCopyReveal=()=>{if(session.unchanged(owner))reveal(entry)};copyError.value=''}
const movePending=ref(false),moveError=ref(''),moveEntry=ref<Entry|null>(null)
let moveRequest:object|undefined,pendingMoveReveal:(()=>void)|undefined,moveOwner:ReturnType<typeof session.capture>
const finishMoveError=()=>{const reveal=pendingMoveReveal;pendingMoveReveal=undefined;if(reveal)void nextTick(reveal)}
const canMoveItem=(entry:Entry,direction:'up'|'down')=>{
  const parent=entry.arrayParent,index=entry.index
  if(entry.kind!=='array-item'||!parent||index===undefined)return false
  const array=analysis.value?.outline.find(e=>e.array&&e.start===parent.start&&e.end===parent.end)
  return !!array&&index<Number(array.childCount)&&(direction==='up'?index>0:index+1<Number(array.childCount))
}
const moveItem=async(entry:Entry,direction:'up'|'down')=>{
  if(editDisabled.value||!canMoveItem(entry,direction))return
  const owner=session.capture();if(!owner)return
  const request={};moveRequest=request;moveOwner=owner;pendingMoveReveal=undefined;movePending.value=true;moveError.value='';moveEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('move_toml_array_item_source',{content:owner.source,start:entry.arrayParent!.start,end:entry.arrayParent!.end,itemStart:entry.start,itemEnd:entry.end,direction})
    if(moveRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,direction==='up'?'上移 TOML 数组项':'下移 TOML 数组项',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(moveRequest===request&&session.unchanged(owner))moveError.value=errorText(cause)}
  finally{if(moveRequest===request&&session.owns(owner))movePending.value=false}
}
const fieldSiblings=(entry:Entry)=>{
  const entries=analysis.value?.outline||[],i=entries.findIndex(e=>e.field?.start===entry.field?.start&&e.field?.end===entry.field?.end)
  if(i<0||!entry.field)return []
  let from=i,to=i+1
  while(from>0&&entries[from-1]!.depth>=entry.depth)from--
  while(to<entries.length&&entries[to]!.depth>=entry.depth)to++
  return entries.slice(from,to).filter(e=>e.depth===entry.depth&&e.kind==='value'&&e.field)
}
const canMoveField=(entry:Entry,direction:'up'|'down')=>{
  const siblings=fieldSiblings(entry),i=siblings.findIndex(e=>e.field?.start===entry.field?.start)
  return i>=0&&(direction==='up'?i>0:i+1<siblings.length)
}
const moveField=async(entry:Entry,direction:'up'|'down')=>{
  if(editDisabled.value||!canMoveField(entry,direction))return
  const owner=session.capture();if(!owner)return
  const request={};moveRequest=request;moveOwner=owner;pendingMoveReveal=undefined;movePending.value=true;moveError.value='';moveEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('move_toml_field_source',{content:owner.source,start:entry.field!.start,end:entry.field!.end,direction})
    if(moveRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,direction==='up'?'上移 TOML 字段':'下移 TOML 字段',result.content,point(result.start),()=>{
      query.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(moveRequest===request&&session.unchanged(owner))moveError.value=errorText(cause)}
  finally{if(moveRequest===request&&session.owns(owner))movePending.value=false}
}
const revealMoveSource=()=>{const owner=moveOwner,entry=moveEntry.value;if(owner&&entry&&session.unchanged(owner))pendingMoveReveal=()=>{if(session.unchanged(owner))reveal(entry)};moveError.value=''}
const editDisabled = computed(() => loading.value || saving.value || readOnly.value || analysisPending.value || valueEditPending.value || renamePending.value || duplicatePending.value || fieldPending.value || arrayPending.value || copyPending.value || movePending.value || analyzedSource.value !== content.value || !analysis.value?.valid)
// Classify the parser-confirmed original literal only; never round-trip through Date.
const valueDatetimeKind = computed(() => {
  const raw=valueEntry.value?.preview || ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '日期'
  if (/^\d{2}:\d{2}(?::\d{2})?/.test(raw)) return '本地时间'
  if (/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:/.test(raw)) return /(?:[Zz]|[+-]\d{2}:\d{2})$/.test(raw) ? '带时区日期时间' : '本地日期时间'
  return ''
})
const valueIsMultiline = computed(() => !!(valueEntry.value?.literal || valueEntry.value?.multilineBasic))
const openValueEdit = async (entry: Entry) => {
  if (editDisabled.value) return
  if (!entry.editable) { message.info(entry.editUnavailableReason || '此内容请在源码中修改'); reveal(entry); return }
  if (resumeValue && valueOwner && session.unchanged(valueOwner) && valueEntry.value?.path===entry.path && valueEntry.value.start===entry.start) {
    resumeValue=false; valueEditVisible.value=true; return
  }
  resumeValue=false; pendingValuePreview=undefined
  const owner = session.capture(); valueOwner = owner
  if (!owner) return
  valueEntry.value = entry; valueError.value = ''; valueReadFailed.value = false; valueEditPending.value = true
  try {
    const text = entry.literal || entry.multilineBasic
      ? await invoke<string>('inspect_toml_literal_source',{content:owner.source,start:entry.start,end:entry.end})
      : new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(owner.source).slice(entry.start,entry.end))
    if(valueOwner!==owner||!session.unchanged(owner))return
    valueText.value = text; valueEditVisible.value = true
  } catch(cause) {
    if(valueOwner===owner&&session.unchanged(owner)){valueText.value='';valueReadFailed.value=true;valueError.value=errorText(cause);valueEditVisible.value=true}
  } finally { if(valueOwner===owner&&session.owns(owner))valueEditPending.value=false }
}
const revealValueSource = () => {
  const owner=valueOwner,entry=valueEntry.value
  if(!owner||!entry||!session.unchanged(owner))return
  resumeValue=true;pendingValuePreview=()=>{if(session.unchanged(owner))reveal(entry)};valueEditVisible.value=false
}
const onValueEnter = (event:KeyboardEvent) => {
  if(valueIsMultiline.value||(valueEntry.value?.kind!=='array-item'&&!valueDatetimeKind.value)||event.isComposing||event.keyCode===229)return
  event.preventDefault();void previewValueEdit()
}
const previewValueEdit = async () => {
  const owner = valueOwner, entry = valueEntry.value
  if (!owner || !entry || valueEditPending.value || valueReadFailed.value) return
  if (!session.unchanged(owner)) { valueError.value = '当前文件或草稿已变化，请重新选择；当前输入与内容仍保留'; return }
  valueEditPending.value = true; valueError.value = ''
  try {
    const item=entry.kind==='array-item'&&entry.arrayParent
    const result=item && !valueIsMultiline.value
      ? await invoke<{content:string;start:number;end:number;valueType?:string}>('replace_toml_array_item_source',{content:owner.source,start:item.start,end:item.end,itemStart:entry.start,itemEnd:entry.end,replacement:valueText.value})
      : {content:await invoke<string>(entry.literal||entry.multilineBasic?'replace_toml_literal_source':'replace_toml_value_source',{content:owner.source,start:entry.start,end:entry.end,replacement:valueText.value}),start:entry.start,end:entry.end,valueType:undefined}
    if(valueOwner!==owner||!session.owns(owner))return
    if (!session.unchanged(owner)) { valueError.value = '当前草稿已变化，请重新选择；当前输入与内容仍保留'; return }
    if(entry.literal||entry.multilineBasic) result.end=entry.end+new TextEncoder().encode(result.content).length-new TextEncoder().encode(owner.source).length
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    pendingValuePreview = () => session.offerChange(owner,item?(valueIsMultiline.value?'修改 TOML 数组多行文字':`修改 TOML 数组项${result.valueType?' · '+result.valueType:''}`):valueIsMultiline.value?'修改 TOML 多行文字':'修改 TOML 值',result.content,point(result.start),item?()=>{
      query.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    }:undefined)
    valueEditVisible.value = false
  } catch (cause) { if (valueOwner===owner&&session.owns(owner)) valueError.value = errorText(cause) }
  finally { if (valueOwner===owner&&session.owns(owner)) valueEditPending.value = false }
}
const nodeMenu = useSourceNodeMenu<Entry>(session, { fresh: () => !analysisPending.value && analyzedSource.value === content.value, reveal: entry => reveal(entry),
  extra: entry => [...(entry.field&&entry.kind==='value' ? [{key:'field-up',label:'上移',disabled:editDisabled.value||!canMoveField(entry,'up')},{key:'field-down',label:'下移',disabled:editDisabled.value||!canMoveField(entry,'down')}] : []),...(entry.array ? [{key:'append-item',label:'追加数组项…',disabled:editDisabled.value},{key:'toggle-array',label:expandedArrays.value[entry.path]?'收起数组项':'展开数组项',disabled:analysisPending.value}] : []), ...(entry.kind==='array-item' ? [{key:'move-up',label:'上移',disabled:editDisabled.value||!canMoveItem(entry,'up')},{key:'move-down',label:'下移',disabled:editDisabled.value||!canMoveItem(entry,'down')},{key:'copy-item',label:'复制为新项…',disabled:editDisabled.value},{key:'after-item',label:'在此项后新增…',disabled:editDisabled.value},{key:'remove-item',label:'删除数组项…',disabled:editDisabled.value}] : []),...(['table','root'].includes(entry.kind)||entry.field ? [{key:'add-field',label:'新增字段…',disabled:editDisabled.value}] : []), ...(entry.field&&entry.kind==='value' ? [{key:'remove-field',label:'删除字段…',disabled:editDisabled.value}] : []), ...(entry.field&&entry.kind==='value' ? [{key:'duplicate-field',label:'复制为新字段…',disabled:editDisabled.value}] : []), ...(entry.field ? [{key:'rename-key',label:'重命名字段…',disabled:editDisabled.value}] : []), ...(['value','array-item'].includes(entry.kind) ? [{key:'edit-value',label:'修改值…',disabled:editDisabled.value}] : [])],
  action: (key,entry) => { if(key==='field-up')void moveField(entry,'up');if(key==='field-down')void moveField(entry,'down'); if(key==='move-up')void moveItem(entry,'up');if(key==='move-down')void moveItem(entry,'down');if(key==='copy-item')void copyItem(entry); if(key==='append-item')openArrayChange(entry,'append');if(key==='after-item')openArrayChange(entry,'after');if(key==='remove-item')openArrayChange(entry,'remove');if(key==='toggle-array')void toggleArray(entry);if(key==='edit-value')openValueEdit(entry); if(key==='rename-key')openRename(entry);if(key==='duplicate-field')openDuplicate(entry);if(key==='add-field')openFieldChange(entry,'add');if(key==='remove-field')openFieldChange(entry,'remove') } })
const syncTab = (isDirty = dirty.value) => session.sync(isDirty)
const registerTab = (snapshot?: Snapshot) => session.bind(snapshot)

const analyze = async (source: string) => { const analysisOwner = session.capture(); const id = ++analysisId; analysisPending.value = true; try { const result = await invoke<Analysis>('analyze_toml_source', { content: source }); if (session.owns(analysisOwner) && id === analysisId && content.value === source) { analysis.value = result; analyzedSource.value = source;refreshExpandedArrays(result) }; return result } finally { if (id === analysisId) analysisPending.value = false } }
const schedule = () => {
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    if (analysisPending.value) {
      schedule()
      return
    }
    const source = content.value
    void analyze(source).catch(e => message.error(`实时分析失败：${errorText(e)}`))
  }, analysisPending.value ? STRUCTURED_ANALYSIS_BUSY_RETRY_MS : structuredAnalysisDelay(content.value.length))
}
const extensions = (locked: boolean) => [basicSetup, session.searchExtension, StreamLanguage.define(toml), EditorState.readOnly.of(locked), EditorView.editable.of(!locked), EditorView.lineWrapping,
  EditorView.updateListener.of(update => { if (update.docChanged) { content.value = update.state.doc.toString(); lines.value = update.state.doc.lines; if (!applying) { session.refreshDirty(); schedule() } } if (update.docChanged || update.selectionSet) { const p = update.state.selection.main.head, line = update.state.doc.lineAt(p); cursorLine.value = line.number; cursorColumn.value = p - line.from + 1 } }),
  ...codeMirrorThemeExtensions]
const replace = (source: string, locked: boolean) => { if (!editor) return; session.beforeReplace(); applying = true; editor.setState(EditorState.create({ doc: source, extensions: extensions(locked) })); applying = false; content.value = editor.state.doc.toString(); lines.value = editor.state.doc.lines }
const apply = async (s: Snapshot) => { signature.value = s.signature; encoding.value = s.encoding; fileSize.value = s.size; modified.value = s.modified; readOnlyReason.value = s.readOnlyReason || ''; dirty.value = false; replace(s.content, Boolean(s.readOnlyReason)); registerTab(s); await analyze(editor?.state.doc.toString() || '') }
const restore = async (tab: TabInfo) => { signature.value = tab.textSignature || ''; encoding.value = tab.textEncoding || 'utf-8'; fileSize.value = tab.textSize || 0; modified.value = tab.textModified || 0; readOnlyReason.value = tab.textReadOnlyReason || ''; dirty.value = true; replace(tab.content || '', Boolean(tab.textReadOnlyReason)); session.bind(); store.activateTab(tab.id); await analyze(tab.content || '') }
const load = async (discardDraft = false) => {
  const hadPrior = session.hasDocument()
  loadId++; analysisId++; clearTimer()
  const owner = session.capture()
  if (!owner) return
  session.cancelChange(); session.closeConflict(); nodeMenu.close()
  copyRequest=undefined;copyOwner=undefined;pendingCopyReveal=undefined;copyPending.value=false;copyError.value='';copyEntry.value=null
  moveRequest=undefined;moveOwner=undefined;pendingMoveReveal=undefined;movePending.value=false;moveError.value='';moveEntry.value=null
  valueEditVisible.value = false; valueEditPending.value = false; valueOwner = undefined; valueEntry.value = null; pendingValuePreview = undefined; resumeValue=false;valueReadFailed.value=false
  clearArrayItems();arrayVisible.value=false;arrayPending.value=false;arrayOwner=undefined;arrayEntry.value=null;pendingArray=undefined;resumeArray=false
  fieldVisible.value=false;fieldPending.value=false;fieldOwner=undefined;fieldEntry.value=null;pendingField=undefined;resumeField=false
  duplicateVisible.value=false;duplicatePending.value=false;duplicateOwner=undefined;duplicateEntry.value=null;pendingDuplicate=undefined;resumeDuplicate=false
  renameVisible.value = false; renamePending.value = false; renameOwner = undefined; renameEntry.value = null; pendingRename = undefined; resumeRename = false; selectedFieldStart.value = undefined
  loading.value = true; loadError.value = ''
  if (!hadPrior) analysis.value = null

  try {
    if (!owner.path || !['toml'].includes(owner.format)) throw new Error('当前路径不是已注册的结构化文件')
    await session.waitForWrite(owner)
    if (!session.unchanged(owner)) return
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) { await restore(draft); return }
    const snapshot = await invoke<Snapshot>(owner.external ? 'read_external_text_document' : 'read_text_document', {
      ...(owner.external ? {} : {libraryRoot:owner.root}), path:owner.path, formatId:owner.format })
    if (!session.unchanged(owner)) return
    await apply(snapshot)
  } catch (error) {
    if (session.owns(owner)) {
      const detail = (error as {message?:string})?.message || String(error)
      if (hadPrior) message.error('重新读取失败，原内容与草稿仍保留：' + detail)
      else loadError.value = detail
    }
  } finally { if (session.owns(owner)) loading.value = false }
}

const reveal = (range: Range) => {
  outlineNav.selectRange(range)
  if (analyzedSource.value !== content.value) { message.info('正在更新定位，请稍候再试'); return } if (!editor) return; const bytes = new TextEncoder().encode(content.value), point = (n: number) => new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0, Math.min(n, bytes.length))).length, from = point(range.start), to = Math.max(from, point(range.end)); editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) }); editor.focus() }
const save = () => session.save()

const reload = () => session.reload()

watch([path, isExternal, () => store.libraryPath], () => { syncTab(); session.beforeReplace(); saving.value = false; void load() }, {flush:'sync'})
onMounted(async () => { await nextTick(); if (editorHost.value) editor = new EditorView({ state: EditorState.create({ doc: '', extensions: extensions(true) }), parent: editorHost.value }); await load();    })
onBeforeUnmount(() => { clearTimer(); syncTab(); editor?.destroy(); editor = null;    })
</script>

<style scoped>
.value-edit-actions{display:flex;justify-content:flex-end;gap:10px}
.toml-value-edit-dialog code{display:block;overflow-wrap:anywhere;margin-bottom:10px}
.toml-value-edit-dialog :deep(.n-card__content){overflow:auto}
.workspace{width:100%;height:100%;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--theme-bg);color:var(--theme-text)}header{min-height:54px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:var(--theme-border);background:var(--theme-surface)}.identity,.actions{display:flex;align-items:center;gap:8px;min-width:0}.identity>div,.heading>div{display:flex;flex-direction:column;min-width:0}.identity strong{max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity span,.heading span{font-size:11px;color:var(--theme-text-secondary)}.accent{color:var(--theme-primary)}.error{color:var(--theme-danger,#d03050)}main{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,360px)}.source{position:relative;min-width:0;min-height:0}.editor{width:100%;height:100%}.hidden{visibility:hidden}.state{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}aside{min-height:0;padding:14px;display:flex;flex-direction:column;gap:12px;border-left:var(--theme-border);background:var(--theme-surface)}.heading{display:flex;align-items:center;justify-content:space-between}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.metrics div{padding:8px 3px;display:flex;flex-direction:column;align-items:center;border:var(--theme-border);border-radius:8px}.metrics span{font-size: var(--text-compact);color:var(--theme-text-secondary)}.diagnostic{padding:8px;display:flex;gap:8px;border:0;border-radius:7px;color:var(--theme-danger,#d03050);background:rgba(208,48,80,.08);text-align:left}.diagnostic span,.outline button span{min-width:0;display:flex;flex:1;flex-direction:column}.diagnostic small,.outline small{overflow:hidden;color:var(--theme-text-secondary);text-overflow:ellipsis;white-space:nowrap}.valid{padding:9px;display:flex;gap:8px;border-radius:8px;color:var(--theme-primary);background:rgba(var(--theme-primary-rgb),.08)}.outline{min-height:0;flex:1;overflow:auto}.outline button{width:100%;min-height:48px;padding-top:6px;padding-right:8px;padding-bottom:6px;display:flex;align-items:center;gap:7px;border:0;border-bottom:var(--theme-border);color:inherit;background:transparent;text-align:left;cursor:pointer}.outline button:hover{background:rgba(var(--theme-primary-rgb),.07)}.outline p{padding:14px 6px;color:var(--theme-text-secondary);font-size:12px;text-align:center}.outline .warning{color:var(--theme-warning,#f0a020)}footer{min-height:28px;padding:0 14px;display:flex;align-items:center;gap:14px;border-top:var(--theme-border);color:var(--theme-text-secondary);background:var(--theme-surface);font-size:11px}
main.inspector-hidden{grid-template-columns:minmax(0,1fr)}main.inspector-hidden aside{display:none}
.toml-workspace { container-type: inline-size; }
.toml-workspace > :deep(.workspace-tabs) { flex: 0 0 34px; }
header { flex-shrink: 0; flex-wrap: wrap; gap: 8px; padding-block: 6px; }
.identity { flex: 1; }
.actions { max-width: 100%; overflow-x: auto; padding-block: 2px; }
.actions > * { flex-shrink: 0; }
aside { overflow: auto; }
aside > :not(.outline) { flex-shrink: 0; }
.outline { min-height: 96px; }
footer { flex-shrink: 0; overflow-x: auto; white-space: nowrap; }
footer > * { flex-shrink: 0; }
@container (max-width: 760px) {
  header { padding-inline: 9px; }
  .identity strong { max-width: 100%; }
  .actions { width: 100%; }
  main { grid-template-columns: minmax(0, 1fr); }
  main:not(.inspector-hidden) { grid-template-rows: minmax(0, 1fr) minmax(0, 42%); }
  aside { border-left: 0; border-top: var(--theme-border); }
  footer { gap: 8px; padding-inline: 9px; }
}
.toml-key-rename-dialog :deep(.n-card__content) { overflow:auto; }
.toml-key-rename-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.toml-key-rename-dialog label { display:block; margin-bottom:6px; }
.value-edit-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.outline button[aria-current="true"] { background:var(--theme-accent-hover); color:var(--theme-accent); }
.toml-field-dialog :deep(.n-card__content) { overflow:auto; }
.toml-field-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.toml-field-dialog label { display:block; margin:12px 0 6px; }
.outline-node { display:flex; min-width:0; }
.outline-node > button:first-child { flex:1; min-width:0; }
.outline-node > .array-toggle { flex:0 0 30px; width:30px; min-height:30px; justify-content:center; padding:3px; align-self:stretch; }
.array-error { padding:6px; font-size:12px; color:var(--theme-danger,#d03050); overflow-wrap:anywhere; }
.toml-array-dialog :deep(.n-card__content) { overflow:auto; }
.toml-array-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.toml-array-dialog label { display:block; margin:12px 0 6px; }
</style>
