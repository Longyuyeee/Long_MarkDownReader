use crate::formats::file_registry::file_format_for_path;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct ExternalFileAccess {
    authorized_editable: Mutex<HashSet<PathBuf>>,
    authorized_previews: Mutex<HashSet<PathBuf>>,
    authorized_imports: Mutex<HashSet<PathBuf>>,
}

impl ExternalFileAccess {
    pub fn authorize_editable(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_editable(path.as_ref())?;
        self.authorized_editable
            .lock()
            .map_err(|_| "External file authorization state is unavailable".to_string())?
            .insert(resolved.clone());
        self.authorized_imports
            .lock()
            .map_err(|_| "External import authorization state is unavailable".to_string())?
            .insert(resolved.clone());
        Ok(resolved)
    }

    pub fn resolve_editable(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_editable(path.as_ref())?;
        let is_authorized = self
            .authorized_editable
            .lock()
            .map_err(|_| "External file authorization state is unavailable".to_string())?
            .contains(&resolved);
        if is_authorized {
            Ok(resolved)
        } else {
            Err("This external file has not been authorized by the user".into())
        }
    }

    pub fn resolve_markdown(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = self.resolve_editable(path)?;
        if file_format_for_path(&resolved)?.id != "markdown" {
            return Err("This operation only accepts authorized Markdown files".into());
        }
        Ok(resolved)
    }

    pub fn authorize_preview(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_preview(path.as_ref())?;
        self.authorized_previews
            .lock()
            .map_err(|_| "External preview authorization state is unavailable".to_string())?
            .insert(resolved.clone());
        Ok(resolved)
    }

    pub fn resolve_preview(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_preview(path.as_ref())?;
        let is_authorized = self
            .authorized_previews
            .lock()
            .map_err(|_| "External preview authorization state is unavailable".to_string())?
            .contains(&resolved);
        if is_authorized {
            Ok(resolved)
        } else {
            Err("This external preview has not been authorized by the user".into())
        }
    }

    pub fn authorize_openable(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let path = path.as_ref();
        let resolved = canonical_file(path, "External file")?;
        match file_format_for_path(&resolved)?.external_policy.as_str() {
            "edit" => self.authorize_editable(resolved),
            "preview" => self.authorize_preview(resolved),
            _ => Err("This format is not registered for direct external opening".into()),
        }
    }

    pub fn authorize_import(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_import(path.as_ref())?;
        self.authorized_imports
            .lock()
            .map_err(|_| "External import authorization state is unavailable".to_string())?
            .insert(resolved.clone());
        Ok(resolved)
    }

    pub fn resolve_import(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let resolved = resolve_import(path.as_ref())?;
        let is_authorized = self
            .authorized_imports
            .lock()
            .map_err(|_| "External import authorization state is unavailable".to_string())?
            .contains(&resolved);
        if is_authorized {
            Ok(resolved)
        } else {
            Err(
                "This import file was not provided through an authorized system file interaction"
                    .into(),
            )
        }
    }
}

fn resolve_editable(path: &Path) -> Result<PathBuf, String> {
    let resolved = canonical_file(path, "External file")?;
    let format = file_format_for_path(&resolved)?;
    if format.external_policy != "edit" {
        return Err(format!("{} 不允许作为外部可编辑文档打开", format.label));
    }
    Ok(resolved)
}

fn resolve_preview(path: &Path) -> Result<PathBuf, String> {
    let resolved = canonical_file(path, "External preview")?;
    let format = file_format_for_path(&resolved)?;
    if format.external_policy != "preview" {
        return Err(format!(
            "{} is not registered for external read-only preview",
            format.label
        ));
    }
    Ok(resolved)
}

fn canonical_file(path: &Path, label: &str) -> Result<PathBuf, String> {
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("{label} is unavailable: {error}"))?;
    if !resolved.is_file() {
        return Err(format!("{label} path must be a file"));
    }
    Ok(resolved)
}

