use super::*;
use crate::services::{document_coordination::acquire, test_workspace::TestWorkspace};
use serde_json::json;

fn workbook(workspace: &TestWorkspace) -> PathBuf {
    let path = workspace.0.join("document.xlsx");
    let mut book = rust_xlsxwriter::Workbook::new();
    let sheet = book.add_worksheet();
    sheet.set_name("Data").unwrap();
    sheet.write_string(0, 0, "Name").unwrap();
    sheet.write_string(0, 1, "Value").unwrap();
    sheet.write_string(1, 0, "initial").unwrap();
    sheet.write_number(1, 1, 1.0).unwrap();
    sheet.autofilter(0, 0, 1, 1).unwrap();
    book.save(&path).unwrap();
    path
}

macro_rules! protected_save {
    ($test:ident, $command:ident, $body:expr) => {
        #[test]
        fn $test() {
            let workspace = TestWorkspace::new();
            let path = workbook(&workspace);
            let original = fs::read(&path).unwrap();
            let signature = CalamineWorkbookEngine.inspect(&path).unwrap().signature;
            let mut value = $body;
            value["expectedSignature"] = json!(signature);
            let save = || {
                tauri::async_runtime::block_on($command(
                    workspace.root(),
                    path.to_string_lossy().into_owned(),
                    serde_json::from_value(value.clone()).unwrap(),
                ))
            };
            let moving = acquire(&[&workspace.0]).unwrap();
            assert!(save().is_err(), "XLSX writer bypassed subtree protection");
            assert_eq!(fs::read(&path).unwrap(), original);
            drop(moving);
            save().unwrap();
            assert_ne!(
                fs::read(&path).unwrap(),
                original,
                "valid retry must perform the requested edit"
            );
            validate_workbook_package(&fs::read(&path).unwrap()).unwrap();
        }
    };
}
protected_save!(
    office_move_xlsx_cells,
    write_workbook_cells,
    json!({"edits":[{"sheet":"Data","row":1,"column":1,"input":"42","kind":"number"}]})
);
protected_save!(
    office_move_xlsx_draft,
    write_workbook_draft,
    json!({"edits":[{"sheet":"Data","row":1,"column":0,"input":"用户修改","kind":"string"}]})
);
protected_save!(
    office_move_xlsx_structure,
    update_workbook_structure,
    json!({"change":{"sheet":"Data","axis":"row","action":"insert","index":1,"count":1}})
);
protected_save!(
    office_move_xlsx_defined_name,
    update_workbook_defined_name,
    json!({"change":{"action":"create","name":"UserRange","targetSheet":"Data","range":{"top":0,"bottom":1,"left":0,"right":1}}})
);
protected_save!(
    office_move_xlsx_page_layout,
    update_workbook_page_layout,
    json!({"change":{"sheet":"Data","orientation":"landscape","paperSize":9,"margins":{"left":0.5,"right":0.5,"top":0.5,"bottom":0.5,"header":0.2,"footer":0.2},"scale":100}})
);
protected_save!(
    office_move_xlsx_header_footer,
    update_workbook_header_footer,
    json!({"change":{"sheet":"Data","oddHeader":"用户页眉","oddFooter":"&P","evenHeader":"","evenFooter":"","firstHeader":"","firstFooter":"","differentOddEven":false,"differentFirstPage":false,"scaleWithDocument":true,"alignWithMargins":true}})
);
protected_save!(
    office_move_xlsx_print_options,
    update_workbook_print_options,
    json!({"change":{"sheet":"Data","gridLines":true,"headings":true,"horizontalCentered":false,"verticalCentered":false,"blackAndWhite":false,"draft":false}})
);
protected_save!(
    office_move_xlsx_outline,
    update_workbook_outline,
    json!({"rowEdits":[{"sheet":"Data","row":1,"hidden":true,"outlineLevel":1,"collapsed":false}]})
);
protected_save!(
    office_move_xlsx_validation,
    update_workbook_data_validation,
    json!({"change":{"sheet":"Data","action":"create","validation":{"ranges":[{"top":1,"bottom":1,"left":0,"right":0}],"kind":"list","formula1":"\"Active,Closed\"","allowBlank":true,"showErrorMessage":true}}})
);
protected_save!(
    office_move_xlsx_conditional,
    update_workbook_conditional_format,
    json!({"change":{"sheet":"Data","action":"create","rule":{"groupIndex":0,"ruleIndex":0,"ranges":[{"top":1,"bottom":1,"left":1,"right":1}],"kind":"cellIs","operator":"greaterThan","formula1":"0","priority":1,"stopIfTrue":false,"style":{"bold":true},"editable":true}}})
);
protected_save!(
    office_move_xlsx_table,
    update_workbook_table,
    json!({"change":{"sheet":"Data","action":"create","tableName":"UserTable","range":{"top":0,"bottom":1,"left":0,"right":1},"columns":["Name","Value"]}})
);
protected_save!(
    office_move_xlsx_filter,
    update_workbook_filter,
    json!({"change":{"sheet":"Data","target":"worksheet","action":"apply","range":{"top":0,"bottom":1,"left":0,"right":1},"filterColumn":0,"query":"initial"}})
);
protected_save!(
    office_move_xlsx_drawing,
    update_workbook_drawing,
    json!({"change":{"sheet":"Data","drawingPart":"","anchorIndex":0,"objectId":"","action":"create_chart","chartType":"column","chartTitle":"用户图表","sourceRange":{"top":0,"bottom":1,"left":0,"right":1},"from":{"row":3,"column":0,"rowOffset":0,"columnOffset":0},"to":{"row":12,"column":5,"rowOffset":0,"columnOffset":0}}})
);

