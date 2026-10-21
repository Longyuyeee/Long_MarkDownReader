use super::*;
use crate::formats::pdf_annotations::{PdfAnnotationKind, PdfAnnotationSource};
struct Fixture {
    base: std::path::PathBuf,
    root: String,
    pdf: String,
    companion: std::path::PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "longedit-pdf-reading-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let directory = base.join("library");
        fs::create_dir_all(&directory).unwrap();
        let pdf = directory.join("研究 资料.pdf");
        fs::write(
            &pdf,
            include_bytes!("../../../scripts/fixtures/v126-search/Paper.pdf"),
        )
        .unwrap();
        let companion = pdf.with_file_name("研究 资料.pdf.annotations.json");
        let document = PdfAnnotationDocument {
            schema_version: 1,
            source: PdfAnnotationSource {
                pdf_file: "研究 资料.pdf".into(),
                size: fs::metadata(&pdf).unwrap().len(),
                modified_at: 1,
                fingerprint: None,
            },
            annotations: (0..240)
                .map(|n| PdfAnnotation {
                    id: format!("a-{n}"),
                    kind: PdfAnnotationKind::Comment,
                    page: n % 2 + 1,
                    color: "yellow".into(),
                    rects: vec![],
                    quote: format!("第 {n} 条摘录"),
                    comment: format!("评论 {n}"),
                    created_at: 1,
                    updated_at: 2,
                })
                .collect(),
        };
        fs::write(&companion, serde_json::to_vec(&document).unwrap()).unwrap();
        Self {
            base,
            root: directory.to_string_lossy().into(),
            pdf: pdf.to_string_lossy().into(),
            companion,
        }
    }
    fn signature(&self) -> String {
        signature(&fs::metadata(&self.pdf).unwrap())
    }
    fn snapshot(&self) -> ReadingSnapshot {
        snapshot(
            &self.root,
            &self.pdf,
            &self.signature(),
            &["a-2".into(), "a-1".into()],
        )
        .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}
