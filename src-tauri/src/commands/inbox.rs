use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::{fs, io::ErrorKind, path::PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxListing {
    entries: Vec<crate::FileEntry>,
    directory_missing: bool,
}

fn inbox_folder(guard: &WorkspaceGuard, relative: &str) -> Result<PathBuf, String> {
    let relative = if relative.is_empty() { "Inbox" } else { relative };
    if relative != "." {
        for part in relative.split('/') {
            crate::commands::files::validate_item_name(part)?;
        }
    }
    guard.resolve_directory(relative, true)
}

fn listing_path(root: &str, relative: &str, path: &str) -> Result<(PathBuf, bool), String> {
    let guard = WorkspaceGuard::new(root)?;
    let inbox = inbox_folder(&guard, relative)?;
    let directory = guard.resolve_directory(path, true)?;
    if !directory.starts_with(&inbox) {
        return Err("请在当前收集箱中浏览文件".into());
    }
    match fs::metadata(&directory) {
        Ok(_) => Ok((directory, false)),
        // A collection folder is created on the first save, not on every read.
        Err(error) if error.kind() == ErrorKind::NotFound && directory == inbox => {
            Ok((directory, true))
        }
        Err(error) => Err(format!("文件夹暂时无法读取：{error}")),
    }
}

#[tauri::command]
pub async fn read_inbox_directory(
    library_root: String,
    inbox_directory: String,
    path: String,
) -> Result<InboxListing, String> {
    let (directory, directory_missing) = listing_path(&library_root, &inbox_directory, &path)?;
    let entries = if directory_missing { Vec::new() } else {
        crate::commands::files::scan_directory(library_root, directory.to_string_lossy().into_owned()).await?
    };
    Ok(InboxListing { entries, directory_missing })
}

#[tauri::command]
pub fn create_inbox_directory(library_root: String, inbox_directory: String) -> Result<String, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let directory = inbox_folder(&guard, &inbox_directory)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建收集箱文件夹：{error}"))?;
    Ok(guard.resolve_directory(directory, false)?.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("longedit-inbox-{}-{nonce}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn root(&self) -> String { self.0.to_string_lossy().into_owned() }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn absent_inbox_is_empty_without_creating_or_hiding_other_failures() {
        let fixture = Fixture::new();
        let path = fixture.0.join("Inbox");
        assert!(listing_path(&fixture.root(), "", path.to_str().unwrap()).unwrap().1);
        assert!(!path.exists());
        assert!(listing_path(&fixture.root(), "", path.join("missing-child").to_str().unwrap()).is_err());
        fs::write(&path, "existing file").unwrap();
        assert!(listing_path(&fixture.root(), "", path.to_str().unwrap()).is_err());
        assert!(create_inbox_directory(fixture.root(), "".into()).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "existing file");
    }

    #[test]
    fn explicit_creation_is_repeatable_and_preserves_existing_content() {
        let fixture = Fixture::new();
        let directory = create_inbox_directory(fixture.root(), "项目/待整理".into()).unwrap();
        let note = PathBuf::from(&directory).join("note.md");
        fs::write(&note, "keep me").unwrap();
        assert_eq!(create_inbox_directory(fixture.root(), "项目/待整理".into()).unwrap(), directory);
        assert!(!listing_path(&fixture.root(), "项目/待整理", &directory).unwrap().1);
        assert_eq!(fs::read_to_string(note).unwrap(), "keep me");
        assert!(create_inbox_directory(fixture.0.join("gone").to_string_lossy().into_owned(), "".into()).is_err());
        assert!(!fixture.0.join("gone").exists());
    }
}
