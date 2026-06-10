import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import router from './router'

import 'vfonts/Inter.css'
import 'vfonts/FiraCode.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(naive)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Long编辑 Error]', err, '\nInfo:', info)

  const appEl = document.getElementById('app')
  if (appEl && !appEl.querySelector('.crash-fallback')) {
    const fallback = document.createElement('div')
    fallback.className = 'crash-fallback'
    fallback.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;padding:40px;text-align:center'
    fallback.innerHTML = `
      <h2 style="margin-bottom:12px">出现错误</h2>
      <p style="opacity:0.6;margin-bottom:24px">应用遇到了意外问题，请尝试刷新页面或重启应用。</p>
      <button onclick="location.reload()" style="padding:8px 24px;border-radius:8px;border:none;background:var(--theme-primary,#007aff);color:#fff;cursor:pointer;font-size:14px">刷新应用</button>
      <details style="margin-top:20px;max-width:600px;text-align:left;opacity:0.5">
        <summary>错误详情</summary>
        <pre style="font-size:12px;overflow:auto;margin-top:8px">${String(err)}</pre>
      </details>
    `
    appEl.appendChild(fallback)
  }
}

app.mount('#app')
