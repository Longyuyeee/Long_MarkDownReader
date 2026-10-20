//! Portable conditions only: no library roots, documents or application configuration.
use super::config::{LibraryConfig, SavedSearchConfig};
use crate::services::{smart_collection::CollectionFilters, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::Path};

const MAX_BYTES: u64 = 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PortableCollection {
    name: String,
    query: String,
    #[serde(default)]
    object_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    filters: Option<CollectionFilters>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    graph_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    graph_depth: Option<usize>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Bundle {
    kind: String,
    schema_version: u32,
    collections: Vec<PortableCollection>,
}
fn check_bundle(bundle: &Bundle) -> Result<(), String> {
    if bundle.kind != "longedit-collections" || bundle.schema_version != 1 {
        return Err("请选择 Long编辑导出的集合条件文件（版本 1）".into());
    }
    if bundle.collections.is_empty() || bundle.collections.len() > 64 {
        return Err("集合文件应包含 1 至 64 个集合".into());
    }
    Ok(())
}
fn validate(entry: &PortableCollection, root: &str) -> Result<(), String> {
    super::config::validate_saved_searches(
        &[SavedSearchConfig {
            id: "portable-preview".into(),
            name: entry.name.clone(),
            query: entry.query.clone(),
            library_path: root.into(),
            object_types: entry.object_types.clone(),
            filters: entry.filters.clone(),
            graph_root: entry.graph_root.clone(),
            graph_depth: entry.graph_depth,
            created_at: 0,
        }],
        &[LibraryConfig {
            name: "目标资料库".into(),
            path: root.into(),
            ..Default::default()
        }],
    )
}
fn json_path(input: &str) -> Result<&Path, String> {
    let path = Path::new(input);
    if !path
        .extension()
        .and_then(|v| v.to_str())
        .is_some_and(|v| v.eq_ignore_ascii_case("json"))
    {
        return Err("请选择 .json 集合条件文件".into());
    }
    Ok(path)
}
#[tauri::command]
pub(crate) fn export_collection_bundle(
    target_path: String,
    collections: Vec<PortableCollection>,
) -> Result<(), String> {
    let bundle = Bundle {
        kind: "longedit-collections".into(),
        schema_version: 1,
        collections,
    };
    check_bundle(&bundle)?;
    for entry in &bundle.collections {
        validate(entry, "portable")?;
    }
    let body = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    if body.len() as u64 > MAX_BYTES {
        return Err("集合条件超过 1 MiB，请分批导出".into());
    }
    crate::services::reliable_write::write_utf8(json_path(&target_path)?, &body)
}
#[tauri::command]
pub(crate) fn read_collection_bundle(source_path: String) -> Result<Bundle, String> {
    let file =
        fs::File::open(json_path(&source_path)?).map_err(|e| format!("无法读取集合条件：{e}"))?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("集合文件超过 1 MiB，请分批导入".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "集合文件需要 UTF-8 编码")?;
    parse_collection_bundle(text)
}
#[tauri::command]
pub(crate) fn parse_collection_bundle(content: String) -> Result<Bundle, String> {
    if content.len() as u64 > MAX_BYTES {
        return Err("集合条件超过 1 MiB，请分批导入".into());
    }
    let text = content;
    let bundle: Bundle = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| "集合内容无法识别，请选择导出的集合条件文件；原集合未改变")?;
    check_bundle(&bundle)?;
    // Validate conditions individually in the preview so a missing directory or
    // unsupported format does not prevent importing the other collections.
    Ok(bundle)
}
#[derive(Serialize)]
pub(crate) struct PreviewItem {
    index: usize,
    valid: bool,
    message: String,
}
fn preview(root: &Path, collections: &[PortableCollection]) -> Result<Vec<PreviewItem>, String> {
    if collections.is_empty() || collections.len() > 64 {
        return Err("请选择 1 至 64 个集合".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    Ok(collections
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            let result = validate(entry, &root.to_string_lossy()).and_then(|_| {
                if let Some(path) = &entry.graph_root {
                    guard.resolve_existing_file(path, &["md", "markdown", "pdf"])?;
                } else if let Some(filters) = &entry.filters {
                    if !filters.directory.is_empty() {
                        guard.resolve_directory(filters.directory.replace('\\', "/"), false)?;
                    }
                }
                Ok(())
            });
            PreviewItem {
                index,
                valid: result.is_ok(),
                message: result.err().unwrap_or_else(|| "条件可用".into()),
            }
        })
        .collect())
}
#[tauri::command]
pub(crate) async fn preview_collection_import(
    app: tauri::AppHandle,
    library_root: String,
    collections: Vec<PortableCollection>,
) -> Result<Vec<PreviewItem>, String> {
    let config = super::config::get_config(app);
    let root = std::path::PathBuf::from(
        super::index::search_pages::configured_page_scope(&config.libraries, &library_root)
            .map_err(|e| e.message)?,
    );
    tauri::async_runtime::spawn_blocking(move || preview(&root, &collections))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::test_workspace::TestWorkspace;
    #[test]
    fn collection_bundle_keeps_only_conditions_and_round_trips_graph_and_search() {
        let root = TestWorkspace::new();
        let path = root.0.join("集合.json").to_string_lossy().into_owned();
        let entries: Vec<PortableCollection> = serde_json::from_value(serde_json::json!([
            {"name":"项目", "query":"预算", "objectTypes":["markdown"], "filters":{"directory":"项目", "tag":"工作", "modifiedWithinDays":7}},
            {"name":"关系", "query":"__longedit_graph_collection__", "objectTypes":[], "graphRoot":"中心.md", "graphDepth":2}
        ])).unwrap();
        export_collection_bundle(path.clone(), entries).unwrap();
        let bytes = fs::read_to_string(&path).unwrap();
        assert!(
            !bytes.contains("libraryPath")
                && !bytes.contains("createdAt")
                && !bytes.contains("portable-preview")
        );
        assert_eq!(read_collection_bundle(path).unwrap().collections.len(), 2);
    }
    #[test]
    fn collection_preview_is_per_item_read_only_and_directory_can_be_remapped() {
        let root = TestWorkspace::new();
        fs::create_dir(root.0.join("新目录")).unwrap();
        let mut entries: Vec<PortableCollection> = serde_json::from_value(serde_json::json!([
            {"name":"失效", "query":"", "objectTypes":[], "filters":{"directory":"旧目录", "tag":"", "modifiedWithinDays":null}},
            {"name":"有效", "query":"预算", "objectTypes":["markdown"]}
        ])).unwrap();
        let result = preview(&root.0, &entries).unwrap();
        assert!(!result[0].valid);
        assert!(result[1].valid);
        assert!(!root.0.join("旧目录").exists());
        entries[0].filters.as_mut().unwrap().directory = "新目录".into();
        assert!(preview(&root.0, &entries)
            .unwrap()
            .iter()
            .all(|item| item.valid));
    }
}
