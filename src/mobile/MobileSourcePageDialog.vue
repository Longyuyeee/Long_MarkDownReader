<template>
  <Teleport :to="target || 'body'"><div v-if="open" v-show="!mobileHelpOpen" ref="layer" class="source-page-layer" :inert="mobileHelpOpen || undefined" @click.self="emit('close')">
    <section ref="dialog" class="source-page-dialog" role="dialog" aria-modal="true" aria-label="长文段落定位" aria-describedby="source-page-dialog-context" @keydown="keydown">
      <header class="source-page-dialog-header"><h2>跳转到<wbr>分段</h2><MobileHelp topic="sourceReading" /></header>
      <div ref="body" class="source-page-dialog-body">
        <p id="source-page-dialog-context" class="assistive-status">{{ name }} · 当前第 {{ page }} 段</p>
        <form id="source-page-form" @submit.prevent="submit"><label for="source-page-number">分段</label><input id="source-page-number" ref="input" v-model="value" inputmode="numeric" maxlength="6" autocomplete="off" :aria-label="`分段（共 ${pages} 段）`" :aria-invalid="!!error" :aria-describedby="error ? 'source-page-dialog-error' : undefined" @input="edited" @select="remember" @blur="remember" @scroll.passive="remember" /><span class="source-page-count">共{{ pages }}段</span><p v-if="error" id="source-page-dialog-error" class="source-page-dialog-error" role="alert">{{ error }}</p></form>
      </div>
      <footer class="source-page-dialog-footer"><button type="button" class="button" @click="emit('close')">取消</button><button type="submit" form="source-page-form" class="button primary-button">前往</button></footer>
    </section>
  </div></Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MobileHelp from './MobileHelp.vue'
