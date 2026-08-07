use crate::commands::formats::{
    write_external_registered_text_document, write_registered_text_document,
};
use crate::formats::drawio::{
    analyze_drawio_source as analyze_source, transform_drawio_cell_source as transform_source,
    DrawioAnalysis, DrawioCellPatch,
};
use crate::formats::text::{TextDocumentError, TextDocumentSnapshot};
use crate::services::external_file_access::ExternalFileAccess;
use tauri::State;

fn validate_save(content: &str) -> Result<(), TextDocumentError> {
    let analysis = analyze_source(content);
    if analysis.valid {
        return Ok(());
    }
    Err(TextDocumentError::recoverable(
        "unsafe-drawio-save-blocked",
        "Draw.io source did not pass the compression, XML, or resource safety contract",
        "Resolve the reported page or resource diagnostics before overwriting the file",
    ))
}

#[tauri::command]
pub fn analyze_drawio_source(content: String) -> DrawioAnalysis {
    analyze_source(&content)
}

#[tauri::command]
pub fn transform_drawio_cell_source(
    content: String,
    patch: DrawioCellPatch,
) -> Result<String, String> {
    transform_source(&content, &patch)
}

#[tauri::command]
pub async fn write_drawio_source_document(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    validate_save(&content)?;
    write_registered_text_document(
        library_root,
        path,
        "drawio".into(),
        content,
        expected_signature,
        None,
    )
    .await
}

async fn write_external_drawio_source_document_with_access(
    path: String,
    content: String,
    expected_signature: Option<String>,
    access: &ExternalFileAccess,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    validate_save(&content)?;
    write_external_registered_text_document(
        path,
        "drawio".into(),
        content,
        expected_signature,
        None,
        access,
    )
    .await
}

#[tauri::command]
pub async fn write_external_drawio_source_document(
    path: String,
    content: String,
    expected_signature: Option<String>,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    write_external_drawio_source_document_with_access(
        path,
        content,
        expected_signature,
        &access,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::formats::read_text_document;
    use crate::formats::drawio::DrawioCellPatch;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn unsafe_drawio_is_blocked_before_registered_write() {
        let error = tauri::async_runtime::block_on(write_drawio_source_document(
            std::env::temp_dir().to_string_lossy().into_owned(),
            "unsafe.drawio".into(),
            r#"<mxfile><diagram id="p"><mxGraphModel><root><mxCell id="0" value="javascript:alert(1)"/></root></mxGraphModel></diagram></mxfile>"#.into(),
            None,
        ))
        .unwrap_err();
        assert_eq!(error.code, "unsafe-drawio-save-blocked");
        assert!(error.recoverable);
    }

    #[test]
    fn saved_drawio_reopens_and_rejects_a_stale_signature() {
        let root = std::env::temp_dir().join(format!(
            "longedit-drawio-reopen-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("roundtrip.drawio");
        fs::write(
            &path,
            include_str!("../../tests/fixtures/formats/drawio-uncompressed.drawio"),
        )
        .unwrap();
        let root_string = root.to_string_lossy().into_owned();
        let path_string = path.to_string_lossy().into_owned();
        let opened = tauri::async_runtime::block_on(read_text_document(
            root_string.clone(),
            path_string.clone(),
            "drawio".into(),
            None,
        ))
        .unwrap();
        let transformed = transform_source(
            &opened.content,
            &DrawioCellPatch {
                page_id: "page-1".into(),
                cell_id: "node-a".into(),
                label: Some("Desktop reopen".into()),
                x: None,
                y: None,
                width: None,
                height: None,
                fill_color: None,
                stroke_color: None,
            },
        )
        .unwrap();
        let saved = tauri::async_runtime::block_on(write_drawio_source_document(
            root_string.clone(),
            path_string.clone(),
            transformed.clone(),
            Some(opened.signature.clone()),
        ))
        .unwrap();
        let reopened = tauri::async_runtime::block_on(read_text_document(
            root_string.clone(),
            path_string.clone(),
            "drawio".into(),
            None,
        ))
        .unwrap();
        assert_eq!(reopened.signature, saved.signature);
        assert!(reopened.content.contains("Desktop reopen"));
        assert!(analyze_source(&reopened.content).valid);

        let stale = tauri::async_runtime::block_on(write_drawio_source_document(
            root_string,
            path_string,
            transformed,
            Some(opened.signature),
        ))
        .unwrap_err();
        assert_eq!(stale.code, "external-modified");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn external_drawio_requires_authorization_and_preserves_conflicting_sources() {
        let root = std::env::temp_dir().join(format!(
            "longedit-external-drawio-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("external.drawio");
        let original = include_str!("../../tests/fixtures/formats/drawio-uncompressed.drawio");
        fs::write(&path, original).unwrap();
        let path_string = path.to_string_lossy().into_owned();
        let access = ExternalFileAccess::default();

        let unauthorized = tauri::async_runtime::block_on(
            write_external_drawio_source_document_with_access(
                path_string.clone(),
                original.into(),
                None,
                &access,
            ),
        )
        .unwrap_err();
        assert_eq!(unauthorized.code, "external-not-authorized");

        access.authorize_editable(&path).unwrap();
        let opened = crate::formats::text::read_text_snapshot(&path).unwrap();
        let transformed = transform_source(
            &opened.content,
            &DrawioCellPatch {
                page_id: "page-1".into(),
                cell_id: "node-a".into(),
                label: Some("External saved".into()),
                x: None,
                y: None,
                width: None,
                height: None,
                fill_color: None,
                stroke_color: None,
            },
        )
        .unwrap();
        let saved = tauri::async_runtime::block_on(
            write_external_drawio_source_document_with_access(
                path_string.clone(),
                transformed.clone(),
                Some(opened.signature),
                &access,
            ),
        )
        .unwrap();
        assert!(fs::read_to_string(&path).unwrap().contains("External saved"));

        fs::write(&path, original).unwrap();
        let stale = tauri::async_runtime::block_on(
            write_external_drawio_source_document_with_access(
                path_string,
                transformed,
                Some(saved.signature),
                &access,
            ),
        )
        .unwrap_err();
        assert_eq!(stale.code, "external-modified");
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }
}
