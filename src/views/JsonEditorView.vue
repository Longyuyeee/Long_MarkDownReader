<template>
  <div class="json-workspace" data-testid="json-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />

    <header class="json-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" :title="isExternal ? '返回资料库' : '返回知识库'" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <FileJsonIcon :size="18" />
        <div class="document-title">
          <strong>{{ fileName }}</strong>
          <span aria-live="polite">
            <template v-if="isExternal">外部文件 · </template>{{ formatLabel }}
            <template v-if="readOnly"> · 只读预览</template>
            <template v-else-if="dirty"> · 未保存</template>
            <template v-else> · 已同步</template>
            <template v-if="isExternal && !readOnly"> · 仅点击保存写回</template>
          </span>
        </div>
      </div>
      <n-button-group size="small" class="view-switch" aria-label="JSON 视图">
        <n-button :type="viewMode === 'source' ? 'primary' : 'default'" :aria-pressed="viewMode === 'source'" @click="viewMode = 'source'">
          <template #icon><n-icon :component="SourceIcon" /></template>
          源码
        </n-button>
        <n-button
          :type="viewMode === 'tree' ? 'primary' : 'default'"
          :aria-pressed="viewMode === 'tree'"
          :disabled="rangeMode || !analysis?.valid"
          :title="rangeMode ? '大文件范围模式不构建完整树形，避免再次加载全文' : '查看 JSON 树形结构'"
          @click="viewMode = 'tree'"
        >
          <template #icon><n-icon :component="TreeIcon" /></template>
          树形
        </n-button>
      </n-button-group>
      <div class="editor-actions">
        <div v-show="advancedToolsVisible" class="advanced-editor-actions">
          <n-button quaternary circle size="small" title="搜索源码" :disabled="loading || viewMode !== 'source'" @click="openSourceSearch">
            <template #icon><n-icon :component="SearchIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" title="折叠全部" :disabled="loading || viewMode !== 'source'" @click="foldSource">
            <template #icon><n-icon :component="FoldIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" title="展开全部" :disabled="loading || viewMode !== 'source'" @click="unfoldSource">
            <template #icon><n-icon :component="UnfoldIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" title="格式化源码" :disabled="transformDisabled" @click="transformSource('pretty')">
            <template #icon><n-icon :component="FormatIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" title="压缩源码" :disabled="transformDisabled" @click="transformSource('minify')">
            <template #icon><n-icon :component="MinifyIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" title="重新从磁盘读取" :disabled="loading || saving" @click="reloadFromDisk">
            <template #icon><n-icon :component="RefreshIcon" /></template>
          </n-button>
        </div>
        <n-button
          quaternary
          circle
          size="small"
          :title="advancedToolsVisible ? '收起编辑工具' : '展开编辑工具'"
          :aria-pressed="advancedToolsVisible"
          @click="advancedToolsVisible = !advancedToolsVisible"
        >
          <template #icon><n-icon :component="ToolsIcon" /></template>
        </n-button>
        <n-button
          quaternary
          circle
          size="small"
          :title="inspectorVisible ? '隐藏结构与诊断' : '显示结构与诊断'"
          :aria-pressed="inspectorVisible"
          @click="toggleInspector"
        >
          <template #icon><n-icon :component="InspectorIcon" /></template>
        </n-button>
        <n-button data-testid="json-save" type="primary" size="small" :disabled="loading || saving || readOnly || !dirty" @click="save()">
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
        </n-button>
      </div>
    </header>

    <div v-if="loadError" class="load-error" role="alert">
      <AlertIcon :size="18" />
      <span>{{ loadError }}</span>
      <n-button size="small" @click="load(false)">重试</n-button>
    </div>

    <section v-if="!loadError && rangeMode" class="range-toolbar" data-testid="json-range-toolbar" aria-label="大 JSON 分段导航">
      <div class="range-summary">
        <strong>大文件渐进只读</strong>
        <span>仅加载当前 {{ formatBytes(rangeLoadedBytes) }}，不会构建全文编辑器或完整树形。</span>
      </div>
      <div class="range-progress">
        <span>{{ rangePositionLabel }}</span>
        <n-progress type="line" :percentage="rangeProgress" :show-indicator="false" :height="5" />
      </div>
      <div class="range-actions">
        <n-button data-testid="json-range-previous" size="small" :disabled="loadingRange || rangeHistoryIndex <= 0" @click="loadPreviousRange">
          <template #icon><n-icon :component="ChevronLeftIcon" /></template>
          上一段
        </n-button>
        <n-button data-testid="json-range-next" size="small" :loading="loadingRange" :disabled="loadingRange || rangeEof" @click="loadNextRange">
          下一段
          <template #icon><n-icon :component="ChevronRightIcon" /></template>
        </n-button>
      </div>
    </section>

    <main v-if="!loadError" class="json-main" :class="{ 'inspector-hidden': !inspectorVisible && !rangeMode }">
      <section class="source-pane" :aria-label="viewMode === 'source' ? 'JSON 源码' : 'JSON 树形预览'">
        <div v-if="loading" class="loading-state">
          <n-spin size="small" />
          <span>正在读取并分析</span>
        </div>
        <div v-show="viewMode === 'source'" ref="editorHost" class="editor-host"></div>
        <div v-if="viewMode === 'tree'" class="tree-pane">
          <header class="tree-toolbar">
            <div>
              <strong>结构预览</strong>
              <span>{{ analysis?.paths.length ?? 0 }} 个节点</span>
            </div>
            <div>
              <n-button quaternary circle size="small" title="折叠全部节点" @click="collapseAllTree">
                <template #icon><n-icon :component="FoldIcon" /></template>
              </n-button>
              <n-button quaternary circle size="small" title="展开全部节点" @click="expandAllTree">
                <template #icon><n-icon :component="UnfoldIcon" /></template>
              </n-button>
            </div>
          </header>
          <div
            ref="treeViewport"
            class="tree-rows"
            role="tree"
            aria-label="JSON 节点"
            @scroll.passive="handleTreeScroll"
          >
            <div class="tree-virtual-space" :style="{ height: `${treeVirtualHeight}px` }">
              <div class="tree-window" :style="{ transform: `translateY(${treeWindowOffset}px)` }">
                <div
                  v-for="entry in visibleTreePaths"
                  :key="`${entry.path}-${entry.start}`"
                  class="tree-row"
                  :class="{ selected: selectedTreeStart === entry.start }"
                  :style="{ '--tree-depth': Math.min(entry.depth - 1, 16) }"
                  :data-kind="entry.kind"
                  role="treeitem"
                  :aria-level="entry.depth"
                  :aria-expanded="entry.childCount ? !collapsedTreeNodes.has(entry.start) : undefined"
                  @click="selectedTreeStart = entry.start"
                >
              <button
                v-if="entry.childCount"
                class="tree-toggle"
                type="button"
                :title="collapsedTreeNodes.has(entry.start) ? '展开节点' : '折叠节点'"
                @click.stop="toggleTreeNode(entry.start)"
              >
                <ChevronRightIcon v-if="collapsedTreeNodes.has(entry.start)" :size="15" />
                <ChevronDownIcon v-else :size="15" />
              </button>
              <span v-else class="tree-toggle-spacer"></span>
              <button class="tree-node-main" type="button" @dblclick="showSourceRange(entry)">
                <strong>{{ entry.label }}</strong>
                <small>{{ kindLabel(entry.kind) }}<template v-if="entry.childCount"> · {{ entry.childCount }} 项</template></small>
                <code>{{ entry.preview }}</code>
              </button>
                  <div class="tree-node-actions">
                <n-button
                  v-if="entry.kind === 'object'"
                  quaternary
                  circle
                  size="tiny"
                  title="新增对象属性"
                  :disabled="propertyAppendDisabled"
                  @click.stop="openPropertyAppend(entry)"
                >
                  <template #icon><n-icon :component="AddPropertyIcon" /></template>
                </n-button>
                <n-button
                  v-if="entry.kind === 'array'"
                  quaternary
                  circle
                  size="tiny"
                  title="追加数组项"
                  :disabled="arrayAppendDisabled"
                  @click.stop="openArrayAppend(entry)"
                >
                  <template #icon><n-icon :component="AddPropertyIcon" /></template>
                </n-button>
                <n-button
                  v-if="entry.keyStart !== undefined && entry.keyEnd !== undefined"
                  quaternary
                  circle
                  size="tiny"
                  title="重命名对象键"
                  :disabled="keyRenameDisabled"
                  @click.stop="openKeyRename(entry)"
                >
                  <template #icon><n-icon :component="RenameKeyIcon" /></template>
                </n-button>
                <n-button
                  v-if="isScalarKind(entry.kind)"
                  quaternary
                  circle
                  size="tiny"
                  title="编辑标量值"
                  :disabled="scalarEditDisabled"
                  @click.stop="openScalarEditor(entry)"
                >
                  <template #icon><n-icon :component="EditIcon" /></template>
                </n-button>
                <n-button
                  v-if="entry.keyStart !== undefined && entry.keyEnd !== undefined"
                  quaternary
                  circle
                  size="tiny"
                  title="删除对象属性"
                  :disabled="propertyRemoveDisabled"
                  @click.stop="requestPropertyRemove(entry)"
                >
                  <template #icon><n-icon :component="RemovePropertyIcon" /></template>
                </n-button>
                <n-button
                  v-if="entry.arrayIndex !== undefined"
                  quaternary
                  circle
                  size="tiny"
                  title="删除数组项"
                  :disabled="arrayRemoveDisabled"
                  @click.stop="requestArrayRemove(entry)"
                >
                  <template #icon><n-icon :component="RemovePropertyIcon" /></template>
                </n-button>
                <n-button quaternary circle size="tiny" title="定位到源码" @click.stop="showSourceRange(entry)">
                  <template #icon><n-icon :component="LocateIcon" /></template>
                </n-button>
                <n-button quaternary circle size="tiny" title="复制节点值" @click.stop="copySourceRange(entry)">
                  <template #icon><n-icon :component="CopyValueIcon" /></template>
                </n-button>
                <n-button quaternary circle size="tiny" title="复制 JSON Path" @click.stop="copyPath(entry.path)">
                  <template #icon><n-icon :component="CopyIcon" /></template>
                </n-button>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="analysis?.pathsTruncated" class="tree-limit-note">
              节点目录已达到 20,000 项安全分析上限，可使用字段路径筛选定位已分析内容。
            </div>
          </div>
        </div>
      </section>

      <aside v-if="rangeMode" class="analysis-pane range-search-pane" aria-label="大 JSON 流式搜索">
        <div class="analysis-header">
          <div>
            <span class="section-label">范围模式</span>
            <strong class="valid">源文件保持只读</strong>
          </div>
          <n-tag size="small" :bordered="false">{{ formatBytes(fileSize) }}</n-tag>
        </div>
        <p class="range-search-help">
          搜索会按 1 MiB 分块扫描整个文件，只保存最多 100 条结果，不会把全文载入内存。
        </p>
        <n-input
          v-model:value="rangeSearchQuery"
          size="small"
          clearable
          placeholder="输入至少 2 个字符"
          :maxlength="128"
          aria-label="搜索大 JSON 全文"
          :disabled="rangeSearchPending"
          @keyup.enter="searchRangeDocument"
        >
          <template #prefix><SearchIcon :size="14" /></template>
        </n-input>
        <n-button
          data-testid="json-range-search"
          type="primary"
          size="small"
          block
          :loading="rangeSearchPending"
          :disabled="rangeSearchQuery.trim().length < 2"
          @click="searchRangeDocument"
        >
          搜索整个文件
        </n-button>
        <div v-if="rangeSearchPending || rangeSearchProgress > 0" class="range-search-progress" aria-live="polite">
          <div>
            <span>{{ rangeSearchPending ? '正在扫描' : '扫描完成' }}</span>
            <strong>{{ rangeSearchProgress }}%</strong>
          </div>
          <n-progress type="line" :percentage="rangeSearchProgress" :show-indicator="false" :height="5" />
        </div>
        <div class="diagnostic-heading">
          <strong>匹配结果</strong>
          <span>{{ rangeSearchResults.length }}{{ rangeSearchTruncated ? '+' : '' }}</span>
        </div>
        <div class="range-search-results" data-testid="json-range-search-results">
          <button
            v-for="result in rangeSearchResults"
            :key="`${result.segmentOffset}-${result.index}`"
            type="button"
            class="range-search-result"
            @click="jumpToRangeResult(result)"
          >
            <strong>{{ formatBytes(result.segmentOffset) }} 附近</strong>
            <code>{{ result.preview }}</code>
          </button>
          <div v-if="rangeSearchCompleted && !rangeSearchResults.length" class="empty-paths">整个文件没有匹配内容。</div>
          <div v-else-if="!rangeSearchCompleted && !rangeSearchPending" class="empty-paths">输入关键词后扫描整个文件。</div>
        </div>
        <div class="structure-status range-boundary-note">
          <ShieldCheckIcon :size="17" />
          <div>
            <strong>小文件能力不受影响</strong>
            <span>小于 4 MiB 的 JSON 仍可完整编辑、分析和切换树形；大文件保存与结构编辑保持关闭。</span>
          </div>
        </div>
      </aside>

      <aside v-else class="analysis-pane" aria-label="JSON 诊断">
        <div class="analysis-header">
          <div>
            <span class="section-label">解析状态</span>
            <strong :class="analysis?.valid ? 'valid' : 'invalid'">
              {{ analysisPending ? '正在分析' : analysis?.valid ? '语法有效' : '需要修复' }}
            </strong>
          </div>
          <n-tag size="small" :bordered="false">{{ formatLabel }}</n-tag>
        </div>

        <div class="metric-grid">
          <div><span>根节点</span><strong>{{ rootKindLabel }}</strong></div>
          <div><span>节点</span><strong>{{ analysis?.nodeCount ?? 0 }}</strong></div>
          <div><span>属性</span><strong>{{ analysis?.propertyCount ?? 0 }}</strong></div>
          <div><span>最大深度</span><strong>{{ analysis?.maxDepth ?? 0 }}</strong></div>
          <div><span>注释</span><strong>{{ analysis?.commentCount ?? 0 }}</strong></div>
          <div><span>源码大小</span><strong>{{ formatBytes(sourceSize) }}</strong></div>
        </div>

        <div class="structure-status">
          <ShieldCheckIcon v-if="analysis?.structureEditCandidate" :size="17" />
          <ShieldAlertIcon v-else :size="17" />
          <div>
            <strong>{{ analysis?.structureEditCandidate ? '可安全进入结构编辑' : '暂不进入结构编辑' }}</strong>
            <span>{{ structureStatusText }}</span>
          </div>
        </div>

        <section class="path-browser" aria-label="字段路径与快速定位">
          <div class="diagnostic-heading">
            <strong>字段路径与快速定位</strong>
            <span>{{ analysis?.paths.length ?? 0 }}{{ analysis?.pathsTruncated ? '+' : '' }}</span>
          </div>
          <p class="path-help">
            按字段名、路径或值查找内容。点击结果会切换到源码并定位，例如 <code>$.items[0].name</code>。
          </p>
          <n-input
            v-model:value="pathQuery"
            size="small"
            clearable
            placeholder="输入字段名、路径或值"
            aria-label="筛选字段路径"
          >
            <template #prefix><SearchIcon :size="14" /></template>
          </n-input>
          <div class="path-results">
            <div
              v-for="entry in filteredPaths"
              :key="`${entry.path}-${entry.start}`"
              class="path-item"
            >
              <button type="button" @click="showSourceRange(entry)">
                <code>{{ entry.path }}</code>
                <small>{{ kindLabel(entry.kind) }} · 第 {{ entry.line }} 行</small>
                <span>{{ entry.preview }}</span>
              </button>
              <n-button quaternary circle size="tiny" title="复制字段路径" @click="copyPath(entry.path)">
                <template #icon><n-icon :component="CopyIcon" /></template>
              </n-button>
            </div>
            <div v-if="!analysis?.valid" class="empty-paths">修复 JSON 语法后，这里会列出可定位的字段路径。</div>
            <div v-else-if="!filteredPaths.length" class="empty-paths">
              {{ pathQuery.trim() ? '没有匹配的字段、路径或值。' : '当前文档没有可导航的字段。' }}
            </div>
            <div v-else-if="!pathQuery.trim() && (analysis?.paths.length ?? 0) > filteredPaths.length" class="path-result-note">
              先展示前 200 项，输入关键词可筛选全部已分析路径。
            </div>
          </div>
        </section>

        <div class="diagnostic-heading">
          <strong>诊断</strong>
          <span>{{ analysis?.diagnostics.length ?? 0 }}</span>
        </div>
        <div v-if="!analysis?.diagnostics.length" class="empty-diagnostics">
          <CircleCheckIcon :size="18" />
          <span>未发现语法或数据保真风险</span>
        </div>
        <button
          v-for="(diagnostic, index) in analysis?.diagnostics"
          :key="`${diagnostic.code}-${diagnostic.start}-${index}`"
          class="diagnostic-item"
          :class="diagnostic.severity"
          type="button"
          @click="revealDiagnostic(diagnostic)"
        >
          <AlertCircleIcon :size="16" />
          <span>
            <strong>{{ diagnosticTitle(diagnostic.code) }}</strong>
            <small>第 {{ diagnostic.line }} 行，第 {{ diagnostic.column }} 列</small>
            <em>{{ diagnostic.message }}</em>
            <code v-if="diagnostic.path">{{ diagnostic.path }}</code>
          </span>
        </button>
      </aside>
    </main>

    <n-modal
      v-model:show="scalarEditVisible"
      preset="card"
      class="scalar-edit-dialog"
      title="编辑 JSON 标量"
      :mask-closable="!scalarEditPending"
      :closable="!scalarEditPending"
    >
      <div class="scalar-edit-context">
        <code>{{ scalarEditEntry?.path }}</code>
        <span>{{ kindLabel(scalarEditEntry?.kind || '') }}</span>
      </div>
      <n-input
        v-model:value="scalarEditValue"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 8 }"
        :disabled="scalarEditPending"
        placeholder="输入 JSON 标量字面量"
        aria-label="JSON 标量字面量"
        autofocus
      />
      <template #footer>
        <div class="scalar-edit-actions">
          <n-button :disabled="scalarEditPending" @click="scalarEditVisible = false">取消</n-button>
          <n-button
            type="primary"
            :loading="scalarEditPending"
            :disabled="!scalarEditValue.trim()"
            @click="applyScalarEdit"
          >
            应用到草稿
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="keyRenameVisible"
      preset="card"
      class="scalar-edit-dialog"
      title="重命名对象键"
      :mask-closable="!keyRenamePending"
      :closable="!keyRenamePending"
    >
      <div class="scalar-edit-context">
        <code>{{ keyRenameEntry?.path }}</code>
        <span>对象属性</span>
      </div>
      <n-input
        v-model:value="keyRenameValue"
        :disabled="keyRenamePending"
        :maxlength="4096"
        show-count
        placeholder="输入新的对象键"
        aria-label="新的 JSON 对象键"
        autofocus
        @keyup.enter="applyKeyRename"
      />
      <template #footer>
        <div class="scalar-edit-actions">
          <n-button :disabled="keyRenamePending" @click="keyRenameVisible = false">取消</n-button>
          <n-button
            type="primary"
            :loading="keyRenamePending"
            :disabled="keyRenameValue.length > 4096"
            @click="applyKeyRename"
          >
            应用到草稿
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="propertyAppendVisible"
      preset="card"
      class="scalar-edit-dialog"
      title="新增对象属性"
      :mask-closable="!propertyAppendPending"
      :closable="!propertyAppendPending"
    >
      <div class="scalar-edit-context">
        <code>{{ propertyAppendEntry?.path }}</code>
        <span>对象</span>
      </div>
      <div class="property-append-fields">
        <n-input
          v-model:value="propertyAppendKey"
          :disabled="propertyAppendPending"
          :maxlength="4096"
          show-count
          placeholder="属性名"
          aria-label="JSON 对象属性名"
          autofocus
        />
        <n-input
          v-model:value="propertyAppendValue"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :disabled="propertyAppendPending"
          placeholder="属性值，例如 null、42、&quot;text&quot;、[] 或 {}"
          aria-label="JSON 对象属性值"
        />
      </div>
      <template #footer>
        <div class="scalar-edit-actions">
          <n-button :disabled="propertyAppendPending" @click="propertyAppendVisible = false">取消</n-button>
          <n-button
            type="primary"
            :loading="propertyAppendPending"
            :disabled="propertyAppendKey.length > 4096 || !propertyAppendValue.trim()"
            @click="applyPropertyAppend"
          >
            添加到草稿
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="arrayAppendVisible"
      preset="card"
      class="scalar-edit-dialog"
      title="追加数组项"
      :mask-closable="!arrayAppendPending"
      :closable="!arrayAppendPending"
    >
      <div class="scalar-edit-context">
        <code>{{ arrayAppendEntry?.path }}</code>
        <span>数组</span>
      </div>
      <n-input
        v-model:value="arrayAppendValue"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 8 }"
        :disabled="arrayAppendPending"
        placeholder="数组项，例如 null、42、&quot;text&quot;、[] 或 {}"
        aria-label="新的 JSON 数组项"
        autofocus
      />
      <template #footer>
        <div class="scalar-edit-actions">
          <n-button :disabled="arrayAppendPending" @click="arrayAppendVisible = false">取消</n-button>
          <n-button
            type="primary"
            :loading="arrayAppendPending"
            :disabled="!arrayAppendValue.trim()"
            @click="applyArrayAppend"
          >
            添加到草稿
          </n-button>
        </div>
      </template>
    </n-modal>

    <footer class="json-statusbar" aria-live="polite">
      <span>{{ rangeMode ? '大文件渐进只读' : readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span>
      <span>{{ encoding.toUpperCase() }}</span>
      <span v-if="rangeMode">{{ rangePositionLabel }}</span>
      <template v-else>
        <span>{{ lineCount }} 行</span>
        <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
      </template>
      <span v-if="format?.id === 'jsonc'">允许注释与尾随逗号</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '../services/tauriRuntime'
import { basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import {
  AlertCircle as AlertCircleIcon,
  AlertTriangle as AlertIcon,
  ArrowLeft as ArrowLeftIcon,
  Braces as FormatIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  ClipboardCopy as CopyValueIcon,
  Code2 as SourceIcon,
  Copy as CopyIcon,
  Pencil as EditIcon,
  FileJson as FileJsonIcon,
  FoldVertical as FoldIcon,
  KeyRound as RenameKeyIcon,
  ListPlus as AddPropertyIcon,
  ListTree as TreeIcon,
  LocateFixed as LocateIcon,
  Minimize2 as MinifyIcon,
  PanelRight as InspectorIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  SlidersHorizontal as ToolsIcon,
  ShieldAlert as ShieldAlertIcon,
  ShieldCheck as ShieldCheckIcon,
  Trash2 as RemovePropertyIcon,
  UnfoldVertical as UnfoldIcon,
} from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useResponsiveInspector } from '../composables/useResponsiveInspector'
import { type TabInfo, useAppStore } from '../store/app'
import { confirmAppAction } from '../services/appDialog'

interface TextDocumentSnapshot {
  content: string
  encoding: string
  signature: string
  size: number
  modified: number
  readOnlyReason?: string
  path: string
}

interface TextDocumentRangeSnapshot {
  content: string
  encoding: string
  offset: number
  nextOffset: number
  eof: boolean
  size: number
  modified: number
  readOnlyReason: string
  path: string
}

interface RangeSearchResult {
  segmentOffset: number
  index: number
  preview: string
}

interface JsonDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  start: number
  end: number
  line: number
  column: number
  path?: string
}

interface JsonSourceAnalysis {
  valid: boolean
  mode: 'json' | 'jsonc'
  rootKind?: string
  nodeCount: number
  propertyCount: number
  maxDepth: number
  commentCount: number
  duplicateKeyCount: number
  precisionSensitiveNumberCount: number
  structureEditCandidate: boolean
  paths: JsonPathEntry[]
  pathsTruncated: boolean
  diagnostics: JsonDiagnostic[]
}

interface JsonPathEntry {
  path: string
  label: string
  kind: string
  depth: number
  childCount: number
  start: number
  end: number
  keyStart?: number
  keyEnd?: number
  arrayIndex?: number
  line: number
  column: number
  preview: string
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const { inspectorVisible, toggleInspector } = useResponsiveInspector(780)
const editorHost = ref<HTMLElement | null>(null)
const treeViewport = ref<HTMLElement | null>(null)
const jsonPath = computed(() => String(route.query.path || ''))
const isExternal = computed(() => route.query.external === '1')
const format = computed(() => findFileFormat(jsonPath.value))
const formatLabel = computed(() => format.value?.label || 'JSON')
const fileName = computed(() => jsonPath.value.split(/[\\/]/).pop() || '未命名 JSON')
const currentTab = computed(() => store.tabs.find(tab => tab.path === jsonPath.value))
const loading = ref(true)
const saving = ref(false)
const loadingRange = ref(false)
const loadError = ref('')
const analysis = ref<JsonSourceAnalysis | null>(null)
const analysisPending = ref(false)
const transformPending = ref(false)
const pathQuery = ref('')
const deferredPathQuery = ref('')
const advancedToolsVisible = ref(true)
const viewMode = ref<'source' | 'tree'>('source')
const collapsedTreeNodes = ref<Set<number>>(new Set())
const selectedTreeStart = ref<number | null>(null)
const treeScrollTop = ref(0)
const treeViewportHeight = ref(480)
const TREE_ROW_HEIGHT = 44
const TREE_OVERSCAN_ROWS = 8
const LARGE_TREE_AUTO_COLLAPSE_NODES = 500
const scalarEditVisible = ref(false)
const scalarEditPending = ref(false)
const scalarEditEntry = ref<JsonPathEntry | null>(null)
const scalarEditValue = ref('')
const scalarEditSource = ref('')
const keyRenameVisible = ref(false)
const keyRenamePending = ref(false)
const keyRenameEntry = ref<JsonPathEntry | null>(null)
const keyRenameValue = ref('')
const keyRenameSource = ref('')
const propertyAppendVisible = ref(false)
const propertyAppendPending = ref(false)
const propertyAppendEntry = ref<JsonPathEntry | null>(null)
const propertyAppendKey = ref('')
const propertyAppendValue = ref('null')
const propertyAppendSource = ref('')
const arrayAppendVisible = ref(false)
const arrayAppendPending = ref(false)
const arrayAppendEntry = ref<JsonPathEntry | null>(null)
const arrayAppendValue = ref('null')
const arrayAppendSource = ref('')
const propertyRemovePendingStart = ref<number | null>(null)
const arrayRemovePendingStart = ref<number | null>(null)
const dirty = ref(false)
const sourceContent = ref('')
const sourceSize = ref(0)
const signature = ref('')
const encoding = ref('utf-8')
const fileSize = ref(0)
const modified = ref(0)
const readOnlyReason = ref('')
const rangeOffset = ref(0)
const rangeNextOffset = ref(0)
const rangeEof = ref(true)
const rangeHistory = ref<number[]>([])
const rangeHistoryIndex = ref(-1)
const rangeSearchQuery = ref('')
const rangeSearchPending = ref(false)
const rangeSearchProgress = ref(0)
const rangeSearchCompleted = ref(false)
const rangeSearchTruncated = ref(false)
const rangeSearchResults = ref<RangeSearchResult[]>([])
const cursorLine = ref(1)
const cursorColumn = ref(1)
const lineCount = ref(1)
const readOnly = computed(() => Boolean(readOnlyReason.value))
const rangeMode = computed(() => readOnlyReason.value === 'large-file-range')
const rangeLoadedBytes = computed(() => Math.max(0, rangeNextOffset.value - rangeOffset.value))
const rangeProgress = computed(() => fileSize.value
  ? Math.min(100, Math.max(0, Math.round(rangeNextOffset.value / fileSize.value * 100)))
  : 0)
const rangePositionLabel = computed(() => fileSize.value
  ? `${formatBytes(rangeOffset.value)}–${formatBytes(rangeNextOffset.value)} / ${formatBytes(fileSize.value)}`
  : '等待范围信息')
const transformDisabled = computed(() => (
  loading.value
  || saving.value
  || transformPending.value
  || readOnly.value
  || !analysis.value?.valid
))
const scalarEditDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || scalarEditPending.value
  || !analysis.value?.structureEditCandidate
))
const keyRenameDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || keyRenamePending.value
  || !analysis.value?.structureEditCandidate
))
const propertyAppendDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || propertyAppendPending.value
  || !analysis.value?.structureEditCandidate
))
const arrayAppendDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || arrayAppendPending.value
  || !analysis.value?.structureEditCandidate
))
const propertyRemoveDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || propertyRemovePendingStart.value !== null
  || !analysis.value?.structureEditCandidate
))
const arrayRemoveDisabled = computed(() => (
  loading.value
  || analysisPending.value
  || readOnly.value
  || saving.value
  || transformPending.value
  || arrayRemovePendingStart.value !== null
  || !analysis.value?.structureEditCandidate
))
let editor: EditorView | null = null
let loadGeneration = 0
let analysisGeneration = 0
let rangeSearchGeneration = 0
let analysisTimer: ReturnType<typeof setTimeout> | null = null
let pathQueryTimer: ReturnType<typeof setTimeout> | null = null
let applyingDocument = false
let unlistenSave: (() => void) | null = null
let unlistenRefresh: (() => void) | null = null
const LARGE_JSON_RANGE_THRESHOLD_BYTES = 4 * 1024 * 1024
const JSON_RANGE_BYTES = 512 * 1024
const JSON_SEARCH_RANGE_BYTES = 1024 * 1024
const MAX_RANGE_SEARCH_RESULTS = 100

