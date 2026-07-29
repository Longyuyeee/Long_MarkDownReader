<template>
  <div class="workbook-view" tabindex="-1">
    <header class="workbook-toolbar">
      <div class="workbook-title">
        <button class="icon-button" title="返回知识库" @click="router.push('/library')"><n-icon :component="ArrowLeftIcon" /></button>
        <div><strong>{{ fileName }}</strong><span v-if="workbook">XLSX 工作簿 · {{ workbook.sheets.length }} 个 Sheet · {{ formatBytes(workbook.size) }}</span></div>
      </div>
      <div v-if="workbook" class="workbook-actions">
        <button class="icon-button" title="撤销" :disabled="!undoStack.length || saving" @click="undo"><n-icon :component="UndoIcon" /></button>
        <button class="icon-button" title="重做" :disabled="!redoStack.length || saving" @click="redo"><n-icon :component="RedoIcon" /></button>
        <button class="icon-button" title="复制区域" :disabled="!selectedCell || saving" @click="copySelection"><n-icon :component="CopyIcon" /></button>
        <button class="icon-button" title="粘贴区域" :disabled="!selectedCell || saving || sheetProtected" @click="pasteSelection"><n-icon :component="PasteIcon" /></button>
        <button :title="sheetInfo?.arrayFormulas.length ? '当前工作表包含只读数组公式，暂不开放本地重算' : '重算当前已加载公式'" :disabled="calculating || saving || !activeSheet || Boolean(sheetInfo?.arrayFormulas.length)" @click="recalculateFormulas"><n-icon :component="CalculatorIcon" />{{ calculating ? '重算中…' : '重算' }}</button>
        <button :class="{ active: showFormulas }" :disabled="saving" @click="showFormulas = !showFormulas"><n-icon :component="FunctionIcon" />{{ showFormulas ? '结果' : '公式' }}</button>
        <button class="icon-button" title="重新读取" :disabled="saving" @click="refreshWorkbook"><n-icon :component="RefreshIcon" /></button>
        <button :disabled="importing || saving || !activeSheet" @click="convertSheet"><n-icon :component="TableIcon" />{{ importing ? '转换中…' : '转为 Table' }}</button>
        <button class="primary" :disabled="!dirtyCount || saving" @click="saveWorkbook"><n-icon :component="SaveIcon" />{{ saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}` }}</button>
      </div>
    </header>

    <nav v-if="workbook" class="sheet-tabs" aria-label="工作表">
      <button v-for="sheet in workbook.sheets" :key="sheet" :class="{ active: sheet === activeSheet }" @click="selectSheet(sheet)"><n-icon :component="SheetIcon" />{{ sheet }}</button>
      <small v-if="sheetInfo">{{ sheetInfo.totalRows.toLocaleString() }} 行 × {{ sheetInfo.totalColumns.toLocaleString() }} 列</small>
    </nav>

    <div
      v-if="workbook && (workbook.linkedData.pivotTables.length || workbook.linkedData.slicers.length || workbook.linkedData.externalLinks.length || workbook.linkedData.connections.length || workbook.linkedData.externalRelationshipCount)"
      class="linked-data-toolbar"
      aria-label="透视表与外部数据状态"
    >
      <strong>高级数据对象</strong>
      <button v-for="pivot in workbook.linkedData.pivotTables" :key="pivot.part" :title="pivotTooltip(pivot)" @click="pivot.sheet && selectSheet(pivot.sheet)">
        透视表 · {{ pivot.name }}<small>{{ pivot.sourceSheet ? `${pivot.sourceSheet}!${pivot.sourceRange || ''}` : pivot.sourceType }}</small>
      </button>
      <button v-for="slicer in workbook.linkedData.slicers" :key="slicer.part" :title="slicer.cacheName || slicer.part" @click="slicer.sheet && selectSheet(slicer.sheet)">
        切片器 · {{ slicer.name }}<small>{{ slicer.sheet || '未绑定工作表' }}</small>
      </button>
      <span v-if="workbook.linkedData.connections.length">数据连接 {{ workbook.linkedData.connections.length }}</span>
      <span v-if="workbook.linkedData.externalLinks.length">外部工作簿 {{ workbook.linkedData.externalLinks.length }}</span>
      <button class="linked-data-overview" @click="linkedDataModalOpen = true">
        查看审计详情<small>{{ workbook.linkedData.summary.totalObjectCount }} 个对象 · {{ workbook.linkedData.summary.refreshRiskCount }} 个刷新风险</small>
      </button>
      <em v-if="workbook.linkedData.externalRelationshipCount">安全模式：已识别 {{ workbook.linkedData.externalRelationshipCount }} 个外部目标，未发起网络或文件访问</em>
    </div>

    <n-modal v-if="workbook" v-model:show="linkedDataModalOpen" preset="card" title="高级数据对象审计" class="linked-data-modal">
      <div class="linked-data-audit">
        <section class="linked-data-policy">
          <div>
            <strong>离线只读模式</strong>
            <p>显示脱敏结构元数据；不刷新缓存、不执行查询、不跟随外部目标，也不修改高级对象。</p>
          </div>
          <span>安全策略已生效</span>
        </section>
        <div class="linked-data-metrics">
          <span><strong>{{ workbook.linkedData.summary.totalObjectCount }}</strong>高级对象</span>
          <span><strong>{{ workbook.linkedData.summary.localPivotCount }}</strong>本地来源透视表</span>
          <span><strong>{{ workbook.linkedData.summary.externalLinkCount + workbook.linkedData.summary.connectionCount }}</strong>外部来源对象</span>
          <span :class="{ warning: workbook.linkedData.summary.refreshRiskCount }"><strong>{{ workbook.linkedData.summary.refreshRiskCount }}</strong>打开时刷新标记</span>
        </div>
        <section v-if="workbook.linkedData.pivotTables.length" class="linked-data-group">
          <header><strong>数据透视表</strong><span>{{ workbook.linkedData.pivotTables.length }}</span></header>
          <article v-for="pivot in workbook.linkedData.pivotTables" :key="pivot.part">
            <div><strong>{{ pivot.name }}</strong><small>{{ pivot.sheet || '未绑定工作表' }} · Cache {{ pivot.cacheId ?? '—' }}</small></div>
            <p>{{ pivot.sourceSheet ? `${pivot.sourceSheet}!${pivot.sourceRange || ''}` : pivot.connectionId ? `数据连接 ${pivot.connectionId}` : `来源类型 ${pivot.sourceType}` }}</p>
            <span :class="{ warning: pivot.refreshOnLoad }">{{ pivot.refreshOnLoad ? '原文件要求打开时刷新；本次未执行' : '使用包内已有缓存' }}</span>
            <div class="linked-data-actions">
              <button v-if="pivot.sheet" @click="navigateLinkedSheet(pivot.sheet)">定位工作表</button>
              <button
                v-if="pivot.audit.rebuildCandidate"
                :disabled="pivotPreviewLoading === pivot.part || pivot.audit.pageFieldCount > 0"
                :title="pivot.audit.pageFieldCount ? '含筛选字段的透视表暂不进入内存预览' : '从工作表当前值和未保存草稿生成，不修改 XLSX'"
                @click="previewLocalPivot(pivot)"
              >{{ pivotPreviewLoading === pivot.part ? '计算中…' : '内存预览' }}</button>
              <button
                :disabled="pivotRebuildPlanLoading === pivot.part"
                title="生成隔离重建影响清单；只验证临时内存副本，不修改用户文件"
                @click="previewPivotRebuildPlan(pivot)"
              >{{ pivotRebuildPlanLoading === pivot.part ? '审计中…' : '影响清单' }}</button>
              <button
                v-if="pivotRebuildPlans.get(pivot.part)?.status === 'isolated_dry_run_ready'"
                :disabled="pivotCacheRebuildLoading === pivot.part"
                title="仅在临时内存副本中重建 Cache Definition 与 Cache Records，不保存到用户文件"
                @click="rebuildPivotCacheIsolated(pivot)"
              >{{ pivotCacheRebuildLoading === pivot.part ? '重建中…' : '隔离重建 Cache' }}</button>
              <button
                v-if="pivotCacheRebuildResults.get(pivot.part)?.status === 'isolated_cache_rebuilt'"
                :disabled="pivotSynchronizedRebuildLoading === pivot.part"
                title="在同一临时副本中同步重建 Cache、Pivot items、行列项和输出区域，不保存到用户文件"
                @click="rebuildPivotSynchronizedIsolated(pivot)"
              >{{ pivotSynchronizedRebuildLoading === pivot.part ? '同步中…' : '隔离同步透视表' }}</button>
              <button
                v-if="pivotSynchronizedRebuildResults.get(pivot.part)?.status === 'isolated_pivot_rebuilt'"
                :disabled="pivotExpandedRebuildLoading === pivot.part"
                title="在临时副本中协调新增/删除 sharedItems、输出范围扩缩容、旧区域清理和样式延伸"
                @click="rebuildPivotExpandedIsolated(pivot)"
              >{{ pivotExpandedRebuildLoading === pivot.part ? '扩缩容中…' : '隔离验证布局扩缩容' }}</button>
              <button
                v-if="pivotExpandedRebuildResults.get(pivot.part)?.status === 'isolated_layout_resized'"
                :disabled="pivotVariantVerificationLoading === pivot.part"
                title="为七类聚合生成临时 Pivot 包，并验证单轴和多度量内存输出语义；不会保存到用户文件"
                @click="verifyPivotVariantsIsolated(pivot)"
              >{{ pivotVariantVerificationLoading === pivot.part ? '验证中…' : '隔离验证聚合与布局' }}</button>
            </div>
            <div class="pivot-audit-details">
              <div class="pivot-audit-status" :class="{ candidate: pivot.audit.rebuildCandidate }">
                <strong>{{ pivot.audit.rebuildCandidate ? '结构满足受限重建候选条件' : '仅可检查' }}</strong>
                <span>{{ pivot.audit.rebuildCandidate ? '本阶段仍不执行刷新或写回' : pivot.audit.blockers.join('；') }}</span>
              </div>
              <div class="pivot-audit-facts">
                <span>布局 {{ pivot.audit.layoutRange || '未声明' }}</span>
                <span>缓存字段 {{ pivot.audit.cacheFieldCount }}</span>
                <span>缓存记录 {{ pivot.audit.cacheRecordCount ?? '缺失' }}</span>
                <span>行/列/筛选/值 {{ pivot.audit.rowFieldCount }}/{{ pivot.audit.columnFieldCount }}/{{ pivot.audit.pageFieldCount }}/{{ pivot.audit.dataFieldCount }}</span>
              </div>
              <section class="pivot-writeback-audit" :class="{ candidate: pivot.audit.writeback.status === 'structure_candidate' }">
                <header>
                  <strong>事务写回审计：{{ pivot.audit.writeback.status === 'structure_candidate' ? '结构候选' : '已阻断' }}</strong>
                  <span>写回仍禁用</span>
                </header>
                <div>
                  <span :class="{ pass: pivot.audit.writeback.pivotFieldItemsComplete }">字段项 {{ pivot.audit.writeback.pivotFieldItemsComplete ? '完整' : '缺失' }}</span>
                  <span :class="{ pass: pivot.audit.writeback.rowItemsComplete }">行项 {{ pivot.audit.writeback.rowItemsComplete ? '完整' : '缺失' }}</span>
                  <span :class="{ pass: pivot.audit.writeback.columnItemsComplete }">列项 {{ pivot.audit.writeback.columnItemsComplete ? '完整' : '缺失' }}</span>
                  <span :class="{ pass: pivot.audit.writeback.outputCellsPresent }">输出单元格 {{ pivot.audit.writeback.outputCellsPresent ? '存在' : '缺失' }}</span>
                </div>
                <p v-if="pivot.audit.writeback.blockers.length">{{ pivot.audit.writeback.blockers.join('；') }}</p>
                <p v-else>结构门禁已满足；仍需原子回滚、未触及部件保真和 Excel/LibreOffice 真实往返证据。</p>
              </section>
              <section v-if="pivotRebuildPlans.get(pivot.part)" class="pivot-rebuild-plan" :class="{ ready: pivotRebuildPlans.get(pivot.part)!.status === 'isolated_dry_run_ready' }">
                <header>
                  <div>
                    <strong>隔离重建影响清单</strong>
                    <small>{{ pivotRebuildPlans.get(pivot.part)!.status === 'isolated_dry_run_ready' ? 'Dry-run 已就绪' : '已阻断' }}</small>
                  </div>
                  <span>用户文件写入：禁用</span>
                </header>
                <div class="pivot-impact-parts">
                  <span v-for="impact in pivotRebuildPlans.get(pivot.part)!.affectedParts" :key="impact.part">
                    <strong>{{ impact.role }}</strong>
                    <small>{{ impact.plannedAction }} · {{ impact.part }}</small>
                  </span>
                </div>
                <div class="pivot-rebuild-gates">
                  <span v-for="gate in pivotRebuildPlans.get(pivot.part)!.gates" :key="gate.id" :class="gate.status">{{ gate.id }} · {{ gate.status }}</span>
                </div>
                <p v-if="pivotRebuildPlans.get(pivot.part)!.blockers.length">{{ pivotRebuildPlans.get(pivot.part)!.blockers.join('；') }}</p>
                <footer>临时副本摘要已校验；计划影响 {{ pivotRebuildPlans.get(pivot.part)!.affectedParts.length }} 个部件，保留 {{ pivotRebuildPlans.get(pivot.part)!.preservedPartCount }} 个部件。尚未执行实际重建、原子替换或桌面刷新。</footer>
              </section>
              <section v-if="pivotCacheRebuildResults.get(pivot.part)" class="pivot-cache-rebuild-result">
                <header>
                  <div>
                    <strong>隔离 Cache 重建已通过</strong>
                    <small>{{ pivotCacheRebuildResults.get(pivot.part)!.rebuiltRecordCount }} 条记录 · {{ pivotCacheRebuildResults.get(pivot.part)!.rebuiltParts.length }} 个重建部件</small>
                  </div>
                  <span>用户文件未修改</span>
                </header>
                <div class="pivot-cache-fields">
                  <span v-for="field in pivotCacheRebuildResults.get(pivot.part)!.fields" :key="field.index">
                    <strong>{{ field.name }}</strong>
                    <small>{{ field.valueType }} · {{ field.recordEncoding }} · {{ field.sharedItemCount }} 个共享项</small>
                  </span>
                </div>
                <div class="pivot-rebuild-gates">
                  <span v-for="gate in pivotCacheRebuildResults.get(pivot.part)!.gates" :key="gate.id" :class="gate.status">{{ gate.id }} · {{ gate.status }}</span>
                </div>
                <footer>临时包已通过结构校验、语义复读和未触及部件保真；Pivot items、输出区域、原子替换及桌面往返仍未开放。</footer>
              </section>
              <section v-if="pivotSynchronizedRebuildResults.get(pivot.part)" class="pivot-synchronized-rebuild-result">
                <header>
                  <div>
                    <strong>隔离透视表同步重建已通过</strong>
                    <small>{{ pivotSynchronizedRebuildResults.get(pivot.part)!.rebuiltRecordCount }} 条记录 · {{ pivotSynchronizedRebuildResults.get(pivot.part)!.rebuiltParts.length }} 个同步部件</small>
                  </div>
                  <span>用户文件未修改</span>
                </header>
                <div class="pivot-sync-facts">
                  <span>可见行项 {{ pivotSynchronizedRebuildResults.get(pivot.part)!.visibleRowItemCount }}</span>
                  <span>可见列项 {{ pivotSynchronizedRebuildResults.get(pivot.part)!.visibleColumnItemCount }}</span>
                  <span>输出单元格 {{ pivotSynchronizedRebuildResults.get(pivot.part)!.outputCellCount }}</span>
                  <span>输出值复读 {{ pivotSynchronizedRebuildResults.get(pivot.part)!.outputValuesVerified ? '通过' : '失败' }}</span>
                </div>
                <div class="pivot-rebuild-gates">
                  <span v-for="gate in pivotSynchronizedRebuildResults.get(pivot.part)!.gates" :key="gate.id" :class="gate.status">{{ gate.id }} · {{ gate.status }}</span>
                </div>
                <footer>Cache、字段 items、行列项与输出矩阵已在同一内存副本同步；原子替换和 Excel/LibreOffice 桌面往返仍未开放。</footer>
              </section>
              <section v-if="pivotExpandedRebuildResults.get(pivot.part)" class="pivot-expanded-rebuild-result">
                <header>
                  <div>
                    <strong>隔离布局扩缩容已通过</strong>
                    <small>{{ pivotExpandedRebuildResults.get(pivot.part)!.oldOutputRange }} → {{ pivotExpandedRebuildResults.get(pivot.part)!.newOutputRange }}</small>
                  </div>
                  <span>用户文件未修改</span>
                </header>
                <div class="pivot-sync-facts">
                  <span>共享项 +{{ pivotExpandedRebuildResults.get(pivot.part)!.addedSharedItemCount }} / -{{ pivotExpandedRebuildResults.get(pivot.part)!.removedSharedItemCount }}</span>
                  <span>输出单元格 {{ pivotExpandedRebuildResults.get(pivot.part)!.outputCellCount }}</span>
                  <span>清理旧单元格 {{ pivotExpandedRebuildResults.get(pivot.part)!.clearedStaleCellCount }}</span>
                  <span>延伸样式 {{ pivotExpandedRebuildResults.get(pivot.part)!.extendedStyleCellCount }}</span>
                </div>
                <div class="pivot-rebuild-gates">
                  <span v-for="gate in pivotExpandedRebuildResults.get(pivot.part)!.gates" :key="gate.id" :class="gate.status">{{ gate.id }} · {{ gate.status }}</span>
                </div>
                <div class="pivot-copy-save">
                  <label>
                    <span>新副本文件名</span>
                    <input
                      :value="pivotCopyFileNames.get(pivot.part) || ''"
                      maxlength="255"
                      :disabled="pivotSaveCopyLoading === pivot.part"
                      @input="setPivotCopyFileName(pivot.part, ($event.target as HTMLInputElement).value)"
                      @keydown.enter.prevent="savePivotCopy(pivot)"
                    />
                  </label>
                  <button
                    :disabled="pivotSaveCopyLoading === pivot.part || !pivotCopyFileNames.get(pivot.part)?.trim() || Boolean(dirtyCount)"
                    :title="dirtyCount ? '请先保存或放弃当前工作簿草稿' : '只在同目录创建经过复读验证的新 XLSX，不覆盖源文件'"
                    @click="savePivotCopy(pivot)"
                  >{{ pivotSaveCopyLoading === pivot.part ? '正在落盘并复读…' : '另存 Pivot 新副本并打开' }}</button>
                  <small v-if="pivotSavedCopyResults.get(pivot.part)">已验证 {{ pivotSavedCopyResults.get(pivot.part)!.outputRange }} · {{ pivotSavedCopyResults.get(pivot.part)!.outputCellCount }} 个输出单元格 · 源文件未修改</small>
                </div>
                <footer>sharedItems、Pivot items、行列映射、location 和工作表输出已协调验证；首批只允许可靠另存新副本，原件覆盖与真实生产者往返仍保持阻断。</footer>
              </section>
              <section v-if="pivotVariantVerificationResults.get(pivot.part)" class="pivot-variant-verification-result">
                <header>
                  <div>
                    <strong>聚合与布局变体已通过</strong>
                    <small>{{ pivotVariantVerificationResults.get(pivot.part)!.packageVariantCount }} 个临时包 · {{ pivotVariantVerificationResults.get(pivot.part)!.layoutPackageVariantCount }} 个布局包</small>
                  </div>
                  <span>用户文件未修改</span>
                </header>
                <div class="pivot-variant-grid">
                  <span v-for="variant in pivotVariantVerificationResults.get(pivot.part)!.aggregationVariants" :key="variant.aggregation">
                    <strong>{{ pivotAggregationLabel(variant.aggregation) }}</strong>
                    <small>{{ variant.outputRange }} · {{ variant.outputCellCount }} 单元格</small>
                    <template v-if="variant.aggregation !== 'sum'">
                      <input
                        :value="pivotCopyFileNames.get(pivotAggregationCopyKey(pivot.part, variant.aggregation)) || ''"
                        maxlength="255"
                        :aria-label="`${pivotAggregationLabel(variant.aggregation)}新副本文件名`"
                        :disabled="pivotSaveCopyLoading === pivotAggregationCopyKey(pivot.part, variant.aggregation)"
                        @input="setPivotCopyFileName(pivotAggregationCopyKey(pivot.part, variant.aggregation), ($event.target as HTMLInputElement).value)"
                        @keydown.enter.prevent="savePivotAggregationCopy(pivot, variant)"
                      />
                      <button
                        :disabled="pivotSaveCopyLoading === pivotAggregationCopyKey(pivot.part, variant.aggregation) || !pivotCopyFileNames.get(pivotAggregationCopyKey(pivot.part, variant.aggregation))?.trim() || Boolean(dirtyCount)"
                        title="只在同目录创建经过复读验证的新 XLSX"
                        @click="savePivotAggregationCopy(pivot, variant)"
                      >
                        <n-icon :component="SaveIcon" />
                        {{ pivotSaveCopyLoading === pivotAggregationCopyKey(pivot.part, variant.aggregation) ? '验证中…' : '另存并打开' }}
                      </button>
                      <small v-if="pivotSavedCopyResults.get(pivotAggregationCopyKey(pivot.part, variant.aggregation))" class="saved">已可靠保存 · 源文件未修改</small>
                    </template>
                  </span>
                </div>
                <div class="pivot-layout-variants">
                  <span v-for="variant in pivotVariantVerificationResults.get(pivot.part)!.layoutVariants" :key="variant.layout">
                    <strong>{{ pivotLayoutVariantLabel(variant.layout) }}</strong>
                    <small>行/列/值 {{ variant.rowFieldCount }}/{{ variant.columnFieldCount }}/{{ variant.dataFieldCount }} · {{ variant.outputRange }} · {{ variant.outputCellCount }} 单元格 · {{ variant.styledOutputCellCount }} 个样式复读</small>
                    <input
                      :value="pivotCopyFileNames.get(pivotLayoutCopyKey(pivot.part, variant.layout)) || ''"
                      maxlength="255"
                      :aria-label="`${pivotLayoutVariantLabel(variant.layout)}新副本文件名`"
                      :disabled="pivotSaveCopyLoading === pivotLayoutCopyKey(pivot.part, variant.layout)"
                      @input="setPivotCopyFileName(pivotLayoutCopyKey(pivot.part, variant.layout), ($event.target as HTMLInputElement).value)"
                      @keydown.enter.prevent="savePivotLayoutCopy(pivot, variant)"
                    />
                    <button
                      :disabled="pivotSaveCopyLoading === pivotLayoutCopyKey(pivot.part, variant.layout) || !pivotCopyFileNames.get(pivotLayoutCopyKey(pivot.part, variant.layout))?.trim() || Boolean(dirtyCount)"
                      title="只在同目录创建经过复读验证的新 XLSX"
                      @click="savePivotLayoutCopy(pivot, variant)"
                    >
                      <n-icon :component="SaveIcon" />
                      {{ pivotSaveCopyLoading === pivotLayoutCopyKey(pivot.part, variant.layout) ? '验证中…' : '另存并打开' }}
                    </button>
                    <small v-if="pivotSavedCopyResults.get(pivotLayoutCopyKey(pivot.part, variant.layout))" class="saved">已可靠保存 · 源文件未修改</small>
                  </span>
                </div>
                <div class="pivot-rebuild-gates">
                  <span v-for="gate in pivotVariantVerificationResults.get(pivot.part)!.gates" :key="gate.id" :class="gate.status">{{ gate.id }} · {{ gate.status }}</span>
                </div>
                <footer>七类聚合与三种布局均已完成 OOXML 复读；只有通过 Excel/WPS/LibreOffice 往返门禁的变体才进入可靠新副本白名单，多层轴、页面筛选和原件覆盖仍阻断。</footer>
              </section>
              <div v-if="pivot.audit.fields.length" class="pivot-field-list">
                <span v-for="field in pivot.audit.fields" :key="field.index">
                  {{ field.name }} · {{ pivotFieldRoleLabel(field.role) }} · {{ pivotFieldTypeLabel(field.valueType) }}
                </span>
              </div>
              <div v-if="pivot.audit.dataFields.length" class="pivot-data-fields">
                <span v-for="field in pivot.audit.dataFields" :key="`${field.sourceIndex}-${field.name}`" :class="{ unsupported: !field.supported }">
                  {{ field.name }}：{{ pivotAggregationLabel(field.aggregation) }}{{ field.supported ? '' : '（未验证）' }}
                </span>
              </div>
              <section v-if="pivotPreviews.get(pivot.part)" class="pivot-preview-result">
                <header>
                  <div>
                    <strong>内存聚合预览</strong>
                    <small>{{ pivotPreviews.get(pivot.part)!.sourceSheet }}!{{ pivotPreviews.get(pivot.part)!.sourceRange }}</small>
                  </div>
                  <span>{{ pivotPreviews.get(pivot.part)!.sourceRowCount }} 条来源 · {{ pivotPreviews.get(pivot.part)!.groups.length }} 个分组 · {{ pivotPreviews.get(pivot.part)!.appliedDraftCount }} 个草稿</span>
                </header>
                <div class="pivot-preview-grid">
                  <article v-for="(group, groupIndex) in pivotPreviews.get(pivot.part)!.groups" :key="groupIndex">
                    <div>
                      <strong>{{ pivotPreviewKeys(group.rowKeys, '全部行') }}</strong>
                      <small>{{ pivotPreviewKeys(group.columnKeys, '全部列') }}</small>
                    </div>
                    <span v-for="measure in group.measures" :key="`${measure.sourceIndex}-${measure.name}`">
                      {{ measure.name }} · {{ pivotAggregationLabel(measure.aggregation) }}
                      <strong>{{ measure.formattedValue || '—' }}</strong>
                      <small>{{ measure.contributingCount }} 个参与值</small>
                    </span>
                  </article>
                </div>
                <footer>预览只驻留内存；未覆盖工作表、Pivot Cache、透视定义或原文件。</footer>
              </section>
            </div>
          </article>
        </section>
        <section v-if="workbook.linkedData.slicers.length" class="linked-data-group">
          <header><strong>切片器</strong><span>{{ workbook.linkedData.slicers.length }}</span></header>
          <article v-for="slicer in workbook.linkedData.slicers" :key="slicer.part">
            <div><strong>{{ slicer.name }}</strong><small>{{ slicer.sheet || '未绑定工作表' }}</small></div>
            <p>{{ slicer.cacheName ? `缓存 ${slicer.cacheName}` : '未公开缓存名称' }}</p>
            <span>交互筛选未执行</span>
            <button v-if="slicer.sheet" @click="navigateLinkedSheet(slicer.sheet)">定位工作表</button>
          </article>
        </section>
        <section v-if="workbook.linkedData.connections.length" class="linked-data-group">
          <header><strong>数据连接</strong><span>{{ workbook.linkedData.connections.length }}</span></header>
          <article v-for="connection in workbook.linkedData.connections" :key="connection.id ?? connection.name">
            <div><strong>{{ connection.name }}</strong><small>ID {{ connection.id ?? '—' }} · 类型 {{ connection.kind }}</small></div>
            <p>连接字符串、命令、凭据和完整路径不会发送到界面。</p>
            <span :class="{ warning: connection.refreshOnLoad }">{{ connection.refreshOnLoad ? '原文件要求刷新；LongEdit 已阻止' : '未请求刷新' }}</span>
          </article>
        </section>
        <section v-if="workbook.linkedData.externalLinks.length" class="linked-data-group">
          <header><strong>外部工作簿链接</strong><span>{{ workbook.linkedData.externalLinks.length }}</span></header>
          <article v-for="link in workbook.linkedData.externalLinks" :key="link.part">
            <div><strong>{{ link.kind === 'external_workbook' ? '外部工作簿' : link.kind }}</strong><small>{{ link.targetKind || '未知目标类别' }}</small></div>
            <p>包内缓存项 {{ link.cachedItemCount }}；目标地址已脱敏且不会被跟随。</p>
            <span>离线保真</span>
          </article>
        </section>
      </div>
      <template #footer><div class="page-layout-actions"><button @click="linkedDataModalOpen = false">关闭</button></div></template>
    </n-modal>

    <div v-if="workbook && sheetInfo" class="page-layout-toolbar" aria-label="打印布局与保护状态">
      <strong><n-icon :component="PrinterIcon" />页面</strong>
      <span v-if="sheetInfo.pageLayout.printArea">打印区域 {{ rangeLabel(sheetInfo.pageLayout.printArea) }}</span>
      <span v-if="sheetInfo.pageLayout.setup.orientation">{{ sheetInfo.pageLayout.setup.orientation === 'landscape' ? '横向' : '纵向' }} · 纸张 {{ sheetInfo.pageLayout.setup.paperSize || '默认' }}</span>
      <span v-if="sheetInfo.pageLayout.setup.fitToPage">适配 {{ sheetInfo.pageLayout.setup.fitToWidth ?? '默认' }} × {{ sheetInfo.pageLayout.setup.fitToHeight ?? '默认' }} 页</span>
      <span v-if="hasStoredPrintOptions">{{ storedPrintOptionsSummary }}</span>
      <span v-if="hasStoredHeaderFooter" :title="storedHeaderFooterSummary">已配置页眉/页脚</span>
      <button title="把当前连续选区设为打印区域" :disabled="!canEditPrintArea || !pageLayoutSelection" @click="setSelectionAsPrintArea">设为打印区域</button>
      <button title="清除当前 Sheet 的打印区域" :disabled="!canEditPrintArea || !sheetInfo.pageLayout.printArea" @click="clearPrintArea">清除打印区域</button>
      <button title="编辑方向、纸张、缩放和页边距" :disabled="!canEditPageLayout" @click="pageLayoutModalOpen = true">页面设置</button>
      <button title="编辑网格线、标题、居中和输出选项" :disabled="!canEditPageLayout" @click="printOptionsModalOpen = true">打印选项</button>
      <button title="编辑当前 Sheet 的页眉和页脚" :disabled="!canEditPageLayout" @click="headerFooterModalOpen = true">页眉页脚</button>
      <span v-if="workbook.protection.lockStructure">工作簿结构已锁定</span>
      <em v-if="sheetProtected">当前 Sheet 受保护，LongEdit 不会绕过密码或写入限制</em>
    </div>

    <n-modal v-model:show="pageLayoutModalOpen" preset="card" title="页面设置" class="page-layout-modal">
      <div class="page-layout-panel">
        <label>方向<select v-model="pageLayoutDraft.orientation"><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
        <label>纸张<select v-model.number="pageLayoutDraft.paperSize"><option :value="1">Letter</option><option :value="5">Legal</option><option :value="8">A3</option><option :value="9">A4</option><option :value="11">A5</option></select></label>
        <label>缩放<select v-model="pageLayoutDraft.scalingMode"><option value="scale">百分比</option><option value="fit">适合页数</option></select></label>
        <label v-if="pageLayoutDraft.scalingMode === 'scale'">比例<span><input v-model.number="pageLayoutDraft.scale" type="number" min="10" max="400" step="5">%</span></label>
        <template v-else>
          <label>适合宽度<span><input v-model.number="pageLayoutDraft.fitToWidth" type="number" min="0" max="100">页</span></label>
          <label>适合高度<span><input v-model.number="pageLayoutDraft.fitToHeight" type="number" min="0" max="100">页</span></label>
        </template>
        <fieldset>
          <legend>页边距（英寸）</legend>
          <label v-for="field in pageMarginFields" :key="field.key">{{ field.label }}<input v-model.number="pageLayoutDraft.margins[field.key]" type="number" min="0" max="10" step="0.05"></label>
        </fieldset>
      </div>
      <template #footer>
        <div class="page-layout-actions">
          <button @click="pageLayoutModalOpen = false">取消</button>
          <button class="primary" :disabled="!canEditPageLayout" @click="savePageLayout()">应用</button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="printOptionsModalOpen" preset="card" title="打印选项" class="print-options-modal">
      <div class="print-options-panel">
        <fieldset>
          <legend>打印内容</legend>
          <label><input v-model="printOptionsDraft.gridLines" type="checkbox">打印网格线</label>
          <label><input v-model="printOptionsDraft.headings" type="checkbox">打印行列标题</label>
        </fieldset>
        <fieldset>
          <legend>页面居中</legend>
          <label><input v-model="printOptionsDraft.horizontalCentered" type="checkbox">水平居中</label>
          <label><input v-model="printOptionsDraft.verticalCentered" type="checkbox">垂直居中</label>
        </fieldset>
        <fieldset>
          <legend>输出方式</legend>
          <label><input v-model="printOptionsDraft.blackAndWhite" type="checkbox">黑白打印</label>
          <label><input v-model="printOptionsDraft.draft" type="checkbox">草稿质量</label>
        </fieldset>
        <fieldset class="first-page-option">
          <legend>页码</legend>
          <label><input v-model="printOptionsDraft.useFirstPageNumber" type="checkbox">指定首页页码</label>
          <input v-model.number="printOptionsDraft.firstPageNumber" type="number" min="1" max="32767" :disabled="!printOptionsDraft.useFirstPageNumber" aria-label="首页页码">
        </fieldset>
      </div>
      <template #footer>
        <div class="page-layout-actions">
          <button @click="printOptionsModalOpen = false">取消</button>
          <button class="primary" :disabled="!canEditPageLayout" @click="savePrintOptions">应用</button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="headerFooterModalOpen" preset="card" title="页眉页脚" class="header-footer-modal">
      <div class="header-footer-options">
        <label><input v-model="headerFooterDraft.differentOddEven" type="checkbox">奇偶页不同</label>
        <label><input v-model="headerFooterDraft.differentFirstPage" type="checkbox">首页不同</label>
        <label><input v-model="headerFooterDraft.scaleWithDocument" type="checkbox">随文档缩放</label>
        <label><input v-model="headerFooterDraft.alignWithMargins" type="checkbox">与页边距对齐</label>
      </div>
      <div class="header-footer-modes" role="tablist" aria-label="页眉页脚页面类型">
        <button :class="{ active: headerFooterMode === 'odd' }" @click="headerFooterMode = 'odd'">奇数页</button>
        <button :class="{ active: headerFooterMode === 'even' }" :disabled="!headerFooterDraft.differentOddEven" @click="headerFooterMode = 'even'">偶数页</button>
        <button :class="{ active: headerFooterMode === 'first' }" :disabled="!headerFooterDraft.differentFirstPage" @click="headerFooterMode = 'first'">首页</button>
      </div>
      <div class="header-footer-fields">
        <label>页眉<textarea v-model="activeHeaderFooterFields.header" maxlength="255" rows="3"></textarea></label>
        <label>页脚<textarea v-model="activeHeaderFooterFields.footer" maxlength="255" rows="3"></textarea></label>
      </div>
      <template #footer>
        <div class="page-layout-actions">
          <button :disabled="!hasHeaderFooterContent" @click="clearHeaderFooter">全部清空</button>
          <button @click="headerFooterModalOpen = false">取消</button>
          <button class="primary" :disabled="!canEditPageLayout" @click="saveHeaderFooter">应用</button>
        </div>
      </template>
    </n-modal>

    <div v-if="workbook && sheetInfo" class="formula-bar">
      <select v-model.number="selectedDefinedNameIndex" title="跳转和管理命名区域" :disabled="!navigableDefinedNames.length" @change="navigateDefinedName">
        <option :value="-1">{{ navigableDefinedNames.length ? '命名区域' : '无命名区域' }}</option>
        <option v-for="item in navigableDefinedNames" :key="item.index" :value="item.index">{{ item.label }}</option>
      </select>
      <button title="从当前单一区域创建名称" :disabled="!canEditDefinedNames || !definedNameSelection" @click="createDefinedName">新建名称</button>
      <button title="重命名当前名称；被公式引用时会安全拒绝" :disabled="!canEditDefinedNames || selectedDefinedNameIndex < 0" @click="renameDefinedName">改名</button>
      <button title="把当前名称指向当前单一区域" :disabled="!canEditDefinedNames || selectedDefinedNameIndex < 0 || !definedNameSelection" @click="updateDefinedNameRange">更新引用</button>
      <button title="删除当前名称；被公式引用时会安全拒绝" :disabled="!canEditDefinedNames || selectedDefinedNameIndex < 0" @click="deleteDefinedName">删除名称</button>
      <output>{{ selectedAddress || '—' }}</output>
      <span>fx</span>
      <input
        ref="formulaInputRef"
        v-model="formulaInput"
        :disabled="!selectedEditable || saving"
        :placeholder="selectedCell ? '当前单元格不可编辑' : '选择单元格'"
        @change="commitFormulaInput"
        @keydown.enter.prevent="commitFormulaInput"
        @keydown.esc.prevent="resetFormulaInput"
      />
    </div>

    <div v-if="workbook && sheetInfo?.arrayFormulas.length" class="array-formula-strip" aria-label="数组公式只读边界">
      <strong>数组公式 · 只读</strong>
      <select title="跳转到数组公式声明区域" @change="navigateArrayFormula">
        <option value="">共 {{ sheetInfo.arrayFormulas.length }} 处，选择定位</option>
        <option v-for="(item, index) in sheetInfo.arrayFormulas" :key="`${item.anchorRow}:${item.anchorColumn}`" :value="index">
          {{ item.kind === 'dynamic_array' ? '动态数组' : '传统数组' }} · {{ rangeLabel(item.range) }}
        </option>
      </select>
      <span v-if="selectedArrayFormula">
        {{ selectedArrayFormula.kind === 'dynamic_array' ? '动态数组' : '传统数组' }}
        {{ rangeLabel(selectedArrayFormula.range) }} · 缓存 {{ selectedArrayFormula.cachedCellCount }}/{{ selectedArrayFormula.declaredCellCount }}
        · {{ cacheTypeSummary(selectedArrayFormula) }} · {{ spillStatusLabel(selectedArrayFormula.spillStatus) }}
      </span>
      <span v-else>
        {{ sheetInfo.arrayFormulas.filter(item => item.spillStatus === 'potential_conflict').length
          ? `发现 ${sheetInfo.arrayFormulas.filter(item => item.spillStatus === 'potential_conflict').length} 处潜在占用冲突`
          : '可查看缓存完整度；编辑、填充、结构迁移和本地重算已安全阻止' }}
      </span>
      <button v-if="selectedArrayFormula?.conflictCells.length" class="diagnostic-link warning" @click="navigateArrayDiagnosticCell(selectedArrayFormula.conflictCells[0])">
        定位冲突 {{ selectedArrayFormula.conflictCells[0] }}
      </button>
      <button v-if="selectedArrayFormula?.errorCacheCells.length" class="diagnostic-link" @click="navigateArrayDiagnosticCell(selectedArrayFormula.errorCacheCells[0])">
        定位错误缓存 {{ selectedArrayFormula.errorCacheCells[0] }}
      </button>
    </div>

    <div v-if="workbook && sheetInfo" class="format-toolbar" :class="{ protected: sheetProtected }" aria-label="单元格格式">
      <select :value="focusedStyle.namedStyle || ''" title="命名样式" :disabled="!selectedCell || saving" @change="applyNamedStyle">
        <option value="">单元格样式</option>
        <option v-for="style in sheetInfo.namedStyles" :key="style.name" :value="style.name">{{ style.name }}</option>
      </select>
      <select :value="focusedStyle.fontName" title="字体" :disabled="!selectedCell || saving" @change="applyStylePatch({ fontName: ($event.target as HTMLSelectElement).value })">
        <option v-if="!fontOptions.includes(focusedStyle.fontName)" :value="focusedStyle.fontName">{{ focusedStyle.fontName }}</option>
        <option v-for="font in fontOptions" :key="font" :value="font">{{ font }}</option>
      </select>
      <input class="font-size" type="number" min="6" max="72" step="1" title="字号" :value="focusedStyle.fontSize" :disabled="!selectedCell || saving" @change="applyFontSize">
      <span class="toolbar-divider"></span>
      <button class="icon-button text-icon" :class="{ active: focusedStyle.bold }" title="粗体" :disabled="!selectedCell || saving" @click="applyStylePatch({ bold: !focusedStyle.bold })"><n-icon :component="BoldIcon" /></button>
      <button class="icon-button text-icon" :class="{ active: focusedStyle.italic }" title="斜体" :disabled="!selectedCell || saving" @click="applyStylePatch({ italic: !focusedStyle.italic })"><n-icon :component="ItalicIcon" /></button>
      <button class="icon-button text-icon" :class="{ active: focusedStyle.underline }" title="下划线" :disabled="!selectedCell || saving" @click="applyStylePatch({ underline: !focusedStyle.underline })"><n-icon :component="UnderlineIcon" /></button>
      <label class="color-control" title="文字颜色"><n-icon :component="TypeIcon" /><input type="color" :value="focusedStyle.fontColor || '#111827'" :disabled="!selectedCell || saving" @input="applyStylePatch({ fontColor: ($event.target as HTMLInputElement).value })"></label>
      <label class="color-control" title="填充颜色"><n-icon :component="FillIcon" /><input type="color" :value="focusedStyle.fillColor || '#ffffff'" :disabled="!selectedCell || saving" @input="applyStylePatch({ fillColor: ($event.target as HTMLInputElement).value })"></label>
      <span class="toolbar-divider"></span>
      <div class="segmented" aria-label="水平对齐">
        <button class="icon-button" :class="{ active: focusedStyle.horizontalAlignment === 'left' }" title="左对齐" :disabled="!selectedCell || saving" @click="applyStylePatch({ horizontalAlignment: focusedStyle.horizontalAlignment === 'left' ? 'general' : 'left' })"><n-icon :component="AlignLeftIcon" /></button>
        <button class="icon-button" :class="{ active: focusedStyle.horizontalAlignment === 'center' }" title="居中" :disabled="!selectedCell || saving" @click="applyStylePatch({ horizontalAlignment: focusedStyle.horizontalAlignment === 'center' ? 'general' : 'center' })"><n-icon :component="AlignCenterIcon" /></button>
        <button class="icon-button" :class="{ active: focusedStyle.horizontalAlignment === 'right' }" title="右对齐" :disabled="!selectedCell || saving" @click="applyStylePatch({ horizontalAlignment: focusedStyle.horizontalAlignment === 'right' ? 'general' : 'right' })"><n-icon :component="AlignRightIcon" /></button>
      </div>
      <button class="icon-button" :class="{ active: focusedStyle.wrapText }" title="自动换行" :disabled="!selectedCell || saving" @click="applyStylePatch({ wrapText: !focusedStyle.wrapText })"><n-icon :component="WrapIcon" /></button>
      <button class="icon-button" :class="{ active: focusedStyle.borderStyle !== 'none' }" title="所有边框" :disabled="!selectedCell || saving" @click="applyStylePatch({ borderStyle: focusedStyle.borderStyle === 'none' ? 'thin' : 'none', borderColor: focusedStyle.borderStyle === 'none' ? '#808080' : '' })"><n-icon :component="BorderIcon" /></button>
      <select class="border-side-select" title="分边框" :disabled="!selectedCell || saving" @change="applyBorderSide">
        <option value="">分边框…</option><option value="top">上边框</option><option value="right">右边框</option><option value="bottom">下边框</option><option value="left">左边框</option><option value="clear">清除四边框</option>
      </select>
      <span class="toolbar-divider"></span>
      <select :value="focusedStyle.numberFormat" title="数字格式" :disabled="!selectedCell || saving" @change="applyStylePatch({ numberFormat: ($event.target as HTMLSelectElement).value })">
        <option v-if="focusedStyle.numberFormat.startsWith('custom:')" :value="focusedStyle.numberFormat">自定义：{{ focusedStyle.numberFormat.slice(7) }}</option>
        <option value="general">常规</option><option value="integer">整数</option><option value="decimal">数值</option><option value="percent">百分比</option><option value="currency">货币</option><option value="date">日期</option><option value="text">文本</option>
      </select>
      <button title="编辑自定义数字格式" :disabled="!selectedCell || saving" @click="setCustomNumberFormat">自定义格式</button>
      <span class="toolbar-divider"></span>
      <button title="设置选中行的行高" :disabled="!selectedCell || saving" @click="setSelectedRowHeight">行高</button>
      <button title="设置选中列的列宽" :disabled="!selectedCell || saving" @click="setSelectedColumnWidth">列宽</button>
      <select title="行列隐藏与分组" :disabled="!selectedAxis || saving || updatingStructure || Boolean(dirtyCount)" @change="applyAxisAction">
        <option value="">行列操作…</option>
        <option value="hide">隐藏所选</option>
        <option value="show">取消隐藏</option>
        <option value="group">建立分组</option>
        <option value="ungroup">取消分组</option>
      </select>
      <select title="整行整列插入与删除" :disabled="!selectedAxis || sheetProtected || saving || updatingStructure || Boolean(dirtyCount)" @change="applyStructureAction">
        <option value="">整行整列操作…</option>
        <option value="insert">{{ selectedAxis?.kind === 'column' ? '在所选列左侧插入' : '在所选行上方插入' }}</option>
        <option value="delete">{{ selectedAxis?.kind === 'column' ? '删除所选列' : '删除所选行' }}</option>
      </select>
      <button title="合并选中的连续区域" :disabled="!canMergeSelection || saving" @click="mergeSelection">合并</button>
      <button title="取消当前合并区域" :disabled="!selectedMerge || saving" @click="unmergeSelection">取消合并</button>
      <span class="toolbar-divider"></span>
      <button title="冻结当前单元格上方行和左侧列" :disabled="!selectedCell || (!selectedCell.row && !selectedCell.column) || saving || updatingStructure || Boolean(dirtyCount)" @click="setFreezePane">冻结窗格</button>
      <button title="取消当前工作表冻结窗格" :disabled="(!effectiveFreeze.rows && !effectiveFreeze.columns) || saving || updatingStructure || Boolean(dirtyCount)" @click="clearFreezePane">取消冻结</button>
    </div>

    <div v-if="workbook && sheetInfo && (activeDataRegion || selectedValidation || tableSelection || validationSelection)" class="data-toolbar">
      <button v-if="tableSelection && !selectedTable" title="从选区创建 Excel Table" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="editSelectedTable('create')">创建 Table</button>
      <button v-if="tableSelection && selectedTable" title="把 Excel Table 调整到选区并同步表头" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="editSelectedTable('resize')">调整 Table</button>
      <template v-if="selectedTable">
        <button title="重命名当前 Excel Table" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="renameSelectedTable">重命名</button>
        <select :value="selectedTable.styleName || 'TableStyleMedium2'" title="Table 样式" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @change="setSelectedTableStyle(($event.target as HTMLSelectElement).value)">
          <option v-for="style in TABLE_STYLE_PRESETS" :key="style" :value="style">{{ style }}</option>
        </select>
        <button :class="{ active: selectedTable.showFirstColumn }" title="强调首列" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="setSelectedTableStyleOption('showFirstColumn', !selectedTable.showFirstColumn)">首列</button>
        <button :class="{ active: selectedTable.showLastColumn }" title="强调末列" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="setSelectedTableStyleOption('showLastColumn', !selectedTable.showLastColumn)">末列</button>
        <button :class="{ active: selectedTable.showRowStripes }" title="显示行条纹" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="setSelectedTableStyleOption('showRowStripes', !selectedTable.showRowStripes)">行条纹</button>
        <button :class="{ active: selectedTable.showColumnStripes }" title="显示列条纹" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="setSelectedTableStyleOption('showColumnStripes', !selectedTable.showColumnStripes)">列条纹</button>
        <button title="移除 Table 结构并保留单元格数据" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="removeSelectedTable('convert_to_range')">转普通区域</button>
        <button title="删除 Table 定义并保留单元格数据" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="removeSelectedTable('delete')">删除 Table</button>
      </template>
      <template v-if="activeDataRegion">
        <strong>{{ activeDataRegion.label }}</strong>
        <select v-model.number="filterColumn" title="筛选字段" @focus="prepareDataView">
          <option :value="-1">全部字段</option>
          <option v-for="column in activeDataColumns" :key="column.index" :value="column.index">{{ column.label }}</option>
        </select>
        <input v-model="filterQuery" placeholder="包含筛选" @focus="prepareDataView" @input="prepareDataView">
        <select v-model.number="sortColumn" title="排序字段" @focus="prepareDataView">
          <option :value="-1">不排序</option>
          <option v-for="column in activeDataColumns" :key="column.index" :value="column.index">{{ column.label }}</option>
        </select>
        <button :class="{ active: sortDirection === 'asc' }" :disabled="sortColumn < 0" @click="sortDirection = 'asc'">升序</button>
        <button :class="{ active: sortDirection === 'desc' }" :disabled="sortColumn < 0" @click="sortDirection = 'desc'">降序</button>
        <button title="把当前单列包含筛选和排序状态写入 XLSX" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount) || !activeDataRegion.filterState.editable" @click="persistDataView('apply')">应用到文件</button>
        <button title="清除 XLSX 中的筛选和排序条件" :disabled="saving || updatingStructure || sheetProtected || Boolean(dirtyCount)" @click="persistDataView('clear')">清除条件</button>
        <span v-if="!activeDataRegion.filterState.editable" class="validation-hint">高级筛选条件只读</span>
        <span>{{ dataViewLoading ? '载入数据…' : `${dataViewRows.length.toLocaleString()} 行` }}</span>
        <button :disabled="!dataViewRows.length" @click="navigateDataResult(-1)">上一条</button>
        <button :disabled="!dataViewRows.length" @click="navigateDataResult(1)">下一条</button>
      </template>
      <template v-if="validationSelection">
        <button v-if="!selectedValidation" title="为当前连续选区创建数据验证规则" :disabled="!canEditDataValidation" @click="editDataValidationRule('create')">新建验证</button>
        <template v-else>
          <button title="编辑当前单元格所属的数据验证规则" :disabled="!canEditDataValidation" @click="editDataValidationRule('update')">编辑验证</button>
          <button title="把当前验证规则重新应用到当前连续选区" :disabled="!canEditDataValidation" @click="applyValidationToSelection">应用选区</button>
          <button title="删除当前数据验证规则" :disabled="!canEditDataValidation" @click="deleteDataValidationRule">删除验证</button>
        </template>
      </template>
      <span v-if="selectedValidation" class="validation-hint" :title="selectedValidation.error || selectedValidation.prompt || ''">验证：{{ validationLabel(selectedValidation) }}</span>
      <template v-if="conditionalSelection">
        <button title="为当前连续选区创建基础条件格式" :disabled="!canEditConditionalFormat" @click="editConditionalFormatRule('create')">新建条件格式</button>
        <template v-if="selectedConditionalFormats.length > 1">
          <button title="查看上一条命中规则" @click="cycleConditionalFormat(-1)">上一规则</button>
          <button title="查看下一条命中规则" @click="cycleConditionalFormat(1)">下一规则</button>
        </template>
        <template v-if="selectedConditionalFormat?.editable">
          <button title="编辑当前单元格命中的条件格式规则" :disabled="!canEditConditionalFormat" @click="editConditionalFormatRule('update')">编辑条件格式</button>
          <button :title="selectedConditionalGroupSize > 1 ? '同范围多规则组共享 sqref；请先保留原范围，避免隐式改变其他规则' : '把当前条件格式规则重新应用到选区'" :disabled="!canEditConditionalFormat || selectedConditionalGroupSize > 1" @click="applyConditionalFormatToSelection">应用条件选区</button>
          <button title="提高当前规则的全工作表优先级" :disabled="!canMoveConditionalFormatUp" @click="moveConditionalFormatRule('move_up')">提高优先级</button>
          <button title="降低当前规则的全工作表优先级" :disabled="!canMoveConditionalFormatDown" @click="moveConditionalFormatRule('move_down')">降低优先级</button>
          <button v-if="selectedConditionalGroupSize > 1" title="把当前规则从共享 sqref 中拆出，并应用到当前选区" :disabled="!canSplitConditionalFormat" @click="splitConditionalFormatRule">拆分规则</button>
          <button v-else-if="conditionalMergeCandidate" title="把当前独立规则重新并入范围完全相同的规则组" :disabled="!canEditConditionalFormat" @click="mergeConditionalFormatRule">合并同范围</button>
          <button title="删除当前条件格式规则" :disabled="!canEditConditionalFormat" @click="deleteConditionalFormatRule">删除条件格式</button>
        </template>
        <span v-else-if="selectedConditionalFormat" class="validation-hint">当前条件格式超出安全子集，只读：{{ selectedConditionalFormat.kind }}</span>
        <span v-if="selectedConditionalFormat" class="validation-hint" :title="conditionalFormatConflictHint">
          条件 {{ selectedConditionalFormatPosition + 1 }}/{{ selectedConditionalFormats.length }} · 优先级 {{ selectedConditionalFormat.priority }} · {{ selectedConditionalFormat.kind }}{{ selectedConditionalFormat.stopIfTrue ? ' · 命中即停止' : '' }}{{ selectedConditionalGroupSize > 1 ? ` · 同范围组 ${selectedConditionalFormat.ruleIndex + 1}/${selectedConditionalGroupSize}` : '' }}
        </span>
      </template>
    </div>

    <div v-if="workbook && sheetInfo" class="drawing-toolbar" aria-label="工作表绘图对象">
      <strong>绘图对象 {{ sheetInfo.drawings.length }}</strong>
      <select v-model="newChartType" class="drawing-series-select" title="选择要创建的图表类型">
        <option value="column">柱形图</option>
        <option value="line">折线图</option>
        <option value="pie">饼图</option>
        <option value="scatter">散点图</option>
      </select>
      <button class="drawing-action" :disabled="!canCreateChart" @click="createChartFromSelection">从选区创建图表</button>
      <button
        v-for="drawing in sheetInfo.drawings"
        :key="drawing.id"
        :class="{ active: selectedDrawing?.id === drawing.id }"
        :title="drawingTooltip(drawing)"
        @click="navigateDrawing(drawing)"
      >
        <span>{{ drawingKindLabel(drawing) }}</span>
        <b>{{ drawing.chart?.title || drawing.name || `对象 ${drawing.id}` }}</b>
        <small>{{ drawingAnchorLabel(drawing) }}<template v-if="drawing.chart"> · {{ drawing.chart.series.length }} 系列</template></small>
      </button>
      <template v-if="selectedDrawing?.editable">
        <button class="drawing-action" :disabled="!canEditDrawing" @click="editDrawingMetadata">编辑名称</button>
        <button class="drawing-action" :disabled="!canApplyDrawingSelection" @click="applyDrawingSelection">应用当前选区</button>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canEditChartTitle" @click="editChartTitle">编辑图表标题</button>
        <select v-if="selectedDrawing.chart?.series.length" v-model.number="selectedChartSeriesIndex" class="drawing-series-select" title="选择要编辑的图表系列">
          <option v-for="series in selectedDrawing.chart.series" :key="series.index" :value="series.index">系列 {{ series.index + 1 }} · {{ series.name || '未命名' }}</option>
        </select>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canEditChartSeries" @click="editChartSeries">编辑系列引用</button>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canEditChartSeriesName" @click="editChartSeriesName">编辑系列名称</button>
        <span v-if="selectedDrawing.chart" class="chart-color-controls" aria-label="系列颜色">
          <button
            v-for="color in chartThemePalette"
            :key="color"
            class="chart-color-swatch"
            :class="{ active: targetSeriesColor.toUpperCase() === color.toUpperCase() }"
            :style="{ backgroundColor: color }"
            :title="`系列颜色 ${color}`"
            :disabled="!canEditChartSeriesColor"
            @click="targetSeriesColor = color"
          ></button>
          <input v-model="targetSeriesColor" type="color" title="自定义系列颜色" :disabled="!canEditChartSeriesColor" />
          <button class="drawing-action" :disabled="!canApplyChartSeriesColor" @click="applyChartSeriesColor">应用颜色</button>
        </span>
        <select v-if="selectedDrawing.chart" v-model="targetChartType" class="drawing-series-select" title="选择目标图表类型">
          <option value="column">柱形图</option>
          <option value="line">折线图</option>
          <option value="pie">饼图</option>
          <option value="scatter">散点图</option>
        </select>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canChangeChartType" @click="changeSelectedChartType">切换类型</button>
        <button v-if="selectedDrawing.chart && selectedDrawing.chart.chartType !== 'pie'" class="drawing-action" :disabled="!canEditChartAxes" @click="editChartAxes">编辑坐标轴</button>
        <select v-if="selectedDrawing.chart" v-model="targetLegendPosition" class="drawing-series-select" title="选择图例位置">
          <option value="right">图例：右侧</option>
          <option value="left">图例：左侧</option>
          <option value="top">图例：顶部</option>
          <option value="bottom">图例：底部</option>
          <option value="top_right">图例：右上</option>
          <option value="none">隐藏图例</option>
        </select>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canApplyLegendPosition" @click="applyChartLegendPosition">应用图例</button>
        <label v-if="selectedDrawing.chart" class="drawing-label-option"><input v-model="targetDataLabels.showValue" type="checkbox" />数值</label>
        <label v-if="selectedDrawing.chart" class="drawing-label-option"><input v-model="targetDataLabels.showCategoryName" type="checkbox" />分类</label>
        <label v-if="selectedDrawing.chart" class="drawing-label-option"><input v-model="targetDataLabels.showSeriesName" type="checkbox" />系列</label>
        <label v-if="selectedDrawing.chart?.chartType === 'pie'" class="drawing-label-option"><input v-model="targetDataLabels.showPercent" type="checkbox" />百分比</label>
        <button v-if="selectedDrawing.chart" class="drawing-action" :disabled="!canApplyDataLabels" @click="applyChartDataLabels">应用标签</button>
        <button v-if="selectedDrawing.chart" class="drawing-action danger" :disabled="!canDeleteChart" @click="deleteSelectedChart">删除图表</button>
      </template>
      <em>{{ selectedDrawing && !selectedDrawing.editable ? '该对象不是标准双单元格锚点，当前只读' : '安全事务只修改目标对象；复杂图表结构继续只读' }}</em>
    </div>

    <section v-if="selectedDrawing?.chart" class="workbook-chart-preview" aria-label="工作簿图表本地预览">
      <header>
        <div><strong>{{ selectedDrawing.chart.title || selectedDrawing.name }}</strong><span>{{ drawingKindLabel(selectedDrawing) }} · 本地读取系列源数据 · 最多预览 60 项</span></div>
        <small v-if="chartPreviewLoading">正在读取图表数据…</small>
        <small v-else-if="chartPreviewError" class="error">{{ chartPreviewError }}</small>
        <small v-else>{{ chartPreview?.rows.length || 0 }} 个可验证数据点</small>
      </header>
      <TableChartEditor
        v-if="chartPreview && !chartPreviewLoading"
        readonly
        :headers="chartPreview.headers"
        :column-ids="chartPreview.columnIds"
        :column-types="chartPreview.columnTypes"
        :rows="chartPreview.rows"
        :row-indices="chartPreview.rowIndices"
        :config="chartPreview.config"
      />
    </section>

    <main class="workbook-main">
      <div v-if="loading" class="workbook-state"><div class="loader"></div><strong>正在解析 XLSX 工作簿</strong></div>
      <div v-else-if="error" class="workbook-state error"><strong>无法打开工作簿</strong><p>{{ error }}</p><button @click="loadWorkbook">重试</button></div>
      <template v-else-if="workbook && sheetInfo">
        <div v-if="dirtyCount || sheetInfo.truncatedColumns || pageLoading || updatingStructure || calculationCount || calculationErrors" class="workbook-status">
          <span v-if="dirtyCount">{{ dirtyCount }} 个更改项尚未保存</span>
          <span v-if="sheetInfo.truncatedColumns">当前显示前 {{ sheetInfo.returnedColumns }} 列</span>
          <span v-if="pageLoading">正在载入行数据…</span>
          <span v-if="updatingStructure">正在更新工作表结构…</span>
          <span v-if="calculationCount">已重算 {{ calculationCount }} 个公式</span>
          <span v-if="calculationErrors" class="calculation-error">{{ calculationErrors }} 个公式错误</span>
        </div>
        <div ref="scrollRef" class="sheet-scroll" @scroll="handleScroll">
          <div class="sheet-canvas" :style="{ width: `${sheetWidth}px` }">
            <div class="sheet-header" :style="gridStyle">
              <div class="row-number corner" title="选择当前工作区" @pointerdown="selectAllCells">#</div>
              <div v-for="column in canvasColumnCount" :key="column" class="column-header" :class="{ active: isColumnSelected(column - 1), frozen: column <= effectiveFreeze.columns, hidden: columnState(column - 1).hidden, outlined: columnState(column - 1).outlineLevel }" :style="frozenColumnStyle(column - 1, true)" :title="axisStateTitle('column', column - 1)" @pointerdown="selectColumn(column - 1, $event)">{{ columnLabel(column - 1) }}</div>
            </div>
            <div class="virtual-sheet" :style="{ height: `${sheetHeight}px` }">
              <div v-for="row in visibleRows" :key="row.index" class="sheet-row" :style="[rowLayoutStyle(row.index), gridStyle]">
                <div class="row-number" :class="{ active: isRowSelected(row.index), hidden: rowState(row.index).hidden, outlined: rowState(row.index).outlineLevel }" :title="axisStateTitle('row', row.index)" @pointerdown="selectRow(row.index, $event)">{{ row.index + 1 }}</div>
                <div
                  v-for="column in canvasColumnCount"
                  :key="column"
                  class="workbook-cell"
                  :class="[
                    `cell-${cellAt(row.index, column - 1).kind}`,
                    {
                      formula: Boolean(cellAt(row.index, column - 1).formula),
                      'array-formula-anchor': isArrayFormulaAnchor(row.index, column - 1),
                      'array-formula-range': Boolean(arrayFormulaAt(row.index, column - 1)),
                      'array-formula-conflict': isArrayFormulaConflict(row.index, column - 1),
                      selected: isSelected(row.index, column - 1),
                      'in-range': isInSelection(row.index, column - 1),
                      'fill-preview': isInFillPreview(row.index, column - 1),
                      dirty: isDirty(activeSheet, row.index, column - 1),
                      editable: isEditableCell(row.index, column - 1),
                      'merged-anchor': isMergedAnchor(row.index, column - 1),
                      'merged-covered': isMergedCovered(row.index, column - 1),
                      'in-table': tableAt(row.index, column - 1),
                      'table-header': isTableHeader(row.index, column - 1),
                      validated: validationAt(row.index, column - 1),
                      frozen: row.index < effectiveFreeze.rows || column <= effectiveFreeze.columns,
                    },
                  ]"
                  :title="cellTitle(row.index, column - 1)"
                  :style="[cellStyleCss(row.index, column - 1), conditionalCellStyle(row.index, column - 1), frozenColumnStyle(column - 1)]"
                  @pointerdown="startCellSelection(row.index, column - 1, $event)"
                  @pointerenter="extendCellSelection(row.index, column - 1)"
                  @dblclick="beginCellEdit(row.index, column - 1)"
                >
                  <span class="cell-content">
                    <span
                      v-if="conditionalIconSymbol(row.index, column - 1)"
                      class="conditional-icon"
                      :style="{ color: conditionalIconColor(row.index, column - 1) }"
                    >{{ conditionalIconSymbol(row.index, column - 1) }}</span>
                    <span v-if="!conditionalIconHidesValue(row.index, column - 1)">{{ cellDisplay(row.index, column - 1) }}</span>
                  </span>
                  <span v-if="isFillHandleCell(row.index, column - 1)" class="fill-handle" title="拖动填充" @pointerdown.stop="startFill($event)"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { AlignCenter as AlignCenterIcon, AlignLeft as AlignLeftIcon, AlignRight as AlignRightIcon, ArrowLeft as ArrowLeftIcon, Bold as BoldIcon, Calculator as CalculatorIcon, ClipboardPaste as PasteIcon, Copy as CopyIcon, FileSpreadsheet as SheetIcon, FunctionSquare as FunctionIcon, Grid2X2 as BorderIcon, Italic as ItalicIcon, PaintBucket as FillIcon, Printer as PrinterIcon, Redo2 as RedoIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Table2 as TableIcon, Type as TypeIcon, Underline as UnderlineIcon, Undo2 as UndoIcon, WrapText as WrapIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import { getActiveThemeTone } from '../config/themePresets'
import { conditionalExpressionReferences, evaluateConditionalExpression, parseConditionalExpression } from '../utils/conditionalExpression'
import TableChartEditor from '../components/TableChartEditor.vue'

interface WorkbookRangeReference { sheet: string; top: number; bottom: number; left: number; right: number }
interface WorkbookDefinedName { name: string; formula: string; scope?: string; hidden: boolean; reference?: WorkbookRangeReference }
interface WorkbookPivotField { index: number; name: string; role: string; valueType: string }
interface WorkbookPivotDataField { sourceIndex: number; name: string; aggregation: string; supported: boolean }
interface WorkbookPivotWritebackAudit { status: string; allowed: boolean; blockers: string[]; pivotFieldItemsComplete: boolean; rowItemsComplete: boolean; columnItemsComplete: boolean; outputCellsPresent: boolean }
interface WorkbookPivotAudit { status: string; rebuildCandidate: boolean; blockers: string[]; layoutRange?: string; cacheFieldCount: number; cacheRecordCount?: number; rowFieldCount: number; columnFieldCount: number; pageFieldCount: number; dataFieldCount: number; fields: WorkbookPivotField[]; dataFields: WorkbookPivotDataField[]; writeback: WorkbookPivotWritebackAudit }
interface WorkbookPivotTable { name: string; part: string; sheet?: string; cacheId?: number; sourceType: string; sourceSheet?: string; sourceRange?: string; connectionId?: number; refreshOnLoad: boolean; audit: WorkbookPivotAudit }
interface WorkbookPivotPreviewKey { fieldIndex: number; fieldName: string; value: string; kind: string }
interface WorkbookPivotPreviewMeasure { sourceIndex: number; name: string; aggregation: string; value?: number | null; formattedValue: string; contributingCount: number }
interface WorkbookPivotPreviewGroup { rowKeys: WorkbookPivotPreviewKey[]; columnKeys: WorkbookPivotPreviewKey[]; measures: WorkbookPivotPreviewMeasure[] }
interface WorkbookPivotPreviewResult { pivotName: string; sourceSheet: string; sourceRange: string; sourceRowCount: number; appliedDraftCount: number; groups: WorkbookPivotPreviewGroup[] }
interface WorkbookPivotRebuildImpact { part: string; role: string; plannedAction: string }
interface WorkbookPivotRebuildGate { id: string; status: string }
interface WorkbookPivotRebuildPlan { pivotName: string; status: string; execution: string; writesUserFile: boolean; temporaryCopyVerified: boolean; sourcePackageDigest: string; isolatedPackageDigest: string; sourceSheet?: string; sourceRange?: string; outputSheet?: string; outputRange?: string; affectedParts: WorkbookPivotRebuildImpact[]; preservedPartCount: number; blockers: string[]; gates: WorkbookPivotRebuildGate[] }
interface WorkbookPivotCacheFieldRebuild { index: number; name: string; valueType: string; sharedItemCount: number; recordEncoding: string }
interface WorkbookPivotCacheRebuildResult { pivotName: string; status: string; execution: string; writesUserFile: boolean; sourceRecordCount: number; rebuiltRecordCount: number; rebuiltParts: string[]; preservedPartCount: number; sourcePackageDigest: string; isolatedPackageDigest: string; packageValid: boolean; semanticReparseValid: boolean; untouchedPartsPreserved: boolean; fields: WorkbookPivotCacheFieldRebuild[]; gates: WorkbookPivotRebuildGate[] }
interface WorkbookPivotSynchronizedRebuildResult { pivotName: string; status: string; execution: string; writesUserFile: boolean; sourceRecordCount: number; rebuiltRecordCount: number; visibleRowItemCount: number; visibleColumnItemCount: number; outputCellCount: number; rebuiltParts: string[]; preservedPartCount: number; sourcePackageDigest: string; isolatedPackageDigest: string; packageValid: boolean; semanticReparseValid: boolean; outputValuesVerified: boolean; untouchedPartsPreserved: boolean; fields: WorkbookPivotCacheFieldRebuild[]; gates: WorkbookPivotRebuildGate[] }
interface WorkbookPivotExpandedRebuildResult { pivotName: string; status: string; execution: string; writesUserFile: boolean; rebuiltRecordCount: number; addedSharedItemCount: number; removedSharedItemCount: number; visibleRowItemCount: number; visibleColumnItemCount: number; oldOutputRange: string; newOutputRange: string; outputCellCount: number; clearedStaleCellCount: number; extendedStyleCellCount: number; rebuiltParts: string[]; preservedPartCount: number; sourcePackageDigest: string; isolatedPackageDigest: string; packageValid: boolean; semanticReparseValid: boolean; outputValuesVerified: boolean; untouchedPartsPreserved: boolean; fields: WorkbookPivotCacheFieldRebuild[]; gates: WorkbookPivotRebuildGate[] }
interface WorkbookPivotSavedCopyResult { status: string; saveMode: string; layoutVariant: string; aggregationVariant: string; pivotName: string; targetPath: string; targetSignature: string; targetDigest: string; sourceSignature: string; sourceDigest: string; sourceUnchanged: boolean; outputBytes: number; outputRange: string; outputCellCount: number; changedParts: string[]; structuralReopenVerified: boolean; semanticReopenVerified: boolean; outputValuesVerified: boolean; untouchedPartsPreserved: boolean }
interface WorkbookPivotAggregationVariant { aggregation: string; status: string; outputRange: string; outputCellCount: number; styledOutputCellCount: number; isolatedPackageDigest: string }
interface WorkbookPivotLayoutVariant { layout: string; rowFieldCount: number; columnFieldCount: number; dataFieldCount: number; groupCount: number; measureCount: number; outputValueCount: number; outputRange: string; outputCellCount: number; styledOutputCellCount: number; isolatedPackageDigest: string; status: string }
interface WorkbookPivotVariantVerificationResult { pivotName: string; status: string; execution: string; writesUserFile: boolean; aggregationVariants: WorkbookPivotAggregationVariant[]; layoutVariants: WorkbookPivotLayoutVariant[]; packageVariantCount: number; layoutPackageVariantCount: number; semanticVariantCount: number; sourcePackageDigest: string; packageVariantsVerified: boolean; semanticVariantsVerified: boolean; gates: WorkbookPivotRebuildGate[] }
interface WorkbookSlicer { name: string; part: string; sheet?: string; cacheName?: string }
interface WorkbookExternalLink { part: string; kind: string; cachedItemCount: number; targetKind?: string }
interface WorkbookDataConnection { id?: number; name: string; kind: string; refreshOnLoad: boolean; background: boolean; saveData: boolean }
interface WorkbookLinkedDataSummary { totalObjectCount: number; localPivotCount: number; connectionBackedPivotCount: number; slicerCount: number; externalLinkCount: number; connectionCount: number; refreshRiskCount: number }
interface WorkbookLinkedDataPolicy { mode: string; metadataVisible: boolean; refreshAllowed: boolean; objectEditingAllowed: boolean; externalTargetsFollowed: boolean; sensitiveFieldsExposed: boolean }
interface WorkbookLinkedData { pivotTables: WorkbookPivotTable[]; slicers: WorkbookSlicer[]; externalLinks: WorkbookExternalLink[]; connections: WorkbookDataConnection[]; externalRelationshipCount: number; summary: WorkbookLinkedDataSummary; policy: WorkbookLinkedDataPolicy }
interface WorkbookProtection { enabled: boolean; lockStructure: boolean; lockWindows: boolean; lockRevision: boolean; passwordProtected: boolean }
interface WorkbookDocument { path: string; size: number; signature: string; sheets: string[]; definedNames: WorkbookDefinedName[]; linkedData: WorkbookLinkedData; protection: WorkbookProtection }
interface WorkbookCellStyle {
  styleId: number
  namedStyle?: string
  numberFormat: string
  fontName: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  fontColor?: string
  fillColor?: string
  borderStyle: string
  borderColor?: string
  borderTop: WorkbookBorderSide
  borderRight: WorkbookBorderSide
  borderBottom: WorkbookBorderSide
  borderLeft: WorkbookBorderSide
  horizontalAlignment: string
  wrapText: boolean
}
interface WorkbookStylePatch {
  namedStyle?: string
  numberFormat?: string
  fontName?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontColor?: string
  fillColor?: string
  borderStyle?: string
  borderColor?: string
  borderTop?: WorkbookBorderSide
  borderRight?: WorkbookBorderSide
  borderBottom?: WorkbookBorderSide
  borderLeft?: WorkbookBorderSide
  horizontalAlignment?: string
  wrapText?: boolean
}
interface WorkbookCell { value: string; formula?: string; kind: string; style: WorkbookCellStyle }
interface WorkbookRowHeight { row: number; height: number }
interface WorkbookColumnWidth { startColumn: number; endColumn: number; width: number }
interface WorkbookMergeRange { top: number; bottom: number; left: number; right: number }
interface WorkbookFreezePane { rows: number; columns: number }
interface WorkbookFilterState { filterColumn?: number; query?: string; sortColumn?: number; sortDirection?: 'asc' | 'desc'; editable: boolean }
interface WorkbookTable { name: string; displayName: string; range: WorkbookMergeRange; columns: string[]; totalsRowShown: boolean; styleName?: string; showFirstColumn: boolean; showLastColumn: boolean; showRowStripes: boolean; showColumnStripes: boolean; filterState: WorkbookFilterState }
interface WorkbookDataValidation { ranges: WorkbookMergeRange[]; kind: string; operator?: string; formula1?: string; formula2?: string; allowBlank: boolean; showErrorMessage: boolean; errorTitle?: string; error?: string; promptTitle?: string; prompt?: string }
interface WorkbookDataValidationChange { sheet: string; action: 'create' | 'update' | 'delete'; validationIndex?: number; validation?: WorkbookDataValidation }
interface WorkbookConditionalFormatStyle { fontColor?: string; fillColor?: string; bold: boolean }
interface WorkbookConditionalColorScalePoint { kind: string; value?: string; color: string; resolvedValue?: string }
interface WorkbookConditionalColorScale { points: WorkbookConditionalColorScalePoint[] }
interface WorkbookConditionalThreshold { kind: string; value?: string; resolvedValue?: string }
interface WorkbookConditionalDataBar { minimum: WorkbookConditionalThreshold; maximum: WorkbookConditionalThreshold; color: string; showValue: boolean; minLength: number; maxLength: number }
interface WorkbookConditionalIconThreshold { kind: string; value?: string; resolvedValue?: string; inclusive: boolean }
interface WorkbookConditionalIconSet { iconSet: string; thresholds: WorkbookConditionalIconThreshold[]; reverse: boolean; showValue: boolean }
interface WorkbookConditionalFormatRule { groupIndex: number; ruleIndex: number; ranges: WorkbookMergeRange[]; kind: string; operator?: string; formula1?: string; formula2?: string; priority: number; stopIfTrue: boolean; style: WorkbookConditionalFormatStyle; colorScale?: WorkbookConditionalColorScale; dataBar?: WorkbookConditionalDataBar; iconSet?: WorkbookConditionalIconSet; editable: boolean }
interface WorkbookConditionalFormatChange { sheet: string; action: 'create' | 'update' | 'delete' | 'move_up' | 'move_down' | 'split' | 'merge'; groupIndex?: number; ruleIndex?: number; rule?: WorkbookConditionalFormatRule }
interface WorkbookDrawingAnchor { row: number; column: number; rowOffset: number; columnOffset: number }
interface WorkbookChartSeries { index: number; name?: string; nameEditable: boolean; color?: string; colorEditable: boolean; categories?: string; values?: string; editable: boolean }
interface WorkbookChartDataLabels { showValue: boolean; showCategoryName: boolean; showSeriesName: boolean; showPercent: boolean }
interface WorkbookChart { chartType: string; title?: string; titleEditable: boolean; categoryAxisTitle?: string; valueAxisTitle?: string; legendPosition: 'none' | 'left' | 'right' | 'top' | 'bottom' | 'top_right'; presentationEditable: boolean; dataLabels: WorkbookChartDataLabels; dataLabelsEditable: boolean; series: WorkbookChartSeries[] }
interface WorkbookDrawingObject { id: string; objectId: string; drawingPart: string; anchorIndex: number; anchorKind: string; name: string; description?: string; kind: string; from: WorkbookDrawingAnchor; to?: WorkbookDrawingAnchor; part?: string; chart?: WorkbookChart; editable: boolean }
interface WorkbookDrawingChange { sheet: string; drawingPart: string; anchorIndex: number; objectId: string; action: 'update_metadata' | 'move_resize' | 'update_chart_title' | 'update_chart_series' | 'create_chart' | 'delete_chart' | 'change_chart_type' | 'update_chart_presentation' | 'update_chart_data_labels' | 'update_chart_series_name' | 'update_chart_series_color'; name?: string; description?: string; from?: WorkbookDrawingAnchor; to?: WorkbookDrawingAnchor; chartTitle?: string; seriesIndex?: number; seriesName?: string; seriesColor?: string; seriesCategories?: string; seriesValues?: string; chartType?: string; categoryAxisTitle?: string; valueAxisTitle?: string; legendPosition?: string; dataLabels?: WorkbookChartDataLabels; sourceRange?: WorkbookMergeRange }
interface WorkbookChartPreview { headers: string[]; columnIds: string[]; columnTypes: string[]; rows: string[][]; rowIndices: number[]; config: { chartType: 'bar' | 'line' | 'pie' | 'scatter'; categoryColumn: string; valueColumn: string; seriesColumn: string; aggregation: 'sum'; nullStrategy: 'skip'; showLegend: boolean; legendPosition: WorkbookChart['legendPosition']; categoryAxisTitle?: string; valueAxisTitle?: string; seriesColors: Record<string, string>; dataLabels?: WorkbookChartDataLabels } }
interface WorkbookPageMargins { left?: number; right?: number; top?: number; bottom?: number; header?: number; footer?: number }
type WorkbookPageMarginKey = keyof WorkbookPageMargins
interface WorkbookPageLayoutDraft { printArea?: WorkbookMergeRange; orientation: 'portrait' | 'landscape'; paperSize: number; scalingMode: 'scale' | 'fit'; scale: number; fitToWidth: number; fitToHeight: number; margins: Record<WorkbookPageMarginKey, number> }
interface WorkbookPageSetup { orientation?: string; paperSize?: number; scale?: number; fitToWidth?: number; fitToHeight?: number; firstPageNumber?: number; useFirstPageNumber: boolean; horizontalDpi?: number; verticalDpi?: number; blackAndWhite: boolean; draft: boolean; fitToPage: boolean }
interface WorkbookPrintOptions { gridLines: boolean; headings: boolean; horizontalCentered: boolean; verticalCentered: boolean }
interface WorkbookPrintOptionsDraft extends WorkbookPrintOptions { blackAndWhite: boolean; draft: boolean; useFirstPageNumber: boolean; firstPageNumber: number }
interface WorkbookHeaderFooter { oddHeader?: string; oddFooter?: string; evenHeader?: string; evenFooter?: string; firstHeader?: string; firstFooter?: string; differentOddEven: boolean; differentFirstPage: boolean; scaleWithDocument: boolean; alignWithMargins: boolean }
interface WorkbookHeaderFooterDraft { oddHeader: string; oddFooter: string; evenHeader: string; evenFooter: string; firstHeader: string; firstFooter: string; differentOddEven: boolean; differentFirstPage: boolean; scaleWithDocument: boolean; alignWithMargins: boolean }
interface WorkbookSheetProtection { enabled: boolean; passwordProtected: boolean; blockedActions: string[] }
interface WorkbookPageLayout { printArea?: WorkbookMergeRange; margins: WorkbookPageMargins; setup: WorkbookPageSetup; options: WorkbookPrintOptions; headerFooter: WorkbookHeaderFooter; protection: WorkbookSheetProtection }
interface WorkbookArrayFormula { kind: 'legacy_array' | 'dynamic_array'; anchorRow: number; anchorColumn: number; range: WorkbookMergeRange; formula: string; declaredCellCount: number; cachedCellCount: number; occupiedCellCount: number; missingCachedCellCount: number; foreignFormulaCellCount: number; cachedValueTypes: Record<'number' | 'text' | 'boolean' | 'error' | 'date' | 'other', number>; errorCacheCount: number; errorCacheCells: string[]; conflictCells: string[]; diagnosticCellsTruncated: boolean; spillStatus: 'not_applicable' | 'cached_complete' | 'cache_incomplete' | 'potential_conflict'; calculationStatus: 'blocked'; writeStatus: 'blocked'; blocker: string }
interface WorkbookSheetPage {
  sheet: string
  rowOffset: number
  totalRows: number
  totalColumns: number
  returnedColumns: number
  rows: WorkbookCell[][]
  truncatedColumns: boolean
  defaultRowHeight: number
  defaultColumnWidth: number
  rowHeights: WorkbookRowHeight[]
  columnWidths: WorkbookColumnWidth[]
  rowStates: WorkbookRowState[]
  columnStates: WorkbookColumnState[]
  mergedCells: WorkbookMergeRange[]
  namedStyles: WorkbookNamedStyle[]
  freezePane: WorkbookFreezePane
  autoFilter?: WorkbookMergeRange
  autoFilterState: WorkbookFilterState
  tables: WorkbookTable[]
  dataValidations: WorkbookDataValidation[]
  conditionalFormats: WorkbookConditionalFormatRule[]
  arrayFormulas: WorkbookArrayFormula[]
  drawings: WorkbookDrawingObject[]
  pageLayout: WorkbookPageLayout
}
interface WorkbookBorderSide { style: string; color?: string }
interface WorkbookNamedStyle { name: string; builtinId?: number }
interface WorkbookCellEdit { sheet: string; row: number; column: number; input: string; kind: 'string' | 'number' | 'boolean' | 'empty' | 'formula' }
interface WorkbookCellStyleEdit { sheet: string; row: number; column: number; patch: WorkbookStylePatch }
interface WorkbookRowHeightEdit { sheet: string; row: number; height: number | null }
interface WorkbookColumnWidthEdit { sheet: string; startColumn: number; endColumn: number; width: number | null }
interface WorkbookRowState { row: number; hidden: boolean; outlineLevel: number; collapsed: boolean }
interface WorkbookColumnState { startColumn: number; endColumn: number; hidden: boolean; outlineLevel: number; collapsed: boolean }
interface WorkbookRowStateEdit extends WorkbookRowState { sheet: string }
interface WorkbookColumnStateEdit extends WorkbookColumnState { sheet: string }
interface WorkbookMergeEdit extends WorkbookMergeRange { sheet: string; action: 'merge' | 'unmerge' }
interface WorkbookStructureChange { sheet: string; axis: 'row' | 'column'; action: 'insert' | 'delete'; index: number; count: number }
interface WorkbookTableChange {
  sheet: string
  action: 'create' | 'resize' | 'rename' | 'set_style' | 'convert_to_range' | 'delete'
  tableName: string
  newTableName?: string
  styleName?: string
  showFirstColumn?: boolean
  showLastColumn?: boolean
  showRowStripes?: boolean
  showColumnStripes?: boolean
  range: WorkbookMergeRange
  columns?: string[]
}
interface WorkbookFilterChange {
  sheet: string
  target: 'worksheet' | 'table'
  action: 'apply' | 'clear'
  tableName?: string
  range: WorkbookMergeRange
  filterColumn?: number
  query?: string
  sortColumn?: number
  sortDirection?: 'asc' | 'desc'
}
interface WorkbookDefinedNameChange {
  action: 'create' | 'rename' | 'update_range' | 'delete'
  name: string
  newName?: string
  scope?: string
  targetSheet?: string
  range?: WorkbookMergeRange
}
interface CellSelection { sheet: string; row: number; column: number }
interface SelectionArea { top: number; bottom: number; left: number; right: number }
interface CellChange { key: string; before?: WorkbookCellEdit; after?: WorkbookCellEdit }
interface StyleChange { key: string; before?: WorkbookStylePatch; after?: WorkbookStylePatch }
interface RowHeightChange { key: string; before?: number | null; after?: number | null }
interface ColumnWidthChange { key: string; before?: number | null; after?: number | null }
interface MergeChange { key: string; before?: WorkbookMergeEdit; after?: WorkbookMergeEdit }
interface EditAction { changes?: CellChange[]; styleChanges?: StyleChange[]; rowHeightChanges?: RowHeightChange[]; columnWidthChanges?: ColumnWidthChange[]; mergeChanges?: MergeChange[] }
interface FormulaTranslation { formula: string; rowDelta: number; columnDelta: number }
interface WorkbookFormulaTarget { sheet: string; row: number; column: number }
interface WorkbookCalculatedCell { sheet: string; row: number; column: number; value: string; formattedValue: string; kind: string }
interface WorkbookCalculationDiagnostic { sheet: string; row: number; column: number; code: string; category: string }
interface WorkbookCalculationResult { cells: WorkbookCalculatedCell[]; diagnostics: WorkbookCalculationDiagnostic[]; evaluatedFormulaCount: number }

const PAGE_ROWS = 2_000
const MAX_BATCH_CELLS = 10_000
const MAX_SELECTION_AREAS = 32
const EXTRA_ROWS = 100
const EXTRA_COLUMNS = 5
const MIN_ROW_PIXELS = 24
const MIN_COLUMN_PIXELS = 38
const MAX_DATA_VIEW_ROWS = 50_000
const TABLE_STYLE_PRESETS = ['TableStyleLight1', 'TableStyleLight9', 'TableStyleMedium2', 'TableStyleMedium4', 'TableStyleMedium9', 'TableStyleDark1', 'TableStyleDark4']
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const dialog = useDialog()
const workbook = ref<WorkbookDocument | null>(null)
const activeSheet = ref('')
const sheetInfo = ref<WorkbookSheetPage | null>(null)
const loadedRows = ref(new Map<number, WorkbookCell[]>())
const loadedPages = new Set<number>()
const pendingConditionalDependencyPages = new Set<number>()
let conditionalDependencyLoading = false
const drafts = ref(new Map<string, WorkbookCellEdit>())
const styleDrafts = ref(new Map<string, WorkbookStylePatch>())
const rowHeightDrafts = ref(new Map<string, number | null>())
const columnWidthDrafts = ref(new Map<string, number | null>())
const mergeDrafts = ref(new Map<string, WorkbookMergeEdit>())
const updatingStructure = ref(false)
const selectedDefinedNameIndex = ref(-1)
const filterQuery = ref('')
const filterColumn = ref(-1)
const sortColumn = ref(-1)
const sortDirection = ref<'asc' | 'desc'>('asc')
const dataViewLoading = ref(false)
const dataViewPosition = ref(-1)
const sourceRowHeights = ref(new Map<number, number>())
const sourceColumnWidths = ref(new Map<number, number>())
const sourceRowStates = ref(new Map<number, WorkbookRowState>())
const sourceColumnStates = ref(new Map<number, WorkbookColumnState>())
const sourceMergedCells = ref<WorkbookMergeRange[]>([])
const undoStack = ref<EditAction[]>([])
const redoStack = ref<EditAction[]>([])
const selectedCell = ref<CellSelection | null>(null)
const selectedDrawingId = ref('')
const selectedChartSeriesIndex = ref(0)
const newChartType = ref<'column' | 'line' | 'pie' | 'scatter'>('column')
const targetChartType = ref<'column' | 'line' | 'pie' | 'scatter'>('column')
const targetLegendPosition = ref<'none' | 'left' | 'right' | 'top' | 'bottom' | 'top_right'>('right')
const targetDataLabels = ref<WorkbookChartDataLabels>({ showValue: false, showCategoryName: false, showSeriesName: false, showPercent: false })
const targetSeriesColor = ref('#2A6FDB')
const chartPreview = ref<WorkbookChartPreview | null>(null)
const chartPreviewLoading = ref(false)
const chartPreviewError = ref('')
let chartPreviewGeneration = 0
const selectedConditionalRuleKey = ref('')
const selectionAnchor = ref<CellSelection | null>(null)
const selectionAreas = ref<SelectionArea[]>([])
const fillPreview = ref<SelectionArea | null>(null)
const formulaInput = ref('')
const formulaInputRef = ref<HTMLInputElement | null>(null)
const loading = ref(true)
const pageLoading = ref(false)
const importing = ref(false)
const saving = ref(false)
const calculating = ref(false)
const error = ref('')
const showFormulas = ref(false)
const linkedDataModalOpen = ref(false)
const pivotPreviews = ref(new Map<string, WorkbookPivotPreviewResult>())
const pivotPreviewLoading = ref('')
const pivotRebuildPlans = ref(new Map<string, WorkbookPivotRebuildPlan>())
const pivotRebuildPlanLoading = ref('')
const pivotCacheRebuildResults = ref(new Map<string, WorkbookPivotCacheRebuildResult>())
const pivotCacheRebuildLoading = ref('')
const pivotSynchronizedRebuildResults = ref(new Map<string, WorkbookPivotSynchronizedRebuildResult>())
const pivotSynchronizedRebuildLoading = ref('')
const pivotExpandedRebuildResults = ref(new Map<string, WorkbookPivotExpandedRebuildResult>())
const pivotExpandedRebuildLoading = ref('')
const pivotCopyFileNames = ref(new Map<string, string>())
const pivotSavedCopyResults = ref(new Map<string, WorkbookPivotSavedCopyResult>())
const pivotSaveCopyLoading = ref('')
const pivotVariantVerificationResults = ref(new Map<string, WorkbookPivotVariantVerificationResult>())
const pivotVariantVerificationLoading = ref('')
const calculatedValues = ref(new Map<string, WorkbookCalculatedCell>())
const calculationCount = ref(0)
const calculationErrors = ref(0)
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)
let resizeObserver: ResizeObserver | null = null
let generation = 0
let wantedOffset = 0
let dragSelecting = false
let fillSource: SelectionArea | null = null
let filling = false

const workbookPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => workbookPath.value.split(/[\\/]/).pop() || '工作簿.xlsx')
const draftExtent = computed(() => {
  let row = -1
  let column = -1
  for (const edit of drafts.value.values()) {
    if (edit.sheet === activeSheet.value) { row = Math.max(row, edit.row); column = Math.max(column, edit.column) }
  }
  for (const key of styleDrafts.value.keys()) {
    const [sheet, rowText, columnText] = key.split('\u0000')
    if (sheet === activeSheet.value) { row = Math.max(row, Number(rowText)); column = Math.max(column, Number(columnText)) }
  }
  for (const key of rowHeightDrafts.value.keys()) {
    const [sheet, rowText] = key.split('\u0000')
    if (sheet === activeSheet.value) row = Math.max(row, Number(rowText))
  }
  for (const key of columnWidthDrafts.value.keys()) {
    const [sheet, columnText] = key.split('\u0000')
    if (sheet === activeSheet.value) column = Math.max(column, Number(columnText))
  }
  for (const edit of mergeDrafts.value.values()) {
    if (edit.sheet === activeSheet.value && edit.action === 'merge') { row = Math.max(row, edit.bottom); column = Math.max(column, edit.right) }
  }
  return { row, column }
})
const canvasRowCount = computed(() => Math.min(1_048_576, Math.max(EXTRA_ROWS, (sheetInfo.value?.totalRows || 0) + EXTRA_ROWS, draftExtent.value.row + 1)))
const canvasColumnCount = computed(() => {
  const info = sheetInfo.value
  if (!info) return 1
  if (info.truncatedColumns) return info.returnedColumns
  return Math.min(256, Math.max(12, info.returnedColumns + EXTRA_COLUMNS, draftExtent.value.column + 1))
})
const rowHeightKey = (sheet: string, row: number) => `${sheet}\u0000${row}`
const columnWidthKey = (sheet: string, column: number) => `${sheet}\u0000${column}`
const mergeKey = (sheet: string, range: WorkbookMergeRange) => `${sheet}\u0000${range.top}\u0000${range.bottom}\u0000${range.left}\u0000${range.right}`
const defaultRowPixels = computed(() => Math.max(MIN_ROW_PIXELS, (sheetInfo.value?.defaultRowHeight || 15) * 4 / 3 + 8))
const rowHeightPoints = (row: number) => {
  const draft = rowHeightDrafts.value.get(rowHeightKey(activeSheet.value, row))
  return draft === null ? (sheetInfo.value?.defaultRowHeight || 15) : (draft ?? sourceRowHeights.value.get(row) ?? sheetInfo.value?.defaultRowHeight ?? 15)
}
const emptyAxisState = { hidden: false, outlineLevel: 0, collapsed: false }
const rowState = (row: number) => sourceRowStates.value.get(row) || { row, ...emptyAxisState }
const columnState = (column: number) => sourceColumnStates.value.get(column) || { startColumn: column, endColumn: column, ...emptyAxisState }
const rowPixelHeight = (row: number) => rowState(row).hidden ? 8 : Math.max(MIN_ROW_PIXELS, rowHeightPoints(row) * 4 / 3 + 8)
const columnWidthUnits = (column: number) => {
  const draft = columnWidthDrafts.value.get(columnWidthKey(activeSheet.value, column))
  return draft === null ? (sheetInfo.value?.defaultColumnWidth || 8.43) : (draft ?? sourceColumnWidths.value.get(column) ?? sheetInfo.value?.defaultColumnWidth ?? 8.43)
}
const columnPixelWidth = (column: number) => columnState(column).hidden ? 12 : Math.max(MIN_COLUMN_PIXELS, columnWidthUnits(column) * 7 + 5)
const customRowDeltas = computed(() => {
  const rows = new Set<number>(sourceRowHeights.value.keys())
  sourceRowStates.value.forEach((state, row) => { if (state.hidden) rows.add(row) })
  for (const key of rowHeightDrafts.value.keys()) {
    const [sheet, row] = key.split('\u0000')
    if (sheet === activeSheet.value) rows.add(Number(row))
  }
  return Array.from(rows).sort((a, b) => a - b).map(row => ({ row, delta: rowPixelHeight(row) - defaultRowPixels.value }))
})
const rowOffset = (row: number) => row * defaultRowPixels.value + customRowDeltas.value.reduce((total, item) => item.row < row ? total + item.delta : total, 0)
const rowAtOffset = (offset: number) => {
  let low = 0
  let high = Math.max(0, canvasRowCount.value - 1)
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2)
    if (rowOffset(middle) <= offset) low = middle
    else high = middle - 1
  }
  return low
}
const columnPixels = computed(() => Array.from({ length: canvasColumnCount.value }, (_, column) => columnPixelWidth(column)))
const sheetWidth = computed(() => 52 + columnPixels.value.reduce((total, width) => total + width, 0))
const sheetHeight = computed(() => rowOffset(canvasRowCount.value))
const gridStyle = computed(() => ({ gridTemplateColumns: `52px ${columnPixels.value.map(width => `${width}px`).join(' ')}` }))
const dirtyCount = computed(() => drafts.value.size + styleDrafts.value.size + rowHeightDrafts.value.size + columnWidthDrafts.value.size + mergeDrafts.value.size)
const selectionBounds = computed(() => {
  const areas = selectionAreas.value
  return areas.length ? areas[areas.length - 1] : null
})
const selectedAxis = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area) return null
  if (area.left === 0 && area.right === canvasColumnCount.value - 1 && !(area.top === 0 && area.bottom === canvasRowCount.value - 1)) return { kind: 'row' as const, start: area.top, end: area.bottom }
  if (area.top === 0 && area.bottom === canvasRowCount.value - 1 && !(area.left === 0 && area.right === canvasColumnCount.value - 1)) return { kind: 'column' as const, start: area.left, end: area.right }
  return null
})
const currentMergedRanges = computed(() => {
  const ranges = sourceMergedCells.value.map(range => ({ ...range }))
  for (const edit of mergeDrafts.value.values()) {
    if (edit.sheet !== activeSheet.value) continue
    const index = ranges.findIndex(range => mergeKey(activeSheet.value, range) === mergeKey(edit.sheet, edit))
    if (edit.action === 'unmerge') { if (index >= 0) ranges.splice(index, 1) }
    else if (index < 0) ranges.push({ top: edit.top, bottom: edit.bottom, left: edit.left, right: edit.right })
  }
  return ranges.sort((left, right) => left.top - right.top || left.left - right.left)
})
const selectedMerge = computed(() => {
  const cell = selectedCell.value
  if (!cell || cell.sheet !== activeSheet.value) return null
  return currentMergedRanges.value.find(range => cell.row >= range.top && cell.row <= range.bottom && cell.column >= range.left && cell.column <= range.right) || null
})
const canMergeSelection = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || (area.top === area.bottom && area.left === area.right)) return false
  return !currentMergedRanges.value.some(range => area.top <= range.bottom && range.top <= area.bottom && area.left <= range.right && range.left <= area.right)
})
const selectedAddress = computed(() => {
  return selectionAreas.value.map(bounds => {
    const first = `${columnLabel(bounds.left)}${bounds.top + 1}`
    const last = `${columnLabel(bounds.right)}${bounds.bottom + 1}`
    return first === last ? first : `${first}:${last}`
  }).join(',')
})
const selectedEditable = computed(() => selectedCell.value ? isEditableCell(selectedCell.value.row, selectedCell.value.column) : false)
const effectiveFreeze = computed(() => sheetInfo.value?.freezePane || { rows: 0, columns: 0 })
const sheetProtected = computed(() => Boolean(sheetInfo.value?.pageLayout.protection.enabled))
const pageMarginFields: { key: WorkbookPageMarginKey; label: string }[] = [
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '上' },
  { key: 'bottom', label: '下' },
  { key: 'header', label: '页眉' },
  { key: 'footer', label: '页脚' },
]
const pageLayoutModalOpen = ref(false)
const printOptionsModalOpen = ref(false)
const headerFooterModalOpen = ref(false)
const headerFooterMode = ref<'odd' | 'even' | 'first'>('odd')
const pageLayoutDraft = ref<WorkbookPageLayoutDraft>({
  orientation: 'portrait',
  paperSize: 9,
  scalingMode: 'scale',
  scale: 100,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
})
const headerFooterDraft = ref<WorkbookHeaderFooterDraft>({
  oddHeader: '',
  oddFooter: '',
  evenHeader: '',
  evenFooter: '',
  firstHeader: '',
  firstFooter: '',
  differentOddEven: false,
  differentFirstPage: false,
  scaleWithDocument: true,
  alignWithMargins: true,
})
const printOptionsDraft = ref<WorkbookPrintOptionsDraft>({
  gridLines: false,
  headings: false,
  horizontalCentered: false,
  verticalCentered: false,
  blackAndWhite: false,
  draft: false,
  useFirstPageNumber: false,
  firstPageNumber: 1,
})
const activeHeaderFooterFields = computed(() => {
  const prefix = headerFooterMode.value === 'odd' ? 'odd' : headerFooterMode.value === 'even' ? 'even' : 'first'
  return {
    get header() { return headerFooterDraft.value[`${prefix}Header` as keyof WorkbookHeaderFooterDraft] as string },
    set header(value: string) { headerFooterDraft.value[`${prefix}Header` as 'oddHeader'] = value },
    get footer() { return headerFooterDraft.value[`${prefix}Footer` as keyof WorkbookHeaderFooterDraft] as string },
    set footer(value: string) { headerFooterDraft.value[`${prefix}Footer` as 'oddFooter'] = value },
  }
})
const hasHeaderFooterContent = computed(() => [
  headerFooterDraft.value.oddHeader,
  headerFooterDraft.value.oddFooter,
  headerFooterDraft.value.evenHeader,
  headerFooterDraft.value.evenFooter,
  headerFooterDraft.value.firstHeader,
  headerFooterDraft.value.firstFooter,
].some(Boolean))
const hasStoredHeaderFooter = computed(() => {
  const value = sheetInfo.value?.pageLayout.headerFooter
  return Boolean(value && [value.oddHeader, value.oddFooter, value.evenHeader, value.evenFooter, value.firstHeader, value.firstFooter].some(Boolean))
})
const storedHeaderFooterSummary = computed(() => {
  const value = sheetInfo.value?.pageLayout.headerFooter
  if (!value) return ''
  return [value.oddHeader, value.oddFooter, value.evenHeader, value.evenFooter, value.firstHeader, value.firstFooter].filter(Boolean).join('\n')
})
const hasStoredPrintOptions = computed(() => {
  const layout = sheetInfo.value?.pageLayout
  return Boolean(layout && (
    layout.options.gridLines
    || layout.options.headings
    || layout.options.horizontalCentered
    || layout.options.verticalCentered
    || layout.setup.blackAndWhite
    || layout.setup.draft
    || layout.setup.useFirstPageNumber
  ))
})
const storedPrintOptionsSummary = computed(() => {
  const layout = sheetInfo.value?.pageLayout
  if (!layout) return ''
  const labels = [
    layout.options.gridLines && '网格线',
    layout.options.headings && '行列标题',
    layout.options.horizontalCentered && '水平居中',
    layout.options.verticalCentered && '垂直居中',
    layout.setup.blackAndWhite && '黑白',
    layout.setup.draft && '草稿',
    layout.setup.useFirstPageNumber && `首页 ${layout.setup.firstPageNumber || 1}`,
  ].filter(Boolean)
  return labels.length ? `打印 ${labels.join(' · ')}` : ''
})
const pageLayoutSelection = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || area.bottom >= canvasRowCount.value || area.right >= canvasColumnCount.value) return null
  return area
})
const canEditPageLayout = computed(() => Boolean(workbook.value && sheetInfo.value && !saving.value && !updatingStructure.value && !sheetProtected.value && !dirtyCount.value))
const canEditPrintArea = computed(() => Boolean(canEditPageLayout.value && !workbook.value?.protection.lockStructure))
const syncPageLayoutDraft = () => {
  const layout = sheetInfo.value?.pageLayout
  if (!layout) return
  pageLayoutDraft.value = {
    printArea: layout.printArea ? { ...layout.printArea } : undefined,
    orientation: layout.setup.orientation === 'landscape' ? 'landscape' : 'portrait',
    paperSize: layout.setup.paperSize || 9,
    scalingMode: layout.setup.fitToPage ? 'fit' : 'scale',
    scale: layout.setup.scale || 100,
    fitToWidth: layout.setup.fitToWidth ?? 1,
    fitToHeight: layout.setup.fitToHeight ?? 0,
    margins: {
      left: layout.margins.left ?? 0.7,
      right: layout.margins.right ?? 0.7,
      top: layout.margins.top ?? 0.75,
      bottom: layout.margins.bottom ?? 0.75,
      header: layout.margins.header ?? 0.3,
      footer: layout.margins.footer ?? 0.3,
    },
  }
  printOptionsDraft.value = {
    ...layout.options,
    blackAndWhite: layout.setup.blackAndWhite,
    draft: layout.setup.draft,
    useFirstPageNumber: layout.setup.useFirstPageNumber,
    firstPageNumber: layout.setup.firstPageNumber || 1,
  }
  const headerFooter = layout.headerFooter
  headerFooterDraft.value = {
    oddHeader: headerFooter.oddHeader || '',
    oddFooter: headerFooter.oddFooter || '',
    evenHeader: headerFooter.evenHeader || '',
    evenFooter: headerFooter.evenFooter || '',
    firstHeader: headerFooter.firstHeader || '',
    firstFooter: headerFooter.firstFooter || '',
    differentOddEven: headerFooter.differentOddEven,
    differentFirstPage: headerFooter.differentFirstPage,
    scaleWithDocument: headerFooter.scaleWithDocument,
    alignWithMargins: headerFooter.alignWithMargins,
  }
  if (!headerFooter.differentOddEven && headerFooterMode.value === 'even') headerFooterMode.value = 'odd'
  if (!headerFooter.differentFirstPage && headerFooterMode.value === 'first') headerFooterMode.value = 'odd'
}
const containsCell = (range: WorkbookMergeRange, row: number, column: number) => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
const tableAt = (row: number, column: number) => sheetInfo.value?.tables.find(table => containsCell(table.range, row, column))
const isTableHeader = (row: number, column: number) => Boolean(sheetInfo.value?.tables.some(table => row === table.range.top && column >= table.range.left && column <= table.range.right))
const validationAt = (row: number, column: number) => sheetInfo.value?.dataValidations.find(validation => validation.ranges.some(range => containsCell(range, row, column)))
const selectedValidation = computed(() => selectedCell.value ? validationAt(selectedCell.value.row, selectedCell.value.column) : undefined)
const selectedValidationIndex = computed(() => selectedValidation.value ? (sheetInfo.value?.dataValidations.indexOf(selectedValidation.value) ?? -1) : -1)
const validationSelection = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || area.bottom >= canvasRowCount.value || area.right >= canvasColumnCount.value) return null
  return area
})
const canEditDataValidation = computed(() => Boolean(workbook.value && validationSelection.value && !saving.value && !updatingStructure.value && !sheetProtected.value && !dirtyCount.value))
const conditionalSelection = computed(() => validationSelection.value)
const conditionalFormatsAt = (row: number, column: number) => (sheetInfo.value?.conditionalFormats || [])
  .filter(rule => rule.ranges.some(range => containsCell(range, row, column)))
  .sort((left, right) => left.priority - right.priority)
const canEditConditionalFormat = computed(() => Boolean(workbook.value && conditionalSelection.value && !saving.value && !updatingStructure.value && !sheetProtected.value && !dirtyCount.value))
const conditionalRuleKey = (rule: WorkbookConditionalFormatRule) => `${rule.groupIndex}:${rule.ruleIndex}`
const selectedConditionalFormats = computed(() => selectedCell.value ? conditionalFormatsAt(selectedCell.value.row, selectedCell.value.column) : [])
const selectedConditionalFormat = computed(() => selectedConditionalFormats.value.find(rule => conditionalRuleKey(rule) === selectedConditionalRuleKey.value) || selectedConditionalFormats.value[0])
const selectedConditionalFormatPosition = computed(() => Math.max(0, selectedConditionalFormats.value.findIndex(rule => rule === selectedConditionalFormat.value)))
const selectedConditionalGroupSize = computed(() => selectedConditionalFormat.value
  ? (sheetInfo.value?.conditionalFormats || []).filter(rule => rule.groupIndex === selectedConditionalFormat.value?.groupIndex).length
  : 0)
const conditionalRangesEqual = (left: WorkbookMergeRange[], right: WorkbookMergeRange[]) => left.length === right.length && left.every((range, index) => {
  const candidate = right[index]
  return Boolean(candidate && range.top === candidate.top && range.bottom === candidate.bottom && range.left === candidate.left && range.right === candidate.right)
})
const conditionalMergeCandidate = computed(() => {
  const selected = selectedConditionalFormat.value
  if (!selected || selectedConditionalGroupSize.value !== 1) return undefined
  return (sheetInfo.value?.conditionalFormats || []).find(rule => rule.groupIndex !== selected.groupIndex && conditionalRangesEqual(rule.ranges, selected.ranges))
})
const canSplitConditionalFormat = computed(() => {
  const selected = selectedConditionalFormat.value
  const area = conditionalSelection.value
  return Boolean(canEditConditionalFormat.value && selected?.editable && selectedConditionalGroupSize.value > 1 && area && !conditionalRangesEqual(selected.ranges, [area]))
})
const orderedConditionalFormats = computed(() => [...(sheetInfo.value?.conditionalFormats || [])].sort((left, right) => left.priority - right.priority || left.groupIndex - right.groupIndex || left.ruleIndex - right.ruleIndex))
const selectedConditionalGlobalPosition = computed(() => orderedConditionalFormats.value.findIndex(rule => conditionalRuleKey(rule) === (selectedConditionalFormat.value ? conditionalRuleKey(selectedConditionalFormat.value) : '')))
const canMoveConditionalFormatUp = computed(() => Boolean(canEditConditionalFormat.value && selectedConditionalFormat.value?.editable && selectedConditionalGlobalPosition.value > 0))
const canMoveConditionalFormatDown = computed(() => Boolean(canEditConditionalFormat.value && selectedConditionalFormat.value?.editable && selectedConditionalGlobalPosition.value >= 0 && selectedConditionalGlobalPosition.value < orderedConditionalFormats.value.length - 1))
const conditionalFormatConflictHint = computed(() => selectedConditionalFormats.value.length > 1
  ? `${selectedConditionalFormats.value.length} 条规则覆盖当前单元格，按数字优先级从小到大执行；“命中即停止”会阻止后续规则。`
  : '当前单元格仅命中一条条件格式规则。')
const cycleConditionalFormat = (offset: number) => {
  const rules = selectedConditionalFormats.value
  if (!rules.length) return
  const next = (selectedConditionalFormatPosition.value + offset + rules.length) % rules.length
  selectedConditionalRuleKey.value = conditionalRuleKey(rules[next])
}
const expressionRuleMatches = (rule: WorkbookConditionalFormatRule, row: number, column: number) => {
  const expression = parseConditionalExpression(rule.formula1 || '')
  const anchor = rule.ranges[0]
  if (!expression || !anchor) return false
  return evaluateConditionalExpression(expression, {
    row,
    column,
    anchorRow: anchor.top,
    anchorColumn: anchor.left,
    rowCount: canvasRowCount.value,
    columnCount: canvasColumnCount.value,
    valueAt: (dependencyRow, dependencyColumn) => loadedRows.value.has(dependencyRow) ? cellAt(dependencyRow, dependencyColumn).value : undefined,
  })
}
const interpolateColor = (start: string, end: string, ratio: number) => {
  const bounded = Math.max(0, Math.min(1, ratio))
  const channel = (offset: number) => Math.round(parseInt(start.slice(offset, offset + 2), 16) + (parseInt(end.slice(offset, offset + 2), 16) - parseInt(start.slice(offset, offset + 2), 16)) * bounded).toString(16).padStart(2, '0')
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase()
}
const colorScaleFill = (rule: WorkbookConditionalFormatRule, value: string) => {
  const current = Number(value)
  const points = rule.colorScale?.points.map(point => ({ value: Number(point.resolvedValue ?? point.value), color: point.color })) || []
  if (!Number.isFinite(current) || !matchesFixedColorScale(points)) return undefined
  if (current <= points[0].value) return points[0].color
  if (current >= points[points.length - 1].value) return points[points.length - 1].color
  const upper = points.findIndex(point => current <= point.value)
  const lower = points[upper - 1]
  return interpolateColor(lower.color, points[upper].color, (current - lower.value) / (points[upper].value - lower.value))
}
const matchesFixedColorScale = (points: Array<{ value: number; color: string }>) => matchesColorScaleLength(points.length)
  && points.every((point, index) => Number.isFinite(point.value) && /^#[0-9A-F]{6}$/i.test(point.color) && (!index || points[index - 1].value <= point.value))
const matchesColorScaleLength = (length: number) => length === 2 || length === 3
const dataBarStyle = (rule: WorkbookConditionalFormatRule, value: string): CSSProperties | undefined => {
  const bar = rule.dataBar
  if (!value.trim()) return undefined
  const current = Number(value)
  const minimum = Number(bar?.minimum.resolvedValue ?? bar?.minimum.value)
  const maximum = Number(bar?.maximum.resolvedValue ?? bar?.maximum.value)
  if (!bar || !Number.isFinite(current) || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) return undefined
  if (!/^#[0-9A-F]{6}$/i.test(bar.color) || bar.minLength < 0 || bar.minLength > bar.maxLength || bar.maxLength > 100) return undefined
  const color = `${bar.color}99`
  const bounded = Math.max(minimum, Math.min(maximum, current))
  if (minimum >= 0) {
    const ratio = (bounded - minimum) / (maximum - minimum)
    const width = bar.minLength + (bar.maxLength - bar.minLength) * ratio
    return { backgroundImage: `linear-gradient(90deg, ${color} 0%, ${color} ${width}%, transparent ${width}%, transparent 100%)` }
  }
  if (maximum <= 0) {
    const ratio = (maximum - bounded) / (maximum - minimum)
    const width = bar.minLength + (bar.maxLength - bar.minLength) * ratio
    const start = 100 - width
    return { backgroundImage: `linear-gradient(90deg, transparent 0%, transparent ${start}%, ${color} ${start}%, ${color} 100%)` }
  }
  const trackStart = (100 - bar.maxLength) / 2
  const trackEnd = trackStart + bar.maxLength
  const axis = trackStart + bar.maxLength * (-minimum / (maximum - minimum))
  const end = bounded < 0
    ? axis - (axis - trackStart) * (bounded / minimum)
    : axis + (trackEnd - axis) * (bounded / maximum)
  const start = Math.min(axis, end)
  const finish = Math.max(axis, end)
  const axisStart = Math.max(0, axis - 0.25)
  const axisEnd = Math.min(100, axis + 0.25)
  return {
    backgroundImage: `linear-gradient(90deg, transparent 0%, transparent ${axisStart}%, #60646C ${axisStart}%, #60646C ${axisEnd}%, transparent ${axisEnd}%, transparent 100%), linear-gradient(90deg, transparent 0%, transparent ${start}%, ${color} ${start}%, ${color} ${finish}%, transparent ${finish}%, transparent 100%)`,
  }
}
interface ConditionalIconVisual { symbol: string; color: string; showValue: boolean }
const ICON_SET_VISUALS: Record<string, Array<{ symbol: string; color: string }>> = {
  '3Arrows': [{ symbol: '↓', color: '#D64545' }, { symbol: '→', color: '#D39E00' }, { symbol: '↑', color: '#26944A' }],
  '3ArrowsGray': [{ symbol: '↓', color: '#747B86' }, { symbol: '→', color: '#747B86' }, { symbol: '↑', color: '#747B86' }],
  '3Flags': [{ symbol: '⚑', color: '#D64545' }, { symbol: '⚑', color: '#D39E00' }, { symbol: '⚑', color: '#26944A' }],
  '3TrafficLights1': [{ symbol: '●', color: '#D64545' }, { symbol: '●', color: '#D39E00' }, { symbol: '●', color: '#26944A' }],
  '3TrafficLights2': [{ symbol: '◉', color: '#D64545' }, { symbol: '◉', color: '#D39E00' }, { symbol: '◉', color: '#26944A' }],
  '3Signs': [{ symbol: '◆', color: '#D64545' }, { symbol: '▲', color: '#D39E00' }, { symbol: '●', color: '#26944A' }],
  '3Symbols': [{ symbol: '✕', color: '#D64545' }, { symbol: '!', color: '#D39E00' }, { symbol: '✓', color: '#26944A' }],
  '3Symbols2': [{ symbol: '✕', color: '#D64545' }, { symbol: '!', color: '#D39E00' }, { symbol: '✓', color: '#26944A' }],
  '4Arrows': [{ symbol: '↓', color: '#D64545' }, { symbol: '↘', color: '#D9822B' }, { symbol: '↗', color: '#A4A51E' }, { symbol: '↑', color: '#26944A' }],
  '4ArrowsGray': ['↓', '↘', '↗', '↑'].map(symbol => ({ symbol, color: '#747B86' })),
  '4RedToBlack': ['#D64545', '#B85C4C', '#7A6060', '#272A2F'].map(color => ({ symbol: '●', color })),
  '4Rating': ['▂', '▄', '▆', '█'].map(symbol => ({ symbol, color: '#3D78B8' })),
  '4TrafficLights': ['#D64545', '#D9822B', '#A4A51E', '#26944A'].map(color => ({ symbol: '●', color })),
  '5Arrows': [{ symbol: '↓', color: '#D64545' }, { symbol: '↘', color: '#D9822B' }, { symbol: '→', color: '#D39E00' }, { symbol: '↗', color: '#78A83A' }, { symbol: '↑', color: '#26944A' }],
  '5ArrowsGray': ['↓', '↘', '→', '↗', '↑'].map(symbol => ({ symbol, color: '#747B86' })),
  '5Rating': ['▁', '▃', '▄', '▆', '█'].map(symbol => ({ symbol, color: '#3D78B8' })),
  '5Quarters': ['○', '◔', '◑', '◕', '●'].map(symbol => ({ symbol, color: '#3D78B8' })),
}
const iconSetVisual = (rule: WorkbookConditionalFormatRule, value: string): ConditionalIconVisual | undefined => {
  const iconSet = rule.iconSet
  const current = Number(value)
  const visuals = iconSet ? ICON_SET_VISUALS[iconSet.iconSet] : undefined
  const thresholds = iconSet?.thresholds.map(point => ({ value: Number(point.resolvedValue ?? point.value), inclusive: point.inclusive })) || []
  if (!value.trim() || !iconSet || !visuals || visuals.length !== thresholds.length || !Number.isFinite(current) || thresholds.some(point => !Number.isFinite(point.value))) return undefined
  let index = 0
  for (let candidate = 1; candidate < thresholds.length; candidate += 1) {
    const threshold = thresholds[candidate]
    if (threshold.inclusive ? current >= threshold.value : current > threshold.value) index = candidate
  }
  if (iconSet.reverse) index = visuals.length - 1 - index
  return { ...visuals[index], showValue: iconSet.showValue }
}
const conditionalRuleMatches = (rule: WorkbookConditionalFormatRule, row: number, column: number) => {
  if (!rule.editable) return false
  if (rule.kind === 'colorScale') return Boolean(colorScaleFill(rule, cellAt(row, column).value))
  if (rule.kind === 'dataBar') return Boolean(dataBarStyle(rule, cellAt(row, column).value))
  if (rule.kind === 'iconSet') return Boolean(iconSetVisual(rule, cellAt(row, column).value))
  if (rule.kind === 'expression') return expressionRuleMatches(rule, row, column)
  if (rule.kind !== 'cellIs') return false
  const current = Number(cellAt(row, column).value); const first = Number((rule.formula1 || '').replace(/^=/, '')); const second = Number((rule.formula2 || '').replace(/^=/, ''))
  if (!Number.isFinite(current) || !Number.isFinite(first)) return false
  if (['between', 'notBetween'].includes(rule.operator || '') && !Number.isFinite(second)) return false
  if (rule.operator === 'between') return current >= first && current <= second
  if (rule.operator === 'notBetween') return current < first || current > second
  if (rule.operator === 'equal') return current === first
  if (rule.operator === 'notEqual') return current !== first
  if (rule.operator === 'lessThan') return current < first
  if (rule.operator === 'lessThanOrEqual') return current <= first
  if (rule.operator === 'greaterThan') return current > first
  if (rule.operator === 'greaterThanOrEqual') return current >= first
  return false
}
const conditionalIconAt = (row: number, column: number) => {
  for (const rule of conditionalFormatsAt(row, column)) {
    if (!rule.editable) continue
    if (rule.kind === 'iconSet') {
      const visual = iconSetVisual(rule, cellAt(row, column).value)
      if (visual) return visual
    }
    if (conditionalRuleMatches(rule, row, column) && rule.stopIfTrue) return undefined
  }
  return undefined
}
const conditionalIconSymbol = (row: number, column: number) => conditionalIconAt(row, column)?.symbol || ''
const conditionalIconColor = (row: number, column: number) => conditionalIconAt(row, column)?.color || 'currentColor'
const conditionalIconHidesValue = (row: number, column: number) => conditionalIconAt(row, column)?.showValue === false
const conditionalCellStyle = (row: number, column: number): CSSProperties => {
  const result = {} as CSSProperties & Record<string, string>
  for (const rule of conditionalFormatsAt(row, column)) {
    if (!conditionalRuleMatches(rule, row, column)) continue
    const scaleFill = rule.kind === 'colorScale' ? colorScaleFill(rule, cellAt(row, column).value) : undefined
    const barStyle = rule.kind === 'dataBar' ? dataBarStyle(rule, cellAt(row, column).value) : undefined
    if (scaleFill || rule.style.fillColor) result['--cell-fill'] = scaleFill || rule.style.fillColor!
    if (barStyle?.backgroundImage) result.backgroundImage = barStyle.backgroundImage
    if (barStyle && rule.dataBar?.showValue === false) result.color = 'transparent'
    if (rule.style.fontColor) result.color = rule.style.fontColor
    if (rule.style.bold) result.fontWeight = '700'
    if (rule.stopIfTrue) break
  }
  return result
}
const validationLabel = (validation: WorkbookDataValidation) => {
  if (validation.kind === 'list') return `列表 ${validation.formula1 || ''}`
  if (validation.kind === 'whole') return `整数 ${validation.operator || 'between'} ${validation.formula1 || ''}${validation.formula2 ? `～${validation.formula2}` : ''}`
  if (validation.kind === 'decimal') return `数值 ${validation.operator || 'between'} ${validation.formula1 || ''}${validation.formula2 ? `～${validation.formula2}` : ''}`
  if (validation.kind === 'textLength') return `文本长度 ${validation.operator || 'between'}`
  if (validation.kind === 'custom') return `自定义公式 ${validation.formula1 || ''}`
  return validation.kind
}
const tableSelection = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || area.top >= area.bottom || area.left > area.right) return null
  if (area.bottom >= canvasRowCount.value || area.right >= canvasColumnCount.value) return null
  return area
})
const selectedTable = computed(() => {
  const area = tableSelection.value
  if (!area) return undefined
  return sheetInfo.value?.tables.find(table => area.top <= table.range.bottom && table.range.top <= area.bottom && area.left <= table.range.right && table.range.left <= area.right)
})
const activeDataRegion = computed(() => {
  const table = selectedTable.value || sheetInfo.value?.tables[0]
  if (table) return { range: table.range, label: `Table · ${table.displayName}`, columns: table.columns, target: 'table' as const, tableName: table.displayName, filterState: table.filterState }
  const range = sheetInfo.value?.autoFilter
  return range ? { range, label: '自动筛选区域', columns: [] as string[], target: 'worksheet' as const, tableName: undefined, filterState: sheetInfo.value?.autoFilterState || { editable: true } } : undefined
})
const activeDataColumns = computed(() => {
  const region = activeDataRegion.value
  if (!region) return []
  return Array.from({ length: region.range.right - region.range.left + 1 }, (_, offset) => {
    const index = region.range.left + offset
    return { index, label: region.columns[offset] || cellAt(region.range.top, index).value || columnLabel(index) }
  })
})
const activeDataRegionStateKey = computed(() => {
  const region = activeDataRegion.value
  if (!region) return ''
  const state = region.filterState
  return [activeSheet.value, region.target, region.tableName || '', region.range.top, region.range.bottom, region.range.left, region.range.right, state.filterColumn ?? '', state.query ?? '', state.sortColumn ?? '', state.sortDirection ?? '', state.editable].join('|')
})
watch(activeDataRegionStateKey, () => {
  const state = activeDataRegion.value?.filterState
  filterColumn.value = state?.filterColumn ?? -1
  filterQuery.value = state?.query ?? ''
  sortColumn.value = state?.sortColumn ?? -1
  sortDirection.value = state?.sortDirection || 'asc'
  dataViewPosition.value = -1
})
const dataViewRows = computed(() => {
  const region = activeDataRegion.value
  if (!region) return []
  const query = filterQuery.value.trim().toLocaleLowerCase()
  const rows = Array.from({ length: Math.min(MAX_DATA_VIEW_ROWS, Math.max(0, region.range.bottom - region.range.top)) }, (_, offset) => region.range.top + 1 + offset)
    .filter(row => loadedRows.value.has(row))
    .filter(row => {
      if (!query) return true
      const columns = filterColumn.value >= region.range.left && filterColumn.value <= region.range.right
        ? [filterColumn.value]
        : Array.from({ length: region.range.right - region.range.left + 1 }, (_, offset) => region.range.left + offset)
      return columns.some(column => cellAt(row, column).value.toLocaleLowerCase().includes(query))
    })
  if (sortColumn.value >= region.range.left && sortColumn.value <= region.range.right) {
    rows.sort((left, right) => {
      const leftValue = cellAt(left, sortColumn.value).value
      const rightValue = cellAt(right, sortColumn.value).value
      const leftNumber = Number(leftValue); const rightNumber = Number(rightValue)
      const result = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
      return sortDirection.value === 'asc' ? result : -result
    })
  }
  return rows
})
const emptyBorderSide = (): WorkbookBorderSide => ({ style: 'none' })
const defaultStyle: WorkbookCellStyle = { styleId: 0, namedStyle: 'Normal', numberFormat: 'general', fontName: 'Calibri', fontSize: 11, bold: false, italic: false, underline: false, borderStyle: 'none', borderTop: emptyBorderSide(), borderRight: emptyBorderSide(), borderBottom: emptyBorderSide(), borderLeft: emptyBorderSide(), horizontalAlignment: 'general', wrapText: false }
const emptyCell: WorkbookCell = { value: '', kind: 'empty', style: defaultStyle }
const fontOptions = ['Calibri', 'Aptos', 'Arial', 'Microsoft YaHei', 'SimSun', 'Times New Roman']
const formatBytes = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`
const columnLabel = (index: number) => {
  let label = ''
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) label = String.fromCharCode(65 + (current - 1) % 26) + label
  return label
}
const rangeLabel = (range: WorkbookMergeRange) => `${columnLabel(range.left)}${range.top + 1}:${columnLabel(range.right)}${range.bottom + 1}`
const spillStatusLabel = (status: WorkbookArrayFormula['spillStatus']) => ({
  not_applicable: '传统数组范围',
  cached_complete: '缓存完整',
  cache_incomplete: '缓存不完整',
  potential_conflict: '潜在占用冲突',
}[status])
const cacheTypeSummary = (item: WorkbookArrayFormula) => {
  const labels: Record<keyof WorkbookArrayFormula['cachedValueTypes'], string> = { number: '数值', text: '文本', boolean: '布尔', error: '错误', date: '日期', other: '其他' }
  const parts = (Object.entries(item.cachedValueTypes) as [keyof WorkbookArrayFormula['cachedValueTypes'], number][])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${labels[kind]} ${count}`)
  return parts.length ? parts.join(' / ') : '无缓存值'
}
const drawingKindLabel = (drawing: WorkbookDrawingObject) => {
  if (drawing.kind === 'chart') return drawing.chart?.chartType === 'column' ? '柱形图' : `${drawing.chart?.chartType || '未知'}图表`
  if (drawing.kind === 'image') return '图片'
  if (drawing.kind === 'shape') return '形状'
  return '绘图对象'
}
const drawingAnchorLabel = (drawing: WorkbookDrawingObject) => {
  const start = `${columnLabel(drawing.from.column)}${drawing.from.row + 1}`
  const end = drawing.to ? `${columnLabel(drawing.to.column)}${drawing.to.row + 1}` : ''
  return end && end !== start ? `${start}:${end}` : start
}
const drawingTooltip = (drawing: WorkbookDrawingObject) => {
  const lines = [drawing.description || drawing.name, `${drawingKindLabel(drawing)} · ${drawingAnchorLabel(drawing)}`]
  for (const series of drawing.chart?.series || []) {
    lines.push(`${series.name || '系列'}：${series.categories || '—'} → ${series.values || '—'}`)
  }
  if (drawing.part) lines.push(`OOXML：${drawing.part}`)
  return lines.filter(Boolean).join('\n')
}
const pivotTooltip = (pivot: WorkbookPivotTable) => [
  `缓存 ${pivot.cacheId ?? '—'} · 来源 ${pivot.sourceType}`,
  pivot.sourceSheet ? `${pivot.sourceSheet}!${pivot.sourceRange || ''}` : '',
  pivot.audit.rebuildCandidate ? '结构审计：受限重建候选（刷新仍禁用）' : `结构审计：${pivot.audit.blockers.join('；')}`,
  pivot.connectionId ? `连接 ${pivot.connectionId}` : '',
  pivot.refreshOnLoad ? '原文件要求打开时刷新；LongEdit 不会自动刷新' : '',
  `OOXML：${pivot.part}`,
].filter(Boolean).join('\n')
const pivotFieldRoleLabel = (role: string) => ({ row: '行', column: '列', page: '筛选', data: '值', unused: '未使用' }[role] || role)
const pivotFieldTypeLabel = (type: string) => ({ string: '文本', number: '数值', date: '日期', boolean: '布尔', error: '错误', blank: '空值', mixed: '混合', unknown: '未知类型' }[type] || type)
const pivotAggregationLabel = (aggregation: string) => ({ sum: '求和', count: '计数', average: '平均值', max: '最大值', min: '最小值', product: '乘积', countNums: '数值计数' }[aggregation] || aggregation)
const pivotLayoutVariantLabel = (layout: string) => ({ row_only: '单行轴', column_only: '单列轴', multi_measure: '多度量' }[layout] || layout)
const pivotPreviewKeys = (keys: WorkbookPivotPreviewKey[], fallback: string) => keys.length ? keys.map(key => `${key.fieldName}：${key.value}`).join(' · ') : fallback
const previewLocalPivot = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || !pivot.audit.rebuildCandidate || pivotPreviewLoading.value) return
  pivotPreviewLoading.value = pivot.part
  try {
    const preview = await invoke<WorkbookPivotPreviewResult>('preview_workbook_pivot', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
        edits: Array.from(drafts.value.values()),
      },
    })
    const next = new Map(pivotPreviews.value)
    next.set(pivot.part, preview)
    pivotPreviews.value = next
    message.success(`已生成 ${preview.groups.length} 个透视分组的内存预览`)
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotPreviewLoading.value = ''
  }
}
const previewPivotRebuildPlan = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || pivotRebuildPlanLoading.value) return
  pivotRebuildPlanLoading.value = pivot.part
  try {
    const plan = await invoke<WorkbookPivotRebuildPlan>('preview_workbook_pivot_rebuild', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
      },
    })
    const next = new Map(pivotRebuildPlans.value)
    next.set(pivot.part, plan)
    pivotRebuildPlans.value = next
    if (plan.status === 'isolated_dry_run_ready') message.success(`已确认 ${plan.affectedParts.length} 个隔离重建影响部件`)
    else message.warning('该透视表未通过隔离重建影响审计')
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotRebuildPlanLoading.value = ''
  }
}
const rebuildPivotCacheIsolated = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || pivotCacheRebuildLoading.value || pivotRebuildPlans.value.get(pivot.part)?.status !== 'isolated_dry_run_ready') return
  pivotCacheRebuildLoading.value = pivot.part
  try {
    const result = await invoke<WorkbookPivotCacheRebuildResult>('rebuild_workbook_pivot_cache_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
      },
    })
    const next = new Map(pivotCacheRebuildResults.value)
    next.set(pivot.part, result)
    pivotCacheRebuildResults.value = next
    message.success(`隔离副本已重建 ${result.rebuiltRecordCount} 条 Pivot Cache 记录`)
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotCacheRebuildLoading.value = ''
  }
}
const rebuildPivotSynchronizedIsolated = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || pivotSynchronizedRebuildLoading.value || pivotCacheRebuildResults.value.get(pivot.part)?.status !== 'isolated_cache_rebuilt') return
  pivotSynchronizedRebuildLoading.value = pivot.part
  try {
    const result = await invoke<WorkbookPivotSynchronizedRebuildResult>('rebuild_workbook_pivot_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
      },
    })
    const next = new Map(pivotSynchronizedRebuildResults.value)
    next.set(pivot.part, result)
    pivotSynchronizedRebuildResults.value = next
    message.success(`隔离副本已同步重建 ${result.outputCellCount} 个透视输出单元格`)
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotSynchronizedRebuildLoading.value = ''
  }
}
const rebuildPivotExpandedIsolated = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || pivotExpandedRebuildLoading.value || pivotSynchronizedRebuildResults.value.get(pivot.part)?.status !== 'isolated_pivot_rebuilt') return
  pivotExpandedRebuildLoading.value = pivot.part
  try {
    const result = await invoke<WorkbookPivotExpandedRebuildResult>('rebuild_workbook_pivot_expanded_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
      },
    })
    const next = new Map(pivotExpandedRebuildResults.value)
    next.set(pivot.part, result)
    pivotExpandedRebuildResults.value = next
    if (!pivotCopyFileNames.value.has(pivot.part)) {
      const names = new Map(pivotCopyFileNames.value)
      names.set(pivot.part, `${fileName.value.replace(/\.xlsx$/i, '')}-Pivot副本.xlsx`)
      pivotCopyFileNames.value = names
    }
    message.success(`隔离布局已验证：${result.oldOutputRange} → ${result.newOutputRange}`)
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotExpandedRebuildLoading.value = ''
  }
}
const pivotLayoutCopyKey = (pivotPart: string, layout: string) => `${pivotPart}\u0000layout\u0000${layout}`
const pivotAggregationCopyKey = (pivotPart: string, aggregation: string) => `${pivotPart}\u0000aggregation\u0000${aggregation}`
const setPivotCopyFileName = (key: string, value: string) => {
  const next = new Map(pivotCopyFileNames.value)
  next.set(key, value)
  pivotCopyFileNames.value = next
}
const savePivotCopy = async (pivot: WorkbookPivotTable) => {
  const verification = pivotExpandedRebuildResults.value.get(pivot.part)
  const targetFileName = pivotCopyFileNames.value.get(pivot.part)?.trim()
  if (!workbook.value || !verification || !targetFileName || pivotSaveCopyLoading.value) return
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的工作簿更改')
  pivotSaveCopyLoading.value = pivot.part
  try {
    const saved = await invoke<WorkbookPivotSavedCopyResult>('save_workbook_pivot_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      targetFileName,
      payload: {
        expectedSignature: workbook.value.signature,
        expectedOutputDigest: verification.isolatedPackageDigest,
        pivotPart: pivot.part,
      },
    })
    if (
      saved.status !== 'saved_verified'
      || saved.saveMode !== 'new_copy_only'
      || saved.layoutVariant !== 'standard'
      || saved.aggregationVariant !== 'sum'
      || !saved.sourceUnchanged
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || !saved.outputValuesVerified
      || !saved.untouchedPartsPreserved
    ) throw new Error('Pivot 新副本未通过完整写后复读')
    const next = new Map(pivotSavedCopyResults.value)
    next.set(pivot.part, saved)
    pivotSavedCopyResults.value = next
    message.success(`已可靠另存并验证：${targetFileName}`)
    await router.replace({ query: { path: saved.targetPath } })
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotSaveCopyLoading.value = ''
  }
}
const savePivotAggregationCopy = async (pivot: WorkbookPivotTable, variant: WorkbookPivotAggregationVariant) => {
  const key = pivotAggregationCopyKey(pivot.part, variant.aggregation)
  const targetFileName = pivotCopyFileNames.value.get(key)?.trim()
  if (!workbook.value || !targetFileName || pivotSaveCopyLoading.value) return
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的工作簿更改')
  pivotSaveCopyLoading.value = key
  try {
    const saved = await invoke<WorkbookPivotSavedCopyResult>('save_workbook_pivot_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      targetFileName,
      payload: {
        expectedSignature: workbook.value.signature,
        expectedOutputDigest: variant.isolatedPackageDigest,
        pivotPart: pivot.part,
        aggregationVariant: variant.aggregation,
      },
    })
    if (
      saved.status !== 'saved_verified'
      || saved.saveMode !== 'new_copy_only'
      || saved.layoutVariant !== 'standard'
      || saved.aggregationVariant !== variant.aggregation
      || saved.outputRange !== variant.outputRange
      || saved.outputCellCount !== variant.outputCellCount
      || !saved.sourceUnchanged
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || !saved.outputValuesVerified
      || !saved.untouchedPartsPreserved
    ) throw new Error('Pivot 聚合新副本未通过完整写后复读')
    const next = new Map(pivotSavedCopyResults.value)
    next.set(key, saved)
    pivotSavedCopyResults.value = next
    message.success(`已可靠另存并验证 ${pivotAggregationLabel(variant.aggregation)}：${targetFileName}`)
    await router.replace({ query: { path: saved.targetPath } })
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotSaveCopyLoading.value = ''
  }
}
const savePivotLayoutCopy = async (pivot: WorkbookPivotTable, variant: WorkbookPivotLayoutVariant) => {
  const key = pivotLayoutCopyKey(pivot.part, variant.layout)
  const targetFileName = pivotCopyFileNames.value.get(key)?.trim()
  if (!workbook.value || !targetFileName || pivotSaveCopyLoading.value) return
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的工作簿更改')
  pivotSaveCopyLoading.value = key
  try {
    const saved = await invoke<WorkbookPivotSavedCopyResult>('save_workbook_pivot_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      targetFileName,
      payload: {
        expectedSignature: workbook.value.signature,
        expectedOutputDigest: variant.isolatedPackageDigest,
        pivotPart: pivot.part,
        layoutVariant: variant.layout,
      },
    })
    if (
      saved.status !== 'saved_verified'
      || saved.saveMode !== 'new_copy_only'
      || saved.layoutVariant !== variant.layout
      || saved.aggregationVariant !== 'sum'
      || saved.outputRange !== variant.outputRange
      || saved.outputCellCount !== variant.outputCellCount
      || !saved.sourceUnchanged
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || !saved.outputValuesVerified
      || !saved.untouchedPartsPreserved
    ) throw new Error('Pivot 布局新副本未通过完整写后复读')
    const next = new Map(pivotSavedCopyResults.value)
    next.set(key, saved)
    pivotSavedCopyResults.value = next
    message.success(`已可靠另存并验证：${targetFileName}`)
    await router.replace({ query: { path: saved.targetPath } })
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotSaveCopyLoading.value = ''
  }
}
const verifyPivotVariantsIsolated = async (pivot: WorkbookPivotTable) => {
  if (!workbook.value || pivotVariantVerificationLoading.value || pivotExpandedRebuildResults.value.get(pivot.part)?.status !== 'isolated_layout_resized') return
  pivotVariantVerificationLoading.value = pivot.part
  try {
    const result = await invoke<WorkbookPivotVariantVerificationResult>('verify_workbook_pivot_variants_isolated_copy', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        pivotPart: pivot.part,
      },
    })
    const next = new Map(pivotVariantVerificationResults.value)
    next.set(pivot.part, result)
    pivotVariantVerificationResults.value = next
    const names = new Map(pivotCopyFileNames.value)
    const baseName = fileName.value.replace(/\.xlsx$/i, '')
    for (const variant of result.aggregationVariants.filter(variant => variant.aggregation !== 'sum')) {
      const key = pivotAggregationCopyKey(pivot.part, variant.aggregation)
      if (!names.has(key)) names.set(key, `${baseName}-Pivot-${variant.aggregation}.xlsx`)
    }
    for (const variant of result.layoutVariants) {
      const key = pivotLayoutCopyKey(pivot.part, variant.layout)
      if (!names.has(key)) names.set(key, `${baseName}-Pivot-${variant.layout}.xlsx`)
    }
    pivotCopyFileNames.value = names
    message.success(`已验证 ${result.packageVariantCount} 个临时包，其中 ${result.layoutPackageVariantCount} 个布局包`)
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    pivotVariantVerificationLoading.value = ''
  }
}
const navigateLinkedSheet = (sheet: string) => {
  linkedDataModalOpen.value = false
  void selectSheet(sheet)
}
const editKey = (sheet: string, row: number, column: number) => `${sheet}\u0000${row}\u0000${column}`
const sourceCellAt = (row: number, column: number) => loadedRows.value.get(row)?.[column] || emptyCell
const mergeStyle = (style: WorkbookCellStyle, patch?: WorkbookStylePatch): WorkbookCellStyle => patch ? {
  ...style,
  ...(patch.namedStyle !== undefined ? { namedStyle: patch.namedStyle || undefined } : {}),
  ...(patch.numberFormat !== undefined ? { numberFormat: patch.numberFormat } : {}),
  ...(patch.fontName !== undefined ? { fontName: patch.fontName } : {}),
  ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
  ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
  ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
  ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
  ...(patch.fontColor !== undefined ? { fontColor: patch.fontColor || undefined } : {}),
  ...(patch.fillColor !== undefined ? { fillColor: patch.fillColor || undefined } : {}),
  ...(patch.borderStyle !== undefined ? { borderStyle: patch.borderStyle } : {}),
  ...(patch.borderColor !== undefined ? { borderColor: patch.borderColor || undefined } : {}),
  ...(patch.borderTop !== undefined ? { borderTop: patch.borderTop } : {}),
  ...(patch.borderRight !== undefined ? { borderRight: patch.borderRight } : {}),
  ...(patch.borderBottom !== undefined ? { borderBottom: patch.borderBottom } : {}),
  ...(patch.borderLeft !== undefined ? { borderLeft: patch.borderLeft } : {}),
  ...(patch.horizontalAlignment !== undefined ? { horizontalAlignment: patch.horizontalAlignment } : {}),
  ...(patch.wrapText !== undefined ? { wrapText: patch.wrapText } : {}),
} : style
const cellStyleAt = (row: number, column: number) => mergeStyle(sourceCellAt(row, column).style || defaultStyle, styleDrafts.value.get(editKey(activeSheet.value, row, column)))
const cellAt = (row: number, column: number): WorkbookCell => {
  const key = editKey(activeSheet.value, row, column)
  const edit = drafts.value.get(key)
  const calculated = calculatedValues.value.get(key)
  if (!edit) {
    const source = sourceCellAt(row, column)
    return { ...source, ...(source.formula && calculated ? { value: calculated.value, kind: calculated.kind } : {}), style: cellStyleAt(row, column) }
  }
  if (edit.kind === 'formula') return { value: calculated?.value || '', formula: edit.input, kind: calculated?.kind || 'formula', style: cellStyleAt(row, column) }
  return { value: edit.input, kind: edit.kind === 'string' ? 'text' : edit.kind, style: cellStyleAt(row, column) }
}
const invalidateCalculation = () => {
  calculatedValues.value = new Map()
  calculationCount.value = 0
  calculationErrors.value = 0
  pivotPreviews.value = new Map()
  pivotRebuildPlans.value = new Map()
  pivotCacheRebuildResults.value = new Map()
  pivotSynchronizedRebuildResults.value = new Map()
  pivotExpandedRebuildResults.value = new Map()
  pivotCopyFileNames.value = new Map()
  pivotSavedCopyResults.value = new Map()
  pivotVariantVerificationResults.value = new Map()
}
const originalInput = (cell: WorkbookCell) => cell.formula || cell.value || ''
const isEditableCell = (row: number, column: number) => {
  if (sheetProtected.value) return false
  if (isMergedCovered(row, column)) return false
  if (arrayFormulaAt(row, column)) return false
  const source = sourceCellAt(row, column)
  return Boolean(source.formula) || !['date', 'error'].includes(source.kind)
}
const arrayFormulaAt = (row: number, column: number) => sheetInfo.value?.arrayFormulas.find(item =>
  row >= item.range.top && row <= item.range.bottom && column >= item.range.left && column <= item.range.right)
