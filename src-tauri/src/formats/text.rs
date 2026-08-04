use encoding_rs::{Encoding, UTF_8};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::UNIX_EPOCH;

pub const DEFAULT_TEXT_RANGE_BYTES: u64 = 512 * 1024;
pub const MAX_TEXT_RANGE_BYTES: u64 = 1024 * 1024;
const TEXT_RANGE_DECODE_TAIL_BYTES: u64 = 4;
const TEXT_ENCODING_DETECTION_SAMPLE_BYTES: u64 = 64 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentError {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
    pub suggestion: Option<String>,
}

impl TextDocumentError {
    pub fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        recoverable: bool,
        suggestion: Option<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recoverable,
            suggestion,
        }
    }

    pub fn simple(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, message, false, None)
    }

    pub fn recoverable(
        code: impl Into<String>,
        message: impl Into<String>,
        suggestion: impl Into<String>,
    ) -> Self {
        Self::new(code, message, true, Some(suggestion.into()))
    }
}

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
    pub content_digest: String,
    pub size: u64,
    pub modified: u128,
    pub read_only_reason: Option<String>,
    pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentIdentity {
    pub signature: String,
    pub content_digest: String,
    pub size: u64,
    pub modified_nanos: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentRangeSnapshot {
    pub content: String,
    pub encoding: String,
    pub encoding_confidence: String,
    pub bom: String,
    pub line_ending: String,
    pub offset: u64,
    pub next_offset: u64,
    pub eof: bool,
    pub size: u64,
    pub modified: u128,
    pub read_only_reason: String,
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

pub fn read_text_snapshot(path: &Path) -> Result<TextDocumentSnapshot, TextDocumentError> {
    read_text_snapshot_with_options(path, None)
}

pub fn read_text_snapshot_with_options(
    path: &Path,
    options: Option<TextReadOptions>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let metadata = path.metadata().map_err(|error| {
        TextDocumentError::simple(
            "metadata-read-failed",
            format!("读取文本元数据失败: {error}"),
        )
    })?;
    let bytes = fs::read(path).map_err(|error| {
        TextDocumentError::simple("read-failed", format!("读取文本文件失败: {error}"))
    })?;
    if bytes.contains(&0) {
        return Err(TextDocumentError::simple(
            "nul-bytes",
            "文本文件包含 NUL 字节，已按二进制或损坏文本拒绝",
        ));
    }
    let bom = detect_bom(&bytes);
    let selected_encoding = options
        .and_then(|options| options.encoding)
        .filter(|encoding| !encoding.trim().is_empty());
    let encoding = if let Some(label) = selected_encoding.as_deref() {
        Encoding::for_label(label.as_bytes()).ok_or_else(|| {
            TextDocumentError::recoverable(
                "unsupported-read-encoding",
                format!("不支持读取编码 {label}"),
                "请选择 UTF-8、GBK、GB18030 等受支持编码",
            )
        })?
    } else {
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(strip_known_bom(&bytes), true);
        detector.guess(None, true)
    };
    let (text, _, had_errors) = encoding.decode(&bytes);
    if had_errors {
        return Err(TextDocumentError::recoverable(
            "decode-failed",
            format!(
                "无法可靠按 {} 解码该文本，请先选择编码或使用外部工具修复",
                encoding.name()
            ),
            "尝试在文本编码菜单中按其他编码重新读取",
        ));
    }
    let content = text.into_owned();
    let line_ending = detect_line_ending(&content);
    let identity = text_document_identity(&metadata, &bytes);
    Ok(TextDocumentSnapshot {
        encoding: encoding.name().to_string(),
        encoding_confidence: encoding_confidence(&bytes, encoding, selected_encoding.is_some()),
        bom: bom.into(),
        line_ending: line_ending.into(),
        has_final_newline: has_final_newline(&content),
        signature: identity.signature,
        content_digest: identity.content_digest,
        size: metadata.len(),
        modified: modified_nanos(&metadata),
        read_only_reason: metadata.permissions().readonly().then(|| "readonly".into()),
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

pub fn read_text_identity(path: &Path) -> Result<TextDocumentIdentity, TextDocumentError> {
    let metadata = path.metadata().map_err(|error| {
        TextDocumentError::simple(
            "metadata-read-failed",
            format!("读取文本元数据失败: {error}"),
        )
    })?;
    let bytes = fs::read(path).map_err(|error| {
        TextDocumentError::simple("read-failed", format!("读取文本文件失败: {error}"))
    })?;
    Ok(text_document_identity(&metadata, &bytes))
}

pub fn read_text_range_with_options(
    path: &Path,
    offset: u64,
    length: u64,
    options: Option<TextReadOptions>,
) -> Result<TextDocumentRangeSnapshot, TextDocumentError> {
    if length == 0 || length > MAX_TEXT_RANGE_BYTES {
        return Err(TextDocumentError::recoverable(
            "range-length-invalid",
            format!("文本范围长度必须在 1 到 {MAX_TEXT_RANGE_BYTES} 字节之间"),
            "缩小单次读取范围后重试",
        ));
    }
    let metadata = path.metadata().map_err(|error| {
        TextDocumentError::simple(
            "metadata-read-failed",
            format!("读取文本元数据失败: {error}"),
        )
    })?;
    if offset > metadata.len() {
        return Err(TextDocumentError::recoverable(
            "range-offset-invalid",
            format!("文本范围起点 {offset} 已超过文件大小 {}", metadata.len()),
            "从上一次返回的 nextOffset 继续读取",
        ));
    }

    let selected_encoding = options
        .and_then(|options| options.encoding)
        .filter(|encoding| !encoding.trim().is_empty());
    if offset > 0 && selected_encoding.is_none() {
        return Err(TextDocumentError::recoverable(
            "range-encoding-required",
            "继续读取文本范围时必须沿用首段确定的编码",
            "将首段返回的 encoding 作为 readOptions.encoding 传入",
        ));
    }

    let mut file = fs::File::open(path).map_err(|error| {
        TextDocumentError::simple("read-failed", format!("打开文本文件失败: {error}"))
    })?;
    file.seek(SeekFrom::Start(offset)).map_err(|error| {
        TextDocumentError::simple("range-seek-failed", format!("定位文本范围失败: {error}"))
    })?;
    let available = metadata.len().saturating_sub(offset);
    let decode_length = length.saturating_add(TEXT_RANGE_DECODE_TAIL_BYTES);
    let read_length = if offset == 0 && selected_encoding.is_none() {
        available.min(decode_length.max(TEXT_ENCODING_DETECTION_SAMPLE_BYTES))
    } else {
        available.min(decode_length)
    };
    let mut bytes = Vec::with_capacity(read_length as usize);
    file.take(read_length)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            TextDocumentError::simple("range-read-failed", format!("读取文本范围失败: {error}"))
        })?;
    if bytes.contains(&0) {
        return Err(TextDocumentError::simple(
            "nul-bytes",
            "文本范围包含 NUL 字节，已按二进制或损坏文本拒绝",
        ));
    }

    let encoding = if let Some(label) = selected_encoding.as_deref() {
        Encoding::for_label(label.as_bytes()).ok_or_else(|| {
            TextDocumentError::recoverable(
                "unsupported-read-encoding",
                format!("不支持读取编码 {label}"),
                "请选择 UTF-8、GBK、GB18030 等受支持编码",
            )
        })?
    } else {
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(strip_known_bom(&bytes), true);
        detector.guess(None, true)
    };

    let preferred_length = bytes.len().min(length as usize);
    let minimum_length = preferred_length.saturating_sub(TEXT_RANGE_DECODE_TAIL_BYTES as usize);
    let decoded = (minimum_length..=preferred_length)
        .rev()
        .filter(|candidate_length| *candidate_length > 0 || bytes.is_empty())
        .chain((preferred_length + 1)..=bytes.len())
        .find_map(|candidate_length| {
            let (text, _, had_errors) = encoding.decode(&bytes[..candidate_length]);
            (!had_errors).then(|| (text.into_owned(), candidate_length))
        })
        .ok_or_else(|| {
            TextDocumentError::recoverable(
                "decode-failed",
                format!("无法可靠按 {} 解码文本范围", encoding.name()),
                "尝试选择其他编码重新读取首段",
            )
        })?;
    let (content, consumed_bytes) = decoded;
    let next_offset = offset + consumed_bytes as u64;

    Ok(TextDocumentRangeSnapshot {
        encoding: encoding.name().to_string(),
        encoding_confidence: encoding_confidence(
            &bytes[..consumed_bytes],
            encoding,
            selected_encoding.is_some(),
        ),
        bom: if offset == 0 {
            detect_bom(&bytes).into()
        } else {
            "none".into()
        },
        line_ending: detect_line_ending(&content).into(),
        offset,
        next_offset,
        eof: next_offset >= metadata.len(),
        size: metadata.len(),
        modified: modified_nanos(&metadata),
        read_only_reason: "large-file-range".into(),
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

pub fn encode_text_for_save(
    current: &TextDocumentSnapshot,
    content: &str,
    policy: TextSavePolicy,
) -> Result<TextEncodedDocument, TextDocumentError> {
    let encoding_name = policy.encoding.as_deref().unwrap_or(&current.encoding);
    let encoding = Encoding::for_label(encoding_name.as_bytes()).ok_or_else(|| {
        TextDocumentError::recoverable(
            "unsupported-write-encoding",
            format!("不支持写回编码 {encoding_name}"),
            "请选择 UTF-8、GBK、GB18030 等受支持编码",
        )
    })?;
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
        return Err(TextDocumentError::recoverable(
            "encode-failed",
            format!(
                "当前内容包含无法写回 {} 编码的字符；请转换为 UTF-8 或删除这些字符",
                encoding.name()
            ),
            "转换保存为 UTF-8，或移除当前目标编码无法表示的字符",
        ));
    }
    let mut bytes = Vec::with_capacity(encoded.len() + 3);
    match bom {
        "utf-8" if encoding == UTF_8 => bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]),
        "none" => {}
        "utf-8" => {
            return Err(TextDocumentError::recoverable(
                "invalid-bom-policy",
                "UTF-8 BOM 只能用于 UTF-8 编码文本",
                "为非 UTF-8 编码选择无 BOM 保存",
            ))
        }
        other => {
            return Err(TextDocumentError::recoverable(
                "unsupported-bom-policy",
                format!("暂不支持写回 {other} BOM"),
                "请选择无 BOM 或 UTF-8 BOM",
            ))
        }
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
) -> Result<(), TextDocumentError> {
    let Some(expected_signature) = expected_signature else {
        return Ok(());
    };
    let metadata = path.metadata().map_err(|error| {
        TextDocumentError::simple(
            "metadata-read-failed",
            format!("读取保存前文本元数据失败: {error}"),
        )
    })?;
    let bytes = fs::read(path).map_err(|error| {
        TextDocumentError::simple(
            "read-before-save-failed",
            format!("读取保存前文本失败: {error}"),
        )
    })?;
    let current = file_signature(&metadata, &bytes);
    if current == expected_signature {
        Ok(())
    } else {
        Err(TextDocumentError::recoverable(
            "external-modified",
            "文本文件已被其他程序修改，请重新加载后再保存",
            "先重新加载磁盘内容，再决定是否重新应用当前修改",
        ))
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
) -> Result<String, TextDocumentError> {
    let replacement = match line_ending {
        "lf" => "\n",
        "crlf" => "\r\n",
        "cr" => "\r",
        other => {
            return Err(TextDocumentError::recoverable(
                "unsupported-line-ending",
                format!("不支持的换行符策略 {other}"),
                "请选择 LF、CRLF 或 CR",
            ))
        }
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

fn text_document_identity(metadata: &fs::Metadata, bytes: &[u8]) -> TextDocumentIdentity {
    TextDocumentIdentity {
        signature: file_signature(metadata, bytes),
        content_digest: format!("{:x}", md5::compute(bytes)),
        size: metadata.len(),
        modified_nanos: modified_nanos(metadata).to_string(),
    }
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
    fn identity_changes_when_same_size_content_changes() {
        let path = fixture("identity", b"alpha");
        let first = read_text_identity(&path).unwrap();
        fs::write(&path, b"bravo").unwrap();
        let second = read_text_identity(&path).unwrap();
        assert_eq!(first.size, second.size);
        assert_ne!(first.content_digest, second.content_digest);
        assert_ne!(first.signature, second.signature);
        assert_eq!(first.content_digest.len(), 32);
        assert!(!second.modified_nanos.is_empty());
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
    fn reads_and_preserves_gb18030_when_user_selected() {
        let gb18030 = Encoding::for_label(b"gb18030").unwrap();
        let (bytes, _, had_errors) = gb18030.encode("中文𠀀\r\n末行");
        assert!(!had_errors);
        let path = fixture("gb18030", &bytes);
        let snapshot = read_text_snapshot_with_options(
            &path,
            Some(TextReadOptions {
                encoding: Some("gb18030".into()),
            }),
        )
        .unwrap();
        assert_eq!(snapshot.content, "中文𠀀\r\n末行");
        assert_eq!(snapshot.encoding, "gb18030");
        assert_eq!(snapshot.encoding_confidence, "user-selected");
        let encoded = encode_text_for_save(
            &snapshot,
            "中文𠀀\n末行二",
            TextSavePolicy {
                expected_signature: Some(snapshot.signature.clone()),
                encoding: Some("gb18030".into()),
                bom: Some("none".into()),
                line_ending: None,
                has_final_newline: None,
            },
        )
        .unwrap();
        write_bytes(&path, &encoded.bytes).unwrap();
        let reread = read_text_snapshot_with_options(
            &path,
            Some(TextReadOptions {
                encoding: Some("gb18030".into()),
            }),
        )
        .unwrap();
        assert_eq!(reread.content, "中文𠀀\r\n末行二");
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
        assert_eq!(error.code, "external-modified");
        assert!(error.message.contains("其他程序修改"));
        assert!(error.recoverable);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_nul_bytes() {
        let path = fixture("nul", b"alpha\0beta");
        let error = read_text_snapshot(&path).unwrap_err();
        assert_eq!(error.code, "nul-bytes");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn returns_structured_error_for_unsupported_encoding() {
        let path = fixture("unsupported-encoding", b"alpha");
        let error = read_text_snapshot_with_options(
            &path,
            Some(TextReadOptions {
                encoding: Some("x-longedit-unknown".into()),
            }),
        )
        .unwrap_err();
        assert_eq!(error.code, "unsupported-read-encoding");
        assert!(error.recoverable);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn reads_multibyte_text_in_contiguous_ranges() {
        let content = "中文 alpha beta\nsecond line\n";
        let path = fixture("range", content.as_bytes());
        let first = read_text_range_with_options(&path, 0, 1, None).unwrap();
        assert!(first.next_offset > 0);
        assert!(!first.eof);
        let second = read_text_range_with_options(
            &path,
            first.next_offset,
            MAX_TEXT_RANGE_BYTES,
            Some(TextReadOptions {
                encoding: Some(first.encoding.clone()),
            }),
        )
        .unwrap();
        assert_eq!(format!("{}{}", first.content, second.content), content);
        assert!(second.eof);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_unbounded_text_range_requests() {
        let path = fixture("range-limit", b"alpha");
        let error =
            read_text_range_with_options(&path, 0, MAX_TEXT_RANGE_BYTES + 1, None).unwrap_err();
        assert_eq!(error.code, "range-length-invalid");
        assert!(error.recoverable);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
