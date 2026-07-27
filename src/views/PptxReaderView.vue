<template>
  <div class="pptx-workspace">
    <header class="pptx-toolbar">
      <div class="document-identity">
        <PresentationIcon :size="18" />
        <div>
          <strong :title="pptxPath">{{ fileName }}</strong>
          <span>结构化只读 · 原文件不写回</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <label class="pptx-search">
          <SearchIcon :size="14" />
          <input
            v-model="searchQuery"
            aria-label="搜索 PPTX 文本与备注"
            placeholder="搜索演示文稿"
            @keydown.enter.prevent="moveSearch(1)"
          >
          <span v-if="matches.length">{{ activeMatch + 1 }}/{{ matches.length }}</span>
        </label>
        <button type="button" :disabled="!matches.length" title="上一个结果" @click="moveSearch(-1)">
          <ChevronUpIcon :size="16" />
        </button>
        <button type="button" :disabled="!matches.length" title="下一个结果" @click="moveSearch(1)">
          <ChevronDownIcon :size="16" />
        </button>
        <button type="button" :disabled="!report" title="放映" @click="presenting = true">
          <PlayIcon :size="16" />
          <span>放映</span>
        </button>
        <button
          type="button"
          :disabled="!report || baselineLoading"
          :class="{ active: Boolean(editBaseline) }"
          title="验证隔离编辑基线"
          @click="prepareEditBaseline"
        >
          <LockKeyholeIcon :size="16" :class="{ spin: baselineLoading }" />
          <span>{{ baselineLoading ? '验证中' : '编辑准备' }}</span>
        </button>
        <button type="button" :class="{ active: showDetails }" title="备注与兼容画像" @click="showDetails = !showDetails">
          <PanelRightIcon :size="16" />
        </button>
        <button type="button" :disabled="loading" title="重新读取" @click="loadPresentation">
          <RefreshCwIcon :size="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="pptx-state">
      <LoaderCircleIcon :size="24" class="spin" />
      <span>正在安全解析演示文稿…</span>
    </div>
    <div v-else-if="loadError" class="pptx-state error" role="alert">
      <AlertTriangleIcon :size="24" />
      <div>
        <strong>无法读取 PPTX</strong>
        <p>{{ loadError }}</p>
      </div>
    </div>
    <div v-else-if="report" class="pptx-layout" :class="{ 'details-open': showDetails }">
      <aside ref="slideStripRef" class="slide-strip" aria-label="幻灯片缩略图">
        <button
          v-for="(slide, index) in report.model.slides"
          :key="slide.id"
          type="button"
          :data-slide-id="slide.id"
          :data-slide-index="index"
          :class="{ active: index === activeSlideIndex, hit: matchedSlideIndexes.has(index), 'route-target': index === routeTargetSlideIndex }"
          @click="selectSlide(index)"
        >
          <span class="slide-number">{{ index + 1 }}</span>
          <div class="thumbnail" :style="{ aspectRatio: slideRatio, backgroundColor: slide.backgroundColor }">
            <div
              v-for="object in slide.objects"
              :key="`thumb-${object.id || object.name}`"
              class="slide-object"
              :class="[object.kind, { 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
              :style="objectStyle(object)"
            >
              <PptxObjectContent
                :object="object"
                :media-src="mediaByPart[object.mediaPart || '']"
                compact
              />
            </div>
            <small v-if="!slide.objects.length">{{ slide.title }}</small>
          </div>
          <EyeOffIcon v-if="slide.hidden" :size="12" class="hidden-mark" />
        </button>
      </aside>

      <main class="pptx-stage">
        <div
          v-if="activeSlide"
          class="slide-canvas"
          :class="{ 'route-target-slide': activeSlideIndex === routeTargetSlideIndex }"
          :style="slideStyle(activeSlide)"
          :aria-label="`幻灯片 ${activeSlideIndex + 1}：${activeSlide.title}`"
        >
          <template v-for="object in activeSlide.objects" :key="object.id || object.name">
            <div
              class="slide-object"
              :data-object-id="object.id"
              :class="[object.kind, { 'search-hit': matchedObjectIds.has(object.id), 'route-target-object': routeTargetObjectId === object.id, 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
              :style="objectStyle(object)"
              :title="object.altText || object.name"
            >
              <PptxObjectContent
                :object="object"
                :media-src="mediaByPart[object.mediaPart || '']"
              />
            </div>
          </template>
          <div v-if="!activeSlide.objects.length" class="empty-slide">空白幻灯片</div>
        </div>
      </main>

      <aside v-if="showDetails" class="pptx-details">
        <section class="edit-baseline">
          <header>
            <LockKeyholeIcon :size="15" />
            <strong>编辑安全基线</strong>
            <span v-if="editBaseline" class="verified-badge">已验证</span>
          </header>
          <template v-if="editBaseline">
            <dl>
              <div><dt>隔离方式</dt><dd>内存 + 临时副本</dd></div>
              <div><dt>OOXML 部件</dt><dd>{{ editBaseline.partCount }}</dd></div>
              <div><dt>候选编辑部件</dt><dd>{{ editBaseline.editableCandidateParts.length }}</dd></div>
              <div><dt>原样保全部件</dt><dd>{{ editBaseline.unchangedPartCount }}</dd></div>
              <div><dt>临时副本复读</dt><dd>{{ editBaseline.temporaryCopyReopenVerified ? '通过' : '未通过' }}</dd></div>
              <div><dt>源文件写入</dt><dd>{{ editBaseline.writesUserFile ? '是' : '否' }}</dd></div>
            </dl>
            <p class="baseline-digest" :title="editBaseline.sourcePackageDigest">
              SHA-256 · {{ editBaseline.sourcePackageDigest.slice(0, 16) }}…
            </p>
            <p class="muted">C4A 仅建立保护基线、不写入当前文件；该基线已复用到 C4B 文本与 C4C 样式/替代文本隔离预览。</p>
          </template>
          <p v-else-if="baselineError" class="baseline-error">{{ baselineError }}</p>
          <p v-else class="muted">尚未启动编辑。验证后仍保持只读，不会写入当前 PPTX。</p>
        </section>
        <section v-if="editBaseline" class="isolated-text-patch">
          <header>
            <PenLineIcon :size="15" />
            <strong>C4B 隔离文本预览</strong>
            <span v-if="textPatchReport" class="verified-badge">已通过</span>
          </header>
          <template v-if="safeEditTargets.length">
            <label>
              <span>安全编辑目标</span>
              <select v-model="selectedEditTargetId">
                <option v-for="target in safeEditTargets" :key="target.id" :value="target.id">
                  幻灯片 {{ target.slideNumber }} · {{ target.kind === 'speaker-notes' ? '备注' : target.objectName }}
                </option>
              </select>
            </label>
            <label>
              <span>隔离替换文本</span>
              <textarea
                v-model="replacementText"
                rows="3"
                maxlength="32767"
                placeholder="输入单行替换文本"
                @input="clearTextPatchResult"
              />
            </label>
            <div class="patch-actions">
              <small>{{ replacementText.length }}/32767 · 不写入当前文件</small>
              <button
                type="button"
                :disabled="textPatchLoading || !replacementText.trim() || /[\r\n\t]/.test(replacementText)"
                @click="previewTextPatch"
              >
                <LoaderCircleIcon v-if="textPatchLoading" :size="13" class="spin" />
                <ShieldCheckIcon v-else :size="13" />
                {{ textPatchLoading ? '验证中' : '验证隔离补丁' }}
              </button>
            </div>
            <p v-if="textPatchError" class="baseline-error">{{ textPatchError }}</p>
            <dl v-if="textPatchReport" class="patch-report">
              <div><dt>变化部件</dt><dd>{{ textPatchReport.changedParts.length }}</dd></div>
              <div><dt>其余部件保全</dt><dd>{{ textPatchReport.unchangedPartCount }}</dd></div>
              <div><dt>语义复读</dt><dd>{{ textPatchReport.semanticReparseVerified ? '通过' : '未通过' }}</dd></div>
              <div><dt>源文件写入</dt><dd>{{ textPatchReport.writesUserFile ? '是' : '否' }}</dd></div>
            </dl>
            <p v-if="textPatchReport" class="baseline-digest" :title="textPatchReport.targetPart">
              单部件白名单 · {{ textPatchReport.targetPart }}
            </p>
          </template>
          <p v-else class="muted">此演示文稿没有符合 C4B 保守规则的单文本目标。</p>
        </section>
        <section v-if="editBaseline" class="isolated-metadata-patch" data-testid="c4c-patch-panel">
          <header>
            <PaletteIcon :size="15" />
            <strong>C4C 样式与无障碍预览</strong>
            <span v-if="stylePatchReport || altTextPatchReport" class="verified-badge">已通过</span>
          </header>
          <div class="c4c-block">
            <h4>单运行字符样式</h4>
            <template v-if="safeStyleTargets.length">
              <label>
                <span>形状文本目标</span>
                <select v-model="selectedStyleTargetId" data-testid="c4c-style-target">
                  <option v-for="target in safeStyleTargets" :key="target.id" :value="target.id">
                    幻灯片 {{ target.slideNumber }} · {{ target.kind === 'shape-text-style' ? '形状' : '文本框' }} · {{ target.objectName }}
                  </option>
                </select>
              </label>
              <div class="style-grid">
                <label>
                  <span>字号（pt）</span>
                  <input v-model.number="styleFontSizePt" data-testid="c4c-font-size" type="number" min="1" max="4000" step="0.5">
                </label>
                <label>
                  <span>字体</span>
                  <input v-model="styleFontFamily" data-testid="c4c-font-family" maxlength="100">
                </label>
                <label>
                  <span>颜色</span>
                  <input v-model="styleColor" data-testid="c4c-color" type="color">
                </label>
                <label>
                  <span>对齐</span>
                  <select v-model="styleAlignment" data-testid="c4c-alignment">
                    <option value="left">左对齐</option>
                    <option value="center">居中</option>
                    <option value="right">右对齐</option>
                    <option value="justify">两端对齐</option>
                  </select>
                </label>
              </div>
              <div class="style-toggles">
                <label><input v-model="styleBold" type="checkbox">粗体</label>
                <label><input v-model="styleItalic" type="checkbox">斜体</label>
                <label><input v-model="styleUnderline" type="checkbox">下划线</label>
              </div>
              <div class="patch-actions">
                <small>单运行、单段落 · 不写入当前文件</small>
                <button
                  type="button"
                  data-testid="c4c-style-preview"
                  :disabled="stylePatchLoading || !validStyleForm"
                  @click="previewStylePatch"
                >
                  <LoaderCircleIcon v-if="stylePatchLoading" :size="13" class="spin" />
                  <ShieldCheckIcon v-else :size="13" />
                  {{ stylePatchLoading ? '验证中' : '验证样式补丁' }}
                </button>
              </div>
              <p v-if="stylePatchError" class="baseline-error">{{ stylePatchError }}</p>
              <dl v-if="stylePatchReport" class="patch-report style-patch-report">
                <div><dt>目标类型</dt><dd>{{ selectedStyleTarget?.kind === 'shape-text-style' ? '形状文本' : '文本框' }}</dd></div>
                <div><dt>变化部件</dt><dd>{{ stylePatchReport.changedParts.length }}</dd></div>
                <div><dt>语义复读</dt><dd>{{ stylePatchReport.semanticReparseVerified ? '通过' : '未通过' }}</dd></div>
                <div><dt>源文件写入</dt><dd>{{ stylePatchReport.writesUserFile ? '是' : '否' }}</dd></div>
              </dl>
            </template>
            <p v-else class="muted">没有符合单运行、单段落规则的安全样式目标。</p>
          </div>
          <div class="c4c-block">
            <h4><ImageIcon :size="13" /> 图片替代文本</h4>
            <template v-if="safeAltTextTargets.length">
              <label>
                <span>内嵌图片目标</span>
                <select v-model="selectedAltTextTargetId" data-testid="c4c-alt-target">
                  <option v-for="target in safeAltTextTargets" :key="target.id" :value="target.id">
                    幻灯片 {{ target.slideNumber }} · {{ target.objectName }}
                  </option>
                </select>
              </label>
              <label>
                <span>替代文本（留空可清除）</span>
                <textarea v-model="altTextValue" data-testid="c4c-alt-text" rows="3" maxlength="1024" />
              </label>
              <div class="patch-actions">
                <small>{{ altTextValue.length }}/1024 · 图片字节保持不变</small>
                <button
                  type="button"
                  data-testid="c4c-alt-preview"
                  :disabled="altTextPatchLoading || altTextValue === selectedAltTextTarget?.altText"
                  @click="previewAltTextPatch"
                >
                  <LoaderCircleIcon v-if="altTextPatchLoading" :size="13" class="spin" />
                  <ShieldCheckIcon v-else :size="13" />
                  {{ altTextPatchLoading ? '验证中' : '验证替代文本' }}
                </button>
              </div>
              <p v-if="altTextPatchError" class="baseline-error">{{ altTextPatchError }}</p>
              <dl v-if="altTextPatchReport" class="patch-report alt-patch-report">
                <div><dt>变化部件</dt><dd>{{ altTextPatchReport.changedParts.length }}</dd></div>
                <div><dt>其余部件保全</dt><dd>{{ altTextPatchReport.unchangedPartCount }}</dd></div>
                <div><dt>语义复读</dt><dd>{{ altTextPatchReport.semanticReparseVerified ? '通过' : '未通过' }}</dd></div>
                <div><dt>源文件写入</dt><dd>{{ altTextPatchReport.writesUserFile ? '是' : '否' }}</dd></div>
              </dl>
            </template>
            <p v-else class="muted">没有符合规则的单一内嵌图片目标。</p>
          </div>
        </section>
        <section v-if="verifiedPreview && verifiedOperation" class="reliable-save-copy" data-testid="c4d-save-panel">
          <header>
            <SaveIcon :size="15" />
            <strong>C4D 可靠另存副本</strong>
            <span v-if="savedCopyReport" class="verified-badge">已保存</span>
          </header>
          <p class="save-summary">
            {{ verifiedPreview.operationLabel }}已完成隔离验证，仅变化
            {{ verifiedPreview.changedParts.length }} 个 OOXML 部件。
          </p>
          <label>
            <span>新副本文件名</span>
            <input
              v-model="copyFileName"
              data-testid="c4d-copy-file-name"
              maxlength="255"
              :disabled="Boolean(savedCopyReport)"
              @keydown.enter.prevent="savePptxCopy"
            >
          </label>
          <button
            type="button"
            data-testid="c4d-save-copy"
            :disabled="savingCopy || !validCopyFileName || Boolean(savedCopyReport)"
            @click="savePptxCopy"
          >
            <LoaderCircleIcon v-if="savingCopy" :size="14" class="spin" />
            <SaveIcon v-else :size="14" />
            {{ savingCopy ? '正在落盘并复读' : '原子另存并验证' }}
          </button>
          <p class="muted">只创建同目录新文件，不覆盖源文件或已有目标；外部生产者复开将在 C4E 完成。</p>
          <p v-if="saveCopyError" class="baseline-error">{{ saveCopyError }}</p>
          <dl v-if="savedCopyReport" class="patch-report c4d-save-report">
            <div><dt>保存模式</dt><dd>新副本</dd></div>
            <div><dt>结构复开</dt><dd>{{ savedCopyReport.structuralReopenVerified ? '通过' : '未通过' }}</dd></div>
            <div><dt>语义复开</dt><dd>{{ savedCopyReport.semanticReopenVerified ? '通过' : '未通过' }}</dd></div>
            <div><dt>源文件不变</dt><dd>{{ savedCopyReport.sourceUnchanged ? '是' : '否' }}</dd></div>
          </dl>
          <button
            v-if="savedCopyReport"
            type="button"
            class="open-saved-copy"
            data-testid="c4d-open-copy"
            @click="openSavedPptxCopy"
          >
            打开已验证副本
          </button>
        </section>
        <section>
          <header>
            <MessageSquareTextIcon :size="15" />
            <strong>演讲者备注</strong>
          </header>
          <p v-if="activeSlide?.notes" class="notes">{{ activeSlide.notes }}</p>
          <p v-else class="muted">无备注</p>
        </section>
        <section>
          <header>
            <ShieldCheckIcon :size="15" />
            <strong>兼容画像</strong>
          </header>
          <dl>
            <div><dt>生产者</dt><dd>{{ profile.producer || '未知' }}</dd></div>
            <div><dt>幻灯片</dt><dd>{{ profile.slideCount }}</dd></div>
            <div><dt>文本对象</dt><dd>{{ profile.textObjectCount }}</dd></div>
            <div><dt>图片 / 形状</dt><dd>{{ profile.imageCount }} / {{ profile.shapeCount }}</dd></div>
            <div><dt>备注</dt><dd>{{ profile.notesCount }}</dd></div>
            <div><dt>母版 / 主题</dt><dd>{{ profile.masterCount }} / {{ profile.themeCount }}</dd></div>
            <div><dt>图表 / SmartArt</dt><dd>{{ profile.chartCount }} / {{ profile.smartArtCount }}</dd></div>
            <div><dt>动画页</dt><dd>{{ profile.animationCount }}</dd></div>
          </dl>
        </section>
        <section v-if="allWarnings.length">
          <header>
            <AlertTriangleIcon :size="15" />
            <strong>只读边界</strong>
          </header>
          <ul>
            <li v-for="warning in allWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>
      </aside>
    </div>

    <footer v-if="report" class="pptx-status">
      <span>{{ report.model.slides.length }} 张幻灯片 · {{ formatBytes(report.size) }}</span>
      <span v-if="routeTargetLabel" class="route-target-status" aria-live="polite">已定位：{{ routeTargetLabel }}</span>
      <span v-else-if="savedCopyReport" class="baseline-status">C4D 新副本已可靠保存 · 原文件未修改</span>
      <span v-else-if="stylePatchReport || altTextPatchReport" class="baseline-status">C4C 隔离补丁已验证 · 原文件未修改</span>
      <span v-else-if="textPatchReport" class="baseline-status">C4B 隔离补丁已验证 · 原文件未修改</span>
      <span v-else-if="editBaseline" class="baseline-status">C4A 编辑隔离基线已验证 · 原文件未修改</span>
      <span>{{ activeSlide?.objects.length || 0 }} 个当前页对象</span>
    </footer>

    <Teleport to="body">
      <div v-if="presenting && activeSlide" class="presenter" role="dialog" aria-modal="true" @keydown.left="previousSlide" @keydown.right="nextSlide">
        <button type="button" title="退出放映" @click="presenting = false">
          <XIcon :size="20" />
        </button>
        <div class="presenter-slide" :style="slideStyle(activeSlide)">
          <div
            v-for="object in activeSlide.objects"
            :key="`present-${object.id || object.name}`"
            class="slide-object"
            :class="[object.kind, { 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
            :style="objectStyle(object)"
          >
            <PptxObjectContent
              :object="object"
              :media-src="mediaByPart[object.mediaPart || '']"
            />
          </div>
        </div>
        <div class="presenter-controls">
          <button type="button" :disabled="activeSlideIndex === 0" title="上一张" @click="previousSlide">
            <ChevronLeftIcon :size="22" />
          </button>
          <span>{{ activeSlideIndex + 1 }} / {{ slideCount }}</span>
          <button type="button" :disabled="activeSlideIndex === slideCount - 1" title="下一张" @click="nextSlide">
            <ChevronRightIcon :size="22" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle as AlertTriangleIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  EyeOff as EyeOffIcon,
  Image as ImageIcon,
  LoaderCircle as LoaderCircleIcon,
  LockKeyhole as LockKeyholeIcon,
  MessageSquareText as MessageSquareTextIcon,
  PanelRight as PanelRightIcon,
  Palette as PaletteIcon,
  PenLine as PenLineIcon,
  Play as PlayIcon,
  Presentation as PresentationIcon,
  RefreshCw as RefreshCwIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  ShieldCheck as ShieldCheckIcon,
  X as XIcon,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import PptxObjectContent from '../components/pptx/PptxObjectContent.vue'
