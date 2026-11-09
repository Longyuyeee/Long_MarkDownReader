<template><div ref="host" class="mobile-code-editor" /></template>
<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Compartment, EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import { EditorView, Decoration, type DecorationSet, drawSelection, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { history, historyKeymap, defaultKeymap, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands'
import { search, SearchQuery, setSearchQuery } from '@codemirror/search'
import { sourceRangeChange, sourceSelection } from './editorOffsets'
import { formattingChange, type FormatKind } from './editorCommands'
import { adoptSourceFormat, sourceFormat, sourceSlice } from './sourceFormat'
import { findDocumentMatches, type DocumentMatches } from './documentBudget'
import type { CodeLanguage } from './codeFormats'
import { codeLanguage } from './codeLanguage'
import { codeTokenChange } from './codeCommands'
import { codeIndentChange, codeLineSelection, codePosition, type CodeLineAction } from './codeLineActions'
import { markdownEditing } from './markdownEditing'
const props = withDefaults(defineProps<{ modelValue: string; query?: string; active?: boolean; markdown?: boolean; json?: boolean; yaml?: boolean; xml?: boolean; toml?: boolean; code?: CodeLanguage; wrap?: boolean; issue?: { source: string; offset?: number } }>(), { active: true, wrap: true })
const emit = defineEmits<{ composition: [active: boolean]; 'code-position': [value: { line: number; column:number;selectedLines: number }]; 'update:modelValue': [value: string]; matches: [value: DocumentMatches]; history: [value: { undo: boolean; redo: boolean }] }>()
const host = ref<HTMLElement>()
let view: EditorView | undefined
const language = new Compartment()
const wrapping = new Compartment()
const markIssue = StateEffect.define<DecorationSet>()
const issueField = StateField.define<DecorationSet>({ create: () => Decoration.none, update(value, transaction) { value = value.map(transaction.changes); for (const effect of transaction.effects) if (effect.is(markIssue)) value = effect.value; return value }, provide: field => EditorView.decorations.from(field) })
const jsonColors = HighlightStyle.define([{ tag: tags.propertyName, color: 'var(--primary)' }, { tag: [tags.bool, tags.null], fontWeight: '600', color:'var(--json-source-bool,var(--ink))' }, { tag: tags.string, color: 'var(--json-source-string,var(--ink))' },{tag:tags.number,color:'var(--json-source-number,var(--ink))'}])
const tomlColors = HighlightStyle.define([{ tag: [tags.string, tags.bool, tags.atom], color: 'var(--code-string)' }, { tag: tags.number, color: 'var(--code-number)' }, { tag: tags.comment, color: 'var(--muted)' }])
const codeColors = HighlightStyle.define([{ tag: [tags.keyword, tags.tagName], color: 'var(--code-keyword)' }, { tag: [tags.string, tags.bool, tags.atom], color: 'var(--code-string)' }, { tag: tags.number, color: 'var(--code-number)' }, { tag: tags.comment, color: 'var(--muted)' },{tag:[tags.function(tags.variableName),tags.function(tags.propertyName)],color:'var(--code-function,var(--ink))'},{tag:[tags.operator,tags.punctuation,tags.typeName],color:'var(--code-symbol,var(--ink))'}])
const languageExtensions = () => props.markdown && props.modelValue.length <= 256 * 1024 ? markdownEditing : (props.json || props.yaml || props.xml || props.toml || props.code) && props.modelValue.length <= 256 * 1024 ? [props.code ? codeLanguage(props.code) : props.toml ? StreamLanguage.define(toml) : props.xml ? xml({ autoCloseTags: false }) : props.yaml ? yaml() : json(), lineNumbers(), syntaxHighlighting(props.json ? jsonColors : props.code ? codeColors : props.toml ? tomlColors : jsonColors)] : props.code ? [lineNumbers()] : []
function updateIssue() {
  // Other formats must retain their original input/selection update sequence.
  if (!view || !props.toml) return
  let marks = Decoration.none
  const issue = props.issue
  if (props.toml && issue?.offset !== undefined && Number.isInteger(issue.offset) && issue.offset >= 0 && issue.offset <= issue.source.length && issue.source === sourceSlice(view.state)) {
    const at = view.state.toText(issue.source.slice(0, issue.offset)).length, line = view.state.doc.lineAt(at)
    const to = Math.min(line.to, at < line.to ? at + 1 : at), from = Math.max(line.from, to - 4)
    if (to > from) marks = Decoration.set([Decoration.mark({ class: 'cm-source-issue' }).range(from, to)])
  }
  if (!marks.size && !view.state.field(issueField).size) return
  view.dispatch({ effects: markIssue.of(marks) })
}
let lastSource = props.modelValue, finder: AbortController | undefined
let matches: { from: number; to: number }[] = [], current = -1
let searchTimer: ReturnType<typeof setTimeout> | undefined, scrollTop = 0
let viewportTimer: ReturnType<typeof setTimeout> | undefined, resizeObserver: ResizeObserver | undefined
function revealCaret() {
  clearTimeout(viewportTimer)
  viewportTimer = setTimeout(() => {
    if (!view || !props.active || view.composing || view.dom.closest('[inert]')) return
    view.requestMeasure(); view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest', x: 'nearest' }) })
  }, 100)
}
function scheduleFind() {
  clearTimeout(searchTimer); finder?.abort(); matches = []; current = -1
  if (!props.query || !props.active) return
  emit('matches', { count: 0, current: 0, truncated: false, pending: true })
  searchTimer = setTimeout(() => { if (view && !view.composing) void find(false) }, 80)
}
async function find(select = true) {
  if (!view || !props.active) return
  finder?.abort(); const owner = finder = new AbortController()
  const query = new SearchQuery({ search: props.query || '', literal: true })
  view.dispatch({ effects: setSearchQuery.of(query) }); matches = []; current = -1
  const document = view.state.doc
  emit('matches', { count: 0, current: 0, truncated: false, pending: query.valid })
  const result = await findDocumentMatches(document.length, (from, to) => document.sliceString(from, to), (props.query || '').replace(/\r\n|\r/g, '\n'), owner.signal)
  if (!result || !view || owner !== finder || document !== view.state.doc || !props.active) return
  matches = result.matches
  if (matches.length && select) navigate(1)
  else if (matches.length) { current = Math.max(0, matches.findIndex(match => match.to >= view!.state.selection.main.from)); emit('matches', { count: matches.length, current: current + 1, truncated: matches.length === 1000 }) }
  else emit('matches', { count: 0, current: 0, truncated: false })
}
function navigate(direction: number) {
  if (!view || !matches.length) return
  current = (current + direction + matches.length) % matches.length
  const match = matches[current]!
  view.dispatch({ selection: { anchor: match.from, head: match.to }, effects: EditorView.scrollIntoView(match.from, { y: 'center' }) })
  emit('matches', { count: matches.length, current: current + 1, truncated: matches.length === 1000 })
}
onMounted(() => {
  view = new EditorView({ parent: host.value, state: EditorState.create({ doc: props.modelValue,
    extensions: [history(), search(), issueField, drawSelection(), EditorView.theme({ '.cm-selectionBackground': { backgroundColor: '#e7ad4566' }, '&.cm-focused .cm-selectionBackground': { backgroundColor: '#e7ad4599' } }), keymap.of([...historyKeymap, ...defaultKeymap]), wrapping.of(props.code && !props.wrap ? [] : EditorView.lineWrapping), placeholder(props.code ? '在这里编辑源码…' : '从一句话开始…'),
      EditorView.domEventObservers({ compositionstart: () => emit('composition',true), compositionend: () => { emit('composition',false); scheduleFind(); revealCaret() } }),
      sourceFormat(props.modelValue), language.of(languageExtensions()),
      EditorView.contentAttributes.of({ 'aria-label': '笔记正文', spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (props.code && (update.selectionSet || update.docChanged)) emit('code-position', codePosition(update.state))
        if (update.docChanged) { lastSource = sourceSlice(update.state); emit('update:modelValue', lastSource); scheduleFind() }
        if (update.docChanged || update.transactions.some(transaction => transaction.isUserEvent('undo') || transaction.isUserEvent('redo'))) emit('history', { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 })
      })] }) })
  // A small viewport still needs an explicit keyboard target for source scrolling.
  view.scrollDOM.tabIndex = 0
  view.scrollDOM.setAttribute('role', 'region')
  view.scrollDOM.setAttribute('aria-label', '正文滚动区域')
  emit('history', { undo: false, redo: false })
  if (props.code) emit('code-position', codePosition(view.state))
  resizeObserver = new ResizeObserver(revealCaret); resizeObserver.observe(host.value!)
  window.addEventListener('resize', revealCaret)
  updateIssue(); void find()
})
watch(() => props.query, () => find())
watch(() => props.active, async active => {
  if (!view) return
  if (!active) { scrollTop = view.scrollDOM.scrollTop; view.contentDOM.blur(); clearTimeout(searchTimer); finder?.abort(); return }
  await nextTick()
  if (view) { view.requestMeasure(); view.scrollDOM.scrollTop = scrollTop; find(false) }
})
watch(() => props.modelValue, value => {
  if (view && value !== lastSource) { lastSource = value; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: view.state.toText(value) }, effects: adoptSourceFormat(value) }) }
  updateIssue()
})
watch(() => props.issue, updateIssue)
watch(() => `${props.markdown}:${props.json}:${props.yaml}:${props.xml}:${props.toml}:${props.code}:${props.modelValue.length <= 256 * 1024}`, () => { view?.dispatch({ effects: language.reconfigure(languageExtensions()) }) })
watch(() => props.wrap, value => { if (view && props.code) view.dispatch({ effects: wrapping.reconfigure(value ? EditorView.lineWrapping : []) }) })
onBeforeUnmount(() => { finder?.abort(); clearTimeout(searchTimer); clearTimeout(viewportTimer); resizeObserver?.disconnect(); window.removeEventListener('resize', revealCaret); view?.destroy(); view = undefined })
defineExpose({
  navigate,
  captureSelection() { return view ? sourceSelection(view.state, view.state.selection.main.from, view.state.selection.main.to) : null },
  replaceRange(from: number, to: number, text: string, expected: string) {
    if (!view) throw new Error('编辑器尚未就绪')
    view.dispatch({ ...sourceRangeChange(view.state, expected, from, to, text), annotations: isolateHistory.of('full'), userEvent: 'input.image' })
  },
  focus() { view?.focus() },
  insertCodeToken(token: string) {
    if (!view || !props.code) return
    if (view.composing) throw new Error('请先完成当前输入，再插入代码符号。')
    view.dispatch(codeTokenChange(view.state, token)); view.focus()
  },
  codeLineAction(action: CodeLineAction) {
    if (!view || !props.code || !props.active) return
    if (view.composing) throw new Error('请先完成当前输入，再使用行操作。')
    if (action === 'indent' || action === 'outdent') {
      const transaction = codeIndentChange(view.state, action === 'outdent')
      if (transaction) view.dispatch(transaction)
    } else if (action === 'left' || action === 'right') {
      const range = view.state.selection.main, forward = action === 'right'
      const selection = range.empty ? view.moveByChar(range, forward) : EditorSelection.cursor(forward ? range.to : range.from)
      view.dispatch({ selection, scrollIntoView: true, userEvent: 'select.code-cursor' })
    } else view.dispatch(codeLineSelection(view.state, action))
    view.focus()
  },
  blur() { view?.contentDOM.blur() },
  replaceDocument(source: string, formatted: string) {
    if (!view || view.composing) throw new Error('请先完成当前输入，再应用排版。')
    if (sourceSlice(view.state) !== source) throw new Error('正文已有变化，请重新准备排版。')
    view.dispatch({ ...sourceRangeChange(view.state, source, 0, source.length, formatted), effects: adoptSourceFormat(formatted), annotations: isolateHistory.of('full'), userEvent: 'input.format' })
  },
  replaceSourceRange(source: string, from: number, to: number, text: string) {
    if (!view || view.composing) throw new Error('请先完成当前输入，再修改字段。')
    if (sourceSlice(view.state) !== source) throw new Error('正文已有变化，请重新浏览结构。')
    view.dispatch({ ...sourceRangeChange(view.state, source, from, to, text), effects: adoptSourceFormat(source.slice(0, from) + text + source.slice(to)), annotations: isolateHistory.of('full'), userEvent: 'input.source-value' })
  },
  locateSource(source: string, offset: number) {
    if (!view || sourceSlice(view.state) !== source || view.composing) return
    const at = view.state.toText(source.slice(0, offset)).length
    view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); view.focus()
  },
  format(kind: string) {
    if (!view) return
    if (view.composing) throw new Error('请先完成当前输入，再使用编辑工具。')
    if (kind === 'undo') undo(view)
    else if (kind === 'redo') redo(view)
    else view.dispatch({ ...formattingChange(view.state, kind as FormatKind), scrollIntoView: true })
    view.focus()
  }
})
</script>