const rootKindLabel = computed(() => ({
  object: '对象',
  array: '数组',
  string: '字符串',
  number: '数字',
  boolean: '布尔值',
  null: 'Null',
}[analysis.value?.rootKind || ''] || '未解析'))

const structureStatusText = computed(() => {
  if (!analysis.value?.valid) return '语法有效后才能判断结构编辑兼容性'
  const risks: string[] = []
  if (analysis.value.duplicateKeyCount) risks.push(`${analysis.value.duplicateKeyCount} 个重复键`)
  if (analysis.value.precisionSensitiveNumberCount) risks.push(`${analysis.value.precisionSensitiveNumberCount} 个精度敏感数字`)
  return risks.length ? `${risks.join('、')}需要保留原始字面量` : '当前结构没有发现重复键或数字精度风险'
})

const filteredPaths = computed(() => {
  const query = deferredPathQuery.value.trim().toLocaleLowerCase()
  const paths = analysis.value?.paths || []
  if (!query) return paths.slice(0, 200)
  const matches: JsonPathEntry[] = []
  for (const entry of paths) {
    if (
      entry.path.toLocaleLowerCase().includes(query)
      || entry.preview.toLocaleLowerCase().includes(query)
    ) {
      matches.push(entry)
      if (matches.length === 200) break
    }
  }
  return matches
})

