<template>
  <div class="pdf-view" @keydown="handleKeydown" tabindex="-1">
    <WorkspaceToolbar class="pdf-toolbar">
      <WorkspaceFileIdentity class="toolbar-leading">
        <button class="icon-btn" title="返回知识库" @click="router.push('/library')">←</button>
        <button class="icon-btn" :class="{ active: sidebarOpen }" :aria-pressed="sidebarOpen" title="缩略图与目录" @click="sidebarOpen = !sidebarOpen">☰</button>
        <div class="document-title"><strong>{{ fileName }}<i v-if="pdfWorkspaceDirty" class="page-plan-dirty" aria-live="polite">页面草稿</i></strong><span v-if="pdfDocument">{{ pdfDocument.numPages }} 页 · {{ loadModeLabel }}<template v-if="firstPageReadyMs"> · 首屏 {{ firstPageReadyMs }} ms</template></span></div>
      </WorkspaceFileIdentity>
      <div v-if="pdfDocument" class="toolbar-center">
        <button class="icon-btn" title="上一页" aria-label="上一页" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">‹</button>
        <label class="page-jump"><input v-model.number="pageInput" type="number" min="1" :max="pdfDocument.numPages" @keydown.enter="commitPageInput" @blur="commitPageInput"/><span>/ {{ pdfDocument.numPages }}</span></label>
        <button class="icon-btn" title="下一页" aria-label="下一页" :disabled="currentPage >= pdfDocument.numPages" @click="goToPage(currentPage + 1)">›</button>
      </div>
      <div v-if="pdfDocument" class="toolbar-actions">
        <div class="pdf-search" :class="{ active: searchQuery }">
          <span aria-hidden="true">⌕</span>
          <input ref="searchInputRef" v-model="searchQuery" aria-label="搜索 PDF 正文" placeholder="搜索 PDF" @keydown.enter.prevent="navigateMatch($event.shiftKey ? -1 : 1)" @keydown.esc="clearSearch"/>
          <small v-if="searchQuery">{{ searchStatus }}</small>
          <button v-if="searchQuery" title="上一个命中" :disabled="!searchMatches.length" @click="navigateMatch(-1)">↑</button>
          <button v-if="searchQuery" title="下一个命中" :disabled="!searchMatches.length" @click="navigateMatch(1)">↓</button>
          <button v-if="searchQuery" title="清除搜索" @click="clearSearch">×</button>
        </div>
        <button class="icon-btn" title="缩小" @click="changeScale(-0.1)">−</button>
        <button class="scale-label" title="恢复 100%" @click="setScale(1)">{{ Math.round(scale * 100) }}%</button>
        <button class="icon-btn" title="放大" @click="changeScale(0.1)">＋</button>
        <button class="fit-btn" :class="{ active: fitWidth }" :aria-pressed="fitWidth" title="适合宽度" @click="toggleFitWidth"><Columns3Icon :size="14"/><span class="action-label">适合宽度</span></button>
        <button class="fit-btn" :class="{ active: sidebarTab === 'ocr' }" :aria-pressed="sidebarOpen && sidebarTab === 'ocr'" title="离线识别扫描页" @click="openOcrPanel"><ScanTextIcon :size="14"/><span class="action-label">OCR</span></button>
        <button class="fit-btn" :class="{ active: sidebarTab === 'organize' }" :aria-pressed="sidebarOpen && sidebarTab === 'organize'" title="非破坏式页面整理预览" @click="openPageOrganizer"><ListOrderedIcon :size="14"/><span class="action-label">页面整理</span></button>
        <button class="fit-btn" :class="{ active: areaMode }" :aria-pressed="areaMode" :disabled="!annotationWritable" title="在页面拖出矩形区域" @click="areaMode = !areaMode"><ScanLineIcon :size="14"/><span class="action-label">区域批注</span></button>
        <button class="fit-btn" :disabled="!annotationWritable" title="为当前页添加评论" @click="createPageComment"><MessageSquareTextIcon :size="14"/><span class="action-label">页评论</span></button>
      </div>
    </WorkspaceToolbar>

    <main class="pdf-workspace">
      <aside v-if="sidebarOpen && pdfDocument" class="pdf-sidebar" :class="{ 'organize-open': sidebarTab === 'organize' }">
        <div
          class="sidebar-switch"
          role="tablist"
          aria-label="PDF 侧栏"
          @keydown.left.prevent="moveSidebarTabFocus($event, -1)"
          @keydown.right.prevent="moveSidebarTabFocus($event, 1)"
        >
          <button role="tab" :aria-selected="sidebarTab === 'thumbnails'" :class="{ active: sidebarTab === 'thumbnails' }" @click="sidebarTab = 'thumbnails'">缩略图</button>
          <button role="tab" :aria-selected="sidebarTab === 'outline'" :class="{ active: sidebarTab === 'outline' }" @click="sidebarTab = 'outline'">目录</button>
          <button role="tab" :aria-selected="sidebarTab === 'annotations'" :class="{ active: sidebarTab === 'annotations' }" @click="sidebarTab = 'annotations'">批注 {{ annotations.length || '' }}</button>
          <button role="tab" :aria-selected="sidebarTab === 'ocr'" :class="{ active: sidebarTab === 'ocr' }" @click="sidebarTab = 'ocr'">OCR {{ ocrDocument?.pages.length || '' }}</button>
          <button role="tab" :aria-selected="sidebarTab === 'organize'" :class="{ active: sidebarTab === 'organize' }" @click="sidebarTab = 'organize'">页面</button>
        </div>
        <div v-if="sidebarTab === 'thumbnails'" class="thumbnail-list">
          <button v-for="page in pdfDocument.numPages" :key="page" :class="['thumbnail-item', { active: page === currentPage }]" @click="goToPage(page)">
            <PdfPage :document="pdfDocument" :page-number="page" :scale="thumbnailScale" :placeholder-width="basePage.width" :placeholder-height="basePage.height" thumbnail/>
            <span>{{ page }}</span>
          </button>
        </div>
        <div v-else-if="sidebarTab === 'outline'" class="outline-list">
          <p v-if="outlineLoading" class="sidebar-empty">正在读取目录…</p>
          <p v-else-if="!outline.length" class="sidebar-empty">此文档没有内置目录</p>
          <button v-for="(item, index) in outline" :key="`${item.title}-${index}`" :style="{ paddingLeft: `${12 + item.depth * 14}px` }" @click="openOutlineItem(item)">{{ item.title }}</button>
        </div>
        <div v-else-if="sidebarTab === 'annotations'" class="annotation-panel">
          <div v-if="annotationError" class="annotation-alert" role="alert">{{ annotationError }}</div>
          <div v-else-if="!annotations.length" class="sidebar-empty">选择正文后添加高亮，或启用“区域批注”框选页面。</div>
          <button v-for="annotation in sortedAnnotations" :key="annotation.id" :class="['annotation-card', { active: selectedAnnotationId === annotation.id }]" @click="selectAnnotation(annotation.id)">
            <span class="annotation-card-head"><strong>第 {{ annotation.page }} 页 · {{ annotationKindLabel(annotation.kind) }}</strong><i :class="`dot-${annotation.color}`"></i></span>
            <span>{{ annotation.quote || annotation.comment || '未填写评论' }}</span>
          </button>
          <div v-if="selectedAnnotation" class="annotation-editor">
            <label>评论<textarea v-model="selectedAnnotation.comment" :disabled="!annotationWritable" maxlength="20000" placeholder="为这条批注补充评论…" @change="touchSelectedAnnotation"></textarea></label>
            <div class="annotation-colors"><button v-for="color in annotationColors" :key="color" :disabled="!annotationWritable" :class="[`color-${color}`, { active: selectedAnnotation.color === color }]" :aria-label="`${annotationColorLabel(color)}批注`" :aria-pressed="selectedAnnotation.color === color" @click="setSelectedAnnotationColor(color)"></button></div>
            <div class="annotation-reference-actions">
              <button :disabled="referenceWorking" @click="copySelectedAnnotationReference">复制引用</button>
              <button v-if="markdownTarget" :disabled="referenceWorking" @click="insertSelectedAnnotationReference">插入到 {{ markdownTarget.title }}</button>
            </div>
            <button class="delete-annotation" :disabled="!annotationWritable" @click="deleteSelectedAnnotation">删除批注</button>
          </div>
          <div v-if="referenceNotice" class="annotation-alert" aria-live="polite">{{ referenceNotice }}</div>
          <WorkspaceStateNotice v-if="annotationDocument" class="annotation-save-state" :kind="annotationSaveError ? 'error' : annotationSaving ? 'loading' : annotationDirty ? 'limited' : 'saved'" :tone="annotationSaveError ? 'danger' : annotationDirty ? 'warning' : annotationSaving ? 'info' : 'success'" compact>{{ annotationSaveError || (annotationSaving ? '正在保存批注' : annotationDirty ? '等待保存' : '批注已保存到 sidecar') }}</WorkspaceStateNotice>
        </div>
        <div v-else-if="sidebarTab === 'organize'" class="page-organizer">
          <div class="page-plan-summary">
            <WorkspaceStateNotice v-if="savedCopyNotice?.path === pdfPath" class="page-plan-saved" kind="saved" tone="success" compact>
              <strong>可靠副本已落盘并重开</strong>
              <span>{{ savedCopyNotice.pages }} 页 · {{ formatBytes(savedCopyNotice.bytes) }} · 源文件未修改</span>
            </WorkspaceStateNotice>
            <div class="page-plan-heading"><strong>页面整理草稿</strong><span>{{ pagePlanStatus }}</span></div>
            <section class="pdf-insert-panel" data-testid="b2c-pdf-insert">
              <div class="pdf-merge-heading">
                <strong>插入其他 PDF 页面</strong>
                <span v-if="pdfInsertSourcePath">{{ mergeFileName(pdfInsertSourcePath) }}</span>
              </div>
              <div class="pdf-merge-add">
                <input
                  v-model="pdfInsertPathInput"
                  data-testid="b2c-pdf-insert-path"
                  maxlength="1024"
                  aria-label="插页来源 PDF 路径"
                  placeholder="输入库内来源 PDF 路径"
                  @keydown.enter.prevent="setPdfInsertSourcePath"
                >
                <button data-testid="b2c-pdf-insert-add" :disabled="pdfInsertAdding || !pdfInsertPathInput.trim()" @click="setPdfInsertSourcePath">使用</button>
                <button class="pdf-merge-pick" title="选择插页来源 PDF" :disabled="pdfInsertAdding" @click="pickPdfInsertSource">
                  <FolderOpenIcon :size="14"/>
                </button>
              </div>
              <div v-if="pdfInsertSourcePath" class="pdf-insert-source">
                <span :title="pdfInsertSourcePath">{{ mergeFileName(pdfInsertSourcePath) }}</span>
                <button title="移除插页来源" @click="clearPdfInsertSource">×</button>
              </div>
              <label class="pdf-insert-range">
                <span>来源页范围</span>
                <input
                  v-model="pdfInsertRangeInput"
                  data-testid="b2c-pdf-insert-range"
                  maxlength="512"
                  placeholder="例如 1-3,5"
                  @input="invalidatePdfInsertVerification"
                >
              </label>
              <div class="pdf-insert-position">
                <label>
                  <span>目标页</span>
                  <input
                    v-model.number="pdfInsertAnchorPage"
                    data-testid="b2c-pdf-insert-anchor"
                    type="number"
                    min="1"
                    :max="pdfDocument?.numPages || 1"
                    :disabled="pdfInsertPosition === 'end'"
                    @input="invalidatePdfInsertVerification"
                  >
                </label>
                <div class="pdf-insert-segments" aria-label="插入位置">
                  <button :class="{ active: pdfInsertPosition === 'before' }" @click="setPdfInsertPosition('before')">页前</button>
                  <button :class="{ active: pdfInsertPosition === 'after' }" @click="setPdfInsertPosition('after')">页后</button>
                  <button :class="{ active: pdfInsertPosition === 'end' }" @click="setPdfInsertPosition('end')">末尾</button>
                </div>
              </div>
              <small>保留来源页填写顺序；只创建新文件，当前 PDF 和来源 PDF 均不修改。</small>
              <small v-if="pdfInsertError" class="pdf-merge-error">{{ pdfInsertError }}</small>
              <button
                class="pdf-merge-verify"
                data-testid="b2c-pdf-insert-verify"
                :disabled="!pdfInsertSourcePath || !pdfInsertRangeInput.trim() || pdfInsertVerifying"
                @click="verifyPdfInsert"
              >
                {{ pdfInsertVerifying ? '正在隔离插入并复读…' : '验证插页副本' }}
              </button>
              <div
                v-if="pdfInsertVerification"
                class="pdf-merge-verification"
                :class="{ blocked: pdfInsertVerification.status === 'blocked' }"
                :role="pdfInsertVerification.status === 'blocked' ? 'alert' : 'status'"
                aria-live="polite"
              >
                <template v-if="pdfInsertVerification.status === 'isolated_verified'">
                  <strong>插页副本验证通过</strong>
                  <span>插入 {{ pdfInsertVerification.sourcePages.length }} 页 · 输出 {{ pdfInsertVerification.outputPages }} 页 · {{ formatBytes(pdfInsertVerification.outputBytes) }}</span>
                  <small>插入点、页序、尺寸、旋转和文本复读通过；两份源文件未修改。</small>
                  <div class="pdf-merge-save">
                    <input v-model="pdfInsertCopyName" maxlength="180" aria-label="PDF 插页文件名" @keydown.enter.prevent="savePdfInsertCopy">
                    <button :disabled="pdfInsertSaving || !pdfInsertCopyName.trim()" @click="savePdfInsertCopy">
                      {{ pdfInsertSaving ? '正在落盘并重开…' : '插入为新 PDF 并打开' }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <strong>当前输入不能安全插页</strong>
                  <span>{{ pdfInsertVerification.blockers.map(pdfInsertBlockerLabel).join(' · ') }}</span>
                </template>
              </div>
            </section>
            <section class="pdf-merge-panel" data-testid="b2b-pdf-merge">
              <div class="pdf-merge-heading">
                <strong>合并多个 PDF</strong>
                <span>{{ pdfMergeInputs.length }}/16 个输入</span>
              </div>
              <div class="pdf-merge-add">
                <input
                  v-model="pdfMergePathInput"
                  data-testid="b2b-pdf-merge-path"
                  maxlength="1024"
                  aria-label="库内 PDF 路径"
                  placeholder="输入库内 PDF 路径"
                  @keydown.enter.prevent="addPdfMergePathInput"
                >
                <button data-testid="b2b-pdf-merge-add" :disabled="pdfMergeAdding || !pdfMergePathInput.trim()" @click="addPdfMergePathInput">添加</button>
                <button class="pdf-merge-pick" title="选择多个库内 PDF" :disabled="pdfMergeAdding || pdfMergeInputs.length >= 16" @click="pickPdfMergeInputs">
                  <FolderOpenIcon :size="14"/>
                </button>
              </div>
              <small>当前 PDF 始终保留；按列表顺序合并，只在当前目录创建新文件。</small>
              <div class="pdf-merge-list">
                <article
                  v-for="(input, index) in pdfMergeInputs"
                  :key="input.path"
                  :data-merge-index="index + 1"
                  :class="{ current: input.path === pdfPath }"
                >
                  <span class="pdf-merge-order">{{ index + 1 }}</span>
                  <span class="pdf-merge-name" :title="input.path">{{ mergeFileName(input.path) }}</span>
                  <span v-if="input.path === pdfPath" class="pdf-merge-current">当前</span>
                  <div class="pdf-merge-actions">
                    <button title="向前移动" :disabled="index === 0" @click="movePdfMergeInput(index, -1)">↑</button>
                    <button title="向后移动" :disabled="index === pdfMergeInputs.length - 1" @click="movePdfMergeInput(index, 1)">↓</button>
                    <button title="移除" :disabled="input.path === pdfPath" @click="removePdfMergeInput(index)">×</button>
                  </div>
                </article>
              </div>
              <small v-if="pdfMergeError" class="pdf-merge-error" role="alert">{{ pdfMergeError }}</small>
              <button
                class="pdf-merge-verify"
                data-testid="b2b-pdf-merge-verify"
                :disabled="pdfMergeInputs.length < 2 || pdfMergeVerifying"
                @click="verifyPdfMerge"
              >
                {{ pdfMergeVerifying ? '正在隔离合并并复读…' : '验证合并副本' }}
              </button>
              <div
                v-if="pdfMergeVerification"
                class="pdf-merge-verification"
                :class="{ blocked: pdfMergeVerification.status === 'blocked' }"
                :role="pdfMergeVerification.status === 'blocked' ? 'alert' : 'status'"
                aria-live="polite"
              >
                <template v-if="pdfMergeVerification.status === 'isolated_verified'">
                  <strong>合并副本验证通过</strong>
                  <span>{{ pdfMergeVerification.inputs.length }} 个文件 · {{ pdfMergeVerification.outputPages }} 页 · {{ formatBytes(pdfMergeVerification.outputBytes) }}</span>
                  <small>页序、尺寸、旋转和文本复读通过；全部源文件未修改。</small>
                  <div class="pdf-merge-save">
                    <input v-model="pdfMergeCopyName" maxlength="180" aria-label="PDF 合并文件名" @keydown.enter.prevent="savePdfMergeCopy">
                    <button :disabled="pdfMergeSaving || !pdfMergeCopyName.trim()" @click="savePdfMergeCopy">
                      {{ pdfMergeSaving ? '正在落盘并重开…' : '合并为新 PDF 并打开' }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <strong>当前输入不能安全合并</strong>
                  <span>{{ pdfMergeVerification.blockers.map(pdfMergeBlockerLabel).join(' · ') }}</span>
                </template>
              </div>
            </section>
            <div class="page-range-extract" data-testid="b2a-page-range">
              <label>
                <span>按范围提取页面</span>
                <input
                  v-model="pageRangeInput"
                  data-testid="b2a-page-range-input"
                  maxlength="512"
                  placeholder="例如 1-3,5,8-10"
                  @keydown.enter.prevent="applyPageRangeExtraction"
                >
              </label>
              <small>保留填写顺序；只生成同目录新 PDF，源文件始终不变。</small>
              <button data-testid="b2a-page-range-apply" @click="applyPageRangeExtraction">应用提取范围</button>
              <small v-if="pageRangeError" class="page-range-error" role="alert">{{ pageRangeError }}</small>
            </div>
            <p>旋转、排序和排除先在内存中预览；验证通过后只能在源文件同目录创建新副本，不会覆盖任何 PDF。</p>
            <div class="page-plan-history">
              <button :disabled="!pagePlanUndo.length" title="撤销 Ctrl+Z" @click="undoPagePlan">撤销</button>
              <button :disabled="!pagePlanRedo.length" title="重做 Ctrl+Y" @click="redoPagePlan">重做</button>
              <button :disabled="!pagePlanDirty" @click="resetPagePlan">重置</button>
            </div>
            <button class="page-plan-verify" :disabled="!pagePlanDirty || pagePlanVerifying" @click="verifyPagePlan">
              {{ pagePlanVerifying ? '正在生成并复读…' : pagePlanMode === 'extract' ? '验证提取副本' : '验证隔离副本' }}
            </button>
            <div
              v-if="pagePlanVerification || pagePlanVerificationError"
              class="page-plan-verification"
              :class="{ blocked: pagePlanVerification?.status === 'blocked' || pagePlanVerificationError }"
              :role="pagePlanVerification?.status === 'blocked' || pagePlanVerificationError ? 'alert' : 'status'"
              aria-live="polite"
            >
              <template v-if="pagePlanVerification?.status === 'isolated_verified'">
                <strong>{{ pagePlanMode === 'extract' ? '提取副本验证通过' : '隔离副本验证通过' }}</strong>
                <span>{{ pagePlanVerification.outputPages }} 页 · {{ formatBytes(pagePlanVerification.outputBytes) }} · 源文件未修改</span>
                <small>结构复读、文本页序与旋转映射均已核验；可靠另存只创建同目录新文件。</small>
                <small>{{ pdfCompatibilityLabel(pagePlanVerification.compatibility) }}</small>
                <div class="page-plan-save">
                  <label>
                    <span>新副本文件名</span>
                    <input v-model="pagePlanCopyName" maxlength="180" aria-label="PDF 新副本文件名" @keydown.enter.prevent="savePagePlanCopy"/>
                  </label>
                  <button :disabled="pagePlanSaving || !pagePlanCopyName.trim()" @click="savePagePlanCopy">
                    {{ pagePlanSaving ? '正在落盘并重开…' : pagePlanMode === 'extract' ? '提取为新 PDF 并打开' : '另存新 PDF 并打开' }}
                  </button>
                  <small v-if="pagePlanSaveError">{{ pagePlanSaveError }}</small>
                </div>
              </template>
              <template v-else-if="pagePlanVerification">
                <strong>检测到高风险 PDF 特性，已阻断</strong>
                <span>{{ pagePlanVerification.blockers.map(pdfPlanBlockerLabel).join(' · ') }}</span>
                <small>未生成输出，也未修改源文件。请保留原件并等待对应保真迁移能力。</small>
              </template>
              <template v-else>
                <strong>隔离副本验证失败</strong>
                <span>{{ pagePlanVerificationError }}</span>
              </template>
            </div>
          </div>
          <div class="page-plan-list">
            <article
              v-for="(entry, index) in pagePlan"
              :key="entry.id"
              :class="{ active: activePagePlanId === entry.id, removed: entry.removed }"
              :data-source-page="entry.sourcePage"
            >
              <button class="page-plan-preview" @click="selectPagePlanEntry(entry)">
                <PdfPage
                  :document="pdfDocument"
                  :page-number="entry.sourcePage"
                  :rotation="entry.rotation"
                  :scale="thumbnailScale"
                  :placeholder-width="basePage.width"
                  :placeholder-height="basePage.height"
                  thumbnail
                />
                <span>{{ entry.removed ? '已排除' : `新第 ${visiblePageNumber(entry.id)} 页` }} · 原第 {{ entry.sourcePage }} 页</span>
                <small v-if="entry.rotation">{{ entry.rotation }}°</small>
              </button>
              <div class="page-plan-actions">
                <button title="向左旋转 90°" @click="rotatePlanEntry(entry.id, -90)">↶</button>
                <button title="向右旋转 90°" @click="rotatePlanEntry(entry.id, 90)">↷</button>
                <button :disabled="index === 0" title="向前移动" @click="movePlanEntry(entry.id, -1)">↑</button>
                <button :disabled="index === pagePlan.length - 1" title="向后移动" @click="movePlanEntry(entry.id, 1)">↓</button>
                <button
                  :class="{ restore: entry.removed }"
                  :disabled="!entry.removed && visiblePagePlan.length <= 1"
                  @click="togglePlanEntry(entry.id)"
                >{{ entry.removed ? '恢复' : '排除' }}</button>
              </div>
            </article>
          </div>
        </div>
        <div v-else class="ocr-panel">
          <div class="ocr-summary">
            <strong>离线 OCR</strong>
            <span>Tesseract WASM · 简体中文 + 英文</span>
            <p>页面只在本机内存中渲染，识别文本写入独立 sidecar，不修改原 PDF。</p>
          </div>
          <div v-if="ocrSourceChanged" class="annotation-alert">PDF 内容已变化，旧 OCR 结果仅供查看；请重新识别。</div>
          <div v-if="ocrError" class="annotation-alert">{{ ocrError }}</div>
          <div v-if="ocrBusy" class="ocr-progress">
            <span>{{ ocrTaskState === 'preparing' ? '正在加载离线模型…' : `正在识别第 ${ocrCurrentPage} 页` }}</span>
            <progress :value="ocrOverallProgress" max="1"></progress>
            <small>{{ Math.round(ocrOverallProgress * 100) }}% · {{ ocrProgressStatus }}</small>
            <button @click="cancelOcr">取消任务</button>
          </div>
          <div v-else class="ocr-actions">
            <button @click="runOcr([currentPage], true)">识别当前页</button>
            <button @click="runOcr(Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1))">识别缺失页面</button>
          </div>
          <p v-if="ocrTaskState === 'cancelled'" class="ocr-note">任务已取消，已完成页面仍保存在 sidecar。</p>
          <p v-else-if="ocrTaskState === 'completed'" class="ocr-note">识别完成，结果已进入统一搜索与知识图谱。</p>
          <div class="ocr-page-list">
            <button v-for="page in sortedOcrPages" :key="page.page" @click="goToPage(page.page)">
              <span><strong>第 {{ page.page }} 页</strong><i>{{ page.confidence.toFixed(1) }}%</i></span>
              <small>{{ page.text || '未识别到文本' }}</small>
            </button>
          </div>
        </div>
      </aside>

      <section ref="scrollRef" class="pdf-scroll" @scroll.passive="handleScroll" @mouseup="captureTextSelection">
        <WorkspaceStateNotice v-if="loading" class="pdf-state" kind="loading" tone="info" title="正在打开 PDF"><span v-if="loadProgress">{{ loadProgress }}%</span></WorkspaceStateNotice>
        <WorkspaceStateNotice v-else-if="error" class="pdf-state" kind="error" tone="danger" title="无法打开 PDF"><p>{{ error }}</p><template #action><button @click="loadPdf">重试</button></template></WorkspaceStateNotice>
        <div v-else-if="pdfDocument" class="page-list">
          <div v-for="page in pdfDocument.numPages" :id="`pdf-page-${page}`" :key="page" class="page-shell" :data-page="page">
            <PdfPage
              :document="pdfDocument"
              :page-number="page"
              :scale="scale"
              :placeholder-width="basePage.width"
              :placeholder-height="basePage.height"
              :text-content="textContents[page]"
              :matches="matchesByPage.get(page)"
              :active-match-id="activeMatchId"
              :annotations="annotationsByPage.get(page)"
              :active-annotation-id="selectedAnnotationId"
              :area-mode="areaMode"
              @need-text="ensurePageText"
              @rendered="recordPageRendered"
              @area-create="createAreaAnnotation"
              @select-annotation="selectAnnotation"
            />
            <span class="page-number">{{ page }}</span>
          </div>
        </div>
      </section>
    </main>
    <div v-if="selectionTool.show" class="selection-annotation-tool" :style="{ left: `${selectionTool.x}px`, top: `${selectionTool.y}px` }" @mousedown.prevent>
      <span>高亮</span>
      <button v-for="color in annotationColors" :key="color" :class="`color-${color}`" :title="`${annotationColorLabel(color)}高亮`" :aria-label="`${annotationColorLabel(color)}高亮`" @click="createSelectionAnnotation(color, false)"></button>
      <button class="comment-selection" @click="createSelectionAnnotation(annotationColor, true)">高亮并评论</button>
      <button class="close-selection" title="关闭高亮工具" aria-label="关闭高亮工具" @click="dismissSelectionTool">×</button>
    </div>
    <div v-if="areaMode" class="area-mode-hint">区域批注模式：在任意页面拖出矩形，Esc 退出</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import WorkspaceFileIdentity from '../components/workspace/WorkspaceFileIdentity.vue'
import WorkspaceStateNotice from '../components/workspace/WorkspaceStateNotice.vue'
import WorkspaceToolbar from '../components/workspace/WorkspaceToolbar.vue'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import {
  Columns3Icon,
  FolderOpenIcon,
  ListOrderedIcon,
  MessageSquareTextIcon,
  ScanLineIcon,
  ScanTextIcon,
} from 'lucide-vue-next'
import PdfPage from '../components/PdfPage.vue'
import { useAppStore } from '../store/app'
import { buildPdfPageText, findPdfPageMatches, type PdfSearchMatch } from '../utils/pdfText'
import type { PdfAnnotationReference } from '../utils/pdfReference'
import type { PdfAnnotation, PdfAnnotationColor, PdfAnnotationDocument, PdfAnnotationKind, PdfAnnotationRect } from '../types/pdfAnnotations'
import type { PdfOcrDocument, PdfOcrPage, PdfOcrTaskState } from '../types/pdfOcr'
import { createOfflineOcrWorker } from '../utils/pdfOcr'
import { TauriPdfRangeTransport, type PdfReadDescriptor } from '../utils/tauriPdfRangeTransport'
import {
  clonePdfPagePlan,
  createPdfExtractionPlan,
  createPdfPagePlan,
  movePdfPage,
  parsePdfInsertionPageRange,
  parsePdfPageRange,
  rotatePdfPage,
  setPdfPageRemoved,
  summarizePdfPagePlan,
  type PdfPagePlanEntry,
} from '../utils/pdfPagePlan'
import type { Worker as TesseractWorker } from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface OutlineEntry { title: string; depth: number; destination: string | unknown[] | null }
interface PdfIsolatedPagePlanReport {
  status: 'isolated_verified' | 'blocked'
  engine: string
  sourceSignature: string
  sourcePages: number
  outputPages: number
  rotatedPages: number
  reordered: boolean
  removedPages: number
  blockers: string[]
  sourceDigest: string
  outputDigest?: string | null
  outputBytes: number
  structuralReparseVerified: boolean
  textOrderVerified: boolean
  sourceUnchanged: boolean
  pageMapping: Array<{ outputPage: number; sourcePage: number; rotation: number }>
  compatibility: {
    pdfVersion: string
    producer?: string | null
    xrefKind: 'stream' | 'table'
    compressedObjects: number
    inheritedPageValues: number
    textlessPages?: number | null
  }
}
interface PdfSavedPagePlanReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourceSignature: string
  sourceUnchanged: boolean
  outputPages: number
  outputBytes: number
  structuralReopenVerified: boolean
  textReopenVerified: boolean
}
interface PdfMergeInput {
  path: string
  expectedSignature: string
}
interface PdfIsolatedMergeReport {
  status: 'isolated_verified' | 'blocked'
  engine: string
  inputs: Array<{
    path: string
    fileName: string
    signature: string
    digest: string
    pages: number
    bytes: number
    blockers: string[]
    compatibility: PdfIsolatedPagePlanReport['compatibility']
  }>
  outputPages: number
  blockers: string[]
  outputDigest?: string | null
  outputBytes: number
  structuralReparseVerified: boolean
  textOrderVerified: boolean
  pageGeometryVerified: boolean
  sourcesUnchanged: boolean
  pageMapping: Array<{ outputPage: number; inputIndex: number; sourcePage: number }>
}
interface PdfSavedMergeReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourcesUnchanged: boolean
  inputCount: number
  outputPages: number
  outputBytes: number
  structuralReopenVerified: boolean
  textReopenVerified: boolean
  pageGeometryVerified: boolean
}
interface PdfIsolatedInsertReport {
  status: 'isolated_verified' | 'blocked'
  engine: string
  base: PdfIsolatedMergeReport['inputs'][number]
  source: PdfIsolatedMergeReport['inputs'][number]
  sourcePages: number[]
  insertAfterPage: number
  outputPages: number
  blockers: string[]
  outputDigest?: string | null
  outputBytes: number
  structuralReparseVerified: boolean
  textOrderVerified: boolean
  pageGeometryVerified: boolean
  sourcesUnchanged: boolean
  pageMapping: Array<{ outputPage: number; sourceKind: 'base' | 'insert'; sourcePage: number }>
}
interface PdfSavedInsertReport {
  status: 'saved_verified'
  engine: string
  targetPath: string
  targetSignature: string
  targetDigest: string
  sourcesUnchanged: boolean
  insertedPages: number
  insertAfterPage: number
  outputPages: number
  outputBytes: number
  structuralReopenVerified: boolean
  textReopenVerified: boolean
  pageGeometryVerified: boolean
}
const POSITION_KEY = 'longedit.pdf.positions.v1'
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const scrollRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const pdfDocument = shallowRef<PDFDocumentProxy | null>(null)
const loading = ref(true)
const error = ref('')
const loadProgress = ref(0)
const loadMode = ref<'full' | 'range'>('full')
const firstPageReadyMs = ref(0)
const currentPage = ref(1)
const pageInput = ref(1)
const scale = ref(1)
const fitWidth = ref(false)
const sidebarOpen = ref(true)
const sidebarTab = ref<'thumbnails' | 'outline' | 'annotations' | 'ocr' | 'organize'>('thumbnails')
const outline = ref<OutlineEntry[]>([])
const outlineLoading = ref(false)
const basePage = ref({ width: 612, height: 792 })
const textContents = shallowReactive<Record<number, TextContent>>({})
const searchQuery = ref('')
const searchMatches = ref<PdfSearchMatch[]>([])
const activeMatchIdState = ref('')
const searchIndexedPages = ref(0)
const searchRunning = ref(false)
const annotationDocument = ref<PdfAnnotationDocument | null>(null)
const annotationError = ref('')
const annotationSaveError = ref('')
const annotationSaving = ref(false)
const annotationDirty = ref(false)
const annotationWritable = ref(true)
const referenceWorking = ref(false)
const referenceNotice = ref('')
const selectedAnnotationId = ref('')
const annotationColor = ref<PdfAnnotationColor>('yellow')
const areaMode = ref(false)
const ocrDocument = ref<PdfOcrDocument | null>(null)
const ocrTaskState = ref<PdfOcrTaskState>('idle')
const ocrCurrentPage = ref(0)
const ocrCompletedPages = ref(0)
const ocrTotalPages = ref(0)
const ocrPageProgress = ref(0)
const ocrProgressStatus = ref('')
const ocrError = ref('')
const ocrSourceChanged = ref(false)
const selectionTool = ref({ show: false, page: 0, quote: '', rects: [] as PdfAnnotationRect[], x: 0, y: 0 })
const pagePlan = ref<PdfPagePlanEntry[]>([])
const pagePlanUndo = ref<PdfPagePlanEntry[][]>([])
const pagePlanRedo = ref<PdfPagePlanEntry[][]>([])
const activePagePlanId = ref('')
const pdfSourceSignature = ref('')
const pagePlanVerification = ref<PdfIsolatedPagePlanReport | null>(null)
const pagePlanVerificationError = ref('')
const pagePlanVerifying = ref(false)
const pagePlanCopyName = ref('')
const pagePlanSaving = ref(false)
const pagePlanSaveError = ref('')
const savedCopyNotice = ref<{ path: string; pages: number; bytes: number } | null>(null)
const pagePlanMode = ref<'organize' | 'extract'>('organize')
const pageRangeInput = ref('')
const pageRangePages = ref<number[]>([])
const pageRangeError = ref('')
const pdfMergeInputs = ref<PdfMergeInput[]>([])
const pdfMergePathInput = ref('')
const pdfMergeAdding = ref(false)
const pdfMergeVerification = ref<PdfIsolatedMergeReport | null>(null)
const pdfMergeVerifying = ref(false)
const pdfMergeCopyName = ref('')
const pdfMergeSaving = ref(false)
const pdfMergeError = ref('')
const pdfInsertPathInput = ref('')
const pdfInsertSourcePath = ref('')
const pdfInsertSourceSignature = ref('')
const pdfInsertRangeInput = ref('1')
const pdfInsertAnchorPage = ref(1)
const pdfInsertPosition = ref<'before' | 'after' | 'end'>('after')
const pdfInsertAdding = ref(false)
const pdfInsertVerification = ref<PdfIsolatedInsertReport | null>(null)
const pdfInsertVerifying = ref(false)
const pdfInsertCopyName = ref('')
const pdfInsertSaving = ref(false)
const pdfInsertError = ref('')
let loadingTask: PDFDocumentLoadingTask | null = null
let rangeTransport: TauriPdfRangeTransport | null = null
let loadStartedAt = 0
let scrollFrame = 0
let positionTimer = 0
let searchTimer = 0
let searchGeneration = 0
let annotationSaveTimer = 0
let annotationSaveChain: Promise<void> = Promise.resolve()
let annotationRevision = 0
let annotationSourcePath = ''
let annotationLibraryRoot = ''
let annotationLoadGeneration = 0
let ocrGeneration = 0
let ocrWorker: TesseractWorker | null = null
const textPromises = new Map<number, Promise<TextContent | undefined>>()
const textAccess = new Map<number, number>()
const annotationColors: PdfAnnotationColor[] = ['yellow', 'green', 'pink', 'blue']

const pdfPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => pdfPath.value.split(/[\\/]/).pop()?.replace(/\.pdf$/i, '') || 'PDF 文档')
const thumbnailScale = computed(() => Math.min(0.25, 132 / basePage.value.width))
const loadModeLabel = computed(() => loadMode.value === 'range' ? '渐进读取' : '快速读取')
const positionId = () => `${store.libraryPath}\n${pdfPath.value}`
const activeMatchId = computed(() => activeMatchIdState.value || undefined)
const activeMatchIndex = computed(() => searchMatches.value.findIndex(match => match.id === activeMatchIdState.value))
const searchStatus = computed(() => {
  if (!pdfDocument.value) return '0 / 0'
  if (searchRunning.value) return `${searchMatches.value.length}+ · ${searchIndexedPages.value}/${pdfDocument.value.numPages} 页`
  if (!searchMatches.value.length) return '0 / 0'
  return `${Math.max(1, activeMatchIndex.value + 1)} / ${searchMatches.value.length}`
})
const matchesByPage = computed(() => {
  const result = new Map<number, PdfSearchMatch[]>()
  for (const match of searchMatches.value) {
    const pageMatches = result.get(match.page) || []
    pageMatches.push(match)
    result.set(match.page, pageMatches)
  }
  return result
})
const annotations = computed(() => annotationDocument.value?.annotations || [])
const markdownTarget = computed(() => store.tabs.find(tab => tab.id === store.activeTabId && tab.path.toLowerCase().endsWith('.md')))
const sortedAnnotations = computed(() => [...annotations.value].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt))
const selectedAnnotation = computed(() => annotations.value.find(annotation => annotation.id === selectedAnnotationId.value))
const annotationsByPage = computed(() => {
  const result = new Map<number, PdfAnnotation[]>()
  for (const annotation of annotations.value) {
    const pageAnnotations = result.get(annotation.page) || []
    pageAnnotations.push(annotation)
    result.set(annotation.page, pageAnnotations)
  }
  return result
})
const visiblePagePlan = computed(() => pagePlan.value.filter(entry => !entry.removed))
const pagePlanSummary = computed(() => summarizePdfPagePlan(pagePlan.value))
const pagePlanDirty = computed(() => pagePlanSummary.value.changed > 0)
const pdfMergeDirty = computed(() => pdfMergeInputs.value.length > 1)
const pdfInsertDirty = computed(() => Boolean(pdfInsertSourcePath.value))
const pdfWorkspaceDirty = computed(() => pagePlanDirty.value || pdfMergeDirty.value || pdfInsertDirty.value)
const pagePlanStatus = computed(() => {
  if (pagePlanMode.value === 'extract' && pageRangePages.value.length) {
    return `提取 ${pageRangePages.value.length}/${pagePlan.value.length} 页`
  }
  if (!pagePlanDirty.value) return `${pagePlan.value.length} 页 · 尚未调整`
  const parts = [
    pagePlanSummary.value.rotated ? `旋转 ${pagePlanSummary.value.rotated}` : '',
    pagePlanSummary.value.moved ? `改序 ${pagePlanSummary.value.moved}` : '',
    pagePlanSummary.value.removed ? `排除 ${pagePlanSummary.value.removed}` : '',
  ].filter(Boolean)
  return `${visiblePagePlan.value.length}/${pagePlan.value.length} 页 · ${parts.join(' · ')}`
})
const pdfPlanBlockerLabels: Record<string, string> = {
  encrypted_pdf_unverified: '加密文档',
  digital_signature_unverified: '数字签名',
  acroform_unverified: '交互表单',
  pdf_portfolio_unverified: 'PDF 文件包',
  embedded_files_unverified: '嵌入附件',
  outline_migration_unverified: '目录迁移',
  page_labels_migration_unverified: '页码标签迁移',
  tagged_structure_migration_unverified: '无障碍结构迁移',
  named_destinations_migration_unverified: '命名目标迁移',
}
const pdfPlanBlockerLabel = (blocker: string) => pdfPlanBlockerLabels[blocker] || blocker
const pdfMergeBlockerLabel = (blocker: string) => {
  const match = /^input_(\d+):(.+)$/.exec(blocker)
  return match ? `输入 ${match[1]}：${pdfPlanBlockerLabel(match[2])}` : pdfPlanBlockerLabel(blocker)
}
const pdfInsertBlockerLabel = (blocker: string) => {
  const match = /^(base|source):(.+)$/.exec(blocker)
  if (!match) return pdfPlanBlockerLabel(blocker)
  return `${match[1] === 'base' ? '当前文件' : '来源文件'}：${pdfPlanBlockerLabel(match[2])}`
}
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const sortedOcrPages = computed(() => [...(ocrDocument.value?.pages || [])].sort((a, b) => a.page - b.page))
const ocrBusy = computed(() => ocrTaskState.value === 'preparing' || ocrTaskState.value === 'running')
const ocrOverallProgress = computed(() => {
  if (!ocrTotalPages.value) return 0
  return Math.min(1, (ocrCompletedPages.value + ocrPageProgress.value) / ocrTotalPages.value)
})

