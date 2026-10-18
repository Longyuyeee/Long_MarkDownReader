use super::*;
use std::io::{Cursor, Read};

const PRODUCERS: [(&str, &[u8]); 3] = [
    ("microsoft-powerpoint-16", include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx")),
    ("wps-presentation", include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx")),
    ("libreoffice-impress", include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx")),
];

fn root() -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("longedit-v1118-owned-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir(&path).unwrap();
    path
}
fn operations(bytes: &[u8], signature: &str) -> Vec<PptxPatchOperation> {
    let (baseline, _) = build_pptx_edit_baseline(bytes, signature.into()).unwrap();
    let title = baseline.editable_text_targets.first().unwrap();
    let notes = baseline.editable_notes_targets.first().expect("real producer fixture has editable notes");
    [title, notes].iter().enumerate().map(|(i, target)| PptxPatchOperation::Text {
        target_id: target.id.clone(), expected_text_digest: target.expected_text_digest.clone(), expected_part_digest: target.expected_part_digest.clone(), replacement_text: format!("LongEdit 用户交付 {} 保留编号 00123", i),
    }).collect()
}
fn parts(bytes: &[u8]) -> std::collections::BTreeMap<String, Vec<u8>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..archive.len()).map(|i| { let mut entry = archive.by_index(i).unwrap(); let mut data = Vec::new(); entry.read_to_end(&mut data).unwrap(); (entry.name().into(), data) }).collect()
}

#[test]
fn v1118_multi_edit_copy_preserves_all_untouched_parts_for_three_producers() {
    let dir = root();
    for (producer, original) in PRODUCERS {
        let source = dir.join(format!("{producer}.pptx")); let target = dir.join(format!("{producer}-copy.pptx"));
        fs::write(&source, original).unwrap();
        let signature = file_signature(&source.metadata().unwrap()); let ops = operations(original, &signature);
        let preview = preview_pptx_transaction_path(&source, &signature, &ops).unwrap();
        let saved = save_pptx_transaction_copy_to_path(&source, &target, &signature, &preview.output_digest, &ops).unwrap_or_else(|error| panic!("{producer}: {error}"));
        assert_eq!(saved.status, "transaction_copy_saved_verified"); assert_eq!(saved.operation_kind, "transaction:2");
        assert!(saved.source_unchanged && saved.unchanged_parts_verified && saved.structural_reopen_verified && saved.semantic_reopen_verified);
        assert_eq!(saved.producer_matrix_baseline.len(), 3); assert!(saved.external_producer_reopen_required);
        assert_eq!(fs::read(&source).unwrap(), original);
        let bytes = fs::read(&target).unwrap(); assert_eq!(format!("{:x}", Sha256::digest(&bytes)), preview.output_digest);
        let model = parse_pptx(&bytes).unwrap(); assert!(model.plain_text.contains("LongEdit 用户交付 0 保留编号 00123"));
        assert!(model.slides.iter().any(|slide| slide.notes.contains("LongEdit 用户交付 1 保留编号 00123")));
        let before = parts(original); let after = parts(&bytes); assert_eq!(before.keys().collect::<Vec<_>>(), after.keys().collect::<Vec<_>>());
        for (name, data) in before { if !saved.changed_parts.contains(&name) { assert_eq!(after[&name], data, "{producer}: {name}"); } }
    }
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn v1118_transaction_copy_rejects_collision_source_overwrite_stale_signature_and_digest() {
    let dir = root(); let original = PRODUCERS[0].1; let source = dir.join("source.pptx"); let target = dir.join("copy.pptx");
    fs::write(&source, original).unwrap(); let signature = file_signature(&source.metadata().unwrap());
    let ops = operations(original, &signature); let preview = preview_pptx_transaction_path(&source, &signature, &ops).unwrap();
    assert!(save_pptx_transaction_copy_to_path(&source, &source, &signature, &preview.output_digest, &ops).unwrap_err().contains("禁止覆盖"));
    assert!(save_pptx_transaction_copy_to_path(&source, &target, "stale", &preview.output_digest, &ops).unwrap_err().contains("外部修改")); assert!(!target.exists());
    assert!(save_pptx_transaction_copy_to_path(&source, &target, &signature, &"0".repeat(64), &ops).unwrap_err().contains("已变化")); assert!(!target.exists());
    fs::write(&target, b"colleague file, never overwrite").unwrap();
    assert!(save_pptx_transaction_copy_to_path(&source, &target, &signature, &preview.output_digest, &ops).unwrap_err().contains("已存在"));
    assert_eq!(fs::read(&target).unwrap(), b"colleague file, never overwrite"); assert_eq!(fs::read(&source).unwrap(), original);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn v1118_transaction_copy_preserves_empty_duplicate_and_budget_boundaries() {
    let dir = root(); let original = PRODUCERS[0].1; let source = dir.join("source.pptx"); let target = dir.join("copy.pptx");
    fs::write(&source, original).unwrap(); let signature = file_signature(&source.metadata().unwrap()); let ops = operations(original, &signature);
    for (items, expected) in [(Vec::new(), "至少"), (vec![ops[0].clone(), ops[0].clone()], "重复目标"), (vec![ops[0].clone();65], "64")] {
        assert!(save_pptx_transaction_copy_to_path(&source, &target, &signature, &"0".repeat(64), &items).unwrap_err().contains(expected));
        assert!(!target.exists()); assert_eq!(fs::read(&source).unwrap(), original);
    }
    fs::remove_dir_all(dir).unwrap();
}
