import './search-consistency-browser.mjs'
const a=window.workflowAudit, original=window.__TAURI_INTERNALS__.invoke, root=a.store.libraryPath
a.pageCalls=[];a.pageCloses=[];a.pageScenario='large';a.pageFault='';a.pendingPages=[];a.pageHold=false;a.pageRevision=0;a.workReady=false
const sessions=new Map();let sequence=0
const match=(path,extra={})=>({title:path.split('/').pop(),path,objectType:'markdown',matchKind:'body',context:'项目预算安排，保留原文。',score:60,extractionFailed:false,...extra})
const group=(path,extra={})=>({title:path.split('/').pop(),path,matches:[match(path)],modifiedAtMs:1,mayHaveMoreMatches:false,locationLimitPerKind:5,unlocatedLimitPerKind:1,...extra})
const large=[]
for(const folder of ['部门甲','部门乙','预算资料'])if(!a.directories.includes(root+'/'+folder))a.directories.push(root+'/'+folder)
for(const folder of ['部门甲','部门乙']){const path=root+'/'+folder+'/项目预算.md';a.disk.set(path,`# 项目预算\n\n${folder}的项目预算安排。\n#Budget`);large.push(group(path))}
large.push(group(root+'/调研报告.pdf',{matches:Array.from({length:5},(_,index)=>match(root+'/调研报告.pdf',{objectType:'pdf',matchKind:'annotation',annotationId:'annotation-'+index,page:index+1,context:'项目预算批注 '+index})),mayHaveMoreMatches:true}))
for(let index=0;index<241;index++){const path=root+`/预算资料/预算记录-${String(index).padStart(3,'0')}.md`;a.disk.set(path,`# 项目预算记录 ${index}\n\n用户记录的项目预算，不自动保存或替换草稿。\n#Budget`);large.push(group(path))}
const other=group('C:/study-fixture/跨库笔记.md',{libraryRoot:'C:/study-fixture',libraryName:'学习资料库'})
const progress=(name,path,state,count)=>({libraryName:name,libraryRoot:path,state,availableFiles:count,totalFiles:state==='ready'?count:null,examinedSources:count,indexed:false,warnings:state==='unavailable'?['模拟离线库：没有把失败当作零结果']:[]})
function response(session,request){
  const multi=session.multi, preparing=a.pageScenario==='preparing'&&!a.workReady
  let files=a.pageScenario==='empty'?[]:a.pageScenario==='cross'?[other]:a.pageScenario==='partial'&&a.workReady?[other,...large]:large
  if(multi && request.libraryRoot)files=files.filter(file=>(file.libraryRoot||root)===request.libraryRoot)
  if(request.matchMode==='tag')files=files.filter(file=>file.matches[0].objectType==='markdown')
  if(request.sort==='modified')files=[...files].reverse()
  if(preparing)files=[]
  const version=a.pageScenario==='partial'&&a.workReady?1:0
  const offset=request.cursor?.startsWith(session.id+':p:')?Number(request.cursor.split(':').pop()):0
  if(offset&&session.version!==version)throw {code:'snapshotChanged',message:'fixture snapshot changed'}
  session.version=version
  const end=Math.min(offset+request.pageSize,files.length), next=end<files.length?session.id+':p:'+end:null
  const pending=preparing||(a.pageScenario==='partial'&&!a.workReady)
  const limited=a.pageScenario==='offline', failed=a.pageScenario==='allFailed'
  const results=failed?[]:files.slice(offset,end).map(file=>({...file,libraryRoot:file.libraryRoot||request.libraryRoot||root,libraryName:file.libraryName||'项目资料库'}))
  const work=session.id+':w:'+session.step
  return {sessionId:session.id,snapshotId:session.id+':v:'+version,files:results,pageOffset:preparing&&!multi?null:offset,
    nextCursor:preparing&&!multi?work:failed?null:next,...(multi?{continueCursor:pending?work:null,refreshCursor:work,libraries:[progress('项目资料库',root,failed?'unavailable':preparing?'preparing':'ready',failed||preparing?0:files.filter(file=>!file.libraryRoot).length),...(limited||failed||a.pageScenario==='partial'?[progress('学习资料库','C:/study-fixture',failed||limited?'unavailable':pending?'searching':'ready',failed||limited||pending?0:1)]:[])]}:{}),
    scanState:failed?'failed':pending?'preparing':limited?'limited':'ready',scanComplete:!pending&&!limited&&!failed,totalFiles:pending||limited||failed?null:files.length,
    availableFiles:failed?0:files.length,warnings:limited?['模拟部分资料暂时无法读取，结果未查全']:[],examinedSources:failed?0:files.length,indexed:false,unreadSources:0,coverage:'registered-extractable-content'}
}
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
  if(command==='plugin:app|version')return '1.1.7'
  if(command==='close_knowledge_search'){a.pageCloses.push(args);const session=sessions.get(args.sessionId);if(session)session.closed=true;return true}
  if(command==='search_knowledge_page'||command==='search_knowledge_libraries_page'){
    const request=args.request;a.pageCalls.push({command,request})
    if(a.pageFault){const code=a.pageFault;a.pageFault='';throw {code,message:'C:/private/never-display-native-path'}}
    let session=request.cursor?sessions.get(request.cursor.split(':')[0]):null
    if(!request.cursor){session={id:'fixture-'+(++sequence),multi:command==='search_knowledge_libraries_page',step:0,version:0};sessions.set(session.id,session)}
    if(!session||session.closed)throw {code:'expired'}
    session.step++
    if(a.pageScenario==='preparing'&&session.step>2)a.workReady=true
    if(a.pageHold)await new Promise(resolve=>a.pendingPages.push(resolve))
    return response(session,request)
  }
  return original(command,args)
}
a.largeSearchFiles=large
