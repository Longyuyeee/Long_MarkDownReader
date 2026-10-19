import './file-management-browser.mjs'
const state=window.workflowAudit,original=window.__TAURI_INTERNALS__.invoke,target='C:/copy-target',plans=new Map()
state.store.libraries.push({name:'复制目标资料库',path:target});state.copyTarget=target
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 if(command==='preview_cross_library_copy'){state.calls.push({command,args});const planId='cross-'+plans.size,preview={planId,sourceRoot:args.sourceRoot,targetRoot:args.targetRoot,targetDirectory:args.targetRoot,items:args.paths.map(path=>({oldPath:path,newPath:target+'/'+path.split('/').pop(),fileCount:1,dependencyCount:0,totalBytes:100,warnings:[],error:null,completed:false,reviewRequired:false}))};plans.set(planId,preview);return structuredClone(preview)}
 if(command==='execute_cross_library_copy'){state.calls.push({command,args});const preview=plans.get(args.planId);for(const item of preview.items){state.disk.set(item.newPath,state.disk.get(item.oldPath));item.completed=true}return{preview:structuredClone(preview),result:{items:preview.items.map(({oldPath,newPath})=>({oldPath,newPath})),errors:[]}}}
 return original(command,args)
}
