<template>
  <component
    :is="as"
    class="workspace-state-notice"
    :class="[`tone-${tone}`, { compact }]"
    :data-state="kind"
    :role="role"
    :aria-live="liveRegion"
  >
    <slot name="icon"><span v-if="kind === 'loading'" class="state-spinner" aria-hidden="true"></span></slot>
    <div class="state-copy">
      <strong v-if="title">{{ title }}</strong>
      <slot />
    </div>
    <div v-if="$slots.action" class="state-action"><slot name="action" /></div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type WorkspaceStateKind = 'loading' | 'empty' | 'error' | 'readonly' | 'limited' | 'external' | 'saved'
type WorkspaceStateTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const props = withDefaults(defineProps<{
  kind: WorkspaceStateKind
  tone?: WorkspaceStateTone
  title?: string
  as?: string
  compact?: boolean
}>(), {
  tone: 'neutral',
  title: '',
  as: 'div',
  compact: false,
})

const role = computed(() => props.kind === 'error' ? 'alert' : 'status')
const liveRegion = computed(() => props.kind === 'error' ? 'assertive' : 'polite')
</script>

<style scoped>
.workspace-state-notice {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--workspace-border-color);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  font-size: var(--text-compact);
  line-height: 1.5;
}

.workspace-state-notice.compact { padding: 7px 9px; gap: 7px; }
.state-copy { min-width: 0; display: grid; gap: 3px; }
.state-copy strong { color: var(--theme-text); font-size: var(--text-body); }
.state-copy :deep(p) { margin: 0; }
.state-action :deep(button) { min-height: var(--workspace-control-height); }
.state-spinner { width: 18px; height: 18px; border: 2px solid var(--status-info-border); border-top-color: var(--status-info); border-radius: 50%; animation: state-spin .7s linear infinite; }

.tone-info { color: var(--status-info); border-color: var(--status-info-border); background: var(--status-info-bg); }
.tone-success { color: var(--status-success); border-color: var(--status-success-border); background: var(--status-success-bg); }
.tone-warning { color: var(--status-warning); border-color: var(--status-warning-border); background: var(--status-warning-bg); }
.tone-danger { color: var(--status-danger); border-color: var(--status-danger-border); background: var(--status-danger-bg); }
.tone-info .state-copy strong,
.tone-success .state-copy strong,
.tone-warning .state-copy strong,
.tone-danger .state-copy strong { color: currentColor; }

@keyframes state-spin { to { transform: rotate(360deg); } }
</style>
