import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { getSearchQuery, openSearchPanel, search, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { claimStructuredSearch, type StructuredSearchState } from '../services/structuredSearchState'
import { fileStylePathKey } from '../utils/fileDisplayStyles'
import { structuredDocumentDigest } from '../services/structuredPositionState'
import { sourceSearchScope, sourceSearchScopeExtensions, setSourceSearchScope } from '../services/structuredSearchScope'
import { createStructuredSearchPanel } from '../services/structuredSearchPanel'
import { structuredSearchHistory } from '../services/structuredSearchHistory'
import { nextTick, shallowRef, watch } from 'vue'
import { isolateHistory } from '@codemirror/commands'
import { buildReplacementPlan, selectedReplacementChanges, type ReplacementPlan } from '../services/structuredReplacementPlan'

import { buildSearchMatches, type SearchMatchPlan } from '../services/structuredSearchMatches'
import { clearSearchReturn, locateSearchMatch, returnFromSearch, searchReturnPoints } from '../services/structuredSearchReturn'
import { useContextCommands } from '../services/contextCommands'

let feedbackId = 0
export function useStructuredSearch(options: { enabled?: () => boolean; ready?: () => boolean; readOnly?: () => boolean; context?: () => string; library?: () => string }) {
  let active: { editor: EditorView; claim: ReturnType<typeof claimStructuredSearch>; library: string; history: ReturnType<typeof structuredSearchHistory>
    pendingScope?: { intent: object; doc: EditorView['state']['doc']; snapshot: NonNullable<StructuredSearchState['scope']> } } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let matches: { doc: EditorView['state']['doc']; query: SearchQuery; scope: string; wordHead: number
    ranges: { from: number; to: number }[]; capped: boolean } | undefined
  const id = `structured-search-feedback-${++feedbackId}`
  const preview = shallowRef<{ plan: ReplacementPlan; scope: string; excluded: ReadonlySet<number>; error?: string }>()
  const matchList = shallowRef<{ plan: SearchMatchPlan; scope: string; error?: string }>()
  let matchOwner: { active: NonNullable<typeof active>; epoch: number; context: string; origin?: HTMLElement } | undefined
  let pendingMatch: { plan: SearchMatchPlan; index: number } | undefined
  const closeMatches = () => { matchList.value = undefined }
  const matchCurrent = (plan: SearchMatchPlan) => {
    const owner = matchOwner, editor = active?.editor
    if (!owner || !editor || owner.active !== active || !active.claim.current() || owner.epoch !== epoch
      || owner.context !== (options.context?.() || '') || options.ready?.() === false || editor.state.doc !== plan.doc) return false
    const query = panelQuery(editor)
    return query.eq(plan.query) && query.literal === plan.query.literal
  }
  const finishMatches = () => {
    if (matchList.value) return
    const owner = matchOwner, jump = pendingMatch
    pendingMatch = undefined
    void nextTick(() => {
      if (matchList.value || owner !== matchOwner) return
      if (jump && matchCurrent(jump.plan)) {
        const range = jump.plan.ranges[jump.index], editor = active!.editor
        locateSearchMatch(editor, range.from, range.to)
        editor.focus()
      } else if (!jump && owner && owner.active === active && active?.claim.current() && options.ready?.() !== false && owner.origin?.isConnected) owner.origin.focus({ preventScroll: true })
      if (owner === matchOwner) matchOwner = undefined
    })
  }
  const jumpToMatch = (plan: SearchMatchPlan, index: number) => {
    if (matchList.value?.plan !== plan || matchList.value.error || !Number.isInteger(index) || !plan.ranges[index]) return false
    if (!matchCurrent(plan)) { matchList.value = { ...matchList.value, error: '正文或查找条件已变化，请刷新结果' }; return false }
    pendingMatch = { plan, index }; closeMatches(); return true
  }
  let epoch = 0, previewFeedback: { epoch: number; text: string } | undefined
  let previewOwner: { active: NonNullable<typeof active>; epoch: number; context: string } | undefined
  let returnFocus: HTMLElement | undefined
  let appliedFocus: { active: NonNullable<typeof active>; doc: EditorView['state']['doc']; context: string } | undefined
  const invalidatePreview = (error = '正文、查找条件或范围已变化，请刷新预览') => {
    epoch++; previewFeedback = undefined
    if (preview.value) preview.value = { ...preview.value, error }
    if (matchList.value) matchList.value = { ...matchList.value, error: '正文、查找条件或范围已变化，请刷新结果' }
  }
  const closePreview = () => { preview.value = undefined }
  const finishPreview = () => {
    if (preview.value) return
    const applied = appliedFocus, owner = previewOwner, origin = returnFocus
    returnFocus = undefined; previewOwner = undefined; appliedFocus = undefined
    // Let the modal finish removing its focus trap before returning to the
    // source. Recheck the captured owner after that tick to avoid focus theft.
    void nextTick(() => {
      if (preview.value) return
      if (applied) {
        if (applied.active === active && active?.claim.current() && options.ready?.() !== false
          && active.editor.state.doc === applied.doc && (options.context?.() || '') === applied.context) active.editor.focus()
      } else if (owner?.active === active && active?.claim.current() && options.ready?.() !== false && origin?.isConnected) origin.focus({ preventScroll: true })
    })
  }
  const selectPreview = (plan: ReplacementPlan, index: number | 'all', checked: boolean) => {
    const value = preview.value
    if (!value || value.plan !== plan || value.error) return
    const excluded = new Set(value.excluded)
    if (index === 'all') {
      excluded.clear()
      if (!checked) for (let i = 0; i < plan.edits.length; i++) excluded.add(i)
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= plan.edits.length) return
      if (checked) excluded.delete(index); else excluded.add(index)
    }
    preview.value = { ...value, excluded }
  }
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
      for (const name of ['next', 'prev', 'select', 'replace', 'replaceAll', 'previewReplace', 'showMatches']) {
        const button = panel.querySelector<HTMLButtonElement>(`button[name="${name}"]`)
        if (button) button.disabled = invalidScope || !query.valid || ['previewReplace', 'showMatches'].includes(name) && options.ready?.() === false || name === 'previewReplace' && options.readOnly?.() === true
      }
      if (invalid) status.textContent = '正则表达式无效'
      else if (invalidScope) status.textContent = scope.reason === 'waiting' ? '正在确认选区' : scope.reason === 'empty'
        ? '请先在正文选择范围' : '选区已变化，请重新选区'
      else if (previewFeedback?.epoch === epoch) status.textContent = previewFeedback.text
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
  const openMatches = (editor = active?.editor, refresh = false) => {
    if (!editor || active?.editor !== editor || !active.claim.current() || options.ready?.() === false) return
    const fail = (text: string) => { previewFeedback = { epoch, text }; feedback(editor); if (matchList.value) matchList.value = { ...matchList.value, error: text } }
    const query = panelQuery(editor)
    if (!query.eq(getSearchQuery(editor.state)) || query.literal !== getSearchQuery(editor.state).literal) editor.dispatch({ effects: setSearchQuery.of(query) })
    const scope = editor.state.field(sourceSearchScope)
    if (scope.enabled && !scope.range) { fail('请先确认有效选区再查看结果'); return }
    try {
      const result = buildSearchMatches(editor.state)
      if (!result.plan) { fail(result.message || '暂时无法查看匹配'); return }
      const origin = refresh ? matchOwner?.origin : editor.root.activeElement instanceof HTMLElement ? editor.root.activeElement : undefined
      matchOwner = { active, epoch, context: options.context?.() || '', origin }; pendingMatch = undefined
      closePreview(); matchList.value = { plan: result.plan, scope: scope.enabled ? '选区内' : '全文' }
    } catch { fail('暂时无法查看匹配，当前草稿仍保留') }
  }
  const openPreview = (editor = active?.editor, refresh = false) => {
    if (!editor || active?.editor !== editor || !active.claim.current() || options.ready?.() === false || options.readOnly?.() === true || editor.state.readOnly) return
    const fail = (text: string) => {
      previewFeedback = { epoch, text }; feedback(editor)
      if (preview.value) preview.value = { ...preview.value, error: text }
    }
    const query = panelQuery(editor)
    if (!query.eq(getSearchQuery(editor.state)) || query.literal !== getSearchQuery(editor.state).literal) editor.dispatch({ effects: setSearchQuery.of(query) })
    closeMatches()
    const scope = editor.state.field(sourceSearchScope)
    if (scope.enabled && !scope.range) { fail(scope.reason === 'waiting' ? '正在确认选区，请稍后预览' : '请先选择有效范围再预览'); return }
    try {
      const result = buildReplacementPlan(editor.state)
      if (!result.plan) { fail(result.message || '没有需要替换的内容'); return }
      if (!refresh) returnFocus = editor.root.activeElement instanceof HTMLElement ? editor.root.activeElement : undefined
      appliedFocus = undefined
      previewFeedback = undefined
      previewOwner = { active, epoch, context: options.context?.() || '' }
      preview.value = { plan: result.plan, scope: scope.enabled ? '选区内' : '全文', excluded: new Set() }
    } catch { fail('暂时无法预览这次替换，当前草稿仍保留') }
  }
  const applyPreview = () => {
    const value = preview.value, owner = previewOwner, editor = active?.editor
    if (!value || !owner || !editor) return false
    const current = panelQuery(editor)
    if (value.error || owner.active !== active || !active.claim.current() || owner.epoch !== epoch
      || owner.context !== (options.context?.() || '') || options.ready?.() === false || options.readOnly?.() === true || editor.state.readOnly
      || editor.state.doc !== value.plan.doc || !current.eq(value.plan.query) || current.literal !== value.plan.query.literal) {
      preview.value = { ...value, error: '文件、正文或查找条件已变化，请刷新预览' }; return false
    }
    const changes = selectedReplacementChanges(value.plan, value.excluded)
    if (!changes || changes.empty) return false
    closePreview()
    editor.dispatch({ changes, annotations: isolateHistory.of('full'), userEvent: 'input.replace.all',
      effects: EditorView.announce.of(`已替换 ${value.plan.edits.length - value.excluded.size} 处，当前草稿尚未保存`) })
    appliedFocus = { active, doc: editor.state.doc, context: options.context?.() || '' }
    return true
  }
  const stopContext = watch(() => options.context?.(), () => invalidatePreview('文件状态已变化，请刷新预览'), { flush: 'sync' })
  const stopReady = watch(() => options.ready?.(), ready => {
    if (ready === false) invalidatePreview('当前文件状态已变化，请稍后刷新预览')
    if (active) feedback(active.editor)
  }, { flush: 'sync' })
  const returnDepth = shallowRef(0)
  // Menus can be evaluated before the non-reactive editor owner is bound.
  // Always observe depth so the first navigation also refreshes cached menus.
  const canReturn = () => returnDepth.value > 0 && !!active?.claim.current() && options.ready?.() !== false && !matchList.value && !preview.value
  useContextCommands(() => options.context?.() || '', () => canReturn() ? [{
    id: 'structured-search-return', title: '返回查找前的位置', description: '回到上一次定位前的光标、选区和阅读位置', keywords: '查找 返回 位置 光标 导航 back search',
    run: () => { if (canReturn() && active) returnFromSearch(active.editor) },
  }] : [])
  const extension = [search({ createPanel: editor => {
    const owner = active, current = () => owner === active && active?.editor === editor && active.claim.current()
      && (!options.library || fileStylePathKey(options.library()) === active.library)
    return createStructuredSearchPanel(editor, !!current(), id, () => openPreview(editor), current() ? {
      list: () => current() ? owner!.history.list() : [],
      remember: query => { if (current() && query.valid) owner!.history.remember(query) },
      clear: () => { if (current()) owner!.history.clear() },
      choose: condition => {
        if (!current()) return false
        // Keep the current predicate and selection scope. Applying inputs never
        // runs a search command, changes a draft, or carries old match offsets.
        editor.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...condition, test: getSearchQuery(editor.state).test })) })
        return true
      },
    } : undefined, () => openMatches(editor))
  } }), sourceSearchScopeExtensions, searchReturnPoints,
    // Non-editable content still needs a focus target for locating and copying.
    EditorView.contentAttributes.of(editor => editor.state.readOnly ? { tabindex: '0' } : null),
    EditorState.phrases.of({ Find: '查找', Replace: '替换', next: '下一个', previous: '上一个',
    all: '选中全部', 'match case': '区分大小写', regexp: '正则', 'by word': '完整词', replace: '替换',
    'replace all': '全部替换', close: '关闭', 'current match': '当前匹配', 'replaced $ matches': '已替换 $ 处',
    'replaced match on line $': '已替换第 $ 行的匹配' }), EditorView.updateListener.of(update => {
    const changed = update.docChanged || !getSearchQuery(update.state).eq(getSearchQuery(update.startState))
      || getSearchQuery(update.state).literal !== getSearchQuery(update.startState).literal
      || update.state.field(sourceSearchScope) !== update.startState.field(sourceSearchScope)
    if (changed) invalidatePreview()
    if (active?.editor === update.view) returnDepth.value = update.state.field(searchReturnPoints).length
    if (changed || update.selectionSet || searchPanelOpen(update.state) !== searchPanelOpen(update.startState)) feedback(update.view)
  })]
  const beforeReplace = () => {
    if (active?.editor.state.field(searchReturnPoints, false)?.length) active.editor.dispatch({ effects: clearSearchReturn.of() })
    returnDepth.value = 0
    closeMatches(); matchOwner = undefined; pendingMatch = undefined
    closePreview(); returnFocus = undefined; previewOwner = undefined; appliedFocus = undefined
    epoch++; previewFeedback = undefined
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
    returnDepth.value = 0
    closeMatches(); matchOwner = undefined; pendingMatch = undefined
    closePreview(); epoch++; previewFeedback = undefined
    clearTimeout(timer); active = undefined; matches = undefined
    if (options.enabled?.() === false || !['json', 'jsonc', 'yaml', 'xml', 'toml'].includes(format)) return
    const claim = claimStructuredSearch(tab, JSON.stringify([fileStylePathKey(root), external, format]))
    active = { editor, claim, library: fileStylePathKey(root), history: structuredSearchHistory(fileStylePathKey(root)) }
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
  const dispose = () => { beforeReplace(); active = undefined; matches = undefined; stopContext(); stopReady() }
  return { extension, bind, beforeReplace, dispose, matchList, closeMatches, finishMatches, jumpToMatch, refreshMatches: () => openMatches(active?.editor, true), preview, closePreview, finishPreview, selectPreview, refreshPreview: () => openPreview(active?.editor, true), applyPreview }
}
