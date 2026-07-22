use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookCapabilityLevel {
    Supported,
    Planned,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCapabilities {
    pub engine_id: String,
    pub extensions: Vec<String>,
    pub read: WorkbookCapabilityLevel,
    pub cached_formula_results: WorkbookCapabilityLevel,
    pub existing_cell_editing: WorkbookCapabilityLevel,
    pub blank_cell_creation: WorkbookCapabilityLevel,
    pub range_editing: WorkbookCapabilityLevel,
    pub clipboard_tsv: WorkbookCapabilityLevel,
    pub conflict_detection: WorkbookCapabilityLevel,
    pub ooxml_part_preservation: WorkbookCapabilityLevel,
    pub cell_editing: WorkbookCapabilityLevel,
    pub formatting: WorkbookCapabilityLevel,
    pub row_column_selection: WorkbookCapabilityLevel,
    pub multi_area_selection: WorkbookCapabilityLevel,
    pub fill_handle: WorkbookCapabilityLevel,
    pub formula_reference_translation: WorkbookCapabilityLevel,
    pub formula_dependency_graph: WorkbookCapabilityLevel,
    pub formula_recalculation: WorkbookCapabilityLevel,
    pub row_dimensions: WorkbookCapabilityLevel,
    pub column_dimensions: WorkbookCapabilityLevel,
    pub row_column_outline: WorkbookCapabilityLevel,
    pub merged_cells: WorkbookCapabilityLevel,
    pub freeze_panes: WorkbookCapabilityLevel,
    pub sort_filter_view: WorkbookCapabilityLevel,
    pub excel_tables: WorkbookCapabilityLevel,
    pub named_ranges: WorkbookCapabilityLevel,
    pub date_time_values: WorkbookCapabilityLevel,
    pub error_values: WorkbookCapabilityLevel,
    pub named_styles: WorkbookCapabilityLevel,
    pub theme_indexed_colors: WorkbookCapabilityLevel,
    pub per_side_borders: WorkbookCapabilityLevel,
    pub custom_number_formats: WorkbookCapabilityLevel,
    pub conditional_formatting_preservation: WorkbookCapabilityLevel,
    pub charts: WorkbookCapabilityLevel,
    pub pivot_tables: WorkbookCapabilityLevel,
    pub slicers: WorkbookCapabilityLevel,
    pub external_data: WorkbookCapabilityLevel,
    pub data_validation: WorkbookCapabilityLevel,
    pub sheet_protection: WorkbookCapabilityLevel,
    pub print_layout: WorkbookCapabilityLevel,
    pub xlsx_round_trip: WorkbookCapabilityLevel,
    pub max_file_bytes: u64,
    pub max_page_rows: usize,
    pub max_preview_columns: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDocument {
    pub path: String,
    pub size: u64,
    pub signature: String,
    pub sheets: Vec<String>,
    pub defined_names: Vec<WorkbookDefinedName>,
    pub linked_data: WorkbookLinkedData,
    pub protection: WorkbookProtection,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookProtection {
    pub enabled: bool,
    pub lock_structure: bool,
    pub lock_windows: bool,
    pub lock_revision: bool,
    pub password_protected: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookLinkedData {
    pub pivot_tables: Vec<WorkbookPivotTable>,
    pub slicers: Vec<WorkbookSlicer>,
    pub external_links: Vec<WorkbookExternalLink>,
    pub connections: Vec<WorkbookDataConnection>,
    pub external_relationship_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotTable {
    pub name: String,
    pub part: String,
    pub sheet: Option<String>,
    pub cache_id: Option<u32>,
    pub source_type: String,
    pub source_sheet: Option<String>,
    pub source_range: Option<String>,
    pub connection_id: Option<u32>,
    pub refresh_on_load: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookSlicer {
    pub name: String,
    pub part: String,
    pub sheet: Option<String>,
    pub cache_name: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookExternalLink {
    pub part: String,
    pub kind: String,
    pub cached_item_count: usize,
    pub target_kind: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDataConnection {
    pub id: Option<u32>,
    pub name: String,
    pub kind: String,
    pub refresh_on_load: bool,
    pub background: bool,
    pub save_data: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDefinedName {
    pub name: String,
    pub formula: String,
    pub scope: Option<String>,
    pub hidden: bool,
    pub reference: Option<WorkbookRangeReference>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookRangeReference {
    pub sheet: String,
    pub top: usize,
    pub bottom: usize,
    pub left: usize,
    pub right: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCell {
    pub value: String,
    pub formula: Option<String>,
    pub kind: String,
    pub style: WorkbookCellStyle,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCellStyle {
    pub style_id: usize,
    pub named_style: Option<String>,
    pub number_format: String,
    pub font_name: String,
    pub font_size: f64,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub font_color: Option<String>,
    pub fill_color: Option<String>,
    pub border_style: String,
    pub border_color: Option<String>,
    pub border_top: WorkbookBorderSide,
    pub border_right: WorkbookBorderSide,
    pub border_bottom: WorkbookBorderSide,
    pub border_left: WorkbookBorderSide,
    pub horizontal_alignment: String,
    pub wrap_text: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookBorderSide {
    pub style: String,
    pub color: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookNamedStyle {
    pub name: String,
    pub builtin_id: Option<u32>,
}

impl Default for WorkbookCellStyle {
    fn default() -> Self {
        Self {
            style_id: 0,
            named_style: Some("Normal".into()),
            number_format: "general".into(),
            font_name: "Calibri".into(),
            font_size: 11.0,
            bold: false,
            italic: false,
            underline: false,
            font_color: None,
            fill_color: None,
            border_style: "none".into(),
            border_color: None,
            border_top: WorkbookBorderSide {
                style: "none".into(),
                color: None,
            },
            border_right: WorkbookBorderSide {
                style: "none".into(),
                color: None,
            },
            border_bottom: WorkbookBorderSide {
                style: "none".into(),
                color: None,
            },
            border_left: WorkbookBorderSide {
                style: "none".into(),
                color: None,
            },
            horizontal_alignment: "general".into(),
            wrap_text: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookSheetPage {
    pub sheet: String,
    pub row_offset: usize,
    pub total_rows: usize,
    pub total_columns: usize,
    pub returned_columns: usize,
    pub rows: Vec<Vec<WorkbookCell>>,
    pub truncated_columns: bool,
    pub default_row_height: f64,
    pub default_column_width: f64,
    pub row_heights: Vec<WorkbookRowHeight>,
    pub column_widths: Vec<WorkbookColumnWidth>,
    pub row_states: Vec<WorkbookRowState>,
    pub column_states: Vec<WorkbookColumnState>,
    pub merged_cells: Vec<WorkbookMergeRange>,
    pub named_styles: Vec<WorkbookNamedStyle>,
    pub freeze_pane: WorkbookFreezePane,
    pub auto_filter: Option<WorkbookMergeRange>,
    pub tables: Vec<WorkbookTable>,
    pub data_validations: Vec<WorkbookDataValidation>,
    pub drawings: Vec<WorkbookDrawingObject>,
    pub page_layout: WorkbookPageLayout,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageLayout {
    pub print_area: Option<WorkbookMergeRange>,
    pub margins: WorkbookPageMargins,
    pub setup: WorkbookPageSetup,
    pub options: WorkbookPrintOptions,
    pub header_footer: WorkbookHeaderFooter,
    pub protection: WorkbookSheetProtection,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageMargins {
    pub left: Option<f64>,
    pub right: Option<f64>,
    pub top: Option<f64>,
    pub bottom: Option<f64>,
    pub header: Option<f64>,
    pub footer: Option<f64>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageSetup {
    pub orientation: Option<String>,
    pub paper_size: Option<u32>,
    pub scale: Option<u32>,
    pub fit_to_width: Option<u32>,
    pub fit_to_height: Option<u32>,
    pub first_page_number: Option<u32>,
    pub horizontal_dpi: Option<u32>,
    pub vertical_dpi: Option<u32>,
    pub black_and_white: bool,
    pub draft: bool,
    pub fit_to_page: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPrintOptions {
    pub grid_lines: bool,
    pub headings: bool,
    pub horizontal_centered: bool,
    pub vertical_centered: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookHeaderFooter {
    pub odd_header: Option<String>,
    pub odd_footer: Option<String>,
    pub even_header: Option<String>,
    pub even_footer: Option<String>,
    pub first_header: Option<String>,
    pub first_footer: Option<String>,
    pub different_odd_even: bool,
    pub different_first_page: bool,
    pub scale_with_document: bool,
    pub align_with_margins: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookSheetProtection {
    pub enabled: bool,
    pub password_protected: bool,
    pub blocked_actions: Vec<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFreezePane {
    pub rows: usize,
    pub columns: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookTable {
    pub name: String,
    pub display_name: String,
    pub range: WorkbookMergeRange,
    pub columns: Vec<String>,
    pub totals_row_shown: bool,
    pub style_name: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDataValidation {
    pub ranges: Vec<WorkbookMergeRange>,
    pub kind: String,
    pub operator: Option<String>,
    pub formula1: Option<String>,
    pub formula2: Option<String>,
    pub allow_blank: bool,
    pub show_error_message: bool,
    pub error_title: Option<String>,
    pub error: Option<String>,
    pub prompt_title: Option<String>,
    pub prompt: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDrawingAnchor {
    pub row: usize,
    pub column: usize,
    pub row_offset: i64,
    pub column_offset: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookChartSeries {
    pub name: Option<String>,
    pub categories: Option<String>,
    pub values: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookChart {
    pub chart_type: String,
    pub title: Option<String>,
    pub series: Vec<WorkbookChartSeries>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDrawingObject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: String,
    pub from: WorkbookDrawingAnchor,
    pub to: Option<WorkbookDrawingAnchor>,
    pub part: Option<String>,
    pub chart: Option<WorkbookChart>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookRowHeight {
    pub row: usize,
    pub height: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookColumnWidth {
    pub start_column: usize,
    pub end_column: usize,
    pub width: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookRowState {
    pub row: usize,
    pub hidden: bool,
    pub outline_level: u8,
    pub collapsed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookColumnState {
    pub start_column: usize,
    pub end_column: usize,
    pub hidden: bool,
    pub outline_level: u8,
    pub collapsed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookMergeRange {
    pub top: usize,
    pub bottom: usize,
    pub left: usize,
    pub right: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCellEdit {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
    pub input: String,
    pub kind: String,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookStylePatch {
    pub named_style: Option<String>,
    pub number_format: Option<String>,
    pub font_name: Option<String>,
    pub font_size: Option<f64>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub font_color: Option<String>,
    pub fill_color: Option<String>,
    pub border_style: Option<String>,
    pub border_color: Option<String>,
    pub border_top: Option<WorkbookBorderSidePatch>,
    pub border_right: Option<WorkbookBorderSidePatch>,
    pub border_bottom: Option<WorkbookBorderSidePatch>,
    pub border_left: Option<WorkbookBorderSidePatch>,
    pub horizontal_alignment: Option<String>,
    pub wrap_text: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCellStyleEdit {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
    pub patch: WorkbookStylePatch,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookBorderSidePatch {
    pub style: String,
    pub color: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookRowHeightEdit {
    pub sheet: String,
    pub row: usize,
    pub height: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookColumnWidthEdit {
    pub sheet: String,
    pub start_column: usize,
    pub end_column: usize,
    pub width: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookRowStateEdit {
    pub sheet: String,
    pub row: usize,
    pub hidden: bool,
    pub outline_level: u8,
    pub collapsed: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookColumnStateEdit {
    pub sheet: String,
    pub start_column: usize,
    pub end_column: usize,
    pub hidden: bool,
    pub outline_level: u8,
    pub collapsed: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookOutlinePayload {
    pub expected_signature: String,
    #[serde(default)]
    pub row_edits: Vec<WorkbookRowStateEdit>,
    #[serde(default)]
    pub column_edits: Vec<WorkbookColumnStateEdit>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookStructureAxis {
    Row,
    Column,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookStructureAction {
    Insert,
    Delete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookStructureChange {
    pub sheet: String,
    pub axis: WorkbookStructureAxis,
    pub action: WorkbookStructureAction,
    pub index: usize,
    pub count: usize,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookStructureMigrationPreview {
    pub formulas: Vec<String>,
    pub references: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookStructurePayload {
    pub expected_signature: String,
    pub change: WorkbookStructureChange,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookMergeEdit {
    pub sheet: String,
    pub top: usize,
    pub bottom: usize,
    pub left: usize,
    pub right: usize,
    pub action: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookWritePayload {
    pub expected_signature: String,
    #[serde(default)]
    pub edits: Vec<WorkbookCellEdit>,
    #[serde(default)]
    pub style_edits: Vec<WorkbookCellStyleEdit>,
    #[serde(default)]
    pub row_height_edits: Vec<WorkbookRowHeightEdit>,
    #[serde(default)]
    pub column_width_edits: Vec<WorkbookColumnWidthEdit>,
    #[serde(default)]
    pub merge_edits: Vec<WorkbookMergeEdit>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFormulaTarget {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCalculationPayload {
    pub expected_signature: String,
    #[serde(default)]
    pub edits: Vec<WorkbookCellEdit>,
    #[serde(default)]
    pub targets: Vec<WorkbookFormulaTarget>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCalculatedCell {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
    pub value: String,
    pub formatted_value: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCalculationDiagnostic {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
    pub code: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCalculationResult {
    pub cells: Vec<WorkbookCalculatedCell>,
    pub diagnostics: Vec<WorkbookCalculationDiagnostic>,
    pub evaluated_formula_count: usize,
}

pub trait WorkbookEngine {
    fn capabilities(&self) -> WorkbookCapabilities;

    fn inspect(&self, path: &Path) -> Result<WorkbookDocument, String>;

    fn read_sheet(
        &self,
        path: &Path,
        sheet: &str,
        row_offset: usize,
        row_limit: usize,
    ) -> Result<WorkbookSheetPage, String>;
}
