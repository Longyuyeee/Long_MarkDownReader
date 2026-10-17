//! Explicit local content packages, separate from redacted management backups.
//! Read-only source inventory; bounded ZIP validation; new-path-only publication.
use super::{archive_move::rename_no_replace, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, AtomicU8, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub const MAX_TOTAL: u64 = 512 * 1024 * 1024;
pub const MAX_FILE: u64 = 128 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 10_000;
const MAX_MANIFEST: u64 = 4 * 1024 * 1024;
const MAX_PACKAGE: u64 = MAX_TOTAL + 32 * 1024 * 1024;
const KIND: &str = "longedit-library-content";
const EXCLUDED: &[&str] = &[
    "未保存草稿",
    "应用配置与系统凭据",
    "资料库外链接目标",
    "隐藏和依赖目录",
    "已知敏感配置文件",
    "自定义模板（使用模板导入导出）",
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub documents: bool,
    pub attachments: bool,
    pub annotations: bool,
    pub history: bool,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            documents: true,
            attachments: true,
            annotations: true,
            history: false,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub relative_path: String,
    pub category: String,
    pub bytes: u64,
    pub sha256: String,
    pub modified_nanos: u64,
    pub source_relative: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Exclusion {
    pub path: String,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub kind: String,
    pub schema_version: u32,
    pub app_version: String,
    pub library_name: String,
    pub created_at: u64,
    pub options: Options,
    pub entries: Vec<Entry>,
    pub directories: Vec<String>,
    pub excluded: Vec<Exclusion>,
    pub boundary: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub plan_id: String,
    pub library_name: String,
    pub created_at: u64,
    pub total_bytes: u64,
    pub entry_count: usize,
    pub counts: BTreeMap<String, usize>,
    pub entries: Vec<Entry>,
    pub preview_truncated: bool,
    pub excluded_count: usize,
    pub excluded: Vec<Exclusion>,
    pub boundary: Vec<String>,
    pub sha256: Option<String>,
    pub max_total_bytes: u64,
    pub max_file_bytes: u64,
}
impl Manifest {
    pub fn summary(&self, id: String, sha: Option<String>) -> Summary {
        let mut counts = BTreeMap::new();
        for e in &self.entries {
            *counts.entry(e.category.clone()).or_insert(0) += 1;
        }
        Summary {
            plan_id: id,
            library_name: self.library_name.clone(),
            created_at: self.created_at,
            total_bytes: self.entries.iter().map(|e| e.bytes).sum(),
            entry_count: self.entries.len(),
            counts,
            entries: self.entries.iter().take(200).cloned().collect(),
            preview_truncated: self.entries.len() > 200,
            excluded_count: self.excluded.len(),
            excluded: self.excluded.iter().take(200).cloned().collect(),
            boundary: self.boundary.clone(),
            sha256: sha,
            max_total_bytes: MAX_TOTAL,
            max_file_bytes: MAX_FILE,
        }
    }
}
#[derive(Clone)]
pub struct ExportPlan {
    pub root: PathBuf,
    pub cache: PathBuf,
    pub manifest: Manifest,
    sources: Vec<PathBuf>,
}
#[derive(Clone)]
pub struct RestorePlan {
    pub path: PathBuf,
    pub manifest: Manifest,
    pub sha256: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
    pub entry_count: usize,
    pub history_count: usize,
    pub status: String,
    pub source_unchanged: bool,
}

/// Cancellation cannot acknowledge an interruption after the atomic commit starts.
#[derive(Clone, Default)]
pub struct Control {
    state: Arc<AtomicU8>,
}
impl Control {
    pub fn cancel(&self) -> bool {
        self.state
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
    pub fn check(&self) -> Result<(), String> {
        if self.state.load(Ordering::SeqCst) == 1 {
            Err("已取消；未发布内容包或恢复资料目录".into())
        } else {
            Ok(())
        }
    }
    fn commit(&self) -> Result<(), String> {
        self.state
            .compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| ())
            .map_err(|_| "已取消，未进入提交阶段".into())
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn stamp(meta: &fs::Metadata) -> Result<u64, String> {
    u64::try_from(
        meta.modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
    )
    .map_err(|_| "文件修改时间无法保存".into())
}
fn linked(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    meta.file_type().is_symlink()
}
pub fn relative(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 1800
        || value.contains('\\')
        || value.split('/').count() > 64
    {
        return Err("内容路径为空、过长或包含非法分隔符".into());
    }
    for part in value.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part.encode_utf16().count() > 180
            || part
                .chars()
                .any(|c| c.is_control() || "<>:\"|?*".contains(c))
            || matches!(
                stem.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
            )
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.as_bytes()[3].is_ascii_digit())
        {
            return Err(format!("内容路径不安全或不兼容 Windows：{value}"));
        }
    }
    Ok(())
}
fn excluded_name(name: &str, dir: bool) -> bool {
    let low = name.to_lowercase();
    low.starts_with('.')
        || matches!(low.as_str(), "node_modules" | "target" | "__pycache__") && (dir)
        || matches!(
            low.as_str(),
            "credentials.json" | "credentials" | "id_rsa" | "id_ed25519"
        )
        || [".pem", ".key", ".p12", ".pfx"]
            .iter()
            .any(|x| low.ends_with(x))
}
fn category(path: &str) -> &'static str {
    let low = path.to_lowercase();
    if low.ends_with(".pdf.annotations.json") {
        return "annotations";
    }
    let ext = low.rsplit('.').next().unwrap_or("");
    if matches!(
        ext,
        "md" | "markdown"
            | "txt"
            | "json"
            | "jsonc"
            | "yaml"
            | "yml"
            | "xml"
            | "toml"
            | "csv"
            | "tsv"
            | "table"
            | "pdf"
            | "docx"
            | "xlsx"
            | "pptx"
            | "doc"
            | "xls"
            | "ppt"
            | "ods"
            | "odt"
            | "odp"
            | "opml"
            | "canvas"
            | "mermaid"
            | "mmd"
            | "drawio"
            | "log"
            | "html"
            | "htm"
            | "css"
            | "js"
            | "ts"
            | "py"
            | "rs"
            | "sql"
            | "sh"
            | "ps1"
            | "bat"
            | "c"
            | "h"
            | "cpp"
    ) {
        "documents"
    } else {
        "attachments"
    }
}
fn history_source(path: &str) -> bool {
    matches!(
        Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "md" | "markdown" | "txt"
    )
}
fn hash_reader(
    reader: &mut impl Read,
    limit: u64,
    control: &Control,
) -> Result<(u64, String), String> {
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut buf = [0u8; 65536];
    loop {
        control.check()?;
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("读取内容失败：{e}"))?;
        if n == 0 {
            break;
        }
        count = count.checked_add(n as u64).ok_or("内容大小溢出")?;
        if count > limit {
            return Err("文件读取超过大小预算".into());
        }
        hash.update(&buf[..n]);
    }
    Ok((count, format!("{:x}", hash.finalize())))
}
fn source_digest(path: &Path, control: &Control) -> Result<(u64, String, u64), String> {
    let before =
        fs::symlink_metadata(path).map_err(|e| format!("无法检查 {}：{e}", path.display()))?;
    if linked(&before) || !before.is_file() || before.len() > MAX_FILE {
        return Err(format!(
            "不是普通文件、为重解析点或超过单文件 128 MiB 上限：{}",
            path.display()
        ));
    }
    let stamp = stamp(&before)?;
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let (len, hash) = hash_reader(&mut file, MAX_FILE, control)?;
    let after = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if linked(&after)
        || !after.is_file()
        || before.len() != len
        || after.len() != len
        || self::stamp(&after)? != stamp
    {
        return Err(format!(
            "文件在读取期间变化，请重新预检：{}",
            path.display()
        ));
    }
    Ok((len, hash, stamp))
}
fn push_source(
    plan: &mut ExportPlan,
    path: PathBuf,
    rel: String,
    kind: &str,
    source: Option<String>,
    control: &Control,
) -> Result<(), String> {
    if plan.manifest.entries.len() >= MAX_ENTRIES {
        return Err("内容包超过 10000 文件条目上限，请缩小资料库范围".into());
    }
    let (bytes, hash, modified) = source_digest(&path, control)?;
    if plan
        .manifest
        .entries
        .iter()
        .map(|e| e.bytes)
        .sum::<u64>()
        .saturating_add(bytes)
        > MAX_TOTAL
    {
        return Err("内容包超过 512 MiB 未压缩总量上限，请缩小范围".into());
    }
    let archive_path = if kind == "history" {
        format!(
            "history/{}/{}",
            sha(source.as_ref().ok_or("历史缺少原文")?.as_bytes()),
            Path::new(&rel)
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or("无效历史名称")?
        )
    } else {
        format!("files/{rel}")
    };
    plan.manifest.entries.push(Entry {
        path: archive_path,
        relative_path: rel,
        category: kind.into(),
        bytes,
        sha256: hash,
        modified_nanos: modified,
        source_relative: source,
    });
    plan.sources.push(path);
    Ok(())
}

