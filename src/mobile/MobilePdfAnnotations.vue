<template>
  <Teleport v-if="openerTarget" :to="openerTarget"><button ref="opener" class="pdf-notes-opener" :class="compactOpener?'icon-button':'text-button'" :aria-label="`批注 ${model?.annotations.length||0}`" :aria-expanded="open" @click="show"><MessageSquare :size="compactOpener?22:18" aria-hidden="true" /><span v-if="compactOpener">批注</span><template v-else>批注 {{ model?.annotations.length||0 }}</template></button></Teleport>
  <div v-if="selection&&!open&&!obscured" class="pdf-selection-actions" role="region" aria-label="选文操作" @pointerdown.prevent><span>{{ canModify?`已选择 ${Array.from(selection.quote).length} 字`:'文档限制批注，仍可复制文字' }}</span><button class="button" :disabled="!writable||busy||!!draft" @click="start(selection)">高亮与评论</button><button class="icon-button" aria-label="取消 PDF 选文" @click="emit('clear')"><X :size="19" aria-hidden="true" /></button></div>
  <section v-if="open" class="pdf-notes-panel" :inert="mobileHelpOpen||view==='organize'||undefined" :aria-hidden="view==='organize'?true:undefined" role="region" aria-label="PDF 批注与摘录" @keydown.esc.stop.prevent="back">
    <div v-show="view!=='organize'" class="pdf-notes-surface" :inert="!!modal||editorOpen||undefined" :aria-hidden="modal||editorOpen?true:undefined">
      <header class="pdf-notes-heading"><button class="pdf-notes-back" :aria-label="view==='list'?'关闭批注':'返回批注列表'" :disabled="busy" @click="back"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">{{ title }}</h1><button v-if="view==='list'" class="pdf-notes-more" data-annotation-focus="filter" :class="{'is-active':filterActive}" aria-label="筛选批注" @click="openFilters($event.currentTarget as HTMLElement)"><Filter :size="22" aria-hidden="true" /></button><button v-if="view==='list'" class="pdf-notes-more" data-annotation-focus="more" aria-label="批注操作" aria-haspopup="dialog" :aria-expanded="modal==='list-actions'" @click="openModal('list-actions',$event.currentTarget as HTMLElement)"><EllipsisVertical :size="22" aria-hidden="true" /></button><MobileHelp v-if="view!=='list'" :topic="view==='filters'?'annotationFilters':'annotationList'" /></header>
      <div class="pdf-notes-context assistive-status"><p>{{ pdfReadingTitle(identity.relativePath) }}.pdf</p><span>{{ view==='detail'&&detail?`第 ${detail.page} 页 · ${kind(detail)}`:`当前第 ${page} 页` }}</span></div>
      <div ref="body" class="pdf-notes-body" @focusin="rememberBodyFocus" tabindex="0" role="region" :aria-label="title+'内容'">
        <p v-if="error&&!modal" class="pdf-notes-error" role="alert">{{ error }}</p><p v-if="loading" role="status">正在读取批注…</p><p v-if="deletionError" class="pdf-notes-error" role="alert">{{ deletionError }}</p>
        <aside v-if="view!=='filters'&&(journal?.undo||journal?.pending)" class="pdf-deletion-recovery" aria-label="最近删除的批注"><div><strong>{{ journal.pending?'删除待核对':`已删除第 ${journal.undo!.annotation.page} 页批注` }}</strong><p>{{ summary((journal.pending||journal.undo)!.annotation) }}</p><p v-if="journal.pending">上次保存尚未确认，请重新读取批注核对。</p><p v-else-if="journal.undo?.sourceSignature!==signature">原 PDF 已变化，恢复摘录仍保留，暂不恢复到这份文件。</p></div><button v-if="journal.pending" class="button" :disabled="busy||loading||!!draft" @click="reloadAnnotations">重新读取核对</button><button v-else ref="undoButton" class="button" :disabled="!canUndo" @click="undoDeletion"><Undo2 :size="18" aria-hidden="true" />撤销删除</button></aside>
        <p v-if="blockedDraft" class="sheet-hint" role="status">本机有未完成的批注输入，当前权限下继续保留，暂不修改或替换。</p><p v-if="!canModify" class="sheet-hint" role="status">这份 PDF 限制修改批注；已有记录与输入继续保留。</p><p v-if="!canCopy" class="sheet-hint" role="status">这份 PDF 限制复制和摘录；可阅读原版页面，暂不生成摘录笔记。</p><p v-if="!local" class="sheet-hint">来源文件夹中的 PDF 暂时仅可阅读；请先导入手机资料库再批注。</p>
        <button v-if="draft&&view!=='filters'" ref="resumeButton" class="pdf-annotation-resume" @click="openEditor($event.currentTarget as HTMLElement)"><span><strong>继续这次输入</strong><small>第 {{ draft.annotation.page }} 页 · {{ kind(draft.annotation) }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
        <article v-if="view==='detail'&&detail" class="pdf-annotation-detail"><div class="pdf-annotation-detail-meta"><i class="pdf-swatch" :class="'color-'+detail.color" aria-hidden="true" /><span>{{ colors[detail.color] }}</span><span v-if="selectedIds.includes(detail.id)"> · 已选入笔记</span><button class="pdf-notes-more" data-annotation-focus="detail-more" aria-label="这条批注的操作" aria-haspopup="dialog" @click="openModal('detail-actions',$event.currentTarget as HTMLElement)"><Ellipsis :size="22" aria-hidden="true" /></button></div><section v-if="canCopy&&detail.quote"><h2>原文摘录</h2><blockquote><MobilePdfExcerpt :text="detail.quote" :color="detail.color" /></blockquote></section><section v-if="detail.comment"><h2>我的想法</h2><p>{{ detail.comment }}</p></section><p v-if="!canCopy&&detail.quote&&!detail.comment" role="status">这条批注的原文摘录受限。</p><button class="pdf-annotation-return" :disabled="busy||!!sourceError||detail.page>pages" @click="returnTo(detail)"><BookOpen :size="20" aria-hidden="true" />回到原文<ChevronRight :size="20" aria-hidden="true" /></button></article>
        <div v-else-if="view==='filters'" class="pdf-annotation-filter-task"><fieldset><legend>标记颜色</legend><div class="pdf-filter-choices"><label v-for="(label,c) in filterColors" :key="c" class="pdf-filter-choice"><i v-if="c!=='all'" class="pdf-swatch" :class="'color-'+c" aria-hidden="true" /><span>{{ label }}</span><input v-model="preparedColor" type="radio" name="pdf-annotation-filter-color" :value="c" :data-annotation-focus="'filter-color-'+c" /></label></div></fieldset><label class="pdf-filter-switch"><span>仅当前页<small>第 {{ page }} 页</small></span><input v-model="preparedPage" type="checkbox" data-annotation-focus="filter-page" /></label><label v-if="selectedIds.length||preparedSelected" class="pdf-filter-switch"><span>仅看已选摘录<small>已选 {{ selectedIds.length }} 条</small></span><input v-model="preparedSelected" type="checkbox" data-annotation-focus="filter-selected" :disabled="!selectedIds.length&&!preparedSelected" /></label><button class="pdf-filter-reset button" @click="resetPrepared">重置筛选</button></div>
        <template v-else-if="view==='list'&&model">
          <button v-if="selectedIds.length" class="pdf-annotation-resume" :disabled="!canCopy||busy||!!sourceError" @click="openOrganize"><span><strong>已选 {{ selectedIds.length }} 条摘录</strong></span><ChevronRight :size="20" aria-hidden="true" /></button><p v-if="selectionMessage" role="status" class="sheet-hint">{{ selectionMessage }}</p>
          <div v-show="queryOpen" class="pdf-annotation-search"><button class="pdf-notes-more" aria-label="关闭批注查找" @click="closeQuery"><ArrowLeft :size="22" aria-hidden="true" /></button><div class="pdf-annotation-query-wrap"><Search :size="20" aria-hidden="true" /><input id="pdf-annotation-query" ref="queryInput" v-model="query" type="search" maxlength="200" :aria-label="canCopy?'查找摘录或想法':'查找想法'" :placeholder="canCopy?'查找摘录或想法':'查找想法'" @input="query=($event.target as HTMLInputElement).value" /><button v-if="query" class="pdf-annotation-query-clear" aria-label="清空批注搜索" @click="clearQuery"><X :size="18" aria-hidden="true" /></button></div></div>
          <button v-if="query&&!queryOpen" class="pdf-annotation-query-chip" @click="openQuery">查找：{{ query }}<Search :size="18" aria-hidden="true" /></button>
          <div v-if="color!=='all'||onlyPage||onlySelected" class="pdf-applied-filters"><button data-annotation-focus="applied-filters" @click="openFilters($event.currentTarget as HTMLElement)">{{ appliedLabel }}</button><button aria-label="清空批注筛选" @click="clearApplied"><X :size="18" aria-hidden="true" /></button></div><p class="pdf-annotation-count assistive-status" role="status">{{ filterActive?`找到 ${listedAnnotations.length} 条 · 共 ${model.annotations.length} 条`:`全部 ${model.annotations.length} 条` }}</p>
          <ol v-if="visibleAnnotations.length" class="pdf-annotation-list pdf-notes-list"><li v-for="a in visibleAnnotations" :key="a.id" class="pdf-note-card" :class="{'is-reference':a.id===activeReference,'is-selected':selectedIds.includes(a.id)}" :data-pdf-annotation="a.id">
            <button class="pdf-annotation-link" :data-annotation-focus="a.id" @click="openDetail(a.id,$event.currentTarget as HTMLElement)"><span class="pdf-annotation-meta"><span class="pdf-annotation-page">第 {{ a.page }} 页</span><span v-if="selectedIds.includes(a.id)" class="pdf-annotation-chosen">已选入笔记</span></span><span class="pdf-annotation-excerpt"><MobilePdfExcerpt v-if="canCopy&&a.quote" :text="a.quote" :color="a.color" :limit="180" /><span v-else>{{ summary(a) }}</span></span><span class="pdf-annotation-comment-state"><MessageSquare :size="18" aria-hidden="true" />{{ a.comment?'有评论':'无评论' }}<span v-if="!canCopy&&a.quote" class="assistive-status"> · 原文摘录受限</span></span></button>
            <button class="pdf-annotation-row-more pdf-notes-more" :data-annotation-focus="a.id+'-more'" :aria-label="'批注操作：第 '+a.page+' 页 · '+summary(a)" aria-haspopup="dialog" @click="openModal('detail-actions',$event.currentTarget as HTMLElement,a.id)"><EllipsisVertical :size="20" aria-hidden="true" /></button>
          </li></ol>
          <div v-else class="pdf-notes-empty-state"><MessageSquare v-if="!model.annotations.length" :size="38" aria-hidden="true" /><Search v-else :size="38" aria-hidden="true" /><h2>{{ model.annotations.length?'没有匹配的批注':'还没有批注' }}</h2><button v-if="!model.annotations.length" class="button primary-button" :disabled="!!draft||!writable||busy" @click="start(undefined,$event.currentTarget as HTMLElement)">添加本页评论</button><button v-if="model.annotations.length" class="button" @click="clearAll">清空搜索与筛选</button></div><button v-if="visibleCount<listedAnnotations.length" class="button" @click="visibleCount+=50">再显示 50 条批注</button>
        </template><button v-else-if="!loading" class="button" :disabled="busy||!!draft" @click="reloadAnnotations">重新读取批注</button>
      </div>
      <footer v-if="view==='filters'" class="pdf-notes-footer"><button class="button primary-button" :disabled="busy||loading" @click="applyFilters">应用筛选</button></footer>
      <footer v-else-if="view==='detail'&&detail" class="pdf-notes-footer"><button v-if="draft?.annotation.id===detail.id" ref="detailResume" class="button primary-button" @click="openEditor($event.currentTarget as HTMLElement)">继续输入</button><button v-else class="button primary-button" :disabled="!!draft||!writable||busy||(!canCopy&&!!detail.quote)" @click="edit(detail,$event.currentTarget as HTMLElement)">编辑批注</button></footer>

    </div>
    <div v-if="modal" class="pdf-notes-layer" :class="{'is-confirmation':modal==='delete'}" @click.self="closeModal"><section ref="dialog" class="pdf-notes-dialog" role="dialog" aria-modal="true" :aria-label="modalTitle" @keydown.tab.prevent="modalTab" @keydown.esc.stop.prevent="closeModal"><header class="pdf-notes-dialog-header"><h2 ref="dialogHeading" tabindex="-1">{{ modalTitle }}</h2><button class="pdf-notes-close" :aria-label="modal==='delete'?'返回批注操作':view==='detail'?'返回详情':'返回批注列表'" :disabled="busy" @click="closeModal"><X :size="22" aria-hidden="true" /></button></header><div ref="dialogBody" class="pdf-notes-dialog-body" role="region" :aria-label="modalTitle+'内容'" tabindex="0">
      <p v-if="modal!=='list-actions'&&modalAnnotation" class="pdf-annotation-target"><strong>{{ summary(modalAnnotation) }}</strong><small>第 {{ modalAnnotation.page }} 页 · {{ kind(modalAnnotation) }}</small></p>
      <template v-if="modal==='delete'"><p class="pdf-delete-copy">删除这条批注？原 PDF 和已生成的笔记仍保留。</p><p v-if="journal?.undo" class="pdf-delete-copy">确认后会替换上次删除的恢复记录。</p><button v-if="journal?.pending" class="button" :disabled="busy||loading||!!draft" @click="reloadAnnotations">重新读取核对</button></template>
      <template v-else-if="modal==='detail-actions'"><button v-if="view==='list'" class="pdf-notes-dialog-choice" :disabled="!!draft||!writable||busy||(!canCopy&&!!modalAnnotation?.quote)" @click="editModal"><PenLine :size="20" aria-hidden="true" />编辑批注</button><button v-if="view==='list'" class="pdf-notes-dialog-choice" data-note-action="reference" :disabled="busy||!!sourceError||!modalAnnotation||modalAnnotation.page>pages" @click="modalAnnotation&&returnTo(modalAnnotation)"><BookOpen :size="20" aria-hidden="true" />回到原文</button><button class="pdf-notes-dialog-choice" :disabled="!canCopy||busy||!!sourceError" @click="chooseDetail"><CheckSquare :size="20" aria-hidden="true" />{{ modalAnnotation&&selectedIds.includes(modalAnnotation.id)?'移出阅读笔记':'选入阅读笔记' }}</button><button class="pdf-notes-dialog-choice danger" data-note-action="delete" :disabled="!canDelete" @click="confirmDelete"><Trash2 :size="20" aria-hidden="true" />删除批注</button><button class="pdf-notes-dialog-choice" :disabled="busy||loading||!!draft" @click="reloadAnnotations"><RefreshCw :size="20" aria-hidden="true" />重新读取批注</button></template>
      <template v-else><button class="pdf-notes-dialog-choice" :disabled="!!draft||!writable||busy" @click="startFromMenu"><MessageSquare :size="20" aria-hidden="true" />添加本页评论</button><button class="pdf-notes-dialog-choice" @click="openQuery"><Search :size="20" aria-hidden="true" />查找批注</button><button class="pdf-notes-dialog-choice" :disabled="!canCopy||busy||!!sourceError" @click="openOrganize"><NotebookPen :size="20" aria-hidden="true" />整理阅读笔记</button><button class="pdf-notes-dialog-choice" :disabled="busy||loading||!!draft" @click="reloadAnnotations"><RefreshCw :size="20" aria-hidden="true" />重新读取批注</button><div class="pdf-notes-help-row"><span>批注说明</span><MobileHelp topic="annotationList" /></div></template><p v-if="error" class="pdf-notes-error" role="alert">{{ error }}</p>
    </div><footer v-if="modal==='delete'" class="pdf-notes-dialog-footer"><button class="button" :disabled="busy" @click="closeModal">{{ modal==='delete'?'保留批注':view==='detail'?'返回详情':'返回批注列表' }}</button><button v-if="modal==='delete'" class="button danger-button" :disabled="!canDelete" @click="modalAnnotation&&remove(modalAnnotation)">确认删除</button></footer></section></div>
  </section>
  <Teleport v-if="editorTarget&&draft" :to="editorTarget"><MobilePdfAnnotationEditor ref="editor" :open="open&&editorOpen" :name="pdfReadingTitle(identity.relativePath)+'.pdf'" :annotation="draft.annotation" :existing="!!model?.annotations.some(a=>a.id===draft!.annotation.id)"  :busy="busy" :protecting="recoveryWorking>0" :writable="writable" :can-copy="canCopy" :error="error" :protect="protect" @input="setComment" @color="draft.annotation.color=$event" @save="save" @discard="discard" @back="hideEditor" /></Teleport>
  <Teleport v-if="editorTarget" :to="editorTarget"><MobilePdfReadingNoteTask ref="curation" :open="open&&view==='organize'&&!editorOpen" :name="pdfReadingTitle(identity.relativePath)+'.pdf'" :page="page" :annotations="model?.annotations||[]" v-model:selectedIds="selectedIds" :can-copy="canCopy" :ready="!!model&&!sourceError" :loading="loading" :busy="busy" :error="error" :message="selectionMessage" :draft="draft?.annotation" :preview="preview" :note="note" :initial-query="query" :initial-color="color" :initial-page="onlyPage" :initial-selected="onlySelected" :prepare="()=>prepareNote(true)" :save-note="generate" @back="leaveOrganize" @reference="returnTo" @reload="reloadAnnotations" @resume="openEditor" @open-note="note&&emit('note',note)" @clear-error="error=''" /></Teleport>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import MobilePdfExcerpt from './MobilePdfExcerpt.vue'
import MobilePdfAnnotationEditor from './MobilePdfAnnotationEditor.vue'
import MobilePdfReadingNoteTask from './MobilePdfReadingNoteTask.vue'
import {mobileHelpOpen} from './mobileHelp'
import {canFocus,focusableControls} from './accessibility'
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { X, MessageSquare, NotebookPen, Trash2, Undo2, CheckSquare, ChevronRight, ArrowLeft, Ellipsis, Filter, EllipsisVertical, PenLine, BookOpen, Search, RefreshCw } from 'lucide-vue-next'
import { reconcileDeletion, restoreDeletedAnnotation, type PdfDeletionJournal } from './pdfDeletion'
import {readPdfRecovery,updatePdfRecovery,type PdfRecoveryState} from './pdfAnnotationRecovery'
import type { PdfAnnotation, PdfAnnotationDocument, PdfAnnotationSource, PdfAnnotationRect } from '../types/pdfAnnotations'
import { identityKey, humanStorageError, type Identity, type Storage } from './storage'
import { parseAnnotations, serializeAnnotations, pdfReadingTitle, type PdfAnnotationDraft } from './pdfAnnotations'
import { filterAnnotations, orderedAnnotations, addReadingSelection, curatedReadingNote } from './pdfCuration'
const props = withDefaults(defineProps<{ identity: Identity; storage: Storage; source: PdfAnnotationSource; signature: string; pages: number; page: number; selection: {quote: string;rects:PdfAnnotationRect[]}|null; openerTarget?:HTMLElement;editorTarget?:HTMLElement;compactOpener?:boolean;obscured?:boolean;canCopy?:boolean;canModify?:boolean }>(),{canCopy:true,canModify:true})
const emit = defineEmits<{ clear: []; goto: [page: number, rect?: PdfAnnotationRect]; note: [identity:Identity]; annotations:[annotations:PdfAnnotation[]]; loaded:[document:PdfAnnotationDocument|null,error:string];editing:[open:boolean];opened:[open:boolean];reference:[open:boolean] }>()
const colors = {yellow:'黄色',green:'绿色',pink:'粉色',blue:'蓝色'} as const
const open=ref(false), model=ref<PdfAnnotationDocument>(), loading=ref(true), busy=ref(false), error=ref(''), sourceError=ref(''), status=ref(''), draft=ref<PdfAnnotationDraft|null>(null), draftProtected=ref(false), visibleCount=ref(50), note=ref<Identity|null>(null)
const opener=ref<HTMLButtonElement>(), heading=ref<HTMLElement>()
const body=ref<HTMLElement>(), journal=ref<PdfDeletionJournal|null>(null), deletionError=ref(''), deleteId=ref(''), activeReference=ref('')
const blockedDraft=ref(false)
const copyDraft=(value:PdfAnnotationDraft|null|undefined):PdfAnnotationDraft|null=>value?JSON.parse(JSON.stringify(value)):null
let recovery:PdfRecoveryState|undefined,recoveryTail:Promise<unknown>=Promise.resolve(),changing=false
const recoveryWorking=ref(0)
function writeRecovery(patch:{draft?:PdfAnnotationDraft|null;journal?:PdfDeletionJournal|null}){
  const captured=JSON.parse(JSON.stringify(patch));recoveryWorking.value++
  const result=recoveryTail.then(async()=>{if(!recovery)throw Error('批注恢复记录尚未读取，原数据仍保留。');const value=await updatePdfRecovery(key(),recovery.token,captured,props.storage);recovery=value;return value}).finally(()=>{recoveryWorking.value--})
  recoveryTail=result.catch(()=>{});return result
}
async function persistDraft(){if(!draft.value)return true;const captured=JSON.parse(JSON.stringify(draft.value));draftProtected.value=false;try{await writeRecovery({draft:captured});draftProtected.value=JSON.stringify(draft.value)===JSON.stringify(recovery?.draft);if(draftProtected.value&&error.value.startsWith('输入暂存未完成：'))error.value='';return true}catch(e){error.value=`输入暂存未完成：${humanStorageError(e)}`;draftProtected.value=false;return false}}
async function transition(task:()=>Promise<void>){if(changing)return;changing=true;try{await task()}finally{changing=false}}
const editor=ref<InstanceType<typeof MobilePdfAnnotationEditor>>(),editorOpen=ref(false)
let listPlace:{scroll:number;focus?:HTMLElement}={scroll:0}
function captureList(target?:HTMLElement){captureView(target);listPlace={scroll:body.value?.scrollTop||0,focus:target||(document.activeElement instanceof HTMLElement?document.activeElement:undefined)}}
async function restoreList(){await nextTick();if(!open.value)return;if(body.value)body.value.scrollTop=listPlace.scroll;editorReturnFocus()?.focus({preventScroll:true})}
async function openEditor(target?:HTMLElement){if(!draft.value)return;captureList(target);open.value=true;editorOpen.value=true}
function editorReturnFocus(){if(canFocus(listPlace.focus))return listPlace.focus;if(canFocus(detailResume.value))return detailResume.value;if(canFocus(resumeButton.value)&&body.value){const r=resumeButton.value.getBoundingClientRect(),b=body.value.getBoundingClientRect();if(r.top>=b.top&&r.bottom<=b.bottom)return resumeButton.value}return heading.value}
function hideEditor(){void transition(async()=>{if(busy.value||!await protect())return;editorOpen.value=false;await restoreList()})}
function setComment(value:string){if(!draft.value)return;draft.value.annotation.comment=value;void persistDraft()}
watch(()=>!!(open.value&&editorOpen.value&&draft.value),value=>emit('editing',value),{immediate:true,flush:'sync'})
watch(draft,value=>{if(!value){editorOpen.value=false;void restoreList()}})
onBeforeUnmount(()=>{disposed=true;loadEpoch++;visibilityEpoch++;emit('editing',false);emit('opened',false);emit('reference',false)})

const local=computed(()=>props.identity.rootId==='local'), writable=computed(()=>!blockedDraft.value && props.canModify && local.value && !!model.value && !loading.value && !sourceError.value)
const canDelete=computed(()=>writable.value && !busy.value && !draft.value && !journal.value?.pending && !deletionError.value)
const canUndo=computed(()=>writable.value && !busy.value && !draft.value && !journal.value?.pending && !!journal.value?.undo && journal.value.undo.sourceSignature===props.signature && !model.value?.annotations.some(a=>a.id===journal.value!.undo!.annotation.id))
const query=ref(''), color=ref<PdfAnnotation['color']|'all'>('all'), onlyPage=ref(false), onlySelected=ref(false), selectedIds=ref<string[]>([]), selectionMessage=ref('')
const preview=ref<{document:PdfAnnotationDocument;content:string;revision:string;signature:string;target:Identity}|null>(null)
const filterActive=computed(()=>!!query.value.trim() || color.value!=='all' || onlyPage.value||onlySelected.value)
const filteredAnnotations=computed(()=>{const records=model.value?.annotations||[],candidates=props.canCopy?records:records.map(a=>({...a,quote:''}));const ids=new Set(filterAnnotations(candidates,{query:query.value,color:color.value,currentPage:onlyPage.value?props.page:null}).map(a=>a.id));return orderedAnnotations(records.filter(a=>ids.has(a.id)))})
const listedAnnotations=computed(()=>onlySelected.value?filteredAnnotations.value.filter(a=>selectedIds.value.includes(a.id)):filteredAnnotations.value)
const visibleAnnotations=computed(()=>listedAnnotations.value.slice(0,visibleCount.value))
watch([query,color,onlyPage,onlySelected,()=>props.page],()=>{visibleCount.value=50;deleteId.value=''})
watch(model,value=>{if(!value)return;const kept=selectedIds.value.filter(id=>value.annotations.some(a=>a.id===id));if(kept.length!==selectedIds.value.length){selectionMessage.value=`${selectedIds.value.length-kept.length} 条已选批注已删除，已移出选择。`;selectedIds.value=kept}})
function clearFilters(){query.value='';color.value='all';onlyPage.value=false;onlySelected.value=false;prepared=false}
function toggleSelection(id:string){try{selectedIds.value=selectedIds.value.includes(id)?selectedIds.value.filter(v=>v!==id):addReadingSelection(selectedIds.value,[id]);selectionMessage.value='';return true}catch(e){error.value=humanStorageError(e);return false}}
const curation=ref<InstanceType<typeof MobilePdfReadingNoteTask>>()
async function prepareNote(selected:boolean):Promise<boolean>{
  if(!props.canCopy||!model.value||busy.value||loading.value||draft.value||sourceError.value)return false
  error.value='';busy.value=true
  try{
    const state=await props.storage.readPdfAnnotations(props.identity)
    if(state.revision!==revision||state.sourceSignature!==props.signature)throw new Error('PDF 或批注已变化，请重新读取并核对选择。')
    const result=curatedReadingNote(props.identity.relativePath,model.value,selected?selectedIds.value:orderedAnnotations(model.value.annotations).map(a=>a.id),{rootId:props.identity.rootId,sourceSignature:props.signature})
    const name=Array.from(pdfReadingTitle(props.source.pdfFile).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')).slice(0,36).join('')||'PDF'
    // Returning to selection and retrying an unchanged snapshot reuses its target.
    const target=!note.value&&preview.value?.revision===revision&&preview.value.content===result.content?preview.value.target:{rootId:'local',relativePath:`${name}-阅读笔记-${crypto.randomUUID()}.md`}
    note.value=null;preview.value={...result,revision,signature:props.signature,target};return true
  }catch(e){error.value=humanStorageError(e);return false}finally{busy.value=false}
}
watch([model,sourceError],()=>emit('annotations',sourceError.value?[]:model.value?.annotations||[]))

type NotesView='list'|'detail'|'filters'|'organize'
type NotesModal=''|'list-actions'|'detail-actions'|'delete'
const view=ref<NotesView>('list'),modal=ref<NotesModal>(''),actionId=ref(''),queryOpen=ref(false),detailId=ref(''),detail=computed(()=>model.value?.annotations.find(a=>a.id===detailId.value)),modalSnapshot=ref<PdfAnnotation>(),modalAnnotation=computed(()=>model.value?.annotations.find(a=>a.id===actionId.value)||modalSnapshot.value||detail.value),referencePreview=ref(false)
const title=computed(()=>view.value==='detail'?'批注详情':view.value==='filters'?'筛选批注':view.value==='organize'?'整理笔记':'批注'),modalTitle=computed(()=>modal.value==='delete'?'删除批注？':'批注操作')
const queryInput=ref<HTMLInputElement>(),dialog=ref<HTMLElement>(),dialogBody=ref<HTMLElement>(),dialogHeading=ref<HTMLElement>(),undoButton=ref<HTMLButtonElement>(),detailResume=ref<HTMLButtonElement>(),resumeButton=ref<HTMLButtonElement>()
const filterColors={all:'全部颜色',...colors},preparedColor=ref<PdfAnnotation['color']|'all'>('all'),preparedPage=ref(false),preparedSelected=ref(false)
let prepared=false,visibilityEpoch=0,disposed=false,loadEpoch=0,modalOpener:HTMLElement|undefined
type NotesPlace={scroll:number;focus?:HTMLElement;key?:string;id?:string}
const modeFocuses=new Map<NotesView,HTMLElement>(),places=new Map<NotesView,NotesPlace>(),modalScrolls=new Map<NotesModal,number>()
let querySelection:{start:number|null;end:number|null;direction:'forward'|'backward'|'none'|null}|undefined
const kind=(a:PdfAnnotation)=>a.kind==='highlight'?'高亮':a.kind==='area'?'区域批注':'评论'
const snippet=(text:string,max=48)=>{const chars=Array.from(text.replace(/\s+/g,' ').trim());return chars.slice(0,max).join('')+(chars.length>max?'…':'')}
const summary=(a:PdfAnnotation)=>snippet(a.comment||(props.canCopy?a.quote:'原文摘录受限')||(a.kind==='area'?'区域标记':'高亮标记'))
const appliedLabel=computed(()=>[color.value==='all'?'':colors[color.value],onlyPage.value?`仅第 ${props.page} 页`:'',onlySelected.value?'仅看已选':''].filter(Boolean).join(' · '))
function captureQuery(){if(view.value==='list'&&queryInput.value){query.value=queryInput.value.value;querySelection={start:queryInput.value.selectionStart,end:queryInput.value.selectionEnd,direction:queryInput.value.selectionDirection}}}
function rememberBodyFocus(event:FocusEvent){if(event.target instanceof HTMLElement)modeFocuses.set(view.value,event.target)}
function captureView(target?:HTMLElement){captureQuery();const active=document.activeElement,element=target||(active instanceof HTMLElement&&body.value?.contains(active)?active:modeFocuses.get(view.value));places.set(view.value,{scroll:body.value?.scrollTop||0,focus:element,key:element?.dataset.annotationFocus,id:element?.id})}
async function restoreView(focus=true){await nextTick();if(!open.value)return;const place=places.get(view.value);if(body.value)body.value.scrollTop=place?.scroll||0;if(view.value==='list'&&queryInput.value&&querySelection?.start!=null)queryInput.value.setSelectionRange(querySelection.start,querySelection.end,querySelection.direction||undefined);if(focus){const target=canFocus(place?.focus)?place.focus:place?.key?[...(body.value?.closest('.pdf-notes-panel')?.querySelectorAll<HTMLElement>('[data-annotation-focus]')||[])].find(e=>e.dataset.annotationFocus===place.key):place?.id?body.value?.querySelector<HTMLElement>('#'+place.id):heading.value;(canFocus(target)?target:heading.value)?.focus({preventScroll:true})}}
function changeView(next:NotesView,target?:HTMLElement){void transition(async()=>{if(busy.value||!await protect())return;captureView(target);modal.value='';view.value=next;await restoreView()})}
function openDetail(id:string,target?:HTMLElement){void transition(async()=>{if(busy.value||!await protect()||!model.value?.annotations.some(a=>a.id===id))return;captureView(target);modal.value='';if(detailId.value!==id)places.delete('detail');detailId.value=id;view.value='detail';await restoreView()})}
function openFilters(target:HTMLElement){if(!prepared){preparedColor.value=color.value;preparedPage.value=onlyPage.value;preparedSelected.value=onlySelected.value;prepared=true}changeView('filters',target)}
function resetPrepared(){preparedColor.value='all';preparedPage.value=false;preparedSelected.value=false}
function applyFilters(){const changed=color.value!==preparedColor.value||onlyPage.value!==preparedPage.value||onlySelected.value!==preparedSelected.value;color.value=preparedColor.value;onlyPage.value=preparedPage.value;onlySelected.value=preparedSelected.value;if(changed){const place=places.get('list');places.set('list',{...place,scroll:0})}changeView('list')}
function clearApplied(){color.value='all';onlyPage.value=false;onlySelected.value=false;prepared=false}
function clearAll(){clearFilters();prepared=false;void openQuery()}
function clearQuery(){query.value='';void nextTick(()=>queryInput.value?.focus({preventScroll:true}))}
async function openQuery(){if(modal.value){await closeModal();if(modal.value)return}queryOpen.value=true;await nextTick();queryInput.value?.focus({preventScroll:true});if(queryInput.value&&querySelection?.start!=null)queryInput.value.setSelectionRange(querySelection.start,querySelection.end,querySelection.direction||undefined)}
function closeQuery(){captureQuery();queryOpen.value=false;void nextTick(()=>heading.value?.focus({preventScroll:true}))}
function startFromMenu(){const target=modalOpener;modal.value='';void start(undefined,target)}
function editModal(){const a=modalAnnotation.value,target=modalOpener;if(!a)return;modal.value='';edit(a,target)}

async function openModal(next:NotesModal,target:HTMLElement,id=detailId.value){await transition(async()=>{if(busy.value||!await protect())return;captureView();modalOpener=target;actionId.value=id;const a=model.value?.annotations.find(a=>a.id===id);modalSnapshot.value=a?JSON.parse(JSON.stringify(a)):undefined;modal.value=next;await nextTick();if(dialogBody.value)dialogBody.value.scrollTop=modalScrolls.get(next)||0;dialogHeading.value?.focus({preventScroll:true})})}
async function closeModal(){await transition(async()=>{if(busy.value||!await protect())return;modalScrolls.set(modal.value,dialogBody.value?.scrollTop||0);if(modal.value==='delete'){deleteId.value='';modal.value='detail-actions';await nextTick();if(dialogBody.value)dialogBody.value.scrollTop=modalScrolls.get('detail-actions')||0;dialog.value?.querySelector<HTMLElement>('[data-note-action="delete"]')?.focus({preventScroll:true});return}modal.value='';await nextTick();const key=modalOpener?.dataset.annotationFocus,target=canFocus(modalOpener)?modalOpener:key?[...(body.value?.closest('.pdf-notes-panel')?.querySelectorAll<HTMLElement>('[data-annotation-focus]')||[])].find(e=>e.dataset.annotationFocus===key):undefined;(canFocus(target)?target:heading.value)?.focus({preventScroll:true})})}
function confirmDelete(){if(!canDelete.value||!modalAnnotation.value)return;deleteId.value=modalAnnotation.value.id;modalScrolls.set(modal.value,dialogBody.value?.scrollTop||0);modal.value='delete';void nextTick(()=>dialogHeading.value?.focus({preventScroll:true}))}
function chooseDetail(){if(modalAnnotation.value&&toggleSelection(modalAnnotation.value.id))void closeModal()}
function openOrganize(){if(!props.canCopy||busy.value||sourceError.value)return;changeView('organize')}
function leaveOrganize(){view.value='list';void restoreView()}
async function reloadAnnotations(){if(busy.value||loading.value||draft.value)return;if(!modal.value)captureView();await load();await nextTick();if(modal.value==='delete'&&modalAnnotation.value){deleteId.value=modalAnnotation.value.id;dialogHeading.value?.focus({preventScroll:true})}else if(modal.value!=='delete'){modal.value='';await restoreView()}}
function modalTab(event:KeyboardEvent){const controls=focusableControls(dialog.value),index=controls.indexOf(document.activeElement as HTMLElement);if(controls.length)controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus()}
function back(){if(!open.value){if(referencePreview.value){void show();return true}return false}if(editorOpen.value){if(!busy.value&&!editor.value?.back())hideEditor();return true}if(open.value&&view.value==='organize'&&curation.value?.back())return true;if(modal.value){void closeModal();return true}if(view.value!=='list'){changeView('list');return true}if(queryOpen.value){closeQuery();return true}hide();return true}
watch(open,value=>emit('opened',value),{immediate:true,flush:'sync'})
watch(model,value=>{if(value&&detailId.value&&!value.annotations.some(a=>a.id===detailId.value)){detailId.value='';modal.value='';deleteId.value='';if(view.value==='detail'){view.value='list';void restoreView()}}})

let revision='missing'
const recoveryId=identityKey(props.identity),key=()=>recoveryId
async function load() {
  if (draft.value || busy.value) return
  const owner=++loadEpoch;loading.value=true; error.value=''; sourceError.value=''; model.value=undefined; deleteId.value=''; deletionError.value=''
  let recoveryError=''
  try{const current=await readPdfRecovery(key(),props.storage);if(disposed||owner!==loadEpoch)return;recovery=current;journal.value=current.journal}
  catch(e){recovery=undefined;recoveryError=`批注恢复记录暂不可用；为保护原输入，暂不新增或修改。${humanStorageError(e)}`;sourceError.value=recoveryError}
  try {
    const state=await props.storage.readPdfAnnotations(props.identity);if(disposed||owner!==loadEpoch)return;const value=parseAnnotations(state.content,props.source)
    model.value=value; revision=state.revision
    if (state.sourceSignature !== props.signature || value.source.fingerprint && value.source.fingerprint !== props.source.fingerprint || value.source.size !== props.source.size || value.annotations.some(a=>a.page>props.pages)) sourceError.value='PDF 与批注来源不一致，暂不定位或修改；原批注仍保留，请核对来源。'
    error.value=sourceError.value
    status.value=state.content === null ? '还没有批注 · 原 PDF 未改动' : '批注已保存 · 原 PDF 未改动'
    if(recovery)try {const previous=recovery.journal,next=reconcileDeletion(previous,value,props.signature);journal.value=next;if(JSON.stringify(previous)!==JSON.stringify(next))await writeRecovery({journal:next})}
    catch(e) {deletionError.value=`删除恢复记录待核对：${humanStorageError(e)}`}
    if(recoveryError){sourceError.value=recoveryError;error.value=recoveryError}
  } catch(e) {if(disposed||owner!==loadEpoch)return;error.value=e instanceof SyntaxError?'批注文件格式无法读取，原记录仍保留。':humanStorageError(e);status.value='批注暂不可用，原 PDF 仍可阅读。'}
  finally {if(!disposed&&owner===loadEpoch){loading.value=false;emit('loaded',model.value||null,sourceError.value||(!model.value?error.value:''))}}
}
async function show(){visibilityEpoch++;referencePreview.value=false;emit('reference',false);open.value=true;await restoreView();if(modal.value){if(dialogBody.value)dialogBody.value.scrollTop=modalScrolls.get(modal.value)||0;(dialog.value?.querySelector<HTMLElement>('[data-note-action=reference]')||dialogHeading.value)?.focus({preventScroll:true})}}
async function showAnnotation(id:string){if(!await protect())return;activeReference.value=id;preview.value=null;await show();openDetail(id)}
async function hide(){if(changing)return false;changing=true;try{if(busy.value||!await protect())return false;if(!open.value)return true;captureView();visibilityEpoch++;editorOpen.value=false;open.value=false;await nextTick();opener.value?.focus({preventScroll:true});return true}finally{changing=false}}
async function protect() {
  captureQuery();if (!draft.value) return true
  if (editor.value) draft.value.annotation.comment=editor.value.value()
  for(;;){await recoveryTail;if(!draft.value)return true;if(JSON.stringify(draft.value)===JSON.stringify(recovery?.draft)){draftProtected.value=true;return true}if(!await persistDraft()){open.value=true;editorOpen.value=true;return false}}
}
async function start(selection?: {quote:string;rects:PdfAnnotationRect[]},target?:HTMLElement) {
  if(selection&&!props.canCopy)return
  if (!writable.value || draft.value || busy.value) return
  if(!open.value)view.value='list';const now=Date.now()
  draft.value={annotation:{id:`pdf-annotation-${crypto.randomUUID()}`,kind:selection?'highlight':'comment',page:props.page,color:'yellow',rects:selection?.rects||[],quote:selection?.quote||'',comment:'',createdAt:now,updatedAt:now},revision,sourceSignature:props.signature}
  void persistDraft();emit('clear');await openEditor(target)
}
function edit(a:PdfAnnotation,target?:HTMLElement) {if ((!props.canCopy && a.quote)||!writable.value||draft.value||busy.value)return;draft.value={annotation:JSON.parse(JSON.stringify(a)),revision,sourceSignature:props.signature};void persistDraft();void openEditor(target)}
async function save() {
  if (!draft.value || !model.value || busy.value || !writable.value) return
  // Explicit submit reads the visible IME value before v-model composition ends.
  if (editor.value) draft.value.annotation.comment=editor.value.value()
  if (!draft.value.annotation.comment.trim() && draft.value.annotation.kind === 'comment') {error.value='请写下想法后保存。';return}
  busy.value=true; error.value=''
  let committed=false
  try {
    if(!await protect())return
    const a={...draft.value.annotation,updatedAt:Math.max(Date.now(),draft.value.annotation.createdAt)}, previous=model.value
    const candidate={...previous,source:{...previous.source,...props.source},annotations:previous.annotations.some(v=>v.id===a.id)?previous.annotations.map(v=>v.id===a.id?a:v):[...previous.annotations,a]}
    const state=await props.storage.writePdfAnnotations(props.identity,serializeAnnotations(candidate),draft.value.revision,draft.value.sourceSignature)
    model.value=parseAnnotations(state.content,props.source); revision=state.revision
    // Disk commit succeeded even if deleting its local draft fails. Keep the
    // form with the new revision so retry edits the same ID, never duplicates.
    draft.value.revision=revision
    committed=true;status.value='批注已保存 · 原 PDF 未改动'
    await writeRecovery({draft:null}); draft.value=null
    emit('loaded',model.value,sourceError.value)
  } catch(e) { const reason=humanStorageError(e);await persistDraft();error.value=committed?`批注已保存，输入恢复记录尚未整理：${reason}`:`保存未完成：${reason}` }
  finally { busy.value=false }
}
async function discard(){if(busy.value)return;busy.value=true;try{await recoveryTail;const current=await readPdfRecovery(key(),props.storage);if(current.token!==recovery?.token){recovery=current;journal.value=current.journal;draft.value=null;await nextTick();draft.value=props.canModify&&(props.canCopy||!current.draft?.annotation.quote)?copyDraft(current.draft):null;blockedDraft.value=!!current.draft&&!draft.value;draftProtected.value=!!draft.value;editorOpen.value=false;error.value=sourceError.value;status.value='当前输入已放弃，最新恢复输入仍保留。';await restoreList();return}await writeRecovery({draft:null});draft.value=null;error.value=sourceError.value}catch(e){error.value=`放弃未完成：${humanStorageError(e)}`}finally{busy.value=false}}
async function returnTo(a:PdfAnnotation){if(sourceError.value||a.page>props.pages)return;if(modal.value)modalScrolls.set(modal.value,dialogBody.value?.scrollTop||0);if(await hide()){referencePreview.value=true;emit('reference',true);emit('goto',a.page,a.rects[0])}}

async function remove(annotation:PdfAnnotation) {
  if (!canDelete.value || !model.value || deleteId.value!==annotation.id) return
  busy.value=true; error.value=''
  let pendingConfirmed=false
  try {
    const item={annotation:JSON.parse(JSON.stringify(annotation)),sourceSignature:props.signature}
    const pending={...journal.value,pending:item}
    await writeRecovery({journal:pending}); journal.value=pending;pendingConfirmed=true
    const candidate={...model.value,source:{...model.value.source,...props.source},annotations:model.value.annotations.filter(a=>a.id!==annotation.id)}
    const state=await props.storage.writePdfAnnotations(props.identity,serializeAnnotations(candidate),revision,props.signature)
    model.value=parseAnnotations(state.content,props.source); revision=state.revision; deleteId.value=''; journal.value={undo:item}; status.value='批注已保存 · 原 PDF 未改动'
    emit('loaded',model.value,sourceError.value)
    try {await writeRecovery({journal:journal.value})} catch(e) {deletionError.value=`删除已保存，恢复记录待整理；当前仍可撤销：${humanStorageError(e)}`}
    modal.value='';detailId.value='';view.value='list';busy.value=false;await nextTick();if(body.value)body.value.scrollTop=0;undoButton.value?.focus({preventScroll:true})
  } catch(e) {const reason=humanStorageError(e);error.value=!pendingConfirmed?`删除未执行：恢复材料尚未确认保存。${reason}`:reason.includes('空间不足')?'删除尚未确认：本机空间不足。恢复记录仍保留，释放空间后重新读取核对。':reason.includes('变化')?'删除尚未确认：PDF 或批注已变化。恢复记录仍保留，请重新读取核对。':`删除尚未确认：${reason.replace(/[。.!]+$/,'')}。恢复记录仍保留，请重新读取核对。`}
  finally {busy.value=false}
}
async function undoDeletion() {
  if (!canUndo.value || !journal.value?.undo) return
  const item=journal.value.undo; busy.value=true; error.value=''
  try {
    const fresh=await props.storage.readPdfAnnotations(props.identity), document=parseAnnotations(fresh.content,props.source)
    if (fresh.sourceSignature!==props.signature || document.source.fingerprint && document.source.fingerprint!==props.source.fingerprint || document.source.size!==props.source.size || document.annotations.some(a=>a.page>props.pages)) throw new Error('PDF 或批注来源已变化，恢复摘录仍保留，请核对后重试。')
    const candidate=restoreDeletedAnnotation({...document,source:{...document.source,...props.source}},item,fresh.sourceSignature,props.pages)
    const state=await props.storage.writePdfAnnotations(props.identity,serializeAnnotations(candidate),fresh.revision,fresh.sourceSignature)
    model.value=parseAnnotations(state.content,props.source); revision=state.revision; journal.value=null; deletionError.value=''; status.value='已恢复删除的批注 · 原 PDF 未改动'
    emit('loaded',model.value,sourceError.value)
    try {await writeRecovery({journal:null})} catch(e) {deletionError.value=`批注已恢复，恢复记录稍后清理：${humanStorageError(e)}`}
  } catch(e) {error.value=`恢复未完成：${humanStorageError(e)}`}
  finally {busy.value=false}
}
async function generate():Promise<boolean>{
  if(!props.canCopy||!preview.value||busy.value||sourceError.value)return false
  const snapshot=preview.value;busy.value=true;error.value=''
  try{
    const state=await props.storage.readPdfAnnotations(props.identity)
    if(state.revision!==snapshot.revision||state.sourceSignature!==snapshot.signature)throw new Error('PDF 或批注已变化，请重新读取并核对选择。')
    let written
    try{written=await props.storage.write(snapshot.target,snapshot.content,null)}
    catch(writeError){
      // A provider may commit before reporting failure. Verify this same target;
      // never create another file or overwrite a different existing snapshot.
      try{const existing=await props.storage.read(snapshot.target);if(existing.content!==snapshot.content||identityKey(existing)!==identityKey(snapshot.target))throw writeError;written=existing}catch{throw writeError}
    }
    note.value={rootId:written.rootId,relativePath:written.relativePath};status.value='阅读笔记已保存 · 原 PDF 未改动';return true
  }catch(e){const reason=humanStorageError(e);error.value=reason.includes('空间不足')?'笔记尚未确认保存：本机空间不足。预览和选择仍保留，请释放空间后重试。':reason.includes('变化')?'PDF 或批注已变化，请重新读取并核对选择。':`笔记尚未确认保存：${reason.replace(/[。.!]+$/,'')}。预览和选择仍保留。`;return false}finally{busy.value=false}
}
const pause=()=>{if(!busy.value)void protect()}
const beforeUnload=(event:BeforeUnloadEvent)=>{if(busy.value||recoveryWorking.value||draft.value&&!draftProtected.value){event.preventDefault();event.returnValue='';pause()}}
onMounted(async()=>{window.addEventListener('longedit-mobile-pause',pause);window.addEventListener('pagehide',pause);window.addEventListener('beforeunload',beforeUnload);const owner=visibilityEpoch;await load();if(disposed)return;const savedDraft=recovery?.draft;draft.value=props.canModify&&(props.canCopy||!savedDraft?.annotation.quote)?copyDraft(savedDraft):null;blockedDraft.value=!!savedDraft&&!draft.value;draftProtected.value=!!draft.value;if(draft.value&&(owner===visibilityEpoch||open.value)){open.value=true;editorOpen.value=true}})
onBeforeUnmount(()=>{window.removeEventListener('longedit-mobile-pause',pause);window.removeEventListener('pagehide',pause);window.removeEventListener('beforeunload',beforeUnload)})
defineExpose({show,showAnnotation,dismiss:hide,protect:async()=>!busy.value&&await protect(),back})
</script>
<style scoped>
.pdf-notes-opener{white-space:nowrap;font-weight:650}
.pdf-notes-panel{--notes-error:#a13e32;position:absolute;z-index:8;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--bg);color:var(--ink)}
.pdf-notes-surface{display:flex;flex:1;flex-direction:column;min-height:0}
.pdf-notes-heading{display:flex;align-items:center;gap:8px;min-height:64px;padding:7.5px 8px;border-bottom:1px solid var(--line);flex:none}
.pdf-notes-heading h1{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;font-weight:700;letter-spacing:normal;overflow-wrap:anywhere}
.pdf-notes-back,.pdf-notes-more,.pdf-notes-close{display:grid;place-items:center;flex:0 0 48px;width:48px;min-width:48px;height:48px;min-height:48px;padding:0;border:0;background:transparent;color:var(--ink)}
.pdf-notes-more.is-active{color:var(--primary);background:var(--primary-soft);border-radius:10px}
.pdf-notes-body{flex:1;min-height:0;padding:0 16px 16px;overflow:auto;overscroll-behavior:contain}
.pdf-notes-body>.sheet-hint{margin:16px 0;font-size:.875rem;line-height:1.6}
.pdf-notes-error{margin:16px 0;color:var(--notes-error);font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}
.pdf-notes-list{list-style:none;margin:0;padding:0}
.pdf-note-card{position:relative;margin:0;border-bottom:1px solid var(--line);background:transparent}
.pdf-note-card.is-reference{box-shadow:inset 3px 0 var(--primary)}
.pdf-annotation-link{display:block;width:100%;min-height:48px;padding:12px 4px 16px;border:0;background:transparent;color:var(--ink);text-align:left;font:inherit;overflow-wrap:anywhere}
.pdf-annotation-meta{display:flex;align-items:center;gap:8px;min-height:32px;padding-right:48px;margin-bottom:6px;font-size:.8125rem;line-height:1.5;color:var(--muted);flex-wrap:wrap}
.pdf-annotation-page{display:inline-block;padding:2px 8px;border-radius:5px;background:var(--primary-soft);color:var(--ink)}
.pdf-annotation-chosen{font-size:.8125rem;line-height:1.5;color:var(--primary)}
.pdf-annotation-excerpt{display:block;font-size:1rem;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
.pdf-annotation-comment-state{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.875rem;line-height:1.5;color:var(--ink)}
.pdf-annotation-comment-state svg{flex:none}
.pdf-annotation-row-more{position:absolute;right:-8px;top:4px}
.pdf-annotation-search{display:flex;gap:4px;padding:12px 0;align-items:center}
.pdf-annotation-query-wrap{position:relative;flex:1;min-width:0}
.pdf-annotation-query-wrap>svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.pdf-annotation-query-wrap input{display:block;width:100%;min-width:0;min-height:48px;padding:10px 48px 10px 40px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font:inherit;font-size:1rem;line-height:1.5;appearance:none}
.pdf-annotation-query-wrap input::placeholder{color:var(--muted);opacity:1}.pdf-annotation-query-wrap input::-webkit-search-cancel-button{display:none}
.pdf-annotation-query-clear{position:absolute;right:0;top:0;display:grid;place-items:center;width:48px;min-height:48px;height:100%;padding:0;border:0;background:transparent;color:var(--muted)}
.pdf-annotation-query-chip,.pdf-applied-filters button{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:48px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--primary-soft);color:var(--primary);font:inherit;font-size:.875rem;line-height:1.5;overflow-wrap:anywhere}
.pdf-annotation-query-chip{width:100%;margin-top:12px;text-align:left}.pdf-annotation-query-chip svg{flex:none}
.pdf-applied-filters{display:flex;gap:8px;margin-top:12px}.pdf-applied-filters>button:first-child{flex:1;min-width:0;text-align:left}.pdf-applied-filters>button:last-child{flex:none;width:48px;justify-content:center;padding:0}
.pdf-annotation-resume{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;margin:16px 0 0;padding:12px;border:1px solid var(--primary);border-radius:10px;background:var(--primary-soft);color:var(--ink);text-align:left}
.pdf-annotation-resume>span{flex:1;min-width:0}.pdf-annotation-resume strong,.pdf-annotation-resume small{display:block;font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}.pdf-annotation-resume small{color:var(--muted);font-weight:400}.pdf-annotation-resume svg{flex:none}
.pdf-annotation-detail{padding-top:16px}.pdf-annotation-detail-meta{display:flex;align-items:center;gap:8px;font-size:.875rem;line-height:1.5;color:var(--muted);flex-wrap:wrap}.pdf-annotation-detail-meta .pdf-notes-more{margin-left:auto}
.pdf-annotation-detail section{margin-top:20px}.pdf-annotation-detail h2{margin:0 0 12px;font-size:1rem;line-height:1.5;font-weight:650}.pdf-annotation-detail blockquote{border:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:1rem;line-height:1.75}.pdf-annotation-detail p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75}
.pdf-annotation-return{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;margin-top:24px;padding:12px 0;border:0;border-top:1px solid var(--line);background:transparent;color:var(--primary);font:inherit;text-align:left;line-height:1.5}.pdf-annotation-return svg{flex:none}.pdf-annotation-return svg:last-child{margin-left:auto}
.pdf-swatch{display:inline-block;width:16px;height:16px;flex:none;border-radius:4px;border:1px solid #263a3033}.color-yellow{background:#ffe16a}.color-green{background:#88bc7c}.color-pink{background:#ed9cb5}.color-blue{background:#88b9ed}
.pdf-annotation-filter-task{padding-top:20px}.pdf-annotation-filter-task fieldset{border:0;margin:0;padding:0}.pdf-annotation-filter-task legend{margin:0 0 12px;padding:0;font-size:1rem;line-height:1.5;font-weight:650}
.pdf-filter-choices{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)}
.pdf-filter-choice,.pdf-filter-switch{display:flex;align-items:center;gap:12px;min-height:56px;margin:0;padding:12px 14px;font-size:1rem;line-height:1.5;cursor:pointer}.pdf-filter-choice+.pdf-filter-choice{border-top:1px solid var(--line)}.pdf-filter-choice>span,.pdf-filter-switch>span{flex:1;min-width:0}
.pdf-filter-choice input,.pdf-filter-switch input{appearance:auto;flex:none;width:20px;min-height:0;height:20px;margin:0;padding:0;accent-color:var(--primary)}
.pdf-filter-switch{margin-top:20px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.pdf-filter-reset{display:flex;margin:20px auto 0;min-height:48px}.pdf-filter-switch small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted)}
.pdf-notes-footer,.pdf-notes-dialog-footer{display:flex;flex:none;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}
.pdf-notes-footer>.button,.pdf-notes-dialog-footer>.button{flex:1;min-width:0;min-height:48px;padding:11px 10px;border-radius:10px;font-size:1rem;line-height:1.5;font-weight:500}
.pdf-notes-empty-state{text-align:center;padding:44px 12px;color:var(--muted)}.pdf-notes-empty-state>svg{color:var(--primary)}.pdf-notes-empty-state h2{margin:16px 0;font-size:1.125rem;line-height:1.5;color:var(--ink)}
.pdf-deletion-recovery{display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px;border-radius:10px;background:var(--primary-soft);font-size:.875rem;line-height:1.5}.pdf-deletion-recovery>div{flex:1;min-width:0}.pdf-deletion-recovery strong{display:block;font-size:.875rem}.pdf-deletion-recovery p{margin:4px 0 0;overflow-wrap:anywhere}.pdf-deletion-recovery>.button{flex:none;padding:10px;min-height:48px;font-size:.8125rem;gap:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
.pdf-notes-layer{position:absolute;z-index:16;inset:0;display:flex;align-items:flex-end;background:#14261d66}.pdf-notes-dialog{display:flex;flex-direction:column;width:100%;max-height:calc(100% - 16px);min-height:0;border:1px solid var(--line);border-radius:16px 16px 0 0;overflow:hidden;background:var(--bg);box-shadow:0 12px 40px #14261d26}
.pdf-notes-dialog-header{display:flex;align-items:center;gap:8px;min-height:64px;padding:7.5px 8px 7.5px 16px;border-bottom:1px solid var(--line);flex:none}.pdf-notes-dialog-header h2{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;font-weight:700;letter-spacing:normal;overflow-wrap:anywhere}
.pdf-notes-dialog-body{padding:4px 16px 16px;overflow:auto;overscroll-behavior:contain;min-height:0}
.pdf-notes-dialog-choice,.pdf-notes-help-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:12px 4px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:1rem;line-height:1.5;text-align:left;overflow-wrap:anywhere}.pdf-notes-dialog-choice+.pdf-notes-dialog-choice,.pdf-notes-help-row{border-top:1px solid var(--line)}.pdf-notes-dialog-choice svg{flex:none}.pdf-notes-dialog-choice.danger{color:var(--notes-error)}.pdf-notes-help-row{justify-content:space-between;padding:4px}
.pdf-annotation-target{margin:12px 0;overflow-wrap:anywhere}.pdf-annotation-target strong{display:block;font-size:.875rem;line-height:1.6;font-weight:500}.pdf-annotation-target small{display:block;margin-top:4px;font-size:.8125rem;line-height:1.5;color:var(--muted)}
.is-confirmation{align-items:center;justify-content:center;padding:16px}.is-confirmation .pdf-notes-dialog{max-width:400px;max-height:100%;border-radius:16px}.is-confirmation .pdf-notes-dialog-body{padding:16px}.pdf-delete-copy{margin:0;font-size:1rem;line-height:1.6;overflow-wrap:anywhere}.pdf-delete-copy+p{margin-top:12px}.pdf-notes-dialog-footer>.danger-button{background:var(--notes-error);border-color:var(--notes-error);color:var(--bg)}
.pdf-selection-actions{position:absolute;z-index:7;bottom:76px;left:16px;right:16px;display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);box-shadow:0 3px 16px #163c2222;color:var(--ink);font-size:.8125rem;line-height:1.5}.pdf-selection-actions>span{flex:1;min-width:0}
@media(max-width:340px){.pdf-deletion-recovery{flex-wrap:wrap}.pdf-deletion-recovery>.button{margin-left:auto}.pdf-notes-dialog-footer{flex-direction:column}.pdf-notes-dialog-footer>.button{flex:none}}
.pdf-notes-panel :deep(button){-webkit-tap-highlight-color:transparent}
:global(.theme-dark .pdf-notes-panel){--notes-error:#ffb4a8}
</style>
