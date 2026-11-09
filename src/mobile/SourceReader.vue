<template>
  <section class="source-reader" aria-label="分段源码阅读">
    <MobileReadingPosition v-if="positionError" :kind="positionError" :busy="positionBusy||retrying" @retry="retryPosition" />
    <div ref="viewport" class="source-page-content" role="document" tabindex="0" @scroll.passive="scrolled" @pointerdown="activity++" @touchstart.passive="activity++" @keydown="activity++"><div class="source-page-text"><p v-for="part in fragments" :key="part.from" :data-source-from="part.from" class="source-fragment">{{ part.before }}<mark v-if="part.hit">{{ part.hit }}</mark>{{ part.after }}</p></div></div>
    <p v-if="message" class="source-reading-message" role="status">{{ message }}</p>
    <SourcePager :page="page" :pages="pages.length" @move="move" @jump="openJump" />
    <MobileSourcePageDialog :open="jumpOpen" :name="title||'长文阅读'" :page="page+1" :pages="pages.length" @close="closeJump" @goto="jump" />
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {findDocumentMatches,sourceFragments,sourcePages,type DocumentMatch,type DocumentMatches} from './documentBudget'
import {createStorage,type Storage} from './storage'
import {createSourceReadingSession,type SourceReadingPhase} from './sourceReadingRepository'
import type {SourceBookmark,SourceRange,QuerySelection} from './sourceReadingState'
import {sourceSelection,restoreSourceSelection} from './sourceReadingDom'
import {registerSourceReader,trackSourceWrite,reportSourcePositionFailure,settleSourceWrites} from './sourceReadingNavigation'
import {canFocus} from './accessibility'
import SourcePager from './SourcePager.vue'
import MobileSourcePageDialog from './MobileSourcePageDialog.vue'
import MobileReadingPosition from './MobileReadingPosition.vue'
const props=defineProps<{content:string;identity:string;fingerprint:string;reason:string;query:string;storage?:Storage;title?:string;queryInput?:HTMLInputElement}>()
const emit=defineEmits<{matches:[value:DocumentMatches];'restore-query':[value:{query:string;selection:QuerySelection|null} ]}>()
const pages=sourcePages(props.content),page=ref(0),viewport=ref<HTMLElement>(),message=ref(''),active=ref<DocumentMatch|null>(null),jumpOpen=ref(false),positionError=ref<''|'read'|'save'>(''),positionBusy=ref(false),retrying=ref(false)
const fragments=computed(()=>sourceFragments(props.content,pages[page.value]!,active.value))
let alive=true,ready=false,restoring=false,restoringQuery=false,layoutPending=false,activity=0,positionDirty=false,viewEpoch=0,transition=Promise.resolve(),timer:ReturnType<typeof setTimeout>|undefined,opener:HTMLElement|undefined,selection:SourceRange|null=null,lastCaptured:SourceBookmark|null=null,matches:DocumentMatch[]=[],current=-1,truncated=false,searchedQuery='',controller:AbortController|undefined,unregister:()=>void=()=>{},lastExit:{key:string;promise:Promise<boolean>}|undefined
function phase(value:SourceReadingPhase){if(!alive)return;positionBusy.value=value==='loading'||value==='saving';if(value==='read-error')positionError.value='read';if(value==='save-error')positionError.value='save'}
const session=createSourceReadingSession(props.identity,props.storage||createStorage(),phase,undefined,point=>{if(!point||point.fingerprint!==props.fingerprint)return;const range=pages.find(p=>p.from===point.offset);if(!range)throw Error('上次分段位置无法核对。');if(point.selection&&(point.selection.from<range.from||point.selection.to>range.to)||point.match&&point.match.to>props.content.length)throw Error('上次选区无法核对。');if(point.anchor&&!sourceFragments(props.content,range,null).some(p=>p.from===point.anchor!.from))throw Error('上次原文锚点无法核对。')})
let cachedQuery:{query:string;querySelection:QuerySelection|null}|undefined
function queryState(){const input=props.queryInput,query=input?.value??props.query;if(query.length>128)throw Error('查找文字超过128个字符。');const querySelection=input?{start:input.selectionStart??0,end:input.selectionEnd??0,direction:input.selectionDirection??'none'} as QuerySelection:cachedQuery?.query===query?cachedQuery.querySelection:null;cachedQuery={query,querySelection};return cachedQuery}
function capture():SourceBookmark|null {
 const host=viewport.value;if(!host||!host.getClientRects().length)return lastCaptured&&structuredClone(lastCaptured)
 const selected=sourceSelection(host,pages[page.value]!.from);if(selected!==undefined)selection=selected
 const bounds=host.getBoundingClientRect(),part=[...host.querySelectorAll<HTMLElement>('[data-source-from]')].find(p=>p.getBoundingClientRect().bottom>bounds.top),box=part?.getBoundingClientRect(),state=queryState()
 const anchor=host.scrollTop>0&&part&&box&&box.height>0&&box.top<=bounds.top?{from:Number(part.dataset.sourceFrom),fraction:Math.max(0,Math.min(1,(bounds.top-box.top)/box.height))}:null
 const point:SourceBookmark={fingerprint:props.fingerprint,offset:pages[page.value]!.from,scroll:host.scrollTop,horizontal:host.scrollLeft/Math.max(1,host.scrollWidth-host.clientWidth),...state,match:state.query===searchedQuery?active.value&&{...active.value}:null,selection:selection&&{...selection},anchor,updated:Date.now()};lastCaptured=structuredClone(point);return point
}
function remember(point=capture()):Promise<boolean>{if(!ready||restoring||layoutPending||!point)return Promise.resolve(!positionDirty);return trackSourceWrite((async()=>{try{const saved=await session.save(point);if(saved&&alive)positionError.value='';return saved}catch{phase('save-error');return false}})())}
function schedule(){clearTimeout(timer);if(ready&&!restoring&&!layoutPending)timer=setTimeout(()=>void remember().catch(()=>phase('save-error')),150)}
function scrolled(){if(!restoring&&!layoutPending){activity++;positionDirty=true;schedule()}}
function selected(){if(restoring||layoutPending)return;const host=viewport.value;if(!host)return;const value=sourceSelection(host,pages[page.value]!.from);if(value!==undefined){selection=value;positionDirty=true;schedule()}}
function apply(index:number,scroll=0,anchor:SourceBookmark['anchor']=null,horizontal=0){const owner=++viewEpoch;layoutPending=true;transition=(async()=>{page.value=index;await nextTick();if(!alive||owner!==viewEpoch)return;const host=viewport.value;if(host){host.scrollTop=scroll;host.scrollLeft=horizontal*Math.max(0,host.scrollWidth-host.clientWidth);if(anchor){const part=host.querySelector<HTMLElement>(`[data-source-from="${anchor.from}"]`);if(part){const b=part.getBoundingClientRect();host.scrollTop+=b.top-host.getBoundingClientRect().top+b.height*anchor.fraction}}}await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));if(owner===viewEpoch)layoutPending=false})();return transition}
function clearSelection(){selection=null;const value=getSelection();if(value?.anchorNode&&viewport.value?.contains(value.anchorNode))value.removeAllRanges()}
async function move(index:number){if(!Number.isInteger(index)||index<0||index>=pages.length)return;activity++;positionDirty=true;message.value='';clearSelection();await apply(index);if(!alive)return;viewport.value?.focus({preventScroll:true});await remember()}
async function navigate(direction:number){if(!matches.length)return;activity++;positionDirty=true;const owner=controller;current=(current+direction+matches.length)%matches.length;active.value=matches[current]!;const index=pages.findIndex(r=>active.value!.from>=r.from&&active.value!.from<r.to);clearSelection();await apply(Math.max(0,index));if(!alive||owner!==controller||owner?.signal.aborted)return;viewport.value?.querySelector('mark')?.scrollIntoView({block:'center'});emitMatches();await remember()}
function emitMatches(){emit('matches',{count:matches.length,current:current+1,truncated})}
async function find(keep=false,wanted:DocumentMatch|null=null){controller?.abort();const owner=controller=new AbortController();const query=props.query;matches=[];current=-1;active.value=null;truncated=false;emit('matches',{count:0,current:0,truncated:false,pending:!!query});const result=await findDocumentMatches(props.content.length,(a,b)=>props.content.slice(a,b),query,owner.signal);if(!result||!alive||owner!==controller)return;matches=result.matches;truncated=result.truncated;searchedQuery=query;if(keep){current=wanted?matches.findIndex(m=>m.from===wanted.from&&m.to===wanted.to):-1;active.value=current>=0?matches[current]!:null;emitMatches();await nextTick()}else if(matches.length)await navigate(1);else{emitMatches();schedule()}}
async function restore(point:SourceBookmark|null){restoring=true;try{if(point&&point.fingerprint===props.fingerprint){restoringQuery=true;emit('restore-query',{query:point.query||'',selection:point.querySelection||null});await nextTick();restoringQuery=false;await find(true,point.match||null);if(!alive)return;selection=point.selection?{...point.selection}:null;await apply(pages.findIndex(p=>p.from===point.offset),point.scroll,point.anchor,point.horizontal);if(viewport.value)restoreSourceSelection(viewport.value,point.offset,selection)}else{if(point)message.value='内容已有变化，已从头打开。';await find();if(!matches.length)await apply(page.value)}}finally{restoringQuery=false;restoring=false}}
watch(()=>props.query,()=>{if(restoringQuery)return;activity++;positionDirty=true;if(ready&&!restoring)void find()})
async function retryPosition(){if(positionBusy.value||retrying.value)return;retrying.value=true;const revision=activity,wantsRestore=positionError.value==='read';try{const saved=await session.load();if(!alive)return;if(wantsRestore&&revision===activity)await restore(saved);ready=true;await flush()}catch{}finally{retrying.value=false}}
function openJump(target:HTMLElement){activity++;opener=target;void remember();jumpOpen.value=true}
function closeJump(focus=true){jumpOpen.value=false;if(focus)void nextTick(()=>{if(canFocus(opener))opener.focus({preventScroll:true})})}
function jump(n:number){closeJump(false);void move(n-1)}
function flush():Promise<boolean>{clearTimeout(timer);if(!ready){queryState();return Promise.resolve(!positionDirty)}const now=layoutPending?null:capture();const promise=(async()=>{await transition;if(restoring)return !positionDirty;const point=now||capture();return remember(point)})();lastExit={key:JSON.stringify(now&&{...now,updated:0}),promise};return promise}
onMounted(()=>{document.addEventListener('selectionchange',selected);unregister=registerSourceReader(flush);void(async()=>{const revision=activity;await settleSourceWrites();let saved:SourceBookmark|null=null;try{saved=await session.load()}catch{}if(!alive)return;if(revision===activity){if(props.query&&props.query!==(saved?.query||'')){await find();if(!matches.length)await apply(page.value)}else await restore(saved)}else await find();if(!alive)return;ready=true;await remember()})()})
onBeforeUnmount(()=>{const point=ready&&!layoutPending?capture():null,key=JSON.stringify(point&&{...point,updated:0});const job=lastExit&&lastExit.key===key?lastExit.promise:flush();void job.then(ok=>{if(!ok)reportSourcePositionFailure()}).catch(reportSourcePositionFailure);alive=false;viewEpoch++;controller?.abort();clearTimeout(timer);document.removeEventListener('selectionchange',selected);unregister();jumpOpen.value=false})
async function locate(offset:number){
  if(!Number.isInteger(offset)||offset<0||offset>props.content.length)return
  const index=Math.max(0,pages.findIndex(p=>offset>=p.from&&(offset<p.to||p.to===props.content.length)))
  await move(index)
  if(!alive||!viewport.value)return
  const parts=[...viewport.value.querySelectorAll<HTMLElement>('[data-source-from]')],part=parts.find((p,n)=>offset>=Number(p.dataset.sourceFrom)&&(!parts[n+1]||offset<Number(parts[n+1]!.dataset.sourceFrom)))
  part?.scrollIntoView({block:'center'});await remember()
}
defineExpose({navigate,flush,locate})
</script>
