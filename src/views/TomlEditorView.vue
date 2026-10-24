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
        <div class="outline">
          <button v-for="item in filteredOutline" :key="`${item.start}:${item.path}`" :aria-current="selectedFieldStart !== undefined && selectedFieldStart === item.field?.start ? 'true' : undefined" :style="{ paddingLeft: `${10 + Math.min(item.depth, 8) * 14}px` }" @click="reveal(item)" @contextmenu.prevent.stop="nodeMenu.open($event, item)">
            <n-icon :component="item.kind === 'value' ? KeyIcon : TableIcon" />
            <span><strong>{{ item.label }}</strong><small>{{ item.path }}</small><small v-if="item.preview">{{ item.preview }}</small></span>
          </button>
          <p v-if="!filteredOutline.length">{{ analysis?.valid ? '没有匹配的键路径' : '修复语法后显示提纲' }}</p>
          <p v-if="analysis?.outlineTruncated" class="warning">结构过大，仅显示受限范围</p>
        </div>
      </aside>
    </main>
    <footer><span>{{ readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span><span>{{ encoding.toUpperCase() }}</span><span>{{ lines }} 行</span><span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span></footer>

    <SourceNodeMenu v-if="nodeMenu.menu.value" :x="nodeMenu.menu.value.x" :y="nodeMenu.menu.value.y" :options="nodeMenu.items.value" @select="nodeMenu.select" @close="nodeMenu.close" />
    <n-modal v-model:show="valueEditVisible" preset="card" class="toml-value-edit-dialog" title="修改 TOML 值" :style="{width:'min(520px,94vw)'}"
      :mask-closable="!valueEditPending" :closable="!valueEditPending" :close-on-esc="!valueEditPending"
      @after-enter="valueInput?.select()" @after-leave="finishValueDialog">
      <code>{{ valueEntry?.path }}</code>
      <n-input ref="valueInput" v-model:value="valueText" type="textarea" :autosize="{minRows:3,maxRows:8}"
        :disabled="valueEditPending" aria-label="TOML 字段值" :input-props="{'aria-label':'TOML 字段值'}" autofocus />
      <p v-if="valueError" role="alert" class="error">{{ valueError }}</p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="valueEditPending" @click="valueEditVisible=false">取消</n-button>
        <n-button type="primary" :loading="valueEditPending" @click="previewValueEdit">预览修改</n-button></div></template>
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
    <TextConflictDialog v-if="session.conflict.value" :path="session.conflict.value.path" :library-root="session.conflict.value.external ? undefined : session.conflict.value.root" :draft="session.conflict.value.source" :format-id="session.conflict.value.format" :is-current="() => session.unchanged(session.conflict.value)" @close="session.closeConflict" @reload="session.applyConflict" @copy="session.finishCopy" />
    <StructuredChangeDialog v-if="session.preview.value" :title="session.preview.value.title" :current="session.preview.value.owner.source" :target="session.preview.value.target" :error="session.previewError.value" @apply="session.applyChange" @cancel="session.cancelChange" />
</div>
</template>

<script setup lang="ts">
import WorkspaceHelp from '../components/workspace/WorkspaceHelp.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { AlertTriangle as AlertIcon, ArrowLeft as ArrowLeftIcon, CheckCircle2 as ValidIcon, FileCode2 as FileCodeIcon, FoldVertical as FoldIcon, KeyRound as KeyIcon, PanelRight as InspectorIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Search as SearchIcon, TableProperties as TableIcon, UnfoldVertical as UnfoldIcon } from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import TextConflictDialog from '../components/TextConflictDialog.vue'
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
interface Entry extends Range { field?: { name:string;start:number;end:number;renameUnavailableReason?:string }; path: string; label: string; kind: string; depth: number; preview: string; editable?: boolean; editUnavailableReason?: string }
interface Analysis { valid: boolean; tableCount: number; arrayOfTablesCount: number; valueCount: number; maxDepth: number; outline: Entry[]; outlineTruncated: boolean; diagnostics: Diagnostic[] }

const route = useRoute(), router = useRouter(), store = useAppStore(), dialog = useDialog(), message = useMessage()
const { inspectorVisible, toggleInspector } = useResponsiveInspector()
const editorHost = ref<HTMLElement | null>(null), path = computed(() => String(route.query.path || '')), format = computed(() => findFileFormat(path.value))
const isExternal = computed(() => route.query.external === '1')
const fileName = computed(() => path.value.split(/[\\/]/).pop() || '未命名 TOML'), currentTab = computed(() => store.tabs.find(tab => tab.path === path.value))
const loading = ref(true), saving = ref(false), dirty = ref(false), analysisPending = ref(false), loadError = ref(''), query = ref('')
const content = ref(''), signature = ref(''), encoding = ref('utf-8'), readOnlyReason = ref(''), fileSize = ref(0), modified = ref(0), lines = ref(1), cursorLine = ref(1), cursorColumn = ref(1)
const analysis = ref<Analysis | null>(null), readOnly = computed(() => Boolean(readOnlyReason.value))
const filteredOutline = computed(() => { const q = query.value.trim().toLowerCase(), entries = analysis.value?.outline || []; return (q ? entries.filter(e => `${e.path} ${e.preview}`.toLowerCase().includes(q)) : entries).slice(0, 500) })
let editor: EditorView | null = null, applying = false, loadId = 0, analysisId = 0, timer: ReturnType<typeof setTimeout> | null = null
const errorText = (cause: unknown) => { const e = cause as { message?: string; suggestion?: string }; const text = e?.message || String(cause).replace(/^Error:\s*/, ''); return e?.suggestion ? `${text} · ${e.suggestion}` : text }
const clearTimer = () => { if (timer) clearTimeout(timer); timer = null }
const selectedFieldStart = ref<number>()
const analyzedSource = ref('')
const session = useStructuredSession({
  path: () => path.value, external: () => isExternal.value, format: () => format.value?.id || '',
  generation: () => loadId, editor: () => editor, store, dialog, message, loading, saving, dirty, signature, encoding, fileSize, modified, readOnlyReason,
  analyze: source => analyze(source), clearAnalysis: () => clearTimer(), scheduleAnalysis: () => schedule(),
  applySnapshot: snapshot => apply(snapshot), load: discard => load(discard),
})
const valueEditVisible = ref(false), valueEditPending = ref(false), valueText = ref(''), valueError = ref('')
const valueInput = ref<InputInst | null>(null), valueEntry = ref<Entry | null>(null)
let valueOwner: ReturnType<typeof session.capture>, pendingValuePreview: (() => void) | undefined
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
const editDisabled = computed(() => loading.value || saving.value || readOnly.value || analysisPending.value || valueEditPending.value || renamePending.value || analyzedSource.value !== content.value || !analysis.value?.valid)
const openValueEdit = (entry: Entry) => {
  if (editDisabled.value) return
  if (!entry.editable) { message.info(entry.editUnavailableReason || '此内容请在源码中修改'); reveal(entry); return }
  valueOwner = session.capture()
  if (!valueOwner) return
  valueEntry.value = entry
  valueText.value = new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(valueOwner.source).slice(entry.start,entry.end))
  valueError.value = ''; valueEditVisible.value = true
}
const previewValueEdit = async () => {
  const owner = valueOwner, entry = valueEntry.value
  if (!owner || !entry || valueEditPending.value) return
  if (!session.unchanged(owner)) { valueError.value = '当前文件或草稿已变化，请重新选择字段；内容未被修改'; return }
  valueEditPending.value = true; valueError.value = ''
  try {
    const target = await invoke<string>('replace_toml_value_source',{content:owner.source,start:entry.start,end:entry.end,replacement:valueText.value})
    if (!session.unchanged(owner)) { valueError.value = '当前草稿已变化，请重新选择字段'; return }
    const anchor = new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(target).slice(0,entry.start)).length
    pendingValuePreview = () => session.offerChange(owner,'修改 TOML 值',target,anchor)
    valueEditVisible.value = false
  } catch (cause) { if (session.owns(owner)) valueError.value = errorText(cause) }
  finally { if (session.owns(owner)) valueEditPending.value = false }
}
const nodeMenu = useSourceNodeMenu<Entry>(session, { fresh: () => !analysisPending.value && analyzedSource.value === content.value, reveal: entry => reveal(entry),
  extra: entry => [...(entry.field ? [{key:'rename-key',label:'重命名字段…',disabled:editDisabled.value}] : []), ...(entry.kind === 'value' ? [{key:'edit-value',label:'修改值…',disabled:editDisabled.value}] : [])],
  action: (key,entry) => { if(key==='edit-value')openValueEdit(entry); if(key==='rename-key')openRename(entry) } })