const isArrayFormulaAnchor = (row: number, column: number) => {
  const item = arrayFormulaAt(row, column)
  return Boolean(item && item.anchorRow === row && item.anchorColumn === column)
}
const isArrayFormulaConflict = (row: number, column: number) => {
  const address = `${columnLabel(column)}${row + 1}`
  return Boolean(arrayFormulaAt(row, column)?.conflictCells.includes(address))
}
const selectedArrayFormula = computed(() => selectedCell.value ? arrayFormulaAt(selectedCell.value.row, selectedCell.value.column) : undefined)
const mergeAt = (row: number, column: number) => currentMergedRanges.value.find(range => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right)
const isMergedAnchor = (row: number, column: number) => {
  const range = mergeAt(row, column)
  return Boolean(range && range.top === row && range.left === column)
}
const isMergedCovered = (row: number, column: number) => {
  const range = mergeAt(row, column)
  return Boolean(range && (range.top !== row || range.left !== column))
}
const isDirty = (sheet: string, row: number, column: number) => drafts.value.has(editKey(sheet, row, column)) || styleDrafts.value.has(editKey(sheet, row, column))
const isSelected = (row: number, column: number) => selectedCell.value?.sheet === activeSheet.value && selectedCell.value.row === row && selectedCell.value.column === column
const isInSelection = (row: number, column: number) => {
  return selectionAreas.value.some(bounds => row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right)
}
const isRowSelected = (row: number) => selectionAreas.value.some(bounds => row >= bounds.top && row <= bounds.bottom && bounds.left === 0 && bounds.right === canvasColumnCount.value - 1)
const isColumnSelected = (column: number) => selectionAreas.value.some(bounds => column >= bounds.left && column <= bounds.right && bounds.top === 0 && bounds.bottom === canvasRowCount.value - 1)
const isInFillPreview = (row: number, column: number) => {
  const area = fillPreview.value
  return Boolean(area && row >= area.top && row <= area.bottom && column >= area.left && column <= area.right)
}
const isFillHandleCell = (row: number, column: number) => {
  const area = selectionBounds.value
  return selectionAreas.value.length === 1 && Boolean(area && row === area.bottom && column === area.right)
}
const cellDisplay = (row: number, column: number) => {
  const cell = cellAt(row, column)
  if (showFormulas.value && cell.formula) return cell.formula
  const raw = cell.value || (cell.formula ? cell.formula : '')
  const numeric = Number(raw)
  if (!raw || !Number.isFinite(numeric)) return raw
  if (cell.style.numberFormat === 'integer') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric)
  if (cell.style.numberFormat === 'decimal' || cell.style.numberFormat === 'currency') return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)
  if (cell.style.numberFormat === 'percent') return new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)
  return raw
}
const cellTitle = (row: number, column: number) => {
  const cell = cellAt(row, column)
  const validation = validationAt(row, column)
  const validationText = validation ? `\n数据验证：${validationLabel(validation)}${validation.prompt ? `\n${validation.prompt}` : ''}` : ''
  const arrayFormula = arrayFormulaAt(row, column)
  const arrayText = arrayFormula
    ? `\n${arrayFormula.kind === 'dynamic_array' ? '动态数组' : '传统数组'}：${rangeLabel(arrayFormula.range)}\n缓存：${arrayFormula.cachedCellCount}/${arrayFormula.declaredCellCount}；${cacheTypeSummary(arrayFormula)}；${spillStatusLabel(arrayFormula.spillStatus)}${arrayFormula.conflictCells.length ? `\n冲突：${arrayFormula.conflictCells.join(', ')}${arrayFormula.diagnosticCellsTruncated ? '…' : ''}` : ''}${arrayFormula.errorCacheCells.length ? `\n错误缓存：${arrayFormula.errorCacheCells.join(', ')}${arrayFormula.diagnosticCellsTruncated ? '…' : ''}` : ''}\n${arrayFormula.blocker}`
    : ''
  return (cell.formula ? `${columnLabel(column)}${row + 1}\n公式：${cell.formula}\n结果：${cell.value || '等待外部公式引擎重算'}` : cell.value) + validationText + arrayText
}
const borderCss = (side: WorkbookBorderSide) => {
  if (!side || side.style === 'none') return undefined
  const width = side.style === 'hair' ? 1 : ['medium', 'thick', 'double'].includes(side.style) ? 2 : 1
  const line = side.style === 'double' ? 'double' : side.style === 'dotted' ? 'dotted' : side.style === 'dashed' ? 'dashed' : 'solid'
  return `${width}px ${line} ${side.color || '#808080'}`
}
const cellStyleCss = (row: number, column: number): CSSProperties => {
  const style = cellStyleAt(row, column)
  const merged = mergeAt(row, column)
  const mergedWidth = merged && merged.top === row && merged.left === column
    ? columnPixels.value.slice(merged.left, Math.min(canvasColumnCount.value, merged.right + 1)).reduce((total, width) => total + width, 0)
    : undefined
  const mergedHeight = merged && merged.top === row && merged.left === column
    ? rowOffset(merged.bottom + 1) - rowOffset(merged.top)
    : undefined
  return {
    '--cell-fill': style.fillColor || 'var(--theme-card)',
    color: style.fontColor || undefined,
    fontFamily: style.fontName,
    fontSize: `${style.fontSize}pt`,
    fontWeight: style.bold ? '700' : '400',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: style.horizontalAlignment === 'general' ? undefined : style.horizontalAlignment as CSSProperties['textAlign'],
    whiteSpace: style.wrapText ? 'normal' : 'nowrap',
    borderTop: borderCss(style.borderTop),
    borderRight: borderCss(style.borderRight),
    borderBottom: borderCss(style.borderBottom),
    borderLeft: borderCss(style.borderLeft),
    width: mergedWidth ? `${mergedWidth}px` : undefined,
    height: mergedHeight ? `${mergedHeight}px` : undefined,
  }
}
const focusedStyle = computed(() => selectedCell.value ? cellStyleAt(selectedCell.value.row, selectedCell.value.column) : defaultStyle)
const visibleRows = computed(() => {
  const total = canvasRowCount.value
  const start = Math.max(0, rowAtOffset(scrollTop.value) - 10)
  const end = Math.min(total, rowAtOffset(scrollTop.value + viewportHeight.value) + 11)
  const rows = new Set(Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset))
  for (let row = 0; row < Math.min(effectiveFreeze.value.rows, total); row += 1) rows.add(row)
  return Array.from(rows).sort((left, right) => left - right).map(index => ({ index }))
})
const conditionalDependencyPageOffsets = computed(() => {
  void loadedRows.value.size
  const offsets = new Set<number>()
  for (const rule of sheetInfo.value?.conditionalFormats || []) {
    if (!rule.editable || rule.kind !== 'expression') continue
    const expression = parseConditionalExpression(rule.formula1 || '')
    const anchor = rule.ranges[0]
    if (!expression || !anchor) continue
    const references = conditionalExpressionReferences(expression)
    for (const target of visibleRows.value) {
      if (!rule.ranges.some(range => target.index >= range.top && target.index <= range.bottom)) continue
      for (const reference of references) {
        const row = reference.absoluteRow ? reference.row : reference.row + target.index - anchor.top
        if (row < 0 || row >= (sheetInfo.value?.totalRows || 0)) continue
        const offset = Math.floor(row / PAGE_ROWS) * PAGE_ROWS
        if (!loadedPages.has(offset)) offsets.add(offset)
      }
    }
  }
  return Array.from(offsets).sort((left, right) => left - right).slice(0, 16)
})
const navigableDefinedNames = computed(() => (workbook.value?.definedNames || [])
  .map((item, index) => ({ item, index, label: `${item.scope ? `${item.scope}!` : ''}${item.name}` }))
  .filter(({ item }) => !item.hidden && item.reference && workbook.value?.sheets.includes(item.reference.sheet)))