const treeIndex = computed(() => {
  const paths = analysis.value?.paths || []
  const roots: JsonPathEntry[] = []
  const children = new Map<number, JsonPathEntry[]>()
  const ancestors: JsonPathEntry[] = []
  for (const entry of paths) {
    const parent = entry.depth > 1 ? ancestors[entry.depth - 2] : undefined
    if (parent) {
      const siblings = children.get(parent.start)
      if (siblings) siblings.push(entry)
      else children.set(parent.start, [entry])
    } else {
      roots.push(entry)
    }
    ancestors[entry.depth - 1] = entry
    ancestors.length = entry.depth
  }
  return { roots, children }
})

const expandedTreePaths = computed(() => {
  const visible: JsonPathEntry[] = []
  const pending = [...treeIndex.value.roots].reverse()
  while (pending.length) {
    const entry = pending.pop()!
    visible.push(entry)
    if (collapsedTreeNodes.value.has(entry.start)) continue
    const children = treeIndex.value.children.get(entry.start)
    if (children) {
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index])
    }
  }
  return visible
})

const treeWindow = computed(() => {
  const start = Math.max(0, Math.floor(treeScrollTop.value / TREE_ROW_HEIGHT) - TREE_OVERSCAN_ROWS)
  const visibleRows = Math.ceil(treeViewportHeight.value / TREE_ROW_HEIGHT) + TREE_OVERSCAN_ROWS * 2
  const end = Math.min(expandedTreePaths.value.length, start + visibleRows)
  return { start, entries: expandedTreePaths.value.slice(start, end) }
})
const visibleTreePaths = computed(() => treeWindow.value.entries)
const treeWindowOffset = computed(() => treeWindow.value.start * TREE_ROW_HEIGHT)
const treeVirtualHeight = computed(() => expandedTreePaths.value.length * TREE_ROW_HEIGHT)

