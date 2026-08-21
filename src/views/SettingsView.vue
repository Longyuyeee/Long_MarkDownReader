<template>
  <div class="settings-view">
    <WorkspaceManagementHeader
      title="设置"
      subtitle="资料库、编辑器与应用偏好"
      @back="router.push({ name: 'LibraryMode' })"
    />

    <WorkspaceManagementContent class="settings-content">
      <div class="settings-layout">
        <nav ref="settingsNavigationRef" class="settings-navigation" aria-label="设置分类" data-horizontal-wheel="always">
          <button
            v-for="category in settingsCategories"
            :key="category.id"
            type="button"
            :class="{ active: activeCategory === category.id }"
            @click="selectSettingsCategory(category.id)"
          >
            <n-icon :component="category.icon" />
            <span>{{ category.label }}</span>
          </button>
        </nav>
        <section ref="settingsPanelRef" class="settings-panel">
          <header class="settings-category-heading">
            <div>
              <h2>{{ activeCategoryMeta.label }}</h2>
              <p>{{ activeCategoryMeta.description }}</p>
            </div>
          </header>
      <n-form label-placement="top" size="medium">
        <n-grid :cols="1" :y-gap="24">
          <n-grid-item v-if="activeCategory === 'library'" class="animate-item" style="--delay: 0.1s">
            <div class="section-title">文件库管理</div>
            <div class="library-manager-card">
              <div v-for="(lib, index) in config.libraries" :key="index" class="library-item" :class="{ active: lib.path === config.activeLibraryPath }">
                <div class="lib-top-row">
                  <div class="lib-info">
                    <div class="lib-name">{{ lib.name }}</div>
                    <div class="lib-path">{{ lib.path }}</div>
                  </div>
                  <div class="lib-actions">
                    <n-button size="tiny" quaternary circle @click="toggleGitConfig(index)" title="Git 设置">
                      <template #icon><n-icon :component="GitBranchIcon" size="14" /></template>
                    </n-button>
                    <n-button size="tiny" secondary type="primary" v-if="lib.path !== config.activeLibraryPath" @click="switchLibrary(lib.path)">切换</n-button>
                    <n-tag size="small" type="success" v-else>当前使用</n-tag>
                    <n-button size="tiny" quaternary circle type="error" @click="removeLibrary(index)">
                      <template #icon><n-icon :component="TrashIcon" /></template>
                    </n-button>
                  </div>
                </div>
                <!-- Git 配置展开 -->
                <div v-if="expandedGitLib === lib.path" class="git-config-panel">
                  <div class="setting-row">
                    <div class="info"><div class="label">启用 Git</div></div>
                    <n-switch v-model:value="lib.gitEnabled" size="small" />
                  </div>
                  <n-form-item label="Remote URL" size="small" v-if="lib.gitEnabled">
                    <n-input v-model:value="lib.gitRemote" placeholder="https://github.com/user/repo.git" size="small" />
                  </n-form-item>
                  <n-form-item label="分支" size="small" v-if="lib.gitEnabled">
                    <n-input v-model:value="lib.gitBranch" placeholder="main" size="small" />
                  </n-form-item>
                </div>
              </div>

              <div class="add-library-form">
                <n-input-group>
                  <n-input v-model:value="newLib.name" placeholder="库名称" style="width: 30%" />
                  <n-input v-model:value="newLib.path" placeholder="库路径" style="flex: 1" />
                  <n-button quaternary @click="chooseNewLibDir">选择</n-button>
                  <n-button type="primary" @click="addLibrary">添加库</n-button>
                </n-input-group>
              </div>
            </div>
          </n-grid-item>

          <n-grid-item v-if="activeCategory === 'editing'" class="animate-item" style="--delay: 0.2s">
            <div class="section-title">编辑与历史版本</div>
            <div class="setting-card">
              <n-form-item label="自动保存间隔 (分钟)">
                <n-input-number v-model:value="config.autoSaveInterval" :min="1" :max="60">
                  <template #suffix>分钟</template>
                </n-input-number>
              </n-form-item>
              <n-form-item label="最大保留历史版本数">
                <n-input-number v-model:value="config.maxHistoryCount" :min="1" :max="50" />
              </n-form-item>
              <div class="danger-zone">
                <n-button type="error" ghost @click="clearHistory">清空所有历史版本缓存</n-button>
                <div class="desc">此操作将删除所有文件的影子副本记录，无法撤销。</div>
              </div>
            </div>
          </n-grid-item>

          <n-grid-item v-if="['formats', 'knowledge', 'system', 'privacy'].includes(activeCategory)" class="animate-item" style="--delay: 0.3s">
            <div class="section-title">{{ activeCategoryMeta.label }}</div>
            <div v-show="activeCategory === 'system'" class="setting-row">
              <div class="info">
                <div class="label">开机自动启动</div>
                <div class="desc">在 Windows 启动时自动运行Long编辑</div>
              </div>
              <n-switch v-model:value="config.isAutostart" />
            </div>
            <div v-show="activeCategory === 'system'" class="setting-row">
              <div class="info">
                <div class="label">退出行为</div>
                <div class="desc">点击关闭按钮时的默认处理方式</div>
              </div>
              <n-radio-group v-model:value="config.exitStrategy" size="small">
                <n-radio-button value="ask">提示</n-radio-button>
                <n-radio-button value="quit">直接退出</n-radio-button>
                <n-radio-button value="minimize">后台运行</n-radio-button>
              </n-radio-group>
            </div>
            <div
              ref="formatCapabilityRow"
              v-show="activeCategory === 'formats'"
              class="setting-row"
              :class="{ 'is-route-focused': formatCapabilityRouteFocused }"
              data-testid="format-capability-settings"
            >
              <div class="info">
                <div class="label">格式能力与默认应用</div>
                <div class="desc">在格式能力页逐项启用、关闭并查看 Long编辑的默认打开状态</div>
              </div>
              <div class="backup-actions">
                <n-button secondary type="info" @click="openReleaseCapabilities">管理打开方式</n-button>
              </div>
            </div>
            <UpdateSettingsRow
              v-show="activeCategory === 'system'"
              :class="{ 'is-route-focused': softwareUpdateRouteFocused }"
            />
            <div v-show="activeCategory === 'privacy'" class="setting-row">
              <!-- R3 管理备份不包含文档正文或凭据，导入恢复要求路径重新映射。 -->
              <div class="info">
                <div class="label">管理备份</div>
                <div class="desc">导出脱敏配置、库清单摘要和能力合同，不包含文档正文或凭据</div>
              </div>
              <div class="backup-actions">
                <n-button secondary :loading="backupExporting" @click="exportManagementBackup">
                  <template #icon><n-icon :component="DownloadIcon" /></template>
                  导出
                </n-button>
                <n-button secondary type="primary" :loading="backupRestoring" @click="importManagementBackup">
                  <template #icon><n-icon :component="UploadIcon" /></template>
                  导入恢复
                </n-button>
              </div>
            </div>
            <div v-show="activeCategory === 'privacy'" class="setting-row">
              <div class="info">
                <div class="label">隐私诊断包</div>
                <div class="desc">导出脱敏诊断信息，不包含文档正文、完整路径、API 密钥、缓存正文或凭据。</div>
              </div>
              <n-button secondary type="warning" :loading="diagnosticExporting" @click="exportPrivacyDiagnosticBundle">
                导出诊断包
              </n-button>
            </div>
            <details class="advanced-settings" :open="observationRouteFocused" v-show="activeCategory === 'knowledge'">
              <summary>
                <span>高级：关系改善对比</span>
                <small>需要比较资料库整理前后的关系覆盖变化时使用</small>
              </summary>
            <div ref="knowledgeObservationRow" class="setting-row" :class="{ 'is-route-focused': observationRouteFocused }" data-testid="knowledge-observation-export">
              <div class="info">
                <div class="label">记录并对比关系改善</div>
                <div class="desc">先记录当前关系覆盖情况，整理资料库后再对比变化；报告只保存到你选择的位置，不包含正文、文件名或完整路径。</div>
              </div>
              <div class="backup-actions">
                <n-button secondary type="info" :disabled="!store.libraryPath" :loading="observationExporting" @click="previewKnowledgeObservation">
                  记录当前状态
                </n-button>
                <n-button secondary type="success" data-testid="knowledge-observation-compare" :disabled="!store.libraryPath" :loading="observationComparisonExporting" @click="previewKnowledgeObservationComparison">
                  对比改善结果
                </n-button>
              </div>
            </div>
            <section class="knowledge-observation-session" data-testid="knowledge-observation-session" :data-phase="observationSessionPhase">
              <div class="observation-session-heading">
                <div>
                  <strong>关系整理效果对比</strong>
                  <span>按四步记录和比较关系覆盖变化；软件不会自动上传或修改资料库。</span>
                </div>
                <div class="observation-session-heading-actions">
                  <n-button size="tiny" secondary :loading="observationReviewing" data-testid="knowledge-session-review" @click="reviewKnowledgeObservationReceipt">查看已保存结果</n-button>
                  <n-button size="tiny" quaternary data-testid="knowledge-observation-session-reset" @click="resetObservationSession">重新开始</n-button>
                </div>
              </div>
              <ol class="observation-session-steps">
                <li :class="{ active: observationSessionPhase === 1, complete: observationSessionPhase > 1 }">
                  <b>1</b>
                  <div><strong>记录当前关系状态</strong><span>先查看统计预览，再自行选择本地 JSON 保存位置。</span></div>
                  <div class="observation-step-actions">
                    <n-button size="small" secondary type="info" :disabled="!store.libraryPath" :loading="observationExporting" data-testid="knowledge-session-save-baseline" @click="previewKnowledgeObservation">预览并记录</n-button>
                    <n-button size="small" quaternary :disabled="observationSessionPhase > 1" data-testid="knowledge-session-existing-baseline" @click="markExistingBaselineReady">我已有之前记录</n-button>
                  </div>
                </li>
                <li :class="{ active: observationSessionPhase === 2, complete: observationSessionPhase > 2 }">
                  <b>2</b>
                  <div><strong>执行一项知识治理建议</strong><span>返回工作台查看建议，再在图谱或管理界面完成一项关系改善。</span></div>
                  <n-button size="small" secondary :disabled="observationSessionPhase < 2" data-testid="knowledge-session-open-guidance" @click="openObservationRemediation">前往工作台建议</n-button>
                </li>
                <li :class="{ complete: observationSessionPhase >= 3 }">
                  <b>3</b>
                  <div><strong>确认治理动作已经完成</strong><span>此确认只推进本地会话步骤，不读取或记录你修改了什么。</span></div>
                  <n-button size="small" secondary type="success" :disabled="observationSessionPhase !== 2" data-testid="knowledge-session-remediation-complete" @click="markObservationRemediationComplete">我已完成一项治理</n-button>
                </li>
                <li :class="{ active: observationSessionPhase === 3, complete: observationSessionPhase === 4 }">
                  <b>4</b>
                  <div><strong>选择之前记录并查看结果</strong><span>选择来自当前资料库的记录；结果只包含关系数量和覆盖率变化。</span></div>
                  <n-button size="small" secondary type="success" :disabled="!store.libraryPath || observationSessionPhase < 3" :loading="observationComparisonExporting" data-testid="knowledge-session-compare" @click="previewKnowledgeObservationComparison">查看对比结果</n-button>
                </li>
              </ol>
              <p class="observation-session-privacy">操作进度只保存数字步骤，不保存资料库名称、路径、指纹、正文、文件名、对象 ID 或报告位置。你可以随时取消或重新开始。</p>
              <article v-if="observationReview" class="observation-review" data-testid="knowledge-session-review-result" :data-outcome="observationReview.outcome">
                <div class="observation-review-heading">
                  <div><strong>关系改善结果</strong><span>已检查报告结构、隐私边界和统计变化</span></div>
                  <n-tag size="small" :type="observationReview.outcome === 'regressed' ? 'warning' : observationReview.outcome === 'improved' ? 'success' : 'info'">{{ comparisonOutcomeLabel(observationReview.outcome) }}</n-tag>
                </div>
                <div class="observation-review-grid">
                  <div><span>关系覆盖</span><strong>{{ observationReview.baseline.coveragePercent }}% → {{ observationReview.current.coveragePercent }}%</strong><small>{{ signedChange(observationReview.changes.coveragePercent, '%') }}</small></div>
                  <div><span>关系数量</span><strong>{{ observationReview.baseline.relationCount }} → {{ observationReview.current.relationCount }}</strong><small>{{ signedChange(observationReview.changes.relationCount) }}</small></div>
                  <div><span>已连接对象</span><strong>{{ observationReview.baseline.connectedObjectCount }} → {{ observationReview.current.connectedObjectCount }}</strong><small>{{ signedChange(observationReview.changes.connectedObjectCount) }}</small></div>
                  <div><span>孤立对象</span><strong>{{ observationReview.baseline.isolatedObjectCount }} → {{ observationReview.current.isolatedObjectCount }}</strong><small>{{ signedChange(observationReview.changes.isolatedObjectCount) }}</small></div>
                </div>
                <div v-if="observationReview.achievements.length" class="observation-review-achievements">
                  <span v-for="achievement in observationReview.achievements" :key="achievement">{{ observationAchievementLabel(achievement) }}</span>
                </div>
                <p>本次查看不会保存所选路径，也不会上传报告。重新加载页面后需要再次由你选择文件。</p>
              </article>
            </section>
            </details>
          </n-grid-item>

          <n-grid-item v-if="activeCategory === 'ai'" class="animate-item" style="--delay: 0.35s">
            <div class="section-title">AI 辅助</div>
            <div class="setting-card">
              <div class="setting-row">
                <div class="info">
                  <div class="label">启用 AI 辅助</div>
                  <div class="desc">开启后可在编辑器工具栏使用 AI 处理文本</div>
                </div>
                <n-switch v-model:value="config.aiEnabled" />
              </div>
              <n-form-item label="AI 服务商">
                <n-select v-model:value="config.aiProvider" :options="aiProviderOptions" @update:value="onAiProviderChange" />
              </n-form-item>
              <n-form-item label="接口地址">
                <n-input v-model:value="config.aiEndpoint" placeholder="https://api.openai.com/v1" />
                <template #feedback><span style="font-size:11px;opacity:0.5">兼容 OpenAI API 格式即可（DeepSeek/Ollama 等）</span></template>
              </n-form-item>
              <n-form-item label="API Key">
                <div style="width:100%;display:flex;gap:8px">
                  <n-input v-model:value="credentialDraft" type="password" :placeholder="store.aiCredentialStored ? '已保存到系统凭据库；输入新值可替换' : '输入 API Key'" show-password-on="click" @keyup.enter="saveCredential" />
                  <n-button :disabled="!credentialDraft.trim() || credentialSaving" :loading="credentialSaving" @click="saveCredential">安全保存</n-button>
                  <n-button v-if="store.aiCredentialStored" tertiary type="error" :disabled="credentialSaving" @click="removeCredential">删除</n-button>
                </div>
                <template #feedback><span style="font-size:11px;opacity:0.6">{{ store.aiCredentialStored ? '已存储在操作系统凭据库，配置文件和前端不会读取明文。' : '尚未保存凭据；本地 Ollama 回环地址可无 Key 使用。' }}</span></template>
              </n-form-item>
              <n-form-item label="模型名称">
                <n-input v-model:value="config.aiModel" placeholder="gpt-4o-mini" />
              </n-form-item>
            </div>
          </n-grid-item>

          <n-grid-item v-if="activeCategory === 'appearance'" class="animate-item" style="--delay: 0.4s">
            <div class="section-title">外观主题</div>
            <section class="theme-preset-group">
              <div class="theme-library-toolbar" aria-label="主题类型筛选" data-horizontal-wheel="always">
                <button v-for="filter in themeFilters" :key="filter.id" type="button" :class="{ active: activeThemeFilter === filter.id }" @click="activeThemeFilter = filter.id">
                  {{ filter.label }}
                  <span>{{ filter.count }}</span>
                </button>
              </div>
              <div class="theme-preset-grid">
                <div
                  v-for="preset in filteredThemePresets"
                  :key="preset.id"
                  class="theme-preset-card"
                  :class="{ active: isPresetActive(preset) }"
                  @click="applyPreset(preset)"
                >
                  <div class="preset-visual" :style="getPresetPreviewStyle(preset)">
                    <div class="preset-window">
                      <span></span><span></span><span></span>
                      <div class="preset-sidebar"></div>
                      <div class="preset-document"><i></i><i></i><i></i></div>
                    </div>
                    <div class="preset-icon">{{ preset.icon }}</div>
                  </div>
                  <div class="preset-name">{{ preset.name }}</div>
                  <div class="preset-desc">{{ preset.description }}</div>
                  <div class="preset-tags">
                    <span class="tag">{{ preset.scenario }}</span>
                    <span class="tag">{{ getThemeLabel(preset.theme) }}</span>
                    <span class="tag">{{ getStyleLabel(preset.style) }}</span>
                  </div>
                </div>
              </div>
            </section>

            <div class="section-title" style="margin-top: 32px;">高级定制</div>
            <n-form-item label="界面风格">
              <div class="style-swatch-row">
                <div v-for="s in styleOptions" :key="s.value" class="style-swatch" :class="{ active: config.visualStyle === s.value }" @click="config.visualStyle = s.value">
                  <div class="swatch-preview" :class="'swatch-' + s.value">
                    <div class="swatch-dot"></div>
                    <div class="swatch-line"></div>
                  </div>
                  <div class="swatch-label">{{ s.label }}</div>
                </div>
              </div>
            </n-form-item>
            <n-form-item label="动效节奏">
              <div class="motion-option-row">
                <div
                  v-for="m in motionOptions"
                  :key="m.value"
                  class="motion-option"
                  :class="{ active: config.motionSpeed === m.value }"
                  @click="config.motionSpeed = m.value"
                >
                  <div class="motion-preview" :class="'motion-' + m.value">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div class="motion-copy">
                    <div class="motion-label">{{ m.label }}</div>
                    <div class="motion-desc">{{ m.desc }}</div>
                  </div>
                </div>
              </div>
            </n-form-item>
            <n-form-item label="颜色主题">
              <div class="theme-swatch-row">
                <div v-for="t in themeOptions" :key="t.value" class="theme-swatch" :class="{ active: config.theme === t.value }" @click="applyTheme(t.value)">
                  <div class="theme-dot" :style="{ background: t.color }">
                    <n-icon v-if="config.theme === t.value" :component="CheckIcon" size="16" color="#fff" />
                  </div>
                  <div class="swatch-label">{{ t.label }}</div>
                </div>
              </div>
            </n-form-item>
            <n-grid :cols="2" :x-gap="20">
              <n-grid-item>
                <n-form-item label="代码高亮风格">
                  <n-select v-model:value="config.codeTheme" :options="codeThemeOptions" placeholder="选择高亮风格" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="文章背景色">
                  <n-color-picker v-model:value="config.editorBgColor" :modes="['hex']" :show-alpha="false" />
                </n-form-item>
              </n-grid-item>
            </n-grid>
            <div class="section-title">实时预览</div>
            <div class="theme-preview-card" :style="{ backgroundColor: config.editorBgColor }">
              <div class="preview-content">
                <h3 class="preview-md-h"># 这是一个示例标题</h3>
                <p class="preview-md-p">这是正文预览效果。当您修改左侧的设置时，此区域的背景色、文字颜色和代码风格将实时同步更新。</p>
                <div class="preview-code-block" :class="'theme-' + config.codeTheme">
                  <div class="code-header">
                    <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
                    <span class="lang">typescript</span>
                  </div>
                  <pre><code><span class="keyword">const</span> <span class="variable">app</span> = <span class="keyword">new</span> <span class="class">MistyEditor</span>();
