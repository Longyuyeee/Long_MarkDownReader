import './save-history-v117-browser.mjs'
import {findFixture,textFindFixture} from '../lib/document-find-fixture.mjs'
const a=window.workflowAudit
a.store.motionSpeed='calm';a.findFixture=findFixture;a.textFindFixture=textFindFixture
a.disk.set(a.store.libraryPath+'/项目方案.md',findFixture);a.disk.set(a.store.libraryPath+'/查找测试.txt',textFindFixture);a.store.tabs[0].content=findFixture

const originalInvoke=window.__TAURI_INTERNALS__.invoke
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 const request=command==='write_text_document'?{...args,content:args.content.replace(/\n+$/,'')+'\n'}:args
 return originalInvoke(command,request)
}
