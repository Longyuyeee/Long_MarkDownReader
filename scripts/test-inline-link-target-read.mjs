import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {markdownSections} from '../src/utils/markdownSections.ts'
const component=readFileSync('src/components/InlineLinkRepairDialog.vue','utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1],ast=ts.createSourceFile('InlineLinkRepairDialog.ts',component,ts.ScriptTarget.Latest,true),verify=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='verify').getText(ast)
function fixture(tabs=[],fragment='本周任务',format='markdown'){
 const calls=[],context={props:{request:{root:'C:/lib'}},store:{tabs},fragment,findFileFormat:()=>({id:format}),sameWorkspacePath:(a,b)=>a.toLowerCase()===b.toLowerCase(),toCollectionRelativePath:(root,path)=>assert.ok(path.startsWith(root+'/')),markdownSections,invoke:async(command,args)=>{calls.push({command,args});assert.equal(args.libraryRoot,'C:/lib','real native libraryRoot is required');assert.equal(args.path,'C:/lib/目标.md');if(command==='read_text_document'){assert.equal(args.formatId,'markdown','real native formatId is required');return{content:'# 本周任务\n'}}return{is_file:true}}}
 vm.runInNewContext(ts.transpileModule(verify+'\nglobalThis.verify=verify',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
 return{calls,verify:()=>context.verify('C:/lib/目标.md')}
}
test('real dialog target read supplies native root, format and an open target encoding',async()=>{
 const f=fixture([{path:'C:/LIB/目标.md',isDirty:false,textReadEncoding:'gbk'}]);assert.equal(await f.verify(),'本周任务');assert.equal(f.calls.length,2);assert.equal(f.calls[1].args.readOptions.encoding,'gbk')
})
test('real dialog checks file availability but uses the target draft without reading an older disk body',async()=>{
 const f=fixture([{path:'C:/lib/目标.md',isDirty:true,content:'# 本周任务\n'}]);assert.equal(await f.verify(),'本周任务');assert.deepEqual(f.calls.map(c=>c.command),['get_file_stats']);assert.equal(await fixture([], 'missing').verify(),'');assert.equal(await fixture([], '本周任务','text').verify(),'')
})
