use crate::formats::file_registry::file_format_for_path;
use crate::formats::opml::{opml_search_text, parse_opml};
use crate::formats::table::{parse_internal_table, table_search_text};
use crate::services::knowledge_index::{
    delete_index, inspect_index, snapshot_from_graph, write_snapshot, KnowledgeIndexRuntime,
    KnowledgeIndexStatus,
};
use crate::services::pdf_index::load_pdf_index;
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

const MAX_SEARCH_RESULTS: usize = 200;
const MAX_TEXT_FILE_BYTES: u64 = 20 * 1024 * 1024;

fn knowledge_index_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map_err(|error| format!("无法定位应用缓存目录: {error}"))
}

#[tauri::command]
pub fn get_knowledge_index_status(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let cache_root = knowledge_index_cache_root(&app)?;
    Ok(inspect_index(&cache_root, guard.root(), &runtime))
}

#[tauri::command]
pub async fn rebuild_knowledge_index(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let workspace = guard.root().to_path_buf();
    let cache_root = knowledge_index_cache_root(&app)?;
    if runtime.is_building(&workspace) {
        return Err("知识索引正在构建，请稍后再试".into());
    }
    runtime.set(&workspace, "building", 10, None);
    let graph =
        match crate::commands::graph::build_link_graph(workspace.to_string_lossy().into_owned())
            .await
        {
            Ok(graph) => graph,
            Err(error) => {
                runtime.set(&workspace, "error", 0, Some(error.clone()));
                return Err(error);
            }
        };
    runtime.set(&workspace, "building", 75, None);
    let workspace_for_task = workspace.clone();
    let cache_for_task = cache_root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let snapshot = snapshot_from_graph(&workspace_for_task, graph);
        write_snapshot(&cache_for_task, &workspace_for_task, &snapshot)
    })
    .await;
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            let error = format!("知识索引写入任务失败: {error}");
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    if let Err(error) = result {
        runtime.set(&workspace, "error", 0, Some(error.clone()));
        return Err(error);
    }
    runtime.set(&workspace, "ready", 100, None);
    Ok(inspect_index(&cache_root, &workspace, &runtime))
}

#[tauri::command]
pub fn delete_knowledge_index(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let workspace = guard.root();
    let cache_root = knowledge_index_cache_root(&app)?;
    if runtime.is_building(workspace) {
        return Err("知识索引正在构建，暂时不能删除".into());
    }
    delete_index(&cache_root, workspace)?;
    runtime.set(workspace, "missing", 0, None);
    Ok(inspect_index(&cache_root, workspace, &runtime))
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub title: String,
    pub path: String,
    pub object_type: String,
    pub match_kind: String,
    pub context: String,
    pub page: Option<u32>,
    pub annotation_id: Option<String>,
    pub score: u32,
    pub extraction_failed: bool,
}

fn snippet(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut result = collapsed.chars().take(220).collect::<String>();
    if collapsed.chars().count() > 220 {
        result.push('…');
    }
    result
}

