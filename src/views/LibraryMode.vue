<template>
  <div ref="libraryShell" class="library-mode" data-ui-shell="library-editor" :inert="librarySwitchBusy || undefined" :aria-busy="librarySwitchBusy" :class="{ 'is-dragging': !!activeResizer, 'file-dragging': virtualDrag.active, 'reference-pinned': referenceVisible && !store.isZen }">
    <header v-if="!store.isZen" class="library-shell-toolbar" aria-label="资料库操作">
      <n-button class="shell-navigation-action" quaternary size="small" aria-label="导航" :aria-expanded="!isSidebarCollapsed" aria-controls="library-navigation" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <template #icon><n-icon :component="ListIcon" /></template><span class="shell-action-label">导航</span>
      </n-button>
      <n-dropdown trigger="click" :options="librarySwitchOptions" @select="selectLibrary">
        <n-button class="library-picker" quaternary size="small" aria-label="切换资料库" :loading="librarySwitchBusy" :disabled="librarySwitchBusy" :title="store.libraryPath || '选择资料库'"><template #icon><n-icon :component="FolderOpenIcon" /></template><span class="library-picker-label">{{ store.currentLibraryName || '选择资料库' }}</span><span aria-hidden="true"> ▾</span></n-button>
      </n-dropdown>
      <WorkspaceTabs v-if="store.tabs.length" class="shell-document-tabs" />
      <span v-else class="shell-toolbar-spacer"></span>
      <n-button class="shell-quick-action" quaternary size="small" aria-label="快速笔记" title="快速笔记" @click="openQuickNote"><template #icon><n-icon :component="EditIcon" /></template><span class="shell-action-label">快速笔记</span></n-button>
      <n-button class="shell-command-action" quaternary size="small" aria-label="命令" title="命令 Ctrl+P" @click="requestCommandPalette"><template #icon><n-icon :component="SearchIcon" /></template><span class="shell-action-label">命令</span></n-button>
    </header>
    <div class="library-workspace">
    <!-- 统一左侧侧边栏 -->
    <div id="library-navigation" class="sidebar" data-ui-region="navigation" :aria-hidden="isSidebarCollapsed" :inert="isSidebarCollapsed || undefined" :style="{ width: isSidebarCollapsed ? '0px' : 'var(--library-sidebar-width, 260px)', opacity: isSidebarCollapsed ? 0 : 1 }" v-if="!store.isZen">
      <div class="sidebar-inner">
        <div class="search-area shell-search-area">
          <div class="search-control-row">
            <n-input v-model:value="searchQuery" placeholder="搜索文件与正文" aria-label="搜索文件与正文" size="small" clearable @focus="activeSidebarTab = 'files'">
              <template #prefix><n-icon :component="SearchIcon" /></template>
            </n-input>
            <n-button quaternary circle size="small" title="保存为常用搜索" :disabled="!searchQuery.trim()" @click="saveCurrentSearch">
              <template #icon><n-icon :component="BookmarkAddIcon" /></template>
            </n-button>
          </div>
          <n-select v-if="searchQuery.trim()" v-model:value="searchObjectTypes" class="search-format-filter" size="tiny" multiple clearable :max-tag-count="1" placeholder="全部格式" :options="searchFormatOptions" />
        </div>
        <!-- 七个入口始终为一行图标；提示和无障碍名称保留功能说明。 -->
        <div
          class="sidebar-tabs-header"
          data-layout="icons"
          data-ui-region="sidebar-tabs"
          role="tablist"
          aria-label="侧边栏导航"
        >
          <button type="button"
            v-for="tab in sidebarTabs" :key="tab.key"
            class="icon-tab"
            :class="{ active: activeSidebarTab === tab.key }"
            role="tab"
            :id="`tab-${tab.key}`"
            :aria-selected="activeSidebarTab === tab.key"
            :aria-label="tab.description"
            :aria-controls="`panel-${tab.key}`"
            @click="activeSidebarTab = tab.key"
            :title="tab.description"
          >
            <n-icon :component="tab.icon" size="18" />
            <span class="icon-tab-text">{{ tab.label }}</span>
          </button>
        </div>

        <button v-if="searchQuery.trim() && searchReturn.selectedKey.value" type="button" class="search-return-button" @click="searchReturn.returnToResults">返回刚才的搜索结果</button>
        <div class="sidebar-tab-content">
          <transition name="tab-fade">
            <!-- 文件 tree 面板 -->
            <div v-if="activeSidebarTab === 'files'" :key="'files'" class="tab-pane files-pane" role="tabpanel" :id="`panel-files`" :aria-labelledby="`tab-files`">
              <div class="sidebar-header">
                <div class="toolbar-area">
                  <n-dropdown
                    trigger="click"
                    scrollable
                    :z-index="1000"
                    :menu-props="templateMenuProps"
                    :options="templateOptions"
                    @select="handleTemplateCreate"
                  >
                    <n-button data-testid="library-create-menu" type="primary" size="tiny" :title="`在 ${creationTargetLabel} 中新建`">
                      <template #icon><n-icon :component="PlusIcon" /></template>新建
                    </n-button>
                  </n-dropdown>
                  <n-button quaternary circle size="tiny" @click="refreshLibrary" title="刷新列表">
                    <template #icon><n-icon :component="RefreshIcon" /></template>
                  </n-button>
              <button v-if="store.libraryPath" type="button" class="inbox-shortcut" :aria-expanded="showInbox" @click="showInbox = !showInbox"><InboxIcon :size="13" aria-hidden="true" /><span>收集箱</span></button>
              <div v-if="store.libraryPath && !showInbox" class="knowledge-index-strip" :class="`state-${knowledgeIndexStatus.state}`" :title="`${knowledgeIndexLabel}；${knowledgeIndexStatus.objectCount} 个对象 · ${knowledgeIndexStatus.relationCount} 条关系；${knowledgeIndexExplanation}`" :aria-label="knowledgeIndexLabel">
                <small v-if="knowledgeIndexStatus.state === 'ready'">{{ knowledgeIndexStatus.objectCount }}对象·{{ knowledgeIndexStatus.relationCount }}关系</small>
                <small v-else-if="knowledgeIndexStatus.state === 'building'">准备中 {{ knowledgeIndexStatus.progress }}%</small>
                <small v-else-if="knowledgeIndexStatus.state === 'cancelled'">已停止，可随时重新准备</small>
                <small v-else-if="knowledgeIndexStatus.state === 'missing'">首次打开会自动准备</small>
                <small v-else-if="knowledgeIndexStatus.state === 'stale'">{{ knowledgeIndexStatus.staleSourceCount || knowledgeIndexStatus.sourceCount }} 个文件需要更新</small>
                <small v-else>需要处理</small>
                <div class="knowledge-index-actions">
                  <n-button v-if="knowledgeIndexBusy" quaternary circle size="tiny" :loading="knowledgeIndexCancelling" title="停止准备" @click="cancelKnowledgeIndex">
                    <template #icon><n-icon :component="StopIcon" /></template>
                  </n-button>
                  <n-dropdown trigger="click" :options="knowledgeIndexMenuOptions" @select="handleKnowledgeIndexAction">
                    <n-button quaternary circle size="tiny" :disabled="knowledgeIndexBusy" title="搜索与关联选项">
                      <template #icon><n-icon :component="MoreIcon" /></template>
                    </n-button>
                  </n-dropdown>
                </div>
              </div>
                </div>
              </div>
              <InboxBrowser v-if="showInbox && store.libraryPath" :library-root="store.libraryPath" @close="showInbox = false" @open="path => handleNodeSelect([path])" @changed="refreshLibrary" @manage="router.push({ name: 'Settings', query: { category: 'library' } })" />

              <div
                class="tree-viewport"
                v-show="!showInbox"
                ref="searchViewport"
                data-testid="library-tree-viewport"
                :class="{ 'drop-active': virtualDrag.dropTarget === store.libraryPath }"
                @contextmenu="openRootContextMenu"
              >
                <div v-if="!store.libraryPath" class="path-guide">
                  <n-empty description="库未就绪" size="small">
                    <template #extra>
                      <n-button size="tiny" type="primary" @click="openSettings">去配置路径</n-button>
                    </template>
                  </n-empty>
                </div>
                <section v-else-if="libraryLoadError" class="library-recovery" role="status" aria-live="polite">
                  <strong>知识库目录暂时不可用</strong>
                  <span class="library-recovery-path">{{ store.libraryPath }}</span>
                  <p>文件夹可能被移动、磁盘未连接，或当前账户没有访问权限。请连接磁盘后重试，或在设置中选择其他知识库。</p>
                  <div class="library-recovery-actions">
                    <n-button size="small" :loading="libraryLoading" @click="refreshLibrary">重试读取</n-button>
                    <n-button size="small" type="primary" @click="router.push({ name: 'Settings', query: { category: 'library' } })">管理知识库</n-button>
                  </div>
                  <p>如果这里本来就要建立一个新库，可以创建缺失的目录；这不会找回原来的文件。</p>
                  <n-button size="small" :loading="libraryCreating" @click="createMissingLibraryDirectory">在此创建文件夹</n-button>
                  <details><summary>错误详情</summary><span>{{ libraryLoadError }}</span></details>
                </section>
                <div v-else-if="showKnowledgeResults" class="knowledge-search-results" @keydown="navigateSearchResults">
                  <div class="search-results-heading"><strong>搜索结果</strong><span>{{ searchObjectTypes.length ? `${searchObjectTypes.length} 种格式` : '全部格式' }}</span></div>
                  <div v-if="activeGraphCollection" class="graph-collection-state">
                    <span><strong>{{ activeGraphCollection.name }}</strong><small>{{ activeGraphCollection.graphDepth }} 层动态子图</small></span>
                    <button type="button" title="关闭集合" @click="closeGraphCollection">×</button>
                  </div>
                  <SearchPageStatus v-if="!activeGraphCollection" part="header" :page="knowledgePages" :sort="knowledgeSort" :tag="tagSearch" :visible-count="groupedKnowledgeSearchResults.length" :loading="knowledgeSearchRunning" @sort="knowledgeSort = $event" @apply="applyKnowledgeView" @retry="retryKnowledgeSearch" />
                  <SearchFeedback v-else :running="knowledgeSearchRunning" :failed="knowledgeSearchFailed" :reason="knowledgeSearchError" :empty="!visibleKnowledgeSearchResults.length" @retry="retryKnowledgeSearch" />
                  <p v-if="searchReturn.notice.value" role="status" class="knowledge-search-count">{{ searchReturn.notice.value }}</p>
                  <SearchFileCard v-for="file in visibleSearchFiles" :key="file.path" :file="file" :query="searchQuery" :library-root="store.libraryPath" :selected-key="searchReturn.selectedKey.value" reference-allowed @open="openKnowledgeSearchResult" @reference="showSearchPreview"><RelationSummaryBadge v-if="relationSummary(file.path)" :summary="relationSummary(file.path)!" compact @open="openRelationGraph(file.path)" /></SearchFileCard>
                  <SearchPageStatus v-if="!activeGraphCollection" part="footer" :page="knowledgePages" :sort="knowledgeSort" @more="knowledgePages.loadMore" @continue="knowledgePages.continueSearch" @apply="applyKnowledgeView"/>
                </div>
                <n-tree 
                  v-else
                  :key="store.libraryPath"
                  :animated="!libraryLoading && !treeRevealInProgress"
                  ref="treeInstRef"
                  class="library-file-tree"
                  :theme-overrides="fileTreeThemeOverrides"
                  aria-label="知识库文件树"
                  :aria-describedby="preview.focusPath ? 'file-tree-detail-preview' : undefined"
                  :data="treeData" 
                  lazy
                  multiple
                  block-line
                  show-line
                  expand-on-click
                  :on-load="handleLoadChildren"
                  :node-props="nodeProps"
                  :selected-keys="selectedKeys"
                  v-model:expanded-keys="expandedKeys"
                  @update:selected-keys="handleTreeSelection"
                  @focus="handleTreeKeyboardFocus"
                  @blur="handleTreeKeyboardBlur"
                  @keydown="handleTreeKeyboardNavigation"
                />
              </div>
            </div>

            <!-- 历史面板（收藏 + 最近） -->
            <div v-else-if="activeSidebarTab === 'quick'" :key="'quick'" class="tab-pane quick-pane" role="tabpanel" id="panel-quick" aria-labelledby="tab-quick">
              <div v-if="!store.starredFiles.length && !store.recentFiles.length" class="empty-state-hint">
                <n-empty description="暂无记录" size="small" />
              </div>
              <div class="recent-files" v-if="store.starredFiles.length > 0">
                <div class="recent-header">收藏文件</div>
                <div class="recent-item" v-for="sp in store.starredFiles" :key="sp" @click="handleNodeSelect([sp])" :title="sp">
                  <n-icon :component="fileTreeVisualForPath(sp).icon" size="14" :color="fileTreeVisualForPath(sp).color" />
                  <span>{{ fileNameWithExtension(sp) }}</span>
                </div>
              </div>
              <div class="recent-files" v-if="store.recentFiles.length > 0">
                <div class="recent-header">最近打开</div>
                <div class="recent-item" v-for="rf in store.recentFiles" :key="rf.path" @click="handleNodeSelect([rf.path])" :title="rf.path">
                  <n-icon :component="fileTreeVisualForPath(rf.path).icon" size="14" :color="fileTreeVisualForPath(rf.path).color" />
                  <span>{{ fileNameWithExtension(rf.path) }}</span>
                </div>
              </div>
            </div>

            <div v-else-if="activeSidebarTab === 'collections'" :key="'collections'" class="tab-pane collections-pane" role="tabpanel" id="panel-collections" aria-labelledby="tab-collections">
              <SmartCollectionPanel :selected="selectedSmartCollection" :editing="editingSmartCollection" :formats="searchFormatOptions" :collections="librarySavedSearches" :current-query="searchQuery.trim()" :summary-for="collectionFilterLabel"
                @open="openKnowledgeSearchResult" @select="openSavedSearch" @edit="editSavedCollection" @remove="entry => confirmRemoveSavedSearch(entry.id, entry.name)" @saved="smartCollectionSaved" @reset="selectedSmartCollection = null" @save-search="saveCurrentSearch" />
            </div>

            <!-- 正文标签与相关笔记 -->
            <div v-else-if="activeSidebarTab === 'tags'" :key="'tags'" class="tab-pane tags-pane" role="tabpanel" id="panel-tags" aria-labelledby="tab-tags">
              <InlineTagsPanel :tags="allTags" :loading="tagsLoading" :error="tagsError" :current-note="currentTaggedNote" :other-file-open="Boolean(activeTabId && !activeIsMarkdown)" :add-tag="addTagToCurrentFile"
                @refresh="fetchAllTags" @open="path => handleNodeSelect([path])" @search="searchByTag" @browse="activeSidebarTab = 'files'" @save="saveCurrentFile" />
            </div>

            <!-- 大纲面板 -->
            <div v-else-if="activeSidebarTab === 'outline'" :key="'outline'" class="tab-pane outline-pane" role="tabpanel" id="panel-outline" aria-labelledby="tab-outline">
              <div class="manual-outline-box">
                <div v-if="!activeTabId" class="empty-state-hint">
                  <n-empty description="未打开文件" size="small" />
                </div>
                <div v-else-if="outlineTreeData.length === 0" class="empty-state-hint">
                  <n-empty description="暂无大纲" size="small" />
                </div>
                <div v-else class="outline-tree-wrapper">
                  <n-tree
                    block-line
                    expand-on-click
                    :data="outlineTreeData"
                    :selected-keys="activeHeadingKey ? [activeHeadingKey] : []"
                    :on-update:selected-keys="handleOutlineSelect"
                    class="compact-outline-tree"
                    default-expand-all
                  />
                </div>
              </div>
            </div>

            <!-- 当前文件关系面板 -->
            <div v-else-if="activeSidebarTab === 'links'" :key="'links'" class="tab-pane links-pane" role="tabpanel" id="panel-links" aria-labelledby="tab-links">
              <NoteRelationsPanel :note="currentLinkedNote" :other-file-open="Boolean(activeTabId && !activeIsMarkdown)" :pinned="localGraphPinned"
                @open="path => handleNodeSelect([path])" @graph="openCurrentRelations" @pin="setLocalGraphPinned" @browse="findReferenceDocument" @search="searchReferencedNote" />
            </div>

            <!-- 历史面板 -->
            <div v-else-if="activeSidebarTab === 'history'" :key="'history'" class="tab-pane history-pane" role="tabpanel" id="panel-history" aria-labelledby="tab-history">
              <div class="history-box">
                <div class="history-header">
                  <div class="history-title-row">
                    <n-icon :component="ClockIcon" class="title-icon" />
                    <span>历史版本 ({{ historyList.length }})</span>
                  </div>
                  <n-button quaternary circle size="tiny" @click="clearAllHistory" title="清理未保留的历史" class="clear-all-btn">
                    <template #icon><n-icon :component="TrashIcon" /></template>
                  </n-button>
                </div>
                
                <HistoryVersionList :entries="historyList" :path="activeTabId || ''" :library-root="store.libraryPath" :loading="historyLoading" :error="historyError" @compare="timestamp => { const entry = historyList.find(h => h.timestamp === timestamp); if (entry) restoreHistory(entry) }" @refresh="fetchHistory" />
              </div>
            </div>
          </transition>
        </div>

        <!-- 侧边栏统计 -->
        <div class="lib-stats-bar" v-if="libStats">
          <span>{{ libStats.file_count }} 篇笔记</span>
          <span>{{ libStats.total_words.toLocaleString() }} 词</span>
        </div>

        <!-- Git 状态 -->
        <div class="git-status-bar" v-if="currentLibGitEnabled">
          <template v-if="gitStatus && gitStatus.initialized">
            <div class="git-status-info" @click="refreshGitStatus">
              <span class="git-branch">🔀 {{ gitStatus.branch }}</span>
              <span class="git-ahead" v-if="gitStatus.ahead > 0">↑{{ gitStatus.ahead }}</span>
              <span class="git-behind" v-if="gitStatus.behind > 0">↓{{ gitStatus.behind }}</span>
              <span class="git-dirty" v-if="gitStatus.dirty_count > 0">· {{ gitStatus.dirty_count }} 更改</span>
            </div>
            <div class="git-actions">
              <n-button quaternary circle size="tiny" @click="gitPull" title="拉取"><n-icon size="14"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></n-icon></n-button>
              <n-button quaternary circle size="tiny" @click="gitPush" title="推送"><n-icon size="14"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></n-icon></n-button>
            </div>
          </template>
          <div v-else class="git-status-hint" @click="gitInitRepo">
            <span>Git 未初始化</span>
            <n-button size="tiny" quaternary type="info">初始化</n-button>
          </div>
        </div>

        <!-- 快捷操作 -->
        <div class="sidebar-actions" v-if="store.libraryPath">
          <n-button quaternary size="tiny" @click="openWorkspace">
            <template #icon><n-icon :component="DashboardIcon" size="16" /></template>
            工作台
          </n-button>
          <n-button quaternary size="tiny" @click="openGraph">
            <template #icon><n-icon size="16"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="8.5" y1="6.5" x2="10.5" y2="10.5"/><line x1="15.5" y1="6.5" x2="13.5" y2="10.5"/><line x1="8.5" y1="17.5" x2="10.5" y2="13.5"/><line x1="15.5" y1="17.5" x2="13.5" y2="13.5"/></svg></n-icon></template>
            知识图谱
          </n-button>
        </div>
        <!-- 侧边栏页脚 -->
        <div class="sidebar-footer-container">
          <div
            class="sidebar-footer"
            role="button"
            tabindex="0"
            aria-label="打开资料库设置"
            @click="openSettings"
            @keydown.enter="openSettings"
            @keydown.space.prevent="openSettings"
          >
            <div class="settings-icon-box">
              <n-icon :component="SettingsIcon" class="rotating-settings" />
            </div>
            <div class="lib-info-box">
              <div class="lib-name-row">
                <span class="lib-label">当前资料库</span>
                <div class="lib-status-dot"></div>
                <button
                  type="button"
                  class="app-version-badge"
                  :class="{ 'has-update': hasAvailableUpdate }"
                  data-testid="main-app-version"
                  :data-update-status="updaterState.status"
                  :title="versionIndicatorLabel"
                  :aria-label="versionIndicatorLabel"
                  @click.stop="openUpdateSettings"
                >
                  <span v-if="hasAvailableUpdate" class="version-update-dot" aria-hidden="true"></span>
                  v{{ displayedAppVersion }}<span v-if="DEVELOPMENT_CHANNEL_ACTIVE" class="version-channel">dev</span>
                </button>
              </div>
              <span class="meta-path" :title="store.libraryPath">{{ store.currentLibraryName }}</span>
            </div>
            <div class="footer-chevron">
              <n-icon :component="ChevronRightIcon" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 虚拟拖拽影子 -->
    <Teleport to="body"><div v-if="virtualDrag.active" ref="fileDragGhost" class="drag-ghost" :class="{ 'drop-invalid': !!fileDropProblem }">
      <n-icon :component="virtualDrag.dragNode?.isLeaf ? FileIcon : FolderIcon" />
      <span><strong>{{ virtualDrag.ghostText }}</strong><small>{{ fileDropHint }}</small></span>
    </div></Teleport>

    <!-- 左侧分隔条 -->
    <div class="resizer-area" v-if="!store.isZen">
      <div class="drag-handle" role="separator" aria-label="调整文件栏宽度" aria-orientation="vertical" aria-controls="library-navigation" :tabindex="isSidebarCollapsed ? -1 : 0" :aria-valuenow="Math.round(sidebarWidth)" :aria-valuemin="220" :aria-valuemax="600" @pointerdown.stop.prevent="startSidebarResize" @pointermove="moveSidebarResize" @pointerup="finishSidebarResize" @pointercancel="finishSidebarResize" @lostpointercapture="finishSidebarResize" @keydown="resizeSidebarByKey"></div>
      <div class="collapse-btn left" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <n-icon :component="isSidebarCollapsed ? ChevronRightIcon : ChevronLeftIcon" />
      </div>
    </div>

    <!-- 中间编辑区 -->
    <div class="editor-main" data-ui-region="editor" :class="{ 'zen-mode': store.isZen }" @scroll.capture="rememberEditorScroll">
      <div v-if="!store.isZen && activeTabId" class="document-toolbar" aria-label="当前文档操作">
        <div class="document-identity">
          <button :key="activeTabId" type="button" class="document-breadcrumb" aria-label="重命名当前文档" @click="openRename(activeTabId, false)"><n-icon class="document-type-icon" :component="activeDocumentVisual.icon" :color="activeDocumentVisual.color" size="16" /><span>{{ activeTabId.split(/[\\/]/).pop() }}</span><n-icon :component="EditIcon" size="12" /></button>
          <n-button data-testid="library-document-favorite" quaternary circle size="small" :type="store.isStarred(activeTabId) ? 'primary' : 'default'" :aria-pressed="store.isStarred(activeTabId)" :aria-label="store.isStarred(activeTabId) ? '取消收藏当前文档' : '收藏当前文档'" :title="store.isStarred(activeTabId) ? '取消收藏当前文档' : '收藏当前文档'" @click="store.toggleStar(activeTabId)"><template #icon><n-icon :component="StarIcon" :style="{ fill: store.isStarred(activeTabId) ? 'currentColor' : 'none' }" /></template></n-button>
        </div>
        <div class="document-primary-actions">
          <n-button v-if="activeIsMarkdown && !activeEmbeddedEditor" data-testid="library-document-preview" quaternary size="small" :type="documentPreviewActive ? 'primary' : 'default'" :aria-pressed="documentPreviewActive" :disabled="editorLoading || editorModeChangeBusy || !documentPreviewAvailable" :title="documentPreviewActive ? '返回编辑' : '预览当前文档'" @click="toggleDocumentPreview"><template #icon><n-icon :component="EyeIcon" /></template>{{ documentPreviewActive ? '返回编辑' : '预览' }}</n-button>
          <n-button data-testid="library-focus-toggle" quaternary size="small" title="专注写作 F11" @click="store.toggleZen()"><template #icon><n-icon :component="FocusIcon" /></template>专注</n-button>
          <n-button data-testid="library-add-relation" quaternary size="small" :disabled="!activeTabId" @click="requestFileRelation(activeTabId || undefined)"><template #icon><n-icon :component="LinkIcon" /></template>添加关系</n-button>
          <n-button v-if="activeIsMarkdown && !activeEmbeddedEditor" data-testid="library-document-ai" quaternary size="small" title="AI 辅助 Alt+A · 先选择要处理的文字" :disabled="editorLoading || editorModeChangeBusy" @mousedown.prevent @click="handleAIAssist"><template #icon><n-icon :component="SparklesIcon" /></template>AI 辅助</n-button>
          <n-button data-testid="library-reference-toggle" quaternary size="small" :type="referencePinned && referenceVisible ? 'primary' : 'default'" :aria-expanded="referenceVisible" aria-controls="library-reference" @click="referenceVisible = !referenceVisible"><template #icon><n-icon :component="LinkIcon" /></template>参考</n-button>
          <n-button v-if="!activeEmbeddedEditor" data-testid="library-explicit-save" secondary size="small" @click="saveCurrentFile" :disabled="!activeTabId || !activeFormatCanEdit || currentFileReloadBusy" :title="activeSaveTitle"><template #icon><n-icon :component="SaveIcon" /></template>保存</n-button>
          <n-popover trigger="click" placement="bottom-end" class="document-actions-popover">
            <template #trigger><n-button data-testid="library-document-menu" quaternary size="small">文档操作<template #icon><n-icon :component="MoreIcon" /></template></n-button></template>
            <div class="document-menu-content" aria-label="文档操作菜单">
        <n-button v-if="activeIsMarkdown" quaternary size="small" :disabled="editorLoading || editorModeChangeBusy" @click="saveCurrentAsTemplate"><template #icon><n-icon :component="FileIcon" /></template>保存为模板…</n-button>
        <n-dropdown
          v-if="activeTabId"
          trigger="click"
          :options="externalOpenOptions"
          @select="handleActiveExternalOpen"
        >
          <n-button
            quaternary
            size="small"
            :loading="externalAppsLoading || externalOpenBusy"
            title="使用外部应用打开"
          >
            <template #icon><n-icon :component="ExternalOpenIcon" /></template>外部应用打开
          </n-button>
        </n-dropdown>
        <div v-if="!activeEmbeddedEditor" class="tab-actions">
          <div class="action-btn-group">
            <n-button quaternary size="small" @click="refreshCurrentFile" :disabled="!activeTabId || currentFileReloadBusy" :loading="currentFileReloadBusy" title="从磁盘同步内容">
              <template #icon><n-icon :component="RefreshIcon" /></template>重新读取文件
            </n-button>
            <n-dropdown trigger="click" :options="textEncodingMenuOptions" @select="handleTextEncodingAction" v-if="activeTabId && activeDocumentFormat?.routeName === 'LibraryMode'">
              <n-button quaternary size="small" title="文本编码">
                <template #icon><n-icon :component="LanguagesIcon" /></template>编码与换行
              </n-button>
            </n-dropdown>
            <n-dropdown trigger="click" :options="exportOptions" @select="handleExport" v-if="activeTabId">
              <n-button quaternary size="small" title="导出">
                <template #icon><n-icon :component="DownloadIcon" /></template>导出
              </n-button>
            </n-dropdown>
            <n-button quaternary size="tiny" v-if="activeTabId && activeIsMarkdown" @click="createMindMapFromCurrentMarkdown" title="将当前文档标题和列表转换为可编辑思维导图">转脑图</n-button>
            <div class="mode-toggle" v-if="activeTabId && activeIsMarkdown">
              <span>编辑模式</span>
              <n-button quaternary size="tiny" :disabled="editorModeChangeBusy || editorLoading" :type="store.editorMode === 'wysiwyg' ? 'primary' : 'default'" @click="switchEditorMode('wysiwyg')" title="所见即所得">所见</n-button>
              <n-button quaternary size="tiny" :disabled="editorModeChangeBusy || editorLoading" :type="store.editorMode === 'ir' ? 'primary' : 'default'" @click="switchEditorMode('ir')" title="即时渲染">IR</n-button>
              <n-button quaternary size="tiny" :disabled="editorModeChangeBusy || editorLoading" :type="store.editorMode === 'sv' ? 'primary' : 'default'" @click="switchEditorMode('sv')" title="源码编辑">源码</n-button>
            </div>
            <div class="width-toggle" v-if="activeTabId">
              <span>正文宽度</span>
              <n-button quaternary size="tiny" :type="editorWidthMode === 'narrow' ? 'primary' : 'default'" @click="editorWidthMode = 'narrow'" title="窄栏 600px">窄</n-button>
              <n-button quaternary size="tiny" :type="editorWidthMode === 'medium' ? 'primary' : 'default'" @click="editorWidthMode = 'medium'" title="中栏 800px">中</n-button>
              <n-button quaternary size="tiny" :type="editorWidthMode === 'wide' ? 'primary' : 'default'" @click="editorWidthMode = 'wide'" title="宽栏 全宽">宽</n-button>
            </div>
          </div>
        </div>
        <n-button quaternary size="small" @click="activeSidebarTab = 'history'; isSidebarCollapsed = false">历史与差异</n-button>
        <n-button quaternary size="small" @click="router.push({ name: 'Settings', query: { category: 'appearance', focus: 'document-display' } })">显示设置</n-button>
        <n-button quaternary size="small" @click="store.toggleZen()">专注写作 · F11</n-button>
        <p class="document-menu-capability">{{ activeDocumentFormat?.label }} · {{ activeDocumentFormat?.userCapability.description }}</p>
            </div>
          </n-popover>
        </div>
      </div>
      <div class="hidden-picker-trigger" style="position: absolute; opacity: 0; pointer-events: none;">
        <n-color-picker v-model:value="store.editorBgColor" :modes="['hex']" @update:value="handleEditorBgChange" />
      </div>
      
      <SearchMatchNavigation v-if="!activeEmbeddedEditor && activeTabId === route.query.path && route.query.searchLocator && !searchNavigationClosed"
        :query="String(route.query.searchNeedle || '')" :index="searchMatchIndex" :count="searchMatchCount" scope="当前编辑模式"
        @move="moveSearchMatch" @refresh="revealSearchMatch(0, true)" @close="closeSearchNavigation" />
      <div class="editor-viewport" :class="'editor-width-' + editorWidthMode" :style="{ '--custom-editor-bg': store.editorBgColor || 'var(--theme-surface)' }">
        <div v-if="activeEmbeddedEditor && activeTabId" class="library-embedded-editor">
          <component :is="activeEmbeddedEditor" :key="activeDocumentFormat?.routeName === 'Table' ? `table:${store.libraryPath}:${route.query.external === '1'}` : activeTabId" />
        </div>
        <div v-if="!activeEmbeddedEditor && (editorLoading || pendingEditorSaveLoad) && tabs.length > 0" class="editor-loading">
          <n-spin size="large">
            <template #description>同步中...</template>
          </n-spin>
        </div>
        <div v-show="!activeEmbeddedEditor && tabs.length > 0" id="vditor-lib" class="vditor-instance" @click.capture="openSourceReference"></div>
        <Teleport v-if="documentShortcutHost && activeIsMarkdown && !activeEmbeddedEditor" :to="documentShortcutHost">
          <div class="document-inline-shortcuts" aria-label="文档快捷操作">
            <n-dropdown trigger="click" :options="[{label:'所见即所得',key:'wysiwyg'},{label:'即时渲染 IR',key:'ir'},{label:'源码编辑',key:'sv'}]" @select="switchEditorMode">
              <n-button class="inline-mode" quaternary size="tiny" :disabled="editorModeChangeBusy || editorLoading" title="切换编辑模式"><template #icon><n-icon :component="store.editorMode === 'sv' ? CodeIcon : SquarePenIcon" /></template>{{ store.editorMode === 'wysiwyg' ? '所见' : store.editorMode === 'ir' ? 'IR' : '源码' }} ▾</n-button>
            </n-dropdown>
            <n-dropdown trigger="click" :options="[{label:'窄栏 600px',key:'narrow'},{label:'中栏 800px',key:'medium'},{label:'宽栏 全宽',key:'wide'}]" @select="value => editorWidthMode = value">
              <n-button class="inline-width" quaternary size="tiny" title="调整正文宽度"><template #icon><n-icon :component="ColumnsIcon" /></template>{{ editorWidthMode === 'narrow' ? '窄栏' : editorWidthMode === 'medium' ? '中栏' : '宽栏' }} ▾</n-button>
            </n-dropdown>
            <n-dropdown trigger="click" :options="exportOptions" @select="handleExport">
              <n-button quaternary size="tiny" title="导出文档"><template #icon><n-icon :component="DownloadIcon" /></template>导出</n-button>
            </n-dropdown>
            <n-button quaternary size="tiny" title="查看历史与差异" @click="activeSidebarTab = 'history'; isSidebarCollapsed = false"><template #icon><n-icon :component="ClockIcon" /></template>历史</n-button>
          </div>
        </Teleport>
        <MarkdownChartEmbeds
          v-if="!activeEmbeddedEditor && activeIsMarkdown && activeMarkdownContent && activeTabId"
          :markdown="activeMarkdownContent"
          :library-root="store.libraryPath"
          :host-path="activeTabId"
          @open="openEmbeddedTableChart"
        />
        
        <div v-if="!activeEmbeddedEditor && tabs.length === 0" class="hero-viewport">
          <div class="ambient-glow">
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>
          </div>
          
          <div class="hero-content">
            <div class="hero-brand">
              <img src="/icon.png" alt="Long编辑图标">
            </div>
            <h2 class="hero-title">Long编辑</h2>
            <p class="hero-subtitle">从左侧选择文件，在右侧阅读或编辑</p>
            <div class="hero-actions">
              <n-button secondary type="primary" round size="large" class="hero-btn" @click="handleToolbarAction('file')">创建新笔记</n-button>
              <n-button secondary round size="large" class="hero-btn" @click="openSettings">文件库配置</n-button>
            </div>
          </div>
        </div>
      </div>
      <footer v-if="activeTabId" class="document-status" aria-label="文档状态">
        <span v-if="!activeEmbeddedEditor" class="document-save-state">{{ activeTextTab?.isDirty ? '● 未保存 · Ctrl+S' : '已保存' }}</span>
        <span class="format-capability-badge" :class="`level-${activeDocumentFormat?.userCapability.level || 'unsupported'}`" :title="activeDocumentFormat?.userCapability.description">{{ activeDocumentFormat?.label }} · {{ activeDocumentFormat?.userCapability.label }}</span>
        <span v-if="!activeEmbeddedEditor && activeTextSnapshotLabel" class="text-snapshot-badge" :title="activeTextSnapshotTitle">{{ activeTextSnapshotLabel }}</span>
        <n-button v-if="!activeEmbeddedEditor && activeTextTab?.textRangeNextOffset !== undefined && !activeTextTab.textRangeEof && !activeTextTab.textLoadError" text size="tiny" @click="loadNextTextRange">继续加载</n-button>
        <span v-if="!activeEmbeddedEditor" class="document-reading-status">{{ wordCount }} 字 · 约 {{ Math.max(1, Math.ceil(wordCount / 300)) }} 分钟 · 行 {{ cursorLine }}:{{ cursorCol }}</span>
        <n-button v-if="store.isZen" data-testid="library-focus-toggle" quaternary size="tiny" @click="store.toggleZen()">退出专注</n-button>
      </footer>
    </div>

    <SearchDocumentPreview v-if="searchPreviewResult && referenceVisible && !store.isZen" id="library-reference" :result="searchPreviewResult" :library-root="store.libraryPath" :query="searchPreviewQuery"
      :insert-target="activeIsMarkdown && activeFormatCanEdit ? activeTabId?.split(/[\\/]/).pop() : undefined" @insert-excerpt="insertReferenceExcerpt"
      @close="referenceVisible = false" @clear-source="referenceVisible = false; searchPreviewResult = null" @return-to-editor="referenceVisible = false; returnToEditorFromReference()" @open="openSearchPreview" />
    <aside v-else-if="referenceVisible && !store.isZen" id="library-reference" class="reference-empty" aria-label="只读参考文档">
      <header><strong>参考</strong><n-button quaternary size="small" @click="referenceVisible = false">关闭</n-button></header>
      <p>选择一份资料作为参考，边看边写。</p>
      <p>在搜索结果旁点击“在侧边参考”即可打开。参考内容不会替换当前草稿。</p>
      <n-button secondary size="small" @click="findReferenceDocument">查找资料</n-button>
    </aside>
    <aside v-if="localGraphPinned && activeTabId && !store.isZen" class="local-graph-rail" data-testid="local-graph-rail" :data-active-path="activeTabId">
      <header>
        <div><strong>已固定局部关系</strong><span>跟随当前活动标签页</span></div>
        <button type="button" data-testid="local-graph-unpin" aria-label="取消固定局部图谱" @click="setLocalGraphPinned(false)">×</button>
      </header>
      <LocalGraph
        :library-root="store.libraryPath"
        :current-path="activeTabId"
        @select="path => handleNodeSelect([path])"
        @open-mindmap="openPinnedLocalMindmap"
        @open-canvas="createPinnedLocalCanvas"
      />
    </aside>
    </div>

    <HoverPreview :show="preview.show" :title="preview.title" :path="preview.path" :x="preview.x" :y="preview.y" />
    
    <n-dropdown
      v-if="contextMenu.show"
      placement="bottom-start" trigger="manual" :x="contextMenu.x" :y="contextMenu.y"
      :options="contextMenu.options" :show="contextMenu.show"
      :menu-props="contextMenuProps"
      :on-clickoutside="() => contextMenu.show = false" @select="onMenuAction"
    />

    <n-modal
      v-model:show="renameState.show"
      preset="dialog"
      :title="renameState.confirmExtension ? '确认更改文件格式' : '项目重命名'"
      :positive-text="renameState.confirmExtension ? '仍然重命名' : '更新名称'"
      negative-text="取消"
      :positive-button-props="{ disabled: !renameValidation.valid }"
      @positive-click="applyRename"
    >
      <div class="rename-editor">
        <label for="library-rename-input">完整名称{{ renameState.isDir ? '' : '（包含后缀）' }}</label>
        <n-input
          id="library-rename-input"
          v-model:value="renameState.newName"
          :placeholder="renameState.isDir ? '请输入文件夹名称' : '例如：项目说明.md'"
          :status="renameValidation.valid ? undefined : 'error'"
          autofocus
          @update:value="renameState.confirmExtension = false"
          @keyup.enter="applyRename"
        />
        <p v-if="!renameValidation.valid" class="rename-feedback is-error">{{ renameValidation.message }}</p>
        <p v-else-if="renameExtensionChange.changed" class="rename-feedback is-warning">
          将从 {{ renameExtensionChange.oldLabel }} 改为 {{ renameExtensionChange.newLabel }}。此操作只修改文件名，不会转换文件内容，确认后才会执行。
        </p>
        <p v-else class="rename-feedback">可以修改名称和后缀；同名项目不会被覆盖。</p>
        <div v-if="renameState.confirmExtension" class="rename-confirmation">
          <strong>文件内容不会自动转换</strong>
          <span>请确认目标编辑器能够解析现有内容，然后点击“仍然重命名”。</span>
        </div>
      </div>
    </n-modal>

    <n-modal v-model:show="fileStyleEditor.show" preset="card" class="file-style-modal" title="文件显示样式" style="width: min(520px, calc(100vw - 28px)); max-height: calc(100dvh - 28px); border-radius: var(--theme-radius);">
      <div class="file-style-editor">
        <div class="file-style-preview-heading"><strong>实时预览</strong><span>仅改变资料库中的显示，不修改文件内容</span></div>
        <div class="file-style-previews">
          <div><small>普通</small><div class="file-style-preview" :style="{ backgroundColor: fileStylePreviewColors.background, color: fileStylePreviewColors.text }">
            <n-icon size="19" :color="fileStylePreviewVisual.color"><component :is="fileStylePreviewVisual.icon" /></n-icon><span>{{ fileStyleEditor.name }}</span>
          </div></div>
          <div><small>选中</small><div class="file-style-preview is-selected" :style="{ backgroundColor: fileStylePreviewColors.selectedBackground, color: fileStylePreviewColors.selectedText, borderColor: fileStyleEditor.selectionStyle === 'outline' ? fileStylePreviewColors.selectedAccent : 'transparent', '--preview-accent': fileStylePreviewColors.selectedAccent }">
            <n-icon size="19"><component :is="fileStylePreviewVisual.icon" /></n-icon><span>{{ fileStyleEditor.name }}</span>
          </div></div>
        </div>

        <section class="file-style-section">
          <label>背景标记</label>
          <div class="file-color-options">
            <button
              v-for="color in FILE_MARKER_BACKGROUND_OPTIONS"
              :key="color.value || 'default'"
              type="button"
              class="file-color-swatch"
              :class="{ active: fileStyleEditor.backgroundColor === color.value, default: !color.value }"
              :style="color.value ? { backgroundColor: color.value } : undefined"
              :title="color.label"
              :aria-label="color.label"
              :aria-pressed="fileStyleEditor.backgroundColor === color.value"
              @click="fileStyleEditor.backgroundColor = color.value"
            ><span v-if="!color.value">默认</span></button>
            <input
              type="color"
              :value="fileStyleEditor.backgroundColor || '#fff1a8'"
              title="自定义背景色"
              aria-label="自定义背景色"
              @input="fileStyleEditor.backgroundColor = ($event.target as HTMLInputElement).value"
            >
          </div>
        </section>

        <section class="file-style-section">
          <label>文字颜色</label>
          <div class="file-color-options">
            <button
              v-for="color in FILE_MARKER_TEXT_OPTIONS"
              :key="color.value || 'default'"
              type="button"
              class="file-color-swatch"
              :class="{ active: fileStyleEditor.textColor === color.value, default: !color.value }"
              :style="color.value ? { backgroundColor: color.value } : undefined"
              :title="color.label"
              :aria-label="color.label"
              :aria-pressed="fileStyleEditor.textColor === color.value"
              @click="fileStyleEditor.textColor = color.value"
            ><span v-if="!color.value">默认</span></button>
            <input
              type="color"
              :value="fileStyleEditor.textColor || '#1f2937'"
              title="自定义文字颜色"
              aria-label="自定义文字颜色"
              @input="fileStyleEditor.textColor = ($event.target as HTMLInputElement).value"
            >
          </div>
        </section>

        <section class="file-style-section">
          <label>选中高亮</label>
          <div class="file-selection-options" role="group" aria-label="选中高亮样式">
            <button v-for="option in FILE_SELECTION_OPTIONS" :key="option.id" type="button" :class="{ active: fileStyleEditor.selectionStyle === option.id }" :aria-pressed="fileStyleEditor.selectionStyle === option.id" @click="fileStyleEditor.selectionStyle = option.id">{{ option.label }}</button>
          </div>
          <div class="file-selection-colors">
            <label><span>高亮背景</span><div><button type="button" :disabled="fileStyleEditor.selectionStyle !== 'fill'" @click="fileStyleEditor.selectedBackgroundColor = ''">自动</button><input type="color" aria-label="选中背景色" :disabled="fileStyleEditor.selectionStyle !== 'fill'" :value="fileStyleEditor.selectedBackgroundColor || '#dcecff'" @input="fileStyleEditor.selectedBackgroundColor = ($event.target as HTMLInputElement).value"></div></label>
            <label><span>选中文字</span><div><button type="button" @click="fileStyleEditor.selectedTextColor = ''">自动</button><input type="color" aria-label="选中文字色" :value="fileStyleEditor.selectedTextColor || '#253041'" @input="fileStyleEditor.selectedTextColor = ($event.target as HTMLInputElement).value"></div></label>
            <label><span>高亮标记</span><div><button type="button" @click="fileStyleEditor.selectedAccentColor = ''">自动</button><input type="color" aria-label="选中标记色" :value="fileStyleEditor.selectedAccentColor || '#245ca6'" @input="fileStyleEditor.selectedAccentColor = ($event.target as HTMLInputElement).value"></div></label>
          </div>
          <p class="file-style-help">自动颜色会兼顾文字可读性。描边和侧边标记保留原背景。</p>
        </section>

        <section class="file-style-section">
          <label>文件图标</label>
          <div class="file-icon-options">
            <button
              v-for="option in FILE_MARKER_ICON_OPTIONS"
              :key="option.id"
              type="button"
              :class="{ active: fileStyleEditor.icon === option.id }"
              :title="option.label"
              :aria-label="option.label"
              :aria-pressed="fileStyleEditor.icon === option.id"
              @click="fileStyleEditor.icon = option.id"
            ><n-icon size="18"><component :is="option.icon" /></n-icon><span>{{ option.id === 'auto' ? '自动' : option.label }}</span></button>
          </div>
        </section>
      </div>
      <template #footer>
        <div class="file-style-actions">
          <n-button quaternary @click="resetFileDisplayStyle">恢复默认</n-button>
          <span></span>
          <n-button @click="fileStyleEditor.show = false">取消</n-button>
          <n-button type="primary" :loading="fileStyleEditor.saving" @click="saveFileDisplayStyle">保存样式</n-button>
        </div>
      </template>
    </n-modal>

    <TextConflictDialog v-if="externalChange.show && externalConflictOwner" :key="externalChange.path" :path="externalChange.path" :library-root="externalConflictOwner.root" :draft="externalConflictOwner.draft" :format-id="findFileFormat(externalChange.path)?.id || 'markdown'" :read-encoding="externalConflictOwner.tab.textReadEncoding" :is-current="isExternalConflictCurrent" @close="keepExternalChange" @reload="applyConflictSnapshot" @copy="finishConflictCopy" />

    <!-- AI 操作选择弹窗 -->
    <n-modal v-model:show="aiState.showActionModal" preset="dialog" title="AI 辅助" positive-text="" negative-text="取消" @negative-click="aiState.showActionModal = false">
      <div class="ai-action-grid">
        <n-button block secondary @click="handleAIAction('polish')" class="ai-action-btn">
          <template #icon><n-icon size="18"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></n-icon></template>
          润色
        </n-button>
        <n-button block secondary @click="handleAIAction('rewrite')" class="ai-action-btn">
          <template #icon><n-icon size="18"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></n-icon></template>
          重写
        </n-button>
        <n-button block secondary @click="handleAIAction('summarize')" class="ai-action-btn">
          <template #icon><n-icon size="18"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></n-icon></template>
          总结
        </n-button>
        <n-button block secondary @click="handleAIAction('translate')" class="ai-action-btn">
          <template #icon><n-icon size="18"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg></n-icon></template>
          翻译
        </n-button>
      </div>
    </n-modal>



    <!-- AI 结果弹窗 -->
    <n-modal v-model:show="aiState.showResultModal" preset="dialog" title="AI 处理结果" positive-text="替换原文" negative-text="取消" @positive-click="replaceWithResult" @negative-click="aiState.showResultModal = false">
      <div style="min-height: 80px;">
        <div v-if="aiState.loading" style="display:flex;align-items:center;justify-content:center;padding:24px;">
          <n-spin size="medium" />
          <n-button quaternary @click="cancelAIRequest" style="margin-left: 12px;">取消请求</n-button>
        </div>
        <div v-else class="ai-result-content">{{ aiState.result }}</div>
      </div>
      <template #action>
        <n-button quaternary @click="copyAIResult">复制结果</n-button>
      </template>
    </n-modal>
    <HistoryDiffDialog v-if="historyComparison" :path="historyComparison.entry.path" :timestamp="historyComparison.entry.timestamp" :draft="historyComparison.draft" :disk="historyComparison.disk" :historical="historyComparison.content" :busy="historyActionBusy" :error="historyActionError" @close="closeHistoryComparison" @copy="recoverHistory('copy')" @replace="recoverHistory('replace')" @partial="id => recoverHistory('partial', id)" />
    <LibraryFileOperations ref="fileOperations" :library-root="store.libraryPath" :before-operate="beforeFileOperation" :after-operate="applyFileOperation" />
    <ExternalImportDialog ref="externalImport" :library-root="store.libraryPath" :after-import="applyExternalImport" />
    <NoteTemplateManager v-if="templateManager" :library-root="store.libraryPath" :initial-note="templateManager.initialNote" @close="templateManager = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import InboxBrowser from '../components/InboxBrowser.vue'
