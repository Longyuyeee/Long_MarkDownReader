import './workflow-redesign-browser.mjs'
const a=window.workflowAudit,root=a.store.libraryPath,original=window.__TAURI_INTERNALS__.invoke
Object.assign(a,{oldSource:root+'/旧目录/资料.txt',newSource:root+'/新目录/资料.txt',decoy:root+'/同名/资料.txt',repairCalls:[],repairWrites:0})
a.directories.push(root+'/新目录',root+'/同名');a.disk.set(a.newSource,'唯一正文位置\n新来源仍是原资料');a.disk.set(a.decoy,'另一份同名文件')
a.sourceUri='longedit://source?'+new URLSearchParams({path:'旧目录/资料.txt',quote:'唯一正文位置'})
a.note='# 来源修复\n\n[修复来源]('+a.sourceUri+')\n\n```md\n[示例]('+a.sourceUri+')\n```\n'
a.disk.set(a.store.tabs[0].path,a.note);a.store.tabs[0].content=a.note
a.relations=[{id:'a'.repeat(32),sourcePath:a.store.tabs[0].path,targetPath:a.oldSource,relationType:'cites',note:'必须保留的说明'}]
localStorage.setItem('longedit.reference.v1:'+encodeURIComponent(root.toLowerCase()),JSON.stringify({path:a.oldSource,title:'资料.txt',query:'唯一正文位置'}))
if(new URLSearchParams(location.search).has('location')){
 a.oldSource=root+'/旧目录/资料.pdf';a.newSource=root+'/新目录/资料.pdf';a.disk.set(a.newSource,'synthetic PDF locator fixture');localStorage.setItem('longedit.reference.v1:'+encodeURIComponent(root.toLowerCase()),JSON.stringify({path:a.oldSource,title:'资料.pdf',query:'',page:999,annotationId:'deleted'}))
}

window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 if(['inspect_reference_source','repair_file_relation','preview_source_link_repair'].includes(command))a.repairCalls.push({command,args:JSON.parse(JSON.stringify(args))})
 if(command==='get_file_stats'){if(!a.disk.has(args.path))throw Error('路径不存在 (os error 2)');return {size:a.disk.get(args.path).length,created:1,modified:1}}
 if(command==='inspect_reference_source'){
  if(a.failInspect)throw Error('模拟读取失败，保留原记录')
  const text=a.disk.get(args.path),found=text===undefined?0:args.quote?text.split(args.quote).length-1:1
  return {path:args.path,parent:root,status:text===undefined?'missing':'available',message:text===undefined?'原位置没有这个文件，可以选择移动后的文件':'文件可读取',signature:String(text?.length||0),locationStatus:text===undefined?'none':args.page&&args.page>2?'unavailable':args.quote?(found===1?'verified':'unavailable'):'none',locationMessage:args.page&&args.page>2?'原页码不在这份 PDF 内':args.quote?(found===1?'原文字位置仍唯一匹配':'原文字没有唯一匹配'):'没有指定页码或文字位置'}
 }
 if(command==='list_relation_files')return {files:[...a.disk].filter(([path])=>path.toLowerCase().includes((args.query||'').toLowerCase())).map(([path])=>({path,name:path.split('/').pop(),relativePath:path.slice(root.length+1)})),truncated:false}
 if(command==='list_file_relations')return structuredClone(a.relations.filter(r=>r.sourcePath===args.path||r.targetPath===args.path))
 if(command==='repair_file_relation'){const r=a.relations.find(r=>r.id===args.expected.id);if(!r||JSON.stringify(r)!==JSON.stringify(args.expected))throw Error('关系已被其他操作修改');r[args.endpoint==='source'?'sourcePath':'targetPath']=args.replacementPath;a.repairWrites++;return structuredClone(r)}
 if(command==='preview_search_document'){if(!a.disk.has(args.path))throw Error('来源已移动');return {text:a.disk.get(args.path),label:'文本',truncated:false,matchFound:true}}
 if(command==='preview_source_link_repair'){
  if(a.holdRepairPreview){a.holdRepairPreview=false;await new Promise(resolve=>a.releasePreview=resolve)}
  let fence=false,count=0;const content=args.content.split('\n').map(line=>{if(line.startsWith('```')){fence=!fence;return line}if(fence)return line;const old=']('+args.originalUri+')',next=']('+args.replacementUri+')';count+=line.split(old).length-1;return line.split(old).join(next)}).join('\n');if(!count)throw Error('没有可替换链接');return {content,count}
 }
 return original(command,args)
}