import { useAppStore } from '../store/app'
import { resolvePptxRouteLocator } from '../utils/pptxLocator'

interface PptxObject {
  id: string
  kind: string
  name: string
  text: string
  altText?: string
  shapeType?: string
  mediaPart?: string
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  fillColor?: string
  lineColor?: string
  lineWidth?: number
  noFill: boolean
  textStyle: {
    fontSizeHundredthPoints?: number
    fontFamily?: string
    color?: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    alignment?: string
    verticalAnchor?: string
    opacity?: number
  }
  fillOpacity?: number
  lineOpacity?: number
  imageOpacity?: number
  cropLeft?: number
  cropTop?: number
  cropRight?: number
  cropBottom?: number
  parentGroupId?: string
  groupLevel: number
  childCount: number
  textRunCount: number
  mixedTextStyle: boolean
  flipHorizontal: boolean
  flipVertical: boolean
  lineDash?: string
  lineHead?: string
  lineTail?: string
  graphicType?: string
  relatedPart?: string
  table?: {
    columnWidths: number[]
    rows: Array<{
      height?: number
      cells: Array<{
        text: string
        gridSpan?: number
        rowSpan?: number
        horizontalMerge: boolean
        verticalMerge: boolean
      }>
    }>
  }
}
interface PptxSlide {
  id: string
  partName: string
  title: string
  text: string
  notes: string
  hidden: boolean
  hasBackground: boolean
  backgroundColor: string
  backgroundSource: string
  themeName?: string
  objects: PptxObject[]
  warnings: string[]
}
interface PptxProfile {
  producer?: string
  application?: string
  slideCount: number
  textObjectCount: number
  imageCount: number
  shapeCount: number
  groupCount: number
  chartCount: number
  smartArtCount: number
  animationCount: number
  notesCount: number
  embeddedObjectCount: number
  themeCount: number
  masterCount: number
  unknownPresentationParts: string[]
}
interface PptxReadReport {
  path: string
  size: number
  modified: number
  signature: string
  readOnly: boolean
  model: {
    width: number
    height: number
    slides: PptxSlide[]
    plainText: string
    compatibility: PptxProfile
    warnings: string[]
  }
  media: Array<{ partName: string; dataUrl: string }>
  mediaWarnings: string[]
}
interface PptxEditBaselineReport {
  status: string
  sourcePackageDigest: string
  isolatedPackageDigest: string
  partCount: number
  unchangedPartCount: number
  editableCandidateParts: string[]
  changedParts: string[]
  exactPackageCopyVerified: boolean
  unchangedPartsVerified: boolean
  structuralReparseVerified: boolean
  temporaryCopyReopenVerified: boolean
  sourceUnchanged: boolean
  writesUserFile: boolean
  editingEnabled: boolean
  editableTextTargets: PptxEditableTextTarget[]
  editableNotesTargets: PptxEditableTextTarget[]
  editableStyleTargets: PptxEditableStyleTarget[]
  editableAltTextTargets: PptxEditableAltTextTarget[]
}
interface PptxEditableTextTarget {
  id: string
  kind: 'slide-text' | 'speaker-notes'
  slideNumber: number
  slideId: string
  partName: string
  objectId: string
  objectName: string
  text: string
  expectedTextDigest: string
  expectedPartDigest: string
}
interface PptxIsolatedTextPatchReport {
  status: string
  outputDigest: string
  outputBytes: number
  targetId: string
  targetKind: string
  targetPart: string
  changedParts: string[]
  unchangedPartCount: number
  unchangedPartsVerified: boolean
  structuralReparseVerified: boolean
  semanticReparseVerified: boolean
  temporaryCopyReopenVerified: boolean
  sourceUnchanged: boolean
  writesUserFile: boolean
}
interface PptxEditableStyleTarget {
  id: string
  kind: 'text-box-style' | 'shape-text-style'
  slideNumber: number
  slideId: string
  partName: string
  objectId: string
  objectName: string
  text: string
  fontSizeHundredthPoints?: number
  fontFamily?: string
  color?: string
  bold: boolean
  italic: boolean
  underline: boolean
  alignment: 'left' | 'center' | 'right' | 'justify'
  expectedStyleDigest: string
  expectedPartDigest: string
}
interface PptxEditableAltTextTarget {
  id: string
  kind: 'picture-alt-text'
  slideNumber: number
  slideId: string
  partName: string
  objectId: string
  objectName: string
  altText: string
  expectedMetadataDigest: string
  expectedPartDigest: string
}
interface PptxIsolatedMetadataPatchReport {
  status: string
  outputDigest: string
  outputBytes: number
  operation: 'character-style' | 'picture-alt-text'
  targetId: string
  targetKind: string
  targetPart: string
  changedParts: string[]
  unchangedPartCount: number
  unchangedPartsVerified: boolean
  structuralReparseVerified: boolean
  semanticReparseVerified: boolean
  temporaryCopyReopenVerified: boolean
  sourceUnchanged: boolean
  writesUserFile: boolean
}
type PptxPatchOperation =
  | {
    kind: 'text'
    targetId: string
    expectedTextDigest: string
    expectedPartDigest: string
    replacementText: string
  }
  | {
    kind: 'style'
    targetId: string
    expectedStyleDigest: string
    expectedPartDigest: string
    fontSizeHundredthPoints: number
    fontFamily: string
    color: string
    bold: boolean
    italic: boolean
    underline: boolean
    alignment: PptxEditableStyleTarget['alignment']
  }
  | {
    kind: 'imageAltText'
    targetId: string
    expectedMetadataDigest: string
    expectedPartDigest: string
    altText: string
  }
