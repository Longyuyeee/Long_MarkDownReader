<template>
  <div class="workspace-segmented-control" role="group" data-horizontal-wheel="always">
    <slot />
  </div>
</template>

<style scoped>
.workspace-segmented-control {
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
}
.workspace-segmented-control::-webkit-scrollbar { width: 0; height: 0; }
</style>