#[test]
fn office_move_xlsx_freeze() {
    let workspace = TestWorkspace::new();
    let path = workbook(&workspace);
    let original = fs::read(&path).unwrap();
    let signature = CalamineWorkbookEngine.inspect(&path).unwrap().signature;
    let save = || {
        tauri::async_runtime::block_on(update_workbook_freeze_pane(
            workspace.root(),
            path.to_string_lossy().into_owned(),
            signature.clone(),
            "Data".into(),
            1,
            1,
        ))
    };
    let moving = acquire(&[&path]).unwrap();
    assert!(save().is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    drop(moving);
    save().unwrap();
    assert_ne!(fs::read(&path).unwrap(), original);
}

#[test]
fn office_move_xlsx_reads_are_protected() {
    let workspace = TestWorkspace::new();
    let path = workbook(&workspace);
    let moving = acquire(&[&path]).unwrap();
    assert!(tauri::async_runtime::block_on(read_workbook_file(
        workspace.root(),
        path.to_string_lossy().into_owned()
    ))
    .is_err());
    assert!(tauri::async_runtime::block_on(read_workbook_sheet(
        workspace.root(),
        path.to_string_lossy().into_owned(),
        "Data".into(),
        0,
        10
    ))
    .is_err());
    assert!(inspect_external_workbook_path(&path).is_err());
    assert!(read_external_workbook_sheet_path(&path, "Data", 0, 10).is_err());
    drop(moving);
    tauri::async_runtime::block_on(read_workbook_file(
        workspace.root(),
        path.to_string_lossy().into_owned(),
    ))
    .unwrap();
    assert_eq!(
        read_external_workbook_sheet_path(&path, "Data", 0, 10)
            .unwrap()
            .rows
            .len(),
        2
    );
}

#[test]
fn office_move_xlsx_conversion_protects_output_directory() {
    let workspace = TestWorkspace::new();
    let path = workbook(&workspace);
    let original = fs::read(&path).unwrap();
    let moving = acquire(&[&workspace.0]).unwrap();
    assert!(sheet_to_table(&path, "Data").is_err());
    assert_eq!(fs::read_dir(&workspace.0).unwrap().count(), 1);
    drop(moving);
    let target = sheet_to_table(&path, "Data").unwrap();
    assert!(target.exists());
    assert_eq!(fs::read(&path).unwrap(), original);
    let second = sheet_to_table(&path, "Data").unwrap();
    assert_ne!(target, second);
    assert_eq!(fs::read(target).unwrap(), fs::read(second).unwrap());
}

#[test]
fn office_move_xlsx_late_inspection_does_not_promote_old_backup() {
    let workspace = TestWorkspace::new();
    let old = workbook(&workspace);
    let original = fs::read(&old).unwrap();
    let moved = workspace.0.join("moved.xlsx");
    fs::rename(&old, &moved).unwrap();
    let backup = workspace.0.join(".document.xlsx.longedit-bak");
    fs::write(&backup, &original).unwrap();
    assert!(CalamineWorkbookEngine.inspect(&old).is_err());
    assert!(!old.exists());
    assert_eq!(fs::read(backup).unwrap(), original);
    assert_eq!(fs::read(moved).unwrap(), original);
}

fn pivot_copy(reserve_target: bool) {
    let workspace = TestWorkspace::new();
    let source_dir = workspace.dir("source");
    let target_dir = workspace.dir("destination");
    let source = source_dir.join("pivot.xlsx");
    let target = target_dir.join("copy.xlsx");
    let original = include_bytes!("../../tests/fixtures/workbook/pivot-producer-apache-poi.xlsx");
    fs::write(&source, original).unwrap();
    let document = CalamineWorkbookEngine.inspect(&source).unwrap();
    let pivot = document
        .linked_data
        .pivot_tables
        .iter()
        .find(|pivot| {
            pivot.audit.row_field_count == 1
                && pivot.audit.column_field_count == 1
                && pivot.audit.data_field_count == 1
                && pivot.audit.page_field_count == 0
        })
        .unwrap();
    let (_, preview) = rebuild_workbook_pivot_expanded_isolated(original, pivot).unwrap();
    let payload = WorkbookPivotSaveCopyPayload {
        expected_signature: document.signature,
        pivot_part: pivot.part.clone(),
        expected_output_digest: preview.isolated_package_digest,
        layout_variant: None,
        aggregation_variant: None,
    };
    let moving = acquire(&[if reserve_target {
        &target_dir
    } else {
        &source_dir
    }])
    .unwrap();
    assert!(save_workbook_pivot_copy_to_path(&source, &target, &payload).is_err());
    assert!(!target.exists());
    assert_eq!(fs::read(&source).unwrap(), original);
    drop(moving);
    save_workbook_pivot_copy_to_path(&source, &target, &payload).unwrap();
    validate_workbook_package(&fs::read(target).unwrap()).unwrap();
    assert_eq!(fs::read(source).unwrap(), original);
}
#[test]
fn office_move_xlsx_pivot_copy_source() {
    pivot_copy(false);
}
#[test]
fn office_move_xlsx_pivot_copy_destination() {
    pivot_copy(true);
}

#[test]
fn office_move_xlsx_cli_relative_audit_is_preserved() {
    let cwd = std::env::current_dir().unwrap().canonicalize().unwrap();
    let workspace = TestWorkspace::new_in(&cwd);
    let source = workspace.0.join("array.xlsx");
    fs::write(
        &source,
        include_bytes!("../../tests/fixtures/workbook/array-formula-wps-spreadsheets.xlsx"),
    )
    .unwrap();
    let relative = source.strip_prefix(&cwd).unwrap();
    let before = fs::read(&source).unwrap();
    let moving = acquire(&[&source]).unwrap();
    assert!(generate_workbook_array_audit_report(relative).is_err());
    drop(moving);
    let report = generate_workbook_array_audit_report(relative).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&report).unwrap()["status"],
        "array_semantics_verified"
    );
    assert_eq!(fs::read(source).unwrap(), before);
}
