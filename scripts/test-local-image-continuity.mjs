import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import test from 'node:test'
const compile=(file,dependencies={},globals={})=>{const context={exports:{},require:name=>{assert.ok(name in dependencies,name);return dependencies[name]},...globals};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports}
const paths=compile('src/utils/localImagePath.ts')
test('moved local images resolve parent segments, encoded names, suffixes and Windows device paths',()=>{
 for(const [document,reference,expected] of [
  ['C:/Lib/notes/a.md','../assets/pic.png','C:/Lib/assets/pic.png'],
  ['\\\\?\\C:\\Lib\\notes\\a.md','../assets/%E5%9B%BE%20image.png?size=2#view','C:/Lib/assets/图 image.png'],
  ['C:/Lib/a.md','images/hash%23percent%25.png','C:/Lib/images/hash#percent%.png'],
  ['\\\\?\\UNC\\server\\share\\notes\\a.md','../images/pic.png','//server/share/images/pic.png'],
  ['/Lib/Notes/a.md','../Images/pic.png','/Lib/Images/pic.png'],
  ['C:/Lib/a.md','misty-img://localhost/C%3A%2FLib%2Fpic.png','C:/Lib/pic.png'],
  ['C:/Lib/a.md','\\\\?\\C:\\Lib\\pic.png','C:/Lib/pic.png'],
 ])assert.equal(paths.resolveLocalImagePath(document,reference),expected)
 for(const reference of ['https://example.com/a.png','data:image/png;base64,AA','../../../escape.png','bad%escape.png'])assert.equal(paths.resolveLocalImagePath('C:/Lib/a.md',reference),null)
})
function fixture(invoke) {
 let file='C:/Lib/notes/a.md',raw='../assets/pic.png';const revoked=[],created=[],warnings=[]
 const img={dataset:{},srcset:'',isConnected:true,getAttribute:name=>name==='src'?raw:null,removeAttribute:name=>{if(name==='srcset')img.srcset=''}}
 const element={querySelectorAll:()=>[img]},api=compile('src/composables/useImageFix.ts',{'@tauri-apps/api/core':{invoke},'../utils/localImagePath':paths},{MutationObserver:class{observe(){}disconnect(){}},URL:{createObjectURL:blob=>{created.push(blob);return 'blob:owned-'+created.length},revokeObjectURL:url=>revoked.push(url)},Blob,Uint8Array,atob,console:{warn:(...args)=>warnings.push(args)},setTimeout,clearTimeout})
 const fix=api.useImageFix(()=>({vditor:{wysiwyg:{element},element}}),()=>file,{libraryRoot:()=> 'C:/Lib'})
 return {fix,img,created,revoked,warnings,setFile:value=>file=value,setSource:value=>raw=value,raw:()=>raw}
}
const image='data:image/png;base64,aW1hZ2U='
test('local image display leaves the Markdown destination intact and releases rendered resources',async()=>{
 const calls=[],f=fixture(async(command,args)=>{calls.push({command,args});return image})
 await f.fix.fixEditorImages();assert.equal(calls[0].args.path,'C:/Lib/assets/pic.png');assert.equal(f.raw(),'../assets/pic.png');assert.equal(f.img.srcset,'blob:owned-1')
 await f.fix.fixEditorImages();assert.equal(calls.length,1)
 f.setSource('https://example.com/other.png');await f.fix.fixEditorImages();assert.equal(f.img.srcset,'');assert.deepEqual(f.revoked,['blob:owned-1'])
 f.fix.destroyImageFix()
})
test('a late native image response never paints a different document',async()=>{
 let resolve;const f=fixture(()=>new Promise(done=>resolve=done)),pending=f.fix.fixEditorImages();f.setFile('C:/Lib/other.md');resolve(image);await pending;assert.equal(f.created.length,0);assert.equal(f.img.srcset,'');f.fix.destroyImageFix()
})
test('a failed replacement removes the old picture without changing the new source text',async()=>{
 let failed=false;const f=fixture(async()=>{if(failed)throw Error('missing image');return image});await f.fix.fixEditorImages();failed=true;f.setSource('../assets/missing.png');await f.fix.fixEditorImages();assert.equal(f.img.srcset,'');assert.equal(f.raw(),'../assets/missing.png');assert.equal(f.warnings.length,1);f.fix.destroyImageFix()
})
