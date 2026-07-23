mod commands;
mod formats;
mod services;

use commands::ai::ai_chat_completion;
use commands::canvas::{
    create_canvas_file, create_canvas_from_graph, create_canvas_from_markdown, read_canvas_file,
    write_canvas_file,
};
use commands::config::{
    clear_ai_credential, get_ai_credential_status, get_config, save_config, set_ai_credential,
};
use commands::diagram::{
    analyze_diagram_source, create_diagram_file, read_diagram_file, update_diagram_element,
    write_diagram_file,
};
use commands::files::{
    create_new_file, create_new_folder, delete_item, delete_items, export_external_to_html,
    export_markdown_file, export_to_html, get_external_image_base64, get_file_stats,
    get_folder_order, get_image_base64, get_launch_args, import_to_library, move_item, move_items,
    pick_external_markdown_file, read_external_markdown_file, read_markdown_file, rename_item,
    save_folder_order, scan_directory, write_external_markdown_file, write_markdown_file,
};
pub(crate) use commands::files::{sanitize_filename, FileContent, FileEntry};
use commands::formats::{
    create_format_file, get_file_format_registry, read_text_document, write_text_document,
};
use commands::git::{git_commit, git_init, git_pull, git_push, git_status};
pub(crate) use commands::graph::GraphData;
use commands::graph::{
    analyze_graph_health, build_link_graph, build_local_graph, extract_wikilinks, find_backlinks,
    get_library_stats, repair_graph_links, update_graph_relation,
};
#[cfg(test)]
pub(crate) use commands::graph::{GraphEdge, GraphNode};
use commands::history::{
    clear_all_history, delete_history_version, list_history, save_external_history_version,
    save_history_version, save_shadow_copy,
};
use commands::index::{
    delete_knowledge_index, get_knowledge_index_status, rebuild_knowledge_index, search_knowledge,
};
use commands::mindmap::{create_canvas_from_opml, read_opml_file, write_opml_file};
use commands::pdf::{
    build_pdf_annotation_reference, read_pdf_annotations, read_pdf_file, read_pdf_info,
    read_pdf_ocr, read_pdf_range, write_pdf_annotations, write_pdf_ocr,
};
use commands::search::{get_all_tags, search_all_libraries, search_by_tag, search_library};
use commands::system::{check_association_status, exit_app, get_url_title, set_as_default_handler};
use commands::table::{
    create_table_file, export_table_file, import_table_file, read_table_file, write_table_file,
};
use commands::workbook::{
    get_workbook_capabilities, import_workbook_sheet, preview_workbook_structure_migration,
    read_workbook_file, read_workbook_sheet, recalculate_workbook_formulas,
    translate_workbook_formulas, update_workbook_conditional_format,
    update_workbook_data_validation, update_workbook_defined_name, update_workbook_drawing,
    update_workbook_filter, update_workbook_freeze_pane, update_workbook_outline,
    update_workbook_page_layout, update_workbook_structure, update_workbook_table,
    write_workbook_cells,
};
use commands::workspace::{analyze_workspace_health, get_workspace_overview};
use services::data_migration::check_and_migrate_data;
use services::external_file_access::ExternalFileAccess;
use services::knowledge_index::KnowledgeIndexRuntime;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use window_vibrancy::{apply_blur, apply_mica};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(ExternalFileAccess::default())
        .manage(KnowledgeIndexRuntime::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    let builder = if std::env::var_os("LONGEDIT_E2E_LIBRARY").is_some() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            let access = app.state::<ExternalFileAccess>();
            for argument in args.iter().skip(1) {
                if let Ok(path) = access.authorize_markdown(argument.trim_matches('"')) {
                    let _ = app.emit("open-file", path.to_string_lossy().into_owned());
                }
            }
        }))
    };

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
        let access = app.state::<ExternalFileAccess>();
        for argument in args.iter().skip(1) {
            if let Ok(path) = access.authorize_markdown(argument.trim_matches('"')) {
                let _ = app.emit("open-file", path.to_string_lossy().into_owned());
            }
        }
    }));

    builder
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                let access = window.state::<ExternalFileAccess>();
                for path in paths {
                    let _ = access.authorize_import(path);
                }
            }
            _ => {}
        })
        .setup(|app| {
            let _ = check_and_migrate_data(app.handle());
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;

            // 根据启动参数控制窗口显示：手动启动则显示窗口，自启参数 --minimized 则保持隐藏
            let args: Vec<String> = std::env::args().collect();
            let access = app.state::<ExternalFileAccess>();
            for argument in args.iter().skip(1) {
                let _ = access.authorize_markdown(argument.trim_matches('"'));
            }
            if !args.contains(&"--minimized".to_string()) {
                let _ = window.show();
                let _ = window.set_focus();
            }

            #[cfg(target_os = "windows")]
            {
                if apply_mica(&window, None).is_err() {
                    let _ = apply_blur(&window, Some((0, 0, 0, 0)));
                }
            }
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quick_i = MenuItem::with_id(app, "quick", "快速笔记", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quick_i, &show_i, &quit_i])?;
            let default_icon = app
                .default_window_icon()
                .ok_or_else(|| "no default icon".to_string())?
                .clone();
            let _tray = TrayIconBuilder::new()
                .icon(default_icon)
                .tooltip("Long编辑 · MD助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        let Some(win) = app.get_webview_window("main") else {
                            return;
                        };
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                    "quick" => {
                        let _ = tauri::WebviewWindowBuilder::new(
                            app,
                            "quick-note",
                            tauri::WebviewUrl::App("#/quick-note".into()),
                        )
                        .title("快速笔记")
                        .inner_size(400.0, 300.0)
                        .always_on_top(true)
                        .decorations(false)
                        .transparent(true)
                        .build();
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let Some(win) = tray.app_handle().get_webview_window("main") else {
                            return;
                        };
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            write_markdown_file,
            get_file_format_registry,
            read_text_document,
            write_text_document,
            create_format_file,
            read_opml_file,
            write_opml_file,
            create_canvas_from_opml,
            read_external_markdown_file,
            write_external_markdown_file,
            pick_external_markdown_file,
            export_markdown_file,
            export_external_to_html,
            read_canvas_file,
            write_canvas_file,
            read_diagram_file,
            write_diagram_file,
            analyze_diagram_source,
            update_diagram_element,
            read_pdf_file,
            read_pdf_info,
            read_pdf_range,
            read_pdf_annotations,
            write_pdf_annotations,
            read_pdf_ocr,
            write_pdf_ocr,
            read_table_file,
            write_table_file,
            create_table_file,
            import_table_file,
            export_table_file,
            read_workbook_file,
            read_workbook_sheet,
            import_workbook_sheet,
            get_workbook_capabilities,
            recalculate_workbook_formulas,
            translate_workbook_formulas,
            preview_workbook_structure_migration,
            write_workbook_cells,
            update_workbook_freeze_pane,
            update_workbook_page_layout,
            update_workbook_outline,
            update_workbook_structure,
            update_workbook_table,
            update_workbook_filter,
            update_workbook_data_validation,
            update_workbook_conditional_format,
            update_workbook_drawing,
            update_workbook_defined_name,
            build_pdf_annotation_reference,
            analyze_graph_health,
            repair_graph_links,
            update_graph_relation,
            get_launch_args,
            scan_directory,
            get_folder_order,
            save_folder_order,
            import_to_library,
            save_shadow_copy,
            get_url_title,
            search_library,
            search_knowledge,
            get_knowledge_index_status,
            rebuild_knowledge_index,
            delete_knowledge_index,
            export_to_html,
            get_config,
            save_config,
            get_ai_credential_status,
            set_ai_credential,
            clear_ai_credential,
            create_new_file,
            create_canvas_file,
            create_diagram_file,
            create_canvas_from_graph,
            create_canvas_from_markdown,
            create_new_folder,
            rename_item,
            delete_item,
            delete_items,
            move_item,
            move_items,
            set_as_default_handler,
            check_association_status,
            save_history_version,
            save_external_history_version,
            list_history,
            delete_history_version,
            clear_all_history,
            exit_app,
            ai_chat_completion,
            git_status,
            git_init,
            git_commit,
            git_push,
            git_pull,
            get_image_base64,
            get_external_image_base64,
            get_file_stats,
            search_all_libraries,
            get_library_stats,
            get_workspace_overview,
            analyze_workspace_health,
            extract_wikilinks,
            find_backlinks,
            get_all_tags,
            search_by_tag,
            build_link_graph,
            build_local_graph
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
