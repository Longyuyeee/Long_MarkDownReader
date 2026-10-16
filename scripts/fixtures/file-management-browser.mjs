import './workflow-redesign-browser.mjs'
const a = window.workflowAudit, invoke = window.__TAURI_INTERNALS__.invoke, root = a.store.libraryPath
const recycled = new Map()
a.fileFailure = false
a.store.fileDisplayStyles = { [root+'/项目方案.md']: { backgroundColor: '#315642', icon: 'rocket', selectionStyle: 'marker' } }
const ensureDirectory = path => {
  if (path === root || a.directories.includes(path)) return
  ensureDirectory(path.slice(0, path.lastIndexOf('/'))); a.directories.push(path)
}
const movePath = (old, next, copying) => {
  for (const [path, content] of [...a.disk]) if (path === old || path.startsWith(old+'/')) { a.disk.set(next+path.slice(old.length), content); if (!copying) a.disk.delete(path) }
  for (const directory of [...a.directories]) if (directory === old || directory.startsWith(old+'/')) { const nextDirectory = next+directory.slice(old.length); if (!a.directories.includes(nextDirectory)) a.directories.push(nextDirectory); if (!copying) a.directories.splice(a.directories.indexOf(directory),1) }
}
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (['transfer_library_items','undo_library_moves','trash_library_items','list_library_trash','restore_library_trash','purge_library_trash'].includes(command)) a.calls.push({ command,args })
  if (command === 'transfer_library_items') {
    const result = {items:[],errors:[]}
    for(const old of args.paths) {
      if(a.fileFailure) {result.errors.push({path:old,message:'模拟目录暂时不可写',...(args.operation==='move'?{disposition:'notExecuted'}:{})});continue}
      const directory = args.targetDir ? (/^[a-z]:/i.test(args.targetDir) ? args.targetDir : args.targetDir === '.' ? root : root+'/'+args.targetDir) : old.slice(0,old.lastIndexOf('/'))
      ensureDirectory(directory)
      const name = old.split('/').pop()
      let next = directory+'/'+name, n=1
      if(args.operation==='move'&&next===old)continue
      while(a.disk.has(next)||a.directories.includes(next)) { const dot=name.lastIndexOf('.'), stem=dot<0?name:name.slice(0,dot),suffix=dot<0?'':name.slice(dot); next=directory+'/'+stem+' - 副本'+(n===1?'':' '+n)+suffix;n++ }
      movePath(old,next,args.operation==='copy');result.items.push({oldPath:old,newPath:next})
    }
    return result
  }
  if(command==='undo_library_moves') {
    const result={items:[],errors:[]}
    for(const item of args.items) {if(a.disk.has(item.oldPath)||a.directories.includes(item.oldPath)) {result.errors.push({path:item.newPath,message:'原位置已有同名项，请先移开后再恢复或撤销',disposition:'notExecuted'});continue}movePath(item.newPath,item.oldPath,false);result.items.push({oldPath:item.newPath,newPath:item.oldPath})}
    return result
  }
  if(command==='trash_library_items') {
    const items=[]
    for(const path of args.paths) {const id=String(recycled.size+1);const files=[...a.disk].filter(([file])=>file===path||file.startsWith(path+'/'));const dirs=a.directories.filter(dir=>dir===path||dir.startsWith(path+'/'));recycled.set(id,{id,originalPath:path.slice(root.length+1),name:path.split('/').pop(),deletedAt:Math.floor(Date.now()/1000),isDir:dirs.includes(path),files,dirs});for(const [file] of files)a.disk.delete(file);for(const dir of dirs)a.directories.splice(a.directories.indexOf(dir),1);items.push({oldPath:path,newPath:id})}return {items,errors:[]}
  }
  if(command==='list_library_trash')return [...recycled.values()].map(({files,dirs,...entry})=>entry)
  if(command==='restore_library_trash') {const result={items:[],errors:[]};for(const id of args.ids){const item=recycled.get(id),path=root+'/'+item.originalPath;if(a.disk.has(path)){result.errors.push({path:id,message:'原位置已有同名项，请先移开后再恢复'});continue}for(const [file,content]of item.files)a.disk.set(file,content);a.directories.push(...item.dirs);recycled.delete(id);result.items.push({oldPath:id,newPath:path})}return result}
  if(command==='purge_library_trash'){args.ids.forEach(id=>recycled.delete(id));return}
  if(command==='get_graph_relation_context')return []
  return invoke(command,args)
}
a.recycled=recycled
