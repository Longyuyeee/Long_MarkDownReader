import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
import {collectionReuseFixture as fixture} from './lib/collection-reuse-fixture.mjs'
import {collectionReuseChecks,validateInstalledCollectionReuse,assertCollectionReuseOutputBytes} from './lib/installed-v1-1-27-evidence.mjs'
test('collection reuse requires native identities, complete scope tasks and exact original/delivery bytes',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),directory='000-v1127-reuse-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/来源',target='C:/LongEditR5ILibrary/'+directory.split('/')[0]+'/目标项目',collections=[{name:'复用',query:'预算',objectTypes:['markdown'],filters:{directory,tag:'工作',modifiedWithinDays:7}},{name:'复用',query:'__longedit_graph_collection__',objectTypes:[],graphRoot:directory+'/一已保存.md',graphDepth:2}],bundle={kind:'longedit-collections',schemaVersion:1,collections},bytes=new Map([['installed-v1127-conditions.json',Buffer.from(JSON.stringify(bundle))],['installed-v1127-input.json',Buffer.from(JSON.stringify({...bundle,collections:[...collections,{name:'失效',query:'预算',objectTypes:['unavailable-format']}]}))],['installed-v1127-saved.md',Buffer.from(fixture.savedAfter)],['installed-v1127-dirty.md',Buffer.from(fixture.dirty)],['installed-v1127-center.md',Buffer.from(fixture.center)]])
 const manifest={appVersion:'1.1.27',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-trusted-input-native-conditions-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,nativeFileDialogsAutomated:false,errorOverlay:false,checks:collectionReuseChecks.map(id=>({id,status:'passed'})),inputTrace:['pointerdown','click','keydown','input'].map(type=>({type,trusted:true})),runtimeErrors:[],added:[{...collections[0],libraryPath:target,filters:{...collections[0].filters,directory:'项目'}},{...collections[1],name:'复用（导入1）',libraryPath:target,graphRoot:'中心.md'}],outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:hash(b)})),expectedBytes:{saved:hash(Buffer.from(fixture.savedAfter)),dirty:hash(Buffer.from(fixture.dirty)),center:hash(Buffer.from(fixture.center))}}
 for(const key of ['portableExact','cancelTagExact','tagExact','dirtyExact','historyExact','cancelImportExact','remapExact','originalCollectionsExact','documentsExact','otherDraftsPreserved'])report[key]=true
 validateInstalledCollectionReuse(report,manifest);assertCollectionReuseOutputBytes(report,name=>bytes.get(name))
 for(const mutate of [r=>r.checks.pop(),r=>r.dirtyExact=false,r=>r.nativeBridgeMocked=true,r=>r.added[0].filters.tag='',r=>r.inputTrace[0].trusted=false]){const c=structuredClone(report);mutate(c);assert.throws(()=>validateInstalledCollectionReuse(c,manifest))}
 assert.throws(()=>assertCollectionReuseOutputBytes(report,name=>name.endsWith('dirty.md')?Buffer.from('lost original'):bytes.get(name)))
})
test('native driver expressions are valid and collection reuse remains required before publication',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-27-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true'])assert.ok(!source.includes(forbidden))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertCollectionReuseOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1127Workflow'))
})