import SearchFeedback from '../components/SearchFeedback.vue'
import SearchPageStatus from '../components/SearchPageStatus.vue'
import SearchFileCard from '../components/SearchFileCard.vue'
import { createSearchPages, type SearchSort, type SearchMatch as KnowledgeSearchResult } from '../services/searchPages'
import { belongsToLibrary } from '../utils/workSessions'
import SearchDocumentPreview from '../components/SearchDocumentPreview.vue'
import { useSearchReturn } from '../composables/useSearchReturn'
import { readWorkspaceReference, writeWorkspaceReference } from '../services/workspaceReference'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { groupSearchResults, searchMatchKey } from '../utils/searchResultGroups'
import { useMessage, useDialog, TreeOption, NIcon, NDropdown, NPopover, type DropdownOption } from 'naive-ui'
import { 
  Search as SearchIcon, Settings as SettingsIcon,
  RefreshCw as RefreshIcon, FileText as FileIcon, Folder as FolderIcon,
  Plus as PlusIcon, FolderPlus as FolderPlusIcon, FolderOpen as FolderOpenIcon, Trash as TrashIcon,
  Edit as EditIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  Save as SaveIcon, List as ListIcon, History as ClockIcon,
  Star as StarIcon, CalendarDays as CalendarIcon, Link as LinkIcon, Tag as TagIcon, Download as DownloadIcon,
  Database as DatabaseIcon, LayoutDashboard as DashboardIcon, ListFilter as CollectionIcon,
  BookmarkPlus as BookmarkAddIcon, Languages as LanguagesIcon, ExternalLink as ExternalOpenIcon,
  MoreHorizontal as MoreIcon, Palette as PaletteIcon, Square as StopIcon,
  Eye as EyeIcon, Focus as FocusIcon, Sparkles as SparklesIcon,
  Inbox as InboxIcon, Code2 as CodeIcon, SquarePen as SquarePenIcon, Columns2 as ColumnsIcon
} from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore, THEME_MAP, type SavedSearchConfig, type TabInfo } from '../store/app'
import SmartCollectionPanel from '../components/SmartCollectionPanel.vue'
import InlineTagsPanel from '../components/InlineTagsPanel.vue'
import NoteRelationsPanel from '../components/NoteRelationsPanel.vue'
import { onFileRelationsChanged, requestFileRelation } from '../services/fileRelations'
import { appendInlineTag } from '../utils/inlineTags'
import HistoryDiffDialog from '../components/HistoryDiffDialog.vue'
import HistoryVersionList from '../components/HistoryVersionList.vue'
import TextConflictDialog, { type ConflictSnapshot } from '../components/TextConflictDialog.vue'
import { restoreHistoryChange } from '../utils/historyDiff'
import LibraryFileOperations from '../components/LibraryFileOperations.vue'
import ExternalImportDialog from '../components/ExternalImportDialog.vue'
import { searchQueryNeedle } from '../utils/searchQuery'
import NoteTemplateManager from '../components/NoteTemplateManager.vue'
import { BLANK_NOTE_TEMPLATE, type NoteTemplate } from '../config/noteTemplates'
import { libraryFileClipboard, lastLibraryMove, fileOperationBusy, sameLibrary, fileParent, topLevelPaths, type FileOperation, type FileOperationResult } from '../services/libraryFileOperations'
import { announceFileRelationsChanged } from '../services/fileRelations'
import { Copy as CopyFileIcon, Scissors as CutFileIcon, ClipboardPaste as PasteFileIcon, FolderInput as MoveFileIcon, Undo2 as UndoFileIcon } from 'lucide-vue-next'
import { confirmAppAction } from '../services/appDialog'
import { recordWindowDraftActivity, beginWindowSave, snapshotWindowDrafts, useWindowDraftSnapshot } from '../services/windowDrafts'
import { movedPath, type FileMoveNotice } from '../services/fileMoveProtection'
import { reconcileTextSaveReceipt } from '../utils/textSaveReceipt'
import { tryAcquireMainTextSave, hasPendingMainTextSave, waitForMainTextSave } from '../utils/mainTextSaveOwnership'
import { isActiveThemeDark } from '../config/themePresets'
import { markdownCodeThemeChoices, resolveMarkdownEditorAppearance } from '../config/markdownCodeTheme'
import { storeToRefs } from 'pinia'
import HoverPreview from '../components/HoverPreview.vue'
import MarkdownChartEmbeds from '../components/MarkdownChartEmbeds.vue'
import RelationSummaryBadge, { type GraphRelationSummary } from '../components/RelationSummaryBadge.vue'
import LocalGraph from '../components/LocalGraph.vue'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useRoute, useRouter } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke, isTauriRuntime, listen } from '../services/tauriRuntime'
import { initializeUpdater, updaterState } from '../services/appUpdater'
import { appVersionIdentity } from '../services/appVersionIdentity'
import {
  DEVELOPMENT_CHANNEL_ACTIVE,
} from '../config/releaseCapabilities'
import { useOutline } from '../composables/useOutline'
import { useAdaptiveMarkdownMotion } from '../composables/useAdaptiveMarkdownMotion'
import { useImageFix } from '../composables/useImageFix'
import { localMarkdownLink, markdownAnchorTarget } from '../utils/localMarkdownLinks'
import { parseSourceReference, sourceExcerpt } from '../utils/sourceExcerpt'
import { parsePdfReferenceUri, resolveLibraryPdfPath } from '../utils/pdfReference'
import { resolveCollectionPath, sameWorkspacePath } from '../utils/savedCollections'
import { resolveLibraryTreeAncestors } from '../utils/libraryTreeAncestors'
import type { GraphData } from '../types/graph'
import {
  CREATABLE_FILE_FORMATS,
  FILE_FORMATS,
  fileDisplayName,
  findFileFormat,
  findFileFormatById,
  isFormatCapabilitySupported,
  isLibraryEmbeddedEditorRoute,
  knownFileExtension,
  opensInLibraryShell,
  routeForFile,
} from '../config/fileFormats'
import SearchMatchNavigation from '../components/SearchMatchNavigation.vue'
import { editorSearchMatches, wrapSearchIndex, scrollSearchRange } from '../utils/searchLocation'
import { openManagedFile, openManagedObject } from '../services/fileNavigation'
import { promptAppAction } from '../services/appDialog'
import { readLocalGraphPinned, writeLocalGraphPinned } from '../utils/localGraphPin'
import {
  FILE_MARKER_ICON_OPTIONS,
  resolveFileTreeVisual,
  type FileDisplayStyle,
  type FileMarkerIconId,
  type FileSelectionStyle,
} from '../config/fileTreeAppearance'
import { markerTextColor, fileMarkerColors, fileStylePathKey } from '../utils/fileDisplayStyles'

interface FileEntry { name: string; path: string; is_dir: boolean; }

const displayedAppVersion = computed(() => appVersionIdentity.value.version)
const hasAvailableUpdate = computed(() => appVersionIdentity.value.hasUpdate)
const versionIndicatorLabel = computed(() => appVersionIdentity.value.indicatorLabel)

interface ExternalAppExecutable {
  role: string
  path: string
  discoverySource: string
}

interface ExternalApplicationCapability {
  id: string
  label: string
  available: boolean
  version?: string
  executables: ExternalAppExecutable[]
  supportedExtensions: string[]
  diagnostic: string
}

interface ExternalOpenReceipt {
  formatId: string
  applicationId: string
  applicationLabel: string
  sourcePreservedAtHandoff: boolean
}


interface KnowledgeIndexStatus {
  state: 'missing' | 'building' | 'ready' | 'stale' | 'corrupt' | 'error' | 'cancelled'
  schemaVersion: number
  builtAt?: number
  sourceCount: number
  objectCount: number
  relationCount: number
  progress: number
  cacheBytes: number
  error?: string
  recoveryAvailable: boolean
  staleSourceCount?: number
}

interface KnowledgeIndexRecoveryReport {
  beforeState: string
  afterState: string
  cacheBytes: number
  quarantined: boolean
  quarantineFile?: string
  message: string
}

interface TextDocumentSnapshot {
  historyWarning?: string
  content: string
  encoding: string
  encodingConfidence: string
  bom: string
  lineEnding: string
  hasFinalNewline: boolean
  signature: string
  contentDigest: string
  size: number
  modified: number
  readOnlyReason?: string
  path: string
}

interface TextDocumentIdentity {
  signature: string
  contentDigest: string
  size: number
  modifiedNanos: string
}

interface TextDocumentRangeSnapshot {
  content: string
  encoding: string
  encodingConfidence: string
  bom: string
  lineEnding: string
  offset: number
  nextOffset: number
  eof: boolean
  size: number
  modified: number
  readOnlyReason: string
  path: string
}

interface TextReadOptions {
  encoding?: string
}

interface TextSavePolicy {
  expectedSignature?: string
  encoding?: string
  bom?: string
  lineEnding?: string
  hasFinalNewline?: boolean
}

interface TextEncodingPreset {
  label: string
  encoding: string
  bom: 'none' | 'utf-8'
}

const TEXT_ENCODING_PRESETS: TextEncodingPreset[] = [
  { label: 'UTF-8', encoding: 'utf-8', bom: 'none' },
  { label: 'UTF-8 BOM', encoding: 'utf-8', bom: 'utf-8' },
  { label: 'GBK', encoding: 'gbk', bom: 'none' },
  { label: 'GB18030', encoding: 'gb18030', bom: 'none' },
]

const encodingLabel = (encoding: string) => TEXT_ENCODING_PRESETS.find(preset => preset.encoding === encoding)?.label || encoding.toUpperCase()

const message = useMessage()
const dialog = useDialog()
const store = useAppStore()
const { tabs: allTabs, activeTabId } = storeToRefs(store)
const tabs = computed(() => allTabs.value.filter(tab => findFileFormat(tab.path)?.routeName === 'LibraryMode'))
const router = useRouter()
const route = useRoute()
const activeDocumentFormat = computed(() => activeTabId.value ? findFileFormat(activeTabId.value) : undefined)
const activeDocumentVisual = computed(() => resolveFileTreeVisual(activeDocumentFormat.value?.id, 'auto'))
const externalApplications = ref<ExternalApplicationCapability[]>([])
const externalAppsLoading = ref(false)
const externalOpenBusy = ref(false)
const compatibleExternalApplications = (path: string) => {
  const extension = knownFileExtension(path)
  return externalApplications.value.filter(application =>
    application.available && application.supportedExtensions.includes(extension),
  )
}
const buildExternalOpenOptions = (path: string) => {
  const compatible = compatibleExternalApplications(path)
  return [
    {
      label: '系统默认应用',
      key: 'external-open:system-default',
      icon: () => h(NIcon, null, { default: () => h(ExternalOpenIcon) }),
    },
    ...(compatible.length ? [{ type: 'divider', key: 'external-open-divider' }] : []),
    ...compatible.map(application => ({
      label: application.version
        ? `${application.label} · ${application.version}`
        : application.label,
      key: `external-open:${application.id}`,
      icon: () => h(NIcon, null, { default: () => h(ExternalOpenIcon) }),
    })),
  ]
}
const externalOpenOptions = computed(() =>
  activeTabId.value ? buildExternalOpenOptions(activeTabId.value) : [],
)
const loadExternalApplications = async () => {
  if (!isTauriRuntime()) {
    externalApplications.value = []
    return
  }
  externalAppsLoading.value = true
  try {
    externalApplications.value = await invoke<ExternalApplicationCapability[]>('discover_external_applications')
  } catch (error) {
    externalApplications.value = []
    console.error('External application discovery failed:', error)
  } finally {
    externalAppsLoading.value = false
  }
}
const openFileExternally = async (path: string, applicationId: string) => {
  if (!store.libraryPath || externalOpenBusy.value) return
  externalOpenBusy.value = true
  try {
    const receipt = await invoke<ExternalOpenReceipt>('open_workspace_file_externally', {
      libraryRoot: store.libraryPath,
      path,
      applicationId,
    })
    if (!receipt.sourcePreservedAtHandoff) throw new Error('源文件接管校验失败')
    message.success(`${receipt.applicationLabel} 已打开 · 源文件校验未变化`)
  } catch (error) {
    message.error(`外部打开失败：${String(error)}`)
  } finally {
    externalOpenBusy.value = false
  }
}
const handleActiveExternalOpen = (key: string) => {
  if (!activeTabId.value || !key.startsWith('external-open:')) return
  void openFileExternally(activeTabId.value, key.slice('external-open:'.length))
}
const embeddedEditorComponents = {
  TextEditor: defineAsyncComponent(() => import('./TextEditorView.vue')),
  JsonEditor: defineAsyncComponent(() => import('./JsonEditorView.vue')),
  YamlEditor: defineAsyncComponent(() => import('./YamlEditorView.vue')),
  XmlEditor: defineAsyncComponent(() => import('./XmlEditorView.vue')),
  DrawioEditor: defineAsyncComponent(() => import('./DrawioEditorView.vue')),
  TomlEditor: defineAsyncComponent(() => import('./TomlEditorView.vue')),
  LogViewer: defineAsyncComponent(() => import('./LogViewerView.vue')),
  DocxEditor: defineAsyncComponent(() => import('./DocxReaderView.vue')),
  OdtReader: defineAsyncComponent(() => import('./OdtReaderView.vue')),
  OdfReader: defineAsyncComponent(() => import('./OdfContentReaderView.vue')),
  PptxReader: defineAsyncComponent(() => import('./PptxReaderView.vue')),
  ExternalOffice: defineAsyncComponent(() => import('./ExternalOfficeView.vue')),
  LegacyOffice: defineAsyncComponent(() => import('./LegacyOfficeView.vue')),
  Canvas: defineAsyncComponent(() => import('./CanvasView.vue')),
  Pdf: defineAsyncComponent(() => import('./PdfView.vue')),
  Table: defineAsyncComponent(() => import('./TableView.vue')),
  Workbook: defineAsyncComponent(() => import('./WorkbookView.vue')),
  Diagram: defineAsyncComponent(() => import('./DiagramStudio.vue')),
  MindMap: defineAsyncComponent(() => import('./MindMapView.vue')),
  MediaViewer: defineAsyncComponent(() => import('./MediaViewerView.vue')),
}
const activeEmbeddedEditor = computed(() => {
  const routeName = activeDocumentFormat.value?.routeName
  return routeName && isLibraryEmbeddedEditorRoute(routeName)
    ? embeddedEditorComponents[routeName as keyof typeof embeddedEditorComponents]
    : null
})
const activeIsMarkdown = computed(() => activeDocumentFormat.value?.id === 'markdown')
type VditorMode = 'wysiwyg' | 'ir' | 'sv'
const desiredVditorMode = (path: string | null = activeTabId.value): VditorMode => {
  const format = path ? findFileFormat(path) : undefined
  return format?.id === 'markdown' ? store.editorMode || 'wysiwyg' : 'sv'
}
const activeMarkdownContent = computed(() => activeIsMarkdown.value ? tabs.value.find(tab => tab.id === activeTabId.value)?.content || '' : '')
const activeTextTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value))
const activeFormatCanEdit = computed(() => Boolean(
  activeDocumentFormat.value
  && isFormatCapabilitySupported(activeDocumentFormat.value, 'edit')
  && !activeTextTab.value?.textReadOnlyReason,
))
const activeTextSnapshotLabel = computed(() => {
  const tab = activeTextTab.value
  if (tab?.textLoadError) return '读取失败 · 只读'
  if (!tab?.textEncoding) return ''
  const bom = tab.textBom && tab.textBom !== 'none' ? ` · ${tab.textBom.toUpperCase()} BOM` : ''
  const lineEnding = tab.textLineEnding ? ` · ${tab.textLineEnding.toUpperCase()}` : ''
  const readOnly = tab.textReadOnlyReason ? ' · 大文件只读' : ''
  return `${tab.textEncoding}${bom}${lineEnding}${readOnly}`
})
const activeTextSnapshotTitle = computed(() => {
  const tab = activeTextTab.value
  if (tab?.textLoadError) return tab.textLoadError
  if (tab?.textReadOnlyReason) {
    const loaded = tab.textRangeNextOffset || 0
    return `大文件范围预览 · 已加载 ${loaded} / ${tab.textSize || 0} 字节`
  }
  if (!tab?.textSignature) return '尚未读取文本快照'
  const confidence = tab.textReadEncoding ? ` · 用户选择 ${encodingLabel(tab.textReadEncoding)}` : ''
  return `签名 ${tab.textSignature}${confidence}`
})
const activeSaveTitle = computed(() => {
  if (!activeTabId.value) return '保存到磁盘 (Ctrl+S)'
  if (activeTextTab.value?.textLoadError) return activeTextTab.value.textLoadError
  if (activeTextTab.value?.textReadOnlyReason) return '大文件范围预览为只读模式'
  if (!activeFormatCanEdit.value) return `${activeDocumentFormat.value?.label || '当前格式'}不可覆盖保存`
  return `保存到磁盘 (Ctrl+S) · ${activeDocumentFormat.value?.userCapability.label || '可编辑'}`
})
const textEncodingMenuOptions = computed(() => [
  {
    label: '按编码重新读取',
    key: 'read-group',
    children: TEXT_ENCODING_PRESETS.map(preset => ({
      label: preset.label,
      key: `read:${preset.encoding}`,
    })),
  },
  {
    label: '转换保存为',
    key: 'save-group',
    disabled: !activeFormatCanEdit.value,
    children: TEXT_ENCODING_PRESETS.map(preset => ({
      label: preset.label,
      key: `save:${preset.encoding}:${preset.bom}`,
    })),
  },
])
const openEmbeddedTableChart = (path: string) => openManagedFile(router, path)

// 统一错误处理辅助函数
const handleError = (error: any, userMessage: string, logContext?: string) => {
  const errorMsg = error?.message || error?.toString() || '未知错误'
  console.error(`[${logContext || 'Error'}]`, errorMsg, error)
  const suggestion = error?.suggestion ? ` · ${error.suggestion}` : ''
  message.error(`${userMessage}: ${errorMsg}${suggestion}`)
}

const activeSidebarTab = ref<'files' | 'quick' | 'collections' | 'tags' | 'outline' | 'links' | 'history'>('files')
const showInbox = ref(false)
const localGraphPinned = ref(readLocalGraphPinned())
const sidebarTabs = [
  { key: 'files' as const, icon: FileIcon, label: '文件', description: '文件：浏览和管理资料库文件' },
  { key: 'outline' as const, icon: ListIcon, label: '大纲', description: '大纲：查看当前文档的标题大纲' },
  { key: 'quick' as const, icon: ClockIcon, label: '最近', description: '最近：打开收藏文件和最近访问记录' },
  { key: 'collections' as const, icon: CollectionIcon, label: '智能集合', description: '智能集合：打开常看的资料清单，按保存的条件自动更新' },
  { key: 'tags' as const, icon: TagIcon, label: '标签', description: '标签：用正文中的 #标签 按主题查找笔记，仅适用于 Markdown' },
  { key: 'links' as const, icon: LinkIcon, label: '关系', description: '关系：查看我提到的笔记，以及哪些笔记提到我' },
  { key: 'history' as const, icon: SaveIcon, label: '历史', description: '历史：先比较当前内容，再恢复本地历史快照' },
]
const currentLinkedNote = computed(() => activeTabId.value && activeIsMarkdown.value ? {
  path: activeTabId.value, name: fileNameWithExtension(activeTabId.value), content: activeMarkdownContent.value, dirty: Boolean(activeTextTab.value?.isDirty),
} : null)
const searchReferencedNote = (target: string) => {
  activeCollectionId.value = ''
  searchObjectTypes.value = ['markdown']
  searchQuery.value = target.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') || target
  activeSidebarTab.value = 'files'
}
const editorLoading = ref(false)
const wordCount = ref(0)
const cursorLine = ref(1)
const cursorCol = ref(1)
const libStats = ref<{ file_count: number; total_chars: number; total_words: number } | null>(null)

// --- Git ---
const gitStatus = ref<{ initialized: boolean; branch: string; remote: string; ahead: number; behind: number; dirty_count: number; last_commit: string } | null>(null)
const currentLibGitEnabled = computed(() => {
  const lib = store.libraries.find(l => l.path === store.libraryPath)
  return lib?.gitEnabled || false
})
let gitStatusTimer: ReturnType<typeof setTimeout> | null = null
const refreshGitStatus = async () => {
  if (gitStatusTimer) clearTimeout(gitStatusTimer)
  gitStatusTimer = setTimeout(async () => {
    if (!store.libraryPath || !currentLibGitEnabled.value) { gitStatus.value = null; return }
    try {
      const s = await invoke<any>('git_status', { libraryPath: store.libraryPath })
      gitStatus.value = s
      if (s.initialized && s.remote) {
        const lib = store.libraries.find(l => l.path === store.libraryPath)
        if (lib && !lib.gitRemote) { lib.gitRemote = s.remote; lib.gitBranch = s.branch; store.updateConfig({ libraries: store.libraries }) }
      }
    } catch (e) { gitStatus.value = null }
  }, 500)
}
const gitInitRepo = async () => {
  if (!store.libraryPath) return
  const lib = store.libraries.find(l => l.path === store.libraryPath)
  if (!lib || !lib.gitRemote) { message.warning('请先在设置中配置 Git Remote URL'); return }
  try {
    message.loading('正在初始化 Git...')
    await invoke('git_init', { libraryPath: store.libraryPath, remote: lib.gitRemote, branch: lib.gitBranch || 'main' })
    message.destroyAll(); message.success('Git 仓库已初始化')
    refreshGitStatus()
  } catch (e: any) { message.destroyAll(); message.error('初始化失败: ' + (e?.toString() || '')) }
}
const gitPush = async () => {
  if (!store.libraryPath) return
  try {
    message.loading('正在推送...')
    const msg = await invoke<string>('git_push', { libraryPath: store.libraryPath })
    message.destroyAll(); message.success(msg)
    refreshGitStatus()
  } catch (e: any) { message.destroyAll(); message.error('Push 失败: ' + (e?.toString() || '')) }
}
const gitPull = async () => {
  if (!store.libraryPath) return
  try {
    message.loading('正在拉取...')
    const msg = await invoke<string>('git_pull', { libraryPath: store.libraryPath })
    message.destroyAll(); message.success(msg)
    refreshGitStatus()
  } catch (e: any) { message.destroyAll(); message.error('Pull 失败: ' + (e?.toString() || '')) }
}
const allTags = ref<{ tag: string; count: number }[]>([])
const tagsLoading = ref(false), tagsError = ref('')
let tagsGeneration = 0, tagsRoot = ''
const currentTaggedNote = computed(() => activeTabId.value && activeIsMarkdown.value ? {
  path: activeTabId.value,
  name: fileNameWithExtension(activeTabId.value),
  content: activeMarkdownContent.value,
  dirty: Boolean(activeTextTab.value?.isDirty),
  editable: activeFormatCanEdit.value && !editorLoading.value && !editorModeChangeBusy.value && !currentFileReloadBusy.value,
} : null)

const fetchLibStats = async () => {
  if (!store.libraryPath) return
  try { libStats.value = await invoke<any>('get_library_stats', { path: store.libraryPath }) }
  catch (e) { libStats.value = null }
}

const fetchAllTags = async () => {
  const root = store.libraryPath, token = ++tagsGeneration
  if (tagsRoot !== root) { tagsRoot = root; allTags.value = [] }
  tagsError.value = ''
  tagsLoading.value = Boolean(root)
  if (!root) return
  try {
    const entries = await invoke<{ tag: string; count: number }[]>('get_all_tags', { libraryRoot: root })
    if (token === tagsGeneration && root === store.libraryPath) allTags.value = entries
  } catch (error) { if (token === tagsGeneration && root === store.libraryPath) tagsError.value = String(error) }
  finally { if (token === tagsGeneration) tagsLoading.value = false }
}
onBeforeUnmount(() => { ++tagsGeneration })

const addTagToCurrentFile = (tag: string) => {
  const note = currentTaggedNote.value
  if (!note?.editable || !vditor || !isVditorReady || lastLoadedPath !== note.path) throw new Error('请等当前笔记加载完成后再添加标签。')
  const content = appendInlineTag(vditor.getValue(), tag)
  vditor.setValue(content)
  // setValue does not emit input; keep the draft, dirty state and save action in sync.
  store.updateTabContent(note.path, vditor.getValue())
  const tab = tabs.value.find(item => item.path === note.path)
  if (tab) tab.isDirty = true
  wordCount.value = content.length
}

const searchByTag = (tag: string) => {
  activeCollectionId.value = ''
  searchObjectTypes.value = []
  searchQuery.value = '#' + tag
  activeSidebarTab.value = 'files'
}
const resultFormatLabel = (objectType: string) => findFileFormatById(objectType)?.label || objectType
const selectedSmartCollection = ref<SavedSearchConfig | null>(null)
const editingSmartCollection = ref(false)
const editSavedCollection = (search: SavedSearchConfig) => { editingSmartCollection.value = true; selectedSmartCollection.value = { ...search }; activeSidebarTab.value = 'collections' }
const smartCollectionSaved = (search: SavedSearchConfig) => { editingSmartCollection.value = false; selectedSmartCollection.value = { ...search } }
const collectionFilterLabel = (search: SavedSearchConfig) => search.graphRoot
  ? `关联资料 · ${search.graphDepth || 1} 层关联`
  : search.filters
    ? [search.query ? `包含「${search.query}」` : '', search.filters.directory || '整个资料库', ...[search.filters.tag, ...(search.filters.tags || [])].filter(Boolean).map(tag => '#' + tag), search.filters.modifiedWithinDays ? `近 ${search.filters.modifiedWithinDays} 天` : '', ...search.objectTypes.map(type => type === 'markdown' ? '笔记' : resultFormatLabel(type))].filter(Boolean).join(' · ')
  : search.objectTypes.length
    ? search.objectTypes.map(resultFormatLabel).join(' · ')
    : '关键词搜索'
