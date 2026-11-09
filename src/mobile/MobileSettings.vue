<template>
  <section v-if="page === 'home'" class="settings-home">
    <header class="phone-page-header"><h1 tabindex="-1">设置</h1><MobileHelp topic="settings" /></header>
    <div class="settings-list">
      <button v-for="entry in categories" :key="entry.id" class="setting-row" :data-focus-key="entry.id === 'recovery' ? 'recovery' : `settings-${entry.id}`" @click="entry.id === 'recovery' ? $emit('recovery') : $emit('navigate', entry.id)"><span class="setting-icon"><component :is="entry.icon" :size="25" /></span><span class="setting-info"><strong>{{ entry.label }}</strong><span v-if="entry.id === 'appearance' || entry.id === 'storage' || entry.id === 'about'" class="setting-value">{{ entry.id === 'appearance' ? themeLabel : entry.id === 'storage' ? activeLibraryName : androidPreviewVersion ? '预览版' : '开发测试版' }}</span></span><ChevronRight :size="18" aria-hidden="true" /></button>
    </div>
  </section>
  <section v-else class="settings-detail" :class="`${page}-page`">
    <header class="settings-page-header"><button class="icon-button" aria-label="返回设置" :disabled="busy" @click="$emit('navigate', 'home')"><ArrowLeft :size="21" /></button><h1 tabindex="-1">{{ settingsPageLabels[page] }}</h1><MobileHelp v-if="page === 'appearance' || page === 'storage'" :topic="page === 'appearance' ? 'appearance' : 'storage'" /></header>
    <div class="settings-detail-body">
      <MobileThemeChoices v-if="page === 'appearance'" :value="theme" :busy="themeBusy" group-name="settings-appearance-theme" @choose="$emit('choose-theme',$event)" />
      <LibraryRoots v-else-if="page === 'storage'" :roots="roots" :current="rootId" :busy="busy" :choosing="choosing" @select="$emit('select-root', $event)" @actions="$emit('root-actions', $event)" @choose="$emit('choose-root')" />
      <div v-else-if="page === 'transfers'" class="settings-list">
        <button
          v-for="entry in transfers"
          :key="entry.id"
          type="button"
          class="setting-row"
          :data-focus-key="`settings-transfer-${entry.id}`"
          aria-haspopup="dialog"
          @click="$emit('task', entry.id)"
        >
          <span class="setting-icon"><component :is="entry.icon" :size="21" aria-hidden="true" /></span>
          <span class="setting-info"><strong class="transfer-label">{{ entry.label }}<wbr>记录</strong></span>
          <ChevronRight :size="18" aria-hidden="true" />
        </button>
      </div>
      <div v-else-if="page === 'about'" class="settings-about">
        <span class="brand-mark"><BookOpen :size="30" aria-hidden="true" /></span>
        <h2>Long编辑</h2>
        <p v-if="androidPreviewVersion">移动端 <wbr>{{ androidPreviewVersion }}</p>
        <p v-else>移动端 0.1.0 <wbr>开发预览</p>
        <small><span>基础引擎 {{ foundationVersion }}</span><span class="about-meta-divider" aria-hidden="true"> · </span><span>{{ preview ? '浏览器交互预览' : androidPreviewVersion ? 'Android 预览版' : 'Android 开发版' }}</span></small>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { version as foundationVersion } from '../../package.json'
import { ArrowDownUp, ArrowLeft, BookOpen, ChevronRight, Download, FileDown, FileText, FolderOpen, History, ImagePlus, Info, PackagePlus, Palette } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import LibraryRoots from './LibraryRoots.vue'
import MobileThemeChoices from './MobileThemeChoices.vue'
import { settingsPageLabels, themeOptions, type SettingsPage, type ThemePreference } from './settings'
import type { Library } from './storage'
const props = defineProps<{ page: SettingsPage; theme: ThemePreference; themeBusy: boolean; roots: Library[]; rootId: string; busy: boolean; choosing: boolean; preview: boolean }>()
const androidPreviewVersion = import.meta.env.VITE_LONGEDIT_ANDROID_PREVIEW_VERSION as string | undefined
defineEmits<{ navigate: [page: SettingsPage]; recovery: []; 'choose-theme': [value:ThemePreference]; task: [id: string]; 'select-root': [root: Library]; 'root-actions': [root: Library]; 'choose-root': [] }>()
const themeLabel = computed(() => themeOptions.find(option => option.id === props.theme)!.label)
const activeLibraryName=computed(()=>props.roots.find(root=>root.id===props.rootId)?.name||'正在准备资料库')
const categories = [{ id: 'appearance', label: '外观', icon: Palette }, { id: 'storage', label: '资料库', icon: FolderOpen }, { id: 'transfers', label: '导入与导出', icon: ArrowDownUp }, { id: 'recovery', label: '保存恢复记录', icon: History }, { id: 'about', label: '关于', icon: Info }] as const
const transfers = [
  { id: 'text', label: '文件导入', icon: FileText },
  { id: 'pdf', label: 'PDF 接收', icon: FileDown },
  { id: 'image', label: '图片导入', icon: ImagePlus },
  { id: 'pack-import', label: '附件包导入', icon: PackagePlus },
  { id: 'pack-export', label: '附件包导出', icon: Download }
]
</script>
<style scoped>
.appearance-page>.settings-page-header,.storage-page>.settings-page-header{padding:8px;border-bottom:1px solid var(--line)}.appearance-page>.settings-detail-body,.storage-page>.settings-detail-body{padding:24px 16px 32px}
.transfer-label,
.about-page h1,
.settings-about { word-break: keep-all; overflow-wrap: anywhere; }
@media(max-width:340px){
  :is(.transfers-page,.about-page)>.settings-page-header{padding-inline:8px}
  :is(.transfers-page,.about-page)>.settings-page-header h1{font-size:1.0625rem}
  .transfers-page .setting-row{min-height:64px;gap:8px;padding:8px 10px}
  .transfers-page .setting-icon{width:32px;height:32px}
  .transfers-page .setting-row>svg{width:16px}
  .transfer-label{font-size:.875rem;line-height:1.4}
  .settings-about{padding:18px 12px}
  .settings-about .brand-mark{width:52px;height:52px}
  .settings-about h2{margin:12px 0 6px;font-size:1.25rem;line-height:1.35}
  .settings-about p{font-size:.875rem;line-height:1.4}
  .settings-about small{display:grid;gap:4px;font-size:.75rem;line-height:1.45}
  .about-meta-divider{display:none}
}
</style>
