use super::*;
use crate::services::{document_coordination::acquire, test_workspace::TestWorkspace};
const ORIGINAL: &[u8] = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");

fn save_while_reserved(batch: bool, copy: bool, reserve_target: bool) {
    let workspace = TestWorkspace::new();
    let source_dir = workspace.dir("source");
    let target_dir = workspace.dir("destination");
    let source = source_dir.join("document.docx");
    let target = target_dir.join("copy.docx");
    fs::write(&source, ORIGINAL).unwrap();
    let signature = file_signature(&source.metadata().unwrap());
    let model = parse_docx(ORIGINAL).unwrap();
    let targets = inspect_docx_editable_text_targets(ORIGINAL, &model).unwrap();
    let operations: Vec<_> = targets
        .iter()
        .take(if batch { 2 } else { 1 })
        .map(|target| DocxPatchOperation::Text {
            target_id: target.id.clone(),
            expected_text_digest: target.expected_text_digest.clone(),
            replacement_text: "用户保留的 DOCX 修改".into(),
        })
        .collect();
    let digest = if batch {
        build_docx_batch_operations(ORIGINAL, &operations)
            .unwrap()
            .0
            .output_digest
    } else {
        build_docx_operation(ORIGINAL, &operations[0])
            .unwrap()
            .0
            .output_digest
    };
    let save = || -> Result<(), String> {
        match (batch, copy) {
            (false, false) => {
                save_docx_patch_source_to_path(&source, &signature, &digest, &operations[0])
                    .map(|_| ())
            }
            (true, false) => {
                save_docx_batch_source_to_path(&source, &signature, &digest, &operations)
                    .map(|_| ())
            }
            (false, true) => {
                save_docx_patch_copy_to_path(&source, &target, &signature, &digest, &operations[0])
                    .map(|_| ())
            }
            (true, true) => {
                save_docx_batch_copy_to_path(&source, &target, &signature, &digest, &operations)
                    .map(|_| ())
            }
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
        "DOCX save bypassed a protected {}",
        if reserve_target {
            "destination"
        } else {
            "source"
        }
    );
    assert_eq!(fs::read(&source).unwrap(), ORIGINAL);
    assert!(!target.exists());
    drop(moving);
    save().unwrap();
    let written = fs::read(if copy { &target } else { &source }).unwrap();
    assert!(parse_docx(&written)
        .unwrap()
        .plain_text
        .contains("用户保留的 DOCX 修改"));
    if copy {
        assert_eq!(fs::read(&source).unwrap(), ORIGINAL);
    }
}
#[test]
fn office_move_docx_source_save() {
    save_while_reserved(false, false, false);
}
#[test]
fn office_move_docx_batch_source_save() {
    save_while_reserved(true, false, false);
}
#[test]
fn office_move_docx_copy_source() {
    save_while_reserved(false, true, false);
}
#[test]
fn office_move_docx_copy_destination() {
    save_while_reserved(false, true, true);
}
#[test]
fn office_move_docx_batch_copy_source() {
    save_while_reserved(true, true, false);
}
#[test]
fn office_move_docx_batch_copy_destination() {
    save_while_reserved(true, true, true);
}

#[test]
fn office_move_docx_read_and_preview_are_protected() {
    let workspace = TestWorkspace::new();
    let path = workspace.0.join("document.docx");
    fs::write(&path, ORIGINAL).unwrap();
    let signature = file_signature(&path.metadata().unwrap());
    let target = inspect_docx_editable_text_targets(ORIGINAL, &parse_docx(ORIGINAL).unwrap())
        .unwrap()
        .remove(0);
    let moving = acquire(&[&path]).unwrap();
    let read = tauri::async_runtime::block_on(read_docx_document(
        workspace.root(),
        path.to_string_lossy().into_owned(),
    ));
    let preview = preview_docx_text_patch_path(
        &path,
        &signature,
        &target.id,
        &target.expected_text_digest,
        "用户修改",
    );
    assert!(read.is_err() && preview.is_err());
    assert_eq!(fs::read(&path).unwrap(), ORIGINAL);
    drop(moving);
    tauri::async_runtime::block_on(read_docx_document(
        workspace.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
}
