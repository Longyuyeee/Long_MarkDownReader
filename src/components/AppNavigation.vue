<template>
  <nav class="app-navigation" aria-label="主导航">
    <div class="navigation-destinations">
      <router-link v-for="item in destinations" :key="item.name" :to="{ name: item.name }"
        :class="{ active: activeDestination === item.name }" :aria-current="activeDestination === item.name ? 'page' : undefined">
        <span class="navigation-icon" aria-hidden="true"><component :is="item.icon" :size="19" /></span><span>{{ item.label }}</span>
      </router-link>
    </div>
    <router-link class="navigation-settings" :class="{ active: activeDestination === 'Settings' }"
      :to="{ name: 'Settings' }" :aria-current="activeDestination === 'Settings' ? 'page' : undefined">
      <span class="navigation-icon" aria-hidden="true"><Settings :size="19" /></span><span>设置</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LayoutDashboard, FolderOpen, Network, Settings } from 'lucide-vue-next'

const route = useRoute()
const destinations = [
  { name: 'LibraryMode', label: '资料库', icon: FolderOpen },
  { name: 'WorkspaceHome', label: '工作台', icon: LayoutDashboard },
  { name: 'Graph', label: '图谱', icon: Network },
]
const activeDestination = computed(() => {
  if (route.name === 'Settings' || route.name === 'ReleaseCapabilities') return 'Settings'
  return destinations.some(item => item.name === route.name) ? route.name : 'LibraryMode'
})
</script>

<style scoped>
.app-navigation { flex: 0 0 68px; width: 68px; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px 6px; border-right: var(--theme-border); color: var(--theme-text-secondary); background: var(--style-card-gradient, var(--theme-surface)); overflow-y: auto; }
.navigation-destinations { display: grid; gap: 8px; }
a { min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: var(--theme-radius-sm); color: inherit; text-decoration: none; font-size: var(--text-compact); }
a:hover { color: var(--theme-primary); background: var(--workspace-control-hover-bg); }
a.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .1); }
a:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
.navigation-settings { margin-top: auto; }
@media (max-width: 760px) {
  .app-navigation { flex: 0 0 44px; width: 100%; flex-direction: row; padding: 3px 8px; gap: 4px; border-right: 0; border-bottom: var(--theme-border); overflow-y: hidden; }
  .navigation-destinations { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; }
  a { min-height: 36px; flex-direction: row; gap: 5px; padding: 0 4px; }
  .navigation-settings { margin: 0; }
}
@media (max-width: 400px) { a { gap: 3px; padding: 0 2px; } a svg { width: 16px; } }
</style>
