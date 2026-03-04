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
          <n-grid-item>
            <div class="section-title">软件库管理</div>
            <div class="library-manager-card">
              <div v-for="(lib, index) in config.libraries" :key="index" class="library-item" :class="{ active: lib.path === config.activeLibraryPath }">
                <div class="lib-info">
                  <div class="lib-name">{{ lib.name }}</div>
                  <div class="lib-path">{{ lib.path }}</div>
                </div>
                <div class="lib-actions">
                  <n-button size="tiny" secondary type="primary" v-if="lib.path !== config.activeLibraryPath" @click="config.activeLibraryPath = lib.path">切换</n-button>
                  <n-tag size="small" type="success" v-else>当前使用</n-tag>
                  <n-button size="tiny" quaternary circle type="error" @click="removeLibrary(index)">
                    <template #icon><n-icon :component="TrashIcon" /></template>
                  </n-button>
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

          <n-grid-item>
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

          <n-grid-item>
            <div class="section-title">系统集成</div>
            <div class="setting-row">
              <div class="info">
                <div class="label">设为默认 Markdown 编辑器</div>
                <div class="desc">双击 .md 文件将自动使用胧编辑打开</div>
              </div>
              <n-button secondary type="info" @click="setAsDefault">立即设置</n-button>
            </div>
          </n-grid-item>

          <n-grid-item>
            <div class="section-title">外观</div>
            <n-form-item label="颜色主题">
              <n-radio-group v-model:value="config.theme" name="theme" @update:value="applyTheme" size="large">
                <n-radio-button value="white">纯白</n-radio-button>
                <n-radio-button value="green">护眼绿</n-radio-button>
                <n-radio-button value="blue">清爽蓝</n-radio-button>
                <n-radio-button value="pink">浪漫粉</n-radio-button>
                <n-radio-button value="dark">深色</n-radio-button>
                <n-radio-button value="system">跟随系统</n-radio-button>
              </n-radio-group>
            </n-form-item>
          </n-grid-item>

          <n-grid-item>
            <n-button type="primary" size="large" block @click="saveAll">保存所有设置</n-button>
          </n-grid-item>
        </n-grid>
      </n-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft as ArrowLeftIcon, Trash as TrashIcon } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, NTag, NInputGroup } from 'naive-ui'
import { useAppStore } from '../store/app'

const router = useRouter()
const message = useMessage()
const store = useAppStore()

const config = ref({
  libraries: [] as any[],
  activeLibraryPath: store.activeLibraryPath,
  theme: store.theme,
  codeTheme: store.codeTheme,
  editorMode: store.editorMode,
  editorBgColor: store.editorBgColor,
  autoSaveInterval: store.autoSaveInterval,
  maxHistoryCount: store.maxHistoryCount
})

const newLib = reactive({ name: '', path: '' })

onMounted(async () => {
  await store.loadConfig()
  config.value = {
    libraries: [...store.libraries],
    activeLibraryPath: store.activeLibraryPath,
    theme: store.theme,
    codeTheme: store.codeTheme,
    editorMode: store.editorMode,
    editorBgColor: store.editorBgColor,
    autoSaveInterval: store.autoSaveInterval,
    maxHistoryCount: store.maxHistoryCount
  }
})

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
  message.success('已添加到待保存列表')
}

const removeLibrary = (index: number) => {
  const removed = config.value.libraries.splice(index, 1)[0]
  if (config.value.activeLibraryPath === removed.path) {
    config.value.activeLibraryPath = config.value.libraries.length > 0 ? config.value.libraries[0].path : ''
  }
}

const applyTheme = (val: string) => {
  store.theme = val as any
}

const clearHistory = async () => {
  if (confirm('确认要永久清空所有历史版本吗？')) {
    try {
      await invoke('clear_all_history')
      message.success('历史缓存已清空')
    } catch (e) {
      message.error('操作失败')
    }
  }
}

const setAsDefault = async () => {
  try {
    await invoke('set_as_default_handler')
    message.success('已成功修改系统注册表')
  } catch (err) {
    message.error('设置失败: ' + err)
  }
}

const saveAll = async () => {
  try {
    await store.updateConfig(config.value)
    await store.loadConfig()
    message.success('配置已保存并生效')
  } catch (err) {
    message.error('保存失败: ' + err)
  }
}
</script>

<style scoped>
.settings-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;
  animation: settings-fade-in 0.6s cubic-bezier(0.22, 1, 0.36, 1);
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
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.is-dark .settings-header { border-bottom-color: rgba(255, 255, 255, 0.05); }

.settings-header h2 { 
  margin: 0; 
  font-weight: 700; 
  letter-spacing: -0.02em;
  font-size: 24px;
  color: var(--theme-text);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 30px 5% 60px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-primary);
  opacity: 0.8;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.1;
}

.setting-card, .library-manager-card {
  background: var(--theme-card);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.03);
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.library-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.is-dark .library-item {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}

.library-item.active {
  border-color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.lib-info { flex: 1; min-width: 0; }
.lib-name { font-size: 15px; font-weight: 700; color: var(--theme-text); margin-bottom: 2px; }
.lib-path { font-size: 12px; opacity: 0.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lib-actions { display: flex; align-items: center; gap: 12px; margin-left: 16px; }

.add-library-form {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.is-dark .add-library-form { border-top-color: rgba(255, 255, 255, 0.1); }

.is-dark .setting-card {
  border-color: rgba(255, 255, 255, 0.05);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--theme-card);
  padding: 18px 20px;
  border-radius: 12px;
  margin-bottom: 12px;
  gap: 20px;
  border: 1px solid rgba(0, 0, 0, 0.02);
}

.is-dark .setting-row {
  border-color: rgba(255, 255, 255, 0.05);
}

.danger-zone {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px dashed rgba(255, 59, 48, 0.2);
}

.setting-row .label { font-size: 15px; font-weight: 600; color: var(--theme-text); }
.setting-row .desc { font-size: 12px; opacity: 0.5; margin-top: 2px; }

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
</style>
