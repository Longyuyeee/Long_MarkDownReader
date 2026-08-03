<template>
  <component :is="as" class="workspace-empty-state">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ as?: 'div' | 'main' | 'section' }>(), { as: 'div' })
</script>

<style scoped>
.workspace-empty-state {
  min-width: 0;
  min-height: 0;
}
</style>
