use crate::formats::file_registry::file_format_for_path;
use crate::formats::odf::MAX_ODF_FILE_BYTES;
use crate::formats::odf_content::{parse_odf_content, OdfContentModel};
use crate::formats::odf_edit::{
    build_ods_cell_value_patch_isolated, inspect_ods_cell_edit_inventory, OdsCellEditInventory,
};
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::State;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfContentReadReport {
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub signature: String,
    pub read_only: bool,
    pub source_preserved: bool,
    pub edit_inventory: Option<OdsCellEditInventory>,
    pub model: OdfContentModel,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsSavedCopyReport {
    pub status: String,
    pub engine: String,
    pub target_path: String,
    pub target_signature: String,
    pub target_digest: String,
    pub source_signature: String,
    pub source_unchanged: bool,
    pub output_bytes: usize,
    pub changed_parts: Vec<String>,
    pub unchanged_parts_verified: bool,
    pub structural_reopen_verified: bool,
    pub semantic_reopen_verified: bool,
    pub save_mode: String,
}

fn read_odf_content_path(
    path: &Path,
    allow_library_edit: bool,
) -> Result<OdfContentReadReport, String> {
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
    let edit_inventory = if allow_library_edit && model.format == "ods" {
        Some(inspect_ods_cell_edit_inventory(&before)?)
    } else {
        None
    };
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
        read_only: edit_inventory
            .as_ref()
            .is_none_or(|inventory| inventory.status != "candidate"),
        source_preserved,
        edit_inventory,
        model,
    })
}

fn remove_created_ods_if_exact(path: &Path, expected: &[u8]) {
    if fs::read(path).is_ok_and(|bytes| bytes == expected) {
        let _ = fs::remove_file(path);
    }
}

fn validate_ods_copy_file_name(target_name: &str) -> Result<(), String> {
    let path = Path::new(target_name);
    if target_name.is_empty()
        || path.file_name().and_then(|name| name.to_str()) != Some(target_name)
    {
        return Err("ODS 副本必须使用源文件同目录中的单一文件名".into());
    }
    if !target_name.to_ascii_lowercase().ends_with(".ods") {
        return Err("ODS 副本文件名必须以 .ods 结尾".into());
    }
    Ok(())
}

