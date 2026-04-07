<template>
  <transition name="preview-fade">
    <div v-if="show" class="hover-card" :style="style">
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

const props = defineProps<{
  show: boolean
  title: string
  path: string
  x: number
  y: number
}>()

const stats = ref({ created: '', modified: '', size: 0 })
const offset = reactive({ x: 15, y: 15 })

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
      const res = await invoke<any>('get_file_stats', { path: props.path })
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
  border-radius: 18px;
  overflow: hidden;
  padding: 1px;
  background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%);
  box-shadow: 
    0 10px 30px rgba(0,0,0,0.12),
    0 0 0 1px rgba(0,0,0,0.05);
  backdrop-filter: blur(25px) saturate(160%);
  animation: cardPulse 4s infinite alternate;
}

.card-glow {
  position: absolute;
  top: -50%; left: -50%; width: 200%; height: 200%;
  background: radial-gradient(circle at center, var(--theme-primary) 0%, transparent 70%);
  opacity: 0.05;
  pointer-events: none;
}

.card-inner {
  position: relative;
  background: rgba(255, 255, 255, 0.7);
  padding: 16px 18px;
  border-radius: 17px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

:global(.is-dark) .card-inner {
  background: rgba(30, 30, 32, 0.8);
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
  font-size: 10px;
  opacity: 0.4;
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
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
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
  font-size: 10px;
  font-weight: 900;
  padding: 2px 8px;
  background: rgba(0,0,0,0.05);
  border-radius: 20px;
  opacity: 0.6;
}

:global(.is-dark) .size-tag {
  background: rgba(255,255,255,0.1);
}

/* 动效 */
.preview-fade-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.preview-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.preview-fade-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(10px) rotate(-2deg);
  filter: blur(10px);
}
.preview-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@keyframes cardPulse {
  from { box-shadow: 0 10px 30px rgba(0,0,0,0.12); }
  to { box-shadow: 0 15px 40px rgba(var(--theme-primary-rgb), 0.15); }
}
</style>
