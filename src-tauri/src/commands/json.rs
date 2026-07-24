use crate::formats::json::{analyze_json_source as analyze_source, JsonSourceAnalysis};

#[tauri::command]
pub fn analyze_json_source(content: String, jsonc: bool) -> JsonSourceAnalysis {
    analyze_source(&content, jsonc)
}