<span class="variable">app</span>.<span class="method">setTheme</span>(<span class="string">'{{ config.codeTheme }}'</span>);
<span class="variable">app</span>.<span class="method">render</span>();</code></pre>
                </div>
              </div>
            </div>
          </n-grid-item>
        </n-grid>
      </n-form>
        </section>
      </div>
    </WorkspaceManagementContent>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Trash as TrashIcon,
  GitBranch as GitBranchIcon,
  Check as CheckIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Library as LibraryIcon,
  History as HistoryIcon,
  Palette as PaletteIcon,
  Files as FilesIcon,
  Network as NetworkIcon,
  MonitorCog as SystemIcon,
  ShieldCheck as PrivacyIcon,
  Sparkles as AiIcon,
} from 'lucide-vue-next'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, useDialog, NTag, NInputGroup } from 'naive-ui'
import { useAppStore, THEME_MAP } from '../store/app'
import UpdateSettingsRow from '../components/UpdateSettingsRow.vue'
import WorkspaceManagementContent from '../components/workspace/WorkspaceManagementContent.vue'
import WorkspaceManagementHeader from '../components/workspace/WorkspaceManagementHeader.vue'
import {
  THEME_EDITOR_BACKGROUNDS,
  themePresets,
  themeToneById,
  themeTones,
  type ThemeName,
  type ThemePreset,
} from '../config/themePresets'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const store = useAppStore()
const isInitializing = ref(true)

