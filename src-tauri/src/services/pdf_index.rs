use crate::formats::pdf_annotations::{
    validate_pdf_annotations, PdfAnnotationDocument, MAX_ANNOTATION_FILE_BYTES,
};
use crate::formats::pdf_ocr::{validate_pdf_ocr, PdfOcrDocument, MAX_OCR_SIDECAR_BYTES};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;

const MAX_PDF_INDEX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EXTRACTED_CHARS: usize = 2_000_000;
const MAX_CACHED_PDFS: usize = 24;

#[derive(Clone, Debug)]
pub struct IndexedPdfAnnotation {
    pub id: String,
    pub page: u32,
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct IndexedPdfOcrPage {
    pub page: u32,
    pub text: String,
}

#[derive(Clone, Debug, Default)]
pub struct PdfKnowledgeIndex {
    pub pages: Vec<String>,
    pub ocr_pages: Vec<IndexedPdfOcrPage>,
    pub annotations: Vec<IndexedPdfAnnotation>,
    pub extraction_failed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FileSignature {
    size: u64,
    modified_nanos: u128,
    annotation_size: u64,
    annotation_modified_nanos: u128,
    ocr_size: u64,
    ocr_modified_nanos: u128,
}

#[derive(Clone)]
struct CacheEntry {
    signature: FileSignature,
    index: PdfKnowledgeIndex,
}

static PDF_INDEX_CACHE: LazyLock<Mutex<HashMap<PathBuf, CacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn sidecar_path(pdf_path: &Path) -> Option<PathBuf> {
    let name = pdf_path.file_name()?.to_str()?;
    Some(pdf_path.with_file_name(format!("{}.annotations.json", name)))
}

fn ocr_sidecar_path(pdf_path: &Path) -> Option<PathBuf> {
    let name = pdf_path.file_name()?.to_str()?;
    Some(pdf_path.with_file_name(format!("{}.ocr.json", name)))
}

fn metadata_signature(path: &Path) -> (u64, u128) {
    path.metadata()
        .map(|metadata| {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            (metadata.len(), modified)
        })
        .unwrap_or((0, 0))
}

fn signature(pdf_path: &Path) -> FileSignature {
    let (size, modified_nanos) = metadata_signature(pdf_path);
    let (annotation_size, annotation_modified_nanos) = sidecar_path(pdf_path)
        .map(|path| metadata_signature(&path))
        .unwrap_or((0, 0));
    let (ocr_size, ocr_modified_nanos) = ocr_sidecar_path(pdf_path)
        .map(|path| metadata_signature(&path))
        .unwrap_or((0, 0));
    FileSignature {
        size,
        modified_nanos,
        annotation_size,
        annotation_modified_nanos,
        ocr_size,
        ocr_modified_nanos,
    }
}

fn load_ocr_pages(pdf_path: &Path) -> Vec<IndexedPdfOcrPage> {
    let Some(path) = ocr_sidecar_path(pdf_path) else {
        return Vec::new();
    };
    if path
        .metadata()
        .map(|value| value.len() > MAX_OCR_SIDECAR_BYTES)
        .unwrap_or(true)
    {
        return Vec::new();
    }
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(document) = serde_json::from_str::<PdfOcrDocument>(&content) else {
        return Vec::new();
    };
    if validate_pdf_ocr(&document).is_err() {
        return Vec::new();
    }
    if document.source.pdf_file != pdf_path.file_name().unwrap_or_default().to_string_lossy() {
        return Vec::new();
    }
    document
        .pages
        .into_iter()
        .filter(|page| !page.text.trim().is_empty())
        .map(|page| IndexedPdfOcrPage {
            page: page.page,
            text: page.text,
        })
        .collect()
}

fn trim_pages(pages: Vec<String>) -> Vec<String> {
    let mut remaining = MAX_EXTRACTED_CHARS;
    pages
        .into_iter()
        .map(|page| {
            if remaining == 0 {
                return String::new();
            }
            let char_count = page.chars().count();
            let value = if char_count > remaining {
                page.chars().take(remaining).collect()
            } else {
                page
            };
            remaining = remaining.saturating_sub(char_count);
            value
        })
        .collect()
}

fn load_annotations(pdf_path: &Path) -> Vec<IndexedPdfAnnotation> {
    let Some(path) = sidecar_path(pdf_path) else {
        return Vec::new();
    };
    if path
        .metadata()
        .map(|value| value.len() > MAX_ANNOTATION_FILE_BYTES)
        .unwrap_or(true)
    {
        return Vec::new();
    }
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(document) = serde_json::from_str::<PdfAnnotationDocument>(&content) else {
        return Vec::new();
    };
    if validate_pdf_annotations(&document).is_err() {
        return Vec::new();
    }
    document
        .annotations
        .into_iter()
        .map(|annotation| IndexedPdfAnnotation {
            id: annotation.id,
            page: annotation.page,
            text: format!("{} {}", annotation.quote, annotation.comment)
                .trim()
                .to_string(),
        })
        .collect()
}

pub fn load_pdf_index(pdf_path: &Path) -> PdfKnowledgeIndex {
    let current_signature = signature(pdf_path);
    if let Ok(cache) = PDF_INDEX_CACHE.lock() {
        if let Some(entry) = cache.get(pdf_path) {
            if entry.signature == current_signature {
                return entry.index.clone();
            }
        }
    }

    let (pages, mut extraction_failed) = if current_signature.size > MAX_PDF_INDEX_BYTES {
        (Vec::new(), true)
    } else {
        match pdf_extract::extract_text_by_pages(pdf_path) {
            Ok(pages) => (trim_pages(pages), false),
            Err(_) => (Vec::new(), true),
        }
    };
    let ocr_pages = load_ocr_pages(pdf_path);
    if !ocr_pages.is_empty() {
        extraction_failed = false;
    }
    let index = PdfKnowledgeIndex {
        pages,
        ocr_pages,
        annotations: load_annotations(pdf_path),
        extraction_failed,
    };
    if let Ok(mut cache) = PDF_INDEX_CACHE.lock() {
        if cache.len() >= MAX_CACHED_PDFS && !cache.contains_key(pdf_path) {
            if let Some(oldest) = cache.keys().next().cloned() {
                cache.remove(&oldest);
            }
        }
        cache.insert(
            pdf_path.to_path_buf(),
            CacheEntry {
                signature: current_signature,
                index: index.clone(),
            },
        );
    }
    index
}

#[cfg(test)]
pub fn clear_pdf_index_cache() {
    if let Ok(mut cache) = PDF_INDEX_CACHE.lock() {
        cache.clear();
    }
}
