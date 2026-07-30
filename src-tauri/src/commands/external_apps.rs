use crate::formats::file_registry::file_format_for_path;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppExecutable {
    pub role: String,
    pub path: String,
    pub discovery_source: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalApplicationCapability {
    pub id: String,
    pub label: String,
    pub available: bool,
    pub version: Option<String>,
    pub executables: Vec<ExternalAppExecutable>,
    pub supported_extensions: Vec<String>,
    pub diagnostic: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalOpenReceipt {
    pub format_id: String,
    pub application_id: String,
    pub application_label: String,
    pub executable_path: Option<String>,
    pub source_bytes: u64,
    pub source_sha256_before: String,
    pub source_sha256_after_handoff: String,
    pub source_preserved_at_handoff: bool,
    pub launched_at_unix_ms: u128,
}

#[derive(Clone, Copy)]
struct ExecutableSpec {
    role: &'static str,
    file_name: &'static str,
    accepted_file_names: &'static [&'static str],
    supported_extensions: &'static [&'static str],
}

#[derive(Clone, Copy)]
struct ApplicationSpec {
    id: &'static str,
    label: &'static str,
    executables: &'static [ExecutableSpec],
}

const OFFICE_EXECUTABLES: &[ExecutableSpec] = &[
    ExecutableSpec {
        role: "document",
        file_name: "WINWORD.EXE",
        accepted_file_names: &["WINWORD.EXE"],
        supported_extensions: &[".doc", ".docx", ".odt", ".rtf"],
    },
    ExecutableSpec {
        role: "spreadsheet",
        file_name: "EXCEL.EXE",
        accepted_file_names: &["EXCEL.EXE"],
        supported_extensions: &[".xls", ".xlsx", ".ods", ".csv", ".tsv"],
    },
    ExecutableSpec {
        role: "presentation",
        file_name: "POWERPNT.EXE",
        accepted_file_names: &["POWERPNT.EXE"],
        supported_extensions: &[".ppt", ".pptx", ".odp"],
    },
];
const WPS_EXECUTABLES: &[ExecutableSpec] = &[
    ExecutableSpec {
        role: "document",
        file_name: "wps.exe",
        accepted_file_names: &["wps.exe"],
        supported_extensions: &[".doc", ".docx", ".odt", ".wps", ".rtf"],
    },
    ExecutableSpec {
        role: "spreadsheet",
        file_name: "et.exe",
        accepted_file_names: &["et.exe", "wps.exe"],
        supported_extensions: &[".xls", ".xlsx", ".ods", ".et", ".csv", ".tsv"],
    },
    ExecutableSpec {
        role: "presentation",
        file_name: "wpp.exe",
        accepted_file_names: &["wpp.exe", "wps.exe"],
        supported_extensions: &[".ppt", ".pptx", ".odp", ".dps"],
    },
];
const LIBREOFFICE_EXECUTABLES: &[ExecutableSpec] = &[ExecutableSpec {
    role: "office-suite",
    file_name: "soffice.exe",
    accepted_file_names: &["soffice.exe"],
    supported_extensions: &[
        ".doc", ".docx", ".odt", ".wps", ".rtf", ".xls", ".xlsx", ".ods", ".et", ".csv", ".tsv",
        ".ppt", ".pptx", ".odp", ".dps",
    ],
}];
const APPLICATION_SPECS: &[ApplicationSpec] = &[
    ApplicationSpec {
        id: "microsoft-office",
        label: "Microsoft Office",
        executables: OFFICE_EXECUTABLES,
    },
    ApplicationSpec {
        id: "wps-office",
        label: "WPS Office",
        executables: WPS_EXECUTABLES,
    },
    ApplicationSpec {
        id: "libreoffice",
        label: "LibreOffice",
        executables: LIBREOFFICE_EXECUTABLES,
    },
];

