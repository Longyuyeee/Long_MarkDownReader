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
    pub formula_recalculation: WorkbookCapabilityLevel,
    pub charts: WorkbookCapabilityLevel,
    pub pivot_tables: WorkbookCapabilityLevel,
    pub data_validation: WorkbookCapabilityLevel,
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
    pub horizontal_alignment: String,
    pub wrap_text: bool,
}

impl Default for WorkbookCellStyle {
    fn default() -> Self {
        Self {
            style_id: 0,
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookWritePayload {
    pub expected_signature: String,
    #[serde(default)]
    pub edits: Vec<WorkbookCellEdit>,
    #[serde(default)]
    pub style_edits: Vec<WorkbookCellStyleEdit>,
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
