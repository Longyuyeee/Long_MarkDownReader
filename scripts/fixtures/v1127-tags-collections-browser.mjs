import './v1110-tags-browser.mjs'
const a=window.workflowAudit,original=window.__TAURI_INTERNALS__.invoke,root=a.store.libraryPath,target='C:/collection-target'
a.store.libraries.push({name:'复用目标',path:target});a.directories.push(target,target+'/重映射')
a.store.savedSearches.push({id:'graph',name:'项目图谱',query:'__longedit_graph_collection__',libraryPath:root,objectTypes:[],graphRoot:'项目方案.md',graphDepth:2,createdAt:2},{id:'target-existing',name:'分页项目',query:'预算',objectTypes:[],libraryPath:target,createdAt:3})
a.bundle={kind:'longedit-collections',schemaVersion:1,collections:[{name:'分页项目',query:'预算',objectTypes:['markdown'],filters:{directory:'分页项目',tag:'项目',tags:['工作'],modifiedWithinDays:7}},{name:'失效目录',query:'',objectTypes:['markdown'],filters:{directory:'旧目录',tag:'',modifiedWithinDays:null}},{name:'未知类型',query:'预算',objectTypes:['unavailable-format']}]}
a.exports=[]
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 if(['read_collection_bundle','export_collection_bundle','preview_collection_import'].includes(command))a.calls.push({command,args})
 if(command==='plugin:dialog|open')return args.options?.directory?(a.directoryChoice||target+'/重映射'):'C:/owned/collections.json'
 if(command==='plugin:dialog|save')return 'C:/owned/exported-collections.json'
 if(command==='read_collection_bundle')return structuredClone(a.bundle)
 if(command==='parse_collection_bundle')return JSON.parse(args.content)
 if(command==='export_collection_bundle'){a.exports.push(structuredClone(args));return}
 if(command==='preview_collection_import')return args.collections.map((entry,index)=>{const invalid=entry.objectTypes.includes('unavailable-format')||entry.filters?.directory&&!a.directories.includes(args.libraryRoot+'/'+entry.filters.directory)||a.invalidateImport;return {index,valid:!invalid,message:invalid?'目录或文件类型不可用，请调整条件':'条件可用'}})
 if(command==='save_config'&&a.holdConfig){a.holdConfig=false;await new Promise(resolve=>{a.releaseConfig=resolve})}
 return original(command,args)
}
