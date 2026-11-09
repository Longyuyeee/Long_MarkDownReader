<template>
  <section class="mobile-reading-pane">
    <MobileReadingPosition v-if="positionError && !sourceReason" :kind="positionError" :busy="positionBusy || retrying" @retry="retryPosition" />
    <nav v-if="references.length" class="reading-sources" aria-label="阅读笔记原文来源"><button class="text-button" :aria-label="`原文来源 ${references.length}`" :aria-expanded="sourcesOpen" @click="sourcesOpen = !sourcesOpen">原文来源 {{ references.length }}<span>{{ sourcesOpen ? '收起' : '查看' }}</span></button><div v-if="sourcesOpen" class="reading-source-list"><button v-for="(target,index) in references.slice(0,shownSources)" :key="index" class="button" @click="emit('pdf-reference',target)"><strong>原文第 {{ target.page }} 页</strong><small>{{ target.relativePath.split('/').pop() }}</small></button><button v-if="shownSources < references.length" class="button" @click="shownSources += 20">再显示 20 处来源</button></div></nav>
    <div v-if="preparing" class="reading-status" role="status"><span>正在准备阅读，可随时返回。</span><button class="text-button" @click="useSource">直接阅读原文</button></div>
    <SourceReader v-if="sourceReason && fingerprint" ref="sourceView" :key="channel" :content="content" :identity="id" :fingerprint="fingerprint" :reason="sourceReason" :query="query" :storage="storage" :query-input="queryInput" :title="identity.relativePath.split('/').pop()" @matches="$emit('matches', $event)" @restore-query="$emit('restore-query',$event)" />
    <div v-if="message || imageFailures" class="reading-status" role="status"><span>{{ message }}{{ imageFailures ? `${message ? ' · ' : ''}${imageFailures} 张图片未加载，正文仍可阅读` : '' }}</span><button v-if="imageFailures" class="text-button" :disabled="imageLoading" @click="retryImages">重试图片</button><button v-if="imageFailures && /\.md$/i.test(identity.relativePath)" class="text-button" @click="$emit('manage-images')">检查图片引用</button><button v-if="resumed" class="text-button" @click="fromTop">从头阅读</button></div>
    <iframe v-if="html" :key="frameKey" ref="frame" class="mobile-reader" title="文档阅读" sandbox="allow-scripts" :srcdoc="html" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prepareReaderDocument, type ReaderImage } from './readerDocument'
