<template>
  <div class="release-capabilities">
    <header>
      <button class="icon-button" type="button" title="返回设置" @click="router.back()">
        <ArrowLeft :size="18" />
      </button>
      <div>
        <h1>格式能力</h1>
        <span>Long编辑 {{ RELEASE_MATRIX_VERSION }} · {{ RELEASE_CAPABILITY_ROWS.length }} 类格式</span>
      </div>
      <div class="release-state">
        <ShieldCheck :size="16" />
        <span>{{ RELEASE_CANDIDATE ? '发布候选' : `${RELEASE_STAGE} 收口中` }}</span>
      </div>
    </header>

    <main>
      <div class="toolbar">
        <label class="search-box">
          <Search :size="16" />
          <input v-model="query" type="search" placeholder="搜索格式或扩展名" />
        </label>
        <div class="segments" aria-label="能力筛选">
          <button
            v-for="option in filters"
            :key="option.value"
            type="button"
            :class="{ active: activeFilter === option.value }"
            @click="activeFilter = option.value"
          >
            {{ option.label }}
            <span>{{ option.count }}</span>
          </button>
        </div>
      </div>

      <div class="matrix-head" aria-hidden="true">
        <span>格式</span>
        <span>公开能力</span>
        <span>保存边界</span>
        <span>依赖</span>
      </div>

      <div v-if="filteredRows.length" class="matrix">
        <details v-for="row in filteredRows" :key="row.format.id" class="matrix-row">
          <summary>
            <span class="format-identity">
              <strong>{{ row.format.label }}</strong>
              <small>{{ row.format.extensions.join(' · ') }}</small>
            </span>
            <span class="capability" :class="`level-${row.format.userCapability.level}`">
              {{ row.format.userCapability.label }}
            </span>
            <span class="save-mode">{{ saveModeLabel(row.format.userCapability.saveMode) }}</span>
            <span class="dependency">{{ dependencyLabel(row.dependency) }}</span>
            <ChevronDown class="chevron" :size="16" />
          </summary>
          <div class="row-detail">
            <section>
              <h2>源文件策略</h2>
              <p>{{ row.sourcePolicy }}</p>
            </section>
            <section>
              <h2>隐私边界</h2>
              <p>{{ row.privacyBoundary }}</p>
            </section>
            <section>
              <h2>已知限制</h2>
              <p>{{ row.knownLimitations.join('；') }}</p>
            </section>
            <section>
              <h2>当前能力</h2>
              <p>{{ row.format.userCapability.description }}</p>
            </section>
          </div>
        </details>
      </div>
      <div v-else class="empty-state">没有匹配的格式</div>

      <section class="external-gates">
        <div class="section-heading">
          <h2>外部证据门禁</h2>
          <span>{{ RELEASE_EXTERNAL_GATES.length }}</span>
        </div>
        <div v-for="gate in RELEASE_EXTERNAL_GATES" :key="gate.id" class="gate-row">
          <span class="gate-status">{{ gate.status === 'complete' ? '完成' : '待外部环境' }}</span>
          <strong>{{ gate.id }}</strong>
          <span>{{ gate.evidence }}</span>
          <p>{{ gate.releaseImpact }}</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronDown, Search, ShieldCheck } from 'lucide-vue-next'
import {
  RELEASE_CANDIDATE,
  RELEASE_CAPABILITY_ROWS,
  RELEASE_EXTERNAL_GATES,
  RELEASE_MATRIX_VERSION,
  RELEASE_STAGE,
  type ReleaseDependency,
  type ReleaseReadiness,
} from '../config/releaseCapabilities'
import type { SaveMode } from '../config/fileFormats'

type FilterValue = 'all' | ReleaseReadiness

const router = useRouter()
const query = ref('')
const activeFilter = ref<FilterValue>('all')

const filters = computed(() => [
  { value: 'all' as const, label: '全部', count: RELEASE_CAPABILITY_ROWS.length },
  { value: 'verified' as const, label: '已验证', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'verified').length },
  { value: 'verified-with-limitations' as const, label: '有限能力', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'verified-with-limitations').length },
  { value: 'external-dependency' as const, label: '外部依赖', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'external-dependency').length },
])

const filteredRows = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return RELEASE_CAPABILITY_ROWS.filter(row => {
    if (activeFilter.value !== 'all' && row.readiness !== activeFilter.value) return false
    if (!needle) return true
    return row.format.label.toLocaleLowerCase().includes(needle)
      || row.format.id.includes(needle)
      || row.format.extensions.some(extension => extension.includes(needle))
  })
})

const saveModeLabel = (mode: SaveMode) => ({
  overwrite: '原文件保存',
  'bounded-overwrite': '有限写回',
  sidecar: 'Sidecar',
  copy: '仅新副本',
  none: '不保存',
})[mode]

