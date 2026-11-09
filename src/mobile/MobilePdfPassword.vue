<template>
  <section class="pdf-password" role="region" aria-label="PDF 密码任务" :inert="mobileHelpOpen||undefined" @keydown.esc.stop.prevent="cancel">
    <div class="password-surface">
      <header class="password-header"><button type="button" class="password-icon" :aria-label="returnNote?'返回阅读笔记':returnLabel||'返回资料库'" @click="cancel"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 id="pdf-password-heading" ref="heading" tabindex="-1">输入密码</h1><button type="button" class="password-icon" :aria-label="dark?'切换浅色':'切换深色'" @click="emit('theme')"><Sun v-if="dark" :size="21" aria-hidden="true" /><Moon v-else :size="21" aria-hidden="true" /></button><MobileHelp topic="password" /></header>
      <form class="password-form" autocomplete="off" @submit.prevent="submit">
        <div ref="body" class="password-body" tabindex="0" role="region" aria-label="密码输入内容">
          <div class="password-file"><LockKeyhole :size="24" aria-hidden="true" /><span><strong>{{ title }}.pdf</strong><small>{{ returnNote?'来自阅读笔记':libraryName }}</small></span></div>
          <div class="password-fields"><label for="pdf-document-password">文档密码</label><div ref="field" class="password-input" :class="{'has-error':showError}"><input id="pdf-document-password" ref="input" v-model="value" :type="visible?'text':'password'" :disabled="busy||submitting" placeholder="输入文档密码" autocomplete="off" autocapitalize="off" :spellcheck="false" enterkeyhint="go" :aria-invalid="showError||undefined" :aria-describedby="showError?'pdf-password-error':undefined" @input="captureInput" @focus="revealInput" /><button type="button" class="password-toggle" :disabled="busy||submitting" :aria-label="visible?'隐藏文档密码':'显示文档密码'" :aria-pressed="visible" @pointerdown.prevent @click="toggle"><EyeOff v-if="visible" :size="21" aria-hidden="true" /><Eye v-else :size="21" aria-hidden="true" /></button></div><p v-if="showError" id="pdf-password-error" class="password-error" role="alert">密码不正确，请重新输入。</p></div>
        </div>
        <footer class="password-footer"><button class="button password-cancel" type="button" :aria-label="returnNote?'取消，返回笔记':'取消，'+(returnLabel||'返回资料库')" @click="cancel">{{ returnNote?'返回笔记':'取消' }}</button><button class="button primary-button password-submit" :disabled="!value.length||busy||submitting" :aria-busy="busy||submitting||undefined"><LoaderCircle v-if="busy||submitting" class="password-spinner" :size="20" aria-hidden="true" /><span>{{ busy||submitting?'正在核对…':'打开文档' }}</span></button><span class="password-announcement" role="status" aria-live="polite">{{ busy||submitting?'正在核对密码…':'' }}</span></footer>
      </form>
    </div>
  </section>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import {mobileHelpOpen} from './mobileHelp'
