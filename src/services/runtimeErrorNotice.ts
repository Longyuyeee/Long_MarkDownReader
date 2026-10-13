// A failed operation must not replace the workspace or trap the user behind a modal.
const dismissedUntil = new Map<string, number>()
let lastMessage = '', repeated = 0, activeDescription: HTMLElement | undefined
export function showRuntimeErrorNotice(error: unknown, manageLibraries: () => void, openLibrary?: () => void) {
  const text = error instanceof Error ? error.stack || error.message : String(error)
  const fingerprint = error instanceof Error ? error.message : String(error)
  if ((dismissedUntil.get(fingerprint) || 0) > Date.now()) return
  const previous = document.getElementById('runtime-error-notice')
  if (previous && fingerprint === lastMessage) {
    repeated++
    if (activeDescription) activeDescription.textContent = `同一问题已出现 ${repeated} 次。你仍可继续操作，关闭提示后可重试刚才的操作。`
    return
  }
  lastMessage = fingerprint; repeated = 1
  document.getElementById('runtime-error-notice')?.remove()
  const notice = document.createElement('section')
  notice.id = 'runtime-error-notice'
  notice.setAttribute('role', 'alert')
  notice.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:3000;box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:35vh;overflow:auto;padding:14px;border-radius:var(--theme-radius,12px);background:var(--theme-surface,#fff);color:var(--theme-text,#222);box-shadow:0 4px 24px #0003;border:1px solid var(--workspace-border-color,#888);font:13px/1.6 var(--font-sans,system-ui)'
  const title = document.createElement('strong')
  title.textContent = '当前操作未完成'
  const description = document.createElement('p')
  description.textContent = /路径|目录|os error 2|not found|no such file/i.test(fingerprint)
    ? '文件或资料库路径暂时不可用，可能已移动或磁盘未连接。其他功能仍可使用，可检查路径后重试。'
    : '这次操作没有完成，其他功能仍可使用。关闭提示后，可以重试刚才的操作。'
  activeDescription = description
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = '错误详情'
  const message = document.createElement('pre')
  message.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px;overflow:auto;font-size:11px'
  message.textContent = text
  details.append(summary, message)
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px'
  const close = () => {
    notice.remove(); dismissedUntil.set(fingerprint, Date.now() + 30000)
    if (dismissedUntil.size > 32) dismissedUntil.delete(dismissedUntil.keys().next().value!)
  }
  const choices: [string, () => void][] = [
    ['管理知识库', () => { close(); manageLibraries() }],
    ['关闭提示', close],
  ]
  if (openLibrary) choices.push(['返回资料库', () => { close(); openLibrary() }])
  for (const [label, action] of choices) {
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
