// Fault-injection setup only. A transient Windows directory-sharing refusal is
// not proof of an offline library. Keep trying only the SAME owned rename,
// bounded; all graph failure/retry assertions still run after a real rename.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
export async function renameOwnedOfflineFixture(source,target,markerRelative,io={}){
 const root='c:\\longeditr5ilibrary',normalize=value=>path.win32.resolve(value).toLowerCase(),a=normalize(source),b=normalize(target),offline=value=>new RegExp('^c:\\\\longeditr5ilibrary-v1111-offline-[a-f0-9-]{36}$').test(value)
 assert.ok((a===root&&offline(b))||(b===root&&offline(a)),'Only the fixed disposable library and its unique offline sibling may move')
 assert.ok(!path.win32.isAbsolute(markerRelative)&&!markerRelative.split(/[\\/]/).includes('..')&&path.win32.basename(markerRelative)==='.v1111-owned','Require the owned graph marker')
 const perform=io.rename||fs.rename,access=io.access||fs.access,wait=io.wait||(ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=io.now||Date.now,start=now(),errors=[]
 await access(path.join(source,markerRelative))
 for(let attempt=1;attempt<=40;attempt++){
  try{await perform(source,target);return {attempts:attempt,elapsedMs:now()-start,transientErrors:errors}}
  catch(error){
   if(!['EPERM','EBUSY'].includes(error.code)||attempt===40||now()-start>=10000)throw error
   errors.push({code:error.code,message:String(error.message)});await wait(250)
  }
 }
 throw Error('Offline fixture rename did not complete')
}