import { mobileHelpOpen } from './mobileHelp'
import { focusableControls } from './accessibility'
import {ownSourceDialog} from './sourceReadingNavigation'
const target=ref<HTMLElement>(),layer=ref<HTMLElement>();let releaseOwner:(()=>void)|undefined,observer:MutationObserver|undefined;const inertNodes=new Map<HTMLElement,boolean>();function release(){observer?.disconnect();observer=undefined;for(const[node,value]of inertNodes)node.inert=value;inertNodes.clear();releaseOwner?.();releaseOwner=undefined}
function shield(){const host=target.value;if(!host)return;for(const child of [...host.children])if(child instanceof HTMLElement&&child!==layer.value&&!child.classList.contains('mobile-help-backdrop')){if(!inertNodes.has(child))inertNodes.set(child,child.inert);if(!child.inert)child.inert=true}}
const props = defineProps<{ open: boolean; name: string; page: number; pages: number }>()
const emit = defineEmits<{ close: []; goto: [page: number] }>()
const value = ref(''), error = ref(''), input = ref<HTMLInputElement>(), body = ref<HTMLElement>(), dialog = ref<HTMLElement>()
let pending = false, epoch = 0, position = { start: 0, end: 0, direction: 'none' as 'none' | 'forward' | 'backward', left: 0, top: 0 }
let resize: ResizeObserver | undefined
watch(body, host => {
  resize?.disconnect()
  if (!host) return
  let width = host.clientWidth, height = host.clientHeight
  resize = new ResizeObserver(() => {
    const changed = width !== host.clientWidth || height !== host.clientHeight
    width = host.clientWidth; height = host.clientHeight
    if (changed && props.open && input.value === document.activeElement) reveal(input.value)
  })
  resize.observe(host)
})
onBeforeUnmount(() => { epoch++;resize?.disconnect();release() })
function readInput() {
  const live = input.value
  if (live && live.value !== value.value) { value.value = live.value; pending = true; error.value = '' }
}
function remember() {
  const live = input.value
  if (!live) return
  readInput()
  position = { start: live.selectionStart ?? 0, end: live.selectionEnd ?? 0, direction: live.selectionDirection ?? 'none', left: live.scrollLeft, top: body.value?.scrollTop ?? 0 }
}
function edited() { pending = true; error.value = ''; remember() }
watch(() => props.open, async open => {
  const owner = ++epoch
  if(open){target.value=document.querySelector<HTMLElement>('.mobile-app')||document.body;releaseOwner=ownSourceDialog(()=>emit('close'))}
  if (!open) { remember(); release(); return }
  if (!pending) { value.value = String(props.page); error.value = ''; position = { start: 0, end: value.value.length, direction: 'none', left: 0, top: 0 } }
  await nextTick()
  if (owner !== epoch || !props.open) return
  target.value=document.querySelector<HTMLElement>('.mobile-app')||document.body
  await nextTick()
  if(owner!==epoch||!props.open)return
  shield();observer?.disconnect();observer=new MutationObserver(shield);if(target.value)observer.observe(target.value,{childList:true,subtree:true,attributes:true,attributeFilter:['inert']});input.value?.focus({ preventScroll: true })
  input.value?.setSelectionRange(position.start, position.end, position.direction)
  if (input.value) input.value.scrollLeft = position.left
  if (body.value) body.value.scrollTop = position.top
}, { immediate: true })
async function submit() {
  remember()
  try {const text=value.value.trim();if(!/^[1-9]\d{0,5}$/.test(text)||Number(text)>props.pages)throw Error(`请输入 1 至 ${props.pages} 的段号。`);const page=Number(text);pending = false; error.value = ''; emit('goto', page) }
  catch (reason) {
    error.value = reason instanceof Error ? reason.message : '请输入有效段号。'; pending = true
    await nextTick(); input.value?.focus({ preventScroll: true }); reveal(input.value)
    const message = body.value?.querySelector<HTMLElement>('.source-page-dialog-error')
    if (message && body.value && body.value.clientHeight >= message.offsetHeight + (input.value?.offsetHeight ?? 0) + 12) reveal(message)
  }
}
function reveal(element: HTMLElement | undefined) {
  const host = body.value
  if (!host || !element) return
  const box = element.getBoundingClientRect(), bounds = host.getBoundingClientRect()
  if (box.top < bounds.top) host.scrollTop += box.top - bounds.top
  else if (box.bottom > bounds.bottom) host.scrollTop += box.bottom - bounds.bottom
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (event.key !== 'Tab') return
  event.preventDefault()
  const controls = focusableControls(dialog.value), index = controls.indexOf(document.activeElement as HTMLElement)
  controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length]?.focus()
}
</script>
<style scoped>
.source-page-layer{position:fixed;z-index:900;inset:0;display:grid;place-items:center;padding:24px;background:#00000080}
.source-page-dialog{--page-error:#a13e32;width:min(100%,344px);max-height:100%;display:flex;flex-direction:column;min-height:0;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 40px #14261d26;overflow:hidden}
:global(.theme-dark .source-page-dialog){--page-error:#f09d8f}.source-page-dialog-header{display:flex;flex:none;align-items:center;gap:8px;min-height:64px;padding:8px 12px 0 24px}.source-page-dialog-header h2{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;font-weight:700;letter-spacing:0;overflow-wrap:anywhere}.source-page-dialog-header :deep(.mobile-help-trigger svg){width:22px;height:22px}.source-page-dialog-body{padding:16px 24px 20px;overflow:auto;min-height:0;overscroll-behavior:contain}
#source-page-form{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.source-page-dialog label{flex:none;margin:0;font-size:1rem;line-height:1.5}.source-page-dialog input{display:block;flex:1 1 88px;min-width:0;width:88px;min-height:48px;padding:10px 12px;font:inherit;font-size:1rem;line-height:1.5;color:var(--ink);background:var(--surface);border:1px solid var(--primary);border-radius:8px;outline-offset:2px}.source-page-count{flex:none;margin-left:auto;color:var(--muted);font-size:.875rem;line-height:1.5;overflow-wrap:anywhere}.source-page-dialog input[aria-invalid=true]{border-color:var(--page-error)}.source-page-dialog-error{flex-basis:100%;margin:0;font-size:.875rem;line-height:1.5;color:var(--page-error);overflow-wrap:anywhere}
.source-page-dialog input:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.source-page-dialog-header h2{word-break:keep-all}
.source-page-dialog-footer{flex:none;display:flex;gap:8px;padding:8px 16px 16px;border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}.source-page-dialog-footer .button{flex:1;min-width:0;min-height:48px;padding:10px 14px;font-size:1rem;line-height:1.5;font-weight:400;border-radius:8px}.source-page-dialog-footer .button:first-child{background:none;border-color:transparent}.source-page-dialog :deep(button){-webkit-tap-highlight-color:transparent}.source-page-dialog :deep(button:active){filter:brightness(.95)}
@media(max-height:500px){.source-page-layer{padding:8px}.source-page-dialog-header{min-height:56px;padding:3.5px 8px 3.5px 16px}.source-page-dialog-header h2{font-size:1rem}.source-page-dialog-body{padding:12px 16px}.source-page-dialog-footer{padding:8px 12px}.source-page-dialog-footer .button{padding:8px;font-size:.875rem}}
</style>
