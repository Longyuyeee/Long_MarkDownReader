use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Limits};
use lopdf::xref::XrefType;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Cursor;

pub const MAX_PDF_REDACTION_SOURCE_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_PDF_REDACTION_PAGES: usize = 64;
pub const MAX_PDF_REDACTION_DIMENSION: u32 = 4096;
pub const MAX_PDF_REDACTION_TOTAL_PIXELS: u64 = 120_000_000;
pub const MAX_PDF_REDACTION_RECTS: usize = 256;
pub const MAX_PDF_REDACTION_RASTER_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_PDF_REDACTION_OUTPUT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRedactionRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub color: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRasterizedRedactionPage {
    pub page: u32,
    pub png_bytes: Vec<u8>,
    pub redactions: Vec<PdfRedactionRect>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRedactionCopyReport {
    pub status: String,
    pub engine: String,
    pub blockers: Vec<String>,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub source_pages: usize,
    pub output_pages: usize,
    pub redaction_rects: usize,
    pub raster_input_bytes: usize,
    pub rendered_pixels: u64,
    pub output_bytes: usize,
    pub redaction_pixels_verified: bool,
    pub structural_reparse_verified: bool,
    pub text_absence_verified: bool,
    pub page_geometry_verified: bool,
    pub source_object_isolation_verified: bool,
}

#[derive(Clone)]
struct PreparedRasterPage {
    page_width_points: f32,
    page_height_points: f32,
    width_pixels: u32,
    height_pixels: u32,
    jpeg_bytes: Vec<u8>,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn object_dictionary(object: &Object) -> Option<&Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Stream(stream) => Some(&stream.dict),
        _ => None,
    }
}

fn has_digital_signature(document: &Document) -> bool {
    document.objects.values().any(|object| {
        object_dictionary(object).is_some_and(|dictionary| {
            dictionary
                .get(b"Type")
                .and_then(Object::as_name)
                .is_ok_and(|value| value == b"Sig")
                || dictionary
                    .get(b"FT")
                    .and_then(Object::as_name)
                    .is_ok_and(|value| value == b"Sig")
        })
    }) || document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"Perms"))
}

fn inherited_page_value(document: &Document, page_id: ObjectId, key: &[u8]) -> Option<Object> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        let dictionary = document.get_dictionary(current).ok()?;
        if let Ok(value) = dictionary.get(key) {
            return Some(value.clone());
        }
        current = dictionary
            .get(b"Parent")
            .and_then(Object::as_reference)
            .ok()?;
    }
    None
}

fn object_number(value: &Object) -> Option<f32> {
    match value {
        Object::Integer(value) => Some(*value as f32),
        Object::Real(value) => Some(*value),
        _ => None,
    }
}

fn page_display_size(document: &Document, page_id: ObjectId) -> Result<(f32, f32), String> {
    let page_box = inherited_page_value(document, page_id, b"CropBox")
        .or_else(|| inherited_page_value(document, page_id, b"MediaBox"))
        .ok_or("PDF 页面缺少 MediaBox/CropBox")?;
    let (_, resolved) = document
        .dereference(&page_box)
        .map_err(|_| "PDF 页面框引用无效")?;
    let values = resolved.as_array().map_err(|_| "PDF 页面框格式无效")?;
    if values.len() != 4 {
        return Err("PDF 页面框必须包含四个坐标".into());
    }
    let width = (object_number(&values[2]).ok_or("PDF 页面框坐标无效")?
        - object_number(&values[0]).ok_or("PDF 页面框坐标无效")?)
    .abs();
    let height = (object_number(&values[3]).ok_or("PDF 页面框坐标无效")?
        - object_number(&values[1]).ok_or("PDF 页面框坐标无效")?)
    .abs();
    if !width.is_finite()
        || !height.is_finite()
        || !(1.0..=20_000.0).contains(&width)
        || !(1.0..=20_000.0).contains(&height)
    {
        return Err("PDF 页面尺寸超出可靠栅格范围".into());
    }
    let rotation = inherited_page_value(document, page_id, b"Rotate")
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(0);
    let rotation = ((rotation % 360) + 360) % 360;
    if matches!(rotation, 90 | 270) {
        Ok((height, width))
    } else if matches!(rotation, 0 | 180) {
        Ok((width, height))
    } else {
        Err("PDF 页面旋转不是 90 度倍数".into())
    }
}

