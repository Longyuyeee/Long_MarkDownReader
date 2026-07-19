<template>
  <div class="settings-view">
    <div class="settings-header">
      <n-button quaternary circle @click="router.back()">
        <template #icon><n-icon :component="ArrowLeftIcon" /></template>
      </n-button>
      <h2>设置</h2>
    </div>

    <div class="settings-content">
      <n-form label-placement="top" size="medium">
        <n-grid :cols="1" :y-gap="24">
          <n-grid-item class="animate-item" style="--delay: 0.1s">
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

          <n-grid-item class="animate-item" style="--delay: 0.2s">
            <div class="section-title">影子副本 (Shadow Copy)</div>
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

          <n-grid-item class="animate-item" style="--delay: 0.3s">
            <div class="section-title">系统集成</div>
            <div class="setting-row">
              <div class="info">
                <div class="label">开机自动启动</div>
                <div class="desc">在 Windows 启动时自动运行Long编辑</div>
              </div>
              <n-switch v-model:value="config.isAutostart" />
            </div>
            <div class="setting-row">
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
            <div class="setting-row">
              <div class="info">
                <div class="label">设为默认 Markdown 编辑器</div>
                <div class="desc">双击 .md 文件将自动使用Long编辑打开</div>
              </div>
              <n-button 
                secondary 
                :type="store.isDefaultEditor ? 'success' : 'info'" 
                @click="setAsDefault"
                :disabled="store.isDefaultEditor"
              >
                {{ store.isDefaultEditor ? '已是默认编辑器' : '立即设置' }}
              </n-button>
            </div>
          </n-grid-item>

          <n-grid-item class="animate-item" style="--delay: 0.35s">
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

          <n-grid-item class="animate-item" style="--delay: 0.4s">
            <div class="section-title">外观主题</div>
            <div class="theme-preset-grid">
              <div
                v-for="preset in themePresets"
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
                  <span class="tag">{{ getThemeLabel(preset.theme) }}</span>
                  <span class="tag">{{ getStyleLabel(preset.style) }}</span>
                </div>
              </div>
            </div>

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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft as ArrowLeftIcon, Trash as TrashIcon, GitBranch as GitBranchIcon, Check as CheckIcon } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, useDialog, NTag, NInputGroup } from 'naive-ui'
import { useAppStore, THEME_MAP } from '../store/app'
import { themePresets, type ThemePreset } from '../config/themePresets'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const store = useAppStore()
const isInitializing = ref(true)

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

const themeOptions = [
  { label: '纯白', value: 'white', color: '#ffffff' },
  { label: '护眼绿', value: 'green', color: '#42b883' },
  { label: '清爽蓝', value: 'blue', color: '#00a2ff' },
  { label: '浪漫粉', value: 'pink', color: '#ff6b9d' },
  { label: '奶油', value: 'cream', color: '#e67e4d' },
  { label: '紫梦幻', value: 'purple', color: '#7c3aed' },
  { label: '琥珀', value: 'amber', color: '#d97706' },
  { label: '深色', value: 'dark', color: '#1c1c1e' },
  { label: '跟随系统', value: 'system', color: '#8e8e93' },
]

const presetPreviewColors: Record<string, { background: string; surface: string; accent: string }> = {
  white: { background: '#f4f7fb', surface: '#ffffff', accent: '#0071e3' },
  green: { background: '#edf7f0', surface: '#fbfefc', accent: '#34a853' },
  blue: { background: '#eaf3ff', surface: '#fbfdff', accent: '#0b73d9' },
  pink: { background: '#fbecf3', surface: '#fffafd', accent: '#cf3f72' },
  cream: { background: '#f8efe2', surface: '#fffaf3', accent: '#e67e4d' },
  purple: { background: '#eee9fa', surface: '#fcfaff', accent: '#7c3aed' },
  amber: { background: '#f9ecd8', surface: '#fffaf2', accent: '#d97706' },
  dark: { background: '#101318', surface: '#20252d', accent: '#64d987' },
  system: { background: '#e7e9ed', surface: '#ffffff', accent: '#707780' },
}

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