import type {ReaderCodeBlock} from './markdownPresentation'
import {readingTitleFont} from './readingTitleFont'
import {sourceFileInfo} from './codeFormats'
import SourceReader from './SourceReader.vue'
import { prepareReading } from './readerPreparation'
import type { DocumentMatches } from './documentBudget'
import { validReadingPoint,type ReadingPoint,type ReadingBookmark } from './readingState'
import {createTextReadingSession,type TextReadingPhase} from './textReadingRepository'
import MobileReadingPosition from './MobileReadingPosition.vue'
import { humanStorageError, identityKey, type Identity, type Storage } from './storage'
import type { MobilePdfReference } from './pdfReference'
const props = defineProps<{ identity: Identity; content: string; dark: boolean; quietResume?: boolean; query: string; storage: Storage;queryInput?:HTMLInputElement;codeWrap?:boolean }>()
const emit = defineEmits<{ matches: [value: DocumentMatches]; 'manage-images': []; 'pdf-reference':[target:MobilePdfReference];'restore-query':[value:{query:string;selection:import('./sourceReadingState').QuerySelection|null}] }>()
const references=ref<MobilePdfReference[]>([]), sourcesOpen=ref(false), shownSources=ref(20)
const sourceView = ref<InstanceType<typeof SourceReader>>()
const preparing = ref(false), sourceReason = ref('')
const frame = ref<HTMLIFrameElement>(), html = ref(''), message = ref(''), resumed = ref(false), imageFailures = ref(0)
const frameKey = ref('')
const imageLoading = ref(false)
const channel = ref(''), fingerprint = ref(''), id = ref('')
let generation = 0, ready = false, images: ReaderImage[] = [], failed: ReaderImage[] = []
let codes:ReaderCodeBlock[]=[],copyingCode=false
let preparation: AbortController | undefined
let pendingBookmark:ReadingBookmark|null=null
const positionError=ref<''|'read'|'save'>(''),positionBusy=ref(false),retrying=ref(false)
let readingSession:ReturnType<typeof createTextReadingSession>|undefined,retryOwner=0
type CodeAnchor={line:number;fraction:number}
type FrameSample={point:ReadingPoint;activity:number;applied?:boolean}
// A transient physical-line anchor for theme/wrap rebuilds. Durable bookmarks
// keep their existing pre-block schema so old code reading points still work.
let lastCodeAnchor:CodeAnchor|null=null,pendingCodeAnchor:CodeAnchor|null=null
const snapshots=new Map<string,{channel:string;resolve:(sample:FrameSample|null)=>void;timer:ReturnType<typeof setTimeout>}>()
const currentPoint = ref<import('./readingState').ReadingPoint | null>(null)
const hasTextSelection = ref(false)
const canRestart = computed(() => !!currentPoint.value && currentPoint.value.progress > .01)
let lastPoint: import('./readingState').ReadingPoint | null = null
let imageBytes = 0, imagePixels = 0
let imageCache = new Map<string, Awaited<ReturnType<Storage['readImage']>>>()
function send(type: string, value: object = {}) { if (ready) frame.value?.contentWindow?.postMessage({ channel: channel.value, type, ...value }, '*') }
function useSource() { preparation?.abort(); preparing.value = false; html.value = ''; sourceReason.value = '已选择阅读原文' }
function positionPhase(owner:number,phase:TextReadingPhase){if(owner!==generation)return;positionBusy.value=phase==='loading'||phase==='saving';if(phase==='read-error')positionError.value='read';else if(phase==='save-error')positionError.value='save'}
async function remember(session=readingSession,point=lastPoint,signature=fingerprint.value,owner=generation):Promise<boolean>{
  if(!session||!point||!signature)return true
  try{const saved=await session.save({...point,fingerprint:signature,updated:Date.now()});if(saved&&owner===generation&&session===readingSession)positionError.value='';return saved}catch{positionPhase(owner,'save-error');return false}
}
function sample(type='snapshot',value:object={}):Promise<FrameSample|null>{
  if(!ready)return Promise.resolve(null)
  const requestId=crypto.randomUUID(),scope=channel.value
  return new Promise(resolve=>{const timer=setTimeout(()=>{snapshots.delete(requestId);resolve(null)},500);snapshots.set(requestId,{channel:scope,resolve,timer});send(type,{...value,requestId})})
}
async function flush():Promise<boolean>{
  if(sourceReason.value)return await sourceView.value?.flush()??true
  const session=readingSession,signature=fingerprint.value,owner=generation
  if(!session)return true
  if(!ready)return lastPoint?session.flush():true
  const captured=await sample()
  if(!captured){positionPhase(owner,'save-error');return false}
  return remember(session,captured.point,signature,owner)
}
async function retryPosition(){
  if(!readingSession||positionBusy.value||retrying.value)return
  const owner=generation,session=readingSession,request=++retryOwner,restore=positionError.value==='read'
  retrying.value=true
  try{const before=await sample();if(!before)throw Error('snapshot unavailable');const saved=await session.load();if(owner!==generation||session!==readingSession||request!==retryOwner)return
    if(restore&&saved?.fingerprint===fingerprint.value)await sample('restore',{point:saved,activity:before.activity})
    if(owner===generation&&session===readingSession)await flush()
  }catch{if(owner===generation)positionError.value=restore?'read':'save'}finally{if(owner===generation&&request===retryOwner){positionBusy.value=false;retrying.value=false}}
}
async function build() {
  const previousId=id.value,previousSignature=fingerprint.value,previous=flush()
  const owner = ++generation
  preparation?.abort(); const controller = preparation = new AbortController()
  await previous
  if(owner!==generation)return
  const previousPoint=lastPoint&&{...lastPoint}
  const previousCodeAnchor=lastCodeAnchor&&{...lastCodeAnchor};lastCodeAnchor=null;pendingCodeAnchor=null
  readingSession=undefined;positionError.value='';positionBusy.value=false;retrying.value=false;retryOwner++
  html.value = ''; sourceReason.value = ''; preparing.value = true;references.value=[];sourcesOpen.value=false;shownSources.value=20
  hasTextSelection.value = false
  emit('matches', { count: 0, current: 0, truncated: false, pending: !!props.query })
  ready = false; lastPoint = null; currentPoint.value = null; message.value = ''; resumed.value = false; imageFailures.value = 0; failed = [];codes=[];copyingCode=false
  imageCache = new Map(); imageBytes = 0; imagePixels = 0; imageLoading.value = false
  id.value = identityKey(props.identity); channel.value = crypto.randomUUID(); fingerprint.value = ''
  const content = props.content, identity = { ...props.identity }
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  if (owner !== generation) return
  fingerprint.value = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
  if (controller.signal.aborted) return
  const result = await prepareReading(content, identity.relativePath, controller.signal)
  if (!result || owner !== generation) return
  if (result.reason) { preparing.value=false;sourceReason.value = result.reason; return }
  try {
    const fontData=/\.md$/i.test(identity.relativePath)?await readingTitleFont():''
    if(owner!==generation||controller.signal.aborted)return
    const prepared = prepareReaderDocument(result.html || '', identity.relativePath, props.dark, channel.value,identity.rootId,fontData,props.codeWrap??true)
    const signature=fingerprint.value,session=createTextReadingSession(id.value,props.storage,phase=>positionPhase(owner,phase),undefined,point=>{if(point?.fingerprint===signature&&point.block>=Math.max(1,prepared.blocks))throw Error('阅读段落无法核对，原记录仍保留。')})
    readingSession=session
    let saved:ReadingBookmark|null=null;try{saved=await session.load()}catch{/* A checkpoint failure must leave the document readable. */}
    if(owner!==generation||controller.signal.aborted)return
    pendingBookmark=saved
    if(pendingBookmark&&pendingBookmark.fingerprint!==fingerprint.value){pendingBookmark=null;message.value='内容已有变化，已从头打开。'}
    if(previousPoint&&previousId===id.value&&previousSignature===fingerprint.value){pendingBookmark={...previousPoint,fingerprint:fingerprint.value,updated:Date.now()};pendingCodeAnchor=previousCodeAnchor}
    references.value=prepared.references;codes=prepared.codes
    images = prepared.images; frameKey.value = channel.value; html.value = prepared.html;preparing.value=false
  } catch { preparing.value=false;sourceReason.value = '暂时无法完成排版' }
}
async function loadImages(items: ReaderImage[], owner = generation) {
  imageLoading.value = true
  for (const image of items) {
    if (owner !== generation) return
    try {
      let data = imageCache.get(image.path)
      if (!data) {
        data = await props.storage.readImage({ rootId: props.identity.rootId, relativePath: image.path })
        if (owner !== generation) return
        if (imageBytes + data.bytes > 8 * 1024 * 1024 || imagePixels + data.width * data.height > 12000000) throw new Error('本页图片已达到阅读预算，可在系统文件管理器中查看原图。')
        imageBytes += data.bytes; imagePixels += data.width * data.height; imageCache.set(image.path, data)
      }
      if (owner !== generation) return
      send('image', { index: image.index, url: data.dataUrl, width: data.width, height: data.height })
    } catch (failure) {
      if (owner !== generation) return
      failed.push(image); imageFailures.value++
      send('image', { index: image.index, error: `图片未加载：${humanStorageError(failure)}` })
    }
  }
  if (owner === generation) imageLoading.value = false
}
function retryImages() { if (imageLoading.value) return; const items = failed; failed = []; imageFailures.value = 0; void loadImages(items) }
function fromTop() { resumed.value = false; message.value = ''; send('top') }
async function copyCode(index:number){
  if(!ready||!Number.isInteger(index)||index<0||index>=codes.length)return
  if(copyingCode){send('code-copy-status',{index,status:'error'});return}
  const owner=generation,text=codes[index]!.text;copyingCode=true
  try{await props.storage.copyText(text);if(owner===generation)send('code-copy-status',{index,status:'copied'})}catch{if(owner===generation)send('code-copy-status',{index,status:'error'})}finally{if(owner===generation)copyingCode=false}
}
function receive(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || !event.data || event.data.channel !== channel.value) return
  const data = event.data
  if (data.type === 'ready') {
    ready = true; resumed.value = !!pendingBookmark && pendingBookmark.progress > .01
    if (resumed.value && !props.quietResume) message.value = '已接着上次的阅读位置'
    send('init', { point: pendingBookmark,codeAnchor:pendingCodeAnchor }); send('search', { query: props.query }); void loadImages(images)
  } else if ((data.type === 'position'||data.type==='restored') && validReadingPoint(data.point) && Number.isSafeInteger(data.activity)&&data.activity>=0) {
    const anchor=data.codeAnchor
    if(anchor&&Number.isInteger(anchor.line)&&anchor.line>0&&anchor.line<=2000&&Number.isFinite(anchor.fraction)&&anchor.fraction>=0&&anchor.fraction<=1)lastCodeAnchor={line:anchor.line,fraction:anchor.fraction}
    lastPoint = {...data.point}; currentPoint.value = {...data.point}
    const request=typeof data.requestId==='string'?snapshots.get(data.requestId):undefined
    if(request&&request.channel===channel.value){clearTimeout(request.timer);snapshots.delete(data.requestId);request.resolve({point:{...data.point},activity:data.activity,applied:data.applied===true})}
    else if(!data.requestId)void remember()
  } else if (data.type === 'selection-state' && typeof data.active === 'boolean') {
    hasTextSelection.value = data.active
  } else if(data.type==='copy-code'&&Number.isInteger(data.index)){
    void copyCode(data.index)
  } else if (data.type === 'image-error' && Number.isInteger(data.index)) {
    const image = images.find(item => item.index === data.index)
    if (image && !failed.some(item => item.index === data.index)) { failed.push(image); imageFailures.value++ }
  } else if (data.type === 'pdf-reference' && Number.isInteger(data.index) && data.index>=0 && data.index<references.value.length) {
    emit('pdf-reference',references.value[data.index])
  } else if (data.type === 'matches' && Number.isInteger(data.count) && data.count >= 0 && data.count <= 1000 && Number.isInteger(data.current) && data.current >= 0 && data.current <= data.count) {
    emit('matches', { count: data.count, current: data.current, truncated: data.truncated === true })
  }
}
watch(() => [identityKey(props.identity), props.content], build)
watch(()=>props.dark,()=>{if(!sourceReason.value)void build()})
watch(()=>props.codeWrap,()=>{if(sourceFileInfo(props.identity.relativePath)&&!sourceReason.value)void build()})
watch(() => props.query, query => send('search', { query }))
onMounted(() => { window.addEventListener('message', receive); void build() })
onBeforeUnmount(() => { generation++;retryOwner++;preparation?.abort();window.removeEventListener('message', receive);for(const request of snapshots.values()){clearTimeout(request.timer);request.resolve(null)}snapshots.clear() })
const segmented=computed(()=>!!sourceReason.value)
const formattedProgress=computed(()=>!sourceReason.value&&html.value&&currentPoint.value?Math.round(currentPoint.value.progress*100):null)
async function locateSource(source:string,offset:number){
  if(source!==props.content||!sourceFileInfo(props.identity.relativePath)||!Number.isInteger(offset)||offset<0||offset>source.length)throw Error('正文已有变化，请重新定位。')
  if(sourceReason.value){await sourceView.value?.locate(offset);return}
  const line=source.slice(0,offset).split(/\r\n|\r|\n/).length,captured=await sample('locate-code-line',{line})
  if(!captured)throw Error('文稿尚未准备好，请稍后再定位。')
  await remember(readingSession,captured.point)
}
defineExpose({ fromTop, canRestart,segmented,formattedProgress,hasTextSelection,locateSource, navigate(direction: number) { if (sourceReason.value) void sourceView.value?.navigate(direction); else send('navigate', { direction }) },flush })
</script>
<style scoped>
.reading-sources{flex-shrink:0;border-bottom:1px solid var(--line);padding:0 16px;background:var(--primary-soft)}.reading-sources>.text-button{width:100%;justify-content:space-between;gap:12px}.reading-sources span{font-size:.8125rem}.reading-source-list{max-height:34dvh;overflow:auto;padding-bottom:8px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain}.reading-source-list .button{width:100%;display:block;text-align:left;padding:10px 12px}.reading-source-list strong,.reading-source-list small{display:block}.reading-source-list small{font-size:.75rem;font-weight:400;color:var(--muted);overflow-wrap:anywhere}
</style>
