use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub const EDITABLE_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp"];
pub const MAX_IMAGE_BYTES: usize = 100 * 1024 * 1024;
const MAX_IMAGE_EDGE: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 50_000_000;
const MAX_IMAGE_ALLOCATION: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RasterImageTransform {
    #[serde(default)]
    pub quarter_turns: u8,
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RasterImageTransformResult {
    pub source_width: u32,
    pub source_height: u32,
    pub output_width: u32,
    pub output_height: u32,
    pub output_bytes: Vec<u8>,
    pub output_digest: String,
    pub output_mime_type: String,
}

pub fn inspect_raster_image(
    source: &[u8],
    source_extension: &str,
) -> Result<(u32, u32, String), String> {
    let decoded = decode_image(source, source_extension)?;
    Ok((
        decoded.width(),
        decoded.height(),
        format!("{:x}", Sha256::digest(source)),
    ))
}

fn checked_dimensions(width: u32, height: u32, label: &str) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err(format!("{label}尺寸必须大于 0"));
    }
    if width > MAX_IMAGE_EDGE
        || height > MAX_IMAGE_EDGE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(format!(
            "{label}超过安全处理上限（最长边 {MAX_IMAGE_EDGE} px、最多 {MAX_IMAGE_PIXELS} 像素）"
        ));
    }
    Ok(())
}

fn image_format(extension: &str) -> Result<(ImageFormat, &'static str), String> {
    match extension.to_ascii_lowercase().as_str() {
        "png" => Ok((ImageFormat::Png, "image/png")),
        "jpg" | "jpeg" => Ok((ImageFormat::Jpeg, "image/jpeg")),
        "webp" => Ok((ImageFormat::WebP, "image/webp")),
        "bmp" => Ok((ImageFormat::Bmp, "image/bmp")),
        _ => Err("图片另存仅支持 PNG、JPEG、WebP 与 BMP".into()),
    }
}

fn decode_image(source: &[u8], source_extension: &str) -> Result<DynamicImage, String> {
    if source.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 100 MiB 安全编辑上限".into());
    }
    let (format, _) = image_format(source_extension)?;
    let mut reader = ImageReader::with_format(Cursor::new(source), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_EDGE);
    limits.max_image_height = Some(MAX_IMAGE_EDGE);
    limits.max_alloc = Some(MAX_IMAGE_ALLOCATION);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|error| format!("无法解码图片或图片超过安全资源上限: {error}"))?;
    checked_dimensions(decoded.width(), decoded.height(), "源图片")?;
    Ok(decoded)
}

pub fn transform_raster_image(
    source: &[u8],
    source_extension: &str,
    output_extension: &str,
    transform: &RasterImageTransform,
) -> Result<RasterImageTransformResult, String> {
    let decoded = decode_image(source, source_extension)?;
    let (source_width, source_height) = decoded.dimensions();
    let mut output = match transform.quarter_turns % 4 {
        0 => decoded,
        1 => decoded.rotate90(),
        2 => decoded.rotate180(),
        _ => decoded.rotate270(),
    };
    if transform.flip_horizontal {
        output = output.fliph();
    }
    if transform.flip_vertical {
        output = output.flipv();
    }
    match (transform.width, transform.height) {
        (None, None) => {}
        (Some(width), Some(height)) => {
            checked_dimensions(width, height, "输出图片")?;
            output = output.resize_exact(width, height, FilterType::Lanczos3);
        }
        _ => return Err("缩放时必须同时提供宽度和高度".into()),
    }
    checked_dimensions(output.width(), output.height(), "输出图片")?;
    let (format, output_mime_type) = image_format(output_extension)?;
    let mut output_bytes = Vec::new();
    output
        .write_to(&mut Cursor::new(&mut output_bytes), format)
        .map_err(|error| format!("无法编码目标图片: {error}"))?;
    if output_bytes.len() > MAX_IMAGE_BYTES {
        return Err("变换后的图片超过 100 MiB 可靠另存上限".into());
    }
    let verification = decode_image(&output_bytes, output_extension)?;
    if verification.dimensions() != output.dimensions() {
        return Err("目标图片结构复读尺寸与隔离输出不一致".into());
    }
    Ok(RasterImageTransformResult {
        source_width,
        source_height,
        output_width: output.width(),
        output_height: output.height(),
        output_digest: format!("{:x}", Sha256::digest(&output_bytes)),
        output_mime_type: output_mime_type.into(),
        output_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn fixture_png() -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_fn(2, 3, |x, y| {
            Rgba([(x * 80) as u8, (y * 60) as u8, 120, 255])
        }));
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn rotates_flips_resizes_and_reopens_output() {
        let result = transform_raster_image(
            &fixture_png(),
            "png",
            "webp",
            &RasterImageTransform {
                quarter_turns: 1,
                flip_horizontal: true,
                flip_vertical: false,
                width: Some(12),
                height: Some(8),
            },
        )
        .unwrap();
        assert_eq!((result.source_width, result.source_height), (2, 3));
        assert_eq!((result.output_width, result.output_height), (12, 8));
        assert_eq!(result.output_mime_type, "image/webp");
        assert!(!result.output_digest.is_empty());
        assert_eq!(
            image::load_from_memory_with_format(&result.output_bytes, ImageFormat::WebP)
                .unwrap()
                .dimensions(),
            (12, 8)
        );
    }

    #[test]
    fn rejects_partial_and_unsafe_resize_dimensions() {
        let source = fixture_png();
        let partial = RasterImageTransform {
            quarter_turns: 0,
            flip_horizontal: false,
            flip_vertical: false,
            width: Some(10),
            height: None,
        };
        assert!(transform_raster_image(&source, "png", "png", &partial).is_err());
        let unsafe_size = RasterImageTransform {
            width: Some(16_385),
            height: Some(1),
            ..partial
        };
        assert!(transform_raster_image(&source, "png", "png", &unsafe_size).is_err());
    }

    #[test]
    fn rejects_preview_only_and_unknown_output_formats() {
        let source = fixture_png();
        let unchanged = RasterImageTransform {
            quarter_turns: 0,
            flip_horizontal: false,
            flip_vertical: false,
            width: None,
            height: None,
        };
        assert!(transform_raster_image(&source, "gif", "png", &unchanged).is_err());
        assert!(transform_raster_image(&source, "png", "avif", &unchanged).is_err());
    }
}
