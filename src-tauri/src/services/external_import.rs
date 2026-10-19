//! Import selected files without replacing library content. Publish Markdown last.
use crate::formats::file_registry::file_format_for_path;
use crate::services::workspace_guard::WorkspaceGuard;
use pulldown_cmark::{Event, LinkType, Parser, Tag};
use std::{
    collections::HashMap,
    fs,
    io::{self, Write},
    ops::Range,
    path::{Path, PathBuf},
    sync::LazyLock,
};

static HTML_IMAGE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r#"(?is)<img\b(?:"[^"]*"|'[^']*'|[^"'<>])*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#,
    )
    .unwrap()
});
const MAX_MARKDOWN_BYTES: u64 = 20 * 1024 * 1024;
const MAX_IMAGES: usize = 512;

#[derive(Debug)]
pub(crate) struct Image {
    pub(crate) range: Range<usize>,
    pub(crate) target: String,
    pub(crate) html: bool,
}

// Called only inside parser-established image syntax/definitions, never code text.
fn destination_range(text: &str, start: usize, end: usize) -> Result<Range<usize>, String> {
    let bytes = text.as_bytes();
    let mut at = start;
    while at < end && bytes[at].is_ascii_whitespace() {
        at += 1;
    }
    if at >= end {
        return Err("图片路径为空，未导入任何文件".into());
    }
    if bytes[at] == b'<' {
        let close = text[at + 1..end].find('>').ok_or("图片路径格式不完整")?;
        return Ok(at + 1..at + 1 + close);
    }
    let begin = at;
    let mut depth = 0;
    while at < end {
        match bytes[at] {
            b'\\' if at + 1 < end => {
                at += 2;
                continue;
            }
            b'(' => depth += 1,
            b')' if depth == 0 => break,
            b')' => depth -= 1,
            value if value.is_ascii_whitespace() && depth == 0 => break,
            _ => {}
        }
        at += 1;
    }
    if at == begin {
        return Err("图片路径为空，未导入任何文件".into());
    }
    Ok(begin..at)
}

pub(crate) fn images(text: &str) -> Result<Vec<Image>, String> {
    let parser = Parser::new(text);
    let definitions: Vec<_> = parser
        .reference_definitions()
        .iter()
        .map(|(id, def)| {
            (
                id.to_string().to_lowercase(),
                def.dest.to_string(),
                def.span.clone(),
            )
        })
        .collect();
    let mut result = Vec::new();
    for (event, range) in parser.into_offset_iter() {
        match event {
            Event::Start(Tag::Image {
                dest_url,
                link_type,
                id,
                ..
            }) => {
                let destination = if link_type == LinkType::Inline {
                    let source = &text[range.clone()];
                    let offset = source
                        .rfind("](")
                        .ok_or("暂不能安全迁移这条图片语法，请使用普通图片链接")?;
                    destination_range(text, range.start + offset + 2, range.end)?
                } else {
                    let (_, _, definition) = definitions
                        .iter()
                        .find(|(key, _, _)| key == &id.to_lowercase())
                        .ok_or("未找到图片引用定义")?;
                    let source = &text[definition.clone()];
                    let offset = source.find("]:").ok_or("图片引用定义无法安全迁移")?;
                    destination_range(text, definition.start + offset + 2, definition.end)?
                };
                let raw = &text[destination.clone()];
                let mut unescaped = String::new();
                let mut chars = raw.chars().peekable();
                while let Some(character) = chars.next() {
                    if character == '\\'
                        && chars.peek().is_some_and(|next| next.is_ascii_punctuation())
                    {
                        unescaped.push(chars.next().unwrap());
                    } else {
                        unescaped.push(character);
                    }
                }
                if unescaped != dest_url.as_ref()
                    && quick_xml::escape::unescape(&unescaped)
                        .map(|value| value.as_ref() != dest_url.as_ref())
                        .unwrap_or(true)
                {
                    return Err("图片语法暂不能可靠迁移，请改为普通图片链接；未导入任何文件".into());
                }
                result.push(Image {
                    range: destination,
                    target: dest_url.to_string(),
                    html: false,
                });
            }
            Event::Html(_) | Event::InlineHtml(_) => {
                let source = &text[range.clone()];
                if source.trim_start().starts_with("<!--") {
                    continue;
                }
                for capture in HTML_IMAGE.captures_iter(source) {
                    let value = capture
                        .get(1)
                        .or_else(|| capture.get(2))
                        .or_else(|| capture.get(3))
                        .unwrap();
                    result.push(Image {
                        range: range.start + value.start()..range.start + value.end(),
                        target: match quick_xml::escape::unescape(value.as_str()) {
                            Ok(decoded) => decoded.into_owned(),
                            Err(_) if !value.as_str().contains(';') => value.as_str().to_string(),
                            Err(_) => {
                                return Err(
                                    "HTML 图片路径包含不支持的实体，请使用普通图片路径".into()
                                )
                            }
                        },
                        html: true,
                    });
                }
            }
            _ => {}
        }
    }
    result.sort_by_key(|image| image.range.start);
    result.dedup_by_key(|image| image.range.start);
    if result.len() > MAX_IMAGES {
        return Err("单份资料的图片超过 512 项，请拆分后再导入".into());
    }
    Ok(result)
}

