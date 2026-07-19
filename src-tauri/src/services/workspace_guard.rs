use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug)]
pub struct WorkspaceGuard {
    root: PathBuf,
}

impl WorkspaceGuard {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, String> {
        let root = root
            .as_ref()
            .canonicalize()
            .map_err(|e| format!("知识库根目录无效: {}", e))?;
        if !root.is_dir() {
            return Err("知识库根路径必须是目录".into());
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn resolve_existing(&self, input: impl AsRef<Path>) -> Result<PathBuf, String> {
        let candidate = self.candidate(input.as_ref())?;
        let resolved = candidate
            .canonicalize()
            .map_err(|e| format!("路径不存在或不可访问: {}", e))?;
        self.ensure_contained(&resolved)?;
        Ok(resolved)
    }

    pub fn resolve_existing_file(
        &self,
        input: impl AsRef<Path>,
        extensions: &[&str],
    ) -> Result<PathBuf, String> {
        let resolved = self.resolve_existing(input)?;
        if !resolved.is_file() {
            return Err("目标必须是文件".into());
        }
        self.ensure_extension(&resolved, extensions)?;
        Ok(resolved)
    }

    pub fn resolve_directory(
        &self,
        input: impl AsRef<Path>,
        allow_create: bool,
    ) -> Result<PathBuf, String> {
        let resolved = if allow_create {
            self.resolve_for_write(input)?
        } else {
            self.resolve_existing(input)?
        };
        if resolved.exists() && !resolved.is_dir() {
            return Err("目标必须是目录".into());
        }
        Ok(resolved)
    }

    pub fn resolve_for_write(&self, input: impl AsRef<Path>) -> Result<PathBuf, String> {
        let candidate = self.candidate(input.as_ref())?;
        if candidate.exists() {
            return self.resolve_existing(candidate);
        }

        let mut ancestor = candidate.as_path();
        while !ancestor.exists() {
            ancestor = ancestor.parent().ok_or("写入路径没有有效父目录")?;
        }
        let canonical_ancestor = ancestor
            .canonicalize()
            .map_err(|e| format!("写入父目录不可访问: {}", e))?;
        self.ensure_contained(&canonical_ancestor)?;
        let suffix = candidate
            .strip_prefix(ancestor)
            .map_err(|_| "无法解析写入路径")?;
        Ok(canonical_ancestor.join(suffix))
    }

    pub fn resolve_file_for_write(
        &self,
        input: impl AsRef<Path>,
        extensions: &[&str],
    ) -> Result<PathBuf, String> {
        let resolved = self.resolve_for_write(input)?;
        if resolved.exists() && !resolved.is_file() {
            return Err("写入目标必须是文件".into());
        }
        self.ensure_extension(&resolved, extensions)?;
        Ok(resolved)
    }

    fn candidate(&self, input: &Path) -> Result<PathBuf, String> {
        if input.as_os_str().is_empty() {
            return Err("路径不能为空".into());
        }
        if input
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err("安全错误：路径包含父目录跳转".into());
        }
        Ok(if input.is_absolute() {
            input.to_path_buf()
        } else {
            self.root.join(input)
        })
    }

    fn ensure_contained(&self, path: &Path) -> Result<(), String> {
        if path.starts_with(&self.root) {
            Ok(())
        } else {
            Err("安全错误：路径超出知识库范围".into())
        }
    }

    fn ensure_extension(&self, path: &Path, extensions: &[&str]) -> Result<(), String> {
        if extensions.is_empty() {
            return Ok(());
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if extensions
            .iter()
            .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        {
            Ok(())
        } else {
            Err(format!(
                "不支持的文件格式 .{}，允许格式: {}",
                extension,
                extensions.join(", ")
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-guard-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("workspace");
        fs::create_dir_all(&root).unwrap();
        (base, root)
    }

    #[test]
    fn accepts_relative_and_absolute_paths_inside_workspace() {
        let (base, root) = fixture("inside");
        fs::write(root.join("note.canvas"), "{}").unwrap();
        let guard = WorkspaceGuard::new(&root).unwrap();
        assert!(guard
            .resolve_existing_file("note.canvas", &["canvas"])
            .is_ok());
        assert!(guard
            .resolve_existing_file(root.join("note.canvas"), &["canvas"])
            .is_ok());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_parent_traversal_and_outside_absolute_path() {
        let (base, root) = fixture("outside");
        let outside = base.join("outside.canvas");
        fs::write(&outside, "{}").unwrap();
        let guard = WorkspaceGuard::new(&root).unwrap();
        assert!(guard.resolve_existing("../outside.canvas").is_err());
        assert!(guard.resolve_existing(&outside).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn validates_extensions_and_safe_future_targets() {
        let (base, root) = fixture("write");
        let guard = WorkspaceGuard::new(&root).unwrap();
        assert!(guard
            .resolve_file_for_write("new/topic.canvas", &["canvas"])
            .is_ok());
        assert!(guard
            .resolve_file_for_write("new/topic.exe", &["canvas"])
            .is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_symlink_that_resolves_outside_workspace() {
        use std::os::windows::fs::symlink_file;
        let (base, root) = fixture("symlink");
        let outside = base.join("outside.canvas");
        let link = root.join("linked.canvas");
        fs::write(&outside, "{}").unwrap();
        if symlink_file(&outside, &link).is_ok() {
            let guard = WorkspaceGuard::new(&root).unwrap();
            assert!(guard.resolve_existing_file(&link, &["canvas"]).is_err());
        }
        fs::remove_dir_all(base).unwrap();
    }
}
