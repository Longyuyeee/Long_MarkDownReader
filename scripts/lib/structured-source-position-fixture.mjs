export const positionModes=['json','yaml','xml','toml']
export const positionSource=(mode,label='原稿')=>{
 const fields=Array.from({length:100},(_,index)=>['field'+String(index).padStart(3,'0'),label+' '+index+' 保留😀'])
 if(mode==='json')return JSON.stringify(Object.fromEntries(fields),null,2)+'\n'
 if(mode==='xml')return '<root>\n'+fields.map(([k,v])=>'  <'+k+'>'+v+'</'+k+'>').join('\n')+'\n</root>\n'
 return fields.map(([k,v])=>k+(mode==='yaml'?': ':' = ')+JSON.stringify(v)).join('\n')+'\n'
}
export const positionDraft=mode=>positionSource(mode,'我的草稿')
