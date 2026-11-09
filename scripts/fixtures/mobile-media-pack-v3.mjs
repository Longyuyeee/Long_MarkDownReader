import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
export const store='longedit-mobile-preview-v1',sha=b=>createHash('sha256').update(b).digest('hex')
export const archive=await readFile(new URL('./mobile-media-pack-v3.textpack',import.meta.url))
export const packId='00000000-0000-4000-8000-000000000921',imageId='00000000-0000-4000-8000-000000000922'
export const noteKey=JSON.stringify(['local','项目笔记.md']),original='# 项目笔记\r\n原始内容保留。\r\n',draft='# 项目笔记\n未完成的输入😀\n![流程图](attachments/flow.png)\n'
export const pack={id:packId,name:'项目资料.textpack',created:1793927220000,bytes:archive.length,status:'ready',readable:true,count:4,textName:'text.markdown',assets:[],content:null,archive:archive.toString('base64'),archiveDigest:sha(archive),error:'',localPath:null,incoming:true,source:'share-file'}
export const missing={id:imageId,rootId:'local',notePath:'项目笔记.md',name:'图示-流程.png',created:1793927220000,status:'ready',imagePath:'attachments/flow.png',width:320,height:200,bytes:5234,error:'',attempts:1}
const pdfBytes=await readFile(new URL('./mobile-pdf-navigation-design.pdf',import.meta.url))
export const pdf={id:'00000000-0000-4000-8000-000000000924',name:'技术方案.pdf',source:'share-file',created:1793927880000,bytes:pdfBytes.length,status:'ready',readable:true,incoming:true,error:'',digest:sha(pdfBytes),localPath:null,base64:pdfBytes.toString('base64')}
export const text={id:'00000000-0000-4000-8000-000000000923',name:'会议纪要.md',created:1793928360000,bytes:Buffer.byteLength('# 会议纪要\r\n'),status:'ready',readable:true,content:'# 会议纪要\r\n',digest:sha('# 会议纪要\r\n'),error:'',localPath:null,incoming:true,source:'share-file'}
export const controlKey=JSON.stringify(['local','独立原稿.md']),controlSource={rootId:'local',relativePath:'独立原稿.md',content:'独立原文\r\n',signature:sha('独立原文\r\n'),modified:1},controlDraft={rootId:'local',relativePath:'独立原稿.md',content:'独立准备😀\r\n',expectedSignature:controlSource.signature,revision:3,updated:2}
export const fixture={version:1,documents:{[controlKey]:controlSource,[noteKey]:{rootId:'local',relativePath:'项目笔记.md',content:original,signature:sha(original),modified:1}},drafts:{[controlKey]:controlDraft,[noteKey]:{rootId:'local',relativePath:'项目笔记.md',content:draft,expectedSignature:sha(original),revision:7,updated:1}},imageImports:{[imageId]:missing},images:{},packImports:{[packId]:pack},pdfImports:{[pdf.id]:pdf},fileImports:{[text.id]:text}}
export async function seedMedia(context,dark=false){await context.addInitScript(({store,fixture,dark})=>{if(window!==top||localStorage.getItem(store))return;localStorage.setItem(store,JSON.stringify(fixture));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{store,fixture,dark})}
export const back=async page=>{await page.evaluate(()=>window.__longeditMobileBack());await page.waitForTimeout(120)}
export async function library(page){await page.goto((process.env.LONGEDIT_MEDIA_BASE_URL||'http://127.0.0.1:9012')+'/mobile.html');await page.waitForFunction(()=>document.querySelector('.mobile-workspace')?.getAttribute('aria-busy')==='false'&&document.querySelector('.file-row'))}
