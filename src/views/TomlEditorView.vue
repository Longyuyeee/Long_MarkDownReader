<template>
  <div class="workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />
    <header>
      <div class="identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="router.push({ name: 'LibraryMode' })">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="FileCodeIcon" size="22" class="accent" />
        <div><strong :title="path">{{ fileName }}</strong><span>TOML · {{ readOnly ? '只读' : dirty ? '有未保存修改' : '已保存' }}</span></div>
      </div>
      <div class="actions">
        <n-button quaternary circle size="small" title="查找" @click="editor && openSearchPanel(editor)"><template #icon><n-icon :component="SearchIcon" /></template></n-button>
        <n-button quaternary circle size="small" title="折叠全部" @click="editor && foldAll(editor)"><template #icon><n-icon :component="FoldIcon" /></template></n-button>
        <n-button quaternary circle size="small" title="展开全部" @click="editor && unfoldAll(editor)"><template #icon><n-icon :component="UnfoldIcon" /></template></n-button>
        <n-button quaternary circle size="small" title="重新读取" :disabled="loading" @click="reload"><template #icon><n-icon :component="RefreshIcon" /></template></n-button>
        <n-button type="primary" size="small" :loading="saving" :disabled="loading || readOnly || !dirty" @click="save()"><template #icon><n-icon :component="SaveIcon" /></template>保存</n-button>
      </div>
    </header>
    <main>
      <section class="source">
        <div v-if="loading" class="state"><n-spin size="small" /><strong>正在读取 TOML</strong></div>
        <div v-else-if="loadError" class="state error"><n-icon :component="AlertIcon" size="24" /><strong>无法打开 TOML</strong><p>{{ loadError }}</p><n-button size="small" @click="load(true)">重试</n-button></div>
        <div ref="editorHost" class="editor" :class="{ hidden: loading || loadError }" />
      </section>
      <aside>
        <div class="heading">
          <div><strong>键路径提纲</strong><span>格式保留解析器生成</span></div>
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
        <div v-if="analysis?.valid" class="valid"><n-icon :component="ValidIcon" /><span>语法有效，注释、顺序与字面量由源码保留</span></div>
        <n-input v-model:value="query" clearable size="small" placeholder="筛选键路径或值"><template #prefix><n-icon :component="SearchIcon" /></template></n-input>
        <div class="outline">
          <button v-for="item in filteredOutline" :key="`${item.start}:${item.path}`" :style="{ paddingLeft: `${10 + Math.min(item.depth, 8) * 14}px` }" @click="reveal(item)">
            <n-icon :component="item.kind === 'value' ? KeyIcon : TableIcon" />
            <span><strong>{{ item.label }}</strong><small>{{ item.path }}</small><small v-if="item.preview">{{ item.preview }}</small></span>
          </button>
          <p v-if="!filteredOutline.length">{{ analysis?.valid ? '没有匹配的键路径' : '修复语法后显示提纲' }}</p>
          <p v-if="analysis?.outlineTruncated" class="warning">结构过大，仅显示受限范围</p>
        </div>
      </aside>
    </main>
    <footer><span>{{ readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span><span>{{ encoding.toUpperCase() }}</span><span>{{ lines }} 行</span><span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { basicSetup } from 'codemirror'
import { StreamLanguage } from '@codemirror/language'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { AlertTriangle as AlertIcon, ArrowLeft as ArrowLeftIcon, CheckCircle2 as ValidIcon, FileCode2 as FileCodeIcon, FoldVertical as FoldIcon, KeyRound as KeyIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Search as SearchIcon, TableProperties as TableIcon, UnfoldVertical as UnfoldIcon } from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { findFileFormat } from '../config/fileFormats'
import { type TabInfo, useAppStore } from '../store/app'

interface Snapshot { content: string; encoding: string; signature: string; size: number; modified: number; readOnlyReason?: string }
interface Range { start: number; end: number }
interface Diagnostic extends Range { code: string; message: string; line: number; column: number }
interface Entry extends Range { path: string; label: string; kind: string; depth: number; preview: string }
interface Analysis { valid: boolean; tableCount: number; arrayOfTablesCount: number; valueCount: number; maxDepth: number; outline: Entry[]; outlineTruncated: boolean; diagnostics: Diagnostic[] }

const route = useRoute(), router = useRouter(), store = useAppStore(), dialog = useDialog(), message = useMessage()
const editorHost = ref<HTMLElement | null>(null), path = computed(() => String(route.query.path || '')), format = computed(() => findFileFormat(path.value))
const fileName = computed(() => path.value.split(/[\\/]/).pop() || '未命名 TOML'), currentTab = computed(() => store.tabs.find(tab => tab.path === path.value))
const loading = ref(true), saving = ref(false), dirty = ref(false), analysisPending = ref(false), loadError = ref(''), query = ref('')
const content = ref(''), signature = ref(''), encoding = ref('utf-8'), readOnlyReason = ref(''), fileSize = ref(0), modified = ref(0), lines = ref(1), cursorLine = ref(1), cursorColumn = ref(1)
const analysis = ref<Analysis | null>(null), readOnly = computed(() => Boolean(readOnlyReason.value))
const filteredOutline = computed(() => { const q = query.value.trim().toLowerCase(), entries = analysis.value?.outline || []; return (q ? entries.filter(e => `${e.path} ${e.preview}`.toLowerCase().includes(q)) : entries).slice(0, 500) })
let editor: EditorView | null = null, applying = false, loadId = 0, analysisId = 0, timer: ReturnType<typeof setTimeout> | null = null
let offSave: (() => void) | null = null, offRefresh: (() => void) | null = null
const errorText = (cause: unknown) => { const e = cause as { message?: string; suggestion?: string }; const text = e?.message || String(cause).replace(/^Error:\s*/, ''); return e?.suggestion ? `${text} · ${e.suggestion}` : text }
const clearTimer = () => { if (timer) clearTimeout(timer); timer = null }
const syncTab = (isDirty = dirty.value) => { const tab = store.tabs.find(t => t.path === path.value); if (!editor || !tab) return; tab.content = editor.state.doc.toString(); tab.isDirty = isDirty; tab.textSignature = signature.value; tab.textEncoding = encoding.value; tab.textReadOnlyReason = readOnlyReason.value; tab.textSize = fileSize.value; tab.textModified = modified.value }
const analyze = async (source: string) => { const id = ++analysisId; analysisPending.value = true; try { const result = await invoke<Analysis>('analyze_toml_source', { content: source }); if (id === analysisId && content.value === source) analysis.value = result; return result } finally { if (id === analysisId) analysisPending.value = false } }
const schedule = () => { clearTimer(); const source = content.value; timer = setTimeout(() => void analyze(source).catch(e => message.error(`实时分析失败：${errorText(e)}`)), 280) }
const extensions = (locked: boolean) => [basicSetup, StreamLanguage.define(toml), EditorState.readOnly.of(locked), EditorView.editable.of(!locked), EditorView.lineWrapping,
  EditorView.updateListener.of(update => { if (update.docChanged) { content.value = update.state.doc.toString(); lines.value = update.state.doc.lines; if (!applying) { dirty.value = true; syncTab(true); schedule() } } if (update.docChanged || update.selectionSet) { const p = update.state.selection.main.head, line = update.state.doc.lineAt(p); cursorLine.value = line.number; cursorColumn.value = p - line.from + 1 } }),
  EditorView.theme({ '&': { height: '100%', backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }, '.cm-scroller': { overflow: 'auto', fontFamily: "'Cascadia Code', Consolas, monospace" }, '.cm-gutters': { backgroundColor: 'var(--theme-surface)', borderRight: 'var(--theme-border)' }, '&.cm-focused': { outline: 'none' } })]
const replace = (source: string, locked: boolean) => { if (!editor) return; applying = true; editor.setState(EditorState.create({ doc: source, extensions: extensions(locked) })); applying = false; content.value = source; lines.value = editor.state.doc.lines }
const apply = async (s: Snapshot) => { signature.value = s.signature; encoding.value = s.encoding; fileSize.value = s.size; modified.value = s.modified; readOnlyReason.value = s.readOnlyReason || ''; dirty.value = false; replace(s.content, Boolean(s.readOnlyReason)); store.addTab({ id: path.value, title: fileName.value, path: path.value, isDirty: false }); syncTab(false); await analyze(s.content) }
const restore = async (tab: TabInfo) => { signature.value = tab.textSignature || ''; encoding.value = tab.textEncoding || 'utf-8'; fileSize.value = tab.textSize || 0; modified.value = tab.textModified || 0; readOnlyReason.value = tab.textReadOnlyReason || ''; dirty.value = true; replace(tab.content || '', Boolean(tab.textReadOnlyReason)); store.activateTab(tab.id); await analyze(tab.content || '') }
const load = async (discard = false) => { const id = ++loadId; analysisId++; clearTimer(); loading.value = true; loadError.value = ''; analysis.value = null; try { if (!path.value || format.value?.id !== 'toml') throw new Error('当前路径不是已注册的 TOML 文件'); const draft = currentTab.value; if (!discard && draft?.isDirty && draft.content !== undefined) { await restore(draft); return } const s = await invoke<Snapshot>('read_text_document', { libraryRoot: store.libraryPath, path: path.value, formatId: 'toml', readOptions: undefined }); if (id === loadId) await apply(s) } catch (e) { if (id === loadId) loadError.value = errorText(e) } finally { if (id === loadId) loading.value = false } }
const reveal = (range: Range) => { if (!editor) return; const bytes = new TextEncoder().encode(content.value), point = (n: number) => new TextDecoder().decode(bytes.slice(0, Math.min(n, bytes.length))).length, from = point(range.start), to = Math.max(from, point(range.end)); editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) }); editor.focus() }
const save = async (allowInvalid = false) => { if (!editor || readOnly.value || !dirty.value || saving.value) return; clearTimer(); const source = editor.state.doc.toString(); saving.value = true; try { const result = await analyze(source); if (!result.valid && !allowInvalid) { dialog.warning({ title: 'TOML 存在语法错误', content: '默认不会覆盖磁盘文件。可以继续修复，或明确按当前源码保存。', positiveText: '按源码保存', negativeText: '继续编辑', onPositiveClick: () => { void save(true) } }); return } const s = await invoke<Snapshot>('write_toml_source_document', { libraryRoot: store.libraryPath, path: path.value, content: source, expectedSignature: signature.value, allowInvalid }); if (editor.state.doc.toString() === source) await apply(s); else { signature.value = s.signature; dirty.value = true; syncTab(true); schedule() } message.success(result.valid ? 'TOML 已安全保存' : 'TOML 已按源码保存') } catch (cause) { const e = cause as { code?: string }; if (e?.code === 'external-modified') dialog.warning({ title: '文件已在外部修改', content: errorText(cause), positiveText: '重新加载', negativeText: '保留编辑内容', onPositiveClick: () => { void load(true) } }); else message.error(`保存失败：${errorText(cause)}`) } finally { saving.value = false } }
const reload = async () => { if (dirty.value && !window.confirm('重新读取会覆盖未保存的 TOML 源码，是否继续？')) return; await load(true) }
const keydown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save() } }
watch(path, (_, previous) => { if (previous) syncTab(); void load() })
onMounted(async () => { await nextTick(); if (editorHost.value) editor = new EditorView({ state: EditorState.create({ doc: '', extensions: extensions(true) }), parent: editorHost.value }); await load(); window.addEventListener('keydown', keydown); offSave = await listen('command-save', () => { void save() }); offRefresh = await listen('command-refresh', () => { void reload() }) })
onBeforeUnmount(() => { clearTimer(); syncTab(); editor?.destroy(); editor = null; window.removeEventListener('keydown', keydown); offSave?.(); offRefresh?.() })
</script>

