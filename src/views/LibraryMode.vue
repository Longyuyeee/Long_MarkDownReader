<template>
  <div class="library-mode" data-ui-shell="library-editor" :class="{ 'is-dragging': !!activeResizer }" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- 统一左侧侧边栏 -->
    <div class="sidebar" data-ui-region="navigation" :style="{ width: isSidebarCollapsed ? '0px' : sidebarWidth + 'px', opacity: isSidebarCollapsed ? 0 : 1 }" v-if="!store.isZen">
      <div class="sidebar-inner">
        <!-- 侧边栏导航根据可用宽度统一切换文字标签。 -->
        <div
          class="sidebar-tabs-header"
          :class="{ compact: sidebarTabsCompact }"
          :data-layout="sidebarTabsCompact ? 'icons' : 'labels'"
          data-ui-region="sidebar-tabs"
          role="tablist"
          aria-label="侧边栏导航"
        >
          <div
            v-for="tab in sidebarTabs" :key="tab.key"
            class="icon-tab"
            :class="{ active: activeSidebarTab === tab.key }"
            role="tab"
            :id="`tab-${tab.key}`"
            :aria-selected="activeSidebarTab === tab.key"
            :aria-label="tab.label"
            :aria-controls="`panel-${tab.key}`"
            tabindex="0"
            @click="activeSidebarTab = tab.key"
            @keydown.enter="activeSidebarTab = tab.key"
            @keydown.space.prevent="activeSidebarTab = tab.key"
            :title="tab.label"
          >
            <n-icon :component="tab.icon" size="18" />
            <span class="icon-tab-text">{{ tab.label }}</span>
          </div>
        </div>

        <div class="sidebar-tab-content">
          <transition name="tab-fade" mode="out-in">
            <!-- 文件 tree 面板 -->
            <div v-if="activeSidebarTab === 'files'" :key="'files'" class="tab-pane files-pane" role="tabpanel" :id="`panel-files`" :aria-labelledby="`tab-files`">
              <div class="sidebar-header">
                <div class="search-area">
                  <div class="search-control-row">
                    <n-input v-model:value="searchQuery" placeholder="搜索文档..." size="small" round clearable>
                      <template #prefix><n-icon :component="SearchIcon" /></template>
                    </n-input>
                    <n-button quaternary circle size="small" title="保存当前搜索" :disabled="!searchQuery.trim()" @click="saveCurrentSearch">
                      <template #icon><n-icon :component="BookmarkAddIcon" /></template>
                    </n-button>
                  </div>
                  <n-select v-if="searchQuery.trim()" v-model:value="searchObjectTypes" class="search-format-filter" size="tiny" multiple clearable :max-tag-count="1" placeholder="全部格式" :options="searchFormatOptions" />
                </div>
                <div class="toolbar-area">
                  <n-dropdown trigger="click" :options="templateOptions" @select="handleTemplateCreate">
                    <n-button data-testid="library-create-menu" quaternary circle size="small" title="新建笔记或画布">
                      <template #icon><n-icon :component="PlusIcon" /></template>
                    </n-button>
                  </n-dropdown>
                  <n-button quaternary circle size="small" @click="handleToolbarAction('folder')" title="新建文件夹">
                    <template #icon><n-icon :component="FolderPlusIcon" /></template>
                  </n-button>
                  <n-button quaternary circle size="small" @click="createDailyNote" title="今日笔记">
                    <template #icon><n-icon :component="CalendarIcon" /></template>
                  </n-button>
                  <n-button quaternary circle size="small" @click="refreshLibrary" title="刷新列表">
                    <template #icon><n-icon :component="RefreshIcon" /></template>
                  </n-button>
                </div>
              </div>

              <div v-if="store.libraryPath" class="knowledge-index-strip" :class="`state-${knowledgeIndexStatus.state}`" :title="knowledgeIndexExplanation">
                <n-icon :component="DatabaseIcon" />
                <span>{{ knowledgeIndexLabel }}</span>
                <small v-if="knowledgeIndexStatus.state === 'ready'">{{ knowledgeIndexStatus.objectCount }} 个对象 · {{ knowledgeIndexStatus.relationCount }} 条关系</small>
                <small v-else-if="knowledgeIndexStatus.state === 'building'">{{ knowledgeIndexStatus.progress }}%</small>
                <small v-else-if="knowledgeIndexStatus.state === 'missing'">首次打开会自动准备</small>
                <small v-else-if="knowledgeIndexStatus.state === 'stale'">{{ knowledgeIndexStatus.staleSourceCount || knowledgeIndexStatus.sourceCount }} 个文件需要更新</small>
                <small v-else>打开更多菜单处理</small>
                <div class="knowledge-index-actions">
                  <n-dropdown trigger="click" :options="knowledgeIndexMenuOptions" @select="handleKnowledgeIndexAction">
                    <n-button quaternary circle size="tiny" :disabled="knowledgeIndexBusy" title="搜索与关联选项">
                      <template #icon><n-icon :component="MoreIcon" /></template>
                    </n-button>
                  </n-dropdown>
                </div>
              </div>

              <div
                class="tree-viewport"
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
                <div v-else-if="showKnowledgeResults" class="knowledge-search-results">
                  <div v-if="activeGraphCollection" class="graph-collection-state">
                    <span><strong>{{ activeGraphCollection.name }}</strong><small>{{ activeGraphCollection.graphDepth }} 层动态子图</small></span>
                    <button type="button" title="关闭集合" @click="closeGraphCollection">×</button>
                  </div>
                  <div v-if="knowledgeSearchRunning" class="knowledge-search-state">正在搜索工作区已索引内容…</div>
                  <div v-else-if="!visibleKnowledgeSearchResults.length" class="knowledge-search-state">没有找到匹配内容</div>
                  <div v-for="(result, index) in visibleKnowledgeSearchResults" :key="`${result.path}-${result.matchKind}-${result.page || 0}-${result.locatorObjectId || result.annotationId || index}`" class="knowledge-search-result">
                    <button class="knowledge-result-open" @click="openKnowledgeSearchResult(result)">
                      <span class="knowledge-result-head"><strong>{{ result.title.replace(/(?:\.table\.json|\.(?:md|canvas|pdf|csv|tsv|xlsx))$/i, '') }}</strong><i>{{ resultFormatLabel(result.objectType) }} · {{ searchKindLabel(result.matchKind) }}</i></span>
                      <span class="knowledge-result-context">{{ result.context }}</span>
                      <small v-if="result.objectType === 'pptx' && result.locationLabel">{{ result.locationLabel }}</small>
                      <small v-else-if="result.page">第 {{ result.page }} 页<template v-if="result.annotationId"> · 批注</template></small>
                      <small v-else-if="result.locationLabel">{{ result.locationLabel }}</small>
                    </button>
                    <RelationSummaryBadge v-if="relationSummary(result.path)" :summary="relationSummary(result.path)!" compact @open="openRelationGraph(result.path)" />
                  </div>
                </div>
                <n-tree 
                  v-else
                  ref="treeInstRef"
                  class="library-file-tree"
                  aria-label="知识库文件树"
                  :aria-describedby="preview.focusPath ? 'file-tree-detail-preview' : undefined"
                  :data="treeData" 
                  lazy
                  multiple
                  block-line
                  expand-on-click
                  :on-load="handleLoadChildren"
                  :node-props="nodeProps"
                  :selected-keys="selectedKeys"
                  v-model:expanded-keys="expandedKeys"
                  @update:selected-keys="handleNodeSelect"
                  @focus="handleTreeKeyboardFocus"
                  @blur="handleTreeKeyboardBlur"
                  @keydown="handleTreeKeyboardNavigation"
                />
              </div>
            </div>

            <!-- 历史面板（收藏 + 最近） -->
            <div v-else-if="activeSidebarTab === 'quick'" :key="'quick'" class="tab-pane quick-pane">
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

            <div v-else-if="activeSidebarTab === 'collections'" :key="'collections'" class="tab-pane collections-pane">
              <div class="collections-header">
                <div><strong>已保存视图</strong><small>{{ librarySavedSearches.length }} 个</small></div>
                <n-button quaternary circle size="small" title="保存当前搜索" :disabled="!searchQuery.trim()" @click="saveCurrentSearch">
                  <template #icon><n-icon :component="BookmarkAddIcon" /></template>
                </n-button>
              </div>
              <div v-if="!librarySavedSearches.length" class="empty-state-hint"><n-empty description="暂无保存的搜索" size="small" /></div>
              <div v-else class="collection-list">
                <div v-for="search in librarySavedSearches" :key="search.id" class="collection-row">
                  <button class="collection-open" @click="openSavedSearch(search)">
                    <n-icon :component="CollectionIcon" />
                    <span><strong>{{ search.name }}</strong><small>{{ collectionFilterLabel(search) }}</small></span>
                  </button>
                  <n-button quaternary circle size="tiny" title="删除保存视图" @click="confirmRemoveSavedSearch(search.id, search.name)">
                    <template #icon><n-icon :component="TrashIcon" /></template>
                  </n-button>
                </div>
              </div>
            </div>

            <!-- 标签管理面板 -->
            <div v-else-if="activeSidebarTab === 'tags'" :key="'tags'" class="tab-pane tags-pane">
              <div class="tags-help">标签从笔记中的 <code>#标签名</code> 语法自动识别</div>

              <!-- 给当前文件加标签 -->
              <div class="tag-add-row" v-if="activeTabId">
                <n-input v-model:value="newTagName" placeholder="输入标签名..." size="small" @keydown.enter="addTagToCurrentFile" />
                <n-button size="tiny" type="primary" @click="addTagToCurrentFile" :disabled="!newTagName.trim()">+</n-button>
              </div>

              <div v-if="allTags.length === 0" class="empty-state-hint">
                <n-empty description="暂无标签" size="small" />
              </div>
              <div v-else class="tags-manage">
                <div class="tags-search">
                  <n-input v-model:value="tagFilterText" placeholder="筛选标签..." size="small" clearable />
                </div>
                <div class="tag-cloud">
                  <div class="tag-row" v-for="t in filteredTags" :key="t.tag" @click="searchByTag(t.tag)">
                    <n-icon :component="TagIcon" size="14" />
                    <span class="tag-name">#{{ t.tag }}</span>
                    <span class="tag-count">{{ t.count }} 篇</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 大纲面板 -->
            <div v-else-if="activeSidebarTab === 'outline'" :key="'outline'" class="tab-pane outline-pane">
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

            <!-- 引用面板 -->
            <div v-else-if="activeSidebarTab === 'links'" :key="'links'" class="tab-pane links-pane">
              <div v-if="!activeTabId" class="path-guide"><n-empty description="未打开文件" size="small" /></div>
              <div v-else class="links-content">
                <LocalGraph
                  :library-root="store.libraryPath"
                  :current-path="activeTabId"
                  @select="path => handleNodeSelect([path])"
                  @open-mindmap="openLocalMindMap"
                  @open-canvas="createCanvasFromCurrentGraph"
                />
                <div class="links-section" v-if="outgoingLinks.length > 0">
                  <div class="links-section-title">链出 ({{ outgoingLinks.length }})</div>
                  <div class="link-item" v-for="link in outgoingLinks" :key="link" @click="navigateToLink(link)">{{ link }}</div>
                </div>
                <div class="links-section">
                  <div class="links-section-title">反向链接 ({{ backlinks.length }})</div>
                  <div v-if="backlinks.length === 0" class="links-empty">暂无其他文件链接到此处</div>
                  <div class="backlink-item" v-for="bl in backlinks" :key="bl.path" @click="handleNodeSelect([bl.path])" :title="bl.path">
                    <div class="bl-title">{{ bl.title }}</div>
                    <div class="bl-context">{{ bl.context }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 历史面板 -->
            <div v-else-if="activeSidebarTab === 'history'" :key="'history'" class="tab-pane history-pane">
              <div class="history-box">
                <div class="history-header">
                  <div class="history-title-row">
                    <n-icon :component="ClockIcon" class="title-icon" />
                    <span>影子副本 ({{ historyList.length }})</span>
                  </div>
                  <n-button quaternary circle size="tiny" @click="clearAllHistory" title="清空全部缓存" class="clear-all-btn">
                    <template #icon><n-icon :component="TrashIcon" /></template>
                  </n-button>
                </div>
                
                <div v-if="!activeTabId" class="empty-state-hint">
                  <n-empty description="未打开文件" size="small" />
                </div>
                <div v-else-if="historyList.length === 0" class="empty-state-hint">
                  <n-empty description="暂无历史快照" size="small" />
                </div>
                
                <div v-else class="history-bubbles-wrapper">
                  <div v-for="h in historyList" :key="h.timestamp" class="history-bubble" @click="restoreHistory(h.content)">
                    <div class="bubble-accent-line"></div>
                    <div class="bubble-content">
                      <div class="bubble-top">
                        <div class="time-box">
                          <span class="bubble-time">{{ formatTime(h.timestamp) }}</span>
                        </div>
                        <div class="bubble-meta">{{ h.content.length }} 字</div>
                      </div>
                      <div class="bubble-preview">{{ h.content.slice(0, 45).replace(/[\n#*`]/g, ' ') }}...</div>
                    </div>
                    <div class="bubble-actions">
                      <n-button quaternary circle size="tiny" class="delete-trigger" @click.stop="deleteHistory(h.timestamp)">
                        <template #icon><n-icon :component="CloseIcon" /></template>
                      </n-button>
                    </div>
                  </div>
                </div>
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
                  v{{ currentAppVersion }}
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
    <div v-if="virtualDrag.active" class="drag-ghost" :style="{ left: virtualDrag.x + 'px', top: virtualDrag.y + 'px' }">
      <n-icon :component="virtualDrag.dragNode?.isLeaf ? FileIcon : FolderIcon" />
      <span>{{ virtualDrag.ghostText }}</span>
    </div>

    <!-- 左侧分隔条 -->
    <div class="resizer-area" v-if="!store.isZen">
      <div class="drag-handle" @mousedown="startResizing('sidebar')"></div>
      <div class="collapse-btn left" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <n-icon :component="isSidebarCollapsed ? ChevronRightIcon : ChevronLeftIcon" />
      </div>
    </div>

    <!-- 中间编辑区 -->
    <div class="editor-main" data-ui-region="editor" :class="{ 'zen-mode': store.isZen }">
      <div class="tabs-bar" v-if="!store.isZen && store.tabs.length > 0">
        <WorkspaceTabs />
        <n-dropdown
          v-if="activeTabId"
          trigger="click"
          :options="externalOpenOptions"
          @select="handleActiveExternalOpen"
        >
          <n-button
            quaternary
            circle
            size="small"
            :loading="externalAppsLoading || externalOpenBusy"
            title="使用外部应用打开"
          >
            <template #icon><n-icon :component="ExternalOpenIcon" /></template>
          </n-button>
        </n-dropdown>
        <div v-if="!activeEmbeddedEditor" class="tab-actions">
          <div class="action-btn-group">
            <n-button quaternary circle size="small" @click="refreshCurrentFile" :disabled="!activeTabId" title="从磁盘同步内容">
              <template #icon><n-icon :component="RefreshIcon" /></template>
            </n-button>
            <n-button quaternary circle size="small" @click="saveCurrentFile" :disabled="!activeTabId || !activeFormatCanEdit" :title="activeSaveTitle">
              <template #icon><n-icon :component="SaveIcon" /></template>
            </n-button>
            <n-dropdown trigger="click" :options="textEncodingMenuOptions" @select="handleTextEncodingAction" v-if="activeTabId && activeDocumentFormat?.routeName === 'LibraryMode'">
              <n-button quaternary circle size="small" title="文本编码">
                <template #icon><n-icon :component="LanguagesIcon" /></template>
              </n-button>
            </n-dropdown>
            <n-dropdown trigger="click" :options="exportOptions" @select="handleExport" v-if="activeTabId">
              <n-button quaternary circle size="small" title="导出">
                <template #icon><n-icon :component="DownloadIcon" /></template>
              </n-button>
            </n-dropdown>
            <n-button quaternary size="tiny" v-if="activeTabId && activeIsMarkdown" @click="createMindMapFromCurrentMarkdown" title="将当前文档标题和列表转换为可编辑思维导图">转脑图</n-button>
            <div class="mode-toggle" v-if="activeTabId && activeIsMarkdown">
              <n-button quaternary size="tiny" :type="store.editorMode === 'wysiwyg' ? 'primary' : 'default'" @click="switchEditorMode('wysiwyg')" title="所见即所得">所见</n-button>
              <n-button quaternary size="tiny" :type="store.editorMode === 'ir' ? 'primary' : 'default'" @click="switchEditorMode('ir')" title="即时渲染">IR</n-button>
              <n-button quaternary size="tiny" :type="store.editorMode === 'sv' ? 'primary' : 'default'" @click="switchEditorMode('sv')" title="源码编辑">源码</n-button>
            </div>
            <div class="width-toggle" v-if="activeTabId">
              <n-button quaternary size="tiny" :type="editorWidthMode === 'narrow' ? 'primary' : 'default'" @click="editorWidthMode = 'narrow'" title="窄栏 600px">窄</n-button>
              <n-button quaternary size="tiny" :type="editorWidthMode === 'medium' ? 'primary' : 'default'" @click="editorWidthMode = 'medium'" title="中栏 800px">中</n-button>
              <n-button quaternary size="tiny" :type="editorWidthMode === 'wide' ? 'primary' : 'default'" @click="editorWidthMode = 'wide'" title="宽栏 全宽">宽</n-button>
            </div>
          </div>
          <div class="word-count-info" v-if="activeTabId">
            <span class="format-capability-badge" :class="`level-${activeDocumentFormat?.userCapability.level || 'unsupported'}`" :title="activeDocumentFormat?.userCapability.description">
              {{ activeDocumentFormat?.label }} · {{ activeDocumentFormat?.userCapability.label }}
            </span>
            <span v-if="activeTextSnapshotLabel" class="text-snapshot-badge" :title="activeTextSnapshotTitle">{{ activeTextSnapshotLabel }}</span>
            <n-button v-if="activeTextTab?.textReadOnlyReason && !activeTextTab.textRangeEof" text size="tiny" @click="loadNextTextRange">
              继续加载
            </n-button>
            <span>{{ wordCount }} 字 · 约 {{ Math.max(1, Math.ceil(wordCount / 300)) }} 分钟 · 行 {{ cursorLine }}:{{ cursorCol }}</span>
          </div>
          <div class="hidden-picker-trigger" style="position: absolute; opacity: 0; pointer-events: none;">
            <n-color-picker 
              v-model:value="store.editorBgColor" 
              :modes="['hex']" 
              @update:value="handleEditorBgChange"
            />
          </div>
        </div>
        <div v-else-if="activeTabId" class="embedded-format-capability">
          <span class="format-capability-badge" :class="`level-${activeDocumentFormat?.userCapability.level || 'unsupported'}`" :title="activeDocumentFormat?.userCapability.description">
            {{ activeDocumentFormat?.label }} · {{ activeDocumentFormat?.userCapability.label }}
          </span>
        </div>
      </div>
      
      <div class="editor-viewport" :class="'editor-width-' + editorWidthMode" :style="{ '--custom-editor-bg': store.editorBgColor || 'transparent' }">
        <div v-if="activeEmbeddedEditor && activeTabId" class="library-embedded-editor">
          <component :is="activeEmbeddedEditor" :key="activeTabId" />
        </div>
        <div v-if="!activeEmbeddedEditor && editorLoading && tabs.length > 0" class="editor-loading">
          <n-spin size="large">
            <template #description>同步中...</template>
          </n-spin>
        </div>
        <div v-show="!activeEmbeddedEditor && tabs.length > 0" id="vditor-lib" class="vditor-instance"></div>
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
    </div>

    <HoverPreview :show="preview.show" :title="preview.title" :path="preview.path" :x="preview.x" :y="preview.y" />
    
    <n-dropdown
      placement="bottom-start" trigger="manual" :x="contextMenu.x" :y="contextMenu.y"
      :options="contextMenu.options" :show="contextMenu.show"
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

    <n-modal v-model:show="fileStyleEditor.show" preset="card" class="file-style-modal" title="编辑文件显示样式">
      <div class="file-style-editor">
        <div
          class="file-style-preview"
          :style="{ backgroundColor: fileStyleEditor.backgroundColor || undefined, color: markerTextColor(fileStyleEditor) || undefined }"
        >
          <n-icon size="19" :color="fileStylePreviewVisual.color"><component :is="fileStylePreviewVisual.icon" /></n-icon>
          <span>{{ fileStyleEditor.name }}</span>
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
          <label>文件图标</label>
          <div class="file-icon-options">
            <button
              v-for="option in FILE_MARKER_ICON_OPTIONS"
              :key="option.id"
              type="button"
              :class="{ active: fileStyleEditor.icon === option.id }"
              :title="option.label"
              :aria-label="option.label"
              @click="fileStyleEditor.icon = option.id"
            ><n-icon size="18"><component :is="option.icon" /></n-icon></button>
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

    <n-modal
      v-model:show="externalChange.show"
      preset="card"
      title="检测到磁盘内容变化"
      :mask-closable="false"
      :closable="false"
      class="external-change-modal"
    >
      <div class="external-change-summary">
        <strong>{{ externalChange.fileName }}</strong>
        <span>检测时间：{{ externalChange.detectedAt }}</span>
        <p>磁盘中的文件内容与当前编辑基线不同。请选择比较、保留当前编辑内容，或重新加载磁盘版本。</p>
      </div>
      <div v-if="externalChange.compareLoading" class="external-compare-state"><n-spin size="small" /> 正在读取磁盘版本</div>
      <div v-else-if="externalChange.compareError" class="external-compare-state error">{{ externalChange.compareError }}</div>
      <div v-else-if="externalChange.diskContent !== null" class="external-compare-grid">
        <section><header>当前编辑区</header><pre>{{ externalCurrentPreview }}</pre></section>
        <section><header>磁盘版本</header><pre>{{ externalDiskPreview }}</pre></section>
      </div>
      <template #footer>
        <div class="external-change-actions">
          <n-button secondary :loading="externalChange.compareLoading" @click="compareExternalChange">比较</n-button>
          <span></span>
          <n-button @click="keepExternalChange">保留当前</n-button>
          <n-button type="primary" @click="reloadExternalChange">重新加载</n-button>
        </div>
      </template>
    </n-modal>

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
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, useDialog, TreeOption, NIcon, NDropdown } from 'naive-ui'
import { 
  Search as SearchIcon, Settings as SettingsIcon, X as CloseIcon, 
  RefreshCw as RefreshIcon, FileText as FileIcon, Folder as FolderIcon,
  Plus as PlusIcon, FolderPlus as FolderPlusIcon, FolderOpen as FolderOpenIcon, Trash as TrashIcon,
  Edit as EditIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  Save as SaveIcon, List as ListIcon, History as ClockIcon,
  Star as StarIcon, CalendarDays as CalendarIcon, Link as LinkIcon, Tag as TagIcon, Download as DownloadIcon,
  Database as DatabaseIcon, LayoutDashboard as DashboardIcon, ListFilter as CollectionIcon,
  BookmarkPlus as BookmarkAddIcon, Languages as LanguagesIcon, ExternalLink as ExternalOpenIcon,
  MoreHorizontal as MoreIcon, Palette as PaletteIcon
} from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore, THEME_MAP, type SavedSearchConfig, type TabInfo } from '../store/app'
import { isActiveThemeDark } from '../config/themePresets'
import { markdownCodeThemeChoices, resolveMarkdownEditorAppearance } from '../config/markdownCodeTheme'
import { storeToRefs } from 'pinia'
import HoverPreview from '../components/HoverPreview.vue'
import LocalGraph from '../components/LocalGraph.vue'
import MarkdownChartEmbeds from '../components/MarkdownChartEmbeds.vue'
import RelationSummaryBadge, { type GraphRelationSummary } from '../components/RelationSummaryBadge.vue'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useRoute, useRouter } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime, listen } from '../services/tauriRuntime'
import { initializeUpdater, updaterState } from '../services/appUpdater'
import { RELEASE_MATRIX_VERSION } from '../config/releaseCapabilities'
import { useOutline } from '../composables/useOutline'
import { useImageFix } from '../composables/useImageFix'
import { parsePdfReferenceUri, resolveLibraryPdfPath } from '../utils/pdfReference'
import { resolveCollectionPath, sameWorkspacePath } from '../utils/savedCollections'
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
import { openManagedFile } from '../services/fileNavigation'
import {
  FILE_MARKER_ICON_OPTIONS,
  resolveFileTreeVisual,
  type FileDisplayStyle,
  type FileMarkerIconId,
} from '../config/fileTreeAppearance'

interface FileEntry { name: string; path: string; is_dir: boolean; }

const currentAppVersion = computed(() => {
  const runtimeVersion = updaterState.currentVersion.trim()
  return updaterState.status !== 'idle' && runtimeVersion !== '1.0.0'
    ? runtimeVersion
    : RELEASE_MATRIX_VERSION
})
const hasAvailableUpdate = computed(() => updaterState.status === 'available' && Boolean(updaterState.latestVersion))
const versionIndicatorLabel = computed(() => hasAvailableUpdate.value
  ? `发现新版本 v${updaterState.latestVersion}，点击查看更新`
  : `当前软件版本 v${currentAppVersion.value}，点击查看更新`)

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

interface KnowledgeSearchResult {
  title: string
  path: string
  objectType: string
  matchKind: 'title' | 'body' | 'ocr' | 'annotation' | 'related' | 'tag' | 'slide-title' | 'object' | 'notes'
  context: string
  page?: number
  annotationId?: string
  locatorKind?: string
  locatorObjectId?: string
  locationLabel?: string
  score: number
  extractionFailed: boolean
}

interface KnowledgeIndexStatus {
  state: 'missing' | 'building' | 'ready' | 'stale' | 'corrupt' | 'error'
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
  if (!tab?.textEncoding) return ''
  const bom = tab.textBom && tab.textBom !== 'none' ? ` · ${tab.textBom.toUpperCase()} BOM` : ''
  const lineEnding = tab.textLineEnding ? ` · ${tab.textLineEnding.toUpperCase()}` : ''
  const readOnly = tab.textReadOnlyReason ? ' · 大文件只读' : ''
  return `${tab.textEncoding}${bom}${lineEnding}${readOnly}`
})
const activeTextSnapshotTitle = computed(() => {
  const tab = activeTextTab.value
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
const sidebarTabs = [
  { key: 'files' as const, icon: FileIcon, label: '文件' },
  { key: 'collections' as const, icon: CollectionIcon, label: '保存' },
  { key: 'outline' as const, icon: ListIcon, label: '目录' },
  { key: 'tags' as const, icon: TagIcon, label: '标签' },
  { key: 'links' as const, icon: LinkIcon, label: '引用' },
  { key: 'quick' as const, icon: ClockIcon, label: '最近' },
  { key: 'history' as const, icon: SaveIcon, label: '备份' },
]
const outgoingLinks = ref<string[]>([])
const backlinks = ref<{ title: string; path: string; context: string }[]>([])

const fetchLinks = async () => {
  if (!activeTabId.value || !activeIsMarkdown.value) { outgoingLinks.value = []; backlinks.value = []; return }
  try {
    const content = vditor?.getValue() || ''
    outgoingLinks.value = await invoke<string[]>('extract_wikilinks', { content })
    backlinks.value = await invoke<any[]>('find_backlinks', { filePath: activeTabId.value, libraryRoot: store.libraryPath })
  } catch (e) { outgoingLinks.value = []; backlinks.value = [] }
}

const navigateToLink = (title: string) => {
  // Try to find and open the linked file
  const candidates = [
    store.libraryPath + '/' + title + '.md',
    store.libraryPath + '/' + title,
  ]
  for (const p of candidates) {
    const tab = store.tabs.find(t => t.path === p)
    if (tab) { store.addTab(tab); expandedKeys.value = [...new Set([...expandedKeys.value, store.libraryPath])]; return }
  }
  // Try to find in tree data
  const findInTree = (nodes: any[]): string | null => {
    for (const n of nodes) {
      const nodeTitle = (n.label as string || '').replace('.md', '')
      if (nodeTitle === title || n.key === title) return n.key as string
      if (n.children) { const r = findInTree(n.children); if (r) return r }
    }
    return null
  }
  const found = findInTree(treeData.value)
  if (found) handleNodeSelect([found])
  else message.warning('未找到链接目标: ' + title)
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

const fetchLibStats = async () => {
  if (!store.libraryPath) return
  try { libStats.value = await invoke<any>('get_library_stats', { path: store.libraryPath }) }
  catch (e) { libStats.value = null }
}

const fetchAllTags = async () => {
  if (!store.libraryPath) return
  try { allTags.value = await invoke<any[]>('get_all_tags', { libraryRoot: store.libraryPath }) }
  catch (e) { allTags.value = [] }
}

const newTagName = ref('')
const addTagToCurrentFile = () => {
  const tag = newTagName.value.trim()
  if (!tag || !vditor) return
  const tagStr = ' #' + tag.replace(/\s/g, '')
  if (vditor.getCurrentMode() === 'wysiwyg') {
    vditor.insertValue(tagStr)
  } else {
    vditor.setValue(vditor.getValue() + tagStr)
  }
  newTagName.value = ''
  fetchAllTags()
}

const searchByTag = (tag: string) => {
  searchObjectTypes.value = []
  searchQuery.value = '#' + tag
  activeSidebarTab.value = 'files'
}
const resultFormatLabel = (objectType: string) => findFileFormatById(objectType)?.label || objectType
const collectionFilterLabel = (search: SavedSearchConfig) => search.graphRoot
  ? `${search.graphDepth || 1} 层动态子图`
  : search.objectTypes.length
    ? search.objectTypes.map(resultFormatLabel).join(' · ')
    : '全部格式'
const saveCurrentSearch = async () => {
  if (!searchQuery.value.trim()) return
  try {
    const before = store.savedSearches.length
    await store.addSavedSearch(searchQuery.value, searchObjectTypes.value)
    message.success(store.savedSearches.length === before ? '该搜索已保存' : '已保存为视图')
  } catch (error) { message.error(`保存搜索失败：${String(error)}`) }
}
const openSavedSearch = (search: SavedSearchConfig) => {
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
    title: '删除保存视图',
    content: `删除“${name}”？这不会删除任何知识库文件。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await store.removeSavedSearch(id); message.success('保存视图已删除') }
      catch (error) { message.error(`删除失败：${String(error)}`) }
    },
  })
}
const isSidebarCollapsed = ref(false)
const tagFilterText = ref('')
const filteredTags = computed(() => {
  if (!tagFilterText.value.trim()) return allTags.value
  const q = tagFilterText.value.toLowerCase()
  return allTags.value.filter(t => t.tag.toLowerCase().includes(q))
})
const editorWidthMode = ref<'narrow' | 'medium' | 'wide'>(
  (localStorage.getItem('longedit_editor_width') as any) || 'medium'
)
watch(editorWidthMode, (v) => { localStorage.setItem('longedit_editor_width', v) })
const sidebarWidth = ref(260)
const sidebarTabsCompact = computed(() => sidebarWidth.value < 460)
const activeResizer = ref<'sidebar' | null>(null)
const treeInstRef = ref<any>(null)
const treeData = ref<TreeOption[]>([])
const searchQuery = ref('')
const searchObjectTypes = ref<string[]>([])
const activeCollectionId = ref('')
const knowledgeSearchResults = ref<KnowledgeSearchResult[]>([])
const knowledgeSearchRunning = ref(false)
let knowledgeSearchGeneration = 0
let relationSummaryGeneration = 0
const relationSummaries = ref<Record<string, GraphRelationSummary>>({})
const knowledgeIndexStatus = ref<KnowledgeIndexStatus>({
  state: 'missing', schemaVersion: 1, sourceCount: 0, objectCount: 0,
  relationCount: 0, progress: 0, cacheBytes: 0, recoveryAvailable: false,
})
const knowledgeIndexBusy = ref(false)
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
const closeGraphCollection = () => {
  ++knowledgeSearchGeneration
  activeCollectionId.value = ''
  knowledgeSearchResults.value = []
  void refreshRelationSummaries()
}
const activateGraphCollection = async (search: SavedSearchConfig) => {
  if (!search.graphRoot || !store.libraryPath) return
  const centerPath = resolveCollectionPath(store.libraryPath, search.graphRoot)
  const generation = ++knowledgeSearchGeneration
  if (searchTimer) clearTimeout(searchTimer)
  activeCollectionId.value = search.id
  searchQuery.value = ''
  searchObjectTypes.value = []
  knowledgeSearchRunning.value = true
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
}[knowledgeIndexStatus.value.state]))
const knowledgeIndexExplanation = computed(() => ({
  missing: 'LongEdit 会在后台读取支持的文件并准备本地搜索缓存，不会修改资料库文件。',
  building: '正在后台准备本地搜索与文件关系，期间仍可继续浏览和编辑。',
  ready: '全文搜索和文件关系已经可以使用；缓存只保存在本机。',
  stale: '资料库内容发生变化，LongEdit 正在后台更新本地搜索缓存。',
  corrupt: '本地搜索缓存无法读取，可从更多菜单隔离缓存并重新准备；资料库文件不会被删除。',
  error: '本地搜索缓存准备失败，可从更多菜单重试；资料库文件不会被修改。',
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
const expandedKeys = ref<string[]>([])
let vditor: any = null
let isVditorReady = false
let lastLoadedPath = ''
let externalCheckInFlight = false
let lastPromptedExternalSignature = ''
let suppressEditorInput = false

const externalChange = reactive({
  show: false,
  path: '',
  fileName: '',
  detectedAt: '',
  signature: '',
  contentDigest: '',
  diskContent: null as string | null,
  compareLoading: false,
  compareError: '',
})

const externalCurrentPreview = computed(() => {
  const tab = tabs.value.find(item => item.path === externalChange.path)
  const content = externalChange.path === activeTabId.value && vditor ? vditor.getValue() : (tab?.content || '')
  return content.length > 12000 ? `${content.slice(0, 12000)}\n\n…… 当前内容过长，仅显示前 12000 字符` : content
})
const externalDiskPreview = computed(() => {
  const content = externalChange.diskContent || ''
  return content.length > 12000 ? `${content.slice(0, 12000)}\n\n…… 磁盘内容过长，仅显示前 12000 字符` : content
})
const contentDigestFromSignature = (signature: string) => signature.match(/:([a-f0-9]{32})$/i)?.[1].toLowerCase() || ''

// 常量定义
const AUTO_SAVE_DELAY_MS = 2000
const EDITOR_MODE_SYNC_DELAY_MS = 300
const IMAGE_FIX_DELAY_MS = 300

const { outlineTreeData, syncOutlineManual, scrollToHeading, setupOutlineObserver, destroyOutlineObserver } = useOutline(() => vditor)
const { fixEditorImages, destroyImageFix } = useImageFix(() => vditor, () => activeTabId.value || '', { libraryRoot: () => store.libraryPath })
const activeHeadingKey = ref<string | null>(null)
const handleOutlineSelect = (keys: string[]) => { if (keys.length > 0) scrollToHeading(keys[0] as string) }

const updateWordCount = () => {
  if (vditor && isVditorReady) {
    const val = vditor.getValue()
    wordCount.value = val.length
  }
}

const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0, focusPath: '', timer: null as any })
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, atRoot: false, options: [] as any[] })
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
const readableMarkerText = (backgroundColor: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(backgroundColor)) return ''
  const channels = [1, 3, 5].map(offset => Number.parseInt(backgroundColor.slice(offset, offset + 2), 16) / 255)
  const luminance = channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.52 ? '#253041' : '#f8fafc'
}
const markerTextColor = (style?: FileDisplayStyle) => style?.textColor || readableMarkerText(style?.backgroundColor || '')
const fileNameWithExtension = (path: string) => path.split(/[\\/]/).pop() || path
const fileTreeVisualForPath = (path: string) => {
  const marker = store.fileDisplayStyles[path]
  const visual = resolveFileTreeVisual(findFileFormat(path)?.id, marker?.icon || 'auto')
  return { ...visual, color: markerTextColor(marker) || visual.color }
}
const fileStylePreviewVisual = computed(() => {
  const base = resolveFileTreeVisual(fileStyleEditor.formatId, fileStyleEditor.icon)
  return { ...base, color: markerTextColor(fileStyleEditor) || base.color }
})

const refreshFileTreePresentation = () => { treeData.value = [...treeData.value] }
const openFileStyleEditor = (path: string) => {
  const existing = store.fileDisplayStyles[path]
  fileStyleEditor.path = path
  fileStyleEditor.name = path.split(/[\\/]/).pop() || path
  fileStyleEditor.formatId = findFileFormat(path)?.id || ''
  fileStyleEditor.backgroundColor = existing?.backgroundColor || ''
  fileStyleEditor.textColor = existing?.textColor || ''
  fileStyleEditor.icon = existing?.icon || 'auto'
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
    }
    if (!style.backgroundColor && !style.textColor && style.icon === 'auto') await store.clearFileDisplayStyle(fileStyleEditor.path)
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
const historyList = ref<{timestamp: number, content: string}[]>([])

const openSettings = () => router.push('/settings')
const openUpdateSettings = () => router.push({ name: 'Settings', query: { category: 'system', focus: 'software-update' } })
const openWorkspace = () => router.push('/workspace')
const openGraph = () => router.push('/graph')
const openLocalMindMap = () => {
  if (!activeTabId.value) return
  router.push({ name: 'Graph', query: { mode: 'mindmap', root: activeTabId.value } })
}

const createCanvasFromCurrentGraph = async (depth: number) => {
  if (!activeTabId.value) return
  try {
    const path = await invoke<string>('create_canvas_from_graph', {
      libraryRoot: store.libraryPath,
      centerPath: activeTabId.value,
      depth
    })
    await refreshLibrary()
    openManagedFile(router, path)
  } catch (error) {
    message.error(`生成画布失败：${String(error)}`)
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
  if (!activeTabId.value) return
  try {
    const res = await invoke<[number, string][]>('list_history', { libraryRoot: store.libraryPath, path: activeTabId.value })
    historyList.value = res.map(([timestamp, content]) => ({ timestamp, content }))
  } catch (e) { console.error('Failed to fetch history', e) }
}

const restoreHistory = (content: string) => { if (!vditor || !isVditorReady) return; vditor.setValue(content); message.success('已恢复到该历史版本') }
const deleteHistory = async (timestamp: number) => {
  if (!activeTabId.value) return
  try { await invoke('delete_history_version', { libraryRoot: store.libraryPath, path: activeTabId.value, timestamp }); await fetchHistory(); message.success('已移除该备份') }
  catch (e) { message.error('删除失败') }
}
const clearAllHistory = async () => {
  dialog.warning({
    title: '清空历史备份',
    content: '确定要清除所有文件的历史备份吗？此操作不可撤销。',
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await invoke('clear_all_history'); historyList.value = []; message.success('历史缓存已全部清空') }
      catch (e) { message.error('清空失败') }
    }
  })
}

const formatTime = (ts: number) => {
  const date = new Date(ts * 1000)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

let shadowSaveTimer: any = null
const startShadowSaveTimer = () => {
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  const interval = store.autoSaveInterval * 60 * 1000
  shadowSaveTimer = setInterval(async () => {
    if (activeTabId.value && activeTabId.value === lastLoadedPath && vditor && isVditorReady) {
      const content = vditor.getValue()
      if (content && content.trim().length > 0) {
        await invoke('save_history_version', { libraryRoot: store.libraryPath, path: activeTabId.value, content, maxCount: store.maxHistoryCount })
        if (activeSidebarTab.value === 'history') fetchHistory()
      }
    }
  }, interval)
}

const startResizing = (type: 'sidebar') => { activeResizer.value = type }

const handleNodeSelect = (keys: string[]) => {
  if (keys.length === 0) return
  const lastKey = keys[keys.length - 1]
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

const searchKindLabel = (kind: KnowledgeSearchResult['matchKind']) => ({
  title: '标题', 'slide-title': '幻灯片标题', body: '正文', object: '对象', notes: '备注',
  ocr: 'OCR', annotation: '批注', related: '附属内容', tag: '标签',
}[kind])

let knowledgeLocatorSequence = 0
const nextKnowledgeLocatorToken = () => `${Date.now()}-${++knowledgeLocatorSequence}`

const openKnowledgeSearchResult = (result: KnowledgeSearchResult) => {
  if (result.objectType === 'pdf') {
    openManagedFile(router, result.path, {
        ...(result.page ? { page: String(result.page) } : {}),
        ...(result.annotationId ? { annotation: result.annotationId } : {}),
    })
  } else if (result.objectType === 'workbook') {
    void openManagedFile(router, result.path, {
      ...(result.locatorObjectId ? { sheet: result.locatorObjectId } : {}),
      locatorToken: nextKnowledgeLocatorToken(),
    }, 'replace')
  } else if (['docx', 'odt', 'ods', 'odp'].includes(result.objectType)) {
    void openManagedFile(router, result.path, {
        ...(result.locatorObjectId ? { locator: result.locatorObjectId } : {}),
        locatorToken: nextKnowledgeLocatorToken(),
    }, 'replace')
  } else if (result.objectType === 'pptx') {
    void openManagedFile(router, result.path, {
        ...(result.page ? { slide: String(result.page) } : {}),
        ...(result.locatorKind ? { locatorKind: result.locatorKind } : {}),
        ...(result.locatorObjectId ? { locator: result.locatorObjectId } : {}),
        ...(result.locationLabel ? { locationLabel: result.locationLabel } : {}),
        matchKind: result.matchKind,
        locatorToken: nextKnowledgeLocatorToken(),
    }, 'replace')
  } else {
    const target = routeForFile(result.path)
    if (opensInLibraryShell(findFileFormat(result.path))) handleNodeSelect([result.path])
    else if (target) router.push(target)
  }
}

const handleLoadChildren = async (option: TreeOption) => {
  try {
    const children = await loadDirectory(option.key as string)
    option.children = children
  } catch (e) {
    option.children = []
    console.error('Failed to load directory:', option.key, e)
  }
}

const loadDirectory = async (path: string): Promise<TreeOption[]> => {
  if (!path) return []
  const entries = await invoke<FileEntry[]>('scan_directory', { libraryRoot: store.libraryPath, path })
  return entries.map(entry => ({
    label: entry.name,
    key: entry.path,
    isLeaf: !entry.is_dir,
    prefix: () => {
      const format = entry.is_dir ? undefined : findFileFormat(entry.path)
      const marker = entry.is_dir ? undefined : store.fileDisplayStyles[entry.path]
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


const refreshLibrary = async () => { if (store.libraryPath) treeData.value = await loadDirectory(store.libraryPath) }
const revealLibraryFile = async (event: Event) => {
  const path = (event as CustomEvent<string>).detail
  if (!path) return
  await refreshLibrary()
  selectedKeys.value = [path]
  const separator = path.includes('\\') ? '\\' : '/'
  const parent = path.slice(0, path.lastIndexOf(separator))
  if (parent && !expandedKeys.value.includes(parent)) expandedKeys.value = [...expandedKeys.value, parent]
  await nextTick()
  window.setTimeout(() => treeInstRef.value?.scrollTo({ key: path, behavior: 'smooth' }), 120)
}
const refreshCreatedLibraryFile = () => { void refreshLibrary() }
const refreshNode = async (path: string) => {
  if (!path || !store.libraryPath) return
  const newEntries = await loadDirectory(path)
  const syncNodes = (oldNodes: TreeOption[], newNodes: TreeOption[]) => {
    const oldMap = new Map(oldNodes.map(n => [n.key, n]))
    return newNodes.map(newNode => { const matchedOld = oldMap.get(newNode.key as string); return matchedOld && matchedOld.children !== undefined ? { ...newNode, children: matchedOld.children } : newNode })
  }
  if (path === store.libraryPath) {
    treeData.value = syncNodes(treeData.value, newEntries)
    return
  }
  const patch = (nodes: TreeOption[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].key === path) { nodes[i].children = syncNodes(nodes[i].children || [], newEntries); return true }
      const childNodes = nodes[i].children; if (childNodes && patch(childNodes)) return true
    }
    return false
  }
  if (patch(treeData.value)) {
    treeData.value = [...treeData.value]
  } else {
    // 节点不在树中 (如首次创建 Daily 目录)，全量刷新
    treeData.value = await loadDirectory(store.libraryPath)
    // 展开新创建的父目录
    if (!expandedKeys.value.includes(path)) {
      expandedKeys.value = [...expandedKeys.value, path]
    }
  }
}

let editorLoadGeneration = 0
const loadFileToEditor = async (path: string) => {
  if (!vditor || !path) return; lastLoadedPath = '' 
  const generation = ++editorLoadGeneration
  const currentTab = tabs.value.find(t => t.path === path)
  const isCurrentRequest = () => generation === editorLoadGeneration && activeTabId.value === path
  
  const setEditorValue = (content: string, readOnly = false) => {
    if (!isCurrentRequest()) return
    suppressEditorInput = true
    vditor.setValue(content)
    setTimeout(() => {
      suppressEditorInput = false
      if (readOnly) vditor?.disabled()
      else vditor?.enable()
    }, 0)
    fetchHistory()
    nextTick(() => { 
      setTimeout(() => { 
        if (currentTab) currentTab.isDirty = false
        lastLoadedPath = path;
        syncOutlineManual();
        setupOutlineObserver();
        updateWordCount();
        fixEditorImages(); // 后台增强：通过 Base64 进一步提升图片清晰度/稳定性
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
    tab.textRangeNextOffset = undefined
    tab.textRangeEof = undefined
    tab.textSize = snapshot.size
    tab.textModified = snapshot.modified
    lastPromptedExternalSignature = ''
  }

  if (currentTab?.content !== undefined) {
    setEditorValue(currentTab.content, Boolean(currentTab.textReadOnlyReason))
  } else {
    try {
      const format = findFileFormat(path)
      if (!format || format.routeName !== 'LibraryMode') throw new Error('文件未注册为文本工作面格式')
      const readOptions = currentTab?.textReadEncoding ? { encoding: currentTab.textReadEncoding } : undefined
      const res = await invoke<TextDocumentSnapshot>('read_text_document', { libraryRoot: store.libraryPath, path, formatId: format.id, readOptions })
      if (!isCurrentRequest()) return
      applyTextSnapshot(currentTab, res, currentTab?.textReadEncoding)
      setEditorValue(res.content)
    } catch (err: any) {
      if (!isCurrentRequest()) return
      if (err?.code === 'read-too-large' && currentTab) {
        try {
          const preview = await readLargeTextPreview(currentTab, 0, currentTab.textReadEncoding)
          if (!isCurrentRequest()) return
          setEditorValue(preview.content, true)
          message.warning('文件超过完整编辑上限，已进入大文件只读预览')
        } catch (previewError: any) {
          handleError(previewError, '大文件预览失败', 'loadFileToEditor')
        }
      } else {
        handleError(err, '读取失败', 'loadFileToEditor')
      }
    }
  }
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

const updateDropTarget = (x: number, y: number) => {
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

    // 探测感应区：25% Before, 50% Inside, 25% After
    if (relativeY < 0.25) {
      virtualDrag.dropPosition = 'before'
    } else if (relativeY > 0.75) {
      virtualDrag.dropPosition = 'after'
    } else {
      virtualDrag.dropPosition = 'inside'
    }

    // 文件夹自动展开逻辑优化：只有当目标 Key 变化或不再是 inside 时才重置计时器
    if (isDir && virtualDrag.dropPosition === 'inside') {
      if (virtualDrag.dropTarget !== foundKey) {
        if (virtualDrag.expandTimer) clearTimeout(virtualDrag.expandTimer)
        virtualDrag.expandTimer = setTimeout(() => {
          if (virtualDrag.dropTarget === foundKey && !expandedKeys.value.includes(foundKey!)) {
            expandedKeys.value.push(foundKey!)
            expandedKeys.value = [...expandedKeys.value]
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
}

const onMouseUp = async () => {
  activeResizer.value = null
  if (virtualDrag.timer) { clearTimeout(virtualDrag.timer); virtualDrag.timer = null }
  if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  if (virtualDrag.scrollTimer) { clearInterval(virtualDrag.scrollTimer); virtualDrag.scrollTimer = null }
  
  if (virtualDrag.active) {
    const targetPath = virtualDrag.dropTarget
    const sourcePaths = virtualDrag.selectedPaths.length > 0 ? virtualDrag.selectedPaths : (virtualDrag.dragNode ? [virtualDrag.dragNode.key] : [])
    const position = virtualDrag.dropPosition

    if (sourcePaths.length > 0 && targetPath) {
      // 保护：如果目标在源路径中且是前后排序，视为原地操作
      if (sourcePaths.includes(targetPath) && (position === 'before' || position === 'after')) {
        virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null; virtualDrag.dropPosition = null; virtualDrag.selectedPaths = []
        message.destroyAll(); return
      }

      try {
        message.loading(`正在处理移动...`)
        
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

        if (moveTasks.length > 0) {
          await invoke('move_items', { libraryRoot: store.libraryPath, sourcePaths: moveTasks, targetDir: finalTargetDir })
        }

        // 2. 逻辑排序逻辑 (Misty Order)
        // 获取目标文件夹的当前顺序
        const order = await invoke<any>('get_folder_order', { libraryRoot: store.libraryPath, path: finalTargetDir })
        let currentItems = (await invoke<FileEntry[]>('scan_directory', { libraryRoot: store.libraryPath, path: finalTargetDir }))
          .map(e => e.name)
        
        // 移除正在移动的项
        const movingNames = sourcePaths.map(p => p.split(/[\\/]/).pop() || '')
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

        selectedKeys.value = []
        message.destroyAll()
        message.success('操作成功')
      } catch (err: any) {
        message.destroyAll()
        message.error('操作失败: ' + err)
      }
    }
    virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null; virtualDrag.dropPosition = null; virtualDrag.selectedPaths = []
  }
}

const onMouseMove = (e: MouseEvent) => {
  if (activeResizer.value === 'sidebar') { sidebarWidth.value = Math.max(220, Math.min(e.clientX, 600)) }
  // 影子偏移，确保不挡住探测
  virtualDrag.x = e.clientX + 10; virtualDrag.y = e.clientY + 10
  
  if (virtualDrag.active) {
    updateDropTarget(e.clientX, e.clientY)

    // 边缘自动滚动逻辑
    const viewport = document.querySelector('.tree-viewport')
    if (viewport) {
      const rect = viewport.getBoundingClientRect()
      const threshold = 40 // 感应区高度
      let scrollSpeed = 0

      if (e.clientY < rect.top + threshold) {
        scrollSpeed = -10 // 向上滚动
      } else if (e.clientY > rect.bottom - threshold) {
        scrollSpeed = 10 // 向下滚动
      }

      if (scrollSpeed !== 0) {
        if (!virtualDrag.scrollTimer) {
          virtualDrag.scrollTimer = setInterval(() => {
            viewport.scrollTop += scrollSpeed
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
  if (!option.isLeaf) return
  hideFilePreview()
  preview.timer = setTimeout(() => {
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
    if (node.key === key) return node
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
  contextMenu.options = buildCreateMenuOptions()
  contextMenu.show = true
}
const nodeProps = ({ option }: { option: TreeOption }) => ({
  'data-key': option.key,
  'data-drop-path': option.key,
  'data-drop-dir': !option.isLeaf ? 'true' : 'false',
  'aria-describedby': option.isLeaf ? 'file-tree-detail-preview' : undefined,
  class: [
    option.isLeaf && store.fileDisplayStyles[option.key as string] ? 'has-file-display-style' : '',
    virtualDrag.dropTarget === option.key ? 'drop-active' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'before' ? 'is-drop-before' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'after' ? 'is-drop-after' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'inside' ? 'is-drop-inside' : '',
  ].join(' '),
  style: option.isLeaf && store.fileDisplayStyles[option.key as string] ? {
    '--file-marker-bg': store.fileDisplayStyles[option.key as string].backgroundColor || 'transparent',
    '--file-marker-text': markerTextColor(store.fileDisplayStyles[option.key as string]) || 'inherit',
    '--file-marker-accent': markerTextColor(store.fileDisplayStyles[option.key as string]) || 'var(--theme-primary)',
  } : undefined,
  onMousedown: (e: MouseEvent) => { 
    if (e.button !== 0) return; 
    virtualDrag.startX = e.clientX; virtualDrag.startY = e.clientY; 
    if (virtualDrag.timer) clearTimeout(virtualDrag.timer); 
    virtualDrag.timer = setTimeout(() => { 
      virtualDrag.active = true; virtualDrag.dragNode = option; 
      if (selectedKeys.value.includes(option.key as string)) {
        virtualDrag.selectedPaths = [...selectedKeys.value]
        virtualDrag.ghostText = `移动 ${selectedKeys.value.length} 个项目`
      } else {
        virtualDrag.selectedPaths = [option.key as string]
        virtualDrag.ghostText = option.label as string
      }
      virtualDrag.timer = null 
    }, 350) 
  },
  onMouseenter: (e: MouseEvent) => {
    if (!option.isLeaf || virtualDrag.active) return
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
      const isMulti = selectedKeys.value.length > 1
      const isStarred = !contextMenu.isDir && store.isStarred(contextMenu.targetPath)
      const items = [
        ...(!isMulti && contextMenu.isDir ? buildCreateMenuOptions() : []),
        !isMulti ? { label: '打开所在文件夹', key: 'open-folder', icon: () => h(NIcon, null, { default: () => h(FolderOpenIcon) }) } : null,
        !contextMenu.isDir && !isMulti ? {
          label: '使用外部应用打开',
          key: 'external-open-menu',
          icon: () => h(NIcon, null, { default: () => h(ExternalOpenIcon) }),
          children: buildExternalOpenOptions(contextMenu.targetPath),
        } : null,
        !contextMenu.isDir && !isMulti ? { label: isStarred ? '取消收藏' : '收藏文件', key: 'star', icon: () => h(NIcon, { color: isStarred ? '#f5a623' : undefined }, { default: () => h(StarIcon) }) } : null,
        !contextMenu.isDir && !isMulti ? { label: '编辑显示样式', key: 'edit-display-style', icon: () => h(NIcon, null, { default: () => h(PaletteIcon) }) } : null,
        { label: isMulti ? '批量重命名不可用' : '重命名 (F2)', key: 'rename', disabled: isMulti, icon: () => h(NIcon, null, { default: () => h(EditIcon) }) },
        { label: isMulti ? `物理删除所选 ${selectedKeys.value.length} 项` : '物理删除 (Del)', key: 'delete', icon: () => h(NIcon, { color: '#f5222d' }, { default: () => h(TrashIcon) }) }
      ].filter(Boolean);
      contextMenu.options = items; contextMenu.show = true
    }, 50)
  }
})

const onMenuAction = async (key: string) => {
  contextMenu.show = false; const path = contextMenu.targetPath
  if (key.startsWith('create-format:')) {
    const [formatId, extension] = key.slice('create-format:'.length).split(':')
    try {
      const created = await createRegisteredFile(formatId, path, undefined, undefined, extension)
      if (path !== store.libraryPath && !expandedKeys.value.includes(path)) expandedKeys.value.push(path)
      await refreshNode(path)
      handleNodeSelect([created])
    } catch (error: any) {
      handleError(error, '创建失败', 'contextCreateFormat')
    }
  } else if (key === 'create-folder') {
    try {
      await invoke('create_new_folder', { libraryRoot: store.libraryPath, parentPath: path })
      if (path !== store.libraryPath && !expandedKeys.value.includes(path)) expandedKeys.value.push(path)
      await refreshNode(path)
    } catch (error: any) {
      handleError(error, '创建文件夹失败', 'contextCreateFolder')
    }
  } else if (key.startsWith('external-open:')) {
    await openFileExternally(path, key.slice('external-open:'.length))
  } else if (key === 'open-folder') {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    const dir = contextMenu.isDir ? path : path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
    await openPath(dir)
  } else if (key === 'star') { store.toggleStar(path); message.info(store.isStarred(path) ? '已收藏' : '已取消收藏') }
  else if (key === 'edit-display-style') { openFileStyleEditor(path) }
  else if (key === 'rename') { openRename(path, contextMenu.isDir) }
  else if (key === 'delete') {
    const targets = selectedKeys.value.includes(path) ? selectedKeys.value : [path]
    await deleteAction(targets)
  }
}

const TEMPLATES: Record<string, string> = {
  '空白笔记': '',
  '会议纪要': `# 会议纪要\n\n**日期**：\n**参会人**：\n**主题**：\n\n## 讨论内容\n\n\n## 决议事项\n\n- \n\n## 待办事项\n\n- [ ] \n`,
  '周报': `# 周报\n\n**周期**：\n\n## 本周完成\n\n- \n\n## 下周计划\n\n- \n\n## 遇到的问题\n\n`,
  '读书笔记': `# 读书笔记\n\n**书名**：\n**作者**：\n\n## 核心观点\n\n\n## 摘录\n\n> \n\n## 个人感悟\n\n`,
}

const templateOptions = [
  ...Object.keys(TEMPLATES).map(k => ({ label: k, key: k })),
  { type: 'divider', key: 'format-divider' },
  ...CREATABLE_FILE_FORMATS.filter(format => format.id !== 'markdown').map(format => ({
    label: `新建${format.label}`,
    key: `__format:${format.id}`,
  })),
]

const selectedTargetDirectory = () => {
  if (!selectedKeys.value.length) return store.libraryPath
  const selected = selectedKeys.value[0]
  if (!findFileFormat(selected)) return selected
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
  const tmpl = TEMPLATES[key] || ''
  try {
    const formatId = key.startsWith('__format:') ? key.slice('__format:'.length) : 'markdown'
    const prefix = key === '空白笔记' || key.startsWith('__format:') ? undefined : key
    const target = selectedTargetDirectory()
    const p = await createRegisteredFile(formatId, target, prefix, formatId === 'markdown' ? tmpl : undefined)
    await refreshNode(target)
    handleNodeSelect([p])
  } catch (e: any) {
    handleError(e, '创建失败', 'handleTemplateCreate')
  }
}

const handleToolbarAction = async (type: 'file' | 'folder') => {
  if (!store.libraryPath) { openSettings(); return }
  const target = selectedTargetDirectory()
  try { if (type === 'file') { const p = await createRegisteredFile('markdown', target); await refreshNode(target); handleNodeSelect([p]) } else { await invoke('create_new_folder', { libraryRoot: store.libraryPath, parentPath: target }); await refreshNode(target) } } catch (e: any) { handleError(e, '操作失败', 'handleToolbarAction') }
}

const createDailyNote = async () => {
  if (!store.libraryPath) { openSettings(); return }
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dailyDir = store.libraryPath.replace(/[\\/]$/, '') + '/Daily'
  try {
    const p = await createRegisteredFile('markdown', dailyDir, dateStr)
    await refreshNode(dailyDir)
    handleNodeSelect([p])
  } catch (e) { message.error('创建今日笔记失败') }
}

const replaceRenamedPath = (value: string, oldPath: string, newPath: string) => {
  const normalizedValue = value.replace(/\\/g, '/').toLowerCase()
  const normalizedOld = oldPath.replace(/\\/g, '/').toLowerCase()
  if (normalizedValue === normalizedOld) return newPath
  if (normalizedValue.startsWith(`${normalizedOld}/`)) return `${newPath}${value.slice(oldPath.length)}`
  return value
}

const syncRenamedWorkspaceReferences = (oldPath: string, newPath: string) => {
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
  if (nextRoutePath && nextRoutePath !== routePath) void openManagedFile(router, nextRoutePath, {}, 'replace')
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
    catch (error) { message.warning(`文件已重命名，但显示标记迁移失败：${String(error)}`) }
    syncRenamedWorkspaceReferences(oldPath, newPath)
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

let autoSaveTimer: any = null
const triggerAutoSave = (content: string) => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    if (!isVditorReady) return
    const current = tabs.value.find(tab => tab.id === activeTabId.value)
    const format = current ? findFileFormat(current.path) : undefined
    if (current && format?.routeName === 'LibraryMode') {
      if (current.textReadOnlyReason) return
      try {
        const savePolicy = current.textReadEncoding ? { encoding: current.textReadEncoding } : undefined
        const saved = await invoke<TextDocumentSnapshot>('write_text_document', {
          libraryRoot: store.libraryPath,
          path: current.path,
          formatId: format.id,
          content,
          expectedSignature: current.textSignature,
          savePolicy,
        })
        current.content = saved.content
        current.textSignature = saved.signature
        current.textContentDigest = saved.contentDigest
        current.textEncoding = saved.encoding
        current.textBom = saved.bom
        current.textLineEnding = saved.lineEnding
        current.textHasFinalNewline = saved.hasFinalNewline
        current.isDirty = false
        current.textModified = saved.modified
        lastPromptedExternalSignature = ''
      } catch (error) { console.error('Auto-save failed:', error) }
    }
  }, AUTO_SAVE_DELAY_MS)
}

const refreshCurrentFile = async () => {
  if (!activeTabId.value) return
  const currentTab = tabs.value.find(t => t.id === activeTabId.value)
  if (currentTab) {
    // 强制清除内容缓存，使 loadFileToEditor 重新触发磁盘读取
    currentTab.content = undefined
    await loadFileToEditor(activeTabId.value)
    message.success('已同步磁盘最新内容')
  }
}

const compareExternalChange = async () => {
  const tab = tabs.value.find(item => item.path === externalChange.path)
  const format = tab ? findFileFormat(tab.path) : undefined
  if (!tab || !format || format.routeName !== 'LibraryMode') return
  externalChange.compareLoading = true
  externalChange.compareError = ''
  try {
    const snapshot = await invoke<TextDocumentSnapshot>('read_text_document', {
      libraryRoot: store.libraryPath,
      path: tab.path,
      formatId: format.id,
      readOptions: tab.textReadEncoding ? { encoding: tab.textReadEncoding } : undefined,
    })
    externalChange.diskContent = snapshot.content
    externalChange.signature = snapshot.signature
    externalChange.contentDigest = snapshot.contentDigest
    lastPromptedExternalSignature = snapshot.signature
  } catch (error) {
    externalChange.compareError = `无法读取磁盘版本：${String(error).replace(/^Error:\s*/, '')}`
  } finally {
    externalChange.compareLoading = false
  }
}

const keepExternalChange = () => {
  externalChange.show = false
  externalChange.diskContent = null
  externalChange.compareError = ''
}

const reloadExternalChange = async () => {
  const path = externalChange.path
  externalChange.show = false
  externalChange.diskContent = null
  externalChange.compareError = ''
  if (path !== activeTabId.value) return
  await refreshCurrentFile()
  lastPromptedExternalSignature = ''
}

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
    externalChange.path = path
    externalChange.fileName = tab.title
    externalChange.detectedAt = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())
    externalChange.signature = identity.signature
    externalChange.contentDigest = identity.contentDigest
    externalChange.diskContent = null
    externalChange.compareError = ''
    externalChange.show = true
  } catch (error: any) {
    if (error?.code !== 'identity-too-large') console.warn('External text identity check failed:', error)
  } finally {
    externalCheckInFlight = false
  }
}

