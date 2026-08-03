<template>
  <header class="workspace-toolbar-shell">
    <slot />
  </header>
</template>

<style scoped>
.workspace-toolbar-shell {
  min-width: 0;
  min-height: var(--workspace-toolbar-height);
  flex: 0 0 auto;
}
</style>