const saveCurrentSearch = async () => {
  if (!searchQuery.value.trim()) return
  try {
    const before = store.savedSearches.length
    await store.addSavedSearch(searchQuery.value, searchObjectTypes.value)
    message.success(store.savedSearches.length === before ? '“我的集合”中已有这个搜索' : '已保存到“我的集合”')
  } catch (error) { message.error(`保存搜索失败：${String(error)}`) }
}
const openSavedSearch = (search: SavedSearchConfig) => {
  if (search.filters) {
    editingSmartCollection.value = false
    selectedSmartCollection.value = { ...search }
    activeSidebarTab.value = 'collections'
    return
  }
  selectedSmartCollection.value = null
  if (search.graphRoot) {
    void activateGraphCollection(search)
    return
  }
  activeCollectionId.value = ''
  searchObjectTypes.value = [...search.objectTypes]
  searchQuery.value = search.query
  activeSidebarTab.value = 'files'
}
const confirmRemoveSavedSearch = (id: string, name: string) => {
  dialog.warning({
    title: '删除集合？',
    content: `将移除“${name}”这个入口，资料文件仍在原来的文件夹里。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await store.removeSavedSearch(id); message.success('集合已删除') }
      catch (error) { message.error(`删除失败：${String(error)}`) }
    },
  })
}
const isSidebarCollapsed = ref(false)
const libraryShell = ref<HTMLElement | null>(null)
let shellResizeObserver: ResizeObserver | undefined
let shellWasNarrow = false
watch(libraryShell, element => {
  shellResizeObserver?.disconnect()
  if (!element) return
  shellResizeObserver = new ResizeObserver(() => {
    const narrow = element.clientWidth <= 760
    if (narrow !== shellWasNarrow) isSidebarCollapsed.value = narrow
    shellWasNarrow = narrow
  })
  shellResizeObserver.observe(element)
})
onBeforeUnmount(() => shellResizeObserver?.disconnect())
const openQuickNote = async () => {
  try { await invoke('open_quick_note') }
  catch (error) { message.error(`无法打开快速笔记：${String(error)}`) }
}
const requestCommandPalette = () => window.dispatchEvent(new CustomEvent('longedit:open-command-palette'))
const findReferenceDocument = async () => {
  activeSidebarTab.value = 'files'
  isSidebarCollapsed.value = false
  await nextTick()
  libraryShell.value?.querySelector<HTMLInputElement>('.shell-search-area input')?.focus()
}
const editorWidthMode = ref<'narrow' | 'medium' | 'wide'>(
  (localStorage.getItem('longedit_editor_width') as any) || 'medium'
)
watch(editorWidthMode, (v) => { localStorage.setItem('longedit_editor_width', v) })
const sidebarWidth = ref(260)
const activeResizer = ref<'sidebar' | null>(null)
let sidebarResize: { pointerId: number; startX: number; startWidth: number; handle: HTMLElement } | null = null
let sidebarResizeFrame = 0
let pendingSidebarWidth = sidebarWidth.value
const treeInstRef = ref<any>(null)
const fileTreeThemeOverrides = {
  nodeColorHover: 'transparent', nodeColorActive: 'transparent', nodeColorPressed: 'transparent',
  nodeTextColor: 'var(--theme-text)', arrowColor: 'var(--theme-text-secondary)',
  lineColor: 'color-mix(in srgb, var(--theme-text-secondary) 65%, transparent)',
  nodeBorderRadius: 'var(--theme-radius-sm)', nodeWrapperPadding: '0px',
  nodeHeight: 'calc(var(--file-row-height) - 2px)',
}
const treeData = ref<TreeOption[]>([])
const libraryLoadError = ref('')
const libraryLoading = ref(false)
const libraryCreating = ref(false)
let libraryLoadGeneration = 0
const searchQuery = ref('')
watch(searchQuery, () => { showInbox.value = false })
const searchObjectTypes = ref<string[]>([])
const activeCollectionId = ref('')
const knowledgeSearchResults = ref<KnowledgeSearchResult[]>([])
const knowledgePages = createSearchPages(invoke)
const knowledgeSort = ref<SearchSort>('relevance')
const tagSearch = computed(() => /^#[^\s"]+$/.test(searchQuery.value.trim()))
let restoreSearchFiles = 0
const searchPreviewResult = ref<KnowledgeSearchResult | null>(null)
const referencePinned = computed(() => searchPreviewResult.value !== null)
const referenceVisible = ref(false)
const searchPreviewQuery = ref('')
const rememberReference = (root: string) => {
  try { writeWorkspaceReference(root, searchPreviewResult.value ? { ...searchPreviewResult.value, query: searchPreviewQuery.value } : undefined) }
  catch { /* Auto-resume metadata must not interrupt editing. */ }
}
const restoreReference = (root: string) => {
  const reference = readWorkspaceReference(root)
  searchPreviewQuery.value = reference?.query || ''
  searchPreviewResult.value = reference ? { ...reference, objectType: findFileFormat(reference.path)?.id || '', matchKind: 'title', context: '', score: 0, extractionFailed: false } : null
  referenceVisible.value = !!reference
}
watch([searchPreviewResult, searchPreviewQuery], () => rememberReference(store.libraryPath))
const returnToEditorFromReference = async () => {
  await nextTick()
  // Explicit return means resume writing, not restore the search trigger.
  const editor = document.querySelector<HTMLElement>('.editor-main')
  if (!editor) return
  const input = Array.from(editor.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea, input'))
    .find(element => element.getClientRects().length > 0 && !element.matches(':disabled, [readonly]'))
  if (input) input.focus({ preventScroll: true })
  else { editor.tabIndex = -1; editor.focus({ preventScroll: true }) }
}
const showSearchPreview = (result: KnowledgeSearchResult, rawQuery = searchQuery.value) => {
  referenceVisible.value = true
  searchPreviewQuery.value = searchQueryNeedle(rawQuery, result.context)
  searchPreviewResult.value = result
}
const onPaletteSearchReference = (event: Event) => {
  const detail = (event as CustomEvent<{match:KnowledgeSearchResult;query:string}>).detail
  if (!detail?.match?.path || !belongsToLibrary(store.libraryPath, detail.match.path) || !['markdown','plain-text','pdf'].includes(detail.match.objectType)) return
  showSearchPreview(detail.match, String(detail.query || ''))
  void nextTick(() => document.querySelector<HTMLButtonElement>('#library-reference .reference-close')?.focus({ preventScroll:true }))
}
// Only an explicit reference action replaces this source; normal opens/searches do not.
watch(() => store.libraryPath, (root, previous) => { rememberReference(previous); restoreReference(root) })
const openSearchPreview = () => {
  const result = searchPreviewResult.value
  if (!result) return
  if (['markdown', 'plain-text'].includes(result.objectType) && result.matchKind === 'body') {
    searchReturn.remember(searchMatchKey(result))
    void openManagedFile(router, result.path, { searchNeedle: searchPreviewQuery.value, searchLocator: `${Date.now()}-${++searchNavigationSequence}` }, 'replace')
  } else openKnowledgeSearchResult(result)
}
const navigateSearchResults = (event: KeyboardEvent) => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
  const container = event.currentTarget as HTMLElement
  const target = event.target as HTMLElement
  if (!target.matches('button.knowledge-result-open, button.knowledge-preview-button')) return
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.knowledge-result-open')).filter(button => button.getClientRects().length)
  const current = target.closest('.knowledge-search-result, .search-file-card')?.querySelector('.knowledge-result-open')
  const index = buttons.findIndex(button => button === current)
  if (index < 0) return
  event.preventDefault()
  buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
}
const knowledgeSearchRunning = ref(false)
const knowledgeSearchFailed = ref(false)
const knowledgeSearchError = ref('')
let knowledgeSearchGeneration = 0
let relationSummaryGeneration = 0
const relationSummaries = ref<Record<string, GraphRelationSummary>>({})
const knowledgeIndexStatus = ref<KnowledgeIndexStatus>({
  state: 'missing', schemaVersion: 1, sourceCount: 0, objectCount: 0,
  relationCount: 0, progress: 0, cacheBytes: 0, recoveryAvailable: false,
})
const knowledgeIndexBusy = ref(false)
const knowledgeIndexCancelling = ref(false)
const automaticallyPreparingLibraries = new Set<string>()
const activeGraphCollection = computed(() => store.savedSearches.find(search =>
  search.id === activeCollectionId.value && search.libraryPath === store.libraryPath && search.graphRoot))
const showKnowledgeResults = computed(() => Boolean(searchQuery.value.trim() || activeGraphCollection.value))
const searchFormatOptions = FILE_FORMATS
  .filter(format => format.capabilities.index === 'supported')
  .map(format => ({ label: format.label, value: format.id }))
const visibleKnowledgeSearchResults = computed(() => searchObjectTypes.value.length
  ? knowledgeSearchResults.value.filter(result => searchObjectTypes.value.includes(result.objectType))
  : knowledgeSearchResults.value)
const groupedKnowledgeSearchResults = computed(() => groupSearchResults(visibleKnowledgeSearchResults.value))
const pagedFilesByPath = computed(() => new Map(knowledgePages.files.value.map(file => [file.path, file])))
const visibleSearchFiles = computed(() => groupedKnowledgeSearchResults.value.map(group => ({
  ...(pagedFilesByPath.value.get(group.path) || { title:group.results[0].title, mayHaveMoreMatches:false, locationLimitPerKind:5, unlocatedLimitPerKind:1 }),
  path:group.path, matches:group.results,
})))
watch(knowledgePages.files, files => {
  if (searchQuery.value.trim() && !activeCollectionId.value) { knowledgeSearchResults.value = files.flatMap(file => file.matches); void refreshRelationSummaries() }
})
watch([knowledgePages.error, knowledgePages.status], () => {
  if (searchQuery.value.trim()) knowledgeSearchFailed.value = !!knowledgePages.error.value || knowledgePages.status.value?.scanState === 'failed'
})
const searchViewport = ref<HTMLElement | null>(null)
const searchReturn = useSearchReturn({
  root: () => store.libraryPath, query: searchQuery, types: searchObjectTypes,
  running: computed(() => knowledgeSearchRunning.value || knowledgePages.busy.value), failed: knowledgeSearchFailed,
  loadedFiles: () => knowledgePages.files.value.length, restoreLoadedFiles: count => { restoreSearchFiles = count }, sort:knowledgeSort,
  hasMore: () => knowledgePages.hasMore.value,
  resultKeys: () => visibleKnowledgeSearchResults.value.map(searchMatchKey), viewport: searchViewport,
  showResults: () => { activeSidebarTab.value = 'files'; isSidebarCollapsed.value = false },
})
const closeGraphCollection = () => {
  knowledgePages.reset()
  ++knowledgeSearchGeneration
  knowledgeSearchFailed.value = false
  knowledgeSearchError.value = ''
  knowledgeSearchRunning.value = false
  activeCollectionId.value = ''
  knowledgeSearchResults.value = []
  void refreshRelationSummaries()
}
const activateGraphCollection = async (search: SavedSearchConfig) => {
  if (!search.graphRoot || !store.libraryPath) return
  knowledgePages.reset()
  const centerPath = resolveCollectionPath(store.libraryPath, search.graphRoot)
  const generation = ++knowledgeSearchGeneration
  if (searchTimer) clearTimeout(searchTimer)
  activeCollectionId.value = search.id
  searchQuery.value = ''
  searchObjectTypes.value = []
  knowledgeSearchRunning.value = true
  knowledgeSearchFailed.value = false
  knowledgeSearchResults.value = []
  activeSidebarTab.value = 'files'
  try {
    const graph = await invoke<GraphData>('build_local_graph', {
      libraryRoot: store.libraryPath,
      centerPath,
      depth: search.graphDepth || 1,
    })
    if (generation !== knowledgeSearchGeneration || activeCollectionId.value !== search.id) return
    knowledgeSearchResults.value = graph.nodes.filter(node => !node.parentId).map(node => ({
      title: node.title,
      path: node.path,
      objectType: node.objectType,
      matchKind: 'related',
      context: sameWorkspacePath(node.path, centerPath) ? '图谱集合中心对象' : `${search.graphDepth || 1} 层子图关联对象`,
      page: node.locator?.page || undefined,
      locatorKind: node.locator?.kind || undefined,
      locatorObjectId: node.locator?.objectId || undefined,
      locationLabel: node.locationLabel || undefined,
      score: sameWorkspacePath(node.path, centerPath) ? 100 : 80,
      extractionFailed: false,
    }))
    await refreshRelationSummaries()
  } catch (error) {
    if (generation === knowledgeSearchGeneration) {
      knowledgeSearchResults.value = []
      message.error(`打开图谱集合失败：${String(error)}`)
    }
  } finally {
    if (generation === knowledgeSearchGeneration) knowledgeSearchRunning.value = false
  }
}
const relationSummary = (path: string) => relationSummaries.value[path]
const refreshRelationSummaries = async () => {
  const generation = ++relationSummaryGeneration
  const paths = [...new Set(knowledgeSearchResults.value.map(result => result.path))].slice(0, 100)
  if (!store.libraryPath || !paths.length) {
    relationSummaries.value = {}
    return
  }
  try {
    const summaries = await invoke<GraphRelationSummary[]>('summarize_graph_relations', {
      libraryRoot: store.libraryPath,
      paths,
    })
    if (generation === relationSummaryGeneration) {
      relationSummaries.value = Object.fromEntries(summaries.map(summary => [summary.path, summary]))
    }
  } catch {
    if (generation === relationSummaryGeneration) relationSummaries.value = {}
  }
}
const openRelationGraph = (path: string) => {
  const summary = relationSummary(path)
  if (summary) router.push({ name: 'Graph', query: { root: summary.nodeId } })
}
const librarySavedSearches = computed(() => store.savedSearches
  .filter(search => search.libraryPath === store.libraryPath)
  .sort((left, right) => right.createdAt - left.createdAt))
const knowledgeIndexLabel = computed(() => ({
  missing: '搜索与关联：准备中', building: '搜索与关联：正在准备', ready: '搜索与关联：可用', stale: '搜索与关联：需要更新',
  corrupt: '搜索与关联：需要处理', error: '搜索与关联：需要处理',
  cancelled: '搜索与关联：已停止',
}[knowledgeIndexStatus.value.state]))
const knowledgeIndexExplanation = computed(() => ({
  missing: 'LongEdit 会在后台读取支持的文件并准备本地搜索缓存，不会修改资料库文件。',
  building: '正在后台准备本地搜索与文件关系，期间仍可继续浏览和编辑。',
  ready: '全文搜索和文件关系已经可以使用；缓存只保存在本机。',
  stale: '资料库内容发生变化，LongEdit 正在后台更新本地搜索缓存。',
  corrupt: '本地搜索缓存无法读取，可从更多菜单隔离缓存并重新准备；资料库文件不会被删除。',
  error: '本地搜索缓存准备失败，可从更多菜单重试；资料库文件不会被修改。',
  cancelled: '本次准备已停止，已有缓存和资料库文件都没有被删除或修改。',
}[knowledgeIndexStatus.value.state]))
const knowledgeIndexMenuOptions = computed(() => [
  ...(knowledgeIndexStatus.value.state === 'corrupt' && knowledgeIndexStatus.value.recoveryAvailable
    ? [{ label: '隔离损坏缓存并重新准备', key: 'recover' }]
    : []),
  { label: '重新准备搜索与关联', key: 'rebuild' },
  ...(knowledgeIndexStatus.value.state !== 'missing'
    ? [{ type: 'divider', key: 'divider' }, { label: '清除本地搜索缓存后重新准备', key: 'clear' }]
    : []),
])
const selectedKeys = ref<string[]>([])
const fileSelectionAnchor = ref('')
const filePointerSelecting = ref(false)
const filePointerSelection = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const treeRevealInProgress = ref(false)
let treeRevealGeneration = 0
let pendingTreeReveal: { path: string; directory: boolean } | null = null
let treeRevealDisposed = false
onBeforeUnmount(() => { treeRevealDisposed = true; ++treeRevealGeneration })
let vditor: any = null
const documentShortcutHost = ref<HTMLElement | null>(null)
const documentPreviewActive = ref(false)
const documentPreviewAvailable = ref(false)
let documentPreviewButton: HTMLElement | null = null
let documentPreviewObserver: MutationObserver | undefined
const syncDocumentPreview = () => {
  documentPreviewActive.value = documentPreviewButton?.classList.contains('vditor-menu--current') ?? false
  documentPreviewAvailable.value = !!documentPreviewButton && !documentPreviewButton.classList.contains('vditor-menu--disabled')
}
const toggleDocumentPreview = () => {
  if (editorLoading.value || editorModeChangeBusy.value || !documentPreviewAvailable.value) return
  // Reuse Vditor's native preview toggle in all three editing modes. Observe
  // only its button class so menu actions and this shortcut share one state.
  documentPreviewButton?.click()
}
let isVditorReady = false
let lastLoadedPath = ''
let externalCheckInFlight = false
let lastPromptedExternalSignature = ''
let suppressEditorInput = false
// Vditor can add a display newline to setValue(). This baseline is distinct
// from the exact disk snapshot; only subsequent user changes make it dirty.
let editorDisplayBaseline: string | null = null
let referenceBookmark: { path: string; root: HTMLElement; range: Range } | null = null
watch(activeTabId, () => { referenceBookmark = null })
const rememberReferenceInsertionPoint = () => {
  if (!vditor || !isVditorReady || !activeTabId.value || lastLoadedPath !== activeTabId.value || !activeIsMarkdown.value || !activeFormatCanEdit.value) return
  const root = vditor.vditor?.[vditor.getCurrentMode()]?.element as HTMLElement | undefined
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return
  referenceBookmark = { path: activeTabId.value, root, range: selection.getRangeAt(0).cloneRange() }
}
const insertReferenceExcerpt = (text: string) => {
  if (!text.trim() || !searchPreviewResult.value || !activeIsMarkdown.value || !activeFormatCanEdit.value || !isVditorReady || !vditor) return
  const mark = referenceBookmark
  const root = vditor.vditor?.[vditor.getCurrentMode()]?.element as HTMLElement | undefined
  if (!mark || mark.path !== activeTabId.value || mark.root !== root || !root?.contains(mark.range.startContainer) || !root.contains(mark.range.endContainer)) {
    message.warning('请先在当前笔记中点击插入位置，再选择参考文字插入；不会覆盖或猜测插入位置。')
    return
  }
  const excerpt = sourceExcerpt(text, searchPreviewResult.value, store.libraryPath)
  // Insert after the selected range; never replace existing note text.
  const range = mark.range.cloneRange(); range.collapse(false)
  root.focus({ preventScroll: true })
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  vditor.vditor.undo.addToUndoStack(vditor.vditor)
  vditor.insertMD(`\n\n${excerpt}\n`)
  vditor.vditor.undo.addToUndoStack(vditor.vditor)
  rememberReferenceInsertionPoint()
  message.success('摘录和来源已插入当前笔记，可撤销；尚未保存。')
}

const externalChange = reactive({ show: false, path: '' })

const externalConflictOwner = shallowRef<{ root: string; tab: (typeof tabs.value)[number]; editor: any; draft: string } | null>(null)
const openTextConflict = (path: string) => {
  const tab = tabs.value.find(item => item.path === path)
  if (!tab || !vditor || path !== activeTabId.value) return
  const draft = vditor.getValue()
  tab.content = draft
  externalConflictOwner.value = { root: store.libraryPath, tab, editor: vditor, draft }
  externalChange.path = path; externalChange.show = true
}
const isExternalConflictCurrent = () => {
  const owner = externalConflictOwner.value
  return !!owner && store.libraryPath === owner.root && activeTabId.value === owner.tab.path && tabs.value.includes(owner.tab) && vditor === owner.editor && vditor.getValue() === owner.draft && !hasPendingMainTextSave(owner.tab.path)
}
const applyConflictSnapshot = (snapshot: ConflictSnapshot) => {
  if (!isExternalConflictCurrent() || !externalConflictOwner.value) return
  const { tab } = externalConflictOwner.value
  suppressEditorInput = true
  vditor.setValue(snapshot.content)
  editorDisplayBaseline = vditor.getValue()
  updateTabFromTextSnapshot(tab, snapshot as TextDocumentSnapshot, tab.textReadEncoding)
  tab.content = snapshot.content; tab.isDirty = false
  setTimeout(() => { suppressEditorInput = false }, 0)
  keepExternalChange(); lastPromptedExternalSignature = ''; void fetchHistory()
  message.success('已使用磁盘版本，原草稿已保留在历史中')
}
const finishConflictCopy = (path: string) => {
  keepExternalChange(); void refreshLibrary(); message.success('当前副本已保存：' + path.split(/[\\/]/).pop())
}
watch([activeTabId, () => store.libraryPath], () => { externalChange.show = false; externalConflictOwner.value = null }, { flush: 'sync' })
const contentDigestFromSignature = (signature: string) => signature.match(/:([a-f0-9]{32})$/i)?.[1].toLowerCase() || ''

// 常量定义
const EDITOR_MODE_SYNC_DELAY_MS = 300
const IMAGE_FIX_DELAY_MS = 300

const { outlineTreeData, syncOutlineManual, scrollToHeading, setupOutlineObserver, destroyOutlineObserver } = useOutline(() => vditor)
const { startAdaptiveMotion } = useAdaptiveMarkdownMotion(() => vditor)
const refreshVisibleOutline = () => {
  destroyOutlineObserver()
  if (activeSidebarTab.value !== 'outline' || isSidebarCollapsed.value || store.isZen || !vditor) return
  syncOutlineManual()
  setupOutlineObserver()
}
watch([activeSidebarTab, isSidebarCollapsed, () => store.isZen], refreshVisibleOutline)
const { fixEditorImages, destroyImageFix } = useImageFix(() => vditor, () => activeTabId.value || '', { libraryRoot: () => store.libraryPath })
const activeHeadingKey = ref<string | null>(null)
const revealLinkedHeading = () => {
  const fragment = typeof route.query.markdownAnchor === 'string' ? route.query.markdownAnchor : ''
  if (!fragment || !isVditorReady || lastLoadedPath !== activeTabId.value) return
  const root = vditor?.vditor?.[vditor.getCurrentMode()]?.element as HTMLElement | undefined
  if (root) markdownAnchorTarget(root, fragment)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const handleOutlineSelect = (keys: string[]) => { if (keys.length > 0) scrollToHeading(keys[0] as string) }
const searchMatchIndex = ref(0)
const searchMatchCount = ref<number | null>(null)
const searchNavigationClosed = ref(false)
const moveSearchMatch = (direction: number) => revealSearchMatch(searchMatchCount.value === null ? 0 : searchMatchIndex.value + direction, true)
let locatedSearchToken = ''
let searchLocationTarget: HTMLElement | null = null
const closeSearchNavigation = () => {
  searchNavigationClosed.value = true
  searchLocationTarget?.classList.remove('workspace-task-locator-target')
}
const revealSearchMatch = (requestedIndex = 0, force = false) => {
  const token = String(route.query.searchLocator || '')
  const needle = String(route.query.searchNeedle || '')
  if (!token || !needle || (token === locatedSearchToken && !force) || !isVditorReady
    || route.query.path !== activeTabId.value || lastLoadedPath !== activeTabId.value) return
  const root = vditor?.vditor?.[vditor.getCurrentMode()]?.element as HTMLElement | undefined
  if (!root) return
  locatedSearchToken = token
  searchNavigationClosed.value = false
  searchLocationTarget?.classList.remove('workspace-task-locator-target')
  const matches = editorSearchMatches(root, needle)
  searchMatchCount.value = matches.count
  searchMatchIndex.value = wrapSearchIndex(requestedIndex, matches.count)
  const range = matches.rangeAt(searchMatchIndex.value)
  if (!range) {
    message.info('当前显示内容中未找到该关键词，内容可能已修改，或关键词位于 Markdown 标记中。可使用文内查找，或切换源码模式查看。', { duration: 6500 })
    return
  }
  searchLocationTarget = range.startContainer.parentElement
  searchLocationTarget?.classList.add('workspace-task-locator-target')
  searchLocationTarget?.scrollIntoView({ behavior: 'auto', block: 'center' })
  root.focus({ preventScroll: true })
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  scrollSearchRange(range)
}
let taskLocatorTarget: HTMLElement | null = null
let relationEvidenceTarget: HTMLElement | null = null
const revealWorkspaceTask = () => {
  const routePath = typeof route.query.path === 'string' ? route.query.path : ''
  const line = Number(route.query.taskLine)
  if (!vditor || !routePath || routePath !== activeTabId.value || !Number.isInteger(line) || line < 1) return false
  const tab = tabs.value.find(item => item.path === routePath)
  const sourceLine = tab?.content?.split(/\r?\n/)[line - 1] || ''
  const needle = sourceLine.replace(/^\s*[-*]\s+\[[ xX]\]\s*/, '').trim()
  if (!needle) return false
  const editor = document.getElementById('vditor-lib')
  const candidates = [...(editor?.querySelectorAll<HTMLElement>('.vditor-wysiwyg li, .vditor-ir [data-block="0"], .vditor-sv [data-block="0"]') || [])]
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const normalizedNeedle = normalize(needle)
  const target = candidates.find(element => normalize(element.textContent || '').includes(normalizedNeedle))
  if (!target) return false
  taskLocatorTarget?.classList.remove('workspace-task-locator-target')
  taskLocatorTarget?.removeAttribute('data-workspace-task-line')
  taskLocatorTarget = target
  target.classList.add('workspace-task-locator-target')
  target.dataset.workspaceTaskLine = String(line)
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}
const scheduleWorkspaceTaskReveal = () => {
  let attempts = 0
  const reveal = () => {
    if (revealWorkspaceTask() || attempts++ >= 20) return
    window.setTimeout(reveal, 80)
  }
  nextTick(reveal)
}

const relationEvidenceNeedles = (sourceLine: string, syntax: string) => {
  const values = [sourceLine, syntax]
  const markdownLabel = syntax.match(/^\[([^\]]+)]\(/)?.[1]
  const wiki = syntax.match(/^\[\[([^\]]+)]]$/)?.[1]
  if (markdownLabel) values.push(markdownLabel)
  if (wiki) {
    const [target, alias] = wiki.split('|')
    values.push(alias || target.split('/').pop() || target)
  }
  return [...new Set(values.map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean))]
}
const revealRelationEvidence = () => {
  const routePath = typeof route.query.path === 'string' ? route.query.path : ''
  const line = Number(route.query.relationLine)
  const syntax = typeof route.query.relationSyntax === 'string' ? route.query.relationSyntax : ''
  if (!vditor || !routePath || routePath !== activeTabId.value || !Number.isInteger(line) || line < 1) return false
  const tab = tabs.value.find(item => item.path === routePath)
  const sourceLine = tab?.content?.split(/\r?\n/)[line - 1] || ''
  const needles = relationEvidenceNeedles(sourceLine, syntax)
  if (!needles.length) return false
  const editor = document.getElementById('vditor-lib')
  const rawCandidates = [...(editor?.querySelectorAll<HTMLElement>('.vditor-wysiwyg [data-block="0"], .vditor-wysiwyg li, .vditor-ir [data-block="0"], .vditor-sv [data-block="0"]') || [])]
  const candidates = rawCandidates.filter((element, index) => !rawCandidates.some((parent, parentIndex) => parentIndex !== index && parent.contains(element)))
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const target = needles.flatMap(needle => candidates.filter(element => normalize(element.textContent || '').includes(needle)))[0]
  if (!target) return false
  relationEvidenceTarget?.classList.remove('workspace-relation-evidence-target')
  relationEvidenceTarget?.removeAttribute('data-relation-evidence-line')
  relationEvidenceTarget = target
  target.classList.add('workspace-relation-evidence-target')
  target.dataset.relationEvidenceLine = String(line)
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}
const scheduleRelationEvidenceReveal = () => {
  let attempts = 0
  const reveal = () => {
    if (revealRelationEvidence() || attempts++ >= 20) return
    window.setTimeout(reveal, 80)
  }
  nextTick(reveal)
}

const updateWordCount = () => {
  if (vditor && isVditorReady) {
    const val = vditor.getValue()
    wordCount.value = val.length
  }
}

const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0, focusPath: '', timer: null as any })
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, atRoot: false, options: [] as any[] })
const fileOperations = ref<InstanceType<typeof LibraryFileOperations> | null>(null)
const externalImport = ref<InstanceType<typeof ExternalImportDialog> | null>(null)
let externalImportPlacement: { root: string; directory: string; position: string | null; reference: string | null } | null = null
const applyExternalImport = async (result: FileOperationResult, directory: string) => {
  const root = store.libraryPath
  const order = await invoke<{ items?: string[]; pinned?: string[] }>('get_folder_order', { libraryRoot: root, path: directory })
  const entries = await invoke<FileEntry[]>('scan_directory', { libraryRoot: root, path: directory })
  if (root !== store.libraryPath) return
  const names = result.items.map(item => item.newPath.split(/[\\/]/).pop() || '')
  const available = new Set(entries.filter(entry => !isLibraryMetadata(entry.name)).map(entry => entry.name))
  const current = [...new Set([...(order.items || []), ...available])].filter(name => available.has(name) && !names.includes(name))
  const placement = externalImportPlacement?.root === root && externalImportPlacement.directory === directory ? externalImportPlacement : null
  const index = placement?.reference ? current.indexOf(placement.reference) : -1
  if (index >= 0 && placement?.position !== 'inside') current.splice(index + (placement?.position === 'after' ? 1 : 0), 0, ...names)
  else current.push(...names)
  await invoke('save_folder_order', { libraryRoot: root, path: directory, order: { items: current, pinned: order.pinned || [] } })
  if (root === store.libraryPath) await refreshNode(directory)
}
const contextPaths = () => topLevelPaths(selectedKeys.value.includes(contextMenu.targetPath) ? selectedKeys.value : [contextMenu.targetPath])
const clipboardAvailable = computed(() => Boolean(libraryFileClipboard.value?.paths.length && sameLibrary(libraryFileClipboard.value.root, store.libraryPath)))
const undoMoveAvailable = computed(() => Boolean(lastLibraryMove.value?.items.length && sameLibrary(lastLibraryMove.value.root, store.libraryPath)))
const fileMenuIcon = (icon: typeof CopyFileIcon) => () => h(NIcon, null, { default: () => h(icon) })
const contextMenuProps = () => ({ style: 'max-height: min(480px, calc((100vh - 80px) / 2)); overflow-y: auto;' })
const destinationMenuOptions = () => [
  { label: '粘贴 (Ctrl+V)', key: 'file-paste', disabled: !clipboardAvailable.value || fileOperationBusy.value, icon: fileMenuIcon(PasteFileIcon) },
  { label: '撤销上次移动', key: 'file-undo-move', disabled: !undoMoveAvailable.value || fileOperationBusy.value, icon: fileMenuIcon(UndoFileIcon) },
  { label: '资料库回收站…', key: 'file-trash', disabled: fileOperationBusy.value, icon: fileMenuIcon(TrashIcon) },
  { label: '核对未完成的移动…', key: 'file-move-review', disabled: fileOperationBusy.value, icon: fileMenuIcon(RefreshIcon) },
]
const beforeFileOperation = async (paths: string[], operation: FileOperation) => {
  if (fileDropBusy.value) { message.info('文件正在移动，请稍后再操作'); return false }
  const targets = allTabs.value.filter(tab => paths.some(path => sameLibrary(tab.path, path) || fileStylePathKey(tab.path).startsWith(fileStylePathKey(path) + '/')))
  if (targets.some(tab => hasPendingMainTextSave(tab.path))) { message.info('文件正在保存，请稍后再操作'); return false }
  if (targets.some(tab => tab.isDirty) && (operation === 'trash' || operation === 'copy')) { message.info('请先保存所选文件的修改，再操作文件'); return false }
  return true
}
const applyFileOperation = async (result: FileOperationResult, operation: FileOperation) => {
  const library = store.libraryPath
  try {
    const parents = new Set<string>()
    for (const item of result.items) {
      if (operation === 'move' || operation === 'undo' || operation === 'rename') {
        await syncRenamedWorkspaceReferences(item.oldPath, item.newPath)
        if (operation === 'rename') {
          const clipboard = libraryFileClipboard.value
          if (clipboard && sameLibrary(clipboard.root, library)) clipboard.paths = clipboard.paths.map(path => replaceRenamedPath(path, item.oldPath, item.newPath))
        }
        try { await store.moveFileDisplayStyles(item.oldPath, item.newPath) } catch { message.warning('位置已更新，样式已保留；设置保存可稍后重试') }
      } else if (operation === 'copy') {
        try { await store.copyFileDisplayStyles(item.oldPath, item.newPath) } catch { message.warning('副本已创建，样式已保留；设置保存可稍后重试') }
      } else if (operation === 'trash') {
        for (const tab of [...allTabs.value]) if (sameLibrary(tab.path, item.oldPath) || fileStylePathKey(tab.path).startsWith(fileStylePathKey(item.oldPath) + '/')) store.removeTab(tab.id)
        const clipboard = libraryFileClipboard.value
        if (clipboard) clipboard.paths = clipboard.paths.filter(path => !sameLibrary(path, item.oldPath) && !fileStylePathKey(path).startsWith(fileStylePathKey(item.oldPath) + '/'))
      }
      if (operation !== 'restore') parents.add(fileParent(item.oldPath))
      if (operation !== 'trash') parents.add(fileParent(item.newPath))
    }
    for (const parent of parents) if (parent && sameLibrary(library, store.libraryPath)) await refreshNode(parent)
    if (!sameLibrary(library, store.libraryPath)) return
    if (operation !== 'trash') {
      const next = result.items.map(item => item.newPath)
      for (const path of next) {
        const ancestors: string[] = []
        let directory = fileParent(path)
        while (directory && !sameLibrary(directory, store.libraryPath)) { ancestors.unshift(directory); directory = fileParent(directory) }
        for (const ancestor of ancestors) {
          const node = findTreeOptionByKey(treeData.value, ancestor)
          if (node) {
            if (node.children === undefined) {
              await handleLoadChildren(node)
              treeData.value = [...treeData.value]
              await nextTick()
            }
            if (!expandedKeys.value.includes(node.key as string)) expandedKeys.value = [...expandedKeys.value, node.key as string]
          }
        }
      }
      selectedKeys.value = next
      await nextTick()
      treeInstRef.value?.scrollTo({ key: next[0], behavior: 'auto' })
    } else {
      selectedKeys.value = []
      const queryPath = typeof route.query.path === 'string' ? route.query.path : ''
      if (result.items.some(item => sameLibrary(queryPath, item.oldPath) || fileStylePathKey(queryPath).startsWith(fileStylePathKey(item.oldPath) + '/'))) {
        if (activeTabId.value) await openManagedFile(router, activeTabId.value, {}, 'replace')
        else await router.replace({ name: 'LibraryMode' })
      }
    }
    announceFileRelationsChanged(store.libraryPath)
    void fetchLibStats()
    void fetchAllTags()
  } catch (error) { message.warning(`文件操作已完成，但列表未能刷新，请手动刷新：${String(error)}`) }
}
const renameState = reactive({ show: false, oldPath: '', oldName: '', newName: '', isDir: false, confirmExtension: false })
const fileStyleEditor = reactive({
  show: false,
  saving: false,
  path: '',
  name: '',
  formatId: '',
  backgroundColor: '',
  textColor: '',
  icon: 'auto' as FileMarkerIconId,
  selectionStyle: 'fill' as FileSelectionStyle,
  selectedBackgroundColor: '',
  selectedTextColor: '',
  selectedAccentColor: '',
})
const FILE_MARKER_BACKGROUND_OPTIONS = [
  { label: '默认背景', value: '' },
  { label: '柔和黄色', value: '#fff1a8' },
  { label: '柔和绿色', value: '#d9f7d6' },
  { label: '柔和蓝色', value: '#dcecff' },
  { label: '柔和紫色', value: '#eee2ff' },
  { label: '柔和粉色', value: '#ffe0eb' },
  { label: '柔和灰色', value: '#e9edf2' },
]
const FILE_MARKER_TEXT_OPTIONS = [
  { label: '默认文字', value: '' },
  { label: '深灰', value: '#253041' },
  { label: '深红', value: '#9f2430' },
  { label: '深绿', value: '#176b45' },
  { label: '深蓝', value: '#245ca6' },
  { label: '深紫', value: '#6740a5' },
  { label: '棕色', value: '#81511c' },
]
const fileNameWithExtension = (path: string) => path.split(/[\\/]/).pop() || path
const fileTreeVisualForPath = (path: string) => {
  const marker = store.fileDisplayStyleForPath(path)
  const visual = resolveFileTreeVisual(findFileFormat(path)?.id, marker?.icon || 'auto')
  return { ...visual, color: markerTextColor(marker) || visual.color }
}
const fileStylePreviewVisual = computed(() => {
  const base = resolveFileTreeVisual(fileStyleEditor.formatId, fileStyleEditor.icon)
  return { ...base, color: markerTextColor(fileStyleEditor) || base.color }
})
const fileStylePreviewColors = computed(() => fileMarkerColors(fileStyleEditor))
const FILE_SELECTION_OPTIONS: { id: FileSelectionStyle; label: string }[] = [
  { id: 'fill', label: '填色' }, { id: 'outline', label: '描边' }, { id: 'marker', label: '侧边标记' },
]

const refreshFileTreePresentation = () => { treeData.value = [...treeData.value] }
watch([() => store.fileDisplayStyles, () => store.theme, () => store.visualStyle], refreshFileTreePresentation, { deep: true })
const openFileStyleEditor = (path: string) => {
  const existing = store.fileDisplayStyleForPath(path)
  fileStyleEditor.path = path
  fileStyleEditor.name = path.split(/[\\/]/).pop() || path
  fileStyleEditor.formatId = findFileFormat(path)?.id || ''
  fileStyleEditor.backgroundColor = existing?.backgroundColor || ''
  fileStyleEditor.textColor = existing?.textColor || ''
  fileStyleEditor.icon = existing?.icon || 'auto'
  fileStyleEditor.selectionStyle = existing?.selectionStyle || 'fill'
  fileStyleEditor.selectedBackgroundColor = existing?.selectedBackgroundColor || ''
  fileStyleEditor.selectedTextColor = existing?.selectedTextColor || ''
  fileStyleEditor.selectedAccentColor = existing?.selectedAccentColor || ''
  fileStyleEditor.show = true
}
const saveFileDisplayStyle = async () => {
  if (!fileStyleEditor.path || fileStyleEditor.saving) return
  fileStyleEditor.saving = true
  try {
    const style: FileDisplayStyle = {
      backgroundColor: fileStyleEditor.backgroundColor,
      textColor: fileStyleEditor.textColor,
      icon: fileStyleEditor.icon,
      selectionStyle: fileStyleEditor.selectionStyle,
      selectedBackgroundColor: fileStyleEditor.selectedBackgroundColor,
      selectedTextColor: fileStyleEditor.selectedTextColor,
      selectedAccentColor: fileStyleEditor.selectedAccentColor,
    }
    if (!style.backgroundColor && !style.textColor && style.icon === 'auto' && style.selectionStyle === 'fill' && !style.selectedBackgroundColor && !style.selectedTextColor && !style.selectedAccentColor) await store.clearFileDisplayStyle(fileStyleEditor.path)
    else await store.setFileDisplayStyle(fileStyleEditor.path, style)
    refreshFileTreePresentation()
    fileStyleEditor.show = false
    message.success('文件显示样式已保存')
  } catch (error) {
    message.error(`保存显示样式失败：${String(error)}`)
  } finally {
    fileStyleEditor.saving = false
  }
}
const resetFileDisplayStyle = async () => {
  if (!fileStyleEditor.path || fileStyleEditor.saving) return
  fileStyleEditor.saving = true
  try {
    await store.clearFileDisplayStyle(fileStyleEditor.path)
    refreshFileTreePresentation()
    fileStyleEditor.show = false
    message.success('已恢复默认显示样式')
  } catch (error) {
    message.error(`恢复默认样式失败：${String(error)}`)
  } finally {
    fileStyleEditor.saving = false
  }
}

const displayedExtension = (name: string) => {
  const registered = knownFileExtension(name)
  if (registered) return registered
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : ''
}
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])
const renameValidation = computed(() => {
  const name = renameState.newName
  if (!name) return { valid: false, message: '名称不能为空' }
  if (name !== name.trim() || name.endsWith('.')) return { valid: false, message: '名称不能以空格或句点开头或结尾' }
  if (name === '.' || name === '..') return { valid: false, message: '名称不能是 . 或 ..' }
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return { valid: false, message: '名称包含 Windows 不允许的字符' }
  if (WINDOWS_RESERVED_NAMES.has(name.split('.')[0].toUpperCase())) return { valid: false, message: '名称使用了 Windows 保留名称' }
  if (name === renameState.oldName) return { valid: false, message: '名称没有变化' }
  if (!renameState.isDir && !findFileFormat(name)) return { valid: false, message: '该后缀尚未注册，重命名后将无法在工作区中打开' }
  return { valid: true, message: '' }
})
const renameExtensionChange = computed(() => {
  if (renameState.isDir) return { changed: false, oldLabel: '', newLabel: '' }
  const oldExtension = displayedExtension(renameState.oldName)
  const newExtension = displayedExtension(renameState.newName)
  const oldFormat = findFileFormat(renameState.oldName)
  const newFormat = findFileFormat(renameState.newName)
  const label = (format: typeof oldFormat, extension: string) => format
    ? `${format.label}（${extension || '无后缀'}）`
    : extension ? `未注册格式（${extension}）` : '无后缀文件'
  return {
    changed: oldExtension.toLowerCase() !== newExtension.toLowerCase(),
    oldLabel: label(oldFormat, oldExtension),
    newLabel: label(newFormat, newExtension),
  }
})

const openRename = (path: string, isDir: boolean) => {
  if (fileOperationBusy.value || fileDropBusy.value) { message.info('文件正在操作，请稍后重命名'); return }
  contextMenu.show = false
  const name = path.split(/[\\/]/).pop() || ''
  renameState.oldPath = path
  renameState.oldName = name
  renameState.newName = name
  renameState.isDir = isDir
  renameState.confirmExtension = false
  renameState.show = true
}

// --- AI Assistant ---
const aiState = reactive({
  showActionModal: false,
  showResultModal: false,
  loading: false,
  result: '',
  selectedText: '',
  abortController: null as AbortController | null
})

const systemPrompts: Record<string, string> = {
  polish: '请润色以下文本，使其更加通顺、优美，保持原意不变，只返回润色后的结果，不要添加任何额外说明：',
  rewrite: '请重写以下文本，保持核心意思不变，使用不同的表达方式，只返回重写后的结果，不要添加任何额外说明：',
  summarize: '请总结以下文本的核心要点，简洁明了，只返回总结结果，不要添加任何额外说明：',
  translate: '请将以下文本翻译为中文，只返回翻译结果，不要添加任何额外说明：',
}

const AI_REQUEST_TIMEOUT = 30000

const handleAIAssist = () => {
  if (!store.aiEnabled) { message.warning('请先在设置中启用 AI 并配置 API'); return }
  const sel = window.getSelection()?.toString().trim()
  if (!sel) { message.warning('请先选择要处理的文本'); return }
  aiState.selectedText = sel
  aiState.showActionModal = true
}

const handleAIAction = async (action: string) => {
  aiState.showActionModal = false
  aiState.loading = true; aiState.result = ''
  aiState.showResultModal = true

  // 创建超时控制器
  aiState.abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    if (aiState.abortController) {
      aiState.abortController.abort()
    }
  }, AI_REQUEST_TIMEOUT)

  try {
    aiState.result = await invoke<string>('ai_chat_completion', {
      endpoint: store.aiEndpoint,
      model: store.aiModel,
      systemPrompt: systemPrompts[action],
      userContent: aiState.selectedText,
    })
    clearTimeout(timeoutId)
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (aiState.abortController?.signal.aborted) {
      message.error('AI 请求超时（30秒）')
    } else {
      message.error('AI 请求失败: ' + (e?.toString() || '未知错误'))
    }
    aiState.showResultModal = false
  }
  aiState.loading = false
  aiState.abortController = null
}

const cancelAIRequest = () => {
  if (aiState.abortController) {
    aiState.abortController.abort()
    aiState.abortController = null
  }
  aiState.loading = false
  aiState.showResultModal = false
  message.info('已取消 AI 请求')
}

const replaceWithResult = () => {
  if (!vditor || !aiState.result) return
  if (vditor.getCurrentMode() === 'wysiwyg') {
    vditor.insertValue(aiState.result)
  } else {
    const content = vditor.getValue()
    // 用实际选区偏移量定位，避免选错重复文本
    const sel = window.getSelection()
    const prevEl = vditor.vditor.sv?.element || vditor.vditor.ir?.element
    if (sel && sel.rangeCount > 0 && prevEl) {
      const pre = document.createRange(); pre.selectNodeContents(prevEl)
      pre.setEnd(sel.anchorNode!, sel.anchorOffset!)
      const start = pre.toString().length
      pre.setEnd(sel.focusNode!, sel.focusOffset!)
      const end = pre.toString().length
      const [s, e] = start < end ? [start, end] : [end, start]
      vditor.setValue(content.substring(0, s) + aiState.result + content.substring(e))
    } else {
      const idx = content.indexOf(aiState.selectedText)
      if (idx !== -1) vditor.setValue(content.substring(0, idx) + aiState.result + content.substring(idx + aiState.selectedText.length))
    }
  }
  aiState.showResultModal = false; aiState.result = ''
  message.success('已替换')
}

const copyAIResult = () => {
  navigator.clipboard.writeText(aiState.result)
  message.success('已复制到剪贴板')
}

// --- Export ---
const exportOptions = [
  { label: '导出 PDF', key: 'pdf' },
  { label: '导出 HTML', key: 'html' },
  { label: '导出 Markdown', key: 'md' },
]
const handleExport = async (key: string) => {
  if (!activeTabId.value || !vditor) return
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (!tab) return

  if (key === 'pdf') {
    // Vditor 内置 exportPDF，打开打印对话框 → 用户选「另存为 PDF」
    try { (vditor as any).exportPDF() } catch (e) { message.error('PDF 导出失败') }
  } else if (key === 'html') {
    try {
      const html = vditor.getHTML()
      await invoke('export_to_html', { libraryRoot: store.libraryPath, path: tab.path, htmlContent: html })
      message.success('HTML 已导出到文件旁')
    } catch (e) { message.error('导出失败') }
  } else if (key === 'md') {
    try {
      const filePath = await invoke<string | null>('export_markdown_file', { suggestedName: tab.title, content: vditor.getValue() })
      if (filePath) message.success('已导出')
    } catch (e) { /* user cancelled */ }
  }
}
interface HistoryEntry { timestamp: number; content: string; path: string; libraryRoot: string }
const historyList = ref<HistoryEntry[]>([])
const historyLoading = ref(false), historyError = ref('')
interface HistoryComparison { entry: HistoryEntry; draft: string; content: string; disk: string; diskSignature: string; historySignature: string }
const historyComparison = ref<HistoryComparison | null>(null)
const historyActionBusy = ref(false), historyActionError = ref('')
let comparisonGeneration = 0
const closeHistoryComparison = () => { ++comparisonGeneration; historyComparison.value = null; historyActionError.value = '' }
watch([activeTabId, () => store.libraryPath], closeHistoryComparison, { flush: 'sync' })
let historyGeneration = 0
const invalidateHistory = () => { ++historyGeneration; historyList.value = []; historyLoading.value = false; historyError.value = '' }
watch([activeTabId, () => store.libraryPath], invalidateHistory, { flush: 'sync' })
watch(() => activeTextTab.value?.textSignature, () => {
  if (activeSidebarTab.value === 'history') void fetchHistory()
})

const openSettings = () => router.push('/settings')
const librarySwitchBusy = ref(false)
const librarySwitchOptions = computed<DropdownOption[]>(() => [
  ...store.libraries.map(library => ({
    key: library.path,
    label: `${library.path === store.libraryPath ? '✓ ' : ''}${library.name}`,
    props: { title: library.path },
    disabled: librarySwitchBusy.value || library.path === store.libraryPath,
  })),
  { key: 'library-divider', type: 'divider' },
  { key: 'manage-libraries', label: '管理资料库…' },
])
const selectLibrary = async (path: string) => {
  if (librarySwitchBusy.value) return
  if (path === 'manage-libraries') { openSettings(); return }
  if (path === store.libraryPath || !store.libraries.some(library => library.path === path)) return
  // Capture input before Vditor's debounced callback so a fast click cannot
  // discard the last keystrokes when the store restores another library.
  const tab = tabs.value.find(item => item.id === activeTabId.value)
  if (tab && vditor && isVditorReady && activeIsMarkdown.value) {
    const content = vditor.getValue()
    if (tab.content !== content && (tab.isDirty || content !== editorDisplayBaseline)) { tab.content = content; tab.isDirty = true }
  }
  if (store.tabs.some(item => item.isDirty)) {
    message.warning('有未保存的文档，请先保存后再切换资料库。')
    return
  }
  librarySwitchBusy.value = true
  try { await store.updateConfig({ activeLibraryPath: path }) }
  catch (error) { message.error(`切换资料库失败：${String(error)}`) }
  finally { librarySwitchBusy.value = false }
}
useWindowDraftSnapshot(() => {
  const tab = tabs.value.find(item => item.id === activeTabId.value)
  if (tab && vditor && isVditorReady && activeIsMarkdown.value && !suppressEditorInput && !tab.textReadOnlyReason) {
    const content = vditor.getValue()
    if (tab.content !== content && (tab.isDirty || content !== editorDisplayBaseline)) { tab.content = content; tab.isDirty = true }
  }
})
const openUpdateSettings = () => router.push({ name: 'Settings', query: { category: 'system', focus: 'software-update' } })
const openWorkspace = () => router.push('/workspace')
const openGraph = () => router.push('/graph')
const openCurrentRelations = () => {
  if (!activeTabId.value) return
  router.push({ name: 'Graph', query: { mode: 'network', root: activeTabId.value } })
}
const setLocalGraphPinned = (pinned: boolean) => {
  localGraphPinned.value = pinned
  writeLocalGraphPinned(pinned)
}
const openPinnedLocalMindmap = () => {
  if (!activeTabId.value) return
  router.push({ name: 'Graph', query: { mode: 'mindmap', root: activeTabId.value } })
}
const createPinnedLocalCanvas = async (depth: number) => {
  if (!activeTabId.value) return
  try {
    if (activeIsMarkdown.value) await saveCurrentFile()
    const path = await invoke<string>('create_canvas_from_graph', { libraryRoot: store.libraryPath, centerPath: activeTabId.value, depth })
    await refreshLibrary()
    openManagedFile(router, path)
  } catch (error) {
    message.error(`生成局部关系画布失败：${String(error)}`)
  }
}

const createMindMapFromCurrentMarkdown = async () => {
  if (!activeTabId.value) return
  try {
    await saveCurrentFile()
    const path = await invoke<string>('create_canvas_from_markdown', {
      libraryRoot: store.libraryPath,
      markdownPath: activeTabId.value
    })
    await refreshLibrary()
    openManagedFile(router, path)
  } catch (error) {
    message.error(`转换思维导图失败：${String(error)}`)
  }
}
const fetchHistory = async () => {
  const generation = ++historyGeneration
  const path = activeTabId.value
  const libraryRoot = store.libraryPath
  historyList.value = []; historyError.value = ''
  if (!path || !libraryRoot) return
  historyLoading.value = true
  const isCurrent = () => generation === historyGeneration && path === activeTabId.value && libraryRoot === store.libraryPath
  try {
    const res = await invoke<[number, string][]>('list_history', { libraryRoot, path })
    if (isCurrent()) historyList.value = res.map(([timestamp, content]) => ({ timestamp, content, path, libraryRoot }))
  } catch (e) {
    if (isCurrent()) historyError.value = `历史暂时无法读取：${String(e)}`
  }
  finally { if (isCurrent()) historyLoading.value = false }
}

const ownsHistoryEntry = (entry: HistoryEntry) => historyList.value.includes(entry)
  && entry.path === activeTabId.value && entry.libraryRoot === store.libraryPath
const restoreHistory = async (entry: HistoryEntry) => {
  if (!ownsHistoryEntry(entry) || !vditor || !isVditorReady || lastLoadedPath !== entry.path
    || !activeFormatCanEdit.value || hasPendingMainTextSave(entry.path)) {
    message.warning('文件已切换或正在读写，请等待当前文件就绪后重试')
    return
  }
  closeHistoryComparison()
  const generation = comparisonGeneration, draft = vditor.getValue()
  try {
    const comparison = await invoke<Omit<HistoryComparison, 'entry' | 'draft'>>('compare_history_version', { libraryRoot: entry.libraryRoot, path: entry.path, timestamp: entry.timestamp })
    if (generation !== comparisonGeneration || !ownsHistoryEntry(entry)) return
    historyComparison.value = { ...comparison, entry, draft }
  } catch (error) { if (generation === comparisonGeneration) message.error(`历史比较失败：${String(error)}`) }
}
const recoverHistory = async (mode: 'copy' | 'replace' | 'partial', changeId?: number) => {
  const comparison = historyComparison.value
  if (!comparison || historyActionBusy.value) return
  const { entry } = comparison
  const current = () => historyComparison.value === comparison && ownsHistoryEntry(entry)
    && vditor && isVditorReady && lastLoadedPath === entry.path && activeFormatCanEdit.value
    && !hasPendingMainTextSave(entry.path) && vditor.getValue() === comparison.draft
  if (!current()) { historyActionError.value = '文件或草稿已变化，请关闭后重新比较'; return }
  historyActionBusy.value = true; historyActionError.value = ''
  try {
    if (mode === 'replace' && !await confirmAppAction(dialog, {
      title: '替换当前编辑区？', content: '会先将当前草稿保存为历史快照，再载入所选历史版本。不会自动覆盖磁盘文件。',
      positiveText: '保护草稿并替换', negativeText: '取消',
    })) return
    if (!current()) { if (historyComparison.value === comparison) historyActionError.value = '文件或草稿已变化，请重新比较'; return }
    const args = { libraryRoot: entry.libraryRoot, path: entry.path, timestamp: entry.timestamp, diskSignature: comparison.diskSignature, historySignature: comparison.historySignature }
    if (mode === 'copy') {
      const path = await invoke<string>('restore_history_copy', args)
      if (!current()) { message.info(`恢复副本已创建：${path}；当前工作现场未切换`); return }
      closeHistoryComparison()
      await refreshLibrary()
      if (store.libraryPath === entry.libraryRoot && activeTabId.value === entry.path) openManagedFile(router, path)
      message.success('历史副本已创建，原文件和草稿未覆盖')
    } else {
      const content = await invoke<string>('prepare_history_restore', { ...args, currentDraft: comparison.draft, maxCount: store.maxHistoryCount })
      if (!current()) { if (historyComparison.value === comparison) historyActionError.value = '草稿已保护，但当前内容已变化，未替换；请重新比较'; return }
      applyHistoryContent(entry, mode === 'partial' ? restoreHistoryChange(comparison.draft, content, changeId!) : content, mode === 'partial')
      closeHistoryComparison()
      void fetchHistory()
    }
  } catch (error) { if (historyComparison.value === comparison) historyActionError.value = `恢复失败：${String(error)}` }
  finally { historyActionBusy.value = false }
}
const applyHistoryContent = (entry: HistoryEntry, content: string, preserveView = false) => {
  const scroller = preserveView ? editorScroller() : undefined
  const position = scroller ? { top: scroller.scrollTop, left: scroller.scrollLeft } : undefined
  // Match excerpt insertion: flush both states so an immediate Undo restores this operation.
  if (preserveView) vditor.vditor.undo.addToUndoStack(vditor.vditor)
  vditor.setValue(content)
  if (preserveView) vditor.vditor.undo.addToUndoStack(vditor.vditor)
  if (position) void nextTick(() => { const current = editorScroller(); if (current) current.scrollTo({ top: position.top, left: position.left, behavior: 'auto' }) })
  // Programmatic Vditor updates do not reliably emit its input callback.
  store.updateTabContent(entry.path, content)
  const tab = tabs.value.find(item => item.path === entry.path)
  if (tab) tab.isDirty = true
  wordCount.value = content.length
  message.success(preserveView ? '此处已恢复，其余草稿保留；仍需保存' : '历史内容已载入编辑区，尚未保存到文件')
}
const clearAllHistory = async () => {
  dialog.warning({
    title: '清理普通历史？',
    content: '清理各文件未标记保留的历史版本。重要版本、原文件和当前草稿会保留。',
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await invoke('clear_all_history'); await fetchHistory(); message.success('普通历史已清理，重要版本仍保留') }
      catch (e) { message.error('清空失败') }
    }
  })
}

let shadowSaveTimer: any = null
const startShadowSaveTimer = () => {
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  const interval = store.autoSaveInterval * 60 * 1000
  shadowSaveTimer = setInterval(async () => {
    const path = activeTabId.value, root = store.libraryPath
    const tab = tabs.value.find(item => item.path === path)
    if (!path || path !== lastLoadedPath || !vditor || !isVditorReady || !activeIsMarkdown.value || tab?.textReadOnlyReason || hasPendingMainTextSave(path)) return
    const content = vditor.getValue()
    try {
      await invoke('save_history_version', { libraryRoot: root, path, content, maxCount: store.maxHistoryCount })
      if (path === activeTabId.value && root === store.libraryPath && activeSidebarTab.value === 'history') void fetchHistory()
    } catch (error) {
      if (path === activeTabId.value && root === store.libraryPath) message.warning('本次历史暂未记录，当前编辑内容仍保留：' + String(error))
    }
  }, interval)
}

const clampSidebarWidth = (width: number) => Math.max(220, Math.min(width, 600))
const applySidebarWidth = (width: number) => {
  libraryShell.value?.style.setProperty('--library-sidebar-width', `${width}px`)
  sidebarResize?.handle.setAttribute('aria-valuenow', String(Math.round(width)))
}
const finishSidebarResize = (event?: PointerEvent) => {
  const resize = sidebarResize
  if (!resize || (event && event.pointerId !== resize.pointerId)) return
  if (event?.type === 'pointerup') pendingSidebarWidth = clampSidebarWidth(resize.startWidth + event.clientX - resize.startX)
  cancelAnimationFrame(sidebarResizeFrame)
  sidebarResizeFrame = 0
  applySidebarWidth(pendingSidebarWidth)
  // Commit the final geometry while transitions are still disabled, so releasing
  // the pointer cannot animate the last pending movement.
  libraryShell.value?.querySelector('.sidebar')?.getBoundingClientRect()
  sidebarWidth.value = pendingSidebarWidth
  sidebarResize = null
  activeResizer.value = null
  window.removeEventListener('blur', cancelSidebarResize)
  if (resize.handle.hasPointerCapture(resize.pointerId)) resize.handle.releasePointerCapture(resize.pointerId)
}
const cancelSidebarResize = () => finishSidebarResize()
const startSidebarResize = (event: PointerEvent) => {
  if (event.button !== 0 || isSidebarCollapsed.value || sidebarResize) return
  const sidebar = libraryShell.value?.querySelector('.sidebar')
  if (!sidebar) return
  const handle = event.currentTarget as HTMLElement
  pendingSidebarWidth = sidebar.getBoundingClientRect().width
  sidebarResize = { pointerId: event.pointerId, startX: event.clientX, startWidth: pendingSidebarWidth, handle }
  handle.setPointerCapture(event.pointerId)
  activeResizer.value = 'sidebar'
  window.addEventListener('blur', cancelSidebarResize)
}
const moveSidebarResize = (event: PointerEvent) => {
  if (!sidebarResize || event.pointerId !== sidebarResize.pointerId) return
  pendingSidebarWidth = clampSidebarWidth(sidebarResize.startWidth + event.clientX - sidebarResize.startX)
  if (sidebarResizeFrame) return
  // Resize the shell once per frame without rerendering the file tree and editor.
  sidebarResizeFrame = requestAnimationFrame(() => {
    sidebarResizeFrame = 0
    applySidebarWidth(pendingSidebarWidth)
  })
}
const resizeSidebarByKey = (event: KeyboardEvent) => {
  if (isSidebarCollapsed.value || sidebarResize) return
  const step = event.shiftKey ? 40 : 10
  const width = event.key === 'Home' ? 220 : event.key === 'End' ? 600
    : event.key === 'ArrowLeft' ? sidebarWidth.value - step : event.key === 'ArrowRight' ? sidebarWidth.value + step : null
  if (width === null) return
  event.preventDefault()
  sidebarWidth.value = clampSidebarWidth(width)
  applySidebarWidth(sidebarWidth.value)
}
onBeforeUnmount(cancelSidebarResize)

const handleNodeSelect = (keys: string[]) => {
  selectedKeys.value = keys
  // Multi-selection is for file operations; opening its last item would make
  // the active-document watcher replace the selection with a single file.
  if (keys.length > 1) return
  if (keys.length === 0) return
  const selectedPath = keys[keys.length - 1]
  if (findTreeOptionByKey(treeData.value, selectedPath)?.isLeaf === false) return
  // Windows file-tree paths may include the device prefix while an open draft
  // uses the ordinary spelling. Reuse its path before navigating or adding a tab.
  const existing = allTabs.value.find(tab => tab.isDirty && sameLibrary(tab.path, selectedPath)) || allTabs.value.find(tab => sameLibrary(tab.path, selectedPath))
  const lastKey = existing?.path || selectedPath
  const format = lastKey ? findFileFormat(lastKey) : undefined
  if (format && opensInLibraryShell(format)) {
    if (route.name !== 'LibraryMode' || route.query.path !== lastKey) {
      void openManagedFile(router, lastKey, {}, 'replace')
      return
    }
    const title = fileDisplayName(lastKey) || format.label
    store.addTab({ id: lastKey, title, path: lastKey, isDirty: false })
    void refreshRelationSummaries()
  } else if (format) {
    router.push({ name: format.routeName, query: { path: lastKey } })
  }
}
const handleTreeSelection = (keys: string[]) => {
  selectedKeys.value = keys
  if (!filePointerSelecting.value) handleNodeSelect(keys)
}


let searchNavigationSequence = 0
const openKnowledgeSearchResult = (result: KnowledgeSearchResult) => {
  searchReturn.remember(searchMatchKey(result))
  if (
    result.locatorKind
    || result.annotationId
    || ['pdf', 'workbook', 'docx', 'odt', 'ods', 'odp', 'pptx'].includes(result.objectType)
  ) {
    void openManagedObject(router, {
      path: result.path,
      objectType: result.objectType,
      locator: {
        kind: result.locatorKind,
        objectId: result.locatorObjectId,
        page: result.page,
      },
      page: result.page,
      annotationId: result.annotationId,
      locationLabel: result.locationLabel,
      matchKind: result.matchKind,
    }, 'replace')
    return
  }
  if (['markdown', 'plain-text'].includes(result.objectType) && result.matchKind === 'body') {
    void openManagedFile(router, result.path, { searchNeedle: searchQueryNeedle(searchQuery.value, result.context), searchLocator: `${Date.now()}-${++searchNavigationSequence}` }, 'replace')
    return
  }
  const target = routeForFile(result.path)
  if (opensInLibraryShell(findFileFormat(result.path))) handleNodeSelect([result.path])
  else if (target) router.push(target)
}

const handleLoadChildren = async (option: TreeOption) => {
  const libraryRoot = store.libraryPath
  const generation = libraryLoadGeneration
  const isCurrent = () => store.libraryPath === libraryRoot && libraryLoadGeneration === generation
  try {
    const children = await loadDirectory(option.key as string, libraryRoot)
    if (!isCurrent()) return false
    option.children = children
  } catch (e) {
    if (!isCurrent()) return false
    // Keep children unloaded: a disconnected/moved folder is not an empty
    // folder. The next expansion must perform a new read after it returns.
    const name = typeof option.label === 'string' ? option.label : fileNameWithExtension(option.key as string)
    handleError(e, `文件夹「${name}」读取失败，请确认位置后重新展开`, 'handleLoadChildren')
    return false
  }
}

const isLibraryMetadata = (name: string) => ['.misty_order.json', '.longedit'].includes(name.toLowerCase())
const loadDirectory = async (path: string, libraryRoot = store.libraryPath): Promise<TreeOption[]> => {
  if (!path) return []
  const entries = await invoke<FileEntry[]>('scan_directory', { libraryRoot, path })
  return entries.filter(entry => !isLibraryMetadata(entry.name)).map(entry => ({
    label: entry.name,
    key: entry.path,
    isLeaf: !entry.is_dir,
    prefix: () => {
      const format = entry.is_dir ? undefined : findFileFormat(entry.path)
      const marker = entry.is_dir ? undefined : store.fileDisplayStyleForPath(entry.path)
      const formatVisual = resolveFileTreeVisual(format?.id, marker?.icon || 'auto')
      return h(entry.is_dir ? FolderIcon : formatVisual.icon, {
        size: 14,
        color: entry.is_dir ? undefined : markerTextColor(marker) || formatVisual.color,
        style: entry.is_dir ? 'opacity: 0.68' : undefined,
      })
    }
  }))
}

const handleCodeThemeChange = async (val: string) => {
  const appearance = resolveMarkdownEditorAppearance(store.theme, val)
  await store.updateConfig({ codeTheme: appearance.codeTheme })
  if (vditor && isVditorReady) vditor.setTheme(appearance.editorTheme, appearance.contentTheme, appearance.codeTheme)
}
const handleEditorBgChange = async (val: string) => { store.editorBgColor = val; await store.updateConfig({ editorBgColor: val }) }


const refreshLibrary = async () => {
  const path = store.libraryPath
  const generation = ++libraryLoadGeneration
  const isCurrent = () => generation === libraryLoadGeneration && store.libraryPath === path
  libraryLoading.value = true
  try {
    const entries = path ? await loadDirectory(path, path) : []
    if (!isCurrent()) return
    const recovered = Boolean(libraryLoadError.value)
    treeData.value = entries
    libraryLoadError.value = ''
    await applyPendingTreeReveal(true)
    if (path && recovered) {
      void fetchLibStats()
      void fetchAllTags()
      void refreshKnowledgeIndexStatus()
    }
  } catch (error) {
    if (!isCurrent()) return
    treeData.value = []
    libraryLoadError.value = String(error)
  } finally {
    if (isCurrent()) libraryLoading.value = false
  }
}
const applyPendingTreeReveal = async (duringRootLoad = false) => {
  const request = pendingTreeReveal
  if (!request || (libraryLoading.value && !duringRootLoad)) return
  const generation = ++treeRevealGeneration, root = store.libraryPath, loadGeneration = libraryLoadGeneration
  const isCurrent = () => !treeRevealDisposed && generation === treeRevealGeneration
    && root === store.libraryPath && loadGeneration === libraryLoadGeneration && request === pendingTreeReveal
  // Only programmatic reveal is atomic. User folder expand/collapse keeps the
  // normal tree animation once the real entries and expansion keys are ready.
  treeRevealInProgress.value = true
  try {
    await nextTick()
    const keys = await resolveLibraryTreeAncestors(root, request.path, treeData.value, handleLoadChildren, { directory: request.directory, isCurrent })
    if (!isCurrent()) return
    expandedKeys.value = [...new Set([...expandedKeys.value, ...keys])]
    const node = findTreeOptionByKey(treeData.value, request.path)
    const revealSelection = node && typeof node.key === 'string' && selectedKeys.value.length === 1
      && sameWorkspacePath(selectedKeys.value[0], request.path)
    if (revealSelection) selectedKeys.value = [node.key as string]
    // An external file may exist before the current listing knows about it.
    // Keep its reveal request until a subsequent real refresh finds the row.
    if (node || sameWorkspacePath(root, request.path)) pendingTreeReveal = null
    await nextTick()
    if (generation === treeRevealGeneration && revealSelection) treeInstRef.value?.scrollTo({ key: node.key!, behavior: 'smooth' })
  } finally { if (generation === treeRevealGeneration) treeRevealInProgress.value = false }
}
const requestLibraryTreeReveal = (path: string | null, directory = false) => {
  ++treeRevealGeneration
  treeRevealInProgress.value = false
  pendingTreeReveal = path ? { path, directory } : null
  return applyPendingTreeReveal()
}
const createMissingLibraryDirectory = async () => {
  if (libraryCreating.value || !store.libraryPath) return
  const path = store.libraryPath
  libraryCreating.value = true
  try {
    await invoke('prepare_library_path', { path })
    if (store.libraryPath === path) await refreshLibrary()
  } catch (error) {
    if (store.libraryPath === path) libraryLoadError.value = String(error)
  } finally { libraryCreating.value = false }
}
const revealLibraryFile = async (event: Event) => {
  const path = (event as CustomEvent<string>).detail
  if (!path) return
  await refreshLibrary()
  selectedKeys.value = [path]
  await requestLibraryTreeReveal(path)
}
const refreshCreatedLibraryFile = () => { void refreshLibrary() }
const stopRelationChanges = onFileRelationsChanged(root => { if (sameWorkspacePath(root, store.libraryPath)) void refreshRelationSummaries() })
onBeforeUnmount(stopRelationChanges)
const refreshNode = async (path: string) => {
  if (!path || !store.libraryPath) return
  const newEntries = await loadDirectory(path)
  const syncNodes = (oldNodes: TreeOption[], newNodes: TreeOption[]) => {
    const oldMap = new Map(oldNodes.map(n => [n.key, n]))
    return newNodes.map(newNode => { const matchedOld = oldMap.get(newNode.key as string); return matchedOld && matchedOld.children !== undefined ? { ...newNode, children: matchedOld.children } : newNode })
  }
  if (sameWorkspacePath(path, store.libraryPath)) {
    treeData.value = syncNodes(treeData.value, newEntries)
    return
  }
  const patch = (nodes: TreeOption[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (typeof nodes[i].key === 'string' && sameWorkspacePath(nodes[i].key as string, path)) { nodes[i].children = syncNodes(nodes[i].children || [], newEntries); return true }
      const childNodes = nodes[i].children; if (childNodes && patch(childNodes)) return true
    }
    return false
  }
  if (patch(treeData.value)) {
    treeData.value = [...treeData.value]
  } else {
    // 节点不在树中 (如首次创建 Daily 目录)，全量刷新
    treeData.value = await loadDirectory(store.libraryPath)
    await requestLibraryTreeReveal(path, true)
  }
}

const pendingEditorSaveLoad = ref(false)
let editorLoadGeneration = 0
let readingPositionTimer: ReturnType<typeof setTimeout> | undefined
const editorScroller = () => Array.from(document.querySelectorAll<HTMLElement>('.editor-main .vditor-content .vditor-reset, .editor-main .vditor-sv')).find(element => element.getClientRects().length > 0 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY))
const captureEditorPosition = () => {
  const element = editorScroller()
  if (lastLoadedPath && element) rememberWorkspaceViewState(lastLoadedPath, { scrollTop: element.scrollTop, scrollLeft: element.scrollLeft })
}
const rememberEditorScroll = (event: Event) => {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('.vditor-reset, .vditor-sv') || !lastLoadedPath) return
  clearTimeout(readingPositionTimer); readingPositionTimer = setTimeout(captureEditorPosition, 120)
}
onBeforeUnmount(() => { clearTimeout(readingPositionTimer); captureEditorPosition() })
const loadFileToEditor = async (path: string, forceRead = false) => {
  clearTimeout(readingPositionTimer); captureEditorPosition()
  if (!vditor || !path) return; lastLoadedPath = '' 
  const generation = ++editorLoadGeneration
  pendingEditorSaveLoad.value = false
  const loadingEditor = vditor
  loadingEditor.disabled()
  const isCurrentRequest = () => generation === editorLoadGeneration && activeTabId.value === path && vditor === loadingEditor
  if (hasPendingMainTextSave(path)) {
    pendingEditorSaveLoad.value = true
    loadingEditor.disabled()
    await waitForMainTextSave(path)
    if (!isCurrentRequest()) return
    pendingEditorSaveLoad.value = false
  }
  const currentTab = tabs.value.find(t => t.path === path)
  const showReadFailure = (error: unknown, label: string) => {
    if (!isCurrentRequest()) return
    if (forceRead && currentTab?.content !== undefined) {
      // Reload is transactional: unavailable disk content must not replace the
      // existing draft or its save identity with an empty editor.
      setEditorValue(currentTab.content, Boolean(currentTab.textReadOnlyReason), false)
      handleError(error, `${label}，已保留当前内容：${path.split(/[\\/]/).pop()}`, 'loadFileToEditor')
      return
    }
    suppressEditorInput = true
    loadingEditor.setValue('')
    loadingEditor.disabled()
    wordCount.value = 0
    if (currentTab) {
      currentTab.textLoadError = '文件未能读取，请确认文件位置后刷新重试'
      currentTab.textReadOnlyReason = currentTab.textLoadError
    }
    handleError(error, `${label}：${path.split(/[\\/]/).pop()}`, 'loadFileToEditor')
  }
  
  const setEditorValue = (content: string, readOnly = false, refreshHistory = true) => {
    if (!isCurrentRequest()) return
    referenceBookmark = null
    // Reusing Vditor must not leave a link-editing popover from another note.
    const popover = vditor.vditor?.wysiwyg?.popover
    if (popover) popover.style.display = 'none'
    suppressEditorInput = true
    vditor.setValue(content)
    editorDisplayBaseline = vditor.getValue()
    startAdaptiveMotion()
    setTimeout(() => {
      if (!isCurrentRequest()) return
      suppressEditorInput = false
      if (readOnly) vditor?.disabled()
      else vditor?.enable()
    }, 0)
    if (refreshHistory) fetchHistory()
    nextTick(() => { 
      setTimeout(() => { 
        if (!isCurrentRequest()) return
        lastLoadedPath = path;
        if (!route.query.searchLocator && !route.query.taskLine && !route.query.relationId) {
          const view = recallWorkspaceViewState(path), element = editorScroller()
          if (element) { element.scrollTop = view?.scrollTop || 0; element.scrollLeft = view?.scrollLeft || 0 }
        }
        refreshVisibleOutline();
        updateWordCount();
        fixEditorImages(); // 后台增强：通过 Base64 进一步提升图片清晰度/稳定性
        revealLinkedHeading();
        revealSearchMatch();
        scheduleWorkspaceTaskReveal();
        scheduleRelationEvidenceReveal();
      }, 50) 
    })
  }

  const applyTextSnapshot = (tab: typeof currentTab, snapshot: TextDocumentSnapshot, readEncoding?: string) => {
    if (!tab) return
    tab.content = snapshot.content
    tab.isDirty = false
    tab.textSignature = snapshot.signature
    tab.textContentDigest = snapshot.contentDigest
    tab.textEncoding = snapshot.encoding
    tab.textBom = snapshot.bom
    tab.textLineEnding = snapshot.lineEnding
    tab.textHasFinalNewline = snapshot.hasFinalNewline
    tab.textReadEncoding = readEncoding
    tab.textReadOnlyReason = undefined
    tab.textLoadError = undefined
    tab.textRangeNextOffset = undefined
    tab.textRangeEof = undefined
    tab.textSize = snapshot.size
    tab.textModified = snapshot.modified
    lastPromptedExternalSignature = ''
  }

  let readSucceeded = false
  if (currentTab?.content !== undefined && !forceRead) {
    setEditorValue(currentTab.content, Boolean(currentTab.textReadOnlyReason))
    readSucceeded = true
  } else {
    try {
      const format = findFileFormat(path)
      if (!format || format.routeName !== 'LibraryMode') throw new Error('文件未注册为文本工作面格式')
      const readOptions = currentTab?.textReadEncoding ? { encoding: currentTab.textReadEncoding } : undefined
      const res = await invoke<TextDocumentSnapshot>('read_text_document', { libraryRoot: store.libraryPath, path, formatId: format.id, readOptions })
      if (!isCurrentRequest()) return
      applyTextSnapshot(currentTab, res, currentTab?.textReadEncoding)
      setEditorValue(res.content)
      readSucceeded = true
    } catch (err: any) {
      if (!isCurrentRequest()) return
      if (err?.code === 'read-too-large' && currentTab) {
        try {
          const preview = await readLargeTextPreview(currentTab, 0, currentTab.textReadEncoding)
          if (!isCurrentRequest()) return
          setEditorValue(preview.content, true)
          readSucceeded = true
          message.warning('文件超过完整编辑上限，已进入大文件只读预览')
        } catch (previewError: any) {
          showReadFailure(previewError, '大文件预览失败')
        }
      } else {
        showReadFailure(err, '读取失败')
      }
    }
  }
  return readSucceeded && isCurrentRequest()
}

const updateTabFromTextSnapshot = (tab: TabInfo, snapshot: TextDocumentSnapshot, readEncoding?: string) => {
  tab.content = snapshot.content
  tab.isDirty = false
  tab.textSignature = snapshot.signature
  tab.textContentDigest = snapshot.contentDigest
  tab.textEncoding = snapshot.encoding
  tab.textBom = snapshot.bom
  tab.textLineEnding = snapshot.lineEnding
  tab.textHasFinalNewline = snapshot.hasFinalNewline
  tab.textReadEncoding = readEncoding
  tab.textReadOnlyReason = undefined
  tab.textLoadError = undefined
  tab.textRangeNextOffset = undefined
  tab.textRangeEof = undefined
  tab.textSize = snapshot.size
  tab.textModified = snapshot.modified
  lastPromptedExternalSignature = ''
}

const applyTextRangeSnapshot = (tab: TabInfo, snapshot: TextDocumentRangeSnapshot, readEncoding?: string) => {
  tab.content = snapshot.content
  tab.isDirty = false
  tab.textSignature = undefined
  tab.textContentDigest = undefined
  tab.textEncoding = snapshot.encoding
  if (snapshot.offset === 0) {
    tab.textBom = snapshot.bom
    tab.textLineEnding = snapshot.lineEnding
  }
  tab.textHasFinalNewline = undefined
  tab.textReadEncoding = readEncoding || snapshot.encoding
  tab.textReadOnlyReason = snapshot.readOnlyReason
  tab.textLoadError = undefined
  tab.textRangeNextOffset = snapshot.nextOffset
  tab.textRangeEof = snapshot.eof
  tab.textSize = snapshot.size
}

const readLargeTextPreview = async (tab: TabInfo, offset: number, readEncoding?: string) => {
  const format = findFileFormat(tab.path)
  if (!format || format.routeName !== 'LibraryMode') throw new Error('文件未注册为文本工作面格式')
  const readOptions = readEncoding ? { encoding: readEncoding } : undefined
  const snapshot = await invoke<TextDocumentRangeSnapshot>('read_text_document_range', {
    libraryRoot: store.libraryPath,
    path: tab.path,
    formatId: format.id,
    offset,
    length: 512 * 1024,
    readOptions,
  })
  applyTextRangeSnapshot(tab, snapshot, readEncoding)
  return snapshot
}

const loadNextTextRange = async () => {
  if (!vditor || !activeTextTab.value?.textReadOnlyReason || activeTextTab.value.textRangeEof) return
  const tab = activeTextTab.value
  try {
    const existingContent = tab.content || ''
    const snapshot = await readLargeTextPreview(
      tab,
      tab.textRangeNextOffset || 0,
      tab.textReadEncoding || tab.textEncoding,
    )
    const combined = existingContent + snapshot.content
    tab.content = combined
    suppressEditorInput = true
    vditor.setValue(combined)
    setTimeout(() => {
      suppressEditorInput = false
      vditor?.disabled()
    }, 0)
  } catch (error: any) {
    handleError(error, '继续加载失败', 'loadNextTextRange')
  }
}

const virtualDrag = reactive({ 
  active: false, x: 0, y: 0, startX: 0, startY: 0, 
  dragNode: null as any, dropTarget: null as any, 
  dropPosition: null as 'before' | 'inside' | 'after' | null,
  ghostText: '', timer: null as any, selectedPaths: [] as string[],
  expandTimer: null as any,
  scrollTimer: null as any
})
const fileDragGhost = ref<HTMLElement | null>(null)
const fileDropBusy = ref(false)
const fileDropProblem = ref('')
let externalFileDrag = false
let fileDragOption: TreeOption | null = null
let fileDragPoint = { x: 0, y: 0 }
let fileDragFrame = 0
let fileDragGeneration = 0
let fileDragScrollSpeed = 0
const fileDropHint = computed(() => {
  if (fileDropProblem.value) return fileDropProblem.value
  const target = virtualDrag.dropTarget
  if (!target) return '拖到文件夹内，或在文件间排序'
  if (target === store.libraryPath) return '移入资料库根目录'
  const name = fileNameWithExtension(target)
  return virtualDrag.dropPosition === 'inside' ? `移入「${name}」`
    : `放到「${name}」${virtualDrag.dropPosition === 'before' ? '前' : '后'}`
})
const positionFileDragGhost = () => {
  fileDragGhost.value?.style.setProperty('transform', `translate3d(${fileDragPoint.x + 10}px, ${fileDragPoint.y + 10}px, 0)`)
}
watch(fileDragGhost, positionFileDragGhost, { flush: 'post' })
const clearFileDragTimers = () => {
  for (const key of ['timer', 'expandTimer', 'scrollTimer'] as const) {
    if (virtualDrag[key]) clearTimeout(virtualDrag[key])
    virtualDrag[key] = null
  }
  fileDragScrollSpeed = 0
}
const resetFileDrag = () => {
  ++fileDragGeneration
  clearFileDragTimers()
  cancelAnimationFrame(fileDragFrame)
  fileDragFrame = 0
  fileDragOption = null
  window.removeEventListener('mousemove', onMouseMove, true)
  window.removeEventListener('mouseup', onMouseUp, true)
  window.removeEventListener('blur', cancelFileDrag)
  window.removeEventListener('keydown', cancelFileDragByKey, true)
  virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null; virtualDrag.dropPosition = null; virtualDrag.selectedPaths = []
  fileDropProblem.value = ''
}
const cancelFileDrag = () => { if (virtualDrag.active || virtualDrag.timer) resetFileDrag() }
const cancelFileDragByKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelFileDrag() }
const beginFileDrag = () => {
  if (!fileDragOption || fileDropBusy.value || fileOperationBusy.value) return
  if (virtualDrag.timer) clearTimeout(virtualDrag.timer)
  virtualDrag.timer = null
  preview.focusPath = ''
  hideFilePreview()
  virtualDrag.dragNode = fileDragOption
  virtualDrag.selectedPaths = selectedKeys.value.includes(fileDragOption.key as string)
    ? [...selectedKeys.value] : [fileDragOption.key as string]
  virtualDrag.ghostText = virtualDrag.selectedPaths.length > 1 ? `移动 ${virtualDrag.selectedPaths.length} 个项目` : fileDragOption.label as string
  virtualDrag.active = true
}
const normalizedDragPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const dragPathContains = (parent: string, child: string) => normalizedDragPath(child).startsWith(`${normalizedDragPath(parent)}/`)

const updateDropTarget = (x: number, y: number) => {
  const previousTarget = virtualDrag.dropTarget
  const previousPosition = virtualDrag.dropPosition
  const elements = document.elementsFromPoint(x, y)
  let foundKey = null
  let isViewport = false
  let foundEl: HTMLElement | null = null

  for (const el of elements) {
    if (el.classList.contains('drag-ghost')) continue
    if (el.classList.contains('tree-viewport')) isViewport = true
    
    const node = el.closest('[data-drop-path]') as HTMLElement
    if (node) {
      foundEl = node
      foundKey = node.getAttribute('data-drop-path') as string
      break 
    }
  }

  if (foundKey && foundEl) {
    const rect = foundEl.getBoundingClientRect()
    const relativeY = (y - rect.top) / rect.height
    const isDir = foundEl.getAttribute('data-drop-dir') === 'true'

    // Folder bodies mean "move inside"; files always provide a sorting target.
    // Retain a small boundary band so tiny pointer movements do not flip feedback.
    const previous = previousTarget === foundKey ? previousPosition : null
    if (isDir) {
      const top = previous === 'before' ? .2 : previous === 'inside' ? .1 : .15
      const bottom = previous === 'after' ? .8 : previous === 'inside' ? .9 : .85
      virtualDrag.dropPosition = relativeY < top ? 'before' : relativeY > bottom ? 'after' : 'inside'
    } else {
      const middle = previous === 'before' ? .55 : previous === 'after' ? .45 : .5
      virtualDrag.dropPosition = relativeY < middle ? 'before' : 'after'
    }

    // 文件夹自动展开逻辑优化：只有当目标 Key 变化或不再是 inside 时才重置计时器
    if (isDir && virtualDrag.dropPosition === 'inside' && !expandedKeys.value.includes(foundKey)) {
      if (previousTarget !== foundKey || previousPosition !== 'inside') {
        if (virtualDrag.expandTimer) clearTimeout(virtualDrag.expandTimer)
        const generation = fileDragGeneration
        virtualDrag.expandTimer = setTimeout(async () => {
          virtualDrag.expandTimer = null
          if ((!virtualDrag.active && !externalFileDrag) || fileDropProblem.value || generation !== fileDragGeneration || virtualDrag.dropTarget !== foundKey || virtualDrag.dropPosition !== 'inside') return
          const option = findTreeOptionByKey(treeData.value, foundKey!)
          if (option && option.children === undefined) await handleLoadChildren(option)
          if ((virtualDrag.active || externalFileDrag) && generation === fileDragGeneration && virtualDrag.dropTarget === foundKey && virtualDrag.dropPosition === 'inside') {
            expandedKeys.value = [...new Set([...expandedKeys.value, foundKey!])]
          }
        }, 600)
      }
    } else {
      if (virtualDrag.expandTimer) {
        clearTimeout(virtualDrag.expandTimer)
        virtualDrag.expandTimer = null
      }
    }

    virtualDrag.dropTarget = foundKey
  } else if (isViewport) {
    virtualDrag.dropTarget = store.libraryPath
    virtualDrag.dropPosition = 'inside'
    if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  } else {
    virtualDrag.dropTarget = null
    virtualDrag.dropPosition = null
    if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  }
  const target = virtualDrag.dropTarget
  fileDropProblem.value = virtualDrag.active && target && virtualDrag.selectedPaths.some(source => normalizedDragPath(source) === normalizedDragPath(target) || dragPathContains(source, target))
    ? '不能放到自身或子文件夹中' : ''
}

const onMouseUp = async (event: MouseEvent) => {
  window.setTimeout(() => { filePointerSelecting.value = false }, 0)
  if (!virtualDrag.active) { resetFileDrag(); return }
  updateDropTarget(event.clientX, event.clientY)
  const blocked = Boolean(fileDropProblem.value)
  const suppressClick = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation() }
  window.addEventListener('click', suppressClick, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', suppressClick, true), 0)
  
  if (virtualDrag.active) {
    const targetPath = virtualDrag.dropTarget
    const selected: string[] = virtualDrag.selectedPaths.length > 0 ? virtualDrag.selectedPaths : (virtualDrag.dragNode ? [virtualDrag.dragNode.key] : [])
    const sourcePaths = selected.filter(path => !selected.some(parent => parent !== path && dragPathContains(parent, path)))
    const position = virtualDrag.dropPosition
    resetFileDrag()
    if (blocked || fileDropBusy.value) return

    if (sourcePaths.length > 0 && targetPath) {
      // 保护：如果目标在源路径中且是前后排序，视为原地操作
      if (sourcePaths.includes(targetPath) && (position === 'before' || position === 'after')) {
        return
      }

      let moveMessage: ReturnType<typeof message.loading> | undefined
      const finishRelocation = beginWindowSave('relocation')
      try {
        fileDropBusy.value = true
        moveMessage = message.loading(`正在移动...`, { duration: 0 })
        
        // 识别目标目录和目标参考项
        let finalTargetDir = targetPath
        let referenceItem = null
        
        if (position === 'before' || position === 'after') {
          const lastIdx = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'))
          finalTargetDir = lastIdx !== -1 ? targetPath.substring(0, lastIdx) : store.libraryPath
          referenceItem = targetPath.split(/[\\/]/).pop() || ''
        }

        // 1. 物理移动逻辑
        const moveTasks = sourcePaths.filter(p => {
          const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
          const parent = idx !== -1 ? p.substring(0, idx) : store.libraryPath
          return parent !== finalTargetDir
        })

        let moved: FileOperationResult['items'] = []
        if (moveTasks.length > 0) {
          const result = await invoke<FileOperationResult>('move_items', { libraryRoot: store.libraryPath, sourcePaths: moveTasks, targetDir: finalTargetDir })
          moved = result.items
          if (result.items.length) { await applyFileOperation(result, 'move'); lastLibraryMove.value = { root: store.libraryPath, items: result.items } }
          if (result.errors.length) { fileOperations.value?.showMoveOutcome(result); return }
        }

        // 2. 逻辑排序逻辑 (Misty Order)
        // 获取目标文件夹的当前顺序
        const order = await invoke<any>('get_folder_order', { libraryRoot: store.libraryPath, path: finalTargetDir })
        let currentItems = (await invoke<FileEntry[]>('scan_directory', { libraryRoot: store.libraryPath, path: finalTargetDir }))
          .filter(entry => !isLibraryMetadata(entry.name))
          .map(e => e.name)
        
        // 移除正在移动的项
        const movingNames = sourcePaths.map(path => fileNameWithExtension(moved.find(item => sameLibrary(item.oldPath, path))?.newPath || path))
        currentItems = currentItems.filter(name => !movingNames.includes(name))

        // 插入到新位置
        if (position === 'inside') {
          currentItems.push(...movingNames)
        } else {
          let refIdx = currentItems.indexOf(referenceItem!)
          if (refIdx === -1) {
            // 如果没找到参考项（例如参考项就在移动列表中且未被原地保护拦截），则追加到末尾
            currentItems.push(...movingNames)
          } else {
            if (position === 'before') {
              currentItems.splice(refIdx, 0, ...movingNames)
            } else {
              currentItems.splice(refIdx + 1, 0, ...movingNames)
            }
          }
        }

        // 保存新顺序
        await invoke('save_folder_order', { 
          libraryRoot: store.libraryPath,
          path: finalTargetDir, 
          order: { items: currentItems, pinned: order.pinned || [] } 
        })

        // 3. 界面刷新
        const parentsToRefresh = new Set<string>()
        parentsToRefresh.add(finalTargetDir)
        sourcePaths.forEach(p => {
          const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
          parentsToRefresh.add(idx !== -1 ? p.substring(0, idx) : store.libraryPath)
        })
        for (const p of parentsToRefresh) await refreshNode(p)

        await requestLibraryTreeReveal(finalTargetDir, true)
        const separator = finalTargetDir.includes('\\') ? '\\' : '/'
        selectedKeys.value = sourcePaths.map(path => moved.find(item => sameLibrary(item.oldPath, path))?.newPath || `${finalTargetDir}${separator}${fileNameWithExtension(path)}`)
        await nextTick()
        treeInstRef.value?.scrollTo({ key: selectedKeys.value[0], behavior: 'auto' })
        const targetLabel = finalTargetDir === store.libraryPath ? '资料库根目录' : fileNameWithExtension(finalTargetDir)
        message.success(moveTasks.length ? `已移入「${targetLabel}」` : '已调整排列顺序')
      } catch (err: any) {
        message.error('操作失败: ' + err)
      } finally {
        moveMessage?.destroy()
        fileDropBusy.value = false
        finishRelocation()
      }
    }
  }
}

const onMouseMove = (e: MouseEvent) => {
  if (!virtualDrag.active && !virtualDrag.timer) return
  fileDragPoint = { x: e.clientX, y: e.clientY }
  if (!virtualDrag.active && Math.hypot(e.clientX - virtualDrag.startX, e.clientY - virtualDrag.startY) >= 6) beginFileDrag()
  if (virtualDrag.active) e.preventDefault()
  if (virtualDrag.active && !fileDragFrame) {
    fileDragFrame = requestAnimationFrame(() => {
      fileDragFrame = 0
      if (!virtualDrag.active) return
      positionFileDragGhost()
      updateDropTarget(fileDragPoint.x, fileDragPoint.y)
    })

    // 边缘自动滚动逻辑
    const viewport = document.querySelector('.tree-viewport')
    if (viewport) {
      const rect = viewport.getBoundingClientRect()
      const threshold = 40 // 感应区高度
      let scrollSpeed = 0

      if (e.clientX < rect.left || e.clientX > rect.right) {
        scrollSpeed = 0
      } else if (e.clientY < rect.top + threshold) {
        scrollSpeed = -10 // 向上滚动
      } else if (e.clientY > rect.bottom - threshold) {
        scrollSpeed = 10 // 向下滚动
      }

      if (scrollSpeed !== 0) {
        fileDragScrollSpeed = scrollSpeed
        if (!virtualDrag.scrollTimer) {
          virtualDrag.scrollTimer = setInterval(() => {
            viewport.scrollTop += fileDragScrollSpeed
            updateDropTarget(fileDragPoint.x, fileDragPoint.y)
          }, 20)
        }
      } else {
        if (virtualDrag.scrollTimer) {
          clearInterval(virtualDrag.scrollTimer)
          virtualDrag.scrollTimer = null
        }
      }
    }
  }
}

const deleteAction = async (paths: string[]) => {
  if (paths.length === 0) return;
  const isMultiple = paths.length > 1
  const displayTitle = isMultiple ? `选中的 ${paths.length} 个项目` : fileDisplayName(paths[0])
  dialog.warning({
    title: '删除确认',
    content: `确认要物理删除 ${displayTitle} 吗？此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await invoke('delete_items', { libraryRoot: store.libraryPath, paths })
        try { await store.removeFileDisplayStyles(paths) }
        catch (error) { console.warn('Failed to clean file display styles', error) }
        paths.forEach(p => { if (activeTabId.value === p || store.tabs.some(t => t.id === p)) store.removeTab(p) })
        const parentsToRefresh = new Set<string>()
        paths.forEach(p => { const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); parentsToRefresh.add(idx !== -1 ? p.substring(0, idx) : store.libraryPath) })
        for (const p of parentsToRefresh) await refreshNode(p)
        selectedKeys.value = []; message.success('已物理删除')
      } catch (e: any) {
        handleError(e, '删除失败', 'deleteAction')
      }
    }
  })
}