const syncCurrentTab = (isDirty = dirty.value) => {
  if (!editor || !jsonPath.value) return
  const tab = store.tabs.find(item => item.path === jsonPath.value)
  if (!tab) return
  tab.content = editor.state.doc.toString()
  tab.isDirty = isDirty
  tab.textSignature = signature.value
  tab.textEncoding = encoding.value
  tab.textReadOnlyReason = readOnlyReason.value
  tab.textSize = fileSize.value
  tab.textModified = modified.value
}

const registerCurrentTab = () => {
  store.addTab({
    id: jsonPath.value,
    title: fileName.value,
    path: jsonPath.value,
    isDirty: dirty.value,
    external: isExternal.value,
  })
  syncCurrentTab(dirty.value)
}

const clearAnalysisTimer = () => {
  if (analysisTimer) clearTimeout(analysisTimer)
  analysisTimer = null
}

const measureTreeViewport = () => {
  if (treeViewport.value) treeViewportHeight.value = Math.max(TREE_ROW_HEIGHT, treeViewport.value.clientHeight)
}

const handleTreeScroll = (event: Event) => {
  treeScrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

const resetTreeForAnalysis = (result: JsonSourceAnalysis) => {
  collapsedTreeNodes.value = result.paths.length >= LARGE_TREE_AUTO_COLLAPSE_NODES
    ? new Set(result.paths.filter(entry => entry.childCount > 0 && entry.depth > 1).map(entry => entry.start))
    : new Set()
  selectedTreeStart.value = null
  treeScrollTop.value = 0
  if (treeViewport.value) treeViewport.value.scrollTop = 0
}

const analyzeContent = async (content: string) => {
  const generation = ++analysisGeneration
  analysisPending.value = true
  sourceSize.value = new TextEncoder().encode(content).length
  try {
    const result = await invoke<JsonSourceAnalysis>('analyze_json_source', {
      content,
      jsonc: format.value?.id === 'jsonc',
    })
    if (generation === analysisGeneration && sourceContent.value === content) {
      analysis.value = result
      resetTreeForAnalysis(result)
      if (!result.valid) viewMode.value = 'source'
    }
    return result
  } finally {
    if (generation === analysisGeneration) analysisPending.value = false
  }
}

const scheduleAnalysis = () => {
  clearAnalysisTimer()
  const content = sourceContent.value
  analysisTimer = setTimeout(() => {
    void analyzeContent(content).catch(cause => {
      message.error(`实时分析失败：${errorMessage(cause)}`)
    })
  }, 280)
}

const editorExtensions = (isReadOnly: boolean) => [
  basicSetup,
  json(),
  EditorState.readOnly.of(isReadOnly),
  EditorView.editable.of(!isReadOnly),
  EditorView.lineWrapping,
  EditorView.updateListener.of(update => {
    if (update.docChanged) {
      sourceContent.value = update.state.doc.toString()
      lineCount.value = update.state.doc.lines
      selectedTreeStart.value = null
      if (!applyingDocument) {
        dirty.value = true
        syncCurrentTab(true)
        scheduleAnalysis()
      }
    }
    if (update.docChanged || update.selectionSet) {
      const position = update.state.selection.main.head
      const line = update.state.doc.lineAt(position)
      cursorLine.value = line.number
      cursorColumn.value = position - line.from + 1
    }
  }),
  ...codeMirrorThemeExtensions,
]

const createEditor = () => {
  if (!editorHost.value) return
  editor?.destroy()
  editor = new EditorView({
    state: EditorState.create({ doc: '', extensions: editorExtensions(true) }),
    parent: editorHost.value,
  })
}

const replaceDocument = (content: string, isReadOnly: boolean) => {
  if (!editor) return
  applyingDocument = true
  editor.setState(EditorState.create({ doc: content, extensions: editorExtensions(isReadOnly) }))
  applyingDocument = false
  sourceContent.value = content
  sourceSize.value = new TextEncoder().encode(content).length
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
}

const applySnapshot = async (loaded: TextDocumentSnapshot) => {
  rangeSearchGeneration += 1
  rangeSearchPending.value = false
  rangeSearchProgress.value = 0
  rangeSearchCompleted.value = false
  rangeSearchTruncated.value = false
  rangeSearchResults.value = []
  rangeOffset.value = 0
  rangeNextOffset.value = loaded.size
  rangeEof.value = true
  rangeHistory.value = []
  rangeHistoryIndex.value = -1
  signature.value = loaded.signature
  encoding.value = loaded.encoding
  fileSize.value = loaded.size
  modified.value = loaded.modified
  readOnlyReason.value = loaded.readOnlyReason || ''
  dirty.value = false
  replaceDocument(loaded.content, Boolean(loaded.readOnlyReason))
  registerCurrentTab()
  await analyzeContent(loaded.content)
}

const readRange = (offset: number, selectedEncoding?: string, length = JSON_RANGE_BYTES) => invoke<TextDocumentRangeSnapshot>(
  isExternal.value ? 'read_external_text_document_range' : 'read_text_document_range',
  {
    ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
    path: jsonPath.value,
    formatId: format.value?.id,
    offset,
    length,
    readOptions: selectedEncoding ? { encoding: selectedEncoding } : undefined,
  },
)

const applyRangeSnapshot = (loaded: TextDocumentRangeSnapshot, history: 'reset' | 'append' | 'keep' = 'keep') => {
  if (modified.value && loaded.offset > 0 && loaded.modified !== modified.value) {
    throw new Error('文件在分段读取期间已被外部修改，请重新加载首段')
  }
  rangeSearchGeneration += 1
  rangeSearchPending.value = false
  signature.value = ''
  encoding.value = loaded.encoding
  fileSize.value = loaded.size
  modified.value = loaded.modified
  readOnlyReason.value = loaded.readOnlyReason
  rangeOffset.value = loaded.offset
  rangeNextOffset.value = loaded.nextOffset
  rangeEof.value = loaded.eof
  dirty.value = false
  analysis.value = null
  analysisPending.value = false
  viewMode.value = 'source'
  replaceDocument(loaded.content, true)
  if (history === 'reset') {
    rangeHistory.value = [loaded.offset]
    rangeHistoryIndex.value = 0
  } else if (history === 'append') {
    const retained = rangeHistory.value.slice(0, rangeHistoryIndex.value + 1)
    if (retained[retained.length - 1] !== loaded.offset) retained.push(loaded.offset)
    rangeHistory.value = retained
    rangeHistoryIndex.value = retained.length - 1
  } else {
    const existingIndex = rangeHistory.value.indexOf(loaded.offset)
    if (existingIndex >= 0) rangeHistoryIndex.value = existingIndex
  }
  registerCurrentTab()
}

const restoreTabDraft = async (tab: TabInfo) => {
  signature.value = tab.textSignature || ''
  encoding.value = tab.textEncoding || 'utf-8'
  fileSize.value = tab.textSize || 0
  modified.value = tab.textModified || 0
  readOnlyReason.value = tab.textReadOnlyReason || ''
  dirty.value = true
  replaceDocument(tab.content || '', Boolean(tab.textReadOnlyReason))
  store.activateTab(tab.id)
  await analyzeContent(tab.content || '')
}

const errorMessage = (cause: unknown) => {
  const value = cause as { message?: string; suggestion?: string }
  const detail = value?.message || String(cause).replace(/^Error:\s*/, '')
  return value?.suggestion ? `${detail} · ${value.suggestion}` : detail
}

const load = async (discardDraft = false) => {
  const generation = ++loadGeneration
  rangeSearchGeneration += 1
  rangeSearchPending.value = false
  rangeSearchProgress.value = 0
  rangeSearchCompleted.value = false
  rangeSearchTruncated.value = false
  rangeSearchResults.value = []
  scalarEditVisible.value = false
  scalarEditEntry.value = null
  scalarEditSource.value = ''
  keyRenameVisible.value = false
  keyRenameEntry.value = null
  keyRenameSource.value = ''
  propertyAppendVisible.value = false
  propertyAppendEntry.value = null
  propertyAppendSource.value = ''
  arrayAppendVisible.value = false
  arrayAppendEntry.value = null
  arrayAppendSource.value = ''
  propertyRemovePendingStart.value = null
  arrayRemovePendingStart.value = null
  analysisGeneration += 1
  analysisPending.value = false
  clearAnalysisTimer()
  loading.value = true
  loadError.value = ''
  analysis.value = null
  try {
    if (!jsonPath.value || !['json', 'jsonc'].includes(format.value?.id || '')) {
      throw new Error('当前路径不是已注册的 JSON 或 JSONC 文件')
    }
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) {
      await restoreTabDraft(draft)
      return
    }
    const firstRange = await readRange(0)
    if (generation !== loadGeneration) return
    if (firstRange.size > LARGE_JSON_RANGE_THRESHOLD_BYTES) {
      applyRangeSnapshot(firstRange, 'reset')
      message.info('文件超过 4 MiB，已进入渐进只读模式')
      return
    }
    const loaded = await invoke<TextDocumentSnapshot>(isExternal.value ? 'read_external_text_document' : 'read_text_document', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: jsonPath.value,
      formatId: format.value!.id,
      readOptions: undefined,
    })
    if (generation !== loadGeneration) return
    await applySnapshot(loaded)
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = errorMessage(cause)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

const loadRangeAt = async (
  offset: number,
  history: 'reset' | 'append' | 'keep',
  length = JSON_RANGE_BYTES,
) => {
  if (!rangeMode.value || loadingRange.value) return
  loadingRange.value = true
  try {
    const loaded = await readRange(offset, encoding.value, length)
    applyRangeSnapshot(loaded, history)
  } catch (cause) {
    message.error(`分段读取失败：${errorMessage(cause)}`)
  } finally {
    loadingRange.value = false
  }
}

const loadNextRange = () => {
  if (rangeEof.value) return
  void loadRangeAt(rangeNextOffset.value, 'append')
}

const loadPreviousRange = () => {
  if (rangeHistoryIndex.value <= 0) return
  void loadRangeAt(rangeHistory.value[rangeHistoryIndex.value - 1], 'keep')
}

const searchRangeDocument = async () => {
  const query = rangeSearchQuery.value.trim()
  if (!rangeMode.value || query.length < 2 || rangeSearchPending.value) return
  const generation = ++rangeSearchGeneration
  rangeSearchPending.value = true
  rangeSearchProgress.value = 0
  rangeSearchCompleted.value = false
  rangeSearchTruncated.value = false
  rangeSearchResults.value = []
  const lowerQuery = query.toLocaleLowerCase()
  let offset = 0
  let selectedEncoding: string | undefined
  let carry = ''
  let carryOffset = 0
  let resultIndex = 0
  try {
    while (offset < fileSize.value) {
      const loaded = await readRange(offset, selectedEncoding, JSON_SEARCH_RANGE_BYTES)
      if (generation !== rangeSearchGeneration) return
      if (modified.value && loaded.modified !== modified.value) {
        throw new Error('文件在搜索期间已被外部修改，请重新加载后再搜索')
      }
      selectedEncoding = loaded.encoding
      const combined = `${carry}${loaded.content}`
      const searchable = combined.toLocaleLowerCase()
      let match = searchable.indexOf(lowerQuery)
      while (match >= 0) {
        if (rangeSearchResults.value.length >= MAX_RANGE_SEARCH_RESULTS) {
          rangeSearchTruncated.value = true
          break
        }
        const previewStart = Math.max(0, match - 36)
        const previewEnd = Math.min(combined.length, match + query.length + 72)
        rangeSearchResults.value.push({
          segmentOffset: match < carry.length ? carryOffset : loaded.offset,
          index: resultIndex++,
          preview: combined.slice(previewStart, previewEnd).replace(/\s+/g, ' ').trim(),
        })
        match = searchable.indexOf(lowerQuery, match + Math.max(1, lowerQuery.length))
      }
      if (rangeSearchTruncated.value || loaded.eof || loaded.nextOffset <= offset) {
        offset = loaded.size
      } else {
        const carryLength = Math.min(Math.max(1, query.length - 1), loaded.content.length)
        carry = loaded.content.slice(-carryLength)
        carryOffset = loaded.offset
        offset = loaded.nextOffset
      }
      rangeSearchProgress.value = fileSize.value
        ? Math.min(100, Math.round(offset / fileSize.value * 100))
        : 100
    }
    rangeSearchProgress.value = 100
    rangeSearchCompleted.value = true
  } catch (cause) {
    if (generation === rangeSearchGeneration) message.error(`全文搜索失败：${errorMessage(cause)}`)
  } finally {
    if (generation === rangeSearchGeneration) rangeSearchPending.value = false
  }
}

const jumpToRangeResult = async (result: RangeSearchResult) => {
  await loadRangeAt(result.segmentOffset, 'reset', JSON_SEARCH_RANGE_BYTES)
  await nextTick()
  if (!editor) return
  const match = editor.state.doc.toString().toLocaleLowerCase().indexOf(rangeSearchQuery.value.trim().toLocaleLowerCase())
  if (match < 0) return
  editor.dispatch({
    selection: { anchor: match, head: match + rangeSearchQuery.value.trim().length },
    effects: EditorView.scrollIntoView(match, { y: 'center' }),
  })
  editor.focus()
}

const byteOffsetToCodeUnit = (content: string, byteOffset: number) => {
  const bytes = new TextEncoder().encode(content)
  return new TextDecoder().decode(bytes.slice(0, Math.min(byteOffset, bytes.length))).length
}

const revealSourceRange = (range: Pick<JsonDiagnostic, 'start' | 'end'>) => {
  if (!editor) return
  const from = byteOffsetToCodeUnit(sourceContent.value, range.start)
  const to = Math.max(from, byteOffsetToCodeUnit(sourceContent.value, range.end))
  editor.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  })
  editor.focus()
}

