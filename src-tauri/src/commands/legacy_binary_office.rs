use crate::commands::external_apps::discover_external_executable;
use crate::commands::legacy_office::{
    contains_ascii_or_utf16, run_with_timeout, safe_entry_name, sha256,
    IsolatedConversionWorkspace, CONVERSION_TIMEOUT,
};
use crate::formats::file_registry::file_format_for_path;
use crate::formats::pptx::parse_pptx;
use crate::formats::workbook_ooxml::validate_workbook_package;
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::process::Command;
use std::time::UNIX_EPOCH;

const MAX_CFB_ENTRIES: usize = 4096;
const MAX_CFB_STREAM_BYTES: u64 = 384 * 1024 * 1024;
const MAX_LEGACY_XLS_BYTES: u64 = 128 * 1024 * 1024;
const MAX_LEGACY_PPT_BYTES: u64 = 96 * 1024 * 1024;
const BIFF_BOF: u16 = 0x0809;
const BIFF_FILEPASS: u16 = 0x002f;
const BIFF_FORMULA: u16 = 0x0006;
const BIFF_BOUNDSHEET8: u16 = 0x0085;
const BIFF_SUPBOOK: u16 = 0x01ae;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LegacyBinaryKind {
    Xls,
    Ppt,
}

impl LegacyBinaryKind {
    fn from_format_id(format_id: &str) -> Result<Self, String> {
        match format_id {
            "legacy-xls" => Ok(Self::Xls),
            "legacy-ppt" => Ok(Self::Ppt),
            _ => Err("目标不是已登记的旧版 XLS 或 PPT 格式".into()),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Xls => "XLS",
            Self::Ppt => "PPT",
        }
    }

    fn source_extension(self) -> &'static str {
        match self {
            Self::Xls => "xls",
            Self::Ppt => "ppt",
        }
    }

    fn target_extension(self) -> &'static str {
        match self {
            Self::Xls => "xlsx",
            Self::Ppt => "pptx",
        }
    }

    fn format_id(self) -> &'static str {
        match self {
            Self::Xls => "legacy-xls",
            Self::Ppt => "legacy-ppt",
        }
    }

    fn target_format_id(self) -> &'static str {
        match self {
            Self::Xls => "workbook",
            Self::Ppt => "pptx",
        }
    }

    fn max_bytes(self) -> u64 {
        match self {
            Self::Xls => MAX_LEGACY_XLS_BYTES,
            Self::Ppt => MAX_LEGACY_PPT_BYTES,
        }
    }

    fn converter_filter(self) -> &'static str {
        match self {
            Self::Xls => "xlsx:Calc MS Excel 2007 XML",
            Self::Ppt => "pptx:Impress MS PowerPoint 2007 XML",
        }
    }

    fn converter_label(self) -> &'static str {
        match self {
            Self::Xls => "LibreOffice Calc",
            Self::Ppt => "LibreOffice Impress",
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyBinaryPreflight {
    pub path: String,
    pub format_id: String,
    pub format_label: String,
    pub target_extension: String,
    pub size: u64,
    pub modified: u64,
    pub sha256: String,
    pub cfb_version: String,
    pub stream_count: usize,
    pub stream_names: Vec<String>,
    pub item_count: usize,
    pub formula_count: usize,
    pub risk_codes: Vec<String>,
    pub warnings: Vec<String>,
    pub block_reasons: Vec<String>,
    pub conversion_eligible: bool,
    pub source_preserved: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyBinaryConversionReceipt {
    pub source_path: String,
    pub target_path: String,
    pub source_format_id: String,
    pub target_format_id: String,
    pub converter: String,
    pub converter_version: Option<String>,
    pub source_sha256: String,
    pub target_sha256: String,
    pub source_preserved: bool,
    pub target_bytes: u64,
    pub item_count: usize,
    pub warning_count: usize,
}

#[derive(Default)]
struct FormatSignals {
    item_count: usize,
    formula_count: usize,
    encrypted: bool,
    external_links: bool,
}

fn entry_file_name_matches(path: &Path, expected: &[&str]) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            expected
                .iter()
                .any(|candidate| value.eq_ignore_ascii_case(candidate))
        })
}