type TextSaveOptions = { savePolicy?: TextSavePolicy; successMessage?: string }

const normalizeTextSaveOptions = (options: unknown): TextSaveOptions => {
  if (!options || typeof options !== 'object') return {}
  if ('savePolicy' in options || 'successMessage' in options) return options as TextSaveOptions
  return {}
}

const saveCurrentFile = async (options: unknown = {}) => {
  const saveOptions = normalizeTextSaveOptions(options)
  if (!vditor || !activeTabId.value) return; const t = tabs.value.find(item => item.id === activeTabId.value)
  if (t) { 
    try { 
      if (t.textReadOnlyReason) throw new Error('大文件范围预览为只读模式，不能覆盖保存')
      let content = vditor.getValue(); 
      
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
        libraryRoot: store.libraryPath,
        path: t.path,
        formatId: format.id,
        content,
        expectedSignature: t.textSignature,
        savePolicy,
      });
      updateTabFromTextSnapshot(t, saved, savePolicy?.encoding || t.textReadEncoding)
      if (vditor.getValue() !== saved.content) {
        suppressEditorInput = true
        vditor.setValue(saved.content)
        setTimeout(() => { suppressEditorInput = false }, 0)
      }
      lastPromptedExternalSignature = ''
      message.success(saveOptions.successMessage || '已安全保存');
      // Git 自动 commit（本地）
      if (currentLibGitEnabled.value) {
        invoke('git_commit', { libraryPath: store.libraryPath, message: `更新: ${t.title}` }).catch(() => {})
      }
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
    } catch (e: any) {
      handleError(e, '保存失败', 'saveCurrentFile')
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
const switchEditorMode = (mode: string) => {
  if (!vditor || (store.editorMode === mode && store.editorModeExplicit)) return
  const content = vditor.getValue()
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  editorLoading.value = true
  vditor.destroy(); vditor = null; isVditorReady = false
  void store.updateConfig({ editorMode: mode, editorModeExplicit: true })
  nextTick(() => {
    initVditor()
    const check = setInterval(() => {
      if (vditor && isVditorReady) { clearInterval(check); vditor.setValue(content); editorLoading.value = false }
    }, 100)
  })
}
const ensureVditorModeForFile = (path: string) => {
  // The editor can be mounted before a route opens its first document. In that case it starts
  // in source mode and must be rebuilt before Markdown content is loaded into the wrong surface.
  if (!vditor || !isVditorReady) return true
  const desiredMode = desiredVditorMode(path)
  if (vditor.getCurrentMode() === desiredMode) return false
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  editorLoading.value = true
  cleanupEditorListeners()
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
  const source = window.prompt('输入要引用的 .table.json 路径（相对当前 Markdown 或绝对路径）', 'data.table.json')?.trim()
  if (!source) return
  if (!source.toLocaleLowerCase().endsWith('.table.json')) { message.error('图表源必须是 .table.json 文件'); return }
  try {
    const table = await invoke<ChartSourceDocument>('read_table_file', { libraryRoot: store.libraryPath, path: resolveMarkdownReference(source, activeTabId.value) })
    const charts = table.views.filter(view => view.kind === 'chart')
    if (!charts.length) { message.warning('该 Table 尚未创建图表视图'); return }
    const viewId = window.prompt(`输入图表视图 ID\n${charts.map(view => `${view.id} — ${view.name}`).join('\n')}`, charts[0].id)?.trim()
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
        { name: 'emoji', tip: '表情' }, { name: 'headings', tip: '标题' }, { name: 'bold', tip: '加粗 Ctrl+B' }, { name: 'italic', tip: '斜体 Ctrl+I' }, { name: 'strike', tip: '删除线' }, '|',
        { name: 'line', tip: '分割线' }, { name: 'quote', tip: '引用' }, { name: 'list', tip: '无序列表' }, { name: 'ordered-list', tip: '有序列表' }, { name: 'check', tip: '任务列表' }, '|',
        { name: 'code', tip: '代码块' }, { name: 'inline-code', tip: '行内代码' },
        { name: 'link', tip: '插入链接' }, { name: 'table', tip: '插入表格' },
        { name: 'table-chart', tip: '插入实时 Table 图表', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>', click: () => { void insertTableChartReference() } }, '|',
        { name: 'code-theme', tip: '切换代码高亮风格', icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>', click: () => {
          const themes = markdownCodeThemeChoices(store.theme)
          const nextTheme = themes[(themes.indexOf(store.codeTheme) + 1) % themes.length]
          handleCodeThemeChange(nextTheme); message.info(`代码风格: ${nextTheme.toUpperCase()}`)
        }},
        { name: 'editor-bg', tip: '修改文章背景色', icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>', click: () => { (document.querySelector('.hidden-picker-trigger .n-color-picker-trigger') as HTMLElement)?.click() }},
        { name: 'ai-assist', tip: 'AI 辅助 (Alt+A)', icon: '<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>', click: () => handleAIAssist() },
        '|', { name: 'both', tip: '双栏预览' }, { name: 'preview', tip: '预览' }, { name: 'edit-mode', tip: '切换编辑模式' }
      ],
      input: (val) => { 
        if (suppressEditorInput) {
          wordCount.value = val.length
          return
        }
        const cur = tabs.value.find(t => t.id === activeTabId.value); 
        if (cur) {
          cur.isDirty = true
          triggerAutoSave(val); 
          store.updateTabContent(cur.path, val);
        }
        wordCount.value = val.length;
      },
      after: () => {
        isVditorReady = true;
        editorLoading.value = false;
        const currentAppearance = resolveMarkdownEditorAppearance(store.theme, store.codeTheme)
        vditor.setTheme(currentAppearance.editorTheme, currentAppearance.contentTheme, currentAppearance.codeTheme)
        // 光标位置追踪（兼容 WYSIWYG / IR / SV 三种模式）
        const contentEl = vditor.vditor.wysiwyg?.element || vditor.vditor.ir?.element || vditor.vditor.sv?.element
        if (contentEl) {
          // 清理旧的监听器
          cleanupEditorListeners()

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
  if (e.key === 'F2' && selectedKeys.value.length > 0) {
    const path = selectedKeys.value[0]
    const option = findTreeOptionByKey(treeData.value, path)
    openRename(path, option ? !option.isLeaf : false)
  }
  if (e.key === 'Delete' && selectedKeys.value.length > 0) deleteAction(selectedKeys.value)
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
  void initializeUpdater()
  window.addEventListener('longedit:reveal-library-file', revealLibraryFile)
  window.addEventListener('longedit:library-file-created', refreshCreatedLibraryFile)
  await store.loadConfig()
  if (activeTabId.value && route.query.path !== activeTabId.value) {
    await router.replace({ name: 'LibraryMode', query: { ...route.query, path: activeTabId.value } })
  }
  void loadExternalApplications()
  if (activeTabId.value && !opensInLibraryShell(findFileFormat(activeTabId.value))) {
    store.activateTab(tabs.value[0]?.id || null)
  }
  window.addEventListener('keydown', handleKeyDown)
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
      updateDropTarget(event.payload.position.x, event.payload.position.y)
    } else if (event.payload.type === 'drop') {
      const targetPath = virtualDrag.dropTarget || store.libraryPath
      const position = virtualDrag.dropPosition
      
      if (event.payload.paths.length > 0 && targetPath) {
        try {
          message.loading(`正在导入...`)
          
          let finalTargetDir = targetPath
          let referenceItem = null
          if (position === 'before' || position === 'after') {
            const lastIdx = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'))
            finalTargetDir = lastIdx !== -1 ? targetPath.substring(0, lastIdx) : store.libraryPath
            referenceItem = targetPath.split(/[\\/]/).pop() || ''
          }

          const importedPaths: string[] = []
          for (const p of event.payload.paths) {
            const newPath = await invoke<string>('import_to_library', { 
              sourcePath: p, 
              libraryRoot: store.libraryPath, 
              targetDir: finalTargetDir 
            })
            importedPaths.push(newPath)
          }

          // 逻辑排序 JSON 更新
          const order = await invoke<any>('get_folder_order', { libraryRoot: store.libraryPath, path: finalTargetDir })
          let currentItems = (await invoke<FileEntry[]>('scan_directory', { libraryRoot: store.libraryPath, path: finalTargetDir }))
            .map(e => e.name)
          
          const newNames = importedPaths.map(p => p.split(/[\\/]/).pop() || '')
          currentItems = currentItems.filter(name => !newNames.includes(name))

          if (position === 'inside' || !referenceItem) {
            currentItems.push(...newNames)
          } else {
            let refIdx = currentItems.indexOf(referenceItem)
            if (position === 'before') currentItems.splice(refIdx, 0, ...newNames)
            else currentItems.splice(refIdx + 1, 0, ...newNames)
          }

          await invoke('save_folder_order', { 
            libraryRoot: store.libraryPath,
            path: finalTargetDir, 
            order: { items: currentItems, pinned: order.pinned || [] } 
          })

          await refreshNode(finalTargetDir)
          message.destroyAll(); message.success('导入完成')
        } catch (err) { message.destroyAll(); message.error('导入失败') }
      }
      virtualDrag.dropTarget = null; virtualDrag.dropPosition = null
    }
    })
  }
})