fn extensions_for_role(role: &str) -> &'static [&'static str] {
    match role {
        "document" => &[".doc", ".docx", ".odt", ".wps", ".rtf"],
        "spreadsheet" => &[".xls", ".xlsx", ".ods", ".et", ".csv", ".tsv"],
        "presentation" => &[".ppt", ".pptx", ".odp", ".dps"],
        "office-suite" => &[
            ".doc", ".docx", ".odt", ".wps", ".rtf", ".xls", ".xlsx", ".ods", ".et", ".csv",
            ".tsv", ".ppt", ".pptx", ".odp", ".dps",
        ],
        _ => &[],
    }
}

fn role_for_extension(extension: &str) -> Option<&'static str> {
    let extension = extension.to_ascii_lowercase();
    ["document", "spreadsheet", "presentation"]
        .into_iter()
        .find(|role| extensions_for_role(role).contains(&extension.as_str()))
}

fn source_digest(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("读取外部打开源文件失败: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn normalize_discovered_executable(
    path: impl AsRef<Path>,
    accepted_file_names: &[&str],
) -> Option<PathBuf> {
    let path = path.as_ref();
    if !path.is_file()
        || !path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                accepted_file_names
                    .iter()
                    .any(|accepted| value.eq_ignore_ascii_case(accepted))
            })
    {
        return None;
    }
    path.canonicalize().ok()
}

#[cfg(target_os = "windows")]
fn parse_registry_default_path(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        ["REG_EXPAND_SZ", "REG_SZ"].into_iter().find_map(|marker| {
            line.split_once(marker)
                .map(|(_, value)| value.trim().trim_matches('"').to_string())
                .filter(|value| !value.is_empty())
        })
    })
}

#[cfg(target_os = "windows")]
fn query_windows_app_path(
    file_name: &str,
    accepted_file_names: &[&str],
) -> Option<(PathBuf, String)> {
    for hive in ["HKCU", "HKLM"] {
        for view in ["64", "32"] {
            let key =
                format!(r"{hive}\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{file_name}");
            let output = Command::new("reg.exe")
                .args(["query", &key, "/ve", &format!("/reg:{view}")])
                .output()
                .ok()?;
            if !output.status.success() {
                continue;
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(path) = parse_registry_default_path(&stdout)
                .and_then(|path| normalize_discovered_executable(path, accepted_file_names))
            {
                return Some((path, format!("windows-app-paths:{hive}:{view}")));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn query_path_executable(
    file_name: &str,
    accepted_file_names: &[&str],
) -> Option<(PathBuf, String)> {
    let output = Command::new("where.exe").arg(file_name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|path| normalize_discovered_executable(path.trim(), accepted_file_names))
        .map(|path| (path, "process-path".into()))
}

#[cfg(not(target_os = "windows"))]
fn query_path_executable(
    file_name: &str,
    accepted_file_names: &[&str],
) -> Option<(PathBuf, String)> {
    let output = Command::new("which").arg(file_name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout);
    normalize_discovered_executable(path.trim(), accepted_file_names)
        .map(|path| (path, "process-path".into()))
}

fn discover_executable(file_name: &str, accepted_file_names: &[&str]) -> Option<(PathBuf, String)> {
    #[cfg(target_os = "windows")]
    if let Some(found) = query_windows_app_path(file_name, accepted_file_names) {
        return Some(found);
    }
    query_path_executable(file_name, accepted_file_names)
}

#[cfg(target_os = "windows")]
fn executable_version(path: &Path) -> Option<String> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-Item -LiteralPath $env:LONGEDIT_VERSION_TARGET).VersionInfo.ProductVersion",
        ])
        .env("LONGEDIT_VERSION_TARGET", path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[cfg(not(target_os = "windows"))]
fn executable_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn discover_application(spec: ApplicationSpec) -> ExternalApplicationCapability {
    let executables: Vec<_> = spec
        .executables
        .iter()
        .filter_map(|executable| {
            discover_executable(executable.file_name, executable.accepted_file_names).map(
                |(path, source)| ExternalAppExecutable {
                    role: executable.role.into(),
                    path: path.to_string_lossy().into_owned(),
                    discovery_source: source,
                },
            )
        })
        .collect();
    let supported_extensions = executables
        .iter()
        .filter_map(|executable| {
            spec.executables
                .iter()
                .find(|candidate| candidate.role == executable.role)
        })
        .flat_map(|executable| executable.supported_extensions)
        .map(|extension| (*extension).to_string())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let version = executables
        .first()
        .and_then(|executable| executable_version(Path::new(&executable.path)));
    let available = !executables.is_empty();
    let diagnostic = if available {
        format!(
            "已发现 {} 个角色程序{}",
            executables.len(),
            version
                .as_deref()
                .map(|value| format!("，版本 {value}"))
                .unwrap_or_default()
        )
    } else {
        "未在系统应用注册或 PATH 中发现可执行程序".into()
    };
    ExternalApplicationCapability {
        id: spec.id.into(),
        label: spec.label.into(),
        available,
        version,
        executables,
        supported_extensions,
        diagnostic,
    }
}

fn discover_all() -> Vec<ExternalApplicationCapability> {
    APPLICATION_SPECS
        .iter()
        .copied()
        .map(discover_application)
        .collect()
}

pub(crate) fn discover_external_executable(
    application_id: &str,
    extension: &str,
) -> Result<(PathBuf, Option<String>), String> {
    let spec = APPLICATION_SPECS
        .iter()
        .copied()
        .find(|candidate| candidate.id == application_id)
        .ok_or_else(|| format!("未知外部应用: {application_id}"))?;
    let application = discover_application(spec);
    let executable = executable_for_extension(&application, extension).ok_or_else(|| {
        format!(
            "{} 未发现适用于 {} 的角色程序",
            application.label, extension
        )
    })?;
    let path = PathBuf::from(&executable.path)
        .canonicalize()
        .map_err(|error| format!("外部应用路径无法重新验证: {error}"))?;
    Ok((path, application.version))
}

static DISCOVERED_EXTERNAL_APPLICATIONS: LazyLock<Vec<ExternalApplicationCapability>> =
    LazyLock::new(discover_all);

fn executable_for_extension<'a>(
    application: &'a ExternalApplicationCapability,
    extension: &str,
) -> Option<&'a ExternalAppExecutable> {
    if !application
        .supported_extensions
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(extension))
    {
        return None;
    }
    let role = role_for_extension(extension)?;
    application
        .executables
        .iter()
        .find(|executable| executable.role == role || executable.role == "office-suite")
}

