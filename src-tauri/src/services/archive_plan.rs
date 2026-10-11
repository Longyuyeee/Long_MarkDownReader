//! Immutable disk evidence for an archive proposal; not execution permission.
use super::{
    archive_document::{fingerprint, Fingerprint},
    document_coordination,
    workspace_guard::WorkspaceGuard,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
pub(crate) struct PlannedFile {
    source: PathBuf,
    target: PathBuf,
    content: Fingerprint,
}
#[derive(Debug, Serialize)]
pub(crate) struct ArchivePlan {
    root: PathBuf,
    files: Vec<PlannedFile>,
}
impl ArchivePlan {
    pub(crate) fn capture(root: &Path, items: &[(PathBuf, PathBuf)]) -> Result<Self, String> {
        if items.is_empty() || items.len() > 500 {
            return Err("归档计划需要 1 至 500 个文件".into());
        }
        let guard = WorkspaceGuard::new(root)?;
        let mut paths = Vec::new();
        let mut sources = BTreeSet::new();
        let mut targets = BTreeSet::new();
        let key = |path: &Path| {
            let value = path.to_string_lossy().into_owned();
            if cfg!(windows) {
                value.to_lowercase()
            } else {
                value
            }
        };
        for (source, target) in items {
            let raw_source = if source.is_absolute() {
                source.clone()
            } else {
                guard.root().join(source)
            };
            let meta = fs::symlink_metadata(&raw_source).map_err(|e| e.to_string())?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err("归档来源不是普通文件".into());
            }
            let source = guard.resolve_existing_file(&raw_source, &[])?;
            let name = target
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or("目标文件名无效")?;
            crate::commands::files::validate_item_name(name)?;
            let target = guard
                .resolve_directory(target.parent().ok_or("目标目录无效")?, false)?
                .join(name);
            if !source
                .extension()
                .unwrap_or_default()
                .eq_ignore_ascii_case(target.extension().unwrap_or_default())
            {
                return Err("归档不能更改文件扩展名".into());
            }
            if key(&source) == key(&target)
                || !sources.insert(key(&source))
                || !targets.insert(key(&target))
            {
                return Err("归档计划存在重复或原地移动".into());
            }
            paths.push((source, target));
        }
        let refs: Vec<_> = paths
            .iter()
            .flat_map(|(a, b)| [a.as_path(), b.as_path()])
            .collect();
        let _lease = document_coordination::acquire(&refs)?;
        let mut files = Vec::new();
        for (source, target) in paths {
            absent(&target)?;
            let content = fingerprint(&source)?;
            files.push(PlannedFile {
                source,
                target,
                content,
            });
        }
        Ok(Self {
            root: guard.root().to_owned(),
            files,
        })
    }
    pub(crate) fn digest(&self) -> Result<String, String> {
        Ok(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(self).map_err(|e| e.to_string())?)
        ))
    }
    /// Keep the lease alive through the operation. External processes are not locked.
    #[allow(dead_code)]
    pub(crate) fn verify_and_lock(&self) -> Result<document_coordination::DocumentLease, String> {
        let guard = WorkspaceGuard::new(&self.root)?;
        if guard.root() != self.root {
            return Err("资料库身份变化，请重新预检".into());
        }
        let paths: Vec<_> = self
            .files
            .iter()
            .flat_map(|f| [f.source.as_path(), f.target.as_path()])
            .collect();
        let lease = document_coordination::acquire(&paths)?;
        for file in &self.files {
            if guard.resolve_existing_file(&file.source, &[])? != file.source
                || guard.resolve_directory(file.target.parent().ok_or("缺少目标目录")?, false)?
                    != file.target.parent().unwrap()
            {
                return Err("归档路径身份变化，请重新预检".into());
            }
            absent(&file.target)?;
            if fingerprint(&file.source)? != file.content {
                return Err("归档来源在预检后变化，请重新预检".into());
            }
        }
        Ok(lease)
    }
}
fn absent(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
        Ok(_) => Err("归档目标已存在，不会覆盖".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archive_plan_binds_content_paths_and_rechecks_without_writes() {
        let root = std::env::temp_dir().join(format!(
            "longedit-plan-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("target")).unwrap();
        let source = root.join("a.md");
        let target = root.join("target/a.md");
        fs::write(&source, "original").unwrap();
        let plan = ArchivePlan::capture(&root, &[(source.clone(), target.clone())]).unwrap();
        let hash = plan.digest().unwrap();
        assert_eq!(
            hash,
            ArchivePlan::capture(&root, &[(source.clone(), target.clone())])
                .unwrap()
                .digest()
                .unwrap()
        );
        let lease = plan.verify_and_lock().unwrap();
        assert!(plan.verify_and_lock().is_err());
        drop(lease);
        fs::write(&source, "modified").unwrap();
        assert!(plan.verify_and_lock().is_err());
        assert_ne!(
            hash,
            ArchivePlan::capture(&root, &[(source.clone(), target.clone())])
                .unwrap()
                .digest()
                .unwrap()
        );
        fs::write(&source, "original").unwrap();
        fs::write(&target, "existing").unwrap();
        assert!(plan.verify_and_lock().is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "existing");
        assert_eq!(fs::read_to_string(&source).unwrap(), "original");
        fs::remove_dir_all(root).unwrap();
    }
}
