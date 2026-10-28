// Explicitly simulated IPC analysis for real Vue/CodeMirror interaction tests.
export function outlineNavigationAnalysis(content,mode){
 const size=s=>new TextEncoder().encode(s).length, root={path:mode==='xml'?'/root[1]':'$',label:'root',name:'root',kind:mode==='json'?'object':'mapping',depth:0,start:0,end:size(content),childCount:3,preview:'',documentIndex:0,line:1,column:1,attributeCount:0}
 // Match the production JSON analyser: container previews include child names.
 if(mode==='json')root.preview=content.replace(/\s+/g,' ').trim()
 const entries=[]
 for(const name of ['first','second','third']){
  const expression=mode==='json'?new RegExp('"'+name+'"\\s*:\\s*("[^"\\n]*")'):mode==='xml'?new RegExp('<'+name+'>[\\s\\S]*?</'+name+'>'):new RegExp('^'+name+'\\s*[:=]\\s*(.*)$','m')
  const match=expression.exec(content);if(!match)continue
  const part=mode==='xml'?match[0]:match[1],index=match.index+match[0].lastIndexOf(part),start=size(content.slice(0,index)),end=start+size(part)
  entries.push({...root,path:mode==='json'?'$.'+name:mode==='yaml'?'$.'+name:mode==='xml'?'/root[1]/'+name+'[1]':name,label:name,name,kind:'string',depth:1,start,end,childCount:0,preview:part,field:mode==='xml'?undefined:{name,start:size(content.slice(0,match.index)),end:size(content.slice(0,match.index+name.length))}})
 }
 return{valid:entries.length>0,mode,rootKind:'object',nodeCount:4,propertyCount:3,maxDepth:2,commentCount:0,duplicateKeyCount:0,precisionSensitiveNumberCount:0,structureEditCandidate:true,paths:[root,...entries],pathsTruncated:false,outline:mode==='toml'?entries:[root,...entries],outlineTruncated:false,diagnostics:[],documentCount:1,mappingCount:1,sequenceCount:0,scalarCount:3,aliasCount:0,anchorCount:0,taggedNodeCount:0,blockScalarCount:0,rootName:'root',elementCount:4,attributeCount:0,namespaceCount:0,cdataCount:0,processingInstructionCount:0,doctypeCount:0,tableCount:0,keyCount:3,arrayCount:0}
}
