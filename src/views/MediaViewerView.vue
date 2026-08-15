<template>
  <section class="media-workspace" data-testid="media-workspace" tabindex="0" @keydown="handleKeydown">
    <WorkspaceTabs v-if="isExternal && !store.isZen && store.tabs.length" />
    <header class="media-toolbar">
      <div class="media-identity">
        <button v-if="isExternal" class="back-button" title="返回资料库" @click="leaveViewer"><ArrowLeftIcon /></button>
        <component :is="isVideo ? VideoIcon : ImageIcon" :size="19" aria-hidden="true" />
        <div>
          <strong :title="fileName">{{ fileName }}</strong>
          <span><template v-if="isExternal">外部文件 · </template>{{ report?.formatLabel || '媒体' }} · {{ report?.streaming ? '按需读取' : '只读预览' }} · {{ editableSource ? '可另存编辑副本' : '不会写回' }}</span>
        </div>
      </div>

      <div v-if="report?.kind === 'image'" class="media-actions" data-command-strip data-horizontal-wheel="always">
        <button title="缩小" :disabled="scale <= 0.1" @click="zoomBy(-0.1)"><ZoomOutIcon /></button>
        <button class="scale-value" title="恢复 100%" @click="setScale(1)">{{ Math.round(scale * 100) }}%</button>
        <button title="放大" :disabled="scale >= 8" @click="zoomBy(0.1)"><ZoomInIcon /></button>
        <span class="toolbar-divider" />
        <button title="适应窗口" :class="{ active: fitToWindow }" @click="fitImage"><ScanIcon /></button>
        <button title="向左旋转" @click="rotateBy(-90)"><RotateCcwIcon /></button>
        <button title="向右旋转" @click="rotateBy(90)"><RotateCwIcon /></button>
        <button v-if="editableSource" title="编辑图片并另存副本" :class="{ active: editOpen }" data-testid="image-edit-toggle" @click="toggleImageEditor"><SlidersIcon /></button>
        <button title="切换透明背景" :class="{ active: checkerboard }" @click="checkerboard = !checkerboard"><GridIcon /></button>
      </div>

      <div v-else-if="report?.kind === 'video'" class="media-actions" data-command-strip data-horizontal-wheel="always">
        <button :title="playing ? '暂停（空格）' : '播放（空格）'" @click="togglePlayback"><PauseIcon v-if="playing" /><PlayIcon v-else /></button>
        <button title="后退 10 秒（←）" @click="seekBy(-10)"><RewindIcon /></button>
        <button title="前进 10 秒（→）" @click="seekBy(10)"><FastForwardIcon /></button>
        <button title="循环播放" :class="{ active: loop }" @click="toggleLoop"><RepeatIcon /></button>
        <button :title="muted ? '恢复声音（M）' : '静音（M）'" :class="{ active: muted }" @click="toggleMute"><VolumeXIcon v-if="muted" /><VolumeIcon v-else /></button>
        <label class="playback-rate" title="播放速度">
          <GaugeIcon />
          <select v-model.number="playbackRate" @change="applyPlaybackRate">
            <option v-for="rate in playbackRates" :key="rate" :value="rate">{{ rate }}×</option>
          </select>
        </label>
        <button v-if="pictureInPictureAvailable" title="画中画" @click="enterPictureInPicture"><PictureInPictureIcon /></button>
        <button title="全屏播放（F）" @click="enterFullscreen"><MaximizeIcon /></button>
      </div>

      <div class="media-global-actions">
        <button title="重新读取" :disabled="loading" @click="load"><RefreshCwIcon :class="{ spinning: loading }" /></button>
        <button title="使用系统默认程序打开" @click="openExternally"><ExternalLinkIcon /></button>
      </div>
    </header>

    <div class="media-content">
    <main ref="stageRef" class="media-stage" :class="{ checkerboard, 'video-stage': isVideo }">
      <div v-if="loading && !mediaUrl" class="media-state">
        <RefreshCwIcon class="spinning" />
        <span>正在准备媒体预览…</span>
      </div>
      <div v-else-if="loadError" class="media-state error">
        <FileWarningIcon />
        <div><strong>无法打开媒体文件</strong><p>{{ loadError }}</p></div>
        <button @click="openExternally">使用系统默认程序打开</button>
      </div>
      <img
        v-else-if="report?.kind === 'image' && mediaUrl"
        ref="imageRef"
        :src="mediaUrl"
        :alt="fileName"
        :style="imageStyle"
        draggable="false"
        @load="onImageLoaded"
        @error="onMediaError"
      />
      <video
        v-else-if="report?.kind === 'video' && mediaUrl"
        ref="videoRef"
        :src="mediaUrl"
        controls
        playsinline
        preload="metadata"
        @loadedmetadata="onVideoLoaded"
        @play="syncVideoState"
        @pause="syncVideoState"
        @timeupdate="syncVideoState"
        @volumechange="syncVideoState"
        @ratechange="syncVideoState"
        @error="onMediaError"
      >当前系统 WebView 无法播放此视频格式。</video>
      <aside v-if="isVideo && report?.playbackSupport === 'system-codec-dependent'" class="codec-notice">
        <FileWarningIcon />
        <span><strong>{{ report.extension.toUpperCase() }} 兼容播放</strong>能否播放取决于 Windows 与 WebView2 已安装的解码器；失败时可直接使用系统播放器。</span>
        <button @click="openExternally">外部打开</button>
      </aside>
      <aside v-if="playbackNotice" class="playback-notice" role="status">
        <FileWarningIcon />
        <span>{{ playbackNotice }}</span>
        <button title="关闭提示" @click="playbackNotice = ''">×</button>
      </aside>
    </main>

    <aside v-if="editOpen && report?.kind === 'image'" class="image-editor" data-testid="image-editor-panel" aria-label="图片基础编辑">
      <header>
        <div><strong>图片基础编辑</strong><span>原图保持不变</span></div>
        <button title="关闭编辑面板" @click="editOpen = false"><XIcon /></button>
      </header>
      <div v-if="editLoading" class="editor-state"><RefreshCwIcon class="spinning" />正在校验图片…</div>
      <template v-else-if="editIdentity">
        <section>
          <label>旋转与翻转</label>
          <div class="transform-buttons">
            <button title="向左旋转 90°" @click="rotateBy(-90)"><RotateCcwIcon />左转</button>
            <button title="向右旋转 90°" @click="rotateBy(90)"><RotateCwIcon />右转</button>
            <button title="水平翻转" :class="{ active: flipHorizontal }" @click="flipHorizontal = !flipHorizontal"><FlipHorizontalIcon />水平</button>
            <button title="垂直翻转" :class="{ active: flipVertical }" @click="flipVertical = !flipVertical"><FlipVerticalIcon />垂直</button>
          </div>
        </section>
        <section>
          <div class="section-heading"><label>输出尺寸</label><button class="text-button" @click="resetOutputSize">使用原尺寸</button></div>
          <div class="dimension-grid">
            <label>宽<input v-model.number="draftWidth" type="number" min="1" :max="editIdentity.maxEdge" @input="onDimensionInput('width')" /></label>
            <span>×</span>
            <label>高<input v-model.number="draftHeight" type="number" min="1" :max="editIdentity.maxEdge" @input="onDimensionInput('height')" /></label>
          </div>
          <label class="ratio-lock"><input v-model="lockAspectRatio" type="checkbox" />锁定宽高比</label>
        </section>
        <section>
          <label for="image-output-format">副本格式</label>
          <select id="image-output-format" v-model="outputExtension">
            <option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option><option value="bmp">BMP</option>
          </select>
          <p>{{ effectiveOutputWidth }} × {{ effectiveOutputHeight }} px · 仅在资料库内另存新文件</p>
        </section>
        <div v-if="editError" class="edit-message error" role="alert">{{ editError }}</div>
        <div v-if="savedCopy" class="edit-message success" role="status">
          <span>副本已保存并复读验证</span>
          <button class="text-button" @click="openSavedCopy">打开副本</button>
        </div>
        <div class="editor-footer">
          <button class="secondary" :disabled="saving" @click="resetImageTransform">重置</button>
          <button class="primary" :disabled="saving || !validOutputDimensions" data-testid="image-save-copy" @click="saveEditedCopy"><SaveIcon />{{ saving ? '正在验证…' : '另存副本' }}</button>
        </div>
      </template>
      <div v-else class="editor-state error">{{ editError || '当前图片暂不支持基础编辑。' }}</div>
    </aside>
    </div>

    <footer v-if="report" class="media-status">
      <div>
        <span>{{ report.mimeType }}</span>
        <span>{{ formatBytes(report.size) }}</span>
        <span v-if="mediaWidth && mediaHeight">{{ mediaWidth }} × {{ mediaHeight }}</span>
        <span v-if="isVideo && duration">{{ formatDuration(currentTime) }} / {{ formatDuration(duration) }}</span>
      </div>
      <span>{{ isVideo ? playbackStatusLabel : editableSource ? '源文件保持只读 · 编辑结果仅另存副本' : '源文件保持只读 · 图片按需解码' }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import {
  ArrowLeft as ArrowLeftIcon, ExternalLink as ExternalLinkIcon, FastForward as FastForwardIcon, FileWarning as FileWarningIcon,
  Gauge as GaugeIcon, Grid3X3 as GridIcon, Image as ImageIcon, Maximize as MaximizeIcon,
  FlipHorizontal2 as FlipHorizontalIcon, FlipVertical2 as FlipVerticalIcon,
  Pause as PauseIcon, PictureInPicture2 as PictureInPictureIcon, Play as PlayIcon,
  RefreshCw as RefreshCwIcon, Repeat2 as RepeatIcon, Rewind as RewindIcon,
  RotateCcw as RotateCcwIcon, RotateCw as RotateCwIcon, Save as SaveIcon, Scan as ScanIcon,
  SlidersHorizontal as SlidersIcon, Video as VideoIcon, X as XIcon,
  Volume2 as VolumeIcon, VolumeX as VolumeXIcon, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { openManagedFile } from '../services/fileNavigation'
import { useAppStore } from '../store/app'

interface MediaInspection {
  path: string
  formatId: 'raster-image' | 'video'
  formatLabel: string
  kind: 'image' | 'video'
  mimeType: string
  size: number
  modified: number
  readOnly: boolean
  extension: string
  playbackSupport: 'native-image' | 'webview-native' | 'system-codec-dependent'
  streaming: boolean
}

interface ImageEditIdentity {
  path: string
  sourceDigest: string
  width: number
  height: number
  editableExtensions: string[]
  maxEdge: number
  saveMode: 'copy-only'
}

interface ImageSavedCopyReport {
  status: 'saved_verified'
  targetPath: string
  outputWidth: number
  outputHeight: number
  outputDigest: string
  sourceUnchanged: boolean
  targetReopened: boolean
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const stageRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const report = ref<MediaInspection>()
const mediaUrl = ref('')
const loading = ref(false)
const loadError = ref('')
const playbackNotice = ref('')
const scale = ref(1)
const rotation = ref(0)
const fitToWindow = ref(true)
const checkerboard = ref(true)
const mediaWidth = ref(0)
const mediaHeight = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const playing = ref(false)
const muted = ref(false)
const loop = ref(false)
const currentTime = ref(0)
const editOpen = ref(false)
const editLoading = ref(false)
const saving = ref(false)
const editError = ref('')
const editIdentity = ref<ImageEditIdentity>()
const savedCopy = ref<ImageSavedCopyReport>()
const flipHorizontal = ref(false)
const flipVertical = ref(false)
const draftWidth = ref(1)
const draftHeight = ref(1)
const resizeEnabled = ref(false)
const lockAspectRatio = ref(true)
const outputExtension = ref('png')
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2]
const editableImageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'bmp']
let loadToken = 0
let fitFrame = 0
let dimensionSyncing = false
let stageResizeObserver: ResizeObserver | undefined

const mediaPath = computed(() => String(route.query.path || store.activeTabId || ''))
const isExternal = computed(() => route.query.external === '1')
const fileName = computed(() => mediaPath.value.split(/[\\/]/).pop() || '未命名媒体')
const isVideo = computed(() => report.value?.kind === 'video')
const editableSource = computed(() => report.value?.kind === 'image'
  && !isExternal.value
  && editableImageExtensions.includes(report.value.extension))
const rotatedSourceDimensions = computed(() => {
  const width = editIdentity.value?.width || mediaWidth.value
  const height = editIdentity.value?.height || mediaHeight.value
  return rotation.value % 180 === 0 ? { width, height } : { width: height, height: width }
})
const validOutputDimensions = computed(() => {
  const width = Number(draftWidth.value)
  const height = Number(draftHeight.value)
  const maxEdge = editIdentity.value?.maxEdge || 16_384
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= maxEdge && height <= maxEdge && width * height <= 50_000_000
})
const effectiveOutputWidth = computed(() => editOpen.value && resizeEnabled.value && validOutputDimensions.value
  ? Number(draftWidth.value)
  : rotatedSourceDimensions.value.width)
const effectiveOutputHeight = computed(() => editOpen.value && resizeEnabled.value && validOutputDimensions.value
  ? Number(draftHeight.value)
  : rotatedSourceDimensions.value.height)
const pictureInPictureAvailable = computed(() => {
  const pipDocument = document as Document & { pictureInPictureEnabled?: boolean }
  const pipVideo = videoRef.value as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }
  return pipDocument.pictureInPictureEnabled === true && typeof pipVideo?.requestPictureInPicture === 'function'
})
const playbackStatusLabel = computed(() => report.value?.playbackSupport === 'system-codec-dependent'
  ? '兼容格式 · 取决于系统解码器 · Range 流式读取'
  : 'WebView 原生格式 · Range 流式读取')