#[test]
fn reading_snapshot_has_selected_original_quotes_comments_pages_and_strong_relative_links() {
    let f = Fixture::new();
    let original = fs::read(&f.pdf).unwrap();
    let companion = fs::read(&f.companion).unwrap();
    let value = f.snapshot();
    assert_eq!(value.items.len(), 2);
    assert_eq!(value.items[0].annotation.id, "a-2");
    assert_eq!(value.items[1].annotation.page, 2);
    assert_eq!(value.items[0].annotation.comment, "评论 2");
    assert_eq!(
        value.source_digest,
        format!("{:x}", Sha256::digest(&original))
    );
    assert_eq!(value.relative_path, "研究 资料.pdf");
    assert!(value.items[0]
        .uri
        .contains("path=%E7%A0%94%E7%A9%B6%20%E8%B5%84%E6%96%99.pdf"));
    assert!(value.items[0].uri.ends_with(&value.source_digest));
    assert!(!value.items[0].uri.contains(&f.root));
    assert_eq!(fs::read(&f.pdf).unwrap(), original);
    assert_eq!(fs::read(&f.companion).unwrap(), companion);
}
#[test]
fn reading_snapshot_rejects_missing_duplicate_empty_over_limit_and_stale_source() {
    let f = Fixture::new();
    for ids in [
        vec![],
        vec!["missing".into()],
        vec!["a-1".into(), "a-1".into()],
        (0..201).map(|n| format!("a-{n}")).collect(),
    ] {
        assert!(snapshot(&f.root, &f.pdf, &f.signature(), &ids).is_err());
    }
    assert!(snapshot(&f.root, &f.pdf, "obsolete", &["a-1".into()])
        .unwrap_err()
        .contains("变化"));
    assert_eq!(
        snapshot(
            &f.root,
            &f.pdf,
            &f.signature(),
            &(0..200).map(|n| format!("a-{n}")).collect::<Vec<_>>()
        )
        .unwrap()
        .items
        .len(),
        200
    );
}
#[test]
fn reading_source_digest_detects_same_size_replacement_even_when_timestamp_restored() {
    let f = Fixture::new();
    let value = f.snapshot();
    let file = fs::OpenOptions::new().write(true).open(&f.pdf).unwrap();
    let modified = file.metadata().unwrap().modified().unwrap();
    let mut bytes = fs::read(&f.pdf).unwrap();
    let n = bytes.len() - 1;
    bytes[n] ^= 1;
    fs::write(&f.pdf, &bytes).unwrap();
    file.set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    assert_eq!(f.signature(), value.source_signature);
    assert!(verify(&f.root, &f.pdf, &value.source_digest, None)
        .unwrap_err()
        .contains("替换"));
}
#[test]
fn reading_source_survives_copy_and_relative_library_restore_but_not_wrong_file() {
    let f = Fixture::new();
    let value = f.snapshot();
    let copied = f.base.join("restored");
    fs::create_dir(&copied).unwrap();
    let pdf = copied.join("恢复 阅读.pdf");
    fs::copy(&f.pdf, &pdf).unwrap();
    assert!(verify(
        &copied.to_string_lossy(),
        &pdf.to_string_lossy(),
        &value.source_digest,
        None
    )
    .is_ok());
    assert!(verify(&f.root, &pdf.to_string_lossy(), &value.source_digest, None).is_err());
    assert!(verify(&f.root, &f.pdf, "malformed", None).is_err());
}
#[test]
fn reading_new_note_is_explicit_non_overwriting_and_keeps_pdf_and_other_drafts() {
    let f = Fixture::new();
    let value = f.snapshot();
    let target = Path::new(&f.root).join("阅读笔记.md");
    let source = fs::read(&f.pdf).unwrap();
    let content = "# 阅读笔记\n\n手动确认后的新文件\n";
    save_new(
        &f.root,
        &f.pdf,
        &value.source_digest,
        &target.to_string_lossy(),
        content,
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), content);
    assert!(save_new(
        &f.root,
        &f.pdf,
        &value.source_digest,
        &target.to_string_lossy(),
        "替换"
    )
    .unwrap_err()
    .contains("已存在"));
    assert_eq!(fs::read_to_string(&target).unwrap(), content);
    assert_eq!(fs::read(&f.pdf).unwrap(), source);
    assert!(save_new(
        &f.root,
        &f.pdf,
        &value.source_digest,
        &f.base.join("outside.md").to_string_lossy(),
        content
    )
    .is_err());
    assert!(save_new(
        &f.root,
        &f.pdf,
        &value.source_digest,
        &Path::new(&f.root).join("wrong.txt").to_string_lossy(),
        content
    )
    .is_err());
}
#[test]
fn reading_rejects_damaged_or_mismatched_sidecar_and_window_identity() {
    let f = Fixture::new();
    let original = fs::read(&f.companion).unwrap();
    fs::write(&f.companion, b"not-json").unwrap();
    assert!(snapshot(&f.root, &f.pdf, &f.signature(), &["a-1".into()]).is_err());
    let mut value: serde_json::Value = serde_json::from_slice(&original).unwrap();
    value["source"]["pdfFile"] = "another.pdf".into();
    fs::write(&f.companion, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(snapshot(&f.root, &f.pdf, &f.signature(), &["a-1".into()])
        .unwrap_err()
        .contains("不匹配"));
    assert!(main_only("main").is_ok());
    for label in ["quick-note", "external-pdf", "other"] {
        assert!(main_only(label).is_err());
    }
}

#[test]
fn reading_refresh_distinguishes_new_deleted_and_previously_unselected_annotations() {
    let f = Fixture::new();
    let original = f.snapshot();
    let pdf_bytes = fs::read(&f.pdf).unwrap();
    let mut document: PdfAnnotationDocument = serde_json::from_slice(&fs::read(&f.companion).unwrap()).unwrap();
    document.annotations.retain(|a| a.id != "a-1");
    document.annotations.iter_mut().find(|a| a.id == "a-2").unwrap().comment = "更新评论".into();
    let mut added = document.annotations[0].clone(); added.id = "new-annotation".into(); document.annotations.push(added);
    let bytes = serde_json::to_vec(&document).unwrap(); fs::write(&f.companion, &bytes).unwrap();
    let ids = vec!["a-2".into(), "a-1".into()];
    let kept = refresh_snapshot(&f.root, &f.pdf, &original.source_digest, &ids, &original.known_annotation_ids, false).unwrap();
    assert_eq!(kept.items.len(), 1); assert_eq!(kept.items[0].annotation.comment, "更新评论"); assert_eq!(kept.missing_ids, vec!["a-1"]);
    let expanded = refresh_snapshot(&f.root, &f.pdf, &original.source_digest, &ids, &original.known_annotation_ids, true).unwrap();
    assert_eq!(expanded.items.iter().map(|i| i.annotation.id.as_str()).collect::<Vec<_>>(), vec!["a-2", "new-annotation"]);
    assert_eq!(fs::read(&f.pdf).unwrap(), pdf_bytes); assert_eq!(fs::read(&f.companion).unwrap(), bytes);
}
#[test]
fn reading_refresh_handles_all_deleted_and_rejects_a_changed_pdf_without_writing() {
    let f = Fixture::new(); let original = f.snapshot();
    let mut document: PdfAnnotationDocument = serde_json::from_slice(&fs::read(&f.companion).unwrap()).unwrap();
    document.annotations.clear(); let bytes = serde_json::to_vec(&document).unwrap(); fs::write(&f.companion, &bytes).unwrap();
    let refreshed = refresh_snapshot(&f.root, &f.pdf, &original.source_digest, &["a-1".into()], &original.known_annotation_ids, false).unwrap();
    assert!(refreshed.items.is_empty()); assert_eq!(refreshed.missing_ids, vec!["a-1"]);
    fs::write(&f.pdf, b"replacement PDF bytes").unwrap();
    assert!(refresh_snapshot(&f.root, &f.pdf, &original.source_digest, &["a-1".into()], &original.known_annotation_ids, true).is_err());
    assert_eq!(fs::read(&f.companion).unwrap(), bytes);
}
