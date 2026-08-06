<template>
  <header class="workspace-toolbar-shell" data-horizontal-wheel="always">
    <slot />
  </header>
</template>

<style scoped>
.workspace-toolbar-shell {
  min-width: 0;
  min-height: var(--workspace-toolbar-height);
  flex: 0 0 auto;
  overflow-x: auto;
  scrollbar-width: none;
}
.workspace-toolbar-shell::-webkit-scrollbar { width: 0; height: 0; }
</style>