const revealDiagnostic = (diagnostic: JsonDiagnostic) => revealSourceRange(diagnostic)
const openSourceSearch = () => {
  if (editor) openSearchPanel(editor)
}
const foldSource = () => {
  if (editor) foldAll(editor)
}
const unfoldSource = () => {
  if (editor) unfoldAll(editor)
}
const copyPath = async (path: string) => {
  try {
    await navigator.clipboard.writeText(path)
    const pathSummary = path.length > 80 ? `${path.slice(0, 77)}...` : path
    message.success(`字段路径已复制：${pathSummary}`)
  } catch {
    message.error('复制字段路径失败')
  }
}

const sourceRangeText = (range: Pick<JsonPathEntry, 'start' | 'end'>) => {
  const from = byteOffsetToCodeUnit(sourceContent.value, range.start)
  const to = byteOffsetToCodeUnit(sourceContent.value, range.end)
  return sourceContent.value.slice(from, to)
}

const copySourceRange = async (entry: JsonPathEntry) => {
  try {
    await navigator.clipboard.writeText(sourceRangeText(entry))
    message.success('节点源码已复制')
  } catch {
    message.error('复制节点源码失败')
  }
}

const isScalarKind = (kind: string) => ['string', 'number', 'boolean', 'null'].includes(kind)

