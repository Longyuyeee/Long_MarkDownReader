//! Root-relative JSON Canvas references join the existing durable move transaction.
//! Only exact `type=file` / `file` string spans are replaced; vendor bytes survive.
use super::{file_move_links::DocumentEdit, workspace_guard::WorkspaceGuard};
use serde::Deserialize;
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::Read, path::{Path, PathBuf}};

#[derive(Deserialize)]
struct Canvas<'a> { #[serde(borrow)] nodes: Vec<&'a RawValue> }
fn path_key(path: &Path) -> String {
    let key = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) { key.to_lowercase() } else { key }
}
fn mapped(path: &Path, source: &Path, target: &Path) -> PathBuf {
    path.strip_prefix(source).map(|suffix| target.join(suffix)).unwrap_or_else(|_|path.to_owned())
}
pub(crate) fn plan(root: &Path, source: &Path, target: &Path) -> Result<Vec<DocumentEdit>, String> {
    let guard = WorkspaceGuard::new(root)?;
    let mut pending = vec![guard.root().to_path_buf()];
    let mut entries = 0usize;
    let mut total = 0usize;
    let mut edits = Vec::new();
    while let Some(path) = pending.pop() {
        entries += 1;
        if entries > 20_000 { return Err("Canvas 引用检查超过 20000 项预算，未移动文件".into()); }
        let meta = fs::symlink_metadata(&path).map_err(|e|e.to_string())?;
        if meta.file_type().is_symlink() { continue; }
        if meta.is_dir() {
            for entry in fs::read_dir(path).map_err(|e|e.to_string())? {
                let entry = entry.map_err(|e|e.to_string())?;
                if entry.file_name().to_string_lossy().starts_with('.') { continue; }
                if entries + pending.len() >= 20_000 { return Err("Canvas 引用检查超过 20000 项预算，未移动文件".into()); }
                pending.push(entry.path());
            }
            continue;
        }
        if !meta.is_file() || !path.extension().is_some_and(|e|e.eq_ignore_ascii_case("canvas")) { continue; }
        if meta.len() > 20 * 1024 * 1024 { return Err(format!("{} 超过 Canvas 20 MiB 引用检查预算，未移动文件",path.display())); }
        let mut original = String::new();
        fs::File::open(&path).map_err(|e|e.to_string())?.take(20*1024*1024+1).read_to_string(&mut original).map_err(|e|format!("{} 不是可核对的 UTF-8 Canvas：{e}",path.display()))?;
        total += original.len();
        if original.len() > 20*1024*1024 || total > 64*1024*1024 { return Err("Canvas 引用原文超过检查预算，未移动文件".into()); }
        crate::formats::canvas::validate_canvas_json(&original).map_err(|e|format!("{} 无法核对引用：{e}；未移动文件",path.display()))?;
        let document: Canvas<'_> = serde_json::from_str(&original).map_err(|e|e.to_string())?;
        let mut replacements = Vec::new();
        for raw_node in document.nodes {
            let node: HashMap<&str, &RawValue> = serde_json::from_str(raw_node.get()).map_err(|e|e.to_string())?;
            if node.get("type").and_then(|v|serde_json::from_str::<String>(v.get()).ok()).as_deref() != Some("file") { continue; }
            let Some(raw) = node.get("file") else { continue; };
            let reference: String = serde_json::from_str(raw.get()).map_err(|e|e.to_string())?;
            let input = PathBuf::from(reference.replace('/', std::path::MAIN_SEPARATOR_STR));
            // No basename search or rebasing against the Canvas directory.
            let candidate = match guard.resolve_for_write(input) { Ok(p) => p, Err(_) => continue };
            if !candidate.starts_with(source) { continue; }
            let resolved = guard.resolve_existing(&candidate).map_err(|_|format!("{} 的来源 {} 已失效，请重新指定后再整理文件",path.display(),reference))?;
            if !resolved.is_file() { return Err(format!("{} 引用的来源不是文件，未移动",path.display())); }
            let next = mapped(&resolved, source, target);
            if path_key(&resolved) == path_key(&next) { continue; }
            let value = next.strip_prefix(guard.root()).map_err(|e|e.to_string())?.to_string_lossy().replace('\\', "/");
            let start = (raw.get().as_ptr() as usize).checked_sub(original.as_ptr() as usize).ok_or("Canvas 源码范围异常")?;
            let end = start.checked_add(raw.get().len()).ok_or("Canvas 源码范围溢出")?;
            if original.get(start..end) != Some(raw.get()) { return Err("Canvas 引用源码范围核对失败".into()); }
            replacements.push((start,end,serde_json::to_string(&value).map_err(|e|e.to_string())?));
        }
        if replacements.is_empty() { continue; }
        replacements.sort_by_key(|item|item.0);
        if replacements.windows(2).any(|pair|pair[0].1 > pair[1].0) { return Err("Canvas 引用范围重叠，未移动文件".into()); }
        let mut replacement = original.clone();
        for (start,end,value) in replacements.iter().rev() { replacement.replace_range(*start..*end,value); }
        crate::formats::canvas::validate_canvas_json(&replacement)?;
        edits.push(DocumentEdit { source:path.clone(), target:mapped(&path,source,target), snapshot_sha256:format!("{:x}",Sha256::digest(original.as_bytes())), original, replacement, changed_references:replacements.len() });
    }
    Ok(edits)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canvas_root_references_patch_only_exact_string_spans_and_keep_unknown_bytes() {
        let fixture = crate::services::test_workspace::TestWorkspace::new();
        let root = &fixture.0;
        fs::create_dir(root.join("notes")).unwrap();
        fs::create_dir(root.join("boards")).unwrap();
        fs::write(root.join("notes/资料.md"),"original").unwrap();
        let original = "{\"nodes\":[{\"id\":\"f\",\"type\":\"file\",\"file\":\"notes/资料.md\",\"x\":0,\"y\":0,\"width\":200,\"height\":100,\"vendor\":{\"file\":\"notes/资料.md\"}}],\"edges\":[],\"unknown\":1.00}\r\n";
        fs::write(root.join("boards/项目.canvas"),original).unwrap();
        let source = root.join("notes/资料.md").canonicalize().unwrap();
        let edits = plan(root,&source,&root.join("notes/新名称.md")).unwrap();
        assert_eq!(edits.len(),1);
        assert_eq!(edits[0].changed_references,1);
        assert_eq!(edits[0].replacement,original.replacen("\"file\":\"notes/资料.md\"","\"file\":\"notes/新名称.md\"",1));
        assert_eq!(fs::read_to_string(root.join("boards/项目.canvas")).unwrap(),original,"planning is read-only");
        assert!(plan(root,&root.join("boards").canonicalize().unwrap(),&root.join("moved-boards")).unwrap().is_empty(),"moving the board alone must not rebase root references");
    }
}
