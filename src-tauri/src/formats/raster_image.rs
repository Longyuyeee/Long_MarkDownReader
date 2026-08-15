use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, Limits};
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
pub struct RasterImageCrop {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

fn enabled_by_default() -> bool {
    true
}

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
    #[serde(default)]
    pub crop: Option<RasterImageCrop>,
    #[serde(default)]
    pub jpeg_quality: Option<u8>,
    #[serde(default = "enabled_by_default")]
    pub normalize_orientation: bool,
}

impl Default for RasterImageTransform {
    fn default() -> Self {
        Self {
            quarter_turns: 0,
            flip_horizontal: false,
            flip_vertical: false,
            width: None,
            height: None,
            crop: None,
            jpeg_quality: None,
            normalize_orientation: true,
        }
    }
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
    pub jpeg_quality: Option<u8>,
    pub orientation_normalized: bool,
    pub metadata_removed: bool,
}

pub fn inspect_raster_image(
    source: &[u8],
    source_extension: &str,
) -> Result<(u32, u32, String), String> {
    let (decoded, _) = decode_image(source, source_extension, true)?;
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

fn decode_image(
    source: &[u8],
    source_extension: &str,
    normalize_orientation: bool,
) -> Result<(DynamicImage, bool), String> {
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
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("无法解码图片或图片超过安全资源上限: {error}"))?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut decoded = DynamicImage::from_decoder(decoder)
        .map_err(|error| format!("无法解码图片像素: {error}"))?;
    let orientation_applied = normalize_orientation && orientation != Orientation::NoTransforms;
    if normalize_orientation {
        decoded.apply_orientation(orientation);
    }
    checked_dimensions(decoded.width(), decoded.height(), "源图片")?;
    Ok((decoded, orientation_applied))
}

pub fn transform_raster_image(
    source: &[u8],
    source_extension: &str,
    output_extension: &str,
    transform: &RasterImageTransform,
) -> Result<RasterImageTransformResult, String> {
    let (decoded, orientation_applied) =
        decode_image(source, source_extension, transform.normalize_orientation)?;
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
    if let Some(crop) = &transform.crop {
        checked_dimensions(crop.width, crop.height, "裁剪区域")?;
        let right = crop.x.checked_add(crop.width).ok_or("裁剪横向范围溢出")?;
        let bottom = crop.y.checked_add(crop.height).ok_or("裁剪纵向范围溢出")?;
        if right > output.width() || bottom > output.height() {
            return Err("裁剪区域超出旋转和翻转后的图片边界".into());
        }
        output = output.crop_imm(crop.x, crop.y, crop.width, crop.height);
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
    let jpeg_quality = match (format, transform.jpeg_quality) {
        (ImageFormat::Jpeg, Some(quality @ 1..=100)) => Some(quality),
        (ImageFormat::Jpeg, None) => Some(85),
        (ImageFormat::Jpeg, Some(_)) => return Err("JPEG 质量必须在 1 到 100 之间".into()),
        (_, Some(_)) => return Err("压缩质量当前只适用于 JPEG 输出".into()),
        (_, None) => None,
    };
    let mut output_bytes = Vec::new();
    if let Some(quality) = jpeg_quality {
        JpegEncoder::new_with_quality(&mut output_bytes, quality)
            .encode_image(&output)
            .map_err(|error| format!("无法按质量编码 JPEG: {error}"))?;
    } else {
        output
            .write_to(&mut Cursor::new(&mut output_bytes), format)
            .map_err(|error| format!("无法编码目标图片: {error}"))?;
    }
    if output_bytes.len() > MAX_IMAGE_BYTES {
        return Err("变换后的图片超过 100 MiB 可靠另存上限".into());
    }
    let (verification, _) = decode_image(&output_bytes, output_extension, true)?;
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
        jpeg_quality,
        orientation_normalized: transform.normalize_orientation || orientation_applied,
        metadata_removed: true,
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

    fn fixture_oriented_jpeg() -> Vec<u8> {
        let image =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(2, 3, Rgba([20, 40, 60, 255])));
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, 90)
            .encode_image(&image)
            .unwrap();
        let exif_orientation_6 = [
            0xff, 0xe1, 0x00, 0x22, b'E', b'x', b'i', b'f', 0x00, 0x00, b'I', b'I', 0x2a, 0x00,
            0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
            0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let mut oriented = Vec::with_capacity(jpeg.len() + exif_orientation_6.len());
        oriented.extend_from_slice(&jpeg[..2]);
        oriented.extend_from_slice(&exif_orientation_6);
        oriented.extend_from_slice(&jpeg[2..]);
        oriented
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
                width: Some(12),
                height: Some(8),
                ..RasterImageTransform::default()
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
            width: Some(10),
            ..RasterImageTransform::default()
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
            ..RasterImageTransform::default()
        };
        assert!(transform_raster_image(&source, "gif", "png", &unchanged).is_err());
        assert!(transform_raster_image(&source, "png", "avif", &unchanged).is_err());
    }

    #[test]
    fn crops_encodes_jpeg_quality_and_reports_metadata_removal() {
        let source = fixture_png();
        let result = transform_raster_image(
            &source,
            "png",
            "jpg",
            &RasterImageTransform {
                crop: Some(RasterImageCrop {
                    x: 0,
                    y: 1,
                    width: 2,
                    height: 2,
                }),
                width: Some(20),
                height: Some(10),
                jpeg_quality: Some(72),
                ..RasterImageTransform::default()
            },
        )
        .unwrap();
        assert_eq!((result.output_width, result.output_height), (20, 10));
        assert_eq!(result.jpeg_quality, Some(72));
        assert!(result.orientation_normalized);
        assert!(result.metadata_removed);
        assert!(transform_raster_image(
            &source,
            "png",
            "png",
            &RasterImageTransform {
                jpeg_quality: Some(80),
                ..RasterImageTransform::default()
            },
        )
        .is_err());
        for quality in [0, 101] {
            assert!(transform_raster_image(
                &source,
                "png",
                "jpg",
                &RasterImageTransform {
                    jpeg_quality: Some(quality),
                    ..RasterImageTransform::default()
                },
            )
            .is_err());
        }
        assert!(transform_raster_image(
            &source,
            "png",
            "jpg",
            &RasterImageTransform {
                crop: Some(RasterImageCrop {
                    x: 1,
                    y: 2,
                    width: 2,
                    height: 2
                }),
                ..RasterImageTransform::default()
            },
        )
        .is_err());
    }

    #[test]
    fn normalizes_exif_orientation_before_cropping_and_strips_metadata() {
        let source = fixture_oriented_jpeg();
        let (width, height, _) = inspect_raster_image(&source, "jpg").unwrap();
        assert_eq!((width, height), (3, 2));
        let result = transform_raster_image(
            &source,
            "jpg",
            "jpg",
            &RasterImageTransform {
                crop: Some(RasterImageCrop {
                    x: 1,
                    y: 0,
                    width: 2,
                    height: 2,
                }),
                jpeg_quality: Some(80),
                ..RasterImageTransform::default()
            },
        )
        .unwrap();
        assert_eq!((result.source_width, result.source_height), (3, 2));
        assert!(result.orientation_normalized && result.metadata_removed);
        assert!(!result
            .output_bytes
            .windows(6)
            .any(|window| window == b"Exif\0\0"));
    }
}