interface PptxVerifiedPreview {
  outputDigest: string
  outputBytes: number
  changedParts: string[]
  operationLabel: string
}
interface PptxSavedCopyReport {
  status: string
  saveMode: 'copy'
  operationKind: string
  targetPath: string
  targetDigest: string
  sourceUnchanged: boolean
  outputBytes: number
  changedParts: string[]
  unchangedPartsVerified: boolean
  structuralReopenVerified: boolean
  semanticReopenVerified: boolean
  producerMatrixBaseline: string[]
  externalProducerReopenRequired: boolean
}
interface SearchMatch {
  slideIndex: number
  objectId?: string
}

const route = useRoute()
const router = useRouter()
const message = useMessage()
const store = useAppStore()
const report = ref<PptxReadReport>()
const loading = ref(false)
const loadError = ref('')
const activeSlideIndex = ref(0)
const searchQuery = ref('')
const activeMatch = ref(0)
const showDetails = ref(true)
const presenting = ref(false)
const baselineLoading = ref(false)
const baselineError = ref('')
const editBaseline = ref<PptxEditBaselineReport>()
const selectedEditTargetId = ref('')
const replacementText = ref('')
const textPatchLoading = ref(false)
const textPatchError = ref('')
const textPatchReport = ref<PptxIsolatedTextPatchReport>()
const selectedStyleTargetId = ref('')
const styleFontSizePt = ref(18)
const styleFontFamily = ref('Aptos')
const styleColor = ref('#000000')
const styleBold = ref(false)
const styleItalic = ref(false)
const styleUnderline = ref(false)
const styleAlignment = ref<PptxEditableStyleTarget['alignment']>('left')
const stylePatchLoading = ref(false)
const stylePatchError = ref('')
const stylePatchReport = ref<PptxIsolatedMetadataPatchReport>()
const selectedAltTextTargetId = ref('')
const altTextValue = ref('')
const altTextPatchLoading = ref(false)
const altTextPatchError = ref('')
const altTextPatchReport = ref<PptxIsolatedMetadataPatchReport>()
const verifiedOperation = ref<PptxPatchOperation>()
const verifiedPreview = ref<PptxVerifiedPreview>()
const copyFileName = ref('')
const savingCopy = ref(false)
const saveCopyError = ref('')
const savedCopyReport = ref<PptxSavedCopyReport>()
const slideStripRef = ref<HTMLElement>()
const routeTargetSlideIndex = ref(-1)
const routeTargetObjectId = ref('')
const routeTargetLabel = ref('')
const pptxPath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => pptxPath.value.split(/[\\/]/).pop() || '未命名.pptx')
const profile = computed(() => report.value?.model.compatibility as PptxProfile)
const safeEditTargets = computed(() => [
  ...(editBaseline.value?.editableTextTargets || []),
  ...(editBaseline.value?.editableNotesTargets || []),
])
const selectedEditTarget = computed(() => safeEditTargets.value.find(
  target => target.id === selectedEditTargetId.value,
))
const safeStyleTargets = computed(() => editBaseline.value?.editableStyleTargets || [])
const selectedStyleTarget = computed(() => safeStyleTargets.value.find(
  target => target.id === selectedStyleTargetId.value,
))
const safeAltTextTargets = computed(() => editBaseline.value?.editableAltTextTargets || [])
const selectedAltTextTarget = computed(() => safeAltTextTargets.value.find(
  target => target.id === selectedAltTextTargetId.value,
))
const styleFormChanged = computed(() => {
  const target = selectedStyleTarget.value
  if (!target) return false
  return Math.round(styleFontSizePt.value * 100) !== target.fontSizeHundredthPoints
    || styleFontFamily.value.trim() !== (target.fontFamily || '')
    || styleColor.value.slice(1).toUpperCase() !== (target.color || '')
    || styleBold.value !== target.bold
    || styleItalic.value !== target.italic
    || styleUnderline.value !== target.underline
    || styleAlignment.value !== target.alignment
})
const validStyleForm = computed(() => (
  Number.isFinite(styleFontSizePt.value)
  && styleFontSizePt.value >= 1
  && styleFontSizePt.value <= 4000
  && styleFontFamily.value.trim().length > 0
  && styleFontFamily.value.length <= 100
  && !/[<>"'&\u0000-\u001f]/.test(styleFontFamily.value)
  && /^#[0-9a-f]{6}$/i.test(styleColor.value)
  && styleFormChanged.value
))
const validCopyFileName = computed(() => {
  const value = copyFileName.value.trim()
  return value.length > 5
    && value.length <= 255
    && /\.pptx$/i.test(value)
    && !/[\\/:*?"<>|\u0000-\u001f]/.test(value)
    && !/[ .]$/.test(value)
})
const activeSlide = computed(() => report.value?.model.slides[activeSlideIndex.value])
const slideCount = computed(() => report.value?.model.slides.length || 0)
const slideRatio = computed(() => {
  const model = report.value?.model
  return model?.width && model?.height ? `${model.width} / ${model.height}` : '16 / 9'
})
const mediaByPart = computed<Record<string, string>>(() => Object.fromEntries(
  (report.value?.media || []).map(media => [media.partName, media.dataUrl]),
))
const matches = computed<SearchMatch[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query || !report.value) return []
  const results: SearchMatch[] = []
  report.value.model.slides.forEach((slide, slideIndex) => {
    slide.objects.forEach(object => {
      if (`${object.name}\n${object.text}\n${object.altText || ''}`.toLocaleLowerCase().includes(query)) {
        results.push({ slideIndex, objectId: object.id })
      }
    })
    if (`${slide.title}\n${slide.notes}`.toLocaleLowerCase().includes(query) && !results.some(match => match.slideIndex === slideIndex)) {
      results.push({ slideIndex })
    }
  })
  return results
})
const matchedSlideIndexes = computed(() => new Set(matches.value.map(match => match.slideIndex)))
const matchedObjectIds = computed(() => new Set(
  matches.value.filter(match => match.slideIndex === activeSlideIndex.value).map(match => match.objectId),
))
const allWarnings = computed(() => Array.from(new Set([
  ...(report.value?.model.warnings || []),
  ...(activeSlide.value?.warnings || []),
  ...(report.value?.mediaWarnings || []),
])))