<style scoped>
.workspace{width:100%;height:100%;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--theme-bg);color:var(--theme-text)}header{min-height:54px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:var(--theme-border);background:var(--theme-surface)}.identity,.actions{display:flex;align-items:center;gap:8px;min-width:0}.identity>div,.heading>div{display:flex;flex-direction:column;min-width:0}.identity strong{max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity span,.heading span{font-size:11px;color:var(--theme-text-secondary)}.accent{color:var(--theme-primary)}.error{color:var(--theme-danger,#d03050)}main{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,360px)}.source{position:relative;min-width:0;min-height:0}.editor{width:100%;height:100%}.hidden{visibility:hidden}.state{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}aside{min-height:0;padding:14px;display:flex;flex-direction:column;gap:12px;border-left:var(--theme-border);background:var(--theme-surface)}.heading{display:flex;align-items:center;justify-content:space-between}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.metrics div{padding:8px 3px;display:flex;flex-direction:column;align-items:center;border:var(--theme-border);border-radius:8px}.metrics span{font-size:10px;color:var(--theme-text-secondary)}.diagnostic{padding:8px;display:flex;gap:8px;border:0;border-radius:7px;color:var(--theme-danger,#d03050);background:rgba(208,48,80,.08);text-align:left}.diagnostic span,.outline button span{min-width:0;display:flex;flex:1;flex-direction:column}.diagnostic small,.outline small{overflow:hidden;color:var(--theme-text-secondary);text-overflow:ellipsis;white-space:nowrap}.valid{padding:9px;display:flex;gap:8px;border-radius:8px;color:var(--theme-primary);background:rgba(var(--theme-primary-rgb),.08)}.outline{min-height:0;flex:1;overflow:auto}.outline button{width:100%;min-height:48px;padding-top:6px;padding-right:8px;padding-bottom:6px;display:flex;align-items:center;gap:7px;border:0;border-bottom:var(--theme-border);color:inherit;background:transparent;text-align:left;cursor:pointer}.outline button:hover{background:rgba(var(--theme-primary-rgb),.07)}.outline p{padding:14px 6px;color:var(--theme-text-secondary);font-size:12px;text-align:center}.outline .warning{color:var(--theme-warning,#f0a020)}footer{min-height:28px;padding:0 14px;display:flex;align-items:center;gap:14px;border-top:var(--theme-border);color:var(--theme-text-secondary);background:var(--theme-surface);font-size:11px}
</style>