onUnmounted(() => {
  editorLoadGeneration += 1
  destroyImageFix()
  window.removeEventListener('longedit:reveal-library-file', revealLibraryFile)
  window.removeEventListener('longedit:library-file-created', refreshCreatedLibraryFile)
  window.removeEventListener('keydown', handleKeyDown)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
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
    vditor.destroy()
    vditor = null
  }
})
watch(activeSidebarTab, (newTab) => { if (newTab === 'history') fetchHistory(); if (newTab === 'links') fetchLinks() })
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
watch(() => route.query.path, (path) => {
  if (typeof path !== 'string' || !path) return
  const format = findFileFormat(path)
  if (!format) return
  if (opensInLibraryShell(format)) handleNodeSelect([path])
  else router.replace({ name: format.routeName, query: { path } })
}, { immediate: true })
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
    if (!options.automatic) message.success('搜索与关联已重新准备')
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
  relationSummaries.value = {}
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
watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim()) {
    if (activeCollectionId.value) return
    ++knowledgeSearchGeneration
    knowledgeSearchResults.value = []
    knowledgeSearchRunning.value = false
    void refreshRelationSummaries()
    refreshLibrary()
    return
  }
  activeCollectionId.value = ''
  const generation = ++knowledgeSearchGeneration
  knowledgeSearchRunning.value = true
  searchTimer = setTimeout(async () => {
    if (!store.libraryPath) return
    try {
      if (q.startsWith('#')) {
        const results = await invoke<FileEntry[]>('search_by_tag', { libraryRoot: store.libraryPath, tag: q.slice(1) })
        if (generation !== knowledgeSearchGeneration) return
        knowledgeSearchResults.value = results.map(result => ({
          title: result.name, path: result.path, objectType: 'markdown', matchKind: 'tag',
          context: `标签 #${q.slice(1)}`, score: 80, extractionFailed: false,
        }))
      } else {
        const results = await invoke<KnowledgeSearchResult[]>('search_knowledge', { libraryRoot: store.libraryPath, query: q })
        if (generation !== knowledgeSearchGeneration) return
        knowledgeSearchResults.value = results
        void refreshKnowledgeIndexStatus()
      }
      await refreshRelationSummaries()
    } catch (e) {
      if (generation === knowledgeSearchGeneration) knowledgeSearchResults.value = []
    } finally {
      if (generation === knowledgeSearchGeneration) knowledgeSearchRunning.value = false
    }
  }, 300)
})
watch(activeTabId, (newId, oldId) => { 
  if (newId && newId !== oldId) { 
    const t = tabs.value.find(item => item.id === newId); 
    if (t && findFileFormat(t.path)?.routeName === 'LibraryMode' && !ensureVditorModeForFile(t.path)) loadFileToEditor(t.path)
    if (activeSidebarTab.value === 'links') fetchLinks()

    // 侧边栏自动同步逻辑
    selectedKeys.value = [newId]
    
    // 路径分隔符自适应处理 (修复 Windows 下无法折叠的问题)
    const separator = newId.includes('\\') ? '\\' : '/'
    const parts = newId.split(separator)
    const newExpanded = [...expandedKeys.value]
    let currentPath = ''
    
    // 排除文件名，逐级还原父目录原始路径
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i === 0 ? '' : separator) + parts[i]
      if (!newExpanded.includes(currentPath)) {
        newExpanded.push(currentPath)
      }
    }
    expandedKeys.value = newExpanded

    // 利用官方 API 实现精准平滑滚动 (彻底解决自动滚动失效)
    nextTick(() => {
      setTimeout(() => {
        treeInstRef.value?.scrollTo({ key: newId, behavior: 'smooth' })
      }, 300)
    })
  } 
})
</script>

