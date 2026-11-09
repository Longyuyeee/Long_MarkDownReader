import {pdfLimit,validatePdfBytes} from './pdfDocument.ts'
export interface PdfImportSummary {id:string;name:string;created:number;bytes:number;status:'preparing'|'ready'|'imported'|'failed';incoming:boolean;source:'open'|'share-file';readable:boolean;error:string;localPath:string|null;digest:string}
export interface PdfImportRecord extends PdfImportSummary {base64:string|null}
export const pdfImportCountLimit=6,pdfImportTotalLimit=80*1024*1024
export function receivedPdfName(name:string){const base=(name||'阅读资料.pdf').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'').trim();return (Array.from(base).slice(0,40).join('')||'阅读资料')+'.pdf'}
export function receivedPdfPath(name:string,id:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('PDF 接收记录编号无效。');return receivedPdfName(name).slice(0,-4)+'-接收-'+id+'.pdf'}
export function checkPdfIntakeCapacity(records:PdfImportSummary[],bytes:number){if(records.length>=pdfImportCountLimit)throw Error('已保留 6 条 PDF 接收记录，请先移除不需要的记录；已存入的 PDF 不会删除。');if(!Number.isInteger(bytes)||bytes<0||bytes>pdfLimit)throw Error('当前支持 20 MiB 以内的 PDF。');if(records.reduce((sum,r)=>sum+r.bytes,0)+bytes>pdfImportTotalLimit)throw Error('PDF 接收记录已达 80 MiB，请先移除不需要的记录，再重新分享。')}
export function checkedReceivedPdf(bytes:Uint8Array){validatePdfBytes(bytes);return bytes}
export const receivedPdfSize=(bytes:number)=>bytes>=1024*1024?(bytes/(1024*1024)).toFixed(1)+' MiB':(bytes/1024).toFixed(1)+' KiB'
