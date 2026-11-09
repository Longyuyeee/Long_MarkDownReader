//! Bounded metadata IPC. Large envelopes never enter the Java plugin bridge.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::de::{self, IgnoredAny, MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fmt, fs::{self, File}, io::{Read, Write}, path::PathBuf, time::{Duration, Instant}};

pub const CHUNK: usize = 16 * 1024;
const DIRECT: usize = 64 * 1024;
const SESSIONS: usize = 4;
const IDLE: Duration = Duration::from_secs(120);
const READ_ERROR: &str = "READ_FAILED: 本机记录无法核对，原数据仍保留，请重试。";
const WRITE_ERROR: &str = "WRITE_FAILED: 本机记录暂未保存，当前输入仍保留，请重试。";
const TRANSFER_ERROR: &str = "READ_FAILED: 传输无法核对，请重新读取；当前输入仍保留。";

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind { Source, Text, Pdf, Recovery, Bookmarks }
impl Kind {
    fn parse(s: &str) -> Result<Self, String> {
        match s { "source" => Ok(Self::Source), "text" => Ok(Self::Text), "pdf" => Ok(Self::Pdf), "recovery" => Ok(Self::Recovery), "bookmarks" => Ok(Self::Bookmarks), _ => Err(TRANSFER_ERROR.into()) }
    }
    fn file(self) -> &'static str { match self { Self::Source => "source-reading-v1.json", Self::Text => "text-reading-v1.json", Self::Pdf => "pdf-reading-v1.json", Self::Recovery => "pdf-annotation-recovery-v1.json", Self::Bookmarks => "pdf-bookmarks-v1.json" } }
    fn limit(self) -> usize { if self == Self::Bookmarks { 512 * 1024 } else { 5 * 1024 * 1024 } }
    fn budget(self) -> String { if self == Self::Bookmarks { "WRITE_FAILED: 本机书签空间已达512 KiB上限，原记录仍保留。".into() } else { "WRITE_FAILED: 本机记录超过5 MiB，原记录仍保留。".into() } }
}

