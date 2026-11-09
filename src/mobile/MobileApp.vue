<template>
  <div class="mobile-app" :class="{ 'theme-dark': dark, 'markdown-document': markdownDocument, 'plain-text-document': plainTextDocument, 'txt-reading': txtReading, 'markdown-reading': enhancedMarkdownReading, 'markdown-editing': markdownDocument && editing && !editor.recovery, 'root-ime': nativeImeVisible && !editor.document && !pdfIdentity, 'phone-library': isLibrary && !editor.document && !pdfIdentity, 'phone-search': tab === 'search' && !editor.document && !pdfIdentity, 'phone-settings': tab === 'settings' && !editor.document && !pdfIdentity, 'has-document': !!editor.document || !!pdfIdentity, 'toml-document': tomlDocument, 'code-reading': codeReading, 'code-editing': codeEditing, 'code-document': !!codeDocument, 'json-document':jsonDocument, 'text-document': !!editor.document && compactDocument }">
    <div v-if="storage.preview" class="preview-ribbon">交互预览 · 数据仅保存在此浏览器</div>
    <MobileAppearanceStatus v-if="appearanceError && !overlayOpen" :inert="mobileHelpOpen || recoveryOpening || recoveryPanel || incomingOpening" :kind="appearanceError" :busy="appearanceBusy" @retry="appearance.retry()" />
    <MobileNotice :inert="mobileHelpOpen || recoveryOpening || recoveryPanel || incomingOpening" v-if="!overlayOpen && (notice || editor.error) && !recentOwnsNotice" :message="visibleError" :text-copy="!!editor.document && textOnlyCopyAvailable" :copy="canCopyAfterError" :recovery="canInspectSaveRecovery" :busy="copying || editor.saving || closing" @text-copy="run(() => saveCopy(true))" @copy="run(saveCopy)" @recovery="run(openSaveRecovery)" @dismiss="dismissNotice" />

    <div :key="workspaceEpoch" class="mobile-workspace" :inert="overlayOpen || recoveryOpening || recoveryPanel || mobileHelpOpen || incomingOpening" :aria-busy="navigating || closing || recoveryOpening || incomingOpening" @click.capture="blockClosing" @keydown.capture="blockClosing">
    <aside v-if="!focusedStructureOpen && !draftChoosing && sourceDocument && !codeDocument && (incomingItems.length || incoming.error)" class="incoming-notice" aria-label="收到其他应用的内容"><p role="status">{{ incomingItems.length ? `收到 ${incomingItems.length} 项内容，等待核对` : '这次接收未完成' }}</p><button class="button" :disabled="overlayOpen || closing || copying || editor.saving || recoveryBusy || incomingOpening" @click="run(openIncoming)">查看收到的内容</button></aside>
    <div class="assistive-status" role="status" aria-live="polite" aria-atomic="true">{{ closing ? '正在'+documentRootReturnLabel+'…' : assistiveStatus }}</div>
    <MobilePdf v-if="pdfIdentity" ref="pdfView" :return-label="documentRootReturnLabel" :identity="pdfIdentity" :storage="storage" :library-name="roots.find(root => root.id === pdfIdentity?.rootId)?.name || '资料库'" :dark="dark" :reference="pdfReference || undefined" :return-note="!!pdfReturnNote" @theme="dark = !dark" @close="run(closePdf)" @note="run(() => open($event))" />
    <template v-else-if="editor.document">
      <MobileDraftReview v-if="editor.recovery" v-show="draftChoosing" :inert="!draftChoosing" ref="draftReview" :key="documentKey" :source="editor.document" :draft="editor.recovery" :source-error="editor.sourceError" :library-name="roots.find(root=>root.id===editor.document?.rootId)?.name||'资料库'" :return-label="documentRootReturnLabel" :busy="navigating||closing||editor.saving" :storage="storage" @continue="run(restoreDraft)" @read="readOriginalFile" @close="run(closeDocument)" />
      <template v-if="!draftChoosing">
      <header v-show="!focusedStructureOpen" class="reader-header" :class="{'draft-original-reader':readingSavedFile && editor.recovery}">
        <button ref="documentBackButton" class="icon-button document-back-button" :aria-label="searchOpen ? '返回文稿' : structureOpen ? '返回上一层或源码' : readingSavedFile && editor.recovery ? '返回草稿核对' : readingEditOrigin ? '返回阅读' : documentRootReturnLabel" :disabled="editor.saving" @click="run(documentBack)"><ArrowLeft :size="22" /></button>
        <div class="document-heading"><h1 ref="readerHeading" tabindex="-1">{{ filename(editor.document.relativePath) }}</h1><span v-if="readingSavedFile && editor.recovery && !codeReading" class="draft-source-state">原文 · 草稿保留</span><span v-if="codeReading" class="code-reading-meta">{{ codeDocument?.label }} · UTF-8<span v-if="editor.dirty"> · 未保存</span><span v-if="readingSavedFile && editor.recovery"> · 草稿保留</span></span><span v-if="codeEditing" class="code-editing-meta">{{ codeDocument?.label }} · UTF-8 · 行 {{ codePosition.line }}，列 {{ codePosition.column }}<span v-if="codePosition.selectedLines"> · 已选 {{ codePosition.selectedLines }} 行</span></span><span v-if="codeEditing && editor.dirty && editor.draftStatus" class="code-save-state">{{ editor.draftStatus }}</span><span v-if="markdownDocument && editing && editor.dirty && editor.draftStatus" class="markdown-save-state">{{ editor.draftStatus }}</span><div v-if="sourceWorkspace && !codeDocument" class="document-meta"><small v-if="!editor.sourceError">{{ roots.find(root => root.id === editor.document?.rootId)?.name || '资料库' }} · </small><span>{{ documentStatus }}</span></div><span v-else-if="!compactDocument || editor.sourceError">{{ documentStatus }}</span></div>
        <button v-if="!compactDocument" class="icon-button" aria-label="在文档内查找" :disabled="!!editor.recovery && !readingSavedFile" :aria-expanded="searchOpen" @click="toggleDocumentSearch"><Search :size="21" /></button>
        <MobileHelp v-if="codeEditing" :topic="jsonDocument ? 'json' : 'source'" /><button v-if="editing" class="text-button primary" :disabled="editorComposing || editor.saving || copying || !editor.dirty" @pointerdown="(markdownDocument || codeEditing) && $event.preventDefault()" @click="run(save)">{{ copying || editor.saving ? '保存中…' : needsLocalCopy ? '存入手机库' : '保存' }}</button>
        <button v-if="codeReading" class="icon-button code-reading-edit" :disabled="navigating || closing || editor.loading || editor.saving || copying" :aria-label="editor.recovery?'核对未保存草稿':'编辑'" @click="run(beginEditing)"><PenLine :size="22" /></button><button v-if="codeReading" class="icon-button code-reading-find" :disabled="navigating || closing || editor.loading || editor.saving || copying" aria-label="在文档内查找" :aria-expanded="searchOpen" @click="toggleDocumentSearch"><Search :size="22" /></button><button v-if="txtReading" class="icon-button txt-primary-action" :aria-expanded="readerView?.segmented ? searchOpen : undefined" :aria-label="readerView?.segmented ? '在文档内查找' : editor.recovery?'核对未保存草稿':'编辑'" @click="readerView?.segmented ? toggleDocumentSearch() : run(beginEditing)"><Search v-if="readerView?.segmented" :size="22" /><PenLine v-else :size="22" /></button><button v-show="!codeEditing" class="icon-button compact-document-menu" aria-label="文档操作" :aria-describedby="compactDocument ? 'document-incoming-status' : undefined" @click="menu = true"><component :is="(articleDocument || codeDocument) ? MoreVertical : MoreHorizontal" :size="22" /><span v-if="compactDocument && (incomingItems.length || incoming.error)" class="document-incoming-dot" aria-hidden="true"></span></button>
        <button v-if="codeEditing" class="icon-button code-edit-more" aria-label="文档操作" @click="menu = true"><MoreVertical :size="22" /></button><span v-if="compactDocument" id="document-incoming-status" class="assistive-status document-incoming-status" role="status">{{ incomingItems.length ? `${incomingItems.length} 项内容待核对` : incoming.error ? '有一次接收未完成' : '没有待核对的内容' }}</span>
      </header>
      <div v-show="!focusedStructureOpen" v-if="searchContext && (searchContext.changed || searchContext.contentMatch)" class="search-open-context"><span>{{ searchContext.changed ? '文件已变化，请更新搜索' : '源文命中' }}</span><button v-if="searchContext.contentMatch && !editing && !editor.recovery" class="text-button" @click="run(async()=>{await beginEditing();searchOpen=true})">查看源文命中</button></div>
      <div v-if="searchOpen" v-show="!focusedStructureOpen" class="document-search" role="search" :aria-label="editing ? '源码内查找' : '阅读内容查找'">
        <label><span>{{ editing ? '源码内查找' : '文档内查找' }}</span><input ref="documentSearchInput" v-model="documentQuery" aria-label="查找文档内容" placeholder="输入文字或符号" maxlength="128" @keydown.enter.prevent="nextMatch($event.shiftKey ? -1 : 1)" /></label>
        <div class="document-search-actions"><span role="status">{{ !documentQuery ? '输入关键词' : matchState.pending ? '查找中…' : matchState.count ? `${matchState.current} / ${matchState.count}${matchState.truncated ? '+' : ''}` : '未找到' }}</span><button class="icon-button" aria-label="上一处" :disabled="!matchState.count || matchState.pending" @click="nextMatch(-1)"><ChevronUp :size="20" /></button><button class="icon-button" aria-label="下一处" :disabled="!matchState.count || matchState.pending" @click="nextMatch(1)"><ChevronDown :size="20" /></button><button class="icon-button" aria-label="关闭文档查找" @click="closeDocumentSearch()"><X :size="20" /></button></div>
      </div>
      <div v-if="documentLoading" class="document-body empty-state" role="status">正在打开资料…</div>
      <JsonTools v-if="jsonDocument && !documentLoading && !editor.recovery" ref="jsonTools" @return="resumeJsonMenu" @source="focusJsonSource" :name="filename(editor.document.relativePath)" :identity="documentKey" :content="editor.content" :editing="editing && !editor.saving && !copying" @edit="run(beginEditing)" @structure="jsonStructureOpen = $event" @patch="value => run(() => applyJsonValue(value))" @apply="value => run(() => applyJsonFormat(value))" @locate="value => run(() => locateSource(value))" />
      <TomlTools @return="resumeJsonMenu" @source="focusJsonSource" @edit="run(beginEditing)" :name="filename(editor.document.relativePath)" @diagnostic="tomlIssue = $event" v-if="tomlDocument && !documentLoading && !editor.recovery" ref="tomlTools" :editing="editing && !editor.saving && !copying" :identity="documentKey" :content="editor.content" @structure="tomlStructureOpen = $event" @patch="value => run(() => applyTomlValue(value))" @locate="value => run(() => locateSource(value))" />
      <XmlTools @return="resumeJsonMenu" @source="focusJsonSource" @edit="run(beginEditing)" :name="filename(editor.document.relativePath)" v-if="xmlDocument && !documentLoading && !editor.recovery" ref="xmlTools" :editing="editing && !editor.saving && !copying" @structure="xmlStructureOpen = $event" @patch="value => run(() => applyXmlAttribute(value))" :identity="documentKey" :content="editor.content" @locate="value => run(() => locateSource(value))" />
      <YamlTools @return="resumeJsonMenu" @source="focusJsonSource" @edit="run(beginEditing)" v-if="yamlDocument && !documentLoading && !editor.recovery" ref="yamlTools" :name="filename(editor.document.relativePath)" :editing="editing && !editor.saving && !copying" @structure="yamlStructureOpen = $event" @patch="value => run(() => applyYamlValue(value))" :identity="documentKey" :content="editor.content" @locate="value => run(() => locateSource(value))" />
      <main v-if="!documentLoading && (!editor.recovery || readingSavedFile)" v-show="!structureOpen" class="document-body" :class="{ 'source-editor-card': sourceWorkspace }" :aria-label="editing ? '编辑文稿' : '阅读文稿'">
        <div v-if="sourceWorkspace && !codeDocument" class="source-editor-caption"><FileText :size="19" aria-hidden="true" /><strong>{{ filename(editor.document.relativePath) }}</strong></div>
        <MobileEditor :issue="tomlDocument ? tomlIssue : undefined" v-if="editorMounted" v-show="editing" :key="documentKey" ref="editorView" :active="editing && !structureOpen" :markdown="markdownDocument" :json="jsonDocument" :yaml="yamlDocument" :xml="xmlDocument" :toml="tomlDocument" :code="codeDocument?.language" :wrap="codeWrap" :model-value="editor.content" :query="documentQuery" @composition="editorComposing = $event" @code-position="codePosition = $event" @matches="matchState = $event" @history="editHistory = $event" @update:model-value="session.update($event)" />
        <p v-if="pdfReferenceBusy" class="reading-source-status" role="status">正在核对原 PDF…</p>
        <MobileReader v-if="!editing" :key="documentKey" ref="readerView" :identity="editor.document" :content="editor.content" :dark="dark" :query-input="documentSearchInput" :quiet-resume="compactDocument" :code-wrap="codeWrap" :query="documentQuery" :storage="storage" @matches="matchState = $event" @restore-query="restoreSourceQuery" @manage-images="run(openImages)" @pdf-reference="run(() => openPdfReference($event))" />
      </main>

      <CodeTouchTools v-if="codeDocument && !editor.recovery" v-show="editing && !focusedStructureOpen" :mode="codeToolMode" :picker-open="codeToolPicker" :disabled="editorComposing || editor.saving || copying" :history="editHistory" @choose="codeToolPicker = true" @format="value => run(() => editorView?.format(value))" @token="value => run(() => editorView?.insertCodeToken(value))" @action="value => run(() => editorView?.codeLineAction(value))" />
      <footer v-if="!focusedStructureOpen && (!codeDocument || !editing) && (!editor.recovery || readingSavedFile) && !txtReading && !codeReading" class="editor-footer" :class="{ 'markdown-progress-footer': enhancedMarkdownReading }">
        <template v-if="editing">
          <div class="format-tools" role="group" aria-label="编辑工具"><button aria-label="撤销" :disabled="editorComposing || editor.saving || copying || !editHistory.undo" @pointerdown.prevent @click="run(() => editorView?.format('undo'))"><Undo2 :size="20" /></button><button aria-label="重做" :disabled="editorComposing || editor.saving || copying || !editHistory.redo" @pointerdown.prevent @click="run(() => editorView?.format('redo'))"><Redo2 :size="20" /></button><button v-if="!sourceDocument" aria-label="标题" :disabled="editorComposing || editor.saving || copying" @pointerdown.prevent @click="run(() => editorView?.format('heading'))"><Heading2 :size="22" /></button><button v-if="!sourceDocument" aria-label="加粗" :disabled="editorComposing || editor.saving || copying" @pointerdown.prevent @click="run(() => editorView?.format('bold'))"><Bold :size="19" /></button><button v-if="!sourceDocument" aria-label="列表" :disabled="editorComposing || editor.saving || copying" @pointerdown.prevent @click="run(() => editorView?.format('list'))"><List :size="21" /></button><button v-if="/\.md$/i.test(editor.document.relativePath)" aria-label="图片与附件" :disabled="editorComposing || editor.saving || copying" @pointerdown.prevent @click="run(openImages)"><ImagePlus :size="21" /></button></div>
          <button v-if="!markdownDocument" class="text-button footer-reading" @click="run(showReading)"><BookOpen v-if="sourceWorkspace" :size="20" aria-hidden="true" />阅读</button>
          <span v-if="!markdownDocument" class="draft-status"><ShieldCheck v-if="sourceWorkspace && editor.draftStatus" :size="18" aria-hidden="true" />{{ editor.draftStatus || (sourceWorkspace && !editor.dirty ? '已保存' : '') }}</span>
        </template>
        <template v-else-if="enhancedMarkdownReading"><span v-if="editor.dirty" class="reader-footnote">正在阅读未保存的草稿</span><div class="markdown-reading-progress" role="progressbar" aria-label="阅读进度" :aria-valuenow="readerView?.formattedProgress || 0" :aria-valuemin="0" :aria-valuemax="100"><span aria-hidden="true">{{ readerView?.formattedProgress || 0 }}%</span><span class="reading-progress-track" aria-hidden="true"><span :style="{ width: `${readerView?.formattedProgress || 0}%` }"></span></span></div><button v-show="!readerView?.hasTextSelection" class="markdown-edit-fab" :aria-label="editor.recovery?'核对未保存草稿':'编辑'" :disabled="navigating || closing || editor.saving || copying" @click="run(beginEditing)"><PenLine :size="24" aria-hidden="true" /></button></template>
        <template v-else><span v-if="editor.recovery || editor.dirty" class="reader-footnote">{{ editor.recovery ? '还有一份未保存草稿' : '正在阅读未保存的草稿' }}</span><button class="button primary-button" @click="run(beginEditing)"><PenLine :size="18" />{{ editor.recovery ? '继续草稿' : '编辑' }}</button></template>
      </footer>
      </template>
    </template>

    <template v-else>
      <main class="mobile-main" @focusin="rememberSettingsFocus" :class="{ 'library-home': isLibrary, 'search-home': tab === 'search', 'settings-main': tab === 'settings', 'recovery-main': recoveryView && tab === 'settings' }">
        <template v-if="isLibrary">
          <div class="library-top-controls">
            <header class="library-page-header root-header">
              <button v-if="tab === 'library' && folder" class="icon-button" aria-label="返回上级文件夹" :disabled="navigating" @click="run(parentFolder)"><ArrowLeft :size="22" aria-hidden="true" /></button>
              <h1 class="library-page-title" tabindex="-1"><template v-if="tab === 'library' && folder">{{ filename(folder) }}</template><button v-else class="library-selector library-title-picker" :aria-label="`选择资料库：${activeRoot?.name || '正在准备资料库'}`" aria-haspopup="dialog" :aria-expanded="rootPicker" :disabled="navigating" @click="rootPicker = true"><span>{{ activeRoot?.name || '正在准备资料库' }}</span><ChevronDown :size="19" aria-hidden="true" /></button></h1>
              <button v-if="tab === 'library' && folder" class="icon-button library-selector library-folder-picker" :aria-label="`选择资料库：${activeRoot?.name || '资料库'}`" aria-haspopup="dialog" :aria-expanded="rootPicker" @click="rootPicker = true"><FolderOpen :size="21" aria-hidden="true" /></button>
              <button class="icon-button root-incoming" :aria-label="`查看收到的内容${incomingItems.length ? `，${incomingItems.length} 项待核对` : incoming.error ? '，接收未完成' : ''}`" aria-describedby="library-incoming-status" :disabled="navigating || recoveryBusy || incomingOpening" @click="run(openIncoming)"><Inbox :size="22" aria-hidden="true" /><span v-if="incomingItems.length || incoming.error" class="incoming-badge" aria-hidden="true">{{ incomingItems.length > 99 ? '99+' : incomingItems.length || '!' }}</span></button>
              <span id="library-incoming-status" class="assistive-status" role="status">{{ incomingItems.length ? `${incomingItems.length} 项内容待核对` : incoming.error ? '有一次接收未完成' : '没有待核对的内容' }}</span>
            </header>
            <div class="library-view-toolbar"><div class="library-modes" role="group" aria-label="资料视图"><button v-for="mode in libraryViews" :key="mode.id" :data-library-view="mode.id" :aria-pressed="tab === mode.id" :disabled="navigating" @click="run(() => switchLibraryView(mode.id))"><span>{{ mode.label }}</span></button></div><button ref="libraryFilterButton" class="icon-button" aria-label="查找文件名" :aria-expanded="libraryFilterVisible" :disabled="navigating" @click="openLibraryFilter"><Search :size="22" aria-hidden="true" /></button></div>
            <div v-if="libraryFilterVisible" class="library-name-search" role="search" aria-label="当前资料名称查找"><button class="icon-button" aria-label="关闭文件名查找" :disabled="navigating" @click="closeLibraryFilter"><ArrowLeft :size="21" aria-hidden="true" /></button><input ref="libraryFilterInput" v-model="query" type="search" aria-label="按文件名查找" :placeholder="tab === 'recent' ? '查找最近打开的文件名' : '查找当前文件夹的文件名'" enterkeyhint="search" autocomplete="off" :disabled="navigating" @focus="libraryFilterOpen = true" @keydown.esc.prevent="closeLibraryFilter" @keydown.enter="libraryFilterInput?.blur()" /><button v-if="query" class="icon-button" aria-label="清除查找" @click="query = ''; libraryFilterInput?.focus()"><X :size="20" aria-hidden="true" /></button></div>
          </div>
          <input v-if="storage.preview" ref="pdfFile" type="file" accept=".pdf,application/pdf" aria-label="选择 PDF 文件" hidden @change="pickedPdf" />
          <template v-if="tab === 'recent'">
            <div class="section-heading library-list-heading"><h2>最近打开</h2><span>{{ recentLoading ? '读取中…' : recentReadError ? '读取未完成' : `${filteredRecent.length} 项` }}</span></div>
            <div v-if="recentLoading && !filteredRecent.length" class="empty-state" role="status">正在读取最近记录…</div>
            <div v-else-if="recentReadError && !filteredRecent.length" class="empty-state" role="alert"><h3>最近记录暂不可用</h3><button class="button" @click="run(readRecent)">重新读取</button></div>
            <div v-else-if="!filteredRecent.length" class="empty-state"><BookOpen :size="34" /><h3>{{ query ? '没有找到这个名字' : '暂无最近记录' }}</h3><button class="button" @click="query ? query = '' : run(() => switchLibraryView('library'))">{{ query ? '清除查找' : '浏览全部资料' }}</button></div>
            <div v-else class="file-list"><MobileLibraryFileRow v-for="item in filteredRecent" :key="identityKey(item)" :name="filename(item.relativePath)" :detail="item.relativePath.includes('/') ? item.relativePath : '资料库根目录'" :focus-key="identityKey(item)" @open="run(() => open(item))" @more="showLibraryFile(recentLibraryEntry(item))" /></div>
          </template>
          <template v-else>
          <button v-if="activeRoot && libraryRecent[0] && !folder && !libraryFilterVisible && !loadError" class="continue-card" data-focus-key="continue" @click="run(() => open(libraryRecent[0]))"><BookOpen :size="30" aria-hidden="true" /><span class="continue-copy"><strong>继续阅读 · {{ filename(libraryRecent[0].relativePath).replace(mobileTextPattern, '') }}</strong><small>{{ libraryRecent[0].relativePath.includes('/') ? libraryRecent[0].relativePath : activeRoot.name }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
          <p v-if="folder.includes('/')" class="library-current-path">{{ folder }}</p>
          <div class="section-heading library-list-heading"><h2>{{ query ? '查找结果' : '资料文件' }}</h2><span role="status">{{ loading ? '读取中…' : loadError ? '读取未完成' : `${filtered.length} 项${truncated ? ' · 部分结果' : ''}` }}</span></div>
          <div v-if="loading" class="empty-state" role="status"><LoaderCircle :size="28" class="spinning" /><h3>正在读取资料</h3></div>
          <div v-else-if="loadError" class="empty-state"><FolderOpen :size="32" /><h3>暂时无法打开这个位置</h3><p>{{ loadError }}</p><button class="button primary-button" @click="run(loadEntries)">重新读取</button><button class="text-button" @click="rootPicker = true">选择其他资料库</button></div>
          <div v-else-if="!filtered.length" class="empty-state"><span class="empty-illustration"><FileText :size="33" /><PenLine :size="19" /></span><h3>{{ query ? '没有找到这个名字' : '从一条笔记开始' }}</h3><button v-if="!query" class="button primary-button" @click="newNote = true"><Plus :size="18" />新建笔记</button></div>
          <div v-else class="file-list"><MobileLibraryFileRow v-for="entry in visibleEntries" :key="entry.relativePath" :name="entry.name" :directory="entry.directory" :detail="libraryFileDetail(entry)" :focus-key="identityKey({ rootId, relativePath: entry.relativePath })" :disabled="!entry.directory && !textSupported(entry.relativePath) && !pdfSupported(entry.relativePath)" @open="run(() => select(entry))" @more="showLibraryFile(entry)" /></div>
          <div v-if="!loading && !loadError && filtered.length > 80" class="library-batches"><p role="status">已显示 {{ visibleEntries.length }} / {{ filtered.length }} 项 · 名称查找包含本次读取的全部条目</p><button v-if="visibleEntries.length < filtered.length" class="button" @click="showMoreEntries">再显示 {{ Math.min(80, filtered.length - visibleEntries.length) }} 项</button></div>
          <p v-if="truncated" class="subtle-message">此目录先显示前 1,000 项，其他资料尚未加载。</p>
          </template>
        </template>

        <LibrarySearch v-else-if="tab === 'search'" :key="rootId" ref="librarySearchView" :root="activeRoot" :recent="libraryRecent" :scope-open="searchScope" :storage="storage" :index="searchIndex" :status="searchStatus" :view="searchView" @scope="searchScope = true" @browse="run(() => switchTab('library'))" @open-recent="identity => run(() => open(identity))" @open="(hit, term) => run(() => openSearchHit(hit, term))" />

        <template v-else-if="recoveryView">
          <RecoveryCenter ref="recoveryCenter" :storage="storage" :open-document="openRecovered" @back="recoveryView = false" @busy="recoveryBusy = $event" />
        </template>
        <MobileSettings v-else :page="settingsPage" :theme="themePreference" :theme-busy="appearanceBusy" :roots="roots" :root-id="rootId" :busy="sheetBusy" :choosing="choosingRoot" :preview="storage.preview" @navigate="page => run(() => navigateSettings(page))" @recovery="openSettingsRecovery" @choose-theme="setThemePreference" @task="openSettingsTask" @select-root="root => run(() => switchRoot(root))" @root-actions="openRootActions" @choose-root="run(chooseRoot)" />
      </main>
      <button v-if="isLibrary && activeRoot && !newNote && (tab === 'recent' || !loadError) && !(tab === 'library' && !loading && !query && !filtered.length)" class="new-note-fab" aria-label="添加资料" aria-haspopup="dialog" :aria-expanded="addMenu" @click="addMenu = true"><Plus :size="26" /></button>
      <nav v-if="!settingsDetail" class="bottom-navigation phone-root-navigation" aria-label="主导航"><button v-for="item in navigation" :key="item.id" :disabled="recoveryBusy || navigating" :class="{ active: tab === item.id || item.id === 'library' && isLibrary }" :aria-current="tab === item.id || item.id === 'library' && isLibrary ? 'page' : undefined" @click="run(() => switchTab(item.id))"><component :is="item.icon" :size="22" /><span>{{ item.label }}</span></button></nav>
    </template>

    </div>
    <div v-if="overlayOpen" v-show="!mobileHelpOpen || !(codeSheet || sheetKind === 'root' || sheetKind === 'search-scope')" class="sheet-backdrop" :class="{'file-import-action-backdrop':fileImportActions,'library-root-backdrop':['root','root-actions'].includes(sheetKind),'note-name-backdrop':sheetKind === 'note','create-add-backdrop':sheetKind === 'add','search-scope-backdrop':sheetKind === 'search-scope','code-tool-backdrop':codeEditing && sheetKind === 'code-tools','code-actions-backdrop':codeReading && (sheetKind === 'menu' || sheetKind === 'code-more'),'code-line-backdrop':(codeReading || codeEditing) && sheetKind === 'code-line','confirmation-backdrop':sheetConfirming && !packPanel,'library-info-backdrop':sheetKind === 'library-file-info'}" :inert="recoveryOpening || recoveryPanel || mobileHelpOpen || (packPanel && sheetConfirming)" @click.self="backSheet" @wheel.self.prevent @touchmove.self.prevent>
      <section ref="sheetElement" class="bottom-sheet" :style="swipeDismissSheet && dismissSheetOffset ? {transform: `translateY(${dismissSheetOffset}px)`} : codeReading && sheetKind === 'menu' && codeSheetDrag ? { transform: `translateY(${codeSheetDrag}px)` } : undefined" :class="{'file-import-action-sheet':fileImportActions,'note-name-sheet':sheetKind === 'note','create-add-sheet':sheetKind === 'add','code-tool-choice-sheet':codeEditing && sheetKind === 'code-tools','code-actions-sheet':codeReading && sheetKind === 'menu','code-line-sheet':(codeReading || codeEditing) && sheetKind === 'code-line','library-file-sheet':sheetKind === 'library-file','library-info-sheet':sheetKind === 'library-file-info','document-actions-sheet':compactDocument && (sheetKind === 'menu' || sheetKind === 'code-line'),'search-scope-sheet':sheetKind === 'search-scope','pdf-intake-sheet':pdfImportPanel,'incoming-task-sheet':incomingPanel,'confirmation-sheet':sheetConfirming && !packPanel,'library-disconnect-sheet':sheetKind === 'disconnect','library-root-actions-sheet':sheetKind === 'root-actions','library-root-picker-sheet':sheetKind === 'root','text-export-sheet':!!exportSnapshot,'pack-source-check-sheet':packPanel && packExportView?.sourceCheck,'pack-record-read-sheet':packPanel && packExportView?.recordTask,'pack-review-task-sheet':packPanel && packExportView?.reviewTask,'pack-import-task-sheet':packImportTask && !sheetConfirming && !fileImportActions,'file-import-task-sheet':fileImportTask && !sheetConfirming,'image-source-task-sheet':imagePanel,'export-task-sheet':!!exportSnapshot || packPanel || imagePanel || (incomingPanel && !sheetConfirming && !fileImportActions) || (packImportPanel && !sheetConfirming && !fileImportActions) || (fileImportTask && !sheetConfirming && !fileImportActions)}" :role="sheetConfirming && !packPanel ? 'alertdialog' : 'dialog'" tabindex="-1" aria-modal="true" :aria-describedby="sheetKind === 'disconnect' ? 'library-disconnect-subject library-disconnect-impact' : undefined" :aria-label="sheetConfirming && !packPanel ? sheetConfirmationTitle : sheetKind === 'root-actions' || exportSnapshot || packPanel || incomingPanel || packImportPanel || fileImportTask || imagePanel ? sheetTitle : sheetLabel" @keydown="sheetKeydown">
        <button v-if="swipeDismissSheet" class="library-root-handle" :aria-label="sheetKind === 'add' ? '关闭添加资料，可向下滑动' : '关闭文件夹操作，可向下滑动'" :disabled="sheetBusy" @pointerdown="dismissDragStart" @pointermove="dismissDragMove" @pointerup="dismissDragEnd" @pointercancel="dismissSheetOffset = 0" @click="dismissHandleClick"><span /></button><button v-if="codeReading && sheetKind === 'menu'" class="code-menu-handle" aria-label="关闭源码操作，可向下滑动" @pointerdown="codeDragStart" @pointermove="codeDragMove" @pointerup="codeDragEnd" @pointercancel="codeSheetDrag = 0" @click="codeHandleClick"><span /></button><span v-show="!['root','root-actions','add','note'].includes(sheetKind) && !codeReading && !codeEditing && !sheetConfirming && !packPanel && !imagePanel && !incomingPanel && !exportSnapshot && !packImportPanel && !fileImportTask" class="sheet-handle" aria-hidden="true"></span><div v-show="!sheetConfirming || packPanel" class="sheet-heading"><button v-if="sheetKind !== 'note' && (exportSnapshot || sheetCanBack || packPanel || imagePanel || incomingPanel || packImportPanel || fileImportTask)" class="icon-button" :aria-label="exportSnapshot?textExportView?.backLabel||'返回文档':packPanel?packExportView?.backLabel||'返回上一层':sheetKind==='file-import'?fileImportView?.backLabel||'返回资料':packImportPanel?packImportView?.backLabel||'返回设置':incomingCenter?.packTask||incomingCenter?.textTask?incomingCenter.backLabel:'返回上一层'" :disabled="sheetBusy" @click="backSheet"><ArrowLeft :size="21" /></button><h2 :class="{'pack-export-heading':packPanel}" :aria-label="packPanel && packHeadingSplit ? sheetTitle : undefined" :tabindex="exportSnapshot||packPanel||packImportTask||fileImportTask?-1:undefined"><template v-if="sheetKind === 'root'">选择<wbr>资料库</template><template v-else-if="codeReading && sheetKind === 'menu'">源码<wbr>操作</template><template v-else-if="packPanel && packHeadingSplit"><span>{{ sheetTitle.slice(0,packHeadingSplit) }}</span><wbr><span>{{ sheetTitle.slice(packHeadingSplit) }}</span></template><template v-else>{{ sheetTitle }}</template></h2><button v-if="codeReading && sheetKind === 'menu'" class="icon-button" aria-label="更多文件操作" data-focus-key="code-more-entry" @click="openCodeMore"><MoreHorizontal :size="22" /></button><MobileHelp v-if="sheetHelpTopic && !fileImportActions && !['add','note'].includes(sheetKind)" :topic="sheetHelpTopic" /><button v-if="packPanel && packExportView?.actionsAvailable" class="icon-button" aria-label="附件包导出操作" data-focus-key="pack-export-actions" :disabled="sheetBusy" @click="packExportView?.openActions()"><MoreVertical :size="22" aria-hidden="true" /></button><button v-if="packActionsPanel?.actionsAvailable" class="icon-button" aria-label="附件包操作" data-focus-key="pack-import-actions" :disabled="sheetBusy" @click="packActionsPanel?.openActions()"><MoreVertical :size="22" aria-hidden="true" /></button><button v-if="textImportPanel?.actionsAvailable" class="icon-button" aria-label="导入操作" data-focus-key="text-import-actions" :disabled="sheetBusy" @click="textImportPanel?.openActions()"><MoreVertical :size="22" aria-hidden="true" /></button><button v-if="!['add','note'].includes(sheetKind) && !((codeReading && sheetKind === 'menu') || ((codeReading || codeEditing) && sheetKind === 'code-line')) && !exportSnapshot && !packPanel && !imagePanel && !incomingPanel && !packImportPanel && !fileImportTask" class="icon-button" aria-label="关闭面板" :disabled="sheetBusy" @click="dismissSheet"><X :size="21" /></button></div>
        <MobileNotice :inert="mobileHelpOpen" v-if="!['note','pdf-import', 'pack-import', 'pack-export', 'pack-history', 'file-import', 'export', 'images', 'incoming'].includes(sheetKind) && (notice || editor.error)" :message="visibleError" :text-copy="!!editor.document && textOnlyCopyAvailable" :copy="canCopyAfterError" :recovery="canInspectSaveRecovery" :busy="copying || editor.saving || closing" @text-copy="run(() => saveCopy(true))" @copy="run(saveCopy)" @recovery="run(openSaveRecovery)" @dismiss="dismissNotice" />
        <FileImportPanel v-if="importPanel" ref="fileImportView" v-show="sheetKind === 'file-import'" :inert="sheetKind !== 'file-import'" :storage="storage" :initial-id="importInitialId" :initial-error="importInitialError" :return-label="tab === 'settings' ? '返回设置' : tab === 'recent' ? '返回最近打开' : tab === 'search' ? '返回搜索' : '返回资料'" @updated="refreshIncoming" :open-document="openImported" @busy="importBusy = $event" @choose-folder="openImportFolder" />
        <LibraryRoots v-if="rootPicker" v-show="sheetKind === 'root'" :inert="sheetKind !== 'root'" class="root-picker-task" :roots="roots" :current="rootId" :busy="sheetBusy" :choosing="choosingRoot" @select="root => run(() => switchRoot(root))" @actions="openRootActions" @choose="run(chooseRoot)" />
        <div v-if="rootPicker && isLibrary" v-show="sheetKind === 'root'" :inert="sheetKind !== 'root'" class="library-picker-actions"><button class="button" :disabled="loading || recentLoading || sheetBusy" :aria-label="tab === 'recent' ? '刷新最近记录' : '刷新文件列表'" @click="closeSheet(); run(tab === 'recent' ? readRecent : loadEntries)"><RefreshCw :size="18" aria-hidden="true" />{{ tab === 'recent' ? '刷新最近记录' : '刷新文件列表' }}</button></div>
        <div v-if="searchScope" v-show="sheetKind === 'search-scope'" :inert="sheetKind !== 'search-scope'" class="search-scope-task"><button class="library-selector" :aria-label="`选择搜索资料库：${activeRoot?.name || '选择资料库'}`" aria-haspopup="dialog" @click="openImportFolder"><span class="library-icon"><FolderOpen :size="20" /></span><span><strong>{{ activeRoot?.name || '选择资料库' }}</strong></span><ChevronDown :size="18" /></button><div role="group" aria-label="搜索字段"><button v-for="field in searchFields" :key="field.id" class="search-field-choice" :aria-pressed="searchView.field === field.id" @click="searchView.field = field.id; closeSheet()"><span>{{ field.label }}</span><Check v-if="searchView.field === field.id" :size="20" /></button></div><button class="button search-refresh-action" @click="closeSheet(); librarySearchView?.refresh()"><RefreshCw :size="18" aria-hidden="true" />更新搜索内容</button></div>
        <IncomingCenter v-if="incomingPanel" ref="incomingCenter" :storage="storage" :status="incoming" :open-text="openImported" :open-pack="openImportedPack" :open-pdf="openImportedPdf" @updated="refreshIncoming" @busy="incomingBusy = $event" />
        <PdfImportPanel v-else-if="pdfImportPanel" ref="pdfImportView" :storage="storage" :initial-id="pdfImportInitialId" :initial-error="pdfImportInitialError" :open-document="openImportedPdf" @updated="refreshIncoming" @busy="pdfImportBusy = $event" @close="closeSheet" />
        <PackImportPanel v-else-if="packImportPanel" ref="packImportView" :storage="storage" :initial-id="packImportInitialId" :initial-error="packImportInitialError" :open-document="openImportedPack" :return-label="tab === 'settings' ? '返回设置' : tab === 'recent' ? '返回最近打开' : tab === 'search' ? '返回搜索' : '返回资料'" @updated="refreshIncoming" @busy="packImportBusy = $event" />
        <PortableExport v-else-if="packPanel" ref="packExportView" :key="packSnapshot?.recoveryId || 'history'" :storage="storage" :snapshot="packSnapshot" @busy="packBusy = $event" @close="closeSheet" />
        <template v-else-if="sheetKind === 'file-import'"></template>
        <TextExport v-else-if="exportSnapshot" :key="exportSnapshot.recoveryId" ref="textExportView" :storage="storage" :snapshot="exportSnapshot" :library-name="roots.find(root=>root.id===exportSnapshot?.rootId)?.name || '来源文件夹'" @close="closeSheet" @busy="exportBusy = $event" @recovery="run(openSaveRecovery)" />
        <ImageAttachments v-else-if="imagePanel" ref="imageTaskView" :storage="storage" :libraries="roots" :note="imageContext?.identity" :content="imageContext?.content || ''" :can-write="!!imageContext && !needsLocalCopy" :placement="imageContext?.atEnd ? '文末' : imageContext?.selection.from !== imageContext?.selection.to ? '选中文字' : '光标处'" :place="placeImage" @busy="imageBusy = $event" />
        <template v-else-if="addMenu"><div class="mobile-add-actions"><button class="settings-row" data-focus-key="add-note" @click="openAddTask('note')"><FilePlus2 :size="23" aria-hidden="true" /><span>新建笔记</span></button><button class="settings-row" data-focus-key="add-file-import" @click="openAddTask('file-import')" aria-label="导入文本文件"><FileInput :size="23" aria-hidden="true" /><span>导入文本</span></button><button class="settings-row" :disabled="pdfBusy" @click="closeSheet(); run(choosePdf)" aria-label="导入 PDF 阅读"><svg class="add-pdf-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#b73b2f" /><path d="M4.5 16V8h2a2 2 0 0 1 0 4h-2M11 16V8h1.3a3.4 3.4 0 0 1 3.4 3.4v1.2a3.4 3.4 0 0 1-3.4 3.4H11ZM18.5 16V8h3M18.5 12h2.5" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg><span>导入 PDF</span></button><button class="settings-row" data-focus-key="add-pack-import" @click="openAddTask('pack-import')"><FileInput :size="23" aria-hidden="true" /><span>导入笔记与附件</span></button><button class="settings-row" data-focus-key="add-root" @click="openAddTask('root')"><FolderOpen :size="21" /><span>连接手机文件夹</span></button></div></template>
        <template v-else-if="rootActions && sheetKind === 'root-actions'"><div class="library-root-actions"><button class="settings-row" data-focus-key="library-disconnect-entry" @click="confirmDisconnect(rootActions)"><Unlink :size="24" aria-hidden="true" /><span>停止访问</span></button></div></template>
        <template v-else-if="pendingDisconnect"><div class="disconnect-confirmation"><div class="disconnect-copy" tabindex="0" role="region" aria-label="停止访问的影响"><h3><span>停止访问</span><wbr><span>文件夹？</span></h3><p id="library-disconnect-subject" class="disconnect-subject">{{ pendingDisconnect.name }}</p><p id="library-disconnect-impact">将撤销访问授权。文件和草稿会保留，需要时可重新连接。</p></div><div class="inline-actions"><button class="button" :disabled="disconnecting" @click="backSheet">继续访问</button><button class="button primary-button" :disabled="disconnecting" @click="run(disconnectRoot)">{{ disconnecting ? '正在停止…' : '停止访问' }}</button></div></div></template>
        <template v-else-if="selectedLibraryFile && sheetKind === 'library-file-info'"><div class="library-file-information"><MobileFileIcon :name="selectedLibraryFile.entry.name" :directory="selectedLibraryFile.entry.directory" /><strong>{{ selectedLibraryFile.entry.name }}</strong><dl><div><dt>位置</dt><dd>{{ selectedLibraryFile.libraryName }} / {{ selectedLibraryFile.entry.relativePath }}</dd></div><div><dt>类型</dt><dd>{{ selectedLibraryFile.entry.directory ? '文件夹' : pdfSupported(selectedLibraryFile.entry.name) ? 'PDF' : fileType(selectedLibraryFile.entry.name) }}</dd></div><div v-if="!selectedLibraryFile.entry.directory"><dt>大小</dt><dd>{{ libraryFileSize(selectedLibraryFile.entry.size) }}</dd></div><div><dt>修改时间</dt><dd>{{ libraryModifiedDate(selectedLibraryFile.entry.modified) || '未提供' }}</dd></div></dl></div></template>
        <template v-else-if="selectedLibraryFile"><div class="library-file-actions"><button class="settings-row" :disabled="!selectedLibraryFile.entry.directory && !textSupported(selectedLibraryFile.entry.name) && !pdfSupported(selectedLibraryFile.entry.name)" @click="run(openSelectedLibraryFile)"><FolderOpen v-if="selectedLibraryFile.entry.directory" :size="21" /><BookOpen v-else :size="21" /><span>{{ selectedLibraryFile.entry.directory ? '打开文件夹' : '打开文稿' }}</span></button><button class="settings-row" data-focus-key="library-file-info-entry" @click="openLibraryFileInfo"><FileText :size="21" /><span>文件信息</span></button></div></template>
        <div v-else-if="sheetKind === 'code-tools'" class="code-tool-choices" role="group" aria-label="选择编辑工具">
          <button class="settings-row" data-focus-key="code-mode-symbols" :aria-pressed="codeToolMode === 'symbols'" :disabled="editorComposing || editor.saving || copying" @click="selectCodeTool('symbols')"><Code2 :size="22" /><span>符号</span><Check v-if="codeToolMode === 'symbols'" :size="22" /></button>
          <button class="settings-row" data-focus-key="code-mode-cursor" :aria-pressed="codeToolMode === 'cursor'" :disabled="editorComposing || editor.saving || copying" @click="selectCodeTool('cursor')"><MoveHorizontal :size="22" /><span>光标</span><Check v-if="codeToolMode === 'cursor'" :size="22" /></button>
          <button class="settings-row" data-focus-key="code-mode-indent" :aria-pressed="codeToolMode === 'indent'" :disabled="editorComposing || editor.saving || copying" @click="selectCodeTool('indent')"><IndentIncrease :size="22" /><span>缩进</span><Check v-if="codeToolMode === 'indent'" :size="22" /></button>
          <button class="settings-row" data-focus-key="code-tools-more" @click="openCodeEditorMenu"><MoreHorizontal :size="22" /><span>源码操作</span></button>
        </div>
        <CodeTools v-else-if="codeLineOpen" :compact="codeReading || codeEditing" :initial-target="codeLineTarget" @target="codeLineTarget = $event" @cancel="backSheet" :content="editor.content" @locate="value => run(() => locateCodeLine(value))" />
        <template v-else-if="rootPicker || searchScope"></template>
        <form v-else-if="newNote" class="note-name-form" @submit.prevent="submitNoteName">
          <div class="note-name-body task-scroll"><label class="assistive-status" for="note-name">笔记名称</label><div class="note-name-field"><input id="note-name" ref="noteNameInput" :value="noteName" :disabled="creatingNote" class="name-input" placeholder="笔记名称" maxlength="120" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" @input="noteNameEdited" /><button v-if="noteName" class="note-name-clear" type="button" aria-label="清空笔记名称" :disabled="creatingNote" @pointerdown.prevent @click="noteName = ''; noteCreationError = ''; noteNameInput?.focus()"><X :size="14" aria-hidden="true" /></button></div><div class="note-name-destination"><FolderOpen :size="24" aria-hidden="true" /><span>{{ activeRoot?.name }}<template v-if="creationFolder"> / {{ creationFolder }}</template></span></div><p v-if="noteCreationError" ref="noteNameError" class="note-name-error" role="alert" tabindex="-1">{{ noteCreationError }}</p><p v-if="creatingNote" class="note-name-status" role="status">正在准备并保护这份笔记…</p></div>
          <footer class="note-name-actions"><button type="button" class="text-button" :disabled="creatingNote" @click="cancelNoteName">取消</button><button class="button primary-button" :disabled="creatingNote || !noteName.trim()">{{ creatingNote ? '正在准备…' : '创建' }}</button></footer>
        </form>
        <template v-else-if="codeReading && sheetKind === 'menu'"><div class="code-primary-actions">
          <template v-if="jsonDocument && !editor.recovery"><button class="settings-row" data-focus-key="json-structure-entry" @click="openJsonTask('structure')"><FolderOpen :size="22" /><span>浏览结构</span></button><button class="settings-row" data-focus-key="json-diagnostic-entry" @click="openJsonTask('diagnostic')"><CircleCheck :size="22" /><span>检查 JSON</span></button></template>
          <template v-if="otherStructureFormat && !editor.recovery"><button class="settings-row" :data-focus-key="otherStructureFormat+'-structure-entry'" @click="openJsonTask('structure',otherStructureFormat)"><FolderOpen :size="22" /><span>浏览结构</span></button><button class="settings-row" :data-focus-key="otherStructureFormat+'-diagnostic-entry'" @click="openJsonTask('diagnostic',otherStructureFormat)"><CircleCheck :size="22" /><span>检查 {{ otherStructureFormat.toUpperCase() }}</span></button></template>
          <button class="settings-row" aria-label="折行" :disabled="readerView?.segmented" :aria-pressed="codeWrap" @click="run(toggleCodeWrap)"><WrapText :size="22" /><span>折行</span><Check v-if="codeWrap" :size="22" class="code-wrap-check" /></button>
          <button class="settings-row" data-focus-key="code-line-entry" @click="openCodeLine"><Hash :size="22" /><span>定位行</span></button>
          <button class="settings-row" @click="menu = false; toggleDocumentSearch()"><Search :size="22" /><span>查找</span></button>
          <button class="settings-row" aria-label="复制全文" @click="run(copySource)"><Copy :size="22" /><span>复制</span></button>
          <button class="settings-row" @click="run(openTextExport)"><Download :size="22" /><span>导出</span></button>
        </div></template>
        <template v-else>
          <template v-if="jsonDocument && !editor.recovery"><button class="settings-row" data-focus-key="json-structure-entry" @click="openJsonTask('structure')"><FolderOpen :size="21" /><span>浏览结构</span></button><button class="settings-row" data-focus-key="json-diagnostic-entry" @click="openJsonTask('diagnostic')"><CircleCheck :size="21" /><span>检查 JSON</span></button><button v-if="editing" class="settings-row" data-focus-key="json-format-entry" @click="openJsonTask('format')"><AlignLeft :size="21" /><span>整理缩进</span></button></template>
          <template v-if="otherStructureFormat && !editor.recovery"><button class="settings-row" :data-focus-key="otherStructureFormat+'-structure-entry'" @click="openJsonTask('structure',otherStructureFormat)"><FolderOpen :size="22" /><span>浏览结构</span></button><button class="settings-row" :data-focus-key="otherStructureFormat+'-diagnostic-entry'" @click="openJsonTask('diagnostic',otherStructureFormat)"><CircleCheck :size="22" /><span>检查 {{ otherStructureFormat.toUpperCase() }}</span></button></template>
          <template v-if="editing"><button class="settings-row" @click="run(async () => { if(!codeDocument)menu = false; await showReading() })"><BookOpen :size="21" /><span>阅读文稿</span></button><div class="sheet-format-tools" role="group" aria-label="编辑工具"><button class="button" :disabled="!editHistory.undo" @click="run(() => formatFromMenu('undo'))">撤销</button><button class="button" :disabled="!editHistory.redo" @click="run(() => formatFromMenu('redo'))">重做</button><button v-if="!sourceDocument" class="button" @click="run(() => formatFromMenu('heading'))">标题</button><button v-if="!sourceDocument" class="button" @click="run(() => formatFromMenu('bold'))">加粗</button><button v-if="!sourceDocument" class="button" @click="run(() => formatFromMenu('list'))">列表</button></div></template>
          <button v-else class="settings-row" @click="run(async () => { menu = false; await beginEditing() })"><PenLine :size="21" /><span>{{ editor.recovery ? '核对未保存草稿' : '编辑文档' }}</span></button>
          <button v-if="compactDocument" class="settings-row" :disabled="!!editor.recovery && !readingSavedFile" @click="menu = false; toggleDocumentSearch()"><Search :size="21" /><span>在文档内查找</span></button>
          <button v-if="compactDocument && !editing && readerView?.canRestart" class="settings-row" @click="menu = false; readerView?.fromTop()"><ChevronUp :size="21" /><span>从头阅读</span></button>
          <button v-if="codeDocument && editing" class="settings-row" aria-label="折行" :aria-pressed="codeWrap" :disabled="editor.saving || copying" @click="run(toggleCodeWrap)"><WrapText :size="21" /><span>折行</span><small class="document-incoming-count">{{ codeWrap ? '开启' : '关闭' }}</small></button>
          <button v-if="codeDocument && editing" class="settings-row" :disabled="editor.saving || copying || !!editor.recovery" data-focus-key="code-line-entry" @click="openCodeLine"><LocateFixed :size="21" /><span>定位行</span></button>
          <button v-if="editor.document && /\.md$/i.test(editor.document.relativePath)" class="settings-row" :disabled="!!editor.recovery || copying" @click="run(openImages)"><ImagePlus :size="21" /><span>添加或修复图片</span></button>
          <button v-if="compactDocument" class="settings-row" :aria-label="`查看收到的内容${incomingItems.length ? `，${incomingItems.length} 项待核对` : incoming.error ? '，接收未完成' : ''}`" :disabled="copying || editor.saving || recoveryBusy || incomingOpening" @click="run(openDocumentIncoming)"><Inbox :size="21" /><span>查看收到的内容</span><small v-if="incomingItems.length || incoming.error" class="document-incoming-count" aria-hidden="true">{{ incomingItems.length ? `${incomingItems.length} 项` : '!' }}</small></button>
          <button v-if="(!compactDocument || editor.dirty) && !(codeDocument && editing)" class="settings-row" :disabled="!!editor.recovery || !editor.dirty || copying" @click="run(async () => { await save(); menu = false })"><Save :size="21" /><span>{{ needsLocalCopy ? '存入手机资料库' : '保存到文件' }}</span></button><button class="settings-row" :disabled="copying || !!editor.recovery" @click="run(saveCopy)"><Copy :size="21" /><span>将副本存入手机资料库</span></button><button class="settings-row" :disabled="copying || editor.saving || (!!editor.recovery && !readingSavedFile)" @click="run(openTextExport)"><Download :size="21" /><span>导出当前内容副本</span></button><button v-if="!sourceDocument" class="settings-row" :disabled="copying || editor.saving || (!!editor.recovery && !readingSavedFile)" @click="run(openPackExport)"><Download :size="21" /><span>导出笔记与附件</span></button>
        </template>
      </section>
    </div>
    <div v-if="recoveryPanel" class="recovery-backdrop" :inert="mobileHelpOpen">
      <section ref="recoveryTask" class="recovery-task" role="dialog" aria-modal="true" :aria-label="taskRecoveryCenter?.title || '保存恢复记录'" tabindex="-1" @keydown="recoveryKeydown">
        <RecoveryCenter ref="taskRecoveryCenter" :storage="storage" :open-document="openRecovered" :return-label="exportSnapshot ? '返回文字导出' : '返回文档'" @back="closeRecovery" @busy="recoveryBusy = $event" />
      </section>
    </div>
    <MobileHelpHost />
  </div>
</template>

<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import MobileLibraryFileRow from './MobileLibraryFileRow.vue'
import MobileFileIcon from './MobileFileIcon.vue'
import MobileHelpHost from './MobileHelpHost.vue'
import { mobileHelpOpen, dismissMobileHelp, type MobileHelpTopic } from './mobileHelp'
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { AlignLeft, CircleCheck, IndentIncrease, MoveHorizontal, Code2, Hash, ArrowLeft, Bold, BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Download, FileInput, FilePlus2, FileText, FolderOpen, Heading2, ImagePlus, Inbox, List, LoaderCircle, LocateFixed, WrapText, MoreHorizontal, MoreVertical, PenLine, Plus, RefreshCw, Redo2, Save, Search, Settings as SettingsIcon, ShieldCheck, Undo2, Unlink, X } from 'lucide-vue-next'
import { createStorage, humanStorageError, identityKey, localCopyName, textSupported, validatePath, type Entry, type Identity, type Library, type ImageImport } from './storage'
import { createEditorState, DocumentSession } from './documentSession'
import { MobileViewHistory, type MobileOrigin, type MobileRoot, type MobilePage } from './viewHistory'
import MobileEditor from './MobileEditor.vue'
import MobileDraftReview from './MobileDraftReview.vue'
import JsonTools from './JsonTools.vue'
import YamlTools from './YamlTools.vue'
import XmlTools from './XmlTools.vue'
import TomlTools from './TomlTools.vue'
import CodeTools from './CodeTools.vue'
import MobilePdf from './MobilePdf.vue'
import type { MobilePdfReference } from './pdfReference'
import { pdfSupported } from './pdfDocument'
import { sourceFileInfo, mobileTextPattern } from './codeFormats'
import CodeTouchTools from './CodeTouchTools.vue'
import type {CodeToolMode} from './codeCommands'
import type { YamlValuePatch } from './yamlStructure'
import type { XmlAttributePatch } from './xmlStructure'
import type { TomlValuePatch } from './tomlStructure'
import type { JsonValuePatch } from './jsonStructure'
import RecoveryCenter from './RecoveryCenter.vue'
import MobileReader from './MobileReader.vue'
import MobileAppearanceStatus from './MobileAppearanceStatus.vue'
import {createAppearanceSession} from './appearanceRepository'
import {backSourceDialog,flushSourceReaders,sourcePositionFailure} from './sourceReadingNavigation'
import type {QuerySelection} from './sourceReadingState'
import LibrarySearch from './LibrarySearch.vue'
import MobileSettings from './MobileSettings.vue'
import LibraryRoots from './LibraryRoots.vue'
import { type ThemePreference, type SettingsPage } from './settings'
import { LibrarySearchIndex, type SearchField, type SearchHit } from './librarySearch'
import ImageAttachments from './ImageAttachments.vue'
import MobileNotice from './MobileNotice.vue'
import TextExport from './TextExport.vue'
import PortableExport from './PortableExport.vue'
import PdfImportPanel from './PdfImportPanel.vue'
import PackImportPanel from './PackImportPanel.vue'
import FileImportPanel from './FileImportPanel.vue'
import IncomingCenter from './IncomingCenter.vue'
import type { IncomingStatus } from './textImport'
import { captureTextExport, type TextExportSnapshot } from './textExport'
import { captureTaskPosition, restoreTaskPosition, restoreTaskRecord, type TaskPosition } from './taskPosition'
import { canFocus, focusableControls, focusPageHeading } from './accessibility'
import { imageInsertionText, prepareImageCopy, relativeImageSource, replaceImageReference, type ImageReference } from './imageReferences'

declare global { interface Window { __longeditMobileBack?: () => boolean; __longeditMobileImeVisible?: boolean } }

const pdfIdentity = shallowRef<Identity | null>(null), pdfView = ref<InstanceType<typeof MobilePdf>>(), pdfFile = ref<HTMLInputElement>(), pdfBusy = ref(false)
const pdfReference=shallowRef<MobilePdfReference|null>(null), pdfReturnNote=shallowRef<Identity|null>(null), pdfReferenceBusy=ref(false)
const storage = createStorage(), editor = reactive(createEditorState()), session = new DocumentSession(storage, editor)
const roots = ref<Library[]>([]), rootId = ref('local'), folder = ref(''), entries = ref<Entry[]>([])
const searchIndex = new LibrarySearchIndex('local', status => { searchStatus.value = status })
const searchStatus = shallowRef(searchIndex.status)
const searchView = reactive({ query: '', field: 'all' as SearchField, scroll: 0, focusPath: '' })
const searchScope = ref(false)
const searchFields = [{ id: 'all' as const, label: '名称与原文' }, { id: 'content' as const, label: '文档源文' }, { id: 'path' as const, label: '名称与路径' }]
const searchContext = ref<{ contentMatch: boolean; changed: boolean } | null>(null)
const librarySearchView = ref<InstanceType<typeof LibrarySearch>>()
const loading = ref(true), truncated = ref(false), notice = ref(''), loadError = ref(''), query = ref('')
const tab = ref<MobileRoot>('library'), editing = ref(false)
const readingEditOrigin = ref(false), editorComposing = ref(false)
const themePreference = ref<ThemePreference>('system'), systemDark = ref(false)
const dark = computed({ get: () => themePreference.value === 'system' ? systemDark.value : themePreference.value === 'dark', set: value => setThemePreference(value ? 'dark' : 'light') })
const settingsPage = ref<SettingsPage>('home')
const settingsPositions = new Map<SettingsPage, { scroll: number; focusKey: string }>()
const settingsDetail = computed(() => tab.value === 'settings' && (settingsPage.value !== 'home' || recoveryView.value))
const nativeImeVisible=ref(window.__longeditMobileImeVisible===true)
const isLibrary = computed(() => tab.value === 'library' || tab.value === 'recent')
const libraryViews = [{ id: 'library' as const, label: '全部' }, { id: 'recent' as const, label: '最近' }]
const creationFolder = computed(() => tab.value === 'recent' ? '' : folder.value)
const viewHistory = new MobileViewHistory(), navigating = ref(false)
const editorMounted = ref(false), editHistory = ref({ undo: false, redo: false })
watch(editing, active => { if (active) editorMounted.value = true }, { flush: 'sync' })
const rootPicker = ref(false), newNote = ref(false), addMenu = ref(false), menu = ref(false), noteName = ref(''), recent = ref<Identity[]>([])
const selectedLibraryFile = ref<{rootId:string;libraryName:string;entry:Entry}|null>(null), libraryFileInfo = ref(false)
const libraryFilterOpen=ref(false),libraryFilterInput=ref<HTMLInputElement>(),libraryFilterButton=ref<HTMLButtonElement>()
const libraryFilterVisible=computed(()=>libraryFilterOpen.value||!!query.value)
let libraryFilterOrigin:{page:string;scroll:number}|null=null
const recentReadError = ref(false), recentLoading = ref(true)
let recentEpoch = 0
const creatingNote = ref(false), noteNameInput = ref<HTMLInputElement>(), noteNameError = ref<HTMLElement>(), noteCreationError = ref('')
let noteNameSelection: {start:number;end:number;direction:'forward'|'backward'|'none'} | null = null
watch(newNote, value => { if (!value && noteNameInput.value) { const e=noteNameInput.value; noteNameSelection={start:e.selectionStart||0,end:e.selectionEnd||0,direction:e.selectionDirection||'none'} } }, {flush:'sync'})
const closing = ref(false), copying = ref(false), workspaceEpoch = ref(0)
const assistiveStatus = ref('')
let announcementTimer: ReturnType<typeof setTimeout> | undefined
const returnLocation = shallowRef<MobileOrigin | null>(null)
const documentRootReturnLabel = computed(()=>({library:'返回资料库',recent:'返回最近打开',search:'返回搜索结果',settings:'返回设置'}[returnLocation.value?.page.tab || 'library']))
const documentBackButton = ref<HTMLButtonElement>(), readerHeading = ref<HTMLHeadingElement>()
let pdfNoteLocation: MobileOrigin | null = null
let failedCloseNotice = ''
let afterSheetPage: MobileOrigin | null = null
const importPanel = ref(false), importBusy = ref(false), importInitialId = ref(''), importInitialError = ref('')
const pdfImportPanel=ref(false),pdfImportBusy=ref(false),pdfImportInitialId=ref(''),pdfImportInitialError=ref('')
const incoming = ref<IncomingStatus>({ entries: [], error: '' }), incomingOpening = ref(false)
const incomingPanel = ref(false), incomingBusy = ref(false), incomingCenter = ref<InstanceType<typeof IncomingCenter>>()
let incomingParent: { position: TaskPosition; windowTop: number } | null = null
const incomingItems = computed(() => [...incoming.value.entries.map(entry => ({ ...entry, kind: 'text' as const })), ...(incoming.value.packs || []).map(entry => ({ ...entry, kind: 'pack' as const })), ...(incoming.value.pdfs || []).map(entry => ({...entry,kind:'pdf' as const}))].sort((a, b) => b.created - a.created))
let incomingRefresh: Promise<void> | null = null, incomingRefreshAgain = false
function refreshIncoming() {
  if (incomingRefresh) { incomingRefreshAgain = true; return incomingRefresh }
  incomingRefresh = storage.incomingStatus().then(value => { incoming.value = value }).catch(error => { notice.value = humanStorageError(error) }).finally(() => { incomingRefresh = null; if (incomingRefreshAgain) { incomingRefreshAgain = false; void refreshIncoming() } })
  return incomingRefresh
}
async function openIncoming() {
  if (overlayOpen.value || closing.value || copying.value || editor.saving || recoveryBusy.value || incomingOpening.value) return
  incomingOpening.value = true
  try {
    incomingParent = { position: captureTaskPosition(), windowTop: window.scrollY }
    if (await pdfView.value?.protect() === false) throw new Error('PDF 输入尚未确认保存，请返回当前面板重试。')
    notice.value = ''
    await flushTextPosition(); await session.flush()
    await flushPdfPosition()
    incomingPanel.value = true
  } catch (error) {
    if (editor.document) editor.error = `当前草稿尚未保护，已留在编辑页。${humanStorageError(error)}`
    incomingParent = null
    throw error
  } finally { incomingOpening.value = false }
}
async function openDocumentIncoming() {
  menu.value = false
  await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await openIncoming()
}
const exportSnapshot = shallowRef<TextExportSnapshot | null>(null), exportBusy = ref(false), textExportView=ref<InstanceType<typeof TextExport>>()
const packImportPanel = ref(false), packImportBusy = ref(false), packImportInitialId = ref(''), packImportInitialError = ref('')
const packPanel = ref(false), packSnapshot = shallowRef<TextExportSnapshot | null>(null), packBusy = ref(false)
const imagePanel = ref(false), imageBusy = ref(false), textOnlyCopyAvailable = ref(false)
const imageTaskView = ref<InstanceType<typeof ImageAttachments>>()
const imageContext = ref<{ identity: Identity; revision: number; content: string; selection: { from: number; to: number }; atEnd: boolean } | null>(null)
watch(imagePanel, opened => { if (!opened) imageBusy.value = false }, { flush: 'sync' })
const readingSavedFile = ref(false),draftReview=ref<InstanceType<typeof MobileDraftReview>>()
const draftChoosing=computed(()=>!!editor.recovery&&!readingSavedFile.value)
const choosingRoot = ref(false), disconnecting = ref(false), pendingDisconnect = ref<Library | null>(null), rootActions = ref<Library | null>(null)
const recoveryView = ref(false), recoveryBusy = ref(false), recoveryCenter = ref<InstanceType<typeof RecoveryCenter>>()
const recoveryPanel = ref(false), recoveryOpening = ref(false), taskRecoveryCenter = ref<InstanceType<typeof RecoveryCenter>>(), recoveryTask = ref<HTMLElement>()
let recoveryParent: { position: TaskPosition; windowTop: number } | null = null
const packExportView = ref<InstanceType<typeof PortableExport>>()
const fileImportView = ref<InstanceType<typeof FileImportPanel>>(), pdfImportView = ref<InstanceType<typeof PdfImportPanel>>(), packImportView = ref<InstanceType<typeof PackImportPanel>>()
const sheetParents = shallowRef<{ kind: string; position: TaskPosition }[]>([])
let returningSheet: { kind: string; position: TaskPosition } | null = null
const sheetBusy = computed(() => navigating.value || disconnecting.value || choosingRoot.value || imageBusy.value || creatingNote.value || exportBusy.value || importBusy.value || packBusy.value || packImportBusy.value || pdfImportBusy.value || incomingBusy.value)
const sheetElement = ref<HTMLElement>(), sheetKind = computed(() => pendingDisconnect.value ? 'disconnect' : rootActions.value ? 'root-actions' : rootPicker.value ? 'root' : searchScope.value ? 'search-scope' : codeLineOpen.value ? 'code-line' : menu.value && codeMenuExtras.value ? 'code-more' : incomingPanel.value ? 'incoming' : pdfImportPanel.value ? 'pdf-import' : packImportPanel.value ? 'pack-import' : packPanel.value ? packExportView.value?.inHistory || !packSnapshot.value ? 'pack-history' : 'pack-export' : importPanel.value ? 'file-import' : exportSnapshot.value ? 'export' : imagePanel.value ? 'images' : codeToolPicker.value && !menu.value ? 'code-tools' : libraryFileInfo.value ? 'library-file-info' : selectedLibraryFile.value ? 'library-file' : newNote.value ? 'note' : addMenu.value ? 'add' : menu.value ? 'menu' : '')
const overlayOpen = computed(() => !!sheetKind.value)
// Keep the source task mounted while an overlay attempts document admission.
const documentLoading = computed(() => editor.loading && !overlayOpen.value && !recoveryPanel.value)
const fileImportTask = computed(() => sheetKind.value === 'file-import' || !!(incomingPanel.value && incomingCenter.value?.textTask))
const textImportPanel=computed(()=>sheetKind.value==='file-import'?fileImportView.value:incomingPanel.value&&incomingCenter.value?.textTask?incomingCenter.value:null)
const packActionsPanel=computed(()=>packImportPanel.value?packImportView.value:incomingPanel.value&&incomingCenter.value?.packTask?incomingCenter.value:null)
const fileImportActions=computed(()=>(!!packPanel.value && !!packExportView.value?.actionsOpen)||(!!textImportPanel.value?.actionsOpen && !textImportPanel.value?.confirming)||(!!packActionsPanel.value?.actionsOpen && !packActionsPanel.value?.confirming))
const packImportTask = computed(() => packImportPanel.value || !!(incomingPanel.value && incomingCenter.value?.packTask))
const sheetLabel = computed(() => (({ incoming: '收到的内容', 'pdf-import': 'PDF 接收', 'pack-import': '导入笔记与附件', 'pack-export': '导出笔记与附件', 'pack-history': '导出笔记与附件', 'file-import': '文件导入', export: '导出文字副本', images: '图片与附件', 'library-file':'文件操作', 'library-file-info':'文件信息', disconnect: '停止访问文件夹', 'root-actions': '外部文件夹', root: '选择资料库', 'search-scope': '搜索范围', theme: '主题', 'code-tools':'编辑工具', 'code-more':'文件操作', 'code-line': '定位行', note: '新建笔记', add: '添加资料', menu: codeReading.value ? '源码操作' : '文档操作' } as Record<string, string>)[sheetKind.value] || '文档操作'))
const packHeadingBreaks: Record<string,number> = { 导出附件包:2, 附件包详情:3, 附件包导出记录:3, 附件包操作:3, 导出结果:2 }
const sheetTitle = computed(() => sheetKind.value === 'root-actions' && rootActions.value ? rootActions.value.name : sheetKind.value === 'library-file' && selectedLibraryFile.value ? selectedLibraryFile.value.entry.name : exportSnapshot.value && textExportView.value ? textExportView.value.title : incomingPanel.value && incomingCenter.value ? incomingCenter.value.title : packImportPanel.value && packImportView.value ? packImportView.value.title : sheetKind.value === 'images' && imageTaskView.value ? imageTaskView.value.title : packPanel.value && packExportView.value ? packExportView.value.title : sheetKind.value === 'file-import' ? fileImportView.value?.title || '文件导入' : sheetKind.value === 'pack-history' ? '附件包导出记录' : sheetKind.value === 'images' && !imageContext.value ? '图片导入记录' : sheetKind.value === 'disconnect' ? '停止访问文件夹？' : sheetLabel.value)
const packHeadingSplit = computed(() => packHeadingBreaks[sheetTitle.value])
const sheetCanBack = computed(() => (packPanel.value && packExportView.value?.canBack) || !!sheetParents.value.length || (sheetKind.value === 'file-import' && fileImportView.value?.canBack) || (sheetKind.value === 'pdf-import' && pdfImportView.value?.canBack) || (sheetKind.value === 'pack-import' && packImportView.value?.canBack))
const sheetConfirming = computed(() => sheetKind.value === 'disconnect' || (incomingPanel.value && incomingCenter.value?.confirming) || (packPanel.value && packExportView.value?.confirming) || (sheetKind.value === 'file-import' && fileImportView.value?.confirming) || (sheetKind.value === 'pdf-import' && pdfImportView.value?.confirming) || (sheetKind.value === 'pack-import' && packImportView.value?.confirming))
const sheetConfirmationTitle = computed(() => sheetKind.value === 'disconnect' ? '停止访问文件夹？' : incomingPanel.value && incomingCenter.value ? incomingCenter.value.confirmationTitle : sheetKind.value === 'pdf-import' ? '移除这条 PDF 接收记录？' : sheetKind.value === 'pack-import' ? '移除这份导入记录？' : '移除这条导入记录？')
const codeSheet = computed(() => !!codeDocument.value && ['menu', 'code-line', 'code-more', 'code-tools'].includes(sheetKind.value))
const sheetHelpTopic = computed(() => codeSheet.value ? (jsonDocument.value ? 'json' : 'source') : incomingPanel.value && incomingCenter.value ? incomingCenter.value.helpTopic : ({ incoming:'incoming', 'pdf-import':'pdfImport', 'pack-import':'packImport', 'pack-export':'packExport', 'pack-history':'packExport', 'file-import':'import', export:'textExport', images:'images', root:'storage', 'search-scope':'search', note:'note', add:'library' } as Record<string, MobileHelpTopic | undefined>)[sheetKind.value])
let previousFocus: HTMLElement | null = null
const editorView = ref<InstanceType<typeof MobileEditor>>()
const readerView = ref<InstanceType<typeof MobileReader>>()
const searchOpen = ref(false), documentQuery = ref(''), documentSearchInput = ref<HTMLInputElement>()
const matchState = ref<import('./documentBudget').DocumentMatches>({ count: 0, current: 0, truncated: false })
const activeRoot = computed(() => roots.value.find(root => root.id === rootId.value))
const visibleError = computed(() => humanStorageError(editor.error || notice.value))
const canCopyAfterError = computed(() => !!editor.document && /CONFLICT|WRITE_|READ_FAILED|NOT_FOUND|PERMISSION|SOURCE_UNAVAILABLE/.test(editor.error))
const canInspectSaveRecovery = computed(() => !!editor.document && /WRITE_FAILED|WRITE_UNCONFIRMED/.test(editor.error || notice.value))
function dismissNotice() { notice.value = ''; editor.error = ''; textOnlyCopyAvailable.value = false }
const needsLocalCopy = computed(() => !!editor.sourceError || (!!editor.document && roots.value.find(root => root.id === editor.document?.rootId)?.writable === false))
const documentKey = computed(() => editor.document ? identityKey(editor.document) : '')
const jsonDocument = computed(() => /\.json$/i.test(editor.document?.relativePath || ''))
const yamlDocument = computed(() => /\.ya?ml$/i.test(editor.document?.relativePath || ''))
const xmlDocument = computed(() => /\.xml$/i.test(editor.document?.relativePath || ''))
const documentStatus = computed(() => editor.sourceError ? '来源暂不可用 · 私有草稿仍保留' : editor.dirty ? '尚未保存到文件' : '已保存到文件')
const tomlIssue = shallowRef<{ source: string; offset?: number }>()
const tomlDocument = computed(() => /\.toml$/i.test(editor.document?.relativePath || ''))
const codeDocument = computed(() => sourceFileInfo(editor.document?.relativePath || ''))
const sourceWorkspace = computed(() => tomlDocument.value || !!codeDocument.value)
const codeReading = computed(() => !!codeDocument.value && !editing.value && (!editor.recovery||readingSavedFile.value))
const codeEditing = computed(() => !!codeDocument.value && editing.value && !editor.recovery)
const codePosition = ref({ line: 1, column:1, selectedLines: 0 })
const codeToolMode=ref<CodeToolMode>('symbols'),codeToolPicker=ref(false)
const codeWrapModes = new Map<string,boolean>()
const codeWrap = ref(true), codeLineOpen = ref(false), codeLineTarget = ref(''), codeMenuExtras = ref(false), codeSheetDrag=ref(0)
const markdownDocument=computed(()=>/\.md$/i.test(editor.document?.relativePath||''))
const plainTextDocument=computed(()=>/\.txt$/i.test(editor.document?.relativePath||''))
const txtReading=computed(()=>plainTextDocument.value&&!editing.value&&(!editor.recovery||readingSavedFile.value))
const articleDocument=computed(()=>markdownDocument.value||plainTextDocument.value)
const enhancedMarkdownReading=computed(()=>markdownDocument.value&&!editing.value&&(!editor.recovery||readingSavedFile.value)&&typeof readerView.value?.formattedProgress==='number')
const compactDocument = computed(() => !sourceDocument.value || !!codeDocument.value)
const sourceDocument = computed(() => jsonDocument.value || yamlDocument.value || xmlDocument.value || tomlDocument.value || !!codeDocument.value)
const jsonTools = ref<InstanceType<typeof JsonTools>>(), jsonStructureOpen = ref(false)
let jsonMenuOrigin: {identity:string;kind:string;entry:string;parents:typeof sheetParents.value;position:TaskPosition}|undefined
const otherStructureFormat=computed(()=>yamlDocument.value?'yaml':xmlDocument.value?'xml':tomlDocument.value?'toml':'')
async function openJsonTask(task:'structure'|'diagnostic'|'format',format:'json'|'yaml'|'xml'|'toml'='json') {
  if(!(format==='json'?jsonDocument.value:format===otherStructureFormat.value)||editor.recovery||editor.saving||copying.value)return
  const origin={identity:documentKey.value,kind:sheetKind.value,entry:`${format}-${task}-entry`,parents:[...sheetParents.value],position:captureTaskPosition(sheetElement.value)}
  clearSheet();jsonMenuOrigin=origin
  await nextTick()
  if(origin.identity!==documentKey.value)return
  const tools=({json:jsonTools.value,yaml:yamlTools.value,xml:xmlTools.value,toml:tomlTools.value})[format]
  if(task==='format'&&format==='json')jsonTools.value?.openFormat()
  else if(task==='diagnostic')tools?.openDiagnostic()
  else await tools?.openStructure()
}
async function focusJsonSource(){jsonMenuOrigin=undefined;await nextTick();if(editing.value)editorView.value?.focus();else focusPageHeading()}
async function resumeJsonMenu(){
  const origin=jsonMenuOrigin;jsonMenuOrigin=undefined
  if(!origin||origin.identity!==documentKey.value)return
  sheetParents.value=origin.parents
  menu.value=true
  if(origin.kind==='code-more')codeMenuExtras.value=true
  await nextTick();requestAnimationFrame(()=>{if(origin.identity===documentKey.value)restoreTaskRecord({...origin.position,scroller:sheetElement.value||null},'data-focus-key',origin.entry)})
}
const yamlTools = ref<InstanceType<typeof YamlTools>>(), yamlStructureOpen = ref(false)
const xmlTools = ref<InstanceType<typeof XmlTools>>(), xmlStructureOpen = ref(false)
const tomlTools = ref<InstanceType<typeof TomlTools>>(), tomlStructureOpen = ref(false)
const focusedStructureOpen = computed(() => jsonStructureOpen.value || yamlStructureOpen.value || xmlStructureOpen.value || tomlStructureOpen.value)
const structureOpen = computed(() => jsonStructureOpen.value || yamlStructureOpen.value || xmlStructureOpen.value || tomlStructureOpen.value)
watch(documentKey, (value,previous) => { if(previous)codeWrapModes.set(previous,codeWrap.value);if(codeWrapModes.size>128){const oldest=codeWrapModes.keys().next().value;if(oldest)codeWrapModes.delete(oldest)};tomlIssue.value = undefined; codeWrap.value = codeWrapModes.get(value)??true; codeLineTarget.value = ''; codeMenuExtras.value = false; codeToolMode.value='symbols';codeToolPicker.value=false; jsonStructureOpen.value = false; yamlStructureOpen.value = false; xmlStructureOpen.value = false; tomlStructureOpen.value = false }, { flush: 'sync' })
async function documentBack() { if(draftChoosing.value && draftReview.value?.back())return; if(readingSavedFile.value&&editor.recovery&&!searchOpen.value){await returnToDraft();return}; if ((jsonStructureOpen.value && jsonTools.value?.back()) || (yamlStructureOpen.value && yamlTools.value?.back()) || (xmlStructureOpen.value && xmlTools.value?.back()) || (tomlStructureOpen.value && tomlTools.value?.back())) return; if (searchOpen.value) { closeDocumentSearch(); return }; if (jsonTools.value?.back() || yamlTools.value?.back() || xmlTools.value?.back() || tomlTools.value?.back()) return; if (readingEditOrigin.value && editing.value && !editor.recovery) { await showReading(); return }; await closeDocument() }
async function applyTomlValue(value: TomlValuePatch) {
  if (!tomlDocument.value || !editing.value || editor.content !== value.source || editor.saving || copying.value || !editorView.value) throw new Error('正文已有变化，请重新浏览结构。')
  editorView.value.replaceSourceRange(value.source, value.from, value.to, value.text)
  try {
    await session.flush()
    assistiveStatus.value = '已应用 TOML 修改，草稿已保护；尚未保存到文件，可以撤销。'
  } finally { await nextTick(); editorView.value?.focus() }
}
async function applyJsonValue(value: JsonValuePatch) {
  if (!jsonDocument.value || !editing.value || editor.content !== value.source || editor.saving || copying.value || !editorView.value) throw new Error('正文已有变化，请重新浏览结构。')
  editorView.value.replaceSourceRange(value.source, value.from, value.to, value.text)
  try {
    await session.flush()
    assistiveStatus.value = '已应用 JSON 修改，草稿已保护；尚未保存到文件，可以撤销。'
  } finally { await nextTick(); editorView.value?.focus() }
}
async function applyYamlValue(value: YamlValuePatch) {
  if (!yamlDocument.value || !editing.value || editor.content !== value.source || editor.saving || copying.value || !editorView.value) throw new Error('正文已有变化，请重新浏览结构。')
  editorView.value.replaceSourceRange(value.source, value.from, value.to, value.text)
  try {
    await session.flush()
    assistiveStatus.value = '已应用 YAML 修改，草稿已保护；尚未保存到文件，可以撤销。'
  } finally { await nextTick(); editorView.value?.focus() }
}
async function applyXmlAttribute(value: XmlAttributePatch) {
  if (!xmlDocument.value || !editing.value || editor.content !== value.source || editor.saving || copying.value || !editorView.value) throw new Error('正文已有变化，请重新浏览结构。')
  editorView.value.replaceSourceRange(value.source, value.from, value.to, value.text)
  try {
    await session.flush()
    assistiveStatus.value = '已应用 XML 属性修改，草稿已保护；尚未保存到文件，可以撤销。'
  } finally { await nextTick(); editorView.value?.focus() }
}
async function applyJsonFormat(value: { source: string; formatted: string }) {
  if (!jsonDocument.value || !editing.value || editor.content !== value.source || editor.saving || copying.value) throw new Error('正文已有变化，请重新准备排版。')
  editorView.value?.replaceDocument(value.source, value.formatted)
  try {
    await session.flush()
    assistiveStatus.value = '已应用排版，草稿已保护；尚未保存到文件，可以撤销。'
  } finally { await nextTick(); editorView.value?.focus() }
}
async function locateSource(value: { source: string; offset: number }) {
  if (!sourceDocument.value || editor.content !== value.source) return
  await beginEditing(); await nextTick(); editorView.value?.locateSource(value.source, value.offset)
}
function openCodeLine() {
  if (!codeDocument.value || editor.saving || copying.value || (editor.recovery&&!readingSavedFile.value)) return
  const position = captureTaskPosition(sheetElement.value)
  position.focus = sheetElement.value?.querySelector<HTMLElement>('[data-focus-key="code-line-entry"]') || position.focus
  sheetParents.value = [...sheetParents.value, { kind: sheetKind.value, position }]
  codeLineOpen.value = true
}
async function locateCodeLine(value: { source: string; offset: number }) {
  if (!codeDocument.value || editor.content !== value.source) throw new Error('正文已有变化，请重新定位。')
  if(editing.value){clearSheet();await nextTick();await locateSource(value)}
  else{await readerView.value?.locateSource(value.source,value.offset);clearSheet();await nextTick();documentBackButton.value?.focus({preventScroll:true})}
}
async function toggleCodeWrap() {
  codeWrap.value = !codeWrap.value
  menu.value = false; await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if(editing.value)editorView.value?.focus()
}
async function copySource(){const owner=documentKey.value,text=editor.content;await storage.copyText(text);if(owner===documentKey.value){clearSheet();notice.value='源码已复制'}}
async function selectCodeTool(mode:CodeToolMode){if(!codeEditing.value||editorComposing.value||editor.saving||copying.value)return;const owner=documentKey.value;codeToolMode.value=mode;clearSheet();await nextTick();if(owner===documentKey.value&&codeEditing.value&&!overlayOpen.value)editorView.value?.focus()}
function openCodeEditorMenu(){const position=captureTaskPosition(sheetElement.value);position.focus=sheetElement.value?.querySelector<HTMLElement>('[data-focus-key="code-tools-more"]')||position.focus;sheetParents.value=[...sheetParents.value,{kind:sheetKind.value,position}];menu.value=true}
function openCodeMore(){const position=captureTaskPosition(sheetElement.value);position.focus=sheetElement.value?.querySelector<HTMLElement>('[data-focus-key="code-more-entry"]')||position.focus;sheetParents.value=[...sheetParents.value,{kind:sheetKind.value,position}];codeMenuExtras.value=true}
const swipeDismissSheet=computed(()=>sheetKind.value==='root-actions'||sheetKind.value==='add')
const dismissSheetOffset=ref(0)
let dismissDragY=0,dismissDragged=false
function dismissDragStart(event:PointerEvent){if(sheetBusy.value||event.button!==0)return;dismissDragY=event.clientY;dismissDragged=false;dismissSheetOffset.value=0;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)}
function dismissDragMove(event:PointerEvent){if(!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))return;dismissSheetOffset.value=Math.max(0,event.clientY-dismissDragY);if(dismissSheetOffset.value>8)dismissDragged=true}
function dismissDragEnd(){const dismiss=dismissSheetOffset.value>=64;dismissSheetOffset.value=0;if(dismiss)backSheet()}
function dismissHandleClick(){if(!dismissDragged)backSheet();dismissDragged=false}
let codeDragY=0,codeDragged=false
function codeDragStart(event:PointerEvent){codeDragY=event.clientY;codeDragged=false;codeSheetDrag.value=0;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)}
function codeDragMove(event:PointerEvent){if(!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))return;codeSheetDrag.value=Math.max(0,event.clientY-codeDragY);if(codeSheetDrag.value>8)codeDragged=true}
function codeDragEnd(){const dismiss=codeSheetDrag.value>=64;codeSheetDrag.value=0;if(dismiss)closeSheet()}
function codeHandleClick(){if(!codeDragged)backSheet();codeDragged=false}
watch(menu,value=>{if(!value){if(codeToolPicker.value&&returningSheet?.kind!=='code-tools'){codeToolPicker.value=false;sheetParents.value=[]};codeMenuExtras.value=false;codeSheetDrag.value=0}})
function matchesName(name: string, term: string) { return name.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()) }
const filtered = computed(() => entries.value.filter(entry => matchesName(entry.name, query.value)))
const libraryRecent = computed(() => recent.value.filter(item => item.rootId === rootId.value))
const filteredRecent = computed(() => libraryRecent.value.filter(item => matchesName(filename(item.relativePath), query.value)))
const recentOwnsNotice = computed(() => tab.value === 'recent' && recentReadError.value && !filteredRecent.value.length && !editor.error && notice.value === '最近记录暂时无法读取，原记录仍保留。')
const visibleCount = ref(80), visibleEntries = computed(() => filtered.value.slice(0, visibleCount.value))
watch([rootId, folder, query], () => { visibleCount.value = 80 }, { flush: 'sync' })
function revealEntry(key?: string) {
  const index = filtered.value.findIndex(entry => identityKey({ rootId: rootId.value, relativePath: entry.relativePath }) === key)
  if (index >= 0) visibleCount.value = Math.max(visibleCount.value, Math.ceil((index + 1) / 80) * 80)
}
async function showMoreEntries() {
  const next = visibleEntries.value.length
  visibleCount.value += 80; await nextTick()
  const keys = new Set(filtered.value.slice(next, visibleCount.value).map(entry => identityKey({ rootId: rootId.value, relativePath: entry.relativePath })))
  const target = [...document.querySelectorAll<HTMLElement>('[data-focus-key]')].find(element => keys.has(element.dataset.focusKey || '') && canFocus(element))
  target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' })
}
const navigation = [{ id: 'library' as const, label: '资料', icon: FolderOpen }, { id: 'search' as const, label: '搜索', icon: Search }, { id: 'settings' as const, label: '设置', icon: SettingsIcon }]
const filename = (path: string) => path.split('/').pop() || path
const fileType = (path: string) => sourceFileInfo(path)?.label || (/\.json$/i.test(path) ? 'JSON' : /\.ya?ml$/i.test(path) ? 'YAML' : /\.xml$/i.test(path) ? 'XML' : /\.toml$/i.test(path) ? 'TOML' : /\.md$/i.test(path) ? 'Markdown' : '文本')
function libraryModifiedDate(value:number) {
  if(!value || !Number.isFinite(value))return ''
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return ''
  const pad=(n:number)=>String(n).padStart(2,'0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function libraryFileDetail(entry:Entry){return entry.directory?'文件夹':!textSupported(entry.name)&&!pdfSupported(entry.name)?'暂不支持':libraryModifiedDate(entry.modified)|| (pdfSupported(entry.name)?'PDF':fileType(entry.name))}
function libraryFileSize(value:number){return !Number.isFinite(value)||value<0?'未提供':value<1024?`${value} B`:value<1024*1024?`${(value/1024).toFixed(1)} KiB`:`${(value/1024/1024).toFixed(1)} MiB`}
function recentLibraryEntry(item:Identity):Entry{return entries.value.find(e=>e.relativePath===item.relativePath)||{name:filename(item.relativePath),relativePath:item.relativePath,directory:false,modified:0,size:-1}}
async function openLibraryFilter(){if(navigating.value)return;if(!libraryFilterVisible.value)libraryFilterOrigin={page:JSON.stringify(currentPage()),scroll:window.scrollY};libraryFilterOpen.value=true;await nextTick();window.scrollTo(0,0);libraryFilterInput.value?.focus({preventScroll:true})}
async function closeLibraryFilter(){if(navigating.value)return;const origin=libraryFilterOrigin;libraryFilterOrigin=null;query.value='';libraryFilterOpen.value=false;await nextTick();if(origin?.page===JSON.stringify(currentPage()))window.scrollTo(0,origin.scroll);libraryFilterButton.value?.focus({preventScroll:true})}
function showLibraryFile(entry:Entry){if(navigating.value||overlayOpen.value)return;selectedLibraryFile.value={rootId:rootId.value,libraryName:activeRoot.value?.name||'资料库',entry:{...entry}}}
function openLibraryFileInfo(){if(sheetBusy.value||!selectedLibraryFile.value)return;sheetParents.value=[...sheetParents.value,{kind:sheetKind.value,position:captureTaskPosition(sheetElement.value)}];libraryFileInfo.value=true}
async function openSelectedLibraryFile(){const selected=selectedLibraryFile.value;if(!selected||sheetBusy.value)return;if(selected.rootId!==rootId.value)throw Error('资料库已变化，请重新选择文件。');clearSheet();await select(selected.entry)}
async function toggleDocumentSearch() { if(codeDocument.value)clearSheet(); jsonTools.value?.closeStructure(false); yamlTools.value?.closeStructure(false); xmlTools.value?.closeStructure(false); tomlTools.value?.closeStructure(false); if (searchOpen.value) { closeDocumentSearch(); return } searchOpen.value = true; await nextTick(); documentSearchInput.value?.focus() }
function closeDocumentSearch(clear=false) {
  const wasOpen = searchOpen.value
  const keep=!clear&&readerView.value?.segmented;if(keep)void readerView.value?.flush();else{documentQuery.value='';matchState.value={count:0,current:0,truncated:false}};searchOpen.value=false
  if (wasOpen) void nextTick(() => document.querySelector<HTMLElement>(codeEditing.value ? '.code-tool-selector' : (!compactDocument.value || codeReading.value || (txtReading.value && readerView.value?.segmented)) ? '[aria-label="在文档内查找"]' : '[aria-label="文档操作"]')?.focus({ preventScroll: true }))
}
function nextMatch(direction: number) { if (editing.value) editorView.value?.navigate(direction); else readerView.value?.navigate(direction) }
async function run(action: () => unknown | Promise<unknown>) { try { await action() } catch (error) { notice.value = String(error).replace(/^Error: /, '') } }
// Keep an iframe out of inert while it is being disposed: older Android
// WebViews can otherwise retain an invisible accessibility subtree on return.
function blockClosing(event: Event) { if (closing.value || creatingNote.value || navigating.value) { event.preventDefault(); event.stopImmediatePropagation() } }
async function loadEntries() {
  loading.value = true; loadError.value = ''
  const root = rootId.value, path = folder.value, selected = `${root}\n${path}`
  try {
    if (!roots.value.length) roots.value = await storage.roots()
    const result = await storage.list(root, path)
    if (selected === `${rootId.value}\n${folder.value}`) { entries.value = result.entries; truncated.value = result.truncated }
  }
  catch (error) { if (selected === `${rootId.value}\n${folder.value}`) loadError.value = humanStorageError(error) }
  finally { if (selected === `${rootId.value}\n${folder.value}`) loading.value = false }
}
async function remember(identity: Identity) {
  const epoch = ++recentEpoch
  recentLoading.value = false
  recent.value = [{ rootId: identity.rootId, relativePath: identity.relativePath }, ...recent.value.filter(item => identityKey(item) !== identityKey(identity))].slice(0, 12)
  try { await storage.remember(identity); if (epoch === recentEpoch) recentReadError.value = false }
  catch { notice.value = '最近记录暂未保存，当前文档可继续使用。' }
}
async function readRecent() {
  const epoch = ++recentEpoch
  recentLoading.value = true
  try {
    const entries = await storage.recent()
    if (epoch !== recentEpoch) return
    recent.value = entries; recentReadError.value = false
    if (notice.value === '最近记录暂时无法读取，原记录仍保留。') notice.value = ''
  } catch { if (epoch === recentEpoch) { recentReadError.value = true; notice.value = '最近记录暂时无法读取，原记录仍保留。' } }
  finally { if (epoch === recentEpoch) recentLoading.value = false }
}
const appearanceError=ref<''|'read'|'save'>(''),appearanceBusy=ref(false)
let appearanceAlive=true,themeMedia:MediaQueryList|undefined
const appearance=createAppearanceSession(storage,state=>{
  if(!appearanceAlive)return
  themePreference.value=state.preference
  appearanceBusy.value=state.phase==='loading'||state.phase==='saving'
  if(state.phase==='read-error')appearanceError.value='read'
  else if(state.phase==='save-error')appearanceError.value='save'
  else if(state.phase==='ready')appearanceError.value=''
})
let systemAppearanceEpoch=0
function applyNativeAppearance(){if(!storage.preview)void storage.applyAppearance(dark.value,codeReading.value ? ((overlayOpen.value || focusedStructureOpen.value) ? 'article' : 'code') : (articleDocument.value || codeEditing.value)?'article':undefined).catch(()=>{/* OS chrome is independent of confirmed preference storage. */})}
async function refreshSystemAppearance(){const owner=++systemAppearanceEpoch;try{const value=await storage.systemAppearance();if(owner===systemAppearanceEpoch&&appearanceAlive){systemDark.value=value??themeMedia?.matches??false;applyNativeAppearance()}}catch{/* Keep the current appearance until a configuration event or resume can retry. */}}
function nativeImeChanged(event:Event){const visible=(event as CustomEvent<{visible:boolean}>).detail?.visible;if(typeof visible==='boolean')nativeImeVisible.value=visible}
function systemAppearanceChanged(event:Event){const value=(event as CustomEvent<{dark:boolean}>).detail?.dark;if(typeof value==='boolean'){systemAppearanceEpoch++;systemDark.value=value;applyNativeAppearance()}}
function themeChanged(event:MediaQueryListEvent){if(storage.preview)systemDark.value=event.matches;else void refreshSystemAppearance()}

function setThemePreference(preference:ThemePreference){void appearance.choose(preference)}
function rememberSettingsFocus(event: FocusEvent) {
  if (tab.value !== 'settings' || recoveryView.value) return
  const key = (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-focus-key]') : null)?.dataset.focusKey
  if (key) settingsPositions.set(settingsPage.value, { scroll: settingsPositions.get(settingsPage.value)?.scroll || 0, focusKey: key })
}
function rememberSettingsPosition() {
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-focus-key]')
  settingsPositions.set(settingsPage.value, { scroll: window.scrollY, focusKey: focused?.dataset.focusKey || settingsPositions.get(settingsPage.value)?.focusKey || '' })
}
async function restoreSettingsPosition(page: SettingsPage, key = settingsPositions.get(page)?.focusKey || '') {
  await nextTick(); if (tab.value !== 'settings' || settingsPage.value !== page) return; window.scrollTo(0, settingsPositions.get(page)?.scroll || 0)
  const target = [...document.querySelectorAll<HTMLElement>('[data-focus-key]')].find(element => element.dataset.focusKey === key)
  if (canFocus(target)) target.focus({ preventScroll: true }); else focusPageHeading()
}
async function navigateSettings(page: SettingsPage) {
  if (navigating.value || recoveryBusy.value || choosingRoot.value || disconnecting.value || overlayOpen.value) return
  await navigate(async () => { rememberSettingsPosition(); settingsPage.value = page; await nextTick() })
  await restoreSettingsPosition(page)
}
function openSettingsRecovery() { rememberSettingsPosition(); recoveryView.value = true }
function openSettingsTask(kind: string) {
  if (kind === 'text') { importInitialId.value = ''; importInitialError.value = ''; importPanel.value = true }
  else if (kind === 'pdf') { pdfImportInitialId.value = ''; pdfImportInitialError.value = ''; pdfImportPanel.value = true }
  else if (kind === 'image') { imageContext.value = null; imagePanel.value = true }
  else if (kind === 'pack-import') packImportPanel.value = true
  else if (kind === 'pack-export') { packSnapshot.value = null; packPanel.value = true }
}
function currentPage(): MobilePage { return { tab: tab.value, rootId: rootId.value, folder: folder.value } }
function rememberPage(fallbackKey = ''): MobileOrigin {
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-focus-key]')
  const focusedKey = focused?.dataset.focusKey
  const key = fallbackKey ? focusedKey === 'continue' ? focusedKey : fallbackKey : focusedKey || viewHistory.recall(currentPage()).view.focusKey
  if (tab.value === 'search') librarySearchView.value?.rememberPosition()
  const origin = viewHistory.remember(currentPage(), { query: query.value, visibleCount: visibleCount.value, scroll: window.scrollY, focusKey: key })
  return origin
}
function applyPage(origin: MobileOrigin) {
  const library = origin.page.tab === 'library' ? origin : viewHistory.peek(viewHistory.libraryPage(origin.page.rootId))
  rootId.value = origin.page.rootId; folder.value = library.page.folder; tab.value = origin.page.tab
  const view = origin.page.tab === 'recent' ? origin.view : library.view
  query.value = view.query; visibleCount.value = view.visibleCount; libraryFilterOpen.value = false
  if (origin.page.tab === 'library') viewHistory.remember(origin.page, origin.view)
  if (origin.page.tab === 'search') searchView.scroll = origin.view.scroll
}
async function restoreViewport(origin: MobileOrigin, focusKey = origin.view.focusKey) {
  await nextTick()
  if (editor.document || pdfIdentity.value || overlayOpen.value || mobileHelpOpen.value) return
  if (origin.page.tab === 'search') { librarySearchView.value?.restoreFocus(); return }
  window.scrollTo(0, origin.view.scroll)
  const target = [...document.querySelectorAll<HTMLElement>('[data-focus-key]')].find(element => element.dataset.focusKey === focusKey)
  if (canFocus(target)) {
    target.focus({ preventScroll: true })
    // A recent entry or an externally changed list can move while a document is open.
    const box = target.getBoundingClientRect()
    const bottom = window.innerHeight - (document.querySelector('.bottom-navigation')?.getBoundingClientRect().height || 0)
    if (box.bottom < 0 || box.top > bottom) target.scrollIntoView({ block: 'center' })
  } else focusPageHeading()
}
async function navigate(action: () => Promise<void>) {
  if (navigating.value) return
  navigating.value = true
  try { await action() } finally { navigating.value = false }
}
async function switchTab(next: MobileRoot) {
  if (next === tab.value || next === 'library' && isLibrary.value || recoveryBusy.value || editor.document || pdfIdentity.value || overlayOpen.value) return
  await navigate(async () => {
    rememberPage(); recoveryView.value = false
    const page = next === 'library' ? viewHistory.librarySurface(rootId.value) : { ...currentPage(), tab: next }
    const origin = viewHistory.recall(page)
    applyPage(origin)
    // Search owns its query, result batches and asynchronous position restoration.
    if (next !== 'search') await restoreViewport(origin)
  })
}
async function switchLibraryView(next: 'library' | 'recent') {
  if (!isLibrary.value || next === tab.value || navigating.value || overlayOpen.value) return
  await navigate(async () => {
    rememberPage()
    const page = next === 'library' ? viewHistory.libraryPage(rootId.value) : { ...currentPage(), tab: next }
    const origin = viewHistory.recall(page)
    applyPage(origin)
    if (next === 'library') await loadEntries()
    await restoreViewport(origin)
    if (!origin.view.focusKey) document.querySelector<HTMLElement>(`[data-library-view="${next}"]`)?.focus({ preventScroll: true })
  })
}
watch(sourcePositionFailure,()=>{notice.value='阅读位置未能确认保存，可稍后重试。'})
async function restoreSourceQuery(value:{query:string;selection:QuerySelection|null}){documentQuery.value=value.query;if(value.query)searchOpen.value=true;await nextTick();if(value.selection)documentSearchInput.value?.setSelectionRange(value.selection.start,value.selection.end,value.selection.direction)}
async function flushTextPosition(){if(await readerView.value?.flush()===false)notice.value='阅读位置未能确认保存，可稍后重试。'}
async function flushPdfPosition(){if(await pdfView.value?.flush()===false)notice.value='阅读位置未能保存，上次记录仍保留。'}
async function open(identity: Identity, reference?:MobilePdfReference, returnNote?:Identity) {
  await navigate(async () => {
    const previousLocation = returnLocation.value
    const destinationLocation = (editor.document || pdfIdentity.value) && returnLocation.value ? returnLocation.value : rememberPage(identityKey(identity))
    if (pdfIdentity.value && await pdfView.value?.protect() === false) throw new Error('PDF 输入尚未确认保存，请返回当前面板重试。')
    if (pdfSupported(identity.relativePath)) {
      await flushTextPosition(); await session.close()
      await flushPdfPosition()
      returnLocation.value = destinationLocation; pdfNoteLocation = reference ? previousLocation : null
      pdfReference.value = reference || null; pdfReturnNote.value = returnNote || null; pdfIdentity.value = { ...identity }; await remember(identity); return
    }
    await flushTextPosition()
    await session.open(identity)
    // A failed read must leave the original PDF task mounted. Dispose it only
    // after the new text document has actually been admitted.
    if (pdfIdentity.value) { await flushPdfPosition(); pdfIdentity.value = null; pdfReference.value = null; pdfReturnNote.value = null; pdfNoteLocation = null }
    returnLocation.value = destinationLocation; editing.value = false; await remember(identity)
    await nextTick(); if (!overlayOpen.value && editor.document) focusPageHeading()
  })
}
async function closePdf() {
  if (closing.value) return
  closing.value = true
  try {
    if (await pdfView.value?.protect() === false) throw new Error('PDF 输入尚未确认保存，请返回当前面板重试。')
    const note = pdfReturnNote.value
    await flushPdfPosition(); pdfIdentity.value = null; pdfReference.value = null; pdfReturnNote.value = null
    if (note) { returnLocation.value = pdfNoteLocation; pdfNoteLocation = null; await session.open(note); editing.value = false; await remember(note); await nextTick(); focusPageHeading(); return }
    if (returnLocation.value) applyPage(returnLocation.value)
    await loadEntries(); revealEntry(returnLocation.value?.view.focusKey)
    await restoreViewport(returnLocation.value || viewHistory.recall(currentPage()), returnLocation.value?.view.focusKey)
  } finally { closing.value = false }
}
async function openPdfReference(target:MobilePdfReference) {
  if(pdfReferenceBusy.value || !editor.document || editing.value || overlayOpen.value || closing.value || editor.saving) return
  const origin={rootId:editor.document.rootId,relativePath:editor.document.relativePath}, content=editor.content
  pdfReferenceBusy.value=true
  try {
    const source=await storage.readPdf(target)
    if(!editor.document || identityKey(editor.document)!==identityKey(origin) || editor.content!==content || editing.value || overlayOpen.value) return
    if(source.signature!==target.sourceSignature) throw new Error('原 PDF 内容已变化，未按旧链接定位；笔记摘录仍保留。')
    await open(target,target,origin)
  } catch(e) {throw new Error(`无法定位原文：${humanStorageError(e)}`)} finally {pdfReferenceBusy.value=false}
}
async function choosePdf() {
  if (pdfBusy.value) return
  if (storage.preview) { pdfFile.value?.click(); return }
  pdfBusy.value = true
  try { const identity = await storage.importPdf(); if (identity) await open(identity) } finally { pdfBusy.value = false }
}
async function pickedPdf(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''
  if (!file || pdfBusy.value) return
  pdfBusy.value = true
  await run(async () => { try { const identity = await storage.importPdf(file); if (identity) await open(identity) } finally { pdfBusy.value = false } })
}
async function openSearchHit(hit: SearchHit, term: string) {
  if (!await searchIndex.verifyAccess(storage) || rootId.value !== hit.rootId) return
  await open(hit); await nextTick()
  if (!editor.document || identityKey(editor.document) !== identityKey(hit)) return
  const changed = hit.signature !== null && editor.document.signature !== hit.signature
  if (changed) searchIndex.markStale()
  searchContext.value = { contentMatch: hit.contentMatch, changed }
  if (hit.contentMatch) { documentQuery.value = term; searchOpen.value = true }
}
function invalidateSearch(id: string) { if (searchStatus.value.rootId === id) searchIndex.reset(id) }
async function restoreDraft() {
  if (!editor.recovery || !editor.document) return
  await flushTextPosition()
  const destination = documentKey.value
  editing.value = true
  readingSavedFile.value = false
  session.restore()
  await nextTick()
  if (documentKey.value === destination && editing.value && !editor.recovery && !overlayOpen.value && !mobileHelpOpen.value && !navigating.value && !closing.value) editorView.value?.focus()
}
async function readOriginalFile(){
  readingSavedFile.value=true
  await nextTick()
  if (canFocus(readerHeading.value)) readerHeading.value.focus({preventScroll:true})
}
async function returnToDraft(){await flushTextPosition();readingSavedFile.value=false;await draftReview.value?.resume()}
async function beginEditing() {
  if (editor.recovery) { await returnToDraft(); return }
  await flushTextPosition()
  if ((articleDocument.value || codeDocument.value) && !editing.value) readingEditOrigin.value = true
  editing.value = true
  await nextTick(); if (!structureOpen.value) editorView.value?.focus()
}
async function showReading() { jsonTools.value?.closeStructure(false); yamlTools.value?.closeStructure(false); xmlTools.value?.closeStructure(false); tomlTools.value?.closeStructure(false); editorView.value?.blur(); try { await session.flush() } catch (error) { editorView.value?.focus(); throw error }; if(codeDocument.value)clearSheet();editing.value = false; readingEditOrigin.value = false; await nextTick(); if (!overlayOpen.value) focusPageHeading() }
async function formatFromMenu(kind: string) {
  const target = editorView.value
  menu.value = false; await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (editorView.value === target) target?.format(kind)
}
watch(documentKey, () => { readingEditOrigin.value = false; editorComposing.value = false; clearTimeout(announcementTimer); assistiveStatus.value = ''; editorMounted.value = editing.value; editHistory.value = { undo: false, redo: false }; readingSavedFile.value = false; closeDocumentSearch(true); searchContext.value = null; textOnlyCopyAvailable.value = false }, { flush: 'sync' })
watch(() => editor.draftStatus, value => {
  clearTimeout(announcementTimer)
  // The visual progress still updates immediately. Announce settled protection,
  // rather than interrupting composition with progress on every keystroke.
  if (value === '草稿已保护') announcementTimer = setTimeout(() => { assistiveStatus.value = '未保存草稿已保护，可稍后继续。' }, 600)
})
watch(() => editor.saving, saving => {
  if (saving) { clearTimeout(announcementTimer); assistiveStatus.value = '正在保存…' }
  else if (editor.error) assistiveStatus.value = ''
  else if (!editor.error && editor.draftStatus === '已保存到文件') assistiveStatus.value = '已保存到文件'
})
let screenFocusEpoch = 0
watch([tab, recoveryView], async ([current, recovery], [, wasRecovery]) => {
  const epoch = ++screenFocusEpoch
  await nextTick()
  if (epoch !== screenFocusEpoch || editor.document || overlayOpen.value || closing.value || navigating.value) return
  if (current === 'settings' && !recovery && wasRecovery) {
    await restoreSettingsPosition('home', 'recovery')
  } else if (current !== 'search') { window.scrollTo(0, 0); focusPageHeading() }
})
watch(rootId, id => { searchView.scroll = 0; searchView.focusPath = ''; searchIndex.reset(id) }, { flush: 'sync' })
async function closeDocument() {
  if (closing.value || editor.saving) return
  const hadReader = !!readerView.value
  let closed = false
  closing.value = true
  try {
    // Dispose the sandboxed reader from the host, retaining the existing WebView workaround.
    documentBackButton.value?.focus({ preventScroll: true })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await flushTextPosition(); await session.close(); closed = true
    if (notice.value === failedCloseNotice) notice.value = ''
    failedCloseNotice = ''
    editing.value = false; menu.value = false
    if (returnLocation.value) applyPage(returnLocation.value)
    await loadEntries(); revealEntry(returnLocation.value?.view.focusKey)
  } catch (error) {
    failedCloseNotice = String(error).replace(/^Error: /, '')
    throw error
  } finally {
    try {
      if (closed) {
        if (hadReader && tab.value !== 'search') workspaceEpoch.value++
        await restoreViewport(returnLocation.value || viewHistory.recall(currentPage()), returnLocation.value?.view.focusKey)
      } else { await nextTick(); editorView.value?.focus() }
    } finally { closing.value = false }
  }
}
async function save() {
  if (needsLocalCopy.value) { await saveCopy(); return }
  const owner = documentKey.value, returnToEditor = (articleDocument.value || !!codeDocument.value) && editing.value
  await session.save()
  const savedDocument = editor.document
  if (savedDocument) { await remember(savedDocument); invalidateSearch(savedDocument.rootId) }
  await nextTick()
  if (returnToEditor && documentKey.value === owner && editing.value && !overlayOpen.value && !closing.value && !navigating.value) editorView.value?.focus()
}
async function select(entry: Entry) {
  if (!entry.directory) { await open({ rootId: rootId.value, relativePath: entry.relativePath }); return }
  await navigate(async () => {
    rememberPage(identityKey({ rootId: rootId.value, relativePath: entry.relativePath }))
    const origin = viewHistory.recall({ tab: 'library', rootId: rootId.value, folder: entry.relativePath })
    applyPage(origin); await loadEntries(); await restoreViewport(origin)
  })
}
async function parentFolder() {
  if (!folder.value) return
  await navigate(async () => {
    const child = identityKey({ rootId: rootId.value, relativePath: folder.value })
    rememberPage()
    const origin = viewHistory.recall({ tab: 'library', rootId: rootId.value, folder: folder.value.split('/').slice(0, -1).join('/') })
    applyPage(origin); await loadEntries(); revealEntry(child); await restoreViewport(origin, child)
  })
}
async function switchRoot(root: Library) {
  if (!root.available) { await chooseRoot(); return }
  await navigate(async () => {
    afterSheetPage = null
    rememberPage()
    const library = viewHistory.libraryPage(root.id)
    const origin = viewHistory.recall({ ...library, tab: tab.value })
    applyPage(origin); await loadEntries()
    if (!popSheetParent()) rootPicker.value = false
    await restoreViewport(origin)
  })
}
async function chooseRoot() {
  if (choosingRoot.value) return
  const pickerList = sheetKind.value === 'root' ? sheetElement.value?.querySelector<HTMLElement>('.root-picker-task .settings-library-list') : null
  const position = captureTaskPosition(pickerList || undefined)
  let selected = false
  choosingRoot.value = true
  try { const root = await storage.choose(); if (root) { roots.value = await storage.roots(); await switchRoot(root); selected = true } }
  finally {
    choosingRoot.value = false; await nextTick()
    if (!selected) restoreTaskPosition(position)
    else if (tab.value === 'settings' && settingsPage.value === 'storage' && !overlayOpen.value) document.querySelector<HTMLElement>('[data-focus-key="library-choice-'+rootId.value+'"]')?.focus({preventScroll:true})
  }
}
async function disconnectRoot() {
  if (!pendingDisconnect.value || disconnecting.value) return
  const id = pendingDisconnect.value.id
  const wasCurrent = rootId.value === id
  disconnecting.value = true
  try {
    await storage.disconnect(id); viewHistory.forgetLibrary(id); if (searchStatus.value.rootId === id) searchIndex.reset(id); roots.value = await storage.roots()
    if (wasCurrent) {
      const library = viewHistory.libraryPage('local')
      const origin = viewHistory.recall({ ...library, tab: tab.value })
      applyPage(origin); await loadEntries(); afterSheetPage = tab.value === 'settings' ? null : origin
    }
    // A completed confirmation returns past the obsolete action menu.
    if (sheetParents.value[sheetParents.value.length - 1]?.kind === 'root-actions') sheetParents.value = sheetParents.value.slice(0, -1)
    rootActions.value = null
    const parent = sheetParents.value[sheetParents.value.length - 1]
    if (parent?.kind === 'root') parent.position = {
      ...parent.position,
      top: wasCurrent ? 0 : parent.position.top,
      focus: sheetElement.value?.querySelector<HTMLElement>('[data-focus-key="library-choice-'+rootId.value+'"]') || null
    }
    if (!popSheetParent()) pendingDisconnect.value = null
    notice.value = ''
  } finally { disconnecting.value = false }
  await nextTick()
  const selected = [...document.querySelectorAll<HTMLElement>('[data-focus-key="library-choice-'+rootId.value+'"]')].find(canFocus)
  selected?.focus({preventScroll:true})
  if (wasCurrent && !rootPicker.value) selected?.scrollIntoView({block:'center'})
}
async function admitImported(document: Identity, targetFolder = '') {
  if (navigating.value || closing.value) throw new Error('上一项操作仍在完成，请稍后重试打开。')
  const origin = rememberPage(), previousEntries = entries.value, previousError = loadError.value, previousTruncated = truncated.value
  const source = documentKey.value, sourceError = editor.error
  try {
    rootId.value = 'local'; folder.value = targetFolder; query.value = ''; tab.value = 'library'
    invalidateSearch('local'); await loadEntries(); await open(document)
  } catch (error) {
    applyPage(origin); entries.value = previousEntries; loadError.value = previousError; truncated.value = previousTruncated
    if (documentKey.value === source) editor.error = sourceError
    throw error
  }
  clearSheet()
  incomingParent = null
  await nextTick(); focusPageHeading()
}
async function openImported(document: Identity) {
  await admitImported(document)
}
async function openImportedPdf(document: Identity) { await admitImported(document) }
async function openImportedPack(document: Identity) {
  await admitImported(document, document.relativePath.split('/').slice(0, -1).join('/'))
  notice.value = ''
}
async function openRecovered(document: Identity) {
  if (navigating.value || closing.value) throw new Error('上一项操作仍在完成，请稍后重试打开。')
  const source = documentKey.value, sourceError = editor.error
  invalidateSearch(document.rootId)
  try { await open(document) }
  catch (failure) { if (documentKey.value === source) editor.error = sourceError; throw failure }
  // Only explicit, successful admission replaces the parent task. Inspection
  // and failed admission leave its editor and export component mounted.
  recoveryPanel.value = false; recoveryParent = null; recoveryView.value = false
  clearSheet()
  notice.value = ''
  await nextTick(); focusPageHeading()
}
async function openTextExport() {
  if (!editor.document || editor.saving || copying.value || (editor.recovery && !readingSavedFile.value)) return
  editorView.value?.blur()
  await session.flush()
  exportSnapshot.value = captureTextExport({ rootId: editor.document.rootId, relativePath: editor.document.relativePath, content: editor.content, expectedSignature: editor.document.signature, revision: editor.revision, dirty: editor.dirty })
  menu.value = false
}
async function openPackExport() {
  if (!editor.document || editor.saving || copying.value || (editor.recovery && !readingSavedFile.value)) return
  editorView.value?.blur(); await session.flush()
  packSnapshot.value = captureTextExport({ rootId: editor.document.rootId, relativePath: editor.document.relativePath, content: editor.content, expectedSignature: editor.document.signature, revision: editor.revision, dirty: editor.dirty })
  menu.value = false; packPanel.value = true
}
async function openSaveRecovery() {
  if (recoveryOpening.value || recoveryPanel.value || copying.value || editor.saving || closing.value || exportBusy.value || navigating.value) return
  recoveryOpening.value = true
  try {
    recoveryParent = { position: captureTaskPosition(), windowTop: window.scrollY }
    await session.flush()
    recoveryPanel.value = true
    await nextTick(); recoveryTask.value?.focus({ preventScroll: true })
  } finally { recoveryOpening.value = false }
}
async function closeRecovery() {
  if (recoveryBusy.value) return
  const parent = recoveryParent; recoveryParent = null; recoveryPanel.value = false
  await nextTick()
  if (parent) { window.scrollTo(0, parent.windowTop); restoreTaskPosition(parent.position) }
}
function recoveryKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); taskRecoveryCenter.value?.back(); return }
  if (event.key !== 'Tab') return
  const controls = focusableControls(recoveryTask.value), first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === recoveryTask.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === recoveryTask.value)) { event.preventDefault(); first?.focus() }
}
function noteNameEdited(){noteName.value=noteNameInput.value?.value??noteName.value;noteCreationError.value=''}
async function submitNoteName(){if(creatingNote.value)return;noteName.value=noteNameInput.value?.value??noteName.value;noteCreationError.value='';try{await createNote()}catch(cause){noteCreationError.value=humanStorageError(cause);await nextTick();noteNameError.value?.focus({preventScroll:true});noteNameError.value?.scrollIntoView({block:'nearest'})}}
function cancelNoteName(){if(creatingNote.value)return;backSheet();noteName.value='';noteNameSelection=null;noteCreationError.value=''}
async function createNote() {
  if (creatingNote.value) return
  creatingNote.value = true
  notice.value = ''
  try {
    if (!activeRoot.value?.writable) throw new Error('这个资料库目前只读，请选择手机资料库来记录。')
    let name = noteName.value.trim()
    if (!name) throw new Error('先给笔记起一个名称。')
    if (!textSupported(name)) name += '.md'
    if (/[\/:*?"<>|]/.test(name)) throw new Error('名称中请不要使用路径或特殊符号')
    const relativePath = [creationFolder.value, name].filter(Boolean).join('/')
    validatePath(relativePath)
    if (entries.value.some(entry => entry.relativePath === relativePath)) throw new Error('已经有这个名字了，换一个名称即可。')
    const identity = { rootId: rootId.value, relativePath }
    const creationOrigin = rememberPage(identityKey(identity))
    // Creating a new document changes the task: returning must reveal that target.
    if (!matchesName(name, creationOrigin.view.query)) creationOrigin.view.query = ''
    // Set the destination mode before the async session activates its document.
    // Otherwise an inert reader iframe briefly mounts beneath the creation sheet.
    const previousEditing = editing.value
    editing.value = true
    try { await session.create(identity, async () => {
      // Let the modal release its inert workspace before mounting an editor.
      newNote.value = false
      sheetParents.value = []
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }) }
    catch (error) { editing.value = previousEditing; throw error }
    returnLocation.value = creationOrigin
    if (/\.json$/i.test(name)) { session.update('{}\n'); await session.flush() }
    if (/\.xml$/i.test(name)) { session.update('<root />\n'); await session.flush() }
    await remember(identity)
    newNote.value = false; noteName.value = ''
    await nextTick(); editorView.value?.focus()
  } finally { creatingNote.value = false }
}
async function openImages() {
  const document = editor.document
  if (!document || !/\.md$/i.test(document.relativePath) || editor.recovery || editor.saving || copying.value) throw new Error('请先选择恢复草稿或已保存的文件，再管理图片。')
  const selection = editing.value ? editorView.value?.captureSelection() : null
  imageContext.value = { identity: { rootId: document.rootId, relativePath: document.relativePath }, revision: editor.revision, content: editor.content, selection: selection || { from: editor.content.length, to: editor.content.length }, atEnd: !selection }
  menu.value = false; imagePanel.value = true
}
async function placeImage(image: ImageImport, reference: ImageReference | null, alt: string) {
  const context = imageContext.value
  if (!context || !editor.document || identityKey(editor.document) !== identityKey(context.identity) || editor.revision !== context.revision || editor.content !== context.content) throw new Error('正文已变化，图片仍在导入记录中，请关闭后重新选择插入位置。')
  if (image.status !== 'ready' || image.rootId !== context.identity.rootId || image.notePath !== context.identity.relativePath || !image.imagePath) throw new Error('图片副本尚未在当前笔记位置确认，正文未改动。')
  const source = relativeImageSource(context.identity.relativePath, image.imagePath)
  const from = reference?.from ?? context.selection.from, to = reference?.to ?? context.selection.to
  let text: string
  if (reference) { const updated = replaceImageReference(context.content, reference, source); text = updated.slice(from, updated.length - (context.content.length - to)) }
  else text = imageInsertionText(context.content, from, to, alt, source)
  if (new TextEncoder().encode(context.content.slice(0, from) + text + context.content.slice(to)).length > 4 * 1024 * 1024) throw new Error('加入引用后正文超过 4 MiB，图片已保留在导入记录中，请精简正文后重试。')
  editing.value = true; await nextTick()
  if (!editorView.value) throw new Error('编辑器尚未就绪，图片仍在导入记录中，请重试。')
  editorView.value.replaceRange(from, to, text, context.content)
  imagePanel.value = false; imageContext.value = null; await nextTick(); editorView.value?.focus()
  try { await session.flush() } catch (failure) { notice.value = `图片引用已加入当前文稿，但草稿保护未确认：${humanStorageError(failure)}` }
}
async function saveCopy(textOnly = false) {
  const document = editor.document
  if (!document || copying.value || editor.saving) return
  copying.value = true
  try {
    await session.flush()
    if (editor.document !== document) return
    const owner = identityKey(document), revision = editor.revision, content = editor.content
    const path = localCopyName(document.relativePath)
    const target = { rootId: 'local', relativePath: path }
    const copiedContent = textOnly ? content : await prepareImageCopy(storage, document, target, content)
    const copy = await storage.write(target, copiedContent, null)
    invalidateSearch('local')
    if (editor.document && identityKey(editor.document) === owner && editor.revision === revision) {
      await session.open(copy); notice.value = textOnly ? '文字副本已存入手机资料库；图片未搬迁，引用需要重新核对。原草稿仍保留。' : '副本已存入手机资料库，原文和原草稿仍保留。'
    } else notice.value = '副本已保存，后续输入仍留在当前草稿。'
    await remember(copy); menu.value = false; textOnlyCopyAvailable.value = false
  } catch (failure) {
    menu.value = false
    if (!textOnly && /\.md$/i.test(document.relativePath)) { textOnlyCopyAvailable.value = true; notice.value = `${humanStorageError(failure)}；原草稿仍保留，可重试或仅存文字副本。` }
    else throw failure
  } finally { copying.value = false }
}
function nativeBack() {
  if (dismissMobileHelp()) return true
  if(backSourceDialog())return true
  if (navigating.value || closing.value || choosingRoot.value || disconnecting.value || recoveryOpening.value || incomingOpening.value) return true
  if (recoveryPanel.value) { taskRecoveryCenter.value?.back(); return true }
  if (pdfIdentity.value && !overlayOpen.value) { if (pdfView.value?.back()) return true; void run(closePdf); return true }
  if (creatingNote.value) return true
  if (overlayOpen.value) { backSheet(); return true }
  if ((jsonStructureOpen.value && jsonTools.value?.back()) || (yamlStructureOpen.value && yamlTools.value?.back()) || (xmlStructureOpen.value && xmlTools.value?.back()) || (tomlStructureOpen.value && tomlTools.value?.back())) return true
  if (searchOpen.value) { closeDocumentSearch(); return true }
  if (jsonTools.value?.back() || yamlTools.value?.back() || xmlTools.value?.back() || tomlTools.value?.back()) return true
  if (editor.document) { void run(documentBack); return true }
  if (recoveryView.value && tab.value === 'settings') { recoveryCenter.value?.back(); return true }
  if (tab.value === 'settings' && settingsPage.value !== 'home') { void run(() => navigateSettings('home')); return true }
  if (isLibrary.value && libraryFilterVisible.value) { void closeLibraryFilter(); return true }
  if (tab.value === 'library' && folder.value) { void run(parentFolder); return true }
  if (tab.value === 'recent') { void run(() => switchLibraryView('library')); return true }
  if (tab.value !== 'library') { void run(() => switchTab('library')); return true }
  return false
}
function openAddTask(kind:'note'|'file-import'|'pack-import'|'root'){if(sheetBusy.value)return;const position=captureTaskPosition(sheetElement.value);position.focus=sheetElement.value?.querySelector<HTMLElement>('[data-focus-key="add-'+kind+'"]')||position.focus;sheetParents.value=[...sheetParents.value,{kind:'add',position}];addMenu.value=false;if(kind==='note')newNote.value=true;else if(kind==='file-import'){importInitialId.value='';importInitialError.value='';importPanel.value=true}else if(kind==='pack-import')packImportPanel.value=true;else rootPicker.value=true}
function openImportFolder() {
  sheetParents.value = [...sheetParents.value, { kind: sheetKind.value, position: captureTaskPosition() }]
  rootPicker.value = true
}
function openRootActions(root: Library) {
  if (sheetBusy.value || !root.external || !root.available) return
  if (sheetKind.value) sheetParents.value = [...sheetParents.value, { kind: sheetKind.value, position: captureTaskPosition() }]
  rootActions.value = root
}
function confirmDisconnect(root: Library) {
  if (sheetKind.value) sheetParents.value = [...sheetParents.value, { kind: sheetKind.value, position: captureTaskPosition() }]
  pendingDisconnect.value = root
}
function popSheetParent() {
  const parent = sheetParents.value[sheetParents.value.length - 1]
  if (!parent) return false
  returningSheet = parent
  sheetParents.value = sheetParents.value.slice(0, -1)
  if (sheetKind.value === 'disconnect') pendingDisconnect.value = null
  else if (sheetKind.value === 'root-actions') rootActions.value = null
  else if (sheetKind.value === 'root') rootPicker.value = false
  else if (sheetKind.value === 'code-line') codeLineOpen.value = false
  else if (sheetKind.value === 'code-more') codeMenuExtras.value = false
  else if (sheetKind.value === 'menu' && parent.kind === 'code-tools') menu.value = false
  else if (sheetKind.value === 'library-file-info') libraryFileInfo.value = false
  else if (sheetKind.value === 'note') newNote.value = false
  else if (sheetKind.value === 'file-import') importPanel.value = false
  else if (sheetKind.value === 'pack-import') packImportPanel.value = false
  if(parent.kind==='add')addMenu.value=true
  return true
}
function backSheet() {
  if (sheetBusy.value) return
  if (incomingPanel.value && incomingCenter.value?.back()) return
  if (sheetKind.value === 'images' && imageTaskView.value?.back()) return
  if (packPanel.value && packExportView.value?.back()) return
  if (exportSnapshot.value && textExportView.value?.back()) return
  if (sheetKind.value === 'file-import' && fileImportView.value?.back()) return
  if (sheetKind.value === 'pdf-import' && pdfImportView.value?.back()) return
  if (sheetKind.value === 'pack-import' && packImportView.value?.back()) return
  if (popSheetParent()) return
  closeSheet()
}
function dismissSheet() { if (sheetBusy.value) return; if (!popSheetParent()) closeSheet() }
function closeSheet() { if (!sheetBusy.value) clearSheet() }
function clearSheet() { rootActions.value = null; codeToolPicker.value = false; selectedLibraryFile.value = null; libraryFileInfo.value = false; codeLineOpen.value = false; searchScope.value = false; incomingPanel.value = false; sheetParents.value = []; returningSheet = null; pdfImportPanel.value=false;pdfImportInitialId.value='';pdfImportInitialError.value='';packImportPanel.value = false; packImportInitialId.value = ''; packImportInitialError.value = ''; packPanel.value = false; packSnapshot.value = null; importPanel.value = false; exportSnapshot.value = null; rootPicker.value = false; newNote.value = false; addMenu.value = false; menu.value = false; pendingDisconnect.value = null; imagePanel.value = false; imageContext.value = null }
function sheetKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); backSheet(); return }
  if (event.key !== 'Tab') return
  const controls = focusableControls(sheetElement.value)
  const first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetElement.value)) {
    event.preventDefault(); last?.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheetElement.value)) {
    event.preventDefault(); first?.focus()
  }
}
let sheetFocusEpoch = 0
watch(sheetKind, async (kind, previous) => {
  dismissSheetOffset.value = 0
  const epoch = ++sheetFocusEpoch
  const opened = !!kind
  if (opened && !previous) previousFocus = (kind === 'code-tools' ? document.querySelector<HTMLElement>('.code-tool-selector') : document.activeElement) as HTMLElement | null
  await nextTick()
  if (epoch !== sheetFocusEpoch || mobileHelpOpen.value) return
  // The retained export task owns focus when moving between its child pages.
  if (opened && packPanel.value && ['pack-export', 'pack-history'].includes(previous) && ['pack-export', 'pack-history'].includes(kind)) return
  if (opened && returningSheet?.kind === kind) {
    const parent = returningSheet; returningSheet = null
    const key=parent.position.focus?.dataset.focusKey
    if (key?.startsWith('library-')) restoreTaskRecord(parent.position, 'data-focus-key', key)
    else if (key === 'code-line-entry' || key === 'code-more-entry' || key === 'code-tools-more' || key === 'library-file-info-entry' || key?.startsWith('add-')) restoreTaskRecord(parent.position, 'data-focus-key', key)
    else restoreTaskPosition(parent.position)
    return
  }
  if (opened) {
    (newNote.value || kind === 'code-line' ? sheetElement.value?.querySelector<HTMLInputElement>('input') : sheetElement.value)?.focus({ preventScroll: true })
    if(newNote.value && noteNameSelection && noteNameInput.value)noteNameInput.value.setSelectionRange(noteNameSelection.start,noteNameSelection.end,noteNameSelection.direction)
  }
  else {
    if (incomingParent) { const parent = incomingParent; incomingParent = null; window.scrollTo(0, parent.windowTop); restoreTaskPosition(parent.position); if (canFocus(parent.position.focus)) return }
    const destination = afterSheetPage; afterSheetPage = null
    if (destination && destination.page.rootId === rootId.value && destination.page.tab === tab.value && (tab.value !== 'library' || destination.page.folder === folder.value)) {
      await restoreViewport(destination)
      return
    }
    // A completed task may already have focused its editor. Do not steal that
    // focus to a removed menu button or to an invisible compact action.
    const current = document.activeElement as HTMLElement | null
    if (current !== document.body && canFocus(current) && current?.closest('.mobile-workspace')) return
    if (canFocus(previousFocus)) previousFocus.focus({ preventScroll: true })
    else if (editor.document && editing.value) editorView.value?.focus()
    else focusPageHeading()
  }
})
function pause() { searchIndex.markStale();void appearance.flush();void run(async () => { await flushTextPosition();if(!await flushSourceReaders())notice.value='阅读位置未能确认保存，可稍后重试。';await session.flush() }) }
function resume() { void refreshSystemAppearance();void refreshIncoming(); void run(async () => { roots.value = await storage.roots(); await searchIndex.verifyAccess(storage) }) }
function protect() { if (document.visibilityState === 'hidden') { searchIndex.markStale(); void run(() => session.flush()) } else resume() }
function beforeUnload(event: BeforeUnloadEvent) { if (editor.dirty) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => {
  readRecent()
  themeMedia = window.matchMedia('(prefers-color-scheme: dark)'); systemDark.value = themeMedia.matches; void refreshSystemAppearance();void appearance.load();themeMedia.addEventListener('change', themeChanged);window.addEventListener('longedit-mobile-system-appearance',systemAppearanceChanged)
  document.addEventListener('visibilitychange', protect); window.addEventListener('beforeunload', beforeUnload)
  window.__longeditMobileBack = nativeBack; window.addEventListener('longedit-mobile-ime',nativeImeChanged); window.addEventListener('longedit-mobile-pause', pause); window.addEventListener('longedit-mobile-resume', resume); window.addEventListener('longedit-mobile-incoming', refreshIncoming); void refreshIncoming()
  void loadEntries()
})
watch([dark,articleDocument,codeReading,codeEditing,overlayOpen,focusedStructureOpen], ([value]) => { document.documentElement.style.colorScheme = value ? 'dark' : 'light';applyNativeAppearance() },{immediate:true})
onBeforeUnmount(() => { appearanceAlive=false;systemAppearanceEpoch++;window.removeEventListener('longedit-mobile-ime',nativeImeChanged);window.removeEventListener('longedit-mobile-system-appearance',systemAppearanceChanged);themeMedia?.removeEventListener('change', themeChanged); dismissMobileHelp(); clearTimeout(announcementTimer); screenFocusEpoch++; sheetFocusEpoch++; searchIndex.reset(rootId.value); document.removeEventListener('visibilitychange', protect); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('longedit-mobile-pause', pause); window.removeEventListener('longedit-mobile-resume', resume); window.removeEventListener('longedit-mobile-incoming', refreshIncoming); delete window.__longeditMobileBack })
</script>