const hideFilePreview = () => {
  if (preview.timer) clearTimeout(preview.timer)
  preview.timer = null
  preview.show = false
}
const scheduleFilePreview = (option: TreeOption, x: number, y: number, delay: number) => {
  if (!option.isLeaf || virtualDrag.active || virtualDrag.timer || fileDropBusy.value) return
  hideFilePreview()
  preview.timer = setTimeout(() => {
    if (virtualDrag.active || virtualDrag.timer || fileDropBusy.value) return
    preview.show = true
    preview.title = option.label as string
    preview.path = option.key as string
    preview.x = x
    preview.y = y
    preview.timer = null
  }, delay)
}
const findTreeOptionByKey = (nodes: TreeOption[], key: string): TreeOption | null => {
  for (const node of nodes) {
    if (typeof node.key === 'string' && sameWorkspacePath(node.key, key)) return node
    const nested = node.children ? findTreeOptionByKey(node.children, key) : null
    if (nested) return nested
  }
  return null
}
const schedulePendingTreePreview = () => {
  requestAnimationFrame(() => {
    const tree = document.querySelector<HTMLElement>('.library-file-tree')
    if (!tree || !tree.contains(document.activeElement)) return
    const pending = tree.querySelector<HTMLElement>('.n-tree-node--pending[data-drop-path]')
    const key = pending?.dataset.dropPath || ''
    const option = key ? findTreeOptionByKey(treeData.value, key) : null
    if (!pending || !option?.isLeaf) {
      preview.focusPath = ''
      hideFilePreview()
      return
    }
    preview.focusPath = key
    const rect = pending.getBoundingClientRect()
    scheduleFilePreview(option, rect.right, rect.top, 80)
  })
}
const handleTreeKeyboardFocus = () => schedulePendingTreePreview()
const handleTreeKeyboardBlur = () => {
  preview.focusPath = ''
  hideFilePreview()
}
const handleTreeKeyboardNavigation = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    preview.focusPath = ''
    hideFilePreview()
    return
  }
  if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) schedulePendingTreePreview()
}

