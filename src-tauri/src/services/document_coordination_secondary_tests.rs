//! Exercise non-editor mutation and Table command entry points on real files.
use super::{acquire, specialized_tests::Fixture};
use crate::commands::{graph, table, workspace};
use crate::formats::text::read_text_snapshot;
use serde_json::json;
use std::{fs, path::Path};

const TASK_TABLE: &[u8] =
    include_bytes!("../../../fixtures/post-v115-m4b0/workspace/M4B0 Tasks.table.json");
fn table_payload(document: &table::TableDocument) -> table::TableWritePayload {
    let mut payload = serde_json::to_value(document).unwrap();
    payload["expectedSignature"] = json!(document.signature);
    serde_json::from_value(payload).unwrap()
}

#[test]
fn secondary_workspace_markdown_task_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("tasks.md");
    let original = b"\xEF\xBB\xBF# Plan\r\n- [ ] Ship safely\r\n";
    fs::write(&path, original).unwrap();
    let mutation: workspace::WorkspaceTaskMutation = serde_json::from_value(json!({
        "path":path,"line":2,"text":"Ship safely","completed":true,
        "expectedSignature":read_text_snapshot(&path).unwrap().signature
    }))
    .unwrap();
    let moving = acquire(&[&directory]).unwrap();
    let result = tauri::async_runtime::block_on(workspace::set_workspace_markdown_task_state(
        fixture.root(),
        mutation.clone(),
    ));
    assert!(result.is_err(), "workspace task wrote during folder move");
    assert_eq!(fs::read(&path).unwrap(), original);
    drop(moving);
    tauri::async_runtime::block_on(workspace::set_workspace_markdown_task_state(
        fixture.root(),
        mutation,
    ))
    .unwrap();
    assert_eq!(
        fs::read(&path).unwrap(),
        b"\xEF\xBB\xBF# Plan\r\n- [x] Ship safely\r\n"
    );
}

#[test]
fn secondary_workspace_table_task_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join("tasks.table.json");
    fs::write(&path, TASK_TABLE).unwrap();
    let mutation: workspace::WorkspaceTableTaskMutation = serde_json::from_value(json!({
        "path":path,"rowId":"task-row-1","columnId":"done","text":"复核 Table 工作台行动","completed":true,
        "expectedSignature":table::file_signature(&path.metadata().unwrap(),TASK_TABLE)
    })).unwrap();
    let moving = acquire(&[&directory]).unwrap();
    assert!(
        tauri::async_runtime::block_on(workspace::set_workspace_table_task_state(
            fixture.root(),
            mutation.clone()
        ))
        .is_err()
    );
    assert_eq!(fs::read(&path).unwrap(), TASK_TABLE);
    drop(moving);
    tauri::async_runtime::block_on(workspace::set_workspace_table_task_state(
        fixture.root(),
        mutation,
    ))
    .unwrap();
    assert!(fs::read_to_string(path)
        .unwrap()
        .contains("\"done\": \"true\""));
}

fn repair_with_reserved_path(reserve_target: bool) {
    let fixture = Fixture::new();
    let source = fixture.0.join("Source.md");
    let target = fixture.0.join("Target.md");
    let original = "中文 [[Targt|别名]]\r\n";
    fs::write(&source, original).unwrap();
    fs::write(&target, "keep target").unwrap();
    let repairs: Vec<graph::GraphLinkRepair> = serde_json::from_value(json!([{
        "sourcePath":source,"targetPath":target,"line":1,"expectedSyntax":"[[Targt|别名]]"
    }]))
    .unwrap();
    let moving = acquire(&[if reserve_target { &target } else { &source }]).unwrap();
    assert!(
        tauri::async_runtime::block_on(graph::repair_graph_links(fixture.root(), repairs.clone()))
            .is_err(),
        "repair ignored protected {}",
        if reserve_target { "target" } else { "source" }
    );
    assert_eq!(fs::read_to_string(&source).unwrap(), original);
    assert_eq!(fs::read_to_string(&target).unwrap(), "keep target");
    drop(moving);
    tauri::async_runtime::block_on(graph::repair_graph_links(fixture.root(), repairs)).unwrap();
    assert_eq!(
        fs::read_to_string(source).unwrap(),
        "中文 [[Target|别名]]\r\n"
    );
}
#[test]
fn secondary_graph_repair_reserves_source() {
    repair_with_reserved_path(false);
}
#[test]
fn secondary_graph_repair_reserves_target() {
    repair_with_reserved_path(true);
}