type SettingsCategory = 'library' | 'editing' | 'appearance' | 'formats' | 'knowledge' | 'system' | 'privacy' | 'ai'
type ThemeFilter = 'all' | 'light' | 'dark' | 'eye-care' | 'creative' | 'contrast'

const settingsCategories = [
  { id: 'library', label: '资料库', description: '管理资料库位置、名称与 Git 连接。', icon: LibraryIcon },
  { id: 'editing', label: '编辑与保存', description: '设置自动保存、历史版本和编辑安全策略。', icon: HistoryIcon },
  { id: 'appearance', label: '外观', description: '选择主题组合，并调整颜色、代码高亮和动效。', icon: PaletteIcon },
  { id: 'formats', label: '格式与文件', description: '管理文件打开方式并查看各格式的编辑与保存能力。', icon: FilesIcon },
  { id: 'knowledge', label: '知识能力', description: '使用关系整理与效果对比等高级资料库工具。', icon: NetworkIcon },
  { id: 'system', label: '系统与更新', description: '设置启动、退出和软件更新。', icon: SystemIcon },
  { id: 'privacy', label: '隐私与诊断', description: '导出管理备份或不含正文与凭据的诊断包。', icon: PrivacyIcon },
  { id: 'ai', label: 'AI', description: '配置可选的 AI 服务、模型和系统凭据。', icon: AiIcon },
] as const

const isSettingsCategory = (value: unknown): value is SettingsCategory => settingsCategories.some(category => category.id === value)
const categoryForRoute = (): SettingsCategory => {
  if (route.query.focus === 'format-capabilities') return 'formats'
  if (route.query.focus === 'knowledge-observation') return 'knowledge'
  if (route.query.focus === 'software-update') return 'system'
  return isSettingsCategory(route.query.category) ? route.query.category : 'library'
}
const activeCategory = ref<SettingsCategory>(categoryForRoute())
const settingsPanelRef = ref<HTMLElement | null>(null)
const settingsNavigationRef = ref<HTMLElement | null>(null)
const activeCategoryMeta = computed(() => settingsCategories.find(category => category.id === activeCategory.value) || settingsCategories[0])
const alignActiveSettingsCategory = () => nextTick(() => {
  settingsPanelRef.value?.scrollTo({ top: 0, behavior: 'auto' })
  settingsPanelRef.value?.closest<HTMLElement>('.settings-content')?.scrollTo({ top: 0, behavior: 'auto' })

  const navigation = settingsNavigationRef.value
  const activeButton = navigation?.querySelector<HTMLElement>('button.active')
  if (!navigation || !activeButton) return
  const left = activeButton.offsetLeft
  const right = left + activeButton.offsetWidth
  if (left < navigation.scrollLeft) navigation.scrollTo({ left, behavior: 'auto' })
  else if (right > navigation.scrollLeft + navigation.clientWidth) {
    navigation.scrollTo({ left: right - navigation.clientWidth, behavior: 'auto' })
  }
})
const selectSettingsCategory = (category: SettingsCategory) => {
  if (category === activeCategory.value) return
  activeCategory.value = category
  alignActiveSettingsCategory()
  router.replace({ name: 'Settings', query: { category } })
}

const activeThemeFilter = ref<ThemeFilter>('all')
const visibleThemePresets = computed(() => themePresets.filter((preset, index, presets) => (
  presets.findIndex(candidate => `${candidate.theme}:${candidate.style}:${candidate.vditorCodeTheme}` === `${preset.theme}:${preset.style}:${preset.vditorCodeTheme}`) === index
)))
const matchesThemeFilter = (preset: ThemePreset, filter: ThemeFilter) => {
  if (filter === 'all') return true
  if (filter === 'light') return preset.mode === 'light' && !['green', 'cream', 'purple', 'pink'].includes(preset.theme)
  if (filter === 'dark') return preset.mode === 'dark'
  if (filter === 'eye-care') return ['green', 'cream'].includes(preset.theme)
  if (filter === 'creative') return ['pink', 'purple', 'amber'].includes(preset.theme)
  return preset.theme === 'contrast'
}
const themeFilterDefinitions = [
  { id: 'all', label: '全部' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'eye-care', label: '护眼' },
  { id: 'creative', label: '创意' },
  { id: 'contrast', label: '高对比' },
] as const
const themeFilters = computed(() => themeFilterDefinitions.map(filter => ({
  ...filter,
  count: visibleThemePresets.value.filter(preset => matchesThemeFilter(preset, filter.id)).length,
})))
const filteredThemePresets = computed(() => visibleThemePresets.value.filter(preset => matchesThemeFilter(preset, activeThemeFilter.value)))

const styleOptions: { label: string; value: 'soft' | 'neo' | 'glass' | 'airy' | 'minimal' | 'sharp' }[] = [
  { label: '柔和', value: 'soft' },
  { label: '新拟态', value: 'neo' },
  { label: '玻璃', value: 'glass' },
  { label: '呼吸', value: 'airy' },
  { label: '极简', value: 'minimal' },
  { label: '锐利', value: 'sharp' },
]

const motionOptions: { label: string; desc: string; value: 'calm' | 'swift' | 'expressive' | 'reduced' }[] = [
  { label: '舒展', desc: '稳定、柔和、适合长时间写作', value: 'calm' },
  { label: '轻快', desc: '响应更快，适合高频操作', value: 'swift' },
  { label: '华丽', desc: '更有张力的过渡和进场', value: 'expressive' },
  { label: '减少', desc: '尽量降低界面动效', value: 'reduced' },
]

const themeOptions = themeTones.map(item => ({ label: item.label, value: item.id, color: item.swatch }))

const codeThemeOptions = [
  { label: 'GitHub (默认)', value: 'github' },
  { label: 'GitHub Dark', value: 'github-dark' },
  { label: 'Atom One Dark', value: 'atom-one-dark' },
  { label: 'Monokai', value: 'monokai' },
  { label: 'Dracula', value: 'dracula' },
  { label: 'VS Code Light', value: 'vs' },
  { label: 'VS Code Dark', value: 'vs2015' },
  { label: 'Xcode', value: 'xcode' },
  { label: 'Nord', value: 'nord' },
  { label: 'Tokyo Night', value: 'tokyo-night-dark' }
]

const aiProviderOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Ollama (本地)', value: 'ollama' },
  { label: '自定义', value: 'custom' },
]

const aiProviderPresets: Record<string, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  ollama: { endpoint: 'http://localhost:11434/v1', model: 'llama3' },
  custom: { endpoint: '', model: '' },
}

const onAiProviderChange = (provider: string) => {
  const preset = aiProviderPresets[provider]
  if (preset && preset.endpoint) config.value.aiEndpoint = preset.endpoint
  if (preset && preset.model) config.value.aiModel = preset.model
}