<style scoped>
.library-mode { display: flex; height: 100%; width: 100%; min-width: 0; min-height: 0; overflow: hidden; background: transparent; box-sizing: border-box; animation: fadeIn 0.6s var(--ease-premium); }
.is-dragging, .is-dragging * { transition: none !important; user-select: none !important; }

.sidebar {
  height: 100%; background: color-mix(in srgb, var(--theme-surface) 84%, var(--theme-bg)); backdrop-filter: none;
  border-right: var(--theme-border); display: flex; flex-direction: column; overflow: hidden;
  transition: width var(--motion-page) var(--ease-emphasized), opacity var(--motion-slow) var(--ease-standard); z-index: 20;
}
.is-dark .sidebar { background: color-mix(in srgb, var(--theme-surface) 90%, var(--theme-bg)); border-right: 1px solid rgba(255, 255, 255, 0.08); }
.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }

/* === 顶部 Tabs 优化 === */
.sidebar-tabs-header {
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px;
  padding: 8px; flex-shrink: 0; overflow: hidden;
}
.icon-tab {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  width: 100%; min-width: 0; height: 34px; padding: 0 4px;
  box-sizing: border-box;
  border-radius: var(--theme-radius-sm); cursor: pointer;
  background: transparent; color: var(--theme-text, #1d1d1f);
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
  min-width: 0; max-width: 48px; overflow: hidden;
  white-space: nowrap; font-size: 11px; font-weight: 600;
  opacity: 1; transform: translateX(0);
  transition: max-width var(--motion-base) var(--ease-emphasized),
              opacity var(--motion-fast) var(--ease-standard),
              transform var(--motion-base) var(--ease-emphasized);
}
.sidebar-tabs-header.compact .icon-tab { gap: 0; padding: 0; }
.sidebar-tabs-header.compact .icon-tab-text { max-width: 0; opacity: 0; transform: translateX(-4px); }
.is-dark .icon-tab:hover { background: rgba(255,255,255,0.08); }
.is-dark .icon-tab.active { background: rgba(255,255,255,0.12); }

@media (prefers-reduced-motion: reduce) {
  .icon-tab, .icon-tab :deep(svg), .icon-tab-text { transition-duration: 0.01ms; }
}

.sidebar-tab-content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.tab-pane { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

.tab-fade-enter-active, .tab-fade-leave-active { transition: all 0.3s var(--ease-premium); }
.tab-fade-enter-from { opacity: 0; transform: translateY(10px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-10px); }

.sidebar-header { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }
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
.file-style-editor { display: grid; gap: 18px; }
.file-style-preview {
  min-height: 46px; display: flex; align-items: center; gap: 9px; padding: 8px 12px;
  box-sizing: border-box; overflow: hidden; border: 1px solid var(--theme-border);
  border-radius: 7px; background: var(--theme-surface-muted); color: var(--theme-text);
  font-size: 13px; font-weight: 650;
}
.file-style-preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-style-section { display: grid; gap: 9px; }
.file-style-section > label { color: var(--theme-text); font-size: 12px; font-weight: 700; }
.file-color-options, .file-icon-options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.file-color-swatch, .file-icon-options button, .file-color-options input[type="color"] {
  width: 34px; height: 34px; padding: 0; box-sizing: border-box;
  border: 1px solid var(--theme-border); border-radius: 7px;
  background: var(--theme-surface); color: var(--theme-text-secondary); cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-emphasized), box-shadow var(--motion-fast) var(--ease-standard);
}
.file-color-swatch.default { width: 48px; font-size: 11px; }
.file-color-swatch.active, .file-icon-options button.active {
  border-color: var(--theme-primary); color: var(--theme-primary);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), .14);
}
.file-color-swatch:hover, .file-icon-options button:hover, .file-color-options input[type="color"]:hover { transform: translateY(-1px); }
.file-icon-options button { display: grid; place-items: center; }
.file-color-options input[type="color"] { overflow: hidden; }
.file-color-options input[type="color"]::-webkit-color-swatch-wrapper { padding: 3px; }
.file-color-options input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 4px; }
.file-style-actions { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; }

