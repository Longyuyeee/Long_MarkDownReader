<template>
  <div class="graph-container" ref="containerRef" :class="[`graph-canvas-theme-${graphCanvasTheme}`, { 'neighbor-focus-active': neighborFocusRoot, 'graph-path-active': pathOpen, 'graph-comparison-active': comparisonOpen, 'community-focus-active': activeCommunity && !communityOpen, 'node-details-active': selectedNode && selectedNodeIds.length === 1, 'community-overview-active': showCommunityOverview }]" data-testid="graph-container" :data-active-exploration-scopes="activeExplorationScopes.join(',')" :data-semantic-zoom-level="semanticZoomLevel" :data-community-contour-count="communityContourCount">
    <WorkspaceManagementHeader class="graph-header" title="知识图谱" @back="returnToLibrary">
      <template #icon><Network class="graph-header-icon" :size="18" /></template>
      <div class="graph-controls" data-horizontal-wheel="always">
        <WorkspaceSegmentedControl class="view-switch" aria-label="图谱布局模式">
          <button :class="{ active: viewMode === 'network' }" @click="switchView('network')">关系网络</button>
          <button :class="{ active: viewMode === 'mindmap' }" @click="switchView('mindmap')">思维导图</button>
        </WorkspaceSegmentedControl>
        <label class="graph-search">
          <Search :size="14" />
          <input v-model="searchQuery" placeholder="搜索节点" @keydown.enter="focusFirstMatch" />
        </label>
        <button class="tutorial-btn" :class="{ active: showTutorial }" @click="showTutorial = !showTutorial" title="如何建立链接">
          <CircleHelp :size="16" />
          <span>如何建立链接</span>
        </button>
        <button class="graph-export-btn" :class="{ active: pathOpen }" data-testid="graph-path-entry" @click="togglePathPanel">最短路径</button>
        <button class="graph-export-btn" :class="{ active: comparisonOpen }" data-testid="graph-comparison-entry" @click="toggleComparisonPanel">节点比较</button>
        <button class="health-entry" :class="{ active: healthOpen }" @click="healthOpen = !healthOpen">
          <span class="health-dot"></span>知识治理
        </button>
        <button class="graph-export-btn" data-testid="graph-export-svg" :disabled="isExporting" @click="exportGraph('svg')">导出 SVG</button>
        <button class="graph-export-btn" data-testid="graph-export-png" :disabled="isExporting" @click="exportGraph('png')">导出 PNG</button>
        <button class="control-btn" data-testid="graph-reset-layout" @click="resetLayout" title="清除已保存位置并重新布局">
          <RotateCcw :size="16" />
        </button>
        <button class="control-btn" :disabled="!layoutUndoStack.length" @click="undoLayout" title="撤销画布调整">
          <Undo2 :size="16" />
        </button>
        <button class="control-btn" :disabled="!layoutRedoStack.length" @click="redoLayout" title="重做画布调整">
          <Redo2 :size="16" />
        </button>
        <button class="control-btn" @click="changeGraphZoom(1.2)" title="放大">
          <ZoomIn :size="16" />
        </button>
        <button class="control-btn" @click="changeGraphZoom(0.8)" title="缩小">
          <ZoomOut :size="16" />
        </button>
        <button class="control-btn" data-testid="graph-fit-selection" :disabled="!selectedNodeIds.length" @click="fitSelection" title="适合选择">
          <ScanSearch :size="16" />
        </button>
        <button class="control-btn" data-testid="graph-fit-all" @click="fitGraph" title="适合窗口">
          <Maximize2 :size="16" />
        </button>
      </div>
    </WorkspaceManagementHeader>
    <div class="graph-options" data-horizontal-wheel="always">
      <GraphFilterControls :graph="graphData" :show-search="false" />
      <button class="community-entry" :class="{ active: communityOpen || activeCommunityId }" data-testid="graph-community-entry" @click="toggleCommunityPanel">社区 {{ communityResult.communities.length }}</button>
      <button class="community-entry" :class="{ active: selectionHistoryOpen }" data-testid="graph-selection-history-entry" @click="toggleSelectionHistoryPanel">选择历史 {{ selectionHistoryState.entries.length }}</button>
      <span class="option-divider"></span>
      <label>布局
        <select v-model="graphLayoutMode" @change="applySelectedLayout">
          <option value="force">自动网络</option>
          <option value="tree">树状</option>
          <option value="organization">组织</option>
          <option value="radial">放射</option>
          <option value="timeline">时间线</option>
        </select>
      </label>
      <label>主题
        <select v-model="graphCanvasTheme">
          <option value="professional">专业</option>
          <option value="colorful">多彩</option>
          <option value="focus">专注</option>
        </select>
      </label>
      <template v-if="viewMode === 'mindmap'">
        <span class="option-divider"></span>
        <label>展开深度
          <select v-model.number="mindmapDepth" @change="refreshMindMap">
            <option :value="1">1 层</option>
            <option :value="2">2 层</option>
            <option :value="3">3 层</option>
            <option :value="4">4 层</option>
          </select>
        </label>
        <span class="mindmap-root">中心：{{ mindmapRoot?.title || '请选择节点' }}</span>
      </template>
      <span v-if="searchQuery" class="match-count">{{ visibleNodes.length }} 个匹配</span>
    </div>
    <section v-if="communityOpen" class="graph-community-panel" data-testid="graph-community-panel">
      <header><div><strong>社区发现建议</strong><span>Louvain · {{ communityResult.communities.length }} 个社区 · 模块度 {{ communityResult.modularity.toFixed(3) }}</span></div><button type="button" data-testid="graph-community-close" aria-label="关闭社区面板" @click="communityOpen = false">×</button></header>
      <p>社区只用于当前视图探索，不写回文件或用户关系。</p>
      <button v-if="activeCommunityId" class="community-return" type="button" data-testid="graph-community-return" @click="clearCommunityFilter">返回全部社区</button>
      <div class="graph-community-list">
        <button
          v-for="community in communityResult.communities"
          :key="community.id"
          type="button"
          class="graph-community-card"
          :class="{ active: community.id === activeCommunityId }"
          data-testid="graph-community-card"
          :data-community-id="community.id"
          :data-node-count="community.nodeCount"
          @click="selectCommunity(community.id)"
        >
          <span><strong>{{ community.label }}</strong><small>{{ community.nodeCount }} 节点 · {{ community.internalEdgeCount }} 内部关系</small></span>
          <span class="community-representatives">{{ community.representativeTitles.join('、') }}</span>
          <span class="community-types">{{ community.objectTypes.slice(0, 3).map(item => `${objectTypeLabel(item.id)} ${item.count}`).join(' · ') }}</span>
        </button>
      </div>
    </section>
    <section v-if="selectionHistoryOpen" class="graph-selection-history-panel" data-testid="graph-selection-history-panel" :data-count="selectionHistoryState.entries.length" :data-cursor="selectionHistoryState.cursor">
      <header><div><strong>当前图谱选择历史</strong><span>会话内最多 20 条，不写回资料库</span></div><button type="button" data-testid="graph-selection-history-close" aria-label="关闭选择历史" @click="selectionHistoryOpen = false">×</button></header>
      <div class="selection-history-controls">
        <button type="button" data-testid="graph-selection-history-back" :disabled="selectionHistoryState.cursor <= 0" @click="restoreSelectionHistory(selectionHistoryState.cursor - 1)">← 上一个选择</button>
        <button type="button" data-testid="graph-selection-history-forward" :disabled="selectionHistoryState.cursor >= selectionHistoryState.entries.length - 1" @click="restoreSelectionHistory(selectionHistoryState.cursor + 1)">下一个选择 →</button>
      </div>
      <ol>
        <li v-for="entry in selectionHistoryEntries" :key="entry.cursor"><button type="button" data-testid="graph-selection-history-item" :data-history-cursor="entry.cursor" :data-selected-count="entry.snapshot.nodeIds.length" :class="{ active: entry.cursor === selectionHistoryState.cursor }" @click="restoreSelectionHistory(entry.cursor)"><strong>{{ entry.label }}</strong><span>{{ entry.snapshot.nodeIds.length }} 个节点</span></button></li>
      </ol>
    </section>
    <div v-if="activeCommunity && !communityOpen" class="community-focus-banner" data-testid="graph-community-focus" :data-community-id="activeCommunity.id" :data-visible-node-count="visibleNodes.length" :data-visible-edge-count="visibleEdges.length">
      <span><strong>{{ activeCommunity.label }}</strong> · {{ visibleNodes.length }} / {{ activeCommunity.nodeCount }} 节点 · {{ visibleEdges.length }} 条关系</span>
      <button type="button" data-testid="graph-community-focus-return" @click="clearCommunityFilter">返回全部社区</button>
    </div>
    <div v-if="remediationCopy" class="remediation-banner" data-testid="graph-remediation-focus" :data-remediation-focus="remediationFocus">
      <div class="remediation-copy"><strong>{{ remediationCopy.title }}</strong><span>{{ remediationCopy.detail }}</span></div>
      <div class="remediation-actions">
        <button v-if="remediationCopy.action" @click="runRemediationAction">{{ remediationCopy.action }}</button>
        <button data-testid="knowledge-outcome-entry" @click="openKnowledgeOutcome">复查改善</button>
      </div>
      <button class="remediation-close" aria-label="关闭行动提示" @click="clearRemediation">×</button>
    </div>
    <div v-if="neighborFocusRoot" class="neighbor-focus-banner" data-testid="graph-neighbor-focus" :data-focus-root="neighborFocusRoot.id">
      <span><strong>邻居聚焦：{{ neighborFocusRoot.title }}</strong> · {{ neighborFocusDepth }} 跳 · {{ visibleNodes.length }} 个节点 / {{ visibleEdges.length }} 条关系</span>
      <select v-model.number="neighborFocusDepth" data-testid="graph-neighbor-focus-depth" aria-label="邻居聚焦深度"><option :value="1">1 跳</option><option :value="2">2 跳</option><option :value="3">3 跳</option></select>
      <button type="button" data-testid="graph-neighbor-focus-return" @click="clearNeighborFocus">返回全图</button>
    </div>
    <section v-if="pathOpen" ref="pathPanelRef" class="graph-path-panel" data-testid="graph-path-panel">
      <div class="graph-path-fields">
        <select v-model="pathStartId" data-testid="graph-path-start" aria-label="最短路径起点"><option value="">选择起点</option><option v-for="node in pathCandidates" :key="node.id" :value="node.id">{{ node.title }} · {{ objectTypeLabel(node.objectType) }}</option></select>
        <span>→</span>
        <select v-model="pathEndId" data-testid="graph-path-end" aria-label="最短路径终点"><option value="">选择终点</option><option v-for="node in pathCandidates" :key="node.id" :value="node.id">{{ node.title }} · {{ objectTypeLabel(node.objectType) }}</option></select>
        <button type="button" data-testid="graph-path-run" :disabled="!pathStartId || !pathEndId || pathStartId === pathEndId" @click="runShortestPath">查找路径</button>
      </div>
      <div v-if="shortestPathResult?.status === 'found'" class="graph-path-result" data-testid="graph-path-found"><strong>{{ shortestPathResult.edges.length }} 跳</strong><span>{{ shortestPathChain }}</span><button type="button" data-testid="graph-path-return" @click="clearShortestPath">返回全图</button></div>
      <div v-else-if="shortestPathResult?.status === 'unreachable'" class="graph-path-result unreachable" data-testid="graph-path-unreachable"><strong>没有可达路径</strong><span>当前筛选范围内两节点不连通，请更换节点或调整筛选。</span></div>
      <ol v-if="pathEdgeEvidence.length" class="graph-path-evidence-list" data-testid="graph-path-evidence-list">
        <li
          v-for="(item, edgeIndex) in pathEdgeEvidence"
          :key="`${edgeIndex}-${item.edge.source}-${item.edge.target}-${item.edge.relationType}`"
          class="graph-path-evidence-edge"
          data-testid="graph-path-evidence-edge"
          :data-relation-type="item.edge.relationType"
          :data-directed="String(item.edge.directed)"
          :data-mention-count="item.mentions.length"
        >
          <header>
            <strong>第 {{ edgeIndex + 1 }} 条 · {{ relationTypeLabel(item.edge.relationType) }}</strong>
            <span>{{ item.source.title }} {{ item.edge.directed ? '→' : '↔' }} {{ item.target.title }}</span>
            <small v-if="item.traversalReversed">路径沿关系反向发现，事实方向保持不变</small>
            <small v-else>{{ item.edge.directed ? '有向关系' : '无向关系' }}</small>
          </header>
          <div v-if="item.mentions.length" class="graph-path-mentions">
            <article v-for="(mention, mentionIndex) in item.mentions" :key="`${mention.line}-${mentionIndex}-${mention.syntax}`" data-testid="graph-path-evidence-mention">
              <div><b>证据 {{ mentionIndex + 1 }}</b><span>第 {{ mention.line }} 行 · {{ relationTypeLabel(mention.relationType) }}</span></div>
              <code>{{ mention.syntax }}</code>
              <p>{{ mention.context || '该引用未提供额外上下文。' }}</p>
              <button type="button" data-testid="graph-path-evidence-return" @click="openPathMention(item, mention)">回到来源第 {{ mention.line }} 行</button>
            </article>
          </div>
          <div v-else class="graph-path-structural-evidence" data-testid="graph-path-structural-evidence">
            <span>结构关系没有 Markdown mention；来源对象定位是可审计依据。</span>
            <button type="button" data-testid="graph-path-structure-return" @click="openNode(item.source)">打开来源对象</button>
          </div>
        </li>
      </ol>
      <button class="graph-path-close" type="button" aria-label="关闭最短路径" @click="closePathPanel">×</button>
    </section>
    <section v-if="comparisonOpen" class="graph-comparison-panel" data-testid="graph-comparison-panel">
      <div class="graph-comparison-fields">
        <select v-model="comparisonLeftId" data-testid="graph-comparison-left" aria-label="比较左侧节点"><option value="">选择左侧节点</option><option v-for="node in comparisonCandidates" :key="node.id" :value="node.id">{{ node.title }} · {{ objectTypeLabel(node.objectType) }}</option></select>
        <span>对照</span>
        <select v-model="comparisonRightId" data-testid="graph-comparison-right" aria-label="比较右侧节点"><option value="">选择右侧节点</option><option v-for="node in comparisonCandidates" :key="node.id" :value="node.id">{{ node.title }} · {{ objectTypeLabel(node.objectType) }}</option></select>
        <button type="button" data-testid="graph-comparison-run" :disabled="!comparisonLeftId || !comparisonRightId || comparisonLeftId === comparisonRightId" @click="runNodeComparison">比较节点</button>
      </div>
      <template v-if="activeNodeComparison?.status === 'compared'">
        <div class="graph-comparison-summary">
          <article data-testid="graph-comparison-left-summary">
            <strong>{{ activeNodeComparison.left.node.title }}</strong><small>{{ objectTypeLabel(activeNodeComparison.left.node.objectType) }} · {{ displayWorkspacePath(activeNodeComparison.left.node.path) }}</small>
            <span>{{ activeNodeComparison.left.relationCount }} 条关系 · {{ activeNodeComparison.left.neighborCount }} 个邻居 · 入 {{ activeNodeComparison.left.incomingCount }} / 出 {{ activeNodeComparison.left.outgoingCount }}</span>
          </article>
          <div><strong>{{ activeNodeComparison.sameObjectType ? '同类对象' : '不同对象类型' }}</strong><span>共同标签 {{ activeNodeComparison.sharedTags.length }}</span></div>
          <article data-testid="graph-comparison-right-summary">
            <strong>{{ activeNodeComparison.right.node.title }}</strong><small>{{ objectTypeLabel(activeNodeComparison.right.node.objectType) }} · {{ displayWorkspacePath(activeNodeComparison.right.node.path) }}</small>
            <span>{{ activeNodeComparison.right.relationCount }} 条关系 · {{ activeNodeComparison.right.neighborCount }} 个邻居 · 入 {{ activeNodeComparison.right.incomingCount }} / 出 {{ activeNodeComparison.right.outgoingCount }}</span>
          </article>
        </div>
        <div class="graph-comparison-tags">
          <span><b>共同标签</b>{{ activeNodeComparison.sharedTags.join('、') || '无' }}</span>
          <span><b>左侧独有</b>{{ activeNodeComparison.leftOnlyTags.join('、') || '无' }}</span>
          <span><b>右侧独有</b>{{ activeNodeComparison.rightOnlyTags.join('、') || '无' }}</span>
        </div>
        <div class="graph-comparison-neighbors">
          <section data-testid="graph-comparison-common" :data-count="activeNodeComparison.commonNeighbors.length"><header>共同邻居 <b>{{ activeNodeComparison.commonNeighbors.length }}</b></header><p v-if="!activeNodeComparison.commonNeighbors.length">无</p><button v-for="node in activeNodeComparison.commonNeighbors" :key="node.id" type="button" @click="selectAndCenter(node)">{{ node.title }}<small>{{ objectTypeLabel(node.objectType) }}</small></button></section>
          <section data-testid="graph-comparison-left-only" :data-count="activeNodeComparison.leftOnlyNeighbors.length"><header>仅左侧相邻 <b>{{ activeNodeComparison.leftOnlyNeighbors.length }}</b></header><p v-if="!activeNodeComparison.leftOnlyNeighbors.length">无</p><button v-for="node in activeNodeComparison.leftOnlyNeighbors" :key="node.id" type="button" @click="selectAndCenter(node)">{{ node.title }}<small>{{ objectTypeLabel(node.objectType) }}</small></button></section>
          <section data-testid="graph-comparison-right-only" :data-count="activeNodeComparison.rightOnlyNeighbors.length"><header>仅右侧相邻 <b>{{ activeNodeComparison.rightOnlyNeighbors.length }}</b></header><p v-if="!activeNodeComparison.rightOnlyNeighbors.length">无</p><button v-for="node in activeNodeComparison.rightOnlyNeighbors" :key="node.id" type="button" @click="selectAndCenter(node)">{{ node.title }}<small>{{ objectTypeLabel(node.objectType) }}</small></button></section>
        </div>
        <div class="graph-comparison-relations" data-testid="graph-comparison-direct-relations" :data-count="activeNodeComparison.directRelations.length">
          <header>两节点直接关系 <b>{{ activeNodeComparison.directRelations.length }}</b></header>
          <p v-if="!activeNodeComparison.directRelations.length">两节点之间没有直接关系。</p>
          <article v-for="(item, relationIndex) in activeNodeComparison.directRelations" :key="`${relationIndex}-${item.edge.source}-${item.edge.target}-${item.edge.relationType}`" data-testid="graph-comparison-direct-relation" :data-relation-type="item.edge.relationType" :data-directed="String(item.edge.directed)" :data-mention-count="item.mentions.length">
            <header><strong>{{ relationTypeLabel(item.edge.relationType) }}</strong><span>{{ item.source.title }} {{ item.edge.directed ? '→' : '↔' }} {{ item.target.title }}</span></header>
            <div v-if="item.mentions.length" class="graph-comparison-mentions">
              <div v-for="(mention, mentionIndex) in item.mentions" :key="`${mention.line}-${mentionIndex}-${mention.syntax}`" data-testid="graph-comparison-mention"><span><b>证据 {{ mentionIndex + 1 }}</b> · 第 {{ mention.line }} 行 · <code>{{ mention.syntax }}</code></span><button type="button" data-testid="graph-comparison-evidence-return" @click="openComparisonMention(item, mention)">回到来源</button></div>
            </div>
            <div v-else class="graph-comparison-structural" data-testid="graph-comparison-structural-evidence"><span>结构关系没有 Markdown mention；来源对象定位是可审计依据。</span><button type="button" data-testid="graph-comparison-evidence-return" @click="openNode(item.source)">打开来源对象</button></div>
          </article>
        </div>
      </template>
      <p v-else-if="comparisonHasRun" class="graph-comparison-invalid">请选择两个不同且当前可见的节点进行比较。</p>
      <p v-else class="graph-comparison-empty">比较对象类型、标签、入出关系、共同与独有邻居，并保留两节点间全部关系证据。</p>
      <button class="graph-comparison-close" type="button" aria-label="关闭节点比较" @click="closeComparisonPanel">×</button>
    </section>
    <GraphSemanticLegend :graph="visibleGraph" :dark="isActiveThemeDark(store.theme)" :status-summary="graphNodeStatusSummary" :status-rings-visible="statusRingsVisible" />
    <nav v-if="showCommunityOverview" class="graph-community-overview-nav" data-testid="graph-community-overview" :data-community-count="communityResult.communities.length" aria-label="远景社区入口">
      <span>远景社区</span>
      <button v-for="community in communityResult.communities" :key="community.id" type="button" data-testid="graph-community-overview-entry" :data-community-id="community.id" :data-node-count="community.nodeCount" @click="selectCommunity(community.id)">
        {{ community.label }} · {{ community.nodeCount }}
      </button>
    </nav>
    <canvas
      ref="canvasRef"
      class="graph-main-canvas"
      data-testid="graph-canvas"
      tabindex="0"
      aria-label="产品知识图谱画布"
      :data-layout-mode="graphLayoutMode"
      :data-selected-count="selectedNodeIds.length"
      :data-semantic-zoom-level="semanticZoomLevel"
      :data-community-summary-count="showCommunityOverview ? communityResult.communities.length : 0"
      :data-community-overview-in-bounds="communityOverviewInBounds"
      :data-community-contour-count="communityContourCount"
      :data-community-contours-cover-members="communityContoursCoverMembers"
      :data-node-status-ring-count="renderedNodeStatusRingCount"
      :data-node-status-recency-count="renderedRecencyRingCount"
      :data-node-status-strength-count="renderedRelationStrengthRingCount"
      :data-node-status-governance-count="0"
      :data-node-status-diagnostics="graphNodeStatusDiagnostics"
      :data-path-relation-label-count="activeShortestPath?.edges.length || 0"
      :data-path-camera-safe="pathCameraSafe"
      :data-path-camera-diagnostics="pathCameraDiagnostics"
      :data-camera-motion-state="cameraMotionState"
      :data-camera-motion-reason="cameraMotionReason"
      :data-camera-motion-frames="cameraMotionFrames"
      :data-camera-motion-cancellations="cameraMotionCancellations"
      :data-camera-motion-reduced="String(cameraMotionReduced)"
      :data-camera-pose="cameraPoseDiagnostics"
      :data-camera-focus-diagnostics="cameraFocusDiagnostics"
      :data-fit-selection-diagnostics="fitSelectionDiagnostics"
      :data-path-motion-state="pathMotionState"
      :data-path-motion-reduced="pathMotionReduced"
      :data-path-motion-traversal-segments="pathMotionTraversalSegments"
      :data-path-motion-forward-segments="pathMotionForwardSegments"
      :data-path-motion-reverse-segments="pathMotionReverseSegments"
      :data-curved-route-count="viewMode === 'network' ? visibleEdgeRoutes.length : 0"
      :data-parallel-route-count="viewMode === 'network' ? visibleEdgeRoutes.filter(route => route.parallelCount > 1).length : 0"
      @mousedown="startDrag"
      @mousemove="onDrag"
      @mouseup="endDrag"
      @mouseleave="endDrag"
      @wheel.prevent="onZoom"
      @contextmenu.prevent="openGraphContextMenu"
      @click="onClick"
      @dblclick="onDblClick"
    ></canvas>
    <section
      v-if="visibleNodes.length"
      class="graph-minimap"
      data-testid="graph-minimap"
      :data-source-node-count="minimapSourceNodeCount"
      :data-rendered-point-count="minimapRenderedPointCount"
      :data-viewport-in-bounds="String(minimapViewportInBounds)"
      :data-camera-initialized="String(Boolean(cameraPoseDiagnostics))"
      :data-navigation-state="minimapNavigationState"
      :data-navigation-count="minimapNavigationCount"
      :data-diagnostics="minimapDiagnostics"
      aria-label="图谱缩略导航"
    >
      <header><span>全图方位</span><small>{{ minimapRenderedPointCount }} 点</small></header>
      <canvas
        ref="minimapCanvasRef"
        class="graph-minimap-canvas"
        data-testid="graph-minimap-canvas"
        tabindex="0"
        aria-label="点击或拖动以移动图谱视口"
        @pointerdown="startMinimapNavigation"
        @pointermove="moveMinimapNavigation"
        @pointerup="endMinimapNavigation"
        @pointercancel="cancelMinimapNavigation"
        @keydown="handleMinimapKeydown"
      ></canvas>
    </section>
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :options="contextMenuOptions"
      :show="contextMenu.show"
      :on-clickoutside="closeContextMenu"
      @select="handleContextMenuAction"
    />
    <GraphHealthPanel
      :open="healthOpen"
      :library-root="store.libraryPath"
      @close="healthOpen = false"
      @open-file="openPath"
      @repaired="handleHealthRepaired"
      @focus-node="focusHealthNode"
      @focus-guidance="focusHealthGuidance"
    />

    <transition name="hint-fade">
      <div v-if="isLoading" class="graph-loading" role="status" aria-live="polite">
        <div class="graph-loader" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <strong>正在构建知识图谱</strong>
        <p>正在分析笔记之间的链接关系...</p>
      </div>
    </transition>

    <!-- 空状态和随时可打开的链接教程 -->
    <transition name="hint-fade">
    <div v-if="!isLoading && (showTutorial || graphData.nodes.length === 0)" class="empty-graph-hint tutorial-card">
      <button v-if="showTutorial && graphData.nodes.length > 0" class="tutorial-close" @click="showTutorial = false" aria-label="关闭教程">×</button>
      <div class="empty-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <circle cx="5" cy="5" r="2"/>
          <circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="19" r="2"/>
          <circle cx="19" cy="19" r="2"/>
          <line x1="8.5" y1="6.5" x2="10.5" y2="10.5"/>
          <line x1="15.5" y1="6.5" x2="13.5" y2="10.5"/>
          <line x1="8.5" y1="17.5" x2="10.5" y2="13.5"/>
          <line x1="15.5" y1="17.5" x2="13.5" y2="13.5"/>
        </svg>
      </div>
      <h3>{{ graphData.nodes.length === 0 ? '用双向链接点亮知识图谱' : '如何建立笔记链接' }}</h3>
      <p class="tutorial-intro">在任意 Markdown 笔记中输入双方括号语法，保存后即可生成节点与连线。</p>
      <div class="tutorial-steps">
        <div class="tutorial-step">
          <span class="step-number">1</span>
          <div><strong>准备目标笔记</strong><p>例如已有一篇名为“会议记录.md”的笔记</p></div>
        </div>
        <div class="tutorial-step">
          <span class="step-number">2</span>
          <div><strong>在另一篇笔记中输入链接</strong><code>[[会议记录]]</code></div>
        </div>
        <div class="tutorial-step">
          <span class="step-number">3</span>
          <div><strong>保存并返回知识图谱</strong><p>图谱会自动识别链接并建立连线</p></div>
        </div>
      </div>
      <div class="tutorial-note">
        跨目录可写 <code>[[子目录/文件名]]</code>；文件名在知识库中唯一时，也可直接写 <code>[[文件名]]</code>。
      </div>
      <button class="tutorial-action" @click="returnToLibrary">返回编辑器试一试</button>
    </div>
    </transition>

    <WorkspaceStatusBar class="graph-stats">
      <div class="stat-item">
        <Circle :size="14" />
        {{ visibleNodes.length }} / {{ graphData.nodes.length }} 节点
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <Link2 :size="14" />
        {{ visibleEdges.length }} 连接
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <Search :size="14" />
        {{ Math.round(zoomLevel * 100) }}%
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        {{ selectedNodeIds.length }} 个已选
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item semantic-zoom-stat" data-testid="graph-semantic-zoom-status" :data-level="semanticZoomLevel">
        {{ semanticZoomLabel }}<template v-if="showCommunityOverview"> · {{ communityResult.communities.length }} 社区</template>
      </div>
    </WorkspaceStatusBar>
    <!-- 节点悬浮提示 -->
    <transition name="tooltip-fade">
      <div v-if="hoveredNode" class="node-tooltip" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
        <div class="tooltip-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <strong>{{ hoveredNode.title }}</strong>
          <small>{{ objectTypeLabel(hoveredNode.objectType) }}</small>
        </div>
        <span class="tip-path">{{ hoveredNode.locationLabel || displayWorkspacePath(hoveredNode.path) }}</span>
        <div class="tooltip-hint">双击打开 · 拖拽移动</div>
      </div>
    </transition>
    <transition name="details-slide">
      <aside v-if="selectedNode && selectedNodeIds.length === 1" ref="detailsPanelRef" class="node-details" data-testid="graph-selected-node" :data-node-id="selectedNode.id">
        <button class="details-close" @click="clearSelection" aria-label="关闭节点详情">×</button>
        <span class="details-kicker">节点详情</span>
        <h3>{{ selectedNode.title }}</h3>
        <p class="details-path">{{ displayWorkspacePath(selectedNode.path) }}<template v-if="selectedNode.locationLabel"> · {{ selectedNode.locationLabel }}</template></p>
        <div class="details-metrics">
          <div><strong>{{ nodeDegree(selectedNode.id) }}</strong><span>关系</span></div>
          <div><strong>{{ incomingCount(selectedNode.id) }}</strong><span>反向链接</span></div>
          <div><strong>{{ outgoingCount(selectedNode.id) }}</strong><span>出链</span></div>
        </div>
        <div class="details-actions">
          <button class="primary-action" @click="openNode(selectedNode)">打开{{ objectTypeLabel(selectedNode.objectType) }}</button>
          <button data-testid="graph-neighbor-focus-action" :disabled="!selectedNeighbors.length" @click="focusSelectedNeighbors">聚焦直接邻居</button>
          <button data-testid="graph-neighbor-pin-action" :disabled="Boolean(selectedNode.parentId)" @click="pinSelectedNeighborsToEditor">固定局部关系到编辑器右栏</button>
          <button @click="useAsMindmapRoot(selectedNode)">设为思维导图中心</button>
          <button :disabled="isCreatingCanvas || Boolean(selectedNode.parentId)" @click="sendToCanvas(selectedNode)">{{ isCreatingCanvas ? '正在生成…' : '发送到可编辑画布' }}</button>
          <button :disabled="isCreatingProject || !canCreateProjectNote(selectedNode)" @click="createProjectNote(selectedNode)">{{ isCreatingProject ? '正在生成…' : '生成项目笔记' }}</button>
          <button :disabled="isSavingCollection || !canCreateProjectNote(selectedNode)" @click="saveGraphCollection(selectedNode)">{{ isSavingCollection ? '正在保存…' : '保存视图' }}</button>
        </div>
        <div v-if="selectedNode.objectType === 'markdown'" class="relation-editor">
          <span class="neighbor-title">建立语义关系</span>
          <div class="relation-editor-grid">
            <select v-model="relationDraftType" aria-label="关系类型">
              <option v-for="option in relationTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-model="relationDraftTarget" aria-label="关系目标">
              <option value="">选择目标笔记</option>
              <option v-for="node in relationCandidates" :key="node.id" :value="node.path">{{ node.title }} · {{ node.directory || '根目录' }}</option>
            </select>
            <button :disabled="relationSaving || !relationDraftTarget" @click="addGraphRelation">{{ relationSaving ? '写入中…' : '添加关系' }}</button>
          </div>
          <small>关系写入源笔记 Frontmatter，Markdown 始终是事实源。</small>
        </div>
        <div v-if="selectedRelations.length" class="details-relations">
          <span class="neighbor-title">关系依据</span>
          <div
            v-for="relation in selectedRelations.slice(0, 12)"
            :key="`${relation.edge.source}-${relation.edge.target}`"
            class="details-relation-card"
          >
            <button class="relation-focus" @click="selectAndCenter(relation.other)">
              <span class="details-relation-head">
                <strong>{{ relation.other.title }}</strong>
                <small>{{ relation.direction === 'related' ? '相关' : relation.direction === 'outgoing' ? '链出 →' : '← 链入' }}</small>
              </span>
              <span class="details-relation-context">{{ relation.evidence?.context || relation.evidence?.syntax || '结构关系' }}</span>
              <span class="details-relation-meta">
                <code>{{ relation.evidence?.syntax || relationTypeLabel(relation.edge.relationType) }}</code>
                <span>{{ relationTypeLabel(relation.edge.relationType) }}<template v-if="relation.evidence?.line"> · 第 {{ relation.evidence.line }} 行</template><template v-if="relation.edge.mentions.length > 1"> · {{ relation.edge.mentions.length }} 处</template></span>
              </span>
            </button>
            <button v-if="canDeleteRelation(relation)" class="relation-delete" :disabled="relationSaving" title="从源笔记删除此语义关系" @click="removeGraphRelation(relation)">删除</button>
          </div>
        </div>
        <div v-if="selectedNeighbors.length" class="neighbor-list">
          <span class="neighbor-title">相关笔记</span>
          <button v-for="node in selectedNeighbors.slice(0, 12)" :key="node.id" @click="selectAndCenter(node)">
            <span>{{ node.title }}</span><small>{{ nodeDegree(node.id) }} 条关系</small>
          </button>
        </div>
      </aside>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { Circle, CircleHelp, Link2, Maximize2, Network, Redo2, RotateCcw, ScanSearch, Search, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { managedFileLocation, openManagedFile, openManagedObject } from '../services/fileNavigation'
import { useAppStore } from '../store/app'
import { getActiveThemeTone, isActiveThemeDark } from '../config/themePresets'
import GraphFilterControls from './GraphFilterControls.vue'
import GraphHealthPanel from './GraphHealthPanel.vue'
import GraphSemanticLegend from './GraphSemanticLegend.vue'
import WorkspaceManagementHeader from './workspace/WorkspaceManagementHeader.vue'
import WorkspaceSegmentedControl from './workspace/WorkspaceSegmentedControl.vue'
import WorkspaceStatusBar from './workspace/WorkspaceStatusBar.vue'
import { applyGraphFilters, useGraphFilters } from '../composables/useGraphFilters'
import { clearGraphLayout, createGraphPng, createGraphSvg, restoreGraphLayout, saveGraphLayout } from '../utils/graphWorkspace'
import { findShortestGraphPath } from '../utils/graphPath'
import { buildGraphPathEvidence } from '../utils/graphEvidence'
import { detectGraphCommunities } from '../utils/graphCommunities'
import { compareGraphNodes } from '../utils/graphComparison'
import { buildGraphCommunityContours, buildGraphCommunityOverview, graphCommunityContoursCoverMembers, resolveGraphSemanticZoom, selectSemanticZoomKeyNodes } from '../utils/graphSemanticZoom'
import { buildGraphEdgeRoutes, graphQuadraticGeometry, graphQuadraticLabelPoint, graphQuadraticPoint, graphQuadraticTangent } from '../utils/graphEdgeRoutes'
import { advanceGraphPathMotionPhase, graphPathDashOffset, graphPathTraversalDirection } from '../utils/graphPathMotion'
import { graphCameraPoseForBounds, graphCameraPoseForPoint, interpolateGraphCameraPose } from '../utils/graphCamera'
import type { GraphCameraPose, GraphCameraViewport } from '../utils/graphCamera'
import { graphMinimapProjection as buildGraphMinimapProjection, graphMinimapViewportRect, graphMinimapWorldPoint } from '../utils/graphMinimap'
import { deriveGraphNodeStatus } from '../utils/graphNodeStatus'
import { GRAPH_FORCE_LAYOUT_MAX_CANDIDATES_PER_NODE, type GraphForceLayoutEdge } from '../utils/graphForceLayoutKernel'
import type { GraphMinimapProjection } from '../utils/graphMinimap'
import type { GraphCommunityOverview } from '../utils/graphSemanticZoom'
import { commitGraphSelection, emptyGraphSelectionHistory, moveGraphSelectionHistory } from '../utils/graphSelectionHistory'
import { writeLocalGraphPinned } from '../utils/localGraphPin'
import { graphLineDash, graphObjectSemantic, graphRelationSemantic, graphSemanticColor } from '../config/graphSemantics'
import type { GraphPathResult } from '../utils/graphPath'
import type { GraphData, GraphNode, RelationMention } from '../types/graph'
import type { GraphPathEdgeEvidence } from '../utils/graphEvidence'
import type { GraphComparisonDirectRelation } from '../utils/graphComparison'

const props = defineProps<{ show?: boolean }>()
const emit = defineEmits(['selectFile'])

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const minimapCanvasRef = ref<HTMLCanvasElement | null>(null)
const pathPanelRef = ref<HTMLElement | null>(null)
const detailsPanelRef = ref<HTMLElement | null>(null)
const graphPageActive = ref(true)
const systemPrefersReducedMotion = ref(false)
const store = useAppStore()
const router = useRouter()
const route = useRoute()
const message = useMessage()

const graphData = ref<GraphData>({ nodes: [], edges: [] })
const isLoading = ref(true)
const showTutorial = ref(false)
const isCreatingCanvas = ref(false)
const isExporting = ref(false)
const healthOpen = ref(false)
const isCreatingProject = ref(false)
const isSavingCollection = ref(false)
const viewMode = ref<'network' | 'mindmap'>('network')
const { filters } = useGraphFilters()
const searchQuery = computed({ get: () => filters.query, set: value => { filters.query = value } })
const selectedNode = ref<GraphNode | null>(null)
const selectedNodeIds = ref<string[]>([])
const cameraMotionState = ref<'idle' | 'running' | 'completed' | 'reduced' | 'cancelled'>('idle')
const cameraMotionReason = ref('')
const cameraMotionFrames = ref(0)
const cameraMotionCancellations = ref(0)
const cameraPoseDiagnostics = ref('')
const cameraFocusDiagnostics = ref('')
const fitSelectionDiagnostics = ref('')
const minimapDiagnostics = ref('')
const minimapSourceNodeCount = ref(0)
const minimapRenderedPointCount = ref(0)
const minimapViewportInBounds = ref(true)
const minimapNavigationState = ref<'idle' | 'click' | 'drag'>('idle')
const minimapNavigationCount = ref(0)
const neighborFocusRootId = ref('')
const neighborFocusDepth = ref(1)
const pathOpen = ref(false)
const pathStartId = ref('')
const pathEndId = ref('')
const shortestPathResult = ref<GraphPathResult | null>(null)
const comparisonOpen = ref(false)
const comparisonLeftId = ref('')
const comparisonRightId = ref('')
const comparisonHasRun = ref(false)
const selectionHistoryOpen = ref(false)
const selectionHistoryState = ref(emptyGraphSelectionHistory())
const communityOpen = ref(false)
const activeCommunityId = ref('')
const activeExplorationScopes = computed(() => [
  neighborFocusRootId.value ? 'neighbor' : '',
  pathOpen.value ? 'path' : '',
  activeCommunityId.value || communityOpen.value ? 'community' : '',
  comparisonOpen.value ? 'comparison' : '',
  selectionHistoryOpen.value ? 'history' : '',
].filter(Boolean))
const contextNode = ref<GraphNode | null>(null)
const contextMenu = reactive({ show: false, x: 0, y: 0 })
type GraphLayoutMode = 'force' | 'tree' | 'organization' | 'radial' | 'timeline'
type GraphCanvasTheme = 'professional' | 'colorful' | 'focus'
type LayoutSnapshot = { mode: GraphLayoutMode; positions: Record<string, { x: number; y: number }> }
const graphLayoutMode = ref<GraphLayoutMode>((localStorage.getItem('longedit.graph.layout-mode') as GraphLayoutMode) || 'force')
const graphCanvasTheme = ref<GraphCanvasTheme>((localStorage.getItem('longedit.graph.canvas-theme') as GraphCanvasTheme) || 'colorful')
const zoomLevel = ref(1)
const layoutUndoStack = ref<LayoutSnapshot[]>([])
const layoutRedoStack = ref<LayoutSnapshot[]>([])
const mindmapRoot = ref<GraphNode | null>(null)
const mindmapDepth = ref(3)
const mindmapNodeIds = ref<Set<string> | null>(null)
const relationSaving = ref(false)
const relationDraftType = ref('related')
const relationDraftTarget = ref('')
const relationTypeOptions = ['related', 'parent', 'child', 'depends-on', 'contains', 'cites', 'derived-from']
  .map(value => ({ value, label: graphRelationSemantic(value).label }))
const editableRelationTypes = new Set(relationTypeOptions.map(option => option.value))
const remediationFocus = computed(() => typeof route.query.focus === 'string' && ['relations', 'orphans', 'diversity', 'overview'].includes(route.query.focus) ? route.query.focus : '')
const remediationCopy = computed(() => ({
  relations: { title: '建立第一条知识关系', detail: '从链接教程开始，或选中 Markdown 节点建立带语义的关系。', action: '打开链接教程' },
  orphans: { title: '正在聚焦孤立对象', detail: '画布仅显示没有关系的对象；可在治理列表中逐项打开并补充链接。', action: '打开治理列表' },
  diversity: { title: '丰富关系语义', detail: '选择节点后使用“相关、依赖、包含、引用”等关系，避免所有连接表达同一种含义。', action: '' },
  overview: { title: '知识网络状态良好', detail: '继续从核心主题检查关系依据，或切换思维导图查看层级。', action: '' },
} as Record<string, { title: string; detail: string; action: string }>)[remediationFocus.value] || null)

const recordGraphPhaseDuration = (name: string, duration: number, collection = 'phases') => {
  const profiler = (window as any).__m3c2Profiler
  if (!profiler?.enabled) return
  const phases = profiler[collection] || (profiler[collection] = {})
  const phase = phases[name] || (phases[name] = { count: 0, totalMs: 0, maximumMs: 0, over50Ms: 0, over1000Ms: 0, samples: [] })
  phase.count += 1
  phase.totalMs += duration
  phase.maximumMs = Math.max(phase.maximumMs, duration)
  if (duration >= 50) phase.over50Ms += 1
  if (duration >= 1000) phase.over1000Ms += 1
  if (phase.samples.length < 512) phase.samples.push(duration)
}
const recordGraphPhase = (name: string, startedAt: number) => recordGraphPhaseDuration(name, performance.now() - startedAt)
const measureGraphPhase = <T>(name: string, operation: () => T): T => {
  const profiler = (window as any).__m3c2Profiler
  if (!profiler?.enabled) return operation()
  const startedAt = performance.now()
  try { return operation() } finally { recordGraphPhase(name, startedAt) }
}

const degreeMap = computed(() => {
  const result = new Map<string, number>()
  for (const edge of graphData.value.edges) {
    result.set(edge.source, (result.get(edge.source) || 0) + 1)
    result.set(edge.target, (result.get(edge.target) || 0) + 1)
  }
  return result
})

const communityResult = computed(() => measureGraphPhase('community-detection', () => detectGraphCommunities(graphData.value)))
const activeCommunity = computed(() => communityResult.value.communities.find(community => community.id === activeCommunityId.value) || null)
const activeCommunityNodeIds = computed(() => activeCommunity.value ? new Set(activeCommunity.value.nodeIds) : null)
const filteredGraph = computed(() => {
  const graph = applyGraphFilters(graphData.value, filters)
  if (!activeCommunityNodeIds.value) return graph
  const nodes = graph.nodes.filter(node => activeCommunityNodeIds.value?.has(node.id))
  const nodeIds = new Set(nodes.map(node => node.id))
  return { nodes, edges: graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)) }
})
const remediationGraph = computed(() => {
  if (remediationFocus.value !== 'orphans') return filteredGraph.value
  const connected = new Set(graphData.value.edges.flatMap(edge => [edge.source, edge.target]))
  return { nodes: filteredGraph.value.nodes.filter(node => !connected.has(node.id)), edges: [] }
})
const neighborFocusRoot = computed(() => graphData.value.nodes.find(node => node.id === neighborFocusRootId.value) || null)
const neighborFocusNodeIds = computed(() => {
  const root = neighborFocusRoot.value
  if (!root) return null
  const ids = new Set([root.id])
  let frontier = [root.id]
  for (let depth = 0; depth < neighborFocusDepth.value && frontier.length; depth += 1) {
    const next: string[] = []
    for (const current of frontier) {
      for (const edge of graphData.value.edges) {
        const neighbor = edge.source === current ? edge.target : edge.target === current ? edge.source : ''
        if (neighbor && !ids.has(neighbor)) { ids.add(neighbor); next.push(neighbor) }
      }
    }
    frontier = next
  }
  return ids
})
const activeShortestPath = computed(() => shortestPathResult.value?.status === 'found' ? shortestPathResult.value : null)
const pathMotionReduced = computed(() => store.motionSpeed === 'reduced' || systemPrefersReducedMotion.value)
const cameraMotionReduced = pathMotionReduced
const pathMotionEnabled = computed(() => Boolean(activeShortestPath.value
  && viewMode.value === 'network'
  && graphPageActive.value
  && !pathMotionReduced.value))
