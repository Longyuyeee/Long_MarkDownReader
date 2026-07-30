use crate::formats::odf::MAX_ODF_FILE_BYTES;
use crate::formats::odf_content::{parse_odf_content, OdfContentModel};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfContentReadReport {
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub signature: String,
    pub read_only: bool,
    pub source_preserved: bool,
    pub model: OdfContentModel,
}

fn read_odf_content_path(path: &Path) -> Result<OdfContentReadReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 ODF 元数据失败: {error}"))?;
    if metadata.len() > MAX_ODF_FILE_BYTES {
        return Err("ODF 文件超过 64 MiB 读取上限".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "ODF 文件缺少扩展名".to_string())?;
    let before = fs::read(path).map_err(|error| format!("读取 ODF 失败: {error}"))?;
    let model = parse_odf_content(&before, extension)?;
    let after = fs::read(path).map_err(|error| format!("复核 ODF 源文件失败: {error}"))?;
    let source_preserved = before == after;
    if !source_preserved {
        return Err("ODF 文件在只读预览期间发生变化".into());
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs());
    Ok(OdfContentReadReport {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified,
        signature: format!("{:x}", Sha256::digest(&before)),
        read_only: true,
        source_preserved,
        model,
    })
}

#[tauri::command]
pub async fn read_odf_content_document(
    library_root: String,
    path: String,
) -> Result<OdfContentReadReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["ods", "odp"])?;
    tauri::async_runtime::spawn_blocking(move || read_odf_content_path(&document))
        .await
        .map_err(|error| format!("ODF 内容读取任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("odf-content")
            .join(name)
    }

    #[test]
    fn reads_real_sources_without_mutation() {
        for name in [
            "longedit-e1c-spreadsheet.ods",
            "longedit-e1c-presentation.odp",
        ] {
            let path = fixture(name);
            let before = fs::read(&path).unwrap();
            let report = read_odf_content_path(&path).unwrap();
            assert!(report.read_only);
            assert!(report.source_preserved);
            assert_eq!(before, fs::read(path).unwrap());
        }
    }
}