const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KiB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MiB`

const slideStyle = (slide: PptxSlide) => ({
  aspectRatio: slideRatio.value,
  backgroundColor: slide.backgroundColor || '#FFFFFF',
})

const colorWithOpacity = (color: string, opacity?: number) => {
  if (opacity == null || opacity >= 100000 || !/^#[\da-f]{6}$/i.test(color)) return color
  const alpha = Math.max(0, Math.min(1, opacity / 100000))
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const objectStyle = (object: PptxObject) => {
  const model = report.value?.model
  const style: Record<string, string> = {}
  if (model && object.x != null && object.y != null && object.width != null && object.height != null) {
    const minimumSize = object.kind === 'connector' ? 0.1 : 2
    style.left = `${Math.max(0, object.x / model.width * 100)}%`
    style.top = `${Math.max(0, object.y / model.height * 100)}%`
    style.width = `${Math.max(minimumSize, object.width / model.width * 100)}%`
    style.height = `${Math.max(minimumSize, object.height / model.height * 100)}%`
  }
  if (object.rotation != null) style.transform = `rotate(${object.rotation / 60000}deg)`
  if (object.noFill) style.backgroundColor = 'transparent'
  else if (object.fillColor) style.backgroundColor = colorWithOpacity(object.fillColor, object.fillOpacity)
  if (object.lineColor) {
    const lineColor = colorWithOpacity(object.lineColor, object.lineOpacity)
    const lineWidth = `${Math.max(1, Math.min(12, (object.lineWidth || 9525) / 9525))}px`
    style['--connector-color'] = lineColor
    style['--connector-width'] = lineWidth
    if (object.kind !== 'connector') {
      style.borderColor = lineColor
      style.borderStyle = 'solid'
      style.borderWidth = lineWidth
    }
  }
  const text = object.textStyle
  if (!object.mixedTextStyle && text?.fontSizeHundredthPoints && model?.height) {
    const relativeHeight = text.fontSizeHundredthPoints / 100 * 12700 / model.height * 100
    style.fontSize = `clamp(8px, ${relativeHeight}cqh, 72px)`
  }
  if (!object.mixedTextStyle && text?.fontFamily) style.fontFamily = `"${text.fontFamily.replace(/"/g, '')}", sans-serif`
  if (!object.mixedTextStyle && text?.color) style.color = colorWithOpacity(text.color, text.opacity)
  if (!object.mixedTextStyle && text?.bold != null) style.fontWeight = text.bold ? '700' : '400'
  if (!object.mixedTextStyle && text?.italic != null) style.fontStyle = text.italic ? 'italic' : 'normal'
  if (!object.mixedTextStyle && text?.underline != null) style.textDecoration = text.underline ? 'underline' : 'none'
  if (text?.alignment) style.textAlign = text.alignment
  if (text?.verticalAnchor) {
    style.alignItems = text.verticalAnchor === 'top'
      ? 'flex-start'
      : text.verticalAnchor === 'bottom' ? 'flex-end' : 'center'
  }
  return style
}