fn relation_with_reserved_path(reserve_target: bool) {
    let fixture = Fixture::new();
    let source = fixture.0.join("Source.md");
    let target = fixture.0.join("Target.md");
    let original = "# Source\r\nKeep body\r\n";
    fs::write(&source, original).unwrap();
    fs::write(&target, "keep target").unwrap();
    let mutation = || {
        serde_json::from_value(json!({
            "sourcePath":source,"targetPath":target,"relationType":"related","action":"add",
            "expectedSignature":format!("{:x}",md5::compute(original.as_bytes()))
        }))
        .unwrap()
    };
    let moving = acquire(&[if reserve_target { &target } else { &source }]).unwrap();
    assert!(tauri::async_runtime::block_on(graph::update_graph_relation(
        fixture.root(),
        mutation()
    ))
    .is_err());
    assert_eq!(fs::read_to_string(&source).unwrap(), original);
    assert_eq!(fs::read_to_string(&target).unwrap(), "keep target");
    drop(moving);
    tauri::async_runtime::block_on(graph::update_graph_relation(fixture.root(), mutation()))
        .unwrap();
    let saved = fs::read_to_string(source).unwrap();
    assert!(saved.contains("[[Target]]") && saved.ends_with(original));
}
#[test]
fn secondary_graph_relation_reserves_source() {
    relation_with_reserved_path(false);
}
#[test]
fn secondary_graph_relation_reserves_target() {
    relation_with_reserved_path(true);
}

fn table_read_write_while_reserved(internal: bool) {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let path = directory.join(if internal {
        "tasks.table.json"
    } else {
        "tasks.csv"
    });
    let original = if internal {
        TASK_TABLE
    } else {
        b"Task,Status\r\nShip,Pending\r\n"
    };
    fs::write(&path, original).unwrap();
    let opened = tauri::async_runtime::block_on(table::read_table_file(
        fixture.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
    let moving = acquire(&[&directory]).unwrap();
    let read =
        tauri::async_runtime::block_on(table::read_table_file(fixture.root(), opened.path.clone()));
    let write = tauri::async_runtime::block_on(table::write_table_file(
        fixture.root(),
        opened.path.clone(),
        table_payload(&opened),
    ));
    assert!(
        read.is_err() && write.is_err(),
        "Table I/O bypassed directory protection"
    );
    assert_eq!(fs::read(&path).unwrap(), original);
    drop(moving);
    tauri::async_runtime::block_on(table::write_table_file(
        fixture.root(),
        opened.path.clone(),
        table_payload(&opened),
    ))
    .unwrap();
}
#[test]
fn secondary_csv_read_and_save_respect_directory_move() {
    table_read_write_while_reserved(false);
}
#[test]
fn secondary_internal_table_read_and_save_respect_directory_move() {
    table_read_write_while_reserved(true);
}

#[test]
fn secondary_table_creation_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let moving = acquire(&[&directory]).unwrap();
    assert!(tauri::async_runtime::block_on(table::create_table_file(
        fixture.root(),
        Some(directory.to_string_lossy().into_owned()),
        None
    ))
    .is_err());
    assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
    drop(moving);
    let created = tauri::async_runtime::block_on(table::create_table_file(
        fixture.root(),
        Some(directory.to_string_lossy().into_owned()),
        None,
    ))
    .unwrap();
    assert!(Path::new(&created).is_file());
}

#[test]
fn secondary_table_import_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let source = directory.join("tasks.csv");
    let original = b"Task,Status\nShip,Pending\n";
    fs::write(&source, original).unwrap();
    let moving = acquire(&[&directory]).unwrap();
    assert!(tauri::async_runtime::block_on(table::import_table_file(
        fixture.root(),
        source.to_string_lossy().into_owned(),
        None,
        None,
    ))
    .is_err());
    assert_eq!(fs::read(&source).unwrap(), original);
    assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
    drop(moving);
    let imported = tauri::async_runtime::block_on(table::import_table_file(
        fixture.root(),
        source.to_string_lossy().into_owned(),
        None,
        None,
    ))
    .unwrap();
    assert!(Path::new(&imported).is_file());
    assert_eq!(fs::read(&source).unwrap(), original);
}

