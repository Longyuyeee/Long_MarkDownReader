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
    pub summary: WorkbookLinkedDataSummary,
    pub policy: WorkbookLinkedDataPolicy,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookLinkedDataSummary {
    pub total_object_count: usize,
    pub local_pivot_count: usize,
    pub connection_backed_pivot_count: usize,
    pub slicer_count: usize,
    pub external_link_count: usize,
    pub connection_count: usize,
    pub refresh_risk_count: usize,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookLinkedDataPolicy {
    pub mode: String,
    pub metadata_visible: bool,
    pub refresh_allowed: bool,
    pub object_editing_allowed: bool,
    pub external_targets_followed: bool,
    pub sensitive_fields_exposed: bool,
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
    pub audit: WorkbookPivotAudit,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotAudit {
    pub status: String,
    pub rebuild_candidate: bool,
    pub blockers: Vec<String>,
    pub layout_range: Option<String>,
    pub cache_field_count: usize,
    pub cache_record_count: Option<usize>,
    pub row_field_count: usize,
    pub column_field_count: usize,
    pub page_field_count: usize,
    pub data_field_count: usize,
    pub fields: Vec<WorkbookPivotField>,
    pub data_fields: Vec<WorkbookPivotDataField>,
    pub writeback: WorkbookPivotWritebackAudit,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotWritebackAudit {
    pub status: String,
    pub allowed: bool,
    pub blockers: Vec<String>,
    pub pivot_field_items_complete: bool,
    pub row_items_complete: bool,
    pub column_items_complete: bool,
    pub output_cells_present: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotField {
    pub index: usize,
    pub name: String,
    pub role: String,
    pub value_type: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotDataField {
    pub source_index: usize,
    pub name: String,
    pub aggregation: String,
    pub supported: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotPreviewPayload {
    pub expected_signature: String,
    pub pivot_part: String,
    #[serde(default)]
    pub edits: Vec<WorkbookCellEdit>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotPreviewKey {
    pub field_index: usize,
    pub field_name: String,
    pub value: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotPreviewMeasure {
    pub source_index: usize,
    pub name: String,
    pub aggregation: String,
    pub value: Option<f64>,
    pub formatted_value: String,
    pub contributing_count: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotPreviewGroup {
    pub row_keys: Vec<WorkbookPivotPreviewKey>,
    pub column_keys: Vec<WorkbookPivotPreviewKey>,
    pub measures: Vec<WorkbookPivotPreviewMeasure>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotPreviewResult {
    pub pivot_name: String,
    pub source_sheet: String,
    pub source_range: String,
    pub source_row_count: usize,
    pub applied_draft_count: usize,
    pub groups: Vec<WorkbookPivotPreviewGroup>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotRebuildPlanPayload {
    pub expected_signature: String,
    pub pivot_part: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotRebuildImpact {
    pub part: String,
    pub role: String,
    pub planned_action: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotRebuildGate {
    pub id: String,
    pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotRebuildPlan {
    pub pivot_name: String,
    pub status: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub temporary_copy_verified: bool,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub source_sheet: Option<String>,
    pub source_range: Option<String>,
    pub output_sheet: Option<String>,
    pub output_range: Option<String>,
    pub affected_parts: Vec<WorkbookPivotRebuildImpact>,
    pub preserved_part_count: usize,
    pub blockers: Vec<String>,
    pub gates: Vec<WorkbookPivotRebuildGate>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotCacheRebuildPayload {
    pub expected_signature: String,
    pub pivot_part: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotCacheFieldRebuild {
    pub index: usize,
    pub name: String,
    pub value_type: String,
    pub shared_item_count: usize,
    pub record_encoding: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotCacheRebuildResult {
    pub pivot_name: String,
    pub status: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub source_record_count: usize,
    pub rebuilt_record_count: usize,
    pub rebuilt_parts: Vec<String>,
    pub preserved_part_count: usize,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub package_valid: bool,
    pub semantic_reparse_valid: bool,
    pub untouched_parts_preserved: bool,
    pub fields: Vec<WorkbookPivotCacheFieldRebuild>,
    pub gates: Vec<WorkbookPivotRebuildGate>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotSynchronizedRebuildPayload {
    pub expected_signature: String,
    pub pivot_part: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotSynchronizedRebuildResult {
    pub pivot_name: String,
    pub status: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub source_record_count: usize,
    pub rebuilt_record_count: usize,
    pub visible_row_item_count: usize,
    pub visible_column_item_count: usize,
    pub output_cell_count: usize,
    pub rebuilt_parts: Vec<String>,
    pub preserved_part_count: usize,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub package_valid: bool,
    pub semantic_reparse_valid: bool,
    pub output_values_verified: bool,
    pub untouched_parts_preserved: bool,
    pub fields: Vec<WorkbookPivotCacheFieldRebuild>,
    pub gates: Vec<WorkbookPivotRebuildGate>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotExpandedRebuildPayload {
    pub expected_signature: String,
    pub pivot_part: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotExpandedRebuildResult {
    pub pivot_name: String,
    pub status: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub rebuilt_record_count: usize,
    pub added_shared_item_count: usize,
    pub removed_shared_item_count: usize,
    pub visible_row_item_count: usize,
    pub visible_column_item_count: usize,
    pub old_output_range: String,
    pub new_output_range: String,
    pub output_cell_count: usize,
    pub cleared_stale_cell_count: usize,
    pub extended_style_cell_count: usize,
    pub rebuilt_parts: Vec<String>,
    pub preserved_part_count: usize,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub package_valid: bool,
    pub semantic_reparse_valid: bool,
    pub output_values_verified: bool,
    pub untouched_parts_preserved: bool,
    pub fields: Vec<WorkbookPivotCacheFieldRebuild>,
    pub gates: Vec<WorkbookPivotRebuildGate>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotVariantVerificationPayload {
    pub expected_signature: String,
    pub pivot_part: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotAggregationVariant {
    pub aggregation: String,
    pub status: String,
    pub output_range: String,
    pub output_cell_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotLayoutVariant {
    pub layout: String,
    pub row_field_count: usize,
    pub column_field_count: usize,
    pub data_field_count: usize,
    pub group_count: usize,
    pub measure_count: usize,
    pub output_value_count: usize,
    pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPivotVariantVerificationResult {
    pub pivot_name: String,
    pub status: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub aggregation_variants: Vec<WorkbookPivotAggregationVariant>,
    pub layout_variants: Vec<WorkbookPivotLayoutVariant>,
    pub package_variant_count: usize,
    pub semantic_variant_count: usize,
    pub source_package_digest: String,
    pub package_variants_verified: bool,
    pub semantic_variants_verified: bool,
    pub gates: Vec<WorkbookPivotRebuildGate>,
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
    pub auto_filter_state: WorkbookFilterState,
    pub tables: Vec<WorkbookTable>,
    pub data_validations: Vec<WorkbookDataValidation>,
    pub conditional_formats: Vec<WorkbookConditionalFormatRule>,
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

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageMarginsChange {
    pub left: f64,
    pub right: f64,
    pub top: f64,
    pub bottom: f64,
    pub header: f64,
    pub footer: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageLayoutChange {
    pub sheet: String,
    pub print_area: Option<WorkbookMergeRange>,
    pub orientation: String,
    pub paper_size: u32,
    pub margins: WorkbookPageMarginsChange,
    pub scale: Option<u32>,
    pub fit_to_width: Option<u32>,
    pub fit_to_height: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPageLayoutPayload {
    pub expected_signature: String,
    pub change: WorkbookPageLayoutChange,
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
    pub use_first_page_number: bool,
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

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPrintOptionsChange {
    pub sheet: String,
    pub grid_lines: bool,
    pub headings: bool,
    pub horizontal_centered: bool,
    pub vertical_centered: bool,
    pub black_and_white: bool,
    pub draft: bool,
    pub first_page_number: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookPrintOptionsPayload {
    pub expected_signature: String,
    pub change: WorkbookPrintOptionsChange,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
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

impl Default for WorkbookHeaderFooter {
    fn default() -> Self {
        Self {
            odd_header: None,
            odd_footer: None,
            even_header: None,
            even_footer: None,
            first_header: None,
            first_footer: None,
            different_odd_even: false,
            different_first_page: false,
            scale_with_document: true,
            align_with_margins: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookHeaderFooterChange {
    pub sheet: String,
    pub odd_header: String,
    pub odd_footer: String,
    pub even_header: String,
    pub even_footer: String,
    pub first_header: String,
    pub first_footer: String,
    pub different_odd_even: bool,
    pub different_first_page: bool,
    pub scale_with_document: bool,
    pub align_with_margins: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookHeaderFooterPayload {
    pub expected_signature: String,
    pub change: WorkbookHeaderFooterChange,
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
    pub show_first_column: bool,
    pub show_last_column: bool,
    pub show_row_stripes: bool,
    pub show_column_stripes: bool,
    pub filter_state: WorkbookFilterState,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFilterState {
    pub filter_column: Option<usize>,
    pub query: Option<String>,
    pub sort_column: Option<usize>,
    pub sort_direction: Option<String>,
    pub editable: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
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

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalFormatStyle {
    pub font_color: Option<String>,
    pub fill_color: Option<String>,
    pub bold: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalColorScalePoint {
    pub kind: String,
    pub value: Option<String>,
    pub color: String,
    #[serde(default)]
    pub resolved_value: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalColorScale {
    pub points: Vec<WorkbookConditionalColorScalePoint>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalThreshold {
    pub kind: String,
    pub value: Option<String>,
    #[serde(default)]
    pub resolved_value: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalDataBar {
    pub minimum: WorkbookConditionalThreshold,
    pub maximum: WorkbookConditionalThreshold,
    pub color: String,
    pub show_value: bool,
    pub min_length: u8,
    pub max_length: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalIconThreshold {
    pub kind: String,
    pub value: Option<String>,
    #[serde(default)]
    pub resolved_value: Option<String>,
    pub inclusive: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalIconSet {
    pub icon_set: String,
    pub thresholds: Vec<WorkbookConditionalIconThreshold>,
    pub reverse: bool,
    pub show_value: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalFormatRule {
    pub group_index: usize,
    pub rule_index: usize,
    pub ranges: Vec<WorkbookMergeRange>,
    pub kind: String,
    pub operator: Option<String>,
    pub formula1: Option<String>,
    pub formula2: Option<String>,
    pub priority: u32,
    pub stop_if_true: bool,
    pub style: WorkbookConditionalFormatStyle,
    #[serde(default)]
    pub color_scale: Option<WorkbookConditionalColorScale>,
    #[serde(default)]
    pub data_bar: Option<WorkbookConditionalDataBar>,
    #[serde(default)]
    pub icon_set: Option<WorkbookConditionalIconSet>,
    pub editable: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
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
    pub index: usize,
    pub name: Option<String>,
    pub name_editable: bool,
    pub color: Option<String>,
    pub color_editable: bool,
    pub categories: Option<String>,
    pub values: Option<String>,
    pub editable: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookChartDataLabels {
    pub show_value: bool,
    pub show_category_name: bool,
    pub show_series_name: bool,
    pub show_percent: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookChart {
    pub chart_type: String,
    pub title: Option<String>,
    pub title_editable: bool,
    pub category_axis_title: Option<String>,
    pub value_axis_title: Option<String>,
    pub legend_position: String,
    pub presentation_editable: bool,
    pub data_labels: WorkbookChartDataLabels,
    pub data_labels_editable: bool,
    pub series: Vec<WorkbookChartSeries>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDrawingObject {
    pub id: String,
    pub object_id: String,
    pub drawing_part: String,
    pub anchor_index: usize,
    pub anchor_kind: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: String,
    pub from: WorkbookDrawingAnchor,
    pub to: Option<WorkbookDrawingAnchor>,
    pub part: Option<String>,
    pub chart: Option<WorkbookChart>,
    pub editable: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookDrawingAction {
    CreateChart,
    DeleteChart,
    ChangeChartType,
    UpdateChartPresentation,
    UpdateChartDataLabels,
    UpdateChartSeriesName,
    UpdateChartSeriesColor,
    UpdateMetadata,
    MoveResize,
    UpdateChartTitle,
    UpdateChartSeries,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDrawingChange {
    pub sheet: String,
    pub drawing_part: String,
    pub anchor_index: usize,
    pub object_id: String,
    pub action: WorkbookDrawingAction,
    pub name: Option<String>,
    pub description: Option<String>,
    pub from: Option<WorkbookDrawingAnchor>,
    pub to: Option<WorkbookDrawingAnchor>,
    pub chart_title: Option<String>,
    pub chart_type: Option<String>,
    pub category_axis_title: Option<String>,
    pub value_axis_title: Option<String>,
    pub legend_position: Option<String>,
    pub data_labels: Option<WorkbookChartDataLabels>,
    pub series_name: Option<String>,
    pub series_color: Option<String>,
    pub source_range: Option<WorkbookMergeRange>,
    pub series_index: Option<usize>,
    pub series_categories: Option<String>,
    pub series_values: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDrawingPayload {
    pub expected_signature: String,
    pub change: WorkbookDrawingChange,
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookTableAction {
    Create,
    Resize,
    Rename,
    SetStyle,
    ConvertToRange,
    Delete,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookTableChange {
    pub sheet: String,
    pub action: WorkbookTableAction,
    pub table_name: String,
    pub new_table_name: Option<String>,
    pub style_name: Option<String>,
    pub show_first_column: Option<bool>,
    pub show_last_column: Option<bool>,
    pub show_row_stripes: Option<bool>,
    pub show_column_stripes: Option<bool>,
    pub range: WorkbookMergeRange,
    #[serde(default)]
    pub columns: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookTablePayload {
    pub expected_signature: String,
    pub change: WorkbookTableChange,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookFilterTarget {
    Worksheet,
    Table,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookFilterAction {
    Apply,
    Clear,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFilterChange {
    pub sheet: String,
    pub target: WorkbookFilterTarget,
    pub action: WorkbookFilterAction,
    pub table_name: Option<String>,
    pub range: WorkbookMergeRange,
    pub filter_column: Option<usize>,
    pub query: Option<String>,
    pub sort_column: Option<usize>,
    pub sort_direction: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFilterPayload {
    pub expected_signature: String,
    pub change: WorkbookFilterChange,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookDataValidationAction {
    Create,
    Update,
    Delete,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDataValidationChange {
    pub sheet: String,
    pub action: WorkbookDataValidationAction,
    pub validation_index: Option<usize>,
    pub validation: Option<WorkbookDataValidation>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDataValidationPayload {
    pub expected_signature: String,
    pub change: WorkbookDataValidationChange,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookConditionalFormatAction {
    Create,
    Update,
    Delete,
    MoveUp,
    MoveDown,
    Split,
    Merge,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalFormatChange {
    pub sheet: String,
    pub action: WorkbookConditionalFormatAction,
    pub group_index: Option<usize>,
    #[serde(default)]
    pub rule_index: Option<usize>,
    pub rule: Option<WorkbookConditionalFormatRule>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookConditionalFormatPayload {
    pub expected_signature: String,
    pub change: WorkbookConditionalFormatChange,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkbookDefinedNameAction {
    Create,
    Rename,
    UpdateRange,
    Delete,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDefinedNameChange {
    pub action: WorkbookDefinedNameAction,
    pub name: String,
    pub new_name: Option<String>,
    pub scope: Option<String>,
    pub target_sheet: Option<String>,
    pub range: Option<WorkbookMergeRange>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDefinedNamePayload {
    pub expected_signature: String,
    pub change: WorkbookDefinedNameChange,
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
    pub category: String,
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
