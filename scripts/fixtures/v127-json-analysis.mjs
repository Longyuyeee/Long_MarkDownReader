// Browser fixture only: IPC is explicitly simulated. Production parsing is Rust.
export function fixtureJsonAnalysis(content){
 const byte=i=>new TextEncoder().encode(content.slice(0,i)).length,tokens=[],paths=[]
 const lex=/\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/gy
 let pos=0,comments=0
 try{
  while(pos<content.length){lex.lastIndex=pos;const m=lex.exec(content);if(!m)throw Error('invalid fixture JSON');pos=lex.lastIndex;if(/^\s|^\//.test(m[0])){if(m[0][0]==='/')comments++;continue}tokens.push({text:m[0],start:m.index,end:pos})}
  let i=0
  const value=(path,depth,index,key)=>{
   const token=tokens[i++];if(!token)throw Error('missing value')
   const kind=token.text==='{'?'object':token.text==='['?'array':token.text[0]==='"'?'string':token.text==='null'?'null':/true|false/.test(token.text)?'boolean':'number'
   const node={path,label:index===undefined?(key?JSON.parse(key.text):'根'):`[${index}]`,kind,depth,childCount:0,start:byte(token.start),end:byte(token.end),arrayIndex:index,keyStart:key&&byte(key.start),keyEnd:key&&byte(key.end),line:1,column:token.start+1,preview:''};paths.push(node)
   if(kind==='object'||kind==='array'){
    const close=kind==='object'?'}':']'
    while(tokens[i]?.text!==close){
     if(node.childCount){if(tokens[i++]?.text!==',')throw Error('missing comma');if(tokens[i]?.text===close)break}
     if(kind==='object'){const key=tokens[i++];if(key?.text[0]!=='"'||tokens[i++]?.text!==':')throw Error('bad property');const name=JSON.parse(key.text);value(path+'.'+name,depth+1,undefined,key)}
     else value(path+'['+node.childCount+']',depth+1,node.childCount)
     node.childCount++
    }
    const end=tokens[i++];if(end?.text!==close)throw Error('missing close');node.end=byte(end.end)
   }
   node.preview=new TextDecoder().decode(new TextEncoder().encode(content).slice(node.start,node.end)).slice(0,120)
  }
  value('$',1);if(i!==tokens.length)throw Error('extra tokens')
  return{valid:true,mode:'json',rootKind:paths[0].kind,nodeCount:paths.length,propertyCount:paths.filter(p=>p.keyStart!==undefined).length,maxDepth:Math.max(...paths.map(p=>p.depth)),commentCount:comments,duplicateKeyCount:0,precisionSensitiveNumberCount:content.includes('9007199254740993123456789')?1:0,structureEditCandidate:!content.includes('9007199254740993123456789'),paths,pathsTruncated:false,diagnostics:[]}
 }catch(error){return{valid:false,paths:[],diagnostics:[{severity:'error',message:String(error),start:0,end:1,line:1,column:1}],structureEditCandidate:false}}
}
export function fixtureMove(args){
 const a=fixtureJsonAnalysis(args.content),entry=a.paths.find(p=>p.start===args.start&&p.end===args.end),parent=a.paths.find(p=>p.kind==='array'&&p.depth===entry.depth-1&&p.start<entry.start&&p.end>entry.end),other=a.paths.find(p=>p.depth===entry.depth&&p.arrayIndex===entry.arrayIndex+args.direction&&p.start>parent.start&&p.end<parent.end)
 if(!other)throw Error('数组边界')
 const b=new TextEncoder().encode(args.content),decode=(start,end)=>new TextDecoder().decode(b.slice(start,end)),left=entry.start<other.start?entry:other,right=entry.start<other.start?other:entry,gap=decode(left.end,right.start)
 if(gap.replace(/[\s,]/g,''))throw Error('相邻数组项之间存在注释，无法确定注释归属')
 const content=decode(0,left.start)+decode(right.start,right.end)+gap+decode(left.start,left.end)+decode(right.end),start=args.direction===-1?left.start:left.start+right.end-right.start+right.start-left.end
 return{content,start,end:start+entry.end-entry.start}
}
