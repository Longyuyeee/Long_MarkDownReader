// Catch inside the evaluated page so CDP cannot replace a native rejection
// string with the generic exceptionDetails.text "Uncaught (in promise)".
export async function observedNativeCommand(evaluate,command,args={}) {
 const outcome=await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,message:error?.message??String(error),nativeError:error}}})()`)
 if(!outcome?.ok){const error=new Error(outcome?.message||'Native command returned no observed outcome');error.nativeError=outcome?.nativeError;throw error}
 return outcome.value
}