const openScalarEditor = (entry: JsonPathEntry) => {
  if (!editor || !isScalarKind(entry.kind) || scalarEditDisabled.value) return
  keyRenameVisible.value = false
  propertyAppendVisible.value = false
  arrayAppendVisible.value = false
  scalarEditEntry.value = entry
  scalarEditSource.value = editor.state.doc.toString()
  scalarEditValue.value = sourceRangeText(entry)
  scalarEditVisible.value = true
}

const applyScalarEdit = async () => {
  if (!editor || !scalarEditEntry.value || scalarEditPending.value) return
  const current = editor.state.doc.toString()
  if (current !== scalarEditSource.value) {
    message.warning('源码已发生变化，请重新选择节点')
    scalarEditVisible.value = false
    return
  }
  scalarEditPending.value = true
  clearAnalysisTimer()
  try {
    const entry = scalarEditEntry.value
    const replaced = await invoke<string>('replace_json_scalar_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      start: entry.start,
      end: entry.end,
      replacement: scalarEditValue.value.trim(),
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: replaced },
      selection: { anchor: byteOffsetToCodeUnit(replaced, entry.start) },
    })
    clearAnalysisTimer()
    scalarEditVisible.value = false
    await analyzeContent(replaced)
    message.success('标量值已更新，可撤销或保存')
  } catch (cause) {
    message.error(`标量修改失败：${errorMessage(cause)}`)
  } finally {
    scalarEditPending.value = false
  }
}

const openKeyRename = (entry: JsonPathEntry) => {
  if (
    !editor
    || entry.keyStart === undefined
    || entry.keyEnd === undefined
    || keyRenameDisabled.value
  ) return
  scalarEditVisible.value = false
  propertyAppendVisible.value = false
  arrayAppendVisible.value = false
  keyRenameEntry.value = entry
  keyRenameSource.value = editor.state.doc.toString()
  keyRenameValue.value = entry.label
  keyRenameVisible.value = true
}

const applyKeyRename = async () => {
  if (!editor || !keyRenameEntry.value || keyRenamePending.value) return
  const current = editor.state.doc.toString()
  if (current !== keyRenameSource.value) {
    message.warning('源码已发生变化，请重新选择对象键')
    keyRenameVisible.value = false
    return
  }
  const entry = keyRenameEntry.value
  if (entry.keyStart === undefined || entry.keyEnd === undefined) return
  keyRenamePending.value = true
  clearAnalysisTimer()
  try {
    const renamed = await invoke<string>('rename_json_object_key_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      keyStart: entry.keyStart,
      keyEnd: entry.keyEnd,
      newKey: keyRenameValue.value,
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: renamed },
      selection: { anchor: byteOffsetToCodeUnit(renamed, entry.keyStart) },
    })
    clearAnalysisTimer()
    keyRenameVisible.value = false
    await analyzeContent(renamed)
    message.success('对象键已重命名，可撤销或保存')
  } catch (cause) {
    message.error(`对象键重命名失败：${errorMessage(cause)}`)
  } finally {
    keyRenamePending.value = false
  }
}

const openPropertyAppend = (entry: JsonPathEntry) => {
  if (!editor || entry.kind !== 'object' || propertyAppendDisabled.value) return
  scalarEditVisible.value = false
  keyRenameVisible.value = false
  arrayAppendVisible.value = false
  propertyAppendEntry.value = entry
  propertyAppendKey.value = ''
  propertyAppendValue.value = 'null'
  propertyAppendSource.value = editor.state.doc.toString()
  propertyAppendVisible.value = true
}

const applyPropertyAppend = async () => {
  if (!editor || !propertyAppendEntry.value || propertyAppendPending.value) return
  const current = editor.state.doc.toString()
  if (current !== propertyAppendSource.value) {
    message.warning('源码已发生变化，请重新选择对象')
    propertyAppendVisible.value = false
    return
  }
  const entry = propertyAppendEntry.value
  propertyAppendPending.value = true
  clearAnalysisTimer()
  try {
    const appended = await invoke<string>('append_json_object_property_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      start: entry.start,
      end: entry.end,
      key: propertyAppendKey.value,
      value: propertyAppendValue.value,
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: appended },
      selection: { anchor: byteOffsetToCodeUnit(appended, entry.start) },
    })
    clearAnalysisTimer()
    propertyAppendVisible.value = false
    await analyzeContent(appended)
    message.success('对象属性已添加，可撤销或保存')
  } catch (cause) {
    message.error(`新增对象属性失败：${errorMessage(cause)}`)
  } finally {
    propertyAppendPending.value = false
  }
}

const openArrayAppend = (entry: JsonPathEntry) => {
  if (!editor || entry.kind !== 'array' || arrayAppendDisabled.value) return
  scalarEditVisible.value = false
  keyRenameVisible.value = false
  propertyAppendVisible.value = false
  arrayAppendEntry.value = entry
  arrayAppendValue.value = 'null'
  arrayAppendSource.value = editor.state.doc.toString()
  arrayAppendVisible.value = true
}

const applyArrayAppend = async () => {
  if (!editor || !arrayAppendEntry.value || arrayAppendPending.value) return
  const current = editor.state.doc.toString()
  if (current !== arrayAppendSource.value) {
    message.warning('源码已发生变化，请重新选择数组')
    arrayAppendVisible.value = false
    return
  }
  const entry = arrayAppendEntry.value
  arrayAppendPending.value = true
  clearAnalysisTimer()
  try {
    const appended = await invoke<string>('append_json_array_item_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      start: entry.start,
      end: entry.end,
      value: arrayAppendValue.value,
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: appended },
      selection: { anchor: byteOffsetToCodeUnit(appended, entry.start) },
    })
    clearAnalysisTimer()
    arrayAppendVisible.value = false
    await analyzeContent(appended)
    message.success('数组项已追加，可撤销或保存')
  } catch (cause) {
    message.error(`追加数组项失败：${errorMessage(cause)}`)
  } finally {
    arrayAppendPending.value = false
  }
}