const dependencyLabel = (dependency: ReleaseDependency) => ({
  none: '无',
  'compatible-office-suite': '兼容 Office',
  'compatible-desktop-application': '兼容应用',
})[dependency]
</script>

<style scoped>
.release-capabilities {
  min-height: 100vh;
  color: var(--theme-text);
  background: var(--theme-bg);
}

header {
  min-height: 72px;
  padding: 12px clamp(18px, 4vw, 52px);
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.icon-button {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.icon-button:hover { background: rgba(var(--theme-primary-rgb), 0.08); }
header > div:nth-child(2) { min-width: 0; flex: 1; }
h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
header span { color: var(--theme-text-secondary); font-size: 12px; }

.release-state {
  min-height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: var(--theme-border);
  border-radius: 6px;
}

main {
  width: min(1180px, calc(100% - 36px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.search-box {
  width: min(320px, 100%);
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: var(--theme-border);
  border-radius: 6px;
  background: var(--theme-surface);
}

.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
}

.segments {
  min-width: 0;
  display: flex;
  overflow-x: auto;
  border: var(--theme-border);
  border-radius: 6px;
}

.segments button {
  height: 34px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-right: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  white-space: nowrap;
  cursor: pointer;
}

.segments button:last-child { border-right: 0; }
.segments button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.09); }
.segments span { font-size: var(--text-compact); }

.matrix-head,
.matrix-row summary {
  display: grid;
  grid-template-columns: minmax(190px, 1.5fr) minmax(130px, 1fr) minmax(110px, 0.8fr) minmax(110px, 0.8fr) 20px;
  align-items: center;
  gap: 12px;
}

.matrix-head {
  padding: 0 14px 8px;
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.matrix {
  border-top: var(--theme-border);
  background: var(--theme-surface);
}

.matrix-row { border-bottom: var(--theme-border); }
.matrix-row summary {
  min-height: 58px;
  padding: 8px 14px;
  list-style: none;
  cursor: pointer;
}
.matrix-row summary::-webkit-details-marker { display: none; }
.matrix-row summary:hover { background: rgba(var(--theme-primary-rgb), 0.045); }
.format-identity { min-width: 0; display: flex; flex-direction: column; }
.format-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.format-identity small { color: var(--theme-text-secondary); font-size: 11px; }

.capability {
  width: fit-content;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 4px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.1);
  font-size: 11px;
}
.level-preview-only,
.level-external-open { color: var(--theme-text-secondary); background: var(--theme-bg); }
.save-mode, .dependency { color: var(--theme-text-secondary); font-size: 12px; }
.chevron { color: var(--theme-text-secondary); transition: transform 160ms ease; }
.matrix-row[open] .chevron { transform: rotate(180deg); }

.row-detail {
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  border-top: var(--theme-border);
  background: var(--theme-bg);
}
.row-detail h2 { margin: 0 0 4px; color: var(--theme-text-secondary); font-size: 11px; letter-spacing: 0; }
.row-detail p { margin: 0; font-size: 12px; line-height: 1.55; }

.empty-state { padding: 48px; color: var(--theme-text-secondary); text-align: center; }
.external-gates { margin-top: 30px; border-top: var(--theme-border); }
.section-heading { min-height: 50px; display: flex; align-items: center; gap: 8px; }
.section-heading h2 { margin: 0; font-size: 14px; letter-spacing: 0; }
.section-heading span { color: var(--theme-text-secondary); font-size: 11px; }
.gate-row {
  min-height: 52px;
  padding: 8px 12px;
  display: grid;
  grid-template-columns: 90px minmax(180px, 0.8fr) 60px minmax(260px, 2fr);
  align-items: center;
  gap: 12px;
  border-bottom: var(--theme-border);
  font-size: 12px;
}
.gate-row p { margin: 0; color: var(--theme-text-secondary); }
.gate-status { color: var(--theme-warning, #b77813); }

@media (max-width: 760px) {
  main { width: min(100% - 24px, 1180px); padding-top: 16px; }
  .toolbar { align-items: stretch; flex-direction: column; }
  .search-box { width: 100%; box-sizing: border-box; }
  .matrix-head { display: none; }
  .matrix-row summary {
    grid-template-columns: minmax(130px, 1fr) minmax(100px, auto) 18px;
    gap: 8px;
  }
  .save-mode, .dependency { display: none; }
  .row-detail { grid-template-columns: 1fr; }
  .gate-row { grid-template-columns: 90px 1fr 50px; }
  .gate-row p { grid-column: 1 / -1; }
  .release-state span { display: none; }
}
</style>
