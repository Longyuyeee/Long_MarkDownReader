<template>
  <Teleport to=".mobile-app">
    <div class="mobile-confirmation-backdrop" :inert="mobileHelpOpen" @click.self="cancel" @wheel.self.prevent @touchmove.self.prevent>
      <section ref="dialog" class="mobile-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="mobile-confirmation-title" aria-describedby="mobile-confirmation-consequence" tabindex="-1" @keydown="keydown">
        <h3 id="mobile-confirmation-title">{{ title }}</h3>
        <div class="confirmation-content" tabindex="0" role="region" aria-label="移除记录的影响">
        <p v-if="subject" class="confirmation-subject">{{ subject }}</p>
        <p id="mobile-confirmation-consequence">{{ consequence }}</p>
        <p v-if="error" class="confirmation-error" role="alert">{{ error }}</p>
        <p v-if="busy" role="status">正在移除记录…</p>
        </div>
        <div class="confirmation-actions"><button ref="keep" class="button" :disabled="busy" @click="cancel">继续保留</button><button class="button confirmation-danger" :disabled="busy" @click="emit('confirm')">确认移除记录</button></div>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { focusableControls } from './accessibility'
import { mobileHelpOpen } from './mobileHelp'
const props = defineProps<{ title: string; subject: string; consequence: string; busy: boolean; error: string }>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const dialog = ref<HTMLElement>(), keep = ref<HTMLButtonElement>()
function cancel() { if (!props.busy) emit('cancel') }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return }
  if (event.key !== 'Tab') return
  event.preventDefault()
  const controls = focusableControls(dialog.value)
  if (!controls.length) { dialog.value?.focus(); return }
  const current = controls.indexOf(document.activeElement as HTMLElement)
  controls[event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length]?.focus()
}
onMounted(async () => { await nextTick(); keep.value?.focus({ preventScroll: true }) })
watch(() => props.busy, async value => { await nextTick(); (value ? dialog.value : keep.value)?.focus({ preventScroll: true }) })
</script>
<style scoped>
.mobile-confirmation-backdrop{position:fixed;inset:0;z-index:60;background:#13251d55;backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;overscroll-behavior:contain}
.mobile-confirmation{--confirmation-danger-ink:#88530a;width:100%;max-width:342px;max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;padding:24px;border-radius:18px;background:var(--bg);color:var(--ink);box-shadow:0 10px 50px #0002;outline:0}
h3{flex-shrink:0;font-size:1.25rem;line-height:1.5;margin:0 0 12px;overflow-wrap:anywhere}p{font-size:.875rem;line-height:1.8;color:var(--muted);overflow-wrap:anywhere}.confirmation-content{min-height:0;overflow:auto;overscroll-behavior:contain}.confirmation-content p:first-child{margin-top:2px}.confirmation-content p:last-child{margin-bottom:0}.confirmation-subject{font-weight:700;color:var(--ink)}.confirmation-error{color:var(--confirmation-danger-ink)}.confirmation-actions{display:flex;flex-direction:column;flex-shrink:0;gap:8px;margin-top:14px}.confirmation-actions .button{-webkit-tap-highlight-color:transparent;font-size:1rem;line-height:1.5;padding:10px 16px;width:100%;min-height:48px;justify-content:center}.confirmation-danger{background:var(--warning-soft);color:var(--confirmation-danger-ink)}
:global(.theme-dark .mobile-confirmation){--confirmation-danger-ink:#ffce87}
@media(max-width:340px){
  .mobile-confirmation-backdrop{padding:16px}
  .mobile-confirmation{padding:16px;max-height:calc(100dvh - 32px)}
  h3{font-size:1.0625rem;line-height:1.35}
  p,.confirmation-actions .button{font-size:.875rem;line-height:1.45}
}
</style>