fn text_match_context(value: &str, query: &str) -> Option<String> {
    value
        .lines()
        .find(|line| line.to_lowercase().contains(query))
        .map(snippet)
        .or_else(|| value.to_lowercase().contains(query).then(|| snippet(value)))
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<KnowledgeSearchResult>) {
    if results.len() >= MAX_SEARCH_RESULTS {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if results.len() >= MAX_SEARCH_RESULTS
            || entry
                .file_type()
                .map(|kind| kind.is_symlink())
                .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.')
            || name.ends_with(".assets")
            || name.ends_with(".annotations.json")
            || name.ends_with(".ocr.json")
        {
            continue;
        }
        if path.is_dir() {
            search_recursive(&path, query, results);
            continue;
        }
        let path_string = path.to_string_lossy().into_owned();
        let title = name.into_owned();
        let title_matches = title.to_lowercase().contains(query);
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        if !format.capabilities.index.is_supported() {
            continue;
        }
        let Some(indexer) = format.adapters.indexer.as_deref() else {
            continue;
        };
        if indexer == "pdf" {
            let index = load_pdf_index(&path);
            if title_matches {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "title".into(),
                    context: if index.extraction_failed {
                        "PDF 正文不可提取，可能是扫描件、加密文件或损坏文件".into()
                    } else {
                        "PDF 文件名匹配".into()
                    },
                    page: None,
                    annotation_id: None,
                    score: 100,
                    extraction_failed: index.extraction_failed,
                });
            }
            for annotation in index
                .annotations
                .iter()
                .filter(|item| item.text.to_lowercase().contains(query))
                .take(5)
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "annotation".into(),
                    context: snippet(&annotation.text),
                    page: Some(annotation.page),
                    annotation_id: Some(annotation.id.clone()),
                    score: 90,
                    extraction_failed: index.extraction_failed,
                });
            }
            if let Some((page_index, context)) =
                index.pages.iter().enumerate().find_map(|(page, text)| {
                    text_match_context(text, query).map(|value| (page, value))
                })
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "body".into(),
                    context,
                    page: Some((page_index + 1) as u32),
                    annotation_id: None,
                    score: 70,
                    extraction_failed: index.extraction_failed,
                });
            }
            if let Some((page, context)) = index.ocr_pages.iter().find_map(|item| {
                text_match_context(&item.text, query).map(|value| (item.page, value))
            }) {
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: "pdf".into(),
                    match_kind: "ocr".into(),
                    context,
                    page: Some(page),
                    annotation_id: None,
                    score: 75,
                    extraction_failed: index.extraction_failed,
                });
            }
        } else if matches!(
            indexer,
            "markdown" | "text" | "json-text" | "table" | "opml"
        ) {
            let content = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= MAX_TEXT_FILE_BYTES)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    let mut detector = EncodingDetector::new();
                    detector.feed(&bytes, true);
                    let encoding = detector.guess(None, true);
                    let (text, _, _) = encoding.decode(&bytes);
                    if indexer == "opml" {
                        parse_opml(text.strip_prefix('\u{feff}').unwrap_or(&text))
                            .ok()
                            .map(|document| opml_search_text(&document))
                    } else if title.to_ascii_lowercase().ends_with(".table.json") {
                        parse_internal_table(text.strip_prefix('\u{feff}').unwrap_or(&text))
                            .ok()
                            .map(|table| table_search_text(&table, MAX_TEXT_FILE_BYTES as usize))
                    } else {
                        Some(text.into_owned())
                    }
                });
            let context = content
                .as_deref()
                .and_then(|value| text_match_context(value, query));
            if title_matches || context.is_some() {
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: format.id.clone(),
                    match_kind: if title_matches { "title" } else { "body" }.into(),
                    context: context.unwrap_or_else(|| "文件名匹配".into()),
                    page: None,
                    annotation_id: None,
                    score: if title_matches { 100 } else { 60 },
                    extraction_failed: false,
                });
            }
        }
    }
}