const selectedDefinedName = computed(() => selectedDefinedNameIndex.value >= 0 ? workbook.value?.definedNames[selectedDefinedNameIndex.value] : undefined)
const definedNameSelection = computed(() => selectionAreas.value.length === 1 ? selectionBounds.value : null)
const canEditDefinedNames = computed(() => Boolean(workbook.value && !workbook.value.protection.lockStructure && !saving.value && !updatingStructure.value && !dirtyCount.value))
const rowLayoutStyle = (row: number): CSSProperties => row < effectiveFreeze.value.rows
  ? { position: 'sticky', top: `${38 + rowOffset(row)}px`, transform: 'none', height: `${rowPixelHeight(row)}px`, zIndex: 16 }
  : { transform: `translateY(${rowOffset(row)}px)`, height: `${rowPixelHeight(row)}px` }
const frozenColumnStyle = (column: number, header = false): CSSProperties => column < effectiveFreeze.value.columns
  ? { position: 'sticky', left: `${52 + columnPixels.value.slice(0, column).reduce((total, width) => total + width, 0)}px`, zIndex: header ? 25 : 17 }
  : {}

const inferEdit = (selection: CellSelection, input: string): WorkbookCellEdit => {
  if (input.startsWith('=') && input.length > 1) return { ...selection, input, kind: 'formula' }
  if (!input) return { ...selection, input, kind: 'empty' }
  if (/^(true|false)$/i.test(input)) return { ...selection, input: input.toLowerCase(), kind: 'boolean' }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(input) && Number.isFinite(Number(input))) return { ...selection, input, kind: 'number' }
  return { ...selection, input, kind: 'string' }
}
const setDraft = (key: string, edit?: WorkbookCellEdit) => {
  const next = new Map(drafts.value)
  if (edit) next.set(key, edit)
  else next.delete(key)
  drafts.value = next
}
const setSelectionFocus = (row: number, column: number) => {
  selectedCell.value = { sheet: activeSheet.value, row, column }
  formulaInput.value = originalInput(cellAt(row, column))
}
const areaBetween = (anchor: CellSelection, row: number, column: number): SelectionArea => ({
  top: Math.min(anchor.row, row), bottom: Math.max(anchor.row, row),
  left: Math.min(anchor.column, column), right: Math.max(anchor.column, column),
})
const replacePrimaryArea = (area: SelectionArea) => {
  const next = selectionAreas.value.slice()
  if (next.length) next[next.length - 1] = area
  else next.push(area)
  selectionAreas.value = next
}
const appendArea = (area: SelectionArea) => {
  if (selectionAreas.value.length >= MAX_SELECTION_AREAS) {
    message.warning(`最多选择 ${MAX_SELECTION_AREAS} 个区域`)
    return false
  }
  selectionAreas.value = [...selectionAreas.value, area]
  return true
}
const selectCell = (row: number, column: number, extend = false, additive = false) => {
  if (additive) {
    const anchor = { sheet: activeSheet.value, row, column }
    if (!appendArea(areaBetween(anchor, row, column))) return
    selectionAnchor.value = anchor
  } else if (!extend || selectionAnchor.value?.sheet !== activeSheet.value) {
    selectionAnchor.value = { sheet: activeSheet.value, row, column }
    selectionAreas.value = [areaBetween(selectionAnchor.value, row, column)]
  } else {
    replacePrimaryArea(areaBetween(selectionAnchor.value, row, column))
  }
  setSelectionFocus(row, column)
}
const startCellSelection = (row: number, column: number, event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  dragSelecting = true
  selectCell(row, column, event.shiftKey, event.ctrlKey || event.metaKey)
}
const extendCellSelection = (row: number, column: number) => {
  if (filling && fillSource) {
    const source = fillSource
    const verticalDistance = row < source.top ? source.top - row : row > source.bottom ? row - source.bottom : 0
    const horizontalDistance = column < source.left ? source.left - column : column > source.right ? column - source.right : 0
    if (!verticalDistance && !horizontalDistance) fillPreview.value = source
    else if (verticalDistance >= horizontalDistance) fillPreview.value = { ...source, top: Math.min(source.top, row), bottom: Math.max(source.bottom, row) }
    else fillPreview.value = { ...source, left: Math.min(source.left, column), right: Math.max(source.right, column) }
    return
  }
  if (dragSelecting && selectionAnchor.value) {
    replacePrimaryArea(areaBetween(selectionAnchor.value, row, column))
    setSelectionFocus(row, column)
  }
}
const startFill = (event: PointerEvent) => {
  if (event.button !== 0 || selectionAreas.value.length !== 1 || !selectionBounds.value) return
  event.preventDefault()
  dragSelecting = false
  filling = true
  fillSource = { ...selectionBounds.value }
  fillPreview.value = { ...selectionBounds.value }
}
const selectRow = (row: number, event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  const additive = event.ctrlKey || event.metaKey
  const anchorRow = event.shiftKey && selectionAnchor.value?.sheet === activeSheet.value ? selectionAnchor.value.row : row
  const area = { top: Math.min(anchorRow, row), bottom: Math.max(anchorRow, row), left: 0, right: canvasColumnCount.value - 1 }
  const anchor = { sheet: activeSheet.value, row: anchorRow, column: 0 }
  if (additive) { if (!appendArea(area)) return } else selectionAreas.value = [area]
  selectionAnchor.value = anchor
  setSelectionFocus(row, 0)
}
const selectColumn = (column: number, event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  const additive = event.ctrlKey || event.metaKey
  const anchorColumn = event.shiftKey && selectionAnchor.value?.sheet === activeSheet.value ? selectionAnchor.value.column : column
  const area = { top: 0, bottom: canvasRowCount.value - 1, left: Math.min(anchorColumn, column), right: Math.max(anchorColumn, column) }
  const anchor = { sheet: activeSheet.value, row: 0, column: anchorColumn }
  if (additive) { if (!appendArea(area)) return } else selectionAreas.value = [area]
  selectionAnchor.value = anchor
  setSelectionFocus(0, column)
}
const selectAllCells = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  selectionAnchor.value = { sheet: activeSheet.value, row: 0, column: 0 }
  selectionAreas.value = [{ top: 0, bottom: canvasRowCount.value - 1, left: 0, right: canvasColumnCount.value - 1 }]
  setSelectionFocus(0, 0)
}
const beginCellEdit = (row: number, column: number) => {
  selectCell(row, column)
  if (isEditableCell(row, column)) nextTick(() => formulaInputRef.value?.focus())
}
const resetFormulaInput = () => {
  if (selectedCell.value) formulaInput.value = originalInput(cellAt(selectedCell.value.row, selectedCell.value.column))
  formulaInputRef.value?.blur()
}
const commitFormulaInput = () => {
  const selection = selectedCell.value
  if (!selection || !selectedEditable.value) return
  const validation = validationAt(selection.row, selection.column)
  if (validation?.showErrorMessage && validation.kind === 'list' && formulaInput.value && !formulaInput.value.startsWith('=')) {
    const formula = validation.formula1 || ''
    const options = formula.startsWith('"') && formula.endsWith('"') ? formula.slice(1, -1).split(',') : []
    if (options.length && !options.includes(formulaInput.value)) {
      message.error(validation.error || `请输入列表中的值：${options.join('、')}`)
      return
    }
  }
  const key = editKey(selection.sheet, selection.row, selection.column)
  const before = drafts.value.get(key)
  const source = sourceCellAt(selection.row, selection.column)
  const after = formulaInput.value === originalInput(source) ? undefined : inferEdit(selection, formulaInput.value)
  if (JSON.stringify(before) === JSON.stringify(after)) return
  setDraft(key, after)
  invalidateCalculation()
  undoStack.value.push({ changes: [{ key, before, after }] })
  redoStack.value = []
}
const applyHistoryAction = (action: EditAction, direction: 'undo' | 'redo') => {
  const next = new Map(drafts.value)
  for (const change of action.changes || []) {
    const edit = direction === 'undo' ? change.before : change.after
    if (edit) next.set(change.key, edit)
    else next.delete(change.key)
  }
  drafts.value = next
  if (action.changes?.length) invalidateCalculation()
  const nextStyles = new Map(styleDrafts.value)
  for (const change of action.styleChanges || []) {
    const patch = direction === 'undo' ? change.before : change.after
    if (patch) nextStyles.set(change.key, patch)
    else nextStyles.delete(change.key)
  }
  styleDrafts.value = nextStyles
  const nextRowHeights = new Map(rowHeightDrafts.value)
  for (const change of action.rowHeightChanges || []) {
    const value = direction === 'undo' ? change.before : change.after
    if (value !== undefined) nextRowHeights.set(change.key, value)
    else nextRowHeights.delete(change.key)
  }
  rowHeightDrafts.value = nextRowHeights
  const nextColumnWidths = new Map(columnWidthDrafts.value)
  for (const change of action.columnWidthChanges || []) {
    const value = direction === 'undo' ? change.before : change.after
    if (value !== undefined) nextColumnWidths.set(change.key, value)
    else nextColumnWidths.delete(change.key)
  }
  columnWidthDrafts.value = nextColumnWidths
  const nextMerges = new Map(mergeDrafts.value)
  for (const change of action.mergeChanges || []) {
    const value = direction === 'undo' ? change.before : change.after
    if (value) nextMerges.set(change.key, value)
    else nextMerges.delete(change.key)
  }
  mergeDrafts.value = nextMerges
  const changes = action.changes || []
  const last = changes[changes.length - 1]
  const edit = last && (direction === 'undo' ? last.before : last.after)
  if (edit && edit.sheet === activeSheet.value) {
    selectedCell.value = { sheet: edit.sheet, row: edit.row, column: edit.column }
    selectionAnchor.value = selectedCell.value
    selectionAreas.value = [{ top: edit.row, bottom: edit.row, left: edit.column, right: edit.column }]
    formulaInput.value = edit.input
  }
}
const undo = () => { const action = undoStack.value.pop(); if (action) { applyHistoryAction(action, 'undo'); redoStack.value.push(action) } }
const redo = () => { const action = redoStack.value.pop(); if (action) { applyHistoryAction(action, 'redo'); undoStack.value.push(action) } }

