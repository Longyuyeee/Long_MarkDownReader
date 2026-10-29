import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { getSearchQuery, openSearchPanel, search, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { claimStructuredSearch, type StructuredSearchState } from '../services/structuredSearchState'
import { fileStylePathKey } from '../utils/fileDisplayStyles'
import { structuredDocumentDigest } from '../services/structuredPositionState'
import { sourceSearchScope, sourceSearchScopeExtensions, setSourceSearchScope } from '../services/structuredSearchScope'
import { createStructuredSearchPanel } from '../services/structuredSearchPanel'

let feedbackId = 0
export function useStructuredSearch(options: { enabled?: () => boolean }) {
  let active: { editor: EditorView; claim: ReturnType<typeof claimStructuredSearch>
    pendingScope?: { intent: object; doc: EditorView['state']['doc']; snapshot: NonNullable<StructuredSearchState['scope']> } } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let matches: { doc: EditorView['state']['doc']; query: SearchQuery; scope: string; wordHead: number
    ranges: { from: number; to: number }[]; capped: boolean } | undefined
  const id = `structured-search-feedback-${++feedbackId}`
  const panelQuery = (editor: EditorView) => {
    const previous = getSearchQuery(editor.state)
    const panel = editor.dom.querySelector('.cm-search')
    const input = (name: string) => panel?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    return new SearchQuery({ search: input('search')?.value ?? previous.search,
      replace: input('replace')?.value ?? previous.replace, literal: previous.literal,
      caseSensitive: input('case')?.checked ?? previous.caseSensitive,
      regexp: input('re')?.checked ?? previous.regexp, wholeWord: input('word')?.checked ?? previous.wholeWord, test: previous.test })
  }
  const feedback = (editor: EditorView) => {
    clearTimeout(timer)
    const query = getSearchQuery(editor.state), doc = editor.state.doc
    timer = setTimeout(() => {
      if (active?.editor !== editor || !active.claim.current() || editor.state.doc !== doc
        || !getSearchQuery(editor.state).eq(query) || getSearchQuery(editor.state).literal !== query.literal || !searchPanelOpen(editor.state)) return
      const panel = editor.dom.querySelector('.cm-search'), field = panel?.querySelector<HTMLInputElement>('input[name="search"]')
      if (!panel || !field) return
      const status = panel.querySelector<HTMLElement>('.structured-search-feedback')
      if (!status) return
      const scope = editor.state.field(sourceSearchScope), invalidScope = scope.enabled && !scope.range
      const toggle = panel.querySelector<HTMLInputElement>('input[name=scope]'), update = panel.querySelector<HTMLButtonElement>('button[name=scopeUpdate]')
      if (toggle) toggle.checked = scope.enabled
      if (update) { update.hidden = !scope.enabled; update.disabled = editor.state.selection.main.empty }
      const invalid = !!query.search && !query.valid
      field.setAttribute('aria-invalid', String(invalid))
      for (const name of ['next', 'prev', 'select', 'replace', 'replaceAll']) {
        const button = panel.querySelector<HTMLButtonElement>(`button[name="${name}"]`)
        if (button) button.disabled = invalidScope || !query.valid
      }
      if (invalid) status.textContent = '正则表达式无效'
      else if (invalidScope) status.textContent = scope.reason === 'waiting' ? '正在确认选区' : scope.reason === 'empty'
        ? '请先在正文选择范围' : '选区已变化，请重新选区'
      else if (!query.search) status.textContent = ''
      else {
        const signature = scope.enabled ? `${scope.range!.from}:${scope.range!.to}` : 'all'
        const wordHead = query.wholeWord ? editor.state.selection.main.head : -1
        if (!matches || matches.doc !== doc || !matches.query.eq(query) || matches.query.literal !== query.literal || matches.scope !== signature || matches.wordHead !== wordHead) {
          const ranges: { from: number; to: number }[] = [], cursor = query.getCursor(editor.state)
          let capped = false
          for (let result = cursor.next(); !result.done; result = cursor.next()) {
            if (ranges.length === 10000) { capped = true; break }
            ranges.push({ from: result.value.from, to: result.value.to })
          }
          matches = { doc, query, scope: signature, wordHead, ranges, capped }
        }
        const selection = editor.state.selection.main, current = matches.ranges.findIndex(range => range.from === selection.from && range.to === selection.to) + 1
        status.textContent = (scope.enabled ? '选区内 · ' : '') + (!matches.ranges.length ? '没有匹配内容'
          : `${current ? current + '/' : ''}${matches.ranges.length}${matches.capped ? '+' : ''}项`)
      }
      status.style.color = invalid || invalidScope && scope.reason !== 'waiting' ? 'var(--status-danger)' : 'var(--theme-text-secondary)'
    }, 100)
  }
  const extension = [search({ createPanel: editor => createStructuredSearchPanel(editor, active?.editor === editor && active.claim.current(), id) }), sourceSearchScopeExtensions,
    EditorState.phrases.of({ Find: '查找', Replace: '替换', next: '下一个', previous: '上一个',
    all: '选中全部', 'match case': '区分大小写', regexp: '正则', 'by word': '完整词', replace: '替换',
    'replace all': '全部替换', close: '关闭', 'current match': '当前匹配', 'replaced $ matches': '已替换 $ 处',
    'replaced match on line $': '已替换第 $ 行的匹配' }), EditorView.updateListener.of(update => {
    if (update.docChanged || update.selectionSet || !getSearchQuery(update.state).eq(getSearchQuery(update.startState))
      || update.state.field(sourceSearchScope) !== update.startState.field(sourceSearchScope)
      || searchPanelOpen(update.state) !== searchPanelOpen(update.startState)) feedback(update.view)
  })]
  const beforeReplace = () => {
    if (active?.claim.current()) {
      const query = panelQuery(active.editor)
      // Flush paste/IME input while this view is still outside setState. The
      // default panel commits on blur, which can occur during panel removal.
      if (!query.eq(getSearchQuery(active.editor.state)) || query.literal !== getSearchQuery(active.editor.state).literal) active.editor.dispatch({ effects: setSearchQuery.of(query) })
      const scope = active.editor.state.field(sourceSearchScope)
      const pending = active.pendingScope
      const retained = scope.reason === 'waiting' && pending?.intent === scope.intent && pending.doc === active.editor.state.doc
        ? pending.snapshot : undefined
      active.claim.remember({ search: query.search, replace: query.replace, caseSensitive: query.caseSensitive,
        regexp: query.regexp, wholeWord: query.wholeWord, literal: query.literal, open: searchPanelOpen(active.editor.state),
        ...(scope.enabled ? { scope: retained || (scope.range ? { ...scope.range, digest: structuredDocumentDigest(active.editor.state.doc) }
          : { reason: scope.reason === 'waiting' ? 'changed' : scope.reason }) } : {}) })
    }
    // Loading can leave the previous editor visible until the read settles.
    // Capture again immediately before setState, including input made while
    // waiting; bind replaces this owner without copying a new file's query.
    clearTimeout(timer)
  }
  const bind = (editor: EditorView, tab: object, root: string, external: boolean, format: string) => {
    clearTimeout(timer); active = undefined; matches = undefined
    if (options.enabled?.() === false || !['json', 'jsonc', 'yaml', 'xml', 'toml'].includes(format)) return
    const claim = claimStructuredSearch(tab, JSON.stringify([fileStylePathKey(root), external, format]))
    active = { editor, claim }
    const point = claim.state
    if (point) {
      const intent = {}, snapshot = point.scope, doc = editor.state.doc
      if (snapshot?.digest) active.pendingScope = { intent, doc, snapshot }
      editor.dispatch({ effects: [setSourceSearchScope.of(snapshot
        ? { enabled: true, intent, reason: snapshot.digest ? 'waiting' : snapshot.reason || 'changed' }
        : { enabled: false, intent }), setSearchQuery.of(new SearchQuery(point))] })
      if (snapshot?.digest) void Promise.all([snapshot.digest, structuredDocumentDigest(doc)]).then(([before, current]) => {
        if (active?.editor !== editor || !claim.current() || editor.state.doc !== doc || editor.state.field(sourceSearchScope).intent !== intent) return
        editor.dispatch({ effects: setSourceSearchScope.of(before && before === current && typeof snapshot.from === 'number' && typeof snapshot.to === 'number'
          ? { enabled: true, intent, range: { from: snapshot.from, to: snapshot.to } }
          : { enabled: true, intent, reason: 'external' }) })
      })
      if (point.open) {
        const focused = editor.root.activeElement
        openSearchPanel(editor)
        // Opening an existing panel is normally an explicit focus command.
        // This automatic return only restores visibility, never input focus.
        if (editor.root.activeElement !== focused) {
          if (focused instanceof HTMLElement && focused.isConnected && focused !== document.body) focused.focus({ preventScroll: true })
          else (editor.root.activeElement as HTMLElement | null)?.blur()
        }
      }
    }
    feedback(editor)
  }
  const dispose = () => { beforeReplace(); active = undefined; matches = undefined }
  return { extension, bind, beforeReplace, dispose }
}
