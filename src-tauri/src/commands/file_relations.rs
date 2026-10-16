use crate::commands::graph::{GraphEdge, GraphNode};
use crate::formats::file_registry::file_format_for_path;
use crate::formats::markdown::WikilinkMention;
use crate::services::reliable_write::write_utf8;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

const DIRECTORY: &str = ".longedit";
const FILE: &str = "file-relations.json";
const MAX_RELATIONS: usize = 4096;
const TYPES: &[&str] = &[
    "related",
    "links-to",
    "cites",
    "depends-on",
    "derived-from",
    "supports",
    "parent",
    "child",
    "contains",
];
static RELATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelation {
    pub id: String,
    pub source_path: String,
    pub target_path: String,
    pub relation_type: String,
    pub note: String,
}
#[derive(Serialize, Deserialize)]
struct RelationFile {
    version: u32,
    relations: Vec<FileRelation>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationFiles {
    files: Vec<RelationTarget>,
    truncated: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationTarget {
    path: String,
    name: String,
    relative_path: String,
}

fn read(root: &Path) -> Result<RelationFile, String> {
    let guard = WorkspaceGuard::new(root)?;
    let path = guard.resolve_for_write(Path::new(DIRECTORY).join(FILE))?;
    if !path.exists() {
        return Ok(RelationFile {
            version: 1,
            relations: Vec::new(),
        });
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
        return Err("资料关系记录过大，请检查记录文件".into());
    }
    let file: RelationFile =
        serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("读取资料关系失败：{e}"))?;
    if file.version != 1 || file.relations.len() > MAX_RELATIONS {
        return Err("资料关系记录版本或数量无效".into());
    }
    let mut ids = HashSet::new();
    for entry in &file.relations {
        if entry.id.len() != 32
            || !entry.id.chars().all(|c| c.is_ascii_hexdigit())
            || !ids.insert(&entry.id)
            || !TYPES.contains(&entry.relation_type.as_str())
            || entry.note.chars().count() > 2000
        {
            return Err("资料关系记录无效".into());
        }
        for path in [&entry.source_path, &entry.target_path] {
            if path.is_empty()
                || Path::new(path).is_absolute()
                || Path::new(path).components().any(|part| {
                    matches!(
                        part,
                        std::path::Component::ParentDir | std::path::Component::Prefix(_)
                    )
                })
            {
                return Err("资料关系记录路径无效".into());
            }
        }
    }
    Ok(file)
}
fn write(root: &Path, file: &RelationFile) -> Result<(), String> {
    let content = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    if content.len() > 8 * 1024 * 1024 {
        return Err("资料关系记录过大，请缩短关系说明后重试".into());
    }
    let directory = WorkspaceGuard::new(root)?.resolve_directory(DIRECTORY, true)?;
    fs::create_dir_all(&directory).map_err(|e| format!("创建资料关系目录失败：{e}"))?;
    write_utf8(directory.join(FILE), &content)
}
fn relative(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "请选择当前资料库里的文件".into())
}
fn view(root: &Path, mut entry: FileRelation) -> FileRelation {
    entry.source_path = root.join(&entry.source_path).to_string_lossy().into_owned();
    entry.target_path = root.join(&entry.target_path).to_string_lossy().into_owned();
    entry
}
fn key(source: &str, target: &str, kind: &str) -> String {
    let (a, b) = if kind == "related" && source > target {
        (target, source)
    } else {
        (source, target)
    };
    format!("{:x}", md5::compute(format!("{a}\0{b}\0{kind}")))
}
fn save(
    root: &str,
    source: &str,
    target: &str,
    kind: &str,
    note: &str,
) -> Result<FileRelation, String> {
    let _lock = RELATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let guard = WorkspaceGuard::new(root)?;
    let source = guard.resolve_existing_file(source, &[])?;
    let target = guard.resolve_existing_file(target, &[])?;
    if source == target {
        return Err("请选择另一份文件建立关系".into());
    }
    if !TYPES.contains(&kind) {
        return Err("请选择支持的关系类型".into());
    }
    if note.chars().count() > 2000 {
        return Err("关系说明请控制在2000字以内".into());
    }
    let source = relative(guard.root(), &source)?;
    let target = relative(guard.root(), &target)?;
    if source.split('/').any(|part| part.starts_with('.'))
        || target.split('/').any(|part| part.starts_with('.'))
    {
        return Err("请选择资料文件，应用记录文件不参与关联".into());
    }
    let id = key(&source, &target, kind);
    let mut file = read(guard.root())?;
    let entry = if let Some(entry) = file
        .relations
        .iter_mut()
        .find(|entry| key(&entry.source_path, &entry.target_path, &entry.relation_type) == id)
    {
        entry.note = note.trim().to_string();
        entry.clone()
    } else {
        if file.relations.len() >= MAX_RELATIONS {
            return Err("资料关系已达到当前数量上限".into());
        }
        let entry = FileRelation {
            id,
            source_path: source,
            target_path: target,
            relation_type: kind.into(),
            note: note.trim().into(),
        };
        file.relations.push(entry.clone());
        entry
    };
    write(guard.root(), &file)?;
    Ok(view(guard.root(), entry))
}
#[tauri::command]
pub async fn save_file_relation(
    library_root: String,
    source_path: String,
    target_path: String,
    relation_type: String,
    note: String,
) -> Result<FileRelation, String> {
    let _activity =
        crate::services::file_activity::read_write(&[std::path::Path::new(&library_root)])?;
    tauri::async_runtime::spawn_blocking(move || {
        save(
            &library_root,
            &source_path,
            &target_path,
            &relation_type,
            &note,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn remove_file_relation(library_root: String, relation_id: String) -> Result<(), String> {
    let _activity =
        crate::services::file_activity::read_write(&[std::path::Path::new(&library_root)])?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = RELATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(&library_root)?;
        let mut file = read(guard.root())?;
        let previous = file.relations.len();
        file.relations.retain(|entry| entry.id != relation_id);
        if previous != file.relations.len() {
            write(guard.root(), &file)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn update(root: &str, id: &str, kind: &str, note: &str) -> Result<FileRelation, String> {
    if !TYPES.contains(&kind) || note.chars().count() > 2000 {
        return Err("关系类型无效或说明超过 2000 字".into());
    }
    let _lock = RELATION_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let guard = WorkspaceGuard::new(root)?;
    let mut file = read(guard.root())?;
    let index = file
        .relations
        .iter()
        .position(|entry| entry.id == id)
        .ok_or("关系已移除，请刷新后重试")?;
    let current = &file.relations[index];
    if file.relations.iter().any(|entry| {
        entry.id != id
            && entry.relation_type == kind
            && ((entry.source_path == current.source_path
                && entry.target_path == current.target_path)
                || (kind == "related"
                    && entry.source_path == current.target_path
                    && entry.target_path == current.source_path))
    }) {
        return Err("这两份文件之间已有同类型关系，请编辑已有关系".into());
    }
    file.relations[index].id = key(&current.source_path, &current.target_path, kind);
    file.relations[index].relation_type = kind.into();
    file.relations[index].note = note.trim().into();
    let entry = file.relations[index].clone();
    write(guard.root(), &file)?;
    Ok(view(guard.root(), entry))
}
#[cfg(test)]
#[test]
fn editing_relation_type_preserves_files_and_future_deduplication() {
    let root = std::env::temp_dir().join(format!(
        "longedit-relation-edit-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let a = root.join("a.md");
    let b = root.join("b.txt");
    fs::write(&a, "note").unwrap();
    fs::write(&b, "source").unwrap();
    let original = save(
        root.to_str().unwrap(),
        a.to_str().unwrap(),
        b.to_str().unwrap(),
        "related",
        "原说明",
    )
    .unwrap();
    let edited = update(root.to_str().unwrap(), &original.id, "cites", "新说明").unwrap();
    assert_ne!(original.id, edited.id);
    assert_eq!(read(&root).unwrap().relations[0].note, "新说明");
    save(
        root.to_str().unwrap(),
        a.to_str().unwrap(),
        b.to_str().unwrap(),
        "related",
        "另一个关系",
    )
    .unwrap();
    assert_eq!(read(&root).unwrap().relations.len(), 2);
    assert!(update(root.to_str().unwrap(), &edited.id, "related", "不应覆盖").is_err());
    assert_eq!(fs::read_to_string(a).unwrap(), "note");
    assert_eq!(fs::read_to_string(b).unwrap(), "source");
    fs::remove_dir_all(root).unwrap();
}
#[tauri::command]
pub async fn update_file_relation(
    library_root: String,
    relation_id: String,
    relation_type: String,
    note: String,
) -> Result<FileRelation, String> {
    let _activity =
        crate::services::file_activity::read_write(&[std::path::Path::new(&library_root)])?;
    tauri::async_runtime::spawn_blocking(move || {
        update(&library_root, &relation_id, &relation_type, &note)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn list_file_relations(
    library_root: String,
    path: String,
) -> Result<Vec<FileRelation>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = RELATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(&library_root)?;
        let path = relative(guard.root(), &guard.resolve_existing_file(path, &[])?)?;
        Ok(read(guard.root())?
            .relations
            .into_iter()
            .filter(|entry| entry.source_path == path || entry.target_path == path)
            .map(|entry| view(guard.root(), entry))
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn list_relation_files(
    library_root: String,
    query: String,
) -> Result<RelationFiles, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let mut files = Vec::new();
        let mut truncated = false;
        scan(
            guard.root(),
            guard.root(),
            &query.trim().to_lowercase(),
            &mut files,
            &mut truncated,
        )?;
        files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        Ok(RelationFiles { files, truncated })
    })
    .await
    .map_err(|e| e.to_string())?
}
fn scan(
    root: &Path,
    directory: &Path,
    query: &str,
    files: &mut Vec<RelationTarget>,
    truncated: &mut bool,
) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|e| format!("读取资料目录失败：{e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() || name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if kind.is_dir() {
            scan(root, &path, query, files, truncated)?;
        } else if kind.is_file() {
            let relative_path = relative(root, &path)?;
            if relative_path.to_lowercase().contains(query) {
                if files.len() == 200 {
                    *truncated = true;
                    continue;
                }
                files.push(RelationTarget {
                    path: path.to_string_lossy().into_owned(),
                    name,
                    relative_path,
                });
            }
        }
    }
    Ok(())
}

pub(crate) fn append_to_graph(
    root: &Path,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
) -> Result<(), String> {
    let _lock = RELATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let guard = WorkspaceGuard::new(root)?;
    let mut ids: HashSet<String> = nodes.iter().map(|node| node.id.clone()).collect();
    for entry in read(guard.root())?.relations {
        let (Ok(source), Ok(target)) = (
            guard.resolve_existing_file(&entry.source_path, &[]),
            guard.resolve_existing_file(&entry.target_path, &[]),
        ) else {
            continue;
        };
        for path in [&source, &target] {
            let id = path.to_string_lossy().into_owned();
            if !ids.insert(id.clone()) {
                continue;
            }
            let format = file_format_for_path(path).ok();
            let object_type = match format.map(|format| format.id.as_str()) {
                Some("csv" | "tsv" | "table") => "table",
                Some("xlsx") => "workbook",
                Some(id) => id,
                None => "file",
            };
            nodes.push(GraphNode {
                id: id.clone(),
                path: id,
                title: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                size: 8.0,
                tags: Vec::new(),
                directory: relative(root, path.parent().unwrap_or(root))?,
                modified_at: fs::metadata(path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|t| t.as_secs())
                    .unwrap_or(0),
                object_type: object_type.into(),
                search_text: String::new(),
                content_signature: None,
                parent_id: None,
                locator: None,
                location_label: None,
            });
        }
        edges.push(GraphEdge {
            source: source.to_string_lossy().into_owned(),
            target: target.to_string_lossy().into_owned(),
            directed: entry.relation_type != "related",
            relation_type: entry.relation_type.clone(),
            manual_relation_ids: vec![entry.id],
            mentions: vec![WikilinkMention {
                target: entry.target_path,
                alias: None,
                syntax: "手动添加的关系".into(),
                context: if entry.note.is_empty() {
                    "在应用中添加的资料关系".into()
                } else {
                    entry.note
                },
                line: 0,
                relation_type: entry.relation_type,
            }],
        });
    }
    Ok(())
}

pub(crate) fn rename_with_relations(root: &Path, old: &Path, new: &Path) -> Result<(), String> {
    let _lock = RELATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut file = read(root)?;
    let old_relative = relative(root, old)?;
    let new_relative = relative(root, new)?;
    let mut changed = false;
    for entry in &mut file.relations {
        for path in [&mut entry.source_path, &mut entry.target_path] {
            if *path == old_relative || path.starts_with(&format!("{old_relative}/")) {
                *path = format!("{new_relative}{}", &path[old_relative.len()..]);
                changed = true;
            }
        }
    }
    // A target can appear after preview; the OS operation must refuse replacement.
    crate::services::archive_move::rename_no_replace(old, new)
        .map_err(|e| format!("无法安全移动，未覆盖任何同名项：{e}"))?;
    if changed {
        if let Err(error) = write(root, &file) {
            crate::services::archive_move::rename_no_replace(new, old).map_err(|rollback| {
                format!("文件位置已改变，但关系保存失败：{error}；恢复位置失败：{rollback}")
            })?;
            return Err(error);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::graph::{build_link_graph, relation_context};
    use crate::services::knowledge_index::{
        inspect_index, snapshot_from_graph, write_snapshot, KnowledgeIndexRuntime,
    };
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "longedit-file-relations-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }
    #[test]
    fn arbitrary_formats_persist_and_merge_into_graph_without_touching_content() {
        let root = fixture("formats");
        let source = root.join("数据.csv");
        let target = root.join("附件.weird");
        fs::write(&source, "name,value\nA,1\n").unwrap();
        fs::write(&target, [0, 255, 1, 9]).unwrap();
        let original = fs::read(&source).unwrap();
        let first = save(
            root.to_str().unwrap(),
            source.to_str().unwrap(),
            target.to_str().unwrap(),
            "cites",
            "测试数据依据",
        )
        .unwrap();
        let second = save(
            root.to_str().unwrap(),
            source.to_str().unwrap(),
            target.to_str().unwrap(),
            "cites",
            "补充说明",
        )
        .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(read(&root).unwrap().relations.len(), 1);
        assert_eq!(fs::read(&source).unwrap(), original);
        assert_eq!(fs::read(&target).unwrap(), [0, 255, 1, 9]);
        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let edge = graph
            .edges
            .iter()
            .find(|edge| edge.manual_relation_ids.contains(&first.id))
            .unwrap();
        assert_eq!(edge.relation_type, "cites");
        assert_eq!(edge.mentions[0].context, "补充说明");
        let context = relation_context(&graph, target.to_str().unwrap(), target.to_str().unwrap());
        assert!(context.indexed);
        assert!(context
            .relations
            .iter()
            .any(|entry| entry.manual_relation_ids.contains(&first.id)));
        tauri::async_runtime::block_on(remove_file_relation(
            root.to_string_lossy().into_owned(),
            first.id,
        ))
        .unwrap();
        assert!(read(&root).unwrap().relations.is_empty());
        assert!(source.exists() && target.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rename_rejects_destination_created_after_preflight() {
        let root = fixture("rename-collision");
        let source = root.join("原记录.md");
        let target = root.join("新记录.md");
        let peer = root.join("资料.pdf");
        fs::write(&source, "用户正在整理的原记录").unwrap();
        fs::write(&peer, "reference").unwrap();
        save(
            root.to_str().unwrap(),
            source.to_str().unwrap(),
            peer.to_str().unwrap(),
            "related",
            "关系也必须保持原样",
        )
        .unwrap();
        let relations = fs::read(root.join(DIRECTORY).join(FILE)).unwrap();
        assert!(!target.exists());
        // Another process can create this after the caller's preflight check.
        fs::write(&target, "其他程序刚刚保存的内容").unwrap();
        let outcome = rename_with_relations(&root, &source, &target);
        let original = fs::read_to_string(&source);
        let occupied = fs::read_to_string(&target).unwrap();
        let after = fs::read(root.join(DIRECTORY).join(FILE)).unwrap();
        fs::remove_dir_all(&root).unwrap();
        assert!(
            outcome.is_err(),
            "a late destination must reject the rename"
        );
        assert_eq!(original.unwrap(), "用户正在整理的原记录");
        assert_eq!(occupied, "其他程序刚刚保存的内容");
        assert_eq!(after, relations);
    }

    #[test]
    fn related_pairs_dedupe_and_folder_moves_keep_relations() {
        let root = fixture("move");
        fs::create_dir(root.join("原目录")).unwrap();
        let source = root.join("原目录/资料.json");
        let target = root.join("目标.txt");
        fs::write(&source, "{}").unwrap();
        fs::write(&target, "target").unwrap();
        let first = save(
            root.to_str().unwrap(),
            source.to_str().unwrap(),
            target.to_str().unwrap(),
            "related",
            "",
        )
        .unwrap();
        let reverse = save(
            root.to_str().unwrap(),
            target.to_str().unwrap(),
            source.to_str().unwrap(),
            "related",
            "相互参考",
        )
        .unwrap();
        assert_eq!(first.id, reverse.id);
        rename_with_relations(&root, &root.join("原目录"), &root.join("新目录")).unwrap();
        let moved = root.join("新目录/资料.json");
        let saved = save(
            root.to_str().unwrap(),
            moved.to_str().unwrap(),
            target.to_str().unwrap(),
            "related",
            "移动后继续",
        )
        .unwrap();
        assert_eq!(saved.id, first.id);
        assert_eq!(read(&root).unwrap().relations.len(), 1);
        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.source == moved.to_string_lossy()
                || edge.target == moved.to_string_lossy()));
        let portable = fs::read_to_string(root.join(DIRECTORY).join(FILE)).unwrap();
        assert!(!portable.contains(root.to_str().unwrap()));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn concurrent_additions_survive_and_missing_files_do_not_break_graph() {
        let root = fixture("concurrent");
        for name in ["a.pdf", "b.png", "c.xlsx"] {
            fs::write(root.join(name), "synthetic").unwrap();
        }
        let tasks: Vec<_> = ["b.png", "c.xlsx"]
            .into_iter()
            .map(|name| {
                let root = root.clone();
                std::thread::spawn(move || {
                    save(
                        root.to_str().unwrap(),
                        root.join("a.pdf").to_str().unwrap(),
                        root.join(name).to_str().unwrap(),
                        "related",
                        "",
                    )
                    .unwrap()
                })
            })
            .collect();
        for task in tasks {
            task.join().unwrap();
        }
        assert_eq!(read(&root).unwrap().relations.len(), 2);
        fs::remove_file(root.join("b.png")).unwrap();
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        append_to_graph(&root, &mut nodes, &mut edges).unwrap();
        assert_eq!(edges.len(), 1);
        assert!(save(
            root.to_str().unwrap(),
            root.join("a.pdf").to_str().unwrap(),
            root.join("a.pdf").to_str().unwrap(),
            "related",
            ""
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn metadata_changes_mark_ready_index_stale_after_reopen() {
        let root = fixture("index");
        let cache = fixture("cache");
        fs::write(root.join("a.md"), "# A").unwrap();
        fs::write(root.join("b.txt"), "text").unwrap();
        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        write_snapshot(&cache, &root, &snapshot_from_graph(&root, graph)).unwrap();
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "ready"
        );
        save(
            root.to_str().unwrap(),
            root.join("a.md").to_str().unwrap(),
            root.join("b.txt").to_str().unwrap(),
            "related",
            "",
        )
        .unwrap();
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "stale"
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(cache).unwrap();
    }
}
