use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct ExternalFileAccess {
    authorized_files: Mutex<HashSet<PathBuf>>,
}

impl ExternalFileAccess {
    pub fn authorize_markdown(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_markdown(path.as_ref())?;
        self.authorized_files
            .lock()
            .map_err(|_| "External file authorization state is unavailable".to_string())?
            .insert(resolved.clone());
        Ok(resolved)
    }

    pub fn resolve_markdown(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_markdown(path.as_ref())?;
        let is_authorized = self
            .authorized_files
            .lock()
            .map_err(|_| "External file authorization state is unavailable".to_string())?
            .contains(&resolved);
        if is_authorized {
            Ok(resolved)
        } else {
            Err("This external file has not been authorized by the user".into())
        }
    }
}

fn resolve_markdown(path: &Path) -> Result<PathBuf, String> {
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("External file is unavailable: {error}"))?;
    if !resolved.is_file() {
        return Err("External path must be a file".into());
    }
    let is_markdown = resolved
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err("Only Markdown (.md) external files are supported".into());
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "longedit-external-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn only_resolves_explicitly_authorized_markdown_files() {
        let directory = fixture("authorization");
        let authorized = directory.join("authorized.md");
        let unrelated = directory.join("unrelated.md");
        fs::write(&authorized, "authorized").unwrap();
        fs::write(&unrelated, "unrelated").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.resolve_markdown(&authorized).is_err());
        let canonical = access.authorize_markdown(&authorized).unwrap();
        assert_eq!(access.resolve_markdown(&authorized).unwrap(), canonical);
        assert!(access.resolve_markdown(&unrelated).is_err());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_non_markdown_and_missing_files() {
        let directory = fixture("format");
        let text_file = directory.join("note.txt");
        fs::write(&text_file, "text").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.authorize_markdown(&text_file).is_err());
        assert!(access
            .authorize_markdown(directory.join("missing.md"))
            .is_err());

        fs::remove_dir_all(directory).unwrap();
    }
}
