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
    create_new_file, create_new_folder, delete_item, delete_items, export_to_html, get_file_stats,
    get_folder_order, get_image_base64, get_launch_args, import_to_library, move_item, move_items,
    read_markdown_file, rename_item, save_folder_order, save_image, scan_directory,
    write_markdown_file,
};
pub(crate) use commands::files::{sanitize_filename, FileContent, FileEntry};
use commands::git::{git_commit, git_init, git_pull, git_push, git_status};
pub(crate) use commands::graph::GraphData;
use commands::graph::{
    analyze_graph_health, build_link_graph, build_local_graph, extract_wikilinks, find_backlinks,
    get_library_stats, repair_graph_links,
};
#[cfg(test)]
pub(crate) use commands::graph::{GraphEdge, GraphNode};
use commands::history::{
    clear_all_history, delete_history_version, list_history, save_history_version, save_shadow_copy,
};
use commands::index::search_knowledge;
use commands::pdf::{
    build_pdf_annotation_reference, read_pdf_annotations, read_pdf_file, read_pdf_info,
    read_pdf_ocr, read_pdf_range, write_pdf_annotations, write_pdf_ocr,
};
use commands::search::{get_all_tags, search_all_libraries, search_by_tag, search_library};
use commands::system::{check_association_status, exit_app, get_url_title, set_as_default_handler};
use commands::table::{
    create_table_file, export_table_file, import_table_file, read_table_file, write_table_file,
};
use commands::workbook::{import_workbook_sheet, read_workbook_file, read_workbook_sheet};
use services::data_migration::check_and_migrate_data;
use std::fs;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use window_vibrancy::{apply_blur, apply_mica};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("misty-img", move |_app, request, responder| {
            let uri = request.uri().to_string();
            let path_part = uri.strip_prefix("misty-img://localhost").unwrap_or(&uri);
            let path_part = path_part.strip_prefix("misty-img:").unwrap_or(path_part);
            let decoded_path = urlencoding::decode(path_part)
                .unwrap_or(std::borrow::Cow::Borrowed(path_part))
                .into_owned();
            let clean_path = if cfg!(windows) {
                decoded_path.trim_start_matches('/').to_string()
            } else {
                decoded_path
            };
            std::thread::spawn(move || {
                let extension = Path::new(&clean_path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !matches!(
                    extension.as_str(),
                    "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "ico"
                ) {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(403)
                            .body(Vec::<u8>::new())
                            .unwrap_or_else(|_| tauri::http::Response::new(Vec::<u8>::new())),
                    );
                    return;
                }
                if fs::metadata(&clean_path)
                    .map(|m| m.len() > 50 * 1024 * 1024)
                    .unwrap_or(true)
                {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(413)
                            .body(Vec::<u8>::new())
                            .unwrap_or_else(|_| tauri::http::Response::new(Vec::<u8>::new())),
                    );
                    return;
                }
                match fs::read(&clean_path) {
                    Ok(data) => {
                        let mime = match extension.as_str() {
                            "jpg" | "jpeg" => "image/jpeg",
                            "png" => "image/png",
                            "gif" => "image/gif",
                            "webp" => "image/webp",
                            "bmp" => "image/bmp",
                            "ico" => "image/x-icon",
                            _ => "application/octet-stream",
                        };
                        let response = tauri::http::Response::builder()
                            .header("Content-Type", mime)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(data)
                            .unwrap_or_else(|_| {
                                tauri::http::Response::builder()
                                    .status(500)
                                    .body(Vec::<u8>::new())
                                    .unwrap()
                            });
                        responder.respond(response);
                    }
                    Err(_) => responder.respond(
                        tauri::http::Response::builder()
                            .status(404)
                            .body(Vec::<u8>::new())
                            .unwrap_or_else(|_| {
                                tauri::http::Response::builder()
                                    .status(500)
                                    .body(Vec::<u8>::new())
                                    .unwrap()
                            }),
                    ),
                }
            });
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            if args.len() > 1 {
                let _ = app.emit("open-file", args[1].clone());
            }
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let _ = check_and_migrate_data(app.handle());
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;

            // 根据启动参数控制窗口显示：手动启动则显示窗口，自启参数 --minimized 则保持隐藏
            let args: Vec<String> = std::env::args().collect();
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
            build_pdf_annotation_reference,
            analyze_graph_health,
            repair_graph_links,
            get_launch_args,
            scan_directory,
            get_folder_order,
            save_folder_order,
            import_to_library,
            save_image,
            save_shadow_copy,
            get_url_title,
            search_library,
            search_knowledge,
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
            get_file_stats,
            search_all_libraries,
            get_library_stats,
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
