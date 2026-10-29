import { type EditorView, type Panel, type ViewUpdate, runScopeHandlers } from '@codemirror/view'
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext,
  SearchQuery, selectMatches, setSearchQuery } from '@codemirror/search'
import { scopeFromSelection, setSourceSearchScope, sourceSearchScope } from './structuredSearchScope'

// Keep the existing CodeMirror controls and commands. A custom public panel
// preserves query predicates when committing input (the default panel drops them).
export function createStructuredSearchPanel(view: EditorView, scoped: boolean, feedbackId: string, preview?: () => void): Panel {
  let query = getSearchQuery(view.state)
  let composing = false
  const dom = document.createElement('div'); dom.className = 'cm-search'
  const field = (name: string, value: string) => {
    const input = document.createElement('input'); input.name = name; input.value = value
    input.className = 'cm-textfield'; input.setAttribute('form', '')
    input.placeholder = input.ariaLabel = view.state.phrase(name === 'search' ? 'Find' : 'Replace')
    return input
  }
  const search = field('search', query.search), replacement = field('replace', query.replace)
  search.setAttribute('main-field', 'true')
  const checkbox = (name: string, checked: boolean, label: string) => {
    const input = document.createElement('input'); input.type = 'checkbox'; input.name = name; input.checked = checked
    const wrap = document.createElement('label'); wrap.append(input, view.state.phrase(label)); return { input, wrap }
  }
  const caseSensitive = checkbox('case', query.caseSensitive, 'match case'), regexp = checkbox('re', query.regexp, 'regexp'), wholeWord = checkbox('word', query.wholeWord, 'by word')
  const button = (name: string, phrase: string, action: () => unknown) => {
    const button = document.createElement('button'); button.type = 'button'; button.name = name; button.className = 'cm-button'
    button.textContent = view.state.phrase(phrase); button.onclick = () => { action() }; return button
  }
  const commit = (event?: Event) => {
    if (composing || event instanceof InputEvent && event.isComposing) return
    const current = getSearchQuery(view.state)
    const next = new SearchQuery({ search: search.value, replace: replacement.value, caseSensitive: caseSensitive.input.checked,
      regexp: regexp.input.checked, wholeWord: wholeWord.input.checked, literal: current.literal, test: current.test })
    if (!next.eq(current) || next.literal !== current.literal) view.dispatch({ effects: setSearchQuery.of(next) })
  }
  for (const input of [search, replacement, caseSensitive.input, regexp.input, wholeWord.input]) {
    input.addEventListener('input', commit); input.addEventListener('change', commit)
    input.addEventListener('compositionstart', () => { composing = true })
    input.addEventListener('compositionend', () => { composing = false; commit() })
  }
  dom.append(search, button('next', 'next', () => findNext(view)), button('prev', 'previous', () => findPrevious(view)),
    button('select', 'all', () => selectMatches(view)), caseSensitive.wrap, regexp.wrap, wholeWord.wrap)
  if (!view.state.readOnly) dom.append(document.createElement('br'), replacement,
    button('replace', 'replace', () => replaceNext(view)), button('replaceAll', 'replace all', () => replaceAll(view)))
  if (!view.state.readOnly && scoped && preview) dom.append(button('previewReplace', '预览替换…', preview))
  const close = button('close', 'close', () => closeSearchPanel(view)); close.textContent = '×'; close.ariaLabel = view.state.phrase('close'); dom.append(close)
  if (scoped) {
    const enabled = view.state.field(sourceSearchScope).enabled
    const scope = checkbox('scope', enabled, '仅选区'); scope.input.ariaLabel = '仅在选区查找'
    scope.wrap.className = 'structured-search-scope-option'
    scope.input.onchange = () => view.dispatch({ effects: setSourceSearchScope.of(scopeFromSelection(view.state, scope.input.checked)) })
    const update = button('scopeUpdate', '使用当前选区', () => view.dispatch({ effects: setSourceSearchScope.of(scopeFromSelection(view.state)) }))
    update.hidden = !enabled; update.disabled = view.state.selection.main.empty
    const status = document.createElement('span'); status.id = feedbackId; status.className = 'structured-search-feedback'
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.style.marginInlineStart = '8px'
    search.setAttribute('aria-describedby', feedbackId); scope.input.setAttribute('aria-describedby', feedbackId)
    dom.append(scope.wrap, update, status)
  }
  dom.onkeydown = event => {
    if (composing || event.isComposing || event.keyCode === 229) return
    if (runScopeHandlers(view, event, 'search-panel')) event.preventDefault()
    else if (event.key === 'Enter' && event.target === search) { event.preventDefault(); (event.shiftKey ? findPrevious : findNext)(view) }
    else if (event.key === 'Enter' && event.target === replacement) { event.preventDefault(); replaceNext(view) }
  }
  return { dom, top: false, mount() { search.select() }, update(update: ViewUpdate) {
    const next = getSearchQuery(update.state)
    if (next.eq(query) && next.literal === query.literal) return
    query = next
    if (search.value !== next.search) search.value = next.search
    if (replacement.value !== next.replace) replacement.value = next.replace
    caseSensitive.input.checked = next.caseSensitive; regexp.input.checked = next.regexp; wholeWord.input.checked = next.wholeWord
  } }
}
