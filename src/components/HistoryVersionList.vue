<template>
  <section class="history-version-list">
    <div class="history-search"><n-input v-model:value="query" clearable placeholder="查找内容或备注" :input-props="{ 'aria-label': '查找历史内容或备注' }" /><n-select v-model:value="filter" :options="filters" aria-label="历史筛选" /></div>
    <p v-if="loading" role="status">正在读取历史…</p>
    <div v-if="error || metadataError" role="alert">{{ error || metadataError }}<n-button text @click="$emit('refresh'); loadMetadata()">重试</n-button></div>
    <p v-if="!loading && !error && !visible.length" class="history-empty">{{ entries.length ? '没有符合条件的版本' : '暂无历史版本' }}</p>
    <div class="history-version-rows text-history-entries">
      <template v-for="(entry, index) in visible" :key="entry.timestamp">
        <div v-if="index === 0 || day(entry.timestamp) !== day(visible[index - 1].timestamp)" class="history-day">{{ day(entry.timestamp) }}</div>
        <div class="history-version-row" @contextmenu.prevent="openMenu($event, entry.timestamp)">
          <button class="history-version-button history-bubble" @click="$emit('compare', entry.timestamp)"><Clock :size="16" /><span><strong>{{ time(entry.timestamp) }} <Star v-if="metadata[entry.timestamp]?.pinned" :size="13" class="pinned" /><span v-if="metadata[entry.timestamp]?.note" class="version-note">{{ metadata[entry.timestamp].note }}</span></strong><small>{{ summaries.get(entry.timestamp) }}</small><small class="version-preview">{{ preview(entry.content) }}</small></span></button>
          <n-button quaternary circle size="tiny" :aria-label="`${time(entry.timestamp)} 版本操作`" @click="openMenu($event, entry.timestamp)"><MoreHorizontal :size="16" /></n-button>
        </div>
      </template>
    </div>
    <n-button v-if="matched.length > limit" text @click="limit += 60">显示更多版本（{{ visible.length }} / {{ matched.length }}）</n-button>
    <n-dropdown :show="menu.show" :x="menu.x" :y="menu.y" trigger="manual" :options="menuOptions" @select="selectAction" @clickoutside="menu.show = false" />
    <n-modal v-model:show="note.show" preset="card" title="版本备注" :style="{width: 'min(420px,94vw)'}" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy"><n-input v-model:value="note.value" placeholder="例如：提交前、第一次修改" :maxlength="120" show-count :disabled="busy" /><p v-if="actionError" role="alert">{{ actionError }}</p><template #footer><div class="note-actions"><n-button :disabled="busy" @click="note.show = false">取消</n-button><n-button type="primary" :loading="busy" @click="saveNote">保存备注</n-button></div></template></n-modal>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { NButton, NDropdown, NInput, NModal, NSelect, useDialog, useMessage } from 'naive-ui'