fn local_image(target: &str) -> Result<Option<(&str, &str)>, String> {
    let lower = target.to_lowercase();
    if lower.starts_with("https:")
        || lower.starts_with("http:")
        || lower.starts_with("data:")
        || lower.starts_with("misty-img:")
        || target.starts_with("//")
    {
        return Ok(None);
    }
    let split = target.find(['?', '#']).unwrap_or(target.len());
    let (path, suffix) = target.split_at(split);
    if suffix.contains(['\'', '"', '<', '>', '\r', '\n']) {
        return Err("图片查询参数含不支持的字符，请先简化图片链接".into());
    }
    if path.is_empty() || path.starts_with('/') || path.contains([':', '\\', '\0']) {
        return Err(format!(
            "无法安全迁移图片路径：{target}。请使用资料文件夹内的普通相对路径"
        ));
    }
    Ok(Some((path, suffix)))
}

fn unique_name(source: &Path, number: usize) -> Result<String, String> {
    let name = source.file_name().ok_or("文件名不可用")?.to_string_lossy();
    if number == 0 {
        return Ok(name.into_owned());
    }
    let suffix = file_format_for_path(source)
        .ok()
        .and_then(|format| {
            format
                .extensions
                .iter()
                .filter(|ext| name.to_lowercase().ends_with(ext.as_str()))
                .max_by_key(|ext| ext.len())
                .cloned()
        })
        .or_else(|| {
            source
                .extension()
                .map(|ext| format!(".{}", ext.to_string_lossy()))
        })
        .unwrap_or_default();
    let counter = if number == 1 {
        String::new()
    } else {
        format!(" {number}")
    };
    Ok(format!(
        "{} - 副本{counter}{suffix}",
        &name[..name.len() - suffix.len()]
    ))
}

fn publish(source: &Path, destination: &Path, bytes: Option<&[u8]>) -> Result<PathBuf, String> {
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let staging = destination.join(format!(
        ".longedit-import-{}-{time}-{sequence}.tmp",
        std::process::id()
    ));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|e| format!("无法准备导入文件：{e}"))?;
    let result = (|| -> Result<PathBuf, String> {
        if let Some(bytes) = bytes {
            output.write_all(bytes).map_err(|e| e.to_string())?;
        } else {
            io::copy(
                &mut fs::File::open(source).map_err(|e| e.to_string())?,
                &mut output,
            )
            .map_err(|e| e.to_string())?;
        }
        output.sync_all().map_err(|e| e.to_string())?;
        drop(output);
        for number in 0..10000 {
            let path = destination.join(unique_name(source, number)?);
            match super::archive_move::rename_no_replace(&staging, &path) {
                Ok(()) => return Ok(path),
                Err(error)
                    if error.kind() == io::ErrorKind::AlreadyExists
                        || fs::symlink_metadata(&path).is_ok() =>
                {
                    continue
                }
                Err(error) => return Err(format!("无法发布导入文件，未覆盖已有内容：{error}")),
            }
        }
        Err("同名文件过多，请选择其他目录".into())
    })();
    if result.is_err() && staging.exists() {
        if fs::remove_file(&staging).is_err() {
            return Err(format!(
                "{}；临时文件未能清理，请核对 {}",
                result.unwrap_err(),
                staging.display()
            ));
        }
    }
    result
}