const config = ref({
  libraries: [] as any[],
  activeLibraryPath: store.activeLibraryPath,
  theme: store.theme,
  codeTheme: store.codeTheme,
  editorMode: store.editorMode,
  editorBgColor: store.editorBgColor,
  autoSaveInterval: store.autoSaveInterval,
  maxHistoryCount: store.maxHistoryCount,
  isAutostart: store.isAutostart,
  exitStrategy: store.exitStrategy,
  visualStyle: store.visualStyle,
  motionSpeed: store.motionSpeed,
  aiEnabled: store.aiEnabled,
  aiProvider: store.aiProvider,
  aiEndpoint: store.aiEndpoint,
  aiModel: store.aiModel,
})
const credentialDraft = ref('')
const credentialSaving = ref(false)
const backupExporting = ref(false)
const backupRestoring = ref(false)
const diagnosticExporting = ref(false)
const observationExporting = ref(false)
const observationComparisonExporting = ref(false)
const observationReviewing = ref(false)
const observationReview = ref<KnowledgeGraphObservationComparison | null>(null)
const formatCapabilityRow = ref<HTMLElement | null>(null)
const knowledgeObservationRow = ref<HTMLElement | null>(null)
const formatCapabilityRouteFocused = computed(() => route.query.focus === 'format-capabilities')
const observationRouteFocused = computed(() => route.query.focus === 'knowledge-observation')
const softwareUpdateRouteFocused = computed(() => route.query.focus === 'software-update')
const openReleaseCapabilities = () => router.push({
  name: 'ReleaseCapabilities',
  query: { from: 'settings', settingsFocus: 'format-capabilities' },
})
type ObservationSessionPhase = 1 | 2 | 3 | 4
const OBSERVATION_SESSION_KEY = 'longedit:knowledge-observation-session:v1'
const readObservationSessionPhase = (): ObservationSessionPhase => {
  try {
    const value = Number(JSON.parse(sessionStorage.getItem(OBSERVATION_SESSION_KEY) || '{}').phase)
    return value >= 1 && value <= 4 ? value as ObservationSessionPhase : 1
  } catch {
    return 1
  }
}
const observationSessionPhase = ref<ObservationSessionPhase>(readObservationSessionPhase())
const setObservationSessionPhase = (phase: ObservationSessionPhase) => {
  observationSessionPhase.value = phase
  sessionStorage.setItem(OBSERVATION_SESSION_KEY, JSON.stringify({ schemaVersion: 1, phase }))
}
const advanceObservationSession = (phase: ObservationSessionPhase) => {
  if (phase > observationSessionPhase.value) setObservationSessionPhase(phase)
}
const resetObservationSession = () => setObservationSessionPhase(1)
const markExistingBaselineReady = () => setObservationSessionPhase(2)
const openObservationRemediation = () => {
  advanceObservationSession(2)
  router.push({ name: 'WorkspaceHome' })
}
const markObservationRemediationComplete = () => advanceObservationSession(3)

interface ManagementBackupReceipt {
  path: string
  bytes: number
  sha256: string
  createdAt: number
  entryCount: number
  redactedLibraryCount: number
  excluded: string[]
}

interface RequiredLibraryMapping {
  pathFingerprint: string
  pathLeaf: string
  name: string
}

interface ManagementBackupImportPreflight {
  valid: boolean
  schemaVersion: number
  stage: string
  createdAt: number
  entryCount: number
  redactedLibraryCount: number
  savedSearchCount: number
  requiresLibraryMapping: boolean
  requiredLibraryMappings: RequiredLibraryMapping[]
  blockedReasons: string[]
  warnings: string[]
  excluded: string[]
}

interface LibraryPathMapping {
  pathFingerprint: string
  path: string
}

interface ManagementBackupRestoreReceipt {
  path: string
  restoredAt: number
  libraryCount: number
  savedSearchCount: number
  warnings: string[]
}

interface PrivacyDiagnosticBundleReceipt {
  path: string
  bytes: number
  sha256: string
  createdAt: number
  entryCount: number
  libraryCount: number
  excluded: string[]
}

interface KnowledgeGraphObservation {
  schemaVersion: number
  stage: string
  appVersion: string
  generatedAt: number
  evidenceLevel: string
  consentBoundary: string
  sourceUserContentIncluded: boolean
  objectIdentifiersIncluded: boolean
  fileNamesIncluded: boolean
  absolutePathsIncluded: boolean
  objectCount: number
  relationCount: number
  connectedObjectCount: number
  isolatedObjectCount: number
  coveragePercent: number
  objectTypes: { category: string; count: number }[]
  relationTypes: { relationType: string; count: number }[]
  degreeDistribution: { zero: number; one: number; twoToFour: number; fiveOrMore: number }
  guidance: { code: string; priority: string; currentValue: number; targetValue: number }[]
}

interface KnowledgeGraphObservationComparison {
  schemaVersion: number
  stage: string
  generatedAt: number
  evidenceLevel: string
  sourceUserContentIncluded: boolean
  objectIdentifiersIncluded: boolean
  fileNamesIncluded: boolean
  absolutePathsIncluded: boolean
  baselineGeneratedAt: number
  elapsedSeconds: number
  baseline: KnowledgeGraphObservationSnapshot
  current: KnowledgeGraphObservationSnapshot
  changes: {
    objectCount: number
    relationCount: number
    connectedObjectCount: number
    isolatedObjectCount: number
    coveragePercent: number
    relationTypeCount: number
  }
  outcome: 'improved' | 'mixed' | 'regressed' | 'unchanged'
  achievements: string[]
}

interface KnowledgeGraphObservationSnapshot {
  objectCount: number
  relationCount: number
  connectedObjectCount: number
  isolatedObjectCount: number
  coveragePercent: number
  relationTypeCount: number
  guidanceCodes: string[]
}

const newLib = reactive({ name: '', path: '' })
const expandedGitLib = ref<string>('')
const toggleGitConfig = (index: number) => {
  const lib = config.value.libraries[index]
  if (!lib) return
  expandedGitLib.value = expandedGitLib.value === lib.path ? '' : lib.path
}

const switchLibrary = (path: string) => {
  if (store.tabs.length === 0) {
    config.value.activeLibraryPath = path
    return
  }
  const hasDirty = store.tabs.some(t => t.isDirty)
  dialog.warning({
    title: '切换知识库',
    content: hasDirty
      ? `有 ${store.tabs.length} 个标签页处于打开状态，其中包含未保存的修改。切换知识库将清空所有标签页，是否继续？`
      : `当前有 ${store.tabs.length} 个标签页处于打开状态，切换知识库将清空所有标签页，是否继续？`,
    positiveText: '确认切换',
    negativeText: '取消',
    onPositiveClick: () => { config.value.activeLibraryPath = path }
  })
}

const syncLocalConfigFromStore = () => {
  config.value = {
    libraries: [...store.libraries],
    activeLibraryPath: store.activeLibraryPath,
    theme: store.theme,
    codeTheme: store.codeTheme,
    editorMode: store.editorMode,
    editorBgColor: store.editorBgColor,
    autoSaveInterval: store.autoSaveInterval,
    maxHistoryCount: store.maxHistoryCount,
    isAutostart: store.isAutostart,
    exitStrategy: store.exitStrategy,
    visualStyle: store.visualStyle,
    motionSpeed: store.motionSpeed,
    aiEnabled: store.aiEnabled,
    aiProvider: store.aiProvider,
    aiEndpoint: store.aiEndpoint,
    aiModel: store.aiModel,
  }
}

