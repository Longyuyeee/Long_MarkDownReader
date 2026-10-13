// This small, dependency-free boundary also works when the main module cannot load.
;(function () {
  if (window.__longeditRecovery) return
  var runtimeHandler, pendingError, fallbackNotice
  var style = document.createElement('style')
  style.textContent = '#app-startup-screen{box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:var(--theme-bg,#f3f5f8);color:var(--theme-text,#243041);font:14px/1.6 system-ui,sans-serif}#app-startup-screen h1{font-size:20px} .app-recovery-card{box-sizing:border-box;width:min(560px,100%);padding:24px;border:1px solid var(--theme-border-color,#ccd3dc);border-radius:12px;background:var(--theme-surface,#fff);color:var(--theme-text,#243041);box-shadow:0 6px 24px #0001;font:14px/1.6 system-ui,sans-serif}.app-recovery-card h2{margin:0;font-size:20px}.app-recovery-card p{color:var(--theme-text-secondary,#526171)}.app-recovery-card pre{max-height:160px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.app-recovery-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.app-recovery-actions button{min-height:32px;padding:0 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}'
  document.head.appendChild(style)
  function errorText(error) { return error && (error.stack || error.message) || String(error || '未知错误') }
  function usableUI() { return Boolean(document.querySelector('#app .app-container')) }
  function layoutError(error) {
    var message = error && error.message || error
    return message === 'ResizeObserver loop limit exceeded' || message === 'ResizeObserver loop completed with undelivered notifications.'
  }
  function card(title, description, error) {
    var element = document.createElement('section'), heading = document.createElement('h2'), text = document.createElement('p')
    element.className = 'app-recovery-card'; element.setAttribute('role', 'alert')
    heading.textContent = title; text.textContent = description
    var details = document.createElement('details'), summary = document.createElement('summary'), info = document.createElement('pre')
    summary.textContent = '错误详情'; info.textContent = errorText(error); details.append(summary, info)
    element.append(heading, text, details)
    return element
  }
  function actions(element, choices) {
    var container = document.createElement('div'); container.className = 'app-recovery-actions'
    choices.forEach(function (choice) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = choice[0]
      button.addEventListener('click', choice[1]); container.appendChild(button)
    }); element.appendChild(container)
  }
  function showStartupError(error) {
    var root = document.getElementById('app'), screen = document.getElementById('app-startup-screen')
    if (!root) return
    if (!screen) { screen = document.createElement('section'); screen.id = 'app-startup-screen'; root.replaceChildren(screen) }
    document.documentElement.dataset.appReady = 'false'
    screen.replaceChildren()
    var recovery = card('界面暂时无法打开', '启动没有完成。你可以重新载入界面；如果文件位置有变化，请检查磁盘连接或资料库设置。', error)
    actions(recovery, [
      ['重新载入界面', function () { location.reload() }],
      ['打开资料库设置', function () { location.hash = '#/settings?category=library'; location.reload() }],
    ]); screen.appendChild(recovery)
  }
  function report(error) {
    if (layoutError(error)) return
    if (usableUI()) {
      if (runtimeHandler) { runtimeHandler(error); return }
      // Keep an already mounted interface usable even before its handler is installed.
      if (fallbackNotice) fallbackNotice.remove()
      fallbackNotice = card('当前操作未完成', '其他功能仍可继续使用。关闭提示后，可以重试刚才的操作。', error)
      fallbackNotice.id = 'app-recovery-notice'
      fallbackNotice.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:3000;width:min(380px,calc(100vw - 24px));max-height:35vh;overflow:auto;padding:16px'
      actions(fallbackNotice, [['关闭提示', function () { fallbackNotice.remove() }]])
      document.body.appendChild(fallbackNotice)
    } else {
      pendingError = error
      queueMicrotask(function () { if (!usableUI()) showStartupError(error); else report(error) })
    }
  }
  var startupTimer = setTimeout(function () { if (!usableUI() && !pendingError) report('启动等待超时，请重新载入界面后再试。') }, 15000)
  window.__longeditRecovery = {
    report: report,
    setRuntimeHandler: function (handler) { runtimeHandler = handler },
    markReady: function () {
      clearTimeout(startupTimer); document.documentElement.dataset.appReady = 'true'
      if (fallbackNotice) fallbackNotice.remove()
      if (pendingError) { var error = pendingError; pendingError = undefined; report(error) }
    },
  }
  window.addEventListener('error', function (event) {
    if (event.defaultPrevented) return
    if (layoutError(event.message) || layoutError(event.error)) { event.preventDefault(); return }
    if (event instanceof ErrorEvent) { event.preventDefault(); report(event.error || event.message) }
    else if (event.target && event.target.id === 'app-entry') report('界面资源无法加载，请重新载入后再试。')
  }, true)
  window.addEventListener('unhandledrejection', function (event) {
    if (event.defaultPrevented) return
    event.preventDefault(); report(event.reason)
  })
})()
