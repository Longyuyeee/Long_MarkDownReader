import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=fs.readFileSync('src/views/WorkbookView.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast=ts.createSourceFile('WorkbookView.ts',source,ts.ScriptTarget.Latest,true),names=new Set(['commitFormulaInput','applyBatchInputs']),functions=[]
for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(names.has(declaration.name.getText(ast)))functions.push('const '+declaration.name.getText(ast)+' = '+declaration.initializer.getText(ast))
if(functions.length!==2)throw Error('Actual source functions not found')
const errors=[],drafts={value:new Map()},undoStack={value:[]},redoStack={value:[]},sourceCell={kind:'text',value:'是'},selection={sheet:'Sheet1',row:0,column:0}
const context={saving:{value:false},selectedCell:{value:selection},selectedEditable:{value:true},formulaInput:{value:'不在列表'},drafts,undoStack,redoStack,MAX_BATCH_CELLS:10000,sheetInfo:{value:{totalRows:1}},loadedRows:{value:new Set([0])},arrayFormulaAt:()=>null,sourceCellAt:()=>sourceCell,cellAt:()=>sourceCell,originalInput:cell=>cell.value,editKey:()=> 'Sheet1:0:0',validationAt:()=>({kind:'list',showErrorMessage:true,formula1:'"是,否"',error:'列表不允许此值'}),literalValidationOptions:()=>['是','否'],message:{error:value=>errors.push(value)},inferEdit:(selection,input)=>({...selection,input,kind:'string'}),setDraft:(key,edit)=>drafts.value.set(key,edit),invalidateCalculation:()=>{},validateWorkbookInput:()=>{}}
const code=ts.transpileModule(functions.join('\n')+'\ncommitFormulaInput();globalThis.single={errors:[...messageErrors],drafts:drafts.value.size};applyBatchInputs(selectedCell.value,[[formulaInput.value]]);globalThis.batch={drafts:drafts.value.size,input:[...drafts.value.values()][0]?.input};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
context.messageErrors=errors;vm.runInNewContext(code,context)
const report={method:'Actual TypeScript function bodies isolated with simulated cell/context; not a native or installed acceptance test',source:'src/views/WorkbookView.vue',rule:'literal list: 是,否, showErrorMessage=true',input:'不在列表',single:context.single,batch:context.batch,conclusion:'Single-cell formula-bar entry refuses the value; batch paste planning accepts it into the draft. No real workbook was read or written.'}
fs.writeFileSync('docs/evidence/recent-20-versions-audit-2026-10-21/workbook-input-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
