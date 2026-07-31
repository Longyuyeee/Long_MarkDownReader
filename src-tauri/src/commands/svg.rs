use crate::commands::formats::write_registered_text_document;
use crate::formats::svg::{analyze_svg_source as analyze_source, SvgSourceAnalysis};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};

#[tauri::command]
pub fn analyze_svg_source(content: String) -> SvgSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub async fn write_svg_source_document(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let analysis = analyze_source(&content);
    if !analysis.xml.valid {
        let diagnostic = analysis.xml.diagnostics.first();
        let location = diagnostic
            .map(|item| format!("第 {} 行，第 {} 列", item.line, item.column))
            .unwrap_or_else(|| "未知位置".into());
        return Err(TextDocumentError::recoverable(
            "unsafe-svg-save-blocked",
            format!("SVG 源码不满足安全合同（{location}），已阻止覆盖原文件"),
            "移除脚本、事件属性、外部引用或其他受阻内容后再保存",
        ));
    }

    write_registered_text_document(
        library_root,
        path,
        "svg".into(),
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
    fn active_svg_is_blocked_before_registered_write() {
        let error = tauri::async_runtime::block_on(write_svg_source_document(
            std::env::temp_dir().to_string_lossy().into_owned(),
            "unsafe.svg".into(),
            r#"<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>"#.into(),
            None,
        ))
        .unwrap_err();
        assert_eq!(error.code, "unsafe-svg-save-blocked");
        assert!(error.recoverable);
    }
}