const clearRouteTarget = () => {
  routeTargetSlideIndex.value = -1
  routeTargetObjectId.value = ''
  routeTargetLabel.value = ''
}
const syncRelationFocus = (index: number) => {
  const slide = report.value?.model.slides[index]
  if (!slide || !pptxPath.value) return
  store.setRelationObjectFocus({
    path: pptxPath.value,
    locatorKind: 'pptx-slide',
    locatorObjectId: slide.id,
    locatorPage: index + 1,
  })
}
const selectSlide = (index: number, preserveRouteTarget = false) => {
  if (!preserveRouteTarget) clearRouteTarget()
  activeSlideIndex.value = Math.max(0, Math.min(index, (report.value?.model.slides.length || 1) - 1))
  syncRelationFocus(activeSlideIndex.value)
}
const previousSlide = () => selectSlide(activeSlideIndex.value - 1)
const nextSlide = () => selectSlide(activeSlideIndex.value + 1)
const routeString = (value: unknown) => typeof value === 'string' ? value : ''
let routeLocatorRun = 0
const applyRouteLocator = async () => {
  const run = ++routeLocatorRun
  clearRouteTarget()
  if (!report.value?.model.slides.length) return
  const slides = report.value.model.slides
  const locatorKind = routeString(route.query.locatorKind)
  const locator = routeString(route.query.locator)
  const target = resolvePptxRouteLocator(slides, {
    slide: routeString(route.query.slide),
    locatorKind,
    locator,
  })
  if (!target) return

  await nextTick()
  if (run !== routeLocatorRun) return
  selectSlide(target.slideIndex, true)
  routeTargetSlideIndex.value = target.slideIndex
  routeTargetObjectId.value = target.objectId
  routeTargetLabel.value = routeString(route.query.locationLabel) || `幻灯片 ${target.slideIndex + 1}`
  if (route.query.matchKind === 'notes') showDetails.value = true
  await nextTick()
  if (run !== routeLocatorRun) return
  slideStripRef.value
    ?.querySelector<HTMLElement>(`[data-slide-index="${target.slideIndex}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}
const moveSearch = (direction: -1 | 1) => {
  if (!matches.value.length) return
  activeMatch.value = (activeMatch.value + direction + matches.value.length) % matches.value.length
  selectSlide(matches.value[activeMatch.value].slideIndex)
}
const prepareEditBaseline = async () => {
  if (!report.value || baselineLoading.value) return
  baselineLoading.value = true
  baselineError.value = ''
  try {
    const baseline = await invoke<PptxEditBaselineReport>('audit_pptx_edit_baseline', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      expectedSignature: report.value.signature,
    })
    if (
      !baseline.exactPackageCopyVerified
      || !baseline.unchangedPartsVerified
      || !baseline.structuralReparseVerified
      || !baseline.temporaryCopyReopenVerified
      || !baseline.sourceUnchanged
      || baseline.writesUserFile
      || baseline.editingEnabled
      || baseline.changedParts.length
    ) {
      throw new Error('PPTX 编辑隔离基线未通过完整保护门禁')
    }
    editBaseline.value = baseline
    const targets = [...baseline.editableTextTargets, ...baseline.editableNotesTargets]
    const preferred = targets.find(target => target.slideNumber === activeSlideIndex.value + 1) || targets[0]
    selectedEditTargetId.value = preferred?.id || ''
    replacementText.value = preferred?.text || ''
    textPatchReport.value = undefined
    textPatchError.value = ''
    const styleTarget = baseline.editableStyleTargets.find(
      target => target.slideNumber === activeSlideIndex.value + 1,
    ) || baseline.editableStyleTargets[0]
    selectedStyleTargetId.value = styleTarget?.id || ''
    const altTarget = baseline.editableAltTextTargets.find(
      target => target.slideNumber === activeSlideIndex.value + 1,
    ) || baseline.editableAltTextTargets[0]
    selectedAltTextTargetId.value = altTarget?.id || ''
    stylePatchReport.value = undefined
    stylePatchError.value = ''
    altTextPatchReport.value = undefined
    altTextPatchError.value = ''
    const baseName = fileName.value.replace(/\.pptx$/i, '')
    copyFileName.value = `${baseName}-LongEdit副本.pptx`
    verifiedOperation.value = undefined
    verifiedPreview.value = undefined
    savedCopyReport.value = undefined
    saveCopyError.value = ''
    showDetails.value = true
  } catch (error) {
    editBaseline.value = undefined
    baselineError.value = String(error)
    showDetails.value = true
  } finally {
    baselineLoading.value = false
  }
}
const clearSaveCandidate = () => {
  verifiedOperation.value = undefined
  verifiedPreview.value = undefined
  savedCopyReport.value = undefined
  saveCopyError.value = ''
}
const clearTextPatchResult = () => {
  textPatchReport.value = undefined
  textPatchError.value = ''
  clearSaveCandidate()
}
const previewTextPatch = async () => {
  const target = selectedEditTarget.value
  if (!report.value || !target || textPatchLoading.value) return
  textPatchLoading.value = true
  textPatchError.value = ''
  textPatchReport.value = undefined
  clearSaveCandidate()
  try {
    const patch = await invoke<PptxIsolatedTextPatchReport>('preview_pptx_text_patch_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      expectedSignature: report.value.signature,
      targetId: target.id,
      expectedTextDigest: target.expectedTextDigest,
      expectedPartDigest: target.expectedPartDigest,
      replacementText: replacementText.value,
    })
    if (
      patch.changedParts.length !== 1
      || patch.changedParts[0] !== target.partName
      || !patch.unchangedPartsVerified
      || !patch.structuralReparseVerified
      || !patch.semanticReparseVerified
      || !patch.temporaryCopyReopenVerified
      || !patch.sourceUnchanged
      || patch.writesUserFile
    ) {
      throw new Error('PPTX C4B 隔离补丁未通过单部件保护门禁')
    }
    textPatchReport.value = patch
    verifiedOperation.value = {
      kind: 'text',
      targetId: target.id,
      expectedTextDigest: target.expectedTextDigest,
      expectedPartDigest: target.expectedPartDigest,
      replacementText: replacementText.value,
    }
    verifiedPreview.value = {
      outputDigest: patch.outputDigest,
      outputBytes: patch.outputBytes,
      changedParts: patch.changedParts,
      operationLabel: target.kind === 'speaker-notes' ? '演讲者备注' : '幻灯片文本',
    }
    savedCopyReport.value = undefined
    saveCopyError.value = ''
  } catch (error) {
    textPatchError.value = String(error)
  } finally {
    textPatchLoading.value = false
  }
}
const syncStyleForm = () => {
  const target = selectedStyleTarget.value
  styleFontSizePt.value = (target?.fontSizeHundredthPoints || 1800) / 100
  styleFontFamily.value = target?.fontFamily || 'Aptos'
  styleColor.value = `#${target?.color || '000000'}`
  styleBold.value = target?.bold || false
  styleItalic.value = target?.italic || false
  styleUnderline.value = target?.underline || false
  styleAlignment.value = target?.alignment || 'left'
  stylePatchReport.value = undefined
  stylePatchError.value = ''
  clearSaveCandidate()
}
const previewStylePatch = async () => {
  const target = selectedStyleTarget.value
  if (!report.value || !target || !validStyleForm.value || stylePatchLoading.value) return
  stylePatchLoading.value = true
  stylePatchError.value = ''
  stylePatchReport.value = undefined
  clearSaveCandidate()
  try {
    const patch = await invoke<PptxIsolatedMetadataPatchReport>('preview_pptx_style_patch_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      expectedSignature: report.value.signature,
      targetId: target.id,
      expectedStyleDigest: target.expectedStyleDigest,
      expectedPartDigest: target.expectedPartDigest,
      fontSizeHundredthPoints: Math.round(styleFontSizePt.value * 100),
      fontFamily: styleFontFamily.value.trim(),
      color: styleColor.value.slice(1).toUpperCase(),
      bold: styleBold.value,
      italic: styleItalic.value,
      underline: styleUnderline.value,
      alignment: styleAlignment.value,
    })
    if (
      patch.operation !== 'character-style'
      || patch.changedParts.length !== 1
      || patch.changedParts[0] !== target.partName
      || !patch.unchangedPartsVerified
      || !patch.structuralReparseVerified
      || !patch.semanticReparseVerified
      || !patch.temporaryCopyReopenVerified
      || !patch.sourceUnchanged
      || patch.writesUserFile
    ) {
      throw new Error('PPTX C4C 样式补丁未通过单部件保护门禁')
    }
    stylePatchReport.value = patch
    verifiedOperation.value = {
      kind: 'style',
      targetId: target.id,
      expectedStyleDigest: target.expectedStyleDigest,
      expectedPartDigest: target.expectedPartDigest,
      fontSizeHundredthPoints: Math.round(styleFontSizePt.value * 100),
      fontFamily: styleFontFamily.value.trim(),
      color: styleColor.value.slice(1).toUpperCase(),
      bold: styleBold.value,
      italic: styleItalic.value,
      underline: styleUnderline.value,
      alignment: styleAlignment.value,
    }
    verifiedPreview.value = {
      outputDigest: patch.outputDigest,
      outputBytes: patch.outputBytes,
      changedParts: patch.changedParts,
      operationLabel: target.kind === 'shape-text-style' ? '形状文本样式' : '文本框样式',
    }
    savedCopyReport.value = undefined
    saveCopyError.value = ''
  } catch (error) {
    stylePatchError.value = String(error)
  } finally {
    stylePatchLoading.value = false
  }
}
const previewAltTextPatch = async () => {
  const target = selectedAltTextTarget.value
  if (!report.value || !target || altTextPatchLoading.value) return
  altTextPatchLoading.value = true
  altTextPatchError.value = ''
  altTextPatchReport.value = undefined
  clearSaveCandidate()
  try {
    const patch = await invoke<PptxIsolatedMetadataPatchReport>('preview_pptx_alt_text_patch_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      expectedSignature: report.value.signature,
      targetId: target.id,
      expectedMetadataDigest: target.expectedMetadataDigest,
      expectedPartDigest: target.expectedPartDigest,
      altText: altTextValue.value,
    })
    if (
      patch.operation !== 'picture-alt-text'
      || patch.changedParts.length !== 1
      || patch.changedParts[0] !== target.partName
      || !patch.unchangedPartsVerified
      || !patch.structuralReparseVerified
      || !patch.semanticReparseVerified
      || !patch.temporaryCopyReopenVerified
      || !patch.sourceUnchanged
      || patch.writesUserFile
    ) {
      throw new Error('PPTX C4C 替代文本补丁未通过单部件保护门禁')
    }
    altTextPatchReport.value = patch
    verifiedOperation.value = {
      kind: 'imageAltText',
      targetId: target.id,
      expectedMetadataDigest: target.expectedMetadataDigest,
      expectedPartDigest: target.expectedPartDigest,
      altText: altTextValue.value,
    }
    verifiedPreview.value = {
      outputDigest: patch.outputDigest,
      outputBytes: patch.outputBytes,
      changedParts: patch.changedParts,
      operationLabel: '图片替代文本',
    }
    savedCopyReport.value = undefined
    saveCopyError.value = ''
  } catch (error) {
    altTextPatchError.value = String(error)
  } finally {
    altTextPatchLoading.value = false
  }
}
const savePptxCopy = async () => {
  const preview = verifiedPreview.value
  const operation = verifiedOperation.value
  if (
    !preview
    || !operation
    || !report.value
    || !validCopyFileName.value
    || savingCopy.value
  ) return
  savingCopy.value = true
  saveCopyError.value = ''
  savedCopyReport.value = undefined
  try {
    const saved = await invoke<PptxSavedCopyReport>('save_pptx_patch_copy', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      targetFileName: copyFileName.value.trim(),
      expectedSignature: report.value.signature,
      expectedOutputDigest: preview.outputDigest,
      operation,
    })
    if (
      saved.status !== 'saved_verified'
      || saved.saveMode !== 'copy'
      || !saved.sourceUnchanged
      || saved.changedParts.length !== 1
      || !saved.unchangedPartsVerified
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || saved.producerMatrixBaseline.length !== 3
      || !saved.externalProducerReopenRequired
    ) {
      throw new Error('PPTX C4D 保存结果未通过无覆盖、复读与源文件保护门禁')
    }
    savedCopyReport.value = saved
    message.success(`已可靠另存并验证：${copyFileName.value.trim()}`)
  } catch (error) {
    saveCopyError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    savingCopy.value = false
  }
}
const openSavedPptxCopy = async () => {
  const saved = savedCopyReport.value
  if (!saved) return
  const routeName = route.name === 'LibraryMode' ? 'LibraryMode' : 'PptxReader'
  await router.replace({ name: routeName, query: { path: saved.targetPath } })
}
const loadPresentation = async () => {
  if (!pptxPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  editBaseline.value = undefined
  baselineError.value = ''
  selectedEditTargetId.value = ''
  replacementText.value = ''
  textPatchReport.value = undefined
  textPatchError.value = ''
  selectedStyleTargetId.value = ''
  stylePatchReport.value = undefined
  stylePatchError.value = ''
  selectedAltTextTargetId.value = ''
  altTextValue.value = ''
  altTextPatchReport.value = undefined
  altTextPatchError.value = ''
  verifiedOperation.value = undefined
  verifiedPreview.value = undefined
  savedCopyReport.value = undefined
  saveCopyError.value = ''
  try {
    report.value = await invoke<PptxReadReport>('read_pptx_presentation', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
    })
    activeSlideIndex.value = Math.min(activeSlideIndex.value, Math.max(0, report.value.model.slides.length - 1))
    syncRelationFocus(activeSlideIndex.value)
    await applyRouteLocator()
  } catch (error) {
    report.value = undefined
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}
const handleKeydown = (event: KeyboardEvent) => {
  if (!presenting.value) return
  if (event.key === 'Escape') presenting.value = false
  if (event.key === 'ArrowLeft') previousSlide()
  if (event.key === 'ArrowRight' || event.key === ' ') nextSlide()
}

watch(selectedEditTargetId, () => {
  replacementText.value = selectedEditTarget.value?.text || ''
  clearTextPatchResult()
})
watch(selectedStyleTargetId, syncStyleForm)
watch(
  [styleFontSizePt, styleFontFamily, styleColor, styleBold, styleItalic, styleUnderline, styleAlignment],
  () => {
    stylePatchReport.value = undefined
    stylePatchError.value = ''
    clearSaveCandidate()
  },
)
watch(selectedAltTextTargetId, () => {
  altTextValue.value = selectedAltTextTarget.value?.altText || ''
  altTextPatchReport.value = undefined
  altTextPatchError.value = ''
  clearSaveCandidate()
})
watch(altTextValue, () => {
  altTextPatchReport.value = undefined
  altTextPatchError.value = ''
  clearSaveCandidate()
})
watch(matches, value => {
  activeMatch.value = 0
  if (value.length) selectSlide(value[0].slideIndex)
})
watch(pptxPath, () => loadPresentation())
watch(
  () => [route.query.slide, route.query.locatorKind, route.query.locator, route.query.locatorToken],
  applyRouteLocator,
)
watch(presenting, async value => {
  if (value) {
    await nextTick()
    document.querySelector<HTMLElement>('.presenter')?.focus()
  }
})
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadPresentation()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  store.clearRelationObjectFocus()
})
</script>