const imageStyle = computed(() => ({
  width: `${Math.max(1, (rotation.value % 180 === 0 ? effectiveOutputWidth.value : effectiveOutputHeight.value) * scale.value)}px`,
  height: `${Math.max(1, (rotation.value % 180 === 0 ? effectiveOutputHeight.value : effectiveOutputWidth.value) * scale.value)}px`,
  transform: `scaleX(${flipHorizontal.value ? -1 : 1}) scaleY(${flipVertical.value ? -1 : 1}) rotate(${rotation.value}deg)`,
}))

const clearMediaUrl = () => {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }
  mediaUrl.value = ''
}
const formatBytes = (value: number) => value < 1024 * 1024
  ? `${(value / 1024).toFixed(1)} KiB`
  : `${(value / 1024 / 1024).toFixed(1)} MiB`
const formatDuration = (value: number) => {
  const total = Math.floor(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}
const setScale = (value: number) => { scale.value = Math.min(8, Math.max(0.1, value)); fitToWindow.value = false }
const zoomBy = (amount: number) => setScale(Number((scale.value + amount).toFixed(2)))
const rotateBy = (amount: number) => {
  const shouldRefit = fitToWindow.value
  rotation.value = (rotation.value + amount + 360) % 360
  if (editOpen.value && !resizeEnabled.value) syncNaturalOutputSize()
  if (shouldRefit) void nextTick(fitImage)
}
const fitImage = () => {
  const stage = stageRef.value
  if (!stage || !mediaWidth.value || !mediaHeight.value) return
  const width = effectiveOutputWidth.value
  const height = effectiveOutputHeight.value
  scale.value = Math.min(1, Math.max(0.1, (stage.clientWidth - 48) / width, 0.1), Math.max(0.1, (stage.clientHeight - 48) / height))
  fitToWindow.value = true
}
const onImageLoaded = () => {
  mediaWidth.value = imageRef.value?.naturalWidth || 0
  mediaHeight.value = imageRef.value?.naturalHeight || 0
  if (fitToWindow.value) fitImage()
}
const onVideoLoaded = () => {
  mediaWidth.value = videoRef.value?.videoWidth || 0
  mediaHeight.value = videoRef.value?.videoHeight || 0
  duration.value = Number.isFinite(videoRef.value?.duration) ? videoRef.value?.duration || 0 : 0
  applyPlaybackRate()
  if (videoRef.value) {
    videoRef.value.loop = loop.value
    syncVideoState()
  }
}
const applyPlaybackRate = () => { if (videoRef.value) videoRef.value.playbackRate = playbackRate.value }
const enterFullscreen = () => { void videoRef.value?.requestFullscreen() }
const togglePlayback = async () => {
  const video = videoRef.value
  if (!video) return
  if (video.paused) await video.play().catch(() => { playbackNotice.value = '暂时无法开始播放，请检查系统解码器，或使用系统播放器打开。' })
  else video.pause()
  syncVideoState()
}
const seekBy = (seconds: number) => {
  const video = videoRef.value
  if (!video || !Number.isFinite(video.duration)) return
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds))
  syncVideoState()
}
const toggleMute = () => {
  if (!videoRef.value) return
  videoRef.value.muted = !videoRef.value.muted
  syncVideoState()
}
const toggleLoop = () => {
  loop.value = !loop.value
  if (videoRef.value) videoRef.value.loop = loop.value
}
const syncVideoState = () => {
  const video = videoRef.value
  if (!video) return
  playing.value = !video.paused && !video.ended
  muted.value = video.muted || video.volume === 0
  currentTime.value = Number.isFinite(video.currentTime) ? video.currentTime : 0
  playbackRate.value = video.playbackRate
}
const enterPictureInPicture = async () => {
  const pipDocument = document as Document & { pictureInPictureElement?: Element; exitPictureInPicture?: () => Promise<void> }
  const video = videoRef.value as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }
  try {
    if (pipDocument.pictureInPictureElement) await pipDocument.exitPictureInPicture?.()
    else await video?.requestPictureInPicture?.()
  } catch {
    playbackNotice.value = '当前 WebView 暂时无法进入画中画。'
  }
}
const onMediaError = () => { loadError.value = isVideo.value ? '当前系统缺少该视频的编解码器，请使用系统播放器打开。' : '图片数据无效或当前系统不支持该编码。' }
const openExternally = () => { if (mediaPath.value) void openPath(mediaPath.value) }
const leaveViewer = () => router.push({ name: 'LibraryMode' })