fn redaction_pixel_bounds(
    rect: &PdfRedactionRect,
    width: u32,
    height: u32,
) -> Result<(u32, u32, u32, u32, [u8; 3]), String> {
    if ![rect.x, rect.y, rect.width, rect.height]
        .into_iter()
        .all(f32::is_finite)
        || rect.x < 0.0
        || rect.y < 0.0
        || rect.width <= 0.0
        || rect.height <= 0.0
        || rect.x + rect.width > 1.000_001
        || rect.y + rect.height > 1.000_001
    {
        return Err("永久脱敏矩形必须是页内有限规范坐标".into());
    }
    let x0 = (rect.x * width as f32).ceil() as u32;
    let y0 = (rect.y * height as f32).ceil() as u32;
    let x1 = ((rect.x + rect.width) * width as f32).floor() as u32;
    let y1 = ((rect.y + rect.height) * height as f32).floor() as u32;
    if x1 <= x0 || y1 <= y0 || x1 > width || y1 > height {
        return Err("永久脱敏矩形小于一个可验证像素或超出页面".into());
    }
    let color = match rect.color.as_str() {
        "black" => [0, 0, 0],
        "white" => [255, 255, 255],
        _ => return Err("永久脱敏颜色只允许完全不透明的黑或白".into()),
    };
    Ok((x0, y0, x1, y1, color))
}

fn prepare_raster_page(
    source: &Document,
    page_id: ObjectId,
    input: &PdfRasterizedRedactionPage,
) -> Result<PreparedRasterPage, String> {
    if !input.png_bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(format!("第 {} 页栅格输入必须是 PNG", input.page));
    }
    let mut reader = ImageReader::with_format(Cursor::new(&input.png_bytes), ImageFormat::Png);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_PDF_REDACTION_DIMENSION);
    limits.max_image_height = Some(MAX_PDF_REDACTION_DIMENSION);
    limits.max_alloc = Some(72 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|error| format!("第 {} 页 PNG 解码失败或超出资源上限: {error}", input.page))?;
    let (width, height) = decoded.dimensions();
    if width == 0
        || height == 0
        || width > MAX_PDF_REDACTION_DIMENSION
        || height > MAX_PDF_REDACTION_DIMENSION
    {
        return Err(format!("第 {} 页栅格尺寸超出 4096 像素上限", input.page));
    }
    let rgba = decoded.to_rgba8();
    if rgba.pixels().any(|pixel| pixel.0[3] != 255) {
        return Err(format!("第 {} 页栅格画布不是完全不透明", input.page));
    }
    for rect in &input.redactions {
        let (x0, y0, x1, y1, expected) = redaction_pixel_bounds(rect, width, height)?;
        for y in y0..y1 {
            for x in x0..x1 {
                let pixel = rgba.get_pixel(x, y).0;
                if pixel[..3] != expected {
                    return Err(format!("第 {} 页脱敏矩形尚未以纯色烧入像素", input.page));
                }
            }
        }
    }
    let (page_width_points, page_height_points) = page_display_size(source, page_id)?;
    let raster_ratio = width as f64 / height as f64;
    let page_ratio = page_width_points as f64 / page_height_points as f64;
    if ((raster_ratio / page_ratio) - 1.0).abs() > 0.01 {
        return Err(format!("第 {} 页栅格宽高比与 PDF 页面不一致", input.page));
    }
    let rgb = DynamicImage::ImageRgba8(rgba).to_rgb8();
    let mut jpeg_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg_bytes, 90)
        .encode_image(&DynamicImage::ImageRgb8(rgb))
        .map_err(|error| format!("第 {} 页 JPEG 编码失败: {error}", input.page))?;
    Ok(PreparedRasterPage {
        page_width_points,
        page_height_points,
        width_pixels: width,
        height_pixels: height,
        jpeg_bytes,
    })
}

