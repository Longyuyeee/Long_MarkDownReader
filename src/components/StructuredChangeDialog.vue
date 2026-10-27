<template>
  <n-modal :show="true" preset="card" :title="title" class="structured-change-dialog" :style="{width:'min(940px,94vw)',maxHeight:'calc(100dvh - 24px)'}" @update:show="value => { if (!value) $emit('cancel') }" @close="$emit('cancel')">
    <TextDiff :current="current" :target="target" current-label="当前草稿" target-label="修改后" />
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer><div class="change-actions"><span>只修改草稿，可撤销；保存后写入文件。</span><n-button @click="$emit('cancel')">取消</n-button><n-button type="primary" :disabled="Boolean(error)" @click="$emit('apply')">应用到草稿</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { NButton, NModal } from 'naive-ui'
import TextDiff from './TextDiff.vue'
defineProps<{title:string;current:string;target:string;error?:string}>()
defineEmits<{apply:[];cancel:[]}>()
</script>
<style scoped>
:global(.structured-change-dialog .n-card__content){min-height:0;overflow:auto}.change-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.change-actions span{margin-right:auto;color:var(--theme-text-secondary);font-size:var(--text-sm)}[role=alert]{color:var(--status-danger);overflow-wrap:anywhere}
</style>
