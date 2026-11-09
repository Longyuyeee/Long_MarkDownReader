<template>
  <section ref="panel" class="pdf-bookmarks" aria-label="本机 PDF 书签">

    <p v-if="loading" role="status">正在读取书签…</p>
    <p v-if="error&&!layer" class="pdf-bookmark-error" role="alert">{{ error }}</p>
    <div v-if="!model&&error&&!layer" class="pdf-bookmark-retry"><button class="button" @click="reload">重新读取书签</button></div>
    <template v-if="model">
      <fieldset class="pdf-bookmark-controls" :disabled="!!working">
      <p v-if="notice" class="pdf-bookmark-notice" role="status">{{ notice }}</p>
      <button ref="addButton" class="button pdf-bookmark-add" :disabled="!!editPage&&current?.page!==editPage" @click="current ? showMenu(current.page,$event.currentTarget as HTMLElement) : act({type:'add',page},'已添加本页书签')"><Bookmark :size="20" aria-hidden="true" />{{ current ? '本页书签操作' : '添加本页书签' }}</button>
<button v-if="editPage&&!layer" id="pdf-bookmark-pending" class="pdf-bookmark-resume" @click="resume($event.currentTarget as HTMLElement)"><span><strong>继续修改名称</strong><small>第 {{ editPage }} 页 · {{ model.record.items.find(item=>item.page===editPage)?.title }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
      <div v-if="error&&!layer" class="pdf-bookmark-retry"><button class="text-button" @click="reload">重新读取书签</button><button v-if="editPage" class="text-button" @click="discardAndReload">放弃当前输入并重新读取</button></div>
      <div v-if="model.record.removed" class="pdf-bookmark-undo"><span>已删除「{{ model.record.removed.title }}」</span><button ref="undoButton" class="text-button" :disabled="!!editPage" @click="undo"><Undo2 :size="17" aria-hidden="true" />撤销删除</button></div>
      <p class="pdf-bookmark-title">我的书签 · {{ model.record.items.length }} 枚</p>
      <div v-if="!model.record.items.length" class="pdf-bookmark-empty"><Bookmark :size="38" aria-hidden="true" /><h3>还没有书签</h3></div>
      <ol v-else class="pdf-bookmark-list"><li v-for="item in model.record.items.slice(0,visibleCount)" :key="item.page" class="pdf-bookmark-card" :class="{'is-current':item.page===page}">
        <div class="pdf-bookmark-row"><button class="pdf-bookmark-open" :aria-current="item.page===page?'page':undefined" @click="jump(item.page)"><Bookmark :size="21" :fill="item.page===page?'currentColor':'none'" aria-hidden="true" /><span><strong>{{ item.title }}</strong><small>第 {{ item.page }} 页<span v-if="item.page===page"> · 当前页</span></small></span></button><div class="pdf-bookmark-actions"><button class="icon-button" aria-haspopup="dialog" :disabled="!!editPage&&editPage!==item.page" :aria-describedby="editPage&&editPage!==item.page?'pdf-bookmark-pending':undefined" :data-bookmark-more="item.page" :aria-label="`书签操作：${item.title}`" @click="showMenu(item.page,$event.currentTarget as HTMLElement)"><Ellipsis :size="22" aria-hidden="true" /></button></div></div>

      </li></ol>
      <button v-if="model.record.items.length>visibleCount" class="button" @click="visibleCount+=50">再显示 50 枚书签</button>
      <details v-if="model.older.length" class="pdf-bookmark-older" @toggle="olderOpen=($event.target as HTMLDetailsElement).open"><summary>查看旧版书签 · {{ model.older.length }} 个版本</summary><template v-if="olderOpen"><div v-for="(version,index) in model.older.slice(0,olderCount)" :key="version.fingerprint"><p>旧版 {{ index+1 }}<span v-if="version.record"> · 共 {{ version.record.pages }} 页</span><span v-if="!version.record"> · 原记录暂时无法读取</span></p><ul v-if="version.record"><li v-for="item in version.record.items" :key="item.page">{{ item.title }} · 原第 {{ item.page }} 页</li><li v-if="version.record.removed">可撤销：{{ version.record.removed.title }} · 原第 {{ version.record.removed.page }} 页</li></ul></div><button v-if="model.older.length>olderCount" class="button" @click="olderCount+=5">再显示 5 个旧版</button></template></details>
      </fieldset>
    </template>
    <p v-if="working&&!loading&&!layer" role="status">正在保存书签…</p>

    <Teleport v-if="overlayTarget" :to="overlayTarget">
      <div v-if="active&&layer" class="pdf-bookmark-layer" @click.self="back">
        <section ref="dialog" class="pdf-bookmark-dialog" role="dialog" aria-modal="true" :aria-label="layerTitle" @keydown.tab.prevent="tab" @keydown.esc.stop.prevent="back">
          <header class="pdf-bookmark-dialog-header"><h2 ref="heading" tabindex="-1">{{ layerTitle }}</h2><MobileHelp topic="bookmarks" /><button class="pdf-bookmark-dialog-close" :aria-label="layer==='menu'?'返回书签列表':'返回书签操作'" @click="back"><X :size="22" aria-hidden="true" /></button></header>
          <div ref="dialogBody" class="pdf-bookmark-dialog-body" tabindex="0" role="region" aria-label="书签操作内容">
            <p class="pdf-bookmark-target"><strong>{{ selected?.title || '书签已变化' }}</strong><small>第 {{ selectedPage }} 页</small></p>
            <template v-if="layer==='menu'"><button class="pdf-bookmark-choice" data-bookmark-focus="rename" :disabled="!!working" @click="beginEdit(selectedPage)"><Pencil :size="20" aria-hidden="true" />{{ editPage===selectedPage?'继续修改名称':'重命名' }}</button><button class="pdf-bookmark-choice danger" data-bookmark-focus="delete" :disabled="!!editPage||!!working" :aria-describedby="editPage?'pdf-bookmark-pending':undefined" @click="showLayer('delete')"><Trash2 :size="20" aria-hidden="true" />删除书签</button></template>
            <form v-else-if="layer==='rename'" class="pdf-bookmark-rename" @submit.prevent="saveName"><label for="pdf-bookmark-name">书签名称</label><input id="pdf-bookmark-name" ref="input" v-model="editValue" maxlength="160" autocomplete="off" enterkeyhint="done" @input="saveDraft" /></form>
            <template v-else><p class="pdf-bookmark-confirm-copy">删除这枚书签？原 PDF 和批注不会改变。</p><p v-if="model?.record.removed" class="pdf-bookmark-confirm-copy">确认后会替换上次可撤销的删除记录。</p></template>
            <p v-if="working" role="status">正在保存书签…</p>
            <p v-if="error" class="pdf-bookmark-error" role="alert">{{ error }}</p><div v-if="error&&/读取|未保存|变化/.test(error)" class="pdf-bookmark-retry"><button class="button" :disabled="!!working" @click="reload">重新读取书签</button><button v-if="editPage" class="text-button" :disabled="!!working" @click="discardAndReload">放弃当前输入并重新读取</button></div>
          </div>
          <footer class="pdf-bookmark-dialog-footer"><template v-if="layer==='rename'"><button class="button" :disabled="!!working" @click="cancelEdit">取消修改</button><button class="button primary-button" :disabled="!!working" @click="saveName">保存名称</button></template><template v-else-if="layer==='delete'"><button class="button" @click="back">保留书签</button><button class="button danger-button" :disabled="!!working" @click="remove(selectedPage)">确认删除</button></template><button v-else class="button" @click="back">返回书签</button></footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup lang="ts">
import {computed,ref,nextTick,onBeforeUnmount,watch} from 'vue'
import {Bookmark,Pencil,Trash2,Undo2,Ellipsis,ChevronRight,X} from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import {canFocus,focusableControls} from './accessibility'
import {type PdfBookmarkScope,type PdfBookmarkState,type PdfBookmarkAction} from './pdfBookmarks'
import {readPersistedPdfBookmarks,updatePersistedPdfBookmarks,type PdfBookmarkPersistence} from './pdfBookmarkRepository'
import {humanStorageError} from './storage'
const props=defineProps<{source:PdfBookmarkScope;storage:PdfBookmarkPersistence;page:number;overlayTarget?:HTMLElement;active:boolean}>(),emit=defineEmits<{goto:[page:number];count:[count:number];layer:[open:boolean]}>()
const working=ref(0),loading=ref(false),transitioning=ref(false)
let tail:Promise<unknown>=Promise.resolve(),disposed=false
function queue<T>(task:()=>Promise<T>){working.value++;const result=tail.then(task).finally(()=>{working.value--});tail=result.catch(()=>{});return result}
async function transition(task:()=>Promise<void>){if(transitioning.value)return;transitioning.value=true;try{await task()}finally{transitioning.value=false}}
const model=ref<PdfBookmarkState>(),error=ref(''),notice=ref(''),editPage=ref(0),editValue=ref(''),visibleCount=ref(50),input=ref<HTMLInputElement>(),addButton=ref<HTMLButtonElement>(),undoButton=ref<HTMLButtonElement>(),olderOpen=ref(false),olderCount=ref(5)
const current=computed(()=>model.value?.record.items.find(item=>item.page===props.page)),pending=computed(()=>!!editPage.value&&(model.value?.record.draft?.page!==editPage.value||model.value?.record.draft?.title!==editValue.value))
function message(e:unknown){return humanStorageError(e)}
function assign(value:PdfBookmarkState){model.value=value;emit('count',value.record.items.length)}
async function load(){loading.value=true;try{await queue(async()=>{const value=await readPersistedPdfBookmarks(props.source,props.storage);if(disposed)return;assign(value);error.value='';const draft=value.record.draft;editPage.value=draft?.page||0;editValue.value=draft?.title||'';notice.value=''})}catch(e){error.value=message(e)}finally{loading.value=false}}
function act(action:PdfBookmarkAction,text=''){return queue(async()=>{try{if(!model.value)throw Error('请先重新读取书签。');const value=await updatePersistedPdfBookmarks(props.source,model.value.token,action,props.storage);if(disposed)return false;assign(value);error.value='';notice.value=text;return true}catch(e){error.value=message(e);return false}})}
type Layer=''|'menu'|'rename'|'delete'
const layer=ref<Layer>(''),selectedPage=ref(0),dialog=ref<HTMLElement>(),dialogBody=ref<HTMLElement>(),heading=ref<HTMLElement>(),selected=computed(()=>model.value?.record.items.find(item=>item.page===selectedPage.value)),layerTitle=computed(()=>layer.value==='rename'?'重命名书签':layer.value==='delete'?'删除书签？':'书签操作')
let opener:HTMLElement|undefined,selection:{start:number|null;end:number|null;direction:'forward'|'backward'|'none'|null}|undefined
const places=new Map<Layer,{scroll:number;focus?:HTMLElement;key?:string}>()
let resizeObserver:ResizeObserver|undefined
function keepInputVisible(){if(!input.value||!dialogBody.value||document.activeElement!==input.value)return;const field=input.value.getBoundingClientRect(),body=dialogBody.value.getBoundingClientRect();dialogBody.value.scrollTop+=field.bottom>body.bottom?field.bottom-body.bottom+8:field.top<body.top?field.top-body.top-8:0}
watch(dialogBody,element=>{resizeObserver?.disconnect();if(element){resizeObserver=new ResizeObserver(keepInputVisible);resizeObserver.observe(element)}},{flush:'post'})
watch(()=>!!(props.active&&layer.value),value=>emit('layer',value),{immediate:true,flush:'sync'})
function remember(){if(layer.value){const active=document.activeElement;places.set(layer.value,{scroll:dialogBody.value?.scrollTop||0,focus:active instanceof HTMLElement&&dialog.value?.contains(active)?active:undefined,key:active instanceof HTMLElement?active.dataset.bookmarkFocus:undefined})}if(input.value)selection={start:input.value.selectionStart,end:input.value.selectionEnd,direction:input.value.selectionDirection}}
async function showLayer(next:Layer){remember();if(layer.value==='menu'&&(next==='delete'||next==='rename'))places.set('menu',{scroll:dialogBody.value?.scrollTop||0,key:next==='delete'?'delete':'rename'});layer.value=next;await nextTick();if(!next){const target=canFocus(opener)?opener:panel.value?.querySelector<HTMLElement>(`[data-bookmark-more="${selectedPage.value}"]`);(canFocus(target)?target:addButton.value)?.focus({preventScroll:true});return}const place=places.get(next);if(dialogBody.value)dialogBody.value.scrollTop=place?.scroll||0;if(next==='rename'&&input.value){input.value.focus({preventScroll:true});if(selection?.start!==null&&selection?.start!==undefined)input.value.setSelectionRange(selection.start,selection.end,selection.direction||undefined);if(!place)keepInputVisible()}else {const target=canFocus(place?.focus)?place.focus:place?.key?dialog.value?.querySelector<HTMLElement>(`[data-bookmark-focus="${place.key}"]`):heading.value;(canFocus(target)?target:heading.value)?.focus({preventScroll:true})}}
function showMenu(page:number,target:HTMLElement){if(selectedPage.value!==page){places.delete('menu');places.delete('delete')}selectedPage.value=page;opener=target;notice.value='';void showLayer('menu')}
function beginEdit(page:number){void transition(async()=>{if(!await act({type:'edit',page}))return;if(editPage.value!==page){editPage.value=page;editValue.value=model.value!.record.draft!.title;selection=undefined;places.delete('rename')}await showLayer('rename')})}
function resume(target:HTMLElement){selectedPage.value=editPage.value;opener=target;notice.value='';void showLayer('rename')}
function saveDraft(event?:Event){if(event?.target instanceof HTMLInputElement)editValue.value=event.target.value;return act({type:'draft',page:editPage.value,title:editValue.value})}
async function protect(){if(input.value)editValue.value=input.value.value;remember();for(;;){await tail;if(!pending.value)return true;if(!await saveDraft())return false}}
async function focusFirst(){await nextTick();addButton.value?.focus({preventScroll:true})}
function saveName(){void transition(async()=>{if(!await protect()||!await act({type:'save'},'书签名称已保存'))return;editPage.value=0;editValue.value='';selection=undefined;await showLayer('')})}
function cancelEdit(){void transition(async()=>{if(!await act({type:'cancel',page:editPage.value},'已取消名称修改'))return;editPage.value=0;editValue.value='';selection=undefined;await showLayer('')})}
const panel=ref<HTMLElement>()
function back(){if(!layer.value)return false;void transition(async()=>{if(!await protect())return;error.value='';await showLayer(layer.value==='menu'?'':'menu')});return true}
function tab(event:KeyboardEvent){const items=focusableControls(dialog.value),index=items.indexOf(document.activeElement as HTMLElement);if(items.length)items[(index+(event.shiftKey?-1:1)+items.length)%items.length]?.focus()}
function jump(page:number){void transition(async()=>{if(await protect())emit('goto',page)})}
function remove(page:number){void transition(async()=>{if(!await act({type:'delete',page}))return;await showLayer('');undoButton.value?.focus({preventScroll:true})})}
function undo(){void transition(async()=>{if(await act({type:'undo'},'已恢复书签'))await focusFirst()})}
function reload(){void transition(async()=>{if(!editPage.value){await load();return}try{await queue(async()=>assign(await readPersistedPdfBookmarks(props.source,props.storage)));if(!model.value!.record.items.some(item=>item.page===editPage.value))throw Error('这枚书签已在别处删除，当前输入仍保留。可复制名称后放弃输入并重新读取。');if(await saveDraft())notice.value='已重新读取，当前名称输入仍保留。'}catch(e){error.value=message(e)}})}
function discardAndReload(){void transition(async()=>{await tail;editPage.value=0;editValue.value='';selection=undefined;await load();await showLayer('')})}
const beforeUnload=(event:BeforeUnloadEvent)=>{if(pending.value||working.value){event.preventDefault();event.returnValue='';void protect()}}
window.addEventListener('beforeunload',beforeUnload);onBeforeUnmount(()=>{disposed=true;resizeObserver?.disconnect();window.removeEventListener('beforeunload',beforeUnload);emit('layer',false)})
void load();defineExpose({protect,back})
</script>
<style scoped>
.pdf-bookmark-controls{display:contents;border:0;padding:0;margin:0;min-width:0}

.pdf-bookmark-add{width:100%;justify-content:center;font-size:1rem;min-height:48px;border-radius:12px;padding:10px}.pdf-bookmark-title{font-size:.875rem;line-height:22px;color:var(--muted);margin:8px 0 6px}
.pdf-bookmark-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}.pdf-bookmark-card{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:6px 8px;min-width:0}.pdf-bookmark-card.is-current{border-color:var(--primary);background:var(--primary-soft)}.pdf-bookmark-row{display:flex;align-items:center;gap:6px;min-width:0}.pdf-bookmark-open{display:flex;align-items:center;gap:10px;min-width:0;flex:1;min-height:48px;padding:0 6px;background:none;border:0;text-align:left;color:var(--ink)}.pdf-bookmark-open>svg{flex-shrink:0;color:var(--primary)}.pdf-bookmark-open>span{min-width:0;overflow-wrap:anywhere}.pdf-bookmark-open strong{font-size:1rem;font-weight:650;line-height:1.4;display:block}.pdf-bookmark-open small{display:block;font-size:.875rem;line-height:1.4;margin-top:2px;color:var(--muted)}.is-current .pdf-bookmark-open small>span{color:var(--primary);font-weight:600}.pdf-bookmark-actions{display:flex;gap:4px;border-left:1px solid var(--line);padding-left:6px;flex-shrink:0}.pdf-bookmark-actions .icon-button{min-width:44px;min-height:44px;border-radius:8px;background:var(--panel)}.is-current .pdf-bookmark-actions .icon-button{background:var(--bg)}
.pdf-bookmark-empty{text-align:center;padding:32px 8px;color:var(--muted)}.pdf-bookmark-empty>svg{color:var(--primary)}.pdf-bookmark-empty h3{color:var(--ink);font-size:1.125rem;margin:12px 0 8px}.pdf-bookmark-empty p{font-size:.875rem;line-height:1.6;margin:0}

