<template>
  <div v-if="mobileHelpState" class="mobile-help-backdrop" @click.self="dismissMobileHelp">
    <section ref="dialog" class="mobile-help-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-help-title" tabindex="-1" :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined" @keydown="keydown">
      <div class="mobile-help-grip" aria-hidden="true" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="finishDrag" @lostpointercapture="cancelDrag" />
      <header>
        <h2 id="mobile-help-title" ref="heading" tabindex="-1"><template v-for="(part, index) in titleParts" :key="part"><wbr v-if="index">{{ part }}</template></h2>
        <button type="button" class="icon-button" aria-label="关闭说明" @click="dismissMobileHelp"><X :size="22" aria-hidden="true" /></button>
      </header>
      <!-- Android groups this focusable scroll body: an author label would replace its paragraphs. -->
      <div class="mobile-help-content" tabindex="0"><p v-for="paragraph in topic?.paragraphs" :key="paragraph">{{ paragraph }}</p><details v-if="mobileHelpState.topic === 'import'"><summary>支持的源码格式</summary><ul><li v-for="format in codeFormats" :key="format.language">{{ format.label }} · {{ format.extensions.map(extension => '.' + extension).join(' / ') }}</li></ul></details></div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { codeFormats } from './codeFormats'
import { canFocus, focusableControls, focusPageHeading } from './accessibility'
import { dismissMobileHelp, mobileHelpState, mobileHelpTopics } from './mobileHelp'
const dialog = ref<HTMLElement>(), heading = ref<HTMLElement>()
const topic = computed(() => mobileHelpState.value ? mobileHelpTopics[mobileHelpState.value.topic] : null)
const titleParts = computed(() => topic.value?.title.split(/(?<=[A-Z])(?=\p{Script=Han})/u) ?? [])
const dragOffset = ref(0)
let drag: { pointerId: number; startY: number } | null = null
let epoch = 0
watch(mobileHelpState, async (value, previous) => {
  drag = null
  dragOffset.value = 0
  const owner = ++epoch
  await nextTick()
  if (owner !== epoch) return
  if (value) heading.value?.focus({ preventScroll: true })
  else { const trigger = previous?.trigger; if (canFocus(trigger)) trigger.focus({ preventScroll: true }); else focusPageHeading() }
}, { flush: 'post' })
function startDrag(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return
  const grip = event.currentTarget as HTMLElement
  grip.setPointerCapture(event.pointerId)
  drag = { pointerId: event.pointerId, startY: event.clientY }
}
function moveDrag(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return
  dragOffset.value = Math.max(0, event.clientY - drag.startY)
}
function cancelDrag(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return
  drag = null
  dragOffset.value = 0
}
function finishDrag(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return
  const shouldDismiss = event.clientY - drag.startY >= 64
  cancelDrag(event)
  if (shouldDismiss) dismissMobileHelp()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); dismissMobileHelp(); return }
  if (event.key !== 'Tab') return
  const controls = focusableControls(dialog.value)
  if (!controls.length) { event.preventDefault(); return }
  const index = controls.indexOf(document.activeElement as HTMLElement)
  event.preventDefault(); controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length]?.focus()
}
onBeforeUnmount(() => { epoch++; dismissMobileHelp() })
</script>
<style scoped>
.mobile-help-backdrop{position:fixed;inset:0;z-index:1000;background:#0005;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;overscroll-behavior:contain}
.mobile-help-dialog{display:flex;flex-direction:column;width:min(100%,600px);max-height:min(max(46dvh,16rem),75dvh,620px);min-height:0;border-radius:20px 20px 0 0;background:var(--bg,#fcfcf8);color:var(--ink,#263a30);box-shadow:0 -8px 32px #14251c18;padding-bottom:max(16px,env(safe-area-inset-bottom));outline:0}
.mobile-help-grip{height:34px;flex:none;display:flex;justify-content:center;padding-top:12px;touch-action:none;cursor:grab}
.mobile-help-grip::before{content:"";width:40px;height:4px;border-radius:2px;background:currentColor;opacity:.24}
header{display:flex;align-items:center;gap:12px;padding:0 12px 4px 22px;flex-shrink:0}h2{flex:1;min-width:0;margin:0;font-size:1.25rem;font-weight:650;line-height:1.4;text-wrap:balance;overflow-wrap:anywhere;outline:0}header button{width:48px;min-width:48px;height:48px;min-height:48px;color:inherit}
h2:has(wbr){word-break:keep-all}
.mobile-help-content{min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px 22px 0}.mobile-help-content p{font-size:1rem;line-height:1.7;margin:0 0 16px;overflow-wrap:anywhere}.mobile-help-content p:last-child{margin-bottom:0}
@media(max-height:600px){.mobile-help-dialog{max-height:90dvh}}
@media(max-width:340px){
  header{gap:8px;padding-inline:16px 8px}
  h2{font-size:1.0625rem}
  .mobile-help-content{padding-inline:16px}
}
.mobile-help-content:focus-visible{outline:2px solid var(--primary,#37765a);outline-offset:-2px}
</style>
