use super::file_management::{
    move_to, visible_item, OperationError, OperationResult, PathChange, OPERATIONS,
};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRule {
    mode: String,
    prefix: String,
    suffix: String,
    find: String,
    replacement: String,
    start: u32,
    digits: usize,
    position: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameItem {
    path: String,
    new_name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePreview {
    path: String,
    new_name: String,
    status: String,
    message: String,
}

fn extension(path: &Path) -> String {
    if path.is_dir() {
        return String::new();
    }
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let length = crate::formats::file_registry::file_format_for_path(path)
        .ok()
        .and_then(|format| {
            format
                .extensions
                .iter()
                .filter(|ext| name.to_lowercase().ends_with(ext.as_str()))
                .map(String::len)
                .max()
        })
        .or_else(|| path.extension().map(|ext| ext.len() + 1))
        .unwrap_or(0);
    name[name.len() - length..].to_owned()
}
fn validate(guard: &WorkspaceGuard, items: &[RenameItem]) -> Vec<RenamePreview> {
    items
        .iter()
        .map(|item| {
            let attempt = (|| {
                let source = visible_item(guard, &item.path, true)?;
                super::files::validate_item_name(&item.new_name)?;
                if item.new_name.encode_utf16().count() > 255 {
                    return Err("名称太长，请缩短至 255 个字符以内".into());
                }
                if items.iter().any(|other| {
                    other.path != item.path && source.starts_with(Path::new(&other.path))
                }) {
                    return Err("已选择上层文件夹，请只重命名上层文件夹".into());
                }
                let target = visible_item(
                    guard,
                    source
                        .parent()
                        .unwrap()
                        .join(&item.new_name)
                        .to_str()
                        .ok_or("名称无法识别")?,
                    false,
                )?;
                let original = source.file_name().unwrap().to_string_lossy();
                if original == item.new_name {
                    return Ok("unchanged");
                }
                let ext = extension(&source);
                if !ext.is_empty() && !item.new_name.ends_with(&ext) {
                    return Err("请保留原文件扩展名".into());
                }
                if items
                    .iter()
                    .filter(|other| {
                        let parent = Path::new(&other.path).parent();
                        parent == Path::new(&item.path).parent()
                            && other.new_name.to_lowercase() == item.new_name.to_lowercase()
                    })
                    .count()
                    > 1
                {
                    return Err("所选项目的新名称重复，请调整规则".into());
                }
                if target.exists() {
                    return Err("已有同名项目，请调整名称或移开同名项".into());
                }
                Ok("ready")
            })();
            let (status, message) = match attempt {
                Ok(status) => (
                    status.to_owned(),
                    if status == "unchanged" {
                        "名称未变化".into()
                    } else {
                        String::new()
                    },
                ),
                Err(message) => ("error".into(), message),
            };
            RenamePreview {
                path: item.path.clone(),
                new_name: item.new_name.clone(),
                status,
                message,
            }
        })
        .collect()
}
fn preview(
    library_root: &str,
    paths: &[String],
    rule: &RenameRule,
) -> Result<Vec<RenamePreview>, String> {
    if paths.len() > 2000 {
        return Err("一次最多重命名 2000 项，请分批整理".into());
    }
    if rule.digits > 8 || rule.start > 99999999 {
        return Err("序号范围为 0 到 99999999，位数最多为 8".into());
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let items = paths
        .iter()
        .enumerate()
        .map(|(index, input)| {
            let source =
                visible_item(&guard, input, true).unwrap_or_else(|_| Path::new(input).to_owned());
            let name = source.file_name().unwrap_or_default().to_string_lossy();
            let ext = extension(&source);
            let stem = &name[..name.len() - ext.len()];
            let stem = match rule.mode.as_str() {
                "text" => format!("{}{stem}{}", rule.prefix, rule.suffix),
                "replace" => {
                    if rule.find.is_empty() {
                        stem.into()
                    } else {
                        stem.replace(&rule.find, &rule.replacement)
                    }
                }
                "number" => {
                    let number = format!(
                        "{:0width$}",
                        rule.start as usize + index,
                        width = rule.digits
                    );
                    if rule.position == "suffix" {
                        format!("{stem}-{number}")
                    } else {
                        format!("{number}-{stem}")
                    }
                }
                _ => stem.into(),
            };
            RenameItem {
                path: source.to_string_lossy().into_owned(),
                new_name: format!("{stem}{ext}"),
            }
        })
        .collect::<Vec<_>>();
    Ok(validate(&guard, &items))
}
#[tauri::command]
pub async fn preview_library_renames(
    library_root: String,
    paths: Vec<String>,
    rule: RenameRule,
) -> Result<Vec<RenamePreview>, String> {
    tauri::async_runtime::spawn_blocking(move || preview(&library_root, &paths, &rule))
        .await
        .map_err(|e| e.to_string())?
}
fn execute(
    app: Option<&tauri::AppHandle>,
    root: &str,
    items: &[RenameItem],
) -> Result<OperationResult, String> {
    if items.len() > 2000 {
        return Err("一次最多重命名 2000 项".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let mut result = OperationResult::default();
    for row in validate(&guard, items) {
        if row.status == "unchanged" {
            continue;
        }
        let attempt = (|| {
            if row.status == "error" {
                return Err(row.message);
            }
            let source = visible_item(&guard, &row.path, true)?;
            let target = source.parent().unwrap().join(row.new_name);
            move_to(app, &guard, &source, &target)?;
            Ok(PathChange {
                old_path: row.path.clone(),
                new_path: target.to_string_lossy().into_owned(),
            })
        })();
        match attempt {
            Ok(item) => result.items.push(item),
            Err(message) => result.errors.push(OperationError {
                path: row.path,
                message,
            }),
        }
    }
    Ok(result)
}
#[tauri::command]
pub async fn rename_library_items(
    app_handle: tauri::AppHandle,
    library_root: String,
    items: Vec<RenameItem>,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let _history = super::history::history_lease(&app_handle)?;
        execute(Some(&app_handle), &library_root, &items)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn fixture() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "longedit-batch-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    fn rule(mode: &str) -> RenameRule {
        RenameRule {
            mode: mode.into(),
            prefix: "项目-".into(),
            suffix: String::new(),
            find: "草稿".into(),
            replacement: "定稿".into(),
            start: 8,
            digits: 3,
            position: "prefix".into(),
        }
    }
    #[test]
    fn rules_preserve_compound_extensions_and_directory_names() {
        let root = fixture();
        fs::write(root.join("数据.TABLE.JSON"), "table").unwrap();
        fs::create_dir(root.join("资料.v1")).unwrap();
        let rows = preview(
            root.to_str().unwrap(),
            &["数据.TABLE.JSON".into(), "资料.v1".into()],
            &rule("number"),
        )
        .unwrap();
        assert_eq!(rows[0].new_name, "008-数据.TABLE.JSON");
        assert_eq!(rows[1].new_name, "009-资料.v1");
        assert!(rows.iter().all(|r| r.status == "ready"));
        let text = preview(
            root.to_str().unwrap(),
            &["数据.TABLE.JSON".into()],
            &rule("text"),
        )
        .unwrap();
        assert_eq!(text[0].new_name, "项目-数据.TABLE.JSON");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn duplicate_invalid_and_occupied_names_are_previewed_without_writes() {
        let root = fixture();
        for name in ["草稿A.md", "草稿B.md", "定稿A.md"] {
            fs::write(root.join(name), name).unwrap();
        }
        let rows = preview(
            root.to_str().unwrap(),
            &["草稿A.md".into(), "草稿B.md".into()],
            &rule("replace"),
        )
        .unwrap();
        assert_eq!(rows[0].status, "error");
        assert_eq!(rows[1].status, "ready");
        let mut r = rule("replace");
        r.find = "A".into();
        r.replacement = "B".into();
        let rows = preview(
            root.to_str().unwrap(),
            &["草稿A.md".into(), "草稿B.md".into()],
            &r,
        )
        .unwrap();
        assert_eq!(rows[0].status, "error");
        r.mode = "text".into();
        r.prefix = "?".into();
        assert_eq!(
            preview(root.to_str().unwrap(), &["草稿A.md".into()], &r).unwrap()[0].status,
            "error"
        );
        assert_eq!(
            fs::read_to_string(root.join("定稿A.md")).unwrap(),
            "定稿A.md"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn execution_rechecks_conflicts_and_retries_only_unfinished_items() {
        let root = fixture();
        for name in ["a.md", "b.md"] {
            fs::write(root.join(name), name).unwrap();
        }
        let rows = preview(
            root.to_str().unwrap(),
            &["a.md".into(), "b.md".into()],
            &rule("text"),
        )
        .unwrap();
        fs::write(root.join("项目-b.md"), "occupied after preview").unwrap();
        let items = rows
            .iter()
            .map(|r| RenameItem {
                path: r.path.clone(),
                new_name: r.new_name.clone(),
            })
            .collect::<Vec<_>>();
        let result = execute(None, root.to_str().unwrap(), &items).unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(
            fs::read_to_string(root.join("项目-b.md")).unwrap(),
            "occupied after preview"
        );
        fs::remove_file(root.join("项目-b.md")).unwrap();
        assert_eq!(
            execute(None, root.to_str().unwrap(), &items[1..])
                .unwrap()
                .items
                .len(),
            1
        );
        assert_eq!(fs::read_to_string(root.join("项目-a.md")).unwrap(), "a.md");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn renaming_keeps_file_relations_and_does_not_change_file_contents() {
        let root = fixture();
        let library = root.to_string_lossy().into_owned();
        fs::write(root.join("依据.pdf"), "pdf bytes").unwrap();
        fs::write(root.join("数据.csv"), "csv").unwrap();
        tauri::async_runtime::block_on(super::super::file_relations::save_file_relation(
            library.clone(),
            "依据.pdf".into(),
            "数据.csv".into(),
            "related".into(),
            "说明".into(),
        ))
        .unwrap();
        let result = execute(
            None,
            &library,
            &[RenameItem {
                path: "依据.pdf".into(),
                new_name: "新依据.pdf".into(),
            }],
        )
        .unwrap();
        assert!(result.errors.is_empty());
        assert_eq!(
            tauri::async_runtime::block_on(super::super::file_relations::list_file_relations(
                library,
                result.items[0].new_path.clone()
            ))
            .unwrap()
            .len(),
            1
        );
        assert_eq!(
            fs::read_to_string(root.join("新依据.pdf")).unwrap(),
            "pdf bytes"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn direct_requests_cannot_change_extensions_or_internal_configuration() {
        let root = fixture();
        fs::write(root.join("a.table.json"), "data").unwrap();
        fs::write(root.join(".misty_order.json"), "{}").unwrap();
        let result = execute(
            None,
            root.to_str().unwrap(),
            &[
                RenameItem {
                    path: "a.table.json".into(),
                    new_name: "b.json".into(),
                },
                RenameItem {
                    path: ".misty_order.json".into(),
                    new_name: "order.json".into(),
                },
            ],
        )
        .unwrap();
        assert_eq!(result.errors.len(), 2);
        assert!(root.join("a.table.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