fn build_fresh_image_pdf(pages: &[PreparedRasterPage]) -> Result<Vec<u8>, String> {
    let mut output = Document::with_version("1.7");
    output.reference_table.cross_reference_type = XrefType::CrossReferenceTable;
    let pages_id = output.new_object_id();
    let mut page_ids = Vec::with_capacity(pages.len());
    for page in pages {
        let image_id = output.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject", "Subtype" => "Image",
                "Width" => page.width_pixels as i64, "Height" => page.height_pixels as i64,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8,
                "Filter" => "DCTDecode"
            },
            page.jpeg_bytes.clone(),
        ));
        let content = format!(
            "q {} 0 0 {} 0 0 cm /Im0 Do Q",
            page.page_width_points, page.page_height_points
        );
        let content_id = output.add_object(Stream::new(Dictionary::new(), content.into_bytes()));
        let page_id = output.add_object(dictionary! {
            "Type" => "Page", "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(page.page_width_points), Object::Real(page.page_height_points)],
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => Object::Reference(image_id) } },
            "Contents" => Object::Reference(content_id)
        });
        page_ids.push(page_id);
    }
    output.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => page_ids.len() as i64
        }),
    );
    let catalog_id = output.add_object(dictionary! {
        "Type" => "Catalog", "Pages" => Object::Reference(pages_id)
    });
    output.trailer.set("Root", Object::Reference(catalog_id));
    let mut bytes = Vec::new();
    output
        .save_to(&mut bytes)
        .map_err(|error| format!("永久脱敏 PDF 生成失败: {error}"))?;
    Ok(bytes)
}

fn verify_fresh_image_pdf(
    bytes: &[u8],
    expected_pages: &[PreparedRasterPage],
) -> Result<(bool, bool, bool, bool), String> {
    let document =
        Document::load_mem(bytes).map_err(|error| format!("永久脱敏 PDF 结构复读失败: {error}"))?;
    let pages = document.get_pages();
    let expected_objects = expected_pages.len() * 3 + 2;
    if pages.len() != expected_pages.len() || document.objects.len() != expected_objects {
        return Err(format!(
            "永久脱敏 PDF 对象图不符合白名单数量：预期 {expected_objects}，实际 {}",
            document.objects.len()
        ));
    }
    let catalog = document
        .catalog()
        .map_err(|_| "永久脱敏 PDF Catalog 无效")?;
    for forbidden in [
        b"AcroForm".as_slice(),
        b"Names",
        b"Outlines",
        b"OCProperties",
        b"StructTreeRoot",
        b"Metadata",
        b"OpenAction",
        b"AA",
    ] {
        if catalog.has(forbidden) {
            return Err("永久脱敏 PDF Catalog 含非白名单对象".into());
        }
    }
    if document.trailer.has(b"Info")
        || document.trailer.has(b"Encrypt")
        || document.trailer.has(b"Prev")
    {
        return Err("永久脱敏 PDF Trailer 含源文档信息".into());
    }
    let mut geometry_verified = true;
    for ((_, page_id), expected) in pages.iter().zip(expected_pages) {
        let page = document
            .get_dictionary(*page_id)
            .map_err(|_| "永久脱敏 PDF 页面对象无效")?;
        if page.has(b"Annots") || page.has(b"Metadata") || page.has(b"AA") {
            return Err("永久脱敏 PDF 页面含非白名单交互对象".into());
        }
        let resources = page
            .get(b"Resources")
            .and_then(Object::as_dict)
            .map_err(|_| "永久脱敏 PDF 页面资源无效")?;
        let xobjects = resources
            .get(b"XObject")
            .and_then(Object::as_dict)
            .map_err(|_| "永久脱敏 PDF 图片资源缺失")?;
        if xobjects.len() != 1 || !xobjects.has(b"Im0") {
            return Err("永久脱敏 PDF 每页必须恰好包含一张图片".into());
        }
        let media = page
            .get(b"MediaBox")
            .and_then(Object::as_array)
            .map_err(|_| "永久脱敏 PDF 页面尺寸无效")?;
        geometry_verified &= media.len() == 4
            && object_number(&media[2])
                .is_some_and(|value| (value - expected.page_width_points).abs() <= 0.01)
            && object_number(&media[3])
                .is_some_and(|value| (value - expected.page_height_points).abs() <= 0.01);
    }
    if !geometry_verified {
        return Err("永久脱敏 PDF 页面几何复读不一致".into());
    }
    let extracted = pdf_extract::extract_text_from_mem_by_pages(bytes)
        .map_err(|error| format!("永久脱敏 PDF 文本缺失复读失败: {error}"))?;
    let text_absent = extracted.iter().all(|page| page.trim().is_empty());
    if !text_absent {
        return Err("永久脱敏 PDF 仍可提取文本".into());
    }
    Ok((true, text_absent, geometry_verified, true))
}