fn read_compound_stream(
    compound: &mut cfb::CompoundFile<Cursor<&[u8]>>,
    path: &Path,
) -> Result<Vec<u8>, String> {
    let mut stream = compound
        .open_stream(path)
        .map_err(|error| format!("无法读取复合文件流 {}: {error}", safe_entry_name(path)))?;
    let mut bytes = Vec::new();
    stream
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取复合文件流 {} 失败: {error}", safe_entry_name(path)))?;
    Ok(bytes)
}

fn inspect_biff_workbook(stream: &[u8]) -> Result<FormatSignals, String> {
    if stream.len() < 8 {
        return Err("Workbook BIFF 流头不完整".into());
    }
    let mut offset = 0usize;
    let mut record_count = 0usize;
    let mut signals = FormatSignals::default();
    while offset + 4 <= stream.len() {
        let record_type = u16::from_le_bytes([stream[offset], stream[offset + 1]]);
        let record_len = u16::from_le_bytes([stream[offset + 2], stream[offset + 3]]) as usize;
        if record_count == 0 && record_type != BIFF_BOF {
            return Err("Workbook 流没有有效的 BIFF BOF 记录".into());
        }
        let next = offset
            .checked_add(4)
            .and_then(|value| value.checked_add(record_len))
            .ok_or_else(|| "Workbook BIFF 记录长度溢出".to_string())?;
        if next > stream.len() {
            return Err("Workbook BIFF 记录越过流边界".into());
        }
        match record_type {
            BIFF_FILEPASS => signals.encrypted = true,
            BIFF_FORMULA => signals.formula_count += 1,
            BIFF_BOUNDSHEET8 => signals.item_count += 1,
            BIFF_SUPBOOK => signals.external_links = true,
            _ => {}
        }
        record_count += 1;
        if record_count > 1_000_000 {
            return Err("Workbook BIFF 记录超过资源预算".into());
        }
        offset = next;
    }
    if record_count == 0 || offset != stream.len() {
        return Err("Workbook BIFF 记录流不完整".into());
    }
    Ok(signals)
}

fn inspect_powerpoint_stream(stream: &[u8]) -> Result<FormatSignals, String> {
    if stream.len() < 8 {
        return Err("PowerPoint Document 记录流头不完整".into());
    }
    let record_type = u16::from_le_bytes([stream[2], stream[3]]);
    let record_len = u32::from_le_bytes([stream[4], stream[5], stream[6], stream[7]]) as usize;
    if record_type == 0 || record_len > stream.len().saturating_sub(8) {
        return Err("PowerPoint Document 首记录无效或越界".into());
    }
    Ok(FormatSignals {
        item_count: 0,
        ..FormatSignals::default()
    })
}

