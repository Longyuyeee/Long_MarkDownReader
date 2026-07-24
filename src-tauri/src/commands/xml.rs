use crate::commands::formats::write_registered_text_document;
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::formats::xml::{analyze_xml_source as analyze_source, XmlSourceAnalysis};

#[tauri::command]
pub fn analyze_xml_source(content: String) -> XmlSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub async fn write_xml_source_document(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
    allow_invalid: bool,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let analysis = analyze_source(&content);
    if !analysis.valid && !allow_invalid {
        let diagnostic = analysis.diagnostics.first();
        let location = diagnostic
            .map(|item| format!("第 {} 行，第 {} 列", item.line, item.column))
            .unwrap_or_else(|| "未知位置".into());
        return Err(TextDocumentError::recoverable(
            "invalid-xml-save-blocked",
            format!("XML 源码不满足安全有效性要求（{location}），已阻止覆盖原文件"),
            "修复诊断后保存，或明确选择“按源码保存”保留当前内容",
        ));
    }

    write_registered_text_document(
        library_root,
        path,
        "xml".into(),
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
    fn unsafe_xml_is_blocked_before_registered_write() {
        let error = tauri::async_runtime::block_on(write_xml_source_document(
            std::env::temp_dir().to_string_lossy().into_owned(),
            "unsafe.xml".into(),
            r#"<!DOCTYPE root SYSTEM "file:///etc/passwd"><root/>"#.into(),
            None,
            false,
        ))
        .unwrap_err();
        assert_eq!(error.code, "invalid-xml-save-blocked");
        assert!(error.recoverable);
    }
}
