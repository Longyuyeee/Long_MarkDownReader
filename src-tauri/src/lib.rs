mod commands;
mod formats;
mod services;

use commands::ai::ai_chat_completion;
use commands::backup::{
    export_management_backup, preflight_management_backup_import, restore_management_backup,
};
use commands::canvas::{
    create_canvas_file, create_canvas_from_graph, create_canvas_from_markdown,
    create_project_note_from_graph, read_canvas_file, read_external_canvas_file, write_canvas_file,
    write_external_canvas_file,
};
use commands::config::{
    clear_ai_credential, get_ai_credential_status, get_config, save_config, set_ai_credential,
};
use commands::diagnostics::export_privacy_diagnostic_bundle;
use commands::diagram::{
    analyze_diagram_source, create_diagram_file, read_diagram_file, read_external_diagram_file,
    update_diagram_element, write_diagram_file, write_external_diagram_file,
};
use commands::docx::{
    audit_docx_save_readiness, preview_docx_image_alt_text_patch_isolated_copy,
    preview_docx_package_patch_isolated_copy, preview_docx_paragraph_style_patch_isolated_copy,
    preview_docx_patch_batch_isolated_copy, preview_docx_style_patch_isolated_copy,
    preview_docx_text_patch_isolated_copy, read_docx_document, read_external_docx_document,
    save_docx_patch_batch_copy, save_docx_patch_batch_source, save_docx_patch_copy,
    save_docx_patch_source,
};
use commands::drawio::{
    analyze_drawio_source, transform_drawio_cell_source, write_drawio_source_document,
    write_external_drawio_source_document,
};
use commands::external_apps::{discover_external_applications, open_workspace_file_externally};
use commands::files::{
    create_new_file, create_new_folder, delete_item, delete_items, export_external_to_html,
    export_markdown_file, export_to_html, get_external_image_base64, get_file_stats,
    get_folder_order, get_image_base64, import_to_library, move_item, move_items,
    pick_external_openable_file, read_external_markdown_file, read_markdown_file, rename_item,
    save_folder_order, scan_directory, write_external_markdown_file, write_markdown_file,
};
pub(crate) use commands::files::{sanitize_filename, FileContent, FileEntry};
use commands::formats::{
    create_format_file, get_file_format_registry, get_text_document_identity,
    read_external_text_document, read_external_text_document_range, read_text_document,
    read_text_document_range, write_external_log_document, write_external_text_document,
    write_log_document, write_text_document,
};
use commands::git::{git_commit, git_init, git_pull, git_push, git_status};
pub(crate) use commands::graph::GraphData;
use commands::graph::{
    analyze_graph_health, build_link_graph, build_local_graph, export_knowledge_graph_observation,
    export_knowledge_graph_observation_comparison, extract_wikilinks, find_backlinks,
    get_graph_relation_context, get_knowledge_graph_observation,
    get_knowledge_graph_observation_comparison, get_knowledge_graph_pulse, get_library_stats,
    repair_graph_links, review_knowledge_graph_observation_comparison, summarize_graph_relations,
    update_graph_relation, update_graph_relation_decision,
};
#[cfg(test)]
pub(crate) use commands::graph::{GraphEdge, GraphNode};
use commands::history::{
    clear_all_history, delete_history_version, list_history, save_external_history_version,
    save_history_version, save_shadow_copy,
};
use commands::index::{
    cancel_knowledge_index, delete_knowledge_index, get_knowledge_index_status,
    rebuild_knowledge_index, recover_knowledge_index_cache, search_knowledge,
};
use commands::json::{
    analyze_json_source, append_json_array_item_source, append_json_object_property_source,
    remove_json_array_item_source, remove_json_object_property_source,
    rename_json_object_key_source, replace_json_scalar_source, transform_json_source,
    write_external_json_source_document, write_json_source_document,
};
use commands::legacy_binary_office::{
    convert_legacy_binary_office_to_modern_copy, preflight_legacy_binary_office,
};
use commands::legacy_office::{convert_legacy_doc_to_docx_copy, preflight_legacy_doc};
use commands::media::{
    discover_video_subtitles, inspect_external_media_file, inspect_image_edit_source,
    inspect_media_file, save_image_transform_copy, save_video_frame_png,
};
use commands::mindmap::{
    create_canvas_from_opml, read_external_opml_file, read_opml_file, write_external_opml_file,
    write_opml_file,
};
use commands::odf_content::{
    read_external_odf_content_document, read_odf_content_document, save_ods_cell_style_copy,
    save_ods_cell_value_copy,
};
use commands::odt::read_odt_document;
use commands::pdf::{
    build_pdf_annotation_reference, inspect_pdf_form_structure, preview_pdf_form_copy,
    preview_pdf_form_text_copy, preview_pdf_insert_isolated_copy, preview_pdf_merge_isolated_copy,
    preview_pdf_metadata_copy, preview_pdf_page_plan_isolated_copy,
    preview_pdf_page_range_extract_copy, preview_pdf_redaction_copy, preview_pdf_watermark_copy,
    read_external_pdf_info, read_external_pdf_range, read_pdf_annotations, read_pdf_file,
    read_pdf_info, read_pdf_ocr, read_pdf_range, save_pdf_form_copy, save_pdf_form_text_copy,
    save_pdf_insert_copy, save_pdf_merge_copy, save_pdf_metadata_copy, save_pdf_page_plan_copy,
    save_pdf_page_range_copy, save_pdf_redaction_copy, save_pdf_watermark_copy,
    write_pdf_annotations, write_pdf_ocr,
};
use commands::pptx::{
    audit_pptx_edit_baseline, preview_pptx_alt_text_patch_isolated_copy,
    preview_pptx_image_patch_isolated_copy, preview_pptx_shape_add_isolated_copy,
    preview_pptx_shape_delete_isolated_copy, preview_pptx_slide_lifecycle_isolated_copy,
    preview_pptx_patch_transaction, preview_pptx_style_patch_isolated_copy,
    preview_pptx_text_patch_isolated_copy,
    read_external_pptx_presentation, read_pptx_presentation, save_pptx_patch_copy,
    save_pptx_patch_source, save_pptx_patch_source_transaction,
};
use commands::search::{get_all_tags, search_all_libraries, search_by_tag, search_library};
use commands::svg::{
    analyze_svg_source, write_external_svg_source_document, write_svg_source_document,
};
use commands::system::{
    exit_app, get_default_app_candidate_status, get_url_title, open_default_apps_settings,
    prepare_default_app_candidate, remove_default_app_candidate, request_default_app_selection,
};
use commands::table::{
    create_table_file, export_table_file, import_table_file, read_external_table_file,
    read_table_file, write_external_table_file, write_table_file,
};
use commands::toml::{
    analyze_toml_source, write_external_toml_source_document, write_toml_source_document,
};
use commands::updater::{check_community_update, install_community_update};
use commands::workbook::{
    audit_workbook_pivot_multi_axis_isolated_copy, get_workbook_capabilities,
    import_workbook_sheet, preview_workbook_dynamic_array, preview_workbook_pivot,
    preview_workbook_pivot_rebuild, preview_workbook_structure_migration,
    read_external_workbook_file, read_external_workbook_sheet, read_workbook_file,
    read_workbook_sheet, rebuild_workbook_pivot_cache_isolated_copy,
    rebuild_workbook_pivot_expanded_isolated_copy, rebuild_workbook_pivot_isolated_copy,
    recalculate_workbook_formulas, save_workbook_pivot_copy, translate_workbook_formulas,
    update_workbook_conditional_format, update_workbook_data_validation,
    update_workbook_defined_name, update_workbook_drawing, update_workbook_filter,
    update_workbook_freeze_pane, update_workbook_header_footer, update_workbook_outline,
    update_workbook_page_layout, update_workbook_print_options, update_workbook_structure,
    update_workbook_table, verify_workbook_pivot_variants_isolated_copy, write_workbook_cells,
    write_workbook_draft,
};
pub use commands::workbook::{
    generate_workbook_array_audit_report, generate_workbook_pivot_aggregation_audit_copy,
    generate_workbook_pivot_audit_copy, generate_workbook_pivot_layout_audit_copy,
    generate_workbook_pivot_multi_axis_audit_copy,
};
use commands::workspace::{
    analyze_workspace_health, get_workspace_overview, set_workspace_markdown_task_state,
    set_workspace_table_task_state,
};
use commands::wps_native::inspect_wps_native_file;
use commands::xml::{
    analyze_xml_source, write_external_xml_source_document, write_xml_source_document,
};
use commands::yaml::{
    analyze_yaml_source, write_external_yaml_source_document, write_yaml_source_document,
};
use services::data_migration::check_and_migrate_data;
use services::external_file_access::ExternalFileAccess;
use services::external_windows::{authorize_and_create_external_window, open_external_file_window};
use services::knowledge_index::KnowledgeIndexRuntime;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use window_vibrancy::{apply_blur, apply_mica};

