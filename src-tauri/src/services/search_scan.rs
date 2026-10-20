//! Query-scoped, cooperative work limits. A paused walker retains its exact
//! iterator position; exhausting a budget is never equivalent to an empty tree.
use super::{knowledge_index::IndexedSource, workspace_guard::WorkspaceGuard};
use crate::formats::file_registry::{file_format_for_path, is_sensitive_path};
use std::{
    fs,
    path::PathBuf,
    time::{Duration, Instant, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchLimits {
    pub entries: usize,
    pub sources: usize,
    pub read_bytes: u64,
    pub segments: usize,
    pub text_bytes: usize,
    pub elapsed: Duration,
}

impl Default for SearchLimits {
    fn default() -> Self {
        Self {
            entries: 20_000,
            sources: 10_000,
            read_bytes: 64 * 1024 * 1024,
            segments: 100_000,
            text_bytes: 64 * 1024 * 1024,
            elapsed: Duration::from_secs(2),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SearchStop {
    Entries,
    Sources,
    ReadBytes,
    Segments,
    TextBytes,
    Elapsed,
    Depth,
    Io,
    Cancelled,
}

impl std::fmt::Display for SearchStop {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let reason = match self {
            Self::Entries => "目录条目较多",
            Self::Sources => "可搜索文件较多",
            Self::ReadBytes => "需读取的内容较多",
            Self::Segments => "索引中的匹配位置较多",
            Self::TextBytes => "索引正文较多",
            Self::Elapsed => "本次搜索用时较长",
            Self::Depth => "文件夹层级过深",
            Self::Io => "部分文件或文件夹已变化或无法读取",
            Self::Cancelled => "本次查询已关闭或替换",
        };
        write!(f, "搜索尚未完成：{reason}。请缩小资料库范围，或在资料库中准备/更新搜索索引后重试；这不表示没有匹配资料。")
    }
}

pub(crate) struct SearchBudget {
    pub limits: SearchLimits,
    started: Instant,
    pub entries: usize,
    pub sources: usize,
    pub read_bytes: u64,
    pub segments: usize,
    pub text_bytes: usize,
    cancellation: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
}

impl Default for SearchBudget {
    fn default() -> Self {
        Self::new(SearchLimits::default())
    }
}

impl SearchBudget {
    pub fn new(limits: SearchLimits) -> Self {
        Self {
            limits,
            started: Instant::now(),
            entries: 0,
            sources: 0,
            read_bytes: 0,
            segments: 0,
            text_bytes: 0,
            cancellation: None,
        }
    }

    pub fn check_time(&self) -> Result<(), SearchStop> {
        if self
            .cancellation
            .as_ref()
            .is_some_and(|token| token.load(std::sync::atomic::Ordering::Relaxed))
        {
            return Err(SearchStop::Cancelled);
        }
        if self.started.elapsed() >= self.limits.elapsed {
            Err(SearchStop::Elapsed)
        } else {
            Ok(())
        }
    }

    pub fn with_cancellation(
        mut self,
        token: std::sync::Arc<std::sync::atomic::AtomicBool>,
    ) -> Self {
        self.cancellation = Some(token);
        self
    }

    fn entry(&mut self) -> Result<(), SearchStop> {
        self.check_time()?;
        if self.entries >= self.limits.entries {
            return Err(SearchStop::Entries);
        }
        self.entries += 1;
        Ok(())
    }

    fn source(&mut self) -> Result<(), SearchStop> {
        self.check_time()?;
        if self.sources >= self.limits.sources {
            return Err(SearchStop::Sources);
        }
        self.sources += 1;
        Ok(())
    }

    pub fn read(&mut self, bytes: u64) -> Result<(), SearchStop> {
        self.check_time()?;
        if bytes > self.limits.read_bytes.saturating_sub(self.read_bytes) {
            return Err(SearchStop::ReadBytes);
        }
        self.read_bytes += bytes;
        Ok(())
    }

    pub fn segment(&mut self, text_bytes: usize) -> Result<(), SearchStop> {
        self.check_time()?;
        if self.segments >= self.limits.segments {
            return Err(SearchStop::Segments);
        }
        if text_bytes > self.limits.text_bytes.saturating_sub(self.text_bytes) {
            return Err(SearchStop::TextBytes);
        }
        self.segments += 1;
        self.text_bytes += text_bytes;
        Ok(())
    }
}

const MAX_DIRECTORY_DEPTH: usize = 64;

pub(crate) struct SourceScan {
    guard: WorkspaceGuard,
    frames: Vec<fs::ReadDir>,
    pending: Option<IndexedSource>,
    failed: bool,
}

impl SourceScan {
    pub fn new(root: &std::path::Path) -> Result<Self, SearchStop> {
        let guard = WorkspaceGuard::new(root).map_err(|_| SearchStop::Io)?;
        let entries = fs::read_dir(guard.root()).map_err(|_| SearchStop::Io)?;
        Ok(Self {
            guard,
            frames: vec![entries],
            pending: None,
            failed: false,
        })
    }

    pub fn next(&mut self, budget: &mut SearchBudget) -> Result<Option<IndexedSource>, SearchStop> {
        if self.failed {
            return Err(SearchStop::Io);
        }
        let result = self.next_inner(budget);
        if matches!(result, Err(SearchStop::Io | SearchStop::Depth)) {
            self.failed = true;
        }
        result
    }

    fn next_inner(
        &mut self,
        budget: &mut SearchBudget,
    ) -> Result<Option<IndexedSource>, SearchStop> {
        loop {
            if self.pending.is_some() {
                // Do not consume the pending source when this call's budget ends.
                budget.source()?;
                return Ok(self.pending.take());
            }
            let Some(frame) = self.frames.last_mut() else {
                return Ok(None);
            };
            // Check before advancing, so continuation cannot skip the blocked entry.
            budget.entry()?;
            let Some(entry) = frame.next() else {
                self.frames.pop();
                continue;
            };
            let entry = entry.map_err(|_| SearchStop::Io)?;
            let kind = entry.file_type().map_err(|_| SearchStop::Io)?;
            if kind.is_symlink() {
                continue;
            }
            let path: PathBuf = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if crate::services::library_visibility::hidden_name(&name) || is_sensitive_path(&path) {
                continue;
            }
            if kind.is_dir() {
                if self.frames.len() >= MAX_DIRECTORY_DEPTH {
                    return Err(SearchStop::Depth);
                }
                let resolved = self
                    .guard
                    .resolve_existing(&path)
                    .map_err(|_| SearchStop::Io)?;
                self.frames
                    .push(fs::read_dir(resolved).map_err(|_| SearchStop::Io)?);
                continue;
            }
            if !kind.is_file() {
                continue;
            }
            let sidecar = name.ends_with(".annotations.json") || name.ends_with(".ocr.json");
            if !sidecar
                && !file_format_for_path(&path)
                    .ok()
                    .is_some_and(|format| format.capabilities.index.is_supported())
            {
                continue;
            }
            let metadata = entry.metadata().map_err(|_| SearchStop::Io)?;
            self.pending = Some(IndexedSource {
                path: path
                    .strip_prefix(self.guard.root())
                    .map_err(|_| SearchStop::Io)?
                    .to_string_lossy()
                    .replace('\\', "/"),
                size: metadata.len(),
                modified_nanos: metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                    .map(|value| value.as_nanos().min(u64::MAX as u128) as u64)
                    .unwrap_or(0),
            });
        }
    }
}

pub(crate) fn collect_search_sources(
    root: &std::path::Path,
    budget: &mut SearchBudget,
) -> Result<Vec<IndexedSource>, SearchStop> {
    let mut scan = SourceScan::new(root)?;
    let mut sources = Vec::new();
    while let Some(source) = scan.next(budget)? {
        sources.push(source);
    }
    sources.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(sources)
}

#[cfg(test)]
#[path = "search_scan_tests.rs"]
mod tests;
