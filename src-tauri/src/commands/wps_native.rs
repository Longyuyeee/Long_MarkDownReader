use crate::formats::file_registry::{file_format_for_path, UserCapabilityLevel};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use std::time::UNIX_EPOCH;
use zip::ZipArchive;

const WPS_NATIVE_EXTENSIONS: &[&str] = &["wps", "et", "dps"];
const COMPOUND_FILE_SIGNATURE: &[u8] = &[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WpsNativeInspection {
    pub path: String,
    pub format_id: String,
    pub format_label: String,
    pub extension: String,
    pub container_kind: String,
    pub size: u64,
    pub modified: u64,
    pub sha256: String,
    pub source_preserved: bool,
    pub read_only: bool,
}

fn inspect_container(extension: &str, bytes: &[u8]) -> Result<&'static str, String> {
    match extension {
        "wps" | "et" => {
            if !bytes.starts_with(b"PK\x03\x04") {
                return Err(format!(
                    "{} 文件头不是 WPS 生成的 ZIP/OOXML 包",
                    extension.to_ascii_uppercase()
                ));
            }
            let mut archive = ZipArchive::new(Cursor::new(bytes))
                .map_err(|error| format!("WPS 原生包无法解析: {error}"))?;
            let required_part = if extension == "wps" {
                "word/document.xml"
            } else {
                "xl/workbook.xml"
            };
            archive
                .by_name("[Content_Types].xml")
                .map_err(|_| "WPS 原生包缺少 [Content_Types].xml".to_string())?;
            archive
                .by_name(required_part)
                .map_err(|_| format!("WPS 原生包缺少 {required_part}"))?;
            Ok(if extension == "wps" {
                "WPS 文字 OOXML 包"
            } else {
                "WPS 表格 OOXML 包"
            })
        }
        "dps" => {
            if !bytes.starts_with(COMPOUND_FILE_SIGNATURE) {
                return Err("DPS 文件头不是 WPS 复合二进制演示文稿".into());
            }
            Ok("WPS 演示复合二进制")
        }
        _ => Err("文件不是已登记的 WPS 原生格式".into()),
    }
}

fn inspect_path(path: &Path) -> Result<WpsNativeInspection, String> {
    let format = file_format_for_path(path)?;
    if format.user_capability.level != UserCapabilityLevel::ExternalOpen {
        return Err("目标格式未登记为 WPS 外部打开能力".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !WPS_NATIVE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("文件不是已登记的 WPS 原生格式".into());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > format.max_bytes {
        return Err(format!(
            "{} 超过 {} 字节的识别上限",
            format.label, format.max_bytes
        ));
    }
    let bytes_before = fs::read(path).map_err(|error| error.to_string())?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes_before));
    let container_kind = inspect_container(&extension, &bytes_before)?.to_string();
    let bytes_after = fs::read(path).map_err(|error| error.to_string())?;
    let source_preserved = bytes_before == bytes_after;
    if !source_preserved {
        return Err("识别期间源文件发生变化，已停止使用该快照".into());
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();
    Ok(WpsNativeInspection {
        path: path.to_string_lossy().to_string(),
        format_id: format.id.clone(),
        format_label: format.label.clone(),
        extension: format!(".{extension}"),
        container_kind,
        size: metadata.len(),
        modified,
        sha256,
        source_preserved,
        read_only: true,
    })
}

#[tauri::command]
pub async fn inspect_wps_native_file(
    library_root: String,
    path: String,
) -> Result<WpsNativeInspection, String> {
    let path =
        WorkspaceGuard::new(library_root)?.resolve_existing_file(path, WPS_NATIVE_EXTENSIONS)?;
    inspect_path(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("wps-native")
            .join(name)
    }

    #[test]
    fn recognizes_real_wps_native_fixture_containers_without_writing() {
        for (name, expected_container) in [
            ("longedit-e3-document.wps", "WPS 文字 OOXML 包"),
            ("longedit-e3-spreadsheet.et", "WPS 表格 OOXML 包"),
            ("longedit-e3-presentation.dps", "WPS 演示复合二进制"),
        ] {
            let path = fixture(name);
            let before = fs::read(&path).unwrap();
            let report = inspect_path(&path).unwrap();
            assert_eq!(report.container_kind, expected_container);
            assert!(report.read_only);
            assert!(report.source_preserved);
            assert_eq!(before, fs::read(path).unwrap());
        }
    }

    #[test]
    fn rejects_extension_and_container_mismatch() {
        let bytes = fs::read(fixture("longedit-e3-presentation.dps")).unwrap();
        assert!(inspect_container("wps", &bytes)
            .unwrap_err()
            .contains("ZIP/OOXML"));
        let bytes = fs::read(fixture("longedit-e3-document.wps")).unwrap();
        assert!(inspect_container("dps", &bytes)
            .unwrap_err()
            .contains("复合二进制"));
    }
}