const CREATE_FORMAT_GROUPS = [
  { label: '文档', ids: ['markdown', 'plain-text'], icon: FileIcon },
  { label: '数据', ids: ['json', 'jsonc', 'yaml', 'xml', 'toml', 'table'], icon: DatabaseIcon },
  { label: '图表与画布', ids: ['canvas', 'drawio', 'diagram', 'opml', 'svg'], icon: DashboardIcon },
  { label: '代码与配置', ids: ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell', 'sql', 'web-source', 'env', 'ini', 'properties', 'editorconfig', 'gitignore'], icon: SettingsIcon },
] as const
const CREATE_CODE_SUBGROUPS = [
  { label: '编程语言', ids: ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell'] },
  { label: 'Web 与查询', ids: ['web-source', 'sql'] },
  { label: '配置文件', ids: ['env', 'ini', 'properties', 'editorconfig', 'gitignore'] },
] as const
const createFormatMenuOption = (format: (typeof CREATABLE_FILE_FORMATS)[number]) => {
  const variants = format.creation?.variants ?? []
  if (variants.length <= 1) return {
    label: `${format.label}（${format.creation?.defaultExtension}）`,
    key: `create-format:${format.id}`,
  }
  return {
    label: format.label,
    key: `create-format-family:${format.id}`,
    children: variants.map(variant => ({
      label: `${variant.label}（${variant.extension}）`,
      key: `create-format:${format.id}:${variant.extension}`,
    })),
  }
}
const buildCreateMenuOptions = () => {
  const registered = new Map(CREATABLE_FILE_FORMATS.map(format => [format.id, format]))
  const optionsForIds = (ids: readonly string[]) => ids
    .map(id => registered.get(id))
    .filter((format): format is NonNullable<typeof format> => Boolean(format))
    .map(createFormatMenuOption)
  const formatGroups = CREATE_FORMAT_GROUPS.map(group => ({
    label: group.label,
    key: `create-group:${group.label}`,
    icon: () => h(NIcon, null, { default: () => h(group.icon) }),
    children: group.label === '代码与配置'
      ? CREATE_CODE_SUBGROUPS.map(subgroup => ({
        label: subgroup.label,
        key: `create-subgroup:${subgroup.label}`,
        children: optionsForIds(subgroup.ids),
      })).filter(subgroup => subgroup.children.length > 0)
      : optionsForIds(group.ids),
  })).filter(group => group.children.length > 0)
  return [{
    label: '新建',
    key: 'create-menu',
    icon: () => h(NIcon, null, { default: () => h(PlusIcon) }),
    children: [
      { label: '文件夹', key: 'create-folder', icon: () => h(NIcon, null, { default: () => h(FolderPlusIcon) }) },
      { type: 'divider', key: 'create-divider' },
      ...formatGroups,
    ],
  }]
}
const openRootContextMenu = (event: MouseEvent) => {
  if ((event.target as HTMLElement | null)?.closest('.n-tree-node')) return
  event.preventDefault()
  preview.focusPath = ''
  hideFilePreview()
  contextMenu.show = false
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.targetPath = store.libraryPath
  contextMenu.isDir = true
  contextMenu.atRoot = true
  contextMenu.options = [...buildCreateMenuOptions(), { type: 'divider', key: 'file-root-divider' }, ...destinationMenuOptions()]
  contextMenu.show = true
}
const nodeProps = ({ option }: { option: TreeOption }) => {
  const rootKey = fileStylePathKey(store.libraryPath).replace(/\/$/, '')
  const nodeKey = fileStylePathKey(option.key as string)
  const depth = nodeKey.startsWith(`${rootKey}/`) ? Math.max(0, nodeKey.slice(rootKey.length + 1).split('/').length - 1) : 0
  const marker = option.isLeaf ? store.fileDisplayStyleForPath(option.key as string) : undefined
  const colors = marker ? fileMarkerColors(marker) : undefined
  return ({
  'data-key': option.key,
  'data-drop-path': option.key,
  'data-drop-dir': !option.isLeaf ? 'true' : 'false',
  'data-tree-depth': depth,
  'aria-describedby': option.isLeaf ? 'file-tree-detail-preview' : undefined,
  class: [
    marker ? `has-file-display-style selection-${marker.selectionStyle || 'fill'}` : '',
    virtualDrag.active && virtualDrag.selectedPaths.includes(option.key as string) ? 'is-drag-source' : '',
    !fileDropProblem.value && virtualDrag.dropTarget === option.key ? 'drop-active' : '',
    !fileDropProblem.value && virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'before' ? 'is-drop-before' : '',
    !fileDropProblem.value && virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'after' ? 'is-drop-after' : '',
    !fileDropProblem.value && virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'inside' ? 'is-drop-inside' : '',
  ].join(' '),
  style: colors ? {
    '--file-marker-bg': colors.background,
    '--file-marker-text': colors.text,
    '--file-marker-accent': markerTextColor(marker) || 'var(--theme-primary)',
    '--file-marker-selected-bg': colors.selectedBackground,
    '--file-marker-selected-text': colors.selectedText,
    '--file-marker-selected-accent': colors.selectedAccent,
  } : undefined,
  onMousedown: (e: MouseEvent) => { 
    if (e.button !== 0 || fileDropBusy.value || fileOperationBusy.value || (e.target as Element).closest('.n-tree-node-switcher')) return;
    filePointerSelecting.value = true
    filePointerSelection.value = [...selectedKeys.value]
    resetFileDrag()
    preview.focusPath = ''; hideFilePreview()
    fileDragOption = option
    fileDragPoint = { x: e.clientX, y: e.clientY }
    virtualDrag.startX = e.clientX; virtualDrag.startY = e.clientY; 
    virtualDrag.x = e.clientX + 10; virtualDrag.y = e.clientY + 10
    if (virtualDrag.timer) clearTimeout(virtualDrag.timer); 
    virtualDrag.timer = setTimeout(beginFileDrag, 350)
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('blur', cancelFileDrag)
    window.addEventListener('keydown', cancelFileDragByKey, true)
  },
  onClick: async (event: MouseEvent) => {
    if ((event.target as Element).closest('.n-tree-node-switcher') || fileOperationBusy.value || fileDropBusy.value) return
    const key = option.key as string
    if (event.shiftKey && fileSelectionAnchor.value) {
      const visible: string[] = []
      const flatten = (nodes: TreeOption[]) => { for (const node of nodes) { visible.push(node.key as string); if (node.children && expandedKeys.value.includes(node.key as string)) flatten(node.children) } }
      flatten(treeData.value)
      const start = visible.indexOf(fileSelectionAnchor.value), end = visible.indexOf(key)
      if (start >= 0 && end >= 0) { const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1); selectedKeys.value = event.ctrlKey || event.metaKey ? [...new Set([...filePointerSelection.value, ...range])] : range; return }
    }
    if (event.ctrlKey || event.metaKey) {
      selectedKeys.value = filePointerSelection.value.includes(key) ? filePointerSelection.value.filter(path => path !== key) : [...filePointerSelection.value, key]
      fileSelectionAnchor.value = key
      return
    }
    fileSelectionAnchor.value = key
    handleNodeSelect([key])
  },
  onMouseenter: (e: MouseEvent) => {
    if (!option.isLeaf || virtualDrag.active || virtualDrag.timer || fileDropBusy.value) return
    scheduleFilePreview(option, e.clientX, e.clientY, 600)
  },
  onMouseleave: () => {
    if (preview.focusPath !== option.key) hideFilePreview()
  },
  onContextmenu: (e: MouseEvent) => {
    if (virtualDrag.active) return; e.preventDefault(); e.stopPropagation(); contextMenu.show = false;
    preview.focusPath = ''; hideFilePreview()
    setTimeout(() => {
      contextMenu.x = e.clientX; contextMenu.y = e.clientY; contextMenu.targetPath = option.key as string; contextMenu.isDir = !option.isLeaf; contextMenu.atRoot = false;
      const targets = contextPaths()
      const isMulti = targets.length > 1
      if (!selectedKeys.value.includes(contextMenu.targetPath)) selectedKeys.value = targets
      const isStarred = !contextMenu.isDir && store.isStarred(contextMenu.targetPath)
      const items = [
        ...(!isMulti && contextMenu.isDir ? buildCreateMenuOptions() : []),
        { label: '移动到…', key: 'file-move', disabled: fileOperationBusy.value, icon: fileMenuIcon(MoveFileIcon) },
        { label: '复制到…', key: 'file-copy-to', disabled: fileOperationBusy.value, icon: fileMenuIcon(CopyFileIcon) },
        { label: isMulti ? `创建 ${targets.length} 项的副本` : '创建副本', key: 'file-duplicate', disabled: fileOperationBusy.value, icon: fileMenuIcon(CopyFileIcon) },
        { type: 'divider', key: 'file-clipboard-divider' },
        { label: '剪切 (Ctrl+X)', key: 'file-cut', disabled: fileOperationBusy.value, icon: fileMenuIcon(CutFileIcon) },
        { label: '复制 (Ctrl+C)', key: 'file-copy', disabled: fileOperationBusy.value, icon: fileMenuIcon(CopyFileIcon) },
        destinationMenuOptions()[0],
        { type: 'divider', key: 'file-existing-divider' },
        !isMulti ? { label: '打开所在文件夹', key: 'open-folder', icon: () => h(NIcon, null, { default: () => h(FolderOpenIcon) }) } : null,
        !contextMenu.isDir && !isMulti ? { label: isStarred ? '取消收藏' : '收藏文件', key: 'star', icon: () => h(NIcon, { color: isStarred ? '#f5a623' : undefined }, { default: () => h(StarIcon) }) } : null,
        { label: isMulti ? '批量重命名…' : '重命名 (F2)', key: 'rename', disabled: fileOperationBusy.value, icon: () => h(NIcon, null, { default: () => h(EditIcon) }) },
        { label: isMulti ? `移到回收站（${targets.length} 项）` : '移到回收站 (Del)', key: 'file-recycle', disabled: fileOperationBusy.value, icon: fileMenuIcon(TrashIcon) },
        { label: '更多操作', key: 'file-more', children: [
          ...destinationMenuOptions().slice(1),
          ...(!contextMenu.isDir && !isMulti ? [
            { label: '编辑显示样式', key: 'edit-display-style', icon: fileMenuIcon(PaletteIcon) },
            { label: '使用外部应用打开', key: 'external-open-menu', icon: fileMenuIcon(ExternalOpenIcon), children: buildExternalOpenOptions(contextMenu.targetPath) },
          ] : []),
          { type: 'divider', key: 'file-permanent-divider' },
          { label: isMulti ? `永久删除所选 ${targets.length} 项` : '永久删除…', key: 'delete', disabled: fileOperationBusy.value, icon: fileMenuIcon(TrashIcon) },
        ] }
      ].filter(Boolean);
      contextMenu.options = items; contextMenu.show = true
    }, 50)
  }
})
}

const onMenuAction = async (key: string) => {
  contextMenu.show = false; const path = contextMenu.targetPath
  const selection = contextPaths()
  const directory = contextMenu.isDir ? path : fileParent(path)
  if (key === 'file-move' || key === 'file-copy-to') { fileOperations.value?.openTransfer(selection, key === 'file-move' ? 'move' : 'copy', directory); return }
  if (key === 'file-duplicate') { await fileOperations.value?.duplicate(selection); return }
  if (key === 'file-cut' || key === 'file-copy') {
    libraryFileClipboard.value = { root: store.libraryPath, paths: selection, operation: key === 'file-cut' ? 'move' : 'copy' }
    message.info(`${selection.length} 项已${key === 'file-cut' ? '剪切' : '复制'}，到目标文件夹粘贴`); return
  }
  if (key === 'file-paste') { const clipboard = libraryFileClipboard.value; if (clipboard && clipboardAvailable.value) fileOperations.value?.openTransfer(clipboard.paths, clipboard.operation, directory); return }
  if (key === 'file-undo-move') { await fileOperations.value?.undoMove(); return }
  if (key === 'file-trash') { fileOperations.value?.openTrash(); return }
  if (key === 'file-move-review') { fileOperations.value?.openRecovery(); return }
  if (key === 'file-recycle') { await fileOperations.value?.recycle(selection); return }
  if (key.startsWith('create-format:')) {
    const [formatId, extension] = key.slice('create-format:'.length).split(':')
    try {
      const template = formatId === 'markdown' ? defaultNoteTemplate.value : undefined
      const created = template && template.id !== BLANK_NOTE_TEMPLATE ? await createNoteFromTemplate(template, path) : await createRegisteredFile(formatId, path, undefined, undefined, extension)
      await refreshNode(path)
      await requestLibraryTreeReveal(path, true)
      handleNodeSelect([created])
    } catch (error: any) {
      handleError(error, '创建失败', 'contextCreateFormat')
    }
  } else if (key === 'create-folder') {
    try {
      await invoke('create_new_folder', { libraryRoot: store.libraryPath, parentPath: path })
      await refreshNode(path)
      await requestLibraryTreeReveal(path, true)
    } catch (error: any) {
      handleError(error, '创建文件夹失败', 'contextCreateFolder')
    }
  } else if (key.startsWith('external-open:')) {
    await openFileExternally(path, key.slice('external-open:'.length))
  } else if (key === 'open-folder') {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      await revealItemInDir(path)
    } catch (error) {
      handleError(error, '无法在文件资源管理器中显示，请检查路径是否仍然存在', 'revealItemInDir')
    }
  } else if (key === 'star') { store.toggleStar(path); message.info(store.isStarred(path) ? '已收藏' : '已取消收藏') }
  else if (key === 'edit-display-style') { openFileStyleEditor(path) }
  else if (key === 'rename') { if (selection.length > 1) fileOperations.value?.openRename(selection); else openRename(path, contextMenu.isDir) }
  else if (key === 'delete') {
    const targets = selectedKeys.value.includes(path) ? selectedKeys.value : [path]
    await deleteAction(targets)
  }
}

