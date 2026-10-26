use crate::commands::formats::{
    write_external_registered_text_document, write_registered_text_document,
};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::formats::toml::{analyze_toml_source as analyze_source, TomlSourceAnalysis};
use crate::services::external_file_access::ExternalFileAccess;
use tauri::State;

fn validate_save(content: &str, allow_invalid: bool) -> Result<(), TextDocumentError> {
    let analysis = analyze_source(content);
    if analysis.valid || allow_invalid {
        return Ok(());
    }
    let location = analysis
        .diagnostics
        .first()
        .map(|item| format!("第 {} 行，第 {} 列", item.line, item.column))
        .unwrap_or_else(|| "未知位置".into());
    Err(TextDocumentError::recoverable(
        "invalid-toml-save-blocked",
        format!("TOML 源码存在语法错误（{location}），已阻止覆盖原文件"),
        "修复语法后保存，或明确选择“按源码保存”保留当前非法内容",
    ))
}

#[tauri::command]
pub fn analyze_toml_source(content: String) -> TomlSourceAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub fn inspect_toml_literal_source(content: String, start: usize, end: usize) -> Result<String, TextDocumentError> {
    crate::formats::toml::inspect_toml_literal_source(&content, start, end)
        .map_err(|message| TextDocumentError::simple("toml-literal-read-rejected", message))
}

#[tauri::command]
pub fn replace_toml_literal_source(content: String, start: usize, end: usize, replacement: String) -> Result<String, TextDocumentError> {
    crate::formats::toml::replace_toml_literal_source(&content, start, end, &replacement)
        .map_err(|message| TextDocumentError::simple("toml-literal-edit-rejected", message))
}

#[tauri::command]
pub fn replace_toml_value_source(
    content: String,
    start: usize,
    end: usize,
    replacement: String,
) -> Result<String, TextDocumentError> {
    crate::formats::toml::replace_toml_value_source(&content, start, end, &replacement)
        .map_err(|message| TextDocumentError::simple("toml-value-edit-rejected", message))
}

#[tauri::command]
pub fn rename_toml_key_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::rename_toml_key_source(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "toml-key-rename-rejected",
            message,
            "调整字段名后重试，或定位源码；当前输入和草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn copy_toml_field_source(
    content: String,
    start: usize,
    end: usize,
    name: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::copy_toml_field_source(&content, start, end, &name).map_err(|message| {
        TextDocumentError::recoverable(
            "toml-field-copy-rejected",
            message,
            "调整名称后重试，或定位源码；当前输入与草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn move_toml_field_source(
    content: String,
    start: usize,
    end: usize,
    direction: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::move_toml_field_source(&content, start, end, &direction).map_err(
        |message| {
            TextDocumentError::recoverable(
                "toml-field-move-rejected",
                message,
                "定位源码后继续修改；当前草稿仍保留",
            )
        },
    )
}

#[tauri::command]
pub fn add_toml_field_source(
    content: String,
    start: usize,
    end: usize,
    inside: bool,
    name: String,
    value: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::add_toml_field_source(&content, start, end, inside, &name, &value)
        .map_err(|message| {
            TextDocumentError::recoverable(
                "toml-field-add-rejected",
                message,
                "调整输入后重试，或定位源码；当前输入与草稿仍保留",
            )
        })
}

#[tauri::command]
pub fn remove_toml_field_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::remove_toml_field_source(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "toml-field-remove-rejected",
            message,
            "定位源码后继续修改；当前草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn inspect_toml_array_items_source(
    content: String,
    start: usize,
    end: usize,
) -> Result<Vec<crate::formats::toml::TomlArrayItem>, TextDocumentError> {
    crate::formats::toml::inspect_toml_array_items_source(&content, start, end).map_err(|message| {
        TextDocumentError::recoverable(
            "toml-array-inspection-rejected",
            message,
            "定位源码查看；当前草稿仍保留",
        )
    })
}
#[tauri::command]
pub fn add_toml_array_item_source(
    content: String,
    start: usize,
    end: usize,
    after_start: Option<usize>,
    after_end: Option<usize>,
    value: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::add_toml_array_item_source(
        &content,
        start,
        end,
        after_start,
        after_end,
        &value,
    )
    .map_err(|message| {
        TextDocumentError::recoverable(
            "toml-array-add-rejected",
            message,
            "调整输入后重试，或定位源码；当前输入与草稿仍保留",
        )
    })
}
#[tauri::command]
pub fn remove_toml_array_item_source(
    content: String,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::remove_toml_array_item_source(&content, start, end, item_start, item_end)
        .map_err(|message| {
            TextDocumentError::recoverable(
                "toml-array-remove-rejected",
                message,
                "定位源码后继续修改；当前草稿仍保留",
            )
        })
}

#[tauri::command]
pub fn copy_toml_array_item_source(
    content: String,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::copy_toml_array_item_source(&content, start, end, item_start, item_end)
        .map_err(|message| {
            TextDocumentError::recoverable(
                "toml-array-copy-rejected",
                message,
                "定位源码后继续修改；当前草稿仍保留",
            )
        })
}

#[tauri::command]
pub fn move_toml_array_item_source(
    content: String,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
    direction: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::move_toml_array_item_source(
        &content, start, end, item_start, item_end, &direction,
    )
    .map_err(|message| {
        TextDocumentError::recoverable(
            "toml-array-move-rejected",
            message,
            "定位源码后继续修改；当前草稿仍保留",
        )
    })
}

#[tauri::command]
pub fn replace_toml_array_item_source(
    content: String,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
    replacement: String,
) -> Result<crate::formats::toml::TomlKeyChange, TextDocumentError> {
    crate::formats::toml::replace_toml_array_item_source(
        &content,
        start,
        end,
        item_start,
        item_end,
        &replacement,
    )
    .map_err(|message| {
        TextDocumentError::recoverable(
            "toml-array-value-edit-rejected",
            message,
            "调整值后重试，或定位源码；当前输入与草稿仍保留",
        )
    })
}

#[tauri::command]
pub async fn write_toml_source_document(
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
        "toml".into(),
        content,
        expected_signature,
        Some(source_policy),
    )
    .await
}

#[tauri::command]
pub async fn write_external_toml_source_document(
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
        "toml".into(),
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