const readPositions = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(POSITION_KEY) || '{}') } catch { return {} }
}
const savePosition = () => {
  if (!pdfPath.value) return
  const positions = readPositions()
  delete positions[positionId()]
  positions[positionId()] = currentPage.value
  const limited = Object.fromEntries(Object.entries(positions).slice(-100))
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(limited)) } catch { /* best effort */ }
}

const flattenOutline = (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>, depth = 0): OutlineEntry[] => {
  if (!items) return []
  return items.flatMap(item => [{ title: item.title || '未命名章节', depth, destination: item.dest }, ...flattenOutline(item.items, depth + 1)])
}

const loadOutline = async () => {
  if (!pdfDocument.value) return
  outlineLoading.value = true
  try { outline.value = flattenOutline(await pdfDocument.value.getOutline()) } catch { outline.value = [] }
  finally { outlineLoading.value = false }
}

const annotationKindLabel = (kind: PdfAnnotationKind) => ({ highlight: '文字高亮', area: '区域', comment: '评论' }[kind])
const annotationColorLabel = (color: PdfAnnotationColor) => ({ yellow: '黄色', green: '绿色', pink: '粉色', blue: '蓝色' }[color])
const moveSidebarTabFocus = (event: KeyboardEvent, direction: -1 | 1) => {
  const current = event.target as HTMLButtonElement
  const tabs = Array.from(current.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])
  const currentIndex = tabs.indexOf(current)
  if (currentIndex < 0 || !tabs.length) return
  const next = tabs[(currentIndex + direction + tabs.length) % tabs.length]
  next?.focus()
  next?.click()
}
const makeAnnotationId = () => `pdf-annotation-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
const currentFingerprint = (document = pdfDocument.value) => document?.fingerprints?.[0] || undefined
const requestedPage = () => {
  const page = Number(route.query.page)
  return Number.isInteger(page) && page > 0 ? page : undefined
}
const requestedAnnotationId = () => typeof route.query.annotation === 'string' && route.query.annotation.length <= 128 ? route.query.annotation : ''

const focusRequestedReference = () => {
  const id = requestedAnnotationId()
  if (id) {
    if (annotations.value.some(annotation => annotation.id === id)) {
      referenceNotice.value = ''
      selectAnnotation(id)
    } else {
      referenceNotice.value = '引用对应的批注不存在或已被删除，已定位到引用页码。'
      sidebarOpen.value = true
      sidebarTab.value = 'annotations'
      if (requestedPage()) goToPage(requestedPage()!, 'auto')
    }
  } else if (requestedPage()) {
    goToPage(requestedPage()!, 'auto')
  }
}

const loadAnnotations = async (document: PDFDocumentProxy) => {
  const generation = ++annotationLoadGeneration
  annotationError.value = ''
  annotationSaveError.value = ''
  annotationWritable.value = true
  selectedAnnotationId.value = ''
  try {
    const sourcePath = pdfPath.value
    const libraryRoot = store.libraryPath
    const loaded = await invoke<PdfAnnotationDocument>('read_pdf_annotations', { libraryRoot, pdfPath: sourcePath })
    if (generation !== annotationLoadGeneration || pdfDocument.value !== document) return
    const fingerprint = currentFingerprint(document)
    if (loaded.source.fingerprint && fingerprint && loaded.source.fingerprint !== fingerprint) {
      annotationError.value = 'PDF 内容已变化，现有批注位置可能失效；批注仍以只读方式显示。'
      annotationWritable.value = false
    }
    loaded.source.fingerprint = fingerprint
    annotationDocument.value = loaded
    annotationSourcePath = sourcePath
    annotationLibraryRoot = libraryRoot
    await nextTick()
    focusRequestedReference()
  } catch (cause) {
    if (generation !== annotationLoadGeneration || pdfDocument.value !== document) return
    annotationDocument.value = null
    annotationError.value = `批注 sidecar 无法读取：${String(cause)}`
    annotationWritable.value = false
    sidebarOpen.value = true
    sidebarTab.value = 'annotations'
  }
}

const loadOcrDocument = async (document: PDFDocumentProxy) => {
  const generation = ocrGeneration
  ocrError.value = ''
  ocrSourceChanged.value = false
  try {
    const loaded = await invoke<PdfOcrDocument>('read_pdf_ocr', { libraryRoot: store.libraryPath, pdfPath: pdfPath.value })
    if (generation !== ocrGeneration || pdfDocument.value !== document) return
    const fingerprint = currentFingerprint(document)
    ocrSourceChanged.value = Boolean(loaded.source.fingerprint && fingerprint && loaded.source.fingerprint !== fingerprint)
    loaded.source.fingerprint = fingerprint
    ocrDocument.value = loaded
  } catch (cause) {
    if (generation !== ocrGeneration || pdfDocument.value !== document) return
    ocrDocument.value = null
    ocrError.value = `OCR sidecar 无法读取：${String(cause)}`
  }
}

const openOcrPanel = () => {
  sidebarOpen.value = true
  sidebarTab.value = 'ocr'
}

const mergeFileName = (path: string) => path.split(/[\\/]/).pop() || path

const invalidatePdfInsertVerification = () => {
  pdfInsertVerification.value = null
  pdfInsertError.value = ''
}

const addPdfInsertSourcePath = async (path: string) => {
  const candidate = path.trim()
  if (!candidate) return
  const normalized = candidate.replace(/\\/g, '/').toLocaleLowerCase()
  const current = pdfPath.value.replace(/\\/g, '/').toLocaleLowerCase()
  if (normalized === current) throw new Error('插页来源必须是另一份 PDF')
  const descriptor = await invoke<PdfReadDescriptor>('read_pdf_info', {
    libraryRoot: store.libraryPath,
    path: candidate,
  })
  pdfInsertSourcePath.value = candidate
  pdfInsertSourceSignature.value = descriptor.signature
  pdfInsertPathInput.value = ''
  pdfInsertRangeInput.value = '1'
  invalidatePdfInsertVerification()
}

const setPdfInsertSourcePath = async () => {
  if (pdfInsertAdding.value || !pdfInsertPathInput.value.trim()) return
  pdfInsertAdding.value = true
  pdfInsertError.value = ''
  try {
    await addPdfInsertSourcePath(pdfInsertPathInput.value)
  } catch (cause) {
    pdfInsertError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfInsertAdding.value = false
  }
}

const pickPdfInsertSource = async () => {
  if (pdfInsertAdding.value) return
  pdfInsertAdding.value = true
  pdfInsertError.value = ''
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择插页来源 PDF',
      multiple: false,
      directory: false,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    })
    if (selected && !Array.isArray(selected)) await addPdfInsertSourcePath(selected)
  } catch (cause) {
    pdfInsertError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfInsertAdding.value = false
  }
}

const clearPdfInsertSource = () => {
  pdfInsertSourcePath.value = ''
  pdfInsertSourceSignature.value = ''
  pdfInsertPathInput.value = ''
  pdfInsertVerification.value = null
  pdfInsertError.value = ''
}

const setPdfInsertPosition = (position: 'before' | 'after' | 'end') => {
  pdfInsertPosition.value = position
  invalidatePdfInsertVerification()
}

const pdfInsertBoundary = () => {
  const pages = pdfDocument.value?.numPages || 0
  if (pdfInsertPosition.value === 'end') return pages
  const anchor = Number(pdfInsertAnchorPage.value)
  if (!Number.isInteger(anchor) || anchor < 1 || anchor > pages) {
    throw new Error(`目标页必须在 1-${pages} 之间`)
  }
  return pdfInsertPosition.value === 'before' ? anchor - 1 : anchor
}

const verifyPdfInsert = async () => {
  if (!pdfInsertSourcePath.value || !pdfInsertSourceSignature.value || pdfInsertVerifying.value) return
  pdfInsertVerifying.value = true
  pdfInsertVerification.value = null
  pdfInsertError.value = ''
  try {
    const sourcePages = parsePdfInsertionPageRange(pdfInsertRangeInput.value)
    pdfInsertVerification.value = await invoke<PdfIsolatedInsertReport>('preview_pdf_insert_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: pdfPath.value,
      expectedSignature: pdfSourceSignature.value,
      sourcePath: pdfInsertSourcePath.value,
      sourceExpectedSignature: pdfInsertSourceSignature.value,
      sourcePages,
      insertAfterPage: pdfInsertBoundary(),
    })
  } catch (cause) {
    pdfInsertError.value = cause instanceof Error ? cause.message : String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfInsertVerifying.value = false
  }
}

const savePdfInsertCopy = async () => {
  const verification = pdfInsertVerification.value
  if (
    verification?.status !== 'isolated_verified'
    || !verification.outputDigest
    || !pdfInsertCopyName.value.trim()
    || pdfInsertSaving.value
  ) return
  pdfInsertSaving.value = true
  pdfInsertError.value = ''
  try {
    const saved = await invoke<PdfSavedInsertReport>('save_pdf_insert_copy', {
      libraryRoot: store.libraryPath,
      path: pdfPath.value,
      targetFileName: pdfInsertCopyName.value.trim(),
      expectedSignature: pdfSourceSignature.value,
      expectedOutputDigest: verification.outputDigest,
      sourcePath: pdfInsertSourcePath.value,
      sourceExpectedSignature: pdfInsertSourceSignature.value,
      sourcePages: verification.sourcePages,
      insertAfterPage: verification.insertAfterPage,
    })
    if (
      saved.status !== 'saved_verified'
      || !saved.sourcesUnchanged
      || !saved.structuralReopenVerified
      || !saved.textReopenVerified
      || !saved.pageGeometryVerified
    ) throw new Error('插页保存结果未通过完整复读')
    savedCopyNotice.value = {
      path: saved.targetPath,
      pages: saved.outputPages,
      bytes: saved.outputBytes,
    }
    clearPdfInsertSource()
    message.success(`已可靠插入并验证：${pdfInsertCopyName.value.trim()}`)
    await openManagedFile(router, saved.targetPath, {}, 'replace')
  } catch (cause) {
    pdfInsertError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfInsertSaving.value = false
  }
}

const initializePdfMergeInputs = (signature: string) => {
  pdfMergeInputs.value = pdfPath.value && signature
    ? [{ path: pdfPath.value, expectedSignature: signature }]
    : []
  pdfMergePathInput.value = ''
  pdfMergeVerification.value = null
  pdfMergeCopyName.value = `${fileName.value}-合并.pdf`
  pdfMergeError.value = ''
}

const invalidatePdfMergeVerification = () => {
  pdfMergeVerification.value = null
  pdfMergeError.value = ''
}

const addPdfMergeInputPath = async (path: string) => {
  const candidate = path.trim()
  if (!candidate) return
  if (pdfMergeInputs.value.length >= 16) throw new Error('一次最多合并 16 个 PDF')
  const normalized = candidate.replace(/\\/g, '/').toLocaleLowerCase()
  if (pdfMergeInputs.value.some(input => input.path.replace(/\\/g, '/').toLocaleLowerCase() === normalized)) {
    throw new Error('这个 PDF 已在合并列表中')
  }
  const descriptor = await invoke<PdfReadDescriptor>('read_pdf_info', {
    libraryRoot: store.libraryPath,
    path: candidate,
  })
  pdfMergeInputs.value = [...pdfMergeInputs.value, {
    path: candidate,
    expectedSignature: descriptor.signature,
  }]
  invalidatePdfMergeVerification()
}

const addPdfMergePathInput = async () => {
  if (pdfMergeAdding.value || !pdfMergePathInput.value.trim()) return
  pdfMergeAdding.value = true
  pdfMergeError.value = ''
  try {
    await addPdfMergeInputPath(pdfMergePathInput.value)
    pdfMergePathInput.value = ''
  } catch (cause) {
    pdfMergeError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfMergeAdding.value = false
  }
}

const pickPdfMergeInputs = async () => {
  if (pdfMergeAdding.value || pdfMergeInputs.value.length >= 16) return
  pdfMergeAdding.value = true
  pdfMergeError.value = ''
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择要合并的库内 PDF',
      multiple: true,
      directory: false,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    })
    const paths = selected ? (Array.isArray(selected) ? selected : [selected]) : []
    for (const path of paths) await addPdfMergeInputPath(path)
  } catch (cause) {
    pdfMergeError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfMergeAdding.value = false
  }
}

const movePdfMergeInput = (index: number, offset: -1 | 1) => {
  const target = index + offset
  if (target < 0 || target >= pdfMergeInputs.value.length) return
  const next = [...pdfMergeInputs.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  pdfMergeInputs.value = next
  invalidatePdfMergeVerification()
}

const removePdfMergeInput = (index: number) => {
  if (pdfMergeInputs.value[index]?.path === pdfPath.value) return
  pdfMergeInputs.value = pdfMergeInputs.value.filter((_, inputIndex) => inputIndex !== index)
  invalidatePdfMergeVerification()
}

const verifyPdfMerge = async () => {
  if (pdfMergeInputs.value.length < 2 || pdfMergeVerifying.value) return
  pdfMergeVerifying.value = true
  pdfMergeVerification.value = null
  pdfMergeError.value = ''
  try {
    pdfMergeVerification.value = await invoke<PdfIsolatedMergeReport>('preview_pdf_merge_isolated_copy', {
      libraryRoot: store.libraryPath,
      inputs: pdfMergeInputs.value,
    })
  } catch (cause) {
    pdfMergeError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfMergeVerifying.value = false
  }
}

const savePdfMergeCopy = async () => {
  const verification = pdfMergeVerification.value
  if (
    verification?.status !== 'isolated_verified'
    || !verification.outputDigest
    || !pdfMergeCopyName.value.trim()
    || pdfMergeSaving.value
  ) return
  pdfMergeSaving.value = true
  pdfMergeError.value = ''
  try {
    const saved = await invoke<PdfSavedMergeReport>('save_pdf_merge_copy', {
      libraryRoot: store.libraryPath,
      path: pdfPath.value,
      targetFileName: pdfMergeCopyName.value.trim(),
      expectedOutputDigest: verification.outputDigest,
      inputs: pdfMergeInputs.value,
    })
    if (
      saved.status !== 'saved_verified'
      || !saved.sourcesUnchanged
      || !saved.structuralReopenVerified
      || !saved.textReopenVerified
      || !saved.pageGeometryVerified
    ) throw new Error('合并保存结果未通过完整复读')
    savedCopyNotice.value = {
      path: saved.targetPath,
      pages: saved.outputPages,
      bytes: saved.outputBytes,
    }
    pdfMergeInputs.value = []
    pdfMergeVerification.value = null
    message.success(`已可靠合并并验证：${pdfMergeCopyName.value.trim()}`)
    await openManagedFile(router, saved.targetPath, {}, 'replace')
  } catch (cause) {
    pdfMergeError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pdfMergeSaving.value = false
  }
}

const initializePagePlan = (pageCount: number) => {
  pagePlan.value = createPdfPagePlan(pageCount)
  pagePlanUndo.value = []
  pagePlanRedo.value = []
  activePagePlanId.value = pagePlan.value[0]?.id || ''
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanCopyName.value = `${fileName.value}-页面整理.pdf`
  pagePlanSaveError.value = ''
  pagePlanMode.value = 'organize'
  pageRangeInput.value = pageCount > 1 ? '1' : ''
  pageRangePages.value = []
  pageRangeError.value = ''
}

const openPageOrganizer = () => {
  sidebarOpen.value = true
  sidebarTab.value = 'organize'
  if (!activePagePlanId.value) activePagePlanId.value = pagePlan.value[0]?.id || ''
}

const commitPagePlan = (
  next: PdfPagePlanEntry[],
  activeId?: string,
  mode: 'organize' | 'extract' = 'organize',
) => {
  if (JSON.stringify(next) === JSON.stringify(pagePlan.value)) return
  pagePlanUndo.value = [...pagePlanUndo.value.slice(-59), clonePdfPagePlan(pagePlan.value)]
  pagePlanRedo.value = []
  pagePlan.value = next
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanSaveError.value = ''
  pagePlanMode.value = mode
  if (mode === 'organize') pageRangePages.value = []
  if (activeId) activePagePlanId.value = activeId
}

const applyPageRangeExtraction = () => {
  if (!pdfDocument.value) return
  pageRangeError.value = ''
  try {
    const pages = parsePdfPageRange(pageRangeInput.value, pdfDocument.value.numPages)
    const next = createPdfExtractionPlan(pdfDocument.value.numPages, pages)
    pageRangePages.value = pages
    pagePlanCopyName.value = `${fileName.value}-页面提取.pdf`
    commitPagePlan(next, `pdf-source-page-${pages[0]}`, 'extract')
  } catch (cause) {
    pageRangeError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const rotatePlanEntry = (id: string, delta: -90 | 90) => {
  commitPagePlan(rotatePdfPage(pagePlan.value, id, delta), id)
}

const movePlanEntry = (id: string, offset: -1 | 1) => {
  commitPagePlan(movePdfPage(pagePlan.value, id, offset), id)
}

const togglePlanEntry = (id: string) => {
  const entry = pagePlan.value.find(item => item.id === id)
  if (!entry || (!entry.removed && visiblePagePlan.value.length <= 1)) return
  commitPagePlan(setPdfPageRemoved(pagePlan.value, id, !entry.removed), id)
}

const undoPagePlan = () => {
  const previous = pagePlanUndo.value[pagePlanUndo.value.length - 1]
  if (!previous) return
  pagePlanRedo.value = [...pagePlanRedo.value.slice(-59), clonePdfPagePlan(pagePlan.value)]
  pagePlan.value = clonePdfPagePlan(previous)
  pagePlanUndo.value = pagePlanUndo.value.slice(0, -1)
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanSaveError.value = ''
  pagePlanMode.value = 'organize'
  pageRangePages.value = []
}

const redoPagePlan = () => {
  const next = pagePlanRedo.value[pagePlanRedo.value.length - 1]
  if (!next) return
  pagePlanUndo.value = [...pagePlanUndo.value.slice(-59), clonePdfPagePlan(pagePlan.value)]
  pagePlan.value = clonePdfPagePlan(next)
  pagePlanRedo.value = pagePlanRedo.value.slice(0, -1)
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanSaveError.value = ''
  pagePlanMode.value = 'organize'
  pageRangePages.value = []
}

const resetPagePlan = () => {
  if (!pdfDocument.value || !pagePlanDirty.value) return
  commitPagePlan(createPdfPagePlan(pdfDocument.value.numPages), pagePlan.value[0]?.id)
  pagePlanCopyName.value = `${fileName.value}-页面整理.pdf`
}

const selectPagePlanEntry = (entry: PdfPagePlanEntry) => {
  activePagePlanId.value = entry.id
  goToPage(entry.sourcePage)
}

const visiblePageNumber = (id: string) => {
  const index = visiblePagePlan.value.findIndex(entry => entry.id === id)
  return index < 0 ? '—' : index + 1
}

const verifyPagePlan = async () => {
  if (!pagePlanDirty.value || !pdfSourceSignature.value || pagePlanVerifying.value) return
  pagePlanVerifying.value = true
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanSaveError.value = ''
  try {
    const command = pagePlanMode.value === 'extract'
      ? 'preview_pdf_page_range_extract_copy'
      : 'preview_pdf_page_plan_isolated_copy'
    const payload = pagePlanMode.value === 'extract'
      ? { pages: pageRangePages.value }
      : {
          plan: pagePlan.value.map(entry => ({
            sourcePage: entry.sourcePage,
            rotation: entry.rotation,
            removed: entry.removed,
          })),
        }
    pagePlanVerification.value = await invoke<PdfIsolatedPagePlanReport>(command, {
      libraryRoot: store.libraryPath,
      path: pdfPath.value,
      expectedSignature: pdfSourceSignature.value,
      ...payload,
    })
  } catch (cause) {
    pagePlanVerificationError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pagePlanVerifying.value = false
  }
}

const pdfCompatibilityLabel = (profile: PdfIsolatedPagePlanReport['compatibility']) => {
  const details = [
    `PDF ${profile.pdfVersion}`,
    profile.xrefKind === 'stream' ? '交叉引用流' : '传统交叉引用表',
  ]
  if (profile.compressedObjects) details.push(`${profile.compressedObjects} 个压缩对象`)
  if (profile.inheritedPageValues) details.push(`${profile.inheritedPageValues} 项页面树继承`)
  if (profile.textlessPages) details.push(`${profile.textlessPages} 个无文本页`)
  if (profile.producer) details.push(profile.producer)
  return `兼容矩阵：${details.join(' · ')}`
}

const savePagePlanCopy = async () => {
  const verification = pagePlanVerification.value
  if (
    verification?.status !== 'isolated_verified'
    || !verification.outputDigest
    || !pagePlanCopyName.value.trim()
    || pagePlanSaving.value
  ) return
  pagePlanSaving.value = true
  pagePlanSaveError.value = ''
  try {
    const command = pagePlanMode.value === 'extract'
      ? 'save_pdf_page_range_copy'
      : 'save_pdf_page_plan_copy'
    const payload = pagePlanMode.value === 'extract'
      ? { pages: pageRangePages.value }
      : {
          plan: pagePlan.value.map(entry => ({
            sourcePage: entry.sourcePage,
            rotation: entry.rotation,
            removed: entry.removed,
          })),
        }
    const saved = await invoke<PdfSavedPagePlanReport>(command, {
      libraryRoot: store.libraryPath,
      path: pdfPath.value,
      targetFileName: pagePlanCopyName.value.trim(),
      expectedSignature: pdfSourceSignature.value,
      expectedOutputDigest: verification.outputDigest,
      ...payload,
    })
    if (
      saved.status !== 'saved_verified'
      || !saved.sourceUnchanged
      || !saved.structuralReopenVerified
      || !saved.textReopenVerified
    ) throw new Error('保存结果未通过完整复读')
    pagePlan.value = createPdfPagePlan(pdfDocument.value?.numPages || 0)
    pagePlanUndo.value = []
    pagePlanRedo.value = []
    pagePlanVerification.value = null
    savedCopyNotice.value = {
      path: saved.targetPath,
      pages: saved.outputPages,
      bytes: saved.outputBytes,
    }
    message.success(`已可靠另存并验证：${pagePlanCopyName.value.trim()}`)
    await openManagedFile(router, saved.targetPath, {}, 'replace')
  } catch (cause) {
    pagePlanSaveError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    pagePlanSaving.value = false
  }
}

const persistOcrDocument = async () => {
  if (!ocrDocument.value) return
  const snapshot = JSON.parse(JSON.stringify(ocrDocument.value)) as PdfOcrDocument
  await invoke('write_pdf_ocr', { libraryRoot: store.libraryPath, pdfPath: pdfPath.value, document: snapshot })
}

const cancelOcr = async () => {
  if (!ocrBusy.value) return
  ocrGeneration++
  ocrTaskState.value = 'cancelled'
  ocrProgressStatus.value = '正在停止…'
  const worker = ocrWorker
  ocrWorker = null
  if (worker) await worker.terminate().catch(() => undefined)
}

const runOcr = async (requestedPages: number[], replaceExisting = false) => {
  if (!pdfDocument.value || !ocrDocument.value || ocrBusy.value || ocrSourceChanged.value) return
  const existing = new Set(ocrDocument.value.pages.map(page => page.page))
  const pages = requestedPages
    .filter(page => Number.isInteger(page) && page >= 1 && page <= pdfDocument.value!.numPages)
    .filter(page => replaceExisting || !existing.has(page))
  if (!pages.length) {
    message.info('所选页面已有 OCR 结果；可用“识别当前页”重新识别。')
    return
  }
  const generation = ++ocrGeneration
  ocrTaskState.value = 'preparing'
  ocrError.value = ''
  ocrCompletedPages.value = 0
  ocrTotalPages.value = pages.length
  ocrPageProgress.value = 0
  ocrProgressStatus.value = '初始化离线引擎'
  openOcrPanel()
  try {
    const worker = await createOfflineOcrWorker(progress => {
      if (generation !== ocrGeneration) return
      ocrProgressStatus.value = progress.status
      if (ocrTaskState.value === 'running') ocrPageProgress.value = progress.progress
    })
    if (generation !== ocrGeneration) {
      await worker.terminate()
      return
    }
    ocrWorker = worker
    ocrTaskState.value = 'running'
    for (const pageNumber of pages) {
      if (generation !== ocrGeneration || !pdfDocument.value) return
      ocrCurrentPage.value = pageNumber
      ocrPageProgress.value = 0
      const page = await pdfDocument.value.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const renderScale = Math.min(2, 3000 / Math.max(baseViewport.width, baseViewport.height))
      const viewport = page.getViewport({ scale: Math.max(1, renderScale) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('无法创建 OCR 页面画布')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      if (generation !== ocrGeneration) return
      const result = await worker.recognize(canvas)
      if (generation !== ocrGeneration) return
      const recognized: PdfOcrPage = {
        page: pageNumber,
        text: result.data.text.trim().slice(0, 500_000),
        confidence: Math.max(0, Math.min(100, result.data.confidence || 0)),
        processedAt: Date.now(),
        width: canvas.width,
        height: canvas.height,
      }
      ocrDocument.value.pages = ocrDocument.value.pages.filter(item => item.page !== pageNumber)
      ocrDocument.value.pages.push(recognized)
      ocrDocument.value.updatedAt = Date.now()
      await persistOcrDocument()
      ocrCompletedPages.value++
      ocrPageProgress.value = 0
      canvas.width = 0
      canvas.height = 0
    }
    ocrTaskState.value = 'completed'
    message.success(`OCR 完成：${pages.length} 页已保存并进入统一索引`)
  } catch (cause) {
    if (generation !== ocrGeneration) return
    ocrTaskState.value = 'failed'
    ocrError.value = `OCR 任务失败：${String(cause).replace(/^Error:\s*/, '')}`
  } finally {
    if (generation === ocrGeneration) {
      const worker = ocrWorker
      ocrWorker = null
      if (worker) await worker.terminate().catch(() => undefined)
    }
  }
}

const persistAnnotations = async () => {
  if (!annotationDocument.value || !annotationWritable.value || !annotationDirty.value || !annotationSourcePath || !annotationLibraryRoot) return
  const snapshot = JSON.parse(JSON.stringify(annotationDocument.value)) as PdfAnnotationDocument
  const revision = annotationRevision
  const sourcePath = annotationSourcePath
  const libraryRoot = annotationLibraryRoot
  annotationSaving.value = true
  annotationSaveError.value = ''
  annotationSaveChain = annotationSaveChain.catch(() => undefined).then(async () => {
    try {
      await invoke('write_pdf_annotations', { libraryRoot, pdfPath: sourcePath, document: snapshot })
      if (revision === annotationRevision) annotationDirty.value = false
    } catch (cause) {
      annotationDirty.value = true
      annotationSaveError.value = `批注保存失败：${String(cause)}`
    } finally {
      annotationSaving.value = false
    }
  })
  await annotationSaveChain
}

const scheduleAnnotationSave = () => {
  annotationRevision++
  annotationDirty.value = true
  window.clearTimeout(annotationSaveTimer)
  annotationSaveTimer = window.setTimeout(persistAnnotations, 280)
}

const addAnnotation = (annotation: PdfAnnotation) => {
  if (!annotationDocument.value || !annotationWritable.value) return
  annotationDocument.value.annotations.push(annotation)
  selectedAnnotationId.value = annotation.id
  sidebarOpen.value = true
  sidebarTab.value = 'annotations'
  scheduleAnnotationSave()
}

const makeAnnotation = (kind: PdfAnnotationKind, page: number, rects: PdfAnnotationRect[], quote = '', comment = '', color = annotationColor.value): PdfAnnotation => {
  const now = Date.now()
  return { id: makeAnnotationId(), kind, page, color, rects, quote: quote.slice(0, 20_000), comment: comment.slice(0, 20_000), createdAt: now, updatedAt: now }
}

const dismissSelectionTool = () => {
  selectionTool.value.show = false
  window.getSelection()?.removeAllRanges()
}

const captureTextSelection = () => {
  if (areaMode.value || !annotationWritable.value) return
  window.setTimeout(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) { selectionTool.value.show = false; return }
    const range = selection.getRangeAt(0)
    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer as Element
      : range.commonAncestorContainer.parentElement
    const textLayer = ancestor?.closest('.textLayer')
    const pageHost = textLayer?.closest<HTMLElement>('[data-pdf-page]')
    const quote = selection.toString().trim()
    if (!pageHost || !quote) { selectionTool.value.show = false; return }
    const hostBounds = pageHost.getBoundingClientRect()
    const rects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1 && rect.bottom > hostBounds.top && rect.top < hostBounds.bottom).slice(0, 200).map(rect => {
      const x = Math.max(0, Math.min(1, (rect.left - hostBounds.left) / hostBounds.width))
      const y = Math.max(0, Math.min(1, (rect.top - hostBounds.top) / hostBounds.height))
      return {
        x,
        y,
        width: Math.min(1 - x, rect.width / hostBounds.width),
        height: Math.min(1 - y, rect.height / hostBounds.height),
      }
    }).filter(rect => rect.width > 0 && rect.height > 0)
    if (!rects.length) { selectionTool.value.show = false; return }
    const bounds = range.getBoundingClientRect()
    selectionTool.value = {
      show: true, page: Number(pageHost.dataset.pdfPage), quote, rects,
      x: Math.max(12, Math.min(window.innerWidth - 360, bounds.left)),
      y: Math.max(12, bounds.top - 48),
    }
  }, 0)
}

const createSelectionAnnotation = (color: PdfAnnotationColor, withComment: boolean) => {
  const tool = selectionTool.value
  if (!tool.show) return
  annotationColor.value = color
  const comment = withComment ? window.prompt('为这段高亮添加评论（可留空）', '') : ''
  if (withComment && comment === null) return
  addAnnotation(makeAnnotation('highlight', tool.page, tool.rects, tool.quote, comment || '', color))
  dismissSelectionTool()
}

const createAreaAnnotation = (page: number, rect: PdfAnnotationRect) => {
  const comment = window.prompt('区域批注评论（可留空）', '')
  if (comment === null) return
  addAnnotation(makeAnnotation('area', page, [rect], '', comment))
  areaMode.value = false
}

const createPageComment = () => {
  const comment = window.prompt(`为第 ${currentPage.value} 页添加评论`, '')
  if (!comment?.trim()) return
  addAnnotation(makeAnnotation('comment', currentPage.value, [], '', comment.trim()))
}

const scrollToAnnotation = (id: string, attempt = 0) => {
  if (selectedAnnotationId.value !== id) return
  const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
  const element = document.querySelector<HTMLElement>(`[data-annotation-id="${escapedId}"]`)
  if (element) element.scrollIntoView({ behavior: attempt ? 'auto' : 'smooth', block: 'center', inline: 'center' })
  else if (attempt < 20) window.setTimeout(() => scrollToAnnotation(id, attempt + 1), 40)
}

const selectAnnotation = (id: string) => {
  const annotation = annotations.value.find(item => item.id === id)
  if (!annotation) return
  selectedAnnotationId.value = id
  sidebarOpen.value = true
  sidebarTab.value = 'annotations'
  goToPage(annotation.page, 'auto')
  nextTick(() => scrollToAnnotation(id))
}

const touchSelectedAnnotation = () => {
  if (!selectedAnnotation.value) return
  selectedAnnotation.value.updatedAt = Date.now()
  scheduleAnnotationSave()
}
const setSelectedAnnotationColor = (color: PdfAnnotationColor) => {
  if (!selectedAnnotation.value) return
  selectedAnnotation.value.color = color
  annotationColor.value = color
  touchSelectedAnnotation()
}

const buildSelectedAnnotationReference = async (): Promise<PdfAnnotationReference> => {
  if (!selectedAnnotation.value) throw new Error('请先选择一条批注')
  window.clearTimeout(annotationSaveTimer)
  await persistAnnotations()
  if (annotationDirty.value || annotationSaveError.value) throw new Error(annotationSaveError.value || '批注尚未保存')
  return invoke<PdfAnnotationReference>('build_pdf_annotation_reference', {
    libraryRoot: store.libraryPath,
    pdfPath: pdfPath.value,
    annotationId: selectedAnnotation.value.id,
  })
}

const copySelectedAnnotationReference = async () => {
  referenceWorking.value = true
  try {
    const reference = await buildSelectedAnnotationReference()
    await navigator.clipboard.writeText(reference.markdown)
    message.success('批注引用已复制')
  } catch (cause) {
    message.error(`复制引用失败：${String(cause)}`)
  } finally {
    referenceWorking.value = false
  }
}

const insertSelectedAnnotationReference = async () => {
  const target = markdownTarget.value
  if (!target) return
  referenceWorking.value = true
  try {
    const reference = await buildSelectedAnnotationReference()
    const disk = target.content === undefined
      ? await invoke<{ content: string }>('read_markdown_file', { libraryRoot: store.libraryPath, path: target.path })
      : undefined
    const content = target.content ?? disk?.content ?? ''
    const separator = content ? (content.endsWith('\n') ? '\n' : '\n\n') : ''
    const updated = `${content}${separator}${reference.markdown}\n`
    await invoke('write_markdown_file', { libraryRoot: store.libraryPath, path: target.path, content: updated })
    store.updateTabContent(target.path, updated)
    message.success(`已插入到 ${target.title}`)
    await router.push({ name: 'LibraryMode', query: { path: target.path } })
  } catch (cause) {
    message.error(`插入引用失败：${String(cause)}`)
  } finally {
    referenceWorking.value = false
  }
}
const deleteSelectedAnnotation = () => {
  if (!annotationDocument.value || !selectedAnnotation.value || !window.confirm('确定删除这条 PDF 批注吗？')) return
  const id = selectedAnnotation.value.id
  annotationDocument.value.annotations = annotationDocument.value.annotations.filter(annotation => annotation.id !== id)
  selectedAnnotationId.value = ''
  scheduleAnnotationSave()
}

const clearTextState = () => {
  searchGeneration++
  textPromises.clear()
  textAccess.clear()
  for (const key of Object.keys(textContents)) delete textContents[Number(key)]
  searchMatches.value = []
  activeMatchIdState.value = ''
  searchIndexedPages.value = 0
  searchRunning.value = false
  searchQuery.value = ''
}

const trimTextCache = () => {
  const limit = 48
  const keys = Object.keys(textContents).map(Number)
  if (keys.length <= limit) return
  const activePage = searchMatches.value.find(match => match.id === activeMatchIdState.value)?.page
  const removable = keys
    .filter(page => page !== currentPage.value && page !== activePage)
    .sort((left, right) => (textAccess.get(left) || 0) - (textAccess.get(right) || 0))
  for (const page of removable.slice(0, Math.max(0, keys.length - limit))) {
    delete textContents[page]
    textAccess.delete(page)
  }
}

const ensurePageText = (pageNumber: number): Promise<TextContent | undefined> => {
  if (textContents[pageNumber]) {
    textAccess.set(pageNumber, performance.now())
    return Promise.resolve(textContents[pageNumber])
  }
  const pending = textPromises.get(pageNumber)
  if (pending) return pending
  const document = pdfDocument.value
  if (!document) return Promise.resolve(undefined)
  const promise = document.getPage(pageNumber)
    .then(page => page.getTextContent({ includeMarkedContent: false }))
    .then(content => {
      if (pdfDocument.value === document) {
        textContents[pageNumber] = content
        textAccess.set(pageNumber, performance.now())
        trimTextCache()
      }
      return pdfDocument.value === document ? content : undefined
    })
    .catch(error => { console.error(`PDF page ${pageNumber} text extraction failed`, error); return undefined })
    .finally(() => textPromises.delete(pageNumber))
  textPromises.set(pageNumber, promise)
  return promise
}

const recordPageRendered = () => {
  if (firstPageReadyMs.value || !loadStartedAt) return
  firstPageReadyMs.value = Math.max(1, Math.round(performance.now() - loadStartedAt))
}

const scrollToMatch = (match: PdfSearchMatch, attempt = 0) => {
  if (activeMatchIdState.value !== match.id) return
  const element = document.querySelector<HTMLElement>(`[data-match-id="${match.id}"]`)
  if (element) {
    element.scrollIntoView({ behavior: attempt ? 'auto' : 'smooth', block: 'center', inline: 'center' })
  } else if (attempt < 20) {
    window.setTimeout(() => scrollToMatch(match, attempt + 1), 40)
  }
}

const activateMatch = (match: PdfSearchMatch) => {
  activeMatchIdState.value = match.id
  goToPage(match.page, 'auto')
  nextTick(() => scrollToMatch(match))
}

const navigateMatch = (direction: 1 | -1) => {
  if (!searchMatches.value.length) return
  const current = activeMatchIndex.value
  const next = current < 0
    ? (direction > 0 ? 0 : searchMatches.value.length - 1)
    : (current + direction + searchMatches.value.length) % searchMatches.value.length
  activateMatch(searchMatches.value[next])
}

const clearSearch = () => {
  searchQuery.value = ''
  searchMatches.value = []
  activeMatchIdState.value = ''
  searchRunning.value = false
  searchGeneration++
  searchInputRef.value?.focus()
}

const runSearch = async () => {
  const query = searchQuery.value.trim()
  const document = pdfDocument.value
  const generation = ++searchGeneration
  searchMatches.value = []
  activeMatchIdState.value = ''
  searchIndexedPages.value = 0
  if (!query || !document) { searchRunning.value = false; return }
  searchRunning.value = true
  const pageResults = new Map<number, PdfSearchMatch[]>()
  const pages = [currentPage.value, ...Array.from({ length: document.numPages }, (_, index) => index + 1).filter(page => page !== currentPage.value)]
  let firstMatch: PdfSearchMatch | undefined
  for (const pageNumber of pages) {
    if (generation !== searchGeneration || pdfDocument.value !== document) return
    const content = await ensurePageText(pageNumber)
    if (content) {
      const matches = findPdfPageMatches(pageNumber, buildPdfPageText(content).text, query)
      pageResults.set(pageNumber, matches)
      if (!firstMatch && matches.length) firstMatch = matches[0]
    }
    searchIndexedPages.value++
    searchMatches.value = [...pageResults.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, matches]) => matches)
    if (firstMatch && !activeMatchIdState.value) activateMatch(firstMatch)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  if (generation === searchGeneration) searchRunning.value = false
}

const loadPdf = async () => {
  await cancelOcr()
  ocrGeneration++
  annotationLoadGeneration++
  window.clearTimeout(annotationSaveTimer)
  await persistAnnotations()
  error.value = ''
  loading.value = true
  loadStartedAt = performance.now()
  firstPageReadyMs.value = 0
  loadProgress.value = 0
  outline.value = []
  annotationDocument.value = null
  annotationSourcePath = ''
  annotationLibraryRoot = ''
  annotationRevision = 0
  annotationDirty.value = false
  annotationError.value = ''
  referenceNotice.value = ''
  selectedAnnotationId.value = ''
  areaMode.value = false
  ocrDocument.value = null
  ocrTaskState.value = 'idle'
  ocrError.value = ''
  ocrSourceChanged.value = false
  pagePlan.value = []
  pagePlanUndo.value = []
  pagePlanRedo.value = []
  activePagePlanId.value = ''
  pdfSourceSignature.value = ''
  pagePlanVerification.value = null
  pagePlanVerificationError.value = ''
  pagePlanCopyName.value = ''
  pagePlanSaveError.value = ''
  pdfMergeInputs.value = []
  pdfMergePathInput.value = ''
  pdfMergeVerification.value = null
  pdfMergeCopyName.value = ''
  pdfMergeError.value = ''
  pdfInsertPathInput.value = ''
  pdfInsertSourcePath.value = ''
  pdfInsertSourceSignature.value = ''
  pdfInsertRangeInput.value = '1'
  pdfInsertAnchorPage.value = 1
  pdfInsertPosition.value = 'after'
  pdfInsertVerification.value = null
  pdfInsertCopyName.value = ''
  pdfInsertError.value = ''
  dismissSelectionTool()
  clearTextState()
  await loadingTask?.destroy()
  rangeTransport?.abort()
  rangeTransport = null
  loadingTask = null
  pdfDocument.value = null
  if (!store.libraryPath || !pdfPath.value.toLowerCase().endsWith('.pdf')) {
    error.value = 'PDF 路径无效或知识库尚未配置'
    loading.value = false
    return
  }
  try {
    const descriptor = await invoke<PdfReadDescriptor>('read_pdf_info', { libraryRoot: store.libraryPath, path: pdfPath.value })
    pdfSourceSignature.value = descriptor.signature
    initializePdfMergeInputs(descriptor.signature)
    if (descriptor.fullData) {
      loadMode.value = 'full'
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(descriptor.fullData), useWasm: false })
    } else {
      loadMode.value = 'range'
      rangeTransport = new TauriPdfRangeTransport(
        descriptor.length,
        new Uint8Array(descriptor.initialData),
        {
          libraryRoot: store.libraryPath,
          path: pdfPath.value,
          signature: descriptor.signature,
          fileName: `${fileName.value}.pdf`,
          onError: cause => {
            error.value = cause
            loading.value = false
            void loadingTask?.destroy()
          },
        },
      )
      loadingTask = pdfjsLib.getDocument({
        range: rangeTransport,
        rangeChunkSize: descriptor.rangeChunkSize,
        disableStream: true,
        disableAutoFetch: true,
        useWasm: false,
      })
    }
    loadingTask.onProgress = (progress: { loaded: number; total: number }) => { if (progress.total) loadProgress.value = Math.min(100, Math.round(progress.loaded / progress.total * 100)) }
    loadingTask.onPassword = (updatePassword: (password: string) => void) => {
      const password = window.prompt('此 PDF 受密码保护，请输入密码')
      if (password !== null) updatePassword(password)
      else {
        error.value = '已取消输入 PDF 密码'
        loading.value = false
        loadingTask?.destroy()
      }
    }
    const document = await loadingTask.promise
    pdfDocument.value = document
    initializePagePlan(document.numPages)
    const firstPage = await document.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1 })
    basePage.value = { width: viewport.width, height: viewport.height }
    const restored = Math.max(1, Math.min(document.numPages, requestedPage() || readPositions()[positionId()] || 1))
    currentPage.value = restored
    pageInput.value = restored
    pdfInsertAnchorPage.value = restored
    pdfInsertCopyName.value = `${fileName.value}-插页.pdf`
    loading.value = false
    await nextTick()
    if (fitWidth.value) applyFitWidth()
    goToPage(restored, 'auto')
    loadOutline()
    await loadAnnotations(document)
    await loadOcrDocument(document)
  } catch (cause) {
    if (!error.value) error.value = String(cause).replace(/^Error:\s*/, '')
    loading.value = false
  }
}

const goToPage = (page: number, behavior: ScrollBehavior = 'smooth') => {
  if (!pdfDocument.value) return
  const target = Math.max(1, Math.min(pdfDocument.value.numPages, Math.round(page)))
  currentPage.value = target
  pageInput.value = target
  document.getElementById(`pdf-page-${target}`)?.scrollIntoView({ behavior, block: 'start' })
  schedulePositionSave()
}
const commitPageInput = () => goToPage(pageInput.value || currentPage.value)
const setScale = (value: number) => {
  fitWidth.value = false
  scale.value = Math.max(0.5, Math.min(2.5, Math.round(value * 10) / 10))
  nextTick(() => goToPage(currentPage.value, 'auto'))
}
const changeScale = (delta: number) => setScale(scale.value + delta)
const applyFitWidth = () => {
  if (!scrollRef.value) return
  scale.value = Math.max(0.5, Math.min(2.5, (scrollRef.value.clientWidth - 64) / basePage.value.width))
  nextTick(() => goToPage(currentPage.value, 'auto'))
}
const toggleFitWidth = () => { fitWidth.value = !fitWidth.value; if (fitWidth.value) applyFitWidth() }
const schedulePositionSave = () => { window.clearTimeout(positionTimer); positionTimer = window.setTimeout(savePosition, 250) }

const handleScroll = () => {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    const container = scrollRef.value
    if (!container) return
    const top = container.getBoundingClientRect().top + 96
    let nearest = currentPage.value, distance = Infinity
    for (const element of container.querySelectorAll<HTMLElement>('.page-shell')) {
      const delta = Math.abs(element.getBoundingClientRect().top - top)
      if (delta < distance) { distance = delta; nearest = Number(element.dataset.page) }
    }
    if (nearest !== currentPage.value) { currentPage.value = nearest; pageInput.value = nearest; schedulePositionSave() }
  })
}

const openOutlineItem = async (item: OutlineEntry) => {
  if (!pdfDocument.value || !item.destination) return
  try {
    const destination = typeof item.destination === 'string' ? await pdfDocument.value.getDestination(item.destination) : item.destination
    if (!destination?.[0]) return
    const pageIndex = typeof destination[0] === 'object' ? await pdfDocument.value.getPageIndex(destination[0] as any) : Number(destination[0])
    goToPage(pageIndex + 1)
  } catch { /* malformed outline target */ }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    areaMode.value = false
    dismissSelectionTool()
  }
  if (!(event.ctrlKey || event.metaKey)) return
  const target = event.target as HTMLElement | null
  const editingText = Boolean(target?.closest('input, textarea, [contenteditable="true"]'))
  if (sidebarTab.value === 'organize' && !editingText && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redoPagePlan()
    else undoPagePlan()
    return
  }
  if (sidebarTab.value === 'organize' && !editingText && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redoPagePlan()
    return
  }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); searchInputRef.value?.focus(); searchInputRef.value?.select(); return }
  if (event.key === '=' || event.key === '+') { event.preventDefault(); changeScale(0.1) }
  if (event.key === '-') { event.preventDefault(); changeScale(-0.1) }
  if (event.key === '0') { event.preventDefault(); setScale(1) }
}

const handleResize = () => { if (fitWidth.value) applyFitWidth() }
const mayDiscardPagePlan = () => !pdfWorkspaceDirty.value || window.confirm('PDF 页面整理或合并草稿尚未生成新文件，离开后将丢失。确定离开吗？')
const warnPagePlanBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!pdfWorkspaceDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
watch([pdfPath, () => store.libraryPath], loadPdf)
watch([() => route.query.page, () => route.query.annotation], () => {
  if (pdfDocument.value && annotationDocument.value) focusRequestedReference()
})
watch(searchQuery, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(runSearch, 220)
})
onBeforeRouteLeave(() => mayDiscardPagePlan())
onBeforeRouteUpdate((to, from) => String(to.query.path || '') === String(from.query.path || '') || mayDiscardPagePlan())
onMounted(() => {
  loadPdf()
  window.addEventListener('resize', handleResize)
  window.addEventListener('beforeunload', warnPagePlanBeforeUnload)
})
onBeforeUnmount(async () => {
  await cancelOcr()
  savePosition()
  window.clearTimeout(positionTimer)
  window.clearTimeout(searchTimer)
  window.clearTimeout(annotationSaveTimer)
  searchGeneration++
  cancelAnimationFrame(scrollFrame)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('beforeunload', warnPagePlanBeforeUnload)
  await persistAnnotations()
  await loadingTask?.destroy()
  rangeTransport?.abort()
  rangeTransport = null
  pdfjsLib.TextLayer.cleanup()
})
</script>

<style scoped>
.pdf-view { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 92%, var(--theme-text-secondary)); outline: none; }
.pdf-toolbar { min-height: 58px; display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr); align-items: center; gap: 14px; padding: 0 16px; border-bottom: 1px solid var(--workspace-border-color); background: var(--theme-card); box-shadow: var(--workspace-shadow-sm); z-index: 5; }
.toolbar-leading,.toolbar-center,.toolbar-actions { display: flex; align-items: center; gap: 7px; }
.toolbar-actions { justify-content: flex-end; }
.document-title { min-width: 0; display: flex; flex-direction: column; }
.document-title strong { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.document-title span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.icon-btn,.scale-label,.fit-btn { height: 32px; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text); background: var(--workspace-control-bg); cursor: pointer; }
.icon-btn { min-width: 32px; font-size: 18px; }
.icon-btn:hover,.icon-btn.active,.fit-btn:hover,.fit-btn.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.09); }
.icon-btn:disabled { cursor: default; opacity: .35; }
.scale-label { min-width: 54px; font-size: 11px; }
.fit-btn { flex: none; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; font-size: var(--text-compact); font-weight: 650; }
.pdf-search { height: 32px; width: 184px; display: flex; align-items: center; gap: 4px; padding: 0 5px 0 9px; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); }
.pdf-search.active { width: 280px; border-color: rgba(var(--theme-primary-rgb),.35); background: rgba(var(--theme-primary-rgb),.055); }
.pdf-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--theme-text); background: transparent; font-size: var(--text-compact); }
.pdf-search small { flex: none; color: var(--theme-text-secondary); font-size: var(--text-compact); white-space: nowrap; }
.pdf-search button { width: 21px; height: 22px; flex: none; padding: 0; border: 0; border-radius: 4px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }
.pdf-search button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); }
.pdf-search button:disabled { cursor: default; opacity: .35; }
.page-jump { height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); font-size: var(--text-compact); }
.page-jump input { width: 42px; border: 0; outline: 0; color: var(--theme-text); background: transparent; text-align: right; }
.pdf-workspace { min-height: 0; flex: 1; display: flex; }
.pdf-sidebar { width: 220px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--workspace-border-color); background: color-mix(in srgb, var(--theme-card) 96%, #d9dde3); }
.pdf-sidebar.organize-open { width: 272px; }
.sidebar-switch { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; padding: 9px; border-bottom: 1px solid var(--workspace-border-color); }
.sidebar-switch button { height: 28px; border: 0; border-radius: 6px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.sidebar-switch button.active { color: var(--workspace-on-accent); background: var(--theme-primary); }
.thumbnail-list,.outline-list { min-height: 0; flex: 1; overflow: auto; padding: 12px; }
.thumbnail-item { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 12px; padding: 8px; border: 1px solid transparent; border-radius: 8px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.thumbnail-item:hover,.thumbnail-item.active { border-color: rgba(var(--theme-primary-rgb),.45); background: rgba(var(--theme-primary-rgb),.08); }
.outline-list { padding: 8px 0; }
.outline-list button { width: 100%; min-height: 34px; padding: 7px 12px; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; font-size: var(--text-compact); line-height: 1.4; }
.outline-list button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); }
.sidebar-empty { padding: 24px 14px; color: var(--theme-text-secondary); font-size: var(--text-compact); text-align: center; }
.annotation-panel { min-height: 0; flex: 1; overflow: auto; padding: 9px; }
.annotation-alert { margin-bottom: 8px; padding: 8px; border: 1px solid rgba(220,76,62,.24); border-radius: 7px; color: var(--status-danger); background: rgba(220,76,62,.08); font-size: var(--text-compact); line-height: 1.45; }
.annotation-card { width: 100%; display: flex; flex-direction: column; gap: 5px; margin-bottom: 6px; padding: 9px; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text); background: var(--workspace-surface-raised); cursor: pointer; text-align: left; }
.annotation-card:hover,.annotation-card.active { border-color: rgba(var(--theme-primary-rgb),.42); background: rgba(var(--theme-primary-rgb),.08); }
.annotation-card-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }.annotation-card-head strong { font-size: var(--text-compact); }.annotation-card-head i { width: 7px; height: 7px; flex: none; border-radius: 50%; }.dot-yellow { background: #e3b500; }.dot-green { background: #159653; }.dot-pink { background: #d83a83; }.dot-blue { background: #1674d1; }
.annotation-card > span:last-child { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.annotation-editor { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--workspace-border-color); }.annotation-editor label { color: var(--theme-text-secondary); font-size: var(--text-compact); }.annotation-editor textarea { width: 100%; min-height: 74px; margin-top: 5px; padding: 7px; box-sizing: border-box; resize: vertical; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); font: inherit; line-height: 1.45; }.annotation-editor textarea:focus { outline: 1px solid var(--theme-primary); }
.annotation-colors { display: flex; gap: 7px; }.annotation-colors button,.selection-annotation-tool > button:not(.comment-selection):not(.close-selection) { width: 18px; height: 18px; padding: 0; border: 2px solid #fff; border-radius: 50%; cursor: pointer; box-shadow: 0 0 0 1px var(--workspace-border-color); }.annotation-colors button.active { outline: 2px solid var(--theme-primary); outline-offset: 1px; }.color-yellow { background: #f0c928; }.color-green { background: #2fbd75; }.color-pink { background: #ef68a6; }.color-blue { background: #3e91ee; }
.annotation-reference-actions { display: grid; grid-template-columns: 1fr 1.35fr; gap: 6px; }.annotation-reference-actions button { min-height: 28px; padding: 4px 6px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: var(--text-compact); line-height: 1.25; }.annotation-reference-actions button:disabled { cursor: default; opacity: .4; }
.delete-annotation { height: 28px; border: 1px solid rgba(220,76,62,.24); border-radius: 6px; color: var(--status-danger); background: rgba(220,76,62,.06); cursor: pointer; font-size: var(--text-compact); }.delete-annotation:disabled,.annotation-colors button:disabled { cursor: default; opacity: .4; }
.annotation-save-state { margin-top: 10px; text-align: left; }
.ocr-panel { min-height: 0; flex: 1; overflow: auto; padding: 10px; }
.ocr-summary { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 8px; background: rgba(var(--theme-primary-rgb),.055); }.ocr-summary strong { font-size: 11px; }.ocr-summary span,.ocr-summary p { margin: 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.ocr-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; }.ocr-actions button,.ocr-progress button { min-height: 30px; border: 1px solid rgba(var(--theme-primary-rgb),.25); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: var(--text-compact); }
.ocr-progress { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; padding: 9px; border-radius: 7px; background: var(--workspace-control-bg); font-size: var(--text-compact); }.ocr-progress progress { width: 100%; accent-color: var(--theme-primary); }.ocr-progress small,.ocr-note { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.ocr-page-list { display: flex; flex-direction: column; gap: 6px; }.ocr-page-list button { display: flex; flex-direction: column; gap: 5px; padding: 8px; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text); background: var(--workspace-surface-raised); cursor: pointer; text-align: left; }.ocr-page-list button > span { display: flex; justify-content: space-between; font-size: var(--text-compact); }.ocr-page-list i { color: var(--theme-primary); font-style: normal; }.ocr-page-list small { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.page-plan-dirty { display: inline-flex; margin-left: 7px; padding: 2px 5px; border-radius: 999px; color: var(--status-warning); background: #fff0c7; font-size: var(--text-compact); font-style: normal; font-weight: 650; vertical-align: 1px; }
.page-organizer { min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-plan-summary { max-height: min(68%,520px); flex: none; overflow: auto; padding: 10px; border-bottom: 1px solid var(--workspace-border-color); background: rgba(var(--theme-primary-rgb),.035); }
.page-plan-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.page-plan-saved { margin-bottom: 8px; }.page-plan-saved strong,.page-plan-saved span { color: inherit; font-size: var(--text-compact); }
.page-plan-summary strong { font-size: 11px; }.page-plan-summary span { color: var(--theme-primary); font-size: var(--text-compact); }
.pdf-merge-panel,.pdf-insert-panel { display: grid; gap: 6px; margin-top: 8px; padding: 8px 0; border-top: 1px solid var(--workspace-border-color); border-bottom: 1px solid var(--workspace-border-color); }
.pdf-merge-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.pdf-merge-heading strong { color: var(--theme-text); font-size: var(--text-compact); }.pdf-merge-heading span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.pdf-merge-add { display: grid; grid-template-columns: minmax(0,1fr) auto 30px; gap: 4px; }.pdf-merge-add input { min-width: 0; height: 28px; box-sizing: border-box; padding: 0 7px; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.pdf-merge-add input:focus { border-color: rgba(var(--theme-primary-rgb),.45); }.pdf-merge-add button { height: 28px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.25); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.pdf-merge-add button:disabled { cursor: default; opacity: .4; }.pdf-merge-add .pdf-merge-pick { display: grid; width: 30px; padding: 0; place-items: center; }
.pdf-merge-panel > small,.pdf-insert-panel > small { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.4; }.pdf-merge-error { color: var(--status-danger) !important; }
.pdf-insert-source { display: grid; grid-template-columns: minmax(0,1fr) 24px; align-items: center; gap: 4px; min-height: 27px; padding-left: 7px; border-left: 2px solid var(--theme-primary); background: var(--workspace-control-bg); }.pdf-insert-source span { overflow: hidden; color: var(--theme-text); text-overflow: ellipsis; white-space: nowrap; }.pdf-insert-source button { width: 21px; height: 21px; padding: 0; border: 1px solid var(--workspace-border-color); border-radius: 4px; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; }
.pdf-insert-range { display: grid; gap: 4px; }.pdf-insert-range span,.pdf-insert-position label span { color: var(--theme-text); font-size: var(--text-compact); font-weight: 650; }.pdf-insert-range input,.pdf-insert-position input { width: 100%; height: 27px; box-sizing: border-box; padding: 0 7px; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.pdf-insert-range input:focus,.pdf-insert-position input:focus { border-color: rgba(var(--theme-primary-rgb),.45); }
.pdf-insert-position { display: grid; grid-template-columns: 62px minmax(0,1fr); align-items: end; gap: 5px; }.pdf-insert-position label { display: grid; gap: 4px; }.pdf-insert-segments { display: grid; grid-template-columns: repeat(3,1fr); height: 27px; }.pdf-insert-segments button { min-width: 0; padding: 0 4px; border: 1px solid var(--workspace-border-color); border-right-width: 0; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; font-size: var(--text-compact); }.pdf-insert-segments button:first-child { border-radius: 5px 0 0 5px; }.pdf-insert-segments button:last-child { border-right-width: 1px; border-radius: 0 5px 5px 0; }.pdf-insert-segments button.active { color: var(--workspace-on-accent); border-color: var(--theme-primary); background: var(--theme-primary); }
.pdf-merge-list { display: grid; gap: 3px; max-height: 128px; overflow: auto; }.pdf-merge-list article { display: grid; grid-template-columns: 18px minmax(0,1fr) auto auto; align-items: center; gap: 4px; min-height: 28px; padding: 0 4px; border-left: 2px solid transparent; background: var(--workspace-control-bg); }.pdf-merge-list article.current { border-left-color: var(--theme-primary); }.pdf-merge-order { color: var(--theme-text-secondary); font-size: var(--text-compact); text-align: center; }.pdf-merge-name { overflow: hidden; color: var(--theme-text); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }.pdf-merge-current { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 650; }
.pdf-merge-actions { display: flex; gap: 2px; }.pdf-merge-actions button { width: 21px; height: 21px; padding: 0; border: 1px solid var(--workspace-border-color); border-radius: 4px; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; font-size: var(--text-compact); }.pdf-merge-actions button:disabled { cursor: default; opacity: .28; }
.pdf-merge-verify { min-height: 29px; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.pdf-merge-verify:disabled { cursor: default; opacity: .4; }
.pdf-merge-verification { display: flex; flex-direction: column; gap: 3px; padding: 7px; border-left: 2px solid #2f9b63; color: var(--status-success); background: rgba(43,125,78,.06); }.pdf-merge-verification.blocked { border-left-color: var(--status-danger); color: var(--status-danger); background: rgba(180,93,79,.06); }.pdf-merge-verification strong { font-size: var(--text-compact); }.pdf-merge-verification span,.pdf-merge-verification small { color: inherit; font-size: var(--text-compact); line-height: 1.4; }
.pdf-merge-save { display: grid; gap: 4px; margin-top: 4px; padding-top: 5px; border-top: 1px solid rgba(43,125,78,.16); }.pdf-merge-save input { width: 100%; height: 27px; box-sizing: border-box; padding: 0 7px; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.pdf-merge-save button { min-height: 28px; border: 0; border-radius: 5px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.pdf-merge-save button:disabled { cursor: default; opacity: .42; }
.page-range-extract { display: grid; gap: 5px; margin-top: 8px; padding: 8px 0; border-top: 1px solid var(--workspace-border-color); border-bottom: 1px solid var(--workspace-border-color); }
.page-range-extract label { display: grid; gap: 4px; }.page-range-extract label span { color: var(--theme-text); font-size: var(--text-compact); font-weight: 650; }
.page-range-extract input { width: 100%; height: 28px; box-sizing: border-box; padding: 0 7px; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.page-range-extract input:focus { border-color: rgba(var(--theme-primary-rgb),.45); }
.page-range-extract button { min-height: 28px; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }
.page-range-extract small { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.4; }.page-range-extract .page-range-error { color: var(--status-danger); }
.page-plan-summary p { margin: 7px 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.page-plan-history { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.page-plan-history button,.page-plan-actions button { min-height: 26px; padding: 3px 6px; border: 1px solid var(--workspace-border-color); border-radius: 5px; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; font-size: var(--text-compact); }
.page-plan-history button:hover,.page-plan-actions button:hover { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.35); }
.page-plan-history button:disabled,.page-plan-actions button:disabled { cursor: default; opacity: .35; }
.page-plan-verify { width: 100%; min-height: 30px; margin-top: 7px; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.page-plan-verify:disabled { cursor: default; opacity: .42; }
.page-plan-verification { display: flex; flex-direction: column; gap: 3px; margin-top: 7px; padding: 8px; border: 1px solid rgba(43,125,78,.22); border-radius: 7px; color: var(--status-success); background: rgba(43,125,78,.07); }.page-plan-verification.blocked { border-color: rgba(184,76,62,.22); color: var(--status-danger); background: rgba(184,76,62,.07); }.page-plan-verification strong { font-size: var(--text-compact); }.page-plan-verification span,.page-plan-verification small { color: inherit; font-size: var(--text-compact); line-height: 1.45; }
.page-plan-save { display: flex; flex-direction: column; gap: 5px; margin-top: 5px; padding-top: 6px; border-top: 1px solid rgba(43,125,78,.16); }.page-plan-save label { display: flex; flex-direction: column; gap: 3px; }.page-plan-save input { width: 100%; height: 28px; padding: 0 7px; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.page-plan-save input:focus { border-color: rgba(var(--theme-primary-rgb),.45); }.page-plan-save button { min-height: 29px; border: 0; border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.page-plan-save button:disabled { cursor: default; opacity: .42; }.page-plan-save > small { color: var(--status-danger); }
.page-plan-list { min-height: 0; flex: 1; overflow: auto; padding: 9px; }
.page-plan-list article { position: relative; display: grid; grid-template-columns: minmax(0,1fr) 34px; gap: 6px; margin-bottom: 8px; padding: 7px; border: 1px solid var(--workspace-border-color); border-radius: 8px; background: var(--workspace-surface-raised); }
.page-plan-list article.active { border-color: rgba(var(--theme-primary-rgb),.45); box-shadow: 0 0 0 1px rgba(var(--theme-primary-rgb),.08); }
.page-plan-list article.removed { opacity: .58; background: repeating-linear-gradient(-45deg,var(--workspace-control-bg),var(--workspace-control-bg) 5px,transparent 5px,transparent 10px); }
.page-plan-preview { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 0; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.page-plan-preview > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.page-plan-preview > small { position: absolute; top: 10px; left: 10px; padding: 2px 4px; border-radius: 4px; color: var(--workspace-on-accent); background: rgba(20,42,67,.8); font-size: var(--text-compact); }
.page-plan-actions { display: flex; flex-direction: column; gap: 4px; }.page-plan-actions button { width: 34px; padding: 0; font-size: 12px; }.page-plan-actions button:last-child { color: var(--status-danger); font-size: var(--text-compact); }.page-plan-actions button.restore { color: var(--status-success); }
.selection-annotation-tool { position: fixed; z-index: 50; height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 8px; border: 1px solid var(--workspace-border-color); border-radius: 9px; color: #e8edf3; background: #252a31; box-shadow: var(--workspace-shadow); font-size: var(--text-compact); }
.selection-annotation-tool .comment-selection { height: 24px; padding: 0 8px; border: 0; border-radius: 5px; color: var(--workspace-on-accent); background: #506073; cursor: pointer; font-size: var(--text-compact); }.selection-annotation-tool .close-selection { width: 22px; height: 22px; padding: 0; border: 0; color: #bbc4cf; background: transparent; cursor: pointer; font-size: 16px; }
.area-mode-hint { position: fixed; right: 18px; bottom: 18px; z-index: 40; padding: 9px 13px; border: 1px solid rgba(0,122,255,.28); border-radius: 8px; color: var(--workspace-on-accent); background: rgba(20,42,67,.92); box-shadow: var(--workspace-shadow); font-size: var(--text-compact); }
.pdf-scroll { min-width: 0; flex: 1; overflow: auto; scroll-behavior: smooth; }
.page-list { min-width: max-content; display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 30px 32px 60px; }
.page-shell { position: relative; scroll-margin-top: 22px; }
.page-number { position: absolute; right: 0; bottom: -18px; left: 0; color: #667085; font-size: var(--text-compact); text-align: center; }
.pdf-state { height: 100%; align-content: center; justify-content: center; border: 0; border-radius: 0; background: transparent; }
.pdf-state strong { font-size: 15px; }
.pdf-state.error p { max-width: 520px; margin: 0; font-size: 11px; text-align: center; }
.pdf-state.error button { padding: 7px 16px; border: 0; border-radius: 7px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; }
.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 980px) { .pdf-search { width: 150px; }.pdf-search.active { width: 220px; }.document-title strong { max-width: 160px; }.toolbar-actions .fit-btn { width: 32px; padding: 0; }.toolbar-actions .fit-btn .action-label { display: none; } }
@media (max-width: 760px) { .pdf-toolbar { grid-template-columns: 1fr auto; }.toolbar-center { order: 3; grid-column: 1 / -1; justify-content: center; padding-bottom: 7px; }.pdf-sidebar { width: 176px; }.fit-btn,.scale-label { display: none; }.pdf-search { width: 130px; }.pdf-search.active { width: 190px; } }
</style>