fn resolve_external_application(
    application_id: Option<&str>,
    extension: &str,
    applications: &[ExternalApplicationCapability],
) -> Result<(String, String, Option<String>), String> {
    let Some(application_id) = application_id.filter(|id| *id != "system-default") else {
        return Ok(("system-default".into(), "系统默认应用".into(), None));
    };
    let application = applications
        .iter()
        .find(|candidate| candidate.id == application_id)
        .ok_or_else(|| format!("未知外部应用: {application_id}"))?;
    let executable = executable_for_extension(application, extension).ok_or_else(|| {
        format!(
            "{} 未发现适用于 {} 的角色程序",
            application.label, extension
        )
    })?;
    Ok((
        application.id.clone(),
        application.label.clone(),
        Some(executable.path.clone()),
    ))
}

#[tauri::command]
pub async fn discover_external_applications() -> Vec<ExternalApplicationCapability> {
    DISCOVERED_EXTERNAL_APPLICATIONS.clone()
}

#[tauri::command]
pub async fn open_workspace_file_externally(
    app: AppHandle,
    library_root: String,
    path: String,
    application_id: Option<String>,
) -> Result<ExternalOpenReceipt, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let path = guard.resolve_existing(path)?;
    if !path.is_file() {
        return Err("外部打开目标必须是工作区内的文件".into());
    }
    let format = file_format_for_path(&path)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .ok_or_else(|| "外部打开目标缺少扩展名".to_string())?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取外部打开源文件元数据失败: {error}"))?;
    let source_sha256_before = source_digest(&path)?;

    let (resolved_application_id, application_label, executable_path) =
        resolve_external_application(
            application_id.as_deref(),
            &extension,
            &DISCOVERED_EXTERNAL_APPLICATIONS,
        )?;

    app.opener()
        .open_path(path.to_string_lossy().into_owned(), executable_path.clone())
        .map_err(|error| format!("{application_label} 启动失败: {error}"))?;

    let source_sha256_after_handoff = source_digest(&path)?;
    let source_preserved_at_handoff = source_sha256_before == source_sha256_after_handoff;
    if !source_preserved_at_handoff {
        return Err("外部应用接管时源文件摘要发生变化，请立即检查文件状态".into());
    }
    Ok(ExternalOpenReceipt {
        format_id: format.id.clone(),
        application_id: resolved_application_id,
        application_label,
        executable_path,
        source_bytes: metadata.len(),
        source_sha256_before,
        source_sha256_after_handoff,
        source_preserved_at_handoff,
        launched_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn office_roles_cover_legacy_modern_odf_and_wps_extensions() {
        assert_eq!(role_for_extension(".DOC"), Some("document"));
        assert_eq!(role_for_extension(".xlsx"), Some("spreadsheet"));
        assert_eq!(role_for_extension(".odp"), Some("presentation"));
        assert_eq!(role_for_extension(".wps"), Some("document"));
        assert_eq!(role_for_extension(".et"), Some("spreadsheet"));
        assert_eq!(role_for_extension(".dps"), Some("presentation"));
        assert_eq!(role_for_extension(".exe"), None);
    }

    #[test]
    fn executable_selection_is_role_bound_and_never_accepts_arbitrary_paths() {
        let application = ExternalApplicationCapability {
            id: "fixture".into(),
            label: "Fixture Office".into(),
            available: true,
            version: Some("1.0".into()),
            executables: vec![ExternalAppExecutable {
                role: "document".into(),
                path: "C:\\Fixture\\writer.exe".into(),
                discovery_source: "test".into(),
            }],
            supported_extensions: vec![".doc".into(), ".docx".into()],
            diagnostic: "test".into(),
        };
        assert!(executable_for_extension(&application, ".docx").is_some());
        assert!(executable_for_extension(&application, ".xlsx").is_none());
        assert!(resolve_external_application(
            Some("fixture"),
            ".xlsx",
            std::slice::from_ref(&application)
        )
        .unwrap_err()
        .contains("未发现适用于"));
        assert!(resolve_external_application(
            Some("C:\\arbitrary\\program.exe"),
            ".docx",
            std::slice::from_ref(&application)
        )
        .unwrap_err()
        .contains("未知外部应用"));
        assert_eq!(
            resolve_external_application(None, ".docx", &[]).unwrap().0,
            "system-default"
        );
    }

    #[test]
    fn application_contract_does_not_overstate_native_wps_support() {
        assert!(!APPLICATION_SPECS[0]
            .executables
            .iter()
            .flat_map(|executable| executable.supported_extensions)
            .any(|extension| *extension == ".wps"));
        assert!(APPLICATION_SPECS[1]
            .executables
            .iter()
            .flat_map(|executable| executable.supported_extensions)
            .any(|extension| *extension == ".wps"));
        assert_eq!(
            APPLICATION_SPECS[1].executables[1].accepted_file_names,
            ["et.exe", "wps.exe"]
        );
        assert_eq!(
            APPLICATION_SPECS[1].executables[2].accepted_file_names,
            ["wpp.exe", "wps.exe"]
        );
    }

    #[test]
    fn source_digest_is_stable_and_read_only() {
        let path = std::env::temp_dir().join(format!(
            "longedit-e2a-digest-{}-{}.docx",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, b"external-open-source").unwrap();
        let before = source_digest(&path).unwrap();
        let after = source_digest(&path).unwrap();
        assert_eq!(before, after);
        assert_eq!(fs::read(&path).unwrap(), b"external-open-source");
        fs::remove_file(path).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn registry_default_value_parser_accepts_string_types_only() {
        let output = r#"
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\EXCEL.EXE
    (Default)    REG_SZ    C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE
    Path    REG_SZ    C:\Program Files\Microsoft Office\root\Office16\
"#;
        assert_eq!(
            parse_registry_default_path(output).as_deref(),
            Some(r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE")
        );
        assert!(parse_registry_default_path("ERROR: missing").is_none());
    }
}
