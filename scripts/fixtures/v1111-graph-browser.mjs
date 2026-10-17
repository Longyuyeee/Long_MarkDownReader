// Production GraphView, simulated IPC and isolated generated data. Never native proof.
import {createApp,h,nextTick,ref,watch} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory} from 'vue-router'
import * as naive from 'naive-ui'
import GraphView from '/src/components/GraphView.vue'
import {useAppStore} from '/src/store/app.ts'
import {registerNaiveComponents} from '/src/services/naiveComponents.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const params=new URLSearchParams(location.search),count=Number(params.get('count')||180),kind=params.get('kind')||'connected'
if(![12,180,540,1200].includes(count))throw Error('Unexpected generated fixture size')
const pinia=createPinia(),store=useAppStore(pinia),show=ref(true),calls=[],pending=[]
const rootA='C:/graph-a',rootB='C:/graph-b'
const graphFor=root=>({nodes:Array.from({length:count},(_,i)=>({id:'n'+i,title:(root===rootB?'另一资料库 · ':'')+['项目方案与长期研究记录','会议纪要与行动清单','阅读摘录与来源核对'][i%3]+' · '+i,path:root+'/资料'+i+'.md',size:8+i%16,tags:[i%2?'研究':'项目'],directory:'',modifiedAt:1800000000,objectType:['markdown','pdf','table','image'][i%4],searchText:'项目 研究 '+i})),edges:kind==='orphans'?[]:Array.from({length:count*2},(_,i)=>({source:'n'+Math.floor(i/2),target:'n'+((Math.floor(i/2)+(i%2?7:1))%count),relationType:i%2?'related':'links-to',directed:i%2===0,mentions:[]}))})
const graphs=new Map([[rootA,graphFor(rootA)],[rootB,graphFor(rootB)]])
const audit=window.graphAudit={calls,pending,graphs,store,setVisible:value=>{show.value=value},refresh:async()=>{show.value=false;await nextTick();show.value=true;await nextTick()},switchRoot:root=>{store.activeLibraryPath=root},deferNext:false,failNext:false,resolve:(index,fail=false)=>{const item=pending[index];if(!item)throw Error('Unknown deferred request');fail?item.reject(Error('测试资料库暂时不可访问')):item.resolve(structuredClone(graphs.get(item.root)))}}
if(params.has('deferInitial'))audit.deferNext=true
window.__m3c2Profiler={enabled:true,phases:{},workerPhases:{}}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(params.has('health')&&command==='analyze_graph_health')return {scannedNotes:count,brokenLinks:[],ambiguousLinks:[],orphanNotes:[]}
 if(params.has('health')&&command==='get_knowledge_graph_pulse'){
  const node=graphs.get(args.libraryRoot).nodes[17]
  return {objectCount:count,relationCount:count*2,connectedObjectCount:count,isolatedObjectCount:0,coveragePercent:100,relationTypes:[{relationType:'links-to',count:count*2}],topNodes:[{id:node.id,title:node.title,objectType:node.objectType,relationCount:4}],isolatedNodes:[],guidance:[]}
 }
 if(command==='build_link_graph'){
  if(audit.deferNext){audit.deferNext=false;return new Promise((resolve,reject)=>pending.push({root:args.libraryRoot,resolve,reject}))}
  if(audit.failNext){audit.failNext=false;throw Error('测试资料库暂时不可访问')}
  if(!graphs.has(args.libraryRoot))throw Error('Fixture root not configured')
  return structuredClone(graphs.get(args.libraryRoot))
 }
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|')||command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'graph-audit'
 throw Error('Unexpected graph fixture IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
const positions=Object.fromEntries(Array.from({length:count},(_,i)=>['n'+i,{x:(i%18)*64,y:Math.floor(i/18)*64}]))
localStorage.setItem('longedit.graph.layouts.v1',JSON.stringify({version:1,layouts:Object.fromEntries([rootA,rootB].map(root=>[root+'\nnetwork:force',{updatedAt:Date.now(),positions}]))}))
store.activeLibraryPath=rootA;store.configReady=true;store.motionSpeed='normal';store.theme=params.get('theme')||'white'
watch(()=>store.theme,value=>{document.body.dataset.theme=value;document.body.classList.toggle('is-dark',value==='dark')},{immediate:true})
watch(()=>store.visualStyle,value=>{document.body.dataset.style=value},{immediate:true})
watch(()=>store.motionSpeed,value=>{document.body.dataset.motion=value},{immediate:true})
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/graph',name:'Graph',component:GraphView},{path:'/library',name:'LibraryMode',component:{render:()=>h('div','资料库')}}]})
await router.push(params.has('health')?'/graph?focus=overview':'/graph')
audit.router=router
document.body.dataset.theme=store.theme;document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(GraphView,{show:show.value})))})
registerNaiveComponents(app);app.use(pinia).use(router).mount('#app');await nextTick()
audit.unmount=()=>app.unmount()
// Proposal-only chrome. It is not part of GraphView and never used by acceptance.
if(params.has('proposal')){
 const button=document.createElement('button');button.className='graph-tools-entry';button.textContent='刷新';button.disabled=true;document.querySelector('.graph-controls').append(button)
 const state=document.createElement('span');state.textContent='刷新失败，已保留当前图谱';state.style.cssText='color:var(--theme-text);white-space:nowrap;display:flex;align-items:center;gap:8px'
 const retry=document.createElement('button');retry.textContent='重试';retry.style.cssText='background:var(--theme-card);color:var(--theme-primary);border:1px solid var(--workspace-border-color);border-radius:5px;padding:3px 9px';state.append(retry);document.querySelector('.graph-stats').append(state)
}
