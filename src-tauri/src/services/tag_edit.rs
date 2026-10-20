//! Bounded, read-only tag plans and explicit, per-file compare-before-write.
//! The command adapter must additionally hold live cross-window protection.
use super::{inline_tags, reliable_write, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};

const MAX_FILE: usize = 20 * 1024 * 1024;
const MAX_RETAINED: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 64;
const TTL: Duration = Duration::from_secs(300);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Operation {
    Add { tag: String },
    Rename { from: String, to: String },
    Remove { tag: String },
}

#[cfg(test)]
#[path = "tag_edit_tests.rs"]
mod tests;
impl Operation {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let new_tag = |tag: &str| {
            inline_tags::validate(tag)?;
            if tag.chars().count() > 80 {
                return Err("新标签最多 80 个字符".into());
            }
            Ok(())
        };
        match self {
            Self::Add { tag } => new_tag(tag),
            Self::Remove { tag } => inline_tags::validate(tag),
            Self::Rename { from, to } => {
                inline_tags::validate(from)?;
                new_tag(to)?;
                if from == to {
                    return Err("新旧标签相同，无需修改正文".into());
                }
                Ok(())
            }
        }
    }
    fn transform(&self, before: &str) -> Result<(String, usize), String> {
        if let Self::Add { tag } = self {
            if inline_tags::TAGS
                .captures_iter(before)
                .any(|capture| &capture[1] == tag)
            {
                return Ok((before.into(), 0));
            }
            let eol = if before.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            let gap = if before.trim_start_matches('\u{feff}').is_empty() || before.ends_with('\n')
            {
                ""
            } else {
                eol
            };
            if before.len() + gap.len() + 1 + tag.len() + eol.len() > MAX_FILE {
                return Err("修改后的笔记超过 20 MiB，请单独编辑".into());
            }
            return Ok((format!("{before}{gap}#{tag}{eol}"), 1));
        }
        let wanted = match self {
            Self::Rename { from, .. } => from,
            Self::Remove { tag } => tag,
            _ => unreachable!(),
        };
        let mut ranges = Vec::new();
        let mut output_size = before.len();
        for capture in inline_tags::TAGS.captures_iter(before) {
            let name = capture.get(1).unwrap();
            if name.as_str() == wanted {
                if ranges.len() >= 100_000 {
                    return Err("单篇笔记需修改的标签超过 10 万处，请单独编辑".into());
                }
                if let Self::Rename { to, .. } = self {
                    output_size = output_size
                        .saturating_sub(name.len())
                        .saturating_add(to.len());
                    if output_size > MAX_FILE {
                        return Err("修改后的笔记超过 20 MiB，请单独编辑".into());
                    }
                }
                ranges.push((name.start(), name.end()));
            }
        }
        let mut after = String::with_capacity(output_size);
        let mut cursor = 0;
        for &(start, end) in &ranges {
            match self {
                Self::Rename { to, .. } => {
                    after.push_str(&before[cursor..start]);
                    after.push_str(to);
                }
                Self::Remove { .. } => after.push_str(&before[cursor..start - 1]),
                _ => unreachable!(),
            }
            cursor = end;
        }
        after.push_str(&before[cursor..]);
        Ok((after, ranges.len()))
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PreviewState {
    Ready,
    Unchanged,
    Excluded,
    Unavailable,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewItem {
    pub index: usize,
    pub path: String,
    pub state: PreviewState,
    pub changes: usize,
    pub message: String,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Outcome {
    Completed,
    NotExecuted,
    NeedsReview,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemResult {
    pub index: usize,
    pub path: String,
    pub outcome: Outcome,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Report {
    pub items: Vec<ItemResult>,
}
struct Content {
    path: PathBuf,
    before: String,
    after: String,
    modified: Option<SystemTime>,
    digest: [u8; 32],
}
pub(crate) struct Plan {
    guard: WorkspaceGuard,
    created: Instant,
    items: Vec<PreviewItem>,
    edits: Vec<Option<Content>>,
    retained: usize,
    applied: Option<(Vec<usize>, Report)>,
}
fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/");
    let value = if value.to_ascii_lowercase().starts_with("//?/unc/") {
        format!("//{}", &value[8..])
    } else {
        value.strip_prefix("//?/").unwrap_or(&value).to_owned()
    };
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}
fn checked_path(guard: &WorkspaceGuard, input: &Path) -> Result<PathBuf, String> {
    let resolved = guard.resolve_existing_file(input, &["md", "markdown"])?;
    let candidate = if input.is_absolute() {
        input.to_owned()
    } else {
        guard.root().join(input)
    };
    if path_key(&candidate) != path_key(&resolved) {
        return Err("别名或链接路径不能用于批量改写，请从资料库原文件选择".into());
    }
    let relative = resolved
        .strip_prefix(guard.root())
        .map_err(|_| "文件不在当前资料库")?;
    if relative.components().any(|part| {
        let part = part.as_os_str().to_string_lossy();
        super::library_visibility::hidden_name(&part)
    }) || crate::formats::file_registry::is_sensitive_path(&resolved)
    {
        return Err("内部记录或敏感文件不能批量改写".into());
    }
    if crate::formats::file_registry::file_format_for_path(&resolved)?.id != "markdown" {
        return Err("仅支持已保存的 Markdown 笔记".into());
    }
    let metadata = fs::symlink_metadata(&resolved).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.permissions().readonly()
    {
        return Err("文件不是可写的普通笔记".into());
    }
    if reliable_write::has_interrupted_write(&resolved)? {
        return Err("文件有未处理的保存恢复记录，请先核对；本次未自动恢复或写入".into());
    }
    Ok(resolved)
}
fn read(path: &Path) -> Result<(String, Option<SystemTime>), String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if metadata.len() > MAX_FILE as u64 {
        return Err("笔记超过 20 MiB，请单独编辑".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE {
        return Err("笔记已增大，请重新预览".into());
    }
    Ok((
        String::from_utf8(bytes).map_err(|_| "笔记不是有效 UTF-8，本次未转换编码")?,
        metadata.modified().ok(),
    ))
}
impl Plan {
    pub(crate) fn prepare(
        root: &Path,
        operation: &Operation,
        paths: &[String],
        excluded: &[String],
    ) -> Result<Self, String> {
        operation.validate()?;
        if paths.is_empty()
            || paths.len() > MAX_FILES
            || excluded.len() > MAX_FILES
            || paths.iter().chain(excluded).any(|path| path.len() > 4096)
        {
            return Err("请明确选择 1 至 64 篇笔记，更多笔记请分批整理".into());
        }
        let guard = WorkspaceGuard::new(root)?;
        let excluded = excluded
            .iter()
            .map(|path| path_key(Path::new(path)))
            .collect::<BTreeSet<_>>();
        let mut plan = Self {
            guard,
            created: Instant::now(),
            items: Vec::new(),
            edits: Vec::new(),
            retained: 0,
            applied: None,
        };
        let mut seen = BTreeSet::new();
        for (index, input) in paths.iter().enumerate() {
            let absolute = if Path::new(input).is_absolute() {
                PathBuf::from(input)
            } else {
                plan.guard.root().join(input)
            };
            if !seen.insert(path_key(&absolute)) {
                return Err("同一笔记被重复选择，请重新预览".into());
            }
            let mut item = PreviewItem {
                index,
                path: input.clone(),
                state: PreviewState::Unavailable,
                changes: 0,
                message: String::new(),
            };
            let mut edit = None;
            if excluded.contains(&path_key(&absolute)) {
                item.state = PreviewState::Excluded;
                item.message = "本窗口有未保存内容，已排除，不会自动代存".into();
            } else {
                let inspected = (|| {
                    let path = checked_path(&plan.guard, Path::new(input))?;
                    let _lease = super::document_coordination::acquire(&[path.as_path()])?;
                    let (before, modified) = read(&path)?;
                    checked_path(&plan.guard, &path)?;
                    let (after, changes) = operation.transform(&before)?;
                    if changes == 0 {
                        item.state = PreviewState::Unchanged;
                        item.message = "正文无需改变".into();
                        return Ok(());
                    }
                    let amount = before.len().saturating_add(after.len());
                    if plan.retained.saturating_add(amount) > MAX_RETAINED {
                        return Err("本批原文与修改预览超过 32 MiB，请减少所选笔记".into());
                    }
                    if after.len() > MAX_FILE {
                        return Err("修改后的笔记超过 20 MiB，请单独编辑".into());
                    }
                    let digest = Sha256::digest(before.as_bytes()).into();
                    plan.retained += amount;
                    item.path = path.to_string_lossy().into_owned();
                    item.state = PreviewState::Ready;
                    item.changes = changes;
                    item.message = "将修改已保存的 Markdown 正文；执行前保存原文历史".into();
                    edit = Some(Content {
                        path,
                        before,
                        after,
                        modified,
                        digest,
                    });
                    Ok::<_, String>(())
                })();
                if let Err(message) = inspected {
                    item.message = message;
                }
            }
            plan.items.push(item);
            plan.edits.push(edit);
        }
        Ok(plan)
    }
    pub(crate) fn preview(&self) -> &[PreviewItem] {
        &self.items
    }
    pub(crate) fn expired(&self) -> bool {
        self.created.elapsed() >= TTL
    }
    pub(crate) fn root(&self) -> &Path {
        self.guard.root()
    }
    pub(crate) fn receipt(&self, selected: &[usize]) -> Result<Option<Report>, String> {
        self.validate_selection(selected)?;
        let mut selected = selected.to_vec();
        selected.sort_unstable();
        match &self.applied {
            Some((previous, report)) if previous == &selected => Ok(Some(report.clone())),
            Some(_) => Err("此预览已经执行，不能更改选择再执行；请重新预览".into()),
            None => Ok(None),
        }
    }
    pub(crate) fn paths(&self, selected: &[usize]) -> Result<Vec<PathBuf>, String> {
        self.validate_selection(selected)?;
        Ok(selected
            .iter()
            .map(|index| self.edits[*index].as_ref().unwrap().path.clone())
            .collect())
    }
    fn validate_selection(&self, selected: &[usize]) -> Result<(), String> {
        if selected.is_empty()
            || selected.len() > MAX_FILES
            || selected.iter().copied().collect::<BTreeSet<_>>().len() != selected.len()
            || selected
                .iter()
                .any(|index| self.edits.get(*index).and_then(Option::as_ref).is_none())
        {
            return Err("请选择预览中可执行的笔记；没有开始写入".into());
        }
        Ok(())
    }
    // The caller holds editing protection. This acquires all participating path
    // leases before any write. It never retries other failed files automatically.
    pub(crate) fn apply(
        &mut self,
        selected: &[usize],
        mut ready: impl FnMut() -> Result<(), String>,
        mut snapshot: impl FnMut(&Path, &str) -> Result<(), String>,
    ) -> Result<Report, String> {
        self.apply_with_writer(selected, &mut ready, &mut snapshot, |path, content| {
            reliable_write::write_utf8(path, content)
        })
    }
    fn apply_with_writer(
        &mut self,
        selected: &[usize],
        ready: &mut impl FnMut() -> Result<(), String>,
        snapshot: &mut impl FnMut(&Path, &str) -> Result<(), String>,
        mut write: impl FnMut(&Path, &str) -> Result<(), String>,
    ) -> Result<Report, String> {
        self.validate_selection(selected)?;
        let mut selected = selected.to_vec();
        selected.sort_unstable();
        if let Some((previous, report)) = &self.applied {
            return if previous == &selected {
                Ok(report.clone())
            } else {
                Err("此预览已执行，不能更改选择再执行；请查看结果或重新预览".into())
            };
        }
        if self.expired() {
            return Err("预览已超过 5 分钟，请重新预览核对正文".into());
        }
        let paths = self.paths(&selected)?;
        let _lease = super::document_coordination::acquire(
            &paths.iter().map(PathBuf::as_path).collect::<Vec<_>>(),
        )?;
        ready()?;
        let mut stopped = None;
        let mut items = Vec::new();
        for item in &self.items {
            let mut result = ItemResult {
                index: item.index,
                path: item.path.clone(),
                outcome: Outcome::NotExecuted,
                message: "未选择执行".into(),
            };
            if !selected.contains(&item.index) {
                if item.state != PreviewState::Ready {
                    result.message = item.message.clone();
                }
                items.push(result);
                continue;
            }
            if let Err(error) = ready() {
                stopped = Some(error);
            }
            if let Some(error) = &stopped {
                result.message = format!("已暂停后续写入：{error}");
                items.push(result);
                continue;
            }
            let edit = self.edits[item.index].as_ref().unwrap();
            let outcome = (|| {
                self.verify(edit)?;
                snapshot(&edit.path, &edit.before)
                    .map_err(|message| format!("原文历史未保存，尚未修改正文：{message}"))?;
                // Snapshotting can take time: compare again after history and
                // immediately before reliable promotion. Not an OS file lock.
                self.verify(edit)?;
                ready()?;
                Ok::<_, String>(())
            })();
            match outcome {
                Err(message) => result.message = message,
                Ok(()) => {
                    let written = write(&edit.path, &edit.after);
                    match checked_path(&self.guard, &edit.path).and_then(|path| read(&path)) {
                        Ok((actual, _)) if actual == edit.after => {
                            result.outcome = Outcome::Completed;
                            result.message = if let Err(error) = written {
                                format!(
                                    "正文已写入且核对一致，原文历史已保留；保存过程提示：{error}"
                                )
                            } else {
                                "已修改并核对正文，原文历史已保留".into()
                            };
                        }
                        Ok((actual, _)) if actual == edit.before && written.is_err() => {
                            result.message =
                                format!("正文仍为原文，未执行成功：{}", written.unwrap_err());
                        }
                        _ => {
                            result.outcome = Outcome::NeedsReview;
                            result.message = "保存后正文与预期不一致或无法核对，请查看当前文件及原文历史；不会自动重试或回滚覆盖".into();
                        }
                    }
                }
            }
            items.push(result);
        }
        let report = Report { items };
        self.applied = Some((selected, report.clone()));
        // Keep receipts, not complete document bodies, after an applied plan.
        self.edits.iter_mut().flatten().for_each(|edit| {
            edit.before = String::new();
            edit.after = String::new();
        });
        self.retained = 0;
        Ok(report)
    }
    fn verify(&self, edit: &Content) -> Result<(), String> {
        if checked_path(&self.guard, &edit.path)? != edit.path {
            return Err("文件位置已变化，请重新预览".into());
        }
        let (actual, modified) = read(&edit.path)?;
        if modified != edit.modified
            || <[u8; 32]>::from(Sha256::digest(actual.as_bytes())) != edit.digest
        {
            return Err("正文自预览后已被修改，本次未覆盖，请重新预览".into());
        }
        Ok(())
    }
}