const syncNaturalOutputSize = () => {
  draftWidth.value = rotatedSourceDimensions.value.width || 1
  draftHeight.value = rotatedSourceDimensions.value.height || 1
}
const resetOutputSize = () => {
  resizeEnabled.value = false
  syncNaturalOutputSize()
  if (fitToWindow.value) void nextTick(fitImage)
}
const resetImageTransform = () => {
  rotation.value = 0
  flipHorizontal.value = false
  flipVertical.value = false
  resizeEnabled.value = false
  savedCopy.value = undefined
  editError.value = ''
  syncNaturalOutputSize()
  void nextTick(fitImage)
}
const onDimensionInput = (axis: 'width' | 'height') => {
  if (dimensionSyncing) return
  resizeEnabled.value = true
  savedCopy.value = undefined
  if (!lockAspectRatio.value) return
  const natural = rotatedSourceDimensions.value
  if (!natural.width || !natural.height) return
  dimensionSyncing = true
  if (axis === 'width' && Number(draftWidth.value) > 0) {
    draftHeight.value = Math.max(1, Math.round(Number(draftWidth.value) * natural.height / natural.width))
  } else if (axis === 'height' && Number(draftHeight.value) > 0) {
    draftWidth.value = Math.max(1, Math.round(Number(draftHeight.value) * natural.width / natural.height))
  }
  dimensionSyncing = false
  if (fitToWindow.value) void nextTick(fitImage)
}
const toggleImageEditor = async () => {
  if (editOpen.value) { editOpen.value = false; return }
  if (!editableSource.value || editLoading.value) return
  editOpen.value = true
  editLoading.value = true
  editError.value = ''
  savedCopy.value = undefined
  try {
    editIdentity.value = await invoke<ImageEditIdentity>('inspect_image_edit_source', {
      libraryRoot: store.libraryPath,
      path: mediaPath.value,
    })
    outputExtension.value = report.value?.extension === 'jpeg' ? 'jpg' : report.value?.extension || 'png'
    resetImageTransform()
  } catch (error) {
    editIdentity.value = undefined
    editError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    editLoading.value = false
  }
}
const editedCopyDefaultPath = () => mediaPath.value.replace(/(\.[^./\\]+)?$/, `-edited.${outputExtension.value}`)
const saveEditedCopy = async () => {
  if (!editIdentity.value || !validOutputDimensions.value || saving.value) return
  editError.value = ''
  savedCopy.value = undefined
  const targetPath = await save({
    title: '另存图片编辑副本',
    defaultPath: editedCopyDefaultPath(),
    filters: [{ name: outputExtension.value === 'jpg' ? 'JPEG 图片' : `${outputExtension.value.toUpperCase()} 图片`, extensions: [outputExtension.value] }],
  })
  if (!targetPath) return
  saving.value = true
  try {
    const saved = await invoke<ImageSavedCopyReport>('save_image_transform_copy', {
      libraryRoot: store.libraryPath,
      sourcePath: mediaPath.value,
      targetPath,
      expectedSourceDigest: editIdentity.value.sourceDigest,
      transform: {
        quarterTurns: Math.round(rotation.value / 90) % 4,
        flipHorizontal: flipHorizontal.value,
        flipVertical: flipVertical.value,
        width: resizeEnabled.value ? Number(draftWidth.value) : null,
        height: resizeEnabled.value ? Number(draftHeight.value) : null,
      },
    })
    if (saved.status !== 'saved_verified' || !saved.sourceUnchanged || !saved.targetReopened) throw new Error('图片副本没有完成可靠保存复核')
    savedCopy.value = saved
  } catch (error) {
    editError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    saving.value = false
  }
}
const openSavedCopy = () => {
  if (savedCopy.value?.targetPath) void openManagedFile(router, savedCopy.value.targetPath)
}

