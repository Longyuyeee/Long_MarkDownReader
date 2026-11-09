import {createHash} from 'node:crypto'
import {sourcePages} from '../src/mobile/documentBudget.ts'
export const identity={rootId:'local',relativePath:'NativeSourcePosition-20261030.md'},id=JSON.stringify([identity.rootId,identity.relativePath])
const lines=Array.from({length:7000},(_,i)=>`第${String(i+1).padStart(5,'0')}行：保留分段长文、原文、查询和选区。😀记录仍在这一行。${[50,2000,4500].includes(i)?'匹配目标':''}\r\n`).join('')
export const content='\ufeff# 分段续读\r\n\r\n'+lines.slice(0,lines.lastIndexOf('\n',189900)+1)+'最终尾行😀\r\n',signature=createHash('sha256').update(content).digest('hex'),pages=sourcePages(content),legacyPoint={fingerprint:signature,offset:pages[2].from,scroll:480,updated:1}
