import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { getSearchQuery, openSearchPanel, search, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { claimStructuredSearch } from '../services/structuredSearchState'
import { fileStylePathKey } from '../utils/fileDisplayStyles'

let feedbackId = 0
export function useStructuredSearch(options: { enabled?: () => boolean }) {
  let active: { editor: EditorView; claim: ReturnType<typeof claimStructuredSearch> } | undefined
  let detach = () => {}, timer: ReturnType<typeof setTimeout> | undefined
  const id = `structured-search-feedback-${++feedbackId}`
  const panelQuery = (editor: EditorView) => {
    const previous = getSearchQuery(editor.state)
    const panel = editor.dom.querySelector('.cm-search')
    const input = (name: string) => panel?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    return new SearchQuery({ search: input('search')?.value ?? previous.search,
      replace: input('replace')?.value ?? previous.replace, literal: previous.literal,
      caseSensitive: input('case')?.checked ?? previous.caseSensitive,
      regexp: input('re')?.checked ?? previous.regexp, wholeWord: input('word')?.checked ?? previous.wholeWord })
  }
  const feedback = (editor: EditorView) => {
    clearTimeout(timer)
    const query = getSearchQuery(editor.state), doc = editor.state.doc
    timer = setTimeout(() => {
      if (active?.editor !== editor || !active.claim.current() || editor.state.doc !== doc
        || !getSearchQuery(editor.state).eq(query) || !searchPanelOpen(editor.state)) return
      const panel = editor.dom.querySelector('.cm-search'), field = panel?.querySelector<HTMLInputElement>('input[name="search"]')
      if (!panel || !field) return
      let status = panel.querySelector<HTMLElement>('.structured-search-feedback')
      if (!status) {
        status = document.createElement('span'); status.id = id; status.className = 'structured-search-feedback'
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); panel.append(status)
        field.setAttribute('aria-describedby', id)
      }
      const invalid = !!query.search && !query.valid
      field.setAttribute('aria-invalid', String(invalid))
      status.textContent = !query.search ? '' : invalid ? '正则表达式无效' : query.getCursor(editor.state).next().done ? '没有匹配内容' : ''
      status.style.color = invalid ? 'var(--status-danger)' : 'var(--theme-text-secondary)'
      status.style.marginInlineStart = status.textContent ? '8px' : ''
    }, 100)
  }
  const extension = [search(), EditorState.phrases.of({ Find: '查找', Replace: '替换', next: '下一个', previous: '上一个',
    all: '选中全部', 'match case': '区分大小写', regexp: '正则', 'by word': '完整词', replace: '替换',
    'replace all': '全部替换', close: '关闭', 'current match': '当前匹配' }), EditorView.updateListener.of(update => {
    if (update.docChanged || !getSearchQuery(update.state).eq(getSearchQuery(update.startState))
      || searchPanelOpen(update.state) !== searchPanelOpen(update.startState)) feedback(update.view)
  })]
  const beforeReplace = () => {
    if (active?.claim.current()) {
      const query = panelQuery(active.editor)
      // Flush paste/IME input while this view is still outside setState. The
      // default panel commits on blur, which can occur during panel removal.
      if (!query.eq(getSearchQuery(active.editor.state))) active.editor.dispatch({ effects: setSearchQuery.of(query) })
      active.claim.remember({ search: query.search, replace: query.replace, caseSensitive: query.caseSensitive,
        regexp: query.regexp, wholeWord: query.wholeWord, literal: query.literal, open: searchPanelOpen(active.editor.state) })
    }
    // Loading can leave the previous editor visible until the read settles.
    // Capture again immediately before setState, including input made while
    // waiting; bind replaces this owner without copying a new file's query.
    clearTimeout(timer)
  }
  const bind = (editor: EditorView, tab: object, root: string, external: boolean, format: string) => {
    clearTimeout(timer); detach(); active = undefined
    if (options.enabled?.() === false || !['json', 'jsonc', 'yaml', 'xml', 'toml'].includes(format)) return
    const claim = claimStructuredSearch(tab, JSON.stringify([fileStylePathKey(root), external, format]))
    active = { editor, claim }
    const point = claim.state
    if (point) {
      editor.dispatch({ effects: setSearchQuery.of(new SearchQuery(point)) })
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
    const input = (event: Event) => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.closest('.cm-search')
        || event instanceof InputEvent && event.isComposing || !claim.current()) return
      const query = panelQuery(editor)
      if (!query.eq(getSearchQuery(editor.state))) editor.dispatch({ effects: setSearchQuery.of(query) })
    }
    editor.dom.addEventListener('input', input); editor.dom.addEventListener('compositionend', input)
    detach = () => { editor.dom.removeEventListener('input', input); editor.dom.removeEventListener('compositionend', input) }
    feedback(editor)
  }
  const dispose = () => { beforeReplace(); detach(); detach = () => {}; active = undefined }
  return { extension, bind, beforeReplace, dispose }
}