const templateManager = ref<{ initialNote?: { name: string; content: string } } | null>(null)
const saveCurrentAsTemplate = () => {
  if (!activeIsMarkdown.value || !activeTabId.value || !vditor || !isVditorReady || lastLoadedPath !== activeTabId.value) {
    message.info('请等笔记加载完成后再保存模板'); return
  }
  const sourceName = activeTabId.value.split(/[\\/]/).pop()?.replace(/\.md$/i, '') || '新模板'
  let name = sourceName, index = 1
  while (store.allNoteTemplates.some(item => item.name === name)) name = sourceName + ' ' + index++
  templateManager.value = { initialNote: { name, content: vditor.getValue() } }
}
const defaultNoteTemplate = computed(() => store.allNoteTemplates.find(item => item.id === store.defaultNoteTemplates[store.libraryPath]))

const creationTargetLabel = computed(() => {
  const target = selectedTargetDirectory()
  return sameWorkspacePath(target, store.libraryPath)
    ? store.currentLibraryName
    : target.replace(/[\\/]$/, '').split(/[\\/]/).pop() || store.currentLibraryName
})
const templateOptions = computed<DropdownOption[]>(() => {
  const selected = selectedKeys.value[selectedKeys.value.length - 1]
  const node = selected ? findTreeOptionByKey(treeData.value, selected) : undefined
  const format = selected && node?.isLeaf !== false ? findFileFormat(selected) : undefined
  const suggested = format?.id !== 'markdown' && format?.creation && format.adapters.creator
    ? [{ label: `新建${format.label}`, key: `__format:${format.id}` }]
    : []
  return [
    { type: 'group', label: `在「${creationTargetLabel.value}」中新建`, key: 'creation-location', children: [
      ...suggested,
      { label: defaultNoteTemplate.value ? 'Markdown 笔记 · ' + defaultNoteTemplate.value.name : 'Markdown 笔记', key: '__default-note', icon: () => h(NIcon, null, { default: () => h(FileIcon) }) },
      { label: '文件夹', key: '__folder', icon: () => h(NIcon, null, { default: () => h(FolderPlusIcon) }) },
      { label: selected ? '今日笔记' : '今日笔记（Daily）', key: '__daily', icon: () => h(NIcon, null, { default: () => h(CalendarIcon) }) },
    ] },
    { type: 'divider', key: 'template-divider' },
    { label: '笔记模板', key: 'note-templates', children: [
      ...store.allNoteTemplates.map(item => ({ label: item.name, key: '__template:' + item.id })),
      { type: 'divider', key: 'manage-template-divider' },
      { label: '管理模板…', key: '__manage-templates' },
    ] },
    { label: '其他格式', key: 'other-formats', children: CREATABLE_FILE_FORMATS.filter(item => item.id !== 'markdown' && (!suggested.length || item.id !== format?.id)).map(item => ({ label: `新建${item.label}`, key: `__format:${item.id}` })) },
  ]
})

const templateMenuProps = () => ({
  class: 'library-create-dropdown-menu',
  style: 'max-height: min(520px, calc(100vh - 24px)); min-width: 188px;',
})

const selectedTargetDirectory = () => {
  if (!selectedKeys.value.length) return store.libraryPath
  const selected = selectedKeys.value[selectedKeys.value.length - 1]
  const node = findTreeOptionByKey(treeData.value, selected)
  if (node ? !node.isLeaf : !findFileFormat(selected)) return selected
  return selected.substring(0, Math.max(selected.lastIndexOf('\\'), selected.lastIndexOf('/')))
}

const createRegisteredFile = async (formatId: string, target: string, prefix?: string, content?: string, extension?: string) => {
  const format = findFileFormatById(formatId)
  if (!format?.creation || !format.adapters.creator) throw new Error(`格式 ${formatId} 不支持创建`)
  if (format.adapters.creator === 'table') {
    return invoke<string>('create_table_file', { libraryRoot: store.libraryPath, targetDir: target, prefix })
  }
  return invoke<string>('create_format_file', {
    libraryRoot: store.libraryPath,
    targetDir: target,
    formatId,
    prefix,
    content,
    extension,
  })
}

const handleTemplateCreate = async (key: string) => {
  if (!store.libraryPath) { openSettings(); return }
  if (key === '__manage-templates') { templateManager.value = {}; return }
  if (key === '__folder') { await handleToolbarAction('folder'); return }
  if (key === '__daily') { await createDailyNote(); return }
  try {
    const formatId = key.startsWith('__format:') ? key.slice('__format:'.length) : 'markdown'
    const target = selectedTargetDirectory()
    const template = key === '__default-note' ? defaultNoteTemplate.value
      : store.allNoteTemplates.find(item => key === '__template:' + item.id || key === item.name)
    if (key.startsWith('__template:') && !template) throw new Error('模板已不存在，请重新选择')
    const p = template && template.id !== BLANK_NOTE_TEMPLATE
      ? await createNoteFromTemplate(template, target)
      : await createRegisteredFile(formatId, target)
    await refreshNode(target)
    handleNodeSelect([p])
  } catch (e: any) {
    handleError(e, '创建失败', 'handleTemplateCreate')
  }
}

const createNoteFromTemplate = (template: NoteTemplate, target: string) => invoke<string>('create_note_from_template', {
  libraryRoot: store.libraryPath, targetDir: target, name: template.name, content: template.content,
})

const handleToolbarAction = async (type: 'file' | 'folder') => {
  if (!store.libraryPath) { openSettings(); return }
  const target = selectedTargetDirectory()
  try { if (type === 'file') { const template = defaultNoteTemplate.value; const p = template && template.id !== BLANK_NOTE_TEMPLATE ? await createNoteFromTemplate(template, target) : await createRegisteredFile('markdown', target); await refreshNode(target); handleNodeSelect([p]) } else { await invoke('create_new_folder', { libraryRoot: store.libraryPath, parentPath: target }); await refreshNode(target) } } catch (e: any) { handleError(e, '操作失败', 'handleToolbarAction') }
}

const createDailyNote = async () => {
  if (!store.libraryPath) { openSettings(); return }
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dailyDir = selectedKeys.value.length ? selectedTargetDirectory() : store.libraryPath.replace(/[\\/]$/, '') + '/Daily'
  try {
    const p = await createRegisteredFile('markdown', dailyDir, dateStr)
    await refreshNode(dailyDir)
    handleNodeSelect([p])
  } catch (e) { message.error('创建今日笔记失败') }
}

const replaceRenamedPath = (value: string, oldPath: string, newPath: string) => {
  return movedPath(value, { root: store.libraryPath, oldPath, newPath, documents: [] })
}

const syncRenamedWorkspaceReferences = async (oldPath: string, newPath: string) => {
  for (const tab of allTabs.value) {
    const nextPath = replaceRenamedPath(tab.path, oldPath, newPath)
    if (nextPath === tab.path) continue
    tab.id = nextPath
    tab.path = nextPath
    if (tab.path === newPath) tab.title = fileDisplayName(newPath) || tab.title
  }
  activeTabId.value = activeTabId.value ? replaceRenamedPath(activeTabId.value, oldPath, newPath) : null
  selectedKeys.value = selectedKeys.value.map(value => replaceRenamedPath(value, oldPath, newPath))
  expandedKeys.value = expandedKeys.value.map(value => replaceRenamedPath(value, oldPath, newPath))
  store.starredFiles = store.starredFiles.map(value => replaceRenamedPath(value, oldPath, newPath))
  store.recentFiles = store.recentFiles.map(item => {
    const nextPath = replaceRenamedPath(item.path, oldPath, newPath)
    return nextPath === item.path ? item : { ...item, path: nextPath, title: fileDisplayName(nextPath) || item.title }
  })
  store.saveTabsState()
  const routePath = typeof route.query.path === 'string' ? route.query.path : ''
  const nextRoutePath = routePath ? replaceRenamedPath(routePath, oldPath, newPath) : ''
  if (nextRoutePath && nextRoutePath !== routePath) await openManagedFile(router, nextRoutePath, {}, 'replace')
}

const refreshAfterFileMove = (event: Event) => {
  const { notice, pending } = (event as CustomEvent<{ notice: FileMoveNotice; pending: Promise<unknown>[] }>).detail
  if (!sameLibrary(notice.root, store.libraryPath)) return
  pending.push((async () => {
    selectedKeys.value = selectedKeys.value.map(path => replaceRenamedPath(path, notice.oldPath, notice.newPath))
    expandedKeys.value = expandedKeys.value.map(path => replaceRenamedPath(path, notice.oldPath, notice.newPath))
    const tab = tabs.value.find(item => item.id === activeTabId.value)
    if (tab && !tab.isDirty && activeIsMarkdown.value && notice.documents.some(path => sameLibrary(path, tab.path))) {
      const scroller = document.querySelector('.editor-main .vditor-wysiwyg > .vditor-reset') as HTMLElement | null
      const top = scroller?.scrollTop
      await loadFileToEditor(tab.path, true)
      if (scroller && top !== undefined) scroller.scrollTop = top
    }
    await refreshLibrary()
    announceFileRelationsChanged(store.libraryPath)
  })())
}

const executeRename = async () => {
  const oldPath = renameState.oldPath
  const parentPath = oldPath.substring(0, Math.max(oldPath.lastIndexOf('\\'), oldPath.lastIndexOf('/'))) || store.libraryPath
  try {
    const newPath = await invoke<string>('rename_item', {
      libraryRoot: store.libraryPath,
      oldPath,
      newName: renameState.newName,
    })
    try { await store.moveFileDisplayStyles(oldPath, newPath) }
    catch (error) { message.warning(`文件已重命名，样式已保留，但设置暂未保存：${String(error)}`) }
    await syncRenamedWorkspaceReferences(oldPath, newPath)
    await refreshNode(parentPath)
    renameState.show = false
    message.success(`已重命名为 ${renameState.newName}`)
  } catch (error: any) {
    const detail = typeof error === 'string' ? error : error?.message
    message.error(detail || '重命名失败，请检查名称后重试')
  }
}

const applyRename = () => {
  if (!renameValidation.value.valid) {
    message.warning(renameValidation.value.message)
    return false
  }
  if (renameExtensionChange.value.changed) {
    if (!renameState.confirmExtension) {
      renameState.confirmExtension = true
      return false
    }
    void executeRename()
    return false
  }
  void executeRename()
  return false
}

const currentFileReloadBusy = ref(false)
const refreshCurrentFile = async () => {
  const path = activeTabId.value, libraryRoot = store.libraryPath, editor = vditor
  const tab = tabs.value.find(t => t.id === path)
  if (!path || !tab || !editor || !isVditorReady || currentFileReloadBusy.value || hasPendingMainTextSave(path)) return
  if (!tab.textReadOnlyReason && tab.content !== undefined && tab.content !== editor.getValue()) {
    tab.content = editor.getValue(); tab.isDirty = true
  }
  const draft = tab.content
  const run = async () => {
    if (path !== activeTabId.value || libraryRoot !== store.libraryPath || editor !== vditor || !tabs.value.includes(tab)
      || draft !== tab.content || (draft !== undefined && !tab.textReadOnlyReason && editor.getValue() !== draft)) {
      message.warning('文档或内容已变化，请重新发起读取。')
      return
    }
    if (currentFileReloadBusy.value || hasPendingMainTextSave(path)) return
    currentFileReloadBusy.value = true
    try {
      if (await loadFileToEditor(path, true)) message.success('已同步磁盘最新内容')
    } finally { currentFileReloadBusy.value = false }
  }
  if (tab.isDirty) {
    dialog.warning({
      title: '重新读取会覆盖未保存内容', content: '继续后将使用磁盘内容替换当前修改。读取失败时会保留当前内容。',
      positiveText: '继续重读', negativeText: '取消', onPositiveClick: run,
    })
  } else await run()
}

const keepExternalChange = () => { externalChange.show = false; externalConflictOwner.value = null }

const checkActiveTextIdentity = async () => {
  if (externalCheckInFlight || externalChange.show || !activeTabId.value) return
  const path = activeTabId.value
  const tab = tabs.value.find(item => item.path === path)
  const format = tab ? findFileFormat(tab.path) : undefined
  if (!tab?.textSignature || !format || format.routeName !== 'LibraryMode') return
  const baselineDigest = tab.textContentDigest || contentDigestFromSignature(tab.textSignature)
  if (!baselineDigest) return
  externalCheckInFlight = true
  try {
    const identity = await invoke<TextDocumentIdentity>('get_text_document_identity', {
      libraryRoot: store.libraryPath,
      path,
      formatId: format.id,
    })
    if (activeTabId.value !== path) return
    if (identity.contentDigest === baselineDigest) {
      tab.textSignature = identity.signature
      tab.textContentDigest = identity.contentDigest
      tab.textSize = identity.size
      lastPromptedExternalSignature = ''
      return
    }
    if (identity.signature === lastPromptedExternalSignature) return
    lastPromptedExternalSignature = identity.signature
    openTextConflict(path)
  } catch (error: any) {
    if (error?.code !== 'identity-too-large') console.warn('External text identity check failed:', error)
  } finally {
    externalCheckInFlight = false
  }
}

type TextSaveOptions = { savePolicy?: TextSavePolicy; successMessage?: string }

watch(() => tabs.value.map(tab => [tab.id, tab.content]), recordWindowDraftActivity, { flush: 'sync' })

const normalizeTextSaveOptions = (options: unknown): TextSaveOptions => {
  if (!options || typeof options !== 'object') return {}
  if ('savePolicy' in options || 'successMessage' in options) return options as TextSaveOptions
  return {}
}

const saveCurrentFile = async (options: unknown = {}) => {
  if (currentFileReloadBusy.value) { message.warning('正在重新读取文件，请稍后再保存'); return }
  const saveOptions = normalizeTextSaveOptions(options)
  if (!vditor || !activeTabId.value) return; const t = tabs.value.find(item => item.id === activeTabId.value)
  if (t) { 
    const savingEditor = vditor
    const submittedContent = savingEditor.getValue()
    const releaseSaveOwnership = tryAcquireMainTextSave(t.path)
    if (!releaseSaveOwnership) {
      message.warning('这篇文档正在保存，请稍后再保存新增内容')
      return
    }
    const savingLibraryRoot = store.libraryPath
    const savingGitEnabled = currentLibGitEnabled.value
    let finishWindowSave: (() => void) | undefined
    try { 
      finishWindowSave = beginWindowSave()
      if (t.textReadOnlyReason) throw new Error('大文件范围预览为只读模式，不能覆盖保存')
      let content = submittedContent;
      
      const format = findFileFormat(t.path)
      if (!format || format.routeName !== 'LibraryMode') throw new Error('当前文件没有文本写入适配器')
      if (!isFormatCapabilitySupported(format, 'edit')) throw new Error(`${format.label} 不支持覆盖保存`)
      if (format.id === 'markdown') {
        const assetPattern = /https?:\/\/asset\.localhost\/[^"'\)\s]+/g
        content = content.replace(assetPattern, (match: string) => {
          try {
            const decoded = decodeURIComponent(match)
            const fileName = decoded.split('/').pop() || ''
            return `public/${fileName}`
          } catch (e) { return match }
        })
      }

      const savePolicy = saveOptions.savePolicy || (t.textReadEncoding ? { encoding: t.textReadEncoding } : undefined)
      const saved = await invoke<TextDocumentSnapshot>('write_text_document', {
        libraryRoot: savingLibraryRoot,
        maxHistoryCount: format.id === 'markdown' ? store.maxHistoryCount : undefined,
        path: t.path,
        formatId: format.id,
        content,
        expectedSignature: t.textSignature,
        savePolicy,
      });
      const ownsEditor = vditor === savingEditor && activeTabId.value === t.id && tabs.value.includes(t)
      const currentContent = ownsEditor ? savingEditor.getValue() : (t.content ?? submittedContent)
      const receipt = reconcileTextSaveReceipt(submittedContent, currentContent, saved.content)
      updateTabFromTextSnapshot(t, saved, savePolicy?.encoding || t.textReadEncoding)
      t.content = receipt.content
      t.isDirty = receipt.isDirty
      if (ownsEditor && !receipt.isDirty && savingEditor.getValue() !== saved.content) {
        suppressEditorInput = true
        savingEditor.setValue(saved.content)
        editorDisplayBaseline = savingEditor.getValue()
        setTimeout(() => { suppressEditorInput = false }, 0)
      }
      lastPromptedExternalSignature = ''
      if (saved.historyWarning) message.warning(saved.historyWarning + (receipt.isDirty ? '；新增编辑尚未保存' : ''))
      else message.success(receipt.isDirty ? '已保存提交的内容，新增编辑尚未保存' : (saveOptions.successMessage || '已安全保存'));
      if (format.id === 'markdown' && savingLibraryRoot === store.libraryPath) void fetchAllTags()
      // Git 自动 commit（本地）
      if (savingGitEnabled) {
        invoke('git_commit', { libraryPath: savingLibraryRoot, message: `更新: ${t.title}` }).catch(() => {})
      }
    } catch (e: any) {
      if (e?.code === 'external-modified' && activeTabId.value === t.path && store.libraryPath === savingLibraryRoot) openTextConflict(t.path)
      else handleError(e, '保存失败', 'saveCurrentFile')
    } finally {
      releaseSaveOwnership()
      finishWindowSave?.()
    }
  }
}

const syncUserSelectedVditorMode = () => {
  if (!vditor) return
  const currentMode = vditor.getCurrentMode()
  if (currentMode && (currentMode !== store.editorMode || !store.editorModeExplicit)) {
    void store.updateConfig({ editorMode: currentMode as any, editorModeExplicit: true })
  }
}
const editorModeChangeBusy = ref(false)
const switchEditorMode = async (mode: string) => {
  if (editorModeChangeBusy.value) return
  if (!vditor || (store.editorMode === mode && store.editorModeExplicit)) return
  const requestedEditor = vditor
  const requestedPath = activeTabId.value
  const requestedGeneration = editorLoadGeneration
  editorModeChangeBusy.value = true
  try { await store.updateConfig({ editorMode: mode, editorModeExplicit: true }) }
  catch (error) { message.error(`无法切换编辑模式：${String(error)}`); return }
  finally { editorModeChangeBusy.value = false }
  if (vditor !== requestedEditor || activeTabId.value !== requestedPath || editorLoadGeneration !== requestedGeneration) return
  const content = vditor.getValue()
  const tab = tabs.value.find(item => item.id === activeTabId.value)
  if (tab && tab.content !== content && (tab.isDirty || content !== editorDisplayBaseline)) {
    tab.content = content
    tab.isDirty = true
  }
  searchMatchCount.value = null
  editorLoading.value = true
  const generation = ++editorLoadGeneration
  cleanupEditorListeners()
  documentShortcutHost.value = null
  vditor.destroy(); vditor = null; isVditorReady = false
  nextTick(() => {
    if (generation !== editorLoadGeneration || vditor) return
    // initVditor's after callback restores the current tab through the guarded
    // load path, including pending-save coordination. Never replay a stale
    // mode-switch snapshot through an unguarded polling timer.
    initVditor()
  })
}
const ensureVditorModeForFile = (path: string) => {
  // The editor can be mounted before a route opens its first document. In that case it starts
  // in source mode and must be rebuilt before Markdown content is loaded into the wrong surface.
  if (!vditor || !isVditorReady) return true
  const desiredMode = desiredVditorMode(path)
  if (vditor.getCurrentMode() === desiredMode) return false
  editorLoading.value = true
  cleanupEditorListeners()
  documentShortcutHost.value = null
  vditor.destroy()
  vditor = null
  isVditorReady = false
  nextTick(initVditor)
  return true
}
const handleEditorClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('[data-type="edit-mode"]')) {
    setTimeout(syncUserSelectedVditorMode, EDITOR_MODE_SYNC_DELAY_MS)
  }
}

interface ChartSourceDocument { views: { id: string; name: string; kind: string }[] }
const resolveMarkdownReference = (source: string, host: string) => {
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith('/')) return source
  const separator = host.includes('\\') ? '\\' : '/'
  const parent = host.substring(0, Math.max(host.lastIndexOf('/'), host.lastIndexOf('\\')))
  return `${parent}${separator}${source.replace(/[\\/]/g, separator)}`
}
const insertTableChartReference = async () => {
  if (!vditor || !activeTabId.value) return
  const source = (await promptAppAction(dialog, {
    title: '插入 Table 图表',
    content: '输入相对当前 Markdown 的 .table.json 路径，也可以输入绝对路径。',
    initialValue: 'data.table.json',
    positiveText: '读取图表源',
  }))?.trim()
  if (!source) return
  if (!source.toLocaleLowerCase().endsWith('.table.json')) { message.error('图表源必须是 .table.json 文件'); return }
  try {
    const table = await invoke<ChartSourceDocument>('read_table_file', { libraryRoot: store.libraryPath, path: resolveMarkdownReference(source, activeTabId.value) })
    const charts = table.views.filter(view => view.kind === 'chart')
    if (!charts.length) { message.warning('该 Table 尚未创建图表视图'); return }
    const viewId = (await promptAppAction(dialog, {
      title: '选择图表视图',
      content: charts.map(view => `${view.id} — ${view.name}`).join('\n'),
      initialValue: charts[0].id,
      positiveText: '插入图表引用',
    }))?.trim()
    if (!viewId) return
    if (!charts.some(view => view.id === viewId)) { message.error('输入的 chart 视图不存在'); return }
    const reference = JSON.stringify({ source, view: viewId })
    vditor.insertValue(`\n\n\`\`\`longedit-chart\n${reference}\n\`\`\`\n`)
    message.success('已插入实时 Table 图表引用')
  } catch (cause) { message.error(`无法读取图表源：${String(cause).replace(/^Error:\s*/, '')}`) }
}

const initVditor = () => {
  const container = document.getElementById('vditor-lib'); if (!container) return;
  container.addEventListener('click', handleEditorClick);
  editorLoading.value = true

  const appearance = resolveMarkdownEditorAppearance(store.theme, store.codeTheme)

  try {
    vditor = new Vditor('vditor-lib', {
      cdn: './vditor',
      lang: 'zh_CN',
      height: '100%',
      mode: desiredVditorMode(),
      customWysiwygToolbar: () => {},
      cache: { enable: false },
      theme: appearance.editorTheme,
      preview: {
        theme: { current: appearance.contentTheme },
        hljs: { enable: true, style: appearance.codeTheme },
        math: { engine: 'KaTeX' } as any,
        markdown: { mermaid: true, footnotes: true, toc: true } as any,
        customWysiwygToolbar: () => {},
        transform: (html: string) => html
      } as any,
      toolbar: [
        { name: 'undo', tip: '撤销 Ctrl+Z' }, { name: 'redo', tip: '重做 Ctrl+Y' }, '|',
        { name: 'headings', tip: '标题' }, { name: 'bold', tip: '加粗 Ctrl+B' }, { name: 'italic', tip: '斜体 Ctrl+I' }, { name: 'quote', tip: '引用' }, '|',
        { name: 'list', tip: '无序列表' }, { name: 'ordered-list', tip: '有序列表' }, { name: 'check', tip: '任务列表' }, '|',
        { name: 'code', tip: '代码块' }, { name: 'inline-code', tip: '行内代码' }, { name: 'link', tip: '插入链接' }, { name: 'table', tip: '插入表格' }, '|',
        { name: 'more', tip: '更多格式与工具', icon: '<span class="vditor-toolbar-label">更多格式</span>', toolbar: [
        { name: 'emoji', tip: '表情' }, { name: 'strike', tip: '删除线' }, { name: 'line', tip: '分割线' }, '|',
        { name: 'table-chart', tip: '插入实时 Table 图表', icon: '<span class="vditor-toolbar-label">实时 Table 图表</span>', click: () => { void insertTableChartReference() } }, '|',
        { name: 'code-theme', tip: '切换代码高亮风格', icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>', click: () => {
          const themes = markdownCodeThemeChoices(store.theme)
          const nextTheme = themes[(themes.indexOf(store.codeTheme) + 1) % themes.length]
          handleCodeThemeChange(nextTheme); message.info(`代码风格: ${nextTheme.toUpperCase()}`)
        }},
        { name: 'editor-bg', tip: '修改文章背景色', icon: '<span class="vditor-toolbar-label">文章背景色</span>', click: () => { (document.querySelector('.hidden-picker-trigger .n-color-picker-trigger') as HTMLElement)?.click() }},
        { name: 'ai-assist', tip: 'AI 辅助 (Alt+A)', icon: '<span class="vditor-toolbar-label">AI 辅助</span>', click: () => handleAIAssist() },
        '|', { name: 'both', tip: '双栏预览' }, { name: 'preview', tip: '预览' }, { name: 'edit-mode', tip: '切换编辑模式' }
        ] }
      ],
      input: (val) => {
        if (!suppressEditorInput) searchMatchCount.value = null
        if (suppressEditorInput) {
          wordCount.value = val.length
          return
        }
        const cur = tabs.value.find(t => t.id === activeTabId.value); 
        // A delayed notification of the acknowledged content is not a new edit.
        if (cur && cur.content !== val && (cur.isDirty || val !== editorDisplayBaseline)) {
          cur.isDirty = true
          store.updateTabContent(cur.path, val);
        }
        wordCount.value = val.length;
      },
      after: () => {
        cleanupEditorListeners()
        isVditorReady = true;
        editorLoading.value = false;
        const toolbar = document.querySelector('#vditor-lib .vditor-toolbar')
        if (toolbar) {
          const host = document.createElement('div')
          host.className = 'document-shortcut-host'
          toolbar.appendChild(host)
          documentShortcutHost.value = host
        }
        documentPreviewButton = toolbar?.querySelector<HTMLElement>('[data-type="preview"]') ?? null
        syncDocumentPreview()
        if (documentPreviewButton) {
          documentPreviewObserver = new MutationObserver(syncDocumentPreview)
          documentPreviewObserver.observe(documentPreviewButton, { attributes: true, attributeFilter: ['class'] })
        }
        const currentAppearance = resolveMarkdownEditorAppearance(store.theme, store.codeTheme)
        vditor.setTheme(currentAppearance.editorTheme, currentAppearance.contentTheme, currentAppearance.codeTheme)
        // 光标位置追踪（兼容 WYSIWYG / IR / SV 三种模式）
        const contentEl = vditor.vditor.wysiwyg?.element || vditor.vditor.ir?.element || vditor.vditor.sv?.element
        if (contentEl) {
          const getEditEl = () => vditor.vditor.wysiwyg?.element || vditor.vditor.ir?.element || vditor.vditor.sv?.element || contentEl
          const updateCursor = () => {
            const el = getEditEl()
            const sel = window.getSelection()
            if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return
            const range = sel.getRangeAt(0)
            const preRange = document.createRange()
            preRange.selectNodeContents(el)
            preRange.setEnd(range.startContainer, range.startOffset)
            const text = preRange.toString()
            const lines = text.split('\n')
            cursorLine.value = lines.length
            cursorCol.value = lines[lines.length - 1].length + 1
          }

          // 保存监听器引用以便清理
          cursorUpdateHandler = updateCursor
          pdfReferenceClickHandler = openPdfReference
          currentContentEl = contentEl
          contentEl.addEventListener('keyup', updateCursor)
          contentEl.addEventListener('click', updateCursor)
          contentEl.addEventListener('click', openPdfReference)

          // 滚动追踪：自动高亮当前章节
          const viewport = contentEl.closest('.editor-viewport') as HTMLElement
          if (viewport) {
            const scrollHandler = () => {
              if (activeSidebarTab.value !== 'outline' || isSidebarCollapsed.value || store.isZen) return
              const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
              let closestId = null as string | null
              headings.forEach((h: HTMLElement) => {
                const rect = h.getBoundingClientRect()
                if (rect.top <= 160) closestId = h.getAttribute('data-id') || h.id
              })
              activeHeadingKey.value = closestId
            }
            scrollUpdateHandler = scrollHandler
            currentViewport = viewport
            viewport.addEventListener('scroll', scrollHandler, { passive: true })
          }
        }
        if (activeTabId.value) {
          const t = tabs.value.find(item => item.id === activeTabId.value);
          if (t) loadFileToEditor(t.path)
        }
        updateWordCount();
        setTimeout(fixEditorImages, IMAGE_FIX_DELAY_MS); // 启动后修正
      }
    })
  } catch (e) { editorLoading.value = false }
}

const handleKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null
  const inFileTree = Boolean(target?.closest('.library-file-tree, .tree-viewport')) && !target?.closest('input, textarea, [contenteditable="true"]')
  if (inFileTree && (e.ctrlKey || e.metaKey) && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
    e.preventDefault(); if (fileOperationBusy.value) return
    if (e.key.toLowerCase() === 'v') { const clipboard = libraryFileClipboard.value; if (clipboard && clipboardAvailable.value) fileOperations.value?.openTransfer(clipboard.paths, clipboard.operation, selectedTargetDirectory()) }
    else if (selectedKeys.value.length) libraryFileClipboard.value = { root: store.libraryPath, paths: topLevelPaths(selectedKeys.value), operation: e.key.toLowerCase() === 'x' ? 'move' : 'copy' }
    return
  }
  if (inFileTree && !fileOperationBusy.value && e.key === 'F2' && selectedKeys.value.length > 0) {
    const path = selectedKeys.value[0]
    const option = findTreeOptionByKey(treeData.value, path)
    openRename(path, option ? !option.isLeaf : false)
  }
  if (inFileTree && !fileOperationBusy.value && e.key === 'Delete' && selectedKeys.value.length > 0) { e.preventDefault(); if (e.shiftKey) void deleteAction(selectedKeys.value); else void fileOperations.value?.recycle(selectedKeys.value) }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentFile() }
  if (e.altKey && e.key === 'a') { e.preventDefault(); handleAIAssist() }
}

let unlistenRefresh: any = null, unlistenExport: any = null, unlistenRefreshCmd: any = null, unlistenSaveCmd: any = null, unlistenDailyNote: any = null, unlistenFocus: any = null, unlistenDrop: any = null

// 事件监听器清理
let cursorUpdateHandler: (() => void) | null = null
let scrollUpdateHandler: (() => void) | null = null
let pdfReferenceClickHandler: ((event: MouseEvent) => void) | null = null
let currentContentEl: HTMLElement | null = null
let currentViewport: HTMLElement | null = null

const cleanupEditorListeners = () => {
  documentPreviewObserver?.disconnect()
  documentPreviewObserver = undefined
  documentPreviewButton = null
  syncDocumentPreview()
  if (currentContentEl && cursorUpdateHandler) {
    currentContentEl.removeEventListener('keyup', cursorUpdateHandler)
    currentContentEl.removeEventListener('click', cursorUpdateHandler)
  }
  if (currentContentEl && pdfReferenceClickHandler) {
    currentContentEl.removeEventListener('click', pdfReferenceClickHandler)
  }
  if (currentViewport && scrollUpdateHandler) {
    currentViewport.removeEventListener('scroll', scrollUpdateHandler)
  }
  cursorUpdateHandler = null
  scrollUpdateHandler = null
  pdfReferenceClickHandler = null
  currentContentEl = null
  currentViewport = null
}

const openSourceReference = async (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]')
  const href = anchor?.getAttribute('href') || ''
  const local = activeTabId.value && localMarkdownLink(activeTabId.value, href)
  if (local) {
    event.preventDefault(); event.stopPropagation()
    const libraryRoot = store.libraryPath, documentPath = activeTabId.value
    if (!local.path) { message.warning('链接地址无法识别，请检查文件路径'); return }
    try {
      await invoke('get_file_stats', { libraryRoot, path: local.path })
      if (store.libraryPath !== libraryRoot || activeTabId.value !== documentPath) return
      snapshotWindowDrafts()
      const existing = allTabs.value.find(tab => tab.isDirty && sameLibrary(tab.path, local.path!)) || allTabs.value.find(tab => sameLibrary(tab.path, local.path!))
      await openManagedFile(router, existing?.path || local.path, local.fragment ? { markdownAnchor: local.fragment } : {})
      void nextTick(revealLinkedHeading)
    } catch (error) { message.warning(`无法打开链接文件：${String(error)}`) }
    return
  }
  if (href.toLowerCase().startsWith('longedit://source')) {
    event.preventDefault()
    event.stopPropagation()
    const source = parseSourceReference(href, store.libraryPath)
    if (!source || !findFileFormat(source.path)) { message.warning('来源链接不可用，请在知识库中查找原文件'); return }
    const libraryRoot = store.libraryPath
    const notePath = activeTabId.value
    const editor = vditor
    const originalContent = editor?.getValue()
    try {
      await invoke('get_file_stats', { libraryRoot, path: source.path })
    } catch {
      if (store.libraryPath !== libraryRoot || activeTabId.value !== notePath) return
      if (!activeIsMarkdown.value || !activeFormatCanEdit.value || !editor) {
        message.warning('来源已移动或不可访问，请在资料库中查找原文件。')
        return
      }
      const replacement = (await promptAppAction(dialog, {
        title: '重新关联来源',
        content: '原文件已移动或无法访问。输入当前知识库内的新相对路径；确认后只修改当前笔记中这个来源的链接，可撤销，需手动保存。取消不会修改笔记。',
        initialValue: '', positiveText: '验证并重新关联',
      }))?.trim()
      if (!replacement) return
      const url = new URL(href); url.searchParams.set('path', replacement)
      const nextSource = parseSourceReference(url.toString(), libraryRoot)
      if (!nextSource || !findFileFormat(nextSource.path)) { message.warning('请输入当前知识库内的有效相对路径。'); return }
      try { await invoke('get_file_stats', { libraryRoot, path: nextSource.path }) }
      catch { message.warning('新来源仍无法访问，未修改笔记。'); return }
      if (store.libraryPath !== libraryRoot || activeTabId.value !== notePath || vditor !== editor || editor.getValue() !== originalContent || !activeFormatCanEdit.value) {
        message.warning('笔记或知识库已变化，请重新点击来源链接后再关联。'); return
      }
      if (!originalContent?.includes(href)) { message.warning('当前链接内容已变化，未修改笔记。'); return }
      const updated = originalContent.split(href).join(url.toString())
      editor.vditor.undo.addToUndoStack(editor.vditor)
      editor.setValue(updated)
      editor.vditor.undo.addToUndoStack(editor.vditor)
      store.updateTabContent(notePath!, updated)
      const tab = tabs.value.find(item => item.path === notePath)
      if (tab) tab.isDirty = true
      message.success('来源已重新关联，可撤销；请手动保存。再次点击链接可打开新来源。')
      return
    }
    if (store.libraryPath !== libraryRoot || activeTabId.value !== notePath) return
    void openManagedFile(router, source.path, { page: source.page, annotation: source.annotation,
      ...(source.quote ? { searchNeedle: source.quote, searchLocator: `${Date.now()}-${++searchNavigationSequence}` } : {}) })
    return
  }
}

const openPdfReference = (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]')
  const href = anchor?.getAttribute('href') || ''
  if (!href.toLowerCase().startsWith('longedit://pdf')) return
  event.preventDefault()
  event.stopPropagation()
  const target = parsePdfReferenceUri(href)
  const path = target && resolveLibraryPdfPath(store.libraryPath, target.relativePath)
  if (!target || !path) {
    message.warning('PDF 批注引用格式无效')
    return
  }
  openManagedFile(router, path, { page: String(target.page), annotation: target.annotationId })
}

const handleExportHtml = async () => {
  if (!vditor || !isVditorReady || !activeTabId.value || !activeIsMarkdown.value) { message.warning('只有 Markdown 文档支持 HTML 导出'); return }
  const html = vditor.getHTML()
  try { await invoke('export_to_html', { libraryRoot: store.libraryPath, path: activeTabId.value, htmlContent: html }); message.success('HTML 已导出') } catch (e) { message.error('导出失败') }
}

