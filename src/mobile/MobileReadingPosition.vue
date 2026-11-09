<template>
  <div class="reading-position-error" role="alert" tabindex="0" aria-label="阅读位置状态"><TriangleAlert :size="18" aria-hidden="true" /><span><span class="full-message">{{ kind==='read'?'上次阅读位置暂不可读取，原记录仍保留。':'阅读位置暂未确认保存，请重试。' }}</span><span class="compact-message">{{ kind==='read'?'暂时无法恢复位置':'阅读位置尚未保存' }}</span></span><button class="text-button" :disabled="busy" @click="$emit('retry')">{{ busy?'正在重试…':kind==='read'?'重试恢复位置':'重试记录位置' }}</button></div>
</template>
<script setup lang="ts">
import {TriangleAlert} from 'lucide-vue-next'
defineProps<{kind:'read'|'save';busy:boolean}>()
defineEmits<{retry:[]}>()
</script>
<style scoped>
.reading-position-error{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;flex-shrink:0;max-height:28dvh;min-height:48px;overflow:auto;background:var(--panel);color:var(--ink);font-size:.8125rem;line-height:1.6}.reading-position-error>svg{flex-shrink:0;color:var(--warning-ink)}.reading-position-error>span{flex:1;min-width:150px;overflow-wrap:anywhere}.reading-position-error .text-button{color:var(--ink);font-size:inherit;min-height:48px;min-width:48px;flex-shrink:0}
.compact-message{display:none}
@media(max-height:420px){.reading-position-error{display:grid;grid-template-columns:18px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;max-height:36dvh;overflow:hidden}.reading-position-error>span{min-width:0;min-height:0;overflow:auto}.reading-position-error>svg{align-self:start;margin-top:4px}.reading-position-error .text-button{grid-column:1/-1;justify-self:end;max-width:100%;white-space:normal}.full-message{display:none}.compact-message{display:inline}}
</style>
