<template>
  <n-modal :show="true" preset="card" title="核对来源" class="reference-repair-dialog" :style="{ width: 'min(620px, calc(100vw - 28px))' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="value => { if (!value && !busy) $emit('close') }">
    <div class="source-repair-body">
      <section><small>原来源</small><strong>{{ relative(source.path) }}</strong><p v-if="original" :class="original.status">{{ original.message }}<template v-if="located"> · {{ original.locationMessage }}</template></p><p v-else>正在核对原来源…</p><button v-if="original" type="button" :disabled="busy" @click="reveal">在文件管理器中查看</button></section>
      <template v-if="!done">
        <label>选择正确的文件<RelationFilePicker v-model:value="replacement" :library-root="libraryRoot" label="修复后的来源文件" :disabled="busy" /></label>
        <fieldset v-if="located"><legend>原来的阅读位置</legend><label class="choice"><input v-model="position" type="radio" value="preserve" :disabled="busy" />保留并核对原位置</label><label class="choice"><input v-model="position" type="radio" value="file" :disabled="busy" />只关联文件，取消原定位</label><label v-if="position === 'preserve' && /\.pdf$/i.test(replacement)">页码<input v-model="page" type="number" min="1" max="100000" aria-label="修复后的页码" :disabled="busy" /><small v-if="source.annotationId">更改页码会取消原批注定位。</small></label></fieldset>
        <section v-if="checked" class="repair-impact"><small>修复预览</small><strong>{{ relative(source.path) }} → {{ relative(target.path) }}</strong><p>{{ checked.message }} · {{ checked.locationMessage }}</p><p>{{ effect }}</p><p v-if="relationLabel">{{ relationLabel }}</p></section>
        <p v-else class="repair-status" role="status">{{ busy ? '正在核对来源…' : '选择文件后会核对可读性和原定位。' }}</p>
      </template>
      <section v-else role="status"><strong>来源已更新</strong><p>{{ effect }}</p><button type="button" @click="$emit('open', done)">打开修复后的来源</button></section>
      <p v-if="!pageValid" role="alert">请输入 1–100000 内的有效页码，或选择只关联文件。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="repair-actions"><button type="button" :disabled="busy" @click="$emit('close')">{{ done ? '完成' : '取消' }}</button><button v-if="!done" type="button" :disabled="busy || !replacement" @click="check">重新核对</button><button v-if="!done" type="button" class="primary" :disabled="busy || !ready || !changed" @click="apply">确认修复</button></div>
    </div>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import RelationFilePicker from './RelationFilePicker.vue'