pub fn preview(
    root: &Path,
    cache: &Path,
    options: Options,
    control: &Control,
) -> Result<ExportPlan, String> {
    if !options.documents && !options.attachments {
        return Err("请至少选择文档或附件；批注和历史需要文档".into());
    }
    if !options.documents && (options.annotations || options.history) {
        return Err("PDF 批注和历史必须与源文档一起备份".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let _activity = super::file_activity::read_write(&[guard.root()])?;
    let _history = if options.history {
        Some(super::history_coordination::acquire_read(cache)?)
    } else {
        None
    };
    let mut plan = ExportPlan {
        root: guard.root().to_owned(),
        cache: cache.to_owned(),
        manifest: Manifest {
            kind: KIND.into(),
            schema_version: 1,
            app_version: env!("CARGO_PKG_VERSION").into(),
            library_name: guard
                .root()
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("资料库")
                .into(),
            created_at: now(),
            options,
            entries: vec![],
            directories: vec![],
            excluded: vec![],
            boundary: EXCLUDED.iter().map(|s| s.to_string()).collect(),
        },
        sources: vec![],
    };
    let mut stack = vec![(guard.root().to_owned(), String::new())];
    let mut scanned = 0usize;
    let mut names = BTreeSet::new();
    let mut annotations = vec![];
    while let Some((dir, prefix)) = stack.pop() {
        control.check()?;
        let metadata = fs::symlink_metadata(&dir).map_err(|e| e.to_string())?;
        if linked(&metadata) || !metadata.is_dir() {
            return Err("扫描目录已变为链接或不再可访问".into());
        }
        let mut children = fs::read_dir(&dir)
            .map_err(|e| format!("资料目录读取不完整：{e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        children.sort_by_key(|e| e.file_name());
        for child in children {
            control.check()?;
            scanned += 1;
            if scanned > 40_000 {
                return Err("扫描条目超过 40000 项，未完成预检".into());
            }
            let name = child
                .file_name()
                .into_string()
                .map_err(|_| "文件名不是有效 Unicode，未完成备份")?;
            let rel = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            let path = child.path();
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if excluded_name(&name, meta.is_dir()) {
                plan.manifest.excluded.push(Exclusion {
                    path: rel,
                    reason: "隐藏、依赖目录或敏感配置，未包含".into(),
                });
                continue;
            }
            relative(&rel)?;
            if !names.insert(rel.to_lowercase()) {
                return Err(format!("资料路径大小写冲突：{rel}"));
            }
            if linked(&meta) || (!meta.is_dir() && !meta.is_file()) {
                return Err(format!(
                    "资料包含符号链接、重解析点或特殊文件；未跟随：{rel}"
                ));
            }
            if guard.resolve_existing(&path)? != path {
                return Err(format!("资料位置在检查中改变：{rel}"));
            }
            if meta.is_dir() {
                if plan.manifest.directories.len() >= MAX_ENTRIES {
                    return Err("资料目录数量超过 10000 上限".into());
                }
                plan.manifest.directories.push(rel.clone());
                stack.push((path, rel));
                continue;
            }
            let kind = category(&rel);
            let selected = match kind {
                "documents" => plan.manifest.options.documents,
                "annotations" => plan.manifest.options.annotations,
                _ => plan.manifest.options.attachments,
            };
            if !selected {
                plan.manifest.excluded.push(Exclusion {
                    path: rel,
                    reason: "未选择此类内容".into(),
                });
                continue;
            }
            if kind == "annotations" {
                annotations.push((path, rel));
                continue;
            }
            push_source(&mut plan, path, rel, kind, None, control)?;
        }
    }
    for (path, rel) in annotations {
        let source = rel
            .strip_suffix(".annotations.json")
            .ok_or("无效批注路径")?
            .to_owned();
        if !plan
            .manifest
            .entries
            .iter()
            .any(|e| e.relative_path == source)
        {
            return Err(format!("PDF 批注的源文档未包含：{rel}"));
        }
        push_source(&mut plan, path, rel, "annotations", Some(source), control)?;
    }
    if plan.manifest.options.history {
        let documents = plan
            .manifest
            .entries
            .iter()
            .filter(|e| e.category == "documents" && history_source(&e.relative_path))
            .map(|e| e.relative_path.clone())
            .collect::<Vec<_>>();
        if let Ok(meta) = fs::symlink_metadata(cache) {
            if linked(&meta) || !meta.is_dir() {
                return Err("历史缓存不是普通目录".into());
            }
        }
        for rel in documents {
            let directory =
                super::archive_history::history_path(cache, &guard.resolve_existing(&rel)?);
            match fs::symlink_metadata(&directory) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(e) => return Err(e.to_string()),
                Ok(m) if linked(&m) || !m.is_dir() => return Err("历史目录不是普通目录".into()),
                _ => {}
            }
            let mut children = fs::read_dir(&directory)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            children.sort_by_key(|e| e.file_name());
            for child in children {
                let name = child
                    .file_name()
                    .into_string()
                    .map_err(|_| "历史名称无效")?;
                validate_history_name(&name)?;
                push_source(
                    &mut plan,
                    child.path(),
                    name,
                    "history",
                    Some(rel.clone()),
                    control,
                )?;
            }
        }
    }
    if plan.manifest.entries.is_empty() {
        return Err("所选范围没有可备份文件，请调整选择".into());
    }
    plan.manifest.directories.sort();
    plan.manifest.excluded.sort_by(|a, b| a.path.cmp(&b.path));
    let mut pairs = plan
        .manifest
        .entries
        .into_iter()
        .zip(plan.sources)
        .collect::<Vec<_>>();
    pairs.sort_by(|a, b| a.0.path.cmp(&b.0.path));
    (plan.manifest.entries, plan.sources) = pairs.into_iter().unzip();
    validate_manifest(&plan.manifest)?;
    validate_source_associations(&plan, control)?;
    Ok(plan)
}

fn validate_history_name(name: &str) -> Result<(), String> {
    relative(name)?;
    if name.contains('/')
        || (name != "metadata.json"
            && (!name.ends_with(".md") || name.trim_end_matches(".md").parse::<u64>().is_err()))
    {
        Err(format!("历史含未知或未完成的记录，先在历史中核对：{name}"))
    } else {
        Ok(())
    }
}

fn validate_manifest(m: &Manifest) -> Result<(), String> {
    if m.kind != KIND || m.schema_version != 1 {
        return Err("不是支持的 Long编辑资料内容包；管理备份请使用原来的导入入口".into());
    }
    if m.library_name.is_empty()
        || m.library_name.len() > 720
        || m.library_name
            .chars()
            .any(|c| c.is_control() || "/\\:".contains(c))
    {
        return Err("内容包资料库名称无效".into());
    }
    if m.entries.is_empty()
        || m.entries.len() > MAX_ENTRIES
        || m.directories.len() > MAX_ENTRIES
        || m.excluded.len() > 40_000
    {
        return Err("内容包条目数量超出预算".into());
    }
    if (!m.options.documents && !m.options.attachments)
        || (!m.options.documents && (m.options.annotations || m.options.history))
    {
        return Err("内容包选择范围不一致".into());
    }
    if m.boundary != EXCLUDED.iter().map(|s| s.to_string()).collect::<Vec<_>>() {
        return Err("内容包隐私边界缺失或不支持".into());
    }
    let mut paths = BTreeSet::new();
    let mut files = BTreeSet::new();
    let mut dirs = BTreeSet::new();
    let mut total = 0u64;
    for d in &m.directories {
        relative(d)?;
        if d.split('/').any(|n| excluded_name(n, true)) || !dirs.insert(d.to_lowercase()) {
            return Err("目录清单包含受限名称、重复或大小写冲突".into());
        }
    }
    for e in &m.entries {
        relative(&e.relative_path)?;
        relative(&e.path)?;
        if !paths.insert(e.path.to_lowercase())
            || e.bytes > MAX_FILE
            || e.sha256.len() != 64
            || !e
                .sha256
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("内容清单包含重复路径、大小超限或无效摘要".into());
        }
        total = total.checked_add(e.bytes).ok_or("内容总量溢出")?;
        if total > MAX_TOTAL {
            return Err("内容包超过 512 MiB 解压预算".into());
        }
        if e.category == "history" {
            let source = e.source_relative.as_ref().ok_or("历史缺少源文件")?;
            relative(source)?;
            validate_history_name(&e.relative_path)?;
            if !m.options.history
                || !history_source(source)
                || e.path != format!("history/{}/{}", sha(source.as_bytes()), e.relative_path)
            {
                return Err("历史映射或选择范围无效".into());
            }
        } else {
            if e.path != format!("files/{}", e.relative_path)
                || e.relative_path.split('/').any(|n| excluded_name(n, false))
                || e.category != category(&e.relative_path)
            {
                return Err("文档路径、类型或选择范围不一致".into());
            }
            if !files.insert(e.relative_path.to_lowercase())
                || dirs.contains(&e.relative_path.to_lowercase())
            {
                return Err("内容文件与目录重复或冲突".into());
            }
            let selected = match e.category.as_str() {
                "documents" => m.options.documents,
                "annotations" => m.options.annotations,
                "attachments" => m.options.attachments,
                _ => false,
            };
            if !selected {
                return Err("内容包包含未选择类别".into());
            }
            if e.category == "annotations" {
                if e.source_relative.as_deref() != e.relative_path.strip_suffix(".annotations.json")
                {
                    return Err("PDF 批注源文件映射无效".into());
                }
            } else if e.source_relative.is_some() {
                return Err("普通文件不应重定向来源".into());
            }
        }
    }
    for d in dirs.iter().chain(files.iter()) {
        let mut parent = Path::new(d).parent();
        while let Some(p) = parent {
            if !p.as_os_str().is_empty() && !dirs.contains(&p.to_string_lossy().replace('\\', "/"))
            {
                return Err("目录清单缺失父目录或文件占用了父路径".into());
            }
            parent = p.parent();
        }
    }
    for e in &m.entries {
        if let Some(source) = &e.source_relative {
            if !m
                .entries
                .iter()
                .any(|f| f.category == "documents" && f.relative_path == *source)
            {
                return Err("批注或历史对应的源文档未包含".into());
            }
        }
    }
    for e in &m.excluded {
        relative(&e.path)?;
        if e.reason.is_empty() || e.reason.len() > 400 {
            return Err("未包含条目的说明无效".into());
        }
    }
    Ok(())
}

fn validate_association(m: &Manifest, e: &Entry, bytes: &[u8]) -> Result<(), String> {
    if e.category == "annotations" {
        let document: crate::formats::pdf_annotations::PdfAnnotationDocument =
            serde_json::from_slice(bytes)
                .map_err(|error| format!("PDF 批注损坏：{}：{error}", e.relative_path))?;
        crate::formats::pdf_annotations::validate_pdf_annotations(&document)?;
        let source = m
            .entries
            .iter()
            .find(|f| {
                Some(&f.relative_path) == e.source_relative.as_ref() && f.category == "documents"
            })
            .ok_or("批注源 PDF 未包含")?;
        if document.source.pdf_file
            != Path::new(&source.relative_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
            || document.source.size != source.bytes
            || document.source.modified_at != source.modified_nanos / 1_000_000_000
        {
            return Err(format!(
                "PDF 批注与当前原文身份不符，请在阅读器核对后重新备份：{}",
                e.relative_path
            ));
        }
    }
    if e.category == "history" && e.relative_path == "metadata.json" {
        let metadata: BTreeMap<u64, crate::commands::history::HistoryMetadata> =
            serde_json::from_slice(bytes).map_err(|error| format!("历史备注损坏：{error}"))?;
        if metadata.len() > 10_000
            || metadata
                .values()
                .any(|item| item.note.chars().count() > 2000)
        {
            return Err("历史备注超过现有支持范围".into());
        }
    }
    Ok(())
}
fn association_bytes(e: &Entry) -> bool {
    e.category == "annotations" || e.category == "history" && e.relative_path == "metadata.json"
}
fn validate_source_associations(plan: &ExportPlan, control: &Control) -> Result<(), String> {
    for (e, path) in plan.manifest.entries.iter().zip(&plan.sources) {
        if association_bytes(e) {
            control.check()?;
            if e.bytes > 5 * 1024 * 1024 {
                return Err("批注或历史备注超过 5 MiB 上限".into());
            }
            let bytes = fs::read(path).map_err(|error| error.to_string())?;
            if bytes.len() as u64 != e.bytes || sha(&bytes) != e.sha256 {
                return Err("批注或历史在核对期间改变".into());
            }
            validate_association(&plan.manifest, e, &bytes)?;
        }
    }
    Ok(())
}

/// Bound central-directory allocation before ZipArchive parses untrusted names.
fn check_zip_directory(file: &mut File) -> Result<(), String> {
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    if !(22..=MAX_PACKAGE).contains(&size) {
        return Err("内容包为空或超过 544 MiB 压缩包上限".into());
    }
    let start = size.saturating_sub(65557);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut tail = vec![];
    file.read_to_end(&mut tail).map_err(|e| e.to_string())?;
    let pos = (0..=tail.len() - 22)
        .rev()
        .find(|&i| {
            &tail[i..i + 4] == b"PK\x05\x06"
                && i + 22 + u16::from_le_bytes([tail[i + 20], tail[i + 21]]) as usize == tail.len()
        })
        .ok_or("ZIP 结束记录损坏")?;
    let u16at = |i| u16::from_le_bytes([tail[pos + i], tail[pos + i + 1]]);
    let u32at = |i| u32::from_le_bytes(tail[pos + i..pos + i + 4].try_into().unwrap());
    let count = u16at(10) as usize;
    let central_size = u32at(12) as u64;
    let offset = u32at(16) as u64;
    if u16at(4) != 0
        || u16at(6) != 0
        || u16at(8) != u16at(10)
        || count == 0
        || count > MAX_ENTRIES + 1
        || central_size > MAX_MANIFEST
        || offset.checked_add(central_size) != Some(start + pos as u64)
    {
        return Err("ZIP 分卷、ZIP64、条目数量或中央目录超出支持范围".into());
    }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    Ok(())
}
fn package_digest(path: &Path, control: &Control) -> Result<(u64, String), String> {
    let before = fs::symlink_metadata(path).map_err(|e| format!("无法读取内容包：{e}"))?;
    if linked(&before) || !before.is_file() || before.len() > MAX_PACKAGE {
        return Err("内容包不是普通文件或超过预算".into());
    }
    let result = hash_reader(
        &mut File::open(path).map_err(|e| e.to_string())?,
        MAX_PACKAGE,
        control,
    )?;
    let after = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if linked(&after)
        || after.len() != result.0
        || before.len() != after.len()
        || stamp(&before)? != stamp(&after)?
    {
        return Err("内容包在读取时发生变化".into());
    }
    Ok(result)
}
pub fn inspect_archive(path: &Path, control: &Control) -> Result<RestorePlan, String> {
    let (_, digest) = package_digest(path, control)?;
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    check_zip_directory(&mut file)?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("内容包 ZIP 无效：{e}"))?;
    let manifest: Manifest = {
        let mut entry = zip
            .by_name("manifest.json")
            .map_err(|_| "内容包缺少 manifest.json；管理备份请使用原入口")?;
        if entry.size() > MAX_MANIFEST {
            return Err("内容清单过大".into());
        }
        let mut bytes = vec![];
        entry
            .by_ref()
            .take(MAX_MANIFEST + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_MANIFEST {
            return Err("内容清单读取超限".into());
        }
        serde_json::from_slice(&bytes).map_err(|e| format!("内容清单损坏或含未知必需字段：{e}"))?
    };
    validate_manifest(&manifest)?;
    if zip.len() != manifest.entries.len() + 1 {
        return Err("ZIP 条目数量与清单不一致".into());
    }
    let wanted = manifest
        .entries
        .iter()
        .map(|e| (e.path.as_str(), e))
        .collect::<BTreeMap<_, _>>();
    let mut seen = BTreeSet::new();
    for i in 0..zip.len() {
        control.check()?;
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_owned();
        relative(&name)?;
        if !seen.insert(name.to_lowercase())
            || file.is_dir()
            || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err("ZIP 包含重复、目录或符号链接条目".into());
        }
        if name == "manifest.json" {
            continue;
        }
        let expected = wanted
            .get(name.as_str())
            .ok_or("ZIP 中存在清单以外的文件")?;
        if file.size() != expected.bytes {
            return Err(format!("条目大小与清单不符：{name}"));
        }
        if association_bytes(expected) {
            if expected.bytes > 5 * 1024 * 1024 {
                return Err("批注或历史备注超过 5 MiB".into());
            }
            let mut bytes = vec![];
            file.by_ref()
                .take(expected.bytes + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            control.check()?;
            if bytes.len() as u64 != expected.bytes || sha(&bytes) != expected.sha256 {
                return Err(format!("条目摘要不符：{name}"));
            }
            validate_association(&manifest, expected, &bytes)?;
        } else {
            let (len, hash) = hash_reader(&mut file, expected.bytes, control)?;
            if len != expected.bytes || hash != expected.sha256 {
                return Err(format!("条目摘要不符：{name}"));
            }
        }
    }
    if package_digest(path, control)?.1 != digest {
        return Err("内容包在校验期间发生变化".into());
    }
    Ok(RestorePlan {
        path: path.to_owned(),
        manifest,
        sha256: digest,
    })
}

pub fn require_space(available: u64, required: u64) -> Result<(), String> {
    if available < required {
        return Err(format!(
            "可用空间不足：至少需要 {required} 字节，当前 {available} 字节；未开始写入"
        ));
    }
    Ok(())
}
#[cfg(windows)]
fn available_space(parent: &Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let mut wide = parent.as_os_str().encode_wide().collect::<Vec<_>>();
    if wide.contains(&0) {
        return Err("空间检查路径无效".into());
    }
    wide.push(0);
    let mut available = 0u64;
    // SAFETY: live NUL-terminated input and a writable u64 output; unused outputs are nullable.
    if unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(format!(
            "无法核对目标空间：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(available)
}
#[cfg(not(windows))]
fn available_space(_: &Path) -> Result<u64, String> {
    Err("此平台尚未实现可靠内容包空间检查".into())
}

fn destination(input: &Path, directory: bool) -> Result<PathBuf, String> {
    if !input.is_absolute() {
        return Err("请通过选择器提供完整目标路径".into());
    }
    let name = input
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("目标名称无效")?;
    relative(name)?;
    if name.contains('/')
        || name.starts_with('.')
        || !directory && !name.to_lowercase().ends_with(".zip")
    {
        return Err("请选择普通新文件夹名称或 .zip 备份文件".into());
    }
    let parent = input.parent().ok_or("目标没有父目录")?;
    let meta = fs::symlink_metadata(parent).map_err(|e| e.to_string())?;
    if linked(&meta) || !meta.is_dir() {
        return Err("目标父目录必须是普通目录，不能是链接或重解析点".into());
    }
    let path = parent.canonicalize().map_err(|e| e.to_string())?.join(name);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(e) => Err(e.to_string()),
        Ok(_) => Err("目标已存在；不会覆盖、合并或替换，请选择新名称".into()),
    }
}
struct Stage {
    path: PathBuf,
    token: String,
    keep: bool,
}
impl Stage {
    fn new(parent: &Path) -> Result<Self, String> {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let token = format!(
            "{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let path = parent.join(format!(".longedit-content-stage-{token}"));
        fs::create_dir(&path).map_err(|e| format!("无法创建自有暂存目录：{e}"))?;
        let mut stage = Self {
            path,
            token,
            keep: false,
        };
        if let Err(e) = stage.journal("owner.txt", stage.token.as_bytes()) {
            stage.keep = true;
            return Err(format!("{e}；暂存目录保留待核对：{}", stage.path.display()));
        }
        Ok(stage)
    }
    fn journal(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(self.path.join(name))
            .map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())
    }
    fn cleanup(&self) -> Result<(), String> {
        let meta = fs::symlink_metadata(&self.path).map_err(|e| e.to_string())?;
        if linked(&meta)
            || !meta.is_dir()
            || self.path.canonicalize().map_err(|e| e.to_string())? != self.path
        {
            return Err("暂存目录身份变化，未清理".into());
        }
        let owner = self.path.join("owner.txt");
        if linked(&fs::symlink_metadata(&owner).map_err(|e| e.to_string())?)
            || fs::read(&owner).map_err(|e| e.to_string())? != self.token.as_bytes()
        {
            return Err("暂存所有权无法核对，未清理".into());
        }
        let mut stack = vec![self.path.clone()];
        let mut count = 0;
        while let Some(dir) = stack.pop() {
            for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
                let e = e.map_err(|e| e.to_string())?;
                count += 1;
                if count > 40_000 {
                    return Err("暂存清理条目异常，已保留".into());
                }
                let m = fs::symlink_metadata(e.path()).map_err(|e| e.to_string())?;
                if linked(&m) {
                    return Err("暂存含重解析点，未清理".into());
                }
                if m.is_dir() {
                    stack.push(e.path())
                }
            }
        }
        fs::remove_dir_all(&self.path).map_err(|e| e.to_string())
    }
    fn abort(mut self, error: String) -> String {
        let result = self.cleanup();
        self.keep = true;
        match result {
            Ok(()) => error,
            Err(e) => format!(
                "{error}；未完成暂存保留于 {}，请勿当成成功备份：{e}",
                self.path.display()
            ),
        }
    }
}
impl Drop for Stage {
    fn drop(&mut self) {
        if !self.keep {
            let _ = self.cleanup();
        }
    }
}

fn same_inventory(a: &Manifest, b: &Manifest) -> bool {
    a.entries == b.entries
        && a.directories == b.directories
        && a.options == b.options
        && a.excluded == b.excluded
}
fn copy_checked(
    reader: &mut impl Read,
    writer: &mut impl Write,
    e: &Entry,
    control: &Control,
) -> Result<(), String> {
    let mut count = 0u64;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        control.check()?;
        let n = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if n == 0 {
            break;
        }
        count = count.saturating_add(n as u64);
        if count > e.bytes {
            return Err(format!("条目在处理时变大：{}", e.relative_path));
        }
        writer
            .write_all(&buffer[..n])
            .map_err(|error| format!("写入失败（可能空间不足），没有发布成功产物：{error}"))?;
        hash.update(&buffer[..n]);
    }
    if count != e.bytes || format!("{:x}", hash.finalize()) != e.sha256 {
        return Err(format!("条目在处理时变化或摘要错误：{}", e.relative_path));
    }
    Ok(())
}
pub fn export(plan: &ExportPlan, input: &Path, control: &Control) -> Result<Receipt, String> {
    control.check()?;
    let target = destination(input, false)?;
    if target.starts_with(&plan.root) || target.starts_with(&plan.cache) {
        return Err("备份文件必须保存在资料库及历史缓存以外，避免把备份再次纳入自己".into());
    }
    let fresh = preview(
        &plan.root,
        &plan.cache,
        plan.manifest.options.clone(),
        control,
    )?;
    if !same_inventory(&plan.manifest, &fresh.manifest) {
        return Err("资料或历史自预检后发生变化，请重新预检；未导出旧清单".into());
    }
    let parent = target.parent().unwrap();
    let total = plan.manifest.entries.iter().map(|e| e.bytes).sum::<u64>();
    require_space(
        available_space(parent)?,
        total + MAX_MANIFEST + 16 * 1024 * 1024,
    )?;
    let stage = Stage::new(parent)?;
    let result = (|| {
        let path = stage.path.join("package.zip");
        let file = OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts)
            .map_err(|e| e.to_string())?;
        let manifest = serde_json::to_vec_pretty(&plan.manifest).map_err(|e| e.to_string())?;
        if manifest.len() as u64 > MAX_MANIFEST {
            return Err("内容清单超过 4 MiB，未生成包".into());
        }
        zip.write_all(&manifest).map_err(|e| e.to_string())?;
        for (e, source) in plan.manifest.entries.iter().zip(&plan.sources) {
            control.check()?;
            let meta = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
            if linked(&meta) || !meta.is_file() || stamp(&meta)? != e.modified_nanos {
                return Err("源文件自预检后变化".into());
            }
            zip.start_file(&e.path, opts).map_err(|e| e.to_string())?;
            copy_checked(
                &mut File::open(source).map_err(|e| e.to_string())?,
                &mut zip,
                e,
                control,
            )?;
        }
        zip.finish()
            .and_then(|f| f.sync_all().map_err(zip::result::ZipError::Io))
            .map_err(|e| e.to_string())?;
        let verified = inspect_archive(&path, control)?;
        let fresh = preview(
            &plan.root,
            &plan.cache,
            plan.manifest.options.clone(),
            control,
        )?;
        if !same_inventory(&plan.manifest, &fresh.manifest) {
            return Err("读取期间资料库发生变化，请重新预检；没有发布不完整备份".into());
        }
        let bytes = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        control.commit()?;
        rename_no_replace(&path, &target).map_err(|e| format!("发布备份失败，未覆盖目标：{e}"))?;
        Ok(Receipt {
            path: target.to_string_lossy().into_owned(),
            sha256: verified.sha256,
            bytes,
            entry_count: plan.manifest.entries.len(),
            history_count: plan
                .manifest
                .entries
                .iter()
                .filter(|e| e.category == "history")
                .count(),
            status: "completed".into(),
            source_unchanged: true,
        })
    })();
    match result {
        Ok(r) => Ok(r),
        Err(e) => Err(stage.abort(e)),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCheck {
    pub path: String,
    pub available_bytes: u64,
    pub required_bytes: u64,
    pub history_count: usize,
}
fn history_targets(m: &Manifest, target: &Path, cache: &Path) -> BTreeMap<String, PathBuf> {
    m.entries
        .iter()
        .filter(|e| e.category == "history")
        .filter_map(|e| e.source_relative.as_ref())
        .map(|rel| {
            (
                rel.clone(),
                super::archive_history::history_path(cache, &target.join(rel)),
            )
        })
        .collect()
}
fn regular_cache(cache: &Path) -> Result<(), String> {
    match fs::symlink_metadata(cache) {
        Ok(m) if linked(&m) || !m.is_dir() => Err("历史缓存位置异常，未写入恢复记录".into()),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
fn existing_parent(path: &Path) -> Result<PathBuf, String> {
    let mut p = path;
    loop {
        match fs::symlink_metadata(p) {
            Ok(m) => {
                if linked(&m) || !m.is_dir() {
                    return Err("目标祖先不是普通目录".into());
                }
                return p.canonicalize().map_err(|e| e.to_string());
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                p = p.parent().ok_or("缺少有效父目录")?
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}
pub fn check_restore_target(
    plan: &RestorePlan,
    cache: &Path,
    input: &Path,
) -> Result<TargetCheck, String> {
    let target = destination(input, true)?;
    if target.starts_with(cache) {
        return Err("不能将恢复资料写入应用历史缓存".into());
    }
    regular_cache(cache)?;
    let history = history_targets(&plan.manifest, &target, cache);
    for path in history.values() {
        match fs::symlink_metadata(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
            Ok(_) => {
                return Err(
                    "该新路径已有历史（可能是未完成恢复），不会覆盖；请核对恢复记录或换新目录名"
                        .into(),
                )
            }
        }
    }
    let total = plan.manifest.entries.iter().map(|e| e.bytes).sum::<u64>();
    let required = total + 16 * 1024 * 1024;
    let available = available_space(target.parent().unwrap())?;
    require_space(available, required)?;
    if !history.is_empty() {
        let history_bytes = plan
            .manifest
            .entries
            .iter()
            .filter(|e| e.category == "history")
            .map(|e| e.bytes)
            .sum::<u64>();
        require_space(
            available_space(&existing_parent(cache)?)?,
            history_bytes + 16 * 1024 * 1024,
        )?;
    }
    Ok(TargetCheck {
        path: target.to_string_lossy().into_owned(),
        available_bytes: available,
        required_bytes: required,
        history_count: plan
            .manifest
            .entries
            .iter()
            .filter(|e| e.category == "history")
            .count(),
    })
}
fn set_modified(path: &Path, nanos: u64) -> Result<(), String> {
    let time = UNIX_EPOCH
        .checked_add(std::time::Duration::from_nanos(nanos))
        .ok_or("修改时间无效")?;
    OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?
        .set_times(fs::FileTimes::new().set_modified(time))
        .map_err(|e| format!("无法保留文件修改时间：{e}"))
}

pub fn restore(
    plan: &RestorePlan,
    cache: &Path,
    input: &Path,
    control: &Control,
) -> Result<Receipt, String> {
    control.check()?;
    let current = inspect_archive(&plan.path, control)?;
    if current.sha256 != plan.sha256 || current.manifest != plan.manifest {
        return Err("内容包自预检后变化，请重新选择和校验".into());
    }
    let check = check_restore_target(plan, cache, input)?;
    let target = PathBuf::from(&check.path);
    let history = history_targets(&plan.manifest, &target, cache);
    let _history_lease = if history.is_empty() {
        None
    } else {
        Some(super::history_coordination::acquire(cache)?)
    };
    let mut stage = Stage::new(target.parent().unwrap())?;
    let mut history_stage = if history.is_empty() {
        None
    } else {
        regular_cache(cache)?;
        fs::create_dir_all(cache).map_err(|e| e.to_string())?;
        regular_cache(cache)?;
        Some(Stage::new(
            &cache.canonicalize().map_err(|e| e.to_string())?,
        )?)
    };
    let library = stage.path.join("library");
    let result = (|| {
        fs::create_dir(&library).map_err(|e| e.to_string())?;
        for d in &plan.manifest.directories {
            control.check()?;
            fs::create_dir_all(library.join(d)).map_err(|e| e.to_string())?;
        }
        let mut zip = ZipArchive::new(File::open(&plan.path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        for e in &plan.manifest.entries {
            control.check()?;
            let destination = if e.category == "history" {
                let source = e.source_relative.as_ref().ok_or("历史来源丢失")?;
                history_stage
                    .as_ref()
                    .ok_or("历史暂存未建立")?
                    .path
                    .join(sha(source.as_bytes()))
                    .join(&e.relative_path)
            } else {
                library.join(&e.relative_path)
            };
            fs::create_dir_all(destination.parent().ok_or("恢复条目缺少父目录")?)
                .map_err(|e| e.to_string())?;
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&destination)
                .map_err(|e| format!("恢复条目写入失败：{e}"))?;
            let mut archived = zip.by_name(&e.path).map_err(|e| e.to_string())?;
            copy_checked(&mut archived, &mut file, e, control)?;
            file.sync_all().map_err(|e| e.to_string())?;
            drop(file);
            set_modified(&destination, e.modified_nanos)?;
            if source_digest(&destination, control)?.1 != e.sha256 {
                return Err("恢复后的磁盘文件摘要不符".into());
            }
        }
        if package_digest(&plan.path, control)?.1 != plan.sha256 {
            return Err("内容包在恢复期间变化，未发布恢复目录".into());
        }
        // Reserve participating writers at the final path; no draft is saved or cleared.
        let _document = super::document_coordination::acquire(&[&target])?;
        check_restore_target(plan, cache, &target)?;
        let journal=serde_json::to_vec_pretty(&serde_json::json!({"kind":"longedit-content-restore-operation","schemaVersion":1,"state":"prepared","target":target,"historyTargets":history,"archiveSha256":plan.sha256,"sourceUnchanged":true})).map_err(|e|e.to_string())?;
        stage.journal("prepared.json", &journal)?;
        if let Some(s) = &history_stage {
            s.journal("prepared.json", &journal)?;
        }
        control.commit()?;
        let mut committed: Vec<(PathBuf, PathBuf)> = vec![];
        let commit = (|| {
            if let Some(s) = &history_stage {
                for (source, path) in &history {
                    let staged = s.path.join(sha(source.as_bytes()));
                    rename_no_replace(&staged, path)
                        .map_err(|e| format!("新路径历史发布失败：{e}"))?;
                    committed.push((staged, path.clone()));
                }
            }
            rename_no_replace(&library, &target)
                .map_err(|e| format!("新目录发布失败，没有覆盖目标：{e}"))?;
            Ok::<(), String>(())
        })();
        if let Err(error) = commit {
            let mut failures = vec![];
            for (staged, published) in committed.iter().rev() {
                if let Err(e) = rename_no_replace(published, staged) {
                    failures.push(e.to_string())
                }
            }
            if !failures.is_empty() {
                stage.keep = true;
                if let Some(s) = &mut history_stage {
                    s.keep = true
                }
                return Err(format!("{error}；历史回退需核对：{}；保留恢复日志 {} 和历史暂存 {}，没有将任务标为成功",failures.join("；"),stage.path.display(),history_stage.as_ref().map(|s|s.path.display().to_string()).unwrap_or_default()));
            }
            return Err(error);
        }
        Ok(Receipt {
            path: target.to_string_lossy().into_owned(),
            sha256: plan.sha256.clone(),
            bytes: plan.manifest.entries.iter().map(|e| e.bytes).sum(),
            entry_count: plan.manifest.entries.len(),
            history_count: check.history_count,
            status: "completed".into(),
            source_unchanged: true,
        })
    })();
    match result {
        Ok(r) => Ok(r),
        Err(e) => {
            if stage.keep {
                Err(e)
            } else {
                let mut message = stage.abort(e);
                if let Some(s) = history_stage {
                    message = s.abort(message)
                }
                Err(message)
            }
        }
    }
}

#[cfg(test)]
#[path = "content_backup_tests.rs"]
mod tests;
