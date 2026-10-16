//! Existing move/rename plus Markdown reference continuation, with durable originals.
use super::{
    file_move_journal::{FailureDisposition, MoveFailure},
    file_move_links::DocumentEdit,
    reliable_write::{write_new_bytes, write_utf8},
    workspace_guard::WorkspaceGuard,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Edit {
    source: PathBuf,
    target: PathBuf,
    original: String,
    replacement: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Record {
    version: u32,
    root: PathBuf,
    source: PathBuf,
    target: PathBuf,
    documents: Vec<Edit>,
    #[serde(default)]
    companions: Vec<(PathBuf, PathBuf)>,
}
pub(crate) struct Stage {
    path: PathBuf,
    record: Record,
}
fn review(message: impl Into<String>, id: Option<String>) -> MoveFailure {
    MoveFailure {
        message: message.into(),
        disposition: FailureDisposition::NeedsReview,
        recovery_id: id,
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
impl Stage {
    fn begin(cache: &Path, record: Record) -> Result<Self, MoveFailure> {
        let bytes = serde_json::to_vec(&record).map_err(|e| e.to_string())?;
        if bytes.len() > 72 * 1024 * 1024 {
            return Err("本次引用更新的原文记录超过 72 MiB，请分批整理；文件尚未移动".into());
        }
        let directory = cache.join(".link-moves");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let name = format!(
            "links-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let path = directory.join(name);
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        write_new_bytes(path.join("record.json"), &bytes).map_err(|e| {
            review(
                format!("移动尚未执行，记录未完整保存：{e}"),
                path.file_name().map(|s| s.to_string_lossy().into_owned()),
            )
        })?;
        Ok(Self { path, record })
    }
    fn id(&self) -> String {
        self.path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    }
    fn failure(&self, message: impl Into<String>) -> MoveFailure {
        review(
            format!(
                "{}；已保留原文和移动记录，请在文件栏右键「核对未完成的移动」处理，不重复移动",
                message.into()
            ),
            Some(self.id()),
        )
    }
    fn finish(&self, outcome: &str) -> Result<(), MoveFailure> {
        if self
            .path
            .parent()
            .is_some_and(|p| p.ends_with(".file-moves"))
        {
            return Ok(());
        }
        let bytes =
            fs::read(self.path.join("record.json")).map_err(|e| self.failure(e.to_string()))?;
        let terminal =
            serde_json::to_vec(&serde_json::json!({"digest":hash(&bytes),"outcome":outcome}))
                .map_err(|e| self.failure(e.to_string()))?;
        write_new_bytes(self.path.join("terminal.json"), &terminal).map_err(|e| self.failure(e))?;
        let retired = self.path.with_file_name(format!(".done-{}", self.id()));
        if super::archive_move::rename_no_replace(&self.path, &retired).is_ok() {
            let _ = fs::remove_file(retired.join("record.json"));
            let _ = fs::remove_file(retired.join("terminal.json"));
            let _ = fs::remove_dir(retired);
        }
        Ok(())
    }
    fn rollback_documents(&self) -> Result<(), String> {
        for edit in &self.record.documents {
            let current = fs::read_to_string(&edit.source).map_err(|e| e.to_string())?;
            if current != edit.original && current != edit.replacement {
                return Err(format!("{} 已有新修改，未覆盖", edit.source.display()));
            }
        }
        for edit in self.record.documents.iter().rev() {
            let current = fs::read_to_string(&edit.source).map_err(|e| e.to_string())?;
            if current == edit.replacement && current != edit.original {
                write_utf8(&edit.source, &edit.original)?;
            }
        }
        Ok(())
    }
}
fn pending(cache: &Path, root: &Path) -> Result<(), MoveFailure> {
    let directory = cache.join(".link-moves");
    if !directory.try_exists().map_err(|e| e.to_string())? {
        return Ok(());
    }
    for (index, entry) in fs::read_dir(directory)
        .map_err(|e| e.to_string())?
        .enumerate()
    {
        if index >= 512 {
            return Err("待核对移动记录过多，请先处理已有记录".into());
        }
        let path = entry.map_err(|e| e.to_string())?.path();
        if path
            .file_name()
            .is_some_and(|s| s.to_string_lossy().starts_with(".done-"))
        {
            continue;
        }
        let record = read_stage(&path).map_err(|e| {
            review(
                e,
                path.file_name().map(|s| s.to_string_lossy().into_owned()),
            )
        })?;
        if record.root != root {
            continue;
        }
        if !terminal_valid(&path)? {
            return Err(review(
                "此资料库有未完成的移动，请先在文件操作中核对状态",
                path.file_name().map(|s| s.to_string_lossy().into_owned()),
            ));
        }
    }
    Ok(())
}
fn read_stage(path: &Path) -> Result<Record, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("移动记录目录类型异常".into());
    }
    let file = path.join("record.json");
    let m = fs::symlink_metadata(&file).map_err(|e| e.to_string())?;
    if !m.is_file() || m.file_type().is_symlink() || m.len() > 72 * 1024 * 1024 {
        return Err("移动记录类型或大小异常".into());
    }
    let record: Record = serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if record.version != 1 {
        return Err("移动记录版本不支持".into());
    }
    let guard = WorkspaceGuard::new(&record.root)?;
    for p in [&record.source, &record.target] {
        guard.resolve_for_write(p)?;
    }
    for edit in &record.documents {
        guard.resolve_for_write(&edit.source)?;
        guard.resolve_for_write(&edit.target)?;
    }
    for (source, target) in &record.companions {
        guard.resolve_for_write(source)?;
        guard.resolve_for_write(target)?;
    }
    Ok(record)
}
fn terminal_valid(path: &Path) -> Result<bool, String> {
    let file = path.join("terminal.json");
    if !file.try_exists().map_err(|e| e.to_string())? {
        return Ok(false);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    Ok(value["digest"].as_str()
        == Some(hash(&fs::read(path.join("record.json")).map_err(|e| e.to_string())?).as_str())
        && ["completed", "rolledBack"].contains(&value["outcome"].as_str().unwrap_or("")))
}
pub(crate) fn ensure_clearable(cache: &Path) -> Result<(), String> {
    let directory = cache.join(".link-moves");
    if !directory.try_exists().map_err(|e| e.to_string())? {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path
            .file_name()
            .is_some_and(|s| s.to_string_lossy().starts_with(".done-"))
        {
            continue;
        }
        if !terminal_valid(&path)? {
            return Err("存在未完成的移动核对记录，请先核对后再清空历史".into());
        }
    }
    Ok(())
}
fn pdf_companions(old: &Path, new: &Path) -> Result<Vec<Edit>, String> {
    if !old.is_file()
        || !old
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Ok(vec![]);
    }
    let mut result = Vec::new();
    for suffix in [".annotations.json", ".ocr.json"] {
        let source = old.with_file_name(format!(
            "{}{suffix}",
            old.file_name().ok_or("PDF 文件名无效")?.to_string_lossy()
        ));
        if !source.try_exists().map_err(|e| e.to_string())? {
            continue;
        }
        let metadata = fs::symlink_metadata(&source).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > 24 * 1024 * 1024
        {
            return Err("PDF 批注或 OCR 记录类型或大小异常，尚未移动".into());
        }
        let target = new.with_file_name(format!(
            "{}{suffix}",
            new.file_name().ok_or("PDF 新名称无效")?.to_string_lossy()
        ));
        if fs::symlink_metadata(&target).is_ok() {
            return Err("新位置已有 PDF 批注或 OCR 记录，不会覆盖；请更换名称".into());
        }
        let original = fs::read_to_string(&source).map_err(|e| e.to_string())?;
        let mut value: serde_json::Value =
            serde_json::from_str(&original).map_err(|e| format!("PDF 附加记录无法读取：{e}"))?;
        let field = value
            .get_mut("source")
            .and_then(|source| source.get_mut("pdfFile"))
            .ok_or("PDF 附加记录来源不完整，尚未移动")?;
        if field.as_str() != old.file_name().and_then(|s| s.to_str()) {
            return Err("PDF 附加记录与当前文件不匹配，尚未移动".into());
        }
        *field = serde_json::Value::String(new.file_name().unwrap().to_string_lossy().into_owned());
        result.push(Edit {
            source,
            target,
            original,
            replacement: serde_json::to_string_pretty(&value).map_err(|e| e.to_string())? + "\n",
        });
    }
    Ok(result)
}
fn companion_path(source: &Path, target: &Path) -> Result<PathBuf, String> {
    match (
        source.try_exists().map_err(|e| e.to_string())?,
        target.try_exists().map_err(|e| e.to_string())?,
    ) {
        (true, false) => Ok(source.to_owned()),
        (false, true) => Ok(target.to_owned()),
        _ => Err("PDF 附加记录位置不唯一或缺失，请保留两侧文件核对".into()),
    }
}
fn align_companions(record: &Record, forward: bool) -> Result<(), String> {
    let moves = record
        .companions
        .iter()
        .map(|(source, target)| {
            let current = companion_path(source, target)?;
            let wanted = if forward { target } else { source };
            Ok((current, wanted.clone()))
        })
        .collect::<Result<Vec<_>, String>>()?;
    for (current, wanted) in moves {
        if current != wanted {
            super::archive_move::rename_no_replace(&current, &wanted)
                .map_err(|e| format!("PDF 附加记录位置尚未完成：{e}"))?;
        }
    }
    Ok(())
}
pub(crate) fn execute(
    app: Option<&tauri::AppHandle>,
    guard: &WorkspaceGuard,
    old: &Path,
    new: &Path,
) -> Result<(), MoveFailure> {
    // Declaration order matters: IO leases drop before the window release event.
    let mut protection = None;
    let _activity = super::file_activity::relocate(guard.root())?;
    let _documents = super::document_coordination::acquire(&[guard.root()])?;
    let cache = match app {
        Some(app) => crate::commands::history::history_cache_root(app)?,
        None => guard.root().join(".longedit/move-records"),
    };
    pending(&cache, guard.root())?;
    super::file_move_journal::ensure_no_pending(&cache, old, new)?;
    let plan =
        super::file_move_links::plan(guard.root().to_str().ok_or("资料库路径无效")?, old, new)?;
    if !plan.blockers.is_empty() {
        return Err(format!(
            "为保持图片和链接可用，本次尚未移动。请先处理：{}",
            plan.blockers
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("；")
        )
        .into());
    }
    let mut paths = vec![old.to_owned(), new.to_owned()];
    for edit in &plan.documents {
        paths.push(edit.source.clone());
        paths.push(edit.target.clone());
    }
    let directory = old.is_dir();
    let mut edits = plan
        .documents
        .into_iter()
        .map(
            |DocumentEdit {
                 source,
                 target,
                 original,
                 replacement,
                 ..
             }| Edit {
                source,
                target,
                original,
                replacement,
            },
        )
        .collect::<Vec<_>>();
    let extra = pdf_companions(old, new)?;
    let companions = extra
        .iter()
        .map(|e| (e.source.clone(), e.target.clone()))
        .collect();
    for edit in &extra {
        paths.push(edit.source.clone());
        paths.push(edit.target.clone());
    }
    edits.extend(extra);
    if let Some(app) = app {
        protection = Some(super::move_windows::Protection::begin(
            app,
            guard.root(),
            &paths,
            &edits
                .iter()
                .map(|edit| edit.source.clone())
                .collect::<Vec<_>>(),
        )?);
    }
    for edit in &edits {
        if fs::read_to_string(&edit.source).map_err(|e| e.to_string())? != edit.original {
            return Err("引用文档在检查期间有新修改，未移动，请重试".into());
        }
    }
    let stage = Stage::begin(
        &cache,
        Record {
            version: 1,
            root: guard.root().to_owned(),
            source: old.to_owned(),
            target: new.to_owned(),
            documents: edits,
            companions,
        },
    )?;
    let rewrite = (|| -> Result<(), String> {
        for edit in &stage.record.documents {
            if fs::read_to_string(&edit.source).map_err(|e| e.to_string())? != edit.original {
                return Err("引用文档已有新修改".into());
            }
            if edit.source.extension().is_some_and(|ext| {
                ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown")
            }) {
                crate::commands::history::save_reference_snapshot(
                    &cache,
                    &edit.source,
                    &edit.original,
                )?;
            }
            write_utf8(&edit.source, &edit.replacement)?;
            if fs::read_to_string(&edit.source).map_err(|e| e.to_string())? != edit.replacement {
                return Err("引用更新结果需要核对".into());
            }
        }
        Ok(())
    })();
    if let Err(error) = rewrite {
        return match stage.rollback_documents() {
            Ok(()) => {
                stage.finish("rolledBack")?;
                Err(format!("{error}；已恢复本次引用修改，文件未移动").into())
            }
            Err(restore) => Err(stage.failure(format!("{error}；{restore}"))),
        };
    }
    let move_document = || {
        crate::commands::file_relations::rename_with_relations(guard.root(), old, new)?;
        if let Err(error) = align_companions(&stage.record, true) {
            align_companions(&stage.record, false)
                .map_err(|rollback| format!("{error}；{rollback}"))?;
            crate::commands::file_relations::rename_with_relations(guard.root(), new, old)
                .map_err(|rollback| format!("{error}；位置还原失败：{rollback}"))?;
            return Err(error);
        }
        Ok(())
    };
    let result = super::file_move_history::with_history_move(&cache, old, new, move_document);
    if let Err(failure) = result {
        if failure.disposition == FailureDisposition::NotExecuted && old.exists() && !new.exists() {
            return match stage.rollback_documents() {
                Ok(()) => {
                    stage.finish("rolledBack")?;
                    Err(failure)
                }
                Err(error) => Err(stage.failure(error)),
            };
        }
        return Err(stage.failure(failure.message));
    }
    if directory {
        super::file_activity::remember_move(old, new);
    }
    if let Some(protection) = &mut protection {
        protection.completed(super::move_windows::Notice {
            root: guard.root().to_string_lossy().into_owned(),
            old_path: old.to_string_lossy().into_owned(),
            new_path: new.to_string_lossy().into_owned(),
            documents: stage
                .record
                .documents
                .iter()
                .map(|e| e.target.to_string_lossy().into_owned())
                .collect(),
        });
    }
    if let Some(app) = app {
        use tauri::Manager;
        app.state::<super::external_file_access::ExternalFileAccess>()
            .relocate_authorizations(old, new)
            .map_err(|e| stage.failure(e))?;
    }
    stage.finish("completed")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReview {
    old_path: String,
    new_path: String,
    summary: String,
    can_finish: bool,
    can_restore: bool,
    can_export: bool,
}
fn recovery_stage(cache: &Path, root: &Path, id: &str) -> Result<Stage, String> {
    if id.starts_with(".move-stage-") {
        let (_, intent) = super::file_move_journal::pending(cache)?
            .into_iter()
            .find(|(name, _)| name == id)
            .ok_or("此历史移动记录已核对或不存在")?;
        let guard = WorkspaceGuard::new(root)?;
        guard.resolve_for_write(&intent.source)?;
        guard.resolve_for_write(&intent.target)?;
        return Ok(Stage {
            path: cache.join(".file-moves").join(id),
            record: Record {
                version: 1,
                root: root.to_owned(),
                source: intent.source,
                target: intent.target,
                documents: vec![],
                companions: vec![],
            },
        });
    }
    if !id.starts_with("links-") || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("此记录需要核对原历史位置，不能直接重试移动".into());
    }
    let path = cache.join(".link-moves").join(id);
    let record = read_stage(&path)?;
    if record.root != root {
        return Err("核对记录不属于当前资料库".into());
    }
    Ok(Stage { path, record })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryItem {
    id: String,
    old_path: String,
    new_path: String,
}
#[tauri::command]
pub async fn list_library_move_recoveries(
    app: tauri::AppHandle,
    library_root: String,
) -> Result<Vec<RecoveryItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let cache = crate::commands::history::history_cache_root(&app)?;
        let mut result = Vec::new();
        let directory = cache.join(".link-moves");
        if directory.try_exists().map_err(|e| e.to_string())? {
            for (index, entry) in fs::read_dir(directory)
                .map_err(|e| e.to_string())?
                .enumerate()
            {
                if index >= 512 {
                    return Err("移动记录过多，请先核对已有记录".into());
                }
                let path = entry.map_err(|e| e.to_string())?.path();
                if path
                    .file_name()
                    .is_some_and(|s| s.to_string_lossy().starts_with(".done-"))
                {
                    continue;
                }
                let record = read_stage(&path)?;
                if record.root == guard.root() && !terminal_valid(&path)? {
                    result.push(RecoveryItem {
                        id: path.file_name().unwrap().to_string_lossy().into_owned(),
                        old_path: record.source.to_string_lossy().into_owned(),
                        new_path: record.target.to_string_lossy().into_owned(),
                    });
                }
            }
        }
        for (id, intent) in super::file_move_journal::pending(&cache)? {
            if guard.resolve_for_write(&intent.source).is_ok()
                && guard.resolve_for_write(&intent.target).is_ok()
                && !result.iter().any(|item| {
                    Path::new(&item.old_path) == intent.source
                        && Path::new(&item.new_path) == intent.target
                })
            {
                result.push(RecoveryItem {
                    id,
                    old_path: intent.source.to_string_lossy().into_owned(),
                    new_path: intent.target.to_string_lossy().into_owned(),
                });
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn position(record: &Record) -> Result<bool, String> {
    match (
        record.source.try_exists().map_err(|e| e.to_string())?,
        record.target.try_exists().map_err(|e| e.to_string())?,
    ) {
        (false, true) => Ok(true),
        (true, false) => Ok(false),
        _ => {
            Err("原位置和新位置同时存在或都不存在，请先核对文件；不会覆盖或删除其中任何一份".into())
        }
    }
}
fn inspect_edits(record: &Record, forward: bool) -> Result<(), String> {
    for edit in &record.documents {
        let current = if record
            .companions
            .iter()
            .any(|(source, _)| source == &edit.source)
        {
            companion_path(&edit.source, &edit.target)?
        } else {
            if forward {
                edit.target.clone()
            } else {
                edit.source.clone()
            }
        };
        let path = &current;
        let text =
            fs::read_to_string(path).map_err(|e| format!("无法核对 {}：{e}", path.display()))?;
        if text != edit.original && text != edit.replacement {
            return Err(format!(
                "{} 在中断后有新修改，未覆盖；请保留两版内容后再处理",
                path.display()
            ));
        }
    }
    Ok(())
}
fn inspect_recovery(stage: &Stage) -> RecoveryReview {
    let observed = position(&stage.record);
    let valid = observed
        .as_ref()
        .ok()
        .and_then(|forward| inspect_edits(&stage.record, *forward).err());
    let summary = match (&observed, &valid) {
        (Ok(true), None) => {
            "文件位于新位置，可按当前位置完成引用与历史核对，也可还原本次移动。".into()
        }
        (Ok(false), None) => "文件仍在原位置，可还原本次尚未完成的引用修改并结束核对。".into(),
        (Err(error), _) => error.clone(),
        (_, Some(error)) => error.clone(),
    };
    RecoveryReview {
        old_path: stage.record.source.to_string_lossy().into_owned(),
        new_path: stage.record.target.to_string_lossy().into_owned(),
        summary,
        can_finish: observed.is_ok() && valid.is_none(),
        can_restore: observed == Ok(true) && valid.is_none(),
        can_export: !stage.record.documents.is_empty(),
    }
}

fn export_originals(stage: &Stage, directory: &Path) -> Result<PathBuf, String> {
    let directory = directory.canonicalize().map_err(|e| e.to_string())?;
    if !directory.is_dir() {
        return Err("请选择用于存放原文副本的文件夹".into());
    }
    let _activity = super::file_activity::read_write(&[&directory])?;
    if stage.record.documents.is_empty() {
        return Err("此记录没有需要恢复的原文修改".into());
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let mut output = None;
    for index in 0..1000 {
        let candidate = directory.join(format!("移动前原文-{timestamp}-{index}"));
        match fs::create_dir(&candidate) {
            Ok(()) => {
                output = Some(candidate);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    let output = output.ok_or("同名副本目录过多，请选择其他位置")?;
    let mut description = String::from(
        "这些副本是本次移动或改名前的原文。当前资料和未完成记录均保留，没有覆盖任何文件。\n\n",
    );
    for (index, edit) in stage.record.documents.iter().enumerate() {
        let name = format!(
            "{:03}-{}",
            index + 1,
            edit.source
                .file_name()
                .ok_or("原文名称不完整")?
                .to_string_lossy()
        );
        write_new_bytes(output.join(&name), edit.original.as_bytes()).map_err(|e| {
            format!(
                "副本尚未全部写完，已写出的文件保留在 {}：{e}",
                output.display()
            )
        })?;
        description.push_str(&format!(
            "{name} ← {}\n",
            edit.source
                .strip_prefix(&stage.record.root)
                .unwrap_or(&edit.source)
                .display()
        ));
    }
    write_new_bytes(output.join("说明.txt"), description.as_bytes())?;
    Ok(output)
}
#[tauri::command]
pub async fn export_library_move_originals(
    app: tauri::AppHandle,
    library_root: String,
    recovery_id: String,
    target_dir: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let cache = crate::commands::history::history_cache_root(&app)?;
        let stage = recovery_stage(&cache, guard.root(), &recovery_id)?;
        export_originals(&stage, Path::new(&target_dir))
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn review_library_move(
    app: tauri::AppHandle,
    library_root: String,
    recovery_id: String,
) -> Result<RecoveryReview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(library_root)?;
        let cache = crate::commands::history::history_cache_root(&app)?;
        let stage = recovery_stage(&cache, guard.root(), &recovery_id)?;
        Ok(inspect_recovery(&stage))
    })
    .await
    .map_err(|e| e.to_string())?
}
fn resolve_stage(
    app: Option<&tauri::AppHandle>,
    cache: &Path,
    stage: Stage,
    restore: bool,
) -> Result<super::move_windows::Notice, String> {
    let mut protection = None;
    let _activity = super::file_activity::relocate(&stage.record.root)?;
    let _documents = super::document_coordination::acquire(&[&stage.record.root])?;
    let at_target = position(&stage.record)?;
    inspect_edits(&stage.record, at_target)?;
    let mut paths = vec![stage.record.source.clone(), stage.record.target.clone()];
    for edit in &stage.record.documents {
        paths.push(edit.source.clone());
        paths.push(edit.target.clone());
    }
    if let Some(app) = app {
        protection = Some(super::move_windows::Protection::begin(
            app,
            &stage.record.root,
            &paths,
            &paths,
        )?);
    }
    let desired = at_target && !restore;
    let journals = super::file_move_journal::reconcile_histories(
        cache,
        &stage.record.source,
        &stage.record.target,
        desired,
        false,
    )?;
    if restore && at_target {
        let move_back = || {
            crate::commands::file_relations::rename_with_relations(
                &stage.record.root,
                &stage.record.target,
                &stage.record.source,
            )
        };
        if journals == 0 {
            super::file_move_history::with_history_move(
                cache,
                &stage.record.target,
                &stage.record.source,
                move_back,
            )
            .map_err(|e| e.message)?;
        } else {
            move_back()?;
        }
    }
    align_companions(&stage.record, desired)?;
    for edit in &stage.record.documents {
        let path = if desired { &edit.target } else { &edit.source };
        let before = fs::read_to_string(path).map_err(|e| e.to_string())?;
        if before != edit.original && before != edit.replacement {
            return Err("核对期间文档已变化，原文记录继续保留".into());
        }
        let after = if desired {
            &edit.replacement
        } else {
            &edit.original
        };
        if &before != after {
            write_utf8(path, after)?;
        }
    }
    super::file_move_journal::reconcile_histories(
        cache,
        &stage.record.source,
        &stage.record.target,
        desired,
        true,
    )?;
    stage
        .finish(if desired { "completed" } else { "rolledBack" })
        .map_err(|e| e.message)?;
    let (old, new) = if desired {
        (&stage.record.source, &stage.record.target)
    } else {
        (&stage.record.target, &stage.record.source)
    };
    if new.is_dir() {
        super::file_activity::remember_move(old, new);
    }
    if let Some(app) = app {
        use tauri::Manager;
        app.state::<super::external_file_access::ExternalFileAccess>()
            .relocate_authorizations(old, new)?;
    }
    let notice = super::move_windows::Notice {
        root: stage.record.root.to_string_lossy().into_owned(),
        old_path: old.to_string_lossy().into_owned(),
        new_path: new.to_string_lossy().into_owned(),
        documents: stage
            .record
            .documents
            .iter()
            .map(|e| if desired { &e.target } else { &e.source })
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
    };
    if let Some(protection) = &mut protection {
        protection.completed(notice.clone());
    }
    Ok(notice)
}
#[tauri::command]
pub async fn resolve_library_move(
    app: tauri::AppHandle,
    library_root: String,
    recovery_id: String,
    restore: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _history = crate::commands::history::history_lease(&app)?;
        let guard = WorkspaceGuard::new(library_root)?;
        let cache = crate::commands::history::history_cache_root(&app)?;
        let stage = recovery_stage(&cache, guard.root(), &recovery_id)?;
        resolve_stage(Some(&app), &cache, stage, restore).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "file_move_recovery_tests.rs"]
mod recovery_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::test_workspace::TestWorkspace;
    fn run(f: &TestWorkspace, old: &str, new: &str) -> Result<(), MoveFailure> {
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        execute(None, &guard, &f.0.join(old), &f.0.join(new))
    }
    #[test]
    fn moving_markdown_rewrites_relative_images_and_documents_without_moving_shared_assets() {
        let f = TestWorkspace::new();
        f.dir("assets");
        f.dir("notes");
        fs::write(f.0.join("assets/图.png"), b"shared image").unwrap();
        fs::write(f.0.join("other.md"), "other").unwrap();
        fs::write(
            f.0.join("note.md"),
            "![图](assets/图.png)\r\n[另文](other.md#part)\r\n",
        )
        .unwrap();
        run(&f, "note.md", "notes/note.md").unwrap();
        let text = fs::read_to_string(f.0.join("notes/note.md")).unwrap();
        assert!(text.contains("../assets/"));
        assert!(text.contains("../other.md#part"));
        assert!(text.contains("\r\n"));
        assert_eq!(
            fs::read(f.0.join("assets/图.png")).unwrap(),
            b"shared image"
        );
        assert!(!f.0.join("note.md").exists());
    }
    #[test]
    fn renaming_an_image_updates_all_incoming_notes_and_keeps_surrounding_text() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("old.png"), b"image").unwrap();
        for name in ["a.md", "b.md"] {
            fs::write(f.0.join(name), "keep\n![photo](old.png)\nend").unwrap();
        }
        run(&f, "old.png", "new.png").unwrap();
        for name in ["a.md", "b.md"] {
            assert_eq!(
                fs::read_to_string(f.0.join(name)).unwrap(),
                "keep\n![photo](new.png)\nend"
            );
        }
        assert_eq!(fs::read(f.0.join("new.png")).unwrap(), b"image");
    }
    #[test]
    fn directory_moves_keep_internal_links_and_update_outside_references() {
        let f = TestWorkspace::new();
        f.dir("project");
        f.dir("archive");
        fs::write(f.0.join("shared.png"), b"shared").unwrap();
        fs::write(f.0.join("project/local.md"), "local").unwrap();
        fs::write(
            f.0.join("project/note.md"),
            "[local](local.md) ![shared](../shared.png)",
        )
        .unwrap();
        fs::write(f.0.join("index.md"), "[note](project/note.md)").unwrap();
        run(&f, "project", "archive/project").unwrap();
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[note](archive/project/note.md)"
        );
        assert_eq!(
            fs::read_to_string(f.0.join("archive/project/note.md")).unwrap(),
            "[local](local.md) ![shared](../../shared.png)"
        );
        assert!(f.0.join("shared.png").exists());
    }
    #[test]
    fn undo_recomputes_links_and_migrates_original_snapshots_without_overwrite() {
        let f = TestWorkspace::new();
        f.dir("notes");
        fs::write(f.0.join("photo.png"), b"image").unwrap();
        let original = "![p](photo.png)";
        fs::write(f.0.join("a.md"), original).unwrap();
        run(&f, "a.md", "notes/a.md").unwrap();
        let cache = f.0.join(".longedit/move-records");
        let history = super::super::archive_history::history_path(&cache, &f.0.join("notes/a.md"));
        assert!(fs::read_dir(&history)
            .unwrap()
            .any(|e| fs::read_to_string(e.unwrap().path()).unwrap() == original));
        run(&f, "notes/a.md", "a.md").unwrap();
        assert_eq!(fs::read_to_string(f.0.join("a.md")).unwrap(), original);
        let history = super::super::archive_history::history_path(&cache, &f.0.join("a.md"));
        assert!(fs::read_dir(history).unwrap().count() >= 2);
    }
    #[test]
    fn occupied_destination_does_not_change_any_source_or_reference() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("a.md"), "a").unwrap();
        fs::write(f.0.join("b.md"), "b").unwrap();
        fs::write(f.0.join("index.md"), "[a](a.md)").unwrap();
        assert!(run(&f, "a.md", "b.md").is_err());
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[a](a.md)"
        );
        assert_eq!(fs::read_to_string(f.0.join("b.md")).unwrap(), "b");
    }
    #[test]
    fn history_collision_rolls_back_reference_edits_and_keeps_original_history() {
        let f = TestWorkspace::new();
        f.dir("notes");
        fs::write(f.0.join("photo.png"), b"image").unwrap();
        fs::write(f.0.join("a.md"), "![p](photo.png)").unwrap();
        let cache = f.0.join(".longedit/move-records");
        let destination =
            super::super::archive_history::history_path(&cache, &f.0.join("notes/a.md"));
        fs::create_dir_all(&destination).unwrap();
        fs::write(destination.join("10.md"), "previous deleted document").unwrap();
        assert!(run(&f, "a.md", "notes/a.md").is_err());
        assert_eq!(
            fs::read_to_string(f.0.join("a.md")).unwrap(),
            "![p](photo.png)"
        );
        assert!(!f.0.join("notes/a.md").exists());
        assert_eq!(
            fs::read_to_string(destination.join("10.md")).unwrap(),
            "previous deleted document"
        );
        pending(&cache, &f.0).unwrap();
    }
    #[test]
    fn unsatisfied_reference_checks_leave_document_and_location_untouched() {
        let f = TestWorkspace::new();
        f.dir("notes");
        fs::write(f.0.join("a.md"), "![missing](missing.png)").unwrap();
        assert!(run(&f, "a.md", "notes/a.md").is_err());
        assert_eq!(
            fs::read_to_string(f.0.join("a.md")).unwrap(),
            "![missing](missing.png)"
        );
        assert!(!f.0.join("notes/a.md").exists());
    }
    #[test]
    fn an_in_flight_save_prevents_relocation_before_references_are_written() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("a.md"), "a").unwrap();
        fs::write(f.0.join("index.md"), "[a](a.md)").unwrap();
        let lease = super::super::document_coordination::acquire(&[&f.0.join("index.md")]).unwrap();
        let root = f.0.clone();
        assert!(std::thread::spawn(move || {
            let guard = WorkspaceGuard::new(&root).unwrap();
            execute(None, &guard, &root.join("a.md"), &root.join("b.md")).is_err()
        })
        .join()
        .unwrap());
        drop(lease);
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[a](a.md)"
        );
    }
    #[test]
    fn ordinary_titles_reference_definitions_and_literal_html_keep_their_surrounding_syntax() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("note.md"), "body").unwrap();
        fs::write(f.0.join("image.png"), b"image").unwrap();
        let original="[inline](note.md \"keep title\") [reference][n] ![image][p]\n\n[n]: note.md 'keep reference title'\n[p]: image.png\n\n<img src=\"image.png\" width=\"120\">\n`[code](note.md)`\n<!-- <img src=\"image.png\"> -->\n";
        fs::write(f.0.join("index.md"), original).unwrap();
        run(&f, "note.md", "renamed.md").unwrap();
        run(&f, "image.png", "renamed.png").unwrap();
        let text = fs::read_to_string(f.0.join("index.md")).unwrap();
        assert!(text.contains("[inline](renamed.md \"keep title\")"));
        assert!(text.contains("[n]: renamed.md 'keep reference title'"));
        assert!(text.contains("[p]: renamed.png"));
        assert!(text.contains("<img src=\"renamed.png\" width=\"120\">"));
        assert!(text.contains("`[code](note.md)`"));
        assert!(text.contains("<!-- <img src=\"image.png\"> -->"));
    }
    #[test]
    fn a_reference_definition_at_end_of_file_does_not_require_an_extra_newline() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("a.md"), "body").unwrap();
        fs::write(f.0.join("index.md"), "[a][n]\n\n[n]: a.md").unwrap();
        run(&f, "a.md", "b.md").unwrap();
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[a][n]\n\n[n]: b.md"
        );
    }
    #[test]
    fn pdf_rename_and_undo_keep_annotations_and_ocr_with_the_document() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("old.pdf"), b"%PDF original bytes").unwrap();
        for suffix in ["annotations.json", "ocr.json"] {
            fs::write(f.0.join(format!("old.pdf.{suffix}")),"{\"source\":{\"pdfFile\":\"old.pdf\",\"size\":19},\"notes\":[\"keep all annotations\"]}").unwrap();
        }
        run(&f, "old.pdf", "new.pdf").unwrap();
        for suffix in ["annotations.json", "ocr.json"] {
            let value: serde_json::Value =
                serde_json::from_slice(&fs::read(f.0.join(format!("new.pdf.{suffix}"))).unwrap())
                    .unwrap();
            assert_eq!(value["source"]["pdfFile"], "new.pdf");
            assert_eq!(value["notes"][0], "keep all annotations");
            assert!(!f.0.join(format!("old.pdf.{suffix}")).exists());
        }
        run(&f, "new.pdf", "old.pdf").unwrap();
        assert_eq!(
            fs::read(f.0.join("old.pdf")).unwrap(),
            b"%PDF original bytes"
        );
        assert!(fs::read_to_string(f.0.join("old.pdf.annotations.json"))
            .unwrap()
            .contains("old.pdf"));
    }
    #[test]
    fn occupied_pdf_sidecar_preserves_both_records_and_does_not_move_the_pdf() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("old.pdf"), b"pdf").unwrap();
        fs::write(
            f.0.join("old.pdf.annotations.json"),
            "{\"source\":{\"pdfFile\":\"old.pdf\"}}",
        )
        .unwrap();
        fs::write(
            f.0.join("new.pdf.annotations.json"),
            "unrelated annotations",
        )
        .unwrap();
        assert!(run(&f, "old.pdf", "new.pdf").is_err());
        assert!(f.0.join("old.pdf").exists());
        assert_eq!(
            fs::read_to_string(f.0.join("new.pdf.annotations.json")).unwrap(),
            "unrelated annotations"
        );
    }
}
