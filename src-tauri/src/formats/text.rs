use encoding_rs::{Encoding, UTF_8};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentSnapshot {
    pub content: String,
    pub encoding: String,
    pub encoding_confidence: String,
    pub bom: String,
    pub line_ending: String,
    pub has_final_newline: bool,
    pub signature: String,
    pub size: u64,
    pub modified: u128,
    pub read_only_reason: Option<String>,
    pub path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextReadOptions {
    pub encoding: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSavePolicy {
    pub expected_signature: Option<String>,
    pub encoding: Option<String>,
    pub bom: Option<String>,
    pub line_ending: Option<String>,
    pub has_final_newline: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct TextEncodedDocument {
    pub bytes: Vec<u8>,
    pub expected_signature: Option<String>,
    pub normalized_content: String,
    pub encoding: String,
}

pub fn read_text_snapshot(path: &Path) -> Result<TextDocumentSnapshot, String> {
    read_text_snapshot_with_options(path, None)
}

pub fn read_text_snapshot_with_options(
    path: &Path,
    options: Option<TextReadOptions>,
) -> Result<TextDocumentSnapshot, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取文本元数据失败: {error}"))?;
    let bytes = fs::read(path).map_err(|error| format!("读取文本文件失败: {error}"))?;
    if bytes.contains(&0) {
        return Err("文本文件包含 NUL 字节，已按二进制或损坏文本拒绝".into());
    }
    let bom = detect_bom(&bytes);
    let selected_encoding = options
        .and_then(|options| options.encoding)
        .filter(|encoding| !encoding.trim().is_empty());
    let encoding = if let Some(label) = selected_encoding.as_deref() {
        Encoding::for_label(label.as_bytes()).ok_or_else(|| format!("不支持读取编码 {label}"))?
    } else {
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(strip_known_bom(&bytes), true);
        detector.guess(None, true)
    };
    let (text, _, had_errors) = encoding.decode(&bytes);
    if had_errors {
        return Err(format!(
            "无法可靠按 {} 解码该文本，请先选择编码或使用外部工具修复",
            encoding.name()
        ));
    }
    let content = text.into_owned();
    let line_ending = detect_line_ending(&content);
    Ok(TextDocumentSnapshot {
        encoding: encoding.name().to_string(),
        encoding_confidence: encoding_confidence(&bytes, encoding, selected_encoding.is_some()),
        bom: bom.into(),
        line_ending: line_ending.into(),
        has_final_newline: has_final_newline(&content),
        signature: file_signature(&metadata, &bytes),
        size: metadata.len(),
        modified: modified_nanos(&metadata),
        read_only_reason: metadata.permissions().readonly().then(|| "readonly".into()),
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

pub fn encode_text_for_save(
    current: &TextDocumentSnapshot,
    content: &str,
    policy: TextSavePolicy,
) -> Result<TextEncodedDocument, String> {
    let encoding_name = policy.encoding.as_deref().unwrap_or(&current.encoding);
    let encoding = Encoding::for_label(encoding_name.as_bytes())
        .ok_or_else(|| format!("不支持写回编码 {encoding_name}"))?;
    let line_ending = policy
        .line_ending
        .as_deref()
        .unwrap_or(&current.line_ending);
    let has_final_newline = policy
        .has_final_newline
        .unwrap_or(current.has_final_newline);
    let bom = policy.bom.as_deref().unwrap_or(&current.bom);
    let normalized = normalize_line_endings(content, line_ending, has_final_newline)?;
    let (encoded, _, had_errors) = encoding.encode(&normalized);
    if had_errors {
        return Err(format!(
            "当前内容包含无法写回 {} 编码的字符；请转换为 UTF-8 或删除这些字符",
            encoding.name()
        ));
    }
    let mut bytes = Vec::with_capacity(encoded.len() + 3);
    match bom {
        "utf-8" if encoding == UTF_8 => bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]),
        "none" => {}
        "utf-8" => return Err("UTF-8 BOM 只能用于 UTF-8 编码文本".into()),
        other => return Err(format!("暂不支持写回 {other} BOM")),
    }
    bytes.extend_from_slice(&encoded);
    Ok(TextEncodedDocument {
        bytes,
        expected_signature: policy.expected_signature,
        normalized_content: normalized,
        encoding: encoding.name().to_string(),
    })
}

pub fn verify_current_signature(
    path: &Path,
    expected_signature: Option<&str>,
) -> Result<(), String> {
    let Some(expected_signature) = expected_signature else {
        return Ok(());
    };
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取保存前文本元数据失败: {error}"))?;
    let bytes = fs::read(path).map_err(|error| format!("读取保存前文本失败: {error}"))?;
    let current = file_signature(&metadata, &bytes);
    if current == expected_signature {
        Ok(())
    } else {
        Err("文本文件已被其他程序修改，请重新加载后再保存".into())
    }
}

fn detect_bom(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        "utf-8"
    } else {
        "none"
    }
}

fn strip_known_bom(bytes: &[u8]) -> &[u8] {
    bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes)
}

fn detect_line_ending(content: &str) -> &'static str {
    let crlf = content.matches("\r\n").count();
    let without_crlf = content.replace("\r\n", "");
    let lf = without_crlf.matches('\n').count();
    let cr = without_crlf.matches('\r').count();
    if crlf >= lf && crlf >= cr && crlf > 0 {
        "crlf"
    } else if cr > lf && cr > 0 {
        "cr"
    } else {
        "lf"
    }
}