#[tauri::command]
pub async fn search_knowledge(
    library_root: String,
    query: String,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let root = guard.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        search_recursive(&root, &query, &mut results);
        results.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.page.cmp(&right.page))
        });
        results.truncate(MAX_SEARCH_RESULTS);
        results
    })
    .await
    .map_err(|error| format!("知识索引任务失败: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pdf_index::clear_pdf_index_cache;
    use base64::{engine::general_purpose, Engine as _};
    use std::time::{SystemTime, UNIX_EPOCH};

    const TWO_PAGE_PDF: &str = "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCAzMDAgMzAwIF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgMzAwIDMwMCBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDcgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgMyAwIFIgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0xlbmd0aCA5Ngo+PgpzdHJlYW0KMSAwIDAgMSAwIDAgY20gIEJUIC9GMSAxMiBUZiAxNC40IFRMIEVUCkJUIDEgMCAwIDEgNDAgMjUwIFRtIChLbm93bGVkZ2UgR3JhcGggQWxwaGEpIFRqIFQqIEVUCiAKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8Ci9MZW5ndGggOTEKPj4Kc3RyZWFtCjEgMCAwIDEgMCAwIGNtICBCVCAvRjEgMTIgVGYgMTQuNCBUTCBFVApCVCAxIDAgMCAxIDQwIDI1MCBUbSAoU2Vjb25kIFBhZ2UgQmV0YSkgVGogVCogRVQKIAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAxMAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDAzOTIgMDAwMDAgbiAKMDAwMDAwMDU4NSAwMDAwMCBuIAowMDAwMDAwNjUzIDAwMDAwIG4gCjAwMDAwMDA5MTQgMDAwMDAgbiAKMDAwMDAwMDk3OSAwMDAwMCBuIAowMDAwMDAxMTI0IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDg3ZGQ4ZDI4MmYyODI4ZmFkMDdiZjc2YTE0NjRkYzM0Pjw4N2RkOGQyODJmMjgyOGZhZDA3YmY3NmExNDY0ZGMzND5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgMTAKPj4Kc3RhcnR4cmVmCjEyNjQKJSVFT0YK";

    #[test]
    fn searches_pdf_pages_and_annotations_with_locations() {
        clear_pdf_index_cache();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-index-test-{}", nonce));
        fs::create_dir_all(&root).unwrap();
        let pdf = root.join("research.pdf");
        fs::write(
            &pdf,
            general_purpose::STANDARD.decode(TWO_PAGE_PDF).unwrap(),
        )
        .unwrap();
        fs::write(
            root.join("research.pdf.annotations.json"),
            r#"{
              "schemaVersion": 1,
              "source": { "pdfFile": "research.pdf", "size": 1, "modifiedAt": 1 },
              "annotations": [{
                "id": "annotation-1", "kind": "highlight", "page": 1, "color": "yellow",
                "rects": [{ "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.05 }],
                "quote": "Critical insight for indexing", "comment": "", "createdAt": 1, "updatedAt": 1
              }]
            }"#,
        )
        .unwrap();

        let body = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "Second Page Beta".into(),
        ))
        .unwrap();
        assert!(body.iter().any(|result| {
            result.match_kind == "body" && result.page == Some(2) && result.object_type == "pdf"
        }));
        let annotations = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "critical insight".into(),
        ))
        .unwrap();
        assert!(annotations.iter().any(|result| {
            result.match_kind == "annotation"
                && result.page == Some(1)
                && result.annotation_id.as_deref() == Some("annotation-1")
        }));
        fs::write(root.join("scan.pdf"), b"%PDF scanned fixture").unwrap();
        fs::write(
            root.join("scan.pdf.ocr.json"),
            r#"{
              "schemaVersion": 1,
              "source": { "pdfFile": "scan.pdf", "size": 1, "modifiedAt": 1 },
              "provider": { "id": "tesseract-wasm", "version": "7.0.0", "languages": ["chi_sim", "eng"] },
              "updatedAt": 2,
              "pages": [{
                "page": 1, "text": "Unique scanned evidence", "confidence": 93.2,
                "processedAt": 2, "width": 1200, "height": 1600
              }]
            }"#,
        )
        .unwrap();
        let ocr = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "unique scanned evidence".into(),
        ))
        .unwrap();
        assert!(ocr.iter().any(|result| {
            result.match_kind == "ocr" && result.page == Some(1) && result.object_type == "pdf"
        }));
        let _ = fs::remove_dir_all(root);
        clear_pdf_index_cache();
    }

    #[test]
    fn searches_table_titles_and_cell_content() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-table-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("customers.csv"),
            "name,segment\nAcme Research,Strategic Account\n",
        )
        .unwrap();
        let results = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "strategic account".into(),
        ))
        .unwrap();
        assert!(results.iter().any(|result| {
            result.object_type == "table"
                && result.match_kind == "body"
                && result.context.contains("Strategic Account")
        }));
        fs::write(
            root.join("planning.table.json"),
            r#"{
              "schemaVersion": 1, "kind": "longedit.table",
              "data": {
                "columns": [{"id":"topic","name":"主题","type":"text"}],
                "rows": [{"id":"row-1","values":{"topic":"Unique board evidence"}}]
              },
              "views": [{"id":"grid","name":"表格","kind":"grid","config":{"filter":"","frozenColumns":1,"columnWidths":{"topic":160}}}],
              "activeView": "grid"
            }"#,
        )
        .unwrap();
        let internal = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "unique board evidence".into(),
        ))
        .unwrap();
        assert!(internal.iter().any(|result| {
            result.object_type == "table"
                && result.context.contains("Unique board evidence")
                && !result.context.contains("schemaVersion")
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn indexes_registered_plain_text_through_the_generic_adapter() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-text-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("adapter-proof.txt"),
            "Generic adapter evidence lives here.",
        )
        .unwrap();
        let results = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "generic adapter evidence".into(),
        ))
        .unwrap();
        assert!(results.iter().any(|result| {
            result.object_type == "plain-text"
                && result.match_kind == "body"
                && result.context.contains("Generic adapter evidence")
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn indexes_opml_semantics_without_exposing_xml_markup() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-opml-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("strategy.opml"),
            include_str!("../../tests/fixtures/formats/mindmap.opml"),
        )
        .unwrap();
        let results = tauri::async_runtime::block_on(search_knowledge(
            root.to_string_lossy().into_owned(),
            "增强关系发现".into(),
        ))
        .unwrap();
        assert!(results.iter().any(|result| result.object_type == "opml"
            && result.match_kind == "body"
            && result.context.contains("增强关系发现")
            && !result.context.contains("outline")));
        fs::remove_dir_all(root).unwrap();
    }
}
