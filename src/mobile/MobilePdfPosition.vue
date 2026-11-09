<template>
  <div class="pdf-position" :class="{'has-error':!!error}" :role="error?'alert':'status'" :tabindex="error?0:undefined" :aria-label="error?'阅读位置状态':undefined">
    <TriangleAlert v-if="error" :size="16" aria-hidden="true" /><LoaderCircle v-else-if="busy" :size="16" class="spin" aria-hidden="true" /><CheckCircle2 v-else :size="16" aria-hidden="true" />
    <span>{{ selectionIssue || text }}</span>
    <button v-if="selectionIssue" class="text-button" @click="$emit('clear')">取消选文</button>
    <button v-else-if="error" class="text-button position-retry" :disabled="busy" @click="$emit('retry')">{{ busy?'正在重试…':error==='read'?'重试恢复位置':'重试记录位置' }}</button>
    <small v-else>仅保存在此设备</small>
  </div>
</template>
<script setup lang="ts">
import {CheckCircle2,TriangleAlert,LoaderCircle} from 'lucide-vue-next'
defineProps<{text:string;error:''|'read'|'save';busy:boolean;selectionIssue?:string}>()
defineEmits<{clear:[];retry:[]}>()
</script>
<style scoped>
.pdf-position{display:flex;align-items:center;gap:6px;padding:8px 16px;color:var(--muted);font-size:.75rem;min-height:34px;flex-shrink:0}.pdf-position>svg{flex-shrink:0}.pdf-position small{margin-left:auto}.has-error{flex-wrap:wrap;max-height:34dvh;overflow:auto;min-height:48px;color:var(--warning-ink)}.has-error>span{flex:1;min-width:150px;overflow-wrap:anywhere}.position-retry{min-height:48px;min-width:48px;flex-shrink:0}.spin{animation:position-spin 1s linear infinite}@keyframes position-spin{to{transform:rotate(360deg)}}
.has-error,.position-retry{color:var(--ink)}.has-error>svg{color:var(--warning-ink)}
@media(max-height:400px){.pdf-position:not(.has-error){display:none}}
@media(max-width:360px){.pdf-position small{display:none}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style>
