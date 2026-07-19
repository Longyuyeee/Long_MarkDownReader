use serde::{Deserialize, Serialize};

pub const PDF_ANNOTATION_SCHEMA_VERSION: u32 = 1;
pub const MAX_ANNOTATIONS: usize = 5_000;
pub const MAX_RECTS_PER_ANNOTATION: usize = 200;
pub const MAX_ANNOTATION_TEXT_CHARS: usize = 20_000;
pub const MAX_ANNOTATION_FILE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotationSource {
    pub pdf_file: String,
    pub size: u64,
    pub modified_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotationRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PdfAnnotationKind {
    Highlight,
    Area,
    Comment,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotation {
    pub id: String,
    pub kind: PdfAnnotationKind,
    pub page: u32,
    pub color: String,
    #[serde(default)]
    pub rects: Vec<PdfAnnotationRect>,
    #[serde(default)]
    pub quote: String,
    #[serde(default)]
    pub comment: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotationDocument {
    pub schema_version: u32,
    pub source: PdfAnnotationSource,
    #[serde(default)]
    pub annotations: Vec<PdfAnnotation>,
}

impl PdfAnnotationDocument {
    pub fn empty(source: PdfAnnotationSource) -> Self {
        Self {
            schema_version: PDF_ANNOTATION_SCHEMA_VERSION,
            source,
            annotations: Vec::new(),
        }
    }
}

pub fn validate_pdf_annotations(document: &PdfAnnotationDocument) -> Result<(), String> {
    if document.schema_version != PDF_ANNOTATION_SCHEMA_VERSION {
        return Err(format!("不支持的 PDF 批注版本 {}", document.schema_version));
    }
    if document.source.pdf_file.trim().is_empty() || document.source.pdf_file.chars().count() > 255
    {
        return Err("PDF 批注源文件名无效".into());
    }
    if document.annotations.len() > MAX_ANNOTATIONS {
        return Err(format!("PDF 批注数量超过 {} 条上限", MAX_ANNOTATIONS));
    }
    let mut ids = std::collections::HashSet::new();
    for annotation in &document.annotations {
        if annotation.id.trim().is_empty()
            || annotation.id.chars().count() > 128
            || !ids.insert(&annotation.id)
        {
            return Err("PDF 批注 ID 为空、过长或重复".into());
        }
        if annotation.page == 0 || annotation.page > 100_000 {
            return Err("PDF 批注页码无效".into());
        }
        if !matches!(
            annotation.color.as_str(),
            "yellow" | "green" | "pink" | "blue"
        ) {
            return Err("PDF 批注颜色无效".into());
        }
        if annotation.rects.len() > MAX_RECTS_PER_ANNOTATION {
            return Err("单条 PDF 批注的矩形数量过多".into());
        }
        if matches!(
            annotation.kind,
            PdfAnnotationKind::Highlight | PdfAnnotationKind::Area
        ) && annotation.rects.is_empty()
        {
            return Err("高亮或区域批注必须包含位置".into());
        }
        if matches!(annotation.kind, PdfAnnotationKind::Highlight)
            && annotation.quote.trim().is_empty()
        {
            return Err("文字高亮必须包含引用文本".into());
        }
        if annotation.quote.chars().count() > MAX_ANNOTATION_TEXT_CHARS
            || annotation.comment.chars().count() > MAX_ANNOTATION_TEXT_CHARS
        {
            return Err("PDF 批注文本超过长度上限".into());
        }
        if annotation.updated_at < annotation.created_at {
            return Err("PDF 批注更新时间早于创建时间".into());
        }
        for rect in &annotation.rects {
            let values = [rect.x, rect.y, rect.width, rect.height];
            if values.iter().any(|value| !value.is_finite())
                || rect.x < 0.0
                || rect.y < 0.0
                || rect.width <= 0.0
                || rect.height <= 0.0
                || rect.x + rect.width > 1.000_001
                || rect.y + rect.height > 1.000_001
            {
                return Err("PDF 批注包含无效的归一化坐标".into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_document() -> PdfAnnotationDocument {
        PdfAnnotationDocument {
            schema_version: 1,
            source: PdfAnnotationSource {
                pdf_file: "paper.pdf".into(),
                size: 100,
                modified_at: 1,
                fingerprint: Some("abc".into()),
            },
            annotations: vec![PdfAnnotation {
                id: "annotation-1".into(),
                kind: PdfAnnotationKind::Highlight,
                page: 1,
                color: "yellow".into(),
                rects: vec![PdfAnnotationRect {
                    x: 0.1,
                    y: 0.2,
                    width: 0.3,
                    height: 0.04,
                }],
                quote: "important text".into(),
                comment: String::new(),
                created_at: 10,
                updated_at: 10,
            }],
        }
    }

    #[test]
    fn accepts_versioned_normalized_annotations() {
        let fixture: PdfAnnotationDocument = serde_json::from_str(include_str!(
            "../../tests/fixtures/pdf/valid.annotations.json"
        ))
        .unwrap();
        assert!(validate_pdf_annotations(&fixture).is_ok());
    }

    #[test]
    fn rejects_invalid_coordinates_duplicate_ids_and_missing_quote() {
        let mut document = valid_document();
        document.annotations[0].rects[0].width = 2.0;
        assert!(validate_pdf_annotations(&document).is_err());
        let mut document = valid_document();
        document.annotations.push(document.annotations[0].clone());
        assert!(validate_pdf_annotations(&document).is_err());
        let mut document = valid_document();
        document.annotations[0].quote.clear();
        assert!(validate_pdf_annotations(&document).is_err());
    }
}