onMounted(async () => {
  isInitializing.value = true
  await store.loadConfig()
  syncLocalConfigFromStore()

  nextTick(() => {
    isInitializing.value = false
    alignActiveSettingsCategory()
    if (formatCapabilityRouteFocused.value) formatCapabilityRow.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (observationRouteFocused.value) knowledgeObservationRow.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (softwareUpdateRouteFocused.value) document.querySelector<HTMLElement>('[data-testid="app-update-settings"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
})

watch(() => [route.query.category, route.query.focus], () => {
  activeCategory.value = categoryForRoute()
  alignActiveSettingsCategory()
})

// 深度监听配置对象，实现实时保存
let saveDebounce: any = null
watch(config, (newVal) => {
  if (isInitializing.value) return
  if (saveDebounce) clearTimeout(saveDebounce)
  saveDebounce = setTimeout(() => store.updateConfig(newVal), 500)
}, { deep: true })

const saveCredential = async () => {
  if (!credentialDraft.value.trim() || credentialSaving.value) return
  credentialSaving.value = true
  try {
    await store.saveAiCredential(credentialDraft.value)
    credentialDraft.value = ''
    message.success('API Key 已保存到系统凭据库')
  } catch (error) { message.error(`凭据保存失败：${String(error)}`) }
  finally { credentialSaving.value = false }
}
const removeCredential = () => {
  dialog.warning({
    title: '删除 API 凭据',
    content: '确定从操作系统凭据库删除当前 API Key？配置文件中没有可恢复副本。',
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      credentialSaving.value = true
      try { await store.clearAiCredential(); credentialDraft.value = ''; message.success('API Key 已删除') }
      catch (error) { message.error(`凭据删除失败：${String(error)}`) }
      finally { credentialSaving.value = false }
    }
  })
}

const exportManagementBackup = async () => {
  if (backupExporting.value) return
  const target = await save({
    title: '导出管理备份',
    defaultPath: `longedit-management-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'LongEdit 管理备份', extensions: ['zip'] }],
  })
  if (!target) return
  backupExporting.value = true
  try {
    const receipt = await invoke<ManagementBackupReceipt>('export_management_backup', { targetPath: target })
    const kb = Math.max(1, Math.round(receipt.bytes / 1024))
    message.success(`管理备份已导出：${kb} KiB · ${receipt.entryCount} 个条目 · ${receipt.sha256.slice(0, 12)}`)
  } catch (error) {
    message.error(`导出管理备份失败：${String(error)}`)
  } finally {
    backupExporting.value = false
  }
}

const chooseDirectoryForBackupLibrary = async (library: RequiredLibraryMapping) => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: `为「${library.name || library.pathLeaf || '知识库'}」选择当前机器目录`,
  })
  return typeof selected === 'string' ? selected : ''
}

const restoreBackupAfterConfirm = async (backupPath: string, mappings: LibraryPathMapping[]) => {
  backupRestoring.value = true
  try {
    const receipt = await invoke<ManagementBackupRestoreReceipt>('restore_management_backup', {
      backupPath,
      libraryMappings: mappings,
    })
    isInitializing.value = true
    await store.loadConfig()
    syncLocalConfigFromStore()
    await nextTick()
    isInitializing.value = false
    message.success(`管理备份已恢复：${receipt.libraryCount} 个知识库 · ${receipt.savedSearchCount} 个保存搜索`)
    if (receipt.warnings.length > 0) {
      message.warning(receipt.warnings[0])
    }
  } catch (error) {
    message.error(`恢复管理备份失败：${String(error)}`)
  } finally {
    backupRestoring.value = false
    isInitializing.value = false
  }
}

const importManagementBackup = async () => {
  if (backupRestoring.value) return
  const backupPath = await open({
    multiple: false,
    title: '导入管理备份',
    filters: [{ name: 'LongEdit 管理备份', extensions: ['zip'] }],
  })
  if (!backupPath || typeof backupPath !== 'string') return
  backupRestoring.value = true
  try {
    const preflight = await invoke<ManagementBackupImportPreflight>('preflight_management_backup_import', {
      backupPath,
    })
    if (!preflight.valid) {
      message.error(`管理备份预检未通过：${preflight.blockedReasons.join('；')}`)
      return
    }
    const mappings: LibraryPathMapping[] = []
    for (const library of preflight.requiredLibraryMappings) {
      const path = await chooseDirectoryForBackupLibrary(library)
      if (!path) {
        message.info('已取消管理备份恢复')
        return
      }
      mappings.push({ pathFingerprint: library.pathFingerprint, path })
    }
    const summary = [
      `备份阶段：${preflight.stage} / schema ${preflight.schemaVersion}`,
      `将恢复：${preflight.redactedLibraryCount} 个知识库、${preflight.savedSearchCount} 个保存搜索。`,
      '不会恢复：文档正文、缓存正文、API Key、系统凭据、旧机器绝对路径；Git Remote 需恢复后手动重填。',
      preflight.warnings[0] ? `提示：${preflight.warnings[0]}` : '',
    ].filter(Boolean).join('\n')
    dialog.warning({
      title: '确认恢复管理备份',
      content: summary,
      positiveText: '恢复并覆盖当前管理配置',
      negativeText: '取消',
      onPositiveClick: () => restoreBackupAfterConfirm(backupPath, mappings),
    })
  } catch (error) {
    message.error(`导入管理备份失败：${String(error)}`)
  } finally {
    backupRestoring.value = false
  }
}

const exportPrivacyDiagnosticBundle = async () => {
  if (diagnosticExporting.value) return
  const target = await save({
    title: '导出隐私诊断包',
    defaultPath: `longedit-privacy-diagnostic-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'LongEdit 隐私诊断包', extensions: ['zip'] }],
  })
  if (!target) return
  diagnosticExporting.value = true
  try {
    const receipt = await invoke<PrivacyDiagnosticBundleReceipt>('export_privacy_diagnostic_bundle', { targetPath: target })
    const kb = Math.max(1, Math.round(receipt.bytes / 1024))
    message.success(`隐私诊断包已导出：${kb} KiB · ${receipt.entryCount} 个条目 · 校验值 ${receipt.sha256.slice(0, 12)}`)
  } catch (error) {
    message.error(`导出隐私诊断包失败：${String(error)}`)
  } finally {
    diagnosticExporting.value = false
  }
}

const exportKnowledgeObservationAfterConfirm = async () => {
  const target = await save({
    title: '保存当前关系状态',
    defaultPath: `longedit-knowledge-observation-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'LongEdit 关系状态记录', extensions: ['json'] }],
  })
  if (!target) return
  observationExporting.value = true
  try {
    const receipt = await invoke<KnowledgeGraphObservation>('export_knowledge_graph_observation', {
      libraryRoot: store.libraryPath,
      targetPath: target,
    })
    advanceObservationSession(2)
    message.success(`当前关系状态已保存：${receipt.objectCount} 个对象 · ${receipt.relationCount} 条关系 · ${receipt.coveragePercent}% 覆盖`)
  } catch (error) {
    message.error(`保存当前关系状态失败：${String(error)}`)
  } finally {
    observationExporting.value = false
  }
}

const observationGuidanceLabel = (code: string) => ({
  'add-first-knowledge-object': '建立第一个知识对象',
  'create-first-relation': '建立第一条知识关系',
  'increase-relation-coverage': '提升知识关系覆盖率',
  'connect-isolated-objects': '连接孤立知识对象',
  'diversify-relation-types': '丰富关系语义类型',
  'network-health-on-track': '知识网络状态良好',
} as Record<string, string>)[code] || '检查知识网络结构'

const previewKnowledgeObservation = async () => {
  if (!store.libraryPath || observationExporting.value) return
  observationExporting.value = true
  try {
    const preview = await invoke<KnowledgeGraphObservation>('get_knowledge_graph_observation', {
      libraryRoot: store.libraryPath,
    })
    const summary = [
      `对象：${preview.objectCount}；关系：${preview.relationCount}；覆盖率：${preview.coveragePercent}%`,
      `已连接：${preview.connectedObjectCount}；孤立：${preview.isolatedObjectCount}`,
      `对象类型：${preview.objectTypes.map(item => `${item.category} ${item.count}`).join('、') || '无'}`,
      `关系类型：${preview.relationTypes.map(item => `${item.relationType} ${item.count}`).join('、') || '无'}`,
      `改善建议：${preview.guidance.map(item => observationGuidanceLabel(item.code)).join('、') || '无'}`,
      '',
      '记录文件不会包含正文、文件名、对象 ID、绝对路径或凭据。软件只在你确认后保存到本地，不会自动上传。',
    ].join('\n')
    dialog.warning({
      title: '确认记录当前关系状态',
      content: summary,
      positiveText: '确认并选择保存位置',
      negativeText: '取消',
      onPositiveClick: () => exportKnowledgeObservationAfterConfirm(),
    })
  } catch (error) {
    message.error(`生成关系状态预览失败：${String(error)}`)
  } finally {
    observationExporting.value = false
  }
}

const signedChange = (value: number, suffix = '') => `${value > 0 ? '+' : ''}${value}${suffix}`
const comparisonOutcomeLabel = (outcome: KnowledgeGraphObservationComparison['outcome']) => ({
  improved: '已改善',
  mixed: '部分改善',
  regressed: '需要继续治理',
  unchanged: '暂无变化',
})[outcome]
const observationAchievementLabel = (achievement: string) => ({
  'coverage-increased': '覆盖率提升',
  'isolated-objects-reduced': '孤立对象减少',
  'relations-added': '关系数量增加',
  'relation-types-diversified': '关系类型更丰富',
  'healthy-coverage-threshold-reached': '达到健康覆盖阈值',
} as Record<string, string>)[achievement] || achievement

const reviewKnowledgeObservationReceipt = async () => {
  if (observationReviewing.value) return
  const receiptPath = await open({
    multiple: false,
    title: '选择已保存的关系改善结果',
    filters: [{ name: 'LongEdit 关系改善结果', extensions: ['json'] }],
  })
  if (!receiptPath || typeof receiptPath !== 'string') return
  observationReviewing.value = true
  try {
    observationReview.value = await invoke<KnowledgeGraphObservationComparison>('review_knowledge_graph_observation_comparison', { receiptPath })
    message.success(`关系改善结果已通过检查：${comparisonOutcomeLabel(observationReview.value.outcome)}`)
  } catch (error) {
    observationReview.value = null
    message.error(`查看关系改善结果失败：${String(error)}`)
  } finally {
    observationReviewing.value = false
  }
}

const exportKnowledgeObservationComparisonAfterConfirm = async (baselinePath: string) => {
  const target = await save({
    title: '保存关系改善结果',
    defaultPath: `longedit-knowledge-improvement-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'LongEdit 关系改善结果', extensions: ['json'] }],
  })
  if (!target) return
  observationComparisonExporting.value = true
  try {
    const receipt = await invoke<KnowledgeGraphObservationComparison>('export_knowledge_graph_observation_comparison', {
      libraryRoot: store.libraryPath,
      baselinePath,
      targetPath: target,
    })
    advanceObservationSession(4)
    message.success(`改善对比已保存：${comparisonOutcomeLabel(receipt.outcome)} · 覆盖率 ${signedChange(receipt.changes.coveragePercent, '%')}`)
  } catch (error) {
    message.error(`导出知识网络改善对比失败：${String(error)}`)
  } finally {
    observationComparisonExporting.value = false
  }
}