fn save_ods_cell_value_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_source_signature: &str,
    target_id: &str,
    expected_value_digest: &str,
    replacement_value: &str,
) -> Result<OdsSavedCopyReport, String> {
    if source_path == target_path {
        return Err("ODS 可靠另存禁止覆盖源文件".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；ODS 可靠另存不会覆盖现有文件".into());
    }
    let source = fs::read(source_path).map_err(|error| format!("读取 ODS 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    if source_digest != expected_source_signature {
        return Err("ODS 已被外部修改，请重新打开后再保存副本".into());
    }
    let (patch, output) = build_ods_cell_value_patch_isolated(
        &source,
        target_id,
        expected_value_digest,
        replacement_value,
    )?;
    if !patch.unchanged_parts_verified
        || !patch.structural_reparse_verified
        || !patch.semantic_reparse_verified
        || !patch.source_unchanged
    {
        return Err("ODS 隔离补丁未通过部件保持与语义复读".into());
    }
    if fs::read(source_path).map_err(|error| format!("保存前复核 ODS 失败: {error}"))? != source
    {
        return Err("ODS 在隔离验证期间发生变化，请重新打开后再保存".into());
    }

    write_new_bytes(target_path, &output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(target_path)
            .map_err(|error| format!("目标已创建，但无法复读 ODS 副本: {error}"))?;
        let target_digest = format!("{:x}", Sha256::digest(&saved));
        if saved != output || target_digest != patch.output_digest {
            return Err("ODS 落盘字节与隔离验证输出不一致".into());
        }
        parse_odf_content(&saved, "ods")
            .map_err(|error| format!("ODS 副本结构复读失败: {error}"))?;
        let (replayed, replay_output) = build_ods_cell_value_patch_isolated(
            &source,
            target_id,
            expected_value_digest,
            replacement_value,
        )?;
        if replay_output != saved || !replayed.semantic_reparse_verified {
            return Err("ODS 副本语义复读结果与已验证补丁不一致".into());
        }
        let source_after =
            fs::read(source_path).map_err(|error| format!("另存后复核源 ODS 失败: {error}"))?;
        if source_after != source || format!("{:x}", Sha256::digest(&source_after)) != source_digest
        {
            return Err("源 ODS 在另存期间发生变化".into());
        }
        Ok((target_digest.clone(), target_digest))
    })();
    let (target_digest, target_signature) = match verification {
        Ok(result) => result,
        Err(error) => {
            remove_created_ods_if_exact(target_path, &output);
            return Err(format!("ODS 可靠另存验证失败，已清理未验收副本: {error}"));
        }
    };
    Ok(OdsSavedCopyReport {
        status: "saved_verified".into(),
        engine: patch.engine,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature,
        target_digest,
        source_signature: source_digest,
        source_unchanged: true,
        output_bytes: output.len(),
        changed_parts: patch.changed_parts,
        unchanged_parts_verified: true,
        structural_reopen_verified: true,
        semantic_reopen_verified: true,
        save_mode: "new_copy_only".into(),
    })
}

fn ensure_odf_content_format(path: &Path) -> Result<(), String> {
    let format = file_format_for_path(path)?;
    if !["ods", "odp"].contains(&format.id.as_str()) {
        return Err("外部 ODF 内容命令只接受已授权的 .ods 或 .odp 文件".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn read_odf_content_document(
    library_root: String,
    path: String,
) -> Result<OdfContentReadReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["ods", "odp"])?;
    tauri::async_runtime::spawn_blocking(move || read_odf_content_path(&document, true))
        .await
        .map_err(|error| format!("ODF 内容读取任务失败: {error}"))?
}

#[tauri::command]
pub async fn read_external_odf_content_document(
    access: State<'_, ExternalFileAccess>,
    path: String,
) -> Result<OdfContentReadReport, String> {
    let document = access.resolve_preview(path)?;
    ensure_odf_content_format(&document)?;
    tauri::async_runtime::spawn_blocking(move || read_odf_content_path(&document, false))
        .await
        .map_err(|error| format!("外部 ODF 内容读取任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_ods_cell_value_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_source_signature: String,
    target_id: String,
    expected_value_digest: String,
    replacement_value: String,
) -> Result<OdsSavedCopyReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["ods"])?;
    let target_name = target_file_name.trim();
    validate_ods_copy_file_name(target_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_name), &["ods"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_ods_cell_value_copy_to_path(
            &source_path,
            &target_path,
            &expected_source_signature,
            &target_id,
            &expected_value_digest,
            &replacement_value,
        )
    })
    .await
    .map_err(|error| format!("ODS 可靠另存任务失败: {error}"))?
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
            let report = read_odf_content_path(&path, false).unwrap();
            assert!(report.read_only);
            assert!(report.source_preserved);
            assert_eq!(before, fs::read(path).unwrap());
        }
    }

    #[test]
    fn external_format_gate_is_limited_to_ods_and_odp() {
        for name in ["document.ods", "slides.odp"] {
            assert!(ensure_odf_content_format(Path::new(name)).is_ok());
        }
        assert!(ensure_odf_content_format(Path::new("document.pdf")).is_err());
    }

    #[test]
    fn ods_copy_name_is_one_same_directory_file() {
        assert!(validate_ods_copy_file_name("LongEdit-copy.ods").is_ok());
        for invalid in ["", "copy.txt", "folder/copy.ods", "..\\copy.ods"] {
            assert!(validate_ods_copy_file_name(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn real_ods_copy_save_is_verified_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!(
            "longedit-m1cb-ods-save-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("source.ods");
        let target_path = root.join("copy.ods");
        fs::copy(fixture("longedit-e1c-spreadsheet.ods"), &source_path).unwrap();
        let source_before = fs::read(&source_path).unwrap();
        let report = read_odf_content_path(&source_path, true).unwrap();
        let target = report
            .edit_inventory
            .unwrap()
            .editable_cells
            .into_iter()
            .find(|cell| cell.address == "A1")
            .unwrap();
        let saved = save_ods_cell_value_copy_to_path(
            &source_path,
            &target_path,
            &report.signature,
            &target.id,
            &target.expected_value_digest,
            "LongEdit M1C-B saved copy",
        )
        .unwrap();
        assert_eq!(saved.status, "saved_verified");
        assert_eq!(saved.save_mode, "new_copy_only");
        assert!(saved.source_unchanged && saved.semantic_reopen_verified);
        assert_eq!(fs::read(&source_path).unwrap(), source_before);
        assert!(save_ods_cell_value_copy_to_path(
            &source_path,
            &target_path,
            &report.signature,
            &target.id,
            &target.expected_value_digest,
            "second attempt",
        )
        .unwrap_err()
        .contains("不会覆盖"));
        fs::remove_dir_all(root).unwrap();
    }
}
