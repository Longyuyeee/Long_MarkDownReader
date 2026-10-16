use super::*;
use crate::services::{
    archive_history::{history_path, inspect},
    file_move_journal::{HistoryIntent, Intent, Journal},
    test_workspace::TestWorkspace,
};
fn staged(f: &TestWorkspace) -> (PathBuf, Stage) {
    f.dir("notes");
    fs::write(f.0.join("a.md"), "body").unwrap();
    fs::write(f.0.join("index.md"), "[a](a.md)").unwrap();
    let cache = f.0.join(".longedit/move-records");
    let stage = Stage::begin(
        &cache,
        Record {
            version: 1,
            root: f.0.clone(),
            source: f.0.join("a.md"),
            target: f.0.join("notes/a.md"),
            documents: vec![Edit {
                source: f.0.join("index.md"),
                target: f.0.join("index.md"),
                original: "[a](a.md)".into(),
                replacement: "[a](notes/a.md)".into(),
            }],
            companions: vec![],
        },
    )
    .unwrap();
    (cache, stage)
}
#[test]
fn interrupt_after_reference_write_restores_originals_at_the_original_location() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    write_utf8(f.0.join("index.md"), "[a](notes/a.md)").unwrap();
    assert!(inspect_recovery(&stage).can_finish);
    assert!(ensure_clearable(&cache).is_err());
    resolve_stage(None, &cache, stage, false).unwrap();
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "[a](a.md)"
    );
    assert!(f.0.join("a.md").exists());
    ensure_clearable(&cache).unwrap();
}
#[test]
fn interrupt_after_rename_completes_links_without_moving_the_file_again() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    fs::rename(f.0.join("a.md"), f.0.join("notes/a.md")).unwrap();
    assert!(inspect_recovery(&stage).can_restore);
    resolve_stage(None, &cache, stage, false).unwrap();
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "[a](notes/a.md)"
    );
    assert_eq!(fs::read_to_string(f.0.join("notes/a.md")).unwrap(), "body");
    assert!(!f.0.join("a.md").exists());
}
#[test]
fn explicit_restore_returns_position_references_and_history_without_overwriting() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    fs::rename(f.0.join("a.md"), f.0.join("notes/a.md")).unwrap();
    write_utf8(f.0.join("index.md"), "[a](notes/a.md)").unwrap();
    let dir = history_path(&cache, &f.0.join("notes/a.md"));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("1.md"), "historical body").unwrap();
    resolve_stage(None, &cache, stage, true).unwrap();
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "[a](a.md)"
    );
    assert!(f.0.join("a.md").exists());
    assert_eq!(
        fs::read_to_string(history_path(&cache, &f.0.join("a.md")).join("1.md")).unwrap(),
        "historical body"
    );
}
#[test]
fn changed_document_after_interruption_is_preserved_and_not_retired() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    let path = stage.path.clone();
    fs::rename(f.0.join("a.md"), f.0.join("notes/a.md")).unwrap();
    write_utf8(
        f.0.join("index.md"),
        "user's newer unsaved-to-app disk edit",
    )
    .unwrap();
    assert!(!inspect_recovery(&stage).can_finish);
    assert!(resolve_stage(None, &cache, stage, true).is_err());
    assert!(path.exists());
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "user's newer unsaved-to-app disk edit"
    );
    assert!(f.0.join("notes/a.md").exists());
    assert!(!f.0.join("a.md").exists());
}
#[test]
fn both_positions_occupied_never_overwrites_either_file() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    fs::write(f.0.join("notes/a.md"), "other user's file").unwrap();
    assert!(!inspect_recovery(&stage).can_restore);
    assert!(resolve_stage(None, &cache, stage, true).is_err());
    assert_eq!(fs::read_to_string(f.0.join("a.md")).unwrap(), "body");
    assert_eq!(
        fs::read_to_string(f.0.join("notes/a.md")).unwrap(),
        "other user's file"
    );
}
#[test]
fn partial_history_migration_is_verified_and_restored_before_marking_recovery_finished() {
    let f = TestWorkspace::new();
    let (cache, stage) = staged(&f);
    let (old, new) = (f.0.join("a.md"), f.0.join("notes/a.md"));
    let old_history = history_path(&cache, &old);
    fs::create_dir_all(&old_history).unwrap();
    fs::write(old_history.join("7.md"), "original snapshot").unwrap();
    let expected = inspect(&cache, &old, &new).unwrap();
    let _journal = Journal::begin(
        &cache,
        &Intent {
            version: 1,
            source: old.clone(),
            target: new.clone(),
            histories: vec![HistoryIntent {
                source: old.clone(),
                target: new.clone(),
                expected,
                had_history: true,
            }],
        },
    )
    .unwrap();
    fs::rename(&old_history, history_path(&cache, &new)).unwrap();
    write_utf8(f.0.join("index.md"), "[a](notes/a.md)").unwrap();
    resolve_stage(None, &cache, stage, false).unwrap();
    assert_eq!(
        fs::read_to_string(old_history.join("7.md")).unwrap(),
        "original snapshot"
    );
    assert!(crate::services::file_move_journal::pending(&cache)
        .unwrap()
        .is_empty());
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "[a](a.md)"
    );
}

#[test]
fn original_copies_can_be_exported_when_current_documents_have_new_edits() {
    let f = TestWorkspace::new();
    let (_, stage) = staged(&f);
    write_utf8(f.0.join("index.md"), "new user content").unwrap();
    assert!(!inspect_recovery(&stage).can_finish);
    let directory = f.dir("copies");
    let exported = export_originals(&stage, &directory).unwrap();
    assert_eq!(
        fs::read_to_string(exported.join("001-index.md")).unwrap(),
        "[a](a.md)"
    );
    assert_eq!(
        fs::read_to_string(f.0.join("index.md")).unwrap(),
        "new user content"
    );
    assert!(stage.path.exists());
    let second = export_originals(&stage, &directory).unwrap();
    assert_ne!(exported, second);
    assert!(exported.join("001-index.md").exists());
}

#[test]
fn a_preexisting_destination_is_preserved_while_exporting_recovery_material() {
    let f = TestWorkspace::new();
    let (_, stage) = staged(&f);
    let directory = f.dir("copies");
    fs::write(directory.join("001-index.md"), "previous export").unwrap();
    let exported = export_originals(&stage, &directory).unwrap();
    assert_eq!(
        fs::read_to_string(directory.join("001-index.md")).unwrap(),
        "previous export"
    );
    assert_eq!(
        fs::read_to_string(exported.join("001-index.md")).unwrap(),
        "[a](a.md)"
    );
}
