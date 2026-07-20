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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookWritePayload {
    pub expected_signature: String,
    pub edits: Vec<WorkbookCellEdit>,
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