fn preflight_bytes(
    path: &Path,
    kind: LegacyBinaryKind,
    bytes: &[u8],
    modified: u64,
) -> Result<LegacyBinaryPreflight, String> {
    if bytes.len() as u64 > kind.max_bytes() {
        return Err(format!(
            "{} 超过 {} 字节的预检上限",
            kind.label(),
            kind.max_bytes()
        ));
    }
    let mut compound = cfb::CompoundFile::open(Cursor::new(bytes))
        .map_err(|error| format!("{} 不是有效的 OLE 复合二进制文件: {error}", kind.label()))?;
    let cfb_version = format!("{:?}", compound.version());
    let entries = compound
        .walk()
        .filter(|entry| !entry.is_root())
        .map(|entry| (entry.path().to_path_buf(), entry.is_stream(), entry.len()))
        .collect::<Vec<_>>();
    if entries.len() > MAX_CFB_ENTRIES {
        return Err(format!("{} 复合文件条目超过资源预算", kind.label()));
    }
    if entries
        .iter()
        .filter(|(_, is_stream, _)| *is_stream)
        .map(|(_, _, len)| *len)
        .sum::<u64>()
        > MAX_CFB_STREAM_BYTES
    {
        return Err(format!("{} 复合文件流累计大小超过资源预算", kind.label()));
    }

    let identity_names: &[&str] = match kind {
        LegacyBinaryKind::Xls => &["Workbook", "Book"],
        LegacyBinaryKind::Ppt => &["PowerPoint Document"],
    };
    let identity_path = entries
        .iter()
        .find(|(entry_path, is_stream, _)| {
            *is_stream && entry_file_name_matches(entry_path, identity_names)
        })
        .map(|(entry_path, _, _)| entry_path.clone())
        .ok_or_else(|| {
            format!(
                "{} 文件缺少 {} 身份流",
                kind.label(),
                identity_names.join("/")
            )
        })?;
    let identity_stream = read_compound_stream(&mut compound, &identity_path)?;
    let mut signals = match kind {
        LegacyBinaryKind::Xls => inspect_biff_workbook(&identity_stream)?,
        LegacyBinaryKind::Ppt => inspect_powerpoint_stream(&identity_stream)?,
    };

    let lower_names = entries
        .iter()
        .map(|(entry_path, _, _)| safe_entry_name(entry_path).to_ascii_lowercase())
        .collect::<Vec<_>>();
    signals.encrypted |= lower_names.iter().any(|name| {
        name.contains("encryptedsummary")
            || name.contains("encryptioninfo")
            || name.contains("encryptedpackage")
            || name.contains("/dataspaces")
    });
    let has_vba = lower_names.iter().any(|name| {
        name.contains("/vba") || name.contains("_vba_project") || name.contains("/macros")
    });
    let has_ole_objects = lower_names
        .iter()
        .any(|name| name.contains("/objectpool") || name.contains("/ole"));
    signals.external_links |= [
        "http://", "https://", "file://", "HTTP://", "HTTPS://", "FILE://",
    ]
    .iter()
    .any(|needle| contains_ascii_or_utf16(bytes, needle));
    let has_media = kind == LegacyBinaryKind::Ppt
        && lower_names
            .iter()
            .any(|name| name.ends_with("/pictures") || name.contains("/sound"));

    let mut risk_codes = Vec::new();
    let mut warnings = vec!["legacy-converter-fidelity".to_string()];
    let mut block_reasons = Vec::new();
    if signals.encrypted {
        risk_codes.push("encrypted-content".into());
        block_reasons.push(format!("加密 {} 不进入自动转换", kind.label()));
    }
    if has_vba {
        risk_codes.push("vba".into());
        block_reasons.push(format!("含 VBA/宏流的 {} 不进入自动转换", kind.label()));
    }
    if has_ole_objects {
        risk_codes.push("ole-object".into());
        block_reasons.push(format!("含 OLE 嵌入对象的 {} 不进入自动转换", kind.label()));
    }
    if signals.external_links {
        risk_codes.push("external-link".into());
        warnings.push("external-link-not-followed".into());
    }
    if signals.formula_count > 0 {
        risk_codes.push("formula".into());
        warnings.push("formula-result-fidelity".into());
    }
    if has_media {
        risk_codes.push("media".into());
        warnings.push("media-fidelity".into());
    }
    if risk_codes.is_empty() {
        risk_codes.push("none-detected".into());
    }

    Ok(LegacyBinaryPreflight {
        path: path.to_string_lossy().into_owned(),
        format_id: kind.format_id().into(),
        format_label: kind.label().into(),
        target_extension: format!(".{}", kind.target_extension()),
        size: bytes.len() as u64,
        modified,
        sha256: sha256(bytes),
        cfb_version,
        stream_count: entries
            .iter()
            .filter(|(_, is_stream, _)| *is_stream)
            .count(),
        stream_names: entries
            .iter()
            .filter(|(_, is_stream, _)| *is_stream)
            .take(64)
            .map(|(entry_path, _, _)| safe_entry_name(entry_path))
            .collect(),
        item_count: signals.item_count,
        formula_count: signals.formula_count,
        risk_codes,
        warnings,
        conversion_eligible: block_reasons.is_empty(),
        block_reasons,
        source_preserved: true,
    })
}

