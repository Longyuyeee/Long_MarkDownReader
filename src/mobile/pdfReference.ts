export interface MobilePdfReference { rootId: string; relativePath: string; page: number; annotationId: string; sourceSignature: string }
const root = (v: string) => v === 'local' || /^[a-f0-9]{64}$/.test(v)
function inspectReference(value:string,fallbackRoot:string): {target:MobilePdfReference|null;error:string} {
  const invalid=(error:string)=>({target:null,error})
  if (value.length > 16000) return invalid('链接过长')
  const match=/^longedit:\/\/pdf\/?\?([^#]*)$/.exec(value)
  if(!match) return invalid('链接地址格式无效')
  try {
    // This is a fixed application URI, not an arbitrary web URL. Decode once
    // without depending on platform URL/URLSearchParams implementations.
    const params=new Map<string,string>(),allowed=['root','path','page','annotation','sha256']
    for(const pair of match[1].split('&')) {
      const at=pair.indexOf('=');if(at<1)return invalid('来源参数无效')
      const key=decodeURIComponent(pair.slice(0,at).replace(/\+/g,' ')),entry=decodeURIComponent(pair.slice(at+1).replace(/\+/g,' '))
      if(!allowed.includes(key)||params.has(key))return invalid('来源参数重复或不受支持')
      params.set(key,entry)
    }
    const relativePath=params.get('path')||'', pageText=params.get('page')||'', annotationId=params.get('annotation')||'', sourceSignature=(params.get('sha256')||'').toLowerCase(), rootId=params.get('root') ?? fallbackRoot
    if(!root(rootId))return invalid('资料库身份无效')
    if(!relativePath || relativePath.length>4096 || !/\.pdf$/i.test(relativePath) || /^[a-z]:/i.test(relativePath) || /[\\\x00-\x1f]/.test(relativePath) || relativePath.split('/').some(p=>!p||p==='.'||p==='..'))return invalid('PDF 文件位置无效')
    if(!/^[1-9]\d{0,5}$/.test(pageText)||Number(pageText)>100000)return invalid('引用页码无效')
    if(!annotationId.trim()||Array.from(annotationId).length>128||/[\x00-\x1f]/.test(annotationId))return invalid('批注编号无效')
    if(!/^[a-f0-9]{64}$/.test(sourceSignature))return invalid('PDF 内容摘要无效')
    return {target:{rootId,relativePath,page:Number(pageText),annotationId,sourceSignature},error:''}
  } catch { return invalid('链接编码无效') }
}
export function parseMobilePdfReference(value: string, fallbackRoot = 'local'): MobilePdfReference | null {
  return inspectReference(value,fallbackRoot).target
}
export function mobilePdfReferenceUri(target: MobilePdfReference) {
  const params={path:target.relativePath,page:String(target.page),annotation:target.annotationId,sha256:target.sourceSignature,root:target.rootId}
  const uri='longedit://pdf?'+Object.entries(params).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&')
  const inspected=inspectReference(uri,'local')
  if (!inspected.target) throw new Error(`PDF 来源链接无法创建：${inspected.error}，请重新打开 PDF 后重试。`)
  return uri
}
