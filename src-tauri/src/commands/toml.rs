use crate::commands::formats::write_registered_text_document;
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::formats::toml::{analyze_toml_source as analyze_source, TomlSourceAnalysis};

#[tauri::command]
pub fn analyze_toml_source(content: String) -> TomlSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub async fn write_toml_source_document(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
    allow_invalid: bool,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let analysis = analyze_source(&content);
    if !analysis.valid && !allow_invalid {
        let location = analysis
            .diagnostics
            .first()
            .map(|item| format!("第 {} 行，第 {} 列", item.line, item.column))
            .unwrap_or_else(|| "未知位置".into());
        return Err(TextDocumentError::recoverable(
            "invalid-toml-save-blocked",
            format!("TOML 源码存在语法错误（{location}），已阻止覆盖原文件"),
            "修复语法后保存，或明确选择“按源码保存”保留当前非法内容",
        ));
    }
    write_registered_text_document(
        library_root,
        path,
        "toml".into(),
        content,
        expected_signature,
        None,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_toml_is_blocked_before_registered_write() {
        let error = tauri::async_runtime::block_on(write_toml_source_document(
            std::env::temp_dir().to_string_lossy().into_owned(),
            "invalid.toml".into(),
            "[broken\nkey = 1\n".into(),
            None,
            false,
        ))
        .unwrap_err();
        assert_eq!(error.code, "invalid-toml-save-blocked");
        assert!(error.recoverable);
    }
}
