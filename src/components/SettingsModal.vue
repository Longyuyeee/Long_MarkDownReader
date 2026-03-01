<template>
  <n-modal
    v-model:show="show"
    preset="card"
    class="settings-modal"
    title="首选项"
    :bordered="false"
    style="width: 500px; border-radius: 12px; backdrop-filter: blur(20px); background: rgba(255, 255, 255, 0.8);"
  >
    <n-form label-placement="left" label-width="100" size="medium">
      <n-form-item label="库保存路径">
        <n-input-group>
          <n-input v-model:value="config.library_path" placeholder="请选择存放笔记的文件夹" readonly />
          <n-button type="primary" secondary @click="chooseDir">选择</n-button>
        </n-input-group>
      </n-form-item>
      
      <n-form-item label="外观主题">
        <n-radio-group v-model:value="config.theme" name="theme">
          <n-radio-button value="light">浅色</n-radio-button>
          <n-radio-button value="dark">深色</n-radio-button>
          <n-radio-button value="system">跟随系统</n-radio-button>
        </n-radio-group>
      </n-form-item>

      <n-divider />
      
      <div style="text-align: right; display: flex; gap: 12px; justify-content: flex-end;">
        <n-button @click="show = false">取消</n-button>
        <n-button type="primary" @click="save">保存并应用</n-button>
      </div>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['update:show', 'saved'])
const message = useMessage()
const store = useAppStore()

const show = ref(props.show)
watch(() => props.show, (v) => show.value = v)
watch(show, (v) => emit('update:show', v))

const config = ref({
  library_path: store.libraryPath,
  theme: store.theme
})

const chooseDir = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择软件库根目录'
  })
  if (selected && typeof selected === 'string') {
    config.value.library_path = selected
  }
}

const save = async () => {
  try {
    await invoke('save_config', { config: config.value })
    store.libraryPath = config.value.library_path
    store.theme = config.value.theme as any
    message.success('配置已保存')
    emit('saved')
    show.value = false
  } catch (err) {
    message.error('保存失败: ' + err)
  }
}
</script>

<style scoped>
.settings-modal {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
}
:deep(.n-card-header__main) {
  font-weight: bold;
}
</style>
