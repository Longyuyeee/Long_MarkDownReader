import './file-move-event-bootstrap.mjs'
import './file-management-browser.mjs'
const a=window.workflowAudit,original=window.__TAURI_INTERNALS__.invoke,root=a.store.libraryPath
const {callbacks,listeners}=window.moveFixtureEvents,replies=new Map(),acks=new Map(),statuses=new Map()
let sequence=0
const emit=(event,payload)=>{for(const id of listeners.get(event)||[])callbacks.get(id)?.({event,id,payload})}
a.directories.push(root+'/阅读资料');a.disk.set(root+'/阅读资料/长文.md','# 阅读位置\n\n'+Array.from({length:200},(_,i)=>`段落 ${i}：继续原来的阅读与整理。\n\n`).join(''))
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 if(command==='plugin:event|listen'){const ids=listeners.get(args.event)||[];ids.push(args.handler);listeners.set(args.event,ids);return args.handler}
 if(command==='reply_file_move_protection'){replies.get(args.requestId)?.(args);return}
 if(command==='acknowledge_file_move_release'){acks.get(args.requestId)?.();return}
 if(command==='file_move_protection_status')return statuses.get(args.requestId)||{active:false,notice:null}
 if(command!=='transfer_library_items'||args.operation!=='move')return original(command,args)
 const result={items:[],errors:[]}
 for(const oldPath of args.paths){
  const targetDir=/^[a-z]:/i.test(args.targetDir)?args.targetDir:args.targetDir==='.'?root:root+'/'+args.targetDir,newPath=targetDir+'/'+oldPath.split('/').pop(),requestId='reading-'+ ++sequence
  const reply=new Promise(resolve=>replies.set(requestId,resolve));statuses.set(requestId,{active:true,notice:null});emit('file-move-protect',{requestId,libraryRoot:root,paths:[oldPath,newPath],rewritePaths:[],sourcePaths:[oldPath]})
  const permission=await reply,done=new Promise(resolve=>acks.set(requestId,resolve))
  if(!permission.ready||permission.dirtyPaths.length){emit('file-move-release',{requestId,notice:null});await done;result.errors.push({path:oldPath,message:'请先保存修改',disposition:'notExecuted'});continue}
  for(const [path,content]of [...a.disk])if(path===oldPath||path.startsWith(oldPath+'/')){a.disk.set(newPath+path.slice(oldPath.length),content);a.disk.delete(path)}
  for(const path of [...a.directories])if(path===oldPath||path.startsWith(oldPath+'/')){a.directories.splice(a.directories.indexOf(path),1);a.directories.push(newPath+path.slice(oldPath.length))}
  const notice={root,oldPath,newPath,documents:[]};statuses.set(requestId,{active:false,notice});emit('file-move-release',{requestId,notice});await done;result.items.push({oldPath,newPath})
 }
 return result
}
