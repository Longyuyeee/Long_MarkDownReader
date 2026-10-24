// Browser fixture only: limited assignment grammar for UI ownership tests.
// Production spans, TOML grammar, ownership and byte preservation are tested in Rust/native.
export {fixtureTomlReplace} from './v129-toml-analysis.mjs'
const keyPath=(parent,key)=>/^[A-Za-z0-9_-]+$/.test(key)?(parent?parent+'.':'')+key:parent+'['+JSON.stringify(key)+']'
export function fixtureTomlKeyAnalysis(content){
 const outline=[],byte=i=>new TextEncoder().encode(content.slice(0,i)).length;let parent='',offset=0
 for(const line of content.split('\n')){
  const table=line.trim().match(/^\[([^\]]+)\]$/)
  if(table)parent=table[1]
  const m=line.match(/^(\s*)("(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_-]+)\s*=\s*(.*)$/)
  if(m){const raw=m[2],name=raw.startsWith('"')?JSON.parse(raw):raw.startsWith("'")?raw.slice(1,-1):raw,index=line.indexOf(m[3]),value=m[3].replace(/\s+#.*$/,'').trimEnd(),start=byte(offset+index),editable=!value.startsWith('{')&&!value.startsWith('[')&&!/^\d{4}-\d\d-/.test(value)
   outline.push({path:keyPath(parent,name),label:name,kind:'value',depth:parent?1:0,preview:value,start,end:byte(offset+index+value.length),line:1,column:index+1,editable,field:{name,start:byte(offset+m[1].length),end:byte(offset+m[1].length+raw.length)},parent})
  }
  offset+=line.length+1
 }
 return{valid:!content.includes('INVALID'),outline,outlineTruncated:false,diagnostics:[],tableCount:2,arrayOfTablesCount:0,valueCount:outline.length,maxDepth:1}
}
export function fixtureTomlRename({content,start,end,name}){
 const entries=fixtureTomlKeyAnalysis(content).outline,entry=entries.find(e=>e.field.start===start&&e.field.end===end)
 if(!entry||!name)throw Error('请输入字段名，或重新选择字段')
 if(entries.some(e=>e!==entry&&e.parent===entry.parent&&e.field.name===name))throw Error('字段名已存在；输入与草稿仍保留')
 const bytes=new TextEncoder().encode(content),dec=b=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(b),raw=dec(bytes.slice(start,end)),bare=/^[A-Za-z0-9_-]+$/.test(name)
 const replacement=raw.startsWith("'")&&!name.includes("'")&&!/[\x00-\x1f\x7f]/.test(name)?"'"+name+"'":raw.startsWith('"')||raw.startsWith("'")||!bare?JSON.stringify(name):name
 return{content:dec(bytes.slice(0,start))+replacement+dec(bytes.slice(end)),start,end:start+new TextEncoder().encode(replacement).length}
}
