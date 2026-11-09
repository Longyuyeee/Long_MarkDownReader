import fontUrl from '../assets/fonts/reading-serif/LongEditReadingSerif-Bold.woff2?url'
let cached:Promise<string>|undefined
/** Load only the packaged font. The opaque sandbox receives a data URL, so it
 * never needs network access or cross-origin font permissions. */
export function readingTitleFont():Promise<string>{
 if(cached)return cached
 cached=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500)
  try{const response=await fetch(fontUrl,{signal:controller.signal});if(!response.ok)throw Error('font unavailable');const bytes=await response.arrayBuffer();if(bytes.byteLength>4*1024*1024)throw Error('font budget');return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('font unavailable'));reader.readAsDataURL(new Blob([bytes],{type:'font/woff2'}))})}finally{clearTimeout(timer)}
 })().catch(()=>{cached=undefined;return ''})
 return cached
}