import {ref,computed,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import {ArrowLeft,LockKeyhole,Eye,EyeOff,Sun,Moon,LoaderCircle} from 'lucide-vue-next'
const props=defineProps<{title:string;libraryName:string;dark:boolean;incorrect:boolean;busy:boolean;returnNote?:boolean;returnLabel?:string}>()
const emit=defineEmits<{submit:[password:string];cancel:[];theme:[]}>()
const value=ref(''),visible=ref(false),submitting=ref(false),edited=ref(false),input=ref<HTMLInputElement>(),heading=ref<HTMLElement>(),body=ref<HTMLElement>(),field=ref<HTMLElement>(),showError=computed(()=>props.incorrect&&!edited.value)
let paused=false,disposed=false,observer:ResizeObserver|undefined,selection:{start:number|null;end:number|null;direction:'forward'|'backward'|'none'|null}|undefined
function rememberSelection(){const e=input.value;if(e)selection={start:e.selectionStart,end:e.selectionEnd,direction:e.selectionDirection}}
function restoreSelection(){if(input.value&&selection?.start!=null)input.value.setSelectionRange(selection.start,selection.end,selection.direction||undefined)}
function clear(){input.value?.blur();if(input.value)input.value.value='';value.value='';visible.value=false;selection=undefined}
function captureInput(event:Event){const e=event.target as HTMLInputElement;if(disposed||paused||document.visibilityState==='hidden'){e.value='';value.value='';return}value.value=e.value;edited.value=true}
function submit(){const password=input.value?.value??value.value;if(!password.length||props.busy||submitting.value||paused)return;clear();submitting.value=true;emit('submit',password)}
function cancel(){clear();emit('cancel')}
function toggle(){if(props.busy||submitting.value)return;rememberSelection();const current=input.value?.value??value.value;if(current!==value.value)edited.value=true;value.value=current;visible.value=!visible.value;void nextTick(()=>{input.value?.focus({preventScroll:true});restoreSelection();revealInput()})}
function revealInput(){if(document.activeElement!==input.value||!body.value||!field.value)return;const area=body.value.getBoundingClientRect(),r=field.value.getBoundingClientRect(),inset=8;if(r.bottom>area.bottom-inset)body.value.scrollTop+=r.bottom-area.bottom+inset;else if(r.top<area.top+inset)body.value.scrollTop-=area.top+inset-r.top}
watch(()=>props.incorrect,incorrect=>{if(incorrect){edited.value=false;clear();void nextTick(()=>{if(!disposed){input.value?.focus({preventScroll:true});revealInput()}})}})
watch(()=>props.busy,busy=>{if(!busy)submitting.value=false})
watch(mobileHelpOpen,open=>{if(open){rememberSelection();const current=input.value?.value??value.value;if(current!==value.value)edited.value=true;value.value=current;visible.value=false;void nextTick(restoreSelection)}})
function pause(){paused=true;clear()}
function resume(){paused=false}
function visibility(){if(document.visibilityState==='hidden')pause();else resume()}
onMounted(()=>{heading.value?.focus({preventScroll:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('longedit-mobile-pause',pause);window.addEventListener('longedit-mobile-resume',resume);window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);observer=new ResizeObserver(revealInput);if(body.value)observer.observe(body.value)})
onBeforeUnmount(()=>{disposed=true;clear();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('longedit-mobile-pause',pause);window.removeEventListener('longedit-mobile-resume',resume);window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',resume)})
defineExpose({clear})
</script>
<style scoped>
.password-announcement{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}


.pdf-password{--password-error:#a13e32;position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--ink)}.password-surface,.password-form{display:flex;flex:1;flex-direction:column;min-height:0;margin:0}.password-header{display:flex;align-items:center;gap:8px;min-height:64px;padding:7.5px 8px;border-bottom:1px solid var(--line);flex:none}.password-header h1{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;letter-spacing:normal;font-weight:700;overflow-wrap:anywhere}.password-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;padding:0;border:0;background:transparent;color:var(--muted)}
.password-body{flex:1;min-height:0;padding:16px;overflow:auto;overscroll-behavior:contain}.password-file{display:flex;align-items:center;gap:12px;min-height:80px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.password-file>svg{flex:none;color:var(--primary)}.password-file>span{flex:1;min-width:0}.password-file strong{display:block;font-size:1rem;line-height:1.5;font-weight:650;overflow-wrap:anywhere}.password-file small{display:block;margin-top:4px;color:var(--muted);font-size:.875rem;line-height:1.5}
.password-fields{margin-top:24px}.password-fields label{display:block;margin:0 0 8px;font-size:1rem;line-height:1.5;font-weight:650}.password-input{display:flex;align-items:stretch;min-height:56px;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}.password-input:focus-within{outline:2px solid var(--primary);outline-offset:2px}.password-input.has-error{border-color:var(--password-error)}.password-input input{display:block;flex:1;min-width:0;width:100%;min-height:54px;padding:12px 14px;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:1rem;line-height:1.5}.password-input input::placeholder{color:var(--muted);opacity:1}.password-input input:disabled{opacity:1}.password-toggle{display:grid;place-items:center;flex:0 0 48px;width:48px;min-height:54px;padding:0;border:0;background:transparent;color:var(--muted)}.password-error{margin:10px 0 0;color:var(--password-error);font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}
.password-footer{display:flex;gap:8px;flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}.password-footer>.button{flex:1;min-width:0;min-height:48px;padding:11px 10px;border-radius:10px;font-size:.875rem;line-height:1.7142857143;font-weight:400}.password-submit{gap:8px}
.pdf-password button{-webkit-tap-highlight-color:transparent}.password-spinner{animation:password-spin 1s linear infinite}@keyframes password-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.password-spinner{animation:none}}
@media(max-width:340px){.password-header{gap:4px}.password-header h1{font-size:1.125rem}.password-file{padding:12px}.password-footer{flex-direction:column}.password-footer>.button{flex:none}}
@media(max-height:400px){.password-header{min-height:49px;padding:0 8px}.password-header h1{font-size:1rem}.password-body{padding:12px}.password-footer{flex-direction:row;padding:8px 12px}.password-footer>.button{flex:1;padding:8px 6px;font-size:.75rem;line-height:1.5}}

:global(.theme-dark .pdf-password){--password-error:#ffb4a8}
</style>
