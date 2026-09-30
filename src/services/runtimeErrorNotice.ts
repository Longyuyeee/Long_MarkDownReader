// A failed operation must not replace the workspace or trap the user behind a modal.
export function showRuntimeErrorNotice(error: unknown, manageLibraries: () => void) {
  document.getElementById('runtime-error-notice')?.remove()
  const notice = document.createElement('section')
  notice.id = 'runtime-error-notice'
  notice.setAttribute('role', 'alert')
  notice.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:3000;box-sizing:border-box;width:min(380px,calc(100vw - 32px));max-height:35vh;overflow:auto;padding:16px;border-radius:12px;background:var(--theme-surface,#fff);color:var(--theme-text,#222);box-shadow:0 4px 24px #0003;border:1px solid var(--theme-border-color,#888)'
  const title = document.createElement('strong')
  title.textContent = '当前操作未完成'
  const description = document.createElement('p')
  description.textContent = '你仍可继续操作；如果知识库路径不可用，请检查磁盘连接或管理知识库。'
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = '错误详情'
  const message = document.createElement('pre')
  message.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'
  message.textContent = String(error)
  details.append(summary, message)
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px'
  for (const [label, action] of [
    ['管理知识库', () => { notice.remove(); manageLibraries() }],
    ['关闭提示', () => notice.remove()],
  ] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.style.cssText = 'font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:5px 10px;cursor:pointer'
    button.addEventListener('click', action)
    actions.append(button)
  }
  notice.append(title, description, details, actions)
  document.body.append(notice)
}
