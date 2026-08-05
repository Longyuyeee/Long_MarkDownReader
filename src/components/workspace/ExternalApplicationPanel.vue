<template>
  <section class="external-panel" aria-labelledby="external-panel-title">
    <header>
      <div>
        <strong id="external-panel-title">使用桌面应用打开</strong>
        <span>LongEdit 只负责安全交接，不编辑、不转换，也不写回当前文件</span>
      </div>
      <button class="icon-button" type="button" title="重新检测桌面应用" :disabled="loading || opening" @click="loadApplications">
        <RefreshCw :size="15" :class="{ spinning: loading }" />
      </button>
    </header>

    <div class="application-list" role="radiogroup" aria-label="选择桌面应用">
      <button
        type="button"
        class="application-option"
        :class="{ selected: selectedId === 'system-default' }"
        :aria-checked="selectedId === 'system-default'"
        role="radio"
        @click="selectApplication('system-default')"
      >
        <MonitorUp :size="18" />
        <span><strong>系统默认应用</strong><small>使用 Windows 当前文件关联</small></span>
        <Check v-if="selectedId === 'system-default'" :size="16" />
      </button>
      <button
        v-for="application in applications"
        :key="application.id"
        type="button"
        class="application-option"
        :class="{ selected: selectedId === application.id, unavailable: !supportsCurrentFile(application) }"
        :disabled="!supportsCurrentFile(application)"
        :aria-checked="selectedId === application.id"
        role="radio"
        @click="selectApplication(application.id)"
      >
        <AppWindow :size="18" />
        <span>
          <strong>{{ application.label }}</strong>
          <small v-if="supportsCurrentFile(application)">{{ application.version || '已检测到兼容程序' }}</small>
          <small v-else>{{ application.available ? '当前程序不支持此格式' : '未在此电脑上检测到' }}</small>
        </span>
        <Check v-if="selectedId === application.id" :size="16" />
        <CircleOff v-else-if="!supportsCurrentFile(application)" :size="15" />
      </button>
    </div>

    <p v-if="discoveryError" class="panel-message error">{{ discoveryError }}</p>
    <p v-else-if="!loading && !compatibleApplications.length" class="panel-message">未检测到明确兼容的桌面应用，仍可尝试系统默认应用；失败时 Windows 会返回原因。</p>
    <p v-else class="panel-message">交接前后会核对源文件 SHA-256，应用启动后产生的修改由对应桌面应用负责。</p>

    <button class="open-button" type="button" :disabled="loading || opening" @click="openSelected">
      <LoaderCircle v-if="opening" :size="16" class="spinning" />
      <ExternalLink v-else :size="16" />
      {{ opening ? '正在交接' : `使用${selectedLabel}打开` }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { AppWindow, Check, CircleOff, ExternalLink, LoaderCircle, MonitorUp, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../../services/workspaceViewState'
import { useAppStore } from '../../store/app'

interface ExternalApplicationCapability {
  id: string
  label: string
  available: boolean
  version?: string
  supportedExtensions: string[]
}

interface ExternalOpenReceipt {
  applicationLabel: string
  sourcePreservedAtHandoff: boolean
}

const props = defineProps<{ path: string }>()
const message = useMessage()
const store = useAppStore()
const applications = ref<ExternalApplicationCapability[]>([])
const selectedId = ref('system-default')
const loading = ref(false)
const opening = ref(false)
const discoveryError = ref('')
const extension = computed(() => `.${props.path.split('.').pop()?.toLocaleLowerCase() || ''}`)
const supportsCurrentFile = (application: ExternalApplicationCapability) => application.available && application.supportedExtensions.includes(extension.value)
const compatibleApplications = computed(() => applications.value.filter(supportsCurrentFile))
const selectedLabel = computed(() => selectedId.value === 'system-default'
  ? '系统默认应用'
  : applications.value.find(application => application.id === selectedId.value)?.label || '桌面应用')

const rememberSelection = () => {
  if (!props.path) return
  const current = recallWorkspaceViewState(props.path)
  rememberWorkspaceViewState(props.path, { ...current, scrollTop: current?.scrollTop || 0, scrollLeft: current?.scrollLeft || 0, externalApplication: selectedId.value })
}
const restoreSelection = () => {
  const remembered = recallWorkspaceViewState(props.path)?.externalApplication
  selectedId.value = remembered === 'system-default' || applications.value.some(application => application.id === remembered && supportsCurrentFile(application))
    ? remembered || 'system-default'
    : 'system-default'
}
const selectApplication = (id: string) => { selectedId.value = id; rememberSelection() }
const loadApplications = async () => {
  loading.value = true
  discoveryError.value = ''
  try {
    applications.value = await invoke<ExternalApplicationCapability[]>('discover_external_applications')
    restoreSelection()
  } catch (error) {
    applications.value = []
    selectedId.value = 'system-default'
    discoveryError.value = `无法检测桌面应用：${String(error).replace(/^Error:\s*/, '')}`
  } finally {
    loading.value = false
  }
}
const openSelected = async () => {
  if (!store.libraryPath || !props.path || opening.value) return
  opening.value = true
  try {
    const receipt = await invoke<ExternalOpenReceipt>('open_workspace_file_externally', {
      libraryRoot: store.libraryPath,
      path: props.path,
      applicationId: selectedId.value,
    })
    if (!receipt.sourcePreservedAtHandoff) throw new Error('源文件交接校验未通过')
    message.success(`${receipt.applicationLabel} 已接管文件，交接时源文件未变化`)
  } catch (error) {
    message.error(`外部打开失败：${String(error).replace(/^Error:\s*/, '')}`)
  } finally {
    opening.value = false
  }
}

watch(() => props.path, () => { restoreSelection(); void loadApplications() })
onMounted(loadApplications)
</script>

<style scoped>
.external-panel { display: grid; gap: 12px; padding: 18px 0 4px; border-top: var(--theme-border); container-type: inline-size; }
header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
header > div { display: grid; gap: 4px; }
header strong { font-size: 13px; }
header span, .panel-message { color: var(--theme-text-secondary); font-size: 11px; line-height: 1.55; }
.icon-button { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 5px; color: inherit; background: transparent; cursor: pointer; }
.icon-button:hover { background: var(--theme-hover); }
.application-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.application-option { display: grid; min-width: 0; min-height: 58px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); text-align: left; background: var(--workspace-control-bg); cursor: pointer; }
.application-option.selected { border-color: var(--theme-primary); background: color-mix(in srgb, var(--theme-primary) 9%, var(--theme-card)); }
.application-option.unavailable { color: var(--theme-text-secondary); background: var(--theme-bg-secondary); opacity: .72; cursor: default; }
.application-option span { display: grid; min-width: 0; gap: 2px; }
.application-option strong, .application-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.application-option strong { font-size: 12px; }
.application-option small { color: var(--theme-text-secondary); font-size: 10px; }
.panel-message { margin: 0; }
.panel-message.error { color: var(--theme-danger); }
.open-button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 0; border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); font-size: 12px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@container (max-width: 520px) { .application-list { grid-template-columns: 1fr; } }
</style>
