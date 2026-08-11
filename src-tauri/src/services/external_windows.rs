use crate::formats::file_registry::file_format_for_path;
use crate::services::external_file_access::ExternalFileAccess;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, State, WebviewUrl, WebviewWindowBuilder};

static EXTERNAL_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn route_path(route_name: &str, format_id: &str) -> Result<&'static str, String> {
    if format_id == "markdown" {
        return Ok("/temp");
    }
    match route_name {
        "TextEditor" => Ok("/text"),
        "JsonEditor" => Ok("/json"),
        "YamlEditor" => Ok("/yaml"),
        "XmlEditor" => Ok("/xml"),
        "DrawioEditor" => Ok("/drawio"),
        "TomlEditor" => Ok("/toml"),
        "LogViewer" => Ok("/log"),
        "DocxEditor" => Ok("/docx"),
        "OdtReader" => Ok("/odt"),
        "OdfReader" => Ok("/odf-content"),
        "PptxReader" => Ok("/pptx"),
        "ExternalOffice" => Ok("/external-office"),
        "LegacyOffice" => Ok("/legacy-office"),
        "Canvas" => Ok("/canvas"),
        "Pdf" => Ok("/pdf"),
        "Table" => Ok("/table"),
        "Workbook" => Ok("/workbook"),
        "Diagram" => Ok("/diagram"),
        "MindMap" => Ok("/mindmap"),
        "MediaViewer" => Ok("/media"),
        _ => Err(format!("外部文件没有独立窗口路由: {route_name}")),
    }
}

pub fn external_window_url(path: &Path) -> Result<String, String> {
    let format = file_format_for_path(path)?;
    if !matches!(format.external_policy.as_str(), "edit" | "preview") {
        return Err("该格式不允许直接外部打开".into());
    }
    let route = route_path(&format.route_name, &format.id)?;
    let path_string = path.to_string_lossy();
    let encoded_path = urlencoding::encode(&path_string);
    Ok(format!("#{route}?path={encoded_path}&external=1"))
}

pub fn create_external_file_window(app: &AppHandle, path: PathBuf) -> Result<String, String> {
    let url = external_window_url(&path)?;
    let sequence = EXTERNAL_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let label = format!("external-{}-{sequence}", std::process::id());
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("外部文件");
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(format!("{file_name} · Long编辑"))
        .inner_size(1100.0, 760.0)
        .min_inner_size(720.0, 520.0)
        .decorations(false)
        .visible(true)
        .center()
        .build()
        .map_err(|error| format!("无法创建外部文件窗口：{error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(label)
}

pub fn authorize_and_create_external_window(
    app: &AppHandle,
    access: &ExternalFileAccess,
    path: impl AsRef<Path>,
) -> Result<String, String> {
    let path = access.authorize_openable(path)?;
    create_external_file_window(app, path)
}

#[tauri::command]
pub fn open_external_file_window(
    app: AppHandle,
    access: State<'_, ExternalFileAccess>,
    path: String,
) -> Result<String, String> {
    authorize_and_create_external_window(&app, &access, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::file_registry::file_format_registry;

    #[test]
    fn builds_dedicated_external_routes_for_edit_and_preview_formats() {
        let markdown = external_window_url(Path::new(r"C:\资料\说明.md")).unwrap();
        let text = external_window_url(Path::new(r"C:\资料\notes.txt")).unwrap();
        let workbook = external_window_url(Path::new(r"C:\资料\book.xlsx")).unwrap();
        assert!(markdown.starts_with("#/temp?"));
        assert!(text.starts_with("#/text?"));
        assert!(workbook.starts_with("#/workbook?"));
        for route in [markdown, text, workbook] {
            assert!(route.contains("external=1"));
            assert!(route.contains("%5C"));
        }
    }

    #[test]
    fn rejects_import_only_formats_from_external_windows() {
        assert!(external_window_url(Path::new(r"C:\资料\archive.doc")).is_err());
    }

    #[test]
    fn every_registered_external_format_has_an_independent_window_route() {
        let registry = file_format_registry().unwrap();
        for format in registry.formats.iter().filter(|format| {
            matches!(format.external_policy.as_str(), "edit" | "preview")
        }) {
            let extension = format.extensions.first().unwrap();
            let path = PathBuf::from(format!(r"C:\external\fixture{extension}"));
            let url = external_window_url(&path)
                .unwrap_or_else(|error| panic!("{} has no external route: {error}", format.id));
            assert!(url.contains("external=1"), "{} is not external", format.id);
        }
    }
}
