//! Explicit draft delivery. Library resources are copied/embedded, never moved.
use crate::services::{reliable_write::write_new_bytes, workspace_guard::WorkspaceGuard};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri_plugin_dialog::DialogExt;

const MAX_DRAFT: usize = 8 * 1024 * 1024;
const MAX_IMAGE: u64 = 8 * 1024 * 1024;
const MAX_IMAGES: usize = 128;
const MAX_TOTAL: usize = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryImage {
    pub source: String,
    pub data_uri: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryResources {
    pub images: Vec<DeliveryImage>,
    pub warnings: Vec<String>,
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("请在主编辑区导出文档".into())
    }
}
fn references(markdown: &str) -> BTreeSet<String> {
    let mut values = BTreeSet::new();
    for event in pulldown_cmark::Parser::new_ext(markdown, pulldown_cmark::Options::all()) {
        match event {
            pulldown_cmark::Event::Start(pulldown_cmark::Tag::Image { dest_url, .. }) => {
                values.insert(dest_url.into_string());
            }
            pulldown_cmark::Event::Html(html) | pulldown_cmark::Event::InlineHtml(html) => {
                let fragment = scraper::Html::parse_fragment(&html);
                for image in fragment.select(&scraper::Selector::parse("img[src]").unwrap()) {
                    if let Some(source) = image.value().attr("src") {
                        values.insert(source.to_owned());
                    }
                }
            }
            _ => {}
        }
    }
    values
}
fn bounded_read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| format!("无法读取图片 {}：{e}", path.display()))?;
    if file.metadata().map_err(|e| e.to_string())?.len() > limit {
        return Err("图片超过 8 MiB，请缩小后导出".into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("读取期间图片超过 8 MiB".into());
    }
    Ok(bytes)
}
fn mime(bytes: &[u8]) -> Result<(&'static str, &'static str), String> {
    use image::ImageFormat::*;
    match image::guess_format(bytes).map_err(|_| "图片内容不是支持的位图")? {
        Png => Ok(("image/png", "png")),
        Jpeg => Ok(("image/jpeg", "jpg")),
        Gif => Ok(("image/gif", "gif")),
        WebP => Ok(("image/webp", "webp")),
        Bmp => Ok(("image/bmp", "bmp")),
        Ico => Ok(("image/x-icon", "ico")),
        _ => Err("交付图片支持 PNG、JPEG、GIF、WebP、BMP 和 ICO".into()),
    }
}
pub(crate) fn prepare(
    root: &str,
    document: &str,
    markdown: &str,
) -> Result<DeliveryResources, String> {
    if markdown.len() > MAX_DRAFT {
        return Err("草稿超过 8 MiB，请分篇导出".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let source = guard.resolve_existing_file(document, &["md", "markdown"])?;
    let _lease = crate::services::document_coordination::acquire(&[&source])?;
    let refs = references(markdown);
    if refs.len() > MAX_IMAGES {
        return Err("图片超过 128 份，请分篇导出".into());
    }
    let mut result = DeliveryResources {
        images: vec![],
        warnings: vec![],
    };
    let mut total = 0usize;
    for reference in refs {
        if reference.to_ascii_lowercase().starts_with("http:")
            || reference.to_ascii_lowercase().starts_with("https:")
        {
            result
                .warnings
                .push(format!("在线图片未下载，将以链接交付：{reference}"));
            continue;
        }
        let bytes = if reference.starts_with("data:") {
            let (_, data) = reference
                .split_once(";base64,")
                .ok_or("仅支持 base64 位图，未导出")?;
            if data.len() > (MAX_IMAGE as usize * 4 / 3 + 8) {
                return Err("内嵌图片超过 8 MiB".into());
            }
            STANDARD.decode(data).map_err(|_| "内嵌图片内容无效")?
        } else {
            let clean = reference.split(['?', '#']).next().unwrap_or(&reference);
            let decoded = urlencoding::decode(clean).map_err(|_| "图片路径编码无效")?;
            if decoded.contains(':') || decoded.starts_with(['/', '\\']) {
                return Err(format!("请使用库内相对图片路径：{reference}"));
            }
            // Canonicalize parent references, then re-apply the root guard. An
            // external junction/symlink can never grant access outside this vault.
            let candidate = source
                .parent()
                .ok_or("正文没有父目录")?
                .join(decoded.replace('\\', "/"))
                .canonicalize()
                .map_err(|e| format!("图片缺失或不可访问：{reference}：{e}"))?;
            let image = guard.resolve_existing_file(
                candidate,
                &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"],
            )?;
            let _image_lease = crate::services::document_coordination::acquire(&[&image])?;
            bounded_read(&image, MAX_IMAGE)?
        };
        if bytes.len() as u64 > MAX_IMAGE {
            return Err("图片超过 8 MiB".into());
        }
        total = total.checked_add(bytes.len()).ok_or("图片大小溢出")?;
        if total > MAX_TOTAL {
            return Err("本地图片合计超过 32 MiB，请分篇导出".into());
        }
        let (kind, _) = mime(&bytes)?;
        result.images.push(DeliveryImage {
            source: reference,
            data_uri: format!("data:{kind};base64,{}", STANDARD.encode(bytes)),
        });
    }
    Ok(result)
}

pub(crate) fn save_new(target: &Path, content: &str, format: &str) -> Result<String, String> {
    let limit = if format == "html" {
        64 * 1024 * 1024
    } else {
        MAX_DRAFT
    };
    if !matches!(format, "html" | "md") || content.len() > limit {
        return Err("交付格式或大小超出范围".into());
    }
    if !target.is_absolute()
        || !target
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case(format))
    {
        return Err(format!("请选择新的 .{format} 文件，不会覆盖其他格式"));
    }
    if target.exists() || fs::symlink_metadata(target).is_ok() {
        return Err("同名文件已存在，未覆盖；请换名或选择其他位置".into());
    }
    let parent = target
        .parent()
        .ok_or("交付目录无效")?
        .canonicalize()
        .map_err(|e| format!("目录不可访问：{e}"))?;
    let path = parent.join(target.file_name().ok_or("交付文件名无效")?);
    let _lease = crate::services::document_coordination::acquire(&[&path])?;
    write_new_bytes(&path, content.as_bytes())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn prepare_writing_delivery(
    window: tauri::WebviewWindow,
    library_root: String,
    document_path: String,
    markdown: String,
) -> Result<DeliveryResources, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || prepare(&library_root, &document_path, &markdown))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_writing_delivery(
    window: tauri::WebviewWindow,
    app_handle: tauri::AppHandle,
    suggested_name: String,
    content: String,
    format: String,
) -> Result<Option<String>, String> {
    main_only(&window)?;
    if !matches!(format.as_str(), "md" | "html") {
        return Err("不支持的交付格式".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let stem = crate::sanitize_filename(
            PathBuf::from(suggested_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("文章"),
        );
        let selected = app_handle
            .dialog()
            .file()
            .set_title("导出新文档（不覆盖已有文件）")
            .set_file_name(format!("{stem}.{format}"))
            .add_filter("交付文档", &[format.as_str()])
            .blocking_save_file();
        match selected {
            None => Ok(None),
            Some(path) => save_new(
                &path.into_path().map_err(|e| e.to_string())?,
                &content,
                &format,
            )
            .map(Some),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(crate) fn store_image(root: &str, document: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() as u64 > MAX_IMAGE {
        return Err("图片超过 8 MiB，请缩小后插入".into());
    }
    let (_, extension) = mime(bytes)?;
    let guard = WorkspaceGuard::new(root)?;
    let source = guard.resolve_existing_file(document, &["md", "markdown"])?;
    let _lease = crate::services::document_coordination::acquire(&[&source])?;
    let directory =
        guard.resolve_directory(source.parent().ok_or("正文目录无效")?.join(".assets"), true)?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let name = format!("{:x}.{extension}", Sha256::digest(bytes));
    let path = guard.resolve_for_write(directory.join(&name))?;
    let _image_lease = crate::services::document_coordination::acquire(&[&path])?;
    if path.exists() {
        if bounded_read(&path, MAX_IMAGE)? != bytes {
            return Err("同名图片内容不一致，未覆盖".into());
        }
    } else {
        write_new_bytes(&path, bytes)?;
    }
    Ok(format!(".assets/{name}"))
}
#[tauri::command]
pub async fn insert_writing_image(
    window: tauri::WebviewWindow,
    library_root: String,
    document_path: String,
    base64_content: String,
) -> Result<String, String> {
    main_only(&window)?;
    if base64_content.len() > (MAX_IMAGE as usize * 4 / 3 + 8) {
        return Err("图片超过 8 MiB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD
            .decode(base64_content)
            .map_err(|_| "图片数据无效")?;
        store_image(&library_root, &document_path, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "writing_delivery_tests.rs"]
mod tests;