const previewKnowledgeObservationComparison = async () => {
  if (!store.libraryPath || observationComparisonExporting.value) return
  const baselinePath = await open({
    multiple: false,
    title: '选择此前保存的关系状态记录',
    filters: [{ name: 'LongEdit 关系状态记录', extensions: ['json'] }],
  })
  if (!baselinePath || typeof baselinePath !== 'string') return
  observationComparisonExporting.value = true
  try {
    const preview = await invoke<KnowledgeGraphObservationComparison>('get_knowledge_graph_observation_comparison', {
      libraryRoot: store.libraryPath,
      baselinePath,
    })
    const summary = [
      `结论：${comparisonOutcomeLabel(preview.outcome)}`,
      `覆盖率：${preview.baseline.coveragePercent}% → ${preview.current.coveragePercent}%（${signedChange(preview.changes.coveragePercent, '%')}）`,
      `孤立对象：${preview.baseline.isolatedObjectCount} → ${preview.current.isolatedObjectCount}（${signedChange(preview.changes.isolatedObjectCount)}）`,
      `关系数量：${preview.baseline.relationCount} → ${preview.current.relationCount}（${signedChange(preview.changes.relationCount)}）`,
      `关系类型：${preview.baseline.relationTypeCount} → ${preview.current.relationTypeCount}（${signedChange(preview.changes.relationTypeCount)}）`,
      '',
      '请确认之前的记录来自当前资料库。结果文件只保存关系统计前后值与变化，不包含正文、文件名、对象 ID、绝对路径，也不会自动上传。',
    ].join('\n')
    dialog.warning({
      title: '确认保存关系改善结果',
      content: summary,
      positiveText: '确认并选择保存位置',
      negativeText: '取消',
      onPositiveClick: () => exportKnowledgeObservationComparisonAfterConfirm(baselinePath),
    })
  } catch (error) {
    message.error(`生成知识网络改善对比失败：${String(error)}`)
  } finally {
    observationComparisonExporting.value = false
  }
}

const chooseNewLibDir = async () => {
  const selected = await open({ directory: true, multiple: false, title: '选择软件库文件夹' })
  if (selected && typeof selected === 'string') {
    newLib.path = selected
    if (!newLib.name) {
      const parts = selected.split(/[\\/]/).filter(Boolean)
      newLib.name = parts[parts.length - 1] || '新建库'
    }
  }
}

const addLibrary = () => {
  if (!newLib.name || !newLib.path) {
    message.warning('请填写库名称和路径')
    return
  }
  if (config.value.libraries.find(l => l.path === newLib.path)) {
    message.warning('该路径已在列表中')
    return
  }
  config.value.libraries.push({ ...newLib })
  if (!config.value.activeLibraryPath) config.value.activeLibraryPath = newLib.path
  newLib.name = ''
  newLib.path = ''
  message.success('已添加新库并保存')
}

const removeLibrary = (index: number) => {
  const lib = config.value.libraries[index]
  dialog.warning({
    title: '移除知识库',
    content: `确定要从列表中移除知识库「${lib.name}」吗？此操作不会删除磁盘文件。`,
    positiveText: '确认移除',
    negativeText: '取消',
    onPositiveClick: () => {
      const removed = config.value.libraries.splice(index, 1)[0]
      if (expandedGitLib.value === removed.path) expandedGitLib.value = ''
      if (config.value.activeLibraryPath === removed.path) {
        config.value.activeLibraryPath = config.value.libraries.length > 0 ? config.value.libraries[0].path : ''
      }
      message.info('库已移除')
    }
  })
}

const applyTheme = (val: ThemeName) => {
  // config 是设置页的保存源，必须与 store 同步，否则深度保存会把旧主题写回。
  config.value.theme = val
  store.theme = val
  // 只有当前背景色是某个主题默认色时才更新（不覆盖用户自选颜色）
  const isDefaultBg = Object.values(THEME_MAP).includes(config.value.editorBgColor)
  if (THEME_MAP[val] && isDefaultBg) {
    config.value.editorBgColor = THEME_MAP[val]
  }
}

const getPresetPreviewStyle = (preset: ThemePreset) => {
  const colors = themeToneById[preset.theme].preview
  return {
    '--preset-bg': colors.background,
    '--preset-surface': colors.surface,
    '--preset-accent': colors.accent,
  }
}

const applyPreset = (preset: ThemePreset) => {
  config.value.theme = preset.theme
  config.value.visualStyle = preset.style
  config.value.codeTheme = preset.vditorCodeTheme
  store.theme = preset.theme
  store.visualStyle = preset.style
  store.codeTheme = preset.vditorCodeTheme
  config.value.motionSpeed = preset.motionSpeed
  store.motionSpeed = preset.motionSpeed

  // 更新编辑器背景色
  config.value.editorBgColor = THEME_EDITOR_BACKGROUNDS[preset.theme]

  message.success(`已应用主题预设「${preset.name}」`)
}

const isPresetActive = (preset: ThemePreset): boolean => {
  return config.value.theme === preset.theme
    && config.value.visualStyle === preset.style
    && config.value.codeTheme === preset.vditorCodeTheme
    && config.value.motionSpeed === preset.motionSpeed
}

const getThemeLabel = (theme: ThemeName): string => themeToneById[theme].label

const getStyleLabel = (style: string): string => {
  const option = styleOptions.find(s => s.value === style)
  return option?.label || style
}

const clearHistory = async () => {
  dialog.warning({
    title: '清空历史版本',
    content: '确认要永久清空所有历史版本吗？此操作不可撤销。',
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await invoke('clear_all_history')
        message.success('历史缓存已清空')
      } catch (e) {
        message.error('操作失败')
      }
    }
  })
}

onUnmounted(() => {
  if (saveDebounce) clearTimeout(saveDebounce)
})

// 移除 saveAll 函数
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--theme-bg);
  overflow: hidden;
}

.settings-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  align-items: stretch;
  gap: 28px;
}

.settings-navigation {
  align-self: start;
  display: grid;
  gap: 4px;
  padding: 6px;
  border: var(--theme-border);
  border-radius: 8px;
  background: var(--theme-surface);
  box-shadow: var(--theme-shadow-sm);
}

.settings-navigation button {
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.settings-navigation button:hover { color: var(--theme-text); background: rgba(var(--theme-primary-rgb), 0.06); }
.settings-navigation button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.11); font-weight: 700; }
.settings-navigation .n-icon { flex: none; font-size: 17px; }

.settings-panel {
  min-width: 0;
  min-height: 0;
  padding-right: 4px;
  padding-bottom: 40px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.settings-category-heading {
  min-height: 56px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  display: flex;
  align-items: flex-start;
  border-bottom: var(--theme-border);
}

.settings-category-heading h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: 0; }
.settings-category-heading p { margin: 0; color: var(--theme-text-secondary); font-size: 12px; line-height: 1.5; }

.section-title {
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 18px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--theme-primary);
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}

.section-title::before {
  content: "";
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.5) 100%);
  box-shadow: 0 0 10px rgba(var(--theme-primary-rgb), 0.4);
}

.section-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg,
    rgba(var(--theme-primary-rgb), 0.2),
    transparent);
}

.animate-item {
  opacity: 0;
  animation: fadeUp 0.65s var(--ease-premium) forwards;
  animation-delay: var(--delay);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.setting-card, .library-manager-card {
  transition:
    border-color var(--motion-base) var(--ease-standard),
    box-shadow var(--motion-base) var(--ease-standard),
    transform var(--motion-fast) var(--ease-emphasized);
}

.setting-card:hover, .library-manager-card:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.28);
  box-shadow: var(--theme-shadow-hover);
  transform: translateY(var(--style-hover-lift)) scale(var(--style-hover-scale));
}

.library-manager-card {
  background: var(--style-card-gradient);
  border: var(--theme-border-strong);
  border-radius: var(--theme-radius-lg);
  padding: calc(18px * var(--theme-spacing));
  box-shadow: var(--theme-shadow);
  position: relative;
  overflow: hidden;
}

.library-manager-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-lg);
  padding: 2px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.25) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 50%,
    rgba(var(--theme-primary-rgb), 0.18) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.5;
}

.library-item {
  display: flex;
  flex-direction: column;
  padding: calc(16px * var(--theme-spacing));
  border-radius: var(--theme-radius);
  background: var(--style-control-bg);
  border: var(--theme-border);
  gap: calc(12px * var(--theme-spacing));
  margin-bottom: 14px;
  position: relative;
  transition:
    all var(--motion-base) var(--ease-premium),
    transform var(--motion-fast) var(--ease-emphasized);
}

.library-item::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.6) 100%);
  opacity: 0;
  transform: scaleY(0.5);
  transition:
    opacity var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-emphasized);
}

.is-dark .library-item {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

.library-item:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.25);
  transform: translateX(3px);
}

.library-item.active {
  border-color: rgba(var(--theme-primary-rgb), 0.5);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 100%);
  box-shadow:
    var(--theme-shadow-sm),
    inset 0 0 0 1px rgba(var(--theme-primary-rgb), 0.15);
}

.library-item.active::before {
  opacity: 1;
  transform: scaleY(0.8);
  box-shadow: 0 0 12px rgba(var(--theme-primary-rgb), 0.6);
}

.lib-top-row { display: flex; align-items: center; }

.git-config-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: var(--theme-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(var(--theme-primary-rgb), 0.03);
  padding: 12px;
  border-radius: var(--theme-radius-sm);
}

.is-dark .git-config-panel {
  border-top-color: rgba(255,255,255,0.08);
  background: rgba(255, 255, 255, 0.02);
}

.lib-info { flex: 1; min-width: 0; }

.lib-name {
  font-size: 15px;
  font-weight: 750;
  color: var(--theme-text);
  margin-bottom: 3px;
  letter-spacing: -0.01em;
}

.lib-path {
  font-size: 12px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.lib-actions { display: flex; align-items: center; gap: 12px; margin-left: 16px; }

.add-library-form {
  margin-top: 26px;
  padding-top: 26px;
  border-top: var(--theme-border-strong);
  position: relative;
}

.add-library-form::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg,
    var(--theme-primary),
    transparent);
  opacity: 0.4;
}

.is-dark .add-library-form { border-top-color: rgba(255, 255, 255, 0.12); }

.setting-card {
  background: var(--style-card-gradient);
  border: var(--theme-border-strong);
  border-radius: var(--theme-radius-lg);
  padding: calc(20px * var(--theme-spacing));
  box-shadow: var(--theme-shadow);
  position: relative;
  overflow: hidden;
}