pub fn build_pdf_redaction_copy(
    source: &[u8],
    expected_source_digest: &str,
    pages: &[PdfRasterizedRedactionPage],
) -> Result<(PdfRedactionCopyReport, Option<Vec<u8>>), String> {
    if source.len() > MAX_PDF_REDACTION_SOURCE_BYTES {
        return Err("永久脱敏目前只支持不超过 128 MB 的 PDF".into());
    }
    let source_digest = digest(source);
    if source_digest != expected_source_digest.trim().to_ascii_lowercase() {
        return Err("PDF 内容已变化，请重新打开后再生成脱敏副本".into());
    }
    let source_document =
        Document::load_mem(source).map_err(|error| format!("PDF 结构解析失败: {error}"))?;
    let source_pages = source_document.get_pages();
    if source_pages.is_empty() || source_pages.len() > MAX_PDF_REDACTION_PAGES {
        return Err("永久脱敏目前只支持 1～64 页 PDF".into());
    }
    let blockers = [
        source_document
            .is_encrypted()
            .then_some("encrypted_pdf_unverified"),
        has_digital_signature(&source_document).then_some("digital_signature_unverified"),
    ]
    .into_iter()
    .flatten()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let blocked_report = |blockers: Vec<String>| PdfRedactionCopyReport {
        status: "blocked".into(),
        engine: "PDF.js opaque raster input + image 0.25.10 + lopdf 0.42.0".into(),
        blockers,
        source_digest: source_digest.clone(),
        output_digest: None,
        source_pages: source_pages.len(),
        output_pages: 0,
        redaction_rects: 0,
        raster_input_bytes: 0,
        rendered_pixels: 0,
        output_bytes: 0,
        redaction_pixels_verified: false,
        structural_reparse_verified: false,
        text_absence_verified: false,
        page_geometry_verified: false,
        source_object_isolation_verified: false,
    };
    if !blockers.is_empty() {
        return Ok((blocked_report(blockers), None));
    }
    if pages.len() != source_pages.len() {
        return Err("永久脱敏必须提交全部页面的栅格结果".into());
    }
    let redaction_rects = pages
        .iter()
        .map(|page| page.redactions.len())
        .sum::<usize>();
    if !(1..=MAX_PDF_REDACTION_RECTS).contains(&redaction_rects) {
        return Err("永久脱敏矩形必须在 1～256 个之间".into());
    }
    let raster_input_bytes = pages.iter().map(|page| page.png_bytes.len()).sum::<usize>();
    if raster_input_bytes > MAX_PDF_REDACTION_RASTER_BYTES {
        return Err("永久脱敏页面栅格输入超过 256 MB".into());
    }
    let mut prepared = Vec::with_capacity(pages.len());
    let mut rendered_pixels = 0_u64;
    for (index, ((source_page, page_id), input)) in source_pages.iter().zip(pages).enumerate() {
        let expected_page = index as u32 + 1;
        if *source_page != expected_page || input.page != expected_page {
            return Err("永久脱敏页面必须从 1 开始连续且与源 PDF 顺序一致".into());
        }
        let page = prepare_raster_page(&source_document, *page_id, input)?;
        rendered_pixels = rendered_pixels
            .checked_add(page.width_pixels as u64 * page.height_pixels as u64)
            .ok_or("永久脱敏总像素预算溢出")?;
        if rendered_pixels > MAX_PDF_REDACTION_TOTAL_PIXELS {
            return Err("永久脱敏页面总像素超过 1.2 亿上限".into());
        }
        prepared.push(page);
    }
    let output = build_fresh_image_pdf(&prepared)?;
    if output.len() > MAX_PDF_REDACTION_OUTPUT_BYTES {
        return Err("永久脱敏 PDF 输出超过 256 MB".into());
    }
    let (
        structural_reparse_verified,
        text_absence_verified,
        page_geometry_verified,
        source_object_isolation_verified,
    ) = verify_fresh_image_pdf(&output, &prepared)?;
    let report = PdfRedactionCopyReport {
        status: "isolated_verified".into(),
        engine: "PDF.js opaque raster input + image 0.25.10 + lopdf 0.42.0".into(),
        blockers: Vec::new(),
        source_digest,
        output_digest: Some(digest(&output)),
        source_pages: source_pages.len(),
        output_pages: prepared.len(),
        redaction_rects,
        raster_input_bytes,
        rendered_pixels,
        output_bytes: output.len(),
        redaction_pixels_verified: true,
        structural_reparse_verified,
        text_absence_verified,
        page_geometry_verified,
        source_object_isolation_verified,
    };
    Ok((report, Some(output)))
}