.tree-viewport {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  border: 2px solid transparent;
  transition: all var(--motion-base) var(--ease-standard);
  animation: treeContainerFade 0.6s var(--ease-premium);
}

.tree-viewport.drop-active {
  background: linear-gradient(135deg,
    rgba(0, 122, 255, 0.06) 0%,
    rgba(0, 122, 255, 0.03) 100%);
  border-color: rgba(0, 122, 255, 0.35);
  border-radius: var(--theme-radius);
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.15);
}

:deep(.n-tree-node-content) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--theme-radius-sm);
  transition:
    all var(--motion-base) var(--ease-premium),
    transform var(--motion-fast) var(--ease-emphasized);
  position: relative;
}

:deep(.n-tree-node-content::before) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-sm);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.08),
    transparent 60%);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

:deep(.n-tree-node-content:hover) {
  background: rgba(var(--theme-primary-rgb), 0.06) !important;
  transform: translateX(2px);
}

:deep(.n-tree-node-content:hover::before) {
  opacity: 1;
}

:deep(.n-tree-node.has-file-display-style .n-tree-node-content) {
  background: var(--file-marker-bg) !important;
  color: var(--file-marker-text) !important;
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--file-marker-accent) 55%, var(--theme-primary));
}
:deep(.n-tree-node.has-file-display-style .n-tree-node-content:hover) {
  filter: saturate(1.04) brightness(1.015);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--file-marker-accent) 70%, var(--theme-primary)), var(--theme-shadow-sm);
}
:deep(.n-tree-node.has-file-display-style .n-tree-node-content__text) { color: inherit; }