onMounted(async () => {
  isInitializing.value = true
  await store.loadConfig()
  
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

  nextTick(() => {
    isInitializing.value = false
  })
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

const applyTheme = (val: string) => {
  // config 是设置页的保存源，必须与 store 同步，否则深度保存会把旧主题写回。
  config.value.theme = val as any
  store.theme = val as any
  // 只有当前背景色是某个主题默认色时才更新（不覆盖用户自选颜色）
  const isDefaultBg = Object.values(THEME_MAP).includes(config.value.editorBgColor)
  if (THEME_MAP[val] && isDefaultBg) {
    config.value.editorBgColor = THEME_MAP[val]
  }
}

const getPresetPreviewStyle = (preset: ThemePreset) => {
  const colors = presetPreviewColors[preset.theme] || presetPreviewColors.white
  return {
    '--preset-bg': colors.background,
    '--preset-surface': colors.surface,
    '--preset-accent': colors.accent,
  }
}

const applyPreset = (preset: ThemePreset) => {
  config.value.theme = preset.theme as any
  config.value.visualStyle = preset.style as any
  config.value.codeTheme = preset.vditorCodeTheme

  // 更新编辑器背景色
  if (THEME_MAP[preset.theme]) {
    config.value.editorBgColor = THEME_MAP[preset.theme]
  }

  message.success(`已应用主题预设「${preset.name}」`)
}

const isPresetActive = (preset: ThemePreset): boolean => {
  return config.value.theme === preset.theme && config.value.visualStyle === preset.style
}

const getThemeLabel = (theme: string): string => {
  const option = themeOptions.find(t => t.value === theme)
  return option?.label || theme
}

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

const setAsDefault = async () => {
  try {
    await invoke('set_as_default_handler')
    message.loading('正在同步系统设置...', { duration: 1000 })
    
    // 延迟检查，给系统注册表反应时间
    setTimeout(async () => {
      await store.checkSystemStatus()
      if (store.isDefaultEditor) {
        message.success('已成功设为默认编辑器')
      } else {
        message.warning('设置已提交，若未生效请在系统“打开方式”中手动选择Long编辑')
      }
    }, 1500)
  } catch (err) {
    message.error('设置失败: ' + err)
  }
}
// 移除 saveAll 函数
</script>

<style scoped>
.settings-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--style-bg-gradient);
  animation: settings-fade-in 0.6s var(--ease-premium);
  position: relative;
  overflow: hidden;
}

.settings-view::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 10%, rgba(var(--theme-primary-rgb), 0.08), transparent 40%),
    radial-gradient(circle at 80% 50%, rgba(var(--theme-primary-rgb), 0.05), transparent 45%);
  pointer-events: none;
  opacity: 0.5;
}

@keyframes settings-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-header {
  padding: 32px 5% 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: var(--theme-border-strong);
  background: var(--style-card-gradient);
  backdrop-filter: blur(10px);
  position: relative;
  z-index: 1;
  box-shadow: var(--theme-shadow-sm);
}

.settings-header::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 2px;
  background: linear-gradient(90deg,
    transparent,
    rgba(var(--theme-primary-rgb), 0.3) 20%,
    rgba(var(--theme-primary-rgb), 0.3) 80%,
    transparent);
  opacity: 0.4;
}

.is-dark .settings-header { border-bottom-color: rgba(255, 255, 255, 0.08); }

.settings-header h2 {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-size: 26px;
  background: linear-gradient(135deg,
    var(--theme-text) 0%,
    rgba(var(--theme-primary-rgb), 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 30px 5% 60px;
  max-width: 840px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 0;
}

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
.theme-preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
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
  font-size: 10px;
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
  letter-spacing: -0.02em;
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
  font-size: 10px;
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
</style>
