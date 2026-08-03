<template>
  <WorkspaceToolbar class="workspace-management-header">
    <div class="management-leading">
      <button class="management-back" type="button" :title="backLabel" @click="$emit('back')">
        <ArrowLeft :size="16" />
        <span>{{ backLabel }}</span>
      </button>
      <div class="management-identity">
        <slot name="icon" />
        <div>
          <strong>{{ title }}</strong>
          <small v-if="subtitle">{{ subtitle }}</small>
        </div>
      </div>
    </div>
    <div class="management-actions">
      <slot />
    </div>
  </WorkspaceToolbar>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import WorkspaceToolbar from './WorkspaceToolbar.vue'

withDefaults(defineProps<{
  title: string
  subtitle?: string
  backLabel?: string
}>(), {
  subtitle: '',
  backLabel: '返回资料库',
})

defineEmits<{ back: [] }>()
</script>

<style scoped>
.workspace-management-header {
  min-height: var(--workspace-management-header-height);
  padding: 0 var(--workspace-page-gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.management-leading,
.management-actions,
.management-back,
.management-identity {
  min-width: 0;
  display: flex;
  align-items: center;
}

.management-leading { gap: var(--space-3); }
.management-actions { justify-content: flex-end; gap: var(--space-2); }

.management-back {
  min-height: var(--workspace-control-height);
  gap: 6px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  font-size: var(--text-sm);
}

.management-back:hover {
  color: var(--theme-primary);
  border-color: color-mix(in srgb, var(--theme-primary) 24%, transparent);
  background: color-mix(in srgb, var(--theme-primary) 7%, transparent);
}

.management-identity { gap: 9px; }
.management-identity > div { min-width: 0; display: grid; gap: 2px; }
.management-identity strong,
.management-identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.management-identity strong { font-size: var(--text-md); }
.management-identity small { color: var(--theme-text-secondary); font-size: var(--text-compact); }

@media (max-width: 640px) {
  .management-back span,
  .management-identity small { display: none; }
  .management-back { width: var(--workspace-control-height); padding: 0; justify-content: center; }
}
</style>