:deep(.n-tree-node-content.n-tree-node-content--selected) {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.15) 0%,
    rgba(var(--theme-primary-rgb), 0.1) 100%) !important;
  box-shadow:
    inset 0 0 0 1px rgba(var(--theme-primary-rgb), 0.2),
    var(--style-glow);
  color: var(--theme-primary) !important;
  font-weight: 650;
}

:deep(.n-tree-node-content.n-tree-node-content--selected::after) {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.6) 100%);
  box-shadow: 0 0 8px rgba(var(--theme-primary-rgb), 0.5);
}

:deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  position: relative;
  z-index: 1;
}

:deep(.n-tree-node.drop-active .n-tree-node-content) {
  background: transparent !important;
}

:deep(.n-tree-node.is-drop-inside .n-tree-node-content) {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 100%) !important;
  box-shadow: 0 0 0 2px var(--theme-primary) inset;
  border-radius: var(--theme-radius-sm);
}

:deep(.n-tree-node) {
  position: relative;
}

:deep(.n-tree-node.is-drop-before::before),
:deep(.n-tree-node.is-drop-after::after) {
  content: "";
  position: absolute;
  left: 36px;
  right: 12px;
  height: 3px;
  background: linear-gradient(90deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.8) 100%);
  z-index: 10;
  pointer-events: none;
  border-radius: 999px;
  box-shadow:
    0 0 8px rgba(var(--theme-primary-rgb), 0.6),
    -6px 0 0 var(--theme-primary),
    6px 0 0 var(--theme-primary);
}

