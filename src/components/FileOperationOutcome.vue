<template>
  <div class="operation-outcome" role="status" aria-live="polite">
    <section v-if="completed.length" class="outcome-group" aria-label="已完成的项目">
      <h4>已完成 · {{ completed.length }} 项</h4>
      <p v-for="item in completed" :key="item.oldPath"><strong>{{ filename(item.oldPath) }}</strong><small>→ {{ item.newPath }}</small></p>
    </section>
    <section v-if="retryable.length" class="outcome-group" role="alert" :aria-label="isPathMutation(operation) ? '未执行的项目' : '未完成的项目'">
      <h4>{{ isPathMutation(operation) ? '未执行' : '未完成' }} · {{ retryable.length }} 项</h4>
      <p v-for="error in retryable" :key="error.path"><strong>{{ filename(error.path) || '本次操作' }}</strong><small>{{ error.message }}</small></p>
    </section>
    <section v-if="review.length" class="outcome-group needs-review" aria-label="需要核对的项目" role="alert">
      <h4>需核对 · {{ review.length }} 项</h4>
      <p class="review-hint">状态尚未确认，这些项目不会直接重试。请保留原文件和核对记录。</p>
      <p v-for="error in review" :key="error.path"><strong>{{ filename(error.path) || '本次操作' }}</strong><small>{{ error.message }}</small><small v-if="error.path">原路径：{{ error.path }}</small><small v-if="error.recoveryId">核对记录：<code>{{ error.recoveryId }}</code></small><n-button v-if="error.recoveryId" size="small" @click="emit('review', error.recoveryId)">核对状态…</n-button></p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { canRetryFileError, isPathMutation, type FileOperation, type FileOperationError, type PathChange } from '../services/libraryFileOperations'
const props = defineProps<{ completed: PathChange[]; errors: FileOperationError[]; operation: FileOperation }>()
const emit = defineEmits<{ review: [id: string] }>()
const retryable = computed(() => props.errors.filter(error => canRetryFileError(error, props.operation)))
const review = computed(() => props.errors.filter(error => !canRetryFileError(error, props.operation)))
const filename = (path: string) => path.split(/[\\/]/).pop() || path
</script>
<style scoped>
.operation-outcome { max-height: 43vh; overflow: auto; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); padding: 2px 14px; overflow-wrap: anywhere; }
.outcome-group { padding: 12px 0; }.outcome-group + .outcome-group { border-top: var(--theme-border); }.outcome-group h4 { margin: 0 0 8px; font-size: var(--text-ui); font-weight: 600; }.outcome-group p { margin: 8px 0; }.outcome-group strong { font-weight: 500; }.outcome-group small { display: block; color: var(--theme-text-secondary); font-size: var(--text-compact); margin-top: 3px; }.outcome-group code { font-size: inherit; user-select: text; }.needs-review h4 { color: var(--theme-warning, #a66a17); }.review-hint { color: var(--theme-text-secondary); font-size: var(--text-compact); }
</style>
