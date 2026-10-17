import './v118-search-pages-browser.mjs'
const a=window.workflowAudit,original=window.__TAURI_INTERNALS__.invoke
const normalize=path=>path.replaceAll('\\','/').replace(/^\/\/\?\//,'')
a.session={pickers:[],bundles:new Map(),exports:[],calls:[],missing:new Set(),hold:false,pending:[],fail:false}
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 const s=a.session;s.calls.push({command,args})
 if(command==='plugin:dialog|open'||command==='plugin:dialog|save')return s.pickers.shift() ?? null
 if(command==='read_work_session_bundle'){if(!s.bundles.has(args.sourcePath))throw Error('模拟选错文件，原记录未改变');return structuredClone(s.bundles.get(args.sourcePath))}
 if(command==='export_work_session_bundle'){if(s.exports.some(item=>item.path===args.targetPath))throw Error('文件已存在，请选择新文件');s.exports.push({path:args.targetPath,bundle:structuredClone(args.bundle)});return}
 if(command==='preflight_work_session'){
  if(s.hold)await new Promise(resolve=>s.pending.push(resolve))
  if(s.fail)throw Error('模拟资料库暂时不可读')
  return {libraryRoot:args.libraryRoot,files:args.relativePaths.map(relativePath=>{
   const path=normalize(args.libraryRoot)+'/'+relativePath
   return !a.disk.has(path)||s.missing.has(relativePath)?{relativePath,state:'missing',reason:'未找到文件'}:{relativePath,state:'ready',path}
  })}
 }
 if(command==='locate_work_session_file'){
  const root=normalize(args.libraryRoot),path=normalize(args.path)
  if(!path.startsWith(root+'/')||!a.disk.has(path))throw Error('所选文件不在目标资料库内或无法访问')
  return {relativePath:path.slice(root.length+1),state:'ready',path}
 }
 return original(command,args)
}
