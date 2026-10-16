use super::*;
use crate::services::{document_coordination::acquire, test_workspace::TestWorkspace};
const ORIGINAL: &[u8] =
    include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
fn operation(signature: &str) -> PptxPatchOperation {
    let (baseline, _) = build_pptx_edit_baseline(ORIGINAL, signature.into()).unwrap();
    let target = &baseline.editable_text_targets[0];
    PptxPatchOperation::Text {
        target_id: target.id.clone(),
        expected_text_digest: target.expected_text_digest.clone(),
        expected_part_digest: target.expected_part_digest.clone(),
        replacement_text: "用户保留的 PPTX 修改".into(),
    }
}
fn save_while_reserved(transaction: bool, copy: bool, reserve_target: bool) {
    let workspace = TestWorkspace::new();
    let source_dir = workspace.dir("source");
    let target_dir = workspace.dir("destination");
    let source = source_dir.join("document.pptx");
    let target = target_dir.join("copy.pptx");
    fs::write(&source, ORIGINAL).unwrap();
    let signature = file_signature(&source.metadata().unwrap());
    let operations = vec![operation(&signature)];
    let digest = if transaction {
        build_pptx_transaction(ORIGINAL, &operations)
            .unwrap()
            .report
            .output_digest
    } else {
        build_pptx_operation(ORIGINAL, &operations[0])
            .unwrap()
            .output_digest
    };
    let save = || -> Result<(), String> {
        if copy {
            save_pptx_patch_copy_to_path(&source, &target, &signature, &digest, &operations[0])
                .map(|_| ())
        } else if transaction {
            save_pptx_transaction_source_to_path(&source, &signature, &digest, &operations)
                .map(|_| ())
        } else {
            save_pptx_patch_source_to_path(&source, &signature, &digest, &operations[0]).map(|_| ())
        }
    };
    let moving = acquire(&[if reserve_target {
        &target_dir
    } else {
        &source_dir
    }])
    .unwrap();
    assert!(
        save().is_err(),
        "PPTX save bypassed source/destination protection"
    );
    assert_eq!(fs::read(&source).unwrap(), ORIGINAL);
    assert!(!target.exists());
    drop(moving);
    save().unwrap();
    let written = fs::read(if copy { &target } else { &source }).unwrap();
    assert!(parse_pptx(&written)
        .unwrap()
        .plain_text
        .contains("用户保留的 PPTX 修改"));
    if copy {
        assert_eq!(fs::read(&source).unwrap(), ORIGINAL);
    }
}
#[test]
fn office_move_pptx_source_save() {
    save_while_reserved(false, false, false);
}
#[test]
fn office_move_pptx_transaction_source_save() {
    save_while_reserved(true, false, false);
}
#[test]
fn office_move_pptx_copy_source() {
    save_while_reserved(false, true, false);
}
#[test]
fn office_move_pptx_copy_destination() {
    save_while_reserved(false, true, true);
}

#[test]
fn office_move_pptx_read_and_preview_are_protected() {
    let workspace = TestWorkspace::new();
    let path = workspace.0.join("document.pptx");
    fs::write(&path, ORIGINAL).unwrap();
    let signature = file_signature(&path.metadata().unwrap());
    let moving = acquire(&[&path]).unwrap();
    let read = tauri::async_runtime::block_on(read_pptx_presentation(
        workspace.root(),
        path.to_string_lossy().into_owned(),
    ));
    let preview = audit_pptx_edit_baseline_path(&path, &signature);
    assert!(read.is_err() && preview.is_err());
    assert_eq!(fs::read(&path).unwrap(), ORIGINAL);
    drop(moving);
    tauri::async_runtime::block_on(read_pptx_presentation(
        workspace.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
}

#[test]
fn office_move_pptx_late_source_save_does_not_promote_old_backup() {
    let workspace = TestWorkspace::new();
    for transaction in [false, true] {
        let old = workspace.0.join(if transaction {
            "transaction.pptx"
        } else {
            "single.pptx"
        });
        let moved = old.with_extension("moved.pptx");
        fs::write(&old, ORIGINAL).unwrap();
        let signature = file_signature(&old.metadata().unwrap());
        let operations = vec![operation(&signature)];
        let digest = if transaction {
            build_pptx_transaction(ORIGINAL, &operations)
                .unwrap()
                .report
                .output_digest
        } else {
            build_pptx_operation(ORIGINAL, &operations[0])
                .unwrap()
                .output_digest
        };
        fs::rename(&old, &moved).unwrap();
        let backup = workspace.0.join(format!(
            ".{}.longedit-bak",
            old.file_name().unwrap().to_str().unwrap()
        ));
        fs::write(&backup, ORIGINAL).unwrap();
        let result = if transaction {
            save_pptx_transaction_source_to_path(&old, &signature, &digest, &operations)
        } else {
            save_pptx_patch_source_to_path(&old, &signature, &digest, &operations[0])
        };
        assert!(result.is_err());
        assert!(!old.exists(), "late save promoted the old-path backup");
        assert_eq!(fs::read(backup).unwrap(), ORIGINAL);
        assert_eq!(fs::read(moved).unwrap(), ORIGINAL);
    }
}
