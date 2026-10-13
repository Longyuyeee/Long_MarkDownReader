<template>
  <div class="workspace-error-boundary">
    <section v-if="failure || initialError" class="workspace-error-state" role="alert">
      <h2>这个页面暂时无法显示</h2>
      <p>可以重试此页面，也可以继续使用左侧导航打开其他页面。</p>
      <div class="workspace-recovery-actions">
        <button type="button" @click="retry">重试此页面</button>
        <button type="button" @click="$emit('home')">返回工作台</button>
        <button type="button" @click="$emit('settings')">资料库设置</button>
      </div>
      <details><summary>错误详情</summary><pre>{{ failure || initialError }}</pre></details>
    </section>
    <div v-else :key="version" class="workspace-page-content"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onErrorCaptured, ref, watch } from 'vue'
const boundary = getCurrentInstance()
const props = withDefaults(defineProps<{ resetKey: string; initialError?: string }>(), { initialError: '' })
const emit = defineEmits<{ error: [error: unknown, blocking: boolean]; home: []; settings: []; retry: [] }>()
const failure = ref(''), version = ref(0)
const retry = () => { failure.value = ''; version.value++; emit('retry') }
watch(() => props.resetKey, () => { if (failure.value) { failure.value = ''; version.value++ } })
onErrorCaptured((error, _instance, info) => {
  // A small broken widget must not take the rest of a usable page with it.
  const renderingFailed = ['setup function', 'render function', 'async component loader', 'component update'].includes(info)
    || /#runtime-(0|1|13|15)$/.test(info)
  const blocking = renderingFailed && _instance?.$.parent === boundary
  if (blocking) failure.value = error instanceof Error ? error.message : String(error)
  emit('error', error, blocking)
  return false
})
</script>

<style scoped>
.workspace-error-boundary, .workspace-page-content { width: 100%; height: 100%; min-width: 0; min-height: 0; }
.workspace-error-state { box-sizing: border-box; margin: 24px; max-width: 560px; padding: 22px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); color: var(--theme-text); }
h2 { margin: 0 0 10px; font-size: 18px; }
p, summary { font-size: 13px; color: var(--theme-text-secondary); line-height: 1.6; }
.workspace-recovery-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
button { min-height: 32px; padding: 0 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-surface-2); font: inherit; font-size: 12px; cursor: pointer; }
pre { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
</style>