.pdf-bookmark-error{color:var(--warning-ink);font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}.pdf-bookmark-notice{font-size:.8125rem;line-height:1.5;color:var(--primary);margin:8px 0}.pdf-bookmark-retry{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.pdf-bookmark-retry .text-button{font-size:.8125rem}.pdf-bookmark-undo{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin:12px 0;padding:8px 12px;background:var(--primary-soft);border-radius:8px;font-size:.875rem;overflow-wrap:anywhere}.pdf-bookmark-undo>span{flex:1;min-width:80px}.pdf-bookmark-older{border-top:1px solid var(--line);margin-top:16px;font-size:.8125rem;color:var(--muted);line-height:1.6;overflow-wrap:anywhere}.pdf-bookmark-older summary{padding:12px 0;min-height:48px;cursor:pointer}.pdf-bookmark-older p{margin:6px 0}.pdf-bookmark-older ul{padding-left:20px}
@media(max-width:360px){.pdf-bookmark-actions{gap:0;padding-left:2px}.pdf-bookmark-open{padding-left:2px;gap:6px}}
@media(max-height:400px){.pdf-bookmark-add{margin-top:8px;font-size:.875rem;padding:8px}.pdf-bookmark-empty{padding:16px 8px}}

.pdf-bookmarks,.pdf-bookmark-layer{--bookmark-danger:#a13e32}.pdf-bookmark-error{color:var(--bookmark-danger)}
.pdf-navigation-surface{display:flex;flex:1;flex-direction:column;min-height:0}
.pdf-bookmark-add{display:flex;gap:8px;font-size:1rem}
.pdf-bookmark-actions{border:0;padding:0}.pdf-bookmark-actions .icon-button{display:grid;place-items:center;min-width:48px;min-height:48px;width:48px;height:48px;border:0;background:transparent!important;color:var(--muted)}
.pdf-bookmark-title{margin:12px 0 8px}.pdf-bookmark-card{padding:8px}.pdf-bookmark-open{min-height:52px}
.pdf-bookmark-resume{display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:12px 0;padding:12px;border:1px solid var(--primary);border-radius:10px;background:var(--primary-soft);color:var(--ink)}.pdf-bookmark-resume span{flex:1;min-width:0;overflow-wrap:anywhere}.pdf-bookmark-resume strong,.pdf-bookmark-resume small{display:block;font-size:.875rem;line-height:1.6}.pdf-bookmark-resume small{color:var(--muted);font-weight:400}
.pdf-bookmark-layer { position:absolute; z-index:20; inset:0; display:grid; place-items:center; padding:16px; background:#14261d66; }
.pdf-bookmark-dialog { width:min(100%,400px); max-height:100%; display:flex; flex-direction:column; min-height:0; border:1px solid var(--line); border-radius:16px; background:var(--bg); overflow:hidden; box-shadow:0 12px 40px #14261d26; }
.pdf-bookmark-dialog-header { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px 7.5px 16px; border-bottom:1px solid var(--line); }
.pdf-bookmark-dialog-header h2 { flex:1; min-width:0; margin:0; letter-spacing:normal; font-size:1.25rem; line-height:1.5; font-weight:700; overflow-wrap:anywhere; }
.pdf-bookmark-dialog-close { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; background:transparent; color:var(--muted); }
.pdf-bookmark-dialog-body { padding:16px; min-height:0; overflow:auto; overscroll-behavior:contain; }









.pdf-bookmark-dialog-footer { display:flex; flex:none; gap:8px; padding:12px 16px; border-top:1px solid var(--line); max-height:45dvh; overflow:auto; }
.pdf-bookmark-dialog-footer .button { flex:1; min-width:0; min-height:48px; padding:11px 10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; border-radius:10px; }
@media(max-width:340px) { .pdf-bookmark-dialog-footer { flex-direction:column; } .pdf-bookmark-dialog-footer .button { flex:none; }    .pdf-bookmark-dialog-header h2 { font-size:1.125rem; } }
@media(max-height:400px) { .pdf-bookmark-heading { min-height:49px; padding:0 8px; } .pdf-bookmark-heading h1 { font-size:1rem; } .pdf-bookmark-context,.pdf-bookmark-footer { display:none; } .pdf-bookmark-body { padding:12px; } .pdf-bookmark-layer { padding:8px; } .pdf-bookmark-dialog-header { min-height:49px; padding:0 8px 0 12px; } .pdf-bookmark-dialog-header h2 { font-size:1rem; } .pdf-bookmark-dialog-body { padding:12px; } .pdf-bookmark-dialog-footer { flex-direction:row; padding:8px 12px; } .pdf-bookmark-dialog-footer .button { flex:1; padding:8px 6px; font-size:.75rem; line-height:1.5; } }


.pdf-bookmark-target{margin:0 0 16px;overflow-wrap:anywhere}.pdf-bookmark-target strong{display:block;font-size:1rem;line-height:1.5;font-weight:650}.pdf-bookmark-target small{display:block;margin-top:4px;color:var(--muted);font-size:.875rem;line-height:1.5}
.pdf-bookmark-choice{display:flex;align-items:center;gap:12px;min-height:56px;width:100%;padding:12px 4px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--ink);font-size:1rem;text-align:left;overflow-wrap:anywhere}.pdf-bookmark-choice svg{flex:none}.pdf-bookmark-choice.danger{color:var(--bookmark-danger)}
.pdf-bookmark-rename label{display:block;font-size:1rem;line-height:1.5;margin-bottom:8px}.pdf-bookmark-rename input{display:block;min-height:48px;width:100%;min-width:0;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}.pdf-bookmark-rename input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.pdf-bookmark-confirm-copy{font-size:.875rem;line-height:1.6;margin:12px 0 0;overflow-wrap:anywhere}.pdf-bookmark-dialog-footer .danger-button{background:var(--bookmark-danger);border-color:var(--bookmark-danger);color:var(--bg)}

:global(.theme-dark .pdf-bookmarks),:global(.theme-dark .pdf-bookmark-layer){--bookmark-danger:#ffb4a8}

.pdf-bookmarks :deep(button),.pdf-bookmark-layer :deep(button){-webkit-tap-highlight-color:transparent}

.pdf-bookmark-dialog-header{background:var(--bg)}
@media(max-width:340px){.pdf-bookmark-dialog-header{flex-wrap:wrap;row-gap:0}.pdf-bookmark-dialog-header h2{flex-basis:100%}.pdf-bookmark-dialog-header :deep(.mobile-help-trigger){margin-left:auto}}
</style>
