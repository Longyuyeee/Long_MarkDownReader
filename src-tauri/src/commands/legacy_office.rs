use crate::commands::external_apps::discover_external_executable;
use crate::formats::docx::parse_docx;
use crate::formats::file_registry::file_format_for_path;
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_LEGACY_DOC_BYTES: u64 = 64 * 1024 * 1024;
const CONVERSION_TIMEOUT: Duration = Duration::from_secs(90);
const FIB_IDENT: u16 = 0xa5ec;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDocPreflight {
    pub path: String,
    pub format_id: String,
    pub size: u64,
    pub modified: u64,
    pub sha256: String,
    pub cfb_version: String,
    pub stream_count: usize,
    pub stream_names: Vec<String>,
    pub risk_codes: Vec<String>,
    pub warnings: Vec<String>,
    pub block_reasons: Vec<String>,
    pub conversion_eligible: bool,
    pub source_preserved: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDocConversionReceipt {
    pub source_path: String,
    pub target_path: String,
    pub converter: String,
    pub converter_version: Option<String>,
    pub source_sha256: String,
    pub target_sha256: String,
    pub source_preserved: bool,
    pub target_bytes: u64,
    pub block_count: usize,
    pub heading_count: usize,
    pub plain_text_characters: usize,
    pub warning_count: usize,
}

struct IsolatedConversionWorkspace {
    root: PathBuf,
}

impl IsolatedConversionWorkspace {
    fn create() -> Result<Self, String> {
        let root = std::env::temp_dir().join(format!(
            "longedit-e2b-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("input"))
            .and_then(|_| fs::create_dir_all(root.join("output")))
            .and_then(|_| fs::create_dir_all(root.join("profile")))
            .map_err(|error| format!("无法建立隔离转换目录: {error}"))?;
        Ok(Self { root })
    }
}

impl Drop for IsolatedConversionWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn contains_ascii_or_utf16(bytes: &[u8], value: &str) -> bool {
    let ascii = value.as_bytes();
    let utf16 = value
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    bytes.windows(ascii.len()).any(|window| window == ascii)
        || bytes.windows(utf16.len()).any(|window| window == utf16)
}

fn safe_entry_name(path: &Path) -> String {
    path.to_string_lossy()
        .chars()
        .map(|character| {
            if character.is_control() {
                '\u{fffd}'
            } else {
                character
            }
        })
        .collect()
}

fn preflight_bytes(path: &Path, bytes: &[u8], modified: u64) -> Result<LegacyDocPreflight, String> {
    if bytes.len() as u64 > MAX_LEGACY_DOC_BYTES {
        return Err(format!("DOC 超过 {} 字节的预检上限", MAX_LEGACY_DOC_BYTES));
    }
    let mut compound = cfb::CompoundFile::open(Cursor::new(bytes))
        .map_err(|error| format!("DOC 不是有效的 OLE 复合二进制文件: {error}"))?;
    let cfb_version = format!("{:?}", compound.version());
    let entries = compound
        .walk()
        .filter(|entry| !entry.is_root())
        .map(|entry| (entry.path().to_path_buf(), entry.is_stream(), entry.len()))
        .collect::<Vec<_>>();
    if entries.len() > 4096 {
        return Err("DOC 复合文件条目超过 4096 个资源预算".into());
    }
    if entries
        .iter()
        .filter(|(_, is_stream, _)| *is_stream)
        .map(|(_, _, len)| *len)
        .sum::<u64>()
        > 256 * 1024 * 1024
    {
        return Err("DOC 复合文件流累计大小超过 256 MiB 资源预算".into());
    }
    let word_document_path = entries
        .iter()
        .find(|(entry_path, is_stream, _)| {
            *is_stream
                && entry_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("WordDocument"))
        })
        .map(|(entry_path, _, _)| entry_path.clone())
        .ok_or_else(|| "OLE 文件缺少 MS-DOC WordDocument 流".to_string())?;
    let mut fib = [0u8; 32];
    let mut word_document = compound
        .open_stream(&word_document_path)
        .map_err(|error| format!("无法读取 WordDocument 流: {error}"))?;
    word_document
        .read_exact(&mut fib)
        .map_err(|error| format!("WordDocument FIB 头不完整: {error}"))?;
    if u16::from_le_bytes([fib[0], fib[1]]) != FIB_IDENT {
        return Err("WordDocument 流没有有效的 MS-DOC FIB 标识".into());
    }
    let flags = u16::from_le_bytes([fib[10], fib[11]]);
    let encrypted = flags & 0x0100 != 0 || flags & 0x8000 != 0;
    let lower_names = entries
        .iter()
        .map(|(entry_path, _, _)| safe_entry_name(entry_path).to_ascii_lowercase())
        .collect::<Vec<_>>();
    let has_vba = lower_names.iter().any(|name| {
        name.contains("/vba") || name.contains("_vba_project") || name.contains("/macros")
    });
    let has_ole_objects = lower_names
        .iter()
        .any(|name| name.contains("/objectpool") || name.contains("/ole"));
    let has_external_links = ["http://", "https://", "file://"]
        .iter()
        .any(|needle| contains_ascii_or_utf16(bytes, needle));

    let mut risk_codes = Vec::new();
    let mut warnings = vec!["legacy-converter-fidelity".to_string()];
    let mut block_reasons = Vec::new();
    if encrypted {
        risk_codes.push("encrypted-content".into());
        block_reasons.push("加密或混淆 DOC 不进入自动转换".into());
    }
    if has_vba {
        risk_codes.push("vba".into());
        block_reasons.push("含 VBA/宏流的 DOC 不进入自动转换".into());
    }
    if has_ole_objects {
        risk_codes.push("ole-object".into());
        block_reasons.push("含 OLE 嵌入对象的 DOC 不进入自动转换".into());
    }
    if has_external_links {
        risk_codes.push("external-link".into());
        warnings.push("external-link-not-followed".into());
    }
    if risk_codes.is_empty() {
        risk_codes.push("none-detected".into());
    }

    Ok(LegacyDocPreflight {
        path: path.to_string_lossy().into_owned(),
        format_id: "legacy-doc".into(),
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
        risk_codes,
        warnings,
        conversion_eligible: block_reasons.is_empty(),
        block_reasons,
        source_preserved: true,
    })
}

fn preflight_path(path: &Path) -> Result<LegacyDocPreflight, String> {
    let format = file_format_for_path(path)?;
    if format.id != "legacy-doc" {
        return Err("目标不是已登记的旧版 DOC 格式".into());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let before = fs::read(path).map_err(|error| format!("读取 DOC 失败: {error}"))?;
    let mut report = preflight_bytes(path, &before, modified)?;
    let after = fs::read(path).map_err(|error| format!("复核 DOC 失败: {error}"))?;
    report.source_preserved = before == after;
    if !report.source_preserved {
        return Err("DOC 在预检期间发生变化".into());
    }
    Ok(report)
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(child: &mut std::process::Child) {
    let _ = Command::new("taskkill.exe")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.kill();
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_tree(child: &mut std::process::Child) {
    let _ = child.kill();
}

fn run_with_timeout(command: &mut Command, timeout: Duration) -> Result<Output, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 LibreOffice 转换进程: {error}"))?;
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("无法读取 LibreOffice 进程状态: {error}"))?
            .is_some()
        {
            return child
                .wait_with_output()
                .map_err(|error| format!("无法读取 LibreOffice 转换结果: {error}"));
        }
        if started.elapsed() >= timeout {
            terminate_process_tree(&mut child);
            let _ = child.wait();
            return Err("LibreOffice 转换超过 90 秒，进程树已终止".into());
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn convert_path(
    source: &Path,
    target: &Path,
    expected_source_sha256: &str,
) -> Result<LegacyDocConversionReceipt, String> {
    if target.exists() {
        return Err("目标 DOCX 已存在；转换不会覆盖现有文件".into());
    }
    let preflight = preflight_path(source)?;
    if !preflight
        .sha256
        .eq_ignore_ascii_case(expected_source_sha256.trim())
    {
        return Err("DOC 源摘要已变化，请重新预检".into());
    }
    if !preflight.conversion_eligible {
        return Err(format!(
            "DOC 风险预检阻止转换: {}",
            preflight.block_reasons.join("；")
        ));
    }
    let (soffice, converter_version) = discover_external_executable("libreoffice", ".doc")?;
    let isolated = IsolatedConversionWorkspace::create()?;
    let isolated_source = isolated.root.join("input").join("source.doc");
    fs::copy(source, &isolated_source)
        .map_err(|error| format!("无法建立隔离 DOC 输入副本: {error}"))?;
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
            "docx:Office Open XML Text".into(),
            "--outdir".into(),
            output_dir.to_string_lossy().into_owned(),
            isolated_source.to_string_lossy().into_owned(),
        ]),
        CONVERSION_TIMEOUT,
    )?;
    if !output.status.success() {
        return Err(format!(
            "LibreOffice 转换失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let outputs = fs::read_dir(&output_dir)
        .map_err(|error| format!("无法读取隔离输出目录: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    let expected_output = output_dir.join("source.docx");
    if outputs.len() != 1 || outputs[0] != expected_output {
        return Err("LibreOffice 隔离输出不符合单一 DOCX 白名单".into());
    }
    let converted =
        fs::read(&expected_output).map_err(|error| format!("无法读取隔离 DOCX 输出: {error}"))?;
    let model =
        parse_docx(&converted).map_err(|error| format!("转换 DOCX 结构复读失败: {error}"))?;
    let source_before_commit =
        fs::read(source).map_err(|error| format!("提交前复核 DOC 失败: {error}"))?;
    if sha256(&source_before_commit) != preflight.sha256 {
        return Err("DOC 在转换期间发生变化，输出未提交".into());
    }
    write_new_bytes(target, &converted)?;
    let saved = fs::read(target).map_err(|error| format!("目标 DOCX 落盘复读失败: {error}"))?;
    if let Err(error) = parse_docx(&saved) {
        let _ = fs::remove_file(target);
        return Err(format!("目标 DOCX 落盘结构复读失败: {error}"));
    }
    let source_after = fs::read(source).map_err(|error| format!("提交后复核 DOC 失败: {error}"))?;
    let source_preserved = sha256(&source_after) == preflight.sha256;
    if !source_preserved {
        let _ = fs::remove_file(target);
        return Err("DOC 在目标提交后发生变化，已撤销转换副本".into());
    }
    Ok(LegacyDocConversionReceipt {
        source_path: source.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
        converter: "LibreOffice Writer".into(),
        converter_version,
        source_sha256: preflight.sha256,
        target_sha256: sha256(&saved),
        source_preserved,
        target_bytes: saved.len() as u64,
        block_count: model.blocks.len(),
        heading_count: model.headings.len(),
        plain_text_characters: model.plain_text.chars().count(),
        warning_count: model.warnings.len(),
    })
}

#[tauri::command]
pub async fn preflight_legacy_doc(
    library_root: String,
    path: String,
) -> Result<LegacyDocPreflight, String> {
    let source = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["doc"])?;
    tauri::async_runtime::spawn_blocking(move || preflight_path(&source))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn convert_legacy_doc_to_docx_copy(
    library_root: String,
    path: String,
    target_path: String,
    expected_source_sha256: String,
) -> Result<LegacyDocConversionReceipt, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = guard.resolve_existing_file(path, &["doc"])?;
    let target = guard.resolve_file_for_write(target_path, &["docx"])?;
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

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-doc")
            .join(name)
    }

    fn synthetic_doc(streams: &[&str], flags: u16) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut compound = cfb::CompoundFile::create(cursor).unwrap();
        let mut word = compound.create_stream("/WordDocument").unwrap();
        let mut fib = [0u8; 32];
        fib[0..2].copy_from_slice(&FIB_IDENT.to_le_bytes());
        fib[10..12].copy_from_slice(&flags.to_le_bytes());
        word.write_all(&fib).unwrap();
        drop(word);
        for path in streams {
            if let Some(parent) = Path::new(path).parent() {
                if parent != Path::new("/") {
                    compound.create_storage_all(parent).unwrap();
                }
            }
            compound.create_stream(path).unwrap();
        }
        compound.into_inner().into_inner()
    }

    #[test]
    fn preflights_real_word_doc_fixture_without_writing() {
        let path = fixture("longedit-e2b-word-document.doc");
        let before = fs::read(&path).unwrap();
        let report = preflight_path(&path).unwrap();
        assert!(report.conversion_eligible);
        assert!(report.source_preserved);
        assert!(report
            .stream_names
            .iter()
            .any(|name| name == "/WordDocument"));
        assert_eq!(before, fs::read(path).unwrap());
    }

    #[test]
    fn rereads_isolated_conversion_evidence_with_expected_text() {
        let bytes = fs::read(fixture("longedit-e2b-libreoffice-output.docx")).unwrap();
        let model = parse_docx(&bytes).unwrap();
        assert!(model
            .plain_text
            .contains("LongEdit E2B legacy DOC conversion fixture"));
        assert!(!model.blocks.is_empty());
    }

    #[test]
    #[ignore = "requires an installed LibreOffice desktop application"]
    fn converts_real_doc_through_the_product_isolation_path() {
        let source = fixture("longedit-e2b-word-document.doc");
        let source_before = fs::read(&source).unwrap();
        let target = std::env::temp_dir().join(format!(
            "longedit-e2b-product-audit-{}-{}.docx",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let receipt = convert_path(&source, &target, &sha256(&source_before)).unwrap();
        assert!(receipt.source_preserved);
        assert!(receipt.target_bytes > 0);
        assert_eq!(source_before, fs::read(&source).unwrap());
        let converted = fs::read(&target).unwrap();
        assert!(parse_docx(&converted)
            .unwrap()
            .plain_text
            .contains("LongEdit E2B legacy DOC conversion fixture"));
        fs::remove_file(target).unwrap();
    }

    #[test]
    fn blocks_encrypted_macro_and_ole_documents() {
        let encrypted = synthetic_doc(&[], 0x0100);
        let report = preflight_bytes(Path::new("encrypted.doc"), &encrypted, 0).unwrap();
        assert!(!report.conversion_eligible);
        assert!(report.risk_codes.contains(&"encrypted-content".into()));

        let active = synthetic_doc(&["/Macros/VBA/Module1", "/ObjectPool/Object1"], 0);
        let report = preflight_bytes(Path::new("active.doc"), &active, 0).unwrap();
        assert!(!report.conversion_eligible);
        assert!(report.risk_codes.contains(&"vba".into()));
        assert!(report.risk_codes.contains(&"ole-object".into()));
    }

    #[test]
    fn rejects_non_doc_cfb_and_malformed_input() {
        let cursor = Cursor::new(Vec::new());
        let compound = cfb::CompoundFile::create(cursor).unwrap();
        let bytes = compound.into_inner().into_inner();
        assert!(preflight_bytes(Path::new("other.doc"), &bytes, 0)
            .unwrap_err()
            .contains("WordDocument"));
        assert!(preflight_bytes(Path::new("broken.doc"), b"not-cfb", 0)
            .unwrap_err()
            .contains("复合二进制"));
    }
}
