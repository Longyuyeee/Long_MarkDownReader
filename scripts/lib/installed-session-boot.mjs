// Read-only readiness probe. Page.reload legitimately destroys the old app
// before the new Vue/Pinia/reader exists; never treat that interval as an error.
export function installedSessionBootProbe(previousOrigin){
 if(typeof previousOrigin!=='number'||!Number.isFinite(previousOrigin)||previousOrigin<0)throw Error('A real previous WebView time origin is required')
 return `performance.timeOrigin!==${previousOrigin}&&document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('app')?.configReady===true&&!!document.querySelector('.text-workspace .cm-scroller')`
}
export const installedSessionBridgeProbe=()=>`typeof window.__TAURI_INTERNALS__?.invoke==='function'`
