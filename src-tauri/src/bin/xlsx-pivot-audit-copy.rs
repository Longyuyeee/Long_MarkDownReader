use std::path::PathBuf;

fn main() {
    let mut arguments = std::env::args_os().skip(1);
    let source = arguments
        .next()
        .map(PathBuf::from)
        .expect("source XLSX path is required");
    let target = arguments
        .next()
        .map(PathBuf::from)
        .expect("target XLSX path is required");
    let variant = arguments
        .next()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "standard".into());
    if arguments.next().is_some() {
        panic!("unexpected extra arguments");
    }
    let result = if variant == "multi_axis" {
        tauri_app_lib::generate_workbook_pivot_multi_axis_audit_copy(&source, &target)
    } else if matches!(
        variant.as_str(),
        "standard" | "row_only" | "column_only" | "multi_measure"
    ) {
        tauri_app_lib::generate_workbook_pivot_layout_audit_copy(&source, &target, &variant)
    } else {
        tauri_app_lib::generate_workbook_pivot_aggregation_audit_copy(&source, &target, &variant)
    };
    match result {
        Ok(report) => println!("{report}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