import { Clock, Star, MoreHorizontal } from 'lucide-vue-next'
import { invoke } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { historyChangeSummary } from '../utils/historyVersions'
const props = defineProps<{ entries: {timestamp: number; content: string}[]; path: string; libraryRoot: string; loading?: boolean; error?: string }>()
const emit = defineEmits<{ compare: [timestamp: number]; refresh: [] }>()
type Metadata = { pinned: boolean; note: string }
const metadata = ref<Record<string, Metadata>>({}), metadataError = ref(''), query = ref(''), filter = ref('all'), limit = ref(60), busy = ref(false), actionError = ref('')
const menu = reactive({show:false,x:0,y:0,timestamp:0}), note = reactive({show:false,value:'',timestamp:0})
const dialog = useDialog(), message = useMessage()
let generation = 0, disposed = false
const loadMetadata = async () => {
  const token = ++generation, path = props.path, libraryRoot = props.libraryRoot; metadataError.value = ''
  if (!path || !libraryRoot) return
  try { const result = await invoke<Record<string, Metadata>>('get_history_metadata', {libraryRoot,path}); if (!disposed && token === generation) metadata.value = result || {} }
  catch (cause) { if (!disposed && token === generation) metadataError.value = `版本备注暂时无法读取：${String(cause)}` }
}
watch([() => props.path, () => props.libraryRoot], () => { metadata.value = {}; query.value = ''; limit.value = 60; note.show = false; menu.show = false; void loadMetadata() }, {immediate:true})
watch([query,filter], () => { limit.value = 60 })
onBeforeUnmount(() => { disposed = true; ++generation })
const filters = [{label:'全部',value:'all'},{label:'已保留',value:'pinned'}]
const matched = computed(() => { const needle = query.value.trim().toLocaleLowerCase(); return props.entries.filter(e => (filter.value !== 'pinned' || metadata.value[e.timestamp]?.pinned) && (!needle || `${metadata.value[e.timestamp]?.note || ''}\n${e.content}`.toLocaleLowerCase().includes(needle))) })
const visible = computed(() => matched.value.slice(0,limit.value))
const summaries = computed(() => new Map(props.entries.map((e,i) => [e.timestamp, historyChangeSummary(props.entries[i+1]?.content, e.content)])))
const day = (timestamp:number) => new Date(timestamp*1000).toLocaleDateString()
const time = (timestamp:number) => new Date(timestamp*1000).toLocaleTimeString()
const preview = (content:string) => content.slice(0,100).replace(/[\n\r#*`]/g,' ') || '空白内容'
const openMenu = (event:MouseEvent, timestamp:number) => { if (busy.value) return; menu.timestamp = timestamp; menu.x = event.clientX; menu.y = event.clientY; menu.show = true }
const menuOptions = computed(() => [{label:metadata.value[menu.timestamp]?.pinned ? '取消保留' : '保留此版本',key:'pin',disabled:!!metadataError.value || busy.value},{label:'添加或修改备注…',key:'note',disabled:!!metadataError.value || busy.value},{label:'比较与恢复',key:'compare'},{label:'删除此版本…',key:'delete',disabled:metadata.value[menu.timestamp]?.pinned || busy.value}])
const updateMetadata = async (timestamp:number, value:Metadata) => {
  const token = generation, path = props.path, libraryRoot = props.libraryRoot
  busy.value = true; actionError.value = ''
  try { await invoke('set_history_metadata', {libraryRoot,path,timestamp,...value}); if (!disposed && token === generation) { metadata.value = {...metadata.value,[timestamp]:value}; return true } }
  catch (cause) { if (!disposed && token === generation) { actionError.value = `未能保存：${String(cause)}`; message.error(actionError.value) } }
  finally { busy.value = false }
  return false
}
const selectAction = async (key:string) => {
  const timestamp = menu.timestamp, value = metadata.value[timestamp] || {pinned:false,note:''}, path = props.path, libraryRoot = props.libraryRoot, token = generation
  menu.show = false
  if (key === 'compare') emit('compare',timestamp)
  if (key === 'pin') await updateMetadata(timestamp,{...value,pinned:!value.pinned})
  if (key === 'note') { note.timestamp = timestamp; note.value = value.note; actionError.value = ''; note.show = true }
  if (key === 'delete') {
    if (!await confirmAppAction(dialog,{title:'删除此历史版本？',content:'原文件和当前编辑内容不受影响。',positiveText:'删除版本',danger:true})) return
    if (disposed || token !== generation) return
    try { await invoke('delete_history_version',{libraryRoot,path,timestamp}); if (!disposed && token === generation) emit('refresh') } catch (cause) { message.error(`删除未完成：${String(cause)}`) }
  }
}
const saveNote = async () => { if (busy.value) return; if (await updateMetadata(note.timestamp,{pinned:metadata.value[note.timestamp]?.pinned || false,note:note.value})) note.show = false }
</script>
<style scoped>
.history-version-list{display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0;height:100%}.history-search{display:flex;gap:6px}.history-search>.n-select{width:90px;flex:none}.history-version-rows{overflow:auto;min-height:0;flex:1}.history-day{font-size:var(--text-compact);color:var(--theme-text-secondary);padding:8px 2px}.history-version-row{display:flex;align-items:center;border:var(--theme-border);border-radius:var(--theme-radius-sm);background:var(--theme-surface);margin-bottom:7px;transition:background-color var(--motion-fast)}.history-version-row:hover{background:rgba(var(--theme-primary-rgb),.06)}.history-version-button{display:flex;align-items:center;gap:10px;flex:1;min-width:0;border:0;background:transparent;color:var(--theme-text);padding:10px;cursor:pointer;text-align:left}.history-version-button>svg{flex:none;color:var(--theme-primary)}.history-version-button>span{min-width:0;display:grid;gap:3px}.history-version-button strong{display:flex;align-items:center;gap:6px;font-size:var(--text-sm);flex-wrap:wrap}.history-version-button small{font-size:var(--text-compact);color:var(--theme-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-version-row>.n-button{flex:none;margin-right:5px}.pinned{color:var(--theme-primary);fill:rgba(var(--theme-primary-rgb),.15)}.version-note{overflow-wrap:anywhere;font-weight:500}.history-empty{color:var(--theme-text-secondary);text-align:center}.note-actions{display:flex;gap:8px;justify-content:flex-end}[role=alert]{color:var(--status-danger);font-size:var(--text-sm)}
</style>