.setting-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-lg);
  padding: 2px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.2) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 50%,
    rgba(var(--theme-primary-rgb), 0.15) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.4;
}

.is-dark .setting-card {
  border-color: rgba(255, 255, 255, 0.08);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--style-control-bg);
  padding: calc(18px * var(--theme-spacing)) calc(20px * var(--theme-spacing));
  border-radius: var(--theme-radius);
  margin-bottom: calc(12px * var(--theme-spacing));
  gap: 24px;
  border: var(--theme-border);
  box-shadow: var(--theme-shadow-sm);
  backdrop-filter: blur(8px);
  position: relative;
  transition:
    all var(--motion-base) var(--ease-premium),
    transform var(--motion-fast) var(--ease-emphasized);
}

.setting-row::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.05) 0%,
    transparent 50%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.setting-row:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.25);
  transform: translateX(2px);
}

.setting-row:hover::before {
  opacity: 1;
}

.setting-row.is-route-focused {
  border-color: rgba(var(--theme-primary-rgb), 0.5);
  box-shadow: var(--theme-shadow-sm), 0 0 0 3px rgba(var(--theme-primary-rgb), 0.09);
}

.setting-row.is-route-focused::before {
  opacity: 1;
}

.backup-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.advanced-settings {
  border: var(--theme-border);
  border-radius: 8px;
  background: var(--theme-surface);
  overflow: hidden;
}

.advanced-settings > summary {
  min-height: 56px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  color: var(--theme-text);
  background: rgba(var(--theme-primary-rgb), 0.035);
  cursor: pointer;
}

.advanced-settings > summary small { color: var(--theme-text-secondary); font-size: 11px; }
.advanced-settings[open] > summary { border-bottom: var(--theme-border); }
.advanced-settings > .setting-row { margin: 12px; }
.advanced-settings > .knowledge-observation-session { margin: 0 12px 12px; }

.knowledge-observation-session {
  margin: -2px 0 calc(12px * var(--theme-spacing));
  padding: calc(18px * var(--theme-spacing));
  border: var(--theme-border);
  border-radius: var(--theme-radius);
  background: rgba(var(--theme-primary-rgb), 0.025);
  box-shadow: var(--theme-shadow-sm);
}

.observation-session-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.observation-session-heading > div { display: grid; gap: 3px; }
.observation-session-heading-actions { display: flex !important; align-items: center; justify-content: flex-end; gap: 6px !important; }
.observation-session-heading strong { color: var(--theme-text); font-size: 14px; }
.observation-session-heading span,
.observation-session-privacy { color: var(--theme-text-secondary); font-size: 11px; line-height: 1.55; }

.observation-session-steps {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.observation-session-steps li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.1);
  border-radius: calc(var(--theme-radius) * 0.75);
  background: var(--style-control-bg);
}

.observation-session-steps li > b {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  color: var(--theme-text-secondary);
  background: rgba(var(--theme-primary-rgb), 0.08);
  font-size: 11px;
}

.observation-session-steps li > div:not(.observation-step-actions) { display: grid; gap: 2px; }
.observation-session-steps li > div > strong { color: var(--theme-text); font-size: 12px; }
.observation-session-steps li > div > span { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.4; }
.observation-session-steps li.active { border-color: rgba(var(--theme-primary-rgb), 0.4); box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), 0.06); }
.observation-session-steps li.active > b { color: white; background: var(--theme-primary); }
.observation-session-steps li.complete > b { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.12); }
.observation-step-actions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.observation-session-privacy { margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed rgba(var(--theme-primary-rgb), 0.14); }

.observation-review {
  display: grid;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.22);
  border-radius: calc(var(--theme-radius) * 0.75);
  background: rgba(var(--theme-primary-rgb), 0.04);
}
.observation-review-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.observation-review-heading > div { display: grid; gap: 2px; }
.observation-review-heading strong { color: var(--theme-text); font-size: 12px; }
.observation-review-heading span,
.observation-review p { margin: 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; }
.observation-review-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.observation-review-grid > div { display: grid; gap: 2px; padding: 8px; border-radius: 6px; background: var(--style-control-bg); }
.observation-review-grid span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.observation-review-grid strong { color: var(--theme-text); font-size: 11px; }
.observation-review-grid small { color: var(--theme-primary); font-size: var(--text-compact); }
.observation-review-achievements { display: flex; flex-wrap: wrap; gap: 6px; }
.observation-review-achievements span { padding: 3px 7px; border-radius: 999px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.09); font-size: var(--text-compact); }

@media (max-width: 720px) {
  .observation-session-steps li { grid-template-columns: 26px minmax(0, 1fr); }
  .observation-session-steps li > .n-button,
  .observation-step-actions { grid-column: 2; justify-self: start; }
  .observation-review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.is-dark .setting-row {
  border-color: rgba(255, 255, 255, 0.08);
}

.danger-zone {
  margin-top: 28px;
  padding-top: 28px;
  border-top: 2px dashed rgba(255, 59, 48, 0.25);
  position: relative;
}

.danger-zone::before {
  content: "⚠️ 危险操作";
  position: absolute;
  top: -12px;
  left: 16px;
  padding: 4px 12px;
  background: var(--style-card-gradient);
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 59, 48, 0.8);
  border-radius: 999px;
  border: 1px solid rgba(255, 59, 48, 0.2);
}

.setting-row .label {
  font-size: 15px;
  font-weight: 700;
  color: var(--theme-text);
  letter-spacing: -0.01em;
}

.setting-row .desc {
  font-size: 12px;
  opacity: 0.6;
  margin-top: 3px;
  line-height: 1.4;
}

:deep(.n-form-item-label) {
  color: var(--theme-text) !important;
  opacity: 0.8;
}

:deep(.n-input), :deep(.n-input-number), :deep(.n-select .n-base-selection) {
  background-color: var(--theme-card) !important;
}

:deep(.n-radio-button) {
  background: var(--theme-card) !important;
  color: var(--theme-text) !important;
}

:deep(.n-radio-button--checked) {
  background: var(--theme-primary) !important;
  color: #fff !important;
}

/* 主题 & 风格色块选择器 */
.theme-swatch-row, .style-swatch-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.theme-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: var(--theme-radius);
  transition: all var(--motion-base) var(--ease-premium);
  min-width: 56px;
  border: 1px solid transparent;
}

.theme-swatch:hover {
  background: rgba(var(--theme-primary-rgb), 0.05);
  border-color: rgba(var(--theme-primary-rgb), 0.15);
}

.theme-swatch.active {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.1) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 100%);
  border-color: rgba(var(--theme-primary-rgb), 0.3);
}

.theme-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--motion-base) var(--ease-premium);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 0 0 3px transparent;
  position: relative;
}

.theme-dot::before {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(var(--theme-primary-rgb), 0.15),
    transparent 70%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

:global(.is-dark) .theme-dot { border-color: rgba(255,255,255,0.15); }

.theme-swatch.active .theme-dot {
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.12),
    0 0 0 3px rgba(var(--theme-primary-rgb), 0.25);
  transform: scale(1.1);
}

.theme-swatch.active .theme-dot::before {
  opacity: 1;
}

/* 主题预设卡片网格 */
.theme-preset-group {
  margin-bottom: 24px;
}

.theme-library-toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  padding: 4px;
  overflow-x: auto;
  border: var(--theme-border);
  border-radius: 7px;
  background: var(--theme-surface);
}

.theme-library-toolbar button {
  min-height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  color: var(--theme-text-secondary);
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
}

.theme-library-toolbar button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.1); }
.theme-library-toolbar button span { font-size: var(--text-compact); opacity: 0.72; }

.theme-preset-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.theme-preset-group-heading > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.theme-preset-group-heading strong {
  font-size: 14px;
}

.theme-preset-group-heading span {
  color: var(--text-secondary);
  font-size: 12px;
}

.theme-preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 0;
}

.theme-preset-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 12px 14px;
  border-radius: var(--theme-radius-lg);
  background: var(--style-card-gradient);
  border: var(--theme-border);
  cursor: pointer;
  transition:
    all var(--motion-base) var(--ease-premium),
    transform var(--motion-fast) var(--ease-emphasized);
  position: relative;
  overflow: hidden;
}

.theme-preset-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.05),
    transparent 60%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.theme-preset-card:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.3);
  box-shadow: var(--theme-shadow-hover);
  transform: translateY(var(--style-hover-lift)) scale(var(--style-hover-scale));
}

.theme-preset-card:hover::before {
  opacity: 1;
}

.theme-preset-card.active {
  border-color: rgba(var(--theme-primary-rgb), 0.5);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.06) 100%);
  box-shadow:
    var(--theme-shadow),
    0 0 0 2px rgba(var(--theme-primary-rgb), 0.15);
}

.theme-preset-card.active::before {
  opacity: 1;
}

.preset-visual {
  position: relative;
  height: 92px;
  overflow: hidden;
  border-radius: calc(var(--theme-radius-sm) + 2px);
  background:
    radial-gradient(circle at 82% 15%, color-mix(in srgb, var(--preset-accent) 28%, transparent), transparent 36%),
    linear-gradient(145deg, var(--preset-bg), color-mix(in srgb, var(--preset-bg) 78%, var(--preset-accent)));
  border: 1px solid color-mix(in srgb, var(--preset-accent) 18%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.preset-window {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 15px;
  bottom: -8px;
  overflow: hidden;
  border-radius: 7px 7px 0 0;
  background: var(--preset-surface);
  box-shadow: 0 9px 24px color-mix(in srgb, var(--preset-accent) 18%, rgba(0, 0, 0, 0.14));
}

.preset-window > span {
  position: absolute;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--preset-accent);
  opacity: 0.48;
}

.preset-window > span:nth-child(1) { left: 9px; }
.preset-window > span:nth-child(2) { left: 17px; opacity: 0.3; }
.preset-window > span:nth-child(3) { left: 25px; opacity: 0.18; }

.preset-sidebar {
  position: absolute;
  left: 0;
  top: 20px;
  bottom: 0;
  width: 31%;
  background: color-mix(in srgb, var(--preset-accent) 10%, var(--preset-surface));
  border-right: 1px solid color-mix(in srgb, var(--preset-accent) 12%, transparent);
}

.preset-document {
  position: absolute;
  left: 41%;
  right: 10%;
  top: 30px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.preset-document i {
  display: block;
  height: 4px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--preset-accent) 38%, transparent);
}