const syncTab = (isDirty = dirty.value) => session.sync(isDirty)
const registerTab = (snapshot?: Snapshot) => session.bind(snapshot)

const analyze = async (source: string) => { const analysisOwner = session.capture(); const id = ++analysisId; analysisPending.value = true; try { const result = await invoke<Analysis>('analyze_toml_source', { content: source }); if (session.owns(analysisOwner) && id === analysisId && content.value === source) { analysis.value = result; analyzedSource.value = source }; return result } finally { if (id === analysisId) analysisPending.value = false } }
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
const extensions = (locked: boolean) => [basicSetup, StreamLanguage.define(toml), EditorState.readOnly.of(locked), EditorView.editable.of(!locked), EditorView.lineWrapping,
  EditorView.updateListener.of(update => { if (update.docChanged) { content.value = update.state.doc.toString(); lines.value = update.state.doc.lines; if (!applying) { session.refreshDirty(); schedule() } } if (update.docChanged || update.selectionSet) { const p = update.state.selection.main.head, line = update.state.doc.lineAt(p); cursorLine.value = line.number; cursorColumn.value = p - line.from + 1 } }),
  ...codeMirrorThemeExtensions]
const replace = (source: string, locked: boolean) => { if (!editor) return; applying = true; editor.setState(EditorState.create({ doc: source, extensions: extensions(locked) })); applying = false; content.value = editor.state.doc.toString(); lines.value = editor.state.doc.lines }
const apply = async (s: Snapshot) => { signature.value = s.signature; encoding.value = s.encoding; fileSize.value = s.size; modified.value = s.modified; readOnlyReason.value = s.readOnlyReason || ''; dirty.value = false; replace(s.content, Boolean(s.readOnlyReason)); registerTab(s); await analyze(editor?.state.doc.toString() || '') }
const restore = async (tab: TabInfo) => { signature.value = tab.textSignature || ''; encoding.value = tab.textEncoding || 'utf-8'; fileSize.value = tab.textSize || 0; modified.value = tab.textModified || 0; readOnlyReason.value = tab.textReadOnlyReason || ''; dirty.value = true; replace(tab.content || '', Boolean(tab.textReadOnlyReason)); session.bind(); store.activateTab(tab.id); await analyze(tab.content || '') }
const load = async (discardDraft = false) => {
  const hadPrior = session.hasDocument()
  loadId++; analysisId++; clearTimer()
  const owner = session.capture()
  if (!owner) return
  session.cancelChange(); session.closeConflict(); nodeMenu.close()
  valueEditVisible.value = false; valueEditPending.value = false; valueOwner = undefined; valueEntry.value = null; pendingValuePreview = undefined
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
  if (analyzedSource.value !== content.value) { message.info('正在更新定位，请稍候再试'); return } if (!editor) return; const bytes = new TextEncoder().encode(content.value), point = (n: number) => new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0, Math.min(n, bytes.length))).length, from = point(range.start), to = Math.max(from, point(range.end)); editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) }); editor.focus() }
const save = () => session.save()

const reload = () => session.reload()

watch([path, isExternal, () => store.libraryPath], () => { syncTab(); saving.value = false; void load() }, {flush:'sync'})
onMounted(async () => { await nextTick(); if (editorHost.value) editor = new EditorView({ state: EditorState.create({ doc: '', extensions: extensions(true) }), parent: editorHost.value }); await load();    })
onBeforeUnmount(() => { clearTimer(); syncTab(); editor?.destroy(); editor = null;    })
</script>

<style scoped>
.value-edit-actions{display:flex;justify-content:flex-end;gap:10px}
.toml-value-edit-dialog code{display:block;overflow-wrap:anywhere;margin-bottom:10px}
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
</style>