fn resolve_import(path: &Path) -> Result<PathBuf, String> {
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("Import file is unavailable: {error}"))?;
    if !resolved.is_file() {
        return Err("Import path must be a file".into());
    }
    let format = file_format_for_path(&resolved)?;
    if format.external_policy == "none" {
        return Err("The dropped file format is not supported by this workspace".into());
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
    fn only_resolves_explicitly_authorized_editable_files() {
        let directory = fixture("authorization");
        let authorized = directory.join("authorized.md");
        let unrelated = directory.join("unrelated.md");
        fs::write(&authorized, "authorized").unwrap();
        fs::write(&unrelated, "unrelated").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.resolve_editable(&authorized).is_err());
        let canonical = access.authorize_editable(&authorized).unwrap();
        assert_eq!(access.resolve_editable(&authorized).unwrap(), canonical);
        assert!(access.resolve_editable(&unrelated).is_err());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn accepts_registered_external_text_and_rejects_missing_files() {
        let directory = fixture("format");
        let text_file = directory.join("note.txt");
        let code_file = directory.join("sample.ts");
        let structured_files = [
            directory.join("data.json"),
            directory.join("settings.jsonc"),
            directory.join("config.yaml"),
            directory.join("document.xml"),
            directory.join("image.svg"),
            directory.join("project.toml"),
        ];
        let imported_file = directory.join("data.csv");
        fs::write(&text_file, "text").unwrap();
        fs::write(&code_file, "const value = 1;").unwrap();
        for path in &structured_files {
            fs::write(path, "{}").unwrap();
        }
        fs::write(&imported_file, "id\n1\n").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.authorize_editable(&text_file).is_ok());
        assert!(access.resolve_editable(&text_file).is_ok());
        assert!(access.authorize_editable(&code_file).is_ok());
        assert!(access.resolve_editable(&code_file).is_ok());
        for path in &structured_files {
            assert!(access.authorize_editable(path).is_ok());
            assert!(access.resolve_editable(path).is_ok());
        }
        assert!(access.authorize_editable(&imported_file).is_err());
        assert!(access.resolve_markdown(&text_file).is_err());
        assert!(access
            .authorize_editable(directory.join("missing.md"))
            .is_err());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn import_authorization_is_limited_to_supported_explicit_files() {
        let directory = fixture("import");
        let workbook = directory.join("report.xlsx");
        let executable = directory.join("report.exe");
        fs::write(&workbook, "xlsx").unwrap();
        fs::write(&executable, "exe").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.resolve_import(&workbook).is_err());
        access.authorize_import(&workbook).unwrap();
        assert!(access.resolve_import(&workbook).is_ok());
        assert!(access.resolve_import(&workbook).is_ok());
        assert!(access.authorize_import(&executable).is_err());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn preview_authorization_is_read_only_and_format_limited() {
        let directory = fixture("preview");
        let image = directory.join("photo.png");
        let video = directory.join("clip.mp4");
        let pdf = directory.join("document.pdf");
        let spreadsheet = directory.join("sheet.ods");
        let presentation = directory.join("slides.odp");
        let document = directory.join("document.docx");
        let powerpoint = directory.join("presentation.pptx");
        let workbook = directory.join("workbook.xlsx");
        let markdown = directory.join("note.md");
        fs::write(&image, "png").unwrap();
        fs::write(&video, "mp4").unwrap();
        fs::write(&pdf, "%PDF-1.7").unwrap();
        fs::write(&spreadsheet, "ods").unwrap();
        fs::write(&presentation, "odp").unwrap();
        fs::write(&document, "docx").unwrap();
        fs::write(&powerpoint, "pptx").unwrap();
        fs::write(&workbook, "xlsx").unwrap();
        fs::write(&markdown, "note").unwrap();

        let access = ExternalFileAccess::default();
        assert!(access.resolve_preview(&image).is_err());
        assert!(access.authorize_openable(&image).is_ok());
        assert!(access.resolve_preview(&image).is_ok());
        assert!(access.resolve_editable(&image).is_err());
        assert!(access.authorize_openable(&video).is_ok());
        assert!(access.resolve_preview(&video).is_ok());
        assert!(access.authorize_openable(&pdf).is_ok());
        assert!(access.resolve_preview(&pdf).is_ok());
        assert!(access.resolve_editable(&pdf).is_err());
        for path in [&spreadsheet, &presentation] {
            assert!(access.authorize_openable(path).is_ok());
            assert!(access.resolve_preview(path).is_ok());
            assert!(access.resolve_editable(path).is_err());
        }
        assert!(access.authorize_openable(&document).is_ok());
        assert!(access.resolve_preview(&document).is_ok());
        assert!(access.resolve_editable(&document).is_err());
        assert!(access.authorize_openable(&powerpoint).is_ok());
        assert!(access.resolve_preview(&powerpoint).is_ok());
        assert!(access.resolve_editable(&powerpoint).is_err());
        assert!(access.authorize_openable(&workbook).is_ok());
        assert!(access.resolve_preview(&workbook).is_ok());
        assert!(access.resolve_editable(&workbook).is_err());
        assert!(access.authorize_preview(&markdown).is_err());
        assert!(access.authorize_openable(&markdown).is_ok());
        assert!(access.resolve_editable(&markdown).is_ok());

        fs::remove_dir_all(directory).unwrap();
    }
}
