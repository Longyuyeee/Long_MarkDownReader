import {createHash} from 'node:crypto'
export const identity={rootId:'local',relativePath:'NativeTextPosition-20261030.md'}
export const id=JSON.stringify([identity.rootId,identity.relativePath])
export const content='# 本机续读验收\n\n'+Array.from({length:90},(_,i)=>`## 第 ${i+1} 节\n\n继续位置 ${i+1}。离开以后，仍从原来的段落继续。保留资料原文、独立草稿与其他阅读记录；只在保存确认后更新状态。\n`).join('\n')
export const signature=createHash('sha256').update(content).digest('hex')
export const legacyPoint={fingerprint:signature,block:40,fraction:.25,progress:.4,updated:1}