const requestPropertyRemove = (entry: JsonPathEntry) => {
  if (
    !editor
    || entry.keyStart === undefined
    || entry.keyEnd === undefined
    || propertyRemoveDisabled.value
  ) return
  const source = editor.state.doc.toString()
  dialog.warning({
    title: '删除对象属性',
    content: `将从草稿中删除 ${entry.path} 及其完整值。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => applyPropertyRemove(entry, source),
  })
}

const applyPropertyRemove = async (entry: JsonPathEntry, source: string) => {
  if (
    !editor
    || entry.keyStart === undefined
    || entry.keyEnd === undefined
    || propertyRemovePendingStart.value !== null
  ) return
  const current = editor.state.doc.toString()
  if (current !== source) {
    message.warning('源码已发生变化，请重新选择对象属性')
    return
  }
  propertyRemovePendingStart.value = entry.start
  clearAnalysisTimer()
  try {
    const removed = await invoke<string>('remove_json_object_property_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      keyStart: entry.keyStart,
      keyEnd: entry.keyEnd,
      start: entry.start,
      end: entry.end,
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: removed },
      selection: { anchor: byteOffsetToCodeUnit(removed, entry.start) },
    })
    clearAnalysisTimer()
    await analyzeContent(removed)
    message.success('对象属性已删除，可撤销或保存')
  } catch (cause) {
    message.error(`删除对象属性失败：${errorMessage(cause)}`)
  } finally {
    propertyRemovePendingStart.value = null
  }
}

const requestArrayRemove = (entry: JsonPathEntry) => {
  if (!editor || entry.arrayIndex === undefined || arrayRemoveDisabled.value) return
  const source = editor.state.doc.toString()
  dialog.warning({
    title: '删除数组项',
    content: `将从草稿中删除 ${entry.path} 及其完整值，后续索引会自动前移。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => applyArrayRemove(entry, source),
  })
}

const applyArrayRemove = async (entry: JsonPathEntry, source: string) => {
  if (!editor || entry.arrayIndex === undefined || arrayRemovePendingStart.value !== null) return
  const current = editor.state.doc.toString()
  if (current !== source) {
    message.warning('源码已发生变化，请重新选择数组项')
    return
  }
  arrayRemovePendingStart.value = entry.start
  clearAnalysisTimer()
  try {
    const removed = await invoke<string>('remove_json_array_item_source', {
      content: current,
      jsonc: format.value?.id === 'jsonc',
      start: entry.start,
      end: entry.end,
    })
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: removed },
      selection: { anchor: byteOffsetToCodeUnit(removed, entry.start) },
    })
    clearAnalysisTimer()
    await analyzeContent(removed)
    message.success('数组项已删除，可撤销或保存')
  } catch (cause) {
    message.error(`删除数组项失败：${errorMessage(cause)}`)
  } finally {
    arrayRemovePendingStart.value = null
  }
}

const showSourceRange = async (entry: JsonPathEntry) => {
  viewMode.value = 'source'
  await nextTick()
  revealSourceRange(entry)
}

const toggleTreeNode = (start: number) => {
  const next = new Set(collapsedTreeNodes.value)
  if (next.has(start)) next.delete(start)
  else next.add(start)
  collapsedTreeNodes.value = next
}

const collapseAllTree = () => {
  collapsedTreeNodes.value = new Set(
    (analysis.value?.paths || [])
      .filter(entry => entry.childCount > 0)
      .map(entry => entry.start),
  )
}

const expandAllTree = () => {
  collapsedTreeNodes.value = new Set()
  message.success('已展开全部节点，长列表将按可见区域渲染')
}

const kindLabel = (kind: string) => ({
  object: '对象',
  array: '数组',
  string: '字符串',
  number: '数字',
  boolean: '布尔值',
  null: 'Null',
}[kind] || kind)

const transformSource = async (mode: 'pretty' | 'minify') => {
  if (!editor || transformDisabled.value) return
  transformPending.value = true
  try {
    const content = editor.state.doc.toString()
    const transformed = await invoke<string>('transform_json_source', {
      content,
      jsonc: format.value?.id === 'jsonc',
      mode,
    })
    if (transformed === content) {
      message.info(mode === 'pretty' ? '源码已经是格式化状态' : '源码已经是压缩状态')
      return
    }
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: transformed },
      selection: { anchor: 0 },
      effects: EditorView.scrollIntoView(0),
    })
    message.success(mode === 'pretty' ? '源码已格式化，可撤销或保存' : '源码已压缩，可撤销或保存')
  } catch (cause) {
    message.error(`源码变换失败：${errorMessage(cause)}`)
  } finally {
    transformPending.value = false
  }
}

const diagnosticTitle = (code: string) => ({
  'syntax-error': '语法错误',
  'duplicate-key': '重复对象键',
  'precision-sensitive-number': '数字精度风险',
  'source-too-large': '文件超过分析上限',
  'node-budget-exceeded': '节点超过分析上限',
  'empty-document': '空文档',
}[code] || code)

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

const save = async (allowInvalid = false) => {
  if (!editor || readOnly.value || !dirty.value || saving.value || !format.value) return
  clearAnalysisTimer()
  const content = editor.state.doc.toString()
  saving.value = true
  try {
    const currentAnalysis = await analyzeContent(content)
    if (!currentAnalysis.valid && !allowInvalid) {
      dialog.warning({
        title: '源码存在语法错误',
        content: '覆盖保存会让磁盘上的 JSON 保持非法状态。可以继续编辑修复，或明确按当前源码保存。',
        positiveText: '按源码保存',
        negativeText: '继续编辑',
        onPositiveClick: () => { void save(true) },
      })
      return
    }
    const saved = await invoke<TextDocumentSnapshot>(isExternal.value ? 'write_external_json_source_document' : 'write_json_source_document', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: jsonPath.value,
      formatId: format.value.id,
      content,
      expectedSignature: signature.value,
      allowInvalid,
    })
    if (editor.state.doc.toString() === content) {
      await applySnapshot(saved)
    } else {
      signature.value = saved.signature
      encoding.value = saved.encoding
      fileSize.value = saved.size
      modified.value = saved.modified
      dirty.value = true
      syncCurrentTab(true)
      scheduleAnalysis()
    }
    message.success(currentAnalysis.valid ? 'JSON 源码已安全保存' : '非法 JSON 已按源码保存')
  } catch (cause) {
    const error = cause as { code?: string }
    if (error?.code === 'external-modified') {
      dialog.warning({
        title: '文件已在外部修改',
        content: errorMessage(cause),
        positiveText: '重新加载',
        negativeText: '保留编辑内容',
        onPositiveClick: () => { void load(true) },
      })
    } else {
      message.error(`保存失败：${errorMessage(cause)}`)
    }
  } finally {
    saving.value = false
  }
}

const reloadFromDisk = async () => {
  if (dirty.value && !await confirmAppAction(dialog, {
    title: '重新读取 JSON？',
    content: '磁盘源码将覆盖当前未保存的 JSON 修改。',
    positiveText: '放弃修改并重新读取',
    danger: true,
  })) return
  await load(true)
}

const leaveEditor = () => router.push({ name: 'LibraryMode' })
const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

watch([jsonPath, isExternal], (_current, [previousPath]) => {
  if (previousPath) syncCurrentTab(dirty.value)
  void load()
})
watch(pathQuery, query => {
  if (pathQueryTimer) clearTimeout(pathQueryTimer)
  pathQueryTimer = setTimeout(() => {
    deferredPathQuery.value = query
  }, 120)
})
watch(viewMode, async mode => {
  if (mode !== 'tree') return
  await nextTick()
  measureTreeViewport()
})
onMounted(async () => {
  await nextTick()
  createEditor()
  await load()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', measureTreeViewport)
  unlistenSave = await listen('command-save', () => { void save() })
  unlistenRefresh = await listen('command-refresh', () => { void reloadFromDisk() })
})
onBeforeUnmount(() => {
  clearAnalysisTimer()
  if (pathQueryTimer) clearTimeout(pathQueryTimer)
  syncCurrentTab(dirty.value)
  editor?.destroy()
  editor = null
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', measureTreeViewport)
  unlistenSave?.()
  unlistenRefresh?.()
})
</script>

<style scoped>
.json-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.json-toolbar {
  flex: 0 0 48px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.document-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.editor-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-switch {
  flex: 0 0 auto;
}

.document-identity > svg {
  flex: 0 0 auto;
  color: var(--theme-primary);
}

.document-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.document-title strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title span,
.section-label,
.metric-grid span,
.structure-status span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.json-main {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
}

.json-main.inspector-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.json-main.inspector-hidden .analysis-pane {
  display: none;
}

.source-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-host {
  width: 100%;
  height: 100%;
}

.tree-pane {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--theme-bg);
}

