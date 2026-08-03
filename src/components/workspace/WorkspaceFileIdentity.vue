<template>
  <div class="workspace-file-identity">
    <slot />
  </div>
</template>

<style scoped>
.workspace-file-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
