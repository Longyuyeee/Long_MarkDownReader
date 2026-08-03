<template>
  <component :is="as" class="workspace-status-bar" role="status" aria-live="polite">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ as?: 'div' | 'footer' }>(), { as: 'footer' })
</script>

<style scoped>
.workspace-status-bar {
  min-width: 0;
  min-height: var(--workspace-status-height);
  flex: 0 0 auto;
}
</style>