const pathMotionState = computed(() => !activeShortestPath.value
  ? 'idle'
  : pathMotionReduced.value
    ? 'reduced'
    : graphPageActive.value ? 'running' : 'paused')
const pathMotionTraversalDirections = computed(() => activeShortestPath.value?.edges.map(edge =>
  graphPathTraversalDirection(activeShortestPath.value?.nodeIds || [], edge)
) || [])
const pathMotionTraversalSegments = computed(() => pathMotionTraversalDirections.value.filter(Boolean).length)
const pathMotionForwardSegments = computed(() => pathMotionTraversalDirections.value.filter(direction => direction === 1).length)
const pathMotionReverseSegments = computed(() => pathMotionTraversalDirections.value.filter(direction => direction === -1).length)
const shortestPathNodeIds = computed(() => activeShortestPath.value ? new Set(activeShortestPath.value.nodeIds) : null)
const visibleNodes = computed(() => {
  return remediationGraph.value.nodes.filter(node =>
    (!neighborFocusNodeIds.value || neighborFocusNodeIds.value.has(node.id))
    && (!shortestPathNodeIds.value || shortestPathNodeIds.value.has(node.id))
    && (viewMode.value !== 'mindmap' || !mindmapNodeIds.value || mindmapNodeIds.value.has(node.id))
  )
})

