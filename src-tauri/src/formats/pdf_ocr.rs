use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const MAX_OCR_SIDECAR_BYTES: u64 = 24 * 1024 * 1024;
pub const MAX_OCR_PAGE_CHARS: usize = 500_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrSource {
    pub pdf_file: String,
    pub size: u64,
    pub modified_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrProvider {
    pub id: String,
    pub version: String,
    pub languages: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrPage {
    pub page: u32,
    pub text: String,
    pub confidence: f64,
    pub processed_at: u64,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrDocument {
    pub schema_version: u32,
    pub source: PdfOcrSource,
    pub provider: PdfOcrProvider,
    pub updated_at: u64,
    pub pages: Vec<PdfOcrPage>,
}

impl PdfOcrDocument {
    pub fn empty(source: PdfOcrSource) -> Self {
        Self {
            schema_version: 1,
            source,
            provider: PdfOcrProvider {
                id: "tesseract-wasm".into(),
                version: "7.0.0".into(),
                languages: vec!["chi_sim".into(), "eng".into()],
            },
            updated_at: 0,
            pages: Vec::new(),
        }
    }
}

pub fn validate_pdf_ocr(document: &PdfOcrDocument) -> Result<(), String> {
    if document.schema_version != 1 {
        return Err("不支持的 PDF OCR sidecar 版本".into());
    }
    if document.source.pdf_file.is_empty() || document.source.pdf_file.len() > 255 {
        return Err("PDF OCR 源文件名无效".into());
    }
    if document.provider.id != "tesseract-wasm"
        || document.provider.version.len() > 64
        || document.provider.languages.is_empty()
        || document.provider.languages.len() > 8
    {
        return Err("PDF OCR provider 信息无效".into());
    }
    let mut pages = HashSet::new();
    for page in &document.pages {
        if page.page == 0 || !pages.insert(page.page) {
            return Err("PDF OCR 页码无效或重复".into());
        }
        if page.text.chars().count() > MAX_OCR_PAGE_CHARS {
            return Err(format!("PDF OCR 第 {} 页文本超过上限", page.page));
        }
        if !page.confidence.is_finite() || !(0.0..=100.0).contains(&page.confidence) {
            return Err(format!("PDF OCR 第 {} 页置信度无效", page.page));
        }
        if page.width == 0 || page.height == 0 || page.width > 12_000 || page.height > 12_000 {
            return Err(format!("PDF OCR 第 {} 页图像尺寸无效", page.page));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document() -> PdfOcrDocument {
        let mut document = PdfOcrDocument::empty(PdfOcrSource {
            pdf_file: "scan.pdf".into(),
            size: 100,
            modified_at: 10,
            fingerprint: Some("fingerprint".into()),
        });
        document.pages.push(PdfOcrPage {
            page: 1,
            text: "离线识别结果".into(),
            confidence: 92.5,
            processed_at: 20,
            width: 1200,
            height: 1600,
        });
        document
    }

    #[test]
    fn accepts_versioned_ocr_sidecar() {
        assert!(validate_pdf_ocr(&document()).is_ok());
    }

    #[test]
    fn rejects_duplicate_pages_and_invalid_confidence() {
        let mut duplicate = document();
        duplicate.pages.push(duplicate.pages[0].clone());
        assert!(validate_pdf_ocr(&duplicate).is_err());
        let mut confidence = document();
        confidence.pages[0].confidence = 101.0;
        assert!(validate_pdf_ocr(&confidence).is_err());
    }
}
