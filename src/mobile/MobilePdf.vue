<template>
  <section ref="readerRoot" class="mobile-pdf" :class="{ 'pdf-copy-restricted': !access.copy, 'pdf-locked': passwordPhase !== 'idle', 'has-pdf-more':moreOpen, 'has-pdf-search': searchOpen, 'has-pdf-navigation': navigationOpen, 'has-pdf-settings': modeForm, 'has-pdf-permissions': permissionsOpen, 'has-pdf-annotation-editor':annotationEditing,'has-pdf-annotations':annotationsOpen }" aria-label="PDF 阅读工作区">
    <header class="reader-header" :inert="moreOpen || passwordPhase!=='idle' || annotationsOpen || annotationEditing || searchOpen || pageForm || navigationOpen || modeForm || permissionsOpen || moreOpen || undefined">
      <button class="icon-button" :aria-label="annotationPreview ? '返回批注详情' : searchPreview ? '返回查找结果' : returnNote ? '返回阅读笔记' : returnLabel || '返回资料库'" @click="readerBack"><ArrowLeft :size="22" /></button>
      <div class="document-heading"><h1 tabindex="-1" :title="identity.relativePath"><template v-if="passwordPhase === 'idle'"><bdi class="pdf-file-stem">{{ pdfReadingTitle(identity.relativePath) }}</bdi><wbr /><bdi class="pdf-file-suffix">.pdf</bdi></template><template v-else>PDF 阅读</template></h1></div>
      <button v-show="passwordPhase === 'idle'" ref="searchButton" class="icon-button pdf-search-opener" aria-label="在 PDF 内查找" :disabled="!document || navigationOpen" :aria-expanded="searchOpen" @click="toggleSearch"><Search :size="21" /></button>
      <button v-if="document" ref="moreButton" class="icon-button pdf-menu-opener" aria-label="PDF 操作" :aria-expanded="moreOpen" aria-haspopup="dialog" @click="showMore()"><MoreVertical :size="22" /></button>
      <button v-else class="icon-button" :aria-label="dark?'切换浅色':'切换深色'" @click="emit('theme')"><Sun v-if="dark" :size="21" /><Moon v-else :size="21" /></button>
    </header>
    <aside v-if="reference" :inert="moreOpen || passwordPhase!=='idle' || annotationsOpen || annotationEditing || searchOpen || pageForm || navigationOpen || modeForm || permissionsOpen || moreOpen || undefined" class="pdf-reference-context" aria-label="阅读笔记原文定位"><div><strong>来自阅读笔记 · 第 {{ reference.page }} 页</strong><p role="status">{{ referenceStatus }}</p></div><button v-if="referenceAnnotation" class="text-button" @click="notes?.showAnnotation(referenceAnnotation)">查看批注</button><button v-if="returnNote" class="button" @click="requestClose">返回笔记</button></aside>
    <MobilePdfAnnotations :inert="moreOpen || searchOpen || pageForm || undefined" v-if="annotationSource && document" :key="fingerprint" ref="notes" :identity="identity" :storage="storage" :source="annotationSource" :can-copy="access.copy" :can-modify="access.annotate" :signature="fingerprint" :pages="document.numPages" :page="pageNumber" :selection="selection" :obscured="moreOpen" :opener-target="notesTarget" :editor-target="readerRoot" @editing="annotationEditing=$event" @opened="annotationsOpen=$event" @reference="annotationPreview=$event" compact-opener @clear="clearSelection" @goto="annotationPage" @note="emit('note',$event)" @annotations="annotations = $event" @loaded="annotationsLoaded" />
    <MobilePdfNavigation :inert="moreOpen || searchOpen || pageForm || undefined" v-if="document" ref="navigation" :key="fingerprint" :pdf="document" :page="pageNumber" :storage="storage" :source="{...identity,fingerprint,pages:document.numPages}" @goto="navigationPage" @opened="navigationChanged" />
    <p v-if="changedSource" class="pdf-source-change" role="status">文件已变化，已从首页重新打开。</p>
    <MobilePdfPageDialog v-if="document" :key="fingerprint" :open="pageForm" :name="pdfReadingTitle(identity.relativePath) + '.pdf'" :page="pageNumber" :pages="document.numPages" @close="closePageForm" @goto="confirmPage" />
    <MobilePdfSearch v-if="document" ref="search" :key="fingerprint" :pdf="document" :name="pdfReadingTitle(identity.relativePath) + '.pdf'" :page="pageNumber" :read-text="text" @opened="searchChanged" @preview="searchPreview=$event" @goto="selectResult" />
    <main ref="viewport" :inert="moreOpen || passwordPhase!=='idle' || annotationsOpen || annotationEditing || searchOpen || pageForm || navigationOpen || modeForm || permissionsOpen || moreOpen || undefined" class="pdf-viewport" :class="{ 'pdf-can-swipe': canTurnPage, 'pdf-text-mode': textMode, 'pdf-pinching': pinchZoom !== null, 'pdf-continuous-mode': continuousActive }" @scroll.passive="scroll" @touchstart="pinchStart" @touchmove="pinchMove" @touchend="pinchEnd" @touchcancel="cancelPinch">
      <div v-if="loading&&passwordPhase==='idle'" class="empty-state" role="status"><LoaderCircle :size="28" class="spinning" /><p>正在打开 PDF…</p></div>
      <div v-else-if="loadError" class="empty-state" role="alert"><h2>暂时无法打开这份 PDF</h2><p>{{ loadError }}</p><button class="button" @click="load">重新读取</button></div>
      <template v-else-if="document">
        <MobilePdfContinuous v-if="continuousActive" :key="fingerprint" ref="continuousView" :pdf="document" :host="viewport" :zoom="zoom" :rotation="rotation" :annotations="displayAnnotations" :reference-annotation="referenceAnnotation" :paused="annotationsOpen || annotationEditing || navigationOpen || modeForm || permissionsOpen || searchOpen || pageForm || pinchZoom !== null" @move="pageNumber=$event" @busy="rendering=$event" @saved="scheduleFlush" @single="singlePage" />
        <template v-else>
        <p v-if="rendering" class="pdf-render-status" role="status">正在显示第 {{ pageNumber }} 页…</p>
        <div v-show="!textMode" class="pdf-paper" :style="{ visibility: rendering ? 'hidden' : 'visible' }"><div ref="paper" class="pdf-page-surface"><canvas ref="canvas" tabindex="0" role="img" :aria-label="`PDF 第 ${pageNumber} 页，可长按选文或切换页面文字阅读`" /><div ref="textLayerHost" class="textLayer" aria-hidden="true" /><div class="pdf-mark-layer" aria-hidden="true"><template v-for="a in displayAnnotations.filter(a => a.page === pageNumber)" :key="a.id"><i v-for="(r,index) in a.rects" :key="index" class="pdf-mark" :class="[`color-${a.color}`,`kind-${a.kind}`,{'is-reference':a.id===referenceAnnotation}]" :style="{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}" /></template></div></div></div>
        <article v-if="textMode" class="pdf-page-text" aria-label="当前 PDF 页面的文字"><h2>第 {{ pageNumber }} 页文字</h2><pre v-if="pageText" tabindex="0">{{ pageText }}</pre><p v-else>{{ rendering ? '正在读取页面文字…' : '这一页没有可提取的文字，可能是扫描图片。' }}</p></article>
        <p v-if="renderError" class="pdf-page-error" role="alert">{{ renderError }}<button class="text-button" @click="renderPage">重新显示本页</button></p>
        </template>
      </template>
    </main>
    <div v-if="document" class="assistive-status" role="status">{{ positionStatus }}</div>
    <MobilePdfPosition v-if="document&&(positionError||selectionIssue)" :inert="moreOpen || passwordPhase!=='idle' || annotationsOpen || annotationEditing || searchOpen || pageForm || navigationOpen || permissionsOpen || moreOpen || undefined" :text="positionStatus" :error="positionError" :busy="positionBusy" :selection-issue="selectionIssue" @clear="clearSelection" @retry="retryPosition" />
    <footer v-if="document" :inert="moreOpen||passwordPhase!=='idle'||annotationsOpen||annotationEditing||searchOpen||pageForm||navigationOpen||modeForm||permissionsOpen||undefined" class="pdf-footer"><nav class="pdf-pages" aria-label="PDF 阅读导航"><button ref="navigationButton" class="pdf-bottom-action pdf-navigation-opener" aria-label="目录与页面" :aria-expanded="navigationOpen" @click="toggleNavigation"><List :size="22" aria-hidden="true" /><span>目录</span></button><button ref="pageButton" class="pdf-page-button" :aria-label="`第 ${pageNumber} / ${document.numPages} 页`" :aria-expanded="pageForm" @click="togglePageForm"><span class="pdf-page-count">{{ pageNumber }} / {{ document.numPages }}</span></button><span ref="notesTarget" class="pdf-notes-target" /></nav></footer>
    <MobilePdfSettings v-if="document" :key="fingerprint" ref="settingsView" :return-menu="moreSettingsOrigin" :name="pdfReadingTitle(identity.relativePath)+'.pdf'" :page="pageNumber" :pages="document.numPages" :mode="readingMode" :rotation="rotation" :zoom="zoom" :dark="dark" :text-mode="textMode" :busy="rendering" :permission-summary="permissionSummary" @permissions="openPermissions('settings', $event)" @return="resumeMore('settings')" @opened="settingsChanged" @mode="changeMode" @direction="changeRotation" @zoom="applySettingsZoom" @theme="emit('theme')" @original="textMode=false" />
    <div v-if="moreOpen" v-show="!mobileHelpOpen" class="pdf-action-layer" :inert="mobileHelpOpen||undefined" @click.self="closeMore()"><section ref="moreDialog" class="pdf-action-menu" role="dialog" aria-modal="true" aria-label="PDF 操作" @keydown.tab.prevent="menuTab" @keydown.esc.stop.prevent="closeMore()"><header><h2>PDF 操作</h2><MobileHelp topic="pdfReading" /><button class="icon-button" aria-label="关闭 PDF 操作" @click="closeMore()"><X :size="22" /></button></header><div class="pdf-action-body"><button ref="settingsButton" data-pdf-action="settings" class="pdf-action-row" @click="settingsFromMore"><SlidersHorizontal :size="22" /><span>阅读设置</span><ChevronRight :size="20" /></button><button class="pdf-action-row" data-pdf-action="text" @click="toggleText"><FileText :size="22" /><span>{{ textMode?'原版页面':'页面文字' }}</span><ChevronRight :size="20" /></button><button ref="permissionsButton" data-pdf-action="permissions" class="pdf-action-row" aria-label="查看文档权限" @click="permissionsFromMore"><LockKeyhole :size="22" /><span>文档权限</span><ChevronRight :size="20" /></button><div class="pdf-action-paging"><button class="button" aria-label="上一页" :disabled="pageNumber<=1" @click="pageFromMore(-1)"><ChevronLeft :size="20" />上一页</button><button class="button" aria-label="下一页" :disabled="!document||pageNumber>=document.numPages" @click="pageFromMore(1)">下一页<ChevronRight :size="20" /></button></div></div></section></div>
    <MobilePdfPassword v-if="passwordPhase!=='idle'" ref="passwordView" :return-label="returnLabel" :title="pdfReadingTitle(identity.relativePath)" :library-name="libraryName" :dark="dark" :incorrect="passwordPhase==='incorrect'" :busy="passwordPhase==='checking'" :return-note="returnNote" @submit="submitPassword" @cancel="requestClose" @theme="emit('theme')" />
    <MobilePdfPermissions v-if="document" :key="fingerprint" ref="permissionsView" :open="permissionsOpen" :return-menu="morePermissionOrigin" :return-settings="permissionOrigin==='settings'" :title="pdfReadingTitle(identity.relativePath)" :library-name="libraryName" :local="identity.rootId==='local'" :access="access" @close="closePermissions" />
  </section>
