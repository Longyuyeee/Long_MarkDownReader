// Production TableView. Native persistence is explicitly simulated, not installed evidence.
import {createApp,h,computed,watch} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createWebHashHistory,RouterView} from 'vue-router'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import TableView from '/src/views/TableView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import {getThemeTone,isDarkTheme,resolveThemeName} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
const params=new URLSearchParams(location.search),theme=params.get('theme')||'white'
const view={filter:'',sortDirection:'asc',frozenColumns:0,columnWidths:[230,190,190],cardColumns:[],groupBy:'state',titleColumn:'task',categoryColumn:'state',valueColumn:'code',aggregation:'count',chartType:'bar',nullStrategy:'skip',showLegend:true,dashboardItems:[]}
const rows=[['确认交付','待处理','00123'],['核对合同','隐藏','9007199254740993123'],['检查文档','待处理','2026-10-18'],['发送报告','已完成','=SUM(A1:A2)']]
const count=Number(params.get('rows')||4);for(let i=4;i<count;i++)rows.push(['任务 '+i,'待处理',String(i).padStart(6,'0')])
const disk={path:'任务清单.csv',format:params.get('format')==='table'?'longedit-table':'csv',delimiter:',',encoding:'utf-8',hasBom:true,lineEnding:'crlf',signature:'fixture-0',headers:['任务','状态','编号'],rows,columnTypes:['text','text','text'],columnIds:['task','state','code'],rowIds:rows.map((_,i)=>'row-'+i),view,views:['grid','board','chart','dashboard'].map(kind=>({id:kind,name:({grid:'表格',board:'看板',chart:'图表',dashboard:'仪表盘'})[kind],kind,config:structuredClone(view)})),activeView:'grid'}
const audit=window.tableBulkAudit={disk,writes:[],pending:null,failNext:false,deferred:false,reads:0,trace:[],calls:[]}
if(params.get('fill')==='1'){
 Object.assign(disk,{headers:['任务','状态','编号','范围'],columnIds:['task','state','code','scope'],columnTypes:['text','text','integer','text'],rows:[['','待处理','00123','可见'],['隐藏记录','隐藏','9007199254740993123','隐藏'],['已有备注','','00002','可见'],['保持','已完成','=SUM(A1:A2)','其他']],rowIds:['row-0','row-1','row-2','row-3'],validationRules:{state:{kind:'options',required:true,options:['待处理','已完成']}}})
 disk.view.columnWidths=[180,180,220,150];for(const v of disk.views)v.config.columnWidths=[180,180,220,150]
}
if(params.get('row')==='1')disk.rows[0][0]='复用\r\n记录'
if(params.get('column')==='1'){
 disk.view.frozenColumns=1
 for(const [index,v]of disk.views.entries()){v.config.columnWidths=disk.columnIds.map((_,c)=>120+index*20+c*30);v.config.frozenColumns=1;v.config.groupBy='state';v.config.titleColumn='task';v.config.cardColumns=['code'];v.config.categoryColumn='state';v.config.valueColumn='code'}
 disk.view=structuredClone(disk.views[0].config)
}
document.addEventListener('paste',event=>audit.trace.push({type:event.type,trusted:event.isTrusted}),true)
window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
 audit.calls.push(command)
 if(command==='read_table_file'){audit.reads++;return structuredClone(audit.disk)}
 if(command==='write_table_file'){
  const payload=structuredClone(args.payload);audit.writes.push(payload)
  const finish=()=>{if(audit.failNext){audit.failNext=false;throw Error('磁盘写入失败，草稿保留')}Object.assign(audit.disk,payload,{signature:'fixture-'+audit.writes.length});return{signature:audit.disk.signature,size:256}}
  if(!audit.deferred)return finish()
  return new Promise((resolve,reject)=>{audit.pending=()=>{audit.pending=null;try{resolve(finish())}catch(error){reject(error)}}})
 }
 throw Error('Unexpected isolated Table IPC: '+command)
}}
const pinia=createPinia(),store=useAppStore(pinia);store.activeLibraryPath='isolated';store.configReady=true;store.motionSpeed='normal';store.theme=theme;store.visualStyle='soft';audit.store=store
const systemDark=params.get('dark')==='1'
watch(()=>store.theme,value=>{document.body.dataset.theme=resolveThemeName(value,systemDark);document.body.classList.toggle('is-dark',isDarkTheme(value,systemDark))},{immediate:true})
watch(()=>store.visualStyle,value=>document.body.dataset.style=value,{immediate:true})
const overrides=computed(()=>{const tone=getThemeTone(store.theme,systemDark).ui,radius=VISUAL_STYLE_RADII[store.visualStyle];return{common:{primaryColor:tone.primary,primaryColorHover:tone.primary,primaryColorPressed:tone.primary,textColor1:tone.text,textColor2:tone.text+'c7',textColor3:tone.text+'8f',borderColor:tone.text+'26',cardColor:tone.surface,modalColor:tone.surface,popoverColor:tone.surface,bodyColor:'transparent',borderRadius:radius.normal,borderRadiusSmall:radius.small}}})
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/table',component:TableView},{path:'/library',component:{render:()=>h('button',{onClick:()=>router.push('/table?path=任务清单.csv')},'重新打开表格')}}]})
audit.router=router
await router.push('/table?path=任务清单.csv')
const app=createApp({render:()=>h(NConfigProvider,{theme:isDarkTheme(store.theme,systemDark)?darkTheme:null,themeOverrides:overrides.value},{default:()=>h(NDialogProvider,{},{default:()=>h(NMessageProvider,{},{default:()=>h(RouterView)})})})})
app.use(pinia).use(router).mount('#app')
document.documentElement.dataset.theme=theme;document.body.dataset.motion='normal';document.body.style.margin='0';document.getElementById('app').style.height='100vh';document.querySelector('.n-config-provider').style.height='100%'
