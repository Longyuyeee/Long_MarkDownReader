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
        <button title="重算当前已加载公式" :disabled="calculating || saving || !activeSheet" @click="recalculateFormulas"><n-icon :component="CalculatorIcon" />{{ calculating ? '重算中…' : '重算' }}</button>
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
      <em v-if="workbook.linkedData.externalRelationshipCount">安全模式：已识别 {{ workbook.linkedData.externalRelationshipCount }} 个外部目标，未发起网络或文件访问</em>
    </div>

    <div v-if="workbook && sheetInfo && (hasPageLayout || sheetProtected || workbook.protection.enabled)" class="page-layout-toolbar" aria-label="打印布局与保护状态">
      <strong>页面与保护</strong>
      <span v-if="sheetInfo.pageLayout.printArea">打印区域 {{ rangeLabel(sheetInfo.pageLayout.printArea) }}</span>
      <span v-if="sheetInfo.pageLayout.setup.orientation">{{ sheetInfo.pageLayout.setup.orientation === 'landscape' ? '横向' : '纵向' }} · 纸张 {{ sheetInfo.pageLayout.setup.paperSize || '默认' }}</span>
      <span v-if="sheetInfo.pageLayout.setup.fitToPage">适配 {{ sheetInfo.pageLayout.setup.fitToWidth ?? '默认' }} × {{ sheetInfo.pageLayout.setup.fitToHeight ?? '默认' }} 页</span>
      <span v-if="sheetInfo.pageLayout.headerFooter.oddHeader || sheetInfo.pageLayout.headerFooter.oddFooter" :title="`${sheetInfo.pageLayout.headerFooter.oddHeader || ''}\n${sheetInfo.pageLayout.headerFooter.oddFooter || ''}`">已配置页眉/页脚</span>
      <span v-if="workbook.protection.lockStructure">工作簿结构已锁定</span>
      <em v-if="sheetProtected">当前 Sheet 受保护，LongEdit 不会绕过密码或写入限制</em>
    </div>

    <div v-if="workbook && sheetInfo" class="formula-bar">
      <select value="" title="跳转到命名区域" :disabled="!navigableDefinedNames.length" @change="navigateDefinedName">
        <option value="">{{ navigableDefinedNames.length ? '命名区域' : '无命名区域' }}</option>
        <option v-for="item in navigableDefinedNames" :key="item.index" :value="item.index">{{ item.label }}</option>
      </select>
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
      <button title="合并选中的连续区域" :disabled="!canMergeSelection || saving" @click="mergeSelection">合并</button>
      <button title="取消当前合并区域" :disabled="!selectedMerge || saving" @click="unmergeSelection">取消合并</button>
      <span class="toolbar-divider"></span>
      <button title="冻结当前单元格上方行和左侧列" :disabled="!selectedCell || (!selectedCell.row && !selectedCell.column) || saving || updatingStructure || Boolean(dirtyCount)" @click="setFreezePane">冻结窗格</button>
      <button title="取消当前工作表冻结窗格" :disabled="(!effectiveFreeze.rows && !effectiveFreeze.columns) || saving || updatingStructure || Boolean(dirtyCount)" @click="clearFreezePane">取消冻结</button>
    </div>

    <div v-if="workbook && sheetInfo && (activeDataRegion || selectedValidation)" class="data-toolbar">
      <template v-if="activeDataRegion">
        <strong>{{ activeDataRegion.label }}</strong>
        <select v-model.number="filterColumn" title="筛选字段" @focus="prepareDataView">
          <option :value="-1">全部字段</option>
          <option v-for="column in activeDataColumns" :key="column.index" :value="column.index">{{ column.label }}</option>
        </select>
        <input v-model="filterQuery" placeholder="会话筛选，不改写源文件" @focus="prepareDataView" @input="prepareDataView">
        <select v-model.number="sortColumn" title="排序字段" @focus="prepareDataView">
          <option :value="-1">不排序</option>
          <option v-for="column in activeDataColumns" :key="column.index" :value="column.index">{{ column.label }}</option>
        </select>
        <button :class="{ active: sortDirection === 'asc' }" :disabled="sortColumn < 0" @click="sortDirection = 'asc'">升序</button>
        <button :class="{ active: sortDirection === 'desc' }" :disabled="sortColumn < 0" @click="sortDirection = 'desc'">降序</button>
        <span>{{ dataViewLoading ? '载入数据…' : `${dataViewRows.length.toLocaleString()} 行` }}</span>
        <button :disabled="!dataViewRows.length" @click="navigateDataResult(-1)">上一条</button>
        <button :disabled="!dataViewRows.length" @click="navigateDataResult(1)">下一条</button>
      </template>
      <span v-if="selectedValidation" class="validation-hint" :title="selectedValidation.error || selectedValidation.prompt || ''">验证：{{ validationLabel(selectedValidation) }}</span>
    </div>

    <div v-if="workbook && sheetInfo?.drawings.length" class="drawing-toolbar" aria-label="工作表绘图对象">
      <strong>绘图对象 {{ sheetInfo.drawings.length }}</strong>
      <button
        v-for="drawing in sheetInfo.drawings"
        :key="drawing.id"
        :title="drawingTooltip(drawing)"
        @click="navigateDrawing(drawing)"
      >
        <span>{{ drawingKindLabel(drawing) }}</span>
        <b>{{ drawing.chart?.title || drawing.name || `对象 ${drawing.id}` }}</b>
        <small>{{ drawingAnchorLabel(drawing) }}<template v-if="drawing.chart"> · {{ drawing.chart.series.length }} 系列</template></small>
      </button>
      <em>结构化预览；原始图表、图片与绘图部件会在单元格写回时保持不变</em>
    </div>

    <main class="workbook-main">
      <div v-if="loading" class="workbook-state"><div class="loader"></div><strong>正在解析 XLSX 工作簿</strong></div>
      <div v-else-if="error" class="workbook-state error"><strong>无法打开工作簿</strong><p>{{ error }}</p><button @click="loadWorkbook">重试</button></div>
      <template v-else-if="workbook && sheetInfo">
        <div v-if="dirtyCount || sheetInfo.truncatedColumns || pageLoading || calculationCount || calculationErrors" class="workbook-status">
          <span v-if="dirtyCount">{{ dirtyCount }} 个更改项尚未保存</span>
          <span v-if="sheetInfo.truncatedColumns">当前显示前 {{ sheetInfo.returnedColumns }} 列</span>
          <span v-if="pageLoading">正在载入行数据…</span>
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
                  :style="[cellStyleCss(row.index, column - 1), frozenColumnStyle(column - 1)]"
                  @pointerdown="startCellSelection(row.index, column - 1, $event)"
                  @pointerenter="extendCellSelection(row.index, column - 1)"
                  @dblclick="beginCellEdit(row.index, column - 1)"
                >
                  <span class="cell-content">{{ cellDisplay(row.index, column - 1) }}</span>
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
import { AlignCenter as AlignCenterIcon, AlignLeft as AlignLeftIcon, AlignRight as AlignRightIcon, ArrowLeft as ArrowLeftIcon, Bold as BoldIcon, Calculator as CalculatorIcon, ClipboardPaste as PasteIcon, Copy as CopyIcon, FileSpreadsheet as SheetIcon, FunctionSquare as FunctionIcon, Grid2X2 as BorderIcon, Italic as ItalicIcon, PaintBucket as FillIcon, Redo2 as RedoIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Table2 as TableIcon, Type as TypeIcon, Underline as UnderlineIcon, Undo2 as UndoIcon, WrapText as WrapIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'

interface WorkbookRangeReference { sheet: string; top: number; bottom: number; left: number; right: number }
interface WorkbookDefinedName { name: string; formula: string; scope?: string; hidden: boolean; reference?: WorkbookRangeReference }
interface WorkbookPivotTable { name: string; part: string; sheet?: string; cacheId?: number; sourceType: string; sourceSheet?: string; sourceRange?: string; connectionId?: number; refreshOnLoad: boolean }
interface WorkbookSlicer { name: string; part: string; sheet?: string; cacheName?: string }
interface WorkbookExternalLink { part: string; kind: string; cachedItemCount: number; targetKind?: string }
interface WorkbookDataConnection { id?: number; name: string; kind: string; refreshOnLoad: boolean; background: boolean; saveData: boolean }
interface WorkbookLinkedData { pivotTables: WorkbookPivotTable[]; slicers: WorkbookSlicer[]; externalLinks: WorkbookExternalLink[]; connections: WorkbookDataConnection[]; externalRelationshipCount: number }
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
interface WorkbookTable { name: string; displayName: string; range: WorkbookMergeRange; columns: string[]; totalsRowShown: boolean; styleName?: string }
interface WorkbookDataValidation { ranges: WorkbookMergeRange[]; kind: string; operator?: string; formula1?: string; formula2?: string; allowBlank: boolean; showErrorMessage: boolean; errorTitle?: string; error?: string; promptTitle?: string; prompt?: string }
interface WorkbookDrawingAnchor { row: number; column: number; rowOffset: number; columnOffset: number }
interface WorkbookChartSeries { name?: string; categories?: string; values?: string }
interface WorkbookChart { chartType: string; title?: string; series: WorkbookChartSeries[] }
interface WorkbookDrawingObject { id: string; name: string; description?: string; kind: string; from: WorkbookDrawingAnchor; to?: WorkbookDrawingAnchor; part?: string; chart?: WorkbookChart }
interface WorkbookPageMargins { left?: number; right?: number; top?: number; bottom?: number; header?: number; footer?: number }
interface WorkbookPageSetup { orientation?: string; paperSize?: number; scale?: number; fitToWidth?: number; fitToHeight?: number; firstPageNumber?: number; horizontalDpi?: number; verticalDpi?: number; blackAndWhite: boolean; draft: boolean; fitToPage: boolean }
interface WorkbookPrintOptions { gridLines: boolean; headings: boolean; horizontalCentered: boolean; verticalCentered: boolean }
interface WorkbookHeaderFooter { oddHeader?: string; oddFooter?: string; evenHeader?: string; evenFooter?: string; firstHeader?: string; firstFooter?: string; differentOddEven: boolean; differentFirstPage: boolean; scaleWithDocument: boolean; alignWithMargins: boolean }
interface WorkbookSheetProtection { enabled: boolean; passwordProtected: boolean; blockedActions: string[] }
interface WorkbookPageLayout { printArea?: WorkbookMergeRange; margins: WorkbookPageMargins; setup: WorkbookPageSetup; options: WorkbookPrintOptions; headerFooter: WorkbookHeaderFooter; protection: WorkbookSheetProtection }
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
  tables: WorkbookTable[]
  dataValidations: WorkbookDataValidation[]
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
interface WorkbookCalculationDiagnostic { sheet: string; row: number; column: number; code: string }
interface WorkbookCalculationResult { cells: WorkbookCalculatedCell[]; diagnostics: WorkbookCalculationDiagnostic[]; evaluatedFormulaCount: number }

const PAGE_ROWS = 2_000
const MAX_BATCH_CELLS = 10_000
const MAX_SELECTION_AREAS = 32
const EXTRA_ROWS = 100
const EXTRA_COLUMNS = 5
const MIN_ROW_PIXELS = 24
const MIN_COLUMN_PIXELS = 38
const MAX_DATA_VIEW_ROWS = 50_000
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
const drafts = ref(new Map<string, WorkbookCellEdit>())
const styleDrafts = ref(new Map<string, WorkbookStylePatch>())
const rowHeightDrafts = ref(new Map<string, number | null>())
const columnWidthDrafts = ref(new Map<string, number | null>())
const mergeDrafts = ref(new Map<string, WorkbookMergeEdit>())
const updatingStructure = ref(false)
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
const hasPageLayout = computed(() => {
  const layout = sheetInfo.value?.pageLayout
  if (!layout) return false
  return Boolean(layout.printArea || layout.setup.orientation || layout.setup.paperSize || layout.headerFooter.oddHeader || layout.headerFooter.oddFooter || Object.values(layout.margins).some(value => value !== undefined))
})
const containsCell = (range: WorkbookMergeRange, row: number, column: number) => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
const tableAt = (row: number, column: number) => sheetInfo.value?.tables.find(table => containsCell(table.range, row, column))
const isTableHeader = (row: number, column: number) => Boolean(sheetInfo.value?.tables.some(table => row === table.range.top && column >= table.range.left && column <= table.range.right))
const validationAt = (row: number, column: number) => sheetInfo.value?.dataValidations.find(validation => validation.ranges.some(range => containsCell(range, row, column)))
const selectedValidation = computed(() => selectedCell.value ? validationAt(selectedCell.value.row, selectedCell.value.column) : undefined)
const validationLabel = (validation: WorkbookDataValidation) => {
  if (validation.kind === 'list') return `列表 ${validation.formula1 || ''}`
  if (validation.kind === 'whole') return `整数 ${validation.operator || 'between'} ${validation.formula1 || ''}${validation.formula2 ? `～${validation.formula2}` : ''}`
  if (validation.kind === 'decimal') return `数值 ${validation.operator || 'between'} ${validation.formula1 || ''}${validation.formula2 ? `～${validation.formula2}` : ''}`
  if (validation.kind === 'textLength') return `文本长度 ${validation.operator || 'between'}`
  return validation.kind
}
const activeDataRegion = computed(() => {
  const table = sheetInfo.value?.tables[0]
  if (table) return { range: table.range, label: `Table · ${table.displayName}`, columns: table.columns }
  const range = sheetInfo.value?.autoFilter
  return range ? { range, label: '自动筛选区域', columns: [] as string[] } : undefined
})
const activeDataColumns = computed(() => {
  const region = activeDataRegion.value
  if (!region) return []
  return Array.from({ length: region.range.right - region.range.left + 1 }, (_, offset) => {
    const index = region.range.left + offset
    return { index, label: region.columns[offset] || cellAt(region.range.top, index).value || columnLabel(index) }
  })
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
  pivot.connectionId ? `连接 ${pivot.connectionId}` : '',
  pivot.refreshOnLoad ? '原文件要求打开时刷新；LongEdit 不会自动刷新' : '',
  `OOXML：${pivot.part}`,
].filter(Boolean).join('\n')
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
}
const originalInput = (cell: WorkbookCell) => cell.formula || cell.value || ''
const isEditableCell = (row: number, column: number) => {
  if (sheetProtected.value) return false
  if (isMergedCovered(row, column)) return false
  const source = sourceCellAt(row, column)
  return Boolean(source.formula) || !['date', 'error'].includes(source.kind)
}
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
  return (cell.formula ? `${columnLabel(column)}${row + 1}\n公式：${cell.formula}\n结果：${cell.value || '等待外部公式引擎重算'}` : cell.value) + validationText
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
const navigableDefinedNames = computed(() => (workbook.value?.definedNames || [])
  .map((item, index) => ({ item, index, label: `${item.scope ? `${item.scope}!` : ''}${item.name}` }))
  .filter(({ item }) => !item.hidden && item.reference && workbook.value?.sheets.includes(item.reference.sheet)))
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

const recalculateFormulas = async () => {
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
  if (!targets.size) return void message.info('当前已加载区域没有公式')
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
    else message.success(`已重算 ${result.evaluatedFormulaCount} 个公式`)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { calculating.value = false }
}

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
const selectSheet = async (sheet: string) => {
  if (!sheet || (sheet === activeSheet.value && sheetInfo.value)) return
  generation += 1
  activeSheet.value = sheet
  selectedCell.value = null
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
const navigateDefinedName = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  if (!select.value) return
  const index = Number(select.value)
  select.value = ''
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
const navigateDrawing = async (drawing: WorkbookDrawingObject) => {
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
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) { viewportHeight.value = element.clientHeight; resizeObserver?.observe(element) }
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
.formula-bar { height: 34px; flex: none; display: grid; grid-template-columns: 150px 72px 28px minmax(0, 1fr); align-items: center; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); }
.linked-data-toolbar { min-height: 42px; flex: none; display: flex; align-items: center; gap: 7px; padding: 4px 12px; overflow-x: auto; border-bottom: 1px solid rgba(190,120,25,.18); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 91%, #fff0cf); font-size: 9px; }
.linked-data-toolbar > strong,.linked-data-toolbar > span,.linked-data-toolbar > em { flex: none; }
.linked-data-toolbar > strong { color: #9a641f; }
.linked-data-toolbar > span { padding: 4px 7px; border-radius: 4px; background: rgba(190,120,25,.1); }
.linked-data-toolbar > em { margin-left: auto; color: #9a641f; font-style: normal; }
.linked-data-toolbar button { min-width: 155px; height: 32px; flex: none; display: flex; flex-direction: column; justify-content: center; padding: 3px 8px; border: 1px solid rgba(190,120,25,.2); border-radius: 5px; color: var(--theme-text); background: var(--theme-card); text-align: left; font-size: 9px; cursor: pointer; }
.linked-data-toolbar button small { max-width: 180px; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 8px; }
.page-layout-toolbar { min-height: 34px; flex: none; display: flex; align-items: center; gap: 7px; padding: 3px 12px; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, #dce8f7); font-size: 9px; }
.page-layout-toolbar > * { flex: none; }
.page-layout-toolbar strong { color: var(--theme-primary); }
.page-layout-toolbar span { padding: 4px 7px; border-radius: 4px; background: rgba(var(--theme-primary-rgb),.07); }
.page-layout-toolbar em { margin-left: auto; color: #b14545; font-style: normal; font-weight: 700; }
.formula-bar select { min-width: 0; height: 100%; padding: 0 24px 0 10px; border: 0; border-right: 1px solid rgba(0,0,0,.08); outline: 0; color: var(--theme-text); background: transparent; font-size: 9px; }
.formula-bar output { overflow: hidden; padding: 0 10px; text-align: center; text-overflow: ellipsis; font-size: 10px; font-weight: 700; }
.formula-bar span { color: var(--theme-text-secondary); text-align: center; font-size: 11px; font-style: italic; }
.formula-bar input { min-width: 0; height: 100%; padding: 0 10px; border: 0; border-left: 1px solid rgba(0,0,0,.08); outline: 0; color: var(--theme-text); background: transparent; font: inherit; font-size: 10px; }
.formula-bar input:focus { box-shadow: inset 0 -2px var(--theme-primary); }
.formula-bar input:disabled { opacity: .55; }
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
.drawing-toolbar button span { grid-row: 1 / 3; padding: 3px 5px; border-radius: 4px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); font-size: 8px; }
.drawing-toolbar button b,.drawing-toolbar button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawing-toolbar button b { font-size: 9px; }
.drawing-toolbar button small { color: var(--theme-text-secondary); font-size: 8px; }
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
.fill-handle { position: absolute; right: -1px; bottom: -1px; z-index: 5; width: 7px; height: 7px; box-sizing: border-box; border: 1px solid var(--theme-card); background: var(--theme-primary); cursor: crosshair; }
.workbook-cell.dirty::after { content: ''; position: absolute; top: 0; right: 0; border-top: 7px solid #df8a27; border-left: 7px solid transparent; }
.workbook-cell.formula { color: #436fb7; }
.workbook-cell.cell-error { color: #d24e4e; }
.workbook-cell.cell-number,.workbook-cell.cell-integer { text-align: right; font-variant-numeric: tabular-nums; }
.workbook-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }
.workbook-state strong { color: var(--theme-text); }
.workbook-state p { max-width: 560px; text-align: center; }
.workbook-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }
.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .workbook-actions button:not(.primary):not(.icon-button) { display: none; } .workbook-title span { display: none; } }
</style>