const load = async () => {
  if (!mediaPath.value) return
  const token = ++loadToken
  loading.value = true
  loadError.value = ''
  playbackNotice.value = ''
  mediaWidth.value = 0
  mediaHeight.value = 0
  duration.value = 0
  currentTime.value = 0
  playing.value = false
  rotation.value = 0
  editOpen.value = false
  editIdentity.value = undefined
  editError.value = ''
  savedCopy.value = undefined
  flipHorizontal.value = false
  flipVertical.value = false
  fitToWindow.value = true
  clearMediaUrl()
  try {
    const inspected = await invoke<MediaInspection>(isExternal.value ? 'inspect_external_media_file' : 'inspect_media_file', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: mediaPath.value,
    })
    if (token !== loadToken) return
    report.value = inspected
    store.addTab({
      id: mediaPath.value,
      title: fileName.value,
      path: mediaPath.value,
      isDirty: false,
      external: isExternal.value,
    })
    mediaUrl.value = convertFileSrc(inspected.path)
    await nextTick()
  } catch (error) {
    if (token !== loadToken) return
    report.value = undefined
    loadError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    if (token === loadToken) loading.value = false
  }
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (report.value?.kind === 'image') {
    if (event.key === '+' || event.key === '=') zoomBy(0.1)
    else if (event.key === '-') zoomBy(-0.1)
    else if (event.key === '0') fitImage()
    else if (event.key.toLowerCase() === 'r') rotateBy(event.shiftKey ? -90 : 90)
    else return
  } else if (report.value?.kind === 'video') {
    if (event.key === ' ') void togglePlayback()
    else if (event.key === 'ArrowLeft') seekBy(-10)
    else if (event.key === 'ArrowRight') seekBy(10)
    else if (event.key.toLowerCase() === 'm') toggleMute()
    else if (event.key.toLowerCase() === 'l') toggleLoop()
    else if (event.key.toLowerCase() === 'f') enterFullscreen()
    else return
  } else return
  event.preventDefault()
}

