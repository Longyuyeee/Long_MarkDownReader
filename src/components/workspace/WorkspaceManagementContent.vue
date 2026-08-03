<template>
  <component :is="as" class="workspace-management-content" :class="{ narrow }">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: string
  narrow?: boolean
}>(), {
  as: 'main',
  narrow: false,
})
</script>

<style scoped>
.workspace-management-content {
  width: min(var(--workspace-page-max-width), calc(100% - var(--workspace-page-gutter) - var(--workspace-page-gutter)));
  margin: 0 auto;
  padding: var(--space-6) 0 48px;
  box-sizing: border-box;
}

.workspace-management-content.narrow {
  max-width: var(--workspace-page-narrow-width);
}

@media (max-width: 640px) {
  .workspace-management-content { padding-top: var(--space-4); }
}
</style>