const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => {
  const pathEdges = activeShortestPath.value ? new Set(activeShortestPath.value.edges) : null
  return remediationGraph.value.edges.filter(edge => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target) && (!pathEdges || pathEdges.has(edge)))
})
const visibleGraph = computed<GraphData>(() => ({ nodes: visibleNodes.value, edges: visibleEdges.value }))
const visibleEdgeRoutes = computed(() => measureGraphPhase('edge-routing', () => buildGraphEdgeRoutes(visibleEdges.value)))
const visibleGraphSignature = computed(() => visibleNodes.value.map(node => node.id).join('\u001f'))
const semanticZoomState = computed(() => viewMode.value === 'mindmap'
  ? { level: 'near' as const, densityPressure: 1, effectiveZoom: zoomLevel.value }
  : resolveGraphSemanticZoom(zoomLevel.value, visibleNodes.value.length))
const semanticZoomLevel = computed(() => semanticZoomState.value.level)
const semanticZoomLabel = computed(() => ({ far: '远景', middle: '中景', near: '近景' })[semanticZoomLevel.value])
const showCommunityOverview = computed(() => semanticZoomLevel.value === 'far'
  && viewMode.value === 'network'
  && !neighborFocusRootId.value
  && !activeCommunityId.value
  && !activeShortestPath.value
  && !comparisonOpen.value)
const graphNodeStatusNowSeconds = ref(Math.floor(Date.now() / 1000))
const graphNodeStatusSummary = computed(() => measureGraphPhase('node-status-derivation', () => deriveGraphNodeStatus(visibleGraph.value, graphNodeStatusNowSeconds.value)))
const graphNodeStatusById = computed(() => new Map(graphNodeStatusSummary.value.nodes.map(status => [status.nodeId, status])))
const statusRingsVisible = computed(() => viewMode.value === 'network' && semanticZoomLevel.value !== 'far' && !showCommunityOverview.value)
const statusPrioritySuppressedIds = computed(() => new Set([
  ...selectedNodeIds.value,
  ...(activeShortestPath.value?.nodeIds || []),
  ...(hoveredNode.value ? [hoveredNode.value.id] : []),
]))
const renderedNodeStatuses = computed(() => statusRingsVisible.value
  ? graphNodeStatusSummary.value.nodes.filter(status => !statusPrioritySuppressedIds.value.has(status.nodeId) && (status.recency !== 'none' || status.showRelationStrength))
  : [])
const renderedNodeStatusRingCount = computed(() => renderedNodeStatuses.value.length)
const renderedRecencyRingCount = computed(() => renderedNodeStatuses.value.filter(status => status.recency !== 'none').length)
const renderedRelationStrengthRingCount = computed(() => renderedNodeStatuses.value.filter(status => status.showRelationStrength).length)
const graphNodeStatusHoverProbe = computed(() => {
  const status = renderedNodeStatuses.value[0]
  const node = status ? visibleNodes.value.find(item => item.id === status.nodeId) : null
  return node ? { x: node.x || 0, y: node.y || 0 } : null
})
const graphNodeStatusDiagnostics = computed(() => JSON.stringify({
  eligibleNodeCount: graphNodeStatusSummary.value.ringNodeCount,
  renderedNodeCount: renderedNodeStatusRingCount.value,
  freshCount: graphNodeStatusSummary.value.freshCount,
  recentCount: graphNodeStatusSummary.value.recentCount,
  relationStrengthCount: graphNodeStatusSummary.value.relationStrengthCount,
  maximumDegree: graphNodeStatusSummary.value.maximumDegree,
  relationStrengthThreshold: graphNodeStatusSummary.value.relationStrengthThreshold,
  prioritySuppressedCount: statusPrioritySuppressedIds.value.size,
  farHidden: !statusRingsVisible.value,
  governanceCount: 0,
  hoverProbe: graphNodeStatusHoverProbe.value,
}))
const semanticKeyNodeIds = computed(() => measureGraphPhase('semantic-key-selection', () => new Set(selectSemanticZoomKeyNodes(visibleGraph.value).map(node => node.id))))
const communityContours = computed(() => semanticZoomLevel.value === 'far' || viewMode.value !== 'network'
  ? []
  : measureGraphPhase('community-contours', () => buildGraphCommunityContours(visibleGraph.value, communityResult.value.communities, zoomLevel.value)))
const communityContourCount = computed(() => communityContours.value.length)
const communityContoursCoverMembers = computed(() => graphCommunityContoursCoverMembers(visibleGraph.value, communityContours.value))
const pathCandidates = computed(() => [...remediationGraph.value.nodes].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id)))
const shortestPathChain = computed(() => {
  const nodeMap = new Map(graphData.value.nodes.map(node => [node.id, node.title]))
  return activeShortestPath.value?.nodeIds.map(id => nodeMap.get(id) || id).join(' → ') || ''
})
const pathEdgeEvidence = computed(() => buildGraphPathEvidence(graphData.value, shortestPathResult.value))
const comparisonCandidates = computed(() => [...remediationGraph.value.nodes].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id)))
const activeNodeComparison = computed(() => comparisonHasRun.value ? compareGraphNodes(remediationGraph.value, comparisonLeftId.value, comparisonRightId.value) : null)
const selectionHistoryEntries = computed(() => [...selectionHistoryState.value.entries].map((snapshot, cursor) => {
  const titles = snapshot.nodeIds.slice(0, 3).map(id => graphData.value.nodes.find(node => node.id === id)?.title || id)
  return { cursor, snapshot, label: titles.length ? `${titles.join('、')}${snapshot.nodeIds.length > 3 ? ` 等 ${snapshot.nodeIds.length} 个` : ''}` : '已清除选择' }
}).reverse())
const contextMenuOptions = computed(() => {
  const node = contextNode.value
  if (node) return [
    { label: `打开${objectTypeLabel(node.objectType)}`, key: 'open' },
    { label: '居中查看', key: 'center' },
    { label: '设为思维导图中心', key: 'mindmap-root' },
    ...(!node.parentId ? [{ label: '生成可编辑 Canvas', key: 'send-canvas' }] : []),
    ...(canCreateProjectNote(node) ? [{ label: '生成项目笔记', key: 'project-note' }, { label: '保存当前关系视图', key: 'save-collection' }] : []),
  ]
  return [
    { label: '适合全部内容', key: 'fit' },
    { label: '恢复初始视图', key: 'reset-view' },
    { label: '重新计算布局', key: 'reset-layout' },
    { type: 'divider', key: 'mode-divider' },
    { label: '切换到关系网络', key: 'network' },
    { label: '切换到思维导图', key: 'mindmap' },
  ]
})
const clearRemediation = () => {
  const query = { ...route.query }
  delete query.focus
  router.replace({ name: 'Graph', query })
}
const runRemediationAction = () => {
  if (remediationFocus.value === 'relations') showTutorial.value = true
  if (remediationFocus.value === 'orphans') healthOpen.value = true
}
const openKnowledgeOutcome = () => router.push({ name: 'Settings', query: { focus: 'knowledge-observation' } })
const returnToLibrary = () => store.activeTabId
  ? router.push(managedFileLocation(store.activeTabId))
  : router.push({ name: 'LibraryMode' })
const nodeDegree = (id: string) => degreeMap.value.get(id) || 0
const incomingCount = (id: string) => graphData.value.edges.filter(edge => edge.target === id).length
const outgoingCount = (id: string) => graphData.value.edges.filter(edge => edge.source === id).length
const selectedNeighbors = computed(() => {
  if (!selectedNode.value) return []
  const ids = new Set<string>()
  for (const edge of graphData.value.edges) {
    if (edge.source === selectedNode.value.id) ids.add(edge.target)
    if (edge.target === selectedNode.value.id) ids.add(edge.source)
  }
  return graphData.value.nodes.filter(node => ids.has(node.id)).sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))
})
const selectedRelations = computed(() => {
  if (!selectedNode.value) return []
  const nodeMap = new Map(graphData.value.nodes.map(node => [node.id, node]))
  return graphData.value.edges.flatMap(edge => {
    const outgoing = edge.source === selectedNode.value?.id
    const incoming = edge.target === selectedNode.value?.id
    if (!outgoing && !incoming) return []
    const other = nodeMap.get(outgoing ? edge.target : edge.source)
    if (!other) return []
    return [{
      edge,
      other,
      direction: !edge.directed ? 'related' as const : outgoing ? 'outgoing' as const : 'incoming' as const,
      evidence: edge.mentions[0],
    }]
  }).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'outgoing' ? -1 : 1
    return a.other.title.localeCompare(b.other.title, 'zh-CN')
  })
})
const relationCandidates = computed(() => graphData.value.nodes
  .filter(node => node.objectType === 'markdown' && node.id !== selectedNode.value?.id)
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')))
const relationTypeLabel = (type: string) => graphRelationSemantic(type).label

type SelectedRelation = (typeof selectedRelations.value)[number]
const relationSourceNode = (relation: SelectedRelation) => graphData.value.nodes.find(node => node.id === relation.edge.source)
const canDeleteRelation = (relation: SelectedRelation) => {
  const source = relationSourceNode(relation)
  return Boolean(source?.objectType === 'markdown'
    && source.contentSignature
    && relation.evidence?.line
    && relation.evidence?.syntax
    && editableRelationTypes.has(relation.edge.relationType))
}

const reloadAfterRelationMutation = async (selectedPath: string) => {
  clearSelection()
  await loadGraph()
  const refreshed = graphData.value.nodes.find(node => node.path === selectedPath)
  if (refreshed) selectOnly(refreshed)
}

const addGraphRelation = async () => {
  const source = selectedNode.value
  if (!source?.contentSignature || !relationDraftTarget.value || relationSaving.value) return
  relationSaving.value = true
  try {
    await invoke('update_graph_relation', {
      libraryRoot: store.libraryPath,
      mutation: {
        sourcePath: source.path,
        targetPath: relationDraftTarget.value,
        relationType: relationDraftType.value,
        action: 'add',
        expectedSignature: source.contentSignature,
      },
    })
    relationDraftTarget.value = ''
    await reloadAfterRelationMutation(source.path)
  } catch (error) {
    message.error(`添加图谱关系失败：${String(error)}`)
  } finally {
    relationSaving.value = false
  }
}

const removeGraphRelation = async (relation: SelectedRelation) => {
  const source = relationSourceNode(relation)
  const evidence = relation.evidence
  if (!source?.contentSignature || !evidence || relationSaving.value) return
  relationSaving.value = true
  const selectedPath = selectedNode.value?.path || source.path
  try {
    await invoke('update_graph_relation', {
      libraryRoot: store.libraryPath,
      mutation: {
        sourcePath: source.path,
        targetPath: relation.edge.target,
        relationType: relation.edge.relationType,
        action: 'remove',
        expectedSignature: source.contentSignature,
        expectedLine: evidence.line,
        expectedSyntax: evidence.syntax,
      },
    })
    await reloadAfterRelationMutation(selectedPath)
  } catch (error) {
    message.error(`删除图谱关系失败：${String(error)}`)
  } finally {
    relationSaving.value = false
  }
}

// 图谱布局常量
const LAYOUT_MAX_FRAMES = 120
const LAYOUT_SETTLE_THRESHOLD = 0.8
const LAYOUT_MIN_FRAMES = 30

let animationId = 0
let graphLoopMounted = false
let graphFrameDirty = true
let pathMotionPhase = 0
let pathMotionFrameCount = 0
let lastLoopTimestamp = 0
let dragging: GraphNode | null = null
let wasDragging = false
let offsetX = 0, offsetY = 0
let viewX = 0, viewY = 0, zoom = 1
type CameraTransition = {
  from: GraphCameraPose
  target: GraphCameraPose
  targetNodeId: string
  startedAt: number
  duration: number
}
let cameraTransition: CameraTransition | null = null
let dragStartWorldX = 0, dragStartWorldY = 0
let dragStartPositions = new Map<string, { x: number; y: number }>()
let dragSnapshot: LayoutSnapshot | null = null
let selectionBox: { startX: number; startY: number; x: number; y: number } | null = null
let frameCount = 0
let layoutSettled = false
let communityOverviewCache: GraphCommunityOverview | null = null
let communityOverviewCacheKey = ''
let communityOverviewFrame = -1
let minimapProjectionCache: GraphMinimapProjection | null = null
let minimapProjectionCacheKey = ''
let minimapLayoutRevision = 0
let minimapPointer: { id: number; startX: number; startY: number; dragged: boolean } | null = null
const hoveredNode = ref<GraphNode | null>(null)
const hoveredCommunityId = ref('')
const communityOverviewInBounds = ref(true)
const pathCameraSafe = ref(true)
const pathCameraDiagnostics = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)
let mouseX = 0, mouseY = 0
let layoutSaveTimer = 0
let layoutWorker: Worker | null = null
let layoutWorkerJobId = 0
let layoutWorkerPending = false
let layoutWorkerInitialized = false
let layoutWorkerNodes: GraphNode[] = []
let layoutWorkerState: 'idle' | 'running' | 'settled' | 'failed' = 'idle'
let layoutWorkerCandidateChecks = 0
let layoutWorkerCappedNodeCount = 0
let layoutWorkerComputeMaximumMs = 0
let layoutWorkerApplyMaximumMs = 0
let layoutWorkerStaleResults = 0

type GraphForceLayoutWorkerResult = {
  type: 'result'
  jobId: number
  frame: number
  positions: Float64Array
  velocities: Float64Array
  energy: number
  candidateChecks: number
  cappedNodeCount: number
  computeMs: number
}
type GraphForceLayoutWorkerError = { type: 'error'; jobId: number; message: string }

const graphLoopNeedsContinuousFrames = () => Boolean(
  (viewMode.value === 'network' && !layoutSettled && !layoutWorkerPending)
  || cameraTransition
  || pathMotionEnabled.value
)
const requestGraphFrame = (dirty = true) => {
  if (dirty) graphFrameDirty = true
  if (!graphLoopMounted || !graphPageActive.value || animationId || document.hidden) return
  animationId = requestAnimationFrame(loop)
}

const currentLayoutId = () => viewMode.value === 'mindmap'
  ? `mindmap:${mindmapRoot.value?.id || 'none'}:${mindmapDepth.value}:${graphLayoutMode.value}`
  : `network:${graphLayoutMode.value}`

const layoutNodes = () => viewMode.value === 'network' ? graphData.value.nodes : visibleNodes.value
const persistLayout = () => saveGraphLayout(store.libraryPath, currentLayoutId(), layoutNodes())
const scheduleLayoutSave = () => {
  window.clearTimeout(layoutSaveTimer)
  const libraryRoot = store.libraryPath
  const layoutId = currentLayoutId()
  const nodes = layoutNodes()
  layoutSaveTimer = window.setTimeout(() => saveGraphLayout(libraryRoot, layoutId, nodes), 350)
}

const invalidateLayoutWorker = () => {
  const obsoleteJobId = layoutWorkerJobId
  layoutWorkerJobId += 1
  layoutWorkerPending = false
  layoutWorkerInitialized = false
  layoutWorkerNodes = []
  if (obsoleteJobId) layoutWorker?.postMessage({ type: 'cancel', jobId: obsoleteJobId })
  if (layoutWorkerState !== 'failed') layoutWorkerState = 'idle'
}