.preset-document i:nth-child(1) { width: 62%; height: 6px; background: var(--preset-accent); }
.preset-document i:nth-child(2) { width: 100%; opacity: 0.48; }
.preset-document i:nth-child(3) { width: 78%; opacity: 0.32; }

.preset-icon {
  position: absolute;
  right: 9px;
  top: 7px;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--preset-surface) 84%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-size: 16px;
  line-height: 1;
}

.preset-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--theme-text);
  text-align: left;
  padding: 0 3px;
}

.preset-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: left;
  line-height: 1.4;
  min-height: 34px;
  padding: 0 3px;
}

.preset-tags {
  display: flex;
  justify-content: flex-start;
  padding: 0 3px;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-tags .tag {
  font-size: var(--text-compact);
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(var(--theme-primary-rgb), 0.1);
  color: var(--theme-primary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.style-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  transition: all var(--motion-base) var(--ease-premium);
  border: var(--theme-border);
  background: var(--style-control-bg);
  position: relative;
}

.style-swatch::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    transparent);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.style-swatch:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.35);
  transform: translateY(-2px);
}

.style-swatch:hover::before { opacity: 1; }

.style-swatch.active {
  border-color: rgba(var(--theme-primary-rgb), 0.5);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.06) 100%);
  box-shadow: var(--theme-shadow-sm);
}

.swatch-preview {
  width: 60px;
  height: 32px;
  border-radius: 6px;
  background: var(--theme-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 10px;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.swatch-soft { border-radius: 8px; background: var(--theme-card); }
.swatch-neo { border-radius: 14px; box-shadow: 3px 3px 6px rgba(0,0,0,0.1), -2px -2px 4px rgba(255,255,255,0.7); }
.swatch-glass { border-radius: 14px; background: rgba(255,255,255,0.35); box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
.swatch-airy { border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
.swatch-minimal { border-radius: 3px; box-shadow: none; background: var(--theme-card); }
.swatch-sharp { border-radius: 0; box-shadow: none; border: 2px solid rgba(0,0,0,0.15); }

.swatch-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-text);
  opacity: 0.25;
}

.swatch-line {
  width: 28px;
  height: 3px;
  border-radius: 2px;
  background: var(--theme-text);
  opacity: 0.15;
}

.swatch-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--theme-text);
  opacity: 0.75;
  text-align: center;
  position: relative;
  z-index: 1;
}

.motion-option-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.motion-option {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 68px;
  padding: 14px;
  border: var(--theme-border-strong);
  border-radius: var(--theme-radius);
  background: var(--style-control-bg);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--motion-base) var(--ease-standard),
    background-color var(--motion-base) var(--ease-standard),
    transform var(--motion-fast) var(--ease-emphasized),
    box-shadow var(--motion-base) var(--ease-standard);
}

.motion-option::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    transparent 60%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.motion-option:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.35);
  transform: translateY(-2px);
}

.motion-option:hover::before { opacity: 1; }

.motion-option.active {
  border-color: rgba(var(--theme-primary-rgb), 0.6);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.06) 100%);
  box-shadow: var(--theme-shadow-sm);
}

.motion-option.active::before { opacity: 1; }

.motion-preview {
  width: 58px;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  flex-shrink: 0;
  border-radius: var(--theme-radius-sm);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.1) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 100%);
  position: relative;
  z-index: 1;
}

.motion-preview span {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--theme-primary);
  opacity: 0.45;
  transition: all var(--motion-base) var(--ease-standard);
}

.motion-option.active .motion-preview span {
  animation: motionPulse var(--motion-page) var(--ease-emphasized) infinite alternate;
}

.motion-option.active .motion-preview span:nth-child(2) { animation-delay: 90ms; }
.motion-option.active .motion-preview span:nth-child(3) { animation-delay: 180ms; }

.motion-swift span { transform: translateX(2px); }
.motion-expressive span { transform: scale(1.15); }
.motion-reduced span { opacity: 0.25; }

.motion-copy { min-width: 0; position: relative; z-index: 1; }
.motion-label { font-size: 14px; font-weight: 800; color: var(--theme-text); letter-spacing: -0.01em; }
.motion-desc { margin-top: 3px; font-size: 11px; color: var(--text-tertiary); line-height: 1.4; }

@keyframes motionPulse {
  from { opacity: 0.35; transform: translateY(2px) scale(0.88); }
  to { opacity: 1; transform: translateY(-2px) scale(1); }
}

/* 实时预览区域样式 */
.theme-preview-card {
  margin-top: 16px;
  border-radius: var(--theme-radius-lg);
  border: var(--theme-border-strong);
  padding: 28px;
  min-height: 220px;
  transition: all var(--motion-slow) var(--ease-premium);
  box-shadow:
    var(--theme-shadow),
    inset 0 3px 12px rgba(0, 0, 0, 0.03);
  overflow: hidden;
  position: relative;
}

.theme-preview-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-lg);
  padding: 2px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.15) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 50%,
    rgba(var(--theme-primary-rgb), 0.12) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.3;
}

.is-dark .theme-preview-card { border-color: rgba(255, 255, 255, 0.12); }

.preview-content {
  max-width: 100%;
  position: relative;
  z-index: 1;
}

.preview-md-h {
  font-size: 22px;
  font-weight: 900;
  margin: 0 0 14px;
  color: var(--theme-text);
  opacity: 0.95;
  letter-spacing: 0;
}

.preview-md-p {
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 22px;
  color: var(--theme-text);
  opacity: 0.75;
}

.preview-code-block {
  border-radius: var(--theme-radius);
  overflow: hidden;
  box-shadow:
    var(--theme-shadow),
    inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  font-family: 'Fira Code', 'SF Mono', monospace;
  font-size: 13px;
}

.code-header {
  height: 36px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(180deg,
    rgba(0, 0, 0, 0.06) 0%,
    rgba(0, 0, 0, 0.04) 100%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}
.dot.red { background: linear-gradient(135deg, #ff5f56 0%, #ff4444 100%); }
.dot.yellow { background: linear-gradient(135deg, #ffbd2e 0%, #ffaa00 100%); }
.dot.green { background: linear-gradient(135deg, #27c93f 0%, #20aa33 100%); }

.lang {
  margin-left: auto;
  font-size: var(--text-compact);
  font-weight: 800;
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-code-block pre {
  margin: 0;
  padding: 18px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.03);
}

/* 代码高亮模拟颜色 */
.theme-github .keyword { color: #d73a49; font-weight: 600; }
.theme-github .variable { color: #005cc5; }
.theme-github .string { color: #032f62; }
.theme-github .method { color: #6f42c1; }

.theme-monokai { background: #272822; color: #f8f8f2; }
.theme-monokai .keyword { color: #f92672; font-weight: 600; }
.theme-monokai .variable { color: #a6e22e; }
.theme-monokai .string { color: #e6db74; }
.theme-monokai .method { color: #66d9ef; }

.theme-dracula { background: #282a36; color: #f8f8f2; }
.theme-dracula .keyword { color: #ff79c6; font-weight: 600; }
.theme-dracula .variable { color: #50fa7b; }
.theme-dracula .string { color: #f1fa8c; }
.theme-dracula .method { color: #8be9fd; }

.theme-one-dark { background: #282c34; color: #abb2bf; }
.theme-one-dark .keyword { color: #c678dd; font-weight: 600; }
.theme-one-dark .variable { color: #e06c75; }
.theme-one-dark .string { color: #98c379; }
.theme-one-dark .method { color: #61afef; }

.theme-vscode { background: #1e1e1e; color: #d4d4d4; }
.theme-vscode .keyword { color: #569cd6; font-weight: 600; }
.theme-vscode .variable { color: #9cdcfe; }
.theme-vscode .string { color: #ce9178; }
.theme-vscode .method { color: #dcdcaa; }

@media (max-width: 900px) {
  .settings-content { overflow-y: auto; }
  .settings-layout { height: auto; min-height: 100%; grid-template-columns: minmax(0, 1fr); align-content: start; align-items: start; gap: 16px; }
  .settings-navigation {
    position: sticky;
    top: 0;
    z-index: 5;
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    overflow-x: auto;
  }
  .settings-navigation button { width: auto; min-width: max-content; }
  .settings-panel { min-height: auto; padding-right: 0; padding-bottom: 0; overflow: visible; scrollbar-gutter: auto; }
  .settings-category-heading { margin-bottom: 14px; }
}

@media (max-width: 640px) {
  .settings-navigation button { min-height: 36px; padding: 0 8px; }
  .settings-navigation .n-icon { font-size: 15px; }
  .setting-row { align-items: flex-start; flex-wrap: wrap; gap: 12px; padding: 14px; }
  .setting-row > .info { width: 100%; }
  .backup-actions { width: 100%; justify-content: flex-start; }
  .observation-session-heading { flex-direction: column; }
  .theme-preset-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
