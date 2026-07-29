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
    let layout = arguments
        .next()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "standard".into());
    if arguments.next().is_some() {
        panic!("unexpected extra arguments");
    }
    match tauri_app_lib::generate_workbook_pivot_layout_audit_copy(&source, &target, &layout) {
        Ok(report) => println!("{report}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