const handleLayoutWorkerMessage = (event: MessageEvent<GraphForceLayoutWorkerResult | GraphForceLayoutWorkerError>) => {
  const result = event.data
  if (result.jobId !== layoutWorkerJobId || !layoutWorkerInitialized || viewMode.value !== 'network') {
    layoutWorkerStaleResults += 1
    return
  }
  layoutWorkerPending = false
  if (result.type === 'error') {
    layoutWorker?.terminate()
    layoutWorker = null
    layoutWorkerInitialized = false
    layoutWorkerState = 'failed'
    layoutSettled = true
    requestGraphFrame()
    return
  }
  if (result.positions.length !== layoutWorkerNodes.length * 2 || result.velocities.length !== layoutWorkerNodes.length * 2) {
    layoutWorker?.terminate()
    layoutWorker = null
    layoutWorkerInitialized = false
    layoutWorkerState = 'failed'
    layoutSettled = true
    requestGraphFrame()
    return
  }

  const applyStartedAt = performance.now()
  for (let index = 0; index < layoutWorkerNodes.length; index += 1) {
    const node = layoutWorkerNodes[index]
    node.x = result.positions[index * 2]
    node.y = result.positions[index * 2 + 1]
    node.vx = result.velocities[index * 2]
    node.vy = result.velocities[index * 2 + 1]
  }
  const applyDuration = performance.now() - applyStartedAt
  recordGraphPhaseDuration('layout-worker-apply', applyDuration)
  recordGraphPhaseDuration('layout-worker-compute', result.computeMs, 'workerPhases')
  layoutWorkerApplyMaximumMs = Math.max(layoutWorkerApplyMaximumMs, applyDuration)
  layoutWorkerComputeMaximumMs = Math.max(layoutWorkerComputeMaximumMs, result.computeMs)
  layoutWorkerCandidateChecks = result.candidateChecks
  layoutWorkerCappedNodeCount = result.cappedNodeCount
  frameCount = result.frame
  minimapLayoutRevision += 1

  if ((result.energy < LAYOUT_SETTLE_THRESHOLD && frameCount > LAYOUT_MIN_FRAMES) || frameCount >= LAYOUT_MAX_FRAMES) {
    layoutSettled = true
    layoutWorkerState = 'settled'
    scheduleLayoutSave()
  } else {
    layoutWorkerState = 'running'
  }
  requestGraphFrame()
}

const ensureLayoutWorker = () => {
  if (layoutWorker) return layoutWorker
  try {
    layoutWorker = new Worker(new URL('../workers/graphForceLayout.worker.ts', import.meta.url), { type: 'module' })
    layoutWorker.addEventListener('message', handleLayoutWorkerMessage)
    layoutWorker.addEventListener('error', event => {
      event.preventDefault()
      layoutWorker?.terminate()
      layoutWorker = null
      layoutWorkerPending = false
      layoutWorkerInitialized = false
      layoutWorkerState = 'failed'
      layoutSettled = true
      requestGraphFrame()
    })
  } catch {
    layoutWorkerState = 'failed'
    layoutSettled = true
  }
  return layoutWorker
}

const dispatchLayoutWorkerTick = () => {
  if (layoutWorkerPending || layoutSettled || viewMode.value !== 'network') return
  const worker = ensureLayoutWorker()
  if (!worker) return
  const centerX = (containerRef.value?.clientWidth || 800) / 2 / zoom - viewX / zoom
  const centerY = (containerRef.value?.clientHeight || 600) / 2 / zoom - viewY / zoom

  if (!layoutWorkerInitialized) {
    const nodes = visibleNodes.value
    const nodeIndices = new Map(nodes.map((node, index) => [node.id, index]))
    const positions = new Float64Array(nodes.length * 2)
    const velocities = new Float64Array(nodes.length * 2)
    nodes.forEach((node, index) => {
      positions[index * 2] = node.x || 0
      positions[index * 2 + 1] = node.y || 0
      velocities[index * 2] = node.vx || 0
      velocities[index * 2 + 1] = node.vy || 0
    })
    const workerEdges: GraphForceLayoutEdge[] = visibleEdges.value.flatMap(edge => {
      const source = nodeIndices.get(edge.source)
      const target = nodeIndices.get(edge.target)
      return source === undefined || target === undefined ? [] : [{ source, target }]
    })
    const edgeIndices = new Int32Array(workerEdges.length * 2)
    workerEdges.forEach((edge, index) => {
      edgeIndices[index * 2] = edge.source
      edgeIndices[index * 2 + 1] = edge.target
    })
    layoutWorkerJobId += 1
    layoutWorkerNodes = nodes
    layoutWorkerInitialized = true
    layoutWorkerPending = true
    layoutWorkerState = 'running'
    worker.postMessage({ type: 'start', jobId: layoutWorkerJobId, nodeCount: nodes.length, positions, velocities, edgeIndices, centerX, centerY }, [positions.buffer, velocities.buffer, edgeIndices.buffer])
    return
  }

  layoutWorkerPending = true
  worker.postMessage({ type: 'tick', jobId: layoutWorkerJobId, centerX, centerY })
}

const loadGraph = async () => {
  invalidateLayoutWorker()
  isLoading.value = true
  if (!store.libraryPath) {
    graphData.value = { nodes: [], edges: [] }
    isLoading.value = false
    return
  }
  try {
    const buildStartedAt = performance.now()
    try {
      graphData.value = await invoke<any>('build_link_graph', { libraryRoot: store.libraryPath })
    } finally {
      recordGraphPhase('build-link-graph', buildStartedAt)
    }
    graphNodeStatusNowSeconds.value = Math.floor(Date.now() / 1000)
    const strongest = [...graphData.value.nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
    const requestedRoot = typeof route.query.root === 'string'
      ? graphData.value.nodes.find(node => node.id === route.query.root)
      : undefined
    const initialNode = requestedRoot || selectedNode.value || strongest
    const compactViewport = window.matchMedia('(max-width: 900px)').matches
    if (initialNode && (requestedRoot || selectedNode.value || !compactViewport)) {
      selectOnly(initialNode)
    }

    if (route.query.mode === 'mindmap' && initialNode) {
      viewMode.value = 'mindmap'
      applyMindMapLayout(initialNode)
    } else {
      initLayout()
    }
  } catch (e) {
    graphData.value = { nodes: [], edges: [] }
  } finally {
    isLoading.value = false
    requestGraphFrame()
  }
}

const initLayout = () => {
  invalidateLayoutWorker()
  const nodes = graphData.value.nodes
  const cx = (containerRef.value?.clientWidth || 800) / 2
  const cy = (containerRef.value?.clientHeight || 600) / 2
  const restored = restoreGraphLayout(store.libraryPath, currentLayoutId(), nodes)
  nodes.forEach(n => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      n.x = cx + (Math.random() - 0.5) * 400
      n.y = cy + (Math.random() - 0.5) * 400
    }
    n.vx = 0; n.vy = 0
  })
  frameCount = restored === nodes.length && nodes.length > 0 ? LAYOUT_MAX_FRAMES : 0
  layoutSettled = restored === nodes.length && nodes.length > 0
  if (!restored && graphLayoutMode.value !== 'force') positionGraphLayout(graphLayoutMode.value)
}

const adjacencyFor = (id: string) => {
  const ids = new Set<string>()
  for (const edge of graphData.value.edges) {
    if (edge.source === id) ids.add(edge.target)
    if (edge.target === id) ids.add(edge.source)
  }
  return [...ids]
}

let activeLayoutMode = graphLayoutMode.value
const captureLayoutSnapshot = (mode: GraphLayoutMode = graphLayoutMode.value): LayoutSnapshot => ({
  mode,
  positions: Object.fromEntries(layoutNodes().filter(node => Number.isFinite(node.x) && Number.isFinite(node.y)).map(node => [node.id, { x: node.x!, y: node.y! }])),
})
const restoreLayoutSnapshot = (snapshot: LayoutSnapshot) => {
  invalidateLayoutWorker()
  graphLayoutMode.value = snapshot.mode
  activeLayoutMode = snapshot.mode
  const nodes = layoutNodes()
  for (const node of nodes) {
    const point = snapshot.positions[node.id]
    if (!point) continue
    node.x = point.x; node.y = point.y; node.vx = 0; node.vy = 0
  }
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  minimapLayoutRevision += 1
  scheduleLayoutSave()
  requestGraphFrame()
}
const pushLayoutUndo = (before: LayoutSnapshot) => {
  const after = captureLayoutSnapshot()
  if (JSON.stringify(before.positions) === JSON.stringify(after.positions) && before.mode === after.mode) return
  layoutUndoStack.value.push(before)
  if (layoutUndoStack.value.length > 100) layoutUndoStack.value.shift()
  layoutRedoStack.value = []
}
const undoLayout = () => {
  const previous = layoutUndoStack.value.pop()
  if (!previous) return
  layoutRedoStack.value.push(captureLayoutSnapshot())
  restoreLayoutSnapshot(previous)
}
const redoLayout = () => {
  const next = layoutRedoStack.value.pop()
  if (!next) return
  layoutUndoStack.value.push(captureLayoutSnapshot())
  restoreLayoutSnapshot(next)
}
const graphLevels = (nodes: GraphNode[], root: GraphNode) => {
  const allowed = new Set(nodes.map(node => node.id))
  const visited = new Set<string>([root.id])
  const levels: GraphNode[][] = [[root]]
  let frontier = [root.id]
  while (frontier.length && visited.size < nodes.length) {
    const next: string[] = []
    const level: GraphNode[] = []
    for (const id of frontier) {
      for (const neighborId of adjacencyFor(id)) {
        if (!allowed.has(neighborId) || visited.has(neighborId)) continue
        const node = nodes.find(candidate => candidate.id === neighborId)
        if (!node) continue
        visited.add(neighborId); next.push(neighborId); level.push(node)
      }
    }
    if (!level.length) break
    levels.push(level)
    frontier = next
  }
  const disconnected = nodes.filter(node => !visited.has(node.id))
  if (disconnected.length) levels.push(disconnected)
  return levels
}
const positionGraphLayout = (mode: GraphLayoutMode) => {
  invalidateLayoutWorker()
  const nodes = layoutNodes()
  if (!nodes.length) return
  const width = Math.max(760, canvasRef.value?.clientWidth || containerRef.value?.clientWidth || 1000)
  const height = Math.max(520, canvasRef.value?.clientHeight || containerRef.value?.clientHeight || 700)
  if (mode === 'force') {
    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length)
      const radius = Math.min(width, height) * (0.2 + (index % 3) * 0.07)
      node.x = width / 2 + Math.cos(angle) * radius
      node.y = height / 2 + Math.sin(angle) * radius
      node.vx = 0; node.vy = 0
    })
    frameCount = 0
    layoutSettled = false
    requestGraphFrame()
    return
  }
  const root = (selectedNode.value && nodes.includes(selectedNode.value) ? selectedNode.value : null)
    || (mindmapRoot.value && nodes.includes(mindmapRoot.value) ? mindmapRoot.value : null)
    || [...nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
  const levels = graphLevels(nodes, root)
  if (mode === 'tree') {
    levels.forEach((level, depth) => level.forEach((node, index) => {
      node.x = 140 + depth * 260
      node.y = ((index + 1) * height) / (level.length + 1)
    }))
  } else if (mode === 'organization') {
    levels.forEach((level, depth) => level.forEach((node, index) => {
      node.x = ((index + 1) * width) / (level.length + 1)
      node.y = 110 + depth * 150
    }))
  } else if (mode === 'radial') {
    root.x = width / 2; root.y = height / 2
    levels.slice(1).forEach((level, depthIndex) => level.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / level.length - Math.PI / 2
      const radius = 180 + depthIndex * 170
      node.x = width / 2 + Math.cos(angle) * radius
      node.y = height / 2 + Math.sin(angle) * radius
    }))
  } else {
    const ordered = [...nodes].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    ordered.forEach((node, index) => {
      node.x = 120 + index * 220
      node.y = height / 2 + (index % 2 === 0 ? -75 : 75)
    })
  }
  nodes.forEach(node => { node.vx = 0; node.vy = 0 })
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  minimapLayoutRevision += 1
  requestGraphFrame()
}
const applySelectedLayout = () => {
  const before = captureLayoutSnapshot(activeLayoutMode)
  activeLayoutMode = graphLayoutMode.value
  positionGraphLayout(graphLayoutMode.value)
  pushLayoutUndo(before)
  scheduleLayoutSave()
  requestAnimationFrame(fitGraph)
}

const applyMindMapLayout = (root: GraphNode) => {
  invalidateLayoutWorker()
  const nodeMap = new Map(graphData.value.nodes.map(node => [node.id, node]))
  const visited = new Set<string>([root.id])
  const levels: GraphNode[][] = [[root]]
  let frontier = [root.id]

  for (let depth = 1; depth <= mindmapDepth.value && frontier.length; depth++) {
    const next: string[] = []
    const level: GraphNode[] = []
    for (const id of frontier) {
      for (const neighborId of adjacencyFor(id)) {
        if (visited.has(neighborId)) continue
        const node = nodeMap.get(neighborId)
        if (!node) continue
        visited.add(neighborId)
        next.push(neighborId)
        level.push(node)
      }
    }
    if (level.length) levels.push(level)
    frontier = next
  }

  const height = Math.max(520, containerRef.value?.clientHeight || 600)
  levels.forEach((level, depth) => {
    level.sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))
    level.forEach((node, index) => {
      node.x = 150 + depth * 260
      node.y = depth === 0 ? height / 2 : ((index + 1) * height) / (level.length + 1)
      node.vx = 0
      node.vy = 0
    })
  })

  mindmapRoot.value = root
  mindmapNodeIds.value = visited
  restoreGraphLayout(store.libraryPath, currentLayoutId(), levels.flat())
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  viewX = 40
  viewY = 0
  zoom = Math.max(0.55, Math.min(1, 3.2 / Math.max(1, levels.length)))
  zoomLevel.value = zoom
  minimapLayoutRevision += 1
  requestGraphFrame()
}