fn has_final_newline(content: &str) -> bool {
    content.ends_with('\n') || content.ends_with('\r')
}

fn normalize_line_endings(
    content: &str,
    line_ending: &str,
    has_final_newline: bool,
) -> Result<String, String> {
    let replacement = match line_ending {
        "lf" => "\n",
        "crlf" => "\r\n",
        "cr" => "\r",
        other => return Err(format!("不支持的换行符策略 {other}")),
    };
    let mut normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    while normalized.ends_with('\n') {
        normalized.pop();
    }
    if has_final_newline {
        normalized.push('\n');
    }
    Ok(normalized.replace('\n', replacement))
}

fn encoding_confidence(bytes: &[u8], encoding: &'static Encoding, user_selected: bool) -> String {
    if user_selected {
        "user-selected".into()
    } else if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) || encoding == UTF_8 {
        "certain".into()
    } else {
        "detected".into()
    }
}

fn file_signature(metadata: &fs::Metadata, bytes: &[u8]) -> String {
    format!(
        "{}:{}:{:x}",
        metadata.len(),
        modified_nanos(metadata),
        md5::compute(bytes)
    )
}

fn modified_nanos(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::reliable_write::write_bytes;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(name: &str, bytes: &[u8]) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "longedit-text-format-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("note.txt");
        fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn detects_utf8_bom_crlf_and_signature() {
        let path = fixture("utf8-bom", b"\xEF\xBB\xBFalpha\r\nbeta\r\n");
        let snapshot = read_text_snapshot(&path).unwrap();
        assert_eq!(snapshot.bom, "utf-8");
        assert_eq!(snapshot.line_ending, "crlf");
        assert!(snapshot.has_final_newline);
        assert!(snapshot.signature.contains(':'));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn preserves_bom_line_ending_and_final_newline_on_save() {
        let path = fixture("preserve", b"\xEF\xBB\xBFalpha\r\n");
        let snapshot = read_text_snapshot(&path).unwrap();
        let encoded = encode_text_for_save(
            &snapshot,
            "gamma\ndelta\n",
            TextSavePolicy {
                expected_signature: Some(snapshot.signature.clone()),
                encoding: None,
                bom: None,
                line_ending: None,
                has_final_newline: None,
            },
        )
        .unwrap();
        verify_current_signature(&path, encoded.expected_signature.as_deref()).unwrap();
        write_bytes(&path, &encoded.bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xEF\xBB\xBFgamma\r\ndelta\r\n");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn reads_and_preserves_gbk_when_user_selected() {
        let gbk = Encoding::for_label(b"gbk").unwrap();
        let (bytes, _, had_errors) = gbk.encode("中文\r\n");
        assert!(!had_errors);
        let path = fixture("gbk", &bytes);
        let snapshot = read_text_snapshot_with_options(
            &path,
            Some(TextReadOptions {
                encoding: Some("gbk".into()),
            }),
        )
        .unwrap();
        assert_eq!(snapshot.content, "中文\r\n");
        assert_eq!(snapshot.encoding, "GBK");
        assert_eq!(snapshot.encoding_confidence, "user-selected");
        let encoded = encode_text_for_save(
            &snapshot,
            "中文二\n",
            TextSavePolicy {
                expected_signature: Some(snapshot.signature.clone()),
                encoding: None,
                bom: None,
                line_ending: None,
                has_final_newline: None,
            },
        )
        .unwrap();
        write_bytes(&path, &encoded.bytes).unwrap();
        let reread = read_text_snapshot_with_options(
            &path,
            Some(TextReadOptions {
                encoding: Some("gbk".into()),
            }),
        )
        .unwrap();
        assert_eq!(reread.content, "中文二\r\n");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn can_convert_to_utf8_without_bom_explicitly() {
        let path = fixture("convert", b"\xEF\xBB\xBFalpha\r\n");
        let snapshot = read_text_snapshot(&path).unwrap();
        let encoded = encode_text_for_save(
            &snapshot,
            "beta\n",
            TextSavePolicy {
                expected_signature: None,
                encoding: Some("utf-8".into()),
                bom: Some("none".into()),
                line_ending: Some("lf".into()),
                has_final_newline: Some(false),
            },
        )
        .unwrap();
        assert_eq!(encoded.normalized_content, "beta");
        assert_eq!(encoded.bytes, b"beta");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_external_modification_before_save() {
        let path = fixture("conflict", b"alpha");
        let snapshot = read_text_snapshot(&path).unwrap();
        fs::write(&path, b"external").unwrap();
        let error = verify_current_signature(&path, Some(&snapshot.signature)).unwrap_err();
        assert!(error.contains("其他程序修改"));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_nul_bytes() {
        let path = fixture("nul", b"alpha\0beta");
        assert!(read_text_snapshot(&path).is_err());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
