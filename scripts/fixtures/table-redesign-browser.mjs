import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NConfigProvider,NDialogProvider,NMessageProvider} from 'naive-ui'
import TableView from '/src/views/TableView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const config={filter:'',sortDirection:'asc',frozenColumns:0,columnWidths:[200,160,140],groupBy:'status',titleColumn:'task',cardColumns:['amount'],categoryColumn:'status',valueColumn:'amount',aggregation:'sum',chartType:'bar',nullStrategy:'skip',showLegend:true,dashboardItems:[{chartViewId:'chart',width:12}]}
const views=['grid','board','chart','dashboard'].map((kind,i)=>({id:kind,name:['表格','看板','图表','仪表盘'][i],kind,config:structuredClone(config)}))
const disk={path:'项目.table',format:'longedit-table',delimiter:',',encoding:'utf-8',hasBom:false,lineEnding:'lf',signature:'fixture',headers:['任务','状态','金额'],rows:[['确认交付','待处理','12'],['检查文档','已完成','20']],columnTypes:['text','text','number'],columnIds:['task','status','amount'],rowIds:['r1','r2'],view:config,views,activeView:'grid'}
window.tableUiAudit={calls:[]}
window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
 window.tableUiAudit.calls.push({command,args})
 if(command==='read_table_file')return structuredClone(disk)
 throw Error('Unexpected Table UI IPC: '+command)
}}
const pinia=createPinia(),store=useAppStore(pinia)
store.activeLibraryPath='isolated';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/table',component:TableView}]})
await router.push('/table?path=项目.table.json')
const app=createApp({render:()=>h(NConfigProvider,{},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))})
app.use(pinia).use(router).mount('#app')
document.documentElement.dataset.theme='white';document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh';document.querySelector('.n-config-provider').style.height='100%'