onMounted(async () => {
  window.addEventListener('longedit:search-reference', onPaletteSearchReference)
  window.addEventListener('longedit:file-move-completed', refreshAfterFileMove)
  document.addEventListener('selectionchange', rememberReferenceInsertionPoint)
  document.addEventListener('pointerup', rememberReferenceInsertionPoint)
  document.addEventListener('keyup', rememberReferenceInsertionPoint)
  void initializeUpdater()
  window.addEventListener('longedit:reveal-library-file', revealLibraryFile)
  window.addEventListener('longedit:library-file-created', refreshCreatedLibraryFile)
  await store.loadConfig()
  restoreReference(store.libraryPath)
  if (activeTabId.value && route.query.path !== activeTabId.value) {
    await router.replace({ name: 'LibraryMode', query: { ...route.query, path: activeTabId.value } })
  }
  void loadExternalApplications()
  if (activeTabId.value && !opensInLibraryShell(findFileFormat(activeTabId.value))) {
    store.activateTab(tabs.value[0]?.id || null)
  }
  window.addEventListener('keydown', handleKeyDown)
  if (!route.query.search && !route.query.collection) searchReturn.restore()
  applyRouteSearch()
  if (store.libraryPath) { await refreshLibrary(); fetchLibStats(); fetchAllTags(); void refreshKnowledgeIndexStatus() }
  unlistenRefresh = await listen('refresh-library', () => refreshLibrary())
  unlistenExport = await listen('command-export', handleExportHtml)
  unlistenRefreshCmd = await listen('command-refresh', () => refreshLibrary())
  unlistenSaveCmd = await listen('command-save', saveCurrentFile)
  unlistenDailyNote = await listen('command-daily-note', createDailyNote)
  // 聚焦时用内容摘要核对磁盘身份；弹窗自身的焦点变化不会重复触发。
  if (isTauriRuntime()) {
    unlistenFocus = await getCurrentWindow().listen('tauri://focus', () => {
      void refreshKnowledgeIndexStatus()
      void checkActiveTextIdentity()
    })
  }
  nextTick(() => { initVditor(); startShadowSaveTimer() })
  if (isTauriRuntime()) {
    unlistenDrop = await getCurrentWindow().onDragDropEvent(async (event) => {
    if (event.payload.type === 'over') {
      externalFileDrag = true
      updateDropTarget(event.payload.position.x, event.payload.position.y)
    } else if (event.payload.type === 'drop') {
      const targetPath = virtualDrag.dropTarget || store.libraryPath
      const position = virtualDrag.dropPosition
      
      if (event.payload.paths.length > 0 && targetPath) {
        try {
          let finalTargetDir = targetPath
          let referenceItem = null
          if (position === 'before' || position === 'after') {
            const lastIdx = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'))
            finalTargetDir = lastIdx !== -1 ? targetPath.substring(0, lastIdx) : store.libraryPath
            referenceItem = targetPath.split(/[\\/]/).pop() || ''
          }

          externalImportPlacement = { root: store.libraryPath, directory: finalTargetDir, position, reference: referenceItem }
          await externalImport.value?.open(event.payload.paths, finalTargetDir)
        } catch (err) { message.error(`导入未完成：${String(err)}`) }
      }
      virtualDrag.dropTarget = null; virtualDrag.dropPosition = null
      externalFileDrag = false
      clearFileDragTimers()
    } else if (event.payload.type === 'leave') {
      externalFileDrag = false
      resetFileDrag()
    }
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('longedit:search-reference', onPaletteSearchReference)
  knowledgePages.dispose()
  window.removeEventListener('longedit:file-move-completed', refreshAfterFileMove)
  resetFileDrag()
  closeHistoryComparison()
  invalidateHistory()
  document.removeEventListener('selectionchange', rememberReferenceInsertionPoint)
  document.removeEventListener('pointerup', rememberReferenceInsertionPoint)
  document.removeEventListener('keyup', rememberReferenceInsertionPoint)
  ++knowledgeSearchGeneration
  ++libraryLoadGeneration
  editorLoadGeneration += 1
  destroyImageFix()
  window.removeEventListener('longedit:reveal-library-file', revealLibraryFile)
  window.removeEventListener('longedit:library-file-created', refreshCreatedLibraryFile)
  window.removeEventListener('keydown', handleKeyDown)
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  if (gitStatusTimer) clearTimeout(gitStatusTimer)
  if (searchTimer) clearTimeout(searchTimer)
  cleanupEditorListeners()
  destroyOutlineObserver()
  if (unlistenRefresh) unlistenRefresh()
  if (unlistenExport) unlistenExport()
  if (unlistenRefreshCmd) unlistenRefreshCmd()
  if (unlistenSaveCmd) unlistenSaveCmd()
  if (unlistenDailyNote) unlistenDailyNote()
  if (unlistenFocus) unlistenFocus()
  if (unlistenDrop) unlistenDrop()
  if (vditor && isVditorReady) {
    documentShortcutHost.value = null
    vditor.destroy()
    vditor = null
  }
})
watch(activeSidebarTab, (newTab) => { if (newTab === 'history') fetchHistory(); if (newTab === 'tags') void fetchAllTags() })
watch(() => store.theme, (newTheme) => {
  if (vditor && isVditorReady) {
    const isDark = isActiveThemeDark(newTheme)

    // 自动调整编辑器背景色
    const targetBg = THEME_MAP[newTheme] || (isDark ? '#1c1c1e' : '#ffffff')
    const isDefaultBg = Object.values(THEME_MAP).includes(store.editorBgColor)
    if (isDefaultBg) handleEditorBgChange(targetBg)

    const appearance = resolveMarkdownEditorAppearance(newTheme, store.codeTheme)
    vditor.setTheme(appearance.editorTheme, appearance.contentTheme, appearance.codeTheme)
  }
})

watch(() => store.codeTheme, (newCodeTheme) => {
  if (vditor && isVditorReady) {
    const appearance = resolveMarkdownEditorAppearance(store.theme, newCodeTheme)
    vditor.setTheme(appearance.editorTheme, appearance.contentTheme, appearance.codeTheme)
  }
})

watch(() => store.autoSaveInterval, () => { startShadowSaveTimer() })
watch(() => route.query.markdownAnchor, () => { void nextTick(revealLinkedHeading) })
watch(() => route.query.path, (path) => {
  if (typeof path !== 'string' || !path) return
  const format = findFileFormat(path)
  if (!format) return
  if (opensInLibraryShell(format)) handleNodeSelect([path])
  else router.replace({ name: format.routeName, query: { path } })
}, { immediate: true })
watch([() => route.query.searchLocator, () => route.query.path], () => {
  locatedSearchToken = ''
  searchMatchCount.value = null
  searchNavigationClosed.value = false
  searchLocationTarget?.classList.remove('workspace-task-locator-target')
  void nextTick(() => revealSearchMatch())
})
watch(() => route.query.taskLocator, () => scheduleWorkspaceTaskReveal())
watch(() => route.query.relationLocator, () => scheduleRelationEvidenceReveal())
const applyRouteSearch = () => {
  if (route.query.panel === 'collections') activeSidebarTab.value = 'collections'
  const collectionId = route.query.collection
  if (typeof collectionId === 'string' && collectionId) {
    const collection = store.savedSearches.find(search => search.id === collectionId)
    if (collection) openSavedSearch(collection)
    return
  }
  const query = route.query.search
  if (typeof query !== 'string' || !query.trim()) return
  searchQuery.value = query
  searchObjectTypes.value = typeof route.query.types === 'string'
    ? route.query.types.split(',').filter(type => searchFormatOptions.some(option => option.value === type))
    : []
  activeSidebarTab.value = 'files'
}
watch(() => [route.query.search, route.query.types, route.query.panel, route.query.collection], applyRouteSearch)
const refreshKnowledgeIndexStatus = async (options: { autoPrepare?: boolean; libraryRoot?: string } = {}) => {
  const libraryRoot = options.libraryRoot || store.libraryPath
  if (!libraryRoot) return
  try {
    const status = await invoke<KnowledgeIndexStatus>('get_knowledge_index_status', { libraryRoot })
    if (store.libraryPath !== libraryRoot) return
    knowledgeIndexStatus.value = status
    const shouldPrepare = options.autoPrepare !== false && (status.state === 'missing' || status.state === 'stale')
    if (shouldPrepare && !knowledgeIndexBusy.value && !automaticallyPreparingLibraries.has(libraryRoot)) {
      automaticallyPreparingLibraries.add(libraryRoot)
      void rebuildKnowledgeIndex({ automatic: true, libraryRoot })
    }
  } catch (error) {
    if (store.libraryPath === libraryRoot) knowledgeIndexStatus.value = { ...knowledgeIndexStatus.value, state: 'error', error: String(error) }
  }
}

const reloadTextWithEncoding = async (encoding: string) => {
  if (!vditor || !activeTabId.value) return
  const tab = tabs.value.find(item => item.id === activeTabId.value)
  if (!tab) return
  const format = findFileFormat(tab.path)
  if (!format || format.routeName !== 'LibraryMode') return
  const run = async () => {
    try {
      const readOptions: TextReadOptions = { encoding }
      if (tab.textReadOnlyReason) {
        const preview = await readLargeTextPreview(tab, 0, encoding)
        suppressEditorInput = true
        vditor.setValue(preview.content)
        setTimeout(() => {
          suppressEditorInput = false
          vditor?.disabled()
        }, 0)
        message.success(`已按 ${encodingLabel(encoding)} 重新读取大文件首段`)
        return
      }
      const snapshot = await invoke<TextDocumentSnapshot>('read_text_document', {
        libraryRoot: store.libraryPath,
        path: tab.path,
        formatId: format.id,
        readOptions,
      })
      updateTabFromTextSnapshot(tab, snapshot, encoding)
      suppressEditorInput = true
      vditor.setValue(snapshot.content)
      setTimeout(() => { suppressEditorInput = false }, 0)
      lastPromptedExternalSignature = ''
      message.success(`已按 ${encodingLabel(encoding)} 重新读取`)
    } catch (e: any) {
      handleError(e, '编码重读失败', 'reloadTextWithEncoding')
    }
  }
  if (tab.isDirty) {
    dialog.warning({
      title: '重新读取会覆盖未保存内容',
      content: '当前编辑区存在未保存修改。继续后会从磁盘按所选编码重新读取。',
      positiveText: '继续重读',
      negativeText: '取消',
      onPositiveClick: () => { void run() },
    })
  } else {
    await run()
  }
}

const saveTextWithEncoding = async (encoding: string, bom: 'none' | 'utf-8') => {
  const label = TEXT_ENCODING_PRESETS.find(preset => preset.encoding === encoding && preset.bom === bom)?.label || encodingLabel(encoding)
  await saveCurrentFile({
    savePolicy: { encoding, bom },
    successMessage: `已转换保存为 ${label}`,
  })
}

const handleTextEncodingAction = (key: string) => {
  const [action, encoding, bom] = key.split(':')
  if (action === 'read' && encoding) {
    void reloadTextWithEncoding(encoding)
  } else if (action === 'save' && encoding && (bom === 'none' || bom === 'utf-8')) {
    void saveTextWithEncoding(encoding, bom)
  }
}
const rebuildKnowledgeIndex = async (options: { automatic?: boolean; libraryRoot?: string } = {}) => {
  const libraryRoot = options.libraryRoot || store.libraryPath
  if (!libraryRoot || knowledgeIndexBusy.value) return
  knowledgeIndexBusy.value = true
  if (store.libraryPath === libraryRoot) knowledgeIndexStatus.value = { ...knowledgeIndexStatus.value, state: 'building', progress: 10, error: undefined, recoveryAvailable: false }
  const progressTimer = window.setInterval(() => { void refreshKnowledgeIndexStatus({ autoPrepare: false, libraryRoot }) }, 400)
  try {
    const status = await invoke<KnowledgeIndexStatus>('rebuild_knowledge_index', { libraryRoot })
    if (store.libraryPath === libraryRoot) knowledgeIndexStatus.value = status
    if (!options.automatic) {
      if (status.state === 'cancelled') message.info('已停止准备搜索与关联')
      else message.success('搜索与关联已重新准备')
    }
  } catch (error) {
    if (store.libraryPath === libraryRoot) knowledgeIndexStatus.value = { ...knowledgeIndexStatus.value, state: 'error', progress: 0, error: String(error) }
    if (!options.automatic) message.error(`重新准备搜索与关联失败：${String(error)}`)
  } finally {
    window.clearInterval(progressTimer)
    knowledgeIndexBusy.value = false
    if (options.automatic) automaticallyPreparingLibraries.delete(libraryRoot)
    if (store.libraryPath && store.libraryPath !== libraryRoot) {
      void refreshKnowledgeIndexStatus({ libraryRoot: store.libraryPath })
    }
  }
}
const cancelKnowledgeIndex = async () => {
  const libraryRoot = store.libraryPath
  if (!libraryRoot || !knowledgeIndexBusy.value || knowledgeIndexCancelling.value) return
  knowledgeIndexCancelling.value = true
  try {
    knowledgeIndexStatus.value = await invoke<KnowledgeIndexStatus>('cancel_knowledge_index', { libraryRoot })
    message.info('已停止准备搜索与关联')
  } catch (error) {
    message.error(`停止失败：${String(error)}`)
  } finally {
    knowledgeIndexCancelling.value = false
  }
}
const recoverKnowledgeIndex = () => {
  const libraryRoot = store.libraryPath
  if (!libraryRoot || knowledgeIndexBusy.value) return
  dialog.warning({
    title: '隔离损坏的搜索缓存',
    content: '只会移动 LongEdit 的本地搜索缓存，不会删除或修改资料库文件。隔离后将自动重新准备搜索与关联。',
    positiveText: '隔离并重新准备',
    negativeText: '取消',
    onPositiveClick: async () => {
      knowledgeIndexBusy.value = true
      try {
        const report = await invoke<KnowledgeIndexRecoveryReport>('recover_knowledge_index_cache', { libraryRoot })
        message.success(report.quarantined ? '损坏缓存已隔离，正在重新准备' : report.message)
      } catch (error) {
        message.error(`隔离搜索缓存失败：${String(error)}`)
        return
      } finally {
        knowledgeIndexBusy.value = false
      }
      await rebuildKnowledgeIndex({ automatic: true, libraryRoot })
    },
  })
}
const clearKnowledgeIndexCache = () => {
  const libraryRoot = store.libraryPath
  if (!libraryRoot || knowledgeIndexBusy.value) return
  dialog.warning({
    title: '清除本地搜索缓存',
    content: '只会清除 LongEdit 为当前资料库生成的搜索与关系缓存，不会删除或修改任何资料库文件。清除后将自动重新准备。',
    positiveText: '清除并重新准备',
    negativeText: '取消',
    onPositiveClick: async () => {
      knowledgeIndexBusy.value = true
      try {
        const status = await invoke<KnowledgeIndexStatus>('delete_knowledge_index', { libraryRoot })
        if (store.libraryPath === libraryRoot) knowledgeIndexStatus.value = status
        message.success('本地搜索缓存已清除，资料库文件未修改')
      } catch (error) {
        message.error(`清除本地搜索缓存失败：${String(error)}`)
        return
      } finally {
        knowledgeIndexBusy.value = false
      }
      await rebuildKnowledgeIndex({ automatic: true, libraryRoot })
    },
  })
}
const handleKnowledgeIndexAction = (key: string) => {
  if (key === 'recover') recoverKnowledgeIndex()
  else if (key === 'rebuild') void rebuildKnowledgeIndex()
  else if (key === 'clear') clearKnowledgeIndexCache()
}

watch(() => store.libraryPath, (newPath) => {
  knowledgePages.reset()
  ++tagsGeneration
  tagsRoot = newPath
  allTags.value = []
  tagsError.value = ''
  tagsLoading.value = false
  ++knowledgeSearchGeneration
  if (searchTimer) clearTimeout(searchTimer)
  activeCollectionId.value = ''
  knowledgeSearchResults.value = []
  knowledgeSearchRunning.value = false
  knowledgeSearchFailed.value = false
  searchQuery.value = ''
  relationSummaries.value = {}
  libraryLoadError.value = ''
  treeData.value = []
  if (!newPath) void refreshLibrary()
  if (newPath) {
    searchQuery.value = ''
    searchObjectTypes.value = []
    refreshLibrary()
    fetchLibStats()
    fetchAllTags()
    refreshGitStatus()
    void refreshKnowledgeIndexStatus()
    void refreshRelationSummaries()
  }
})
// 从设置页返回后刷新 Git 状态
watch(() => store.libraries, () => { nextTick(() => refreshGitStatus()) }, { deep: true })

// 搜索防抖
let searchTimer: ReturnType<typeof setTimeout> | null = null
const retryKnowledgeSearch = async () => {
  if (activeGraphCollection.value) { await activateGraphCollection(activeGraphCollection.value); return }
  if (knowledgePages.errorCode.value === 'snapshotChanged') await knowledgePages.refreshAvailable()
  else if (knowledgePages.status.value?.scanState === 'failed') await knowledgePages.restart()
  else await knowledgePages.retry()
  knowledgeSearchFailed.value = !!knowledgePages.error.value || knowledgePages.status.value?.scanState === 'failed'
  searchReturn.reconcile()
}
const applyKnowledgeView = async () => { await knowledgePages.applyPending(); searchReturn.reconcile() }
const scheduleKnowledgeSearch = (q: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  knowledgeSearchFailed.value = false
  knowledgeSearchError.value = ''
  if (!q.trim()) {
    if (activeCollectionId.value) return
    knowledgePages.reset()
    ++knowledgeSearchGeneration
    knowledgeSearchResults.value = []
    knowledgeSearchRunning.value = false
    void refreshRelationSummaries()
    refreshLibrary()
    return
  }
  activeCollectionId.value = ''
  knowledgePages.reset()
  const generation = ++knowledgeSearchGeneration
  const libraryRoot = store.libraryPath
  knowledgeSearchResults.value = []
  if (!libraryRoot) {
    void knowledgePages.start({ libraryRoot:'', query:q, sort:knowledgeSort.value, channel:'library', kind:'single' })
    knowledgeSearchRunning.value = false
    return
  }
  knowledgeSearchRunning.value = true
  searchTimer = setTimeout(async () => {
    const isCurrent = () => generation === knowledgeSearchGeneration && libraryRoot === store.libraryPath
    if (!isCurrent()) return
    try {
      const loadUntil = restoreSearchFiles; restoreSearchFiles = 0
      await knowledgePages.start({ libraryRoot, query:q, sort:knowledgeSort.value, channel:'library', kind:'single', matchMode:tagSearch.value ? 'tag' : 'content' }, { loadUntil })
      if (!isCurrent()) return
      knowledgeSearchResults.value = knowledgePages.files.value.flatMap(file => file.matches)
      knowledgeSearchFailed.value = !!knowledgePages.error.value
      void refreshKnowledgeIndexStatus()
      await refreshRelationSummaries()
    } catch (e) {
      if (isCurrent()) {
        knowledgeSearchResults.value = []
        knowledgeSearchFailed.value = true
      }
    } finally {
      if (isCurrent()) knowledgeSearchRunning.value = false
    }
  }, 300)
}
watch(searchQuery, scheduleKnowledgeSearch)
watch(knowledgeSort, () => { if (searchQuery.value.trim()) scheduleKnowledgeSearch(searchQuery.value) })
watch(activeTabId, (newId, oldId) => { 
  void requestLibraryTreeReveal(newId)
  if (newId && newId !== oldId) { 
    const t = tabs.value.find(item => item.id === newId); 
    if (t && findFileFormat(t.path)?.routeName === 'LibraryMode' && !ensureVditorModeForFile(t.path)) loadFileToEditor(t.path)

    // 侧边栏自动同步逻辑
    selectedKeys.value = [newId]
    

  } 
})
</script>

<style scoped>
.inbox-shortcut { flex-shrink: 0; margin: 0; padding: 3px 4px; border: 1px solid var(--workspace-border-color, #8885); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); text-align: left; cursor: pointer; font: inherit; font-size: var(--text-compact); white-space: nowrap; }
.inbox-shortcut[aria-expanded="true"] { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .08); }
.inbox-shortcut:focus-visible { outline: 2px solid var(--theme-primary); }
.library-recovery { display: flex; flex-direction: column; gap: 10px; padding: 14px; overflow-wrap: anywhere; font-size: 12px; color: var(--theme-text); }
.library-recovery p { margin: 0; line-height: 1.6; }
.library-recovery-path { opacity: .7; }
.library-recovery-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.library-recovery details { max-height: 120px; overflow: auto; }
.library-mode { position: relative; display: flex; flex-direction: column; height: 100%; width: 100%; min-width: 0; min-height: 0; overflow: hidden; background: transparent; box-sizing: border-box; animation: fadeIn 0.6s var(--ease-premium); container-type: inline-size; container-name: library-shell; }
.library-shell-toolbar { display: flex; align-items: center; flex-wrap: nowrap; gap: 6px; padding: 2px 12px; flex-shrink: 0; border-bottom: var(--theme-border); background: var(--theme-surface); }
.library-shell-toolbar > .n-button { flex-shrink: 0; }
.library-shell-toolbar > .library-picker { flex: 0 0 auto; min-width: 36px; width: clamp(52px, 12cqw, 160px); }
.shell-document-tabs { --workspace-tabs-height: 30px; --workspace-tab-height: 28px; align-self: stretch; border-bottom: 0; }
@container library-shell (max-width: 600px) {
  .shell-action-label { display: none; }
  .library-shell-toolbar > .n-button { padding: 0 5px; }
  .library-shell-toolbar :deep(.n-button__icon) { margin-right: 0; }
  .library-shell-toolbar > .library-picker { max-width: 52px; }
  .shell-document-tabs :deep(.workspace-tabs-scroll) { padding: 0 20px; }
  .shell-document-tabs :deep(.tab-scroll-button) { width: 18px; }
  .shell-document-tabs :deep(.workspace-tab) { flex-basis: 128px; min-width: 108px; }
}
.library-picker :deep(.n-button__content) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-toolbar-spacer { flex: 1; }
.library-workspace { position: relative; display: flex; flex: 1; width: 100%; min-width: 0; min-height: 0; gap: 0; }
.shell-search-area { padding: 12px 10px 6px; flex-shrink: 0; }
.document-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 7px 12px; border-bottom: var(--theme-border); flex-shrink: 0; }
.document-identity { display: flex; align-items: center; flex: 1 1 140px; min-width: 0; gap: 4px; }
.document-identity > .n-button { flex-shrink: 0; }
.document-breadcrumb { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.document-breadcrumb { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid transparent; border-radius: var(--theme-radius-sm); background: transparent; cursor: pointer; font-family: inherit; }
.document-breadcrumb:hover { color: var(--theme-primary); background: var(--workspace-control-hover-bg); }
.document-breadcrumb:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 1px; }
.document-breadcrumb .n-icon { flex-shrink: 0; opacity: .65; }
.document-breadcrumb > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.document-primary-actions { display: flex; align-items: center; flex-wrap: wrap; max-width: 100%; gap: 4px; margin-left: auto; }
.document-primary-actions > .n-button { flex-shrink: 0; }
.document-menu-content { display: flex; flex-direction: column; width: min(228px, calc(100vw - 80px)); gap: 4px; color: var(--theme-text); }
.document-menu-content .n-button { justify-content: flex-start; }
.document-menu-content .tab-actions { padding: 0; align-items: stretch; }
.document-menu-content .action-btn-group { align-items: stretch; flex-direction: column; }
.document-menu-content .mode-toggle, .document-menu-content .width-toggle { align-items: center; flex-wrap: wrap; padding: 8px 0 4px; margin: 0; border-left: 0; border-top: var(--theme-border); }
.document-menu-content .mode-toggle > span, .document-menu-content .width-toggle > span { flex-basis: 100%; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.document-menu-capability { margin: 4px 0; font-size: var(--text-compact); color: var(--theme-text-secondary); line-height: 1.6; }
.document-status { position: relative; z-index: 11; background: var(--theme-surface); display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 4px 10px; border-top: var(--theme-border); flex-shrink: 0; font-size: var(--text-compact); color: var(--theme-text-secondary); }
.document-save-state { color: var(--theme-primary); }
.document-reading-status { margin-left: auto; }
.reference-empty { box-sizing: border-box; width: clamp(260px, 28vw, 360px); flex: none; height: 100%; padding: 12px 16px; border-left: var(--theme-border); background: var(--theme-surface); color: var(--theme-text); }
.reference-empty > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.reference-empty > p { font-size: var(--text-compact); color: var(--theme-text-secondary); line-height: 1.7; }
.editor-main :deep(.vditor-toolbar-label) { white-space: nowrap; font-size: var(--text-compact); }
.editor-main { container-type: inline-size; container-name: library-editor; }
.editor-main :deep(.vditor-toolbar) { display: flex; flex-wrap: wrap; align-items: center; padding-inline: 8px !important; }
.editor-main :deep(.vditor-toolbar > .vditor-toolbar__item) { flex-shrink: 0; }
.editor-main :deep(.document-shortcut-host) { display: inline-flex; align-items: center; min-height: var(--toolbar-height); margin-left: auto; padding-left: 8px; vertical-align: middle; }
.document-inline-shortcuts { display: flex; align-items: center; gap: 4px; padding-left: 8px; border-left: var(--theme-border); white-space: nowrap; }
@container library-editor (max-width: 520px) {
  .document-toolbar { padding-inline: 8px; gap: 4px; }
  .document-primary-actions { gap: 2px; }
  .editor-main :deep(.document-shortcut-host) { padding-left: 0; padding-right: 40px; }
  .document-inline-shortcuts { padding-left: 4px; gap: 2px; }
}
.editor-main :deep(.vditor-toolbar > .vditor-toolbar__item:has([data-type="more"])) { width: auto; }
.editor-main :deep(.vditor-toolbar [data-type="more"]) { width: auto; min-width: 68px; }
.editor-main :deep(.vditor-toolbar .vditor-hint) { max-width: calc(100cqw - 32px); max-height: min(560px, calc(100vh - 200px)); overflow-y: auto; }
.document-menu-content, .document-menu-content * { box-sizing: border-box; }
.is-dragging, .is-dragging * { transition: none !important; user-select: none !important; cursor: col-resize !important; }

.sidebar {
  flex-shrink: 0;
  height: 100%; background: color-mix(in srgb, var(--theme-surface) 84%, var(--theme-bg)); backdrop-filter: none;
  border-right: var(--theme-border); display: flex; flex-direction: column; overflow: hidden;
  transition: width var(--motion-page) var(--ease-emphasized), opacity var(--motion-slow) var(--ease-standard); z-index: 20;
  container-name: library-sidebar;
  container-type: inline-size;
}
.is-dark .sidebar { background: color-mix(in srgb, var(--theme-surface) 90%, var(--theme-bg)); border-right: 1px solid rgba(255, 255, 255, 0.08); }
.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }

/* === 顶部 Tabs 优化 === */
.sidebar-tabs-header {
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px;
  padding: 6px; flex-shrink: 0; overflow: hidden;
}
.icon-tab {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  width: 100%; min-width: 0; height: 34px; padding: 0 4px;
  box-sizing: border-box;
  border-radius: var(--theme-radius-sm); cursor: pointer;
  border: 0; font: inherit; background: transparent; color: var(--theme-text, #1d1d1f);
  opacity: 0.55; overflow: hidden;
  transition: background var(--motion-base) var(--ease-standard),
              color var(--motion-base) var(--ease-standard),
              opacity var(--motion-base) var(--ease-standard),
              transform var(--motion-base) var(--ease-emphasized);
}
.icon-tab:hover { opacity: 0.8; background: rgba(0,0,0,0.05); }
.icon-tab.active {
  opacity: 1; background: rgba(0,0,0,0.08); transform: translateY(-1px);
}
.icon-tab :deep(svg) { flex: none; transition: transform var(--motion-base) var(--ease-emphasized); }
.icon-tab.active :deep(svg) { transform: scale(1.08); }
.icon-tab-text {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.icon-tab:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
.is-dark .icon-tab:hover { background: rgba(255,255,255,0.08); }
.is-dark .icon-tab.active { background: rgba(255,255,255,0.12); }

@media (prefers-reduced-motion: reduce) {
  .icon-tab, .icon-tab :deep(svg), .icon-tab-text { transition-duration: 0.01ms; }
}

.sidebar-tab-content { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.tab-pane { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard); }
.tab-fade-leave-active { position: absolute; inset: 0; width: 100%; pointer-events: none; }
.tab-fade-enter-from { opacity: 0; transform: translateY(3px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-3px); }

.sidebar-header { padding: 6px 8px; flex-shrink: 0; border-bottom: var(--theme-border); }
.sidebar-header .toolbar-area { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sidebar-header .toolbar-area > .n-button { flex-shrink: 0; }
.search-area { display: grid; gap: 7px; }.search-control-row { display: grid; grid-template-columns: minmax(0,1fr) 30px; align-items: center; gap: 4px; }.search-format-filter { width: 100%; }

.rename-editor { display: grid; gap: 9px; padding-top: 4px; }
.rename-editor label { font-size: 12px; font-weight: 700; color: var(--theme-text); }
.rename-feedback { min-height: 18px; margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-tertiary); }
.rename-feedback.is-error { color: var(--theme-danger, #d03050); }
.rename-feedback.is-warning { color: var(--theme-warning, #b26a00); }
.is-dark .rename-feedback.is-warning { color: #f0b45a; }
.rename-confirmation { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid rgba(178, 106, 0, 0.28); border-radius: var(--theme-radius-sm); background: rgba(245, 166, 35, 0.09); color: var(--theme-text); }
.rename-confirmation strong { font-size: 12px; }
.rename-confirmation span { font-size: 12px; line-height: 1.5; color: var(--text-secondary); }

.file-style-modal { width: min(520px, calc(100vw - 28px)); }
.file-style-editor { display: grid; gap: 16px; max-height: calc(100dvh - 210px); overflow-y: auto; padding: 3px; }
.file-style-preview-heading { display: grid; gap: 3px; font-size: 12px; color: var(--theme-text); }
.file-style-preview-heading span { color: var(--theme-text-secondary); font-size: 11px; line-height: 1.5; }
.file-style-preview {
  min-height: 46px; display: flex; align-items: center; gap: 9px; padding: 8px 12px;
  box-sizing: border-box; overflow: hidden; border: var(--theme-border);
  border-radius: var(--theme-radius-sm); background: var(--theme-surface); color: var(--theme-text);
  font-size: 13px; font-weight: 650;
}
.file-style-preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-style-preview .n-icon { flex: none; }
.file-style-previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.file-style-previews small { display: block; margin-bottom: 5px; color: var(--theme-text-secondary); }
.file-style-preview.is-selected { position: relative; }
.file-style-preview.is-selected::after { content: ''; position: absolute; left: 3px; top: 8px; bottom: 8px; width: 2px; border-radius: 999px; background: var(--preview-accent); }
.file-selection-options { display: flex; flex-wrap: wrap; gap: 6px; }
.file-selection-options button, .file-selection-colors button { min-height: 30px; padding: 0 9px; border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-surface); cursor: pointer; font: inherit; font-size: 12px; }
.file-selection-options button.active { color: var(--theme-primary); border-color: var(--theme-primary); background: var(--workspace-control-hover-bg); }
.file-selection-colors { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.file-selection-colors label { display: grid; gap: 5px; font-size: 11px; color: var(--theme-text-secondary); }
.file-selection-colors label > div { display: flex; gap: 5px; align-items: center; }
.file-selection-colors input { width: 32px; height: 30px; padding: 2px; border: var(--theme-border); border-radius: 5px; background: var(--theme-surface); cursor: pointer; }
.file-selection-colors :disabled { cursor: default; opacity: .4; }
.file-style-help { margin: 0; font-size: 11px; color: var(--theme-text-secondary); line-height: 1.6; }
.file-style-section { display: grid; gap: 10px; padding-top: 14px; border-top: var(--theme-border); }
.file-style-section > label { color: var(--theme-text); font-size: 12px; font-weight: 700; }
.file-color-options, .file-icon-options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.file-color-swatch, .file-icon-options button, .file-color-options input[type="color"] {
  width: 34px; height: 34px; padding: 0; box-sizing: border-box;
  border: var(--theme-border); border-radius: 7px;
  background: var(--theme-surface); color: var(--theme-text-secondary); cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-emphasized), box-shadow var(--motion-fast) var(--ease-standard);
}
.file-color-swatch.default { width: 48px; font-size: 11px; }
.file-color-swatch.active, .file-icon-options button.active {
  border-color: var(--theme-primary); color: var(--theme-primary);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), .14);
}
.file-color-swatch:hover, .file-icon-options button:hover, .file-color-options input[type="color"]:hover { transform: translateY(-1px); }
.file-icon-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); }
.file-icon-options button { display: grid; place-items: center; width: 100%; height: 50px; padding: 5px 2px; gap: 3px; }
.file-icon-options button > span { font-size: 11px; }
.file-color-options input[type="color"] { overflow: hidden; }
.file-color-options input[type="color"]::-webkit-color-swatch-wrapper { padding: 3px; }
.file-color-options input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 4px; }
.file-style-actions { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; }
.file-color-swatch:focus-visible, .file-icon-options button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 3px; }
@media (max-width: 400px) { .file-style-actions { grid-template-columns: 1fr 1fr; } .file-style-actions > span { display: none; } .file-style-actions > :first-child { grid-column: 1 / -1; justify-self: start; } }

.tree-viewport {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  border: 2px solid transparent;
  transition: background-color var(--motion-base) var(--ease-standard), border-color var(--motion-base) var(--ease-standard);
  animation: treeContainerFade var(--motion-page) var(--ease-premium);
}

.tree-viewport.drop-active {
  background: rgba(var(--theme-primary-rgb), 0.05);
  border-color: rgba(var(--theme-primary-rgb), 0.35);
  border-radius: var(--theme-radius);
}

/* One row owns every visual state; content and switcher never paint a second surface. */
.library-file-tree :deep(.n-tree-node-wrapper) {
  padding-block: calc(var(--file-row-gap) / 2);
}
.library-mode .library-file-tree :deep(.n-tree-node) {
  --tree-row-fill: var(--file-row-bg);
  --tree-row-text: var(--theme-text);
  --tree-row-accent: var(--theme-primary);
  position: relative;
  box-sizing: border-box;
  min-height: var(--file-row-height);
  margin-block: 0;
  --n-line-offset-top: calc(var(--file-row-gap) / -2);
  --n-line-offset-bottom: calc(var(--file-row-gap) / -2);
  background: var(--tree-row-fill);
  color: var(--tree-row-text);
  transition: background-color var(--motion-base) var(--ease-standard), border-color var(--motion-base) var(--ease-standard), box-shadow var(--motion-base) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}
.library-file-tree :deep(.n-tree-node-content) {
  flex: 1;
  min-width: 0;
  min-height: calc(var(--file-row-height) - 2px);
  overflow: hidden;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  transition: color var(--motion-fast) var(--ease-standard);
}
.library-file-tree :deep(.n-tree-node-content::before),
.library-file-tree :deep(.n-tree-node-content::after) { content: none; }

.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style) {
  --tree-row-fill: var(--file-marker-bg);
  --tree-row-text: var(--file-marker-text);
  --tree-row-accent: var(--file-marker-accent);
}
.library-mode .library-file-tree :deep(.n-tree-node:not(.n-tree-node--disabled):hover),
.library-mode .library-file-tree :deep(.n-tree-node.n-tree-node--selectable:not(.n-tree-node--disabled):not(.n-tree-node--selected):active),
.library-mode .library-file-tree :deep(.n-tree-node--pending:not(.n-tree-node--selected)) {
  background: color-mix(in srgb, var(--theme-primary) 6%, var(--tree-row-fill));
  border-color: rgba(var(--theme-primary-rgb), .16);
  box-shadow: var(--file-row-hover-shadow);
}
.library-mode .library-file-tree :deep(.n-tree-node.n-tree-node--selected) {
  background: color-mix(in srgb, var(--theme-primary) 12%, var(--tree-row-fill));
  border-color: rgba(var(--theme-primary-rgb), .24);
  color: var(--theme-primary);
  font-weight: 600;
}
.library-mode .library-file-tree :deep(.n-tree-node.n-tree-node--selected:hover) {
  background: color-mix(in srgb, var(--theme-primary) 16%, var(--tree-row-fill));
}
.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style.n-tree-node--selected),
.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style.n-tree-node--selected:hover) {
  background: var(--file-marker-selected-bg);
  color: var(--file-marker-selected-text);
  --tree-row-accent: var(--file-marker-selected-accent);
  border-color: transparent;
}
.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style.selection-outline.n-tree-node--selected) {
  border: 1px solid var(--file-marker-selected-accent);
}
.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style .n-tree-node-content__prefix svg) { color: var(--tree-row-text); }
.library-mode .library-file-tree :deep(.n-tree-node.has-file-display-style.n-tree-node--selected .n-tree-node-content__prefix svg) { color: var(--file-marker-selected-text); stroke: currentColor; }

.library-file-tree :deep(.n-tree-node::after) {
  content: "";
  position: absolute;
  left: 3px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 999px;
  background: var(--tree-row-accent);
  pointer-events: none;
  opacity: 0;
  transform: scaleY(.45);
  transition: opacity var(--motion-fast) var(--ease-standard), transform var(--motion-base) var(--ease-emphasized);
}
.library-file-tree :deep(.n-tree-node--selected::after) { opacity: 1; transform: scaleY(1); }
.library-file-tree :deep(.n-tree-node.has-file-display-style:not(.n-tree-node--selected)::after) { opacity: .35; transform: scaleY(.8); }
.library-file-tree:focus-visible :deep(.n-tree-node--pending) { outline: 2px solid var(--theme-primary); outline-offset: -2px; }