#[derive(Default)]
struct Assets {
    directory: Option<PathBuf>,
    files: Vec<PathBuf>,
    committed: bool,
}
impl Drop for Assets {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        // Remove only files created by this import, never recurse over user content.
        for path in &self.files {
            let _ = fs::remove_file(path);
        }
        if let Some(path) = &self.directory {
            let _ = fs::remove_dir(path);
        }
    }
}

pub(crate) fn import_file(source: &Path, destination: &Path) -> Result<PathBuf, String> {
    let _activity = super::file_activity::read_write(&[source, destination])?;
    if file_format_for_path(source)?.id != "markdown" {
        return publish(source, destination, None);
    }
    if fs::metadata(source).map_err(|e| e.to_string())?.len() > MAX_MARKDOWN_BYTES {
        return Err("Markdown 超过 20 MiB，请先拆分再迁移附带图片".into());
    }
    let original = fs::read_to_string(source)
        .map_err(|e| format!("Markdown 读取失败，请检查 UTF-8 编码：{e}"))?;
    let mentions = images(&original)?;
    let parent = source.parent().ok_or("来源文件没有有效目录")?;
    let source_guard = WorkspaceGuard::new(parent)?;
    let mut resources = Vec::new();
    for image in mentions {
        if let Some((raw, suffix)) = local_image(&image.target)? {
            let decoded =
                urlencoding::decode(raw).map_err(|_| format!("图片路径编码无效：{raw}"))?;
            let path = source_guard
                .resolve_existing(parent.join(decoded.as_ref()))
                .map_err(|_| {
                    format!(
                        "本地图片不存在或超出资料文件夹：{raw}。未完成导入，原文件和已有资料未覆盖"
                    )
                })?;
            if !path.is_file() {
                return Err(format!("本地图片不是文件：{raw}"));
            }
            if !matches!(
                file_format_for_path(&path)?.id.as_str(),
                "raster-image" | "svg"
            ) {
                return Err(format!(
                    "图片引用不是支持的图像文件：{raw}，请单独处理其他附件"
                ));
            }
            resources.push((image.range.clone(), path, suffix.to_owned(), image.html));
        }
    }
    let mut assets = Assets::default();
    if !resources.is_empty() {
        let stem = source.file_stem().ok_or("文件名无效")?.to_string_lossy();
        for number in 0..10000 {
            let counter = if number == 0 {
                String::new()
            } else {
                format!("-{number}")
            };
            let path = destination.join(format!("{stem}{counter}.assets"));
            match fs::create_dir(&path) {
                Ok(()) => {
                    assets.directory = Some(path);
                    break;
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(format!("无法创建图片目录：{error}")),
            }
        }
        if assets.directory.is_none() {
            return Err("同名图片目录过多".into());
        }
    }
    let mut copied: HashMap<PathBuf, String> = HashMap::new();
    let mut edits = Vec::new();
    for (range, path, suffix, html) in resources {
        let relative = if let Some(relative) = copied.get(&path) {
            relative.clone()
        } else {
            let folder = assets.directory.as_ref().unwrap();
            let name = format!(
                "{:04}-{}",
                copied.len() + 1,
                path.file_name().unwrap().to_string_lossy()
            );
            let target = folder.join(&name);
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|e| format!("图片复制失败：{e}"))?;
            assets.files.push(target);
            io::copy(
                &mut fs::File::open(&path).map_err(|e| format!("图片读取失败：{e}"))?,
                &mut output,
            )
            .and_then(|_| output.sync_all())
            .map_err(|e| format!("图片复制失败：{e}"))?;
            let relative = format!(
                "{}/{}",
                urlencoding::encode(&folder.file_name().unwrap().to_string_lossy()),
                urlencoding::encode(&name)
            );
            copied.insert(path.clone(), relative.clone());
            relative
        };
        let replacement = format!("{relative}{suffix}");
        edits.push((
            range,
            if html {
                replacement.replace('&', "&amp;")
            } else {
                replacement
            },
        ));
    }
    let mut content = original;
    for (range, replacement) in edits.into_iter().rev() {
        content.replace_range(range, &replacement);
    }
    let imported = publish(source, destination, Some(content.as_bytes()))?;
    assets.committed = true;
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "longedit-safe-import-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("source/images")).unwrap();
        fs::create_dir(root.join("library")).unwrap();
        root
    }
    #[test]
    fn inline_reference_html_images_keep_titles_and_copy_exact_bytes() {
        let root = fixture();
        let text = "# 标题\r\n![图](<images/a b.png?size=2#x> \"说明\")\r\n![第二张][pic]\r\n\r\n[pic]: images/a%20b.png \"标题\"\r\n\r\n<img data-src='images/not-an-image.png' src='images/a%20b.png' alt='图片'>\r\n`![示例](images/missing.png)`\r\n```md\r\n![代码](images/missing.png)\r\n```\r\n";
        assert_eq!(
            images(text).unwrap().len(),
            3,
            "fixture must contain three parser-recognized image destinations"
        );
        fs::write(root.join("source/note.md"), text).unwrap();
        fs::write(root.join("source/images/a b.png"), b"exact-image").unwrap();
        let imported = import_file(&root.join("source/note.md"), &root.join("library")).unwrap();
        let content = fs::read_to_string(imported).unwrap();
        assert!(content.contains("?size=2#x> \"说明\""));
        assert!(content.contains("\"标题\""));
        assert!(content.contains("alt='图片'"));
        assert!(content.contains("`![示例](images/missing.png)`"));
        assert!(content.contains("![代码](images/missing.png)"));
        assert_eq!(
            content.matches("\r\n").count(),
            text.matches("\r\n").count()
        );
        let references = images(&content).unwrap();
        assert_eq!(references.len(), 3);
        for image in references {
            let (path, _) = local_image(&image.target).unwrap().unwrap();
            assert_eq!(
                fs::read(
                    root.join("library")
                        .join(urlencoding::decode(path).unwrap().as_ref())
                )
                .unwrap(),
                b"exact-image"
            );
        }
        assert_eq!(
            fs::read_to_string(root.join("source/note.md")).unwrap(),
            text
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn compound_extension_and_binary_bytes_are_preserved() {
        let root = fixture();
        let source = root.join("source/data.table.json");
        fs::write(&source, b"{\"rows\":[]}").unwrap();
        fs::write(root.join("library/data.table.json"), b"existing").unwrap();
        let imported = import_file(&source, &root.join("library")).unwrap();
        assert!(imported.ends_with("data - 副本.table.json"));
        assert_eq!(fs::read(imported).unwrap(), b"{\"rows\":[]}");
        assert_eq!(
            fs::read(root.join("library/data.table.json")).unwrap(),
            b"existing"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn html_image_attributes_do_not_hide_or_impersonate_the_real_source() {
        let root = fixture();
        let source = root.join("source/note.md");
        let text =
            "<img title=\"a > b\" data-hint=\" src='images/missing.png'\" src=\"images/a.png\">\n";
        fs::write(&source, text).unwrap();
        fs::write(root.join("source/images/a.png"), b"real-image").unwrap();
        let imported = import_file(&source, &root.join("library")).unwrap();
        let content = fs::read_to_string(imported).unwrap();
        assert!(content.contains("note.assets/0001-a.png"), "the real src must be migrated even when other attributes contain angle brackets or src-like text");
        assert!(content.contains("data-hint=\" src='images/missing.png'\""));
        assert_eq!(
            fs::read(root.join("library/note.assets/0001-a.png")).unwrap(),
            b"real-image"
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), text);
        fs::write(
            &source,
            "<img alt=\" src='images/a.png'\" src=\"images/missing.png\">",
        )
        .unwrap();
        assert!(
            import_file(&source, &root.join("library")).is_err(),
            "an attribute must not impersonate a missing real image source"
        );
        assert!(!root.join("library/note - 副本.md").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn image_ampersands_and_html_entities_preserve_resource_identity() {
        let root = fixture();
        let source = root.join("source/note.md");
        fs::write(
            &source,
            "![图](images/R&D.png)\n\n<img src=\"images/R&amp;D.png?x=1&amp;y=2\">",
        )
        .unwrap();
        fs::write(root.join("source/images/R&D.png"), b"same-image").unwrap();
        let imported = import_file(&source, &root.join("library")).unwrap();
        let content = fs::read_to_string(imported).unwrap();
        assert!(content.contains("?x=1&amp;y=2"));
        assert_eq!(images(&content).unwrap().len(), 2);
        for image in images(&content).unwrap() {
            let (path, _) = local_image(&image.target).unwrap().unwrap();
            assert_eq!(
                fs::read(
                    root.join("library")
                        .join(urlencoding::decode(path).unwrap().as_ref())
                )
                .unwrap(),
                b"same-image"
            );
        }
        assert_eq!(
            fs::read_dir(root.join("library/note.assets"))
                .unwrap()
                .count(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_preflight_leaves_no_document_or_asset_directory() {
        let root = fixture();
        let source = root.join("source/note.md");
        fs::write(
            &source,
            "![存在](images/a.png)\n![缺少](images/missing.png)",
        )
        .unwrap();
        fs::write(root.join("source/images/a.png"), b"a").unwrap();
        assert!(import_file(&source, &root.join("library")).is_err());
        assert_eq!(fs::read_dir(root.join("library")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn relative_parent_escape_is_rejected_and_remote_images_unchanged() {
        let root = fixture();
        let source = root.join("source/note.md");
        fs::write(root.join("outside.png"), b"outside").unwrap();
        fs::write(&source, "![外部](../outside.png)").unwrap();
        assert!(import_file(&source, &root.join("library")).is_err());
        let remote = "![网络](https://example.com/a.png)\n![数据](data:image/png;base64,YQ==)";
        fs::write(&source, remote).unwrap();
        let imported = import_file(&source, &root.join("library")).unwrap();
        assert_eq!(fs::read_to_string(imported).unwrap(), remote);
        assert_eq!(fs::read_dir(root.join("library")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn simultaneous_imports_never_replace_each_other() {
        let root = fixture();
        let source = root.join("source/a.pdf");
        fs::write(&source, b"document").unwrap();
        let destination = root.join("library");
        let (a, b) = std::thread::scope(|scope| {
            let a = scope.spawn(|| import_file(&source, &destination).unwrap());
            let b = scope.spawn(|| import_file(&source, &destination).unwrap());
            (a.join().unwrap(), b.join().unwrap())
        });
        assert_ne!(a, b);
        assert_eq!(fs::read(a).unwrap(), b"document");
        assert_eq!(fs::read(b).unwrap(), b"document");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn occupied_directory_name_is_preserved_and_document_uses_copy_name() {
        let root = fixture();
        let source = root.join("source/note.md");
        fs::write(&source, "content").unwrap();
        fs::create_dir(root.join("library/note.md")).unwrap();
        fs::write(root.join("library/note.md/keep.txt"), b"keep").unwrap();
        let imported = import_file(&source, &root.join("library")).unwrap();
        assert!(imported.ends_with("note - 副本.md"));
        assert_eq!(
            fs::read(root.join("library/note.md/keep.txt")).unwrap(),
            b"keep"
        );
        assert!(fs::read_dir(root.join("library"))
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".longedit-import")));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn locked_image_rolls_back_only_this_import() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = fixture();
        let source = root.join("source/note.md");
        let image = root.join("source/images/a.png");
        fs::write(&source, "![图](images/a.png)").unwrap();
        fs::write(&image, b"locked").unwrap();
        fs::write(root.join("library/keep.txt"), b"keep").unwrap();
        let lock = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&image)
            .unwrap();
        assert!(import_file(&source, &root.join("library")).is_err());
        assert_eq!(fs::read_dir(root.join("library")).unwrap().count(), 1);
        assert_eq!(fs::read(root.join("library/keep.txt")).unwrap(), b"keep");
        drop(lock);
        fs::remove_dir_all(root).unwrap();
    }
}
