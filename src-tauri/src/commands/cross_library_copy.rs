//! Read-only previews and repeatable receipts for copying saved files between vaults.
use super::file_management::{
    visible_item, OperationError, OperationResult, PathChange, OPERATIONS,
};
use crate::services::{archive_dependencies, workspace_guard::WorkspaceGuard};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

const MAX_FILES: usize = 10_000;
const MAX_MARKDOWN: u64 = 20 * 1024 * 1024;
const MAX_TEXT: usize = 64 * 1024 * 1024;

#[derive(Clone)]
struct File {
    source: PathBuf,
    target: PathBuf,
    digest: String,
    bytes: u64,
    original: Option<String>,
    replacement: Option<String>,
}
#[derive(Clone)]
struct Unit {
    source: PathBuf,
    target: PathBuf,
    assets: PathBuf,
    files: Vec<File>,
    directories: Vec<PathBuf>,
    inventory: Vec<PathBuf>,
    warnings: Vec<String>,
    completed: bool,
    review_required: bool,
    error: Option<String>,
}
#[derive(Clone)]
struct Plan {
    owner: String,
    source_root: PathBuf,
    target_root: PathBuf,
    directory: PathBuf,
    units: Vec<Unit>,
    touched: Instant,
    started: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyItemPreview {
    pub old_path: String,
    pub new_path: String,
    pub file_count: usize,
    pub dependency_count: usize,
    pub total_bytes: u64,
    pub warnings: Vec<String>,
    pub error: Option<String>,
    pub completed: bool,
    pub review_required: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyPreview {
    pub plan_id: String,
    pub source_root: String,
    pub target_root: String,
    pub target_directory: String,
    pub items: Vec<CopyItemPreview>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyReceipt {
    pub result: OperationResult,
    pub preview: CopyPreview,
}
fn plans() -> &'static Mutex<BTreeMap<String, Plan>> {
    static VALUE: OnceLock<Mutex<BTreeMap<String, Plan>>> = OnceLock::new();
    VALUE.get_or_init(Mutex::default)
}
fn id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "copy-{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}
fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
fn metadata(path: &Path) -> bool {
    path.file_name().is_some_and(|n| {
        let n = n.to_string_lossy();
        n.eq_ignore_ascii_case(".longedit") || n.eq_ignore_ascii_case(".misty_order.json")
    })
}
fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("无法读取 {}：{e}", path.display()))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn walk(guard: &WorkspaceGuard, source: &Path) -> Result<Vec<PathBuf>, String> {
    let mut pending = vec![source.to_owned()];
    let mut result = Vec::new();
    while let Some(path) = pending.pop() {
        if metadata(&path) {
            continue;
        }
        if result.len() >= MAX_FILES {
            return Err("文件超过 10000 项，请分批复制".into());
        }
        let meta =
            fs::symlink_metadata(&path).map_err(|e| format!("无法读取 {}：{e}", path.display()))?;
        if meta.file_type().is_symlink() {
            return Err(format!("{} 是链接，请选择实际文件或文件夹", path.display()));
        }
        if guard.resolve_existing(&path)? != path {
            return Err("来源位置已改变，请重新预览".into());
        }
        if meta.is_dir() {
            for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
                pending.push(entry.map_err(|e| e.to_string())?.path())
            }
        } else if !meta.is_file() {
            return Err("来源不是普通文件".into());
        }
        result.push(path);
    }
    result.sort();
    Ok(result)
}
fn unused(
    directory: &Path,
    source: &Path,
    reserved: &mut BTreeSet<PathBuf>,
) -> Result<PathBuf, String> {
    let name = source.file_name().ok_or("文件名不可用")?.to_string_lossy();
    let suffix = if source.is_dir() {
        String::new()
    } else {
        crate::formats::file_registry::file_format_for_path(source)
            .ok()
            .and_then(|f| {
                f.extensions
                    .iter()
                    .filter(|ext| name.to_lowercase().ends_with(ext.as_str()))
                    .max_by_key(|ext| ext.len())
                    .cloned()
            })
            .or_else(|| {
                source
                    .extension()
                    .map(|ext| format!(".{}", ext.to_string_lossy()))
            })
            .unwrap_or_default()
    };
    let stem = &name[..name.len() - suffix.len()];
    let key = |p: &Path| {
        let value = text(p);
        if cfg!(windows) {
            value.to_lowercase()
        } else {
            value
        }
    };
    for n in 0..10000 {
        let candidate = directory.join(if n == 0 {
            name.to_string()
        } else {
            format!(
                "{stem} - 副本{}{suffix}",
                if n == 1 {
                    String::new()
                } else {
                    format!(" {n}")
                }
            )
        });
        if !candidate.try_exists().map_err(|e| e.to_string())?
            && !reserved.iter().any(|p| key(p) == key(&candidate))
        {
            reserved.insert(candidate.clone());
            return Ok(candidate);
        }
    }
    Err("同名项目过多，请选择其他目录".into())
}
fn load_file(source: PathBuf, target: PathBuf) -> Result<File, String> {
    let bytes = fs::metadata(&source).map_err(|e| e.to_string())?.len();
    let markdown = source
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"));
    let original = if markdown {
        if bytes > MAX_MARKDOWN {
            return Err("Markdown 超过 20 MiB，请分批整理其关联资源".into());
        }
        Some(
            fs::read_to_string(&source)
                .map_err(|e| format!("Markdown 须为 UTF-8，原文件未修改：{e}"))?,
        )
    } else {
        None
    };
    let digest = if let Some(value) = &original {
        format!("{:x}", Sha256::digest(value.as_bytes()))
    } else {
        hash_file(&source)?
    };
    Ok(File {
        source,
        target,
        digest,
        bytes,
        original,
        replacement: None,
    })
}
fn prepare_unit(
    guard: &WorkspaceGuard,
    source: PathBuf,
    target: PathBuf,
    assets: PathBuf,
) -> Result<Unit, String> {
    let inventory = walk(guard, &source)?;
    let mut directories = Vec::new();
    let mut files = Vec::new();
    for path in &inventory {
        let next = if path == &source {
            target.clone()
        } else {
            target.join(path.strip_prefix(&source).map_err(|e| e.to_string())?)
        };
        if path.is_dir() {
            directories.push(next)
        } else {
            files.push(load_file(path.clone(), next)?);
        }
    }
    let mut warnings = BTreeSet::new();
    let mut index = 0;
    let mut text_bytes = 0usize;
    while index < files.len() {
        if files.len() > MAX_FILES {
            return Err("关联文件超过 10000 项，请选择更小的范围".into());
        }
        let Some(original) = files[index].original.clone() else {
            index += 1;
            continue;
        };
        text_bytes = text_bytes.checked_add(original.len()).ok_or("正文过多")?;
        if text_bytes > MAX_TEXT {
            return Err("关联笔记正文合计超过 64 MiB，请分批复制".into());
        }
        let mut edits = BTreeMap::new();
        let mut mentions =
            archive_dependencies::move_mentions(&text(&files[index].source), &original);
        let html_images = crate::services::external_import::images(&original)?
            .into_iter()
            .filter(|image| image.html)
            .collect::<Vec<_>>();
        let html_image_spans: BTreeSet<_> =
            html_images.iter().map(|image| image.range.start).collect();
        mentions.retain(|e| {
            e.kind != "html_attribute"
                || !html_images.iter().any(|image| {
                    e.destination_span
                        .as_ref()
                        .is_some_and(|span| span.start == image.range.start)
                })
        });
        for image in html_images {
            let uri = image.target.trim().to_ascii_lowercase();
            if uri.starts_with('#')
                || ["http:", "https:", "mailto:", "data:", "tel:"]
                    .iter()
                    .any(|scheme| uri.starts_with(scheme))
            {
                continue;
            }
            mentions.push(archive_dependencies::DependencyEvidence {
                document: text(&files[index].source),
                line: original[..image.range.start]
                    .bytes()
                    .filter(|b| *b == b'\n')
                    .count()
                    + 1,
                target: image.target,
                kind: "html_attribute",
                resolution: None,
                destination_span: Some(archive_dependencies::DestinationSpan {
                    start: image.range.start,
                    end: image.range.end,
                    original: original[image.range].into(),
                }),
                snapshot_sha256: files[index].digest.clone(),
            });
        }
        for evidence in mentions {
            if evidence.kind == "html_attribute"
                && !evidence
                    .destination_span
                    .as_ref()
                    .is_some_and(|span| html_image_spans.contains(&span.start))
            {
                warnings.insert(format!(
                    "{} 第 {} 行：{}（HTML 引用保持原样）",
                    files[index]
                        .source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    evidence.line,
                    evidence.target
                ));
                continue;
            }
            // A same-document anchor remains valid at the copied location.
            if evidence.target.starts_with('#') {
                continue;
            }
            let resolution = archive_dependencies::resolve_relative(guard.root(), &evidence);
            let Some(path) = resolution
                .path
                .as_deref()
                .filter(|_| resolution.status == "resolved_file")
                .map(PathBuf::from)
            else {
                warnings.insert(format!(
                    "{} 第 {} 行：{}（未自动接续）",
                    files[index]
                        .source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    evidence.line,
                    evidence.target
                ));
                continue;
            };
            let Some(span) = evidence.destination_span.clone() else {
                warnings.insert(format!(
                    "{} 第 {} 行：{}（语法未自动接续）",
                    files[index]
                        .source
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    evidence.line,
                    evidence.target
                ));
                continue;
            };
            if path
                .components()
                .any(|c| metadata(Path::new(c.as_os_str())))
            {
                warnings.insert(format!("内部资料未复制：{}", evidence.target));
                continue;
            }
            let next = if let Some(existing) = files.iter().find(|f| f.source == path) {
                existing.target.clone()
            } else {
                let destination =
                    assets.join(path.strip_prefix(guard.root()).map_err(|e| e.to_string())?);
                files.push(load_file(path, destination.clone())?);
                destination
            };
            // Compute paths lexically: the preview must not create target folders.
            let replacement = relative_url(&files[index].target, &next, &evidence.target)
                .ok_or("无法计算复制后的相对引用")?;
            if let Some(prior) = edits.insert((span.start, span.end), replacement.clone()) {
                if prior != replacement {
                    return Err("引用范围重叠，请单独复制该文件".into());
                }
            }
        }
        let mut replacement = original.clone();
        let mut last = original.len();
        for ((start, end), value) in edits.into_iter().rev() {
            if end > last
                || start > end
                || !replacement.is_char_boundary(start)
                || !replacement.is_char_boundary(end)
            {
                return Err("引用范围已变化，请重新预览".into());
            }
            replacement.replace_range(start..end, &value);
            last = start;
        }
        files[index].replacement = Some(replacement);
        index += 1;
    }
    let warning_count = warnings.len();
    let mut warnings: Vec<_> = warnings.into_iter().take(100).collect();
    if warning_count > 100 {
        warnings.push(format!("另有 {} 条引用未自动接续", warning_count - 100));
    }
    Ok(Unit {
        source,
        target,
        assets,
        files,
        directories,
        inventory,
        warnings,
        completed: false,
        review_required: false,
        error: None,
    })
}
fn relative_url(document: &Path, target: &Path, original: &str) -> Option<String> {
    let from: Vec<_> = document.parent()?.components().collect();
    let to: Vec<_> = target.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts = vec!["..".to_owned(); from.len() - common];
    parts.extend(
        to[common..]
            .iter()
            .map(|c| urlencoding::encode(&c.as_os_str().to_string_lossy()).into_owned()),
    );
    let suffix = original
        .find(['?', '#'])
        .map(|at| &original[at..])
        .unwrap_or("");
    Some(format!("{}{suffix}", parts.join("/")))
}
fn summary(plan_id: &str, plan: &Plan) -> CopyPreview {
    CopyPreview {
        plan_id: plan_id.into(),
        source_root: text(&plan.source_root),
        target_root: text(&plan.target_root),
        target_directory: text(&plan.directory),
        items: plan
            .units
            .iter()
            .map(|u| CopyItemPreview {
                old_path: text(&u.source),
                new_path: text(&u.target),
                file_count: u.files.len(),
                dependency_count: u
                    .files
                    .iter()
                    .filter(|f| !u.inventory.contains(&f.source))
                    .count(),
                total_bytes: u.files.iter().map(|f| f.bytes).sum(),
                warnings: u.warnings.clone(),
                error: u.error.clone(),
                completed: u.completed,
                review_required: u.review_required,
            })
            .collect(),
    }
}
fn prepare(
    owner: &str,
    source_root: &str,
    target_root: &str,
    paths: &[String],
    target_dir: &str,
) -> Result<CopyPreview, String> {
    if paths.is_empty() || paths.len() > 512 {
        return Err("请选择 1 至 512 个文件或文件夹".into());
    }
    let source = WorkspaceGuard::new(source_root)?;
    let target = WorkspaceGuard::new(target_root)?;
    if source.root() == target.root() {
        return Err("同一资料库请使用原复制操作".into());
    }
    let _activity = crate::services::file_activity::read_write(&[source.root(), target.root()])?;
    let directory = target.resolve_directory(target_dir, true)?;
    if directory
        .strip_prefix(target.root())
        .map_err(|e| e.to_string())?
        .components()
        .any(|c| metadata(Path::new(c.as_os_str())))
    {
        return Err("请选择普通目标文件夹".into());
    }
    let mut sources = Vec::new();
    for path in paths {
        let resolved = visible_item(&source, path, true)?;
        if !sources.contains(&resolved) {
            sources.push(resolved)
        }
    }
    sources = sources
        .clone()
        .into_iter()
        .filter(|p| {
            !sources
                .iter()
                .any(|parent| p != parent && p.starts_with(parent))
        })
        .collect();
    let mut reserved = BTreeSet::new();
    let mut units = Vec::new();
    let mut total_text = 0usize;
    let mut total_files = 0usize;
    for path in sources {
        if directory.starts_with(&path) {
            return Err("不能复制到来源或其子文件夹".into());
        }
        let destination = unused(&directory, &path, &mut reserved)?;
        let asset_base = if path.is_dir() {
            destination.clone()
        } else {
            directory.clone()
        };
        let asset_name = if path.is_dir() {
            "关联资料.assets".into()
        } else {
            format!(
                "{}.assets",
                destination
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            )
        };
        let mut assets = unused(&asset_base, Path::new(&asset_name), &mut reserved)?;
        while path.is_dir() && path.join(assets.file_name().unwrap()).exists() {
            assets = unused(
                &asset_base,
                Path::new(&format!("{}-{}", reserved.len(), asset_name)),
                &mut reserved,
            )?;
        }
        let prepared = prepare_unit(&source, path.clone(), destination.clone(), assets.clone())
            .and_then(|unit| {
                let bytes = unit
                    .files
                    .iter()
                    .map(|f| f.original.as_ref().map_or(0, String::len))
                    .sum::<usize>();
                if total_text.saturating_add(bytes) > MAX_TEXT
                    || total_files.saturating_add(unit.files.len()) > MAX_FILES
                {
                    return Err("所选资料及关联笔记过多，请分批复制".into());
                }
                total_text += bytes;
                total_files += unit.files.len();
                Ok(unit)
            });
        match prepared {
            Ok(unit) => units.push(unit),
            Err(error) => units.push(Unit {
                source: path,
                target: destination,
                assets,
                files: vec![],
                directories: vec![],
                inventory: vec![],
                warnings: vec![],
                completed: false,
                review_required: false,
                error: Some(error),
            }),
        }
    }
    let key = id();
    let plan = Plan {
        owner: owner.into(),
        source_root: source.root().to_owned(),
        target_root: target.root().to_owned(),
        directory,
        units,
        touched: Instant::now(),
        started: false,
    };
    let preview = summary(&key, &plan);
    let mut registry = plans().lock().map_err(|_| "复制预览暂不可用")?;
    registry.retain(|_, p| {
        (p.owner != owner || p.started)
            && p.touched.elapsed() < Duration::from_secs(if p.started { 3600 } else { 600 })
    });
    if registry.len() >= 64 {
        if let Some(oldest) = registry
            .iter()
            .min_by_key(|(_, p)| p.touched)
            .map(|(key, _)| key.clone())
        {
            registry.remove(&oldest);
        }
    }
    registry.insert(key, plan);
    Ok(preview)
}
struct Stage {
    path: PathBuf,
}
impl Drop for Stage {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
fn execute_unit(
    source_root: &Path,
    target_root: &Path,
    target_directory: &Path,
    unit: &mut Unit,
) -> Result<(), String> {
    let source = WorkspaceGuard::new(source_root)?;
    let target = WorkspaceGuard::new(target_root)?;
    if source.root() != source_root || target.root() != target_root {
        return Err("资料库位置已改变，请重新核对".into());
    }
    let mut paths: Vec<&Path> = unit.files.iter().map(|f| f.source.as_path()).collect();
    paths.extend([
        unit.source.as_path(),
        unit.target.as_path(),
        unit.assets.as_path(),
    ]);
    let _lease = crate::services::document_coordination::acquire(&paths)?;
    if walk(&source, &unit.source)? != unit.inventory {
        return Err("来源目录内容已变化，请重新核对未完成项".into());
    }
    if target.resolve_for_write(&unit.target)? != unit.target
        || target.resolve_for_write(&unit.assets)? != unit.assets
        || unit.target.exists()
    {
        return Err("目标已有变化，请重新核对未完成项；已有文件未覆盖".into());
    }
    for file in &unit.files {
        if source.resolve_existing(&file.source)? != file.source
            || hash_file(&file.source)? != file.digest
        {
            return Err(format!(
                "{} 已改变，请重新核对未完成项",
                file.source.display()
            ));
        }
    }
    let cache = target.resolve_for_write(".longedit/copy-staging")?;
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let stage_path = cache.join(id());
    fs::create_dir(&stage_path).map_err(|e| e.to_string())?;
    let stage = Stage { path: stage_path };
    let payload = stage.path.join("payload");
    let assets = stage.path.join("assets");
    for directory in &unit.directories {
        fs::create_dir_all(
            payload.join(
                directory
                    .strip_prefix(&unit.target)
                    .map_err(|e| e.to_string())?,
            ),
        )
        .map_err(|e| e.to_string())?;
    }
    let mut has_assets = false;
    for file in &unit.files {
        let staged = if let Ok(relative) = file.target.strip_prefix(&unit.target) {
            if relative.as_os_str().is_empty() {
                payload.clone()
            } else {
                payload.join(relative)
            }
        } else {
            has_assets = true;
            assets.join(
                file.target
                    .strip_prefix(&unit.assets)
                    .map_err(|e| e.to_string())?,
            )
        };
        fs::create_dir_all(staged.parent().unwrap()).map_err(|e| e.to_string())?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staged)
            .map_err(|e| e.to_string())?;
        if let Some(content) = &file.replacement {
            output
                .write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
        } else {
            std::io::copy(
                &mut fs::File::open(&file.source).map_err(|e| e.to_string())?,
                &mut output,
            )
            .map_err(|e| e.to_string())?;
        }
        output.sync_all().map_err(|e| e.to_string())?;
        drop(output);
        let expected = file
            .replacement
            .as_ref()
            .map(|s| format!("{:x}", Sha256::digest(s.as_bytes())))
            .unwrap_or_else(|| file.digest.clone());
        if hash_file(&staged)? != expected {
            return Err("复制期间来源已改变，尚未发布该项".into());
        }
    }
    // Assets inside a copied folder are part of the single payload rename.
    if unit.assets.starts_with(&unit.target) && has_assets {
        let inside = payload.join(
            unit.assets
                .strip_prefix(&unit.target)
                .map_err(|e| e.to_string())?,
        );
        if let Some(parent) = inside.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?
        }
        crate::services::archive_move::rename_no_replace(&assets, &inside)
            .map_err(|e| e.to_string())?;
        has_assets = false;
    }
    for file in &unit.files {
        if hash_file(&file.source)? != file.digest {
            return Err("复制期间来源已改变，请重新核对；该项尚未发布".into());
        }
    }
    if walk(&source, &unit.source)? != unit.inventory {
        return Err("来源目录已变化，尚未发布该项".into());
    }
    let directory = target.resolve_directory(target_directory, true)?;
    if directory != target_directory {
        return Err("目标目录位置已改变".into());
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    if has_assets {
        if unit.assets.exists() {
            return Err("关联资料目标已变化，请重新核对；已有内容未覆盖".into());
        }
        crate::services::archive_move::rename_no_replace(&assets, &unit.assets)
            .map_err(|e| e.to_string())?;
    }
    if let Err(error) = crate::services::archive_move::rename_no_replace(&payload, &unit.target) {
        if has_assets {
            unit.review_required = true;
            return Err(format!(
                "正文未能发布：{error}；关联资料已保留在 {}，请核对目标后再操作",
                unit.assets.display()
            ));
        }
        return Err(format!("该项未能发布，未覆盖已有文件：{error}"));
    }
    Ok(())
}
fn execute(owner: &str, key: &str, acknowledge_warnings: bool) -> Result<CopyReceipt, String> {
    let mut registry = plans().lock().map_err(|_| "复制状态暂不可用")?;
    let plan = registry
        .get_mut(key)
        .filter(|p| p.owner == owner)
        .ok_or("复制预览已失效，请核对目标位置，不要重复复制已完成项")?;
    if plan.touched.elapsed() > Duration::from_secs(if plan.started { 3600 } else { 600 }) {
        return Err("复制预览已过期，请核对目标位置后重新预览".into());
    }
    if !acknowledge_warnings
        && plan
            .units
            .iter()
            .any(|u| !u.warnings.is_empty() && !u.completed)
    {
        return Err("请先查看未自动接续的引用，并确认是否保留原引用".into());
    }
    plan.started = true;
    plan.touched = Instant::now();
    let (source_root, target_root, directory) = (
        plan.source_root.clone(),
        plan.target_root.clone(),
        plan.directory.clone(),
    );
    for unit in &mut plan.units {
        if unit.completed || unit.error.is_some() {
            continue;
        }
        match execute_unit(&source_root, &target_root, &directory, unit) {
            Ok(()) => unit.completed = true,
            Err(error) => unit.error = Some(error),
        }
        for file in &mut unit.files {
            file.original = None;
            file.replacement = None;
        }
    }
    let result = OperationResult {
        items: plan
            .units
            .iter()
            .filter(|u| u.completed)
            .map(|u| PathChange {
                old_path: text(&u.source),
                new_path: text(&u.target),
            })
            .collect(),
        errors: plan
            .units
            .iter()
            .filter(|u| !u.completed)
            .map(|u| {
                let mut error = OperationError::ordinary(
                    text(&u.source),
                    u.error.clone().unwrap_or_else(|| "尚未复制".into()),
                );
                error.disposition = Some(if u.review_required {
                    crate::services::file_move_journal::FailureDisposition::NeedsReview
                } else {
                    crate::services::file_move_journal::FailureDisposition::NotExecuted
                });
                error
            })
            .collect(),
    };
    Ok(CopyReceipt {
        result,
        preview: summary(key, plan),
    })
}
#[tauri::command]
pub async fn preview_cross_library_copy(
    window: tauri::Window,
    source_root: String,
    target_root: String,
    paths: Vec<String>,
    target_dir: String,
) -> Result<CopyPreview, String> {
    if window.label() != "main" {
        return Err("请在主界面的文件栏复制资料".into());
    }
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        prepare(&owner, &source_root, &target_root, &paths, &target_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn execute_cross_library_copy(
    window: tauri::Window,
    plan_id: String,
    acknowledge_warnings: bool,
) -> Result<CopyReceipt, String> {
    if window.label() != "main" {
        return Err("请在主界面的文件栏复制资料".into());
    }
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        execute(&owner, &plan_id, acknowledge_warnings)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        root: PathBuf,
        a: PathBuf,
        b: PathBuf,
        owner: String,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(id());
            let a = root.join("来源");
            let b = root.join("目标");
            fs::create_dir_all(&a).unwrap();
            fs::create_dir_all(&b).unwrap();
            Self {
                root,
                a,
                b,
                owner: id(),
            }
        }
        fn preview(&self, paths: &[&str], directory: &str) -> CopyPreview {
            prepare(
                &self.owner,
                &text(&self.a),
                &text(&self.b),
                &paths.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
                directory,
            )
            .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn copied_reference(document: &Path, target: &str) -> PathBuf {
        let raw = target.split(['?', '#']).next().unwrap();
        document
            .parent()
            .unwrap()
            .join(urlencoding::decode(raw).unwrap().as_ref())
    }
    #[test]
    fn preview_is_read_only_and_copy_replays_the_same_receipt_without_duplicates() {
        let f = Fixture::new();
        fs::write(f.a.join("记录.txt"), b"saved bytes\r\n").unwrap();
        let p = f.preview(&["记录.txt"], "新建/目录");
        assert!(!f.b.join("新建").exists());
        let first = execute(&f.owner, &p.plan_id, false).unwrap();
        assert!(first.result.errors.is_empty());
        assert_eq!(
            fs::read(&first.result.items[0].new_path).unwrap(),
            b"saved bytes\r\n"
        );
        let again = execute(&f.owner, &p.plan_id, false).unwrap();
        assert_eq!(again.result.items.len(), 1);
        assert_eq!(
            again.result.items[0].new_path,
            first.result.items[0].new_path
        );
        assert_eq!(fs::read_dir(f.b.join("新建/目录")).unwrap().count(), 1);
        assert_eq!(fs::read(f.a.join("记录.txt")).unwrap(), b"saved bytes\r\n");
    }
    #[test]
    fn markdown_graph_keeps_bom_crlf_titles_code_and_cycles_without_changing_sources() {
        let f = Fixture::new();
        fs::create_dir_all(f.a.join("notes")).unwrap();
        fs::create_dir_all(f.a.join("images")).unwrap();
        let original="\u{feff}# 方案\r\n![图](images/a%20b.png?size=2#x \"标题\")\r\n[关联](notes/b.md)\r\n`![示例](missing.png)`\r\n";
        fs::write(f.a.join("a.md"), original).unwrap();
        fs::write(f.a.join("notes/b.md"), "[返回](../a.md)\r\n").unwrap();
        fs::write(f.a.join("images/a b.png"), b"exact image").unwrap();
        let p = f.preview(&["a.md"], ".");
        assert_eq!(p.items[0].dependency_count, 2);
        assert!(p.items[0].warnings.is_empty(), "{:?}", p.items[0].warnings);
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert!(r.result.errors.is_empty());
        let copied = Path::new(&r.result.items[0].new_path);
        let content = fs::read_to_string(copied).unwrap();
        assert!(content.starts_with('\u{feff}'));
        assert_eq!(
            content.matches("\r\n").count(),
            original.matches("\r\n").count()
        );
        assert!(content.contains("\"标题\""));
        assert!(content.contains("`![示例](missing.png)`"));
        let refs = archive_dependencies::move_mentions(&text(copied), &content);
        assert_eq!(refs.len(), 2);
        for item in refs {
            let path = copied_reference(copied, &item.target);
            assert!(path.is_file());
            if path.extension().is_some_and(|ext| ext == "md") {
                let nested = fs::read_to_string(&path).unwrap();
                let back = archive_dependencies::move_mentions(&text(&path), &nested);
                assert_eq!(
                    copied_reference(&path, &back[0].target)
                        .canonicalize()
                        .unwrap(),
                    copied.canonicalize().unwrap()
                );
            } else {
                assert_eq!(fs::read(path).unwrap(), b"exact image");
            }
        }
        assert_eq!(fs::read_to_string(f.a.join("a.md")).unwrap(), original);
    }
    #[test]
    fn directory_copy_excludes_internal_metadata_preserves_empty_folders_and_external_dependencies()
    {
        let f = Fixture::new();
        fs::create_dir_all(f.a.join("项目/空目录")).unwrap();
        fs::create_dir_all(f.a.join("项目/.longedit")).unwrap();
        fs::write(f.a.join("项目/.longedit/private.json"), b"private").unwrap();
        fs::write(f.a.join("项目/.misty_order.json"), b"private order").unwrap();
        fs::write(f.a.join("image.png"), b"image").unwrap();
        fs::write(f.a.join("项目/a.md"), "![image](../image.png)").unwrap();
        let p = f.preview(&["项目", "项目/a.md"], ".");
        assert_eq!(p.items.len(), 1);
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert!(r.result.errors.is_empty(), "{:?}", r.result.errors);
        let root = Path::new(&r.result.items[0].new_path);
        assert!(root.join("空目录").is_dir());
        assert!(!root.join(".longedit").exists());
        assert!(!root.join(".misty_order.json").exists());
        let note = root.join("a.md");
        let content = fs::read_to_string(&note).unwrap();
        let mentions = archive_dependencies::move_mentions(&text(&note), &content);
        assert_eq!(
            fs::read(copied_reference(&note, &mentions[0].target)).unwrap(),
            b"image"
        );
    }
    #[test]
    fn name_collisions_keep_existing_bytes_and_compound_extensions_in_preview() {
        let f = Fixture::new();
        fs::create_dir_all(f.a.join("sub")).unwrap();
        fs::write(f.a.join("data.table.json"), b"first").unwrap();
        fs::write(f.a.join("sub/data.table.json"), b"second").unwrap();
        fs::write(f.b.join("data.table.json"), b"existing").unwrap();
        let p = f.preview(&["data.table.json", "sub/data.table.json"], ".");
        assert!(p.items[0].new_path.ends_with("data - 副本.table.json"));
        assert!(p.items[1].new_path.ends_with("data - 副本 2.table.json"));
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert_eq!(r.result.items.len(), 2);
        assert_eq!(fs::read(f.b.join("data.table.json")).unwrap(), b"existing");
    }
    #[test]
    fn changed_source_and_new_directory_entry_stop_only_the_affected_unit() {
        let f = Fixture::new();
        fs::write(f.a.join("a.txt"), b"old").unwrap();
        fs::write(f.a.join("b.txt"), b"good").unwrap();
        let p = f.preview(&["a.txt", "b.txt"], ".");
        fs::write(f.a.join("a.txt"), b"new").unwrap();
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert_eq!(r.result.items.len(), 1);
        assert_eq!(r.result.errors.len(), 1);
        assert!(!f.b.join("a.txt").exists());
        let q = f.preview(&["a.txt"], ".");
        let done = execute(&f.owner, &q.plan_id, false).unwrap();
        assert_eq!(done.result.items.len(), 1);
        assert_eq!(fs::read(f.b.join("a.txt")).unwrap(), b"new");
        assert_eq!(
            fs::read_dir(&f.b)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|e| e.path().is_file())
                .count(),
            2
        );
        fs::create_dir_all(f.a.join("folder")).unwrap();
        let p = f.preview(&["folder"], ".");
        fs::write(f.a.join("folder/added.txt"), b"new").unwrap();
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert_eq!(r.result.errors.len(), 1);
        assert!(!f.b.join("folder").exists());
    }
    #[test]
    fn target_race_and_document_save_never_overwrite_or_claim_success() {
        let f = Fixture::new();
        fs::write(f.a.join("a.txt"), b"source").unwrap();
        let p = f.preview(&["a.txt"], ".");
        fs::write(f.b.join("a.txt"), b"other application").unwrap();
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert!(r.result.items.is_empty());
        assert_eq!(fs::read(f.b.join("a.txt")).unwrap(), b"other application");
        let p = f.preview(&["a.txt"], ".");
        let source = f.a.join("a.txt");
        let lease = crate::services::document_coordination::acquire(&[&source]).unwrap();
        let r = execute(&f.owner, &p.plan_id, false).unwrap();
        assert!(r.result.items.is_empty());
        assert!(!Path::new(&p.items[0].new_path).exists());
        drop(lease);
    }
    #[test]
    fn unresolved_references_require_explicit_acknowledgement_and_keep_original_syntax() {
        let f = Fixture::new();
        let original = "![missing](missing.png)\n[[另一篇]]\n";
        fs::write(f.a.join("a.md"), original).unwrap();
        let p = f.preview(&["a.md"], ".");
        assert!(!p.items[0].warnings.is_empty());
        assert!(execute(&f.owner, &p.plan_id, false).is_err());
        assert!(!f.b.join("a.md").exists());
        let r = execute(&f.owner, &p.plan_id, true).unwrap();
        assert!(r.result.errors.is_empty());
        assert_eq!(
            fs::read_to_string(&r.result.items[0].new_path).unwrap(),
            original
        );
    }
    #[test]
    fn html_image_parser_ignores_fake_src_inside_other_attributes() {
        let f = Fixture::new();
        fs::write(f.a.join("real.png"), b"real").unwrap();
        fs::write(f.a.join("fake.png"), b"not an image reference").unwrap();
        let original = "<img title=\"a > b\" data-hint=\" src='fake.png'\" src=\"real.png\">\n<img src=\"https://example.com/image.png\">\n";
        fs::write(f.a.join("a.md"), original).unwrap();
        let p = f.preview(&["a.md"], ".");
        assert_eq!(p.items[0].dependency_count, 1);
        assert!(!p.items[0]
            .warnings
            .iter()
            .any(|w| w.contains("https://example.com")));
        let r = execute(&f.owner, &p.plan_id, true).unwrap();
        assert!(r.result.errors.is_empty());
        let copy = fs::read_to_string(&r.result.items[0].new_path).unwrap();
        assert!(copy.contains("data-hint=\" src='fake.png'\""));
        assert_eq!(
            crate::services::external_import::images(&copy)
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn unknown_owner_and_same_or_descendant_vault_never_write() {
        let f = Fixture::new();
        fs::write(f.a.join("a.txt"), b"source").unwrap();
        let p = f.preview(&["a.txt"], ".");
        assert!(execute("different-window", &p.plan_id, false).is_err());
        assert!(execute(&f.owner, "not-a-plan", false).is_err());
        assert!(prepare(&f.owner, &text(&f.a), &text(&f.a), &["a.txt".into()], ".").is_err());
        fs::create_dir_all(f.a.join("folder/nested-vault")).unwrap();
        assert!(prepare(
            &f.owner,
            &text(&f.a),
            &text(&f.a.join("folder/nested-vault")),
            &["folder".into()],
            "."
        )
        .is_err());
        assert!(!f.b.join("a.txt").exists());
    }
}