#[test]
fn secondary_table_export_respects_directory_move() {
    let fixture = Fixture::new();
    let directory = fixture.directory();
    let source = directory.join("tasks.table.json");
    fs::write(&source, TASK_TABLE).unwrap();
    let moving = acquire(&[&directory]).unwrap();
    for format in ["csv", "tsv", "xlsx"] {
        assert!(
            tauri::async_runtime::block_on(table::export_table_file(
                fixture.root(),
                source.to_string_lossy().into_owned(),
                format.into()
            ))
            .is_err(),
            "export bypassed protection: {format}"
        );
    }
    assert_eq!(fs::read(&source).unwrap(), TASK_TABLE);
    assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
    drop(moving);
    let exported = tauri::async_runtime::block_on(table::export_table_file(
        fixture.root(),
        source.to_string_lossy().into_owned(),
        "xlsx".into(),
    ))
    .unwrap();
    assert!(Path::new(&exported).is_file());
}

#[test]
fn secondary_graph_repair_reserves_whole_batch_before_first_write() {
    let fixture = Fixture::new();
    let mut requests = Vec::new();
    for name in ["A", "B"] {
        let source = fixture.0.join(format!("Source{name}.md"));
        let target = fixture.0.join(format!("Target{name}.md"));
        fs::write(&source, "[[Missing]]\n").unwrap();
        fs::write(&target, "target").unwrap();
        requests.push(json!({"sourcePath":source,"targetPath":target,"line":1,"expectedSyntax":"[[Missing]]"}));
    }
    let reserved = fixture.0.join("TargetB.md");
    let moving = acquire(&[&reserved]).unwrap();
    let repairs = || serde_json::from_value(json!(requests)).unwrap();
    assert!(
        tauri::async_runtime::block_on(graph::repair_graph_links(fixture.root(), repairs()))
            .is_err()
    );
    for name in ["A", "B"] {
        let source = fixture.0.join(format!("Source{name}.md"));
        assert_eq!(fs::read_to_string(&source).unwrap(), "[[Missing]]\n");
        assert!(
            acquire(&[&source]).is_ok(),
            "failed reservation must not leak partial ownership"
        );
    }
    drop(moving);
    tauri::async_runtime::block_on(graph::repair_graph_links(fixture.root(), repairs())).unwrap();
    for name in ["A", "B"] {
        assert_eq!(
            fs::read_to_string(fixture.0.join(format!("Source{name}.md"))).unwrap(),
            format!("[[Target{name}]]\n")
        );
    }
}

#[test]
fn secondary_unrelated_reservation_does_not_block_workspace_task() {
    let fixture = Fixture::new();
    let path = fixture.0.join("task.md");
    fs::write(&path, "- [ ] Ship safely\n").unwrap();
    let other = fixture.directory();
    let _moving = acquire(&[&other]).unwrap();
    let mutation = serde_json::from_value(json!({
        "path":path,"line":1,"text":"Ship safely","completed":true,
        "expectedSignature":read_text_snapshot(&path).unwrap().signature
    }))
    .unwrap();
    tauri::async_runtime::block_on(workspace::set_workspace_markdown_task_state(
        fixture.root(),
        mutation,
    ))
    .unwrap();
    assert_eq!(fs::read_to_string(path).unwrap(), "- [x] Ship safely\n");
}