watch([mediaPath, isExternal], load, { immediate: true })
onMounted(() => {
  if (!stageRef.value) return
  stageResizeObserver = new ResizeObserver(() => {
    if (report.value?.kind !== 'image' || !fitToWindow.value) return
    cancelAnimationFrame(fitFrame)
    fitFrame = requestAnimationFrame(fitImage)
  })
  stageResizeObserver.observe(stageRef.value)
})
onBeforeUnmount(() => {
  loadToken += 1
  cancelAnimationFrame(fitFrame)
  stageResizeObserver?.disconnect()
  clearMediaUrl()
})
</script>

<style scoped>
.media-workspace { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; color: var(--theme-text); background: var(--theme-bg); container-type: inline-size; outline: none; }
.media-toolbar { min-height: 52px; flex: none; display: grid; grid-template-columns: minmax(150px,1fr) auto minmax(70px,1fr); align-items: center; gap: 10px; padding: 6px 12px; box-sizing: border-box; border-bottom: var(--theme-border); background: var(--theme-card); }
.media-identity { min-width: 0; display: flex; align-items: center; gap: 9px; }.media-identity > svg { flex: none; color: var(--theme-primary); }.media-identity div { min-width: 0; display: grid; gap: 1px; }.media-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.media-identity span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.back-button { flex: none; }
.media-actions,.media-global-actions { display: flex; align-items: center; gap: 4px; }.media-actions { min-width: 0; overflow-x: auto; scrollbar-width: none; }.media-actions::-webkit-scrollbar { display: none; }.media-global-actions { justify-self: end; }
button,.playback-rate { height: 30px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); }.media-toolbar button { width: 30px; padding: 0; cursor: pointer; }.media-toolbar button svg,.playback-rate svg { width: 15px; height: 15px; }.media-toolbar button:hover,.media-toolbar button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.3); background: rgba(var(--theme-primary-rgb),.08); }.media-toolbar button:disabled { opacity: .4; cursor: default; }.media-toolbar .scale-value { width: 54px; font-size: var(--text-compact); font-variant-numeric: tabular-nums; }.toolbar-divider { width: 1px; height: 20px; margin: 0 3px; background: var(--workspace-border-color); }
.playback-rate { gap: 5px; padding: 0 7px; }.playback-rate select { border: 0; outline: 0; color: inherit; background: transparent; font-size: var(--text-compact); }
.media-content { min-width: 0; min-height: 0; flex: 1; display: flex; }
.media-stage { min-width: 0; min-height: 0; flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; overflow: auto; box-sizing: border-box; background: color-mix(in srgb, var(--theme-surface) 96%, #7f8a99); }.media-stage.checkerboard { background-color: var(--theme-surface); background-image: linear-gradient(45deg,rgba(127,138,153,.13) 25%,transparent 25%),linear-gradient(-45deg,rgba(127,138,153,.13) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(127,138,153,.13) 75%),linear-gradient(-45deg,transparent 75%,rgba(127,138,153,.13) 75%); background-size: 24px 24px; background-position: 0 0,0 12px,12px -12px,-12px 0; }.media-stage.video-stage { background: #101318; }.media-stage img { max-width: none; max-height: none; flex: none; object-fit: contain; transform-origin: center; image-rendering: auto; filter: drop-shadow(0 8px 22px rgba(0,0,0,.18)); }.media-stage video { width: min(100%, 1180px); max-height: 100%; border-radius: 6px; background: #000; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
.media-stage { position: relative; }
.codec-notice,.playback-notice { position: absolute; z-index: 2; left: 16px; right: 16px; bottom: 14px; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 9px 11px; border: 1px solid rgba(255,255,255,.15); border-radius: 6px; color: #eaf0f7; background: rgba(20,24,31,.92); box-shadow: 0 8px 24px rgba(0,0,0,.22); backdrop-filter: blur(10px); font-size: var(--text-compact); }
.codec-notice > svg,.playback-notice > svg { width: 17px; height: 17px; flex: none; color: #f6c453; }.codec-notice span,.playback-notice span { min-width: 0; flex: 1; }.codec-notice strong { display: block; margin-bottom: 2px; color: #fff; }.codec-notice button,.playback-notice button { width: auto; padding: 0 10px; cursor: pointer; color: #fff; border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.08); }.playback-notice { bottom: 70px; left: 50%; right: auto; width: min(520px,calc(100% - 32px)); transform: translateX(-50%); }
.media-state { display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--theme-text-secondary); }.media-state.error { max-width: 560px; flex-wrap: wrap; color: var(--theme-danger); }.media-state.error div { min-width: 0; }.media-state p { margin: 4px 0 0; color: var(--theme-text-secondary); line-height: 1.5; }.media-state button { width: auto; margin-top: 12px; padding: 0 12px; cursor: pointer; }
.image-editor { width: 286px; min-width: 286px; min-height: 0; overflow-y: auto; padding: 12px; box-sizing: border-box; border-left: var(--theme-border); background: var(--theme-card); font-size: var(--text-compact); }
.image-editor > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 10px; border-bottom: var(--theme-border); }.image-editor > header div { display: grid; gap: 2px; }.image-editor > header strong { font-size: 13px; }.image-editor > header span,.image-editor section p { color: var(--theme-text-secondary); }.image-editor > header button { width: 28px; padding: 0; cursor: pointer; }.image-editor > header svg { width: 14px; }
.image-editor section { display: grid; gap: 8px; padding: 12px 0; border-bottom: var(--theme-border); }.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.image-editor label { color: var(--theme-text-secondary); }.transform-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.transform-buttons button,.editor-footer button { width: auto; gap: 5px; padding: 0 8px; cursor: pointer; font-size: var(--text-compact); }.transform-buttons svg,.editor-footer svg { width: 14px; height: 14px; }
.dimension-grid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 6px; }.dimension-grid label { display: grid; gap: 4px; }.dimension-grid input,.image-editor select { width: 100%; height: 30px; box-sizing: border-box; padding: 0 7px; border: 1px solid var(--workspace-border-color); border-radius: 6px; outline: none; color: var(--theme-text); background: var(--workspace-control-bg); font: inherit; }.dimension-grid input:focus,.image-editor select:focus { border-color: rgba(var(--theme-primary-rgb),.55); }.dimension-grid > span { height: 30px; display: flex; align-items: center; color: var(--theme-text-secondary); }.ratio-lock { display: flex; align-items: center; gap: 6px; }.ratio-lock input { margin: 0; accent-color: var(--theme-primary); }.image-editor section p { margin: 0; line-height: 1.5; }
.text-button { width: auto; height: auto; padding: 0; border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; font: inherit; }.edit-message { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 8px; border-radius: 6px; line-height: 1.4; }.edit-message.error,.editor-state.error { color: var(--theme-danger); background: color-mix(in srgb,var(--theme-danger) 8%,transparent); }.edit-message.success { color: var(--theme-success); background: color-mix(in srgb,var(--theme-success) 8%,transparent); }.editor-state { display: flex; align-items: center; gap: 7px; padding: 16px 2px; color: var(--theme-text-secondary); }.editor-state svg { width: 15px; }
.editor-footer { display: flex; justify-content: flex-end; gap: 7px; padding-top: 12px; }.editor-footer .primary { color: var(--theme-primary-contrast); border-color: var(--theme-primary); background: var(--theme-primary); }.editor-footer button:disabled { opacity: .45; cursor: default; }
.media-status { min-height: 32px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-top: var(--theme-border); color: var(--theme-text-secondary); background: var(--theme-card); font-size: var(--text-compact); }.media-status div { min-width: 0; display: flex; gap: 14px; overflow: hidden; }.media-status span { white-space: nowrap; }
.spinning { animation: spin .9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
@container (max-width: 760px) { .media-toolbar { grid-template-columns: minmax(110px,1fr) auto; }.media-actions { grid-row: 2; grid-column: 1 / -1; justify-self: stretch; }.media-global-actions { grid-column: 2; grid-row: 1; }.media-content { flex-direction: column; }.image-editor { width: 100%; min-width: 0; max-height: 46%; border-left: 0; border-top: var(--theme-border); }.media-status > span { display: none; } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