fn preflight_path(path: &Path) -> Result<(LegacyBinaryKind, LegacyBinaryPreflight), String> {
    let format = file_format_for_path(path)?;
    let kind = LegacyBinaryKind::from_format_id(&format.id)?;
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let before = fs::read(path).map_err(|error| format!("读取 {} 失败: {error}", kind.label()))?;
    let mut report = preflight_bytes(path, kind, &before, modified)?;
    let after = fs::read(path).map_err(|error| format!("复核 {} 失败: {error}", kind.label()))?;
    report.source_preserved = before == after;
    if !report.source_preserved {
        return Err(format!("{} 在预检期间发生变化", kind.label()));
    }
    Ok((kind, report))
}

fn validate_modern_output(kind: LegacyBinaryKind, converted: &[u8]) -> Result<usize, String> {
    match kind {
        LegacyBinaryKind::Xls => {
            validate_workbook_package(converted)
                .map_err(|error| format!("转换 XLSX 结构复读失败: {error}"))?;
            Ok(0)
        }
        LegacyBinaryKind::Ppt => parse_pptx(converted)
            .map(|model| model.slides.len())
            .map_err(|error| format!("转换 PPTX 结构复读失败: {error}")),
    }
}

fn convert_path(
    source: &Path,
    target: &Path,
    expected_source_sha256: &str,
) -> Result<LegacyBinaryConversionReceipt, String> {
    if target.exists() {
        return Err("目标现代 Office 文件已存在；转换不会覆盖现有文件".into());
    }
    let (kind, preflight) = preflight_path(source)?;
    if !preflight
        .sha256
        .eq_ignore_ascii_case(expected_source_sha256.trim())
    {
        return Err(format!("{} 源摘要已变化，请重新预检", kind.label()));
    }
    if !preflight.conversion_eligible {
        return Err(format!(
            "{} 风险预检阻止转换: {}",
            kind.label(),
            preflight.block_reasons.join("；")
        ));
    }
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case(kind.target_extension()))
    {
        return Err(format!(
            "{} 转换目标必须使用 .{}",
            kind.label(),
            kind.target_extension()
        ));
    }

    let (soffice, converter_version) =
        discover_external_executable("libreoffice", &format!(".{}", kind.source_extension()))?;
    let isolated = IsolatedConversionWorkspace::create()?;
    let isolated_source = isolated
        .root
        .join("input")
        .join(format!("source.{}", kind.source_extension()));
    fs::copy(source, &isolated_source)
        .map_err(|error| format!("无法建立隔离 {} 输入副本: {error}", kind.label()))?;
    let output_dir = isolated.root.join("output");
    let profile_url = tauri::Url::from_directory_path(isolated.root.join("profile"))
        .map_err(|_| "无法建立 LibreOffice 隔离配置 URL".to_string())?;
    let output = run_with_timeout(
        Command::new(&soffice).args([
            format!("-env:UserInstallation={profile_url}"),
            "--headless".into(),
            "--nologo".into(),
            "--nodefault".into(),
            "--nofirststartwizard".into(),
            "--norestore".into(),
            "--convert-to".into(),
            kind.converter_filter().into(),
            "--outdir".into(),
            output_dir.to_string_lossy().into_owned(),
            isolated_source.to_string_lossy().into_owned(),
        ]),
        CONVERSION_TIMEOUT,
    )?;
    if !output.status.success() {
        return Err(format!(
            "LibreOffice {} 转换失败: {}",
            kind.label(),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let outputs = fs::read_dir(&output_dir)
        .map_err(|error| format!("无法读取隔离输出目录: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    let expected_output = output_dir.join(format!("source.{}", kind.target_extension()));
    if outputs.len() != 1 || outputs[0] != expected_output {
        return Err(format!(
            "LibreOffice 隔离输出不符合单一 .{} 白名单",
            kind.target_extension()
        ));
    }
    let converted =
        fs::read(&expected_output).map_err(|error| format!("无法读取隔离转换输出: {error}"))?;
    let item_count = validate_modern_output(kind, &converted)?;
    let source_before_commit =
        fs::read(source).map_err(|error| format!("提交前复核源文件失败: {error}"))?;
    if sha256(&source_before_commit) != preflight.sha256 {
        return Err(format!("{} 在转换期间发生变化，输出未提交", kind.label()));
    }
    write_new_bytes(target, &converted)?;
    let saved = fs::read(target).map_err(|error| format!("目标文件落盘复读失败: {error}"))?;
    if let Err(error) = validate_modern_output(kind, &saved) {
        let _ = fs::remove_file(target);
        return Err(format!("目标文件落盘结构复读失败: {error}"));
    }
    let source_after =
        fs::read(source).map_err(|error| format!("提交后复核源文件失败: {error}"))?;
    let source_preserved = sha256(&source_after) == preflight.sha256;
    if !source_preserved {
        let _ = fs::remove_file(target);
        return Err(format!(
            "{} 在目标提交后发生变化，已撤销转换副本",
            kind.label()
        ));
    }
    Ok(LegacyBinaryConversionReceipt {
        source_path: source.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
        source_format_id: kind.format_id().into(),
        target_format_id: kind.target_format_id().into(),
        converter: kind.converter_label().into(),
        converter_version,
        source_sha256: preflight.sha256,
        target_sha256: sha256(&saved),
        source_preserved,
        target_bytes: saved.len() as u64,
        item_count,
        warning_count: preflight.warnings.len(),
    })
}

#[tauri::command]
pub async fn preflight_legacy_binary_office(
    library_root: String,
    path: String,
) -> Result<LegacyBinaryPreflight, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = guard.resolve_existing_file(path, &["xls", "ppt"])?;
    tauri::async_runtime::spawn_blocking(move || preflight_path(&source).map(|(_, report)| report))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn convert_legacy_binary_office_to_modern_copy(
    library_root: String,
    path: String,
    target_path: String,
    expected_source_sha256: String,
) -> Result<LegacyBinaryConversionReceipt, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = guard.resolve_existing_file(path, &["xls", "ppt"])?;
    let format = file_format_for_path(&source)?;
    let kind = LegacyBinaryKind::from_format_id(&format.id)?;
    let target = guard.resolve_file_for_write(target_path, &[kind.target_extension()])?;
    tauri::async_runtime::spawn_blocking(move || {
        convert_path(&source, &target, &expected_source_sha256)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-binary-office")
            .join(name)
    }

    fn synthetic_cfb(stream_name: &str, stream_bytes: &[u8], extra_streams: &[&str]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut compound = cfb::CompoundFile::create(cursor).unwrap();
        let mut identity = compound.create_stream(stream_name).unwrap();
        identity.write_all(stream_bytes).unwrap();
        drop(identity);
        for path in extra_streams {
            if let Some(parent) = Path::new(path).parent() {
                if parent != Path::new("/") {
                    compound.create_storage_all(parent).unwrap();
                }
            }
            compound.create_stream(path).unwrap();
        }
        compound.into_inner().into_inner()
    }

    fn biff(records: &[(u16, &[u8])]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for (record_type, payload) in records {
            bytes.extend_from_slice(&record_type.to_le_bytes());
            bytes.extend_from_slice(&(payload.len() as u16).to_le_bytes());
            bytes.extend_from_slice(payload);
        }
        bytes
    }

    #[test]
    fn preflights_real_xls_and_ppt_fixtures_without_writing() {
        for (name, kind, identity) in [
            (
                "longedit-e2c-spreadsheet.xls",
                LegacyBinaryKind::Xls,
                "/Workbook",
            ),
            (
                "longedit-e2c-presentation.ppt",
                LegacyBinaryKind::Ppt,
                "/PowerPoint Document",
            ),
        ] {
            let path = fixture(name);
            let before = fs::read(&path).unwrap();
            let report = preflight_bytes(&path, kind, &before, 0).unwrap();
            assert!(report.conversion_eligible);
            assert!(report.stream_names.iter().any(|name| name == identity));
            assert_eq!(before, fs::read(path).unwrap());
        }
    }

    #[test]
    fn detects_biff_formula_external_link_and_encryption_records() {
        let stream = biff(&[
            (BIFF_BOF, &[0x00, 0x06, 0x10, 0x00]),
            (BIFF_BOUNDSHEET8, &[]),
            (BIFF_FORMULA, &[]),
            (BIFF_SUPBOOK, &[]),
            (BIFF_FILEPASS, &[]),
        ]);
        let bytes = synthetic_cfb("/Workbook", &stream, &[]);
        let report =
            preflight_bytes(Path::new("risk.xls"), LegacyBinaryKind::Xls, &bytes, 0).unwrap();
        assert!(!report.conversion_eligible);
        assert_eq!(report.item_count, 1);
        assert_eq!(report.formula_count, 1);
        assert!(report.risk_codes.contains(&"encrypted-content".into()));
        assert!(report.risk_codes.contains(&"formula".into()));
        assert!(report.risk_codes.contains(&"external-link".into()));
    }

    #[test]
    fn blocks_macro_ole_and_encrypted_presentation_containers() {
        let ppt_record = [0x0f, 0x00, 0xe8, 0x03, 0x00, 0x00, 0x00, 0x00];
        let bytes = synthetic_cfb(
            "/PowerPoint Document",
            &ppt_record,
            &[
                "/Macros/VBA/Module1",
                "/ObjectPool/Object1",
                "/EncryptedSummary",
            ],
        );
        let report =
            preflight_bytes(Path::new("risk.ppt"), LegacyBinaryKind::Ppt, &bytes, 0).unwrap();
        assert!(!report.conversion_eligible);
        assert!(report.risk_codes.contains(&"encrypted-content".into()));
        assert!(report.risk_codes.contains(&"vba".into()));
        assert!(report.risk_codes.contains(&"ole-object".into()));
    }

    #[test]
    fn rejects_cross_format_and_malformed_identity_streams() {
        let stream = biff(&[(BIFF_BOF, &[0x00, 0x06, 0x10, 0x00])]);
        let xls = synthetic_cfb("/Workbook", &stream, &[]);
        assert!(
            preflight_bytes(Path::new("wrong.ppt"), LegacyBinaryKind::Ppt, &xls, 0)
                .unwrap_err()
                .contains("PowerPoint Document")
        );
        let bad_biff = synthetic_cfb("/Workbook", b"not-biff", &[]);
        assert!(
            preflight_bytes(Path::new("broken.xls"), LegacyBinaryKind::Xls, &bad_biff, 0)
                .unwrap_err()
                .contains("BIFF")
        );
    }

    #[test]
    fn rereads_conversion_evidence_with_existing_modern_validators() {
        let xlsx = fs::read(fixture("longedit-e2c-spreadsheet-output.xlsx")).unwrap();
        validate_workbook_package(&xlsx).unwrap();
        let pptx = fs::read(fixture("longedit-e2c-presentation-output.pptx")).unwrap();
        let presentation = parse_pptx(&pptx).unwrap();
        assert!(!presentation.slides.is_empty());
    }

    #[test]
    #[ignore = "requires an installed LibreOffice desktop application"]
    fn converts_real_xls_and_ppt_through_the_product_isolation_path() {
        for (source_name, target_extension) in [
            ("longedit-e2c-spreadsheet.xls", "xlsx"),
            ("longedit-e2c-presentation.ppt", "pptx"),
        ] {
            let source = fixture(source_name);
            let before = fs::read(&source).unwrap();
            let target = std::env::temp_dir().join(format!(
                "longedit-e2c-product-audit-{}-{}.{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                target_extension
            ));
            let receipt = convert_path(&source, &target, &sha256(&before)).unwrap();
            assert!(receipt.source_preserved);
            assert!(receipt.target_bytes > 0);
            assert_eq!(before, fs::read(&source).unwrap());
            fs::remove_file(target).unwrap();
        }
    }
}