pub fn verify_pdf_redaction_output(bytes: &[u8], expected_pages: usize) -> Result<(), String> {
    let document =
        Document::load_mem(bytes).map_err(|error| format!("脱敏目标结构复读失败: {error}"))?;
    if document.get_pages().len() != expected_pages {
        return Err("脱敏目标重开页数不一致".into());
    }
    if document.objects.len() != expected_pages * 3 + 2 {
        return Err("脱敏目标重开对象图不符合白名单".into());
    }
    let extracted = pdf_extract::extract_text_from_mem_by_pages(bytes)
        .map_err(|error| format!("脱敏目标文本复读失败: {error}"))?;
    if extracted.iter().any(|page| !page.trim().is_empty()) {
        return Err("脱敏目标重开后仍可提取文本".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, ImageFormat, Rgba};

    const SECRET: &str = "P1B3_SECRET_MARKER";

    fn source_fixture(signature: bool) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica"
        });
        let mut page_ids = Vec::new();
        for page_number in 1..=2 {
            let content = format!("BT /F1 12 Tf 20 80 Td ({SECRET} {page_number}) Tj ET");
            let content_id =
                document.add_object(Stream::new(Dictionary::new(), content.into_bytes()));
            let page_id = document.add_object(dictionary! {
                "Type" => "Page", "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 200.into(), 100.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => Object::Reference(font_id) } },
                "Contents" => Object::Reference(content_id)
            });
            page_ids.push(page_id);
        }
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(), "Count" => 2
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog", "Pages" => Object::Reference(pages_id)
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let info_id =
            document.add_object(dictionary! { "Subject" => Object::string_literal(SECRET) });
        document.trailer.set("Info", Object::Reference(info_id));
        if signature {
            document.add_object(dictionary! { "Type" => "Sig" });
        }
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn raster_page(page: u32, alpha: u8, burned: bool) -> PdfRasterizedRedactionPage {
        let image = ImageBuffer::from_fn(400, 200, |x, y| {
            if burned && (80..200).contains(&x) && (40..100).contains(&y) {
                Rgba([0, 0, 0, alpha])
            } else {
                Rgba([245, 245, 245, alpha])
            }
        });
        let mut png_bytes = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .unwrap();
        PdfRasterizedRedactionPage {
            page,
            png_bytes,
            redactions: (page == 1)
                .then(|| {
                    vec![PdfRedactionRect {
                        x: 0.2,
                        y: 0.2,
                        width: 0.3,
                        height: 0.3,
                        color: "black".into(),
                    }]
                })
                .unwrap_or_default(),
        }
    }

    #[test]
    fn builds_fresh_image_only_pdf_and_removes_source_markers() {
        let source = source_fixture(false);
        assert!(pdf_extract::extract_text_from_mem(&source)
            .unwrap()
            .contains(SECRET));
        let pages = [raster_page(1, 255, true), raster_page(2, 255, false)];
        let (report, output) = build_pdf_redaction_copy(&source, &digest(&source), &pages).unwrap();
        let output = output.unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.output_pages, 2);
        assert_eq!(report.redaction_rects, 1);
        assert!(report.redaction_pixels_verified);
        assert!(report.structural_reparse_verified);
        assert!(report.text_absence_verified);
        assert!(report.page_geometry_verified);
        assert!(report.source_object_isolation_verified);
        assert!(!output
            .windows(SECRET.len())
            .any(|window| window == SECRET.as_bytes()));
        assert!(pdf_extract::extract_text_from_mem(&output)
            .unwrap()
            .trim()
            .is_empty());
        verify_pdf_redaction_output(&output, 2).unwrap();
    }

    #[test]
    fn blocks_incomplete_transparent_or_unburned_rasters_and_signatures() {
        let source = source_fixture(false);
        let source_digest = digest(&source);
        assert!(
            build_pdf_redaction_copy(&source, &source_digest, &[raster_page(1, 255, true)])
                .is_err()
        );
        assert!(build_pdf_redaction_copy(
            &source,
            &source_digest,
            &[raster_page(1, 180, true), raster_page(2, 255, false)]
        )
        .is_err());
        assert!(build_pdf_redaction_copy(
            &source,
            &source_digest,
            &[raster_page(1, 255, false), raster_page(2, 255, false)]
        )
        .is_err());
        let signed = source_fixture(true);
        let (report, output) = build_pdf_redaction_copy(
            &signed,
            &digest(&signed),
            &[raster_page(1, 255, true), raster_page(2, 255, false)],
        )
        .unwrap();
        assert_eq!(report.status, "blocked");
        assert!(report
            .blockers
            .contains(&"digital_signature_unverified".into()));
        assert!(output.is_none());
    }
}