.tree-toolbar {
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.tree-toolbar > div {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tree-toolbar strong {
  font-size: 12px;
}

.tree-toolbar span {
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.tree-rows {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 0 24px;
}

.advanced-editor-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tree-virtual-space {
  position: relative;
  min-width: 560px;
}

.tree-window {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  will-change: transform;
}

.tree-row {
  min-width: 560px;
  height: 44px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 172px;
  align-items: center;
  padding: 0 8px 0 calc(8px + var(--tree-depth) * 18px);
  border-bottom: 1px solid transparent;
}

.tree-row:nth-child(even) {
  background: color-mix(in srgb, var(--theme-surface-2) 34%, transparent);
}

.tree-row:hover,
.tree-row.selected {
  background: var(--theme-surface-2);
}

.tree-row.selected {
  border-bottom-color: rgba(var(--theme-primary-rgb), 0.2);
}

.tree-toggle,
.tree-node-main {
  border: 0;
  color: var(--theme-text);
  background: transparent;
  cursor: pointer;
}

.tree-toggle {
  width: 22px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
}

.tree-toggle-spacer {
  width: 22px;
}

.tree-node-main {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(80px, 0.6fr) 90px minmax(120px, 1.4fr);
  align-items: center;
  gap: 10px;
  height: 100%;
  padding: 0 8px;
  text-align: left;
}

.tree-node-main strong,
.tree-node-main code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node-main strong {
  font-size: 12px;
}

.tree-row[data-kind="object"] .tree-node-main strong { color: var(--code-editor-property); }
.tree-row[data-kind="array"] .tree-node-main strong { color: var(--code-editor-function); }
.tree-row[data-kind="string"] .tree-node-main code { color: var(--code-editor-string); }
.tree-row[data-kind="number"] .tree-node-main code,
.tree-row[data-kind="boolean"] .tree-node-main code,
.tree-row[data-kind="null"] .tree-node-main code { color: var(--code-editor-number); }

.tree-node-main small {
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.tree-node-main code {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.tree-node-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tree-limit-note {
  padding: 12px 16px;
  color: var(--theme-warning, #b77813);
  font-size: 11px;
}

.scalar-edit-dialog {
  width: min(520px, calc(100vw - 32px));
}

.scalar-edit-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.scalar-edit-context code {
  min-width: 0;
  overflow: hidden;
  color: var(--theme-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scalar-edit-context span {
  flex: 0 0 auto;
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.scalar-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.property-append-fields {
  display: grid;
  gap: 10px;
}

.loading-state {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--theme-text-secondary);
  background: var(--theme-bg);
}

.range-toolbar {
  flex: 0 0 58px;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(250px, 1fr) minmax(220px, 340px) auto;
  align-items: center;
  gap: 16px;
  padding: 7px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-primary) 35%, transparent);
  background: color-mix(in srgb, var(--theme-primary) 7%, var(--theme-surface));
}

.range-summary,
.range-progress {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.range-summary strong {
  color: var(--theme-primary);
  font-size: 12px;
}

.range-summary span,
.range-progress span,
.range-search-help {
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.range-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.range-search-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.range-search-help {
  margin: 0;
  overflow: visible;
  line-height: 1.55;
  white-space: normal;
}

.range-search-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.range-search-progress > div {
  display: flex;
  justify-content: space-between;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.range-search-results {
  flex: 1 1 auto;
  min-height: 100px;
  overflow-y: auto;
  border-top: var(--theme-border);
  border-bottom: var(--theme-border);
}

.range-search-result {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 4px;
  border: 0;
  border-bottom: var(--theme-border);
  color: var(--theme-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.range-search-result:hover,
.range-search-result:focus-visible {
  background: color-mix(in srgb, var(--theme-primary) 8%, transparent);
  outline: none;
}

.range-search-result strong {
  color: var(--theme-primary);
  font-size: 11px;
}

.range-search-result code {
  overflow: hidden;
  color: var(--code-editor-string);
  font: 11px/1.5 "Fira Code", "Cascadia Code", Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.range-boundary-note {
  flex: 0 0 auto;
  margin: 0;
}

.analysis-pane {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px 24px;
  border-left: var(--theme-border);
  background: color-mix(in srgb, var(--theme-surface) 88%, var(--theme-bg));
}

.analysis-header,
.diagnostic-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.analysis-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.analysis-header strong {
  font-size: 15px;
}

.analysis-header .valid { color: var(--theme-success, #27804f); }
.analysis-header .invalid { color: var(--theme-error, #c33f3f); }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 16px;
}

.metric-grid > div {
  min-width: 0;
  height: 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--theme-primary) 14%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-primary) 5%, var(--theme-bg));
}

.metric-grid > div:nth-child(2),
.metric-grid > div:nth-child(5) {
  border-color: color-mix(in srgb, var(--status-info) 20%, transparent);
  background: color-mix(in srgb, var(--status-info) 6%, var(--theme-bg));
}

.metric-grid > div:nth-child(3),
.metric-grid > div:nth-child(6) {
  border-color: color-mix(in srgb, var(--status-success) 18%, transparent);
  background: color-mix(in srgb, var(--status-success) 5%, var(--theme-bg));
}

.metric-grid strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-status {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  margin: 14px 0 18px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--theme-primary) 18%, transparent);
  border-left: 3px solid var(--theme-primary);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-primary) 6%, transparent);
}

.structure-status > svg {
  margin-top: 1px;
  color: var(--theme-primary);
}

.structure-status > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.structure-status strong {
  font-size: 12px;
}

.structure-status span {
  line-height: 1.5;
}

.path-browser {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--status-info) 20%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--status-info) 5%, var(--theme-bg));
}

.path-help {
  margin: 0 0 10px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.path-help code {
  color: var(--code-editor-property);
  font-family: "Fira Code", "Cascadia Code", Consolas, monospace;
}

.path-results {
  max-height: 260px;
  margin-top: 8px;
  overflow-y: auto;
  border-top: var(--theme-border);
}

.path-item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 4px;
  border-bottom: var(--theme-border);
}

.path-item > button {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 2px;
  border: 0;
  color: var(--theme-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.path-item > button:hover code,
.path-item > button:focus-visible code {
  color: var(--theme-primary);
}

.path-item > button:focus-visible {
  outline: 1px solid var(--theme-primary);
  outline-offset: -1px;
}

.path-item code,
.path-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-item code {
  color: var(--theme-primary);
  font-size: 11px;
}

.path-item small,
.path-item span,
.empty-paths {
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.empty-paths {
  padding: 16px 0;
  text-align: center;
}

.path-result-note {
  padding: 9px 2px;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
  line-height: 1.5;
}

.diagnostic-heading {
  margin-bottom: 8px;
  font-size: 12px;
}

.diagnostic-heading span {
  min-width: 22px;
  text-align: right;
  color: var(--theme-text-secondary);
}

.empty-diagnostics {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.empty-diagnostics svg {
  color: var(--theme-success, #27804f);
}

.diagnostic-item {
  width: 100%;
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 6px;
  padding: 10px;
  border: var(--theme-border);
  border-left: 3px solid var(--theme-warning, #b77813);
  border-radius: 4px;
  color: var(--theme-text);
  background: var(--theme-bg);
  text-align: left;
  cursor: pointer;
}

.diagnostic-item.error {
  border-left-color: var(--theme-error, #c33f3f);
}

.diagnostic-item:hover,
.diagnostic-item:focus-visible {
  background: var(--theme-surface-2);
  outline: none;
}

.diagnostic-item > svg {
  margin-top: 1px;
  color: var(--theme-warning, #b77813);
}

.diagnostic-item.error > svg {
  color: var(--theme-error, #c33f3f);
}

.diagnostic-item > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.diagnostic-item strong { font-size: 12px; }
.diagnostic-item small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.diagnostic-item em { font-size: 11px; font-style: normal; line-height: 1.45; }
.diagnostic-item code {
  overflow: hidden;
  color: var(--theme-primary);
  font-size: var(--text-compact);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-error {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--theme-error, #c33f3f);
}

.load-error span {
  max-width: 620px;
  line-height: 1.6;
}

.json-statusbar {
  flex: 0 0 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 0 12px;
  border-top: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  font-size: var(--text-compact);
}

@media (max-width: 780px) {
  .view-switch {
    margin-left: auto;
  }

  .json-toolbar {
    flex: 0 0 auto;
    flex-wrap: wrap;
    height: auto;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .editor-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .json-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(260px, 1fr) minmax(180px, 42%);
  }

  .range-toolbar {
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .range-progress {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .range-summary span {
    display: none;
  }

  .json-main.inspector-hidden {
    grid-template-rows: minmax(0, 1fr);
  }

  .analysis-pane {
    border-top: var(--theme-border);
    border-left: 0;
  }

  .json-statusbar span:nth-child(2),
  .json-statusbar span:last-child {
    display: none;
  }
}
</style>
