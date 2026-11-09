<template>
  <div class="appearance-status" role="alert" aria-label="外观保存状态">
    <TriangleAlert :size="18" aria-hidden="true" />
    <span><span class="appearance-full">{{ kind === 'read' ? '外观设置暂时无法读取。' : '外观已应用，尚未保存。' }}</span><span class="appearance-compact">{{ kind === 'read' ? '外观暂不可读' : '外观暂未保存' }}</span></span>
    <button class="text-button" :disabled="busy" @click="$emit('retry')">{{ busy ? '正在重试…' : kind === 'read' ? '重试读取外观' : '重试保存外观' }}</button>
  </div>
</template>
<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
defineProps<{ kind: 'read' | 'save'; busy: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<style scoped>
.appearance-status { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 16px; flex-shrink:0; background:var(--panel); color:var(--ink); font-size:.8125rem; line-height:1.6; }
.appearance-status>svg { flex-shrink:0; color:var(--warning-ink); }
.appearance-status>span { flex:1; min-width:120px; overflow-wrap:anywhere; }
.appearance-status button { min-height:48px; min-width:48px; color:var(--ink); font:inherit; flex-shrink:0; }
.appearance-compact { display:none; }
@media(max-height:420px) { .appearance-status { display:grid; grid-template-columns:18px minmax(0,1fr); max-height:38dvh; overflow:hidden; }.appearance-status>span { min-width:0; min-height:0; overflow:auto; }.appearance-status button { grid-column:1/-1; justify-self:end; max-width:100%; white-space:normal; }.appearance-full { display:none; }.appearance-compact { display:inline; } }
</style>
