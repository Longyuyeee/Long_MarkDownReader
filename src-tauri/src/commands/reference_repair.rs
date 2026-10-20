//! Read-only source checks shared by reference and relationship repair.
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::{fs, io::Read, path::Path};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCheck {
    pub path: String,
    pub parent: String,
    pub status: String,
    pub message: String,
    pub signature: String,
    pub location_status: String,
    pub location_message: String,
}
pub(crate) fn signature(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(format!("{}:{}", metadata.len(), metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|t| t.as_nanos()).unwrap_or(0)))
}
pub(crate) fn inspect(root: &str, input: &str, page: Option<u32>, annotation: Option<&str>, quote: Option<&str>, digest: Option<&str>) -> Result<SourceCheck, String> {
    let guard = WorkspaceGuard::new(root)?;
    let path = guard.resolve_for_write(input)?;
    if path.strip_prefix(guard.root()).map_err(|e| e.to_string())?.components().any(|p| p.as_os_str().to_string_lossy().starts_with('.')) { return Err("请选择资料文件，应用内部记录不参与来源修复".into()); }
    let mut parent = path.parent().unwrap_or(guard.root());
    while !parent.is_dir() { parent = parent.parent().unwrap_or(guard.root()); }
    let mut result = SourceCheck { path: path.to_string_lossy().into_owned(), parent: parent.to_string_lossy().into_owned(), status: "unreadable".into(), message: "文件暂时不可读取，请检查权限或稍后重试".into(), signature: String::new(), location_status: if page.is_some() || annotation.is_some() || quote.is_some() || digest.is_some() { "unverified" } else { "none" }.into(), location_message: if page.is_some() || annotation.is_some() || quote.is_some() || digest.is_some() { "文件不可读，暂时无法核对原位置" } else { "没有指定页码或文字位置" }.into() };
    let metadata = match fs::metadata(&path) { Ok(m) => m, Err(e) => { if e.kind() == std::io::ErrorKind::NotFound { result.status = "missing".into(); result.message = "原位置没有这个文件，可以选择移动后的文件".into(); } return Ok(result) } };
    if !metadata.is_file() || fs::File::open(&path).is_err() { return Ok(result); }
    result.status = "available".into(); result.message = "文件可读取".into(); result.signature = signature(&path)?;
    if page.is_none() && annotation.is_none() && quote.is_none() && digest.is_none() { return Ok(result); }
    result.location_status = "unverified".into(); result.location_message = "位置尚未核对，可只关联文件后重新定位".into();
    let pdf = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf"));
    if digest.is_some() && !pdf { result.location_status = "unavailable".into(); result.location_message = "原来源为 PDF，不能将批注直接定位到其他格式".into(); return Ok(result); }
    if let Some(expected) = digest { if let Err(error) = super::pdf_reading::verify(root, input, expected, None) { result.location_status = "unavailable".into(); result.location_message = error; return Ok(result); } }
    if pdf && quote.is_none() && metadata.len() <= 32 * 1024 * 1024 {
        let mut pdf_bytes = Vec::new(); fs::File::open(&path).map_err(|e| e.to_string())?.take(32 * 1024 * 1024 + 1).read_to_end(&mut pdf_bytes).map_err(|e| e.to_string())?;
        if pdf_bytes.len() > 32 * 1024 * 1024 { return Err("PDF 在核对期间变大，请重新核对".into()); }
        if let Ok(document) = lopdf::Document::load_mem(&pdf_bytes) {
            let count = document.get_pages().len();
            if page.is_some_and(|n| n == 0 || n as usize > count) { result.location_status = "unavailable".into(); result.location_message = format!("原页码不在这份 PDF 的 1–{count} 页内"); return Ok(result); }
            if let Some(id) = annotation {
                let sidecar = path.with_file_name(format!("{}.annotations.json", path.file_name().unwrap().to_string_lossy()));
                let annotation_found = (|| -> Result<bool, String> {
                    let sidecar = guard.resolve_existing_file(sidecar, &["json"])?;
                    let mut bytes = Vec::new(); fs::File::open(sidecar).map_err(|e| e.to_string())?.take(5 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
                    if bytes.len() > 5 * 1024 * 1024 { return Err("批注记录过大".into()); }
                    let value: crate::formats::pdf_annotations::PdfAnnotationDocument = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                    crate::formats::pdf_annotations::validate_pdf_annotations(&value)?;
                    if value.source.pdf_file != path.file_name().unwrap().to_string_lossy() { return Err("批注来源文件不匹配".into()); }
                    Ok(value.annotations.iter().any(|a| a.id == id && a.page > 0 && a.page as usize <= count && page.is_none_or(|p| a.page == p)))
                })();
                match annotation_found { Ok(true) => {}, Ok(false) => { result.location_status = "unavailable".into(); result.location_message = "原批注在这个文件中不存在或页码已改变".into(); return Ok(result); }, Err(_) => { result.location_message = "批注记录无法核对，可只关联文件后重新定位".into(); return Ok(result); } }
            }
            result.location_status = "verified".into(); result.location_message = "原页码和指定批注已核对".into();
        }
    } else if let Some(quote) = quote.filter(|q| !q.is_empty() && q.chars().count() <= 160) {
        if page.is_none() && annotation.is_none() && metadata.len() <= 8 * 1024 * 1024 && path.extension().is_some_and(|e| ["md", "markdown", "txt"].iter().any(|x| e.eq_ignore_ascii_case(x))) {
            let mut text_bytes = Vec::new(); fs::File::open(&path).map_err(|e| e.to_string())?.take(8 * 1024 * 1024 + 1).read_to_end(&mut text_bytes).map_err(|e| e.to_string())?;
            if text_bytes.len() > 8 * 1024 * 1024 { return Err("文字来源在核对期间变大，请重新核对".into()); }
            if let Ok(text) = String::from_utf8(text_bytes) {
                let matches = text.match_indices(quote).take(2).count();
                result.location_status = if matches == 1 { "verified" } else { "unavailable" }.into();
                result.location_message = match matches { 1 => "原文字位置仍唯一匹配", 0 => "原文字在新来源中没有找到", _ => "原文字出现多次，不能确定原位置" }.into();
            }
        }
    }
    if signature(&path)? != result.signature { return Err("来源在核对期间已变化，请重试".into()); }
    Ok(result)
}
#[tauri::command]
pub async fn inspect_reference_source(library_root: String, path: String, page: Option<u32>, annotation_id: Option<String>, quote: Option<String>, source_digest: Option<String>) -> Result<SourceCheck, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(&library_root, &path, page, annotation_id.as_deref(), quote.as_deref(), source_digest.as_deref())).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct LinkRepair { content: String, count: usize }
#[tauri::command]
pub fn preview_source_link_repair(content: String, original_uri: String, replacement_uri: String) -> Result<LinkRepair, String> {
    use pulldown_cmark::{Event, LinkType, Parser, Tag};
    if content.len() > 2 * 1024 * 1024 || !original_uri.starts_with("longedit://") || !replacement_uri.starts_with("longedit://") { return Err("来源修复支持 2 MiB 以内的当前笔记".into()); }
    let mut spans = Vec::new();
    for (event, range) in Parser::new(&content).into_offset_iter() {
        if let Event::Start(Tag::Link { dest_url, link_type: LinkType::Inline, .. }) = event {
            if dest_url.as_ref() != original_uri { continue; }
            let raw = &content[range.clone()];
            if let Some(start) = raw.rfind("](") {
                let tail = &raw[start+2..];
                let offset = if tail == format!("{original_uri})") { Some(start+2) } else if tail == format!("<{original_uri}>)") { Some(start+3) } else { None };
                if let Some(offset) = offset { spans.push((range.start+offset, range.start+offset+original_uri.len())); }
            }
        }
    }
    if spans.is_empty() { return Err("当前笔记中没有可准确替换的来源链接，请从正文手动调整；尚未修改草稿".into()); }
    let mut next = content;
    for (start,end) in spans.iter().rev() { next.replace_range(*start..*end, &replacement_uri); }
    Ok(LinkRepair { content: next, count: spans.len() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::test_workspace::TestWorkspace;
    #[test]
    fn missing_sources_and_ambiguous_anchors_are_not_successful_positions() {
        let root = TestWorkspace::new();
        assert_eq!(inspect(&root.root(), "missing/f.txt", None, None, None, None).unwrap().status, "missing");
        fs::write(root.0.join("new.txt"), "开头\n原文\n结尾").unwrap();
        assert_eq!(inspect(&root.root(), "new.txt", None, None, Some("原文"), None).unwrap().location_status, "verified");
        fs::write(root.0.join("new.txt"), "原文\n原文").unwrap();
        assert_eq!(inspect(&root.root(), "new.txt", None, None, Some("原文"), None).unwrap().location_status, "unavailable");
        assert!(inspect(&root.root(), "../outside.txt", None, None, None, None).is_err());
    }
    #[test]
    fn pdf_pages_and_annotation_identity_are_checked_before_reusing_location() {
        let root = TestWorkspace::new();
        let bytes = include_bytes!("../../../scripts/fixtures/v126-search/Paper.pdf");
        fs::write(root.0.join("new.pdf"), bytes).unwrap();
        let document = serde_json::json!({"schemaVersion":1,"source":{"pdfFile":"new.pdf","size":bytes.len(),"modifiedAt":1},"annotations":[{"id":"a","kind":"comment","page":1,"color":"yellow","rects":[],"quote":"original","comment":"keep","createdAt":1,"updatedAt":1}]});
        fs::write(root.0.join("new.pdf.annotations.json"), document.to_string()).unwrap();
        assert_eq!(inspect(&root.root(), "new.pdf", Some(1), Some("a"), None, None).unwrap().location_status, "verified");
        assert_eq!(inspect(&root.root(), "new.pdf", Some(999), None, None, None).unwrap().location_status, "unavailable");
        assert_eq!(inspect(&root.root(), "new.pdf", Some(1), Some("deleted"), None, None).unwrap().location_status, "unavailable");
        assert_eq!(inspect(&root.root(), "new.pdf", None, None, None, None).unwrap().location_status, "none");
    }
    #[test]
    fn source_repair_only_changes_real_link_destinations_and_preserves_crlf() {
        let old = "longedit://source?path=old.md&quote=abc";
        let new = "longedit://source?path=new.md&quote=abc";
        let body = format!("[正文]({old})\r\n`[代码]({old})`\r\n```md\r\n[围栏]({old})\r\n```\r\n{old}\r\n");
        let result = preview_source_link_repair(body.clone(), old.into(), new.into()).unwrap();
        assert_eq!(result.count, 1); assert_eq!(result.content, body.replacen(old,new,1));
    }
}
