<template>
  <transition name="preview-fade">
    <div v-if="show" id="file-tree-detail-preview" class="hover-card" role="tooltip" :style="style">
      <div class="card-glow"></div>
      <div class="card-inner">
        <div class="card-header">
          <div class="title-row">
            <n-icon :component="FileIcon" class="file-icon" />
            <span class="file-title">{{ title }}</span>
          </div>
          <div class="file-path">{{ displayPath }}</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-label">
              <n-icon :component="ClockIcon" />
              <span>创建时间</span>
            </div>
            <div class="stat-value">{{ stats.created || '---' }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <n-icon :component="EditIcon" />
              <span>最近修改</span>
            </div>
            <div class="stat-value modified">{{ stats.modified || '---' }}</div>
          </div>
        </div>

        <div class="size-tag" v-if="stats.size">
          {{ formatSize(stats.size) }}
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { FileText as FileIcon, Clock as ClockIcon, Edit as EditIcon } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/app'

const props = defineProps<{
  show: boolean
  title: string
  path: string
  x: number
  y: number
}>()

const stats = ref({ created: '', modified: '', size: 0 })
const offset = reactive({ x: 15, y: 15 })
const store = useAppStore()

const style = computed(() => {
  let left = props.x + offset.x
  let top = props.y + offset.y
  
  // 智能防溢出处理
  const vWidth = window.innerWidth
  const vHeight = window.innerHeight
  const cardWidth = 260
  const cardHeight = 180 // 预估高度

  if (left + cardWidth > vWidth) left = props.x - cardWidth - 10
  if (top + cardHeight > vHeight) top = props.y - cardHeight - 10
  
  return {
    left: `${Math.max(10, left)}px`,
    top: `${Math.max(10, top)}px`
  }
})

const displayPath = computed(() => {
  if (!props.path) return ''
  const parts = props.path.split(/[\\/]/)
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : props.path
})

const formatDate = (ts: number) => {
  const date = new Date(ts * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const fetchStats = async () => {
  if (props.path && props.show) {
    try {
      const res = await invoke<any>('get_file_stats', { libraryRoot: store.libraryPath, path: props.path })
      stats.value = {
        created: formatDate(res.created),
        modified: formatDate(res.modified),
        size: res.size
      }
    } catch (err) {
      console.error('Failed to get file stats', err)
    }
  }
}

watch([() => props.path, () => props.show], fetchStats, { immediate: true })
</script>

<style scoped>
.hover-card {
  position: fixed;
  min-width: 240px;
  max-width: 320px;
  z-index: 20000;
  pointer-events: none;
  border-radius: var(--theme-radius);
  overflow: hidden;
  padding: 1px;
  background: rgba(var(--theme-primary-rgb, 0,122,255), 0.08);
  box-shadow: var(--theme-shadow);
  border: var(--theme-border);
}

:global(.is-dark) .hover-card {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.card-glow {
  display: none;
}

.card-inner {
  position: relative;
  background: var(--theme-bg);
  padding: 16px 18px;
  border-radius: calc(var(--theme-radius) - 1px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

:global(.is-dark) .card-inner {
  background: rgba(30, 30, 32, 0.95);
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 40px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  color: var(--theme-primary);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--theme-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path {
  font-size: var(--text-compact);
  color: var(--text-tertiary, rgba(29,29,31,0.35));
  font-weight: 500;
  padding-left: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-compact);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, rgba(29,29,31,0.35));
}

.stat-label n-icon {
  font-size: 12px;
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-text);
  padding-left: 20px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stat-value.modified {
  color: var(--theme-primary);
}

.size-tag {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: var(--text-compact);
  font-weight: 900;
  padding: 2px 8px;
  background: var(--theme-card);
  border-radius: 20px;
  color: var(--theme-text);
  opacity: 0.6;
}

/* 动效 */
.preview-fade-enter-active {
  transition: all 0.3s var(--ease-premium);
}
.preview-fade-leave-active {
  transition: all 0.15s var(--ease-premium);
}
.preview-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.preview-fade-leave-to {
  opacity: 0;
}
</style>