const stylePatchMatchesSource = (row: number, column: number, patch: WorkbookStylePatch) => {
  const source = sourceCellAt(row, column).style || defaultStyle
  const result = mergeStyle(source, patch)
  return result.numberFormat === source.numberFormat && result.fontName === source.fontName && result.fontSize === source.fontSize
    && result.namedStyle === source.namedStyle
    && result.bold === source.bold && result.italic === source.italic && result.underline === source.underline
    && result.fontColor === source.fontColor && result.fillColor === source.fillColor
    && result.borderStyle === source.borderStyle && result.borderColor === source.borderColor
    && JSON.stringify(result.borderTop) === JSON.stringify(source.borderTop)
    && JSON.stringify(result.borderRight) === JSON.stringify(source.borderRight)
    && JSON.stringify(result.borderBottom) === JSON.stringify(source.borderBottom)
    && JSON.stringify(result.borderLeft) === JSON.stringify(source.borderLeft)
    && result.horizontalAlignment === source.horizontalAlignment && result.wrapText === source.wrapText
}
const selectedCoordinates = () => {
  const coordinates: Array<{ row: number; column: number }> = []
  const seen = new Set<string>()
  for (const area of selectionAreas.value) {
    for (let row = area.top; row <= area.bottom; row += 1) {
      if (row < (sheetInfo.value?.totalRows || 0) && !loadedRows.value.has(row)) throw new Error('选择区域包含尚未载入的数据，请滚动到该区域后重试')
      for (let column = area.left; column <= area.right; column += 1) {
        const key = `${row}:${column}`
        if (seen.has(key)) continue
        seen.add(key)
        coordinates.push({ row, column })
        if (coordinates.length > MAX_BATCH_CELLS) throw new Error(`单次区域操作不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
      }
    }
  }
  return coordinates
}
const applyStylePatch = (patch: WorkbookStylePatch) => {
  if (!selectedCell.value) return
  if (patch.borderStyle !== undefined) {
    const side = { style: patch.borderStyle, ...(patch.borderColor ? { color: patch.borderColor } : {}) }
    patch = { ...patch, borderTop: side, borderRight: side, borderBottom: side, borderLeft: side }
  }
  const changes: StyleChange[] = []
  try {
    for (const { row, column } of selectedCoordinates()) {
      const key = editKey(activeSheet.value, row, column)
      const before = styleDrafts.value.get(key)
      const merged = { ...(before || {}), ...patch }
      const after = stylePatchMatchesSource(row, column, merged) ? undefined : merged
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after })
    }
  } catch (cause) { return void message.error(String(cause).replace(/^Error:\s*/, '')) }
  if (!changes.length) return
  const next = new Map(styleDrafts.value)
  for (const change of changes) {
    if (change.after) next.set(change.key, change.after)
    else next.delete(change.key)
  }
  styleDrafts.value = next
  undoStack.value.push({ styleChanges: changes })
  redoStack.value = []
}
const applyFontSize = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value < 6 || value > 72) return void message.error('字号必须在 6 到 72 之间')
  applyStylePatch({ fontSize: value })
}
const applyNamedStyle = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (value) applyStylePatch({ namedStyle: value })
}
const applyBorderSide = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const side = select.value
  select.value = ''
  if (!side) return
  const clear = { style: 'none' }
  if (side === 'clear') return applyStylePatch({ borderTop: clear, borderRight: clear, borderBottom: clear, borderLeft: clear, borderStyle: 'none', borderColor: '' })
  const value = { style: 'thin', color: '#808080' }
  if (side === 'top') applyStylePatch({ borderTop: value })
  if (side === 'right') applyStylePatch({ borderRight: value })
  if (side === 'bottom') applyStylePatch({ borderBottom: value })
  if (side === 'left') applyStylePatch({ borderLeft: value })
}
const setCustomNumberFormat = () => {
  const current = focusedStyle.value.numberFormat.startsWith('custom:') ? focusedStyle.value.numberFormat.slice(7) : '0.00'
  const code = window.prompt('输入 Excel 自定义数字格式（最多 128 个字符）', current)
  if (code === null) return
  const trimmed = code.trim()
  if (!trimmed || trimmed.length > 128 || /[\u0000-\u001f\u007f]/.test(trimmed)) return void message.error('自定义数字格式不能为空、不能包含控制字符且最多 128 个字符')
  applyStylePatch({ numberFormat: `custom:${trimmed}` })
}

const selectedRowsForResize = () => {
  const rows = new Set<number>()
  const headerAreas = selectionAreas.value.filter(area => area.left === 0 && area.right === canvasColumnCount.value - 1)
  if (!headerAreas.length && selectedCell.value) rows.add(selectedCell.value.row)
  for (const area of headerAreas) {
    if (area.bottom - area.top + 1 > MAX_BATCH_CELLS) throw new Error(`单次最多调整 ${MAX_BATCH_CELLS.toLocaleString()} 行`)
    for (let row = area.top; row <= area.bottom; row += 1) rows.add(row)
  }
  return Array.from(rows)
}
const selectedColumnsForResize = () => {
  const columns = new Set<number>()
  const headerAreas = selectionAreas.value.filter(area => area.top === 0 && area.bottom === canvasRowCount.value - 1)
  if (!headerAreas.length && selectedCell.value) columns.add(selectedCell.value.column)
  for (const area of headerAreas) for (let column = area.left; column <= area.right; column += 1) columns.add(column)
  return Array.from(columns)
}
const setSelectedRowHeight = () => {
  let rows: number[]
  try { rows = selectedRowsForResize() } catch (cause) { return void message.error(String(cause).replace(/^Error:\s*/, '')) }
  if (!rows.length) return
  const initial = rowHeightPoints(rows[0]).toFixed(2).replace(/\.00$/, '')
  const input = window.prompt('输入行高（2–409.5 磅）；留空恢复默认行高', initial)
  if (input === null) return
  const height = input.trim() ? Number(input) : null
  if (height !== null && (!Number.isFinite(height) || height < 2 || height > 409.5)) return void message.error('行高必须在 2 到 409.5 磅之间')
  const changes: RowHeightChange[] = []
  const next = new Map(rowHeightDrafts.value)
  for (const row of rows) {
    const key = rowHeightKey(activeSheet.value, row)
    const before = next.get(key)
    const source = sourceRowHeights.value.get(row)
    const after = height === null ? (source === undefined ? undefined : null) : (source !== undefined && Math.abs(source - height) < 0.001 ? undefined : height)
    if (before === after) continue
    if (after !== undefined) next.set(key, after)
    else next.delete(key)
    changes.push({ key, before, after })
  }
  if (!changes.length) return
  rowHeightDrafts.value = next
  undoStack.value.push({ rowHeightChanges: changes })
  redoStack.value = []
}
const setSelectedColumnWidth = () => {
  const columns = selectedColumnsForResize()
  if (!columns.length) return
  const initial = columnWidthUnits(columns[0]).toFixed(2).replace(/\.00$/, '')
  const input = window.prompt('输入列宽（0.1–255）；留空恢复默认列宽', initial)
  if (input === null) return
  const width = input.trim() ? Number(input) : null
  if (width !== null && (!Number.isFinite(width) || width < 0.1 || width > 255)) return void message.error('列宽必须在 0.1 到 255 之间')
  const changes: ColumnWidthChange[] = []
  const next = new Map(columnWidthDrafts.value)
  for (const column of columns) {
    const key = columnWidthKey(activeSheet.value, column)
    const before = next.get(key)
    const source = sourceColumnWidths.value.get(column)
    const after = width === null ? (source === undefined ? undefined : null) : (source !== undefined && Math.abs(source - width) < 0.001 ? undefined : width)
    if (before === after) continue
    if (after !== undefined) next.set(key, after)
    else next.delete(key)
    changes.push({ key, before, after })
  }
  if (!changes.length) return
  columnWidthDrafts.value = next
  undoStack.value.push({ columnWidthChanges: changes })
  redoStack.value = []
}
const axisStateTitle = (kind: 'row' | 'column', index: number) => {
  const state = kind === 'row' ? rowState(index) : columnState(index)
  const label = kind === 'row' ? `第 ${index + 1} 行` : `${columnLabel(index)} 列`
  const details = [state.hidden ? '已隐藏' : '', state.outlineLevel ? `${state.outlineLevel} 级分组` : ''].filter(Boolean)
  return details.length ? `${label} · ${details.join(' · ')}` : label
}
const applyAxisAction = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  const action = select.value as 'hide' | 'show' | 'group' | 'ungroup' | ''
  select.value = ''
  const axis = selectedAxis.value
  if (!action || !axis || !workbook.value || updatingStructure.value || dirtyCount.value) return
  if (axis.end - axis.start + 1 > MAX_BATCH_CELLS) return void message.error(`单次最多修改 ${MAX_BATCH_CELLS.toLocaleString()} 行或列`)
  const rowEdits: WorkbookRowStateEdit[] = []
  const columnEdits: WorkbookColumnStateEdit[] = []
  for (let index = axis.start; index <= axis.end; index += 1) {
    const current = axis.kind === 'row' ? rowState(index) : columnState(index)
    const hidden = action === 'hide' ? true : action === 'show' ? false : current.hidden
    const outlineLevel = action === 'group' ? Math.min(7, current.outlineLevel + 1) : action === 'ungroup' ? Math.max(0, current.outlineLevel - 1) : current.outlineLevel
    const collapsed = outlineLevel ? current.collapsed : false
    if (axis.kind === 'row') rowEdits.push({ sheet: activeSheet.value, row: index, hidden, outlineLevel, collapsed })
    else columnEdits.push({ sheet: activeSheet.value, startColumn: index, endColumn: index, hidden, outlineLevel, collapsed })
  }
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_outline', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, rowEdits, columnEdits },
    })
    workbook.value = document
    const sheet = activeSheet.value
    generation += 1
    activeSheet.value = ''
    await selectSheet(sheet)
    message.success(action === 'hide' ? '所选行列已隐藏' : action === 'show' ? '所选行列已显示' : action === 'group' ? '分组层级已增加' : '分组层级已减少')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const restoreAxisSelection = async (sheet: string, axis: 'row' | 'column', index: number, count: number, action: 'insert' | 'delete') => {
  generation += 1
  activeSheet.value = ''
  await selectSheet(sheet)
  const total = axis === 'row' ? sheetInfo.value?.totalRows || 0 : sheetInfo.value?.totalColumns || 0
  const canvasLimit = axis === 'row' ? canvasRowCount.value : canvasColumnCount.value
  const focus = action === 'delete' ? Math.min(index, Math.max(0, total - 1), canvasLimit - 1) : Math.min(index, canvasLimit - 1)
  if (axis === 'row') await loadPage(focus)
  const end = action === 'insert' ? Math.min(canvasLimit - 1, focus + count - 1) : focus
  const row = axis === 'row' ? focus : 0
  const column = axis === 'column' ? focus : 0
  selectionAnchor.value = { sheet, row, column }
  selectionAreas.value = axis === 'row'
    ? [{ top: focus, bottom: end, left: 0, right: canvasColumnCount.value - 1 }]
    : [{ top: 0, bottom: canvasRowCount.value - 1, left: focus, right: end }]
  setSelectionFocus(row, column)
  await nextTick()
  scrollRef.value?.scrollTo(axis === 'row'
    ? { top: Math.max(0, rowOffset(focus) - 38), behavior: 'smooth' }
    : { left: Math.max(0, 52 + columnPixels.value.slice(0, focus).reduce((total, width) => total + width, 0) - 80), behavior: 'smooth' })
  await recalculateLoadedFormulas(false)
}
const commitStructure = async (axis: 'row' | 'column', action: 'insert' | 'delete', start: number, count: number) => {
  if (!workbook.value || updatingStructure.value) return
  updatingStructure.value = true
  const sheet = activeSheet.value
  try {
    const change: WorkbookStructureChange = { sheet, axis, action, index: start, count }
    const document = await invoke<WorkbookDocument>('update_workbook_structure', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreAxisSelection(sheet, axis, start, count, action)
    const axisLabel = axis === 'row' ? '行' : '列'
    message.success(action === 'insert' ? `已插入 ${count.toLocaleString()} ${axisLabel}` : `已删除 ${count.toLocaleString()} ${axisLabel}`)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const applyStructureAction = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const action = select.value as 'insert' | 'delete' | ''
  select.value = ''
  commitFormulaInput()
  const axis = selectedAxis.value
  if (!action || !axis || !workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能修改行列结构')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  const count = axis.end - axis.start + 1
  const axisLabel = axis.kind === 'row' ? '行' : '列'
  if (count > MAX_BATCH_CELLS) return void message.error(`单次最多插入或删除 ${MAX_BATCH_CELLS.toLocaleString()} ${axisLabel}`)
  if (action === 'insert') return void commitStructure(axis.kind, action, axis.start, count)
  dialog.warning({
    title: `删除 ${count.toLocaleString()} ${axisLabel}？`,
    content: `将删除第 ${axis.start + 1}${count > 1 ? ` 至 ${axis.end + 1}` : ''} ${axisLabel}，并迁移公式、Table、图表和相关工作表结构。不能安全迁移的复杂对象会拒绝事务；此操作保存后不能通过当前撤销栈恢复。`,
    positiveText: `删除${axisLabel}`,
    negativeText: '取消',
    onPositiveClick: () => commitStructure(axis.kind, action, axis.start, count),
  })
}
const restoreTableSelection = async (sheet: string, area: WorkbookMergeRange) => {
  generation += 1
  activeSheet.value = ''
  await selectSheet(sheet)
  await loadPage(area.top)
  selectionAnchor.value = { sheet, row: area.top, column: area.left }
  selectionAreas.value = [{ ...area }]
  setSelectionFocus(area.top, area.left)
  await recalculateLoadedFormulas(false)
}
const selectedDrawing = computed(() => sheetInfo.value?.drawings.find(drawing => drawing.id === selectedDrawingId.value))
const selectedChartSeries = computed(() => selectedDrawing.value?.chart?.series.find(series => series.index === selectedChartSeriesIndex.value))
const chartThemePalette = computed(() => getActiveThemeTone(store.theme).chartPalette)
const canEditDrawing = computed(() => Boolean(selectedDrawing.value?.editable && workbook.value && !saving.value && !updatingStructure.value && !sheetProtected.value && !dirtyCount.value))
const canApplyDrawingSelection = computed(() => Boolean(canEditDrawing.value && selectionAreas.value.length === 1 && selectionBounds.value))
const canEditChartTitle = computed(() => Boolean(canEditDrawing.value && selectedDrawing.value?.chart?.titleEditable))
const canEditChartSeries = computed(() => Boolean(canEditDrawing.value && selectedChartSeries.value?.editable))
const canEditChartSeriesName = computed(() => Boolean(canEditDrawing.value && selectedChartSeries.value?.nameEditable))
const canEditChartSeriesColor = computed(() => Boolean(canEditDrawing.value && selectedChartSeries.value?.colorEditable))
const canApplyChartSeriesColor = computed(() => Boolean(
  canEditChartSeriesColor.value
  && /^#[0-9A-F]{6}$/i.test(targetSeriesColor.value)
  && targetSeriesColor.value.toUpperCase() !== selectedChartSeries.value?.color?.toUpperCase(),
))
const canCreateChart = computed(() => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || !workbook.value || saving.value || updatingStructure.value || sheetProtected.value || dirtyCount.value) return false
  const rows = area.bottom - area.top + 1
  const columns = area.right - area.left + 1
  return rows >= 2 && columns >= 2 && (newChartType.value !== 'pie' || columns === 2)
})
const canDeleteChart = computed(() => Boolean(canEditDrawing.value && selectedDrawing.value?.chart))
const canChangeChartType = computed(() => {
  const chart = selectedDrawing.value?.chart
  if (!canEditDrawing.value || !chart || !['column', 'bar', 'line', 'pie', 'scatter'].includes(chart.chartType)) return false
  return chart.chartType !== targetChartType.value && (targetChartType.value !== 'pie' || chart.series.length === 1)
})
const canEditChartAxes = computed(() => Boolean(
  canEditDrawing.value
  && selectedDrawing.value?.chart?.presentationEditable
  && selectedDrawing.value.chart.chartType !== 'pie',
))
const canApplyLegendPosition = computed(() => Boolean(
  canEditDrawing.value
  && selectedDrawing.value?.chart?.presentationEditable
  && selectedDrawing.value.chart.legendPosition !== targetLegendPosition.value,
))
const canApplyDataLabels = computed(() => {
  const chart = selectedDrawing.value?.chart
  if (!canEditDrawing.value || !chart?.dataLabelsEditable) return false
  return (Object.keys(targetDataLabels.value) as (keyof WorkbookChartDataLabels)[])
    .some(key => targetDataLabels.value[key] !== chart.dataLabels[key])
})
const commitTableLifecycleChange = async (change: WorkbookTableChange, area: WorkbookMergeRange, success: string) => {
  if (!workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能编辑 Table')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  updatingStructure.value = true
  const sheet = activeSheet.value
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_table', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, area)
    message.success(success)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const promptDataValidationRule = (existing: WorkbookDataValidation | undefined, ranges: WorkbookMergeRange[]): WorkbookDataValidation | null => {
  const kindInput = window.prompt('规则类型：list（列表）、whole（整数）、decimal（小数）、textLength（文本长度）或 custom（自定义公式）', existing?.kind || 'list')
  if (kindInput === null) return null
  const kindAliases: Record<string, string> = { list: 'list', '列表': 'list', whole: 'whole', '整数': 'whole', decimal: 'decimal', '小数': 'decimal', textlength: 'textLength', '文本长度': 'textLength', custom: 'custom', '自定义': 'custom', '自定义公式': 'custom' }
  const kind = kindAliases[kindInput.trim().toLocaleLowerCase()] || kindAliases[kindInput.trim()]
  if (!kind) { message.error('不支持的数据验证类型'); return null }
  let operator: string | undefined
  if (['whole', 'decimal', 'textLength'].includes(kind)) {
    const input = window.prompt('比较方式：between、notBetween、equal、notEqual、lessThan、lessThanOrEqual、greaterThan、greaterThanOrEqual', existing?.operator || 'between')
    if (input === null) return null
    operator = input.trim()
    if (!['between', 'notBetween', 'equal', 'notEqual', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual'].includes(operator)) {
      message.error('不支持的比较方式'); return null
    }
  }
  const formulaHint = kind === 'list'
    ? '输入列表来源：字面量示例 "是,否"，或区域公式示例 Options!$A$1:$A$10'
    : kind === 'custom'
      ? '输入自定义公式，例如 A1>0；公式按选区左上角作为相对引用基准'
      : '输入第一个比较值或公式'
  const formula1 = window.prompt(formulaHint, existing?.formula1 || (kind === 'list' ? '"是,否"' : kind === 'custom' ? `${columnLabel(ranges[0].left)}${ranges[0].top + 1}<>""` : '0'))?.trim()
  if (!formula1) return null
  let formula2: string | undefined
  if (operator === 'between' || operator === 'notBetween') {
    const input = window.prompt('输入第二个比较值或公式', existing?.formula2 || '100')
    if (input === null) return null
    formula2 = input.trim()
    if (!formula2) return null
  }
  const error = window.prompt('输入错误提示；留空表示仅保存规则，不阻止当前编辑器中的输入', existing?.error || '输入不符合此单元格的数据验证规则')
  if (error === null) return null
  const prompt = window.prompt('输入选中单元格时的提示；可以留空', existing?.prompt || '')
  if (prompt === null) return null
  return {
    ranges: ranges.map(range => ({ ...range })),
    kind,
    operator,
    formula1,
    formula2,
    allowBlank: existing?.allowBlank ?? true,
    showErrorMessage: Boolean(error.trim()),
    errorTitle: error.trim() ? (existing?.errorTitle || '输入无效') : undefined,
    error: error.trim() || undefined,
    promptTitle: prompt.trim() ? (existing?.promptTitle || '数据验证') : undefined,
    prompt: prompt.trim() || undefined,
  }
}
const commitDataValidationChange = async (change: WorkbookDataValidationChange, area: WorkbookMergeRange, success: string) => {
  if (!workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能修改数据验证')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  updatingStructure.value = true
  const sheet = activeSheet.value
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_data_validation', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, area)
    message.success(success)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const editDataValidationRule = (action: 'create' | 'update') => {
  commitFormulaInput()
  const area = validationSelection.value
  if (!area || !canEditDataValidation.value) return
  const existing = action === 'update' ? selectedValidation.value : undefined
  const index = action === 'update' ? selectedValidationIndex.value : -1
  if (action === 'update' && (!existing || index < 0)) return void message.error('请选择一个已有数据验证规则')
  const validation = promptDataValidationRule(existing, existing?.ranges || [{ ...area }])
  if (!validation) return
  void commitDataValidationChange({
    sheet: activeSheet.value,
    action,
    validationIndex: action === 'update' ? index : undefined,
    validation,
  }, area, action === 'create' ? '已创建数据验证规则' : '已更新数据验证规则')
}
const applyValidationToSelection = () => {
  const existing = selectedValidation.value
  const index = selectedValidationIndex.value
  const area = validationSelection.value
  if (!existing || index < 0 || !area || !canEditDataValidation.value) return
  void commitDataValidationChange({
    sheet: activeSheet.value,
    action: 'update',
    validationIndex: index,
    validation: { ...existing, ranges: [{ ...area }] },
  }, area, '已把数据验证规则应用到当前选区')
}
const deleteDataValidationRule = () => {
  const existing = selectedValidation.value
  const index = selectedValidationIndex.value
  const area = validationSelection.value
  if (!existing || index < 0 || !area || !canEditDataValidation.value) return
  dialog.warning({
    title: '删除数据验证规则？',
    content: '将从 XLSX 中删除当前单元格所属的整条验证规则；规则覆盖的其他单元格也会失去该规则，且不能通过当前撤销栈恢复。',
    positiveText: '删除规则',
    negativeText: '取消',
    onPositiveClick: () => commitDataValidationChange({ sheet: activeSheet.value, action: 'delete', validationIndex: index }, area, '已删除数据验证规则'),
  })
}
const CONDITIONAL_STYLE_PRESETS: Record<string, WorkbookConditionalFormatStyle> = {
  red_fill: { fillColor: '#FFC7CE', fontColor: '#9C0006', bold: false },
  yellow_fill: { fillColor: '#FFEB9C', fontColor: '#9C6500', bold: false },
  green_fill: { fillColor: '#C6EFCE', fontColor: '#006100', bold: false },
  red_text: { fontColor: '#C00000', bold: true },
  green_text: { fontColor: '#008000', bold: true },
}
const colorScaleThresholdToken = (point: WorkbookConditionalColorScalePoint) => point.kind === 'min' || point.kind === 'max' ? point.kind : `${point.kind}:${point.value || ''}`
const conditionalThresholdToken = (point: WorkbookConditionalThreshold) => point.kind === 'min' || point.kind === 'max' ? point.kind : `${point.kind}:${point.value || ''}`
const parseColorScaleThresholds = (source: string, count: number): WorkbookConditionalColorScalePoint[] | null => {
  const tokens = source.split(',').map(value => value.trim()).filter(Boolean)
  if (tokens.length !== count) return null
  const points: WorkbookConditionalColorScalePoint[] = []
  for (const [index, token] of tokens.entries()) {
    const lower = token.toLowerCase()
    if (lower === 'min' || lower === 'max') {
      if ((lower === 'min' && index !== 0) || (lower === 'max' && index + 1 !== count)) return null
      points.push({ kind: lower, color: '' }); continue
    }
    const match = lower.match(/^(num|percent|percentile):(.+)$/)
    const kind = match?.[1] || 'num'
    const valueSource = match?.[2] || token
    const value = Number(valueSource)
    if (!Number.isFinite(value) || (kind !== 'num' && (value < 0 || value > 100))) return null
    points.push({ kind, value: String(value), color: '', resolvedValue: kind === 'num' ? String(value) : undefined })
  }
  const fixed = points.every(point => point.kind === 'num')
  if (fixed && points.some((point, index) => index > 0 && Number(points[index - 1].value) >= Number(point.value))) return null
  return points
}
const parseDataBarThresholds = (source: string): [WorkbookConditionalThreshold, WorkbookConditionalThreshold] | null => {
  const points = parseColorScaleThresholds(source, 2)
  if (!points) return null
  return points.map(({ kind, value, resolvedValue }) => ({ kind, value, resolvedValue })) as [WorkbookConditionalThreshold, WorkbookConditionalThreshold]
}
const STANDARD_ICON_SET_COUNTS: Record<string, number> = {
  '3Arrows': 3, '3ArrowsGray': 3, '3Flags': 3, '3TrafficLights1': 3, '3TrafficLights2': 3, '3Signs': 3, '3Symbols': 3, '3Symbols2': 3,
  '4Arrows': 4, '4ArrowsGray': 4, '4RedToBlack': 4, '4Rating': 4, '4TrafficLights': 4,
  '5Arrows': 5, '5ArrowsGray': 5, '5Rating': 5, '5Quarters': 5,
}
const iconThresholdToken = (point: WorkbookConditionalIconThreshold) => `${point.inclusive ? '' : '>'}${point.kind}:${point.value || ''}`
const parseIconThresholds = (source: string, count: number): WorkbookConditionalIconThreshold[] | null => {
  const tokens = source.split(',').map(value => value.trim()).filter(Boolean)
  if (tokens.length !== count) return null
  const thresholds: WorkbookConditionalIconThreshold[] = []
  for (const token of tokens) {
    const inclusive = !token.startsWith('>')
    const match = token.replace(/^>/, '').toLowerCase().match(/^(num|percent|percentile):(.+)$/)
    if (!match) return null
    const kind = match[1]
    const value = Number(match[2])
    if (!Number.isFinite(value) || (kind !== 'num' && (value < 0 || value > 100))) return null
    thresholds.push({ kind, value: String(value), resolvedValue: kind === 'num' ? String(value) : undefined, inclusive })
  }
  if (thresholds[0].kind !== 'percent' || thresholds[0].value !== '0' || !thresholds[0].inclusive) return null
  if (thresholds.every(point => point.kind === thresholds[0].kind) && thresholds.some((point, index) => index > 0 && Number(thresholds[index - 1].value) > Number(point.value))) return null
  return thresholds
}
const promptConditionalFormatRule = (existing: WorkbookConditionalFormatRule | undefined, ranges: WorkbookMergeRange[]): WorkbookConditionalFormatRule | null => {
  const kind = window.prompt('规则类型：cellIs（单元格数值）、expression（引用表达式）、colorScale（色阶）、dataBar（数据条）或 iconSet（图标集）', existing?.kind || 'cellIs')?.trim()
  if (!kind) return null
  if (!['cellIs', 'expression', 'colorScale', 'dataBar', 'iconSet'].includes(kind)) { message.error('规则类型必须是 cellIs、expression、colorScale、dataBar 或 iconSet'); return null }
  let operator: string | undefined
  let formula1: string | undefined
  let formula2: string | undefined
  let colorScale: WorkbookConditionalColorScale | undefined
  let dataBar: WorkbookConditionalDataBar | undefined
  let iconSet: WorkbookConditionalIconSet | undefined
  if (kind === 'colorScale') {
    const existingPoints = existing?.kind === 'colorScale' ? existing.colorScale?.points : undefined
    const countSource = window.prompt('色阶点数：2 或 3', String(existingPoints?.length || 3))?.trim()
    const count = Number(countSource)
    if (!matchesColorScaleLength(count)) { message.error('色阶点数必须是 2 或 3'); return null }
    const thresholdSource = window.prompt(`输入 ${count} 个阈值：min、max、num:数值、percent:0-100 或 percentile:0-100，以逗号分隔`, existingPoints?.map(colorScaleThresholdToken).join(',') || (count === 2 ? 'min,max' : 'min,percentile:50,max'))?.trim()
    const thresholds = thresholdSource ? parseColorScaleThresholds(thresholdSource, count) : null
    if (!thresholds) { message.error('色阶阈值格式或顺序无效'); return null }
    const colorSource = window.prompt(`输入 ${count} 个 #RRGGBB 颜色，以逗号分隔`, existingPoints?.map(point => point.color).join(',') || (count === 2 ? '#F8696B,#63BE7B' : '#F8696B,#FFEB84,#63BE7B'))?.trim()
    const colors = colorSource?.split(',').map(value => value.trim().toUpperCase()) || []
    if (colors.length !== count || colors.some(value => !/^#[0-9A-F]{6}$/.test(value))) { message.error('色阶颜色必须使用 #RRGGBB'); return null }
    colorScale = { points: thresholds.map((point, index) => ({ ...point, color: colors[index] })) }
  } else if (kind === 'dataBar') {
    const existingBar = existing?.kind === 'dataBar' ? existing.dataBar : undefined
    const thresholdSource = window.prompt('输入两个阈值：min、max、num:数值、percent:0-100 或 percentile:0-100，以逗号分隔；负数固定阈值会自动显示正负轴', existingBar ? `${conditionalThresholdToken(existingBar.minimum)},${conditionalThresholdToken(existingBar.maximum)}` : 'min,max')?.trim()
    const thresholds = thresholdSource ? parseDataBarThresholds(thresholdSource) : null
    if (!thresholds) { message.error('数据条阈值格式或顺序无效'); return null }
    const color = window.prompt('数据条颜色（#RRGGBB）', existingBar?.color || '#638EC6')?.trim().toUpperCase()
    if (!color || !/^#[0-9A-F]{6}$/.test(color)) { message.error('数据条颜色必须使用 #RRGGBB'); return null }
    const minLength = Number(window.prompt('最短数据条长度（0-100）', String(existingBar?.minLength ?? 10))?.trim())
    const maxLength = Number(window.prompt('最长数据条长度（0-100）', String(existingBar?.maxLength ?? 90))?.trim())
    if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || minLength < 0 || minLength > maxLength || maxLength > 100) { message.error('数据条长度必须满足 0 ≤ 最短长度 ≤ 最长长度 ≤ 100'); return null }
    const showValueSource = window.prompt('是否显示单元格数值：true 或 false', String(existingBar?.showValue ?? true))?.trim().toLowerCase()
    if (!['true', 'false'].includes(showValueSource || '')) { message.error('是否显示数值必须填写 true 或 false'); return null }
    dataBar = {
      minimum: thresholds[0],
      maximum: thresholds[1],
      color,
      showValue: showValueSource === 'true',
      minLength,
      maxLength,
    }
  } else if (kind === 'iconSet') {
    const existingSet = existing?.kind === 'iconSet' ? existing.iconSet : undefined
    const iconSetName = window.prompt(`标准图标集：${Object.keys(STANDARD_ICON_SET_COUNTS).join('、')}`, existingSet?.iconSet || '3TrafficLights1')?.trim()
    const count = iconSetName ? STANDARD_ICON_SET_COUNTS[iconSetName] : undefined
    if (!iconSetName || !count) { message.error('请选择受支持的标准图标集'); return null }
    const defaults = count === 3 ? 'percent:0,percent:33,percent:67' : count === 4 ? 'percent:0,percent:25,percent:50,percent:75' : 'percent:0,percent:20,percent:40,percent:60,percent:80'
    const thresholdSource = window.prompt(`输入 ${count} 个 num/percent/percentile 阈值；首项必须为 percent:0，在阈值前加 > 表示严格大于`, existingSet?.thresholds.map(iconThresholdToken).join(',') || defaults)?.trim()
    const thresholds = thresholdSource ? parseIconThresholds(thresholdSource, count) : null
    if (!thresholds) { message.error('图标阈值格式、数量或顺序无效'); return null }
    const reverseSource = window.prompt('是否反转图标顺序：true 或 false', String(existingSet?.reverse ?? false))?.trim().toLowerCase()
    const showValueSource = window.prompt('是否同时显示单元格数值：true 或 false', String(existingSet?.showValue ?? true))?.trim().toLowerCase()
    if (!['true', 'false'].includes(reverseSource || '') || !['true', 'false'].includes(showValueSource || '')) { message.error('图标选项必须填写 true 或 false'); return null }
    iconSet = { iconSet: iconSetName, thresholds, reverse: reverseSource === 'true', showValue: showValueSource === 'true' }
  } else if (kind === 'expression') {
    formula1 = window.prompt('输入安全条件表达式，例如 AND($D2="逾期",E2<100)；支持 AND、OR、NOT、多 A1 引用与字面量比较，不支持区域、跨 Sheet 或其他函数', existing?.kind === 'expression' ? existing.formula1 || '' : `${columnLabel(ranges[0]?.left || 0)}${(ranges[0]?.top || 0) + 1}>0`)?.trim()
    if (!formula1 || !parseConditionalExpression(formula1)) { message.error('表达式不在安全子集内：仅支持 AND、OR、NOT 和 A1 引用/字面量比较'); return null }
  } else {
    operator = window.prompt('比较方式：between、notBetween、equal、notEqual、lessThan、lessThanOrEqual、greaterThan、greaterThanOrEqual', existing?.kind === 'cellIs' ? existing.operator || 'greaterThan' : 'greaterThan')?.trim()
    if (!operator) return null
    if (!['between', 'notBetween', 'equal', 'notEqual', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual'].includes(operator)) {
      message.error('不支持的条件格式比较方式'); return null
    }
    formula1 = window.prompt('输入第一个数字阈值', existing?.kind === 'cellIs' ? existing.formula1 || '0' : '0')?.trim()
    if (!formula1 || !Number.isFinite(Number(formula1.replace(/^=/, '')))) { message.error('阈值必须是有限数字'); return null }
    if (operator === 'between' || operator === 'notBetween') {
      formula2 = window.prompt('输入第二个数字阈值', existing?.kind === 'cellIs' ? existing.formula2 || '100' : '100')?.trim()
      if (!formula2 || !Number.isFinite(Number(formula2.replace(/^=/, '')))) { message.error('第二个阈值必须是有限数字'); return null }
    }
  }
  let style: WorkbookConditionalFormatStyle = { bold: false }
  if (!['colorScale', 'dataBar', 'iconSet'].includes(kind)) {
    const preset = window.prompt('视觉样式：red_fill、yellow_fill、green_fill、red_text 或 green_text', 'yellow_fill')?.trim()
    if (!preset) return null
    const selected = CONDITIONAL_STYLE_PRESETS[preset]
    if (!selected) { message.error('不支持的条件格式视觉样式'); return null }
    style = { ...selected }
  }
  let stopIfTrue = false
  if (!['colorScale', 'dataBar', 'iconSet'].includes(kind)) {
    const stopSource = window.prompt('规则命中后是否停止执行后续规则：true 或 false', String(existing?.stopIfTrue ?? true))?.trim().toLowerCase()
    if (!['true', 'false'].includes(stopSource || '')) { message.error('停止后续规则必须填写 true 或 false'); return null }
    stopIfTrue = stopSource === 'true'
  }
  return {
    groupIndex: existing?.groupIndex ?? 0,
    ruleIndex: 0,
    ranges: ranges.map(range => ({ ...range })),
    kind,
    operator,
    formula1,
    formula2,
    priority: existing?.priority || 0,
    stopIfTrue,
    style,
    colorScale,
    dataBar,
    iconSet,
    editable: true,
  }
}
const commitConditionalFormatChange = async (change: WorkbookConditionalFormatChange, area: WorkbookMergeRange, success: string) => {
  if (!workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能修改条件格式')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  updatingStructure.value = true
  const sheet = activeSheet.value
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_conditional_format', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, area)
    message.success(success)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const editConditionalFormatRule = (action: 'create' | 'update') => {
  commitFormulaInput()
  const area = conditionalSelection.value
  if (!area || !canEditConditionalFormat.value) return
  const existing = action === 'update' ? selectedConditionalFormat.value : undefined
  if (action === 'update' && !existing?.editable) return void message.error('当前条件格式为复杂只读规则')
  const rule = promptConditionalFormatRule(existing, existing?.ranges || [{ ...area }])
  if (!rule) return
  void commitConditionalFormatChange({ sheet: activeSheet.value, action, groupIndex: existing?.groupIndex, ruleIndex: existing?.ruleIndex, rule }, area, action === 'create' ? '已创建条件格式规则' : '已更新条件格式规则')
}
const applyConditionalFormatToSelection = () => {
  const existing = selectedConditionalFormat.value
  const area = conditionalSelection.value
  if (!existing?.editable || !area || !canEditConditionalFormat.value) return
  if (selectedConditionalGroupSize.value > 1) return void message.error('同范围多规则组共享应用范围，当前不能单独改变其中一条规则的选区')
  void commitConditionalFormatChange({ sheet: activeSheet.value, action: 'update', groupIndex: existing.groupIndex, ruleIndex: existing.ruleIndex, rule: { ...existing, ranges: [{ ...area }] } }, area, '已把条件格式应用到当前选区')
}
const moveConditionalFormatRule = (action: 'move_up' | 'move_down') => {
  const existing = selectedConditionalFormat.value
  const area = conditionalSelection.value
  if (!existing?.editable || !area || !canEditConditionalFormat.value) return
  selectedConditionalRuleKey.value = conditionalRuleKey(existing)
  void commitConditionalFormatChange(
    { sheet: activeSheet.value, action, groupIndex: existing.groupIndex, ruleIndex: existing.ruleIndex },
    area,
    action === 'move_up' ? '已提高条件格式优先级' : '已降低条件格式优先级',
  )
}
const splitConditionalFormatRule = () => {
  const existing = selectedConditionalFormat.value
  const area = conditionalSelection.value
  if (!existing?.editable || !area || !canSplitConditionalFormat.value) return
  dialog.warning({
    title: '拆分当前条件格式规则？',
    content: `当前规则将离开共享范围组，并单独应用到 ${columnLabel(area.left)}${area.top + 1}:${columnLabel(area.right)}${area.bottom + 1}。其他组内规则保持原范围。`,
    positiveText: '拆分规则',
    negativeText: '取消',
    onPositiveClick: () => commitConditionalFormatChange({
      sheet: activeSheet.value,
      action: 'split',
      groupIndex: existing.groupIndex,
      ruleIndex: existing.ruleIndex,
      rule: { ...existing, ranges: [{ ...area }] },
    }, area, '已拆分条件格式规则'),
  })
}
const mergeConditionalFormatRule = () => {
  const existing = selectedConditionalFormat.value
  const area = conditionalSelection.value
  if (!existing?.editable || !area || !conditionalMergeCandidate.value || !canEditConditionalFormat.value) return
  dialog.warning({
    title: '合并同范围条件格式规则？',
    content: '当前独立规则将并入范围完全相同的规则组；公式、样式、优先级和停止语义保持不变。',
    positiveText: '合并规则',
    negativeText: '取消',
    onPositiveClick: () => commitConditionalFormatChange({
      sheet: activeSheet.value,
      action: 'merge',
      groupIndex: existing.groupIndex,
      ruleIndex: existing.ruleIndex,
    }, area, '已合并同范围条件格式规则'),
  })
}
const deleteConditionalFormatRule = () => {
  const existing = selectedConditionalFormat.value
  const area = conditionalSelection.value
  if (!existing?.editable || !area || !canEditConditionalFormat.value) return
  dialog.warning({
    title: '删除条件格式规则？',
    content: '将删除当前单元格命中的整条条件格式规则，且不能通过当前撤销栈恢复。',
    positiveText: '删除规则',
    negativeText: '取消',
    onPositiveClick: () => commitConditionalFormatChange({ sheet: activeSheet.value, action: 'delete', groupIndex: existing.groupIndex, ruleIndex: existing.ruleIndex }, area, '已删除条件格式规则'),
  })
}
const renameSelectedTable = () => {
  commitFormulaInput()
  const table = selectedTable.value
  if (!table) return
  const newTableName = window.prompt('输入新的 Table 名称', table.displayName)?.trim()
  if (!newTableName || newTableName === table.displayName) return
  void commitTableLifecycleChange({
    sheet: activeSheet.value,
    action: 'rename',
    tableName: table.displayName,
    newTableName,
    range: { ...table.range },
  }, table.range, `已将 Table 重命名为 ${newTableName}`)
}
const setSelectedTableStyle = (styleName: string) => {
  const table = selectedTable.value
  if (!table || styleName === table.styleName) return
  void commitTableLifecycleChange({
    sheet: activeSheet.value,
    action: 'set_style',
    tableName: table.displayName,
    styleName,
    range: { ...table.range },
  }, table.range, `已应用 ${styleName}`)
}
type TableStyleOption = 'showFirstColumn' | 'showLastColumn' | 'showRowStripes' | 'showColumnStripes'
const setSelectedTableStyleOption = (option: TableStyleOption, value: boolean) => {
  const table = selectedTable.value
  if (!table) return
  void commitTableLifecycleChange({
    sheet: activeSheet.value,
    action: 'set_style',
    tableName: table.displayName,
    [option]: value,
    range: { ...table.range },
  }, table.range, '已更新 Table 样式选项')
}
const removeSelectedTable = (action: 'convert_to_range' | 'delete') => {
  commitFormulaInput()
  const table = selectedTable.value
  if (!table) return
  dialog.warning({
    title: action === 'convert_to_range' ? '转换为普通区域？' : '删除 Table？',
    content: `${action === 'convert_to_range' ? '转换' : '删除'}后将移除 ${table.displayName} 的 Table 定义、样式和筛选入口，但保留当前单元格数据。此操作保存后不能通过当前撤销栈恢复。`,
    positiveText: action === 'convert_to_range' ? '转换' : '删除 Table',
    negativeText: '取消',
    onPositiveClick: () => commitTableLifecycleChange({
      sheet: activeSheet.value,
      action,
      tableName: table.displayName,
      range: { ...table.range },
    }, table.range, action === 'convert_to_range' ? '已转换为普通区域' : '已删除 Table 定义'),
  })
}
const editSelectedTable = async (action: 'create' | 'resize') => {
  commitFormulaInput()
  const area = tableSelection.value
  if (!area || !workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能编辑 Table')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  const table = selectedTable.value
  if (action === 'resize' && !table) return void message.error('请选择与目标 Table 相交的调整范围')
  if (action === 'create' && table) return void message.error('选区与已有 Table 重叠')
  const columns: string[] = []
  for (let column = area.left; column <= area.right; column += 1) {
    const header = cellAt(area.top, column)
    if (header.formula) return void message.error('Table 表头不能使用公式')
    const name = header.value.trim()
    if (!name) return void message.error(`Table 表头 ${columnLabel(column)}${area.top + 1} 不能为空`)
    columns.push(name)
  }
  if (new Set(columns.map(name => name.toLocaleLowerCase())).size !== columns.length) return void message.error('Table 表头不能重名')
  const defaultName = table?.displayName || `Table${(sheetInfo.value?.tables.length || 0) + 1}`
  const tableName = action === 'create' ? window.prompt('输入 Table 名称', defaultName)?.trim() : defaultName
  if (!tableName) return
  updatingStructure.value = true
  try {
    const change: WorkbookTableChange = { sheet: activeSheet.value, action, tableName, range: { ...area }, columns }
    const document = await invoke<WorkbookDocument>('update_workbook_table', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    const sheet = activeSheet.value
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, area)
    message.success(action === 'create' ? `已创建 Table ${tableName}` : `已调整 Table ${tableName}`)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const mergeSelection = () => {
  const area = canMergeSelection.value ? selectionBounds.value : null
  if (!area) return
  if ((area.bottom - area.top + 1) * (area.right - area.left + 1) > MAX_BATCH_CELLS) return void message.error(`单次合并不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
  const key = mergeKey(activeSheet.value, area)
  const before = mergeDrafts.value.get(key)
  const sourceExists = sourceMergedCells.value.some(range => mergeKey(activeSheet.value, range) === key)
  const after = sourceExists ? undefined : { sheet: activeSheet.value, ...area, action: 'merge' as const }
  const next = new Map(mergeDrafts.value)
  if (after) next.set(key, after)
  else next.delete(key)
  mergeDrafts.value = next
  undoStack.value.push({ mergeChanges: [{ key, before, after }] })
  redoStack.value = []
}
const unmergeSelection = () => {
  const range = selectedMerge.value
  if (!range) return
  const key = mergeKey(activeSheet.value, range)
  const before = mergeDrafts.value.get(key)
  const sourceExists = sourceMergedCells.value.some(item => mergeKey(activeSheet.value, item) === key)
  const after = sourceExists ? { sheet: activeSheet.value, ...range, action: 'unmerge' as const } : undefined
  const next = new Map(mergeDrafts.value)
  if (after) next.set(key, after)
  else next.delete(key)
  mergeDrafts.value = next
  undoStack.value.push({ mergeChanges: [{ key, before, after }] })
  redoStack.value = []
  selectionAreas.value = [{ ...range }]
  selectionAnchor.value = { sheet: activeSheet.value, row: range.top, column: range.left }
  setSelectionFocus(range.top, range.left)
}

const applyBatchInputs = (start: CellSelection, matrix: string[][]) => {
  const cellCount = matrix.reduce((count, row) => count + row.length, 0)
  const width = Math.max(0, ...matrix.map(row => row.length))
  if (!cellCount || cellCount > MAX_BATCH_CELLS || matrix.length * width > MAX_BATCH_CELLS) throw new Error(`单次区域编辑不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
  const changes: CellChange[] = []
  matrix.forEach((values, rowOffset) => values.forEach((input, columnOffset) => {
    const selection = { sheet: start.sheet, row: start.row + rowOffset, column: start.column + columnOffset }
    if (selection.row >= 1_048_576 || selection.column >= 16_384) throw new Error('粘贴区域超出 XLSX 坐标上限')
    if (selection.column >= 256) throw new Error('当前工作面最多编辑前 256 列')
    if (arrayFormulaAt(selection.row, selection.column)) throw new Error(`${columnLabel(selection.column)}${selection.row + 1} 位于只读数组公式区域`)
    const key = editKey(selection.sheet, selection.row, selection.column)
    const before = drafts.value.get(key)
    const source = sourceCellAt(selection.row, selection.column)
    if (!before && ['date', 'error'].includes(source.kind)) throw new Error(`${columnLabel(selection.column)}${selection.row + 1} 当前类型暂不支持区域写入`)
    const after = input === originalInput(source) || (!input && source.kind === 'empty') ? undefined : inferEdit(selection, input)
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after })
  }))
  if (!changes.length) return
  const next = new Map(drafts.value)
  for (const change of changes) {
    if (change.after) next.set(change.key, change.after)
    else next.delete(change.key)
  }
  drafts.value = next
  invalidateCalculation()
  undoStack.value.push({ changes })
  redoStack.value = []
}
const selectedMatrix = () => {
  const bounds = selectionBounds.value
  if (!bounds) return []
  if (selectionAreas.value.length !== 1) throw new Error('多区域选择不能直接复制为 TSV，请保留一个连续区域')
  const count = (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1)
  if (count > MAX_BATCH_CELLS) throw new Error(`选择区域不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    if (row < (sheetInfo.value?.totalRows || 0) && !loadedRows.value.has(row)) throw new Error('选择区域包含尚未载入的数据，请滚动到该区域后重试')
  }
  return Array.from({ length: bounds.bottom - bounds.top + 1 }, (_, rowOffset) =>
    Array.from({ length: bounds.right - bounds.left + 1 }, (_, columnOffset) => originalInput(cellAt(bounds.top + rowOffset, bounds.left + columnOffset))))
}
const copySelection = async () => {
  try {
    const matrix = selectedMatrix()
    if (!matrix.length) return false
    await navigator.clipboard.writeText(matrix.map(row => row.join('\t')).join('\r\n'))
    message.success(`已复制 ${matrix.length} × ${matrix[0].length} 区域`)
    return true
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')); return false }
}
const pasteSelection = async () => {
  if (!selectedCell.value) return
  try {
    const text = await navigator.clipboard.readText()
    if (text.length > 10 * 1024 * 1024) throw new Error('剪贴板文本不能超过 10 MB')
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
    const matrix = normalized.split('\n').map(row => row.split('\t'))
    const start = { ...selectedCell.value }
    applyBatchInputs(start, matrix)
    selectionAnchor.value = start
    const bottom = start.row + matrix.length - 1
    const right = start.column + Math.max(...matrix.map(row => row.length)) - 1
    selectionAreas.value = [{ top: start.row, bottom, left: start.column, right }]
    setSelectionFocus(bottom, right)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const clearSelection = () => {
  const focus = selectedCell.value
  if (!focus) return
  try {
    const changes: CellChange[] = []
    for (const { row, column } of selectedCoordinates()) {
      if (arrayFormulaAt(row, column)) throw new Error(`${columnLabel(column)}${row + 1} 位于只读数组公式区域`)
      const key = editKey(focus.sheet, row, column)
      const before = drafts.value.get(key)
      const source = sourceCellAt(row, column)
      if (!before && ['date', 'error'].includes(source.kind)) throw new Error(`${columnLabel(column)}${row + 1} 当前类型暂不支持区域写入`)
      const selection = { sheet: focus.sheet, row, column }
      const after = source.kind === 'empty' ? undefined : inferEdit(selection, '')
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after })
    }
    if (changes.length) {
      const next = new Map(drafts.value)
      for (const change of changes) {
        if (change.after) next.set(change.key, change.after)
        else next.delete(change.key)
      }
      drafts.value = next
      invalidateCalculation()
      undoStack.value.push({ changes })
      redoStack.value = []
    }
    formulaInput.value = originalInput(cellAt(focus.row, focus.column))
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const cutSelection = async () => { if (await copySelection()) clearSelection() }

const styleAsPatch = (style: WorkbookCellStyle): WorkbookStylePatch => ({
  namedStyle: style.namedStyle,
  numberFormat: style.numberFormat, fontName: style.fontName, fontSize: style.fontSize,
  bold: style.bold, italic: style.italic, underline: style.underline,
  fontColor: style.fontColor || '', fillColor: style.fillColor || '',
  borderStyle: style.borderStyle, borderColor: style.borderColor || '',
  borderTop: style.borderTop, borderRight: style.borderRight, borderBottom: style.borderBottom, borderLeft: style.borderLeft,
  horizontalAlignment: style.horizontalAlignment, wrapText: style.wrapText,
})
const patternIndex = (value: number, start: number, size: number) => start + ((value - start) % size + size) % size
const commitFill = async (source: SelectionArea | null, preview: SelectionArea | null) => {
  if (!source || !preview || JSON.stringify(source) === JSON.stringify(preview)) return
  try {
    const destination: Array<{ row: number; column: number; sourceRow: number; sourceColumn: number; input: string }> = []
    const sourceHeight = source.bottom - source.top + 1
    const sourceWidth = source.right - source.left + 1
    const vertical = preview.top !== source.top || preview.bottom !== source.bottom
    for (let row = preview.top; row <= preview.bottom; row += 1) {
      for (let column = preview.left; column <= preview.right; column += 1) {
        if (row >= source.top && row <= source.bottom && column >= source.left && column <= source.right) continue
        const sourceRow = patternIndex(row, source.top, sourceHeight)
        const sourceColumn = patternIndex(column, source.left, sourceWidth)
        const sourceCell = cellAt(sourceRow, sourceColumn)
        if (['date', 'error'].includes(sourceCell.kind)) throw new Error('日期和错误单元格暂不支持填充')
        destination.push({ row, column, sourceRow, sourceColumn, input: originalInput(sourceCell) })
        if (destination.length > MAX_BATCH_CELLS) throw new Error(`单次填充不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
      }
    }

    const seriesCells = vertical && sourceWidth === 1 && sourceHeight >= 2
      ? Array.from({ length: sourceHeight }, (_, index) => cellAt(source.top + index, source.left))
      : !vertical && sourceHeight === 1 && sourceWidth >= 2
        ? Array.from({ length: sourceWidth }, (_, index) => cellAt(source.top, source.left + index))
        : []
    const seriesValues = seriesCells.map(cell => cell.formula ? Number.NaN : Number(originalInput(cell)))
    if (seriesValues.length >= 2 && seriesValues.every(Number.isFinite)) {
      const step = seriesValues[seriesValues.length - 1] - seriesValues[seriesValues.length - 2]
      for (const item of destination) {
        const offset = vertical ? item.row - source.top : item.column - source.left
        item.input = String(seriesValues[0] + step * offset)
      }
    }

    const formulaRequests: FormulaTranslation[] = []
    const formulaDestinations: number[] = []
    destination.forEach((item, index) => {
      if (!item.input.startsWith('=')) return
      formulaRequests.push({ formula: item.input, rowDelta: item.row - item.sourceRow, columnDelta: item.column - item.sourceColumn })
      formulaDestinations.push(index)
    })
    if (formulaRequests.length) {
      const translated = await invoke<string[]>('translate_workbook_formulas', { requests: formulaRequests })
      translated.forEach((formula, index) => { destination[formulaDestinations[index]].input = formula })
    }

    const changes: CellChange[] = []
    const styleChanges: StyleChange[] = []
    for (const item of destination) {
      if (arrayFormulaAt(item.row, item.column)) throw new Error(`${columnLabel(item.column)}${item.row + 1} 位于只读数组公式区域`)
      const key = editKey(activeSheet.value, item.row, item.column)
      const before = drafts.value.get(key)
      const targetSource = sourceCellAt(item.row, item.column)
      if (!before && ['date', 'error'].includes(targetSource.kind)) throw new Error(`${columnLabel(item.column)}${item.row + 1} 当前类型暂不支持填充`)
      const selection = { sheet: activeSheet.value, row: item.row, column: item.column }
      const after = item.input === originalInput(targetSource) || (!item.input && targetSource.kind === 'empty') ? undefined : inferEdit(selection, item.input)
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after })

      const styleBefore = styleDrafts.value.get(key)
      const copiedStyle = styleAsPatch(cellStyleAt(item.sourceRow, item.sourceColumn))
      const styleAfter = stylePatchMatchesSource(item.row, item.column, copiedStyle) ? undefined : copiedStyle
      if (JSON.stringify(styleBefore) !== JSON.stringify(styleAfter)) styleChanges.push({ key, before: styleBefore, after: styleAfter })
    }
    if (!changes.length && !styleChanges.length) return
    const nextDrafts = new Map(drafts.value)
    for (const change of changes) change.after ? nextDrafts.set(change.key, change.after) : nextDrafts.delete(change.key)
    drafts.value = nextDrafts
    if (changes.length) invalidateCalculation()
    const nextStyles = new Map(styleDrafts.value)
    for (const change of styleChanges) change.after ? nextStyles.set(change.key, change.after) : nextStyles.delete(change.key)
    styleDrafts.value = nextStyles
    undoStack.value.push({ changes, styleChanges })
    redoStack.value = []
    selectionAreas.value = [preview]
    selectionAnchor.value = { sheet: activeSheet.value, row: preview.top, column: preview.left }
    setSelectionFocus(preview.bottom, preview.right)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}

const recalculateLoadedFormulas = async (notify: boolean) => {
  commitFormulaInput()
  if (!workbook.value || calculating.value) return
  const sheet = activeSheet.value
  const targets = new Map<string, WorkbookFormulaTarget>()
  for (const [row, cells] of loadedRows.value) {
    cells.forEach((cell, column) => {
      const key = editKey(sheet, row, column)
      const edit = drafts.value.get(key)
      if (edit?.kind === 'formula' || (!edit && cell.formula)) targets.set(key, { sheet, row, column })
    })
  }
  for (const [key, edit] of drafts.value) {
    if (edit.sheet === sheet && edit.kind === 'formula') targets.set(key, { sheet, row: edit.row, column: edit.column })
  }
  if (!targets.size) {
    if (notify) message.info('当前已加载区域没有公式')
    return
  }
  if (targets.size > MAX_BATCH_CELLS) return void message.error(`单次最多重算 ${MAX_BATCH_CELLS.toLocaleString()} 个已加载公式`)
  const currentGeneration = generation
  calculating.value = true
  try {
    const result = await invoke<WorkbookCalculationResult>('recalculate_workbook_formulas', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        edits: Array.from(drafts.value.values()),
        targets: Array.from(targets.values()),
      },
    })
    if (currentGeneration !== generation || sheet !== activeSheet.value) return
    calculatedValues.value = new Map(result.cells.map(cell => [editKey(cell.sheet, cell.row, cell.column), cell]))
    calculationCount.value = result.evaluatedFormulaCount
    calculationErrors.value = result.diagnostics.length
    if (result.diagnostics.length) message.warning(`重算完成，发现 ${result.diagnostics.length} 个公式错误`)
    else if (notify) message.success(`已重算 ${result.evaluatedFormulaCount} 个公式`)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { calculating.value = false }
}
const recalculateFormulas = () => recalculateLoadedFormulas(true)

const loadPage = async (offset: number) => {
  if (!activeSheet.value || !workbook.value) return
  offset = Math.max(0, Math.floor(offset / PAGE_ROWS) * PAGE_ROWS)
  if (sheetInfo.value && offset >= sheetInfo.value.totalRows) return
  wantedOffset = offset
  if (loadedPages.has(offset) || pageLoading.value) return
  const current = generation
  const sheet = activeSheet.value
  pageLoading.value = true
  try {
    const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet, rowOffset: offset, rowLimit: PAGE_ROWS })
    if (current !== generation || sheet !== activeSheet.value) return
    const next = new Map(loadedRows.value)
    page.rows.forEach((row, index) => next.set(page.rowOffset + index, row))
    loadedRows.value = next
    const nextRowHeights = new Map(sourceRowHeights.value)
    page.rowHeights.forEach(item => nextRowHeights.set(item.row, item.height))
    sourceRowHeights.value = nextRowHeights
    const nextColumnWidths = new Map(sourceColumnWidths.value)
    page.columnWidths.forEach(item => {
      for (let column = item.startColumn; column <= item.endColumn && column < 256; column += 1) nextColumnWidths.set(column, item.width)
    })
    sourceColumnWidths.value = nextColumnWidths
    const nextRowStates = new Map(sourceRowStates.value)
    page.rowStates.forEach(item => nextRowStates.set(item.row, item))
    sourceRowStates.value = nextRowStates
    const nextColumnStates = new Map(sourceColumnStates.value)
    page.columnStates.forEach(item => {
      for (let column = item.startColumn; column <= item.endColumn && column < 256; column += 1) nextColumnStates.set(column, item)
    })
    sourceColumnStates.value = nextColumnStates
    const mergeMap = new Map(sourceMergedCells.value.map(range => [mergeKey(activeSheet.value, range), range]))
    page.mergedCells.forEach(range => mergeMap.set(mergeKey(activeSheet.value, range), range))
    sourceMergedCells.value = Array.from(mergeMap.values())
    loadedPages.add(page.rowOffset)
    sheetInfo.value = page
  } catch (cause) {
    if (current === generation) message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    if (current === generation) { pageLoading.value = false; if (!loadedPages.has(wantedOffset)) void loadPage(wantedOffset) }
  }
}
const loadConditionalDependencyPages = async (offsets: number[]) => {
  offsets.forEach(offset => { if (!loadedPages.has(offset)) pendingConditionalDependencyPages.add(offset) })
  if (conditionalDependencyLoading || !pendingConditionalDependencyPages.size || !activeSheet.value || !workbook.value) return
  conditionalDependencyLoading = true
  const current = generation
  const sheet = activeSheet.value
  try {
    while (pendingConditionalDependencyPages.size && current === generation && sheet === activeSheet.value) {
      const offset = pendingConditionalDependencyPages.values().next().value as number
      pendingConditionalDependencyPages.delete(offset)
      if (loadedPages.has(offset)) continue
      const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet, rowOffset: offset, rowLimit: PAGE_ROWS })
      if (current !== generation || sheet !== activeSheet.value) return
      const next = new Map(loadedRows.value)
      page.rows.forEach((row, index) => next.set(page.rowOffset + index, row))
      loadedRows.value = next
      loadedPages.add(page.rowOffset)
    }
  } catch (cause) {
    if (current === generation) message.warning(`条件格式依赖读取失败：${String(cause).replace(/^Error:\s*/, '')}`)
  } finally {
    conditionalDependencyLoading = false
    if (current === generation && pendingConditionalDependencyPages.size) void loadConditionalDependencyPages([])
  }
}
const selectSheet = async (sheet: string) => {
  if (!sheet || (sheet === activeSheet.value && sheetInfo.value)) return
  generation += 1
  activeSheet.value = sheet
  selectedCell.value = null
  selectedDrawingId.value = ''
  selectionAnchor.value = null
  selectionAreas.value = []
  invalidateCalculation()
  formulaInput.value = ''
  sheetInfo.value = null
  loadedRows.value = new Map()
  sourceRowHeights.value = new Map()
  sourceColumnWidths.value = new Map()
  sourceRowStates.value = new Map()
  sourceColumnStates.value = new Map()
  sourceMergedCells.value = []
  filterQuery.value = ''
  filterColumn.value = -1
  sortColumn.value = -1
  dataViewPosition.value = -1
  loadedPages.clear()
  pendingConditionalDependencyPages.clear()
  scrollTop.value = 0
  scrollRef.value?.scrollTo({ top: 0, left: 0 })
  await loadPage(0)
}
const prepareDataView = async () => {
  const region = activeDataRegion.value
  if (!region || dataViewLoading.value || !sheetInfo.value) return
  const start = Math.floor((region.range.top + 1) / PAGE_ROWS) * PAGE_ROWS
  const end = Math.min(region.range.bottom + 1, region.range.top + 1 + MAX_DATA_VIEW_ROWS)
  if (region.range.bottom - region.range.top > MAX_DATA_VIEW_ROWS) message.warning(`会话筛选最多分析前 ${MAX_DATA_VIEW_ROWS.toLocaleString()} 行`)
  const current = generation
  const sheet = activeSheet.value
  dataViewLoading.value = true
  try {
    for (let offset = start; offset < end; offset += PAGE_ROWS) {
      if (loadedPages.has(offset)) continue
      const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet, rowOffset: offset, rowLimit: PAGE_ROWS })
      if (current !== generation || sheet !== activeSheet.value) return
      const next = new Map(loadedRows.value)
      page.rows.forEach((row, index) => next.set(page.rowOffset + index, row))
      loadedRows.value = next
      loadedPages.add(page.rowOffset)
    }
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { if (current === generation) dataViewLoading.value = false }
}
const commitPersistedDataView = async (action: 'apply' | 'clear') => {
  const region = activeDataRegion.value
  if (!region || !workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能修改筛选条件')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  const query = filterQuery.value.trim()
  if (action === 'apply' && query && filterColumn.value < 0) return void message.error('写入筛选条件前请选择一个筛选字段')
  if (action === 'apply' && !query && sortColumn.value < 0) return void message.error('请设置筛选文本或排序字段')
  if (action === 'apply' && !region.filterState.editable) return void message.error('当前区域包含暂不支持的高级或多列筛选条件，只能清除后重新设置')
  const change: WorkbookFilterChange = {
    sheet: activeSheet.value,
    target: region.target,
    action,
    tableName: region.tableName,
    range: { ...region.range },
    filterColumn: action === 'apply' && query ? filterColumn.value : undefined,
    query: action === 'apply' && query ? query : undefined,
    sortColumn: action === 'apply' && sortColumn.value >= 0 ? sortColumn.value : undefined,
    sortDirection: action === 'apply' && sortColumn.value >= 0 ? sortDirection.value : undefined,
  }
  updatingStructure.value = true
  const sheet = activeSheet.value
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_filter', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, region.range)
    message.success(action === 'apply' ? '筛选与排序条件已写入 XLSX' : '筛选与排序条件已清除')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const persistDataView = (action: 'apply' | 'clear') => {
  commitFormulaInput()
  if (action === 'apply') return void commitPersistedDataView(action)
  dialog.warning({
    title: '清除筛选与排序条件？',
    content: '将清除当前 Table 或自动筛选区域保存在 XLSX 中的全部筛选与排序条件，但不会删除数据或筛选区域。复杂条件也会被清除，保存后不能通过当前撤销栈恢复。',
    positiveText: '清除条件',
    negativeText: '取消',
    onPositiveClick: () => commitPersistedDataView(action),
  })
}
const navigateDataResult = async (direction: number) => {
  await prepareDataView()
  const rows = dataViewRows.value
  const region = activeDataRegion.value
  if (!rows.length || !region) return
  dataViewPosition.value = (dataViewPosition.value + direction + rows.length) % rows.length
  const row = rows[dataViewPosition.value]
  const column = filterColumn.value >= region.range.left ? filterColumn.value : region.range.left
  selectCell(row, column)
  await nextTick()
  scrollRef.value?.scrollTo({ top: Math.max(0, rowOffset(row) - 80), behavior: 'smooth' })
}
const applyFreezePane = async (rows: number, columns: number) => {
  if (!workbook.value || !sheetInfo.value || updatingStructure.value || dirtyCount.value) return
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_freeze_pane', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      expectedSignature: workbook.value.signature,
      sheet: activeSheet.value,
      rows,
      columns,
    })
    workbook.value = document
    const sheet = activeSheet.value
    generation += 1
    activeSheet.value = ''
    await selectSheet(sheet)
    message.success(rows || columns ? '冻结窗格已更新' : '冻结窗格已取消')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const setFreezePane = () => {
  if (!selectedCell.value) return
  void applyFreezePane(selectedCell.value.row, selectedCell.value.column)
}
const clearFreezePane = () => void applyFreezePane(0, 0)
const savePageLayout = async (printArea: WorkbookMergeRange | null | undefined = pageLayoutDraft.value.printArea) => {
  if (!workbook.value || !sheetInfo.value || !canEditPageLayout.value) return
  const draft = pageLayoutDraft.value
  const margins = Object.values(draft.margins)
  if (margins.some(value => !Number.isFinite(value) || value < 0 || value > 10)) {
    return void message.error('页边距必须在 0 到 10 英寸之间')
  }
  if (draft.scalingMode === 'scale' && (!Number.isInteger(draft.scale) || draft.scale < 10 || draft.scale > 400)) {
    return void message.error('缩放比例必须是 10% 到 400% 的整数')
  }
  if (draft.scalingMode === 'fit' && (
    !Number.isInteger(draft.fitToWidth) || !Number.isInteger(draft.fitToHeight)
    || draft.fitToWidth < 0 || draft.fitToWidth > 100 || draft.fitToHeight < 0 || draft.fitToHeight > 100
    || (!draft.fitToWidth && !draft.fitToHeight)
  )) {
    return void message.error('适合页数必须在 0 到 100 之间，宽或高至少一项大于 0')
  }
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_page_layout', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        change: {
          sheet: activeSheet.value,
          printArea: printArea === null ? undefined : printArea,
          orientation: draft.orientation,
          paperSize: draft.paperSize,
          margins: { ...draft.margins },
          scale: draft.scalingMode === 'scale' ? draft.scale : undefined,
          fitToWidth: draft.scalingMode === 'fit' ? draft.fitToWidth : undefined,
          fitToHeight: draft.scalingMode === 'fit' ? draft.fitToHeight : undefined,
        },
      },
    })
    workbook.value = document
    const sheet = activeSheet.value
    generation += 1
    activeSheet.value = ''
    await selectSheet(sheet)
    pageLayoutModalOpen.value = false
    message.success('页面设置已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const setSelectionAsPrintArea = () => {
  if (!pageLayoutSelection.value || !canEditPrintArea.value) return
  void savePageLayout({ ...pageLayoutSelection.value })
}
const clearPrintArea = () => {
  if (!sheetInfo.value?.pageLayout.printArea || !canEditPrintArea.value) return
  dialog.warning({
    title: '清除打印区域？',
    content: '将清除当前 Sheet 的打印区域定义，页面方向、纸张、缩放和页边距保持不变。',
    positiveText: '清除',
    negativeText: '取消',
    onPositiveClick: () => savePageLayout(null),
  })
}
const savePrintOptions = async () => {
  if (!workbook.value || !sheetInfo.value || !canEditPageLayout.value) return
  const draft = printOptionsDraft.value
  if (draft.useFirstPageNumber && (
    !Number.isInteger(draft.firstPageNumber)
    || draft.firstPageNumber < 1
    || draft.firstPageNumber > 32767
  )) {
    return void message.error('首页页码必须是 1 到 32767 之间的整数')
  }
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_print_options', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        change: {
          sheet: activeSheet.value,
          gridLines: draft.gridLines,
          headings: draft.headings,
          horizontalCentered: draft.horizontalCentered,
          verticalCentered: draft.verticalCentered,
          blackAndWhite: draft.blackAndWhite,
          draft: draft.draft,
          firstPageNumber: draft.useFirstPageNumber ? draft.firstPageNumber : undefined,
        },
      },
    })
    workbook.value = document
    const sheet = activeSheet.value
    generation += 1
    activeSheet.value = ''
    await selectSheet(sheet)
    printOptionsModalOpen.value = false
    message.success('打印选项已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const saveHeaderFooter = async () => {
  if (!workbook.value || !sheetInfo.value || !canEditPageLayout.value) return
  const draft = headerFooterDraft.value
  const values = [draft.oddHeader, draft.oddFooter, draft.evenHeader, draft.evenFooter, draft.firstHeader, draft.firstFooter]
  if (values.some(value => [...value].length > 255)) {
    return void message.error('每个页眉或页脚不能超过 255 个字符')
  }
  if (values.some(value => [...value].some(character => {
    const code = character.charCodeAt(0)
    return code < 32 && character !== '\t' && character !== '\n' && character !== '\r'
  }))) {
    return void message.error('页眉页脚包含不受支持的控制字符')
  }
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_header_footer', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: {
        expectedSignature: workbook.value.signature,
        change: {
          sheet: activeSheet.value,
          ...draft,
        },
      },
    })
    workbook.value = document
    const sheet = activeSheet.value
    generation += 1
    activeSheet.value = ''
    await selectSheet(sheet)
    headerFooterModalOpen.value = false
    message.success('页眉页脚已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const clearHeaderFooter = () => {
  if (!hasHeaderFooterContent.value || !canEditPageLayout.value) return
  dialog.warning({
    title: '清空页眉页脚？',
    content: '将清空当前 Sheet 的奇数页、偶数页和首页页眉页脚文本。',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => {
      headerFooterDraft.value.oddHeader = ''
      headerFooterDraft.value.oddFooter = ''
      headerFooterDraft.value.evenHeader = ''
      headerFooterDraft.value.evenFooter = ''
      headerFooterDraft.value.firstHeader = ''
      headerFooterDraft.value.firstFooter = ''
      return saveHeaderFooter()
    },
  })
}
const promptDefinedNameScope = (): string | undefined | null => {
  const input = window.prompt('输入作用域：填写“工作簿”创建全局名称，或填写一个工作表名称创建局部名称', '工作簿')
  if (input === null) return null
  const scope = input.trim()
  if (!scope || scope === '工作簿') return undefined
  if (!workbook.value?.sheets.some(sheet => sheet.toLocaleLowerCase() === scope.toLocaleLowerCase())) {
    message.error(`工作表不存在：${scope}`)
    return null
  }
  return workbook.value.sheets.find(sheet => sheet.toLocaleLowerCase() === scope.toLocaleLowerCase())
}
const commitDefinedNameChange = async (change: WorkbookDefinedNameChange, success: string, selectedName?: string) => {
  if (!workbook.value || updatingStructure.value) return
  if (workbook.value.protection.lockStructure) return void message.error('工作簿结构受保护，不能修改命名区域')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  updatingStructure.value = true
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_defined_name', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    const targetName = selectedName || change.newName || change.name
    selectedDefinedNameIndex.value = document.definedNames.findIndex(item => item.name.toLocaleLowerCase() === targetName.toLocaleLowerCase() && (item.scope || '').toLocaleLowerCase() === (change.scope || '').toLocaleLowerCase())
    message.success(success)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const createDefinedName = () => {
  const area = definedNameSelection.value
  if (!area || !canEditDefinedNames.value) return
  const name = window.prompt('输入命名区域名称', `Range${(workbook.value?.definedNames.filter(item => !item.hidden).length || 0) + 1}`)?.trim()
  if (!name) return
  const scope = promptDefinedNameScope()
  if (scope === null) return
  void commitDefinedNameChange({
    action: 'create',
    name,
    scope,
    targetSheet: activeSheet.value,
    range: { ...area },
  }, `已创建命名区域 ${name}`)
}
const renameDefinedName = () => {
  const item = selectedDefinedName.value
  if (!item || !canEditDefinedNames.value) return
  const newName = window.prompt('输入新的命名区域名称', item.name)?.trim()
  if (!newName || newName === item.name) return
  void commitDefinedNameChange({
    action: 'rename',
    name: item.name,
    newName,
    scope: item.scope,
  }, `已将命名区域重命名为 ${newName}`, newName)
}
const updateDefinedNameRange = () => {
  const item = selectedDefinedName.value
  const area = definedNameSelection.value
  if (!item || !area || !canEditDefinedNames.value) return
  void commitDefinedNameChange({
    action: 'update_range',
    name: item.name,
    scope: item.scope,
    targetSheet: activeSheet.value,
    range: { ...area },
  }, `已更新 ${item.name} 的引用`, item.name)
}
const deleteDefinedName = () => {
  const item = selectedDefinedName.value
  if (!item || !canEditDefinedNames.value) return
  dialog.warning({
    title: `删除命名区域 ${item.name}？`,
    content: '删除后不能通过当前撤销栈恢复；如果名称被公式、验证或图表引用，后端会拒绝事务。',
    positiveText: '删除名称',
    negativeText: '取消',
    onPositiveClick: () => commitDefinedNameChange({
      action: 'delete',
      name: item.name,
      scope: item.scope,
    }, `已删除命名区域 ${item.name}`, ''),
  })
}
const navigateDefinedName = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  if (select.value === '-1') return
  const index = Number(select.value)
  if (!Number.isInteger(index)) return
  const reference = workbook.value?.definedNames[index]?.reference
  if (!reference) return
  await selectSheet(reference.sheet)
  await loadPage(reference.top)
  const right = Math.min(reference.right, canvasColumnCount.value - 1)
  if (right < reference.left) {
    message.warning('该命名区域超出当前 256 列预览边界')
    return
  }
  selectionAnchor.value = { sheet: reference.sheet, row: reference.top, column: reference.left }
  selectionAreas.value = [{ top: reference.top, bottom: reference.bottom, left: reference.left, right }]
  setSelectionFocus(reference.top, reference.left)
  await nextTick()
  scrollRef.value?.scrollTo({
    top: Math.max(0, rowOffset(reference.top) - 38),
    left: Math.max(0, 52 + columnPixels.value.slice(0, reference.left).reduce((total, width) => total + width, 0) - 80),
    behavior: 'smooth',
  })
}
const navigateArrayFormula = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  if (select.value === '') return
  const item = sheetInfo.value?.arrayFormulas[Number(select.value)]
  if (!item) return
  await loadPage(item.range.top)
  selectionAnchor.value = { sheet: activeSheet.value, row: item.range.top, column: item.range.left }
  selectionAreas.value = [{ ...item.range }]
  setSelectionFocus(item.anchorRow, item.anchorColumn)
  await nextTick()
  scrollRef.value?.scrollTo({
    top: Math.max(0, rowOffset(item.range.top) - 38),
    left: Math.max(0, 52 + columnPixels.value.slice(0, item.range.left).reduce((total, width) => total + width, 0) - 80),
    behavior: 'smooth',
  })
  select.value = ''
}
const navigateArrayDiagnosticCell = async (address: string) => {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(address)
  if (!match) return
  let column = 0
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64
  column -= 1
  const row = Number(match[2]) - 1
  if (column < 0 || column >= canvasColumnCount.value || row < 0) return
  await loadPage(row)
  selectionAnchor.value = { sheet: activeSheet.value, row, column }
  selectionAreas.value = [{ top: row, bottom: row, left: column, right: column }]
  setSelectionFocus(row, column)
  await nextTick()
  scrollRef.value?.scrollTo({
    top: Math.max(0, rowOffset(row) - 38),
    left: Math.max(0, 52 + columnPixels.value.slice(0, column).reduce((total, width) => total + width, 0) - 80),
    behavior: 'smooth',
  })
}
const chartColumnIndex = (label: string) => {
  let result = 0
  for (const character of label.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64
  return result - 1
}
const parseChartReference = (formula: string) => {
  const normalized = formula.trim().replace(/^=/, '')
  const separator = normalized.lastIndexOf('!')
  if (separator <= 0 || normalized.includes('[') || normalized.includes(']')) throw new Error('图表引用不是安全的内部工作表区域')
  const rawSheet = normalized.slice(0, separator).trim()
  const sheet = rawSheet.startsWith("'") && rawSheet.endsWith("'") ? rawSheet.slice(1, -1).replace(/''/g, "'") : rawSheet
  const match = normalized.slice(separator + 1).match(/^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i)
  if (!match) throw new Error('图表引用不是单一 A1 区域')
  const left = chartColumnIndex(match[1]); const top = Number(match[2]) - 1
  const right = chartColumnIndex(match[3] || match[1]); const bottom = Number(match[4] || match[2]) - 1
  if (top < 0 || left < 0 || (top !== bottom && left !== right)) throw new Error('本地预览只支持一维图表区域')
  return { sheet, top: Math.min(top, bottom), bottom: Math.max(top, bottom), left: Math.min(left, right), right: Math.max(left, right) }
}
const readChartReference = async (formula: string) => {
  const range = parseChartReference(formula)
  const vertical = range.top !== range.bottom
  const count = Math.min(60, vertical ? range.bottom - range.top + 1 : range.right - range.left + 1)
  const previewBottom = vertical ? range.top + count - 1 : range.top
  const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', {
    libraryRoot: store.libraryPath,
    path: workbookPath.value,
    sheet: range.sheet,
    rowOffset: range.top,
    rowLimit: previewBottom - range.top + 1,
  })
  return Array.from({ length: count }, (_, index) => {
    const row = vertical ? range.top + index : range.top
    const column = vertical ? range.left : range.left + index
    if (column >= page.returnedColumns) throw new Error('图表引用超出当前 256 列本地预览边界')
    return page.rows[row - page.rowOffset]?.[column]?.value || ''
  })
}
const loadChartPreview = async () => {
  const current = ++chartPreviewGeneration
  const drawing = selectedDrawing.value
  chartPreview.value = null
  chartPreviewError.value = ''
  if (!drawing?.chart) return
  chartPreviewLoading.value = true
  try {
    const rows: string[][] = []
    const failures: string[] = []
    const seriesColors: Record<string, string> = {}
    for (const series of drawing.chart.series.slice(0, 10)) {
      if (!series.categories || !series.values || rows.length >= 60) continue
      try {
        const [categories, values] = await Promise.all([readChartReference(series.categories), readChartReference(series.values)])
        const count = Math.min(categories.length, values.length, 60 - rows.length)
        let name = series.name || `系列 ${series.index + 1}`
        if (series.name?.includes('!')) {
          try { name = (await readChartReference(series.name))[0] || name } catch { /* Literal and unsupported names remain readable. */ }
        }
        if (series.color) seriesColors[name] = series.color
        for (let index = 0; index < count; index += 1) rows.push([categories[index] || String(index + 1), values[index], name])
      } catch (cause) { failures.push(String(cause).replace(/^Error:\s*/, '')) }
    }
    if (current !== chartPreviewGeneration) return
    if (!rows.length) throw new Error(failures[0] || '没有可安全读取的公式型系列数据')
    const chartType = drawing.chart.chartType === 'line' || drawing.chart.chartType === 'area'
      ? 'line'
      : drawing.chart.chartType === 'pie' || drawing.chart.chartType === 'pie_3d' || drawing.chart.chartType === 'doughnut'
        ? 'pie'
        : drawing.chart.chartType === 'scatter' || drawing.chart.chartType === 'bubble'
          ? 'scatter'
          : 'bar'
    chartPreview.value = {
      headers: ['分类', '数值', '系列'],
      columnIds: ['category', 'value', 'series'],
      columnTypes: [chartType === 'scatter' ? 'number' : 'text', 'number', 'text'],
      rows,
      rowIndices: rows.map((_, index) => index),
      config: {
        chartType,
        categoryColumn: 'category',
        valueColumn: 'value',
        seriesColumn: 'series',
        aggregation: 'sum',
        nullStrategy: 'skip',
        showLegend: drawing.chart.legendPosition !== 'none',
        legendPosition: drawing.chart.legendPosition,
        categoryAxisTitle: drawing.chart.categoryAxisTitle,
        valueAxisTitle: drawing.chart.valueAxisTitle,
        seriesColors,
        dataLabels: { ...drawing.chart.dataLabels },
      },
    }
  } catch (cause) {
    if (current === chartPreviewGeneration) chartPreviewError.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (current === chartPreviewGeneration) chartPreviewLoading.value = false }
}
const commitDrawingChange = async (change: WorkbookDrawingChange, area: WorkbookMergeRange, success: string, selectionMode: 'keep' | 'new' | 'clear' = 'keep') => {
  if (!workbook.value || updatingStructure.value) return
  if (sheetProtected.value) return void message.error('当前 Sheet 受保护，不能编辑绘图对象')
  if (dirtyCount.value) return void message.error('请先保存或放弃未保存的单元格与格式更改')
  updatingStructure.value = true
  const sheet = activeSheet.value
  const drawingId = selectedDrawingId.value
  const previousDrawingIds = new Set(sheetInfo.value?.drawings.map(drawing => drawing.id) || [])
  try {
    const document = await invoke<WorkbookDocument>('update_workbook_drawing', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, change },
    })
    workbook.value = document
    undoStack.value = []
    redoStack.value = []
    await restoreTableSelection(sheet, area)
    if (selectionMode === 'new') {
      selectedDrawingId.value = sheetInfo.value?.drawings.find(drawing => drawing.chart && !previousDrawingIds.has(drawing.id))?.id || ''
    } else {
      selectedDrawingId.value = selectionMode === 'clear' ? '' : drawingId
    }
    message.success(success)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { updatingStructure.value = false }
}
const createChartFromSelection = () => {
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!area || !canCreateChart.value) return
  const title = window.prompt('图表标题（最多 1024 个字符）', `${activeSheet.value} 图表`)?.trim()
  if (!title) return
  const from: WorkbookDrawingAnchor = {
    row: area.top,
    column: Math.min(area.right + 2, 16_383),
    rowOffset: 0,
    columnOffset: 0,
  }
  const to: WorkbookDrawingAnchor = {
    row: Math.min(from.row + 16, 1_048_576),
    column: Math.min(from.column + 8, 16_384),
    rowOffset: 0,
    columnOffset: 0,
  }
  if (to.row <= from.row || to.column <= from.column) {
    message.error('当前选区太靠近工作表边界，无法放置图表')
    return
  }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: '',
    anchorIndex: 0,
    objectId: '',
    action: 'create_chart',
    chartType: newChartType.value,
    sourceRange: { ...area },
    chartTitle: title,
    from,
    to,
  }, area, '已从当前选区创建图表', 'new')
}
const changeSelectedChartType = () => {
  const drawing = selectedDrawing.value
  if (!drawing?.chart || !canChangeChartType.value) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'change_chart_type',
    chartType: targetChartType.value,
  }, area, '已切换图表类型')
}
const commitChartPresentation = (
  categoryAxisTitle: string,
  valueAxisTitle: string,
  legendPosition: WorkbookChart['legendPosition'],
  success: string,
) => {
  const drawing = selectedDrawing.value
  if (!drawing?.chart?.presentationEditable || !canEditDrawing.value) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_presentation',
    categoryAxisTitle,
    valueAxisTitle,
    legendPosition,
  }, area, success)
}
const editChartAxes = () => {
  const chart = selectedDrawing.value?.chart
  if (!chart || !canEditChartAxes.value) return
  const categoryAxisTitle = window.prompt('分类轴标题（留空可移除）', chart.categoryAxisTitle || '')
  if (categoryAxisTitle === null) return
  const valueAxisTitle = window.prompt('数值轴标题（留空可移除）', chart.valueAxisTitle || '')
  if (valueAxisTitle === null) return
  if (categoryAxisTitle.trim() === (chart.categoryAxisTitle || '') && valueAxisTitle.trim() === (chart.valueAxisTitle || '')) return
  commitChartPresentation(categoryAxisTitle, valueAxisTitle, chart.legendPosition, '已更新图表坐标轴标题')
}
const applyChartLegendPosition = () => {
  const chart = selectedDrawing.value?.chart
  if (!chart || !canApplyLegendPosition.value) return
  commitChartPresentation(
    chart.categoryAxisTitle || '',
    chart.valueAxisTitle || '',
    targetLegendPosition.value,
    '已更新图表图例位置',
  )
}
const applyChartDataLabels = () => {
  const drawing = selectedDrawing.value
  if (!drawing?.chart?.dataLabelsEditable || !canApplyDataLabels.value) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_data_labels',
    dataLabels: { ...targetDataLabels.value },
  }, area, '已更新图表数据标签')
}
const deleteSelectedChart = () => {
  const drawing = selectedDrawing.value
  if (!drawing?.chart || !canDeleteChart.value) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  dialog.warning({
    title: '删除当前图表？',
    content: `将删除“${drawing.chart.title || drawing.name}”及其未被引用的图表部件。此操作不会删除源单元格数据。`,
    positiveText: '删除图表',
    negativeText: '取消',
    onPositiveClick: () => commitDrawingChange({
      sheet: activeSheet.value,
      drawingPart: drawing.drawingPart,
      anchorIndex: drawing.anchorIndex,
      objectId: drawing.objectId,
      action: 'delete_chart',
    }, area, '已删除图表', 'clear'),
  })
}
const editDrawingMetadata = () => {
  const drawing = selectedDrawing.value
  if (!drawing?.editable || !canEditDrawing.value) return
  const name = window.prompt('绘图对象名称（最多 255 个字符）', drawing.name)?.trim()
  if (!name) return
  const description = window.prompt('替代文本/说明（可留空，最多 1024 个字符）', drawing.description || '')
  if (description === null) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_metadata',
    name,
    description,
  }, area, '已更新绘图对象名称与说明')
}
const applyDrawingSelection = () => {
  const drawing = selectedDrawing.value
  const area = selectionAreas.value.length === 1 ? selectionBounds.value : null
  if (!drawing?.editable || !area || !canApplyDrawingSelection.value) return
  const from: WorkbookDrawingAnchor = { row: area.top, column: area.left, rowOffset: 0, columnOffset: 0 }
  const to: WorkbookDrawingAnchor = { row: area.bottom + 1, column: area.right + 1, rowOffset: 0, columnOffset: 0 }
  dialog.warning({
    title: '移动并调整绘图对象？',
    content: `对象“${drawing.name}”将对齐到 ${rangeLabel(area)}；图表内容、图片文件和关系部件保持不变。`,
    positiveText: '应用选区',
    negativeText: '取消',
    onPositiveClick: () => commitDrawingChange({
      sheet: activeSheet.value,
      drawingPart: drawing.drawingPart,
      anchorIndex: drawing.anchorIndex,
      objectId: drawing.objectId,
      action: 'move_resize',
      from,
      to,
    }, area, '已移动并调整绘图对象'),
  })
}
const editChartTitle = () => {
  const drawing = selectedDrawing.value
  if (!drawing?.chart?.titleEditable || !canEditChartTitle.value) return
  const title = window.prompt('图表标题（最多 1024 个字符）', drawing.chart.title || '')?.trim()
  if (!title || title === drawing.chart.title) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_title',
    chartTitle: title,
  }, area, '已更新图表标题')
}
const editChartSeries = () => {
  const drawing = selectedDrawing.value
  const series = selectedChartSeries.value
  if (!drawing?.chart || !series?.editable || !canEditChartSeries.value) return
  const categories = window.prompt('分类引用：内部工作表的一维 A1 区域', series.categories || '')?.trim()
  if (!categories) return
  const values = window.prompt('数值引用：必须与分类引用包含相同数量的数据点', series.values || '')?.trim()
  if (!values || (categories === series.categories && values === series.values)) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_series',
    seriesIndex: series.index,
    seriesCategories: categories,
    seriesValues: values,
  }, area, `已更新系列 ${series.index + 1} 的引用`)
}
const editChartSeriesName = () => {
  const drawing = selectedDrawing.value
  const series = selectedChartSeries.value
  if (!drawing?.chart || !series?.nameEditable || !canEditChartSeriesName.value) return
  const seriesName = window.prompt('系列显示名称（留空可移除）', series.name || '')
  if (seriesName === null || seriesName.trim() === (series.name || '')) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_series_name',
    seriesIndex: series.index,
    seriesName,
  }, area, '已更新图表系列名称')
}
const applyChartSeriesColor = () => {
  const drawing = selectedDrawing.value
  const series = selectedChartSeries.value
  if (!drawing?.chart || !series?.colorEditable || !canApplyChartSeriesColor.value) return
  const area = selectionBounds.value || { top: drawing.from.row, bottom: drawing.from.row, left: drawing.from.column, right: drawing.from.column }
  void commitDrawingChange({
    sheet: activeSheet.value,
    drawingPart: drawing.drawingPart,
    anchorIndex: drawing.anchorIndex,
    objectId: drawing.objectId,
    action: 'update_chart_series_color',
    seriesIndex: series.index,
    seriesColor: targetSeriesColor.value,
  }, area, `已更新系列 ${series.index + 1} 的颜色`)
}
const navigateDrawing = async (drawing: WorkbookDrawingObject) => {
  selectedDrawingId.value = drawing.id
  selectedChartSeriesIndex.value = drawing.chart?.series[0]?.index || 0
  await loadPage(drawing.from.row)
  const column = Math.min(drawing.from.column, canvasColumnCount.value - 1)
  if (column < drawing.from.column) {
    message.warning('该绘图对象位于当前 256 列预览边界之外')
    return
  }
  const endRow = drawing.to?.row ?? drawing.from.row
  const endColumn = Math.min(drawing.to?.column ?? drawing.from.column, canvasColumnCount.value - 1)
  selectionAnchor.value = { sheet: activeSheet.value, row: drawing.from.row, column }
  selectionAreas.value = [{ top: drawing.from.row, bottom: endRow, left: column, right: endColumn }]
  setSelectionFocus(drawing.from.row, column)
  await nextTick()
  scrollRef.value?.scrollTo({
    top: Math.max(0, rowOffset(drawing.from.row) - 38),
    left: Math.max(0, 52 + columnPixels.value.slice(0, column).reduce((total, width) => total + width, 0) - 80),
    behavior: 'smooth',
  })
}
const loadWorkbook = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    if (!store.libraryPath || !workbookPath.value.toLowerCase().endsWith('.xlsx')) throw new Error('XLSX 路径无效或知识库尚未配置')
    const document = await invoke<WorkbookDocument>('read_workbook_file', { libraryRoot: store.libraryPath, path: workbookPath.value })
    if (current !== generation) return
    workbook.value = document
    activeSheet.value = ''
    selectedCell.value = null
    selectionAnchor.value = null
    selectionAreas.value = []
    invalidateCalculation()
    loading.value = false
    await selectSheet(document.sheets[0])
  } catch (cause) {
    if (current !== generation) return
    workbook.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (current === generation) loading.value = false }
}
const discardAndReload = () => {
  drafts.value = new Map(); styleDrafts.value = new Map(); rowHeightDrafts.value = new Map(); columnWidthDrafts.value = new Map(); mergeDrafts.value = new Map(); undoStack.value = []; redoStack.value = []; void loadWorkbook()
}
const refreshWorkbook = () => {
  if (!dirtyCount.value) return void loadWorkbook()
  dialog.warning({ title: '放弃未保存更改？', content: `将丢弃 ${dirtyCount.value} 个工作簿更改项。`, positiveText: '放弃并重新读取', negativeText: '取消', onPositiveClick: discardAndReload })
}
const saveWorkbook = async () => {
  commitFormulaInput()
  if (!workbook.value || !dirtyCount.value || saving.value) return
  saving.value = true
  const previousSheet = activeSheet.value
  try {
    const styleEdits: WorkbookCellStyleEdit[] = Array.from(styleDrafts.value.entries()).map(([key, patch]) => {
      const [sheet, row, column] = key.split('\u0000')
      return { sheet, row: Number(row), column: Number(column), patch }
    })
    const rowHeightEdits: WorkbookRowHeightEdit[] = Array.from(rowHeightDrafts.value.entries()).map(([key, height]) => {
      const [sheet, row] = key.split('\u0000')
      return { sheet, row: Number(row), height }
    })
    const columnWidthEdits: WorkbookColumnWidthEdit[] = Array.from(columnWidthDrafts.value.entries()).map(([key, width]) => {
      const [sheet, column] = key.split('\u0000')
      return { sheet, startColumn: Number(column), endColumn: Number(column), width }
    })
    const document = await invoke<WorkbookDocument>('write_workbook_cells', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, edits: Array.from(drafts.value.values()), styleEdits, rowHeightEdits, columnWidthEdits, mergeEdits: Array.from(mergeDrafts.value.values()) },
    })
    workbook.value = document
    drafts.value = new Map()
    styleDrafts.value = new Map()
    rowHeightDrafts.value = new Map()
    columnWidthDrafts.value = new Map()
    mergeDrafts.value = new Map()
    undoStack.value = []
    redoStack.value = []
    generation += 1
    activeSheet.value = ''
    await selectSheet(previousSheet)
    message.success('工作簿已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { saving.value = false }
}
const convertSheet = async () => {
  if (!activeSheet.value || importing.value) return
  importing.value = true
  try {
    const path = await invoke<string>('import_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet: activeSheet.value })
    message.success('已从当前 Sheet 创建开放 Table，原 XLSX 保持不变')
    await router.push({ name: 'Table', query: { path } })
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { importing.value = false }
}
const handleScroll = () => {
  if (!scrollRef.value) return
  scrollTop.value = scrollRef.value.scrollTop
  const start = rowAtOffset(scrollTop.value)
  void loadPage(start)
  const end = rowAtOffset(scrollTop.value + viewportHeight.value) + 20
  if (end % PAGE_ROWS > PAGE_ROWS - 100) void loadPage(end)
}
const handleShortcut = (event: KeyboardEvent) => {
  const formulaFocused = event.target === formulaInputRef.value
  if (!(event.ctrlKey || event.metaKey)) {
    if (!formulaFocused && event.key === 'Delete') { event.preventDefault(); clearSelection() }
    if (!formulaFocused && selectedCell.value && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const rowDelta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      const columnDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      const row = Math.max(0, Math.min(canvasRowCount.value - 1, selectedCell.value.row + rowDelta))
      const column = Math.max(0, Math.min(canvasColumnCount.value - 1, selectedCell.value.column + columnDelta))
      selectCell(row, column, event.shiftKey)
    }
    return
  }
  const key = event.key.toLowerCase()
  if (key === 's') { event.preventDefault(); void saveWorkbook() }
  else if (!formulaFocused && key === 'c') { event.preventDefault(); void copySelection() }
  else if (!formulaFocused && key === 'v') { event.preventDefault(); void pasteSelection() }
  else if (!formulaFocused && key === 'x') { event.preventDefault(); void cutSelection() }
  else if (!formulaFocused && key === 'z' && event.shiftKey) { event.preventDefault(); redo() }
  else if (!formulaFocused && key === 'z') { event.preventDefault(); undo() }
  else if (!formulaFocused && key === 'y') { event.preventDefault(); redo() }
}
const warnBeforeUnload = (event: BeforeUnloadEvent) => { if (dirtyCount.value) event.preventDefault() }
const stopCellSelection = () => {
  dragSelecting = false
  if (!filling) return
  const source = fillSource
  const preview = fillPreview.value
  filling = false
  fillSource = null
  fillPreview.value = null
  void commitFill(source, preview)
}

watch(workbookPath, () => {
  drafts.value = new Map(); styleDrafts.value = new Map(); rowHeightDrafts.value = new Map(); columnWidthDrafts.value = new Map(); mergeDrafts.value = new Map(); undoStack.value = []; redoStack.value = []; void loadWorkbook()
})
watch(() => [sheetInfo.value?.sheet || '', workbook.value?.signature || ''], syncPageLayoutDraft, { immediate: true })
watch(() => headerFooterDraft.value.differentOddEven, enabled => {
  if (!enabled && headerFooterMode.value === 'even') headerFooterMode.value = 'odd'
})
watch(() => headerFooterDraft.value.differentFirstPage, enabled => {
  if (!enabled && headerFooterMode.value === 'first') headerFooterMode.value = 'odd'
})
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) { viewportHeight.value = element.clientHeight; resizeObserver?.observe(element) }
})
watch(() => conditionalDependencyPageOffsets.value.join(','), () => {
  void loadConditionalDependencyPages(conditionalDependencyPageOffsets.value)
})
watch(() => [selectedDrawingId.value, selectedChartSeriesIndex.value, workbook.value?.signature || '', sheetInfo.value?.sheet || ''], () => {
  const chartType = selectedDrawing.value?.chart?.chartType
  targetChartType.value = chartType === 'line' || chartType === 'pie' || chartType === 'scatter' ? chartType : 'column'
  targetLegendPosition.value = selectedDrawing.value?.chart?.legendPosition || 'right'
  targetDataLabels.value = { ...(selectedDrawing.value?.chart?.dataLabels || { showValue: false, showCategoryName: false, showSeriesName: false, showPercent: false }) }
  const series = selectedChartSeries.value
  targetSeriesColor.value = series?.color || chartThemePalette.value[series?.index || 0] || '#2A6FDB'
  void loadChartPreview()
})
onBeforeRouteLeave(() => !dirtyCount.value || window.confirm(`还有 ${dirtyCount.value} 个单元格未保存，确定离开吗？`))
onMounted(() => {
  void loadWorkbook()
  resizeObserver = new ResizeObserver(() => { if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight })
  nextTick(() => { if (scrollRef.value) resizeObserver?.observe(scrollRef.value) })
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pointerup', stopCellSelection)
  window.addEventListener('beforeunload', warnBeforeUnload)
})
onBeforeUnmount(() => {
  generation += 1
  chartPreviewGeneration += 1
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pointerup', stopCellSelection)
  window.removeEventListener('beforeunload', warnBeforeUnload)
})
</script>

