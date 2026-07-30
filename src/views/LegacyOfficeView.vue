<template>
  <section class="legacy-office" data-testid="e2b-legacy-doc-workspace">
    <header>
      <div class="identity">
        <FileClock :size="20" aria-hidden="true" />
        <div>
          <strong>{{ fileName }}</strong>
          <span>旧版 Word 文档 · 隔离转换</span>
        </div>
      </div>
      <button class="icon-button" :disabled="loading || converting" title="重新预检" @click="load">
        <RefreshCw :size="16" :class="{ spinning: loading }" />
      </button>
    </header>

    <div v-if="loading && !report" class="state">
      <RefreshCw :size="20" class="spinning" />
      <span>正在只读检查 OLE 复合容器</span>
    </div>
    <div v-else-if="loadError" class="state error">
      <ShieldAlert :size="22" />
      <div><strong>预检未通过</strong><p>{{ loadError }}</p></div>
    </div>
    <main v-else-if="report">
      <div class="status" :class="{ blocked: !report.conversionEligible }">
        <component :is="report.conversionEligible ? ShieldCheck : ShieldAlert" :size="22" />
        <div>
          <strong>{{ report.conversionEligible ? '可以生成 DOCX 副本' : '转换已被风险策略阻止' }}</strong>
          <span>预检和转换均不修改源 DOC，也不覆盖已有目标</span>
        </div>
      </div>

      <dl>
        <div><dt>容器</dt><dd>OLE Compound File · {{ report.cfbVersion }}</dd></div>
        <div><dt>大小</dt><dd>{{ formatBytes(report.size) }}</dd></div>
        <div><dt>数据流</dt><dd>{{ report.streamCount }} 个</dd></div>
        <div><dt>修改时间</dt><dd>{{ formatTime(report.modified) }}</dd></div>
        <div class="digest"><dt>源 SHA-256</dt><dd>{{ report.sha256 }}</dd></div>
      </dl>

      <section v-if="report.riskCodes.length" class="risk-section">
        <h2>风险预检</h2>
        <div class="risk-list">
          <span v-for="risk in report.riskCodes" :key="risk" :class="{ clear: risk === 'none-detected' }">
            {{ riskLabel(risk) }}
          </span>
        </div>
        <p v-for="reason in report.blockReasons" :key="reason" class="block-reason">{{ reason }}</p>
      </section>

      <section class="conversion">
        <label for="legacy-doc-target">新的 DOCX 目标</label>
        <div class="target-row">
          <input
            id="legacy-doc-target"
            v-model="targetPath"
            :disabled="converting"
            spellcheck="false"
            autocomplete="off"
          />
          <button
            class="convert-button"
            :disabled="!canConvert"
            title="在隔离环境中生成新的 DOCX 副本"
            @click="convert"
          >
            <LoaderCircle v-if="converting" :size="16" class="spinning" />
            <FileOutput v-else :size="16" />
            <span>{{ converting ? '转换中' : '生成副本' }}</span>
          </button>
        </div>
        <p>目标必须位于当前知识库内且尚不存在。外部转换器只接触临时源副本。</p>
      </section>

      <div v-if="conversionError" class="result error">
        <CircleX :size="18" />
        <p>{{ conversionError }}</p>
      </div>
      <div v-else-if="receipt" class="result success">
        <CircleCheck :size="18" />
        <div>
          <strong>DOCX 副本已生成并通过结构复读</strong>
          <p>{{ receipt.targetPath }}</p>
          <span>{{ formatBytes(receipt.targetBytes) }} · {{ receipt.blockCount }} 个内容块 · 源文件摘要未变化</span>
        </div>
      </div>
    </main>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  CircleCheck,
  CircleX,
  FileClock,
  FileOutput,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../store/app'

interface LegacyDocPreflight {
  path: string
  size: number
  modified: number
  sha256: string
  cfbVersion: string
  streamCount: number
  riskCodes: string[]
  warnings: string[]
  blockReasons: string[]
  conversionEligible: boolean
  sourcePreserved: boolean
}

interface LegacyDocConversionReceipt {
  targetPath: string
  targetBytes: number
  blockCount: number
  sourcePreserved: boolean
}

const route = useRoute()
const store = useAppStore()
const report = ref<LegacyDocPreflight>()
const receipt = ref<LegacyDocConversionReceipt>()
const loading = ref(false)
const converting = ref(false)
const loadError = ref('')
const conversionError = ref('')
const targetPath = ref('')
const documentPath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => documentPath.value.split(/[\\/]/).pop() || '未命名 DOC')
const canConvert = computed(() => Boolean(
  report.value?.conversionEligible
  && report.value.sourcePreserved
  && targetPath.value.trim()
  && !loading.value
  && !converting.value,
))

const defaultTargetPath = (path: string) => path.replace(/\.doc$/i, '-converted.docx')
const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}
const formatTime = (value: number) => value
  ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value * 1000))
  : '未知'
