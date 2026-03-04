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
            <div class="section-title">通用设置</div>
            <n-form-item label="软件库根目录">
              <n-input-group>
                <n-input v-model:value="config.libraryPath" placeholder="请输入或选择存放笔记的文件夹" />
                <n-button type="primary" secondary @click="chooseDir">选择文件夹</n-button>
              </n-input-group>
              <template #feedback>
                所有导入的文件和新笔记都将物理存放在此目录下。
              </template>
            </n-form-item>
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
              <n-radio-group v-model:value="config.theme" name="theme" @update:value="applyTheme">
                <n-radio-button value="light">浅色</n-radio-button>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft as ArrowLeftIcon } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'

const router = useRouter()
const message = useMessage()
const store = useAppStore()

const config = ref({
  libraryPath: store.libraryPath,
  theme: store.theme,
  autoSaveInterval: store.autoSaveInterval,
  maxHistoryCount: store.maxHistoryCount
})

onMounted(async () => {
  await store.loadConfig()
  config.value = {
    libraryPath: store.libraryPath,
    theme: store.theme,
    autoSaveInterval: store.autoSaveInterval,
    maxHistoryCount: store.maxHistoryCount
  }
})

const chooseDir = async () => {
  const selected = await open({ directory: true, multiple: false, title: '选择软件库根目录' })
  if (selected && typeof selected === 'string') {
    config.value.libraryPath = selected
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
    // 强制重载确保 UI 同步
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
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(20px);
}

.settings-header {
  padding: 24px 5%;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.settings-header h2 { margin: 0; font-weight: 600; }

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 5%;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 16px;
  opacity: 0.9;
  border-left: 4px solid #007aff;
  padding-left: 12px;
}

.setting-card {
  background: rgba(255, 255, 255, 0.03);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 8px;
  gap: 20px;
}

.danger-zone {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 0, 0, 0.1);
}

.danger-zone .desc {
  font-size: 12px;
  color: #ff4d4f;
  margin-top: 8px;
  opacity: 0.8;
}

.setting-row .label { font-size: 14px; font-weight: 500; }
.setting-row .desc { font-size: 12px; opacity: 0.5; }
</style>
