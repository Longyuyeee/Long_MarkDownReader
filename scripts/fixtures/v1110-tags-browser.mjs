import './workflow-redesign-browser.mjs'
import { inlineTags } from '/src/utils/inlineTags.ts'
const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = a.store.libraryPath
const folder = root + '/分页项目'; a.directories.push(folder)
for (let n = 0; n < 244; n++) a.disk.set(folder + `/资料-${String(n).padStart(3, '0')}.md`, `# 资料 ${n}\n\n预算 #项目 #工作\n\n预算明细\n`)
a.store.savedSearches = [{ id: 'paged', name: '分页项目', query: '', libraryPath: root, objectTypes: ['markdown'], filters: { directory: '', tag: '项目', modifiedWithinDays: null }, createdAt: 1 }]
let seq = 0; const sessions = new Map(), plans = new Map()
const fail = (code, message = code) => { throw { code, message } }
const rows = request => [...a.disk].filter(([path, body]) => (!request.filters.directory || path.startsWith(root + '/' + request.filters.directory + '/')) && (!request.filters.tag || inlineTags(body).includes(request.filters.tag)) && (request.filters.tags || []).every(tag => inlineTags(body).includes(tag)) && (!request.query || body.toLowerCase().includes(request.query.toLowerCase()) || path.toLowerCase().includes(request.query.toLowerCase()))).map(([path, body]) => {
 const match={title:path.split('/').pop(),path,objectType:'markdown',matchKind:request.query?'body':'title',context:request.query?body.slice(0,100):'符合集合条件',score:100,extractionFailed:false}
 return {path,title:match.title,matches:request.query?[match,{...match,context:'第二处正文命中',locationLabel:'正文后段'}]:[match],mayHaveMoreMatches:false,locationLimitPerKind:5,unlocatedLimitPerKind:1}
}).sort((left,right)=>request.sort==='modified'?right.path.localeCompare(left.path):left.path.localeCompare(right.path))
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
 if (['search_collection_page','get_tag_catalog_page','preview_tag_edit','apply_tag_edit','close_tag_edit'].includes(command)) a.calls.push({command,args})
 if (command === 'search_collection_page') {
  if (a.deferCollection) { a.deferCollection=false; await new Promise((resolve,reject)=>{a.releaseCollection=resolve;a.rejectCollection=()=>reject(Error('合成离线，保留原结果'))}) }
  if (a.failCollection) throw Error('合成资料库不可读')
  const request=args.request,key=JSON.stringify({...request,cursor:null});let id,offset=0
  if (!request.cursor) {id='fixture-'+(++seq);sessions.set(id,{key,files:rows(request)})} else {const bits=request.cursor.split(':');id=bits[0];offset=Number(bits[2]);if(sessions.get(id)?.key!==key)fail('requestMismatch')}
  const files=sessions.get(id).files,end=offset+request.pageSize
  return {sessionId:id,snapshotId:id,files:files.slice(offset,end),pageOffset:offset,nextCursor:end<files.length?`${id}:p:${end}`:null,scanState:'ready',scanComplete:true,totalFiles:files.length,warnings:[]}
 }
 if (command === 'get_tag_catalog_page') {
  if(a.failCatalog)throw Error('合成标签统计离线')
  const counts=new Map();for(const body of a.disk.values())for(const tag of inlineTags(body))counts.set(tag,(counts.get(tag)||0)+1)
  return {sessionId:'tags-'+(++seq),nextCursor:null,scanState:'ready',scanComplete:true,tags:[...counts].map(([tag,count])=>({tag,count})),examinedNotes:a.disk.size,totalNotes:a.disk.size,unreadSources:0,warnings:[]}
 }
 if (command === 'preview_tag_edit') {
  const r=args.request,id='plan-'+(++seq),items=r.paths.map((path,index)=>({index,path,state:r.excludedPaths.includes(path)?'excluded':'ready',changes:1,message:r.excludedPaths.includes(path)?'本窗口有未保存内容，已排除，不会自动代存':'将修改已保存正文，原文历史保留'}))
  plans.set(id,{request:structuredClone(r),items,originals:r.paths.map(path=>a.disk.get(path))});return {planId:id,items}
 }
 if (command === 'apply_tag_edit') {
  const p=plans.get(args.request.planId);if(p.report)return p.report
  if(!args.request.confirmed)throw Error('未确认')
  const items=p.items.map(item=>{const before=a.disk.get(item.path),op=p.request.operation
   if(!args.request.selected.includes(item.index)||item.state!=='ready')return {...item,outcome:'notExecuted',message:item.message}
   if(before!==p.originals[item.index]||a.failWritePath===item.path)return {...item,outcome:'notExecuted',message:'来源已变化，本次未覆盖，请重新预览'}
   a.tagHistory ||= [];a.tagHistory.push({path:item.path,before});a.disk.set(item.path,op.kind==='add'?before+'\n#'+op.tag+'\n':before.replaceAll('#'+(op.from||op.tag),op.kind==='remove'?'':'#'+op.to))
   return {...item,outcome:'completed',message:'已修改正文，原文历史已保留'}
  });p.report={items};return p.report
 }
 if(command==='close_tag_edit'){plans.delete(args.planId);return true}
 return original(command,args)
}