const riskLabel = (risk: string) => ({
  'none-detected': '未发现主动内容',
  'encrypted-content': '加密内容',
  vba: 'VBA / 宏',
  'ole-object': 'OLE 嵌入对象',
  'external-link': '外部链接',
}[risk] || risk)

const load = async () => {
  if (!documentPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  conversionError.value = ''
  receipt.value = undefined
  try {
    report.value = await invoke<LegacyDocPreflight>('preflight_legacy_doc', {
      libraryRoot: store.libraryPath,
      path: documentPath.value,
    })
    targetPath.value = defaultTargetPath(documentPath.value)
  } catch (error) {
    report.value = undefined
    loadError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    loading.value = false
  }
}

const convert = async () => {
  if (!report.value || !canConvert.value) return
  converting.value = true
  conversionError.value = ''
  receipt.value = undefined
  try {
    receipt.value = await invoke<LegacyDocConversionReceipt>('convert_legacy_doc_to_docx_copy', {
      libraryRoot: store.libraryPath,
      path: documentPath.value,
      targetPath: targetPath.value.trim(),
      expectedSourceSha256: report.value.sha256,
    })
  } catch (error) {
    conversionError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    converting.value = false
  }
}

watch(documentPath, load, { immediate: true })
</script>

<style scoped>
.legacy-office { display: flex; width: 100%; height: 100%; min-width: 0; flex-direction: column; color: var(--theme-text); background: var(--theme-bg); }
header { display: flex; min-height: 52px; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: var(--theme-border); }
.identity { display: flex; min-width: 0; align-items: center; gap: 10px; }
.identity div { display: grid; min-width: 0; gap: 2px; }
.identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.identity span, .status span { color: var(--theme-text-secondary); font-size: 11px; }
button { border: 0; border-radius: 5px; color: inherit; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
.icon-button { display: grid; width: 30px; height: 30px; place-items: center; background: transparent; }
.icon-button:hover { background: var(--theme-hover); }
main { width: min(780px, calc(100% - 40px)); margin: 30px auto; overflow-y: auto; }
.status { display: flex; align-items: center; gap: 12px; padding-bottom: 20px; border-bottom: var(--theme-border); color: var(--theme-primary); }
.status.blocked { color: var(--theme-danger); }
.status div { display: grid; gap: 3px; }
.status strong { font-size: 15px; }
dl { margin: 0; }
dl div { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 12px 0; border-bottom: var(--theme-border); }
dt { color: var(--theme-text-secondary); font-size: 12px; }
dd { min-width: 0; margin: 0; font-size: 12px; }
.digest dd { overflow-wrap: anywhere; font-family: var(--font-mono); font-size: 11px; }
.risk-section, .conversion { padding: 20px 0; border-bottom: var(--theme-border); }
h2, label { display: block; margin: 0 0 10px; font-size: 12px; font-weight: 600; }
.risk-list { display: flex; flex-wrap: wrap; gap: 6px; }
.risk-list span { padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--theme-danger) 45%, transparent); border-radius: 4px; color: var(--theme-danger); font-size: 11px; }
.risk-list span.clear { border-color: color-mix(in srgb, var(--theme-success) 45%, transparent); color: var(--theme-success); }
.block-reason { margin: 10px 0 0; color: var(--theme-danger); font-size: 12px; }
.target-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
input { min-width: 0; height: 34px; padding: 0 10px; border: var(--theme-border); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-bg-secondary); font-family: var(--font-mono); font-size: 11px; }
input:focus { border-color: var(--theme-primary); }
.convert-button { display: inline-flex; height: 34px; align-items: center; gap: 7px; padding: 0 12px; color: var(--theme-button-text); background: var(--theme-primary); font-size: 12px; }
.conversion > p { margin: 8px 0 0; color: var(--theme-text-secondary); font-size: 11px; }
.result { display: flex; gap: 10px; margin-top: 18px; padding: 12px; border-left: 3px solid currentColor; background: var(--theme-bg-secondary); }
.result.success { color: var(--theme-success); }
.result.error { color: var(--theme-danger); }
.result div { min-width: 0; }
.result strong { color: var(--theme-text); font-size: 12px; }
.result p { margin: 4px 0; overflow-wrap: anywhere; color: var(--theme-text); font-family: var(--font-mono); font-size: 11px; }
.result span { color: var(--theme-text-secondary); font-size: 11px; }
.state { display: flex; flex: 1; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }
.state.error { color: var(--theme-danger); }
.state.error div { max-width: 520px; }
.state.error strong { color: var(--theme-text); }
.state.error p { margin: 5px 0 0; line-height: 1.5; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  main { width: calc(100% - 24px); margin-top: 20px; }
  dl div { grid-template-columns: 86px minmax(0, 1fr); }
  .target-row { grid-template-columns: 1fr; }
  .convert-button { justify-content: center; }
}
</style>