:deep(.n-tree-node.is-drop-before::before) { top: -2px; }
:deep(.n-tree-node.is-drop-after::after) { bottom: -2px; }

/* 文件夹图标动画 */
:deep(.n-tree-node-switcher) {
  transition: transform var(--motion-base) var(--ease-emphasized);
}

:deep(.n-tree-node--expanded > .n-tree-node-content .n-tree-node-switcher) {
  transform: rotate(90deg);
}

:deep(.n-tree-node-switcher:hover) {
  transform: scale(1.15);
}

:deep(.n-tree-node--expanded > .n-tree-node-content:hover .n-tree-node-switcher) {
  transform: rotate(90deg) scale(1.15);
}

.quick-pane { padding: 8px 0; overflow-y: auto; }
.collections-pane { overflow-y: auto; }.collections-header { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; border-bottom: var(--theme-border); }.collections-header>div { display: flex; align-items: baseline; gap: 7px; }.collections-header strong { font-size: 11px; }.collections-header small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.collection-list { display: grid; padding: 5px 10px 14px; }.collection-row { min-height: 54px; display: grid; grid-template-columns: minmax(0,1fr) 28px; align-items: center; gap: 4px; border-bottom: var(--theme-border); }.collection-open { min-width: 0; height: 100%; display: grid; grid-template-columns: 22px minmax(0,1fr); align-items: center; gap: 8px; padding: 6px 2px; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.collection-open:hover { color: var(--theme-primary); }.collection-open>svg { width: 15px; color: var(--theme-primary); }.collection-open>span { min-width: 0; display: grid; gap: 3px; }.collection-open strong,.collection-open small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.collection-open strong { font-size: var(--text-compact); }.collection-open small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.tags-pane { padding: 12px; overflow-y: auto; }

.tags-help {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.05),
    rgba(var(--theme-primary-rgb), 0.02));
  border-radius: var(--theme-radius-sm);
  line-height: 1.6;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.1);
}