const switchView = (mode: 'network' | 'mindmap') => {
  viewMode.value = mode
  searchQuery.value = ''
  if (mode === 'network') {
    mindmapNodeIds.value = null
    resetView()
    return
  }
  graphLayoutMode.value = 'tree'
  activeLayoutMode = 'tree'
  const root = selectedNode.value || [...graphData.value.nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
  if (root) applyMindMapLayout(root)
}

const refreshMindMap = () => {
  if (mindmapRoot.value) applyMindMapLayout(mindmapRoot.value)
}

const safeExportName = () => (store.currentLibraryName || '知识图谱').replace(/[\\/:*?"<>|]/g, '-').trim() || '知识图谱'
const exportGraph = async (format: 'svg' | 'png') => {
  if (isExporting.value) return
  isExporting.value = true
  if (containerRef.value) containerRef.value.dataset.exportError = ''
  try {
    const tone = getActiveThemeTone(store.theme)
    const exportOptions = {
      mode: viewMode.value,
      title: `${store.currentLibraryName} - ${viewMode.value === 'mindmap' ? '思维导图' : '知识图谱'}`,
      dark: isActiveThemeDark(store.theme),
      rootId: mindmapRoot.value?.id,
      showRelationLabels: Boolean(activeShortestPath.value),
      colors: {
        background: tone.ui.background,
        foreground: tone.ui.text,
        card: tone.ui.surface,
        primary: tone.ui.primary,
        edge: tone.chartPalette[5],
      },
    }
    const path = await (await import('@tauri-apps/plugin-dialog')).save({
      defaultPath: `${safeExportName()}-${viewMode.value === 'mindmap' ? '思维导图' : '知识图谱'}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (!path) return
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const bytes = format === 'svg'
      ? new TextEncoder().encode(createGraphSvg(visibleNodes.value, visibleEdges.value, exportOptions))
      : await createGraphPng(visibleNodes.value, visibleEdges.value, exportOptions)
    await writeFile(path, bytes)
  } catch (error) {
    if (containerRef.value) containerRef.value.dataset.exportError = String(error)
    message.error(`图谱导出失败：${String(error)}`)
  } finally {
    isExporting.value = false
  }
}

const useAsMindmapRoot = (node: GraphNode) => {
  selectOnly(node)
  viewMode.value = 'mindmap'
  graphLayoutMode.value = 'tree'
  activeLayoutMode = 'tree'
  searchQuery.value = ''
  applyMindMapLayout(node)
}

const clearSelection = () => { selectedNode.value = null; selectedNodeIds.value = [] }
const selectOnly = (node: GraphNode | null) => {
  selectedNode.value = node
  selectedNodeIds.value = node ? [node.id] : []
}
const toggleSelection = (node: GraphNode) => {
  const next = new Set(selectedNodeIds.value)
  next.has(node.id) ? next.delete(node.id) : next.add(node.id)
  selectedNodeIds.value = [...next]
  selectedNode.value = next.has(node.id) ? node : graphData.value.nodes.find(candidate => candidate.id === selectedNodeIds.value[selectedNodeIds.value.length - 1]) || null
}

const changeGraphZoom = (factor: number, clientX?: number, clientY?: number) => {
  const canvas = canvasRef.value
  if (!canvas) return
  cancelCameraMotion()
  const rect = canvas.getBoundingClientRect()
  const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left
  const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top
  const next = Math.max(0.1, Math.min(3, zoom * factor))
  const worldX = (anchorX - viewX) / zoom
  const worldY = (anchorY - viewY) / zoom
  viewX = anchorX - worldX * next
  viewY = anchorY - worldY * next
  zoom = next
  zoomLevel.value = zoom
  requestGraphFrame()
}
const availableGraphViewports = (canvas: HTMLCanvasElement) => {
  const fallback = { x: 0, y: 0, width: canvas.clientWidth, height: canvas.clientHeight, obscured: false }
  const panel = pathPanelRef.value
  if (!pathOpen.value || !activeShortestPath.value || !panel) return [fallback]
  const canvasRect = canvas.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const overlap = {
    left: Math.max(0, panelRect.left - canvasRect.left),
    top: Math.max(0, panelRect.top - canvasRect.top),
    right: Math.min(canvas.clientWidth, panelRect.right - canvasRect.left),
    bottom: Math.min(canvas.clientHeight, panelRect.bottom - canvasRect.top),
  }
  if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) return [fallback]
  const gap = 14
  const candidates = [
    { x: 0, y: overlap.bottom + gap, width: canvas.clientWidth, height: canvas.clientHeight - overlap.bottom - gap, obscured: false },
    { x: overlap.right + gap, y: 0, width: canvas.clientWidth - overlap.right - gap, height: canvas.clientHeight, obscured: false },
  ].filter(candidate => candidate.width >= 220 && candidate.height >= 160)
  return candidates.length ? candidates : [{ ...fallback, obscured: true }]
}

const availableNodeFocusViewport = (canvas: HTMLCanvasElement): GraphCameraViewport => {
  const fallback = { x: 0, y: 0, width: canvas.clientWidth, height: canvas.clientHeight }
  const panel = detailsPanelRef.value
  if (!panel) return fallback
  const canvasRect = canvas.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const overlap = {
    left: Math.max(0, panelRect.left - canvasRect.left),
    top: Math.max(0, panelRect.top - canvasRect.top),
    right: Math.min(canvas.clientWidth, panelRect.right - canvasRect.left),
    bottom: Math.min(canvas.clientHeight, panelRect.bottom - canvasRect.top),
  }
  if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) return fallback
  const gap = 14
  const candidates = [
    { x: 0, y: 0, width: overlap.left - gap, height: canvas.clientHeight },
    { x: overlap.right + gap, y: 0, width: canvas.clientWidth - overlap.right - gap, height: canvas.clientHeight },
    { x: 0, y: 0, width: canvas.clientWidth, height: overlap.top - gap },
    { x: 0, y: overlap.bottom + gap, width: canvas.clientWidth, height: canvas.clientHeight - overlap.bottom - gap },
  ].filter(candidate => candidate.width >= 220 && candidate.height >= 160)
  return candidates.sort((left, right) => right.width * right.height - left.width * left.height)[0] || fallback
}

const nodeCameraExtents = (nodes: GraphNode[]) => nodes.map(node => {
  const halfWidth = viewMode.value === 'mindmap' ? (node.id === mindmapRoot.value?.id ? 90 : 80) : Math.max(26, node.size * 0.75)
  const halfHeight = viewMode.value === 'mindmap' ? 28 : Math.max(40, node.size * 0.75 + 24)
  return { left: (node.x || 0) - halfWidth, right: (node.x || 0) + halfWidth, top: (node.y || 0) - halfHeight, bottom: (node.y || 0) + halfHeight }
})

const cameraTargetForNodes = (nodes: GraphNode[]) => {
  const canvas = canvasRef.value
  if (!canvas || !nodes.length) return null
  const extents = nodeCameraExtents(nodes)
  const minX = Math.min(...extents.map(item => item.left)), maxX = Math.max(...extents.map(item => item.right))
  const minY = Math.min(...extents.map(item => item.top)), maxY = Math.max(...extents.map(item => item.bottom))
  const padding = 42
  const graphWidth = Math.max(1, maxX - minX)
  const graphHeight = Math.max(1, maxY - minY)
  const viewport = availableGraphViewports(canvas).sort((left, right) => {
    const leftScale = Math.min(Math.max(1, left.width - padding * 2) / graphWidth, Math.max(1, left.height - padding * 2) / graphHeight)
    const rightScale = Math.min(Math.max(1, right.width - padding * 2) / graphWidth, Math.max(1, right.height - padding * 2) / graphHeight)
    return rightScale - leftScale
  })[0]
  const target = graphCameraPoseForBounds({ left: minX, right: maxX, top: minY, bottom: maxY }, viewport, padding)
  return { target, viewport, graphWidth, graphHeight }
}

const applyCameraPose = (pose: GraphCameraPose) => {
  viewX = pose.x
  viewY = pose.y
  zoom = pose.zoom
  zoomLevel.value = zoom
  cameraPoseDiagnostics.value = JSON.stringify({ x: viewX, y: viewY, zoom })
  requestGraphFrame()
}

const cancelCameraMotion = (countCancellation = true) => {
  if (!cameraTransition) return
  cameraTransition = null
  if (countCancellation) cameraMotionCancellations.value += 1
  cameraMotionState.value = 'cancelled'
}

const requestCameraPose = (target: GraphCameraPose, reason: string, targetNodeId = '') => {
  cancelCameraMotion()
  cameraMotionReason.value = reason
  cameraMotionFrames.value = 0
  if (cameraMotionReduced.value) {
    applyCameraPose(target)
    cameraMotionState.value = 'reduced'
    return
  }
  cameraTransition = {
    from: { x: viewX, y: viewY, zoom },
    target,
    targetNodeId,
    startedAt: performance.now(),
    duration: store.motionSpeed === 'expressive' ? 180 : store.motionSpeed === 'swift' ? 220 : 280,
  }
  cameraMotionState.value = 'running'
  requestGraphFrame()
}

const currentNodeFocusTarget = (nodeId: string) => {
  const canvas = canvasRef.value
  const node = graphData.value.nodes.find(candidate => candidate.id === nodeId)
  if (!canvas || !node) return null
  const point = { x: node.x || 0, y: node.y || 0 }
  const viewport = availableNodeFocusViewport(canvas)
  const target = graphCameraPoseForPoint(point, viewport, zoom)
  cameraFocusDiagnostics.value = JSON.stringify({ nodeId, point, viewport, target })
  return target
}

const advanceCameraMotion = (timestamp: number) => {
  const transition = cameraTransition
  if (!transition) return
  const liveTarget = transition.targetNodeId ? currentNodeFocusTarget(transition.targetNodeId) || transition.target : transition.target
  if (cameraMotionReduced.value) {
    applyCameraPose(liveTarget)
    cameraTransition = null
    cameraMotionState.value = 'reduced'
    return
  }
  const progress = Math.min(1, Math.max(0, (timestamp - transition.startedAt) / transition.duration))
  applyCameraPose(interpolateGraphCameraPose(transition.from, liveTarget, progress))
  cameraMotionFrames.value += 1
  if (progress >= 1) {
    applyCameraPose(liveTarget)
    cameraTransition = null
    cameraMotionState.value = 'completed'
  }
}

const fitGraph = () => {
  const nodes = visibleNodes.value
  const resolved = cameraTargetForNodes(nodes)
  if (!resolved) return
  cancelCameraMotion()
  cameraMotionReason.value = 'fit-all'
  cameraMotionFrames.value = 0
  cameraMotionState.value = 'idle'
  applyCameraPose(resolved.target)
  const { viewport, graphWidth, graphHeight } = resolved
  const screenPoints = nodes.map(node => ({ id: node.id, x: (node.x || 0) * zoom + viewX, y: (node.y || 0) * zoom + viewY }))
  pathCameraSafe.value = !activeShortestPath.value || (!viewport.obscured && screenPoints.every(point => {
    const { x, y } = point
    return x >= viewport.x && x <= viewport.x + viewport.width && y >= viewport.y && y <= viewport.y + viewport.height
  }))
  pathCameraDiagnostics.value = JSON.stringify({ viewport, zoom, graphWidth, graphHeight, screenPoints })
}

const fitSelection = () => {
  const selected = new Set(selectedNodeIds.value)
  const nodes = visibleNodes.value.filter(node => selected.has(node.id))
  const resolved = cameraTargetForNodes(nodes)
  if (!resolved) return
  const extents = nodeCameraExtents(nodes)
  fitSelectionDiagnostics.value = JSON.stringify({
    nodeIds: nodes.map(node => node.id),
    bounds: {
      left: Math.min(...extents.map(item => item.left)),
      right: Math.max(...extents.map(item => item.right)),
      top: Math.min(...extents.map(item => item.top)),
      bottom: Math.max(...extents.map(item => item.bottom)),
    },
    viewport: resolved.viewport,
    target: resolved.target,
  })
  requestCameraPose(resolved.target, 'fit-selection')
}

const centerOnNode = (node: GraphNode) => {
  const target = currentNodeFocusTarget(node.id)
  if (target) requestCameraPose(target, 'node-focus', node.id)
}

const selectAndCenter = (node: GraphNode) => {
  selectOnly(node)
  void nextTick(() => centerOnNode(node))
}
const focusSelectedNeighbors = () => {
  if (!selectedNode.value) return
  closePathPanel()
  closeComparisonPanel()
  communityOpen.value = false
  activeCommunityId.value = ''
  selectionHistoryOpen.value = false
  neighborFocusRootId.value = selectedNode.value.id
  neighborFocusDepth.value = 1
  searchQuery.value = ''
  requestAnimationFrame(fitGraph)
}
const pinSelectedNeighborsToEditor = () => {
  if (!selectedNode.value || selectedNode.value.parentId) return
  writeLocalGraphPinned(true)
  openNode(selectedNode.value)
}
const clearNeighborFocus = () => {
  const root = neighborFocusRoot.value
  neighborFocusRootId.value = ''
  requestAnimationFrame(() => {
    fitGraph()
    if (root) selectAndCenter(root)
  })
}
const togglePathPanel = () => pathOpen.value ? closePathPanel() : openPathPanel()
const openPathPanel = () => {
  const selectedStartId = selectedNode.value?.id || ''
  closeComparisonPanel()
  selectionHistoryOpen.value = false
  neighborFocusRootId.value = ''
  communityOpen.value = false
  activeCommunityId.value = ''
  pathOpen.value = true
  pathStartId.value ||= selectedStartId
  selectedNode.value = null
}
const toggleCommunityPanel = () => {
  communityOpen.value = !communityOpen.value
  if (!communityOpen.value) return
  closePathPanel()
  closeComparisonPanel()
  selectionHistoryOpen.value = false
  neighborFocusRootId.value = ''
  selectedNode.value = null
}
const selectCommunity = (communityId: string) => {
  activeCommunityId.value = communityId
  shortestPathResult.value = null
  neighborFocusRootId.value = ''
  selectedNode.value = null
  requestAnimationFrame(fitGraph)
}
const clearCommunityFilter = () => {
  activeCommunityId.value = ''
  requestAnimationFrame(fitGraph)
}
const clearShortestPath = () => {
  shortestPathResult.value = null
  requestAnimationFrame(fitGraph)
}
const closePathPanel = () => {
  pathOpen.value = false
  pathStartId.value = ''
  pathEndId.value = ''
  clearShortestPath()
}
const runShortestPath = () => {
  shortestPathResult.value = findShortestGraphPath(remediationGraph.value, pathStartId.value, pathEndId.value)
  if (shortestPathResult.value.status === 'found') requestAnimationFrame(fitGraph)
}
const toggleComparisonPanel = () => comparisonOpen.value ? closeComparisonPanel() : openComparisonPanel()
const openComparisonPanel = () => {
  const selectedStartId = selectedNode.value?.id || ''
  closePathPanel()
  communityOpen.value = false
  clearCommunityFilter()
  neighborFocusRootId.value = ''
  selectionHistoryOpen.value = false
  comparisonOpen.value = true
  comparisonLeftId.value ||= selectedStartId
  clearSelection()
}
const closeComparisonPanel = () => {
  comparisonOpen.value = false
  comparisonLeftId.value = ''
  comparisonRightId.value = ''
  comparisonHasRun.value = false
}
const runNodeComparison = () => { comparisonHasRun.value = true }
const toggleSelectionHistoryPanel = () => {
  selectionHistoryOpen.value = !selectionHistoryOpen.value
  if (!selectionHistoryOpen.value) return
  closePathPanel()
  closeComparisonPanel()
  communityOpen.value = false
  activeCommunityId.value = ''
  neighborFocusRootId.value = ''
}
let applyingSelectionHistory = false
const restoreSelectionHistory = (cursor: number) => {
  const validNodeIds = remediationGraph.value.nodes.map(node => node.id)
  const moved = moveGraphSelectionHistory(selectionHistoryState.value, cursor, validNodeIds)
  if (!moved.snapshot) return
  applyingSelectionHistory = true
  selectionHistoryState.value = moved.state
  selectedNodeIds.value = moved.snapshot.nodeIds
  selectedNode.value = graphData.value.nodes.find(node => node.id === moved.snapshot?.activeNodeId) || null
  if (selectedNode.value) centerOnNode(selectedNode.value)
  nextTick(() => { applyingSelectionHistory = false })
}
const focusHealthNode = (nodeId: string) => {
  const node = graphData.value.nodes.find(candidate => candidate.id === nodeId)
  if (node) selectAndCenter(node)
}
const focusHealthGuidance = (focus: string) => {
  if (focus === 'library') {
    router.push({ name: 'LibraryMode' })
    return
  }
  const query = { ...route.query, focus }
  router.replace({ name: 'Graph', query })
}

const focusFirstMatch = () => {
  const node = visibleNodes.value[0]
  if (node) selectAndCenter(node)
}

const objectTypeLabel = (type: string) => graphObjectSemantic(type).label
const canCreateProjectNote = (node: GraphNode) => !node.parentId && ['markdown', 'pdf'].includes(node.objectType)
const displayWorkspacePath = (path: string) => path.replace(/^\\\\\?\\/, '')
const openNode = (node: GraphNode) => {
  return openManagedObject(router, {
    path: displayWorkspacePath(node.path),
    objectType: node.objectType,
    locator: node.locator,
    locationLabel: node.locationLabel,
  })
}
const openPathMention = (item: GraphPathEdgeEvidence, mention: RelationMention) => {
  if (item.source.objectType !== 'markdown') return openNode(item.source)
  return openManagedFile(router, displayWorkspacePath(item.source.path), {
    relationLine: String(mention.line),
    relationSyntax: mention.syntax,
    relationLocator: `${Date.now()}-${mention.line}`,
  })
}
const openComparisonMention = (item: GraphComparisonDirectRelation, mention: RelationMention) => {
  if (item.source.objectType !== 'markdown') return openNode(item.source)
  return openManagedFile(router, displayWorkspacePath(item.source.path), {
    relationLine: String(mention.line),
    relationSyntax: mention.syntax,
    relationLocator: `${Date.now()}-${mention.line}`,
  })
}
const openPath = (path: string) => openManagedFile(router, displayWorkspacePath(path))
const handleHealthRepaired = () => loadGraph()

const sendToCanvas = async (node: GraphNode) => {
  if (isCreatingCanvas.value) return
  isCreatingCanvas.value = true
  try {
    const path = await invoke<string>('create_canvas_from_graph', {
      libraryRoot: store.libraryPath,
      centerPath: node.path,
      depth: mindmapDepth.value
    })
    openManagedFile(router, path)
  } catch (error) {
    message.error(`生成画布失败：${String(error)}`)
  } finally {
    isCreatingCanvas.value = false
  }
}

const createProjectNote = async (node: GraphNode) => {
  if (isCreatingProject.value) return
  isCreatingProject.value = true
  try {
    const path = await invoke<string>('create_project_note_from_graph', {
      libraryRoot: store.libraryPath,
      centerPath: node.path,
      depth: mindmapDepth.value
    })
    openManagedFile(router, path)
  } catch (error) {
    message.error(`生成项目笔记失败：${String(error)}`)
  } finally {
    isCreatingProject.value = false
  }
}

const saveGraphCollection = async (node: GraphNode) => {
  if (isSavingCollection.value) return
  isSavingCollection.value = true
  try {
    const collection = await store.addGraphCollection(`${node.title} 关系`, node.path, mindmapDepth.value)
    router.push({ name: 'LibraryMode', query: { collection: collection.id } })
  } catch (error) {
    message.error(`保存图谱集合失败：${String(error)}`)
  } finally {
    isSavingCollection.value = false
  }
}

const simulate = () => measureGraphPhase('layout-simulation', () => {
  if (layoutSettled || viewMode.value === 'mindmap') return
  if (visibleNodes.value.length === 0) {
    layoutSettled = true
    return
  }
  dispatchLayoutWorkerTick()
})

const resetView = () => {
  cancelCameraMotion()
  invalidateLayoutWorker()
  viewX = 0
  viewY = 0
  zoom = 1
  zoomLevel.value = 1
  frameCount = 0
  layoutSettled = false
  if (viewMode.value === 'mindmap' && mindmapRoot.value) applyMindMapLayout(mindmapRoot.value)
  else initLayout()
}

const resetLayout = () => {
  const before = captureLayoutSnapshot()
  clearGraphLayout(store.libraryPath, currentLayoutId())
  for (const node of graphData.value.nodes) {
    node.x = undefined
    node.y = undefined
    node.vx = 0
    node.vy = 0
  }
  resetView()
  pushLayoutUndo(before)
}

const findNodeAt = (mx: number, my: number): GraphNode | null => {
  if (showCommunityOverview.value) return null
  // 缩放时调整检测范围 - 缩小时扩大点击区域
  const detectionRadius = 100 / Math.max(0.5, zoom)
  for (const n of visibleNodes.value) {
    const dx = mx - (n.x || 0), dy = my - (n.y || 0)
    if (viewMode.value === 'mindmap') {
      const width = n.id === mindmapRoot.value?.id ? 180 : 160
      if (Math.abs(dx) <= width / 2 && Math.abs(dy) <= 24) return n
      continue
    }
    const r = n.size * 0.6
    if (dx * dx + dy * dy < r * r + detectionRadius) return n
  }
  return null
}

const currentCommunityOverview = () => {
  const cacheKey = `${zoom.toFixed(3)}\u001e${visibleGraphSignature.value}`
  const layoutRefresh = communityOverviewFrame !== frameCount && (layoutSettled || frameCount % 8 === 0)
  if (!communityOverviewCache || communityOverviewCacheKey !== cacheKey || layoutRefresh) {
    communityOverviewCache = measureGraphPhase('community-overview', () => buildGraphCommunityOverview(visibleGraph.value, communityResult.value.communities, zoom))
    communityOverviewCacheKey = cacheKey
    communityOverviewFrame = frameCount
  }
  return communityOverviewCache
}
const findCommunityAt = (mx: number, my: number) => {
  if (!showCommunityOverview.value) return null
  return currentCommunityOverview().nodes.find(node => Math.hypot(mx - node.x, my - node.y) <= node.radius) || null
}

const frameCommunityOverview = () => {
  const canvas = canvasRef.value
  if (!canvas || !showCommunityOverview.value) return
  const overview = currentCommunityOverview()
  if (!overview.nodes.length) return
  const canvasRect = canvas.getBoundingClientRect()
  const legendRect = containerRef.value?.querySelector('[data-testid="graph-semantic-legend"]')?.getBoundingClientRect()
  const detailRect = containerRef.value?.querySelector('[data-testid="graph-selected-node"]')?.getBoundingClientRect()
  const safeLeft = legendRect ? Math.min(canvas.clientWidth * 0.46, legendRect.right - canvasRect.left + 12) : 16
  const safeRight = detailRect && canvas.clientWidth > 900 ? detailRect.left - canvasRect.left - 12 : canvas.clientWidth - 16
  const safeTop = 154
  const safeBottom = canvas.clientHeight - 108
  const minX = Math.min(...overview.nodes.map(node => node.x - node.radius))
  const maxX = Math.max(...overview.nodes.map(node => node.x + node.radius))
  const minY = Math.min(...overview.nodes.map(node => node.y - node.radius))
  const maxY = Math.max(...overview.nodes.map(node => node.y + node.radius))
  const overviewWidth = (maxX - minX) * zoom
  const overviewHeight = (maxY - minY) * zoom
  const horizontalFrame = overviewWidth <= safeRight - safeLeft
    ? { start: safeLeft, size: safeRight - safeLeft }
    : { start: 12, size: canvas.clientWidth - 24 }
  const verticalFrame = overviewHeight <= safeBottom - safeTop
    ? { start: safeTop, size: safeBottom - safeTop }
    : { start: 12, size: canvas.clientHeight - 120 }
  viewX = horizontalFrame.start + Math.max(0, horizontalFrame.size - overviewWidth) / 2 - minX * zoom
  viewY = verticalFrame.start + Math.max(0, verticalFrame.size - overviewHeight) / 2 - minY * zoom
  communityOverviewCacheKey = ''
  requestGraphFrame()
}

const refreshCameraPoseDiagnostics = () => {
  const value = JSON.stringify({ x: viewX, y: viewY, zoom })
  if (cameraPoseDiagnostics.value !== value) cameraPoseDiagnostics.value = value
}

const drawMinimap = () => {
  const minimap = minimapCanvasRef.value
  const main = canvasRef.value
  if (!minimap || !main) return
  const width = minimap.clientWidth
  const height = minimap.clientHeight
  if (width <= 0 || height <= 0) return
  const dpr = window.devicePixelRatio || 1
  if (minimap.width !== Math.round(width * dpr) || minimap.height !== Math.round(height * dpr)) {
    minimap.width = Math.round(width * dpr)
    minimap.height = Math.round(height * dpr)
  }
  const refreshBucket = layoutSettled ? minimapLayoutRevision : Math.floor(frameCount / 8)
  const cacheKey = `${visibleGraphSignature.value}\u001e${width}x${height}\u001e${refreshBucket}`
  if (!minimapProjectionCache || minimapProjectionCacheKey !== cacheKey) {
    minimapProjectionCache = buildGraphMinimapProjection(visibleNodes.value, width, height, 600, 8)
    minimapProjectionCacheKey = cacheKey
  }
  const projection = minimapProjectionCache
  const context = minimap.getContext('2d')
  if (!projection || !context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  const dark = isActiveThemeDark(store.theme)
  for (const point of projection.points) {
    context.beginPath()
    context.arc(point.x, point.y, projection.sourceNodeCount > 1000 ? 1.15 : projection.sourceNodeCount > 100 ? 1.45 : 2.2, 0, Math.PI * 2)
    context.fillStyle = graphSemanticColor(point.objectType, dark)
    context.fill()
  }
  const viewport = graphMinimapViewportRect(projection, { x: viewX, y: viewY, zoom }, { width: main.clientWidth, height: main.clientHeight })
  const tone = getActiveThemeTone(store.theme)
  context.fillStyle = `${tone.ui.primary}18`
  context.strokeStyle = tone.ui.primary
  context.lineWidth = 1.5
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height)
  context.strokeRect(viewport.x + 0.75, viewport.y + 0.75, Math.max(0.5, viewport.width - 1.5), Math.max(0.5, viewport.height - 1.5))
  minimapSourceNodeCount.value = projection.sourceNodeCount
  minimapRenderedPointCount.value = projection.points.length
  minimapViewportInBounds.value = viewport.x >= 0 && viewport.y >= 0 && viewport.x + viewport.width <= width + 0.01 && viewport.y + viewport.height <= height + 0.01
  minimapDiagnostics.value = JSON.stringify({ bounds: projection.bounds, scale: projection.scale, offsetX: projection.offsetX, offsetY: projection.offsetY, viewport, width, height, maximumPoints: 600 })
}

const minimapLocalPoint = (event: PointerEvent) => {
  const minimap = minimapCanvasRef.value
  if (!minimap) return null
  const rect = minimap.getBoundingClientRect()
  return { x: event.clientX - rect.left - minimap.clientLeft, y: event.clientY - rect.top - minimap.clientTop }
}

const minimapTargetForPoint = (point: { x: number; y: number }) => {
  const main = canvasRef.value
  if (!main || !minimapProjectionCache) return null
  const world = graphMinimapWorldPoint(minimapProjectionCache, point)
  return graphCameraPoseForPoint(world, { x: 0, y: 0, width: main.clientWidth, height: main.clientHeight }, zoom)
}

const startMinimapNavigation = (event: PointerEvent) => {
  if (event.button !== 0) return
  const point = minimapLocalPoint(event)
  if (!point) return
  cancelCameraMotion()
  minimapPointer = { id: event.pointerId, startX: point.x, startY: point.y, dragged: false }
  minimapCanvasRef.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

const moveMinimapNavigation = (event: PointerEvent) => {
  if (!minimapPointer || minimapPointer.id !== event.pointerId) return
  const point = minimapLocalPoint(event)
  if (!point) return
  if (!minimapPointer.dragged && Math.hypot(point.x - minimapPointer.startX, point.y - minimapPointer.startY) < 3) return
  minimapPointer.dragged = true
  const target = minimapTargetForPoint(point)
  if (!target) return
  applyCameraPose(target)
  cameraMotionReason.value = 'minimap-drag'
  cameraMotionState.value = cameraMotionReduced.value ? 'reduced' : 'completed'
  minimapNavigationState.value = 'drag'
  event.preventDefault()
}

const endMinimapNavigation = (event: PointerEvent) => {
  if (!minimapPointer || minimapPointer.id !== event.pointerId) return
  const point = minimapLocalPoint(event)
  const dragged = minimapPointer.dragged
  minimapCanvasRef.value?.releasePointerCapture(event.pointerId)
  minimapPointer = null
  if (!dragged && point) {
    const target = minimapTargetForPoint(point)
    if (target) requestCameraPose(target, 'minimap-click')
    minimapNavigationState.value = 'click'
  }
  minimapNavigationCount.value += 1
  event.preventDefault()
}

const cancelMinimapNavigation = (event: PointerEvent) => {
  if (minimapPointer?.id === event.pointerId) minimapPointer = null
}

const handleMinimapKeydown = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  const main = canvasRef.value
  if (!main) return
  const worldStepX = main.clientWidth / zoom * 0.15
  const worldStepY = main.clientHeight / zoom * 0.15
  const center = { x: (main.clientWidth / 2 - viewX) / zoom, y: (main.clientHeight / 2 - viewY) / zoom }
  if (event.key === 'ArrowLeft') center.x -= worldStepX
  if (event.key === 'ArrowRight') center.x += worldStepX
  if (event.key === 'ArrowUp') center.y -= worldStepY
  if (event.key === 'ArrowDown') center.y += worldStepY
  requestCameraPose(graphCameraPoseForPoint(center, { x: 0, y: 0, width: main.clientWidth, height: main.clientHeight }, zoom), 'minimap-keyboard')
  minimapNavigationState.value = 'click'
  minimapNavigationCount.value += 1
  event.preventDefault()
}

const draw = () => measureGraphPhase('canvas-draw', () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const dpr = window.devicePixelRatio || 1
  const width = container.clientWidth
  const height = container.clientHeight

  // 仅在尺寸变化时调整 canvas
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 重置变换矩阵，避免累积缩放
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(viewX, viewY)
  ctx.scale(zoom, zoom)

  const hovered = hoveredNode.value
  const isDark = isActiveThemeDark(store.theme)
  const activeTone = getActiveThemeTone(store.theme)

  // 构建节点 Map 加速查找
  const nodeMap = new Map<string, GraphNode>()
  visibleNodes.value.forEach(n => nodeMap.set(n.id, n))

  // Community contours sit behind relationships and nodes. They are derived
  // from member coordinates only and never feed forces or persisted layout.
  if (!showCommunityOverview.value && communityContours.value.length) {
    for (const contour of communityContours.value) {
      if (contour.points.length < 3) continue
      const color = graphSemanticColor(contour.semanticObjectType, isDark)
      ctx.beginPath()
      ctx.moveTo(contour.points[0].x, contour.points[0].y)
      for (let index = 1; index < contour.points.length; index += 1) ctx.lineTo(contour.points[index].x, contour.points[index].y)
      ctx.closePath()
      ctx.fillStyle = `${color}${semanticZoomLevel.value === 'middle' ? (isDark ? '1f' : '17') : (isDark ? '12' : '0d')}`
      ctx.fill()
      ctx.strokeStyle = `${color}${semanticZoomLevel.value === 'middle' ? '9c' : '66'}`
      ctx.lineWidth = (semanticZoomLevel.value === 'middle' ? 2 : 1.25) / zoom
      ctx.setLineDash(semanticZoomLevel.value === 'middle' ? [] : [5 / zoom, 4 / zoom])
      ctx.stroke()
      ctx.setLineDash([])
      if (semanticZoomLevel.value === 'middle') {
        const label = contour.label.length > 18 ? `${contour.label.slice(0, 18)}…` : contour.label
        ctx.font = `700 ${11 / zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = color
        ctx.fillText(`${label} · ${contour.nodeIds.length}`, contour.labelX, contour.labelY)
      }
    }
  }

  if (showCommunityOverview.value) {
    const overview = currentCommunityOverview()
    const overviewNodes = new Map(overview.nodes.map(node => [node.id, node]))
    for (const edge of overview.edges) {
      const source = overviewNodes.get(edge.source)
      const target = overviewNodes.get(edge.target)
      if (!source || !target) continue
      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.28)'
      ctx.lineWidth = Math.min(5, 1.5 + Math.log2(edge.edgeCount + 1)) / zoom
      ctx.stroke()
    }
    for (const community of overview.nodes) {
      const color = graphSemanticColor(community.semanticObjectType, isDark)
      const hoveredCommunity = hoveredCommunityId.value === community.id
      ctx.beginPath()
      ctx.arc(community.x, community.y, community.radius, 0, Math.PI * 2)
      ctx.fillStyle = `${color}${isDark ? '2e' : '24'}`
      ctx.fill()
      ctx.strokeStyle = hoveredCommunity ? activeTone.ui.primary : color
      ctx.lineWidth = (hoveredCommunity ? 4 : 2.5) / zoom
      ctx.stroke()
      ctx.fillStyle = activeTone.ui.text
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${13 / zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      const label = community.label.length > 18 ? `${community.label.slice(0, 18)}…` : community.label
      ctx.fillText(label, community.x, community.y - 6 / zoom, community.radius * 1.65)
      ctx.font = `600 ${11 / zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.fillStyle = isDark ? 'rgba(255,255,255,.74)' : 'rgba(15,23,42,.68)'
      ctx.fillText(`${community.nodeCount} 节点 · ${community.internalEdgeCount} 内部联系`, community.x, community.y + 13 / zoom, community.radius * 1.72)
    }
    communityOverviewInBounds.value = overview.nodes.every(community => {
      const screenX = community.x * zoom + viewX
      const screenY = community.y * zoom + viewY
      const screenRadius = community.radius * zoom
      return screenX - screenRadius >= 0 && screenX + screenRadius <= width && screenY - screenRadius >= 0 && screenY + screenRadius <= height
    })
  } else {
    communityOverviewInBounds.value = true
  }

  // 边 - 渐变效果（小缩放级别时跳过以优化性能）
  if (!showCommunityOverview.value) {
    const nodePoints = new Map(visibleNodes.value.map(node => [node.id, { x: node.x || 0, y: node.y || 0 }]))
    for (const route of visibleEdgeRoutes.value) {
      const e = route.edge
      const s = nodeMap.get(e.source)
      const t = nodeMap.get(e.target)
      if (!s || !t) continue

      const isHighlight = hovered && (s === hovered || t === hovered)
      const isPathEdge = Boolean(activeShortestPath.value?.edges.includes(e))
      const routeGeometry = viewMode.value === 'network' ? graphQuadraticGeometry(route, nodePoints) : null

      const relationSemantic = graphRelationSemantic(e.relationType)
      ctx.setLineDash(graphLineDash(relationSemantic.line, zoom))
      ctx.beginPath()
      ctx.moveTo(s.x || 0, s.y || 0)
      if (viewMode.value === 'mindmap') {
        const midX = ((s.x || 0) + (t.x || 0)) / 2
        ctx.bezierCurveTo(midX, s.y || 0, midX, t.y || 0, t.x || 0, t.y || 0)
      } else if (routeGeometry) {
        ctx.quadraticCurveTo(routeGeometry.control.x, routeGeometry.control.y, routeGeometry.target.x, routeGeometry.target.y)
      }

      if (isPathEdge) {
        ctx.strokeStyle = relationSemantic.color
        ctx.globalAlpha = 0.92
        ctx.lineWidth = 2.6 / zoom
      } else if (isHighlight) {
        const gradient = ctx.createLinearGradient(s.x || 0, s.y || 0, t.x || 0, t.y || 0)
        gradient.addColorStop(0, `${activeTone.ui.primary}99`)
        gradient.addColorStop(1, `${activeTone.ui.primary}4d`)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 2.5 / zoom
      } else {
        ctx.strokeStyle = relationSemantic.color
        ctx.globalAlpha = isDark ? 0.42 : 0.5
        ctx.lineWidth = 1 / zoom
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.setLineDash([])

      if (isPathEdge && routeGeometry && pathMotionEnabled.value && activeShortestPath.value) {
        const traversalDirection = graphPathTraversalDirection(activeShortestPath.value.nodeIds, e)
        if (traversalDirection) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(routeGeometry.source.x, routeGeometry.source.y)
          ctx.quadraticCurveTo(routeGeometry.control.x, routeGeometry.control.y, routeGeometry.target.x, routeGeometry.target.y)
          ctx.setLineDash([7 / zoom, 17 / zoom])
          ctx.lineDashOffset = graphPathDashOffset(pathMotionPhase, traversalDirection, zoom)
          ctx.strokeStyle = activeTone.ui.text
          ctx.globalAlpha = 0.82
          ctx.lineWidth = 1.15 / zoom
          ctx.stroke()
          ctx.restore()
        }
      }

      if (e.directed) {
        const sx = s.x || 0, sy = s.y || 0, tx = t.x || 0, ty = t.y || 0
        const arrowPoint = routeGeometry ? graphQuadraticPoint(routeGeometry, 0.72) : { x: sx + (tx - sx) * 0.72, y: sy + (ty - sy) * 0.72 }
        const tangent = routeGeometry ? graphQuadraticTangent(routeGeometry, 0.72) : { x: tx - sx, y: ty - sy }
        const angle = Math.atan2(tangent.y, tangent.x)
        const arrowSize = 5 / zoom
        ctx.save()
        ctx.translate(arrowPoint.x, arrowPoint.y)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(arrowSize, 0)
        ctx.lineTo(-arrowSize, -arrowSize * 0.7)
        ctx.lineTo(-arrowSize, arrowSize * 0.7)
        ctx.closePath()
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
        ctx.restore()
      }

      if (isPathEdge && routeGeometry && viewMode.value === 'network') {
        const labelPoint = graphQuadraticLabelPoint(routeGeometry, route.curveOffset, 20 / zoom)
        const tangent = graphQuadraticTangent(routeGeometry, 0.5)
        let angle = Math.atan2(tangent.y, tangent.x)
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI
        const label = relationSemantic.label
        ctx.save()
        ctx.translate(labelPoint.x, labelPoint.y)
        ctx.rotate(angle)
        ctx.font = `700 ${10 / zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const labelWidth = ctx.measureText(label).width + 12 / zoom
        const labelHeight = 18 / zoom
        ctx.fillStyle = activeTone.ui.surface
        ctx.strokeStyle = relationSemantic.color
        ctx.globalAlpha = 0.96
        ctx.lineWidth = 1 / zoom
        ctx.beginPath()
        ctx.rect(-labelWidth / 2, -labelHeight / 2, labelWidth, labelHeight)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = activeTone.ui.text
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
  }

  // 节点 - 光晕效果
  for (const n of showCommunityOverview.value ? [] : visibleNodes.value) {
    const r = n.size * 0.6
    const nx = n.x || 0, ny = n.y || 0
    const isHovered = hovered === n
    const isSelected = selectedNodeIds.value.includes(n.id)

    if (viewMode.value === 'mindmap') {
      const isRoot = n.id === mindmapRoot.value?.id
      const width = isRoot ? 180 : 160
      const height = isRoot ? 48 : 42
      const x = (n.x || 0) - width / 2
      const y = (n.y || 0) - height / 2
      ctx.beginPath()
      ctx.roundRect(x, y, width, height, isRoot ? 16 : 11)
      ctx.fillStyle = isRoot
        ? activeTone.ui.primary
        : (isDark ? 'rgba(37,42,48,0.96)' : 'rgba(255,255,255,0.98)')
      ctx.shadowColor = isHovered || isSelected ? `${activeTone.ui.primary}4d` : 'rgba(0,0,0,0.12)'
      ctx.shadowBlur = isHovered || isSelected ? 18 : 8
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = isHovered || isSelected
        ? activeTone.ui.primary
        : (isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.1)')
      ctx.lineWidth = (isHovered || isSelected ? 2 : 1) / zoom
      ctx.stroke()
      ctx.fillStyle = isRoot ? '#fff' : (isDark ? 'rgba(255,255,255,0.92)' : 'rgba(20,24,31,0.9)')
      ctx.font = `${isRoot ? 700 : 600} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const nodeTitle = n.objectType === 'pdf' ? `PDF · ${n.title}` : n.objectType === 'table' ? `表格 · ${n.title}` : n.title
      const display = nodeTitle.length > 16 ? `${nodeTitle.slice(0, 16)}…` : nodeTitle
      ctx.fillText(display, n.x || 0, n.y || 0, width - 18)
      continue
    }

    const nodeStatus = graphNodeStatusById.value.get(n.id)
    const statusPrioritySuppressed = isHovered || isSelected || Boolean(shortestPathNodeIds.value?.has(n.id))
    if (statusRingsVisible.value && nodeStatus && !statusPrioritySuppressed) {
      ctx.save()
      ctx.lineCap = 'round'
      if (nodeStatus.recency !== 'none') {
        const ringRadius = r + 4 / zoom
        const start = -Math.PI * 0.82
        const sweep = nodeStatus.recency === 'fresh' ? Math.PI * 1.52 : Math.PI * 0.92
        ctx.beginPath()
        ctx.arc(nx, ny, ringRadius, start, start + sweep)
        ctx.strokeStyle = store.theme === 'contrast'
          ? '#ffd400'
          : nodeStatus.recency === 'fresh' ? '#f59e0b' : '#d97706'
        ctx.globalAlpha = nodeStatus.recency === 'fresh' ? 0.96 : 0.78
        ctx.lineWidth = 2 / zoom
        ctx.stroke()
      }
      if (nodeStatus.showRelationStrength) {
        const ringRadius = r + 7 / zoom
        const start = Math.PI * 0.12
        const sweep = Math.PI * (0.72 + nodeStatus.relationStrength * 0.72)
        ctx.beginPath()
        ctx.arc(nx, ny, ringRadius, start, start + sweep)
        ctx.strokeStyle = store.theme === 'contrast' ? '#00e5ff' : isDark ? '#38bdf8' : '#0369a1'
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 2 / zoom
        ctx.stroke()
      }
      ctx.restore()
    }

    // 外层光晕
    if (isHovered) {
      const glowGradient = ctx.createRadialGradient(n.x || 0, n.y || 0, r, n.x || 0, n.y || 0, r * 2)
      glowGradient.addColorStop(0, isDark ? 'rgba(66,184,131,0.3)' : 'rgba(0,122,255,0.3)')
      glowGradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(n.x || 0, n.y || 0, r * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 主体节点：形状和颜色来自统一语义注册表。
    const objectSemantic = graphObjectSemantic(n.objectType)
    ctx.beginPath()
    if (objectSemantic.shape === 'square') {
      ctx.roundRect(nx - r, ny - r, r * 2, r * 2, Math.max(2, r * 0.22))
    } else if (objectSemantic.shape === 'diamond') {
      ctx.moveTo(nx, ny - r); ctx.lineTo(nx + r, ny); ctx.lineTo(nx, ny + r); ctx.lineTo(nx - r, ny); ctx.closePath()
    } else if (objectSemantic.shape === 'hexagon') {
      for (let index = 0; index < 6; index += 1) {
        const angle = Math.PI / 3 * index - Math.PI / 2
        const x = nx + Math.cos(angle) * r, y = ny + Math.sin(angle) * r
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.closePath()
    } else {
      ctx.arc(nx, ny, r, 0, Math.PI * 2)
    }

    const nodeGradient = ctx.createRadialGradient(
      (n.x || 0) - r * 0.3, (n.y || 0) - r * 0.3, 0,
      n.x || 0, n.y || 0, r
    )

    const semanticColor = graphSemanticColor(n.objectType, isDark)
    nodeGradient.addColorStop(0, semanticColor)
    nodeGradient.addColorStop(1, semanticColor)

    ctx.fillStyle = nodeGradient
    ctx.fill()

    // 边缘描边
    ctx.strokeStyle = isSelected ? activeTone.ui.primary : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
    ctx.lineWidth = (isHovered || isSelected ? 3 : 1) / zoom
    ctx.stroke()

    if (semanticZoomLevel.value !== 'far' && zoom > 0.4 && r >= 7) {
      ctx.fillStyle = isDark ? '#111827' : '#ffffff'
      ctx.font = `800 ${Math.max(7, r * 0.72)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(objectSemantic.glyph, nx, ny + 0.5)
    }

    // 标签 - 根据缩放级别动态显示
    if (semanticZoomLevel.value === 'near' || (semanticZoomLevel.value === 'middle' && (semanticKeyNodeIds.value.has(n.id) || isSelected || isHovered))) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)'
      ctx.font = `600 ${Math.max(11, 13 / zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      const maxLen = zoom > 1 ? 10 : Math.floor(10 / (1.5 - zoom * 0.5))
      const display = n.title.length > maxLen ? n.title.slice(0, maxLen) + '…' : n.title

      // 文字阴影
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = 3 / zoom
      ctx.fillText(display, n.x || 0, (n.y || 0) + r + 8 / zoom)
      ctx.shadowBlur = 0
    }
  }

  if (selectionBox) {
    const left = Math.min(selectionBox.startX, selectionBox.x)
    const top = Math.min(selectionBox.startY, selectionBox.y)
    const width = Math.abs(selectionBox.x - selectionBox.startX)
    const height = Math.abs(selectionBox.y - selectionBox.startY)
    ctx.fillStyle = `${activeTone.ui.primary}24`
    ctx.strokeStyle = activeTone.ui.primary
    ctx.lineWidth = 1.5 / zoom
    ctx.fillRect(left, top, width, height)
    ctx.strokeRect(left, top, width, height)
  }

  ctx.restore()
  refreshCameraPoseDiagnostics()
  drawMinimap()

  // 更新悬停检测
  const canvasRect = canvas.getBoundingClientRect()
  const worldX = (mouseX - canvasRect.left - viewX) / zoom
  const worldY = (mouseY - canvasRect.top - viewY) / zoom
  const node = findNodeAt(worldX, worldY)
  const community = findCommunityAt(worldX, worldY)
  const nextHoveredCommunityId = community?.id || ''
  if (hoveredCommunityId.value !== nextHoveredCommunityId) {
    hoveredCommunityId.value = nextHoveredCommunityId
    requestGraphFrame()
  }
  if (node !== hoveredNode.value) {
    hoveredNode.value = node
    requestGraphFrame()
    if (node) {
      tooltipX.value = mouseX - canvasRect.left + 20
      tooltipY.value = mouseY - canvasRect.top - 60
    }
  }
  canvas.dataset.pathMotionPhase = pathMotionPhase.toFixed(3)
  canvas.dataset.pathMotionFrames = String(pathMotionFrameCount)
  canvas.dataset.layoutSettled = String(layoutSettled)
  canvas.dataset.layoutFrame = String(frameCount)
  canvas.dataset.layoutWorkerState = layoutWorkerState
  canvas.dataset.layoutWorkerPending = String(layoutWorkerPending)
  canvas.dataset.layoutWorkerCandidateLimit = String(GRAPH_FORCE_LAYOUT_MAX_CANDIDATES_PER_NODE)
  canvas.dataset.layoutWorkerCandidateChecks = String(layoutWorkerCandidateChecks)
  canvas.dataset.layoutWorkerCappedNodes = String(layoutWorkerCappedNodeCount)
  canvas.dataset.layoutWorkerComputeMaximumMs = layoutWorkerComputeMaximumMs.toFixed(3)
  canvas.dataset.layoutWorkerApplyMaximumMs = layoutWorkerApplyMaximumMs.toFixed(3)
  canvas.dataset.layoutWorkerStaleResults = String(layoutWorkerStaleResults)
  canvas.dataset.loopContinuous = String(graphLoopNeedsContinuousFrames())
})

const loop = (timestamp = performance.now()) => {
  animationId = 0
  if (!graphPageActive.value || document.hidden || !windowFocused) return
  const elapsed = lastLoopTimestamp ? timestamp - lastLoopTimestamp : 0
  lastLoopTimestamp = timestamp
  const layoutWasActive = viewMode.value === 'network' && !layoutSettled
  const cameraWasActive = Boolean(cameraTransition)
  const pathWasActive = pathMotionEnabled.value
  if (pathMotionEnabled.value) {
    pathMotionPhase = advanceGraphPathMotionPhase(pathMotionPhase, elapsed, store.motionSpeed)
    pathMotionFrameCount += 1
  } else if (pathMotionReduced.value || !activeShortestPath.value) {
    pathMotionPhase = 0
    pathMotionFrameCount = 0
  }
  simulate()
  advanceCameraMotion(timestamp)
  const shouldDraw = graphFrameDirty || layoutWasActive || cameraWasActive || pathWasActive
  graphFrameDirty = false
  if (shouldDraw) draw()
  if (graphLoopNeedsContinuousFrames()) requestGraphFrame(false)
  else lastLoopTimestamp = 0
}

const startDrag = (e: MouseEvent) => {
  if (e.button === 2) return
  const canvas = canvasRef.value
  if (!canvas) return
  cancelCameraMotion()
  requestGraphFrame()
  canvas.focus()
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - viewX) / zoom
  const my = (e.clientY - rect.top - viewY) / zoom
  const community = findCommunityAt(mx, my)
  if (community) {
    selectCommunity(community.id)
    return
  }
  const node = findNodeAt(mx, my)
  if (node) {
    if (e.ctrlKey || e.metaKey) toggleSelection(node)
    else if (!selectedNodeIds.value.includes(node.id)) selectOnly(node)
    if (!selectedNodeIds.value.includes(node.id)) return
    dragging = node
    dragStartWorldX = mx
    dragStartWorldY = my
    dragStartPositions = new Map(selectedNodeIds.value.map(id => {
      const selected = graphData.value.nodes.find(candidate => candidate.id === id)
      return [id, { x: selected?.x || 0, y: selected?.y || 0 }]
    }))
    dragSnapshot = captureLayoutSnapshot()
    wasDragging = false
    return
  }
  if (e.shiftKey && e.button === 0) {
    selectionBox = { startX: mx, startY: my, x: mx, y: my }
    dragging = null
    wasDragging = false
    return
  }
  if (e.button !== 0 && e.button !== 1) return
  clearSelection()
  dragging = { id: '', title: '', path: '', size: 0, x: e.clientX, y: e.clientY } as any
  offsetX = viewX; offsetY = viewY
  wasDragging = false
}

const onDrag = (e: MouseEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  requestGraphFrame()
  if (selectionBox) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    selectionBox.x = (e.clientX - rect.left - viewX) / zoom
    selectionBox.y = (e.clientY - rect.top - viewY) / zoom
    wasDragging = true
    return
  }
  if (!dragging) return
  if (dragging.id) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - viewX) / zoom
    const my = (e.clientY - rect.top - viewY) / zoom
    const dx = mx - dragStartWorldX
    const dy = my - dragStartWorldY
    if (!wasDragging && Math.hypot(dx, dy) < 3 / zoom) return
    if (!wasDragging) invalidateLayoutWorker()
    wasDragging = true
    dragStartPositions.forEach((position, id) => {
      const node = graphData.value.nodes.find(candidate => candidate.id === id)
      if (!node) return
      node.x = position.x + dx
      node.y = position.y + dy
      node.vx = 0; node.vy = 0
    })
    minimapLayoutRevision += 1
    layoutSettled = true
    frameCount = LAYOUT_MAX_FRAMES
  } else {
    wasDragging = true
    viewX = e.clientX - (dragging.x || 0) + offsetX
    viewY = e.clientY - (dragging.y || 0) + offsetY
  }
}

const endDrag = () => {
  if (selectionBox) {
    const left = Math.min(selectionBox.startX, selectionBox.x)
    const right = Math.max(selectionBox.startX, selectionBox.x)
    const top = Math.min(selectionBox.startY, selectionBox.y)
    const bottom = Math.max(selectionBox.startY, selectionBox.y)
    const matches = visibleNodes.value.filter(node => {
      const halfWidth = viewMode.value === 'mindmap' ? (node.id === mindmapRoot.value?.id ? 90 : 80) : Math.max(18, node.size * 0.6)
      const halfHeight = viewMode.value === 'mindmap' ? 24 : Math.max(18, node.size * 0.6)
      return (node.x || 0) + halfWidth >= left && (node.x || 0) - halfWidth <= right && (node.y || 0) + halfHeight >= top && (node.y || 0) - halfHeight <= bottom
    })
    selectedNodeIds.value = matches.map(node => node.id)
    selectedNode.value = matches[matches.length - 1] || null
    selectionBox = null
  }
  if (dragging?.id && wasDragging && dragSnapshot) {
    pushLayoutUndo(dragSnapshot)
    scheduleLayoutSave()
  }
  if (dragging && dragging.id && !wasDragging) {
    selectedNode.value = dragging
    emit('selectFile', dragging.path)
  }
  dragging = null
  dragSnapshot = null
  dragStartPositions.clear()
  wasDragging = false
  requestGraphFrame()
}

const onZoom = (e: WheelEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  const canvas = canvasRef.value
  if (!canvas) return

  changeGraphZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY)
}

const closeContextMenu = () => { contextMenu.show = false }
const openGraphContextMenu = (event: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const worldX = (event.clientX - rect.left - viewX) / zoom
  const worldY = (event.clientY - rect.top - viewY) / zoom
  const node = findNodeAt(worldX, worldY)
  contextNode.value = node
  if (node) selectOnly(node)
  else clearSelection()
  contextMenu.show = false
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  void nextTick(() => { contextMenu.show = true })
}
const handleContextMenuAction = async (key: string) => {
  closeContextMenu()
  const node = contextNode.value
  if (key === 'fit') fitGraph()
  else if (key === 'reset-view') resetView()
  else if (key === 'reset-layout') resetLayout()
  else if (key === 'network') switchView('network')
  else if (key === 'mindmap') switchView('mindmap')
  else if (key === 'open' && node) await openNode(node)
  else if (key === 'center' && node) selectAndCenter(node)
  else if (key === 'mindmap-root' && node) useAsMindmapRoot(node)
  else if (key === 'send-canvas' && node) await sendToCanvas(node)
  else if (key === 'project-note' && node) await createProjectNote(node)
  else if (key === 'save-collection' && node) await saveGraphCollection(node)
}

const onClick = () => {
  // 点击逻辑由 endDrag 处理 — 此处不再发射
}

const onDblClick = () => {
  if (hoveredNode.value) {
    openNode(hoveredNode.value)
  }
}

const moveSelectedNodes = (dx: number, dy: number) => {
  if (!selectedNodeIds.value.length) return
  invalidateLayoutWorker()
  const before = captureLayoutSnapshot()
  for (const id of selectedNodeIds.value) {
    const node = graphData.value.nodes.find(candidate => candidate.id === id)
    if (!node) continue
    node.x = (node.x || 0) + dx
    node.y = (node.y || 0) + dy
    node.vx = 0; node.vy = 0
  }
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  pushLayoutUndo(before)
  scheduleLayoutSave()
  requestGraphFrame()
}
const handleGraphKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoLayout() : undoLayout(); return }
  if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redoLayout(); return }
  if (command && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selectedNodeIds.value = visibleNodes.value.map(node => node.id)
    selectedNode.value = visibleNodes.value[visibleNodes.value.length - 1] || null
    return
  }
  if (event.key === 'Escape') { clearSelection(); return }
  const distance = event.shiftKey ? 24 : 8
  if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelectedNodes(-distance, 0) }
  if (event.key === 'ArrowRight') { event.preventDefault(); moveSelectedNodes(distance, 0) }
  if (event.key === 'ArrowUp') { event.preventDefault(); moveSelectedNodes(0, -distance) }
  if (event.key === 'ArrowDown') { event.preventDefault(); moveSelectedNodes(0, distance) }
}

watch(() => props.show, (v) => { if (v !== false) loadGraph() })
watch(() => store.libraryPath, () => { if (props.show !== false) loadGraph() })
watch(() => selectedNode.value?.id, () => { relationDraftTarget.value = '' })
watch([comparisonLeftId, comparisonRightId], () => { comparisonHasRun.value = false })
watch([() => selectedNodeIds.value.join('\u001f'), () => selectedNode.value?.id || ''], () => {
  requestGraphFrame()
  if (applyingSelectionHistory) return
  selectionHistoryState.value = commitGraphSelection(selectionHistoryState.value, {
    nodeIds: selectedNodeIds.value,
    activeNodeId: selectedNode.value?.id || '',
  }, graphData.value.nodes.map(node => node.id))
})
watch(graphLayoutMode, value => { localStorage.setItem('longedit.graph.layout-mode', value); requestGraphFrame() })
watch(graphCanvasTheme, value => { localStorage.setItem('longedit.graph.canvas-theme', value); requestGraphFrame() })
watch(() => store.theme, () => requestGraphFrame())
watch(viewMode, () => requestGraphFrame())
watch(remediationFocus, focus => {
  if (focus === 'relations') showTutorial.value = true
  if (focus === 'orphans') {
    healthOpen.value = true
    clearSelection()
  }
  invalidateLayoutWorker()
  frameCount = 0
  layoutSettled = false
  requestGraphFrame()
}, { immediate: true })
const structuralFilterSignature = () => JSON.stringify({
  tags: filters.tags,
  directories: filters.directories,
  relationTypes: filters.relationTypes,
  objectTypes: filters.objectTypes,
  dateRange: filters.dateRange,
  showOrphans: filters.showOrphans,
})
let previousStructuralFilterSignature = structuralFilterSignature()
watch(filters, () => {
  shortestPathResult.value = null
  comparisonHasRun.value = false
  const visible = new Set(visibleNodes.value.map(node => node.id))
  selectedNodeIds.value = selectedNodeIds.value.filter(id => visible.has(id))
  if (selectedNode.value && !visible.has(selectedNode.value.id)) selectedNode.value = null
  const nextStructuralFilterSignature = structuralFilterSignature()
  if (viewMode.value === 'network' && nextStructuralFilterSignature !== previousStructuralFilterSignature) {
    invalidateLayoutWorker()
    frameCount = 0
    layoutSettled = false
  }
  previousStructuralFilterSignature = nextStructuralFilterSignature
  requestGraphFrame()
}, { deep: true })
watch(communityResult, result => {
  if (activeCommunityId.value && !result.communities.some(community => community.id === activeCommunityId.value)) activeCommunityId.value = ''
})
watch(showCommunityOverview, visible => {
  if (visible) requestAnimationFrame(frameCommunityOverview)
  requestGraphFrame()
})
watch(activeShortestPath, () => {
  pathMotionPhase = 0
  pathMotionFrameCount = 0
  requestGraphFrame()
})
watch(pathMotionEnabled, () => requestGraphFrame())

let windowFocused = true
let reducedMotionQuery: MediaQueryList | null = null
let graphResizeObserver: ResizeObserver | null = null
const pauseGraphLoop = () => {
  if (!graphPageActive.value) return
  invalidateLayoutWorker()
  graphPageActive.value = false
  lastLoopTimestamp = 0
  cancelCameraMotion()
  cancelAnimationFrame(animationId)
  animationId = 0
  graphFrameDirty = false
  draw()
}
const resumeGraphLoop = () => {
  if (graphPageActive.value || document.hidden || !windowFocused) return
  graphPageActive.value = true
  lastLoopTimestamp = 0
  requestGraphFrame()
}
const handleVisibility = () => {
  if (document.hidden) pauseGraphLoop()
  else resumeGraphLoop()
}
const handleWindowBlur = () => { windowFocused = false; pauseGraphLoop() }
const handleWindowFocus = () => { windowFocused = true; resumeGraphLoop() }
const handleSystemReducedMotion = () => {
  systemPrefersReducedMotion.value = Boolean(reducedMotionQuery?.matches)
  requestGraphFrame()
}
onMounted(() => {
  graphLoopMounted = true
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  handleSystemReducedMotion()
  reducedMotionQuery.addEventListener('change', handleSystemReducedMotion)
  loadGraph(); requestGraphFrame(); document.addEventListener('visibilitychange', handleVisibility); window.addEventListener('blur', handleWindowBlur); window.addEventListener('focus', handleWindowFocus); window.addEventListener('keydown', handleGraphKeydown)
  graphResizeObserver = new ResizeObserver(() => {
    if (showCommunityOverview.value) requestAnimationFrame(frameCommunityOverview)
    else if (activeShortestPath.value) requestAnimationFrame(fitGraph)
    requestGraphFrame()
  })
  if (containerRef.value) graphResizeObserver.observe(containerRef.value)
})
onUnmounted(() => { graphLoopMounted = false; graphPageActive.value = false; cameraTransition = null; invalidateLayoutWorker(); layoutWorker?.terminate(); layoutWorker = null; persistLayout(); window.clearTimeout(layoutSaveTimer); cancelAnimationFrame(animationId); animationId = 0; graphResizeObserver?.disconnect(); reducedMotionQuery?.removeEventListener('change', handleSystemReducedMotion); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('blur', handleWindowBlur); window.removeEventListener('focus', handleWindowFocus); window.removeEventListener('keydown', handleGraphKeydown) })
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  background: linear-gradient(135deg,
    var(--theme-bg) 0%,
    color-mix(in srgb, var(--theme-bg) 95%, var(--theme-primary)) 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  flex: 0 0 auto;
  z-index: 10;
}

.graph-header-icon { color: var(--theme-primary); }
.graph-header :deep(.management-actions) { min-width: 0; flex: 1; overflow: hidden; }

.graph-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
}

.view-switch {
  flex: none;
  display: flex;
  padding: 3px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.14);
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.045);
}

.view-switch button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--theme-radius-sm) - 3px);
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.view-switch button.active {
  color: #fff;
  background: var(--theme-primary);
  box-shadow: 0 3px 10px rgba(var(--theme-primary-rgb), 0.22);
}

.graph-search {
  width: 180px;
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--workspace-border-color);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: var(--workspace-control-bg);
}

.graph-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--theme-text);
  background: transparent;
  font-size: 12px;
}

.graph-options {
  position: absolute;
  top: calc(var(--workspace-management-header-height) + 12px);
  left: var(--workspace-floating-gutter);
  z-index: 4;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--workspace-border-color);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: color-mix(in srgb, var(--theme-card) 92%, transparent);
  backdrop-filter: blur(16px);
  box-shadow: var(--workspace-shadow-sm);
  font-size: 11px;
}

.graph-options label { display: flex; align-items: center; gap: 6px; }
.graph-options input { accent-color: var(--theme-primary); }
.graph-options select {
  border: 0;
  outline: 0;
  color: var(--theme-text);
  background: transparent;
  font-size: 11px;
}
.option-divider { width: 1px; height: 16px; background: var(--workspace-border-color); }
.mindmap-root { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text); }
.match-count { color: var(--theme-primary); font-weight: 650; }
.community-entry { min-height: 26px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.04); cursor: pointer; font-size: 10px; font-weight: 700; white-space: nowrap; }.community-entry.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.42); background: rgba(var(--theme-primary-rgb),.1); }
.graph-community-panel { position: absolute; z-index: 10; top: 126px; right: 16px; width: min(380px, calc(100% - 32px)); max-height: min(520px, calc(100% - 160px)); display: grid; gap: 8px; padding: 10px; overflow: auto; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb,var(--theme-card) 96%,transparent); box-shadow: var(--workspace-shadow); backdrop-filter: blur(16px); }.graph-community-panel > header { display: flex; align-items: start; justify-content: space-between; gap: 8px; }.graph-community-panel > header div { min-width: 0; display: grid; gap: 2px; }.graph-community-panel > header strong { font-size: 12px; }.graph-community-panel > header span,.graph-community-panel > p { margin: 0; color: var(--theme-text-secondary); font-size: 10px; line-height: 1.45; }.graph-community-panel > header button { width: 24px; height: 24px; flex: none; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 17px; }.community-return { min-height: 28px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: 10px; font-weight: 700; }.graph-community-list { display: grid; gap: 6px; }.graph-community-card { min-width: 0; display: grid; gap: 4px; padding: 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--workspace-control-bg); text-align: left; cursor: pointer; }.graph-community-card:hover,.graph-community-card.active { border-color: rgba(var(--theme-primary-rgb),.44); background: rgba(var(--theme-primary-rgb),.09); }.graph-community-card > span:first-child { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }.graph-community-card strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.graph-community-card small,.community-representatives,.community-types { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.community-types { color: var(--theme-primary); }.community-focus-banner { position: absolute; z-index: 7; top: 126px; left: 16px; max-width: min(620px, calc(100% - 32px)); min-height: 34px; display: flex; align-items: center; gap: 10px; padding: 5px 7px 5px 11px; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb,var(--theme-card) 95%,transparent); box-shadow: var(--workspace-shadow-sm); backdrop-filter: blur(14px); font-size: 10px; }.community-focus-banner span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.community-focus-banner button { flex: none; min-height: 24px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: 10px; font-weight: 700; }.community-focus-active :deep(.graph-semantic-legend) { top: 170px; }
.graph-selection-history-panel { position: absolute; z-index: 10; top: 126px; right: 16px; width: min(340px,calc(100% - 32px)); max-height: min(500px,calc(100% - 160px)); display: grid; gap: 8px; padding: 10px; overflow: auto; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb,var(--theme-card) 97%,transparent); box-shadow: var(--workspace-shadow); backdrop-filter: blur(16px); }.graph-selection-history-panel > header { display: flex; align-items: start; justify-content: space-between; gap: 8px; }.graph-selection-history-panel > header div { min-width: 0; display: grid; gap: 2px; }.graph-selection-history-panel > header strong { font-size: 12px; }.graph-selection-history-panel > header span { color: var(--theme-text-secondary); font-size: 10px; }.graph-selection-history-panel > header button { width: 24px; height: 24px; flex: none; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 17px; }.selection-history-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.selection-history-controls button,.graph-selection-history-panel ol button { min-height: 28px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font-size: 10px; }.selection-history-controls button:disabled { opacity: .4; cursor: not-allowed; }.graph-selection-history-panel ol { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }.graph-selection-history-panel ol button { width: 100%; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 8px; color: var(--theme-text); text-align: left; }.graph-selection-history-panel ol button.active { border-color: rgba(var(--theme-primary-rgb),.5); background: rgba(var(--theme-primary-rgb),.12); }.graph-selection-history-panel ol strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.graph-selection-history-panel ol span { flex: none; color: var(--theme-text-secondary); font-size: 10px; }
.graph-comparison-panel { position: absolute; z-index: 11; top: 126px; left: 16px; right: 16px; max-width: 980px; max-height: min(590px, calc(100% - 160px)); display: grid; gap: 8px; padding: 9px 36px 10px 10px; overflow: auto; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb,var(--theme-card) 97%,transparent); box-shadow: var(--workspace-shadow); backdrop-filter: blur(16px); }.graph-comparison-fields { display: grid; grid-template-columns: minmax(130px,1fr) auto minmax(130px,1fr) auto; align-items: center; gap: 7px; }.graph-comparison-fields select { min-width: 0; height: 28px; border: 1px solid var(--workspace-border-color); border-radius: 5px; color: var(--theme-text); background: var(--workspace-control-bg); font-size: 10px; }.graph-comparison-fields > span { color: var(--theme-text-secondary); font-size: 10px; }.graph-comparison-fields button,.graph-comparison-neighbors button,.graph-comparison-mentions button,.graph-comparison-structural button { min-height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: 10px; font-weight: 700; }.graph-comparison-fields button:disabled { opacity: .45; cursor: not-allowed; }.graph-comparison-summary { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: stretch; gap: 7px; }.graph-comparison-summary article,.graph-comparison-summary > div { min-width: 0; display: grid; gap: 3px; padding: 7px; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: var(--workspace-control-bg); }.graph-comparison-summary > div { align-content: center; justify-items: center; color: var(--theme-primary); font-size: 10px; }.graph-comparison-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.graph-comparison-summary small,.graph-comparison-summary span { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.graph-comparison-tags { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }.graph-comparison-tags span { min-width: 0; overflow: hidden; padding: 6px 7px; border-radius: 5px; color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb),.05); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.graph-comparison-tags b { margin-right: 6px; color: var(--theme-text); }.graph-comparison-neighbors { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }.graph-comparison-neighbors section { min-width: 0; display: grid; align-content: start; gap: 4px; padding: 7px; border: 1px solid var(--workspace-border-color); border-radius: 6px; }.graph-comparison-neighbors header,.graph-comparison-relations > header { display: flex; justify-content: space-between; color: var(--theme-text-secondary); font-size: 10px; }.graph-comparison-neighbors p,.graph-comparison-relations > p { margin: 0; color: var(--theme-text-secondary); font-size: 10px; }.graph-comparison-neighbors button { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; text-align: left; }.graph-comparison-neighbors button small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; }.graph-comparison-relations { display: grid; gap: 5px; }.graph-comparison-relations > article { display: grid; gap: 5px; padding: 7px; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: color-mix(in srgb,var(--workspace-control-bg) 90%,transparent); }.graph-comparison-relations > article > header { min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 10px; }.graph-comparison-relations > article > header span { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; }.graph-comparison-mentions { display: grid; gap: 4px; }.graph-comparison-mentions > div,.graph-comparison-structural { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--workspace-border-color); color: var(--theme-text-secondary); font-size: 10px; }.graph-comparison-mentions span,.graph-comparison-structural span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.graph-comparison-mentions code { color: var(--theme-primary); }.graph-comparison-close { position: absolute; z-index: 2; top: 5px; right: 7px; width: 24px; height: 24px; border: 0; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; font-size: 17px; }.graph-comparison-empty,.graph-comparison-invalid { margin: 0; color: var(--theme-text-secondary); font-size: 10px; }.graph-comparison-active :deep(.graph-semantic-legend) { visibility: hidden; }
.remediation-banner { position: absolute; top: calc(var(--workspace-management-header-height) + 58px); left: var(--workspace-floating-gutter); right: var(--workspace-floating-gutter); z-index: 3; min-height: 46px; display: grid; grid-template-columns: minmax(0,1fr) auto 24px; align-items: center; gap: 10px; padding: 7px 8px 7px 12px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 94%, transparent); backdrop-filter: blur(16px); box-shadow: var(--workspace-shadow-sm); }.remediation-copy { min-width: 0; display: grid; gap: 2px; }.remediation-banner strong { font-size: 11px; }.remediation-banner span { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.remediation-actions { display: flex; align-items: center; gap: 6px; }.remediation-banner button { min-height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.remediation-banner .remediation-close { width: 24px; min-height: 24px; padding: 0; border-color: transparent; color: var(--theme-text-secondary); background: transparent; font-size: 16px; }
.neighbor-focus-banner { position: absolute; z-index: 7; top: 126px; left: 16px; max-width: min(560px, calc(100% - 32px)); min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 5px 7px 5px 11px; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 95%, transparent); box-shadow: var(--workspace-shadow-sm); backdrop-filter: blur(14px); font-size: 10px; }.neighbor-focus-banner span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.neighbor-focus-banner select { flex: none; height: 24px; border: 1px solid var(--workspace-border-color); border-radius: 5px; color: var(--theme-text); background: var(--workspace-control-bg); font-size: 10px; }.neighbor-focus-banner button { flex: none; min-height: 24px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: 10px; font-weight: 700; }.neighbor-focus-active :deep(.graph-semantic-legend) { top: 170px; }
.graph-path-panel { position: absolute; z-index: 9; top: 126px; left: 16px; right: 16px; max-width: 760px; max-height: min(430px, calc(100% - 170px)); display: grid; gap: 6px; padding: 8px 36px 8px 10px; overflow: auto; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb),.28); border-radius: 8px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 96%, transparent); box-shadow: var(--workspace-shadow-sm); backdrop-filter: blur(14px); }.graph-path-fields { display: grid; grid-template-columns: minmax(120px,1fr) auto minmax(120px,1fr) auto; align-items: center; gap: 7px; }.graph-path-fields select { min-width: 0; height: 28px; border: 1px solid var(--workspace-border-color); border-radius: 5px; color: var(--theme-text); background: var(--workspace-control-bg); font-size: 10px; }.graph-path-fields button,.graph-path-result button,.graph-path-evidence-list button { min-height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.07); cursor: pointer; font-size: 10px; font-weight: 700; }.graph-path-fields button:disabled { opacity: .45; cursor: not-allowed; }.graph-path-result { min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 10px; }.graph-path-result span { min-width: 0; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; }.graph-path-result button { margin-left: auto; flex: none; }.graph-path-result.unreachable strong { color: var(--theme-warning, #d97706); }.graph-path-evidence-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }.graph-path-evidence-edge { display: grid; gap: 6px; padding: 7px; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: color-mix(in srgb,var(--workspace-control-bg) 90%,transparent); }.graph-path-evidence-edge > header { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 7px; font-size: 10px; }.graph-path-evidence-edge > header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.graph-path-evidence-edge > header small { color: var(--theme-text-secondary); }.graph-path-mentions { display: grid; gap: 5px; }.graph-path-mentions article { min-width: 0; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px 8px; padding-top: 5px; border-top: 1px dashed var(--workspace-border-color); }.graph-path-mentions article > div { min-width: 0; display: flex; gap: 7px; font-size: 10px; }.graph-path-mentions article > div span { color: var(--theme-text-secondary); }.graph-path-mentions code,.graph-path-mentions p { grid-column: 1; min-width: 0; margin: 0; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.graph-path-mentions code { color: var(--theme-primary); }.graph-path-mentions button { grid-column: 2; grid-row: 1 / 4; align-self: center; }.graph-path-structural-evidence { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 5px; border-top: 1px dashed var(--workspace-border-color); color: var(--theme-text-secondary); font-size: 10px; }.graph-path-structural-evidence button { flex: none; }.graph-path-close { position: sticky; z-index: 2; top: -2px; justify-self: end; width: 24px; height: 24px; margin-top: -36px; margin-right: -30px; border: 0; color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; font-size: 17px; }.graph-path-active :deep(.graph-semantic-legend) { top: 214px; }

.graph-path-close { position: absolute; top: 6px; right: 7px; justify-self: auto; margin: 0; }
@media (max-width: 1100px) { .graph-path-panel { max-height: min(240px, calc(100% - 230px)); } }
@media (max-width: 760px) { .graph-comparison-panel { max-height: min(480px, calc(100% - 150px)); }.graph-path-fields,.graph-comparison-fields { grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); }.graph-path-fields > button,.graph-comparison-fields > button { grid-column: 1 / -1; }.graph-path-evidence-edge > header { grid-template-columns: 1fr; gap: 2px; }.graph-path-mentions article { grid-template-columns: minmax(0,1fr); }.graph-path-mentions button { grid-column: 1; grid-row: auto; justify-self: start; }.graph-path-structural-evidence { align-items: flex-start; flex-direction: column; }.graph-comparison-summary { grid-template-columns: minmax(0,1fr); }.graph-comparison-tags,.graph-comparison-neighbors { grid-template-columns: minmax(0,1fr); }.graph-comparison-summary > div { justify-items: start; }.graph-comparison-mentions > div,.graph-comparison-structural { align-items: flex-start; flex-direction: column; } }

.tutorial-btn {
  flex: none;
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.07);
  color: var(--theme-primary);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.3s var(--ease-premium);
  white-space: nowrap;
}

.health-entry, .graph-export-btn { flex: none; white-space: nowrap; }

.tutorial-btn:hover,
.tutorial-btn.active {
  color: #fff;
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--theme-primary-rgb), 0.22);
}

.health-entry {
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text);
  background: rgba(var(--theme-primary-rgb), 0.04);
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
}
.health-entry:hover, .health-entry.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb), 0.42); background: rgba(var(--theme-primary-rgb), 0.09); }
.health-dot { width: 7px; height: 7px; border-radius: 50%; background: #d59a35; box-shadow: 0 0 0 3px rgba(213, 154, 53, 0.13); }
.health-entry.active .health-dot { background: var(--theme-primary); box-shadow: 0 0 0 3px rgba(var(--theme-primary-rgb), 0.14); }

.graph-export-btn {
  height: var(--workspace-control-height);
  padding: 0 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.05);
  cursor: pointer;
  font-size: var(--text-compact);
  font-weight: 700;
}
.graph-export-btn:hover { border-color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.12); }
.graph-export-btn:disabled { cursor: wait; opacity: 0.5; }

.control-btn {
  width: var(--workspace-control-height);
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--workspace-control-bg);
  border: 1px solid var(--workspace-border-color);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.3s var(--ease-premium);
  color: var(--theme-text);
  opacity: 0.7;
}

.control-btn:hover {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: white;
  opacity: 1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--theme-primary-rgb), 0.2);
}
.control-btn:disabled { cursor: default; opacity: .32; transform: none; box-shadow: none; }
.control-btn:disabled:hover { color: var(--theme-text); border-color: var(--workspace-border-color); background: var(--workspace-control-bg); }

.graph-main-canvas {
  display: block;
  cursor: grab;
  flex: 1;
  min-height: 0;
  outline: none;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--theme-text-secondary) 20%, transparent) 1px, transparent 1px);
  background-size: 22px 22px;
}

.graph-main-canvas:active {
  cursor: grabbing;
}
.graph-main-canvas:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--theme-primary) 48%, transparent); }
.graph-canvas-theme-professional .graph-main-canvas { background-color: color-mix(in srgb, var(--theme-bg) 97%, #eef2f6); background-size: 28px 28px; }
.graph-canvas-theme-colorful .graph-main-canvas { background-color: color-mix(in srgb, var(--theme-bg) 95%, #dcecff); }
.graph-canvas-theme-focus .graph-main-canvas { background-color: var(--theme-bg); background-image: none; }

.graph-minimap {
  position: absolute;
  z-index: 7;
  right: 16px;
  bottom: 58px;
  width: 184px;
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--theme-primary-rgb), .28);
  border-radius: 8px;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-card) 94%, transparent);
  box-shadow: var(--workspace-shadow-sm);
  backdrop-filter: blur(14px);
}
.graph-minimap header { height: 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 2px 4px; color: var(--theme-text-secondary); font-size: 9px; font-weight: 750; }
.graph-minimap header small { font-size: 9px; font-weight: 600; }
.graph-minimap-canvas { width: 170px; height: 104px; display: block; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 5px; outline: none; background: color-mix(in srgb, var(--theme-bg) 91%, var(--theme-card)); cursor: crosshair; touch-action: none; }
.graph-minimap-canvas:active { cursor: grabbing; }
.graph-minimap-canvas:focus-visible { border-color: var(--theme-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 32%, transparent); }
.node-details-active .graph-minimap { right: calc(var(--workspace-inspector-width) + var(--workspace-floating-gutter) + 12px); }
.community-overview-active .graph-minimap { bottom: 104px; }

.graph-community-overview-nav {
  position: absolute;
  z-index: 8;
  right: 16px;
  bottom: 58px;
  left: 16px;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  overflow-x: auto;
  box-sizing: border-box;
  border: 1px solid var(--workspace-border-color);
  border-radius: 7px;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-card) 94%, transparent);
  box-shadow: var(--workspace-shadow-sm);
  backdrop-filter: blur(14px);
  scrollbar-width: none;
}
.graph-community-overview-nav::-webkit-scrollbar { display: none; }
.graph-community-overview-nav > span { position: sticky; left: 0; flex: none; padding: 0 5px; color: var(--theme-text-secondary); background: var(--theme-card); font-size: 10px; font-weight: 750; }
.graph-community-overview-nav button { flex: none; min-height: 24px; max-width: 220px; overflow: hidden; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.3); border-radius: 5px; color: var(--theme-text); background: var(--workspace-control-bg); cursor: pointer; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 650; }
.graph-community-overview-nav button:hover,.graph-community-overview-nav button:focus-visible { border-color: var(--theme-primary); color: var(--theme-primary); outline: 2px solid color-mix(in srgb,var(--theme-primary) 34%,transparent); outline-offset: 1px; }

.graph-stats {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--workspace-surface-raised);
  backdrop-filter: blur(20px);
  padding: 0 12px;
  border-radius: 6px;
  box-shadow: var(--workspace-shadow-sm);
  border: 1px solid var(--workspace-border-color);
  pointer-events: none;
  animation: slideUp 0.6s var(--ease-premium);
  max-width: calc(100% - 32px);
  overflow-x: auto;
  box-sizing: border-box;
  white-space: nowrap;
  scrollbar-width: none;
}
.graph-stats::-webkit-scrollbar { display: none; }

.stat-item {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text);
  opacity: 0.8;
}

.stat-item svg {
  opacity: 0.6;
}

.semantic-zoom-stat { color: var(--theme-primary); opacity: 1; }

.stat-divider {
  width: 1px;
  height: 14px;
  background: var(--workspace-border-color);
}

.node-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--theme-card);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.2);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 280px;
  min-width: 180px;
}

.node-details {
  position: absolute;
  top: calc(var(--workspace-management-header-height) + 12px);
  right: var(--workspace-floating-gutter);
  z-index: 5;
  width: var(--workspace-inspector-width);
  max-height: calc(100vh - var(--workspace-management-header-height) - 52px);
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.14);
  border-radius: 6px;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-card) 95%, transparent);
  backdrop-filter: blur(22px);
  box-shadow: var(--workspace-shadow);
}

.details-close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: 0;
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}
.details-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 750; letter-spacing: 0.1em; }
.node-details h3 { margin: 7px 26px 4px 0; font-size: 18px; line-height: 1.3; }
.details-path { margin: 0 0 16px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; word-break: break-all; }
.details-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.details-metrics div { display: flex; flex-direction: column; gap: 3px; padding: 10px 6px; border-radius: var(--theme-radius-sm); text-align: center; background: rgba(var(--theme-primary-rgb), 0.06); }
.details-metrics strong { color: var(--theme-primary); font-size: 17px; }
.details-metrics span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-actions { display: grid; gap: 7px; margin: 14px 0; }
.details-actions button { min-height: 34px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.06); cursor: pointer; font-size: 11px; font-weight: 650; }
.details-actions .primary-action { color: #fff; background: var(--theme-primary); }
.relation-editor { margin: 4px 0 14px; padding: 10px; border: 1px solid rgba(var(--theme-primary-rgb), 0.14); border-radius: var(--theme-radius-sm); background: rgba(var(--theme-primary-rgb), 0.035); }
.relation-editor .neighbor-title { margin: 0 0 8px; }
.relation-editor-grid { display: grid; gap: 7px; }
.relation-editor select, .relation-editor button { min-height: 32px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }
.relation-editor button { color: #fff; background: var(--theme-primary); cursor: pointer; font-weight: 700; }
.relation-editor button:disabled { cursor: not-allowed; opacity: 0.5; }
.relation-editor > small { display: block; margin-top: 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.details-relations { display: flex; flex-direction: column; gap: 7px; }
.details-relation-card { position: relative; display: flex; width: 100%; border: 1px solid rgba(var(--theme-primary-rgb), 0.12); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: rgba(var(--theme-primary-rgb), 0.035); text-align: left; }
.details-relation-card:hover { border-color: rgba(var(--theme-primary-rgb), 0.38); background: rgba(var(--theme-primary-rgb), 0.075); }
.relation-focus { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; padding: 9px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.relation-delete { align-self: stretch; width: 42px; border: 0; border-left: 1px solid rgba(var(--theme-primary-rgb), 0.1); color: #c74848; background: transparent; cursor: pointer; font-size: var(--text-compact); }
.relation-delete:hover { background: rgba(199, 72, 72, 0.09); }
.details-relation-head, .details-relation-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.details-relation-head strong { overflow: hidden; font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }
.details-relation-head small { flex: none; color: var(--theme-primary); font-size: var(--text-compact); }
.details-relation-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.details-relation-meta { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-relation-meta code { max-width: 55%; overflow: hidden; color: var(--theme-primary); text-overflow: ellipsis; white-space: nowrap; }
.neighbor-title { display: block; margin: 16px 0 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }
.neighbor-list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 8px 4px; border: 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }
.neighbor-list button:hover { color: var(--theme-primary); }
.neighbor-list small { flex: none; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-slide-enter-active, .details-slide-leave-active { transition: opacity 0.22s ease, transform 0.3s var(--ease-premium); }
.details-slide-enter-from, .details-slide-leave-to { opacity: 0; transform: translateX(18px); }

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-text);
}

.tooltip-header svg {
  color: var(--theme-primary);
  flex-shrink: 0;
}

.tooltip-header strong {
  font-size: 14px;
  font-weight: 700;
}

.tip-path {
  opacity: 0.5;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.4;
  padding-left: 22px;
}

.tooltip-hint {
  font-size: var(--text-compact);
  opacity: 0.4;
  text-align: center;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: 2px;
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: all 0.3s var(--ease-premium);
}

.tooltip-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* 空状态提示 */
.empty-graph-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 5;
  width: min(560px, calc(100vw - 48px));
  padding: 28px 32px 30px;
  box-sizing: border-box;
}

.tutorial-card {
  border: 1px solid rgba(var(--theme-primary-rgb), 0.15);
  border-radius: calc(var(--theme-radius) * 1.5);
  background: color-mix(in srgb, var(--theme-card) 94%, transparent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(22px);
}

.tutorial-close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  color: var(--theme-text);
  font-size: 20px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.tutorial-close:hover {
  background: rgba(var(--theme-primary-rgb), 0.12);
}

.empty-icon {
  margin: 0 auto 24px;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.1) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 100%);
  border: 2px dashed rgba(var(--theme-primary-rgb), 0.3);
}

.empty-icon svg {
  color: var(--theme-primary);
  opacity: 0.6;
}

.empty-graph-hint h3 {
  font-size: 20px;
  font-weight: 700;
  color: var(--theme-text);
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.empty-graph-hint p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  line-height: 1.6;
  margin: 8px 0;
}

.tutorial-intro {
  margin: 0 auto 18px !important;
  max-width: 440px;
}

.tutorial-steps {
  display: grid;
  gap: 9px;
  text-align: left;
}

.tutorial-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.055);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.08);
}

.tutorial-step > div {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 10px;
}

.tutorial-step strong {
  color: var(--theme-text);
  font-size: 13px;
}

.tutorial-step p {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.step-number {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--theme-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 3px 9px rgba(var(--theme-primary-rgb), 0.24);
}

.tutorial-note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  background: rgba(0, 0, 0, 0.025);
  font-size: 12px;
  line-height: 1.6;
}

.tutorial-action {
  margin-top: 16px;
  padding: 9px 18px;
  border: 0;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-primary);
  color: #fff;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(var(--theme-primary-rgb), 0.22);
  transition: transform 0.25s var(--ease-premium), box-shadow 0.25s ease;
}

.tutorial-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(var(--theme-primary-rgb), 0.3);
}

.empty-graph-hint code {
  background: rgba(var(--theme-primary-rgb), 0.1);
  color: var(--theme-primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 600;
}

.graph-loading {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-bg) 78%, transparent);
  backdrop-filter: blur(8px);
}

.graph-loading strong {
  margin-top: 18px;
  font-size: 15px;
}

.graph-loading p {
  margin: 7px 0 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.graph-loader {
  position: relative;
  width: 76px;
  height: 48px;
}

.graph-loader span {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--theme-primary);
  box-shadow: 0 0 16px rgba(var(--theme-primary-rgb), 0.42);
  animation: graphNodePulse 1.35s ease-in-out infinite;
}

.graph-loader span:nth-child(1) { left: 4px; top: 28px; }
.graph-loader span:nth-child(2) { left: 32px; top: 4px; animation-delay: 0.16s; }
.graph-loader span:nth-child(3) { right: 4px; top: 28px; animation-delay: 0.32s; }

.graph-loader::before,
.graph-loader::after {
  content: '';
  position: absolute;
  top: 25px;
  width: 34px;
  height: 2px;
  background: rgba(var(--theme-primary-rgb), 0.35);
  transform-origin: center;
}

.graph-loader::before { left: 11px; transform: rotate(-40deg); }
.graph-loader::after { right: 11px; transform: rotate(40deg); }

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.3s var(--ease-premium);
}

.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}

/* 深色主题适配 */
.is-dark .graph-container {
  background: linear-gradient(135deg,
    var(--theme-bg) 0%,
    color-mix(in srgb, var(--theme-bg) 97%, var(--theme-primary)) 100%);
}

.is-dark .control-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.is-dark .graph-stats {
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.is-dark .stat-divider {
  background: rgba(255, 255, 255, 0.1);
}

.is-dark .node-tooltip {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.is-dark .tooltip-hint {
  border-top-color: rgba(255, 255, 255, 0.08);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes graphNodePulse {
  0%, 100% { transform: scale(0.82); opacity: 0.55; }
  50% { transform: scale(1.18); opacity: 1; }
}

@media (max-width: 900px) {
  .view-switch button,
  .tutorial-btn,
  .health-entry,
  .graph-export-btn {
    white-space: nowrap;
  }

  .graph-controls {
    width: 100%;
  }

  .graph-controls > * {
    flex: 0 0 auto;
  }

  .graph-controls::after {
    content: '';
    flex: 0 0 16px;
  }

  .tutorial-btn span,
  .graph-export-btn { display: none; }
  .tutorial-btn { width: var(--workspace-control-height); padding: 0; justify-content: center; }

  .graph-search {
    width: 142px;
  }

  .graph-options {
    right: 12px;
    left: 12px;
    max-width: none;
    overflow-x: auto;
    white-space: nowrap;
  }

  .node-details {
    top: auto;
    right: 12px;
    bottom: 16px;
    left: 12px;
    width: auto;
    max-height: 40vh;
  }

  .graph-minimap,
  .node-details-active .graph-minimap {
    right: 10px;
    width: 156px;
  }
  .graph-minimap-canvas { width: 142px; height: 88px; }
  .node-details-active:not(.graph-path-active):not(.graph-comparison-active) .graph-minimap { top: 150px; bottom: auto; }
  .community-overview-active .graph-minimap { top: auto; bottom: 104px; }
}

@media (max-width: 640px) {
  .view-switch button { padding: 0 7px; }
  .graph-search { display: none; }
  .tutorial-btn { width: var(--workspace-control-height); }
  .health-entry { width: 36px; padding: 0; justify-content: center; font-size: 0; }
  .tutorial-card { padding: 24px 18px; }
  .empty-icon { display: none; }
}
</style>