fn open_external_arguments(app: &tauri::AppHandle, args: &[String]) -> bool {
    let access = app.state::<ExternalFileAccess>();
    let mut opened = false;
    for argument in args.iter().skip(1) {
        if authorize_and_create_external_window(app, &access, argument.trim_matches('"')).is_ok() {
            opened = true;
        }
    }
    opened
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // This plugin must run before every plugin that can initialize a secondary process.
    #[cfg(debug_assertions)]
    let builder = if std::env::var_os("LONGEDIT_E2E_LIBRARY").is_some()
        && std::env::var_os("LONGEDIT_E2E_SINGLE_INSTANCE").is_none()
    {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !open_external_arguments(app, &args) {
                focus_main_window(app);
            }
        }))
    };

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        if !open_external_arguments(app, &args) {
            focus_main_window(app);
        }
    }));

    let builder = builder
        .manage(ExternalFileAccess::default())
        .manage(KnowledgeIndexRuntime::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init());

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
            match check_and_migrate_data(app.handle()) {
                Ok(report) if report.has_conflict() => {
                    eprintln!("Legacy data migration conflict preserved: {report:?}");
                }
                Ok(report) if report.changed() => {
                    eprintln!("Legacy data migration completed: {report:?}");
                }
                Ok(_) => {}
                Err(error) => eprintln!("Legacy data migration check failed: {error}"),
            }
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;

            // 根据启动参数控制窗口显示：手动启动则显示窗口，自启参数 --minimized 则保持隐藏
            let args: Vec<String> = std::env::args().collect();
            let opened_external = open_external_arguments(app.handle(), &args);
            if !args.contains(&"--minimized".to_string()) && !opened_external {
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
            discover_external_applications,
            open_workspace_file_externally,
            inspect_wps_native_file,
            preflight_legacy_binary_office,
            convert_legacy_binary_office_to_modern_copy,
            preflight_legacy_doc,
            convert_legacy_doc_to_docx_copy,
            analyze_json_source,
            append_json_array_item_source,
            append_json_object_property_source,
            remove_json_array_item_source,
            remove_json_object_property_source,
            rename_json_object_key_source,
            replace_json_scalar_source,
            transform_json_source,
            write_json_source_document,
            write_external_json_source_document,
            analyze_yaml_source,
            write_yaml_source_document,
            write_external_yaml_source_document,
            analyze_xml_source,
            write_xml_source_document,
            write_external_xml_source_document,
            analyze_svg_source,
            write_svg_source_document,
            write_external_svg_source_document,
            analyze_drawio_source,
            transform_drawio_cell_source,
            write_drawio_source_document,
            write_external_drawio_source_document,
            analyze_toml_source,
            write_toml_source_document,
            write_external_toml_source_document,
            read_text_document,
            read_text_document_range,
            write_log_document,
            write_external_log_document,
            write_text_document,
            read_external_text_document,
            read_external_text_document_range,
            write_external_text_document,
            create_format_file,
            read_opml_file,
            read_external_opml_file,
            write_opml_file,
            write_external_opml_file,
            create_canvas_from_opml,
            read_external_markdown_file,
            write_external_markdown_file,
            pick_external_openable_file,
            export_markdown_file,
            export_external_to_html,
            read_canvas_file,
            read_external_canvas_file,
            write_canvas_file,
            write_external_canvas_file,
            read_diagram_file,
            read_external_diagram_file,
            write_diagram_file,
            write_external_diagram_file,
            analyze_diagram_source,
            update_diagram_element,
            read_docx_document,
            read_external_docx_document,
            read_odt_document,
            read_odf_content_document,
            read_external_odf_content_document,
            save_ods_cell_value_copy,
            save_ods_cell_style_copy,
            preview_docx_package_patch_isolated_copy,
            preview_docx_text_patch_isolated_copy,
            preview_docx_style_patch_isolated_copy,
            preview_docx_paragraph_style_patch_isolated_copy,
            preview_docx_image_alt_text_patch_isolated_copy,
            preview_docx_patch_batch_isolated_copy,
            audit_docx_save_readiness,
            save_docx_patch_copy,
            save_docx_patch_batch_copy,
            save_docx_patch_source,
            save_docx_patch_batch_source,
            read_pdf_file,
            read_pdf_info,
            read_pdf_range,
            read_external_pdf_info,
            read_external_pdf_range,
            inspect_pdf_form_structure,
            preview_pdf_form_text_copy,
            save_pdf_form_text_copy,
            preview_pdf_form_copy,
            save_pdf_form_copy,
            preview_pdf_redaction_copy,
            save_pdf_redaction_copy,
            preview_pdf_metadata_copy,
            save_pdf_metadata_copy,
            preview_pdf_watermark_copy,
            save_pdf_watermark_copy,
            preview_pdf_page_plan_isolated_copy,
            save_pdf_page_plan_copy,
            preview_pdf_page_range_extract_copy,
            save_pdf_page_range_copy,
            preview_pdf_merge_isolated_copy,
            save_pdf_merge_copy,
            preview_pdf_insert_isolated_copy,
            save_pdf_insert_copy,
            read_pdf_annotations,
            write_pdf_annotations,
            read_pdf_ocr,
            write_pdf_ocr,
            read_pptx_presentation,
            read_external_pptx_presentation,
            audit_pptx_edit_baseline,
            preview_pptx_text_patch_isolated_copy,
            preview_pptx_style_patch_isolated_copy,
            preview_pptx_alt_text_patch_isolated_copy,
            preview_pptx_image_patch_isolated_copy,
            preview_pptx_shape_add_isolated_copy,
            preview_pptx_shape_delete_isolated_copy,
            preview_pptx_slide_lifecycle_isolated_copy,
            preview_pptx_patch_transaction,
            save_pptx_patch_copy,
            save_pptx_patch_source,
            save_pptx_patch_source_transaction,
            read_table_file,
            read_external_table_file,
            write_table_file,
            write_external_table_file,
            create_table_file,
            import_table_file,
            export_table_file,
            read_workbook_file,
            read_workbook_sheet,
            read_external_workbook_file,
            read_external_workbook_sheet,
            import_workbook_sheet,
            get_workbook_capabilities,
            recalculate_workbook_formulas,
            preview_workbook_dynamic_array,
            preview_workbook_pivot,
            preview_workbook_pivot_rebuild,
            rebuild_workbook_pivot_cache_isolated_copy,
            audit_workbook_pivot_multi_axis_isolated_copy,
            rebuild_workbook_pivot_isolated_copy,
            rebuild_workbook_pivot_expanded_isolated_copy,
            save_workbook_pivot_copy,
            verify_workbook_pivot_variants_isolated_copy,
            translate_workbook_formulas,
            preview_workbook_structure_migration,
            write_workbook_cells,
            write_workbook_draft,
            update_workbook_freeze_pane,
            update_workbook_header_footer,
            update_workbook_page_layout,
            update_workbook_print_options,
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
            update_graph_relation_decision,
            open_external_file_window,
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
            cancel_knowledge_index,
            recover_knowledge_index_cache,
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
            create_project_note_from_graph,
            create_new_folder,
            rename_item,
            delete_item,
            delete_items,
            move_item,
            move_items,
            open_default_apps_settings,
            get_default_app_candidate_status,
            prepare_default_app_candidate,
            remove_default_app_candidate,
            request_default_app_selection,
            save_history_version,
            save_external_history_version,
            list_history,
            delete_history_version,
            clear_all_history,
            exit_app,
            check_community_update,
            install_community_update,
            ai_chat_completion,
            export_management_backup,
            preflight_management_backup_import,
            restore_management_backup,
            export_privacy_diagnostic_bundle,
            git_status,
            git_init,
            git_commit,
            git_push,
            git_pull,
            get_image_base64,
            get_external_image_base64,
            inspect_media_file,
            inspect_external_media_file,
            discover_video_subtitles,
            inspect_image_edit_source,
            save_image_transform_copy,
            save_video_frame_png,
            get_file_stats,
            get_text_document_identity,
            search_all_libraries,
            get_library_stats,
            get_workspace_overview,
            set_workspace_markdown_task_state,
            set_workspace_table_task_state,
            analyze_workspace_health,
            extract_wikilinks,
            find_backlinks,
            get_all_tags,
            search_by_tag,
            build_link_graph,
            build_local_graph,
            summarize_graph_relations,
            get_graph_relation_context,
            get_knowledge_graph_pulse,
            get_knowledge_graph_observation,
            export_knowledge_graph_observation,
            get_knowledge_graph_observation_comparison,
            export_knowledge_graph_observation_comparison,
            review_knowledge_graph_observation_comparison
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
