import assert from 'node:assert/strict'
import { nativeUserInput } from './v118-native-user-input.mjs'

// Follow the same visible entry a user has at the current window size.
export async function chooseInstalledMarkdownMode({ send, evaluate }, value) {
  const labels = { wysiwyg: '所见即所得', ir: '即时渲染 IR', sv: '源码编辑' }
  const label = labels[value] || value
  assert.ok(Object.values(labels).includes(label), 'Known Markdown mode')
  const ui = nativeUserInput({ send, evaluate }, { timeoutMs: 45000 })
  const visible = selector => `!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`
  if (await evaluate(visible('.inline-mode'))) {
    await ui.click('.inline-mode')
    await ui.clickText('.n-dropdown-option-body__label', label)
    return
  }
  if (!await evaluate(visible('.document-menu-content'))) await ui.click('[data-testid="library-document-menu"]')
  const title = label === '即时渲染 IR' ? '即时渲染' : label
  await ui.clickTarget(`[...document.querySelectorAll('.document-menu-content .mode-toggle button')].find(e=>e.getAttribute('title')===${JSON.stringify(title)}||e.getAttribute('data-app-tooltip')===${JSON.stringify(title)})`)
  if (await evaluate(visible('.document-menu-content'))) await ui.click('[data-testid="library-document-menu"]')
  await ui.waitFor(`!(${visible('.document-menu-content')})`, 'document mode menu closed after the user selection')
}
