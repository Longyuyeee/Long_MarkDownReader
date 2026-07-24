use crate::commands::formats::write_registered_text_document;
use crate::formats::json::{analyze_json_source as analyze_source, JsonSourceAnalysis};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};

#[tauri::command]
pub fn analyze_json_source(content: String, jsonc: bool) -> JsonSourceAnalysis {
    analyze_source(&content, jsonc)
}

#[tauri::command]
pub async fn write_json_source_document(
    library_root: String,
    path: String,
    format_id: String,
    content: String,
    expected_signature: Option<String>,
    allow_invalid: bool,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let jsonc = match format_id.as_str() {
        "json" => false,
        "jsonc" => true,
        _ => {
            return Err(TextDocumentError::simple(
                "json-format-required",
                "JSON 源码保存只接受已注册的 JSON 或 JSONC 格式",
            ));
        }
    };
    let analysis = analyze_source(&content, jsonc);
    if !analysis.valid && !allow_invalid {
        let location = analysis
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.severity == "error")
            .map(|diagnostic| format!("第 {} 行，第 {} 列", diagnostic.line, diagnostic.column))
            .unwrap_or_else(|| "未知位置".into());
        return Err(TextDocumentError::recoverable(
            "invalid-json-save-blocked",
            format!("JSON 源码存在语法错误（{location}），已阻止覆盖原文件"),
            "修复语法后保存，或明确选择“按源码保存”保留当前非法内容",
        ));
    }

    write_registered_text_document(
        library_root,
        path,
        format_id,
        content,
        expected_signature,
        None,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::text::read_text_snapshot;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestWorkspace {
        root: PathBuf,
    }

    impl TestWorkspace {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "longedit-json-{label}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).unwrap();
            Self { root }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn blocks_invalid_json_without_touching_the_last_valid_file() {
        let workspace = TestWorkspace::new("invalid");
        let path = workspace.root.join("config.json");
        fs::write(&path, "{\"stable\": true}\n").unwrap();
        let snapshot = read_text_snapshot(&path).unwrap();

        let error = tauri::async_runtime::block_on(write_json_source_document(
            workspace.root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "json".into(),
            "{\"broken\":".into(),
            Some(snapshot.signature),
            false,
        ))
        .unwrap_err();

        assert_eq!(error.code, "invalid-json-save-blocked");
        assert_eq!(fs::read_to_string(path).unwrap(), "{\"stable\": true}\n");
    }

    #[test]
    fn explicitly_allows_invalid_source_but_still_uses_reliable_text_writes() {
        let workspace = TestWorkspace::new("explicit-source");
        let path = workspace.root.join("config.json");
        fs::write(&path, "{}\n").unwrap();
        let snapshot = read_text_snapshot(&path).unwrap();

        let saved = tauri::async_runtime::block_on(write_json_source_document(
            workspace.root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "json".into(),
            "{\n".into(),
            Some(snapshot.signature),
            true,
        ))
        .unwrap();

        assert_eq!(saved.content, "{\n");
        assert_eq!(fs::read_to_string(path).unwrap(), "{\n");
    }

    #[test]
    fn preserves_jsonc_comments_and_rejects_stale_signatures() {
        let workspace = TestWorkspace::new("stale-jsonc");
        let path = workspace.root.join("settings.jsonc");
        fs::write(&path, "{\n  // old\n  \"value\": 1,\n}\n").unwrap();
        let snapshot = read_text_snapshot(&path).unwrap();
        fs::write(&path, "{\n  // external\n  \"value\": 2,\n}\n").unwrap();

        let error = tauri::async_runtime::block_on(write_json_source_document(
            workspace.root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "jsonc".into(),
            "{\n  // retained\n  \"value\": 3,\n}\n".into(),
            Some(snapshot.signature),
            false,
        ))
        .unwrap_err();

        assert_eq!(error.code, "external-modified");
        assert!(fs::read_to_string(path).unwrap().contains("// external"));
    }

    #[test]
    fn generic_text_writer_cannot_bypass_json_validation() {
        let workspace = TestWorkspace::new("generic-bypass");
        let path = workspace.root.join("config.json");
        fs::write(&path, "{}\n").unwrap();
        let snapshot = read_text_snapshot(&path).unwrap();

        let error = tauri::async_runtime::block_on(crate::commands::formats::write_text_document(
            workspace.root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "json".into(),
            "{".into(),
            Some(snapshot.signature),
            None,
        ))
        .unwrap_err();

        assert_eq!(error.code, "specialized-writer-required");
        assert_eq!(fs::read_to_string(path).unwrap(), "{}\n");
    }
}