import { useAppStore } from '../store/app'
import { sameWorkspacePath } from '../utils/savedCollections'
import { searchResultPath } from '../utils/searchResultPath'
import { sourceCheckArgs, type ReferenceTarget, type SourceCheck } from '../services/referenceRepair'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ libraryRoot: string; source: ReferenceTarget; effect: string; relationLabel?: string; commit: (next: ReferenceTarget, signature: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; open: [target: ReferenceTarget] }>()
const store = useAppStore(), ownerRoot = props.libraryRoot, originalSource = { ...props.source }
const original = ref<SourceCheck | null>(null), checked = ref<SourceCheck | null>(null), replacement = ref(props.source.path), position = ref('preserve'), page = ref(String(props.source.page ?? '')), busy = ref(false), error = ref(''), done = ref<ReferenceTarget | null>(null)
const located = Boolean(originalSource.page || originalSource.annotationId || originalSource.quote || originalSource.sourceDigest)
const relative = (path: string) => searchResultPath(path, ownerRoot)
const target = computed<ReferenceTarget>(() => { if (position.value === 'file') return { path: replacement.value }; const next = { ...originalSource, path: replacement.value }; if (/\.pdf$/i.test(replacement.value) && located) { const n = Number(page.value); next.page = Number.isInteger(n) && n > 0 && n <= 100000 ? n : undefined; if (page.value !== String(originalSource.page ?? '')) delete next.annotationId }; return next })
const fingerprint = () => JSON.stringify(target.value)
const changed = computed(() => !sameWorkspacePath(target.value.path, originalSource.path) || JSON.stringify({ ...target.value, path: '' }) !== JSON.stringify({ ...originalSource, path: '' }))
const pageValid = computed(() => position.value === 'file' || !/\.pdf$/i.test(replacement.value) || (!originalSource.page && !page.value) || (Number.isInteger(Number(page.value)) && Number(page.value) > 0 && Number(page.value) <= 100000))
const ready = computed(() => pageValid.value && checked.value?.status === 'available' && ['none', 'verified'].includes(checked.value.locationStatus))
let generation = 0, disposed = false, timer: ReturnType<typeof setTimeout> | undefined
const current = () => !disposed && store.libraryPath === ownerRoot && props.libraryRoot === ownerRoot
async function check() { if (busy.value || !replacement.value || !current() || done.value) return; const token = ++generation, before = fingerprint(); busy.value = true; checked.value = null; error.value = ''; try { const response = await invoke<SourceCheck>('inspect_reference_source', sourceCheckArgs(ownerRoot, target.value)); if (current() && token === generation && before === fingerprint()) checked.value = response } catch (cause) { if (current() && token === generation) error.value = '尚未完成核对：' + String(cause) } finally { busy.value = false } }
async function apply() { if (!ready.value || !checked.value || busy.value || !changed.value || !current()) return; const next = { ...target.value }, signature = checked.value.signature; busy.value = true; error.value = ''; const end = beginWindowSave(); try { const live = await invoke<SourceCheck>('inspect_reference_source', sourceCheckArgs(ownerRoot, next)); if (!current()) return; if (live.status !== 'available' || !['none','verified'].includes(live.locationStatus) || live.signature !== signature) { checked.value = null; throw Error('来源已变化，请重新核对；尚未修改引用') }; await props.commit(next, signature); if (current()) done.value = next } catch (cause) { if (current()) error.value = '修复未完成，原记录和草稿已保留：' + String(cause) } finally { busy.value = false; end() } }
async function reveal() { if (!original.value) return; try { await revealItemInDir(original.value.status === 'available' ? original.value.path : original.value.parent) } catch (cause) { error.value = '暂时无法显示所在位置：' + String(cause) } }
watch(fingerprint, () => { ++generation; checked.value = null; error.value = ''; clearTimeout(timer); timer = setTimeout(() => { void check() }, 400) })
watch(() => store.libraryPath, () => { ++generation; if (!busy.value) emit('close') })
onMounted(async () => { try { const response = await invoke<SourceCheck>('inspect_reference_source', sourceCheckArgs(ownerRoot, originalSource)); if (current()) original.value = response } catch (cause) { if (current()) error.value = '原来源尚未核对：' + String(cause) }; if (current()) void check() })
onBeforeUnmount(() => { disposed = true; ++generation; clearTimeout(timer) })
</script>
<style scoped>
.source-repair-body { display:grid; gap:14px; max-height:70vh; overflow:auto; color:var(--theme-text); font-size:var(--text-sm); }section,fieldset { display:grid; gap:6px; padding:12px; margin:0; border:var(--theme-border); border-radius:var(--theme-radius-sm); background:var(--theme-surface); min-width:0; }strong,p { overflow-wrap:anywhere; }p { margin:0; line-height:1.6; }small,.repair-status { color:var(--theme-text-secondary); font-size:var(--text-compact); }label { display:grid; gap:7px; min-width:0; }.choice { display:flex; align-items:center; gap:7px; }.repair-actions { display:flex; justify-content:end; gap:8px; flex-wrap:wrap; }button,input[type=number] { font:inherit; color:var(--theme-text); background:var(--theme-surface); border:var(--theme-border); border-radius:var(--theme-radius-sm); padding:7px 10px; }button { cursor:pointer; }button:disabled { opacity:.5; cursor:default; }.primary { background:var(--theme-primary); color:var(--workspace-on-accent,var(--theme-bg)); }[role=alert],.missing,.unreadable { color:var(--status-danger,var(--theme-text)); }button:focus-visible,input:focus-visible { outline:2px solid var(--theme-primary); outline-offset:2px; }.repair-impact { background:rgba(var(--theme-primary-rgb),.05); }input[type=number] { max-width:100%; box-sizing:border-box; }
</style>