<style scoped>
.workbook-view { height: 100vh; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, #dbe6ef); }
.workbook-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.055); z-index: 5; }
.workbook-title,.workbook-actions,.workbook-actions button { display: flex; align-items: center; gap: 8px; }
.workbook-title > button,.workbook-actions button { height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }
.workbook-title .icon-button,.workbook-actions .icon-button { width: 32px; justify-content: center; padding: 0; }
.workbook-title > div { display: flex; flex-direction: column; }
.workbook-title strong { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.workbook-title span { color: var(--theme-text-secondary); font-size: 9px; }
.workbook-actions button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }
.workbook-actions button.primary { color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }
.workbook-actions button:disabled { opacity: .45; cursor: default; }
.sheet-tabs { min-height: 39px; display: flex; align-items: end; gap: 4px; padding: 5px 12px 0; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }
.sheet-tabs button { height: 33px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; white-space: nowrap; font-size: 10px; }
.sheet-tabs button.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }
.sheet-tabs small { margin: 0 5px 10px auto; color: var(--theme-text-secondary); white-space: nowrap; font-size: 8px; }
.formula-bar { height: 34px; flex: none; display: flex; align-items: center; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); }
.linked-data-toolbar { min-height: 42px; flex: none; display: flex; align-items: center; gap: 7px; padding: 4px 12px; overflow-x: auto; border-bottom: 1px solid rgba(190,120,25,.18); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 91%, #fff0cf); font-size: 9px; }
.linked-data-toolbar > strong,.linked-data-toolbar > span,.linked-data-toolbar > em { flex: none; }
.linked-data-toolbar > strong { color: #9a641f; }
.linked-data-toolbar > span { padding: 4px 7px; border-radius: 4px; background: rgba(190,120,25,.1); }
.linked-data-toolbar > em { margin-left: auto; color: #9a641f; font-style: normal; }
.linked-data-toolbar button { min-width: 155px; height: 32px; flex: none; display: flex; flex-direction: column; justify-content: center; padding: 3px 8px; border: 1px solid rgba(190,120,25,.2); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); text-align: left; font-size: 9px; cursor: pointer; }
.linked-data-toolbar button small { max-width: 180px; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 8px; }
.linked-data-toolbar .linked-data-overview { min-width: 150px; border-color: rgba(var(--theme-primary-rgb),.24); color: var(--theme-primary); }
:deep(.linked-data-modal) { width: min(860px, calc(100vw - 32px)); }
.linked-data-audit { display: grid; gap: 14px; max-height: min(680px, calc(100vh - 190px)); overflow-y: auto; padding-right: 3px; }
.linked-data-policy { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 16px; border: 1px solid rgba(49,130,86,.22); border-radius: 8px; background: rgba(49,130,86,.07); }
.linked-data-policy strong { color: #267347; font-size: 13px; }
.linked-data-policy p { margin: 4px 0 0; color: var(--theme-text-secondary); font-size: 10px; line-height: 1.55; }
.linked-data-policy > span { flex: none; padding: 5px 9px; border-radius: 99px; color: #267347; background: rgba(49,130,86,.12); font-size: 9px; font-weight: 700; }
.linked-data-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.linked-data-metrics span { display: grid; gap: 3px; padding: 11px 12px; border: 1px solid rgba(0,0,0,.09); border-radius: 7px; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 96%, var(--theme-primary)); font-size: 9px; }
.linked-data-metrics strong { color: var(--theme-text); font-size: 17px; }
.linked-data-metrics span.warning strong { color: #a86416; }
.linked-data-group { overflow: hidden; border: 1px solid rgba(0,0,0,.1); border-radius: 8px; background: var(--theme-card); }
.linked-data-group > header { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-bottom: 1px solid rgba(0,0,0,.08); background: rgba(0,0,0,.025); }
.linked-data-group > header strong { font-size: 11px; }
.linked-data-group > header span { min-width: 22px; padding: 3px 6px; border-radius: 99px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.09); text-align: center; font-size: 9px; }
.linked-data-group article { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.35fr) minmax(150px, 1fr) auto; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,.07); }
.linked-data-group article:last-child { border-bottom: 0; }
.linked-data-group article > div { min-width: 0; display: grid; gap: 3px; }
.linked-data-group article strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.linked-data-group article small,.linked-data-group article p,.linked-data-group article > span { margin: 0; color: var(--theme-text-secondary); font-size: 9px; line-height: 1.45; }
.linked-data-group article > span { padding: 4px 7px; border-radius: 4px; background: rgba(49,130,86,.08); color: #267347; }
.linked-data-group article > span.warning { color: #9a641f; background: rgba(190,120,25,.1); }
.linked-data-group article > button { height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 5px; color: var(--theme-primary); background: var(--theme-card); font-size: 9px; cursor: pointer; }
.linked-data-actions { display: flex !important; flex-wrap: wrap; gap: 5px !important; }
.linked-data-actions button { height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 5px; color: var(--theme-primary); background: var(--theme-card); font-size: 9px; cursor: pointer; }
.linked-data-actions button:disabled { opacity: .45; cursor: not-allowed; }
.linked-data-group article .pivot-audit-details { grid-column: 1 / -1; display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(0,0,0,.08); border-radius: 6px; background: rgba(0,0,0,.018); }
.pivot-audit-status { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 7px 9px; border-radius: 5px; color: #8c4f2a; background: rgba(180,85,45,.08); }
.pivot-audit-status.candidate { color: #267347; background: rgba(49,130,86,.08); }
.pivot-audit-status strong { flex: none; color: inherit !important; font-size: 9px !important; }
.pivot-audit-status span { color: inherit; font-size: 8px; line-height: 1.45; }
.pivot-audit-facts,.pivot-field-list,.pivot-data-fields { display: flex; flex-wrap: wrap; gap: 5px; }
.pivot-audit-facts span,.pivot-field-list span,.pivot-data-fields span { padding: 4px 7px; border: 1px solid rgba(0,0,0,.07); border-radius: 4px; color: var(--theme-text-secondary); background: var(--theme-card); font-size: 8px; }
.pivot-writeback-audit { display: grid; gap: 7px; padding: 8px 9px; border: 1px solid rgba(180,85,45,.16); border-radius: 5px; background: rgba(180,85,45,.035); }
.pivot-writeback-audit.candidate { border-color: rgba(49,130,86,.18); background: rgba(49,130,86,.035); }
.pivot-writeback-audit > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-writeback-audit > header strong { color: #8c4f2a !important; font-size: 9px !important; }
.pivot-writeback-audit.candidate > header strong { color: #267347 !important; }
.pivot-writeback-audit > header span { padding: 2px 6px; border-radius: 999px; color: #8c4f2a; background: rgba(180,85,45,.1); font-size: 7px; }
.pivot-writeback-audit > div { display: flex; flex-wrap: wrap; gap: 5px; }
.pivot-writeback-audit > div span { padding: 3px 6px; border-radius: 4px; color: #8c4f2a; background: rgba(180,85,45,.08); font-size: 8px; }
.pivot-writeback-audit > div span.pass { color: #267347; background: rgba(49,130,86,.08); }
.pivot-writeback-audit > p { margin: 0; color: var(--theme-text-secondary); font-size: 8px; line-height: 1.5; }
.pivot-rebuild-plan { overflow: hidden; display: grid; gap: 8px; padding: 9px; border: 1px solid rgba(180,85,45,.18); border-radius: 6px; background: rgba(180,85,45,.025); }
.pivot-rebuild-plan.ready { border-color: rgba(49,130,86,.2); background: rgba(49,130,86,.025); }
.pivot-rebuild-plan > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-rebuild-plan > header > div { display: grid; gap: 2px; }
.pivot-rebuild-plan > header strong { color: #8c4f2a !important; font-size: 9px !important; }
.pivot-rebuild-plan.ready > header strong { color: #267347 !important; }
.pivot-rebuild-plan > header small,.pivot-rebuild-plan > header > span,.pivot-rebuild-plan > p,.pivot-rebuild-plan > footer { color: var(--theme-text-secondary); font-size: 8px; line-height: 1.45; }
.pivot-rebuild-plan > p,.pivot-rebuild-plan > footer { margin: 0; }
.pivot-impact-parts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
.pivot-impact-parts > span { min-width: 0; display: grid; gap: 2px; padding: 6px 7px; border: 1px solid rgba(0,0,0,.07); border-radius: 4px; background: var(--theme-card); }
.pivot-impact-parts strong { color: var(--theme-text) !important; font-size: 8px !important; }
.pivot-impact-parts small { overflow: hidden; color: var(--theme-text-secondary); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
.pivot-rebuild-gates { display: flex; flex-wrap: wrap; gap: 4px; }
.pivot-rebuild-gates span { padding: 3px 5px; border-radius: 4px; color: #8c4f2a; background: rgba(180,85,45,.08); font-size: 7px; }
.pivot-rebuild-gates span.passed { color: #267347; background: rgba(49,130,86,.08); }
.pivot-rebuild-gates span.pending { color: #8d671f; background: rgba(190,140,35,.09); }
.pivot-cache-rebuild-result { display: grid; gap: 8px; padding: 9px; border: 1px solid rgba(49,130,86,.22); border-radius: 6px; background: rgba(49,130,86,.03); }
.pivot-cache-rebuild-result > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-cache-rebuild-result > header > div { display: grid; gap: 2px; }
.pivot-cache-rebuild-result > header strong { color: #267347 !important; font-size: 9px !important; }
.pivot-cache-rebuild-result > header small,.pivot-cache-rebuild-result > header > span,.pivot-cache-rebuild-result > footer { color: var(--theme-text-secondary); font-size: 8px; line-height: 1.45; }
.pivot-cache-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.pivot-cache-fields > span { min-width: 0; display: grid; gap: 2px; padding: 6px 7px; border: 1px solid rgba(49,130,86,.13); border-radius: 4px; background: var(--theme-card); }
.pivot-cache-fields strong { color: var(--theme-text) !important; font-size: 8px !important; }
.pivot-cache-fields small { overflow: hidden; color: var(--theme-text-secondary); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
.pivot-cache-rebuild-result > footer { margin: 0; }
.pivot-synchronized-rebuild-result { display: grid; gap: 8px; padding: 9px; border: 1px solid rgba(36,106,171,.24); border-radius: 6px; background: rgba(36,106,171,.04); }
.pivot-synchronized-rebuild-result > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-synchronized-rebuild-result > header > div { display: grid; gap: 2px; }
.pivot-synchronized-rebuild-result > header strong { color: #246aab !important; font-size: 9px !important; }
.pivot-synchronized-rebuild-result > header small,.pivot-synchronized-rebuild-result > header > span,.pivot-synchronized-rebuild-result > footer { color: var(--theme-text-secondary); font-size: 8px; line-height: 1.45; }
.pivot-sync-facts { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; }
.pivot-sync-facts span { padding: 5px 6px; border-radius: 4px; background: var(--theme-bg-secondary); color: var(--theme-text-secondary); font-size: 8px; }
.pivot-synchronized-rebuild-result > footer { margin: 0; }
.pivot-expanded-rebuild-result { display: grid; gap: 8px; padding: 9px; border: 1px solid rgba(123,76,154,.24); border-radius: 6px; background: rgba(123,76,154,.04); }
.pivot-expanded-rebuild-result > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-expanded-rebuild-result > header > div { display: grid; gap: 2px; }
.pivot-expanded-rebuild-result > header strong { color: #7b4c9a !important; font-size: 9px !important; }
.pivot-expanded-rebuild-result > header small,.pivot-expanded-rebuild-result > header > span,.pivot-expanded-rebuild-result > footer { color: var(--theme-text-secondary); font-size: 8px; line-height: 1.45; }
.pivot-expanded-rebuild-result > footer { margin: 0; }
.pivot-copy-save { display: grid; grid-template-columns: minmax(180px,1fr) auto; align-items: end; gap: 6px; }
.pivot-copy-save label { display: grid; gap: 3px; min-width: 0; color: var(--theme-text-secondary); font-size: 8px; }
.pivot-copy-save input { width: 100%; min-width: 0; height: 27px; padding: 0 7px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-bg-primary); color: var(--theme-text-primary); font-size: 9px; }
.pivot-copy-save button { min-height: 27px; }
.pivot-copy-save > small { grid-column: 1 / -1; color: var(--theme-success); font-size: 8px; }
.pivot-variant-verification-result { display: grid; gap: 8px; padding: 9px; border: 1px solid rgba(23,125,128,.24); border-radius: 6px; background: rgba(23,125,128,.04); }
.pivot-variant-verification-result > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pivot-variant-verification-result > header > div { display: grid; gap: 2px; }
.pivot-variant-verification-result > header strong { color: #177d80 !important; font-size: 9px !important; }
.pivot-variant-verification-result > header small,.pivot-variant-verification-result > header > span,.pivot-variant-verification-result > footer { color: var(--theme-text-secondary); font-size: 8px; line-height: 1.45; }
.pivot-variant-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; }
.pivot-layout-variants { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; }
.pivot-variant-grid > span,.pivot-layout-variants > span { min-width: 0; display: grid; gap: 2px; padding: 6px 7px; border-radius: 4px; background: var(--theme-bg-secondary); }
.pivot-variant-grid strong,.pivot-layout-variants strong { color: var(--theme-text) !important; font-size: 8px !important; }
.pivot-variant-grid small,.pivot-layout-variants small { overflow: hidden; color: var(--theme-text-secondary); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
.pivot-variant-grid input,.pivot-layout-variants input { min-width: 0; width: 100%; height: 25px; margin-top: 4px; padding: 0 6px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-bg-primary); color: var(--theme-text-primary); font-size: 8px; }
.pivot-variant-grid button,.pivot-layout-variants button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 25px; margin-top: 2px; }
.pivot-variant-grid small.saved,.pivot-layout-variants small.saved { color: var(--theme-success); }
.pivot-variant-verification-result > footer { margin: 0; }
.pivot-field-list span { border-color: rgba(var(--theme-primary-rgb),.14); }
.pivot-data-fields span { color: #267347; border-color: rgba(49,130,86,.18); background: rgba(49,130,86,.04); }
.pivot-data-fields span.unsupported { color: #9a641f; border-color: rgba(190,120,25,.18); background: rgba(190,120,25,.05); }
.pivot-preview-result { overflow: hidden; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 6px; background: var(--theme-card); }
.pivot-preview-result > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid rgba(var(--theme-primary-rgb),.12); background: rgba(var(--theme-primary-rgb),.045); }
.pivot-preview-result > header > div { display: grid; gap: 2px; }
.pivot-preview-result > header strong { color: var(--theme-primary) !important; font-size: 9px !important; }
.pivot-preview-result > header small,.pivot-preview-result > header > span,.pivot-preview-result > footer { color: var(--theme-text-secondary); font-size: 8px; }
.pivot-preview-grid { display: grid; }
.linked-data-group article .pivot-preview-grid article { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1.4fr); gap: 10px; padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,.06); }
.linked-data-group article .pivot-preview-grid article:last-child { border-bottom: 0; }
.pivot-preview-grid article > div { display: grid; gap: 2px; }
.pivot-preview-grid article > div strong { color: var(--theme-text) !important; font-size: 9px !important; }
.pivot-preview-grid article > div small { color: var(--theme-text-secondary); font-size: 8px; }
.pivot-preview-grid article > span { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; padding: 5px 7px; border-radius: 4px; color: var(--theme-text-secondary); background: rgba(49,130,86,.055); font-size: 8px; }
.pivot-preview-grid article > span strong { color: #267347 !important; font-size: 11px !important; }
.pivot-preview-grid article > span small { grid-column: 1 / -1; font-size: 7px; }
.pivot-preview-result > footer { padding: 7px 10px; border-top: 1px solid rgba(0,0,0,.06); }
.page-layout-toolbar { min-height: 34px; flex: none; display: flex; align-items: center; gap: 7px; padding: 3px 12px; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, #dce8f7); font-size: 9px; }
.page-layout-toolbar > * { flex: none; }
.page-layout-toolbar strong { display: inline-flex; align-items: center; gap: 5px; color: var(--theme-primary); }
.page-layout-toolbar span { padding: 4px 7px; border-radius: 4px; background: rgba(var(--theme-primary-rgb),.07); }
.page-layout-toolbar button { height: 26px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); font-size: 9px; cursor: pointer; }
.page-layout-toolbar button:disabled { opacity: .45; cursor: default; }
.page-layout-toolbar em { margin-left: auto; color: #b14545; font-style: normal; font-weight: 700; }
:deep(.page-layout-modal) { width: min(680px, calc(100vw - 32px)); }
.page-layout-panel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.page-layout-panel > label { min-width: 0; display: grid; gap: 6px; color: var(--theme-text-secondary); font-size: 11px; }
.page-layout-panel label > span { display: flex; align-items: center; gap: 6px; }
.page-layout-panel select,.page-layout-panel input { width: 100%; height: 34px; box-sizing: border-box; padding: 0 9px; border: 1px solid rgba(0,0,0,.14); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); font-size: 11px; }
.page-layout-panel fieldset { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; margin: 0; padding: 12px; border: 1px solid rgba(0,0,0,.12); border-radius: 6px; }
.page-layout-panel legend { padding: 0 5px; color: var(--theme-text-secondary); font-size: 10px; }
.page-layout-panel fieldset label { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: 10px; }
.page-layout-actions { display: flex; justify-content: flex-end; gap: 8px; }
.page-layout-actions button { height: 32px; padding: 0 14px; border: 1px solid rgba(0,0,0,.14); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); cursor: pointer; }
.page-layout-actions button.primary { color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }
:deep(.print-options-modal) { width: min(680px, calc(100vw - 32px)); }
.print-options-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.print-options-panel fieldset { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 10px 14px; margin: 0; padding: 12px; border: 1px solid rgba(0,0,0,.12); border-radius: 6px; }
.print-options-panel legend { padding: 0 5px; color: var(--theme-text-secondary); font-size: 10px; }
.print-options-panel label { display: inline-flex; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: 11px; }
.print-options-panel .first-page-option { grid-template-columns: minmax(0, 1fr) 120px; }
.print-options-panel .first-page-option > input { width: 100%; height: 32px; box-sizing: border-box; padding: 0 9px; border: 1px solid rgba(0,0,0,.14); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); }
.print-options-panel .first-page-option > input:disabled { opacity: .5; }
:deep(.header-footer-modal) { width: min(680px, calc(100vw - 32px)); }
.header-footer-options { display: flex; flex-wrap: wrap; gap: 10px 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(0,0,0,.1); }
.header-footer-options label { display: inline-flex; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: 11px; }
.header-footer-modes { display: inline-grid; grid-template-columns: repeat(3, minmax(82px, 1fr)); margin: 14px 0; border: 1px solid rgba(0,0,0,.14); border-radius: 6px; overflow: hidden; }
.header-footer-modes button { height: 32px; padding: 0 14px; border: 0; border-right: 1px solid rgba(0,0,0,.12); color: var(--theme-text-secondary); background: var(--theme-card); cursor: pointer; }
.header-footer-modes button:last-child { border-right: 0; }
.header-footer-modes button.active { color: #fff; background: var(--theme-primary); }
.header-footer-modes button:disabled { cursor: not-allowed; opacity: .45; }
.header-footer-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.header-footer-fields label { min-width: 0; display: grid; gap: 6px; color: var(--theme-text-secondary); font-size: 11px; }
.header-footer-fields textarea { width: 100%; min-height: 84px; box-sizing: border-box; resize: vertical; padding: 9px; border: 1px solid rgba(0,0,0,.14); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); font: inherit; line-height: 1.5; }
.formula-bar select { width: 150px; min-width: 120px; height: 100%; padding: 0 24px 0 10px; border: 0; border-right: 1px solid rgba(0,0,0,.08); outline: 0; color: var(--theme-text); background: transparent; font-size: 9px; }
.formula-bar button { height: 25px; flex: none; margin-left: 4px; padding: 0 7px; border: 1px solid rgba(0,0,0,.1); border-radius: 4px; color: var(--theme-text-secondary); background: transparent; font-size: 8px; cursor: pointer; }
.formula-bar button:disabled { opacity: .4; cursor: default; }
.formula-bar output { width: 72px; flex: none; overflow: hidden; padding: 0 8px; text-align: center; text-overflow: ellipsis; font-size: 10px; font-weight: 700; }
.formula-bar span { width: 28px; flex: none; color: var(--theme-text-secondary); text-align: center; font-size: 11px; font-style: italic; }
.formula-bar input { min-width: 0; height: 100%; flex: 1; padding: 0 10px; border: 0; border-left: 1px solid rgba(0,0,0,.08); outline: 0; color: var(--theme-text); background: transparent; font: inherit; font-size: 10px; }
.formula-bar input:focus { box-shadow: inset 0 -2px var(--theme-primary); }
.formula-bar input:disabled { opacity: .55; }
.array-formula-strip { min-height: 30px; flex: none; display: flex; align-items: center; gap: 8px; padding: 3px 10px; border-bottom: 1px solid rgba(99,102,241,.2); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 92%, #818cf8); font-size: 9px; }
.array-formula-strip strong { flex: none; color: #5b5fc7; font-size: 9px; }
.array-formula-strip select { max-width: 230px; height: 23px; border: 1px solid rgba(99,102,241,.25); border-radius: 4px; color: var(--theme-text); background: var(--theme-card); font-size: 9px; }
.array-formula-strip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.array-formula-strip .diagnostic-link { height: 22px; flex: none; padding: 0 7px; border: 1px solid rgba(99,102,241,.3); border-radius: 4px; color: #5b5fc7; background: var(--theme-card); font-size: 8px; cursor: pointer; }
.array-formula-strip .diagnostic-link.warning { border-color: rgba(220,38,38,.35); color: #b91c1c; }
.format-toolbar { min-height: 40px; flex: none; display: flex; align-items: center; gap: 5px; padding: 4px 12px; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); }
.format-toolbar select,.format-toolbar input,.format-toolbar button { flex: none; height: 30px; box-sizing: border-box; border: 1px solid rgba(0,0,0,.1); border-radius: 5px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 96%, #dce6ef); font-size: 9px; }
.format-toolbar select { min-width: 92px; padding: 0 24px 0 8px; }
.format-toolbar .font-size { width: 50px; padding: 0 4px 0 7px; }
.format-toolbar button { padding: 0 8px; cursor: pointer; }
.format-toolbar .icon-button { width: 30px; display: grid; place-items: center; padding: 0; }
.format-toolbar .icon-button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.09); }
.format-toolbar button:disabled,.format-toolbar input:disabled,.format-toolbar select:disabled { opacity: .45; cursor: default; }
.format-toolbar.protected { opacity: .55; pointer-events: none; }
.format-toolbar .toolbar-divider { width: 1px; height: 22px; flex: none; margin: 0 3px; background: rgba(0,0,0,.1); }
.format-toolbar .segmented { display: flex; }
.format-toolbar .segmented button { border-radius: 0; border-right-width: 0; }
.format-toolbar .segmented button:first-child { border-radius: 5px 0 0 5px; }
.format-toolbar .segmented button:last-child { border-right-width: 1px; border-radius: 0 5px 5px 0; }
.data-toolbar { min-height: 36px; flex: none; display: flex; align-items: center; gap: 6px; padding: 3px 12px; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 96%, var(--theme-primary)); font-size: 9px; }
.data-toolbar strong { flex: none; color: var(--theme-primary); }
.data-toolbar input,.data-toolbar select,.data-toolbar button { height: 27px; flex: none; box-sizing: border-box; border: 1px solid rgba(0,0,0,.1); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); font-size: 9px; }
.data-toolbar input { width: 190px; padding: 0 8px; }
.data-toolbar select { max-width: 130px; padding: 0 22px 0 7px; }
.data-toolbar button { padding: 0 8px; cursor: pointer; }
.data-toolbar button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); }
.data-toolbar button:disabled { opacity: .45; cursor: default; }
.data-toolbar .validation-hint { margin-left: auto; flex: none; color: #9a641f; }
.drawing-toolbar { min-height: 48px; flex: none; display: flex; align-items: center; gap: 7px; padding: 5px 12px; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 93%, #e8ddff); font-size: 9px; }
.drawing-toolbar > strong,.drawing-toolbar > em { flex: none; }
.drawing-toolbar > strong { color: var(--theme-primary); }
.drawing-toolbar > em { margin-left: auto; font-style: normal; opacity: .72; }
.drawing-toolbar button { min-width: 168px; height: 38px; flex: none; display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr 1fr; align-items: center; gap: 0 7px; padding: 4px 8px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); text-align: left; cursor: pointer; }
.drawing-toolbar button:hover { border-color: rgba(var(--theme-primary-rgb),.5); }
.drawing-toolbar button.active { border-color: var(--theme-primary); box-shadow: inset 0 0 0 1px rgba(var(--theme-primary-rgb),.18); }
.drawing-toolbar button.drawing-action { min-width: auto; height: 30px; display: inline-flex; padding: 0 9px; color: var(--theme-primary); }
.drawing-toolbar button.drawing-action.danger { color: var(--theme-danger); }
.drawing-toolbar button.drawing-action:disabled { opacity: .45; cursor: default; }
.drawing-series-select { width: 150px; height: 30px; flex: none; padding: 0 7px; border: 1px solid rgba(var(--theme-primary-rgb),.22); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); font-size: 9px; }
.drawing-label-option { height: 30px; flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; color: var(--theme-text-secondary); }
.drawing-label-option input { accent-color: var(--theme-primary); }
.chart-color-controls { height: 30px; flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 0 5px; border: 1px solid rgba(var(--theme-primary-rgb),.16); border-radius: 5px; background: var(--theme-card); }
.drawing-toolbar .chart-color-controls button.chart-color-swatch { width: 18px; min-width: 18px; height: 18px; display: block; padding: 0; border: 1px solid rgba(0,0,0,.16); border-radius: 4px; }
.drawing-toolbar .chart-color-controls button.chart-color-swatch.active { box-shadow: 0 0 0 2px var(--theme-card), 0 0 0 3px var(--theme-primary); }
.chart-color-controls input[type="color"] { width: 22px; height: 22px; padding: 1px; border: 1px solid rgba(0,0,0,.16); border-radius: 4px; background: transparent; cursor: pointer; }
.chart-color-controls :disabled { opacity: .42; cursor: default; }
.drawing-toolbar button span { grid-row: 1 / 3; padding: 3px 5px; border-radius: 4px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); font-size: 8px; }
.drawing-toolbar button b,.drawing-toolbar button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawing-toolbar button b { font-size: 9px; }
.drawing-toolbar button small { color: var(--theme-text-secondary); font-size: 8px; }
.workbook-chart-preview { height: 250px; flex: none; display: grid; grid-template-columns: 230px minmax(0,1fr); overflow: hidden; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 96%, var(--theme-primary)); }
.workbook-chart-preview > header { padding: 14px; border-right: 1px solid rgba(0,0,0,.08); }
.workbook-chart-preview > header div { display: grid; gap: 5px; }
.workbook-chart-preview > header strong { color: var(--theme-text); font-size: 13px; }
.workbook-chart-preview > header span,.workbook-chart-preview > header small { color: var(--theme-text-secondary); font-size: 9px; line-height: 1.55; }
.workbook-chart-preview > header small { display: block; margin-top: 16px; }
.workbook-chart-preview > header small.error { color: var(--theme-danger); }
.workbook-chart-preview :deep(.chart-editor) { min-height: 0; height: 250px; border: 0; border-radius: 0; background: transparent; }
.workbook-chart-preview :deep(.chart-preview) { min-height: 0; padding: 8px 14px; }
.color-control { position: relative; width: 31px; height: 30px; flex: none; display: grid; place-items: center; box-sizing: border-box; border: 1px solid rgba(0,0,0,.1); border-radius: 5px; cursor: pointer; }
.color-control input { position: absolute; inset: auto 3px 2px; width: 23px; height: 5px; padding: 0; border: 0; border-radius: 1px; cursor: pointer; }
.color-control input::-webkit-color-swatch-wrapper { padding: 0; }
.color-control input::-webkit-color-swatch { border: 0; }
.workbook-main { min-height: 0; flex: 1; display: flex; flex-direction: column; }
.workbook-status { min-height: 28px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); color: #9a641f; background: color-mix(in srgb, var(--theme-card) 94%, #fff3d8); font-size: 9px; }
.workbook-status .calculation-error { color: #c43f3f; font-weight: 700; }
.sheet-scroll { min-height: 0; flex: 1; overflow: auto; }
.sheet-canvas { min-height: 100%; }
.sheet-header,.sheet-row { display: grid; }
.sheet-header { position: sticky; top: 0; z-index: 20; height: 38px; background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); box-shadow: 0 1px 0 rgba(0,0,0,.12); }
.virtual-sheet { position: relative; }
.sheet-row { position: absolute; top: 0; left: 0; }
.row-number,.column-header,.workbook-cell { min-width: 0; box-sizing: border-box; border-right: 1px solid rgba(0,0,0,.07); border-bottom: 1px solid rgba(0,0,0,.07); }
.row-number { position: sticky; left: 0; z-index: 8; display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 91%, #d9e3ed); font-size: 8px; }
.row-number:not(.corner),.column-header,.corner { cursor: pointer; user-select: none; }
.row-number.active,.column-header.active { color: var(--theme-primary); background: color-mix(in srgb, var(--theme-card) 78%, var(--theme-primary)); }
.row-number.outlined,.column-header.outlined { box-shadow: inset 3px 0 rgba(var(--theme-primary-rgb),.5); }.row-number.hidden,.column-header.hidden { overflow: hidden; color: transparent; background: color-mix(in srgb, var(--theme-card) 70%, var(--theme-primary)); }
.corner { z-index: 24; }
.column-header { display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); font-size: 9px; font-weight: 700; }
.column-header.frozen,.workbook-cell.frozen { box-shadow: 1px 0 0 rgba(var(--theme-primary-rgb),.28); }
.workbook-cell { position: relative; overflow: hidden; padding: 7px 8px 0; outline: 0; text-overflow: ellipsis; white-space: nowrap; background: var(--cell-fill, var(--theme-card)); font-size: 9px; user-select: none; }
.workbook-cell.in-table { background: color-mix(in srgb, var(--cell-fill, var(--theme-card)) 94%, var(--theme-primary)); }
.workbook-cell.table-header { color: var(--theme-primary); font-weight: 700; background: color-mix(in srgb, var(--cell-fill, var(--theme-card)) 82%, var(--theme-primary)); }
.workbook-cell.validated::before { content: ''; position: absolute; top: 3px; right: 3px; width: 3px; height: 3px; border-radius: 50%; background: #d59a2d; }
.workbook-cell.editable { cursor: cell; }
.workbook-cell.in-range { background: color-mix(in srgb, var(--cell-fill, var(--theme-card)) 82%, var(--theme-primary)); }
.workbook-cell.fill-preview { background: color-mix(in srgb, var(--cell-fill, var(--theme-card)) 72%, var(--theme-primary)); }
.workbook-cell.selected { z-index: 3; box-shadow: inset 0 0 0 2px var(--theme-primary); }
.workbook-cell.merged-anchor { z-index: 4; }
.workbook-cell.merged-covered { visibility: hidden; pointer-events: none; }
.cell-content { display: block; overflow: hidden; text-overflow: ellipsis; }
.conditional-icon { display: inline-block; min-width: 1.15em; margin-right: 4px; font-weight: 800; line-height: 1; text-align: center; vertical-align: -0.05em; }
.fill-handle { position: absolute; right: -1px; bottom: -1px; z-index: 5; width: 7px; height: 7px; box-sizing: border-box; border: 1px solid var(--theme-card); background: var(--theme-primary); cursor: crosshair; }
.workbook-cell.dirty::after { content: ''; position: absolute; top: 0; right: 0; border-top: 7px solid #df8a27; border-left: 7px solid transparent; }
.workbook-cell.formula { color: #436fb7; }
.workbook-cell.array-formula-range { background-image: linear-gradient(rgba(99,102,241,.07), rgba(99,102,241,.07)); cursor: not-allowed; }
.workbook-cell.array-formula-anchor { box-shadow: inset 0 0 0 1px rgba(99,102,241,.6); }
.workbook-cell.array-formula-conflict { background-image: repeating-linear-gradient(135deg, rgba(220,38,38,.12), rgba(220,38,38,.12) 4px, rgba(99,102,241,.05) 4px, rgba(99,102,241,.05) 8px); box-shadow: inset 0 0 0 1px rgba(220,38,38,.65); }
.workbook-cell.cell-error { color: #d24e4e; }
.workbook-cell.cell-number,.workbook-cell.cell-integer { text-align: right; font-variant-numeric: tabular-nums; }
.workbook-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }
.workbook-state strong { color: var(--theme-text); }
.workbook-state p { max-width: 560px; text-align: center; }
.workbook-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }
.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 700px) { .page-layout-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .page-layout-panel fieldset { grid-template-columns: repeat(2, minmax(0, 1fr)); } .print-options-panel { grid-template-columns: 1fr; } .header-footer-fields { grid-template-columns: 1fr; } .header-footer-modes { width: 100%; } .linked-data-policy { align-items: flex-start; flex-direction: column; } .linked-data-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .linked-data-group article { grid-template-columns: 1fr; gap: 6px; } .linked-data-group article > button { justify-self: start; } .pivot-audit-status,.pivot-rebuild-plan > header,.pivot-cache-rebuild-result > header,.pivot-synchronized-rebuild-result > header,.pivot-expanded-rebuild-result > header,.pivot-variant-verification-result > header { align-items: flex-start; flex-direction: column; gap: 4px; } .pivot-impact-parts,.pivot-cache-fields,.pivot-sync-facts,.pivot-variant-grid,.pivot-layout-variants,.pivot-copy-save { grid-template-columns: 1fr; } .pivot-preview-result > header { align-items: flex-start; flex-direction: column; } .linked-data-group article .pivot-preview-grid article { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .workbook-actions button:not(.primary):not(.icon-button) { display: none; } .workbook-title span { display: none; } }
</style>