.library-file-tree :deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.library-file-tree :deep(.n-tree-node[data-tree-depth="0"] .n-tree-node-indent::before),
.library-file-tree :deep(.n-tree-node[data-tree-depth="0"] .n-tree-node-indent::after) { content: none; }
.library-file-tree :deep(.n-tree-node[data-drop-dir="true"] .n-tree-node-content__text) { font-weight: 600; }
.library-file-tree :deep(.n-tree-node-content__prefix) {
  flex-shrink: 0;
  transition: transform var(--motion-base) var(--ease-emphasized);
}
.library-file-tree :deep(.n-tree-node:hover .n-tree-node-content__prefix),
.library-file-tree :deep(.n-tree-node--pending .n-tree-node-content__prefix) {
  transform: translateY(var(--file-row-icon-lift)) scale(var(--file-row-icon-scale));
}
.library-mode .library-file-tree :deep(.n-tree-node.is-drop-inside),
.library-mode .library-file-tree :deep(.n-tree-node.is-drop-inside:hover) {
  background: color-mix(in srgb, var(--theme-primary) 24%, var(--tree-row-fill));
  border-color: var(--theme-primary);
  color: var(--theme-primary);
  font-weight: 600;
}
.library-file-tree :deep(.n-tree-node.is-drop-before::before),
.library-file-tree :deep(.n-tree-node.is-drop-after::after) {
  content: "";
  position: absolute;
  left: 36px;
  right: 12px;
  width: auto;
  height: 2px;
  background: var(--theme-primary);
  z-index: 10;
  pointer-events: none;
  border-radius: 999px;
  transform: none;
  opacity: 1;
  transition: none;
}
.library-file-tree :deep(.n-tree-node.is-drop-before::before) { top: -2px; bottom: auto; }
.library-file-tree :deep(.n-tree-node.is-drop-after::after) { bottom: -2px; top: auto; }
.file-dragging .library-file-tree :deep(.n-tree-node),
.file-dragging .library-file-tree :deep(.n-tree-node-content__prefix),
.file-dragging .library-file-tree :deep(.n-tree-motion-wrapper) { transition: none !important; animation: none !important; user-select: none; }
.file-dragging .library-file-tree :deep(.n-tree-node-content__prefix) { transform: none !important; }
.file-dragging .library-file-tree :deep(.n-tree-node.is-drag-source) { opacity: .55; }

/* Rotate the inner arrow while the switcher's hit area stays still. */
.library-file-tree :deep(.n-tree-node-switcher) { align-self: center; transform: none; }
.library-file-tree :deep(.n-tree-node-switcher__icon) {
  transition: transform var(--motion-base) var(--ease-emphasized), color var(--motion-fast) var(--ease-standard);
}
.library-file-tree :deep(.n-tree-node-switcher--expanded > .n-tree-node-switcher__icon) { transform: rotate(90deg); }
.library-file-tree :deep(.n-tree-node-switcher:hover .n-tree-node-switcher__icon) { color: var(--theme-primary); }
.library-file-tree :deep(.n-tree-motion-wrapper[class*="-active"]) {
  transition-duration: var(--motion-base);
  transition-timing-function: var(--ease-standard);
}
@media (prefers-reduced-motion: reduce) {
  .library-file-tree :deep(.n-tree-node),
  .library-file-tree :deep(.n-tree-node::after),
  .library-file-tree :deep(.n-tree-node-content__prefix),
  .library-file-tree :deep(.n-tree-node-switcher__icon),
  .library-file-tree :deep(.n-tree-motion-wrapper[class*="-active"]) { transition-duration: 1ms; }
}

.quick-pane { padding: 8px 0; overflow-y: auto; }
.collections-pane { overflow-y: auto; }.collection-list { display: grid; padding: 5px 10px 14px; }.collection-row { min-height: 54px; display: grid; grid-template-columns: minmax(0,1fr) 28px; align-items: center; gap: 4px; border-bottom: var(--theme-border); }.collection-open { min-width: 0; height: 100%; display: grid; grid-template-columns: 22px minmax(0,1fr); align-items: center; gap: 8px; padding: 6px 2px; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.collection-open:hover { color: var(--theme-primary); }.collection-open>svg { width: 15px; color: var(--theme-primary); }.collection-open>span { min-width: 0; display: grid; gap: 3px; }.collection-open strong,.collection-open small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.collection-open strong { font-size: var(--text-compact); }.collection-open small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.tags-pane { overflow-y: auto; }

.sidebar-panel-intro {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 2px 8px;
  margin: 10px;
  padding: 11px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.16);
  border-radius: 7px;
  background: rgba(var(--theme-primary-rgb), 0.045);
}
.sidebar-panel-intro > svg { grid-row: 1 / 3; align-self: start; margin-top: 2px; color: var(--theme-primary); }
.sidebar-panel-intro > div { min-width: 0; display: grid; gap: 4px; }
.sidebar-panel-intro strong { color: var(--theme-text); font-size: 12px; }
.sidebar-panel-intro span { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.sidebar-panel-intro small { grid-column: 2; width: fit-content; padding: 2px 6px; border-radius: 4px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.1); font-size: var(--text-compact); font-weight: 700; }
.sidebar-panel-intro code { color: var(--theme-primary); font-size: inherit; }
.collections-action { display: grid; gap: 7px; margin: 0 10px 8px; padding: 9px 10px; border-bottom: var(--theme-border); }
.collections-action > span { overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }
.collections-action .n-button { justify-self: stretch; }

.panel-guide {
  margin: 10px 12px;
  padding: 9px 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.12);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: rgba(var(--theme-primary-rgb), 0.04);
  font-size: var(--text-compact);
  line-height: 1.55;
}
.panel-guide.compact-guide { margin-top: 8px; margin-bottom: 4px; }

.tag-add-area { display: grid; gap: 6px; margin: 0 10px 12px; }
.tag-add-area > span { color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }
.tag-add-row { display: flex; gap: 8px; }
.tag-add-row .n-input { flex: 1; }

.tags-manage { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 14px; }
.knowledge-search-results { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px 14px; overflow-y: auto; }
.knowledge-search-result { display: grid; grid-template-columns: minmax(0,1fr); gap: 6px; width: 100%; box-sizing: border-box; padding: 8px; border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.035); }
.knowledge-search-result:hover { border-color: rgba(var(--theme-primary-rgb),.3); background: rgba(var(--theme-primary-rgb),.08); }
.knowledge-result-open { min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 5px; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; font: inherit; }
.knowledge-result-open:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 3px; border-radius: var(--theme-radius-sm); }
.search-return-button { margin: 6px 10px; padding: 7px; border: var(--theme-border); border-radius: 6px; background: transparent; color: var(--theme-primary); cursor: pointer; font: inherit; text-align: left; }
.search-return-button:focus-visible { outline: 2px solid var(--theme-primary); }
.knowledge-search-result.is-search-selected { box-shadow: inset 3px 0 var(--theme-primary); background: color-mix(in srgb, var(--theme-primary) 9%, transparent); }
.knowledge-preview-button { justify-self: start; padding: 5px 9px; border: var(--theme-border); border-radius: 6px; background: transparent; color: var(--theme-primary); font: inherit; cursor: pointer; }
.knowledge-preview-button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
.knowledge-search-count { margin: 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.knowledge-result-group { min-width: 0; margin-bottom: 8px; border-bottom: var(--theme-border); }
.knowledge-result-group-label { margin: 0; padding: 6px 10px; color: var(--theme-text-secondary); background: var(--theme-surface); font-size: var(--text-compact); line-height: 1.5; }
.knowledge-result-summary { min-width: 0; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.knowledge-result-summary summary { cursor: pointer; padding: 5px 0; color: var(--theme-primary); }
.knowledge-result-summary summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
.knowledge-result-summary p { margin: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; line-height: 1.6; }
.knowledge-search-result > .relation-summary { justify-self: start; max-width: 100%; white-space: normal; text-align: left; }
.graph-collection-state { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 10px; border-bottom: var(--theme-border); background: rgba(var(--theme-primary-rgb),.055); }.graph-collection-state>span { min-width: 0; display: grid; gap: 2px; }.graph-collection-state strong,.graph-collection-state small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.graph-collection-state strong { font-size: var(--text-compact); }.graph-collection-state small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.graph-collection-state button { width: 26px; height: 26px; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 16px; }
.knowledge-result-path { overflow-wrap: anywhere; white-space: normal; }
.knowledge-result-head { display: flex; flex-direction: column; align-items: stretch; gap: 4px; width: 100%; min-width: 0; }.knowledge-result-head strong { display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: var(--text-body, 13px); line-height: 1.45; }.knowledge-result-head i { color: var(--theme-primary); font-size: var(--text-compact); font-style: normal; font-weight: 700; overflow-wrap: anywhere; }
.knowledge-result-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.knowledge-search-result small { color: var(--theme-primary); font-size: var(--text-compact); }
.knowledge-index-strip { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.knowledge-index-strip > small { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: inherit; }
.knowledge-index-strip.state-stale, .knowledge-index-strip.state-corrupt, .knowledge-index-strip.state-error { color: var(--warning-color, #a66513); }
.knowledge-index-actions { display: flex; align-items: center; flex-shrink: 0; }

.tag-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text);
  background: var(--theme-surface);
  text-align: left;
  cursor: pointer;
  transition: all var(--motion-base) var(--ease-premium);
  font-size: 13px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.1);
  position: relative;
  overflow: hidden;
}

.tag-row::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    transparent 60%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.tag-row:hover {
  background: rgba(var(--theme-primary-rgb), 0.06);
  border-color: rgba(var(--theme-primary-rgb), 0.15);
  transform: translateX(2px);
}

.tag-row:hover::before { opacity: 1; }

.tag-name {
  flex: 1;
  font-weight: 600;
  position: relative;
  z-index: 1;
}

.tag-count {
  font-size: 11px;
  opacity: 0.55;
  font-weight: 600;
  position: relative;
  z-index: 1;
}

.is-dark .tag-row:hover { background: rgba(255,255,255,0.06); }

.recent-files {
  padding: 10px 14px 6px;
  border-bottom: var(--theme-border);
}

.recent-files:last-child { border-bottom: none; }

.recent-header {
  font-size: var(--text-compact);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.45;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.recent-header::before {
  content: "";
  width: 3px;
  height: 12px;
  border-radius: 999px;
  background: var(--theme-primary);
  opacity: 0.5;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all var(--motion-base) var(--ease-premium);
  border: 1px solid transparent;
  position: relative;
}

.recent-item::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.06),
    transparent);
  opacity: 0;
  border-radius: var(--theme-radius-sm);
  transition: opacity var(--motion-base) var(--ease-standard);
}

.recent-item:hover {
  background: rgba(var(--theme-primary-rgb), 0.05);
  border-color: rgba(var(--theme-primary-rgb), 0.12);
  transform: translateX(2px);
}

.recent-item:hover::before { opacity: 1; }

.recent-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.is-dark .recent-files { border-bottom-color: rgba(255,255,255,0.06); }
.is-dark .recent-item:hover { background: rgba(255,255,255,0.06); }

/* 链接面板 */
.links-content { padding: 12px; overflow-y: auto; }
.relation-overview {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.16);
  border-radius: 7px;
  background: rgba(var(--theme-primary-rgb), 0.045);
}
.relation-overview > div:first-child { min-width: 0; display: grid; gap: 4px; }
.relation-overview strong { color: var(--theme-text); font-size: 12px; }
.relation-overview span { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.relation-overview code, .links-empty code { color: var(--theme-primary); font-size: inherit; }
.relation-counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.relation-counts span { padding: 7px; border-radius: 5px; background: var(--theme-surface); text-align: center; }
.relation-counts b { color: var(--theme-primary); font-size: 13px; }
.relation-overview > button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.25);
  border-radius: 6px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.07);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}
.relation-overview > button:hover { background: rgba(var(--theme-primary-rgb), 0.13); }
.links-section { margin-bottom: 18px; }

.links-section-title {
  font-size: 11px;
  font-weight: 800;
  opacity: 0.5;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.links-section-title::before {
  content: "";
  width: 3px;
  height: 12px;
  border-radius: 999px;
  background: var(--theme-primary);
  opacity: 0.6;
}

.link-item {
  padding: 7px 12px;
  font-size: 13px;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  color: var(--theme-primary);
  transition: all var(--motion-base) var(--ease-premium);
  border: 1px solid transparent;
  position: relative;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-item::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    transparent);
  opacity: 0;
  border-radius: var(--theme-radius-sm);
  transition: opacity var(--motion-base) var(--ease-standard);
}

.link-item:hover {
  background: rgba(var(--theme-primary-rgb), 0.06);
  border-color: rgba(var(--theme-primary-rgb), 0.15);
  transform: translateX(2px);
}

.link-item:hover::before { opacity: 1; }

.links-empty { font-size: 12px; opacity: 0.45; padding: 10px 0; }

.backlink-item {
  padding: 10px 12px;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all var(--motion-base) var(--ease-premium);
  margin-bottom: 6px;
  border: 1px solid transparent;
  position: relative;
}

.backlink-item::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.06),
    transparent);
  opacity: 0;
  border-radius: var(--theme-radius-sm);
  transition: opacity var(--motion-base) var(--ease-standard);
}

.backlink-item:hover {
  background: rgba(var(--theme-primary-rgb), 0.05);
  border-color: rgba(var(--theme-primary-rgb), 0.12);
  transform: translateX(2px);
}

.backlink-item:hover::before { opacity: 1; }

.bl-title {
  font-size: 13px;
  font-weight: 650;
  position: relative;
  z-index: 1;
}

.bl-context {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.is-dark .link-item:hover,
.is-dark .backlink-item:hover {
  background: rgba(255,255,255,0.05);
}

/* 标签云 */
.tag-cloud { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px; }

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 999px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    rgba(var(--theme-primary-rgb), 0.04));
  cursor: pointer;
  transition: all var(--motion-base) var(--ease-premium);
  color: var(--theme-text);
  opacity: 0.75;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.12);
  font-weight: 600;
}

.tag-badge:hover {
  background: linear-gradient(135deg,
    var(--theme-primary),
    rgba(var(--theme-primary-rgb), 0.85));
  color: #fff;
  opacity: 1;
  transform: translateY(-1px);
  box-shadow: var(--theme-shadow-sm);
}

.tag-badge small { font-size: var(--text-compact); opacity: 0.65; }

.is-dark .tag-badge {
  background: linear-gradient(135deg,
    rgba(255,255,255,0.08),
    rgba(255,255,255,0.04));
}


.empty-state-hint {
  padding: 70px 20px;
  opacity: 0.65;
  animation: slideUp 0.7s var(--ease-premium) both;
}

.manual-outline-box {
  padding: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.outline-tree-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
}

/* 极致紧凑样式覆盖 */
.compact-outline-tree :deep(.n-tree-node) {
  margin-top: 2px;
  align-items: center;
  animation: slideUp 0.45s var(--ease-premium) both;
}

/* 阶梯延迟：前 12 个标题依次滑入 */
.compact-outline-tree :deep(.n-tree-node:nth-child(1)) { animation-delay: 0.03s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(2)) { animation-delay: 0.06s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(3)) { animation-delay: 0.09s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(4)) { animation-delay: 0.12s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(5)) { animation-delay: 0.15s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(n+6)) { animation-delay: 0.18s; }

.compact-outline-tree :deep(.n-tree-node-content) {
  padding: 4px 8px !important;
  min-height: 30px !important;
  font-size: 13px !important;
  border-radius: var(--theme-radius-sm);
  transition: all var(--motion-base) var(--ease-premium) !important;
  overflow: hidden;
  position: relative;
}

.compact-outline-tree :deep(.n-tree-node-content::before) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-sm);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.1),
    transparent 60%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

.compact-outline-tree :deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  position: relative;
  z-index: 1;
}

.compact-outline-tree :deep(.n-tree-node-content:hover) {
  background: rgba(var(--theme-primary-rgb), 0.08) !important;
  transform: translateX(3px);
  color: var(--theme-primary);
  font-weight: 600;
}

.compact-outline-tree :deep(.n-tree-node-content:hover::before) {
  opacity: 1;
}

.compact-outline-tree :deep(.n-tree-node-content.n-tree-node-content--selected) {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.15) 0%,
    rgba(var(--theme-primary-rgb), 0.1) 100%) !important;
  color: var(--theme-primary) !important;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgba(var(--theme-primary-rgb), 0.25);
}

.compact-outline-tree :deep(.n-tree-node-content.n-tree-node-content--selected::after) {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.7) 100%);
  box-shadow: 0 0 6px rgba(var(--theme-primary-rgb), 0.5);
}

.compact-outline-tree :deep(.n-tree-node-indent) { width: 14px !important; }
.compact-outline-tree :deep(.n-tree-node-switcher) {
  width: 18px !important;
  height: 18px !important;
  transition: transform var(--motion-base) var(--ease-emphasized);
}

.compact-outline-tree :deep(.n-tree-node-switcher:hover) {
  transform: scale(1.15);
}
/* === 历史面板深度优化 === */
.history-box { padding: 12px 16px; height: 100%; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; min-height: 0; }
.history-header { display: flex; align-items: center; justify-content: space-between; }
.history-title-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #86868b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.clear-all-btn { opacity: 0.6; transition: all 0.3s; }
.clear-all-btn:hover { opacity: 1; color: #f5222d; transform: rotate(15deg); }

.history-bubbles-wrapper { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 20px; }

.history-bubble {
  position: relative; padding: 12px 14px; background: var(--theme-card);
  border: var(--theme-border); border-radius: var(--theme-radius);
  cursor: pointer; transition: all 0.4s var(--ease-premium);
  display: flex; gap: 12px; box-shadow: var(--theme-shadow-sm);
  animation: bubblePop 0.5s var(--ease-premium) both;
  overflow: hidden; flex-shrink: 0;
}
.is-dark .history-bubble { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.06); }

/* 侧边装饰线 */
.bubble-accent-line {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--theme-primary); opacity: 0; transition: all 0.3s;
}

.history-bubble:hover {
  background: var(--theme-card);
  transform: translateX(4px) scale(1.01);
  border-color: rgba(var(--theme-primary-rgb), 0.1);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.04);
}
.is-dark .history-bubble:hover { background: rgba(255, 255, 255, 0.08); }
.history-bubble:hover .bubble-accent-line { opacity: 1; height: 100%; }

.bubble-content { flex: 1; min-width: 0; z-index: 2; }
.bubble-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.bubble-time { font-size: 13px; font-weight: 800; color: var(--theme-text); font-variant-numeric: tabular-nums; }
.bubble-meta { 
  font-size: var(--text-compact); font-weight: 700; color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.08); padding: 2px 8px; border-radius: 20px;
  backdrop-filter: none; transition: all 0.3s;
}
.history-bubble:hover .bubble-meta { background: var(--theme-primary); color: #fff; }

.bubble-preview { 
  font-size: 12px; color: var(--theme-text); opacity: 0.5; line-height: 1.5; 
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; 
  overflow: hidden; word-break: break-all; transition: all 0.3s;
}
.history-bubble:hover .bubble-preview { opacity: 0.8; }

.bubble-actions {
  opacity: 0; transition: all 0.3s var(--ease-premium);
  transform: scale(0.8) rotate(-20deg);
}
.history-bubble:hover .bubble-actions { opacity: 1; transform: scale(1) rotate(0deg); }

/* 阶梯加载动效 */
.history-bubble:nth-child(1) { animation-delay: 0.05s; }
.history-bubble:nth-child(2) { animation-delay: 0.1s; }
.history-bubble:nth-child(3) { animation-delay: 0.15s; }
.history-bubble:nth-child(4) { animation-delay: 0.2s; }

/* === 底部 Footer === */
.lib-stats-bar { display: flex; justify-content: space-between; padding: 6px 16px; font-size: 11px; opacity: 0.5; border-top: var(--theme-border); }
.is-dark .lib-stats-bar { border-top-color: rgba(255,255,255,0.05); }

/* Git 状态 */
.git-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 16px; font-size: 11px; border-top: var(--theme-border); }
.git-status-info { display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; }
.git-branch { font-weight: 600; opacity: 0.7; }
.git-ahead { color: #f5a623; }
.git-behind { color: #4a90d9; }
.git-dirty { opacity: 0.5; }
.git-actions { display: flex; gap: 2px; }
.git-status-hint { display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 11px; opacity: 0.6; cursor: pointer; }
.is-dark .git-status-bar { border-top-color: rgba(255,255,255,0.05); }
.sidebar-actions { padding: 0 12px; }
.sidebar-actions .n-button { width: 100%; justify-content: flex-start; font-size: 12px; }
.sidebar-footer-container { padding: 12px; flex-shrink: 0; }
.sidebar-footer {
  display: flex; align-items: center; gap: 12px; padding: calc(10px * var(--theme-spacing));
  background: var(--theme-card);
  backdrop-filter: var(--theme-glass);
  border-radius: var(--theme-radius);
  border: var(--theme-border);
  box-shadow: var(--theme-shadow);
  cursor: pointer;
  transition: all 0.4s var(--ease-premium);
}

.is-dark .sidebar-footer { background: var(--theme-card); border-color: rgba(var(--theme-primary-rgb), 0.7); }
.sidebar-footer:hover { transform: translateY(-2px); background: var(--theme-card); box-shadow: var(--theme-shadow); border-color: var(--theme-primary); }
.is-dark .sidebar-footer:hover { background: var(--theme-card); }

.settings-icon-box { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.03); border-radius: var(--theme-radius-sm); transition: all 0.3s var(--ease-premium); color: var(--theme-text); opacity: 0.8; }
.is-dark .settings-icon-box { background: rgba(255, 255, 255, 0.06); }
.sidebar-footer:hover .settings-icon-box { background: rgba(0, 122, 255, 0.1); color: var(--theme-primary); opacity: 1; }
.rotating-settings { transition: transform 0.8s var(--ease-premium); }
.sidebar-footer:hover .rotating-settings { transform: rotate(180deg); }

.lib-info-box { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lib-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.lib-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.3; transition: opacity 0.3s; }
.sidebar-footer:hover .lib-label { opacity: 0.5; }
.lib-status-dot { width: 6px; height: 6px; background: #42b883; border-radius: 50%; box-shadow: 0 0 8px rgba(66, 184, 131, 0.4); }
.app-version-badge {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: auto;
  padding: 2px 6px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.3);
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.08);
  color: var(--theme-primary);
  font-size: var(--text-compact);
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
}

.tags-help strong { color: var(--theme-text); font-size: 12px; }
.tags-help span { color: var(--theme-text-secondary); }
.app-version-badge:hover,
.app-version-badge:focus-visible {
  border-color: rgba(var(--theme-primary-rgb), 0.65);
  background: rgba(var(--theme-primary-rgb), 0.15);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), 0.12);
  outline: none;
}
.app-version-badge.has-update { color: var(--theme-warning, #d97706); border-color: color-mix(in srgb, var(--theme-warning, #d97706) 45%, transparent); }
.version-channel {
  padding-left: 3px;
  border-left: 1px solid color-mix(in srgb, currentColor 28%, transparent);
  font-size: 0.78em;
  font-weight: 900;
  text-transform: uppercase;
}
.version-update-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 14%, transparent);
}
.meta-path { font-size: 13px; font-weight: 700; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.9; }
.footer-chevron { font-size: 14px; opacity: 0.2; transition: all 0.3s; transform: translateX(-4px); }
.sidebar-footer:hover .footer-chevron { opacity: 0.6; transform: translateX(0); }

@container library-sidebar (max-width: 230px) {
  .sidebar-footer-container { padding: 8px; }
  .sidebar-footer {
    gap: 8px;
    min-height: 56px;
    padding: 8px;
  }
  .settings-icon-box {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
  }
  .lib-name-row { gap: 4px; }
  .lib-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0;
  }
  .lib-status-dot,
  .footer-chevron { display: none; }
  .app-version-badge {
    margin-left: 0;
    padding: 2px 5px;
  }
  .meta-path { font-size: var(--text-body-sm); }
}

.resizer-area { position: relative; flex: none; width: max(1px, var(--surface-panel-gap, 0px)); height: 100%; z-index: 100; cursor: col-resize; }
.resizer-area::before { content: ''; position: absolute; top: 0; bottom: 0; left: calc(50% - .5px); width: 1px; background: rgba(var(--theme-primary-rgb), .12); pointer-events: none; }
.resizer-area:hover::before { background: var(--theme-primary); }
.drag-handle { position: absolute; top: 0; left: 50%; width: 17px; bottom: 0; transform: translateX(-50%); z-index: 101; cursor: col-resize; touch-action: none; }
.drag-handle:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: -6px; }
.collapse-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 24px; height: 48px; background: var(--theme-card); color: var(--theme-text); border: var(--theme-border); box-shadow: var(--theme-shadow-sm); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 150; transition: all 0.3s var(--ease-premium); }
.collapse-btn:hover { background: var(--theme-primary); color: #fff; transform: translateY(-50%) scale(1.1); }
.collapse-btn.left { left: 50%; border-radius: 0 var(--theme-radius) var(--theme-radius) 0; }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; padding: 0 4px 4px; }
.local-graph-rail { width: clamp(300px,28vw,380px); height: 100%; min-width: 0; min-height: 0; flex: none; overflow: auto; box-sizing: border-box; border-left: var(--theme-border); background: color-mix(in srgb,var(--theme-surface) 97%,transparent); box-shadow: -8px 0 24px rgba(0,0,0,.06); }.local-graph-rail > header { position: sticky; z-index: 2; top: 0; min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px 7px 14px; box-sizing: border-box; border-bottom: var(--theme-border); background: color-mix(in srgb,var(--theme-surface) 98%,transparent); }.local-graph-rail > header div { min-width: 0; display: grid; gap: 2px; }.local-graph-rail > header strong { font-size: 11px; }.local-graph-rail > header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.local-graph-rail > header button { width: 28px; height: 28px; flex: none; border: 0; border-radius: 5px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 18px; }.local-graph-rail > header button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }
.tabs-bar { display: flex; align-items: center; padding: 0 8px; min-width: 0; border-bottom: var(--theme-border); flex-shrink: 0; }
.tabs-bar :deep(.workspace-tabs) { flex: 1; min-width: 0; }
.embedded-format-capability {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 700;
}

.embedded-format-capability .format-capability-badge {
  max-width: min(220px, 24vw);
  padding-right: 0;
  border-right: 0;
}

.tab-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 8px 4px;
}

.action-btn-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.save-btn {
  transition: all 0.3s var(--ease-premium) !important;
}

.save-btn:hover {
  transform: translateY(-1px);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.save-btn:active {
  transform: scale(0.95);
}

.word-count-info {
  display: inline-flex;
  max-width: min(520px, 42vw);
  align-items: center;
  gap: 6px;
  font-size: var(--text-compact);
  opacity: 0.4;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 6px;
  border-radius: var(--theme-radius-sm);
  transition: all 0.3s ease;
  animation: countFadeIn 0.5s var(--ease-premium);
}

.word-count-info > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.format-capability-badge {
  min-width: 0;
  max-width: 190px;
  overflow: hidden;
  padding-right: 6px;
  border-right: var(--theme-border);
  color: var(--theme-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.format-capability-badge.level-basic-edit,
.format-capability-badge.level-read-annotate {
  color: var(--theme-primary);
}

.format-capability-badge.level-preview-only,
.format-capability-badge.level-external-open,
.format-capability-badge.level-unsupported {
  color: var(--theme-text-secondary);
}

.text-snapshot-badge {
  max-width: 180px;
  overflow: hidden;
  padding-right: 6px;
  border-right: var(--theme-border);
  color: var(--theme-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-dark .word-count-info {
  background: rgba(255, 255, 255, 0.08);
}

@keyframes countFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 0.4; transform: translateY(0); }
}

.editor-viewport { flex: 1; position: relative; background: #fff; border-radius: var(--theme-radius) var(--theme-radius) 0 0; overflow: visible; display: flex; flex-direction: column; min-height: 0; z-index: 10; }
.is-dark .editor-viewport { background: #1c1c1e; }
.library-embedded-editor {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border: var(--theme-border);
  border-bottom: 0;
  border-radius: var(--theme-radius) var(--theme-radius) 0 0;
  color: var(--theme-text);
  background: var(--theme-bg);
  font-family: inherit;
  font-size: 12px;
}
.library-embedded-editor :deep(> *) {
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: inherit;
  font-family: inherit;
}
.library-embedded-editor :deep(.workspace-tabs),
.library-embedded-editor :deep([title="返回知识库"]) {
  display: none !important;
}
.library-embedded-editor :deep(.cm-editor) {
  font-size: 13px;
}
.library-embedded-editor :deep(.canvas-page),
.library-embedded-editor :deep(.pdf-view),
.library-embedded-editor :deep(.table-view),
.library-embedded-editor :deep(.workbook-view),
.library-embedded-editor :deep(.diagram-studio),
.library-embedded-editor :deep(.mindmap-page) {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: inherit;
}
.library-embedded-editor :deep(.canvas-header),
.library-embedded-editor :deep(.mindmap-header),
.library-embedded-editor :deep(.pdf-toolbar),
.library-embedded-editor :deep(.table-toolbar),
.library-embedded-editor :deep(.workbook-toolbar),
.library-embedded-editor :deep(.studio-toolbar) {
  min-height: var(--workspace-toolbar-height);
  padding-right: var(--space-3);
  padding-left: var(--space-3);
  box-shadow: none;
}
.library-embedded-editor :deep(.yaml-toolbar),
.library-embedded-editor :deep(.xml-workspace > .toolbar),
.library-embedded-editor :deep(.workspace > header) {
  min-height: 48px;
  padding-right: 12px;
  padding-left: 12px;
}
.library-embedded-editor :deep(.document-title strong),
.library-embedded-editor :deep(.document-identity strong),
.library-embedded-editor :deep(.identity strong) {
  font-size: 12px;
  font-weight: 650;
}
.library-embedded-editor :deep(.document-title span),
.library-embedded-editor :deep(.document-identity span),
.library-embedded-editor :deep(.identity span),
.library-embedded-editor :deep(.status-bar),
.library-embedded-editor :deep(footer) {
  font-size: 11px;
}
.vditor-instance { flex: 1; height: 0; overflow: visible !important; }

:deep(.vditor-wysiwyg), :deep(.vditor-preview), :deep(.vditor-panel), :deep(.vditor-reset) { background-color: var(--custom-editor-bg) !important; }
/* 编辑器宽度模式 - 自适应设计 */
.editor-width-narrow :deep(.vditor-reset) {
  max-width: min(65ch, 90vw) !important;
  margin: 0 auto !important;
  padding: 24px clamp(16px, 3vw, 32px) !important;
}

.editor-width-medium :deep(.vditor-reset) {
  max-width: min(80ch, 95vw) !important;
  margin: 0 auto !important;
  padding: 24px clamp(20px, 4vw, 40px) !important;
}

.editor-width-wide :deep(.vditor-reset) {
  max-width: 100% !important;
  margin: 0 !important;
  padding: 24px clamp(40px, 5vw, 80px) !important;
  width: 100% !important;
}

/* 宽模式下容器也要撑满 */
.editor-width-wide :deep(.vditor-content),
.editor-width-wide :deep(.vditor-wysiwyg),
.editor-width-wide :deep(.vditor-ir) {
  max-width: 100% !important;
}

/* 小屏幕优化 */
@media (max-width: 768px) {
  .editor-width-narrow :deep(.vditor-reset),
  .editor-width-medium :deep(.vditor-reset) {
    padding: 16px 20px !important;
  }

  .editor-width-wide :deep(.vditor-reset) {
    padding: 16px 24px !important;
  }
}

/* 响应式布局优化 - 小屏幕断点 */
@media (max-width: 1024px) {
  .local-graph-rail { position: absolute; z-index: 60; top: 0; right: 0; width: min(380px,calc(100% - 16px)); }
  .tabs-bar {
    padding: 8px 8px 0 !important;
  }

}
.mode-toggle { display: flex; gap: 2px; }
.width-toggle { display: flex; gap: 2px; margin-left: 8px; padding-left: 8px; border-left: var(--theme-border); }
.is-dark .width-toggle { border-left-color: rgba(255,255,255,0.08); }
/* Focus mode hides chrome; it must not offset the toolbar or force content
   beyond the available viewport. Keep the normal flex/scroll layout. */

.hero-viewport { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: inherit; z-index: 5; overflow: hidden; }
.ambient-glow {
  position: absolute; inset: 0; z-index: -1; opacity: 0.55;
  background:
    linear-gradient(90deg, rgba(var(--theme-primary-rgb), 0.06) 1px, transparent 1px),
    linear-gradient(180deg, rgba(var(--theme-primary-rgb), 0.04) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at center, black 0%, transparent 68%);
}
.blob { display: none; }

.hero-content { text-align: center; z-index: 10; max-width: 500px; }
.hero-brand { display: flex; justify-content: center; margin-bottom: 20px; animation: heroEntry 1s var(--ease-premium); }
.hero-brand img { width: 64px; height: 64px; display: block; border-radius: 15px; object-fit: cover; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22); }
.hero-title { font-size: 32px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.03em; animation: slideUp 0.8s var(--ease-premium) 0.2s both; }
.hero-subtitle { font-size: 16px; opacity: 0.6; margin-bottom: 32px; animation: slideUp 0.8s var(--ease-premium) 0.4s both; }
.hero-actions { display: flex; gap: 16px; justify-content: center; animation: slideUp 0.8s var(--ease-premium) 0.6s both; }

.drag-ghost { position: fixed; left: 0; top: 0; pointer-events: none !important; z-index: 9999; max-width: min(320px, calc(100vw - 24px)); padding: 8px 12px; background: var(--theme-surface); border: 1px solid var(--theme-primary); border-radius: var(--theme-radius-sm); box-shadow: var(--workspace-shadow-sm); display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--theme-primary); }
.drag-ghost > span { min-width: 0; display: grid; gap: 3px; }
.drag-ghost strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drag-ghost small { color: var(--theme-text); font-size: var(--text-compact); }
.drag-ghost.drop-invalid { border-color: var(--status-danger); color: var(--status-danger); }
.drag-ghost * { pointer-events: none !important; }

@keyframes treeContainerFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bubblePop { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes heroEntry { from { opacity: 0; transform: scale(0.8) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }

/* AI 辅助 */
.ai-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 8px 0; }
.ai-action-btn { height: 56px; font-size: 15px; font-weight: 600; }
.ai-result-content { white-space: pre-wrap; line-height: 1.7; font-size: 14px; color: var(--theme-text); max-height: 400px; overflow-y: auto; }
.external-change-modal { width: min(920px, calc(100vw - 32px)); }
.external-change-summary { display: grid; gap: 5px; color: var(--theme-text); }
.external-change-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.external-change-summary span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.external-change-summary p { margin: 6px 0 0; color: var(--theme-text-secondary); line-height: 1.6; }
:deep(.workspace-task-locator-target) { outline: 2px solid var(--theme-primary); outline-offset: 3px; border-radius: 4px; background: rgba(var(--theme-primary-rgb),.11) !important; scroll-margin-block: 120px; }
:deep(.workspace-relation-evidence-target) { outline: 2px solid var(--theme-primary); outline-offset: 3px; border-radius: 4px; background: rgba(var(--theme-primary-rgb),.14) !important; scroll-margin-block: 120px; }
.external-compare-state { min-height: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--theme-text-secondary); }
.external-compare-state.error { color: var(--status-danger); }
.external-compare-grid { min-height: 0; max-height: 52vh; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.external-compare-grid section { min-width: 0; min-height: 0; display: grid; grid-template-rows: 32px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: var(--theme-bg); }
.external-compare-grid header { display: flex; align-items: center; padding: 0 10px; color: var(--theme-text-secondary); background: var(--theme-surface-2); font-size: var(--text-compact); font-weight: 700; }
.external-compare-grid pre { min-height: 0; margin: 0; padding: 12px; overflow: auto; color: var(--theme-text); background: var(--theme-bg); font: 12px/1.65 var(--font-mono); white-space: pre; }
.external-change-actions { width: 100%; display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; }
@media (max-width: 700px) { .external-compare-grid { grid-template-columns: 1fr; max-height: 58vh; }.external-compare-grid section { min-height: 180px; }.external-change-actions { grid-template-columns: 1fr 1fr; }.external-change-actions span { display: none; } }
</style>

<style scoped>
@media (max-width: 760px) {
  .reference-pinned > .library-workspace { flex-wrap: wrap; }
  .reference-pinned > .library-workspace > .local-graph-rail { display: none; }
  .reference-pinned > .library-workspace > .editor-main { flex: 1 1 100%; height: 60%; min-height: 0; }
  .reference-pinned > .library-workspace > .search-document-preview.pinned, .reference-pinned > .library-workspace > .reference-empty { width: 100%; max-width: 100%; height: 40%; overflow: auto; }
}
@container library-shell (max-width: 760px) {
  .sidebar { position: absolute; left: 0; top: 0; bottom: 0; z-index: 80; max-width: 100%; box-shadow: var(--theme-shadow); }
  .resizer-area { display: none; }
  .library-shell-toolbar { padding: 2px 8px; gap: 4px; }
  .document-toolbar { padding: 6px 8px; }
  .document-reading-status { margin-left: 0; }
}
</style>
