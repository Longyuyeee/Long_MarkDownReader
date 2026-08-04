import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const workspaceTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-surface)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '14px 0 48px',
    color: 'var(--code-editor-text)',
    caretColor: 'var(--code-editor-cursor)',
  },
  '.cm-line': { color: 'var(--code-editor-text)' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--code-editor-cursor)',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    color: 'var(--code-editor-gutter-text)',
    backgroundColor: 'var(--code-editor-gutter)',
    borderRight: '1px solid var(--code-editor-border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--code-editor-active-line)' },
  '.cm-activeLineGutter': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-active-line)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--code-editor-selection) !important',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--code-editor-selection) !important',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--code-editor-selection-match)',
    outline: '1px solid var(--code-editor-accent)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--code-editor-search-match)',
    outline: '1px solid var(--code-editor-accent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--code-editor-search-selected)',
  },
  '.cm-matchingBracket': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-bracket-match)',
    outline: '1px solid var(--code-editor-accent)',
  },
  '.cm-nonmatchingBracket': {
    color: 'var(--code-editor-invalid)',
    backgroundColor: 'var(--code-editor-invalid-surface)',
  },
  '.cm-panels': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-panel)',
    borderColor: 'var(--code-editor-border)',
  },
  '.cm-panel.cm-search': { padding: '8px 10px' },
  '.cm-textfield': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-surface)',
    border: '1px solid var(--code-editor-border)',
  },
  '.cm-button': {
    color: 'var(--code-editor-text)',
    backgroundImage: 'none',
    backgroundColor: 'var(--code-editor-gutter)',
    border: '1px solid var(--code-editor-border)',
  },
  '.cm-tooltip': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-panel)',
    border: '1px solid var(--code-editor-border)',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    color: 'var(--code-editor-text)',
    backgroundColor: 'var(--code-editor-selection)',
  },
  '.cm-foldPlaceholder': {
    color: 'var(--code-editor-comment)',
    backgroundColor: 'var(--code-editor-gutter)',
    borderColor: 'var(--code-editor-border)',
  },
})

const syntaxTheme = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: 'var(--code-editor-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.escape], color: 'var(--code-editor-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-editor-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: 'var(--code-editor-comment)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: 'var(--code-editor-function)' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--code-editor-variable)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--code-editor-property)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--code-editor-type)', fontWeight: '600' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: 'var(--code-editor-operator)' },
  { tag: [tags.heading, tags.strong], color: 'var(--code-editor-keyword)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--code-editor-function)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--code-editor-link)', textDecoration: 'underline' },
  { tag: [tags.invalid, tags.deleted], color: 'var(--code-editor-invalid)', textDecoration: 'underline wavy' },
])

export const codeMirrorThemeExtensions: Extension[] = [
  workspaceTheme,
  syntaxHighlighting(syntaxTheme),
]
