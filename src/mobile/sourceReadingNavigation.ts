import {shallowRef} from 'vue'
let dialog:{close:()=>void}|undefined
export function ownSourceDialog(close:()=>void){if(dialog&&dialog.close!==close)dialog.close();const entry={close};dialog=entry;return()=>{if(dialog===entry)dialog=undefined}}
export function backSourceDialog(){if(!dialog)return false;dialog.close();return true}
export const sourcePositionFailure=shallowRef(0)
export function reportSourcePositionFailure(){sourcePositionFailure.value++}
const readers=new Set<()=>Promise<boolean>>(),pending=new Set<Promise<unknown>>()
export function registerSourceReader(flush:()=>Promise<boolean>){readers.add(flush);return()=>readers.delete(flush)}
export function trackSourceWrite<T>(value:Promise<T>){pending.add(value);void value.finally(()=>pending.delete(value)).catch(()=>{});return value}
export async function settleSourceWrites(){await Promise.allSettled([...pending])}
export async function flushSourceReaders(){const results=await Promise.allSettled([...readers].map(flush=>flush()));await Promise.allSettled([...pending]);return results.every(r=>r.status==='fulfilled'&&r.value)}
