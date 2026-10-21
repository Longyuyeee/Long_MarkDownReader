//! Portable PDF sources in copied, saved Markdown. Never edits the source note.
use base64::{engine::general_purpose::STANDARD, Engine};
use pulldown_cmark::{Event, LinkType, Parser, Tag};
use serde_json::Value;
use std::{collections::BTreeMap, ops::Range, path::Path};

pub(crate) struct PdfLink {
    pub range: Range<usize>,
    pub uri: String,
    pub relative: String,
}
pub(crate) fn pdf_relative(value: &str) -> Result<String, String> {
    let value = value.replace('\\', "/");
    if value.len() > 4096
        || !value.to_lowercase().ends_with(".pdf")
        || value.contains([':', '\0'])
        || value.starts_with('/')
        || value
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("PDF 来源位置无法确认；可取消携带阅读成果后原样复制".into());
    }
    Ok(value)
}
fn parse_uri(uri: &str) -> Result<(tauri::Url, String), String> {
    if !uri.starts_with("longedit://pdf?") {
        return Err("PDF 来源链接无法确认".into());
    }
    let url = tauri::Url::parse(uri).map_err(|_| "PDF 来源链接无法读取")?;
    let pairs: Vec<_> = url.query_pairs().collect();
    let paths: Vec<_> = pairs.iter().filter(|(k, _)| k == "path").collect();
    if url.scheme() != "longedit" || url.host_str() != Some("pdf") || paths.len() != 1 {
        return Err("PDF 来源链接无法确认".into());
    }
    let relative = pdf_relative(&paths[0].1)?;
    for key in ["page", "annotation", "sha256"] {
        let values: Vec<_> = pairs
            .iter()
            .filter(|(k, _)| k == key)
            .map(|(_, v)| v.as_ref())
            .collect();
        let valid = match key {
            "page" => {
                values.len() == 1
                    && values[0]
                        .parse::<u32>()
                        .is_ok_and(|n| (1..=100_000).contains(&n))
            }
            "annotation" => {
                values.len() == 1
                    && !values[0].is_empty()
                    && values[0].chars().count() <= 128
                    && !values[0].contains('\0')
            }
            _ => {
                values.is_empty()
                    || (values.len() == 1
                        && values[0].len() == 64
                        && values[0].bytes().all(|c| c.is_ascii_hexdigit()))
            }
        };
        if !valid {
            return Err("PDF 来源的页码、批注或摘要无法确认；可取消携带后原样复制".into());
        }
    }
    Ok((url, relative))
}
pub(crate) fn pdf_links(content: &str) -> Result<Vec<PdfLink>, String> {
    let mut result = Vec::new();
    for (event, range) in Parser::new(content).into_offset_iter() {
        if let Event::Start(Tag::Link {
            dest_url,
            link_type,
            ..
        }) = event
        {
            if !dest_url.starts_with("longedit://pdf?") {
                continue;
            }
            if link_type != LinkType::Inline {
                return Err("PDF 来源须为直接链接；可取消携带阅读成果后原样复制".into());
            }
            let (_, relative) = parse_uri(&dest_url)?;
            let raw = &content[range.clone()];
            let at = raw.rfind("](").ok_or("PDF 来源语法无法确认")? + 2;
            let at = at + usize::from(raw[at..].starts_with('<'));
            let start = range.start + at;
            let end = start + dest_url.len();
            if content.get(start..end) != Some(dest_url.as_ref()) {
                return Err("PDF 来源语法无法确认".into());
            }
            result.push(PdfLink {
                range: start..end,
                uri: dest_url.into_string(),
                relative,
            });
        }
    }
    Ok(result)
}
pub(crate) fn remap_uri(uri: &str, paths: &BTreeMap<String, String>) -> Result<String, String> {
    let (mut url, relative) = parse_uri(uri)?;
    let target = paths.get(&relative).ok_or("PDF 来源未包含在复制范围中")?;
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    {
        let mut query = url.query_pairs_mut();
        query.clear();
        for (key, value) in pairs {
            query.append_pair(&key, if key == "path" { target } else { &value });
        }
    }
    Ok(url.into())
}
const PREFIX: &str = "<!-- longedit:pdf-reading:v1 ";
fn metadata(content: &str) -> Result<Vec<(Range<usize>, Value)>, String> {
    let mut result = Vec::new();
    let mut offset = 0;
    let mut fence: Option<(u8, usize)> = None;
    for line in content.split_inclusive('\n') {
        let raw = line.trim_end_matches(['\r', '\n']);
        let trimmed = raw.trim_start_matches(' ');
        let indent = raw.len() - trimmed.len();
        let marker = trimmed
            .as_bytes()
            .first()
            .copied()
            .filter(|b| *b == b'`' || *b == b'~');
        let count = marker.map_or(0, |b| trimmed.bytes().take_while(|c| *c == b).count());
        if indent <= 3 && count >= 3 {
            match fence {
                None => fence = Some((marker.unwrap(), count)),
                Some((b, n))
                    if marker == Some(b) && count >= n && trimmed[count..].trim().is_empty() =>
                {
                    fence = None
                }
                _ => {}
            }
        } else if fence.is_none() && raw.starts_with(PREFIX) {
            let encoded = raw
                .strip_prefix(PREFIX)
                .unwrap()
                .strip_suffix(" -->")
                .ok_or("阅读笔记的生成记录不完整")?;
            if encoded.len() > 3 * 1024 * 1024 {
                return Err("阅读笔记生成记录过大，请分批复制".into());
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| "阅读笔记生成记录无法读取")?;
            let value: Value =
                serde_json::from_slice(&bytes).map_err(|_| "阅读笔记生成记录无法读取")?;
            if value["version"] != 1
                || !value["snapshot"]["items"].is_array()
                || value["snapshot"]["items"].as_array().unwrap().len() > 200
            {
                return Err("阅读笔记生成记录不支持；可取消携带阅读成果后原样复制".into());
            }
            result.push((
                offset + PREFIX.len()..offset + PREFIX.len() + encoded.len(),
                value,
            ));
        }
        offset += line.len();
    }
    Ok(result)
}
pub(crate) fn metadata_sources(content: &str) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    for (_, value) in metadata(content)? {
        result.push(pdf_relative(
            value["snapshot"]["relativePath"]
                .as_str()
                .ok_or("阅读笔记缺少来源位置")?,
        )?);
        for item in value["snapshot"]["items"].as_array().unwrap() {
            result.push(parse_uri(item["uri"].as_str().ok_or("阅读笔记缺少来源链接")?)?.1);
        }
    }
    result.sort();
    result.dedup();
    Ok(result)
}
pub(crate) fn remap_metadata(
    content: &str,
    paths: &BTreeMap<String, String>,
) -> Result<String, String> {
    let mut result = content.to_owned();
    for (range, mut value) in metadata(content)?.into_iter().rev() {
        let old = pdf_relative(
            value["snapshot"]["relativePath"]
                .as_str()
                .ok_or("阅读笔记缺少来源位置")?,
        )?;
        let next = paths.get(&old).ok_or("阅读笔记来源未包含")?;
        value["snapshot"]["relativePath"] = Value::String(next.clone());
        for item in value["snapshot"]["items"].as_array_mut().unwrap() {
            item["uri"] = Value::String(remap_uri(
                item["uri"].as_str().ok_or("阅读笔记缺少来源链接")?,
                paths,
            )?);
        }
        let next = STANDARD.encode(serde_json::to_vec(&value).map_err(|e| e.to_string())?);
        result.replace_range(range, &next);
    }
    Ok(result)
}
pub(crate) fn annotation_path(pdf: &Path) -> Result<std::path::PathBuf, String> {
    Ok(pdf.with_file_name(format!(
        "{}.annotations.json",
        pdf.file_name()
            .and_then(|v| v.to_str())
            .ok_or("PDF 文件名不可用")?
    )))
}
