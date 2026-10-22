<template>
  <button type="button" class="workspace-help" data-workspace-help :aria-label="label" :data-app-tooltip="text">
    <CircleHelp :size="16" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'
withDefaults(defineProps<{ text: string; label?: string }>(), { label: '使用说明' })
</script>

<style scoped>
button.workspace-help[data-app-tooltip][type="button"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 26px;
  min-width: 26px;
  max-width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: help;
  vertical-align: middle;
}
button.workspace-help[data-app-tooltip][type="button"]:hover,
button.workspace-help[data-app-tooltip][type="button"]:focus-visible {
  color: var(--theme-primary);
  border-color: var(--workspace-border-color);
  background: var(--workspace-control-hover-bg);
}
button.workspace-help[data-app-tooltip][type="button"]:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
</style>
