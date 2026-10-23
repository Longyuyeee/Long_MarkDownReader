use crate::commands::formats::{
    write_external_registered_text_document, write_registered_text_document,
};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::formats::xml::{
    add_xml_attribute_source as add_attribute, add_xml_child_source as add_child,
    analyze_xml_source as analyze_source, copy_xml_element_source as copy_element,
    delete_xml_element_source as delete_element, move_xml_element_source as move_element,
    remove_xml_attribute_source as remove_attribute, rename_xml_element_source as rename_element,
    replace_xml_attribute_source as replace_attribute, replace_xml_text_source as replace_text,
    XmlAttributeChange, XmlElementDeletion, XmlElementMove, XmlSourceAnalysis,
};
use crate::services::external_file_access::ExternalFileAccess;
use tauri::State;

fn validate_save(content: &str, allow_invalid: bool) -> Result<(), TextDocumentError> {
    let analysis = analyze_source(content);
    if analysis.valid || allow_invalid {
        return Ok(());
    }
    let diagnostic = analysis.diagnostics.first();
    let location = diagnostic
        .map(|item| format!("第 {} 行，第 {} 列", item.line, item.column))
        .unwrap_or_else(|| "未知位置".into());
    Err(TextDocumentError::recoverable(
        "invalid-xml-save-blocked",
        format!("XML 源码不满足安全有效性要求（{location}），已阻止覆盖原文件"),
        "修复诊断后保存，或明确选择“按源码保存”保留当前内容",
    ))
}

#[tauri::command]
pub fn rename_xml_element_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<XmlElementMove, TextDocumentError> {
    rename_element(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-element-rename-rejected",
            message,
            "请调整名称或定位源码；输入与当前草稿保留",
        )
    })
}

#[tauri::command]
pub fn add_xml_child_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
    value: String,
) -> Result<XmlElementMove, TextDocumentError> {
    add_child(&content, start, end, &name, &value).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-child-add-rejected",
            message,
            "请调整输入或定位源码；输入与当前草稿保留",
        )
    })
}

#[tauri::command]
pub fn analyze_xml_source(content: String) -> XmlSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub fn replace_xml_attribute_source(
    content: String,
    start: usize,
    end: usize,
    replacement: String,
) -> Result<String, TextDocumentError> {
    replace_attribute(&content, start, end, &replacement).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-attribute-edit-rejected",
            message,
            "调整当前输入后重试，或继续在源码中修改；当前草稿未变",
        )
    })
}

#[tauri::command]
pub fn add_xml_attribute_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
    value: String,
) -> Result<XmlAttributeChange, TextDocumentError> {
    add_attribute(&content, start, end, &name, &value).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-attribute-add-rejected",
            message,
            "请调整输入或在源码中处理；当前草稿保留",
        )
    })
}

#[tauri::command]
pub fn remove_xml_attribute_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<XmlAttributeChange, TextDocumentError> {
    remove_attribute(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-attribute-remove-rejected",
            message,
            "请重新选择或在源码中处理；当前草稿保留",
        )
    })
}

#[tauri::command]
pub fn move_xml_element_source(
    content: String,
    start: usize,
    end: usize,
    direction: String,
) -> Result<XmlElementMove, TextDocumentError> {
    move_element(&content, start, end, &direction).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-element-move-rejected",
            message,
            "重新选择元素或在源码中调整顺序；当前草稿未变",
        )
    })
}

#[tauri::command]
pub fn copy_xml_element_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<String, TextDocumentError> {
    copy_element(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-element-copy-rejected",
            message,
            "重新选择元素或在源码中复制；当前草稿未变",
        )
    })
}

#[tauri::command]
pub fn delete_xml_element_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<XmlElementDeletion, TextDocumentError> {
    delete_element(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-element-delete-rejected",
            message,
            "重新选择元素或在源码中删除；当前草稿未变",
        )
    })
}

#[tauri::command]
pub fn replace_xml_text_source(
    content: String,
    start: usize,
    end: usize,
    replacement: String,
) -> Result<String, TextDocumentError> {
    replace_text(&content, start, end, &replacement).map_err(|message| {
        TextDocumentError::recoverable(
            "xml-text-edit-rejected",
            message,
            "调整当前输入后重试，或继续在源码中修改；当前草稿未变",
        )
    })
}

#[tauri::command]
pub async fn write_xml_source_document(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
    allow_invalid: bool,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    validate_save(&content, allow_invalid)?;

    let source_policy = super::formats::structured_source_save_policy(&content);
    write_registered_text_document(
        library_root,
        path,
        "xml".into(),
        content,
        expected_signature,
        Some(source_policy),
    )
    .await
}

#[tauri::command]
pub async fn write_external_xml_source_document(
    path: String,
    content: String,
    expected_signature: Option<String>,
    allow_invalid: bool,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    validate_save(&content, allow_invalid)?;
    let source_policy = super::formats::structured_source_save_policy(&content);
    write_external_registered_text_document(
        path,
        "xml".into(),
        content,
        expected_signature,
        Some(source_policy),
        &access,
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