<style scoped>
.pptx-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; }
.pptx-toolbar { min-height: 52px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.document-identity, .toolbar-actions, .pptx-search, .pptx-details header, .pptx-status { display: flex; align-items: center; }
.document-identity { min-width: 0; gap: 9px; }
.document-identity > div { min-width: 0; display: flex; flex-direction: column; }
.document-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-identity span { color: var(--text-muted); font-size: 10px; }
.toolbar-actions { gap: 4px; }
.toolbar-actions > button { min-width: 30px; height: 30px; padding: 0 7px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid transparent; border-radius: 5px; color: var(--text-secondary); background: transparent; cursor: pointer; font: inherit; }
.toolbar-actions > button:hover:not(:disabled), .toolbar-actions > button.active { border-color: var(--border-color); background: var(--hover-bg); color: var(--text-primary); }
.toolbar-actions > button:disabled { opacity: .38; cursor: default; }
.pptx-search { width: 218px; height: 30px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-secondary); }
.pptx-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.pptx-search span { color: var(--text-muted); font-size: 10px; }
.pptx-state { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
.pptx-state.error { color: var(--error-color); }
.pptx-state p { max-width: 560px; margin: 4px 0 0; color: var(--text-secondary); }
.pptx-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 190px minmax(0, 1fr); }
.pptx-layout.details-open { grid-template-columns: 190px minmax(0, 1fr) 260px; }
.slide-strip { overflow: auto; padding: 10px 8px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.slide-strip > button { position: relative; width: 100%; padding: 6px 6px 6px 24px; display: block; border: 1px solid transparent; border-radius: 5px; color: inherit; background: transparent; cursor: pointer; }
.slide-strip > button:hover { background: var(--hover-bg); }
.slide-strip > button.active { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
.slide-strip > button.route-target { animation: route-target-pulse 1.15s ease-out; }
.slide-strip > button.hit:not(.active)::after { content: ''; position: absolute; right: 7px; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: #d69b18; }
.slide-number { position: absolute; left: 6px; top: 9px; color: var(--text-muted); font-size: 10px; }
.thumbnail { position: relative; box-sizing: border-box; padding: 0; display: block; overflow: hidden; container-type: size; border: 1px solid var(--border-color); background: #fff; color: #20242b; box-shadow: 0 2px 7px rgba(0,0,0,.08); text-align: left; }
.thumbnail strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.thumbnail > small { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; padding: 8px; font-size: 7px; line-height: 1.35; }
.hidden-mark { position: absolute; right: 10px; bottom: 10px; color: var(--text-muted); }
.pptx-stage { min-width: 0; overflow: auto; padding: 28px; display: grid; place-items: center; background: color-mix(in srgb, var(--bg-secondary) 78%, #526073); }
.slide-canvas, .presenter-slide { position: relative; width: min(100%, 1100px); overflow: hidden; container-type: size; background: #fff; color: #1e232b; box-shadow: 0 12px 38px rgba(0,0,0,.22); }
.slide-object { position: absolute; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: clamp(8px, 3.5cqh, 25px); white-space: pre-wrap; transform-origin: center; }
.slide-object p { width: 100%; margin: 0; padding: 2%; box-sizing: border-box; font: inherit; color: inherit; text-align: inherit; line-height: 1.25; }
.slide-object.shape { border: 1px solid #8b97a8; background: #edf2f8; }
.slide-object.custom { border: 1px dashed #8b97a8; color: #526071; background: #edf2f8; }
.slide-object.picture:not(:has(img)), .slide-object.group { border: 1px dashed #8b97a8; color: #697586; background: #f5f7fa; font-size: 11px; }
.slide-object.connector { overflow: visible; }
.slide-object.group.expanded-group { pointer-events: none; border: 0; background: transparent; }
.slide-object.search-hit { outline: 4px solid rgba(230, 168, 24, .75); outline-offset: 2px; }
.slide-canvas.route-target-slide { animation: route-target-canvas 1.15s ease-out; }
.slide-object.route-target-object { z-index: 2; outline: 4px solid var(--primary-color); outline-offset: 3px; animation: route-target-object 1.15s ease-out; }
.slide-object.route-target-object::after { content: ''; position: absolute; pointer-events: none; inset: 0; border: 3px solid var(--primary-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
.empty-slide { position: absolute; inset: 0; display: grid; place-items: center; color: #8a939e; }
.pptx-details { min-width: 0; overflow: auto; padding: 13px; border-left: 1px solid var(--border-color); background: var(--bg-primary); }
.pptx-details section { padding: 0 0 14px; margin: 0 0 14px; border-bottom: 1px solid var(--border-color); }
.pptx-details header { gap: 7px; margin-bottom: 9px; }
.notes { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.muted { color: var(--text-muted); }
.pptx-details dl { margin: 0; }
.pptx-details dl > div { padding: 4px 0; display: flex; justify-content: space-between; gap: 12px; }
.pptx-details dt { color: var(--text-muted); }
.pptx-details dd { margin: 0; text-align: right; }
.pptx-details ul { margin: 0; padding-left: 17px; color: var(--text-secondary); line-height: 1.55; }
.pptx-details .verified-badge { margin-left: auto; padding: 2px 6px; border-radius: 999px; color: var(--success-color); background: color-mix(in srgb, var(--success-color) 12%, transparent); font-size: 10px; }
.baseline-digest { margin: 9px 0 6px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px; word-break: break-all; }
.baseline-error { margin: 0; color: var(--error-color); line-height: 1.5; }
.baseline-status { color: var(--success-color); }
.isolated-text-patch label, .isolated-metadata-patch label, .reliable-save-copy label { display: grid; gap: 5px; margin-bottom: 9px; color: var(--text-muted); font-size: 11px; }
.isolated-text-patch select, .isolated-text-patch textarea, .isolated-metadata-patch select, .isolated-metadata-patch textarea, .isolated-metadata-patch input, .reliable-save-copy input { width: 100%; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 5px; outline: none; color: var(--text-primary); background: var(--bg-secondary); font: inherit; }
.isolated-text-patch select, .isolated-metadata-patch select, .isolated-metadata-patch input, .reliable-save-copy input { height: 30px; padding: 0 7px; }
.isolated-text-patch textarea, .isolated-metadata-patch textarea { min-height: 64px; padding: 7px; resize: vertical; line-height: 1.45; }
.isolated-text-patch select:focus, .isolated-text-patch textarea:focus, .isolated-metadata-patch select:focus, .isolated-metadata-patch textarea:focus, .isolated-metadata-patch input:focus, .reliable-save-copy input:focus { border-color: var(--primary-color); }
.reliable-save-copy input:disabled { opacity: .65; cursor: default; }
.save-summary { margin: 0 0 9px; color: var(--text-secondary); line-height: 1.55; }
.reliable-save-copy > button { min-height: 30px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--primary-color); border-radius: 5px; color: var(--primary-color); background: transparent; cursor: pointer; font: inherit; font-size: 11px; }
.reliable-save-copy > button:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-color) 9%, transparent); }
.reliable-save-copy > button:disabled { opacity: .45; cursor: default; }
.reliable-save-copy .muted { margin: 8px 0 0; font-size: 10px; line-height: 1.5; }
.reliable-save-copy .open-saved-copy { margin-top: 9px; color: var(--success-color); border-color: var(--success-color); }
.c4c-block + .c4c-block { margin-top: 13px; padding-top: 12px; border-top: 1px dashed var(--border-color); }
.c4c-block h4 { margin: 0 0 9px; display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: 11px; }
.style-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0 7px; }
.style-grid input[type="color"] { padding: 3px; cursor: pointer; }
.style-toggles { margin: 0 0 9px; display: flex; flex-wrap: wrap; gap: 5px 10px; }
.style-toggles label { margin: 0; display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); }
.style-toggles input { width: 14px; height: 14px; padding: 0; accent-color: var(--primary-color); }
.patch-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.patch-actions small { color: var(--text-muted); font-size: 9px; }
.patch-actions button { min-height: 28px; padding: 0 8px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--primary-color); border-radius: 5px; color: var(--primary-color); background: transparent; cursor: pointer; font: inherit; font-size: 11px; }
.patch-actions button:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-color) 9%, transparent); }
.patch-actions button:disabled { opacity: .45; cursor: default; }
.patch-report { margin-top: 9px !important; padding-top: 6px; border-top: 1px dashed var(--border-color); }
.pptx-status { min-height: 28px; padding: 0 12px; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-muted); font-size: 10px; }
.route-target-status { overflow: hidden; color: var(--primary-color); text-overflow: ellipsis; white-space: nowrap; }
.presenter { position: fixed; z-index: 10000; inset: 0; display: grid; place-items: center; background: #101215; }
.presenter > button { position: absolute; z-index: 2; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 5px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; }
.presenter-slide { width: min(92vw, calc(86vh * var(--slide-ratio, 1.777))); max-height: 86vh; box-shadow: none; }
.presenter-controls { position: absolute; bottom: 10px; display: flex; align-items: center; gap: 12px; color: #fff; }
.presenter-controls button { width: 34px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 5px; color: inherit; background: rgba(255,255,255,.1); cursor: pointer; }
.presenter-controls button:disabled { opacity: .3; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes route-target-pulse {
  0% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 55%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes route-target-canvas {
  0% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-color) 60%, transparent), 0 12px 38px rgba(0,0,0,.22); }
  100% { box-shadow: 0 12px 38px rgba(0,0,0,.22); }
}
@keyframes route-target-object {
  0% { filter: drop-shadow(0 0 10px color-mix(in srgb, var(--primary-color) 75%, transparent)); }
  100% { filter: none; }
}
@media (max-width: 1050px) {
  .pptx-layout.details-open { position: relative; grid-template-columns: 170px minmax(0, 1fr); }
  .pptx-layout.details-open .pptx-details {
    position: absolute;
    z-index: 4;
    inset: 0 0 0 auto;
    width: min(280px, calc(100% - 170px));
    box-sizing: border-box;
    display: block;
    box-shadow: -12px 0 28px rgba(0,0,0,.16);
  }
}
@media (max-width: 760px) {
  .pptx-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; }
  .pptx-search { min-width: 0; flex: 1; }
  .toolbar-actions > button span { display: none; }
  .pptx-layout, .pptx-layout.details-open { grid-template-columns: 118px minmax(0, 1fr); }
  .pptx-layout.details-open .pptx-details { width: min(270px, calc(100% - 118px)); }
  .pptx-stage { padding: 14px; }
}
</style>