.tags-help code {
  background: rgba(var(--theme-primary-rgb), 0.12);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-primary);
}

.tag-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
.tag-add-row .n-input { flex: 1; }

.is-dark .tags-help {
  background: linear-gradient(135deg,
    rgba(255,255,255,0.05),
    rgba(255,255,255,0.02));
}
.is-dark .tags-help code { background: rgba(255,255,255,0.1); }

.tags-manage { display: flex; flex-direction: column; gap: 12px; }
.tags-search { margin-bottom: 6px; }
.knowledge-search-results { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px 14px; overflow-y: auto; }
.knowledge-search-state { padding: 24px 10px; color: var(--theme-text-secondary); font-size: 11px; text-align: center; line-height: 1.6; }
.knowledge-search-result { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 6px; width: 100%; padding: 4px 6px 4px 0; border: 1px solid rgba(0,0,0,.07); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.035); }
.knowledge-search-result:hover { border-color: rgba(var(--theme-primary-rgb),.3); background: rgba(var(--theme-primary-rgb),.08); }
.knowledge-result-open { min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 5px 4px 5px 10px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.graph-collection-state { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 10px; border-bottom: var(--theme-border); background: rgba(var(--theme-primary-rgb),.055); }.graph-collection-state>span { min-width: 0; display: grid; gap: 2px; }.graph-collection-state strong,.graph-collection-state small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.graph-collection-state strong { font-size: var(--text-compact); }.graph-collection-state small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.graph-collection-state button { width: 26px; height: 26px; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 16px; }
.knowledge-result-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.knowledge-result-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.knowledge-result-head i { flex: none; color: var(--theme-primary); font-size: var(--text-compact); font-style: normal; font-weight: 700; }
.knowledge-result-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.knowledge-search-result small { color: var(--theme-primary); font-size: var(--text-compact); }
.knowledge-index-strip { min-height: 44px; display: grid; grid-template-columns:16px minmax(0,1fr) auto; grid-template-rows:auto auto; align-items:center; column-gap:7px; padding:5px 8px 5px 12px; border-bottom:var(--theme-border); color:var(--theme-text-secondary); background:var(--theme-surface); font-size: var(--text-compact); }
.knowledge-index-strip>svg { grid-row:1 / 3; }.knowledge-index-strip>span { align-self:end; overflow:hidden; color:var(--theme-text); font-weight:650; text-overflow:ellipsis; white-space:nowrap; }.knowledge-index-strip>small { grid-column:2; align-self:start; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.knowledge-index-strip.state-ready>svg { color:#168a52; }.knowledge-index-strip.state-stale>svg,.knowledge-index-strip.state-corrupt>svg,.knowledge-index-strip.state-error>svg { color:#c47a16; }.knowledge-index-actions { grid-column:3; grid-row:1 / 3; display:flex; align-items:center; }

.tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all var(--motion-base) var(--ease-premium);
  font-size: 13px;
  border: 1px solid transparent;
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
.links-section { margin-bottom: 22px; }

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
.lib-label { font-size: var(--text-compact); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.3; transition: opacity 0.3s; }
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
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
}
.app-version-badge:hover,
.app-version-badge:focus-visible {
  border-color: rgba(var(--theme-primary-rgb), 0.65);
  background: rgba(var(--theme-primary-rgb), 0.15);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), 0.12);
  outline: none;
}
.app-version-badge.has-update { color: var(--theme-warning, #d97706); border-color: color-mix(in srgb, var(--theme-warning, #d97706) 45%, transparent); }
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

.resizer-area { position: relative; width: 1px; height: 100%; z-index: 100; background: rgba(0, 0, 0, 0.03); cursor: col-resize; }
.resizer-area:hover { background: var(--theme-primary); }
.drag-handle { position: absolute; top: 0; left: -8px; right: -8px; bottom: 0; z-index: 101; cursor: col-resize; }
.collapse-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 24px; height: 48px; background: var(--theme-card); color: var(--theme-text); border: var(--theme-border); box-shadow: var(--theme-shadow-sm); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 150; transition: all 0.3s var(--ease-premium); }
.collapse-btn:hover { background: var(--theme-primary); color: #fff; transform: translateY(-50%) scale(1.1); }
.collapse-btn.left { left: 0px; border-radius: 0 var(--theme-radius) var(--theme-radius) 0; }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; padding: 0 4px 4px; }
.tabs-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 0; gap: 12px; }
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
  .sidebar {
    width: 200px !important;
  }

  .tabs-bar {
    padding: 8px 8px 0 !important;
  }

  .sidebar-header {
    padding: 10px 12px !important;
  }

  .icon-tab {
    width: 28px !important;
    min-width: 28px !important;
    height: 28px !important;
  }

  .icon-tab.active {
    padding: 0 10px !important;
  }
}
.mode-toggle { display: flex; gap: 2px; }
.width-toggle { display: flex; gap: 2px; margin-left: 8px; padding-left: 8px; border-left: var(--theme-border); }
.is-dark .width-toggle { border-left-color: rgba(255,255,255,0.08); }
/* Zen 模式打字机滚动：增大顶部留白让光标居中 */
.editor-main.zen-mode .editor-viewport {
  padding-top: 30vh;
}
.editor-main.zen-mode :deep(.vditor-content) {
  min-height: 70vh;
}

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

.drag-ghost { position: fixed; pointer-events: none !important; z-index: 9999; padding: 8px 12px; background: rgba(255, 255, 255, 0.9); border: 1px solid var(--theme-primary); border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--theme-primary); }
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
.external-compare-state { min-height: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--theme-text-secondary); }
.external-compare-state.error { color: var(--status-danger); }
.external-compare-grid { min-height: 0; max-height: 52vh; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.external-compare-grid section { min-width: 0; min-height: 0; display: grid; grid-template-rows: 32px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: var(--theme-bg); }
.external-compare-grid header { display: flex; align-items: center; padding: 0 10px; color: var(--theme-text-secondary); background: var(--theme-surface-2); font-size: var(--text-compact); font-weight: 700; }
.external-compare-grid pre { min-height: 0; margin: 0; padding: 12px; overflow: auto; color: var(--theme-text); background: var(--theme-bg); font: 12px/1.65 var(--font-mono); white-space: pre; }
.external-change-actions { width: 100%; display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; }
@media (max-width: 700px) { .external-compare-grid { grid-template-columns: 1fr; max-height: 58vh; }.external-compare-grid section { min-height: 180px; }.external-change-actions { grid-template-columns: 1fr 1fr; }.external-change-actions span { display: none; } }
</style>
