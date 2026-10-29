import './v1311-search-return-browser.mjs'
const originalInvoke=window.__TAURI_INTERNALS__.invoke
window.__TAURI_INTERNALS__.invoke=async(command,args)=>{
 const result=await originalInvoke(command,args)
 if(command==='analyze_json_source'){
  try{JSON.parse(args.content)}catch{return{...result,valid:false}}
 }
 return result
}