</template>
<script setup lang="ts">
import MobilePdfPassword from './MobilePdfPassword.vue'
import MobilePdfPermissions from './MobilePdfPermissions.vue'
import {pdfAccess,readPdfAccess,pdfSourceText} from './pdfPermissions'
import {canFocus,focusableControls} from './accessibility'
import { createPdfPasswordGate, type PdfPasswordPhase } from './pdfPassword'
import {pdfRotation,rotatePdfRect,rotatePdfAnchor,sizePdfTextLayer,type PdfRotation} from './pdfOrientation'
import './pdfTextLayer.css'
import MobilePdfContinuous from './MobilePdfContinuous.vue'
import MobilePdfAnnotations from './MobilePdfAnnotations.vue'
import MobilePdfNavigation from './MobilePdfNavigation.vue'
import MobilePdfPageDialog from './MobilePdfPageDialog.vue'
import MobilePdfSearch from './MobilePdfSearch.vue'
import MobilePdfSettings from './MobilePdfSettings.vue'
import type { PdfAnnotation, PdfAnnotationSource, PdfAnnotationRect, PdfAnnotationDocument } from '../types/pdfAnnotations'
import type { MobilePdfReference } from './pdfReference'
import { normalizedPdfRects, pdfReadingTitle } from './pdfAnnotations'
import { ref, shallowRef, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { ArrowLeft, Search, SlidersHorizontal, Sun, Moon, FileText, LoaderCircle, ChevronLeft, ChevronRight, List, LockKeyhole, MoreVertical, X } from 'lucide-vue-next'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { identityKey, humanStorageError, type Identity, type Storage } from './storage'
import { base64Bytes, hashBytes } from './portablePack'
import { validatePdfBytes, pdfCanvasSize, pdfScrollFraction, type PdfPoint } from './pdfDocument'
import { createPdfReadingSession,type PdfReadingPhase } from './pdfReadingRepository'
import MobilePdfPosition from './MobilePdfPosition.vue'
import MobileHelp from './MobileHelp.vue'
import {mobileHelpOpen} from './mobileHelp'
import { pdfZoom, pdfTouchPair, pdfAnchorAt, pdfAnchorScroll, pdfPinchPreview, pdfPageSwipe, type PdfAnchor } from './pdfGestures'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
const props = defineProps<{ identity: Identity; storage: Storage; libraryName: string; dark: boolean; reference?:MobilePdfReference; returnNote?:boolean; returnLabel?:string }>()
const emit = defineEmits<{ close: []; theme: []; note:[identity:Identity] }>()
const annotationsOpen=ref(false),annotationPreview=ref(false),annotationEditing=ref(false),notes=ref<InstanceType<typeof MobilePdfAnnotations>>(), annotationSource=shallowRef<PdfAnnotationSource>(), annotations=ref<PdfAnnotation[]>([]), selection=ref<{quote:string;rects:PdfAnnotationRect[]}|null>(null), textLayerHost=ref<HTMLElement>()
const moreOpen=ref(false),moreButton=ref<HTMLButtonElement>(),moreDialog=ref<HTMLElement>();let moreSettingsOrigin=false,morePermissionOrigin=false
async function showMore(entry?:string){if(!document.value||passwordPhase.value!=='idle')return;moreOpen.value=true;await nextTick();const target=entry?moreDialog.value?.querySelector<HTMLElement>('[data-pdf-action="'+entry+'"]'):undefined;(target||moreDialog.value?.querySelector<HTMLElement>('button'))?.focus({preventScroll:true})}
function closeMore(restore=true){moreOpen.value=false;if(restore)void nextTick(()=>moreButton.value?.focus({preventScroll:true}))}
async function resumeMore(entry:string){if(entry==='settings'&&!moreSettingsOrigin)return;moreSettingsOrigin=false;await nextTick();await showMore(entry)}
function menuTab(event:KeyboardEvent){const controls=focusableControls(moreDialog.value),index=controls.indexOf(window.document.activeElement as HTMLElement);controls[event.shiftKey?(index<=0?controls.length-1:index-1):(index+1)%controls.length]?.focus()}
async function settingsFromMore(){moreSettingsOrigin=true;closeMore(false);await openSettings()}
async function permissionsFromMore(){morePermissionOrigin=true;closeMore(false);await openPermissions('reader',moreButton.value)}
function toggleText(){closeMore();clearSelection();textMode.value=!textMode.value}
function pageFromMore(direction:number){closeMore();changePage(pageNumber.value+direction)}
watch(()=>identityKey(props.identity),()=>{moreOpen.value=false;moreSettingsOrigin=false;morePermissionOrigin=false})
const fingerprint=ref(''), navigation=ref<InstanceType<typeof MobilePdfNavigation>>(), navigationOpen=ref(false), navigationButton=ref<HTMLButtonElement>()
function navigationChanged(open:boolean){navigationOpen.value=open;if(!open)void nextTick(()=>navigationButton.value?.focus())}
function navigationPage(n:number){pageForm.value=false;search.value?.hide();changePage(n)}
async function toggleNavigation(){cancelPinch();if(navigationOpen.value){navigation.value?.hide();return};if(notes.value && !await notes.value.dismiss())return;flush();clearSelection();cancelSearch();void navigation.value?.show()}
const notesTarget=ref<HTMLElement>(), referenceStatus=ref('正在核对原文位置…'), referenceAnnotation=ref('')
let referenceHandled=false
let textLayer: import('pdfjs-dist').TextLayer | undefined, pendingRect: PdfAnnotationRect | undefined
const document = shallowRef<PDFDocumentProxy>(), pageNumber = ref(1), zoom = ref(1), loading = ref(true), loadError = ref(''), renderError = ref(''), rendering = ref(false), pageText = ref(''), textMode = ref(false), positionStatus = ref('阅读位置尚未记录')
const positionError=ref<''|'read'|'save'>(''),positionBusy=ref(false)
let readingSession:ReturnType<typeof createPdfReadingSession>|undefined,positionRevision=0,applyingPosition=false,retryingPosition=false
function positionPhase(owner:number,phase:PdfReadingPhase){
  if(disposed||owner!==epoch)return
  positionBusy.value=phase==='loading'||phase==='saving'
  if(phase==='read-error'){positionError.value='read';positionStatus.value='上次阅读位置暂不可读取，原记录仍保留。'}
  else if(phase==='save-error'){positionError.value='save';positionStatus.value='阅读位置暂未保存，原记录仍保留。'}
  else if(!positionError.value&&phase==='saving')positionStatus.value='正在记录阅读位置…'
}
function restorePosition(saved:PdfPoint|null){
  const same=saved?.fingerprint===fingerprint.value;changedSource.value=!!saved&&!same
  rotation.value=same?saved.rotation||0:0;readingMode.value=same?saved.mode||'single':'single';pendingContinuousOffset=same?saved.pageOffset:0;pendingContinuousInset=same?saved.pageInset||0:0
  pageNumber.value=same?saved.page:1;zoom.value=same?saved.zoom:1;pendingFraction=same?saved.fraction:0;pendingHorizontal=same?saved.horizontal??0:0
  if(!positionError.value)positionStatus.value=saved&&!same?'文件已变化，从首页重新阅读':same?'已恢复上次阅读位置':'阅读位置尚未记录'
}
async function retryPosition(){
  if(retryingPosition||!readingSession||!document.value)return
  retryingPosition=true;const owner=epoch,session=readingSession,revision=positionRevision,restore=positionError.value==='read'
  try{const saved=await session.load();if(disposed||owner!==epoch||session!==readingSession)return;positionError.value='';if(restore&&revision===positionRevision){applyingPosition=true;cancelPinch();restorePosition(saved);await nextTick();await renderPage()}else await flush()}
  catch{/* The session retains the actual failed state and never creates an empty checkpoint. */}
  finally{retryingPosition=false;applyingPosition=false}
}
const readingMode=ref<'single'|'continuous'>('single'),modeForm=ref(false),settingsButton=ref<HTMLButtonElement>(),settingsView=ref<InstanceType<typeof MobilePdfSettings>>(),continuousView=ref<InstanceType<typeof MobilePdfContinuous>>(),selectionIssue=ref('')
const rotation=ref<PdfRotation>(0)
const access=ref(pdfAccess(undefined)),permissionsOpen=ref(false),permissionsButton=ref<HTMLButtonElement>(),readerRoot=ref<HTMLElement>()
function guardCopy(event:ClipboardEvent){if(event.target instanceof Element&&event.target.closest('input,textarea'))return;const selection=window.getSelection();if(!access.value.copy&&(pdfSourceText(event.target as Node,readerRoot.value)||pdfSourceText(selection?.anchorNode||null,readerRoot.value)||pdfSourceText(window.document.activeElement,readerRoot.value))){event.preventDefault();event.clipboardData?.setData('text/plain','')}}
function guardContext(event:MouseEvent){if(!access.value.copy&&pdfSourceText(event.target as Node,readerRoot.value))event.preventDefault()}
const permissionsView=ref<InstanceType<typeof MobilePdfPermissions>>()
const permissionSummary=computed(()=>!access.value.known?'权限未确认':access.value.restricted?'部分操作受限':props.identity.rootId!=='local'?'此来源需导入后批注':'复制与批注可用')
type ReaderSelection={fingerprint:string;page:number;zoom:number;rotation:PdfRotation;mode:string;textMode:boolean;value:{quote:string;rects:PdfAnnotationRect[]}|null;issue:string;range?:Range}
const permissionOrigin=ref<'reader'|'settings'>('reader')
let settingsSelection:ReaderSelection|undefined,permissionSelection:ReaderSelection|undefined,permissionTarget:HTMLElement|undefined
function captureReaderSelection():ReaderSelection|undefined{
  if(!access.value.copy)return
  const selected=window.getSelection(),range=selected?.rangeCount?selected.getRangeAt(0):undefined
  return {fingerprint:fingerprint.value,page:pageNumber.value,zoom:zoom.value,rotation:rotation.value,mode:readingMode.value,textMode:textMode.value,value:selection.value?{quote:selection.value.quote,rects:selection.value.rects.map(r=>({...r}))}:null,issue:selectionIssue.value,range:range&&pdfSourceText(range.commonAncestorContainer,readerRoot.value)?range.cloneRange():undefined}
}
function restoreReaderSelection(saved:ReaderSelection|undefined){
  if(!saved||!access.value.copy||saved.fingerprint!==fingerprint.value||saved.page!==pageNumber.value||saved.zoom!==zoom.value||saved.rotation!==rotation.value||saved.mode!==readingMode.value||saved.textMode!==textMode.value||rendering.value)return
  selection.value=saved.value;selectionIssue.value=saved.issue
  if(saved.range?.startContainer.isConnected&&saved.range.endContainer.isConnected){const current=window.getSelection();current?.removeAllRanges();current?.addRange(saved.range)}
}
async function openPermissions(origin:'reader'|'settings'='reader',target?:HTMLElement){
  if(origin==='settings')morePermissionOrigin=false
  if(notes.value&&!await notes.value.dismiss()){if(origin==='settings')settingsView.value?.hide();return}
  permissionSelection=origin==='settings'?settingsSelection:captureReaderSelection();permissionOrigin.value=origin;permissionTarget=target
  if(await navigation.value?.hide()===false)return;cancelPinch();flush();permissionsOpen.value=true;settingsView.value?.hide();pageForm.value=false;if(searchOpen.value)search.value?.hide()
}
async function closePermissions(reader=false){
  permissionsOpen.value=false
  if(morePermissionOrigin&&!reader){morePermissionOrigin=false;await showMore('permissions');return}
  morePermissionOrigin=false
  if(permissionOrigin.value==='settings'&&!reader){settingsSelection=permissionSelection;await settingsView.value?.show();await nextTick();if(canFocus(permissionTarget))permissionTarget.focus({preventScroll:true});return}
  await nextTick();const target=permissionOrigin.value==='reader'?permissionTarget:settingsButton.value;if(canFocus(target))target.focus({preventScroll:true});else (permissionsButton.value||moreButton.value)?.focus({preventScroll:true});restoreReaderSelection(permissionSelection);permissionSelection=undefined
}

const passwordPhase=ref<PdfPasswordPhase>('idle'),passwordView=ref<InstanceType<typeof MobilePdfPassword>>()
const passwordGate=createPdfPasswordGate(phase=>{passwordPhase.value=phase})
function clearPassword(){passwordView.value?.clear();passwordGate.clear()}
function submitPassword(password:string){if(disposed)return;try{passwordGate.submit(password)}catch{clearPassword();void task?.destroy().catch(()=>{});loadError.value='这次密码核对未完成，请重新读取文档。';loading.value=false}}
const displayAnnotations=computed(()=>annotations.value.map(a=>({...a,rects:a.rects.map(r=>rotatePdfRect(r,rotation.value))})))
const continuousActive=computed(()=>readingMode.value==='continuous'&&!textMode.value)
const paper = ref<HTMLElement>(), pinchZoom = ref<number | null>(null)
const canvas = ref<HTMLCanvasElement>(), viewport = ref<HTMLElement>(), pageForm = ref(false)
const searchOpen=ref(false), searchPreview=ref(false), search=ref<InstanceType<typeof MobilePdfSearch>>()
function searchChanged(open:boolean){searchOpen.value=open;if(!open)void nextTick(()=>searchButton.value?.focus({preventScroll:true}))}
const changedSource = ref(false), searchButton = ref<HTMLButtonElement>(), pageButton = ref<HTMLButtonElement>()
let task: PDFDocumentLoadingTask | undefined, renderTask: RenderTask | undefined, epoch = 0, renderEpoch = 0, disposed = false, pendingFraction: number | null = null, scrollTimer: ReturnType<typeof setTimeout> | undefined
let layoutAnchor:{page:number;anchor:PdfAnchor}|undefined
let pendingAnchor: PdfAnchor | undefined, pendingHorizontal = 0, pendingAnchorPage:number|undefined, pendingContinuousOffset:number|undefined, pendingContinuousInset=0
let pinch: { ids: number[]; distance: number; zoom: number; anchor: PdfAnchor; box: DOMRect; host: DOMRect; start: { x: number; y: number }; moved: boolean; sourceAnchor?:PdfAnchor; sourcePage?:number } | undefined
let blockPinch = false
function cancelPinch() {
  pinch = undefined; pinchZoom.value = null
  if (paper.value) paper.value.style.transform = ''
  if (continuousView.value?.root) continuousView.value.root.style.transform = ''
}
function transformPaper(){return continuousActive.value?continuousView.value?.root:paper.value}
const canTurnPage=computed(()=>!continuousActive.value&&!textMode.value&&zoom.value===1&&!rendering.value&&!moreOpen.value&&!annotationsOpen.value&&!annotationEditing.value&&!navigationOpen.value&&!searchOpen.value&&!pageForm.value&&!modeForm.value&&!permissionsOpen.value)
let pageSwipe:{id:number;x:number;y:number;time:number;dx:number;dy:number;horizontal:boolean}|undefined
function textSelected(){const value=window.getSelection();return !!selection.value||!!value&&!value.isCollapsed}
function pinchStart(event: TouchEvent) {
  if (!event.touches.length) blockPinch = false
  if (event.touches.length === 1) { blockPinch=false;const t=event.touches[0]!;pageSwipe=canTurnPage.value&&!textSelected()?{id:t.identifier,x:t.clientX,y:t.clientY,time:performance.now(),dx:0,dy:0,horizontal:false}:undefined;return }
  pageSwipe=undefined
  if (event.touches.length !== 2) { cancelPinch(); blockPinch = true; return }
  if (blockPinch || pinch || rendering.value || textMode.value || !document.value || navigationOpen.value || searchOpen.value || pageForm.value || modeForm.value || !transformPaper() || !viewport.value || !event.cancelable) return
  const pair = pdfTouchPair({ x: event.touches[0].clientX, y: event.touches[0].clientY }, { x: event.touches[1].clientX, y: event.touches[1].clientY })
  if (pair.distance < 20) return
  event.preventDefault(); flush(); clearTimeout(scrollTimer); clearSelection()
  const box = transformPaper()!.getBoundingClientRect(), host = viewport.value.getBoundingClientRect(), source=continuousActive.value?continuousView.value?.getAnchor(pair.center):undefined
  pinch = { ids: [event.touches[0].identifier, event.touches[1].identifier], distance: pair.distance, zoom: zoom.value, anchor: pdfAnchorAt(pair.center, box, host), box, host, start: pair.center, moved: false,sourceAnchor:source?.anchor,sourcePage:source?.page }
  pinchZoom.value = zoom.value
}
function pinchMove(event: TouchEvent) {
  if(!pinch&&pageSwipe){const t=event.touches.length===1&&event.touches[0];if(!t||t.identifier!==pageSwipe.id||!canTurnPage.value||textSelected()||performance.now()-pageSwipe.time>500){pageSwipe=undefined;return};pageSwipe.dx=t.clientX-pageSwipe.x;pageSwipe.dy=t.clientY-pageSwipe.y;if(Math.abs(pageSwipe.dy)>20&&Math.abs(pageSwipe.dy)>Math.abs(pageSwipe.dx)){pageSwipe=undefined;return};if(Math.abs(pageSwipe.dx)>16&&Math.abs(pageSwipe.dx)>Math.abs(pageSwipe.dy)*1.5){pageSwipe.horizontal=true;if(event.cancelable)event.preventDefault()}}
  if (!pinch) return
  if (event.touches.length !== 2 || !pinch.ids.every(id => Array.from(event.touches).some(t => t.identifier === id))) { cancelPinch(); blockPinch = true; return }
  if (event.cancelable) event.preventDefault()
  const pair = pdfTouchPair({ x: event.touches[0].clientX, y: event.touches[0].clientY }, { x: event.touches[1].clientX, y: event.touches[1].clientY }), next = pdfZoom(pinch.zoom * pair.distance / pinch.distance)
  pinch.moved ||= Math.abs(next - pinch.zoom) >= .008 || Math.hypot(pair.center.x - pinch.start.x, pair.center.y - pinch.start.y) >= 3
  pinchZoom.value = next
  pinch.anchor.viewport = { x: pair.center.x - pinch.host.x, y: pair.center.y - pinch.host.y }
  if(pinch.sourceAnchor)pinch.sourceAnchor.viewport={...pinch.anchor.viewport}
  const offset = pdfPinchPreview(pinch.anchor, pinch.box, pinch.anchor.viewport, pinch.host, next / pinch.zoom)
  if (transformPaper()) transformPaper()!.style.transform = `translate(${offset.x}px,${offset.y}px) scale(${next / pinch.zoom})`
}
function pinchEnd(event: TouchEvent) {
  if(pageSwipe&&event.touches.length===0){const swipe=pageSwipe;pageSwipe=undefined;if(swipe.horizontal&&canTurnPage.value&&!textSelected()){const direction=pdfPageSwipe(swipe.dx,swipe.dy,performance.now()-swipe.time);if(direction){if(event.cancelable)event.preventDefault();changePage(pageNumber.value+direction)}}}
  if (pinch && event.touches.length < 2) {
    if (event.cancelable) event.preventDefault()
    const current = pinch, next = pinchZoom.value ?? zoom.value
    cancelPinch()
    if (current.moved) { positionRevision++;pendingAnchor = current.sourceAnchor || current.anchor; pendingAnchorPage=current.sourcePage; zoom.value = next; void renderPage() }
  }
  if (!event.touches.length) blockPinch = false
}
function pause() { passwordView.value?.clear();cancelPinch(); flush() }
const text = async (pdf: PDFDocumentProxy, n: number) => {
  const page = await pdf.getPage(n), data = await page.getTextContent()
  let value = ''
  for (const item of data.items) if ('str' in item) { value += item.str + (item.hasEOL ? '\n' : ' '); if (value.length > 200_000) throw new Error('这页的文字量较大，暂不提取；原版页面仍可阅读。') }
  return value
}
async function load() {
  const requestedIdentity={...props.identity},previousSave=flush(),previousTask=task
  const current=++epoch;document.value=undefined;task=undefined;readingSession=undefined
  clearPassword();settingsSelection=undefined;permissionSelection=undefined;access.value=pdfAccess(undefined);permissionsOpen.value=false;cancelPinch();layoutAnchor=undefined; pendingAnchor = undefined;pendingAnchorPage=undefined;pendingRect=undefined;renderEpoch++;
  search.value?.hide();cancelSearch();renderTask?.cancel();await previousSave;await previousTask?.destroy()
  if(disposed||current!==epoch)return
  positionError.value='';positionBusy.value=false;positionRevision=0;applyingPosition=false
  navigationOpen.value=false;modeForm.value=false;pageForm.value=false;selectionIssue.value=''; loading.value = true; loadError.value = ''; fingerprint.value = ''; annotationSource.value=undefined; annotations.value=[]; pageText.value = ''; renderError.value = ''
  try {
    const source = await props.storage.readPdf(requestedIdentity)
    if (disposed || current !== epoch) return
    const bytes = base64Bytes(source.base64); validatePdfBytes(bytes); fingerprint.value = source.signature
    if (bytes.length !== source.bytes || await hashBytes(bytes) !== fingerprint.value) throw new Error('PDF 读取内容未通过完整性核对，请重新读取。')
    if(props.reference && fingerprint.value!==props.reference.sourceSignature) throw new Error('原 PDF 内容已变化，未按旧链接定位；笔记摘录仍保留，请返回笔记核对。')
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (disposed || current !== epoch) return
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const base = new URL('./pdf/', window.location.href).href
    const loadingTask = pdfjs.getDocument({ data: bytes, enableXfa: false, useWasm: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', canvasMaxAreaInBytes: 16_000_000 })
    task = loadingTask
    loadingTask.onPassword = (update:(password:string)=>void,reason:number) => {
      if(disposed || current !== epoch || task !== loadingTask)return
      passwordGate.request(update,reason)
    }
    const pdf = await loadingTask.promise
    if (disposed || current !== epoch) { await loadingTask.destroy(); return }
    clearPassword()
    const allowed=await readPdfAccess(pdf)
    if(disposed || current!==epoch){await loadingTask.destroy();return}
    const session=createPdfReadingSession(identityKey(requestedIdentity),props.storage,phase=>positionPhase(current,phase),undefined,point=>{if(point?.fingerprint===source.signature&&point.page>pdf.numPages)throw Error('上次阅读页码无法核对，原记录仍保留。')})
    readingSession=session
    let saved:PdfPoint|null=null;try{saved=await session.load()}catch{/* An unreadable checkpoint must not prevent opening the PDF. */}
    if(disposed||current!==epoch){await loadingTask.destroy();return}
    access.value=allowed;document.value=pdf
    annotationSource.value={pdfFile:requestedIdentity.relativePath.split('/').pop()!,size:source.bytes,modifiedAt:Math.floor(source.modified/1000),fingerprint:pdf.fingerprints[0]||undefined}
    restorePosition(saved)
    referenceHandled=false; referenceAnnotation.value=''
    if(props.reference){if(props.reference.page<=pdf.numPages){pageNumber.value=props.reference.page;pendingFraction=0;pendingHorizontal=0;pendingContinuousOffset=0;pendingContinuousInset=0}else{referenceHandled=true;referenceStatus.value='引用页码超出范围，未按旧链接定位；笔记摘录仍保留。'}}
    loading.value = false; await nextTick(); await renderPage()
  } catch (e) { if (!disposed && current === epoch) { clearPassword();loadError.value = humanStorageError(e); loading.value = false } }
}
async function renderPage() {
  const pdf = document.value, host = viewport.value
  if (!pdf || !host || disposed || loading.value) return
  cancelPinch()
  if(continuousActive.value){
    const current=++renderEpoch;renderTask?.cancel();textLayer?.cancel();clearSelection();rendering.value=true
    await nextTick()
    const target=pendingAnchorPage||pageNumber.value
    await continuousView.value?.refresh({page:target,offset:pendingContinuousOffset??0,inset:pendingContinuousInset,horizontal:pendingHorizontal,anchor:pendingAnchor,rect:pendingRect?rotatePdfRect(pendingRect,rotation.value):undefined})
    if(disposed||current!==renderEpoch)return
    pendingAnchor=undefined;pendingAnchorPage=undefined;pendingContinuousOffset=undefined;pendingContinuousInset=0;pendingRect=undefined;pendingFraction=null;pendingHorizontal=0;rendering.value=false;flush();return
  }
  const current = ++renderEpoch, n = pageNumber.value
  clearSelection(); textLayer?.cancel(); textLayerHost.value?.replaceChildren()
  const previous = renderTask; previous?.cancel(); rendering.value = true; renderError.value = ''; pageText.value = ''
  try {
    await previous?.promise.catch(() => {})
    const page = await pdf.getPage(n)
    if (current !== renderEpoch || disposed) return
    try { const value = await text(pdf,n); if (current !== renderEpoch || disposed) return; pageText.value = value }
    catch (e) { if (current !== renderEpoch || disposed) return; renderError.value = humanStorageError(e) }
    await nextTick()
    const element = canvas.value; if (!element) return
    const initial = page.getViewport({ scale: 1, rotation:pdfRotation(page.rotate+rotation.value) }), size = pdfCanvasSize(initial.width, initial.height, Math.max(80, host.clientWidth - 32), zoom.value, window.devicePixelRatio || 1), view = page.getViewport({ scale: size.scale, rotation:pdfRotation(page.rotate+rotation.value) })
    element.width = size.width; element.height = size.height; element.style.width = `${view.width}px`; element.style.height = `${view.height}px`
    const context = element.getContext('2d'); if (!context) throw new Error('设备暂时无法显示 PDF 页面。')
    if (!textMode.value) { renderTask = page.render({ canvas: element, canvasContext: context, viewport: view, transform: [size.dpr,0,0,size.dpr,0,0], annotationMode: 1 }); await renderTask.promise }
    if (current !== renderEpoch || disposed) return
    const layer=textLayerHost.value
    if (!textMode.value && layer && !renderError.value) {
      const content=await page.getTextContent()
      if (current !== renderEpoch || disposed) return
      const {TextLayer}=await import('pdfjs-dist/legacy/build/pdf.mjs')
      if (current !== renderEpoch || disposed) return
      layer.style.width=`${view.width}px`;layer.style.height=`${view.height}px`;layer.style.setProperty('--total-scale-factor',String(view.scale))
      textLayer=new TextLayer({container:layer,textContentSource:content,viewport:view});sizePdfTextLayer(layer,view); await textLayer.render()
    }
    if (current !== renderEpoch || disposed) return
    // The loading line must leave layout before measuring the final paper or
    // scroll extent; otherwise every reopen drifts by that line's height.
    rendering.value = false
    await nextTick()
    if (current !== renderEpoch || disposed) return
    if (pendingFraction !== null) { host.scrollTop = pendingFraction * Math.max(0,host.scrollHeight - host.clientHeight); host.scrollLeft = pendingHorizontal * Math.max(0,host.scrollWidth - host.clientWidth); pendingFraction = null; pendingHorizontal = 0 }
    if (pendingAnchor && paper.value) {
      const box = paper.value.getBoundingClientRect(), bounds = host.getBoundingClientRect()
      const point = pdfAnchorScroll(pendingAnchor, box, { x: host.scrollLeft, y: host.scrollTop }, bounds, { x: host.scrollWidth, y: host.scrollHeight })
      host.scrollLeft = point.x; host.scrollTop = point.y; pendingAnchor = undefined
    }
    if (pendingRect) {host.scrollTop=Math.max(0,rotatePdfRect(pendingRect,rotation.value).y*view.height-24);pendingRect=undefined}
  } catch (e) { if (current === renderEpoch && !disposed && !/RenderingCancelled/.test(String(e))) renderError.value = `本页显示未完成：${humanStorageError(e)}。可重试或切换页面文字。` }
  finally { if (current === renderEpoch) { rendering.value = false; await nextTick(); if (current === renderEpoch) flush() } }
}
async function flush():Promise<boolean> {
  clearTimeout(scrollTimer)
  const host = viewport.value,session=readingSession,owner=epoch
  if(!session)return true
  if (!host || !document.value || !fingerprint.value || loading.value || rendering.value || pinch || pendingAnchor || pendingFraction !== null) return session.flush()
  const point=continuousActive.value?continuousView.value?.point():{page:pageNumber.value,fraction:pdfScrollFraction(host.scrollTop,host.scrollHeight,host.clientHeight),horizontal:pdfScrollFraction(host.scrollLeft,host.scrollWidth,host.clientWidth),...(readingMode.value==='continuous'?{pageOffset:0,pageInset:0}:{})}
  if(!point)return session.flush()
  const b=host.getBoundingClientRect(),focus={x:b.x+b.width/2,y:b.y+12},source=continuousActive.value?continuousView.value?.getAnchor(focus):undefined
  const anchor=source?.anchor||(!textMode.value&&paper.value?pdfAnchorAt(focus,paper.value.getBoundingClientRect(),b):undefined)
  if(anchor)layoutAnchor={page:source?.page||pageNumber.value,anchor}
  try {const saved=await session.save({...point,fingerprint:fingerprint.value,mode:readingMode.value,rotation:rotation.value,zoom:zoom.value,updated:Date.now()});if(saved&&!disposed&&owner===epoch&&session===readingSession){positionError.value='';positionStatus.value='已记住阅读位置'}return saved}
  catch {positionPhase(owner,'save-error');return false}
}
function scheduleFlush(){clearTimeout(scrollTimer);scrollTimer=setTimeout(flush,200)}
function scroll() { if(continuousActive.value&&!pinch)continuousView.value?.onScroll();if(pendingFraction===null&&!pendingAnchor&&!pinch&&!rendering.value){if(!applyingPosition)positionRevision++;scheduleFlush()} }
function changePage(n: number) { if (!document.value || n < 1 || n > document.value.numPages) return; positionRevision++;cancelPinch(); flush(); pendingAnchor = undefined;pendingAnchorPage=undefined;pendingContinuousOffset=0;pendingContinuousInset=0; pendingHorizontal = 0; pageNumber.value = n; pendingFraction = 0; void renderPage() }
function setZoom(n: number) {
  if (rendering.value || textMode.value || !transformPaper() || !viewport.value) return
  positionRevision++;cancelPinch(); flush()
  const host = viewport.value.getBoundingClientRect()
  const focus={x:host.x+host.width/2,y:host.y+host.height/2},source=continuousActive.value?continuousView.value?.getAnchor(focus):undefined
  pendingAnchor=source?.anchor||pdfAnchorAt(focus,paper.value!.getBoundingClientRect(),host);pendingAnchorPage=source?.page
  zoom.value = pdfZoom(n); void renderPage()
}
function closePageForm() { pageForm.value = false; void nextTick(() => pageButton.value?.focus({ preventScroll: true })) }
async function togglePageForm() { cancelPinch(); if (pageForm.value) { closePageForm(); return }; if (notes.value && !await notes.value.dismiss()) return; if(await navigation.value?.hide()===false)return; flush(); cancelSearch(); pageForm.value = true }
function confirmPage(n:number) { if (n !== pageNumber.value) { search.value?.hide(); changePage(n) }; closePageForm() }
function cancelSearch() { search.value?.stop() }
async function toggleSearch() { cancelPinch();if(searchOpen.value){search.value?.hide();return};if(notes.value&&!await notes.value.dismiss())return;if(await navigation.value?.hide()===false)return;pageForm.value=false;flush();await search.value?.show() }
function selectResult(n:number) { if(n!==pageNumber.value)changePage(n) }
function back() { if(moreOpen.value){closeMore();return true};if(passwordPhase.value!=='idle'){requestClose();return true};if(permissionsOpen.value)return permissionsView.value?.back()||false;if(settingsView.value?.back())return true;if(pageForm.value){closePageForm();return true};if(searchOpen.value&&search.value?.back())return true;if(navigation.value?.back())return true;if(notes.value?.back())return true;if(searchPreview.value&&notes.value){void notes.value.dismiss().then(ok=>{if(ok)search.value?.back()});return true};return search.value?.back()||false }
function readerBack(){if((annotationPreview.value||searchPreview.value)&&back())return;requestClose()}
watch(textMode, () => { cancelPinch(); pendingAnchor = undefined; pendingHorizontal = 0;pendingContinuousOffset=0;pendingContinuousInset=0; pendingFraction = 0; void nextTick(renderPage) })
function clearSelection() { selectionIssue.value='';selection.value=null; window.getSelection()?.removeAllRanges() }
function selected() {
  if(permissionsOpen.value||modeForm.value)return
  if(!access.value.copy){selection.value=null;selectionIssue.value='';return}
  if (pinch) { selection.value = null; return }
  if(continuousActive.value){const value=continuousView.value?.selection();selectionIssue.value=value?.issue||'';if(value&&'page' in value&&value.page){pageNumber.value=value.page;selection.value={quote:value.quote!,rects:value.rects!.map(r=>rotatePdfRect(r,-rotation.value))}}else selection.value=null;return}
  const s=window.getSelection(), host=textLayerHost.value
  if (!s?.rangeCount || s.isCollapsed || !host || !host.contains(s.anchorNode) || !host.contains(s.focusNode) || rendering.value || textMode.value) {selection.value=null;return}
  const quote=s.toString().trim()
  if (!quote || Array.from(quote).length>20000) {selection.value=null;return}
  try {const rects=normalizedPdfRects(s.getRangeAt(0).getClientRects(),host.getBoundingClientRect());selection.value=rects.length?{quote,rects:rects.map(r=>rotatePdfRect(r,-rotation.value))}:null} catch {selection.value=null}
}
function annotationPage(n:number,r?:PdfAnnotationRect) {textMode.value=false;pendingRect=r;changePage(n)}
function annotationsLoaded(model:PdfAnnotationDocument|null,error:string) {
  if(!props.reference || !document.value || props.reference.page>document.value.numPages) return
  if(error || !model){referenceHandled=true;referenceAnnotation.value='';referenceStatus.value='批注来源暂不可核对，已打开引用页；笔记摘录仍保留。';return}
  const target=model.annotations.find(a=>a.id===props.reference!.annotationId)
  if(referenceHandled){referenceAnnotation.value=target?.id||'';referenceStatus.value=target?`第 ${target.page} 页批注可回看；摘录内容以笔记为准。`:'引用批注已删除，笔记摘录仍保留。';return}
  referenceHandled=true
  if(!target){referenceStatus.value=`原批注已删除，已打开第 ${props.reference.page} 页；笔记摘录仍保留。`;return}
  referenceAnnotation.value=target.id;referenceStatus.value=`已定位第 ${target.page} 页批注；摘录内容以笔记为准。`;annotationPage(target.page,target.rects[0])
}
function settingsChanged(open:boolean){modeForm.value=open;if(!open){const saved=settingsSelection;settingsSelection=undefined;void nextTick(()=>{if(!modeForm.value&&!searchOpen.value&&!navigationOpen.value&&!pageForm.value&&!permissionsOpen.value){(settingsButton.value||moreButton.value)?.focus({preventScroll:true});restoreReaderSelection(saved)}})}}
async function openSettings(){if(notes.value&&!await notes.value.dismiss())return;settingsSelection=captureReaderSelection();if(await navigation.value?.hide()===false)return;cancelPinch();flush();pageForm.value=false;if(searchOpen.value)search.value?.hide();await settingsView.value?.show()}
function closeMode(){settingsView.value?.hide()}
function applySettingsZoom(value:number){if(value!==zoom.value)setZoom(value)}
async function changeMode(next:'single'|'continuous'){
  if(next===readingMode.value){closeMode();return}
  const host=viewport.value;if(!host||!document.value)return
  positionRevision++;cancelPinch();flush();const bounds=host.getBoundingClientRect(),focus={x:bounds.x+bounds.width/2,y:bounds.y+12},source=continuousActive.value?continuousView.value?.getAnchor(focus):undefined
  pendingAnchor=source?.anchor||(paper.value?pdfAnchorAt(focus,paper.value.getBoundingClientRect(),bounds):undefined);pendingAnchorPage=source?.page||pageNumber.value;pageNumber.value=pendingAnchorPage;pendingFraction=null;clearSelection();readingMode.value=next;closeMode();await nextTick();await renderPage()
}
async function changeRotation(next:PdfRotation){
  const host=viewport.value;if(!host||!document.value||rendering.value||next===rotation.value)return
  positionRevision++;cancelPinch();flush();const b=host.getBoundingClientRect(),focus={x:b.x+b.width/2,y:b.y+b.height/2},source=continuousActive.value?continuousView.value?.getAnchor(focus):undefined
  const anchor=source?.anchor||(paper.value?pdfAnchorAt(focus,paper.value.getBoundingClientRect(),b):undefined)
  if(anchor)pendingAnchor=rotatePdfAnchor(anchor,next-rotation.value)
  pendingAnchorPage=source?.page||pageNumber.value;pageNumber.value=pendingAnchorPage;pendingFraction=null;clearSelection();rotation.value=next;closeMode();await nextTick();await renderPage()
}
async function singlePage(n:number){if(notes.value&&!await notes.value.dismiss())return;positionRevision++;cancelPinch();flush();readingMode.value='single';pageNumber.value=n;pendingAnchor=undefined;pendingAnchorPage=undefined;pendingFraction=0;pendingHorizontal=0;await nextTick();await renderPage()}
async function protect() {return (await notes.value?.protect() ?? true) && (await navigation.value?.protect() ?? true)}
async function requestClose() {if (await protect()) {clearPassword();emit('close')}}
let observer: ResizeObserver | undefined, width = 0
onMounted(() => { window.document.addEventListener('selectionchange',selected);window.document.addEventListener('copy',guardCopy,true);window.document.addEventListener('cut',guardCopy,true);window.document.addEventListener('contextmenu',guardContext,true); observer = new ResizeObserver(() => { const next = viewport.value?.clientWidth || 0; if (next && next !== width) { cancelPinch();if(width && document.value && !loading.value && pendingFraction===null && !rendering.value && viewport.value){const b=viewport.value.getBoundingClientRect();if(layoutAnchor){pendingAnchor={page:{...layoutAnchor.anchor.page},viewport:{x:b.width/2,y:12}};pendingAnchorPage=layoutAnchor.page}}width=next;void renderPage() } }); if (viewport.value) observer.observe(viewport.value); window.addEventListener('longedit-mobile-pause',pause); window.addEventListener('pagehide',pause) })
watch(() => identityKey(props.identity),load,{ immediate: true })
onBeforeUnmount(() => { clearPassword();cancelPinch(); window.document.removeEventListener('selectionchange',selected);window.document.removeEventListener('copy',guardCopy,true);window.document.removeEventListener('cut',guardCopy,true);window.document.removeEventListener('contextmenu',guardContext,true);textLayer?.cancel(); flush(); disposed = true; epoch++; renderEpoch++; cancelSearch(); observer?.disconnect(); renderTask?.cancel(); void task?.destroy(); clearTimeout(scrollTimer); window.removeEventListener('longedit-mobile-pause',pause); window.removeEventListener('pagehide',pause) })
defineExpose({ back, flush, protect })
</script>
<style scoped>
.pdf-search-opener,.pdf-page-button{-webkit-tap-highlight-color:transparent}.pdf-page-button:active{filter:brightness(.95)}
.mobile-pdf { --pdf-paper-surround:#e1e5ea; --pdf-paper-edge:#cbd3dc; position:relative; display:flex; flex-direction:column; height:100%; min-height:0; flex:1; }
:global(.theme-dark .mobile-pdf) { --pdf-paper-surround:#202a34; --pdf-paper-edge:#46515d; }
.pdf-locked > :not(.pdf-password){visibility:hidden;pointer-events:none}
.pdf-locked .pdf-viewport{padding:0;background:var(--bg);min-height:0}.pdf-locked .reader-header{min-height:64px;gap:8px}.pdf-locked .document-heading{padding:0}.pdf-locked .document-heading h1{font-size:1.25rem}
.pdf-copy-restricted :deep(:is(.textLayer,.pdf-page-text,.pdf-results)){user-select:none;-webkit-user-select:none}.pdf-permissions-opener{font-weight:650;white-space:nowrap}
.pdf-source-change { font-size:.8125rem; margin:0; padding:6px 16px; color:var(--warning-ink); }
.reader-header { min-height:60px; padding:8px 12px; }.document-heading h1 { font-size:1.125rem; letter-spacing:0; }.document-heading>span { font-size:.6875rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }.pdf-footer .button { font-size:.875rem; }
.pdf-summary { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:48px; padding:0 16px; border-bottom:1px solid var(--line); color:var(--muted); font-size:.875rem; flex-shrink:0; }
.pdf-summary .text-button { margin-left:auto; gap:6px; }
.pdf-permissions-opener,.pdf-settings-opener,.pdf-navigation-opener { -webkit-tap-highlight-color:transparent; }
.pdf-navigation-opener:active { background:var(--panel); }
.has-pdf-permissions > :not(.pdf-permissions-task),.has-pdf-settings > :not(.pdf-settings-task),.has-pdf-search > :not(.pdf-search-task),.has-pdf-navigation > :not(.pdf-navigation) { visibility:hidden; pointer-events:none; }
.has-pdf-permissions .pdf-paper,.has-pdf-settings .pdf-paper,.has-pdf-search .pdf-paper,.has-pdf-navigation .pdf-paper{visibility:hidden!important}

.pdf-badge { background:#fae7e3; color:#a9443c; border-radius:999px; padding:4px 12px; font-size:.875rem; }
.pdf-viewport { flex:1; min-height:60px; overflow:auto; background:var(--pdf-paper-surround); padding:12px 16px; overscroll-behavior:contain; touch-action:pan-x pan-y; }
.pdf-viewport.pdf-text-mode {background:var(--panel);touch-action:auto}.pdf-viewport.pdf-can-swipe{touch-action:pan-y}.pdf-pinching {overflow:hidden}.pdf-pinching .textLayer {user-select:none;-webkit-user-select:none}.pdf-page-surface {transform-origin:0 0;outline:1px solid var(--pdf-paper-edge);outline-offset:-1px;}
.pdf-paper { width:max-content; min-width:100%; }.pdf-page-surface{position:relative;width:max-content;margin:0 auto}.pdf-page-surface canvas{border:0}.pdf-mark-layer{position:absolute;inset:0;pointer-events:none}.pdf-mark{position:absolute;mix-blend-mode:multiply}.pdf-mark.color-yellow{background:#ffe16a66}.pdf-mark.color-green{background:#88bc7c66}.pdf-mark.color-pink{background:#ed9cb566}.pdf-mark.color-blue{background:#88b9ed66}.pdf-mark.kind-area{background:transparent;outline:2px solid #c89200}
canvas { display:block; background:white; border:1px solid #d4ddd6; margin:0 auto; }
.pdf-render-status { margin:0 0 8px; font-size:.8125rem; }
.pdf-page-text { background:var(--surface); border:1px solid var(--line); padding:16px; border-radius:8px; }
.pdf-page-text h2 { font-size:1.1rem; }.pdf-page-text p { color:var(--muted); font-size:.8125rem; }.pdf-page-text pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; line-height:1.8; }
.pdf-footer { border-top:1px solid var(--line); padding:6px 16px 10px; flex-shrink:0; background:var(--bg); }
.pdf-pages{display:grid;grid-template-columns:minmax(72px,1fr) minmax(64px,1fr) minmax(72px,1fr);align-items:center;gap:12px}.pdf-bottom-action,.pdf-page-button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:8px 4px;font:inherit;line-height:1.5;border:0;background:transparent;color:var(--ink);min-width:0}.pdf-page-count{min-width:min(72px,100%);max-width:100%;padding:2px 8px;border-radius:10px;background:var(--primary-soft);text-align:center;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pdf-notes-target{display:block;min-width:0}.pdf-notes-target :deep(.pdf-notes-opener){display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;height:auto;border:0;border-radius:0;background:transparent;font:inherit;padding:8px 4px}
.pdf-file-stem{word-break:keep-all;overflow-wrap:anywhere}.pdf-file-suffix{white-space:nowrap}
.pdf-action-layer{position:absolute;inset:0;z-index:25;background:#172a2466;display:flex;align-items:flex-end}.pdf-action-menu{display:flex;flex-direction:column;width:100%;max-height:85%;background:var(--bg);color:var(--ink);border-radius:18px 18px 0 0;padding:8px 16px 16px;box-shadow:0 -8px 32px #172a2422}.pdf-action-menu header{display:flex;align-items:center;gap:8px;min-height:56px;flex:none}.pdf-action-menu h2{flex:1;min-width:0;margin:0;font-size:1.125rem;line-height:1.5}.pdf-action-menu .icon-button{width:48px;min-width:48px;height:48px;min-height:48px}.pdf-action-body{overflow:auto;min-height:0}.pdf-action-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;border:0;border-bottom:1px solid var(--line);background:none;padding:12px 0;text-align:start;font:inherit;line-height:1.5}.pdf-action-row span{flex:1;min-width:0;overflow-wrap:anywhere}.pdf-action-row svg{flex:none;color:var(--primary)}.pdf-action-paging{display:flex;gap:12px;margin-top:12px}.pdf-action-paging .button{flex:1;min-height:48px;font:inherit;display:flex;align-items:center;justify-content:center;gap:8px}.mobile-pdf>.reader-header{min-height:64px;padding:8px 12px}.mobile-pdf>.reader-header .icon-button{width:48px;height:48px;min-height:48px;min-width:48px;flex:none}.mobile-pdf>.reader-header .document-heading{min-width:0;padding:0 4px}.mobile-pdf>.reader-header h1{font-size:1.125rem;line-height:1.5;overflow-wrap:anywhere;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:clip}.pdf-footer{padding:8px 16px}
@media(max-width:360px){.pdf-pages{gap:4px}.pdf-notes-target :deep(.pdf-notes-opener),.pdf-bottom-action{gap:2px;flex-direction:column}.pdf-bottom-action span,.pdf-notes-target :deep(.pdf-notes-opener span){white-space:nowrap;flex:none}.pdf-bottom-action svg,.pdf-notes-target :deep(.pdf-notes-opener svg){flex:none}.mobile-pdf>.reader-header{padding-inline:8px}}
@media(max-height:400px){.pdf-summary{display:none}.reader-header{min-height:52px;padding:4px 12px}.pdf-viewport{min-height:40px}.pdf-footer{padding:4px 12px}}
@media(max-width:360px) { .pdf-position small { display:none; }.pdf-footer { padding-left:12px; padding-right:12px; } }
.textLayer{--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size));position:absolute;inset:0;overflow:clip;line-height:1;text-align:initial;transform-origin:0 0;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;user-select:text;-webkit-user-select:text}
.textLayer :deep(span),.textLayer :deep(br){position:absolute;color:transparent;white-space:pre;cursor:text;transform-origin:0 0}
.textLayer :deep(> :not(.markedContent)),.textLayer :deep(.markedContent span:not(.markedContent)){--font-height:0;--scale-x:1;--rotate:0deg;font-size:calc(var(--text-scale-factor) * var(--font-height));transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer :deep(.markedContent){display:contents}.textLayer :deep(::selection){background:#407ab955}
.pdf-reference-context{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 16px;min-height:56px;max-height:30dvh;overflow:auto;flex-shrink:0;background:var(--primary-soft);border-bottom:1px solid var(--line);font-size:.8125rem}.pdf-reference-context>div{flex:1;min-width:120px}.pdf-reference-context strong{font-weight:600}.pdf-reference-context p{font-size:.75rem;color:var(--muted);margin:3px 0;line-height:1.5}.pdf-reference-context .button{font-size:.8125rem;padding:8px}.pdf-mark.is-reference{outline:2px solid #315f49;outline-offset:1px}
@media(max-height:260px){.pdf-reference-context{display:none}}

.has-pdf-annotation-editor > :not(.pdf-annotation-editor){visibility:hidden;pointer-events:none}
.has-pdf-annotation-editor .pdf-paper{visibility:hidden!important}

.has-pdf-annotations > :not(.pdf-notes-panel):not(.pdf-annotation-editor):not(.pdf-reading-note-task){visibility:hidden;pointer-events:none}
.has-pdf-annotations .pdf-paper{visibility:hidden!important}
</style>