// Walk only the envelope. IgnoredAny consumes foreign values without building a
// tree of every document, annotation or large future field.
struct ObjectOnly;
impl<'de> Deserialize<'de> for ObjectOnly {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct ObjectVisitor;
        impl<'de> Visitor<'de> for ObjectVisitor {
            type Value = ObjectOnly;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result { f.write_str("an object") }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<ObjectOnly, M::Error> {
                while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}
                Ok(ObjectOnly)
            }
        }
        d.deserialize_map(ObjectVisitor)
    }
}
fn validate(kind: Kind, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > kind.limit() { return Err(kind.budget()); }
    std::str::from_utf8(bytes).map_err(|_| READ_ERROR)?;
    struct Envelope(Kind);
    impl<'de> Visitor<'de> for Envelope {
        type Value = ();
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result { f.write_str("metadata version 1") }
        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<(), M::Error> {
            let (mut version, mut records, mut drafts, mut deletions) = (false, false, false, false);
            while let Some(key) = map.next_key::<String>()? {
                match key.as_str() {
                    "version" => { if version || map.next_value::<u64>()? != 1 { return Err(de::Error::custom("version")); } version = true; }
                    "records" if self.0 != Kind::Recovery => { if records { return Err(de::Error::custom("duplicate records")); } map.next_value::<ObjectOnly>()?; records = true; }
                    "drafts" if self.0 == Kind::Recovery => { if drafts { return Err(de::Error::custom("duplicate drafts")); } map.next_value::<ObjectOnly>()?; drafts = true; }
                    "deletions" if self.0 == Kind::Recovery => { if deletions { return Err(de::Error::custom("duplicate deletions")); } map.next_value::<ObjectOnly>()?; deletions = true; }
                    _ => { map.next_value::<IgnoredAny>()?; }
                }
            }
            if !version || if self.0 == Kind::Recovery { !drafts || !deletions } else { !records } { return Err(de::Error::custom("envelope")); }
            Ok(())
        }
    }
    let mut d = serde_json::Deserializer::from_slice(bytes);
    (&mut d).deserialize_map(Envelope(kind)).map_err(|_| READ_ERROR)?;
    d.end().map_err(|_| READ_ERROR.into())
}
fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn revision(bytes: &Option<Vec<u8>>) -> String { bytes.as_ref().map(|b| digest(b)).unwrap_or_else(|| "missing".into()) }
fn string<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> { v.get(key).and_then(Value::as_str).ok_or_else(|| TRANSFER_ERROR.into()) }
fn number(v: &Value, key: &str) -> Result<usize, String> { v.get(key).and_then(Value::as_u64).and_then(|n| usize::try_from(n).ok()).ok_or_else(|| TRANSFER_ERROR.into()) }
fn valid_revision(s: &str) -> bool { s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) }
struct Session { kind: Kind, data: Vec<u8>, total: usize, cursor: usize, expected: Option<String>, hash: String, touched: Instant }
pub struct MetadataStore { root: PathBuf, sessions: HashMap<String, Session>, sequence: u64 }
impl MetadataStore {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        let root = root.canonicalize().map_err(|_| READ_ERROR)?;
        if !root.is_dir() { return Err(READ_ERROR.into()); }
        Ok(Self { root, sessions: HashMap::new(), sequence: 0 })
    }
    pub fn handles(op: &str) -> bool { op.starts_with("metadata") || Self::legacy_kind(op).is_some() }
    fn legacy_kind(op: &str) -> Option<Kind> {
        match op {
            "readSourceReading" | "writeSourceReading" => Some(Kind::Source),
            "readTextReading" | "writeTextReading" => Some(Kind::Text),
            "readPdfReading" | "writePdfReading" => Some(Kind::Pdf),
            "readPdfAnnotationRecovery" | "writePdfAnnotationRecovery" => Some(Kind::Recovery),
            "readPdfBookmarks" | "writePdfBookmarks" => Some(Kind::Bookmarks),
            _ => None
        }
    }
    fn file_size(&self, path: &PathBuf, kind: Kind) -> Result<Option<u64>, String> {
        match fs::symlink_metadata(path) {
            Ok(m) if m.file_type().is_file() && m.len() <= kind.limit() as u64 => Ok(Some(m.len())),
            Ok(_) => Err(READ_ERROR.into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(READ_ERROR.into())
        }
    }
    fn sync_directory(&self) -> std::io::Result<()> {
        #[cfg(unix)] { File::open(&self.root)?.sync_all()?; }
        Ok(())
    }
    fn snapshot(&self, kind: Kind) -> Result<Option<Vec<u8>>, String> {
        let file = self.root.join(kind.file());
        let backup = self.root.join(format!("{}.bak", kind.file()));
        let base_size = self.file_size(&file, kind)?;
        let backup_size = self.file_size(&backup, kind)?;
        let chosen = if backup_size.is_some() { &backup } else if base_size.is_some() { &file } else { return Ok(None); };
        let mut bytes = Vec::new();
        File::open(chosen).map_err(|_| READ_ERROR)?.take(kind.limit() as u64 + 1).read_to_end(&mut bytes).map_err(|_| READ_ERROR)?;
        validate(kind, &bytes)?;
        // Android AtomicFile's legacy backup is authoritative after a crash.
        // Do not remove either file until the backup has been fully validated.
        if chosen == &backup {
            fs::rename(&backup, &file).map_err(|_| READ_ERROR)?;
            self.sync_directory().map_err(|_| READ_ERROR)?;
        }
        Ok(Some(bytes))
    }
    fn commit(&self, kind: Kind, next: &[u8], expected: &str) -> Result<String, String> {
        validate(kind, next)?;
        let current = self.snapshot(kind)?;
        if revision(&current) != expected { return Err("CONFLICT: 本机记录已在别处变化，当前输入仍保留，请重新读取后重试。".into()); }
        if current.as_deref() != Some(next) {
            let mut temp = tempfile::Builder::new().prefix(".longedit-metadata-").tempfile_in(&self.root).map_err(|_| WRITE_ERROR)?;
            temp.write_all(next).map_err(|_| WRITE_ERROR)?;
            temp.as_file().sync_all().map_err(|_| WRITE_ERROR)?;
            temp.persist(self.root.join(kind.file())).map_err(|_| WRITE_ERROR)?;
            self.sync_directory().map_err(|_| "WRITE_UNCONFIRMED: 保存尚未核对，当前输入仍保留，请重试。")?;
        }
        if self.snapshot(kind)?.as_deref() != Some(next) { return Err("WRITE_UNCONFIRMED: 保存尚未核对，当前输入仍保留，请重试。".into()); }
        Ok(digest(next))
    }
    fn insert(&mut self, session: Session) -> Result<String, String> {
        if self.sessions.len() >= SESSIONS { return Err("BUSY: 本机记录正在处理，请稍后重试。".into()); }
        self.sequence = self.sequence.checked_add(1).ok_or(TRANSFER_ERROR)?;
        let id = format!("m{}", self.sequence);
        self.sessions.insert(id.clone(), session); Ok(id)
    }
    pub fn execute(&mut self, v: Value) -> Result<Value, String> {
        self.sessions.retain(|_, s| s.touched.elapsed() < IDLE);
        let op = string(&v, "op")?;
        if let Some(kind) = Self::legacy_kind(op) {
            // Compatibility for small callers; large messages must use chunks.
            if op.starts_with("read") {
                let content = self.snapshot(kind)?;
                if content.as_ref().is_some_and(|b| b.len() > DIRECT) { return Err("READ_FAILED: 记录较大，请通过分块通道重新读取；原数据仍保留。".into()); }
                return Ok(json!({"revision":revision(&content),"content":content.map(|b| String::from_utf8(b).expect("validated UTF-8"))}));
            }
            let content = string(&v, "content")?;
            if content.len() > kind.limit() { return Err(kind.budget()); }
            if content.len() > DIRECT { return Err("WRITE_FAILED: 记录较大，请通过分块通道重试；当前输入仍保留。".into()); }
            let hash = self.commit(kind, content.as_bytes(), string(&v, "expectedRevision")?)?;
            return Ok(json!({"content":content,"revision":hash}));
        }
        match op {
            "metadataBeginRead" => {
                let kind = Kind::parse(string(&v, "kind")?)?;
                let Some(data) = self.snapshot(kind)? else { return Ok(json!({"transferId":null,"size":0,"revision":"missing"})); };
                let size = data.len(); let hash = digest(&data);
                let id = self.insert(Session { kind, data, total:size, cursor:0, expected:None, hash:hash.clone(), touched:Instant::now() })?;
                Ok(json!({"transferId":id,"size":size,"revision":hash}))
            }
            "metadataBeginWrite" => {
                let kind = Kind::parse(string(&v, "kind")?)?; let total = number(&v, "size")?;
                if total > kind.limit() { return Err(kind.budget()); }
                let expected = string(&v, "expectedRevision")?; let hash = string(&v, "revision")?;
                if total == 0 || !(expected == "missing" || valid_revision(expected)) || !valid_revision(hash) { return Err(TRANSFER_ERROR.into()); }
                if self.sessions.len() >= SESSIONS { return Err("BUSY: 本机记录正在处理，请稍后重试。".into()); }
                let mut data = Vec::new(); data.try_reserve_exact(total).map_err(|_| WRITE_ERROR)?;
                let id = self.insert(Session { kind, data, total, cursor:0, expected:Some(expected.into()), hash:hash.into(), touched:Instant::now() })?;
                Ok(json!({"transferId":id}))
            }
            "metadataReadChunk" | "metadataWriteChunk" => {
                let id = string(&v, "transferId")?; let offset = number(&v, "offset")?;
                let s = self.sessions.get_mut(id).ok_or(TRANSFER_ERROR)?;
                if offset != s.cursor || offset >= s.total { return Err(TRANSFER_ERROR.into()); }
                s.touched = Instant::now();
                if op == "metadataReadChunk" {
                    if s.expected.is_some() { return Err(TRANSFER_ERROR.into()); }
                    let end = (offset + CHUNK).min(s.total);
                    let data = STANDARD.encode(&s.data[offset..end]); s.cursor = end;
                    Ok(json!({"offset":offset,"next":end,"base64":data}))
                } else {
                    if s.expected.is_none() { return Err(TRANSFER_ERROR.into()); }
                    let encoded = string(&v, "base64")?;
                    if encoded.len() > CHUNK.div_ceil(3) * 4 { return Err(TRANSFER_ERROR.into()); }
                    let bytes = STANDARD.decode(encoded).map_err(|_| TRANSFER_ERROR)?;
                    if bytes.is_empty() || bytes.len() > CHUNK || bytes.len() > s.total - offset || STANDARD.encode(&bytes) != encoded { return Err(TRANSFER_ERROR.into()); }
                    s.data.extend_from_slice(&bytes); s.cursor += bytes.len();
                    Ok(json!({"next":s.cursor}))
                }
            }
            "metadataCommit" => {
                let id = string(&v, "transferId")?;
                let s = self.sessions.remove(id).ok_or(TRANSFER_ERROR)?;
                let expected = s.expected.ok_or(TRANSFER_ERROR)?;
                if s.cursor != s.total || digest(&s.data) != s.hash { return Err(TRANSFER_ERROR.into()); }
                let hash = self.commit(s.kind, &s.data, &expected)?;
                Ok(json!({"revision":hash,"size":s.total}))
            }
            "metadataEnd" => {
                self.sessions.remove(string(&v, "transferId")?);
                Ok(json!({"closed":true}))
            }
            _ => Err(TRANSFER_ERROR.into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> (tempfile::TempDir, MetadataStore) { let dir = tempfile::tempdir().unwrap(); let store = MetadataStore::new(dir.path().into()).unwrap(); (dir, store) }
    fn begin(s: &mut MetadataStore, data: &[u8], expected: &str) -> String {
        s.execute(json!({"op":"metadataBeginWrite","kind":"source","size":data.len(),"revision":digest(data),"expectedRevision":expected})).unwrap()["transferId"].as_str().unwrap().into()
    }
    fn push(s: &mut MetadataStore, id: &str, data: &[u8]) {
        for (n, bytes) in data.chunks(CHUNK).enumerate() { assert_eq!(s.execute(json!({"op":"metadataWriteChunk","transferId":id,"offset":n*CHUNK,"base64":STANDARD.encode(bytes)})).unwrap()["next"], n*CHUNK+bytes.len()); }
    }
    fn finish(s: &mut MetadataStore, id: &str) -> Result<Value, String> { s.execute(json!({"op":"metadataCommit","transferId":id})) }
    const EMPTY: &[u8] = br#"{"version":1,"records":{}}"#;
    #[test]
    fn near_limit_unicode_and_foreign_values_roundtrip() {
        let (dir, mut s) = store();
        let mut bytes = format!(r#"{{"version":1,"records":{{"foreign":{{"keep":"{}"}}}}}}"#, "文😀".repeat(700000)).into_bytes();
        bytes.resize(Kind::Source.limit(), b' ');
        let id = begin(&mut s, &bytes, "missing"); push(&mut s, &id, &bytes);
        assert!(!dir.path().join(Kind::Source.file()).exists());
        assert_eq!(finish(&mut s, &id).unwrap()["revision"], digest(&bytes));
        let start = s.execute(json!({"op":"metadataBeginRead","kind":"source"})).unwrap();
        let mut read = Vec::new();
        while read.len() < bytes.len() { let value = s.execute(json!({"op":"metadataReadChunk","transferId":start["transferId"],"offset":read.len()})).unwrap(); read.extend(STANDARD.decode(value["base64"].as_str().unwrap()).unwrap()); }
        assert_eq!(read, bytes); assert_eq!(fs::read(dir.path().join(Kind::Source.file())).unwrap(), bytes);
        s.execute(json!({"op":"metadataEnd","transferId":start["transferId"]})).unwrap(); assert!(s.sessions.is_empty());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn version_shape_utf8_trailing_and_duplicate_fail_without_overwrite() {
        let (dir, mut s) = store(); fs::write(dir.path().join(Kind::Source.file()), EMPTY).unwrap();
        for data in [b"".as_slice(), b"{}", b"[]", b"{", b"\xff", br#"{"version":2,"records":{}}"#, br#"{"version":1,"records":[]}"#, br#"{"version":1,"version":1,"records":{}}"#, br#"{"version":1,"records":{}}x"#] {
            if !data.is_empty() { let id = begin(&mut s, data, &digest(EMPTY)); push(&mut s, &id, data); assert!(finish(&mut s, &id).is_err()); }
            assert_eq!(fs::read(dir.path().join(Kind::Source.file())).unwrap(), EMPTY);
        }
    }
    #[test]
    fn unknown_large_key_and_many_foreign_entries_do_not_build_a_value_tree() {
        let key = "k".repeat(4 * 1024 * 1024);
        let bytes = format!(r#"{{"version":1,"records":{{}},"{}":true}}"#, key).into_bytes();
        validate(Kind::Source, &bytes).unwrap();
        let bytes = format!(r#"{{"version":1,"records":{{"foreign":[{}0]}}}}"#, "0,".repeat(1000000)).into_bytes();
        validate(Kind::Source, &bytes).unwrap();
    }
    #[test]
    fn incomplete_digest_and_duplicate_chunks_never_create_a_file() {
        let (dir, mut s) = store();
        let id = begin(&mut s, EMPTY, "missing");
        assert!(s.execute(json!({"op":"metadataWriteChunk","transferId":id,"offset":1,"base64":STANDARD.encode(EMPTY)})).is_err());
        assert!(finish(&mut s, &id).is_err()); assert!(!dir.path().join(Kind::Source.file()).exists());
        let id = begin(&mut s, EMPTY, "missing"); push(&mut s, &id, EMPTY);
        assert!(s.execute(json!({"op":"metadataWriteChunk","transferId":id,"offset":0,"base64":STANDARD.encode(EMPTY)})).is_err());
        s.sessions.get_mut(&id).unwrap().hash = "a".repeat(64);
        assert!(finish(&mut s, &id).is_err()); assert!(!dir.path().join(Kind::Source.file()).exists());
    }
    #[test]
    fn invalid_base64_chunk_size_and_direction_are_rejected() {
        let (_, mut s) = store(); let id = begin(&mut s, EMPTY, "missing");
        for value in ["Y Q==".to_string(), "YR==".into(), "".into(), STANDARD.encode(vec![0; CHUNK+1])] { assert!(s.execute(json!({"op":"metadataWriteChunk","transferId":id,"offset":0,"base64":value})).is_err()); }
        assert!(s.execute(json!({"op":"metadataReadChunk","transferId":id,"offset":0})).is_err());
        assert!(s.execute(json!({"op":"metadataWriteChunk","transferId":id,"offset":0.5,"base64":"YQ=="})).is_err());
    }
    #[test]
    fn concurrent_cas_rechecks_at_commit_and_preserves_winner() {
        let (dir, mut s) = store(); let a = begin(&mut s, EMPTY, "missing");
        let next = br#"{"version":1,"records":{"foreign":{"keep":true}}}"#; let b = begin(&mut s, next, "missing");
        push(&mut s, &a, EMPTY); push(&mut s, &b, next); finish(&mut s, &a).unwrap();
        assert!(finish(&mut s, &b).unwrap_err().starts_with("CONFLICT:"));
        assert_eq!(fs::read(dir.path().join(Kind::Source.file())).unwrap(), EMPTY);
    }
    #[test]
    fn quota_idle_abort_and_stale_ids_are_bounded() {
        let (_, mut s) = store(); let ids: Vec<_> = (0..SESSIONS).map(|_| begin(&mut s, EMPTY, "missing")).collect();
        assert!(s.execute(json!({"op":"metadataBeginWrite","kind":"source","size":EMPTY.len(),"revision":digest(EMPTY),"expectedRevision":"missing"})).unwrap_err().starts_with("BUSY:"));
        for session in s.sessions.values_mut() { session.touched = Instant::now() - IDLE; }
        let fresh = begin(&mut s, EMPTY, "missing"); assert_eq!(s.sessions.len(), 1);
        assert_ne!(fresh, ids[0]); assert!(finish(&mut s, &ids[0]).is_err());
        for _ in 0..2 { s.execute(json!({"op":"metadataEnd","transferId":fresh})).unwrap(); } assert!(s.sessions.is_empty());
    }
    #[test]
    fn missing_corrupt_and_limits_are_distinct() {
        let (dir, mut s) = store(); assert_eq!(s.execute(json!({"op":"metadataBeginRead","kind":"source"})).unwrap()["revision"], "missing");
        fs::write(dir.path().join(Kind::Source.file()), b"").unwrap(); assert!(s.execute(json!({"op":"metadataBeginRead","kind":"source"})).is_err());
        for kind in ["source","bookmarks"] { assert!(s.execute(json!({"op":"metadataBeginWrite","kind":kind,"size":5*1024*1024+1,"revision":digest(EMPTY),"expectedRevision":"missing"})).is_err()); }
        assert!(s.execute(json!({"op":"metadataBeginRead","kind":"../../source"})).is_err());
    }
    #[test]
    fn legacy_backup_validated_before_recovery_and_oversize_blocks_both() {
        let (dir, mut s) = store(); let file = dir.path().join(Kind::Source.file()); let bak = dir.path().join(format!("{}.bak", Kind::Source.file()));
        fs::write(&file, b"partial").unwrap(); fs::write(&bak, b"bad backup").unwrap();
        assert!(s.execute(json!({"op":"metadataBeginRead","kind":"source"})).is_err()); assert_eq!(fs::read(&file).unwrap(), b"partial"); assert_eq!(fs::read(&bak).unwrap(), b"bad backup");
        fs::write(&bak, EMPTY).unwrap(); s.execute(json!({"op":"metadataBeginRead","kind":"source"})).unwrap();
        assert!(!bak.exists()); assert_eq!(fs::read(&file).unwrap(), EMPTY);
        fs::write(&bak, vec![b' '; Kind::Source.limit()+1]).unwrap(); assert!(s.execute(json!({"op":"metadataBeginRead","kind":"source"})).is_err()); assert_eq!(fs::read(&file).unwrap(), EMPTY);
    }
    #[test]
    fn stable_read_snapshot_and_old_large_message_guard() {
        let (dir, mut s) = store(); let file = dir.path().join(Kind::Source.file()); fs::write(&file, EMPTY).unwrap();
        let start = s.execute(json!({"op":"metadataBeginRead","kind":"source"})).unwrap(); fs::write(&file, b"changed").unwrap();
        let chunk = s.execute(json!({"op":"metadataReadChunk","transferId":start["transferId"],"offset":0})).unwrap(); assert_eq!(STANDARD.decode(chunk["base64"].as_str().unwrap()).unwrap(), EMPTY);
        assert!(s.execute(json!({"op":"writeSourceReading","content":"x".repeat(5*1024*1024+1),"expectedRevision":"missing"})).unwrap_err().contains("5 MiB"));
        assert!(s.execute(json!({"op":"writeSourceReading","content":"x".repeat(DIRECT+1),"expectedRevision":"missing"})).unwrap_err().contains("分块"));
        assert_eq!(fs::read(file).unwrap(), b"changed");
    }
    #[test]
    fn all_metadata_kinds_keep_their_existing_envelopes_and_budgets() {
        for kind in [Kind::Source, Kind::Text, Kind::Pdf, Kind::Bookmarks] { validate(kind, EMPTY).unwrap(); }
        validate(Kind::Recovery, br#"{"version":1,"drafts":{},"deletions":{},"extra":"keep"}"#).unwrap();
        assert!(validate(Kind::Recovery, EMPTY).is_err());
        assert!(validate(Kind::Bookmarks, &vec![b' '; 512*1024+1]).is_err());
    }
}
