<template>
  <div v-if="show" class="hover-preview" :style="style">
    <div class="preview-header">
      <n-icon :component="FileIcon" />
      <span>{{ title }}</span>
    </div>
    <div class="preview-content">
      <div ref="previewContent"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FileText as FileIcon } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import Vditor from 'vditor'

const props = defineProps<{
  show: boolean
  title: string
  path: string
  x: number
  y: number
}>()

const previewContent = ref<HTMLDivElement | null>(null)
const style = computed(() => ({
  left: `${props.x + 10}px`,
  top: `${props.y + 10}px`
}))

watch(() => props.path, async (newPath) => {
  if (newPath && props.show) {
    try {
      const result = await invoke<{content: string}>('read_markdown_file', { path: newPath })
      if (previewContent.value) {
        Vditor.preview(previewContent.value, result.content, {
          mode: 'light',
        })
      }
    } catch (err) {}
  }
})
</script>

<style scoped>
.hover-preview {
  position: fixed;
  width: 300px;
  max-height: 400px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  z-index: 11000;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: none;
}

.dark .hover-preview {
  background: rgba(40, 40, 40, 0.9);
  border-color: rgba(255, 255, 255, 0.1);
}

.preview-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.preview-content {
  flex: 1;
  padding: 12px;
  font-size: 13px;
  overflow-y: auto;
}

:deep(.vditor-reset) {
  font-size: 13px !important;
}
</style>
