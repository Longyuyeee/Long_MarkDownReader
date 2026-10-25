use crate::commands::formats::{
    write_external_registered_text_document, write_registered_text_document,
};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::formats::yaml::{
    analyze_yaml_source as analyze_source, rename_yaml_key_source as rename_key,
    replace_yaml_value_source as replace_value, YamlKeyChange, YamlSourceAnalysis,
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
        "invalid-yaml-save-blocked",
        format!("YAML 源码存在语法错误（{location}），已阻止覆盖原文件"),
        "修复语法后保存，或明确选择“按源码保存”保留当前非法内容",
    ))
}

#[tauri::command]
pub fn analyze_yaml_source(content: String) -> YamlSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub fn rename_yaml_key_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    rename_key(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-key-rename-rejected",
            message,
            "调整字段名后重试，或定位源码修改；当前输入和草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn replace_yaml_value_source(
    content: String,
    start: usize,
    end: usize,
    replacement: String,
) -> Result<String, TextDocumentError> {
    replace_value(&content, start, end, &replacement).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-value-edit-rejected",
            message,
            "调整当前输入后重试，或继续在源码中修改；当前草稿未变",
        )
    })
}

#[tauri::command]
pub fn add_yaml_field_source(
    content: String,
    start: usize,
    end: usize,
    inside: bool,
    name: String,
    value: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::add_yaml_field_source(&content, start, end, inside, &name, &value)
        .map_err(|message| {
            TextDocumentError::recoverable(
                "yaml-field-add-rejected",
                message,
                "调整输入后重试，或定位源码；当前输入与草稿仍保留",
            )
        })
}

#[tauri::command]
pub fn remove_yaml_field_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::remove_yaml_field_source(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-field-remove-rejected",
            message,
            "定位源码后继续修改；当前草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn move_yaml_field_source(
    content: String,
    start: usize,
    end: usize,
    direction: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::move_yaml_field_source(&content, start, end, &direction).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-field-move-rejected",
            message,
            "调整名称后重试，或定位源码；当前输入与草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn copy_yaml_field_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::copy_yaml_field_source(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-field-copy-rejected",
            message,
            "调整名称后重试，或定位源码；当前输入与草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn add_yaml_sequence_item_source(
    content: String,
    start: usize,
    end: usize,
    after: bool,
    value: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::add_yaml_sequence_item_source(&content, start, end, after, &value)
        .map_err(|message| {
            TextDocumentError::recoverable(
                "yaml-sequence-add-rejected",
                message,
                "调整输入后重试，或定位源码；当前输入与草稿仍保留",
            )
        })
}
#[tauri::command]
pub fn remove_yaml_sequence_item_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::remove_yaml_sequence_item_source(&content, start, end).map_err(
        |message| {
            TextDocumentError::recoverable(
                "yaml-sequence-remove-rejected",
                message,
                "定位源码后继续修改；当前草稿仍保留",
            )
        },
    )
}

#[tauri::command]
pub fn copy_yaml_sequence_item_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::copy_yaml_sequence_item_source(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "yaml-sequence-copy-rejected",
            message,
            "定位源码后继续修改；当前草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn move_yaml_sequence_item_source(
    content: String,
    start: usize,
    end: usize,
    direction: String,
) -> Result<YamlKeyChange, TextDocumentError> {
    crate::formats::yaml::move_yaml_sequence_item_source(&content, start, end, &direction).map_err(
        |message| {
            TextDocumentError::recoverable(
                "yaml-sequence-move-rejected",
                message,
                "定位源码后继续修改；当前草稿仍保留",
            )
        },
    )
}

#[tauri::command]
pub async fn write_yaml_source_document(
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
        "yaml".into(),
        content,
        expected_signature,
        Some(source_policy),
    )
    .await
}

#[tauri::command]
pub async fn write_external_yaml_source_document(
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
        "yaml".into(),
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
    fn invalid_yaml_is_blocked_before_registered_write() {
        let error = tauri::async_runtime::block_on(write_yaml_source_document(
            std::env::temp_dir().to_string_lossy().into_owned(),
            "invalid.yaml".into(),
            "root: [unterminated\n".into(),
            None,
            false,
        ))
        .unwrap_err();
        assert_eq!(error.code, "invalid-yaml-save-blocked");
        assert!(error.recoverable);
    }
}
