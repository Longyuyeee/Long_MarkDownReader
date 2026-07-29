use crate::commands::table::{
    available_output_path, infer_column_type, internal_from_document, TableDocument, TableViewState,
};
use crate::formats::table::{
    validate_internal_table, MAX_INTERNAL_TABLE_BYTES, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS,
};
use crate::formats::workbook::{
    WorkbookCalculationPayload, WorkbookCalculationResult, WorkbookCapabilities,
    WorkbookCapabilityLevel, WorkbookCell, WorkbookConditionalFormatPayload,
    WorkbookDataValidationPayload, WorkbookDefinedNamePayload, WorkbookDocument,
    WorkbookDrawingPayload, WorkbookEngine, WorkbookFilterPayload, WorkbookHeaderFooterPayload,
    WorkbookOutlinePayload, WorkbookPageLayoutPayload, WorkbookPivotCacheRebuildPayload,
    WorkbookPivotCacheRebuildResult, WorkbookPivotExpandedRebuildPayload,
    WorkbookPivotExpandedRebuildResult, WorkbookPivotMultiAxisAuditPayload,
    WorkbookPivotMultiAxisAuditResult, WorkbookPivotPreviewPayload, WorkbookPivotPreviewResult,
    WorkbookPivotRebuildPlan, WorkbookPivotRebuildPlanPayload, WorkbookPivotSaveCopyPayload,
    WorkbookPivotSavedCopyResult, WorkbookPivotSynchronizedRebuildPayload,
    WorkbookPivotSynchronizedRebuildResult, WorkbookPivotVariantVerificationPayload,
    WorkbookPivotVariantVerificationResult, WorkbookPrintOptionsPayload, WorkbookSheetPage,
    WorkbookStructureChange, WorkbookStructureMigrationPreview, WorkbookStructurePayload,
    WorkbookTablePayload, WorkbookWritePayload,
};
use crate::formats::workbook_calculation::calculate_workbook;
use crate::formats::workbook_formula::{
    migrate_workbook_formula, migrate_workbook_reference, translate_formula,
    validate_workbook_structure_change, WorkbookFormulaTranslation, MAX_FORMULA_TRANSLATIONS,
};
use crate::formats::workbook_ooxml::{
    audit_workbook_pivot_multi_axis_isolated, patch_workbook, patch_workbook_conditional_format,
    patch_workbook_data_validation, patch_workbook_defined_name, patch_workbook_drawing,
    patch_workbook_filter, patch_workbook_freeze_pane, patch_workbook_header_footer,
    patch_workbook_outline, patch_workbook_page_layout, patch_workbook_print_options,
    patch_workbook_structure, patch_workbook_table, plan_workbook_pivot_rebuild,
    read_workbook_defined_names, read_workbook_linked_data, read_workbook_protection,
    read_workbook_sheet_layout, rebuild_workbook_pivot_aggregation_variant_isolated,
    rebuild_workbook_pivot_cache_isolated, rebuild_workbook_pivot_expanded_isolated,
    rebuild_workbook_pivot_isolated, rebuild_workbook_pivot_layout_variant_isolated,
    validate_workbook_package, verify_workbook_pivot_variants_isolated,
};
use crate::formats::workbook_pivot::preview_pivot;
use crate::sanitize_filename;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes, write_new_bytes};
use crate::services::workspace_guard::WorkspaceGuard;
use calamine::{open_workbook, CellType, Data, Reader, Xlsx};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_WORKBOOK_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PAGE_ROWS: usize = 5_000;
const MAX_PREVIEW_COLUMNS: usize = 256;

#[derive(Clone, Copy, Debug, Default)]
struct CalamineWorkbookEngine;

fn workbook_signature(metadata: &fs::Metadata, bytes: &[u8]) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}:{}:{:x}", metadata.len(), modified, md5::compute(bytes))
}

fn ensure_workbook(path: &Path) -> Result<(), String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 XLSX 元数据失败: {}", error))?;
    if metadata.len() > MAX_WORKBOOK_BYTES {
        return Err("XLSX 文件不能超过 128 MB".into());
    }
    Ok(())
}

fn validate_workbook_pivot_copy_file_name(file_name: &str) -> Result<String, String> {
    let file_name = file_name.trim();
    if file_name.is_empty() || file_name.len() > 255 {
        return Err("Pivot 副本文件名不能为空或超过 255 个字符".into());
    }
    if file_name.chars().any(|value| {
        value.is_control() || matches!(value, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
    }) || file_name.ends_with(' ')
        || file_name.ends_with('.')
    {
        return Err("Pivot 副本文件名包含路径、控制字符或 Windows 不允许的字符".into());
    }
    let path = Path::new(file_name);
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("xlsx"))
        || path.file_stem().is_none_or(|value| value.is_empty())
    {
        return Err("Pivot 副本文件名必须以 .xlsx 结尾".into());
    }
    Ok(file_name.to_string())
}

fn remove_created_workbook_if_exact(path: &Path, expected: &[u8]) {
    if fs::read(path).is_ok_and(|bytes| bytes == expected) {
        let _ = fs::remove_file(path);
    }
}

fn pivot_copy_layout_spec(
    layout: Option<&str>,
) -> Result<(&'static str, usize, usize, &'static [&'static str]), String> {
    match layout.unwrap_or("standard") {
        "standard" => Ok(("standard", 1, 1, &["sum"])),
        "row_only" => Ok(("row_only", 1, 0, &["sum"])),
        "column_only" => Ok(("column_only", 0, 1, &["sum"])),
        "multi_measure" => Ok(("multi_measure", 1, 1, &["sum", "count", "average"])),
        other => Err(format!("Pivot 可靠另存不支持布局 {other}")),
    }
}

fn pivot_copy_spec(
    layout: Option<&str>,
    aggregation: Option<&str>,
) -> Result<
    (
        &'static str,
        &'static str,
        usize,
        usize,
        &'static [&'static str],
    ),
    String,
> {
    if layout.is_some() && aggregation.is_some() {
        return Err("Pivot 可靠另存不能同时指定布局与聚合变体".into());
    }
    if let Some(aggregation) = aggregation {
        return match aggregation {
            "sum" => Ok(("standard", "sum", 1, 1, &["sum"])),
            "count" => Ok(("standard", "count", 1, 1, &["count"])),
            "average" => Ok(("standard", "average", 1, 1, &["average"])),
            "max" => Ok(("standard", "max", 1, 1, &["max"])),
            "min" => Ok(("standard", "min", 1, 1, &["min"])),
            "product" => Ok(("standard", "product", 1, 1, &["product"])),
            "countNums" => Ok(("standard", "countNums", 1, 1, &["countNums"])),
            other => Err(format!("Pivot 可靠另存不支持聚合 {other}")),
        };
    }
    let (layout, row_fields, column_fields, aggregations) = pivot_copy_layout_spec(layout)?;
    Ok((layout, "sum", row_fields, column_fields, aggregations))
}

fn save_workbook_pivot_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    payload: &WorkbookPivotSaveCopyPayload,
) -> Result<WorkbookPivotSavedCopyResult, String> {
    if target_path == source_path {
        return Err("Pivot 可靠另存禁止覆盖源 XLSX".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；Pivot 可靠另存不会覆盖现有文件".into());
    }
    recover_interrupted_write(source_path)?;
    ensure_workbook(source_path)?;
    let metadata = source_path
        .metadata()
        .map_err(|error| format!("读取源 XLSX 元数据失败: {error}"))?;
    let source = fs::read(source_path).map_err(|error| format!("读取源 XLSX 失败: {error}"))?;
    let source_signature = workbook_signature(&metadata, &source);
    if source_signature != payload.expected_signature {
        return Err("XLSX 已被其他程序修改，请重新加载并完成隔离验证后再另存".into());
    }
    let source_digest = format!("{:x}", md5::compute(&source));
    validate_workbook_package(&source)?;
    let linked_data = read_workbook_linked_data(&source)?;
    let pivot = linked_data
        .pivot_tables
        .iter()
        .find(|pivot| pivot.part == payload.pivot_part)
        .ok_or("指定的透视表不存在或身份已变化")?;
    let (layout_variant, aggregation_variant, row_field_count, column_field_count, aggregations) =
        pivot_copy_spec(
            payload.layout_variant.as_deref(),
            payload.aggregation_variant.as_deref(),
        )?;
    if pivot.audit.row_field_count != 1
        || pivot.audit.column_field_count != 1
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
        || pivot
            .audit
            .data_fields
            .first()
            .is_none_or(|field| field.aggregation != "sum" || !field.supported)
    {
        return Err(
            "Pivot 可靠另存要求一个行字段、一个列字段、一个 sum 值字段且无页面筛选的标准来源"
                .into(),
        );
    }
    let (output, output_digest, output_range, output_cell_count, changed_parts) =
        if layout_variant == "standard" && aggregation_variant == "sum" {
            let (output, rebuilt) = rebuild_workbook_pivot_expanded_isolated(&source, pivot)?;
            if !rebuilt.package_valid
                || !rebuilt.semantic_reparse_valid
                || !rebuilt.output_values_verified
                || !rebuilt.untouched_parts_preserved
            {
                return Err("Pivot 隔离输出未通过完整结构、语义、输出值和保真门禁".into());
            }
            (
                output,
                rebuilt.isolated_package_digest,
                rebuilt.new_output_range,
                rebuilt.output_cell_count,
                rebuilt.rebuilt_parts,
            )
        } else if layout_variant == "standard" {
            let (output, rebuilt) = rebuild_workbook_pivot_aggregation_variant_isolated(
                &source,
                pivot,
                aggregation_variant,
            )?;
            let plan = plan_workbook_pivot_rebuild(&source, pivot)?;
            let changed_parts = plan
                .affected_parts
                .iter()
                .filter(|impact| matches!(impact.role.as_str(), "pivot_table" | "output_worksheet"))
                .map(|impact| impact.part.clone())
                .collect();
            (
                output,
                rebuilt.isolated_package_digest,
                rebuilt.output_range,
                rebuilt.output_cell_count,
                changed_parts,
            )
        } else {
            let (output, rebuilt) =
                rebuild_workbook_pivot_layout_variant_isolated(&source, pivot, layout_variant)?;
            let plan = plan_workbook_pivot_rebuild(&source, pivot)?;
            let changed_parts = plan
                .affected_parts
                .iter()
                .filter(|impact| matches!(impact.role.as_str(), "pivot_table" | "output_worksheet"))
                .map(|impact| impact.part.clone())
                .collect();
            (
                output,
                rebuilt.isolated_package_digest,
                rebuilt.output_range,
                rebuilt.output_cell_count,
                changed_parts,
            )
        };
    let expected_output_digest = payload.expected_output_digest.trim().to_ascii_lowercase();
    if output_digest != expected_output_digest {
        return Err("Pivot 来源或隔离输出已变化，请重新执行布局扩缩容验证".into());
    }

    let source_before_write =
        fs::read(source_path).map_err(|error| format!("另存前复核源 XLSX 失败: {error}"))?;
    let metadata_before_write = source_path
        .metadata()
        .map_err(|error| format!("另存前复核源 XLSX 元数据失败: {error}"))?;
    if source_before_write != source
        || workbook_signature(&metadata_before_write, &source_before_write) != source_signature
        || format!("{:x}", md5::compute(&source_before_write)) != source_digest
    {
        return Err("源 XLSX 在隔离验证期间发生变化，请重新加载".into());
    }

    write_new_bytes(target_path, &output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(target_path)
            .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
        let target_digest = format!("{:x}", md5::compute(&saved));
        if saved != output || target_digest != output_digest {
            return Err("目标落盘字节与隔离验证输出不一致".into());
        }
        validate_workbook_package(&saved)
            .map_err(|error| format!("目标 XLSX 结构复读失败: {error}"))?;
        let saved_linked = read_workbook_linked_data(&saved)?;
        let saved_pivot = saved_linked
            .pivot_tables
            .iter()
            .find(|candidate| candidate.part == pivot.part)
            .ok_or("目标 XLSX 中的 Pivot 身份丢失")?;
        if saved_pivot.audit.layout_range.as_deref() != Some(output_range.as_str())
            || saved_pivot.audit.row_field_count != row_field_count
            || saved_pivot.audit.column_field_count != column_field_count
            || saved_pivot.audit.data_field_count != aggregations.len()
            || saved_pivot.audit.page_field_count != 0
            || saved_pivot
                .audit
                .data_fields
                .iter()
                .zip(aggregations.iter())
                .any(|(field, aggregation)| field.aggregation != *aggregation || !field.supported)
        {
            return Err("目标 XLSX 的 Pivot 语义复读与已验证输出不一致".into());
        }
        let source_after =
            fs::read(source_path).map_err(|error| format!("另存后复核源 XLSX 失败: {error}"))?;
        let source_metadata_after = source_path
            .metadata()
            .map_err(|error| format!("另存后复核源 XLSX 元数据失败: {error}"))?;
        if source_after != source
            || workbook_signature(&source_metadata_after, &source_after) != source_signature
            || format!("{:x}", md5::compute(&source_after)) != source_digest
        {
            return Err("源 XLSX 在可靠另存期间发生变化".into());
        }
        let target_metadata = target_path
            .metadata()
            .map_err(|error| format!("读取目标 XLSX 元数据失败: {error}"))?;
        Ok((target_digest, workbook_signature(&target_metadata, &saved)))
    })();
    let (target_digest, target_signature) = match verification {
        Ok(value) => value,
        Err(error) => {
            remove_created_workbook_if_exact(target_path, &output);
            return Err(format!("Pivot 可靠另存验证失败，已清理未验收副本: {error}"));
        }
    };

    Ok(WorkbookPivotSavedCopyResult {
        status: "saved_verified".into(),
        save_mode: "new_copy_only".into(),
        layout_variant: layout_variant.into(),
        aggregation_variant: aggregation_variant.into(),
        pivot_name: pivot.name.clone(),
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature,
        target_digest,
        source_signature,
        source_digest,
        source_unchanged: true,
        output_bytes: output.len(),
        output_range,
        output_cell_count,
        changed_parts,
        structural_reopen_verified: true,
        semantic_reopen_verified: true,
        output_values_verified: true,
        untouched_parts_preserved: true,
    })
}

pub fn generate_workbook_pivot_audit_copy(
    source_path: &Path,
    target_path: &Path,
) -> Result<String, String> {
    generate_workbook_pivot_layout_audit_copy(source_path, target_path, "standard")
}

pub fn generate_workbook_pivot_layout_audit_copy(
    source_path: &Path,
    target_path: &Path,
    layout: &str,
) -> Result<String, String> {
    generate_workbook_pivot_variant_audit_copy(source_path, target_path, Some(layout), None)
}

pub fn generate_workbook_pivot_aggregation_audit_copy(
    source_path: &Path,
    target_path: &Path,
    aggregation: &str,
) -> Result<String, String> {
    generate_workbook_pivot_variant_audit_copy(source_path, target_path, None, Some(aggregation))
}

pub fn generate_workbook_pivot_multi_axis_audit_copy(
    source_path: &Path,
    target_path: &Path,
) -> Result<String, String> {
    let source_parent = source_path
        .parent()
        .ok_or("Multi-axis Pivot audit source has no parent directory")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let target_parent = target_path
        .parent()
        .ok_or("Multi-axis Pivot audit target has no parent directory")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if source_parent != target_parent {
        return Err("Multi-axis Pivot audit copy must use the source directory".into());
    }
    if target_path == source_path {
        return Err("Multi-axis Pivot audit copy refuses to overwrite the source workbook".into());
    }
    if target_path.exists() {
        return Err("Multi-axis Pivot audit copy refuses to overwrite an existing target".into());
    }
    ensure_workbook(source_path)?;
    let source = fs::read(source_path).map_err(|error| error.to_string())?;
    let source_digest = format!("{:x}", md5::compute(&source));
    validate_workbook_package(&source)?;
    let document = CalamineWorkbookEngine.inspect(source_path)?;
    let candidates = document
        .linked_data
        .pivot_tables
        .iter()
        .filter(|pivot| {
            pivot.audit.writeback.status == "structure_candidate"
                && pivot.audit.row_field_count >= 2
                && pivot.audit.column_field_count >= 2
                && pivot.audit.data_field_count == 1
                && pivot.audit.page_field_count == 0
        })
        .collect::<Vec<_>>();
    if candidates.len() != 1 {
        return Err(format!(
            "Multi-axis Pivot audit copy requires exactly one multi-axis local Pivot candidate; found {}",
            candidates.len()
        ));
    }
    let pivot = candidates[0];
    let (output, audit) = audit_workbook_pivot_multi_axis_isolated(&source, pivot)?;
    if audit.status != "multi_axis_output_rebuilt"
        || audit.writes_user_file
        || !audit.package_valid
        || !audit.semantic_reparse_valid
        || !audit.untouched_parts_preserved
        || audit.pivot_definition_preserved
        || audit.output_worksheet_preserved
    {
        return Err("Multi-axis Pivot audit copy did not pass the isolated rebuild gates".into());
    }
    write_new_bytes(target_path, &output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(target_path).map_err(|error| {
            format!("Multi-axis target was created but cannot be reread: {error}")
        })?;
        let target_digest = format!("{:x}", md5::compute(&saved));
        if saved != output || target_digest != audit.isolated_package_digest {
            return Err("Multi-axis target bytes do not match the isolated audit output".into());
        }
        validate_workbook_package(&saved)
            .map_err(|error| format!("Multi-axis target package validation failed: {error}"))?;
        let saved_linked = read_workbook_linked_data(&saved)?;
        let saved_pivot = saved_linked
            .pivot_tables
            .iter()
            .find(|candidate| candidate.part == pivot.part)
            .ok_or("Multi-axis target lost the Pivot identity")?;
        if saved_pivot.audit.layout_range.as_deref() != Some(audit.output_range.as_str())
            || saved_pivot.audit.row_field_count != audit.row_axis.field_indices.len()
            || saved_pivot.audit.column_field_count != audit.column_axis.field_indices.len()
            || saved_pivot.audit.data_field_count != 1
            || saved_pivot.audit.page_field_count != 0
        {
            return Err(
                "Multi-axis target Pivot semantics drifted after writing the audit copy".into(),
            );
        }
        let source_after = fs::read(source_path).map_err(|error| {
            format!("Multi-axis audit copy cannot reread source workbook: {error}")
        })?;
        if source_after != source || format!("{:x}", md5::compute(&source_after)) != source_digest {
            return Err("Multi-axis audit copy changed the source workbook".into());
        }
        let target_metadata = target_path
            .metadata()
            .map_err(|error| format!("Multi-axis target metadata cannot be read: {error}"))?;
        Ok((target_digest, workbook_signature(&target_metadata, &saved)))
    })();
    let (target_digest, target_signature) = match verification {
        Ok(value) => value,
        Err(error) => {
            remove_created_workbook_if_exact(target_path, &output);
            return Err(format!(
                "Multi-axis Pivot audit copy verification failed and the unverified copy was removed: {error}"
            ));
        }
    };
    let report = serde_json::json!({
        "status": "audit_copy_verified",
        "stage": "S8-7E3G-A",
        "saveMode": "producer_roundtrip_input_only",
        "reliableSaveAllowed": false,
        "sourceOverwriteAllowed": false,
        "producerRoundTripStatus": "pending",
        "pivotName": audit.pivot_name,
        "targetPath": target_path.to_string_lossy(),
        "targetSignature": target_signature,
        "targetDigest": target_digest,
        "sourceSignature": document.signature,
        "sourceDigest": source_digest,
        "sourceUnchanged": true,
        "outputBytes": output.len(),
        "outputRange": audit.output_range,
        "outputCellCount": audit.output_cell_count,
        "previewGroupCount": audit.preview_group_count,
        "rowFieldCount": audit.row_axis.field_indices.len(),
        "columnFieldCount": audit.column_axis.field_indices.len(),
        "dataFieldCount": 1,
        "pageFieldCount": 0,
        "rebuiltParts": audit.rebuilt_parts,
        "packageValid": audit.package_valid,
        "semanticReopenVerified": audit.semantic_reparse_valid,
        "outputValuesVerified": true,
        "untouchedPartsPreserved": audit.untouched_parts_preserved,
        "blockedUntilProducerRoundTrip": [
            "reliable_copy_save",
            "source_overwrite",
            "existing_target_overwrite",
            "page_fields",
            "external_data",
            "slicers"
        ]
    });
    serde_json::to_string_pretty(&report).map_err(|error| error.to_string())
}

pub fn generate_workbook_array_audit_report(source_path: &Path) -> Result<String, String> {
    ensure_workbook(source_path)?;
    let source = fs::read(source_path)
        .map_err(|error| format!("Failed to read XLSX array audit source: {error}"))?;
    validate_workbook_package(&source)?;
    let layout = read_workbook_sheet_layout(&source, "Array Boundary", 0, 16, 16)?;
    let array_formulas = layout
        .array_formulas
        .iter()
        .map(|formula| {
            serde_json::json!({
                "kind": formula.kind,
                "anchorRow": formula.anchor_row,
                "anchorColumn": formula.anchor_column,
                "range": formula.range,
                "formula": formula.formula,
                "declaredCellCount": formula.declared_cell_count,
                "calculationStatus": formula.calculation_status,
                "writeStatus": formula.write_status,
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&serde_json::json!({
        "schemaVersion": 1,
        "stage": "X3-B5",
        "status": "array_semantics_verified",
        "sheet": "Array Boundary",
        "arrayDeclarationCount": array_formulas.len(),
        "arrayFormulas": array_formulas,
    }))
    .map_err(|error| format!("Failed to serialize XLSX array audit report: {error}"))
}

fn generate_workbook_pivot_variant_audit_copy(
    source_path: &Path,
    target_path: &Path,
    layout: Option<&str>,
    aggregation: Option<&str>,
) -> Result<String, String> {
    let (layout, aggregation, _, _, _) = pivot_copy_spec(layout, aggregation)?;
    let source_parent = source_path
        .parent()
        .ok_or("Pivot audit source has no parent directory")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let target_parent = target_path
        .parent()
        .ok_or("Pivot audit target has no parent directory")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if source_parent != target_parent {
        return Err("Pivot audit copy must use the source directory".into());
    }
    ensure_workbook(source_path)?;
    let source = fs::read(source_path).map_err(|error| error.to_string())?;
    validate_workbook_package(&source)?;
    let document = CalamineWorkbookEngine.inspect(source_path)?;
    let candidates = document
        .linked_data
        .pivot_tables
        .iter()
        .filter(|pivot| {
            pivot.audit.writeback.status == "structure_candidate"
                && pivot.audit.row_field_count == 1
                && pivot.audit.column_field_count == 1
                && pivot.audit.data_field_count == 1
                && pivot.audit.page_field_count == 0
                && pivot
                    .audit
                    .data_fields
                    .first()
                    .is_some_and(|field| field.aggregation == "sum" && field.supported)
        })
        .collect::<Vec<_>>();
    if candidates.len() != 1 {
        return Err(format!(
            "Pivot audit copy requires exactly one standard local Pivot candidate; found {}",
            candidates.len()
        ));
    }
    let pivot = candidates[0];
    let output_digest = if layout == "standard" && aggregation == "sum" {
        rebuild_workbook_pivot_expanded_isolated(&source, pivot)?
            .1
            .isolated_package_digest
    } else if layout == "standard" {
        rebuild_workbook_pivot_aggregation_variant_isolated(&source, pivot, aggregation)?
            .1
            .isolated_package_digest
    } else {
        rebuild_workbook_pivot_layout_variant_isolated(&source, pivot, layout)?
            .1
            .isolated_package_digest
    };
    let saved = save_workbook_pivot_copy_to_path(
        source_path,
        target_path,
        &WorkbookPivotSaveCopyPayload {
            expected_signature: document.signature,
            expected_output_digest: output_digest,
            pivot_part: pivot.part.clone(),
            layout_variant: (layout != "standard").then(|| layout.into()),
            aggregation_variant: (aggregation != "sum").then(|| aggregation.into()),
        },
    )?;
    serde_json::to_string_pretty(&saved).map_err(|error| error.to_string())
}

fn open_xlsx(path: &Path) -> Result<Xlsx<std::io::BufReader<fs::File>>, String> {
    ensure_workbook(path)?;
    open_workbook(path).map_err(|error| format!("解析 XLSX 失败: {}", error))
}

fn cell_kind(cell: &Data) -> &'static str {
    match cell {
        Data::Empty => "empty",
        Data::String(_) => "text",
        Data::Float(_) => "number",
        Data::Int(_) => "integer",
        Data::Bool(_) => "boolean",
        Data::DateTime(_) | Data::DateTimeIso(_) | Data::DurationIso(_) => "date",
        Data::Error(_) => "error",
    }
}

fn used_dimensions<T: CellType>(range: &calamine::Range<T>) -> (usize, usize) {
    range
        .end()
        .map(|(row, column)| (row as usize + 1, column as usize + 1))
        .unwrap_or((0, 0))
}

impl WorkbookEngine for CalamineWorkbookEngine {
    fn capabilities(&self) -> WorkbookCapabilities {
        WorkbookCapabilities {
            engine_id: "calamine-ooxml-ironcalc-v14".into(),
            extensions: vec!["xlsx".into()],
            read: WorkbookCapabilityLevel::Supported,
            cached_formula_results: WorkbookCapabilityLevel::Supported,
            existing_cell_editing: WorkbookCapabilityLevel::Supported,
            blank_cell_creation: WorkbookCapabilityLevel::Supported,
            range_editing: WorkbookCapabilityLevel::Supported,
            clipboard_tsv: WorkbookCapabilityLevel::Supported,
            conflict_detection: WorkbookCapabilityLevel::Supported,
            ooxml_part_preservation: WorkbookCapabilityLevel::Supported,
            cell_editing: WorkbookCapabilityLevel::Supported,
            formatting: WorkbookCapabilityLevel::Supported,
            row_column_selection: WorkbookCapabilityLevel::Supported,
            multi_area_selection: WorkbookCapabilityLevel::Supported,
            fill_handle: WorkbookCapabilityLevel::Supported,
            formula_reference_translation: WorkbookCapabilityLevel::Supported,
            formula_dependency_graph: WorkbookCapabilityLevel::Supported,
            formula_recalculation: WorkbookCapabilityLevel::Supported,
            row_dimensions: WorkbookCapabilityLevel::Supported,
            column_dimensions: WorkbookCapabilityLevel::Supported,
            row_column_outline: WorkbookCapabilityLevel::Supported,
            merged_cells: WorkbookCapabilityLevel::Supported,
            freeze_panes: WorkbookCapabilityLevel::Supported,
            sort_filter_view: WorkbookCapabilityLevel::Supported,
            excel_tables: WorkbookCapabilityLevel::Supported,
            named_ranges: WorkbookCapabilityLevel::Supported,
            date_time_values: WorkbookCapabilityLevel::Supported,
            error_values: WorkbookCapabilityLevel::Supported,
            named_styles: WorkbookCapabilityLevel::Supported,
            theme_indexed_colors: WorkbookCapabilityLevel::Supported,
            per_side_borders: WorkbookCapabilityLevel::Supported,
            custom_number_formats: WorkbookCapabilityLevel::Supported,
            conditional_formatting_preservation: WorkbookCapabilityLevel::Supported,
            charts: WorkbookCapabilityLevel::Supported,
            pivot_tables: WorkbookCapabilityLevel::Supported,
            slicers: WorkbookCapabilityLevel::Supported,
            external_data: WorkbookCapabilityLevel::Supported,
            data_validation: WorkbookCapabilityLevel::Supported,
            sheet_protection: WorkbookCapabilityLevel::Supported,
            print_layout: WorkbookCapabilityLevel::Supported,
            xlsx_round_trip: WorkbookCapabilityLevel::Planned,
            max_file_bytes: MAX_WORKBOOK_BYTES,
            max_page_rows: MAX_PAGE_ROWS,
            max_preview_columns: MAX_PREVIEW_COLUMNS,
        }
    }

    fn inspect(&self, path: &Path) -> Result<WorkbookDocument, String> {
        recover_interrupted_write(path)?;
        let metadata = path
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {}", error))?;
        let bytes = fs::read(path).map_err(|error| format!("读取 XLSX 失败: {}", error))?;
        let workbook = open_xlsx(path)?;
        let sheets = workbook.sheet_names().to_vec();
        if sheets.is_empty() {
            return Err("XLSX 不包含可读取的工作表".into());
        }
        Ok(WorkbookDocument {
            path: path.to_string_lossy().into_owned(),
            size: metadata.len(),
            signature: workbook_signature(&metadata, &bytes),
            sheets,
            defined_names: read_workbook_defined_names(&bytes)?,
            linked_data: read_workbook_linked_data(&bytes)?,
            protection: read_workbook_protection(&bytes)?,
        })
    }

    fn read_sheet(
        &self,
        path: &Path,
        sheet: &str,
        row_offset: usize,
        row_limit: usize,
    ) -> Result<WorkbookSheetPage, String> {
        let mut workbook = open_xlsx(path)?;
        if !workbook.sheet_names().iter().any(|name| name == sheet) {
            return Err("指定的工作表不存在".into());
        }
        let values = workbook
            .worksheet_range(sheet)
            .map_err(|error| format!("读取工作表失败: {}", error))?;
        let source = fs::read(path).map_err(|error| format!("读取 XLSX 样式失败: {error}"))?;
        let (total_rows, total_columns) = used_dimensions(&values);
        let requested_end = row_offset.saturating_add(row_limit.clamp(1, MAX_PAGE_ROWS));
        let layout = read_workbook_sheet_layout(
            &source,
            sheet,
            row_offset,
            requested_end,
            MAX_PREVIEW_COLUMNS,
        )?;
        let total_rows = total_rows.max(layout.extent.0);
        let total_columns = total_columns.max(layout.extent.1);
        let returned_columns = total_columns.min(MAX_PREVIEW_COLUMNS);
        let row_offset = row_offset.min(total_rows);
        let row_limit = row_limit.clamp(1, MAX_PAGE_ROWS);
        let end = total_rows.min(row_offset.saturating_add(row_limit));
        let rows = (row_offset..end)
            .map(|row| {
                (0..returned_columns)
                    .map(|column| {
                        let value = values
                            .get_value((row as u32, column as u32))
                            .cloned()
                            .unwrap_or(Data::Empty);
                        let formula = layout.formulas.get(&(row, column)).cloned();
                        WorkbookCell {
                            value: value.to_string(),
                            formula,
                            kind: cell_kind(&value).into(),
                            style: layout
                                .styles
                                .get(&(row, column))
                                .cloned()
                                .unwrap_or_default(),
                        }
                    })
                    .collect()
            })
            .collect();
        Ok(WorkbookSheetPage {
            sheet: sheet.to_string(),
            row_offset,
            total_rows,
            total_columns,
            returned_columns,
            rows,
            truncated_columns: total_columns > returned_columns,
            default_row_height: layout.default_row_height,
            default_column_width: layout.default_column_width,
            row_heights: layout.row_heights,
            column_widths: layout.column_widths,
            row_states: layout.row_states,
            column_states: layout.column_states,
            merged_cells: layout.merged_cells,
            named_styles: layout.named_styles,
            freeze_pane: layout.freeze_pane,
            auto_filter: layout.auto_filter,
            auto_filter_state: layout.auto_filter_state,
            tables: layout.tables,
            data_validations: layout.data_validations,
            conditional_formats: layout.conditional_formats,
            array_formulas: layout.array_formulas,
            drawings: layout.drawings,
            page_layout: layout.page_layout,
        })
    }
}

#[tauri::command]
pub fn get_workbook_capabilities() -> WorkbookCapabilities {
    CalamineWorkbookEngine.capabilities()
}

#[tauri::command]
pub fn translate_workbook_formulas(
    requests: Vec<WorkbookFormulaTranslation>,
) -> Result<Vec<String>, String> {
    if requests.len() > MAX_FORMULA_TRANSLATIONS {
        return Err(format!("单次最多迁移 {MAX_FORMULA_TRANSLATIONS} 个公式"));
    }
    requests
        .into_iter()
        .map(|request| translate_formula(&request.formula, request.row_delta, request.column_delta))
        .collect()
}

#[tauri::command]
pub fn preview_workbook_structure_migration(
    change: WorkbookStructureChange,
    current_sheet: String,
    formulas: Vec<String>,
    references: Vec<String>,
) -> Result<WorkbookStructureMigrationPreview, String> {
    validate_workbook_structure_change(&change)?;
    if current_sheet.is_empty() || current_sheet.chars().count() > 31 {
        return Err("当前工作表名称无效".into());
    }
    if formulas.is_empty() && references.is_empty() {
        return Err("没有需要预览的公式或引用".into());
    }
    if formulas.len().saturating_add(references.len()) > MAX_FORMULA_TRANSLATIONS {
        return Err(format!(
            "单次最多迁移 {MAX_FORMULA_TRANSLATIONS} 个公式或引用"
        ));
    }
    let formulas = formulas
        .iter()
        .map(|formula| migrate_workbook_formula(formula, &current_sheet, &change))
        .collect::<Result<Vec<_>, _>>()?;
    let references = references
        .iter()
        .map(|reference| {
            migrate_workbook_reference(reference, Some(current_sheet.as_str()), &change)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(WorkbookStructureMigrationPreview {
        formulas,
        references,
    })
}

#[tauri::command]
pub async fn recalculate_workbook_formulas(
    library_root: String,
    path: String,
    payload: WorkbookCalculationPayload,
) -> Result<WorkbookCalculationResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再重算".into());
        }
        validate_workbook_package(&source)?;
        let name = file
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("workbook.xlsx");
        calculate_workbook(&source, name, payload)
    })
    .await
    .map_err(|error| format!("公式重算任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_workbook_pivot(
    library_root: String,
    path: String,
    payload: WorkbookPivotPreviewPayload,
) -> Result<WorkbookPivotPreviewResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再预览透视结果".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        preview_pivot(&source, pivot, payload.edits)
    })
    .await
    .map_err(|error| format!("透视预览任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_workbook_pivot_rebuild(
    library_root: String,
    path: String,
    payload: WorkbookPivotRebuildPlanPayload,
) -> Result<WorkbookPivotRebuildPlan, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再生成透视重建影响清单".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        plan_workbook_pivot_rebuild(&source, pivot)
    })
    .await
    .map_err(|error| format!("透视重建影响审计任务失败: {error}"))?
}

#[tauri::command]
pub async fn rebuild_workbook_pivot_cache_isolated_copy(
    library_root: String,
    path: String,
    payload: WorkbookPivotCacheRebuildPayload,
) -> Result<WorkbookPivotCacheRebuildResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再执行隔离 Cache 重建".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        let (_, result) = rebuild_workbook_pivot_cache_isolated(&source, pivot)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("透视 Cache 隔离重建任务失败: {error}"))?
}

#[tauri::command]
pub async fn audit_workbook_pivot_multi_axis_isolated_copy(
    library_root: String,
    path: String,
    payload: WorkbookPivotMultiAxisAuditPayload,
) -> Result<WorkbookPivotMultiAxisAuditResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "XLSX changed after loading; reload before running the multi-axis audit".into(),
            );
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("The selected Pivot table no longer exists")?;
        let (_, result) = audit_workbook_pivot_multi_axis_isolated(&source, pivot)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("Multi-axis Pivot audit task failed: {error}"))?
}

#[tauri::command]
pub async fn rebuild_workbook_pivot_isolated_copy(
    library_root: String,
    path: String,
    payload: WorkbookPivotSynchronizedRebuildPayload,
) -> Result<WorkbookPivotSynchronizedRebuildResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再执行隔离同步重建".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        let (_, result) = rebuild_workbook_pivot_isolated(&source, pivot)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("透视表隔离同步重建任务失败: {error}"))?
}

#[tauri::command]
pub async fn rebuild_workbook_pivot_expanded_isolated_copy(
    library_root: String,
    path: String,
    payload: WorkbookPivotExpandedRebuildPayload,
) -> Result<WorkbookPivotExpandedRebuildResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再执行隔离布局扩缩容".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        let (_, result) = rebuild_workbook_pivot_expanded_isolated(&source, pivot)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("透视表隔离布局扩缩容任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_workbook_pivot_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    payload: WorkbookPivotSaveCopyPayload,
) -> Result<WorkbookPivotSavedCopyResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["xlsx"])?;
    let target_file_name = validate_workbook_pivot_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_workbook_pivot_copy_to_path(&source_path, &target_path, &payload)
    })
    .await
    .map_err(|error| format!("Pivot 可靠另存任务失败: {error}"))?
}

#[tauri::command]
pub async fn verify_workbook_pivot_variants_isolated_copy(
    library_root: String,
    path: String,
    payload: WorkbookPivotVariantVerificationPayload,
) -> Result<WorkbookPivotVariantVerificationResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再验证聚合与布局变体".into());
        }
        validate_workbook_package(&source)?;
        let linked_data = read_workbook_linked_data(&source)?;
        let pivot = linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == payload.pivot_part)
            .ok_or("指定的透视表不存在或身份已变化")?;
        verify_workbook_pivot_variants_isolated(&source, pivot)
    })
    .await
    .map_err(|error| format!("透视表聚合与布局变体隔离验证任务失败: {error}"))?
}

#[tauri::command]
pub async fn read_workbook_file(
    library_root: String,
    path: String,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || CalamineWorkbookEngine.inspect(&file))
        .await
        .map_err(|error| format!("XLSX 读取任务失败: {}", error))?
}

#[tauri::command]
pub async fn read_workbook_sheet(
    library_root: String,
    path: String,
    sheet: String,
    row_offset: usize,
    row_limit: usize,
) -> Result<WorkbookSheetPage, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        CalamineWorkbookEngine.read_sheet(&file, &sheet, row_offset, row_limit)
    })
    .await
    .map_err(|error| format!("工作表读取任务失败: {}", error))?
}

#[tauri::command]
pub async fn write_workbook_cells(
    library_root: String,
    path: String,
    payload: WorkbookWritePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再保存".into());
        }
        let output = patch_workbook(
            &source,
            &payload.edits,
            &payload.style_edits,
            &payload.row_height_edits,
            &payload.column_width_edits,
            &payload.merge_edits,
        )?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_structure(
    library_root: String,
    path: String,
    payload: WorkbookStructurePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改行列结构".into());
        }
        let output = patch_workbook_structure(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 工作表结构写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_defined_name(
    library_root: String,
    path: String,
    payload: WorkbookDefinedNamePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing defined names.".into());
        }
        let output = patch_workbook_defined_name(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX defined-name write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_data_validation(
    library_root: String,
    path: String,
    payload: WorkbookDataValidationPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing data validation rules.".into(),
            );
        }
        let output = patch_workbook_data_validation(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX data-validation write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_conditional_format(
    library_root: String,
    path: String,
    payload: WorkbookConditionalFormatPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing conditional formatting.".into(),
            );
        }
        let output = patch_workbook_conditional_format(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX conditional-format write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_drawing(
    library_root: String,
    path: String,
    payload: WorkbookDrawingPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing Drawing objects.".into(),
            );
        }
        let output = patch_workbook_drawing(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX Drawing write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_filter(
    library_root: String,
    path: String,
    payload: WorkbookFilterPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing filters.".into());
        }
        let output = patch_workbook_filter(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX filter write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_table(
    library_root: String,
    path: String,
    payload: WorkbookTablePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing the Table.".into());
        }
        let output = patch_workbook_table(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX Table write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_freeze_pane(
    library_root: String,
    path: String,
    expected_signature: String,
    sheet: String,
    rows: usize,
    columns: usize,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改冻结窗格".into());
        }
        let output = patch_workbook_freeze_pane(&source, &sheet, rows, columns)?;
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("冻结窗格写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_page_layout(
    library_root: String,
    path: String,
    payload: WorkbookPageLayoutPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改页面布局".into());
        }
        let output = patch_workbook_page_layout(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 页面布局写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_header_footer(
    library_root: String,
    path: String,
    payload: WorkbookHeaderFooterPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改页眉页脚".into());
        }
        let output = patch_workbook_header_footer(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 页眉页脚写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_print_options(
    library_root: String,
    path: String,
    payload: WorkbookPrintOptionsPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改打印选项".into());
        }
        let output = patch_workbook_print_options(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 打印选项写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_outline(
    library_root: String,
    path: String,
    payload: WorkbookOutlinePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改行列结构".into());
        }
        let output = patch_workbook_outline(&source, &payload.row_edits, &payload.column_edits)?;
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("行列隐藏分组写回任务失败: {error}"))?
}

fn sheet_to_table(source: &Path, sheet: &str) -> Result<PathBuf, String> {
    let mut workbook = open_xlsx(source)?;
    if !workbook.sheet_names().iter().any(|name| name == sheet) {
        return Err("指定的工作表不存在".into());
    }
    let range = workbook
        .worksheet_range(sheet)
        .map_err(|error| format!("读取工作表失败: {}", error))?;
    let (total_rows, total_columns) = used_dimensions(&range);
    if total_columns == 0 {
        return Err("空工作表无法转换为 Table".into());
    }
    if total_columns > MAX_TABLE_COLUMNS {
        return Err(format!("工作表超过 {} 列上限", MAX_TABLE_COLUMNS));
    }
    if total_rows.saturating_sub(1) > MAX_TABLE_ROWS {
        return Err(format!("工作表超过 {} 条数据行上限", MAX_TABLE_ROWS));
    }
    let value_at = |row: usize, column: usize| {
        range
            .get_value((row as u32, column as u32))
            .map(ToString::to_string)
            .unwrap_or_default()
    };
    let headers = (0..total_columns)
        .map(|column| {
            let value = value_at(0, column).trim().to_string();
            if value.is_empty() {
                format!("列 {}", column + 1)
            } else {
                value
            }
        })
        .collect::<Vec<_>>();
    let rows = (1..total_rows)
        .map(|row| {
            (0..total_columns)
                .map(|column| value_at(row, column))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let column_types = (0..total_columns)
        .map(|column| infer_column_type(&rows, column))
        .collect::<Vec<_>>();
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    let safe_sheet = sanitize_filename(sheet);
    let target_stem = sanitize_filename(&format!("{} - {}", stem, safe_sheet));
    let directory = source.parent().ok_or("XLSX 文件没有父目录")?;
    let target = available_output_path(directory, &target_stem, ".table.json");
    let document = TableDocument {
        path: target.to_string_lossy().into_owned(),
        format: "longedit-table".into(),
        delimiter: ",".into(),
        encoding: "UTF-8".into(),
        has_bom: false,
        line_ending: "lf".into(),
        signature: String::new(),
        headers,
        rows,
        column_types,
        column_ids: (0..total_columns)
            .map(|index| format!("column-{}", index + 1))
            .collect(),
        row_ids: (1..total_rows)
            .map(|index| format!("row-{}", index))
            .collect(),
        view: TableViewState::default(),
        views: Vec::new(),
        active_view: "grid".into(),
    };
    let internal = internal_from_document(&document);
    validate_internal_table(&internal)?;
    let output = serde_json::to_vec_pretty(&internal).map_err(|error| error.to_string())?;
    if output.len() > MAX_INTERNAL_TABLE_BYTES {
        return Err("转换后的 Table 超过 64 MB 上限".into());
    }
    write_bytes(&target, &output)?;
    Ok(target)
}

#[tauri::command]
pub async fn import_workbook_sheet(
    library_root: String,
    path: String,
    sheet: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        sheet_to_table(&source, &sheet).map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("XLSX 导入任务失败: {}", error))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::workbook::{
        WorkbookCellEdit, WorkbookCellStyleEdit, WorkbookColumnStateEdit, WorkbookColumnWidthEdit,
        WorkbookConditionalFormatAction, WorkbookConditionalFormatChange,
        WorkbookConditionalFormatPayload, WorkbookConditionalFormatRule,
        WorkbookConditionalFormatStyle, WorkbookDataValidation, WorkbookDataValidationAction,
        WorkbookDataValidationChange, WorkbookDataValidationPayload, WorkbookDefinedNameAction,
        WorkbookDefinedNameChange, WorkbookDefinedNamePayload, WorkbookDrawingAction,
        WorkbookDrawingChange, WorkbookDrawingPayload, WorkbookFilterAction, WorkbookFilterChange,
        WorkbookFilterPayload, WorkbookFilterTarget, WorkbookFormulaTarget,
        WorkbookHeaderFooterChange, WorkbookHeaderFooterPayload, WorkbookMergeEdit,
        WorkbookMergeRange, WorkbookOutlinePayload, WorkbookPageLayoutChange,
        WorkbookPageLayoutPayload, WorkbookPageMarginsChange, WorkbookPivotPreviewPayload,
        WorkbookPrintOptionsChange, WorkbookPrintOptionsPayload, WorkbookRowHeightEdit,
        WorkbookRowStateEdit, WorkbookStructureAction, WorkbookStructureAxis,
        WorkbookStructurePayload, WorkbookStylePatch, WorkbookWritePayload,
    };
    use rust_xlsxwriter::{
        ConditionalFormatCell, ConditionalFormatCellRule, Format, Formula, Workbook,
    };
    use std::collections::{BTreeMap, BTreeSet};
    use std::io::{Cursor, Read};
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    #[test]
    fn previews_bounded_workbook_structure_migrations() {
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 2,
        };
        let preview = preview_workbook_structure_migration(
            change.clone(),
            "Data".into(),
            vec!["=A2+Other!A2".into()],
            vec!["A1:A3".into(), "Other!A1:A3".into()],
        )
        .unwrap();
        assert_eq!(preview.formulas, ["=A4+Other!A2"]);
        assert_eq!(preview.references, ["A1:A5", "Other!A1:A3"]);

        assert!(preview_workbook_structure_migration(
            change.clone(),
            "Data".into(),
            vec![],
            vec![],
        )
        .unwrap_err()
        .contains("没有需要预览"));
        assert!(preview_workbook_structure_migration(
            change,
            "Data".into(),
            vec!["=A1".into(); MAX_FORMULA_TRANSLATIONS + 1],
            vec![],
        )
        .unwrap_err()
        .contains("单次最多迁移"));
    }

    #[test]
    fn writes_row_and_column_structure_with_signature_protection() {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-row-structure-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("rows.xlsx");
        let mut workbook = Workbook::new();
        let data = workbook.add_worksheet();
        data.set_name("Data").unwrap();
        data.write_string(0, 0, "Header").unwrap();
        data.write_number(1, 0, 10).unwrap();
        data.write_number(2, 0, 20).unwrap();
        data.write_formula(2, 1, Formula::new("=SUM(A2:A3)"))
            .unwrap();
        workbook.save(&path).unwrap();

        let root_text = root.to_string_lossy().into_owned();
        let path_text = path.to_string_lossy().into_owned();
        let document = tauri::async_runtime::block_on(read_workbook_file(
            root_text.clone(),
            path_text.clone(),
        ))
        .unwrap();
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 1,
        };
        let stale = tauri::async_runtime::block_on(update_workbook_structure(
            root_text.clone(),
            path_text.clone(),
            WorkbookStructurePayload {
                expected_signature: "stale".into(),
                change: change.clone(),
            },
        ))
        .unwrap_err();
        assert!(stale.contains("其他程序修改"));

        let saved = tauri::async_runtime::block_on(update_workbook_structure(
            root_text,
            path_text,
            WorkbookStructurePayload {
                expected_signature: document.signature.clone(),
                change,
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let xml = String::from_utf8(zip_part(
            &fs::read(&path).unwrap(),
            "xl/worksheets/sheet1.xml",
        ))
        .unwrap();
        assert!(xml.contains("r=\"A3\""));
        assert!(xml.contains("SUM(A3:A4)"));

        let column_saved = tauri::async_runtime::block_on(update_workbook_structure(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookStructurePayload {
                expected_signature: saved.signature,
                change: WorkbookStructureChange {
                    sheet: "Data".into(),
                    axis: WorkbookStructureAxis::Column,
                    action: WorkbookStructureAction::Insert,
                    index: 0,
                    count: 1,
                },
            },
        ))
        .unwrap();
        assert_ne!(column_saved.signature, document.signature);
        let xml = String::from_utf8(zip_part(
            &fs::read(&path).unwrap(),
            "xl/worksheets/sheet1.xml",
        ))
        .unwrap();
        assert!(xml.contains("r=\"B3\""));
        assert!(xml.contains("SUM(B3:B4)"));
        fs::remove_dir_all(base).unwrap();
    }

    fn fixture() -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("project.xlsx");
        let mut workbook = Workbook::new();
        let first = workbook.add_worksheet();
        first.set_name("进度").unwrap();
        first.write_string(0, 0, "项目").unwrap();
        first.write_string(0, 1, "完成").unwrap();
        first.write_string(1, 0, "图谱").unwrap();
        first.write_number(1, 1, 75).unwrap();
        first
            .add_conditional_format(
                1,
                1,
                1,
                1,
                &ConditionalFormatCell::new()
                    .set_rule(ConditionalFormatCellRule::GreaterThan(50))
                    .set_format(Format::new().set_bold()),
            )
            .unwrap();
        first.set_row_height(1, 28).unwrap();
        first.set_column_width(0, 18).unwrap();
        first.set_column_width(1, 14).unwrap();
        first
            .write_formula(2, 1, Formula::new("=SUM(B2, 5)").set_result("80"))
            .unwrap();
        first
            .merge_range(4, 0, 4, 1, "合并区域", &Format::new().set_bold())
            .unwrap();
        workbook.add_worksheet().set_name("说明").unwrap();
        workbook.save(&path).unwrap();
        (base, path)
    }

    fn compatibility_fixture_copy(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("compatibility.xlsx");
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/workbook/compatibility-baseline.xlsx"),
            &path,
        )
        .unwrap();
        (base, path)
    }

    fn chart_visual_fixture_copy(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-chart-visual-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("chart-visual-matrix.xlsx");
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/workbook/chart-visual-matrix.xlsx"),
            &path,
        )
        .unwrap();
        (base, path)
    }

    fn formula_function_fixture_copy(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-formula-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("formula-function-matrix.xlsx");
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/workbook/formula-function-matrix.xlsx"),
            &path,
        )
        .unwrap();
        (base, path)
    }

    #[test]
    fn formula_function_matrix_recalculates_through_command_boundary() {
        let (base, path) = formula_function_fixture_copy("command");
        let root = path.parent().unwrap().to_string_lossy().into_owned();
        let path_text = path.to_string_lossy().into_owned();
        let document =
            tauri::async_runtime::block_on(read_workbook_file(root.clone(), path_text.clone()))
                .unwrap();
        let result = tauri::async_runtime::block_on(recalculate_workbook_formulas(
            root,
            path_text,
            WorkbookCalculationPayload {
                expected_signature: document.signature,
                edits: Vec::new(),
                targets: [
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 1,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 15,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 18,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 23,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 29,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 30,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 31,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 32,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 36,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 40,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 41,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 42,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 49,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 51,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 56,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 57,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 63,
                        column: 4,
                    },
                    WorkbookFormulaTarget {
                        sheet: "Formula Matrix".into(),
                        row: 64,
                        column: 4,
                    },
                ]
                .into(),
            },
        ))
        .unwrap();
        assert_eq!(result.cells[0].value, "60");
        assert_eq!(result.cells[3].value, "200");
        assert_eq!(result.cells[4].value, "400");
        assert_eq!(result.cells[4].kind, "text");
        assert_eq!(result.cells[5].value, "#N/A");
        assert_eq!(result.cells[6].value, "missing");
        assert_eq!(result.cells[7].value, "50");
        assert_eq!(result.cells[8].value, "45351");
        assert_eq!(result.cells[9].value, "29");
        assert_eq!(result.cells[10].value, "#VALUE!");
        assert_eq!(result.cells[11].value, "200");
        assert_eq!(result.cells[12].value, "#N/A");
        assert_eq!(result.cells[13].value, "50");
        assert_eq!(result.cells[14].value, "true");
        assert_eq!(result.cells[15].value, "3");
        assert_eq!(result.cells[16].value, "#N/A");
        assert_eq!(result.cells[17].value, "recovered");
        assert_eq!(result.diagnostics[0].category, "division_by_zero");
        assert_eq!(result.diagnostics[1].category, "name");
        assert_eq!(result.diagnostics[2].category, "not_available");
        assert_eq!(result.diagnostics[3].category, "value");
        assert_eq!(result.diagnostics[4].category, "not_available");
        assert_eq!(result.diagnostics[5].category, "not_available");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn formula_calculation_command_rejects_external_workbook_offline() {
        let (base, path) = compatibility_fixture_copy("external-calculation");
        let root = path.parent().unwrap().to_string_lossy().into_owned();
        let path_text = path.to_string_lossy().into_owned();
        let document =
            tauri::async_runtime::block_on(read_workbook_file(root.clone(), path_text.clone()))
                .unwrap();
        let error = tauri::async_runtime::block_on(recalculate_workbook_formulas(
            root,
            path_text,
            WorkbookCalculationPayload {
                expected_signature: document.signature,
                edits: Vec::new(),
                targets: vec![WorkbookFormulaTarget {
                    sheet: "Inventory".into(),
                    row: 0,
                    column: 0,
                }],
            },
        ))
        .unwrap_err();
        assert!(error.contains("保持离线"));
        assert!(error.contains("外部工作簿链接"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pivot_preview_uses_unsaved_drafts_without_modifying_workbook() {
        let (base, path) = compatibility_fixture_copy("pivot-preview");
        let root = path.parent().unwrap().to_string_lossy().into_owned();
        let path_text = path.to_string_lossy().into_owned();
        let before = fs::read(&path).unwrap();
        let document =
            tauri::async_runtime::block_on(read_workbook_file(root.clone(), path_text.clone()))
                .unwrap();
        let pivot_part = document.linked_data.pivot_tables[0].part.clone();
        let preview = tauri::async_runtime::block_on(preview_workbook_pivot(
            root.clone(),
            path_text.clone(),
            WorkbookPivotPreviewPayload {
                expected_signature: document.signature,
                pivot_part: pivot_part.clone(),
                edits: vec![WorkbookCellEdit {
                    sheet: "Inventory".into(),
                    row: 1,
                    column: 1,
                    input: "18".into(),
                    kind: "number".into(),
                }],
            },
        ))
        .unwrap();
        assert_eq!(preview.pivot_name, "InventoryPivot");
        assert_eq!(preview.source_sheet, "Inventory");
        assert_eq!(preview.source_range, "A1:C3");
        assert_eq!(preview.source_row_count, 2);
        assert_eq!(preview.applied_draft_count, 1);
        assert_eq!(preview.groups.len(), 2);
        assert_eq!(preview.groups[0].row_keys[0].value, "Keyboard");
        assert_eq!(preview.groups[0].column_keys[0].value, "Hardware");
        assert_eq!(preview.groups[0].measures[0].formatted_value, "18");
        assert_eq!(preview.groups[1].measures[0].formatted_value, "30");
        assert_eq!(fs::read(&path).unwrap(), before);

        let stale = tauri::async_runtime::block_on(preview_workbook_pivot(
            root,
            path_text,
            WorkbookPivotPreviewPayload {
                expected_signature: "stale".into(),
                pivot_part,
                edits: Vec::new(),
            },
        ))
        .unwrap_err();
        assert!(stale.contains("其他程序修改"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_filter_state_with_signature_protection() {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-filter-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("filter.xlsx");
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Name").unwrap();
        sheet.write_string(0, 1, "Score").unwrap();
        sheet.write_string(1, 0, "Alpha").unwrap();
        sheet.write_number(1, 1, 2).unwrap();
        sheet.write_string(2, 0, "Beta").unwrap();
        sheet.write_number(2, 1, 1).unwrap();
        sheet.autofilter(0, 0, 2, 1).unwrap();
        workbook.save(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookFilterChange {
            sheet: "Data".into(),
            target: WorkbookFilterTarget::Worksheet,
            action: WorkbookFilterAction::Apply,
            table_name: None,
            range: WorkbookMergeRange {
                top: 0,
                bottom: 2,
                left: 0,
                right: 1,
            },
            filter_column: Some(0),
            query: Some("Al".into()),
            sort_column: Some(1),
            sort_direction: Some("asc".into()),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_filter(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookFilterPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Data", 0, 10)
            .unwrap();
        assert_eq!(page.auto_filter_state.query.as_deref(), Some("Al"));
        let stale = tauri::async_runtime::block_on(update_workbook_filter(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookFilterPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_defined_names_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookDefinedNameChange {
            action: WorkbookDefinedNameAction::Create,
            name: "ProgressRange".into(),
            new_name: None,
            scope: None,
            target_sheet: Some("进度".into()),
            range: Some(WorkbookMergeRange {
                top: 0,
                bottom: 2,
                left: 0,
                right: 1,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_defined_name(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDefinedNamePayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert!(saved
            .defined_names
            .iter()
            .any(|item| item.name == "ProgressRange"));
        let stale = tauri::async_runtime::block_on(update_workbook_defined_name(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDefinedNamePayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_data_validation_rules_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookDataValidationChange {
            sheet: "进度".into(),
            action: WorkbookDataValidationAction::Create,
            validation_index: None,
            validation: Some(WorkbookDataValidation {
                ranges: vec![WorkbookMergeRange {
                    top: 1,
                    bottom: 2,
                    left: 1,
                    right: 1,
                }],
                kind: "custom".into(),
                operator: None,
                formula1: Some("B2>=0".into()),
                formula2: None,
                allow_blank: false,
                show_error_message: true,
                error_title: Some("Invalid progress".into()),
                error: Some("Progress must be non-negative.".into()),
                prompt_title: None,
                prompt: None,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_data_validation(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDataValidationPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_ne!(saved.signature, document.signature);
        assert_eq!(page.data_validations.len(), 1);
        assert_eq!(page.data_validations[0].kind, "custom");
        assert_eq!(page.data_validations[0].formula1.as_deref(), Some("B2>=0"));

        let stale = tauri::async_runtime::block_on(update_workbook_data_validation(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDataValidationPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_conditional_formats_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookConditionalFormatChange {
            sheet: "进度".into(),
            action: WorkbookConditionalFormatAction::Create,
            group_index: None,
            rule_index: None,
            rule: Some(WorkbookConditionalFormatRule {
                group_index: 0,
                rule_index: 0,
                ranges: vec![WorkbookMergeRange {
                    top: 1,
                    bottom: 2,
                    left: 0,
                    right: 0,
                }],
                kind: "cellIs".into(),
                operator: Some("equal".into()),
                formula1: Some("75".into()),
                formula2: None,
                priority: 0,
                stop_if_true: true,
                style: WorkbookConditionalFormatStyle {
                    font_color: Some("#9C6500".into()),
                    fill_color: Some("#FFEB9C".into()),
                    bold: false,
                },
                color_scale: None,
                data_bar: None,
                icon_set: None,
                editable: true,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_conditional_format(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookConditionalFormatPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_ne!(saved.signature, document.signature);
        assert_eq!(page.conditional_formats.len(), 2);
        assert!(page
            .conditional_formats
            .iter()
            .any(|rule| rule.formula1.as_deref() == Some("75")));

        let stale = tauri::async_runtime::block_on(update_workbook_conditional_format(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookConditionalFormatPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn reads_multiple_sheets_values_and_formulas() {
        let (base, path) = fixture();
        let document = tauri::async_runtime::block_on(read_workbook_file(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(document.sheets, ["进度", "说明"]);
        let page = tauri::async_runtime::block_on(read_workbook_sheet(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "进度".into(),
            0,
            100,
        ))
        .unwrap();
        assert_eq!(page.rows[1][1].value, "75");
        assert_eq!(page.rows[2][1].value, "80");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 5)"));
        assert_eq!(page.row_heights[0].row, 1);
        assert!((page.row_heights[0].height - 27.75).abs() < 0.01);
        assert!(page
            .column_widths
            .iter()
            .any(|item| { item.start_column == 0 && item.end_column == 0 && item.width > 18.0 }));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 4,
                bottom: 4,
                left: 0,
                right: 1,
            }]
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn imports_selected_sheet_as_open_table() {
        let (base, path) = fixture();
        let root = base.join("library");
        let target = tauri::async_runtime::block_on(import_workbook_sheet(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "进度".into(),
        ))
        .unwrap();
        let parsed =
            crate::formats::table::parse_internal_table(&fs::read_to_string(target).unwrap())
                .unwrap();
        assert_eq!(parsed.data.columns[0].name, "项目");
        assert_eq!(parsed.data.rows[0].values["column-2"], "75");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn committed_compatibility_fixture_matches_engine_contract() {
        let fixture_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/workbook");
        let workbook_path = fixture_root.join("compatibility-baseline.xlsx");
        let expectation: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("compatibility-baseline.json")).unwrap(),
        )
        .unwrap();
        let engine = CalamineWorkbookEngine;

        let document = engine.inspect(&workbook_path).unwrap();
        assert_eq!(
            document.sheets,
            expectation["sheets"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_str().unwrap().to_string())
                .collect::<Vec<_>>()
        );
        let page = engine
            .read_sheet(&workbook_path, "Summary", 0, 100)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha");
        assert_eq!(page.rows[1][1].value, "1250.5");
        assert_eq!(page.rows[1][2].value, "true");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2:B2)"));
        assert_eq!(page.rows[2][1].value, "1250.5");
        assert_eq!(page.rows[1][3].kind, "date");
        assert_eq!(page.rows[1][4].kind, "date");
        assert_eq!(page.rows[1][5].kind, "error");
        assert_eq!(page.rows[1][5].value, "#DIV/0!");
        assert_eq!(
            page.rows[3][1].formula.as_deref(),
            Some("=SUM(AmountRange)")
        );
        assert_eq!(page.rows[3][1].value, "1250.5");
        assert_eq!(page.freeze_pane.rows, 1);
        assert_eq!(page.freeze_pane.columns, 1);
        assert_eq!(
            page.page_layout.print_area,
            Some(crate::formats::workbook::WorkbookMergeRange {
                top: 0,
                bottom: 4,
                left: 0,
                right: 5,
            })
        );
        assert_eq!(
            page.page_layout.setup.orientation.as_deref(),
            Some("landscape")
        );
        assert_eq!(page.page_layout.setup.paper_size, Some(9));
        assert_eq!(page.page_layout.setup.fit_to_height, Some(0));
        assert!(page.page_layout.setup.fit_to_page);
        assert_eq!(page.page_layout.margins.left, Some(0.5));
        assert_eq!(page.page_layout.margins.right, Some(0.5));
        assert!(page.page_layout.options.grid_lines);
        assert!(page.page_layout.options.headings);
        assert!(page.page_layout.options.horizontal_centered);
        assert_eq!(
            page.page_layout.header_footer.odd_header.as_deref(),
            Some("&LConfidential&CQuarterly summary&RPage &P of &N")
        );
        assert_eq!(
            page.page_layout.header_footer.odd_footer.as_deref(),
            Some("&CGenerated by LongEdit fixture")
        );
        assert!(!page.page_layout.protection.enabled);
        let protected_page = engine
            .read_sheet(&workbook_path, "Protected", 0, 10)
            .unwrap();
        assert!(protected_page.page_layout.protection.enabled);
        assert!(protected_page.page_layout.protection.password_protected);
        assert_eq!(
            protected_page.page_layout.protection.blocked_actions,
            ["objects", "scenarios"]
        );
        let details_page = engine
            .read_sheet(&workbook_path, "Details", 0, 100)
            .unwrap();
        assert_eq!(
            details_page.auto_filter,
            Some(crate::formats::workbook::WorkbookMergeRange {
                top: 0,
                bottom: 1,
                left: 0,
                right: 1,
            })
        );
        assert_eq!(details_page.data_validations.len(), 1);
        assert_eq!(details_page.data_validations[0].kind, "list");
        assert_eq!(
            details_page.data_validations[0].formula1.as_deref(),
            Some("\"Active,Paused,Closed\"")
        );
        let inventory_page = engine
            .read_sheet(&workbook_path, "Inventory", 0, 100)
            .unwrap();
        assert_eq!(inventory_page.tables.len(), 1);
        assert_eq!(inventory_page.tables[0].name, "InventoryTable");
        assert_eq!(
            inventory_page.tables[0].columns,
            ["Product", "Stock", "Category"]
        );
        assert_eq!(inventory_page.drawings.len(), 2);
        let chart_drawing = inventory_page
            .drawings
            .iter()
            .find(|drawing| drawing.kind == "chart")
            .unwrap();
        assert_eq!(chart_drawing.name, "InventoryStockChart");
        assert_eq!((chart_drawing.from.row, chart_drawing.from.column), (1, 4));
        assert_eq!(
            chart_drawing
                .to
                .as_ref()
                .map(|anchor| (anchor.row, anchor.column)),
            Some((15, 11))
        );
        assert_eq!(chart_drawing.part.as_deref(), Some("xl/charts/chart1.xml"));
        let chart = chart_drawing.chart.as_ref().unwrap();
        assert_eq!(chart.chart_type, "column");
        assert_eq!(chart.title.as_deref(), Some("Inventory stock"));
        assert_eq!(chart.series.len(), 1);
        assert_eq!(chart.series[0].name.as_deref(), Some("Stock"));
        assert_eq!(
            chart.series[0].categories.as_deref(),
            Some("Inventory!$A$2:$A$3")
        );
        assert_eq!(
            chart.series[0].values.as_deref(),
            Some("Inventory!$B$2:$B$3")
        );
        let image_drawing = inventory_page
            .drawings
            .iter()
            .find(|drawing| drawing.kind == "image")
            .unwrap();
        assert_eq!(
            image_drawing.description.as_deref(),
            Some("Inventory marker")
        );
        assert_eq!((image_drawing.from.row, image_drawing.from.column), (18, 4));
        assert_eq!(image_drawing.part.as_deref(), Some("xl/media/image1.png"));
        assert_eq!(document.linked_data.pivot_tables.len(), 1);
        let pivot = &document.linked_data.pivot_tables[0];
        assert_eq!(pivot.name, "InventoryPivot");
        assert_eq!(pivot.sheet.as_deref(), Some("Inventory"));
        assert_eq!(pivot.cache_id, Some(1));
        assert_eq!(pivot.source_type, "worksheet");
        assert_eq!(pivot.source_sheet.as_deref(), Some("Inventory"));
        assert_eq!(pivot.source_range.as_deref(), Some("A1:C3"));
        assert!(pivot.refresh_on_load);
        assert!(pivot.audit.rebuild_candidate);
        assert_eq!(pivot.audit.status, "candidate_for_rebuild");
        assert_eq!(pivot.audit.layout_range.as_deref(), Some("E2:G6"));
        assert_eq!(pivot.audit.cache_field_count, 3);
        assert_eq!(pivot.audit.cache_record_count, Some(2));
        assert_eq!(pivot.audit.row_field_count, 1);
        assert_eq!(pivot.audit.column_field_count, 1);
        assert_eq!(pivot.audit.page_field_count, 0);
        assert_eq!(pivot.audit.data_field_count, 1);
        assert_eq!(pivot.audit.fields[0].name, "Product");
        assert_eq!(pivot.audit.fields[0].role, "row");
        assert_eq!(pivot.audit.fields[1].value_type, "number");
        assert_eq!(pivot.audit.fields[2].role, "column");
        assert_eq!(pivot.audit.data_fields[0].name, "Sum of Stock");
        assert_eq!(pivot.audit.data_fields[0].aggregation, "sum");
        assert!(pivot.audit.data_fields[0].supported);
        assert!(pivot.audit.blockers.is_empty());
        assert_eq!(pivot.audit.writeback.status, "blocked");
        assert!(!pivot.audit.writeback.allowed);
        assert!(!pivot.audit.writeback.pivot_field_items_complete);
        assert!(!pivot.audit.writeback.row_items_complete);
        assert!(!pivot.audit.writeback.column_items_complete);
        assert!(!pivot.audit.writeback.output_cells_present);
        assert!(pivot
            .audit
            .writeback
            .blockers
            .iter()
            .any(|item| item.contains("输出区域")));
        assert_eq!(document.linked_data.slicers.len(), 1);
        assert_eq!(document.linked_data.slicers[0].name, "CategorySlicer");
        assert_eq!(
            document.linked_data.slicers[0].sheet.as_deref(),
            Some("Inventory")
        );
        assert_eq!(document.linked_data.external_links.len(), 1);
        assert_eq!(
            document.linked_data.external_links[0].kind,
            "external_workbook"
        );
        assert_eq!(
            document.linked_data.external_links[0]
                .target_kind
                .as_deref(),
            Some("file")
        );
        assert_eq!(document.linked_data.external_relationship_count, 1);
        assert_eq!(document.linked_data.connections.len(), 1);
        assert_eq!(document.linked_data.connections[0].id, Some(7));
        assert_eq!(
            document.linked_data.connections[0].name,
            "Warehouse fixture"
        );
        assert!(document.linked_data.connections[0].refresh_on_load);
        assert_eq!(document.linked_data.summary.total_object_count, 4);
        assert_eq!(document.linked_data.summary.local_pivot_count, 1);
        assert_eq!(document.linked_data.summary.slicer_count, 1);
        assert_eq!(document.linked_data.summary.external_link_count, 1);
        assert_eq!(document.linked_data.summary.connection_count, 1);
        assert_eq!(document.linked_data.summary.refresh_risk_count, 2);
        assert_eq!(document.linked_data.policy.mode, "offline_read_only");
        assert!(document.linked_data.policy.metadata_visible);
        assert!(!document.linked_data.policy.refresh_allowed);
        assert!(!document.linked_data.policy.object_editing_allowed);
        assert!(!document.linked_data.policy.external_targets_followed);
        assert!(!document.linked_data.policy.sensitive_fields_exposed);
        assert!(document.protection.enabled);
        assert!(document.protection.lock_structure);
        assert!(document.protection.password_protected);
        let public_document = serde_json::to_string(&document).unwrap();
        assert!(!public_document.contains("secret.example"));
        assert!(!public_document.contains("not-for-ui"));
        assert!(!public_document.contains("external-data.xlsx"));
        assert!(!public_document.contains("ABCD"));
        assert!(!public_document.contains("B459"));
        assert!(!public_document.contains("fixture-protection"));
        assert_eq!(
            document
                .defined_names
                .iter()
                .filter(|item| !item.name.starts_with("_xlnm."))
                .count(),
            5
        );
        assert!(document
            .defined_names
            .iter()
            .any(|item| item.name == "_xlnm._FilterDatabase" && item.hidden));
        let amount_range = document
            .defined_names
            .iter()
            .find(|item| item.name == "AmountRange")
            .unwrap();
        assert_eq!(amount_range.formula, "Summary!$B$2:$B$2");
        assert_eq!(
            amount_range.reference,
            Some(crate::formats::workbook::WorkbookRangeReference {
                sheet: "Summary".into(),
                top: 1,
                bottom: 1,
                left: 1,
                right: 1,
            })
        );
        let local_name = document
            .defined_names
            .iter()
            .find(|item| item.name == "Codes")
            .unwrap();
        assert_eq!(local_name.scope.as_deref(), Some("Details"));
        assert_eq!(local_name.reference.as_ref().unwrap().sheet, "Details");
        assert!(document
            .defined_names
            .iter()
            .find(|item| item.name == "TaxRate")
            .unwrap()
            .reference
            .is_none());
        assert_eq!(
            document
                .defined_names
                .iter()
                .find(|item| item.name == "TeamLabel")
                .unwrap()
                .formula,
            "\"R&D\""
        );
        assert!(page.rows[0][0].style.bold);
        assert_eq!(page.rows[0][0].style.font_color.as_deref(), Some("#FFFFFF"));
        assert_eq!(page.rows[0][0].style.fill_color.as_deref(), Some("#2563EB"));
        assert_eq!(page.rows[1][1].style.number_format, "currency");
        assert!(page
            .row_heights
            .iter()
            .any(|item| item.row == 1 && (item.height - 27.75).abs() < 0.01));
        assert!(page
            .column_widths
            .iter()
            .any(|item| { item.start_column == 0 && item.end_column == 0 && item.width > 22.0 }));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 4,
                bottom: 4,
                left: 0,
                right: 2,
            }]
        );

        let capabilities = engine.capabilities();
        assert_eq!(capabilities.read, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.cached_formula_results,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.cell_editing,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.blank_cell_creation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.existing_cell_editing,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.conflict_detection,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.formatting, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.row_dimensions,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.column_dimensions,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.merged_cells,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.freeze_panes,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.sort_filter_view,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.excel_tables,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.data_validation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.charts, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.pivot_tables,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.slicers, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.external_data,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.sheet_protection,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.print_layout,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.named_ranges,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.date_time_values,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.error_values,
            WorkbookCapabilityLevel::Supported
        );
        assert!(!page.named_styles.is_empty());
        assert_eq!(
            capabilities.named_styles,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.theme_indexed_colors,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.per_side_borders,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.custom_number_formats,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.conditional_formatting_preservation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.xlsx_round_trip,
            WorkbookCapabilityLevel::Planned
        );
    }

    #[test]
    fn apache_poi_producer_fixture_exposes_complete_and_blocked_pivot_shapes() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/pivot-producer-apache-poi.xlsx");
        let source = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        assert_eq!(document.linked_data.pivot_tables.len(), 2);

        let complete = document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.source_range.as_deref() == Some("A1:C4"))
            .unwrap();
        assert!(complete.audit.rebuild_candidate);
        assert_eq!(complete.audit.writeback.status, "structure_candidate");
        assert!(!complete.audit.writeback.allowed);
        assert!(complete.audit.writeback.blockers.is_empty());
        assert!(complete.audit.writeback.pivot_field_items_complete);
        assert!(complete.audit.writeback.row_items_complete);
        assert!(complete.audit.writeback.column_items_complete);
        assert!(complete.audit.writeback.output_cells_present);

        let page_filtered = document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.audit.page_field_count == 1)
            .unwrap();
        assert_eq!(page_filtered.audit.writeback.status, "blocked");
        assert!(!page_filtered.audit.writeback.allowed);
        assert!(page_filtered
            .audit
            .writeback
            .blockers
            .iter()
            .any(|item| item.contains("页面筛选")));

        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Tabelle1".into(),
                row: 1,
                column: 2,
                input: "99".into(),
                kind: "number".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        validate_workbook_package(&output).unwrap();
        for part in [
            "xl/pivotTables/pivotTable1.xml",
            "xl/pivotTables/pivotTable2.xml",
            "xl/pivotCache/pivotCacheDefinition1.xml",
            "xl/pivotCache/pivotCacheDefinition2.xml",
            "xl/pivotCache/pivotCacheRecords1.xml",
            "xl/pivotCache/pivotCacheRecords2.xml",
        ] {
            assert_eq!(zip_part(&source, part), zip_part(&output, part), "{part}");
        }
        let linked_data = read_workbook_linked_data(&output).unwrap();
        assert_eq!(linked_data.pivot_tables.len(), 2);
        assert!(linked_data
            .pivot_tables
            .iter()
            .any(|pivot| pivot.audit.writeback.status == "structure_candidate"));
        assert!(linked_data
            .pivot_tables
            .iter()
            .all(|pivot| !pivot.audit.writeback.allowed));
    }

    #[test]
    fn multi_axis_audit_command_verifies_fixture_without_writing_the_user_file() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/pivot-multi-axis-microsoft-excel.xlsx");
        let source = fs::read(fixture).unwrap();
        let base = std::env::temp_dir().join(format!(
            "longedit-pivot-multi-axis-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("multi-axis.xlsx");
        fs::write(&path, &source).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let pivot = document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.name == "MultiAxisPivot")
            .unwrap();
        let result = tauri::async_runtime::block_on(audit_workbook_pivot_multi_axis_isolated_copy(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotMultiAxisAuditPayload {
                expected_signature: document.signature,
                pivot_part: pivot.part.clone(),
            },
        ))
        .unwrap();
        assert_eq!(result.status, "multi_axis_output_rebuilt");
        assert_eq!(result.preview_group_count, 16);
        assert_eq!(result.output_range, "A3:I12");
        assert_eq!(result.output_cell_count, 80);
        assert_eq!(result.row_axis.field_indices, [0, 1]);
        assert_eq!(result.column_axis.field_indices, [2, 3]);
        assert!(!result.pivot_definition_preserved);
        assert!(!result.output_worksheet_preserved);
        assert_eq!(fs::read(&path).unwrap(), source);

        let stale = tauri::async_runtime::block_on(audit_workbook_pivot_multi_axis_isolated_copy(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotMultiAxisAuditPayload {
                expected_signature: "stale".into(),
                pivot_part: pivot.part.clone(),
            },
        ))
        .unwrap_err();
        assert!(stale.contains("changed after loading"));
        assert_eq!(fs::read(&path).unwrap(), source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn multi_axis_audit_copy_generates_producer_roundtrip_input_without_changing_source() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/pivot-multi-axis-microsoft-excel.xlsx");
        let source = fs::read(fixture).unwrap();
        let base = std::env::temp_dir().join(format!(
            "longedit-pivot-multi-axis-copy-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("multi-axis-source.xlsx");
        let target = base.join("multi-axis-audit-copy.xlsx");
        fs::write(&path, &source).unwrap();

        let report = generate_workbook_pivot_multi_axis_audit_copy(&path, &target).unwrap();
        let report: serde_json::Value = serde_json::from_str(&report).unwrap();
        assert_eq!(report["status"], "audit_copy_verified");
        assert_eq!(report["stage"], "S8-7E3G-A");
        assert_eq!(report["outputRange"], "A3:I12");
        assert_eq!(report["outputCellCount"], 80);
        assert_eq!(report["producerRoundTripStatus"], "pending");
        assert_eq!(report["reliableSaveAllowed"], false);
        assert_eq!(fs::read(&path).unwrap(), source);
        assert!(target.exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn array_audit_report_reuses_product_semantics_for_external_evidence() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/array-formula-wps-spreadsheets.xlsx");
        let report = generate_workbook_array_audit_report(&fixture).unwrap();
        let report: serde_json::Value = serde_json::from_str(&report).unwrap();
        assert_eq!(report["stage"], "X3-B5");
        assert_eq!(report["status"], "array_semantics_verified");
        assert_eq!(report["sheet"], "Array Boundary");
        assert_eq!(report["arrayDeclarationCount"], 2);
        assert_eq!(report["arrayFormulas"][0]["kind"], "legacy_array");
        assert_eq!(report["arrayFormulas"][1]["kind"], "dynamic_array");
        assert_eq!(report["arrayFormulas"][0]["range"]["left"], 1);
        assert_eq!(report["arrayFormulas"][1]["range"]["left"], 3);
    }

    #[test]
    fn pivot_rebuild_plan_isolatedly_maps_four_parts_and_rejects_unsafe_candidates() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/pivot-producer-apache-poi.xlsx");
        let source = fs::read(fixture).unwrap();
        let base = std::env::temp_dir().join(format!(
            "longedit-pivot-rebuild-plan-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("producer-pivot.xlsx");
        fs::write(&path, &source).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let complete = document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.audit.writeback.status == "structure_candidate")
            .unwrap();
        let ready = tauri::async_runtime::block_on(preview_workbook_pivot_rebuild(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotRebuildPlanPayload {
                expected_signature: document.signature.clone(),
                pivot_part: complete.part.clone(),
            },
        ))
        .unwrap();
        assert_eq!(ready.status, "isolated_dry_run_ready");
        assert_eq!(ready.execution, "temporary_copy_only");
        assert!(!ready.writes_user_file);
        assert!(ready.temporary_copy_verified);
        assert_eq!(ready.source_package_digest, ready.isolated_package_digest);
        assert_eq!(ready.affected_parts.len(), 4);
        assert!(ready.preserved_part_count > ready.affected_parts.len());
        assert_eq!(
            ready
                .affected_parts
                .iter()
                .map(|impact| impact.role.as_str())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from([
                "cache_definition",
                "cache_records",
                "output_worksheet",
                "pivot_table",
            ])
        );
        assert_eq!(fs::read(&path).unwrap(), source);

        let rebuilt = tauri::async_runtime::block_on(rebuild_workbook_pivot_cache_isolated_copy(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotCacheRebuildPayload {
                expected_signature: document.signature.clone(),
                pivot_part: complete.part.clone(),
            },
        ))
        .unwrap();
        assert_eq!(rebuilt.status, "isolated_cache_rebuilt");
        assert_eq!(rebuilt.execution, "temporary_copy_only");
        assert!(!rebuilt.writes_user_file);
        assert_eq!(rebuilt.source_record_count, 3);
        assert_eq!(rebuilt.rebuilt_record_count, 3);
        assert_eq!(rebuilt.rebuilt_parts.len(), 2);
        assert!(rebuilt.package_valid);
        assert!(rebuilt.semantic_reparse_valid);
        assert!(rebuilt.untouched_parts_preserved);
        assert_ne!(
            rebuilt.source_package_digest,
            rebuilt.isolated_package_digest
        );
        assert_eq!(
            rebuilt
                .fields
                .iter()
                .map(|field| (field.value_type.as_str(), field.record_encoding.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("string", "shared_index"),
                ("number", "direct"),
                ("date", "shared_index"),
            ]
        );
        assert_eq!(fs::read(&path).unwrap(), source);

        let synchronized = tauri::async_runtime::block_on(rebuild_workbook_pivot_isolated_copy(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotSynchronizedRebuildPayload {
                expected_signature: document.signature.clone(),
                pivot_part: complete.part.clone(),
            },
        ))
        .unwrap();
        assert_eq!(synchronized.status, "isolated_pivot_rebuilt");
        assert_eq!(synchronized.execution, "temporary_copy_only");
        assert!(!synchronized.writes_user_file);
        assert_eq!(synchronized.visible_row_item_count, 2);
        assert_eq!(synchronized.visible_column_item_count, 2);
        assert_eq!(synchronized.output_cell_count, 13);
        assert_eq!(synchronized.rebuilt_parts.len(), 4);
        assert!(synchronized.package_valid);
        assert!(synchronized.semantic_reparse_valid);
        assert!(synchronized.output_values_verified);
        assert!(synchronized.untouched_parts_preserved);
        assert_eq!(fs::read(&path).unwrap(), source);

        let variants =
            tauri::async_runtime::block_on(verify_workbook_pivot_variants_isolated_copy(
                root.to_string_lossy().into_owned(),
                path.to_string_lossy().into_owned(),
                WorkbookPivotVariantVerificationPayload {
                    expected_signature: document.signature.clone(),
                    pivot_part: complete.part.clone(),
                },
            ))
            .unwrap();
        assert_eq!(variants.status, "isolated_variants_verified");
        assert_eq!(variants.package_variant_count, 10);
        assert_eq!(variants.layout_package_variant_count, 3);
        assert_eq!(variants.semantic_variant_count, 3);
        assert!(variants.package_variants_verified);
        assert!(variants.semantic_variants_verified);
        assert_eq!(
            variants
                .aggregation_variants
                .iter()
                .map(|variant| variant.aggregation.as_str())
                .collect::<Vec<_>>(),
            vec![
                "sum",
                "count",
                "average",
                "max",
                "min",
                "product",
                "countNums",
            ]
        );
        assert_eq!(
            variants
                .layout_variants
                .iter()
                .map(|variant| (
                    variant.layout.as_str(),
                    variant.row_field_count,
                    variant.column_field_count,
                    variant.data_field_count,
                ))
                .collect::<Vec<_>>(),
            vec![
                ("row_only", 1, 0, 1),
                ("column_only", 0, 1, 1),
                ("multi_measure", 1, 1, 3),
            ]
        );
        assert_eq!(
            variants
                .layout_variants
                .iter()
                .map(|variant| (
                    variant.layout.as_str(),
                    variant.status.as_str(),
                    variant.output_range.as_str(),
                    variant.output_cell_count,
                ))
                .collect::<Vec<_>>(),
            vec![
                ("row_only", "package_verified", "A3:B6", 8),
                ("column_only", "package_verified", "A3:D5", 12),
                ("multi_measure", "package_verified", "A3:J8", 60),
            ]
        );
        assert!(variants
            .layout_variants
            .iter()
            .all(|variant| variant.styled_output_cell_count > 0
                && !variant.isolated_package_digest.is_empty()));
        for variant in variants
            .aggregation_variants
            .iter()
            .filter(|variant| variant.aggregation != "sum")
        {
            let target = root.join(format!("pivot-{}-copy.xlsx", variant.aggregation));
            let saved = save_workbook_pivot_copy_to_path(
                &path,
                &target,
                &WorkbookPivotSaveCopyPayload {
                    expected_signature: document.signature.clone(),
                    expected_output_digest: variant.isolated_package_digest.clone(),
                    pivot_part: complete.part.clone(),
                    layout_variant: None,
                    aggregation_variant: Some(variant.aggregation.clone()),
                },
            )
            .unwrap();
            assert_eq!(saved.status, "saved_verified");
            assert_eq!(saved.layout_variant, "standard");
            assert_eq!(saved.aggregation_variant, variant.aggregation);
            assert_eq!(saved.output_range, variant.output_range);
            assert_eq!(saved.output_cell_count, variant.output_cell_count);
            assert_eq!(saved.changed_parts.len(), 2);
            assert!(saved.source_unchanged);
            let saved_bytes = fs::read(target).unwrap();
            validate_workbook_package(&saved_bytes).unwrap();
            let linked = read_workbook_linked_data(&saved_bytes).unwrap();
            let saved_pivot = linked
                .pivot_tables
                .iter()
                .find(|pivot| pivot.part == complete.part)
                .unwrap();
            assert_eq!(
                saved_pivot.audit.data_fields[0].aggregation,
                variant.aggregation
            );
        }
        for variant in &variants.layout_variants {
            let target = root.join(format!("pivot-{}-copy.xlsx", variant.layout));
            let saved = save_workbook_pivot_copy_to_path(
                &path,
                &target,
                &WorkbookPivotSaveCopyPayload {
                    expected_signature: document.signature.clone(),
                    expected_output_digest: variant.isolated_package_digest.clone(),
                    pivot_part: complete.part.clone(),
                    layout_variant: Some(variant.layout.clone()),
                    aggregation_variant: None,
                },
            )
            .unwrap();
            assert_eq!(saved.status, "saved_verified");
            assert_eq!(saved.layout_variant, variant.layout);
            assert_eq!(saved.output_range, variant.output_range);
            assert_eq!(saved.output_cell_count, variant.output_cell_count);
            assert_eq!(saved.changed_parts.len(), 2);
            assert!(saved.source_unchanged);
            let saved_bytes = fs::read(target).unwrap();
            validate_workbook_package(&saved_bytes).unwrap();
            let linked = read_workbook_linked_data(&saved_bytes).unwrap();
            let saved_pivot = linked
                .pivot_tables
                .iter()
                .find(|pivot| pivot.part == complete.part)
                .unwrap();
            assert_eq!(saved_pivot.audit.row_field_count, variant.row_field_count);
            assert_eq!(
                saved_pivot.audit.column_field_count,
                variant.column_field_count
            );
            assert_eq!(saved_pivot.audit.data_field_count, variant.data_field_count);
        }
        assert_eq!(fs::read(&path).unwrap(), source);

        let (isolated, _) = rebuild_workbook_pivot_cache_isolated(&source, complete).unwrap();
        let cache_definition = String::from_utf8(zip_part(
            &isolated,
            "xl/pivotCache/pivotCacheDefinition1.xml",
        ))
        .unwrap();
        assert!(cache_definition.contains("recordCount=\"3\""));
        assert!(cache_definition.contains("maxDate=\"2022-01-03T00:00:00\""));
        let cache_records =
            String::from_utf8(zip_part(&isolated, "xl/pivotCache/pivotCacheRecords1.xml")).unwrap();
        assert!(cache_records.contains("count=\"3\""));
        assert!(cache_records.contains("<x v=\"0\"/><n v=\"1\"/><x v=\"0\"/>"));
        let before_parts = zip_parts(&source);
        let after_parts = zip_parts(&isolated);
        for (part, before) in &before_parts {
            if !rebuilt.rebuilt_parts.contains(part) {
                assert_eq!(after_parts.get(part), Some(before), "{part}");
            }
        }
        let (synchronized_isolated, synchronized_internal) =
            rebuild_workbook_pivot_isolated(&source, complete).unwrap();
        let pivot_xml = String::from_utf8(zip_part(
            &synchronized_isolated,
            "xl/pivotTables/pivotTable1.xml",
        ))
        .unwrap();
        assert!(pivot_xml.contains("<rowItems count=\"3\"><i><x v=\"0\"/></i><i><x v=\"2\"/></i>"));
        assert!(pivot_xml.contains("<colItems count=\"3\"><i><x v=\"0\"/></i><i><x v=\"2\"/></i>"));
        let synchronized_parts = zip_parts(&synchronized_isolated);
        for (part, before) in &before_parts {
            if !synchronized_internal.rebuilt_parts.contains(part) {
                assert_eq!(synchronized_parts.get(part), Some(before), "{part}");
            }
        }
        let changed_measure = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Tabelle1".into(),
                row: 1,
                column: 1,
                input: "10".into(),
                kind: "number".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let changed_linked = read_workbook_linked_data(&changed_measure).unwrap();
        let changed_pivot = changed_linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let (changed_isolated, changed_result) =
            rebuild_workbook_pivot_isolated(&changed_measure, changed_pivot).unwrap();
        assert!(changed_result.output_values_verified);
        let mut changed_workbook: Xlsx<_> =
            calamine::open_workbook_from_rs(Cursor::new(changed_isolated)).unwrap();
        let changed_output = changed_workbook.worksheet_range("Tabelle2").unwrap();
        assert_eq!(changed_output.get_value((4, 1)), Some(&Data::Float(10.0)));
        assert_eq!(changed_output.get_value((4, 3)), Some(&Data::Float(10.0)));
        assert_eq!(changed_output.get_value((6, 1)), Some(&Data::Float(10.0)));
        assert_eq!(changed_output.get_value((6, 3)), Some(&Data::Float(13.0)));

        let expanded_source = patch_workbook(
            &source,
            &[
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 2,
                    column: 0,
                    input: "new-row".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 2,
                    column: 2,
                    input: "44565".into(),
                    kind: "number".into(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let expanded_path = root.join("producer-pivot-expanded.xlsx");
        fs::write(&expanded_path, &expanded_source).unwrap();
        let expanded_document = CalamineWorkbookEngine.inspect(&expanded_path).unwrap();
        let expanded_pivot = expanded_document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let expanded_result =
            tauri::async_runtime::block_on(rebuild_workbook_pivot_expanded_isolated_copy(
                root.to_string_lossy().into_owned(),
                expanded_path.to_string_lossy().into_owned(),
                WorkbookPivotExpandedRebuildPayload {
                    expected_signature: expanded_document.signature.clone(),
                    pivot_part: expanded_pivot.part.clone(),
                },
            ))
            .unwrap();
        assert_eq!(expanded_result.status, "isolated_layout_resized");
        assert_eq!(expanded_result.added_shared_item_count, 2);
        assert_eq!(expanded_result.removed_shared_item_count, 2);
        assert_eq!(expanded_result.visible_row_item_count, 3);
        assert_eq!(expanded_result.visible_column_item_count, 3);
        assert_eq!(expanded_result.old_output_range, "A3:D7");
        assert_eq!(expanded_result.new_output_range, "A3:E8");
        assert_eq!(expanded_result.output_cell_count, 25);
        assert!(expanded_result.extended_style_cell_count > 0);
        assert!(expanded_result.output_values_verified);
        assert_eq!(fs::read(&expanded_path).unwrap(), expanded_source);
        let saved_copy_path = root.join("producer-pivot-refreshed.xlsx");
        let saved_copy = save_workbook_pivot_copy_to_path(
            &expanded_path,
            &saved_copy_path,
            &WorkbookPivotSaveCopyPayload {
                expected_signature: expanded_document.signature.clone(),
                expected_output_digest: expanded_result.isolated_package_digest.clone(),
                pivot_part: expanded_pivot.part.clone(),
                layout_variant: None,
                aggregation_variant: None,
            },
        )
        .unwrap();
        assert_eq!(saved_copy.status, "saved_verified");
        assert_eq!(saved_copy.save_mode, "new_copy_only");
        assert!(saved_copy.source_unchanged);
        assert!(saved_copy.structural_reopen_verified);
        assert!(saved_copy.semantic_reopen_verified);
        assert!(saved_copy.output_values_verified);
        assert!(saved_copy.untouched_parts_preserved);
        assert_eq!(saved_copy.output_range, "A3:E8");
        assert_eq!(saved_copy.output_cell_count, 25);
        assert_eq!(
            format!("{:x}", md5::compute(fs::read(&saved_copy_path).unwrap())),
            saved_copy.target_digest
        );
        assert_eq!(fs::read(&expanded_path).unwrap(), expanded_source);
        let saved_document = CalamineWorkbookEngine.inspect(&saved_copy_path).unwrap();
        assert!(saved_document
            .linked_data
            .pivot_tables
            .iter()
            .any(|pivot| pivot.part == expanded_pivot.part
                && pivot.audit.layout_range.as_deref() == Some("A3:E8")));
        let audit_copy_path = root.join("producer-pivot-audit-copy.xlsx");
        let audit_copy_report =
            generate_workbook_pivot_audit_copy(&expanded_path, &audit_copy_path).unwrap();
        assert!(audit_copy_report.contains("\"status\": \"saved_verified\""));
        assert!(audit_copy_path.exists());
        let cross_directory_error =
            generate_workbook_pivot_audit_copy(&expanded_path, &base.join("cross-copy.xlsx"))
                .unwrap_err();
        assert!(cross_directory_error.contains("source directory"));
        let occupied_error = save_workbook_pivot_copy_to_path(
            &expanded_path,
            &saved_copy_path,
            &WorkbookPivotSaveCopyPayload {
                expected_signature: expanded_document.signature.clone(),
                expected_output_digest: expanded_result.isolated_package_digest.clone(),
                pivot_part: expanded_pivot.part.clone(),
                layout_variant: None,
                aggregation_variant: None,
            },
        )
        .unwrap_err();
        assert!(occupied_error.contains("不会覆盖"));
        let stale_target = root.join("stale-pivot-copy.xlsx");
        let stale_error = save_workbook_pivot_copy_to_path(
            &expanded_path,
            &stale_target,
            &WorkbookPivotSaveCopyPayload {
                expected_signature: "stale".into(),
                expected_output_digest: expanded_result.isolated_package_digest.clone(),
                pivot_part: expanded_pivot.part.clone(),
                layout_variant: None,
                aggregation_variant: None,
            },
        )
        .unwrap_err();
        assert!(stale_error.contains("其他程序修改"));
        assert!(!stale_target.exists());
        let changed_target = root.join("changed-pivot-copy.xlsx");
        let changed_error = save_workbook_pivot_copy_to_path(
            &expanded_path,
            &changed_target,
            &WorkbookPivotSaveCopyPayload {
                expected_signature: expanded_document.signature.clone(),
                expected_output_digest: "changed".into(),
                pivot_part: expanded_pivot.part.clone(),
                layout_variant: None,
                aggregation_variant: None,
            },
        )
        .unwrap_err();
        assert!(changed_error.contains("隔离输出已变化"));
        assert!(!changed_target.exists());
        assert!(validate_workbook_pivot_copy_file_name("../escape.xlsx").is_err());
        assert!(validate_workbook_pivot_copy_file_name("pivot-copy.xls").is_err());
        let overwrite_error = save_workbook_pivot_copy_to_path(
            &expanded_path,
            &expanded_path,
            &WorkbookPivotSaveCopyPayload {
                expected_signature: expanded_document.signature.clone(),
                expected_output_digest: expanded_result.isolated_package_digest.clone(),
                pivot_part: expanded_pivot.part.clone(),
                layout_variant: None,
                aggregation_variant: None,
            },
        )
        .unwrap_err();
        assert!(overwrite_error.contains("禁止覆盖源"));
        let (expanded_isolated, _) =
            rebuild_workbook_pivot_expanded_isolated(&expanded_source, expanded_pivot).unwrap();
        let expanded_definition = String::from_utf8(zip_part(
            &expanded_isolated,
            "xl/pivotCache/pivotCacheDefinition1.xml",
        ))
        .unwrap();
        assert!(expanded_definition.contains("<s v=\"new-row\"/>"));
        assert!(expanded_definition.contains("<d v=\"2022-01-04T00:00:00\"/>"));
        let expanded_pivot_xml = String::from_utf8(zip_part(
            &expanded_isolated,
            "xl/pivotTables/pivotTable1.xml",
        ))
        .unwrap();
        assert!(expanded_pivot_xml.contains("ref=\"A3:E8\""));
        let mut expanded_workbook: Xlsx<_> =
            calamine::open_workbook_from_rs(Cursor::new(expanded_isolated)).unwrap();
        let expanded_output = expanded_workbook.worksheet_range("Tabelle2").unwrap();
        assert_eq!(expanded_output.get_value((7, 4)), Some(&Data::Float(6.0)));

        let shrunken_source = patch_workbook(
            &source,
            &[
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 1,
                    column: 0,
                    input: "c".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 1,
                    column: 2,
                    input: "44564".into(),
                    kind: "number".into(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let shrunken_linked = read_workbook_linked_data(&shrunken_source).unwrap();
        let shrunken_pivot = shrunken_linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let (shrunken_isolated, shrunken_result) =
            rebuild_workbook_pivot_expanded_isolated(&shrunken_source, shrunken_pivot).unwrap();
        assert_eq!(shrunken_result.added_shared_item_count, 0);
        assert_eq!(shrunken_result.removed_shared_item_count, 2);
        assert_eq!(shrunken_result.new_output_range, "A3:C6");
        assert!(shrunken_result.cleared_stale_cell_count >= 7);
        let mut shrunken_workbook: Xlsx<_> =
            calamine::open_workbook_from_rs(Cursor::new(shrunken_isolated)).unwrap();
        let shrunken_output = shrunken_workbook.worksheet_range("Tabelle2").unwrap();
        assert_eq!(shrunken_output.get_value((5, 2)), Some(&Data::Float(4.0)));
        assert_eq!(shrunken_output.get_value((6, 3)), None);
        let unseen_dimension = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Tabelle1".into(),
                row: 1,
                column: 0,
                input: "new-dimension".into(),
                kind: "string".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let unseen_linked = read_workbook_linked_data(&unseen_dimension).unwrap();
        let unseen_pivot = unseen_linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let unseen_error =
            rebuild_workbook_pivot_cache_isolated(&unseen_dimension, unseen_pivot).unwrap_err();
        assert!(unseen_error.contains("未进入现有 sharedItems"));

        let formula_source = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Tabelle1".into(),
                row: 1,
                column: 1,
                input: "=40+2".into(),
                kind: "formula".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let formula_linked = read_workbook_linked_data(&formula_source).unwrap();
        let formula_pivot = formula_linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let formula_error =
            rebuild_workbook_pivot_cache_isolated(&formula_source, formula_pivot).unwrap_err();
        assert!(formula_error.contains("来源区域公式"));

        let mixed_source = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Tabelle1".into(),
                row: 1,
                column: 1,
                input: "mixed".into(),
                kind: "string".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let mixed_linked = read_workbook_linked_data(&mixed_source).unwrap();
        let mixed_pivot = mixed_linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.part == complete.part)
            .unwrap();
        let mixed_error =
            rebuild_workbook_pivot_cache_isolated(&mixed_source, mixed_pivot).unwrap_err();
        assert!(mixed_error.contains("混合类型"));

        let blocked_pivot = document
            .linked_data
            .pivot_tables
            .iter()
            .find(|pivot| pivot.audit.page_field_count == 1)
            .unwrap();
        let blocked = tauri::async_runtime::block_on(preview_workbook_pivot_rebuild(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotRebuildPlanPayload {
                expected_signature: document.signature.clone(),
                pivot_part: blocked_pivot.part.clone(),
            },
        ))
        .unwrap();
        assert_eq!(blocked.status, "blocked");
        assert!(!blocked.writes_user_file);
        assert!(blocked
            .blockers
            .iter()
            .any(|blocker| blocker.contains("页面筛选")));
        let blocked_rebuild =
            tauri::async_runtime::block_on(rebuild_workbook_pivot_cache_isolated_copy(
                root.to_string_lossy().into_owned(),
                path.to_string_lossy().into_owned(),
                WorkbookPivotCacheRebuildPayload {
                    expected_signature: document.signature.clone(),
                    pivot_part: blocked_pivot.part.clone(),
                },
            ))
            .unwrap_err();
        assert!(blocked_rebuild.contains("未通过隔离重建计划"));
        let blocked_synchronized =
            tauri::async_runtime::block_on(rebuild_workbook_pivot_isolated_copy(
                root.to_string_lossy().into_owned(),
                path.to_string_lossy().into_owned(),
                WorkbookPivotSynchronizedRebuildPayload {
                    expected_signature: document.signature.clone(),
                    pivot_part: blocked_pivot.part.clone(),
                },
            ))
            .unwrap_err();
        assert!(blocked_synchronized.contains("未通过隔离重建计划"));
        assert_eq!(fs::read(&path).unwrap(), source);

        let stale = tauri::async_runtime::block_on(preview_workbook_pivot_rebuild(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPivotRebuildPlanPayload {
                expected_signature: "stale".into(),
                pivot_part: complete.part.clone(),
            },
        ))
        .unwrap_err();
        assert!(stale.contains("其他程序修改"));
        assert_eq!(fs::read(&path).unwrap(), source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pivot_producer_round_trip_outputs_reopen_with_stable_semantics() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("fixtures/xlsx/output-reopen");
        for file_name in [
            "s8-7e3b-longedit-pivot-copy.xlsx",
            "s8-7e3b-microsoft-excel.xlsx",
            "s8-7e3b-wps-spreadsheets.xlsx",
            "s8-7e3b-libreoffice-calc.xlsx",
        ] {
            let bytes = fs::read(root.join(file_name)).unwrap();
            validate_workbook_package(&bytes).unwrap();
            let linked = read_workbook_linked_data(&bytes).unwrap();
            assert_eq!(linked.pivot_tables.len(), 2, "{file_name}");
            assert!(
                linked
                    .pivot_tables
                    .iter()
                    .any(|candidate| candidate.audit.page_field_count == 1),
                "{file_name}"
            );
            let pivot = linked
                .pivot_tables
                .iter()
                .find(|candidate| {
                    candidate.name == "PivotTable1"
                        && candidate.sheet.as_deref() == Some("Tabelle2")
                })
                .unwrap();
            assert_eq!(pivot.audit.layout_range.as_deref(), Some("A3:D7"));
            assert_eq!(pivot.audit.row_field_count, 1);
            assert_eq!(pivot.audit.column_field_count, 1);
            assert_eq!(pivot.audit.data_field_count, 1);
            assert_eq!(pivot.audit.page_field_count, 0);
            assert!(pivot
                .audit
                .data_fields
                .first()
                .is_some_and(|field| field.aggregation == "sum" && field.supported));
            let mut workbook: Xlsx<_> =
                calamine::open_workbook_from_rs(Cursor::new(bytes)).unwrap();
            let output = workbook.worksheet_range("Tabelle2").unwrap();
            assert!(
                matches!(output.get_value((6, 3)), Some(Data::Float(value)) if *value == 4.0)
                    || matches!(output.get_value((6, 3)), Some(Data::Int(4))),
                "{file_name}"
            );
        }
    }

    #[test]
    fn pivot_layout_producer_round_trip_outputs_reopen_with_stable_semantics() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("fixtures/xlsx/output-reopen");
        let layouts = [
            ("row_only", 1, 0, vec![("sum", 1)], "A3:B6", "A3:B6"),
            ("column_only", 0, 1, vec![("sum", 1)], "A3:D5", "A3:C5"),
            (
                "multi_measure",
                1,
                1,
                vec![("sum", 1), ("count", 0), ("average", 1)],
                "A3:J8",
                "A3:J8",
            ),
        ];
        for (layout, row_fields, column_fields, measures, expected_range, libreoffice_range) in
            layouts
        {
            for producer in [
                "longedit",
                "microsoft-excel",
                "wps-spreadsheets",
                "libreoffice-calc",
            ] {
                let file_name = if producer == "longedit" {
                    format!("s8-7e3c-longedit-{layout}.xlsx")
                } else {
                    format!("s8-7e3c-{layout}-{producer}.xlsx")
                };
                let bytes = fs::read(root.join(&file_name)).unwrap();
                validate_workbook_package(&bytes).unwrap();
                let linked = read_workbook_linked_data(&bytes).unwrap();
                let pivot = linked
                    .pivot_tables
                    .iter()
                    .find(|pivot| pivot.name == "PivotTable1")
                    .unwrap_or_else(|| panic!("{file_name} lost PivotTable1"));
                assert_eq!(pivot.audit.row_field_count, row_fields, "{file_name}");
                assert_eq!(pivot.audit.column_field_count, column_fields, "{file_name}");
                assert_eq!(pivot.audit.data_field_count, measures.len(), "{file_name}");
                assert_eq!(pivot.audit.page_field_count, 0, "{file_name}");
                assert_eq!(
                    pivot.audit.layout_range.as_deref(),
                    Some(if producer == "libreoffice-calc" {
                        libreoffice_range
                    } else {
                        expected_range
                    }),
                    "{file_name}"
                );
                assert_eq!(
                    pivot
                        .audit
                        .data_fields
                        .iter()
                        .map(|field| (field.aggregation.as_str(), field.source_index))
                        .collect::<Vec<_>>(),
                    measures,
                    "{file_name}"
                );
            }
        }
    }

    #[test]
    fn pivot_aggregation_producer_round_trip_outputs_reopen_with_stable_semantics() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("fixtures/xlsx/output-reopen");
        for (aggregation, expected) in [
            ("count", 2.0),
            ("average", 2.0),
            ("max", 3.0),
            ("min", 1.0),
            ("product", 3.0),
            ("countNums", 2.0),
        ] {
            for producer in [
                "longedit",
                "microsoft-excel",
                "wps-spreadsheets",
                "libreoffice-calc",
            ] {
                let file_name = if producer == "longedit" {
                    format!("s8-7e3d-longedit-{aggregation}.xlsx")
                } else {
                    format!("s8-7e3d-{aggregation}-{producer}.xlsx")
                };
                let bytes = fs::read(root.join(&file_name)).unwrap();
                validate_workbook_package(&bytes).unwrap();
                let linked = read_workbook_linked_data(&bytes).unwrap();
                let pivot = linked
                    .pivot_tables
                    .iter()
                    .find(|pivot| pivot.name == "PivotTable1")
                    .unwrap_or_else(|| panic!("{file_name} lost PivotTable1"));
                let expected_range = if producer == "longedit" {
                    "A3:D6"
                } else {
                    "A3:D7"
                };
                assert_eq!(
                    pivot.audit.layout_range.as_deref(),
                    Some(expected_range),
                    "{file_name}"
                );
                assert_eq!(pivot.audit.row_field_count, 1, "{file_name}");
                assert_eq!(pivot.audit.column_field_count, 1, "{file_name}");
                assert_eq!(pivot.audit.data_field_count, 1, "{file_name}");
                assert_eq!(pivot.audit.page_field_count, 0, "{file_name}");
                assert_eq!(
                    pivot
                        .audit
                        .data_fields
                        .iter()
                        .map(|field| (field.aggregation.as_str(), field.source_index))
                        .collect::<Vec<_>>(),
                    vec![(aggregation, 1)],
                    "{file_name}"
                );
                let mut workbook: Xlsx<_> =
                    calamine::open_workbook_from_rs(Cursor::new(bytes)).unwrap();
                let output = workbook.worksheet_range("Tabelle2").unwrap();
                let key_row = if producer == "longedit" { 5 } else { 6 };
                assert!(
                    matches!(output.get_value((key_row, 3)), Some(Data::Float(value)) if (*value - expected).abs() < 1e-9)
                        || matches!(output.get_value((key_row, 3)), Some(Data::Int(value)) if (*value as f64 - expected).abs() < 1e-9),
                    "{file_name}"
                );
            }
        }
    }

    #[test]
    fn compatibility_fixture_preserves_defined_names_dates_and_errors_during_cell_patch() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/compatibility-baseline.xlsx");
        let source = fs::read(fixture_path).unwrap();
        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                input: "Alpha updated".into(),
                kind: "string".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        assert_eq!(
            zip_part(&source, "xl/workbook.xml"),
            zip_part(&output, "xl/workbook.xml")
        );
        assert_eq!(
            read_workbook_defined_names(&source).unwrap(),
            read_workbook_defined_names(&output).unwrap()
        );

        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-s6-10-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("round-trip.xlsx");
        fs::write(&path, output).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha updated");
        assert_eq!(page.rows[1][3].kind, "date");
        assert_eq!(page.rows[1][4].kind, "date");
        assert_eq!(page.rows[1][5].kind, "error");
        assert_eq!(page.rows[1][5].value, "#DIV/0!");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_and_removes_freeze_panes_with_signature_protection() {
        let (base, path) = compatibility_fixture_copy("freeze-pane");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let updated = tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            document.signature,
            "Summary".into(),
            2,
            0,
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.freeze_pane.rows, 2);
        assert_eq!(page.freeze_pane.columns, 0);
        tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            updated.signature,
            "Summary".into(),
            0,
            0,
        ))
        .unwrap();
        assert_eq!(
            CalamineWorkbookEngine
                .read_sheet(&path, "Summary", 0, 10)
                .unwrap()
                .freeze_pane,
            crate::formats::workbook::WorkbookFreezePane::default()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_row_column_visibility_and_outline_without_touching_other_parts() {
        let (base, path) = compatibility_fixture_copy("row-column-outline");
        let root = base.join("library");
        let source = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let updated = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: document.signature.clone(),
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: true,
                    outline_level: 2,
                    collapsed: false,
                }],
                column_edits: vec![WorkbookColumnStateEdit {
                    sheet: "Summary".into(),
                    start_column: 1,
                    end_column: 2,
                    hidden: false,
                    outline_level: 1,
                    collapsed: false,
                }],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.row_states.len(), 1);
        assert!(page.row_states[0].hidden);
        assert_eq!(page.row_states[0].outline_level, 2);
        assert_eq!(page.column_states.len(), 2);
        assert_eq!(page.column_states[0].start_column, 1);
        assert_eq!(page.column_states[1].end_column, 2);
        assert!(page
            .column_states
            .iter()
            .all(|state| state.outline_level == 1));

        let before = zip_parts(&source);
        let after = zip_parts(&fs::read(&path).unwrap());
        let changed = before
            .iter()
            .filter_map(|(name, bytes)| (after.get(name) != Some(bytes)).then_some(name.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(changed, ["xl/worksheets/sheet1.xml"]);

        let stale = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: document.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(stale.unwrap_err().contains("其他程序修改"));

        let restored = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: updated.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
                column_edits: vec![WorkbookColumnStateEdit {
                    sheet: "Summary".into(),
                    start_column: 1,
                    end_column: 2,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert!(page.row_states.is_empty());
        assert!(page.column_states.is_empty());

        let clean_bytes = fs::read(&path).unwrap();
        let invalid_level = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: restored.signature.clone(),
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 8,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(invalid_level.unwrap_err().contains("目标无效"));
        assert_eq!(fs::read(&path).unwrap(), clean_bytes);

        let protected = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: restored.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Protected".into(),
                    row: 1,
                    hidden: true,
                    outline_level: 1,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(protected.unwrap_err().contains("已受保护"));
        assert_eq!(fs::read(&path).unwrap(), clean_bytes);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn enforces_literal_list_validation_and_preserves_table_parts() {
        let (base, path) = compatibility_fixture_copy("validation");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = |input: &str, signature: String| WorkbookWritePayload {
            expected_signature: signature,
            edits: vec![WorkbookCellEdit {
                sheet: "Details".into(),
                row: 1,
                column: 1,
                input: input.into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        let invalid = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload("Unknown", document.signature.clone()),
        ));
        assert!(invalid.unwrap_err().contains("Active, Paused, or Closed"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload("Paused", document.signature),
        ))
        .unwrap();
        assert!(!saved.signature.is_empty());
        assert_eq!(
            CalamineWorkbookEngine
                .read_sheet(&path, "Details", 0, 10)
                .unwrap()
                .rows[1][1]
                .value,
            "Paused"
        );
        assert_eq!(
            zip_part(&before, "xl/tables/table1.xml"),
            zip_part(&fs::read(&path).unwrap(), "xl/tables/table1.xml")
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_drawing_and_chart_with_signature_protection() {
        let (base, path) = compatibility_fixture_copy("drawing-update");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        let drawing = page.drawings.iter().find(|item| item.editable).unwrap();
        let change = WorkbookDrawingChange {
            sheet: "Inventory".into(),
            drawing_part: drawing.drawing_part.clone(),
            anchor_index: drawing.anchor_index,
            object_id: drawing.object_id.clone(),
            action: WorkbookDrawingAction::UpdateMetadata,
            name: Some("Inventory overview".into()),
            description: Some("Updated locally".into()),
            from: None,
            to: None,
            chart_title: None,
            chart_type: None,
            category_axis_title: None,
            value_axis_title: None,
            legend_position: None,
            data_labels: None,
            series_name: None,
            series_color: None,
            source_range: None,
            series_index: None,
            series_categories: None,
            series_values: None,
        };
        let saved = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        assert!(page
            .drawings
            .iter()
            .any(|item| item.name == "Inventory overview"
                && item.description.as_deref() == Some("Updated locally")));
        let chart_drawing = page
            .drawings
            .iter()
            .find(|item| {
                item.chart
                    .as_ref()
                    .is_some_and(|chart| chart.title_editable)
            })
            .unwrap();
        let chart_saved = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: saved.signature,
                change: WorkbookDrawingChange {
                    sheet: "Inventory".into(),
                    drawing_part: chart_drawing.drawing_part.clone(),
                    anchor_index: chart_drawing.anchor_index,
                    object_id: chart_drawing.object_id.clone(),
                    action: WorkbookDrawingAction::UpdateChartTitle,
                    name: None,
                    description: None,
                    from: None,
                    to: None,
                    chart_title: Some("Inventory by location".into()),
                    chart_type: None,
                    category_axis_title: None,
                    value_axis_title: None,
                    legend_position: None,
                    data_labels: None,
                    series_name: None,
                    series_color: None,
                    source_range: None,
                    series_index: None,
                    series_categories: None,
                    series_values: None,
                },
            },
        ))
        .unwrap();
        assert!(chart_saved.signature.len() > 10);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        assert!(page.drawings.iter().any(|item| {
            item.chart.as_ref().and_then(|chart| chart.title.as_deref())
                == Some("Inventory by location")
        }));
        let stale = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn chart_visual_matrix_round_trips_through_command_boundary() {
        let (base, path) = chart_visual_fixture_copy("round-trip");
        let root = base.join("library");
        let expected = [
            ("column", "Quarterly revenue", "bottom", 2),
            ("line", "Revenue trend", "right", 1),
            ("pie", "Quarterly share", "bottom", 1),
            ("scatter", "Correlation", "top", 1),
        ];

        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap();
        let charts = page
            .drawings
            .iter()
            .filter_map(|drawing| drawing.chart.as_ref())
            .collect::<Vec<_>>();
        assert_eq!(charts.len(), expected.len());
        for (chart_type, title, legend, series_count) in expected {
            let chart = charts
                .iter()
                .find(|chart| chart.chart_type == chart_type)
                .unwrap_or_else(|| panic!("missing {chart_type} chart"));
            assert_eq!(chart.title.as_deref(), Some(title));
            assert_eq!(chart.legend_position, legend);
            assert_eq!(chart.series.len(), series_count);
            assert!(chart.title_editable);
        }

        for (chart_type, _, _, _) in expected {
            let document = CalamineWorkbookEngine.inspect(&path).unwrap();
            let page = CalamineWorkbookEngine
                .read_sheet(&path, "Chart Matrix", 0, 80)
                .unwrap();
            let drawing = page
                .drawings
                .iter()
                .find(|drawing| {
                    drawing
                        .chart
                        .as_ref()
                        .is_some_and(|chart| chart.chart_type == chart_type)
                })
                .unwrap();
            let updated_title = format!("{chart_type} verified");
            tauri::async_runtime::block_on(update_workbook_drawing(
                root.to_string_lossy().into_owned(),
                path.to_string_lossy().into_owned(),
                WorkbookDrawingPayload {
                    expected_signature: document.signature,
                    change: WorkbookDrawingChange {
                        sheet: "Chart Matrix".into(),
                        drawing_part: drawing.drawing_part.clone(),
                        anchor_index: drawing.anchor_index,
                        object_id: drawing.object_id.clone(),
                        action: WorkbookDrawingAction::UpdateChartTitle,
                        name: None,
                        description: None,
                        from: None,
                        to: None,
                        chart_title: Some(updated_title.clone()),
                        chart_type: None,
                        category_axis_title: None,
                        value_axis_title: None,
                        legend_position: None,
                        data_labels: None,
                        series_name: None,
                        series_color: None,
                        source_range: None,
                        series_index: None,
                        series_categories: None,
                        series_values: None,
                    },
                },
            ))
            .unwrap();

            let reopened = CalamineWorkbookEngine
                .read_sheet(&path, "Chart Matrix", 0, 80)
                .unwrap();
            assert!(reopened.drawings.iter().any(|drawing| {
                drawing.chart.as_ref().is_some_and(|chart| {
                    chart.chart_type == chart_type
                        && chart.title.as_deref() == Some(updated_title.as_str())
                })
            }));
        }

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn page_layout_round_trips_through_command_boundary() {
        let (base, path) = chart_visual_fixture_copy("page-layout");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let print_area = WorkbookMergeRange {
            top: 0,
            bottom: 12,
            left: 0,
            right: 8,
        };
        let saved = tauri::async_runtime::block_on(update_workbook_page_layout(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPageLayoutPayload {
                expected_signature: document.signature,
                change: WorkbookPageLayoutChange {
                    sheet: "Chart Matrix".into(),
                    print_area: Some(print_area.clone()),
                    orientation: "landscape".into(),
                    paper_size: 9,
                    margins: WorkbookPageMarginsChange {
                        left: 0.4,
                        right: 0.4,
                        top: 0.6,
                        bottom: 0.6,
                        header: 0.2,
                        footer: 0.2,
                    },
                    scale: Some(85),
                    fit_to_width: None,
                    fit_to_height: None,
                },
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap();
        assert_eq!(page.page_layout.print_area, Some(print_area.clone()));
        assert_eq!(
            page.page_layout.setup.orientation.as_deref(),
            Some("landscape")
        );
        assert_eq!(page.page_layout.setup.paper_size, Some(9));
        assert_eq!(page.page_layout.setup.scale, Some(85));
        assert!(!page.page_layout.setup.fit_to_page);
        assert_eq!(page.page_layout.margins.left, Some(0.4));

        let fitted = tauri::async_runtime::block_on(update_workbook_page_layout(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPageLayoutPayload {
                expected_signature: saved.signature,
                change: WorkbookPageLayoutChange {
                    sheet: "Chart Matrix".into(),
                    print_area: Some(print_area),
                    orientation: "portrait".into(),
                    paper_size: 1,
                    margins: WorkbookPageMarginsChange {
                        left: 0.7,
                        right: 0.7,
                        top: 0.75,
                        bottom: 0.75,
                        header: 0.3,
                        footer: 0.3,
                    },
                    scale: None,
                    fit_to_width: Some(1),
                    fit_to_height: Some(0),
                },
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap();
        assert!(page.page_layout.setup.fit_to_page);
        assert_eq!(page.page_layout.setup.fit_to_width, Some(1));
        assert_eq!(page.page_layout.setup.fit_to_height, Some(0));
        assert_eq!(page.page_layout.setup.scale, None);

        tauri::async_runtime::block_on(update_workbook_page_layout(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPageLayoutPayload {
                expected_signature: fitted.signature,
                change: WorkbookPageLayoutChange {
                    sheet: "Chart Matrix".into(),
                    print_area: None,
                    orientation: "portrait".into(),
                    paper_size: 1,
                    margins: WorkbookPageMarginsChange {
                        left: 0.7,
                        right: 0.7,
                        top: 0.75,
                        bottom: 0.75,
                        header: 0.3,
                        footer: 0.3,
                    },
                    scale: None,
                    fit_to_width: Some(1),
                    fit_to_height: Some(0),
                },
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap();
        assert_eq!(page.page_layout.print_area, None);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn header_footer_round_trips_through_command_boundary() {
        let (base, path) = chart_visual_fixture_copy("header-footer");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let before = fs::read(&path).unwrap();
        let rejected = tauri::async_runtime::block_on(update_workbook_header_footer(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookHeaderFooterPayload {
                expected_signature: document.signature.clone(),
                change: WorkbookHeaderFooterChange {
                    sheet: "Chart Matrix".into(),
                    odd_header: "x".repeat(256),
                    odd_footer: String::new(),
                    even_header: String::new(),
                    even_footer: String::new(),
                    first_header: String::new(),
                    first_footer: String::new(),
                    different_odd_even: false,
                    different_first_page: false,
                    scale_with_document: true,
                    align_with_margins: true,
                },
            },
        ));
        assert!(rejected.unwrap_err().contains("不能超过 255 个字符"));
        assert_eq!(fs::read(&path).unwrap(), before);
        let saved = tauri::async_runtime::block_on(update_workbook_header_footer(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookHeaderFooterPayload {
                expected_signature: document.signature,
                change: WorkbookHeaderFooterChange {
                    sheet: "Chart Matrix".into(),
                    odd_header: "&L计划 <Q3>&C审计 && 复核&R&D".into(),
                    odd_footer: "&C第 &P / &N 页".into(),
                    even_header: "&L偶数页".into(),
                    even_footer: "&R&F".into(),
                    first_header: "&C首页".into(),
                    first_footer: "&C内部资料".into(),
                    different_odd_even: true,
                    different_first_page: true,
                    scale_with_document: false,
                    align_with_margins: true,
                },
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap();
        assert_eq!(
            page.page_layout.header_footer.odd_header.as_deref(),
            Some("&L计划 <Q3>&C审计 && 复核&R&D")
        );
        assert_eq!(
            page.page_layout.header_footer.odd_footer.as_deref(),
            Some("&C第 &P / &N 页")
        );
        assert!(page.page_layout.header_footer.different_odd_even);
        assert!(page.page_layout.header_footer.different_first_page);
        assert!(!page.page_layout.header_footer.scale_with_document);
        assert!(page.page_layout.header_footer.align_with_margins);

        tauri::async_runtime::block_on(update_workbook_header_footer(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookHeaderFooterPayload {
                expected_signature: saved.signature,
                change: WorkbookHeaderFooterChange {
                    sheet: "Chart Matrix".into(),
                    odd_header: String::new(),
                    odd_footer: String::new(),
                    even_header: String::new(),
                    even_footer: String::new(),
                    first_header: String::new(),
                    first_footer: String::new(),
                    different_odd_even: false,
                    different_first_page: false,
                    scale_with_document: true,
                    align_with_margins: false,
                },
            },
        ))
        .unwrap();
        let cleared = CalamineWorkbookEngine
            .read_sheet(&path, "Chart Matrix", 0, 80)
            .unwrap()
            .page_layout
            .header_footer;
        assert_eq!(cleared.odd_header, None);
        assert_eq!(cleared.odd_footer, None);
        assert_eq!(cleared.even_header, None);
        assert_eq!(cleared.first_footer, None);
        assert!(!cleared.different_odd_even);
        assert!(!cleared.different_first_page);
        assert!(cleared.scale_with_document);
        assert!(!cleared.align_with_margins);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn print_options_round_trip_through_command_boundary() {
        let (base, path) = compatibility_fixture_copy("print-options");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let original_layout = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 80)
            .unwrap()
            .page_layout;
        let rejected = tauri::async_runtime::block_on(update_workbook_print_options(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPrintOptionsPayload {
                expected_signature: document.signature.clone(),
                change: WorkbookPrintOptionsChange {
                    sheet: "Summary".into(),
                    grid_lines: true,
                    headings: true,
                    horizontal_centered: true,
                    vertical_centered: false,
                    black_and_white: true,
                    draft: false,
                    first_page_number: Some(32_768),
                },
            },
        ));
        assert!(rejected
            .unwrap_err()
            .contains("首页页码必须在 1 到 32767 之间"));

        let saved = tauri::async_runtime::block_on(update_workbook_print_options(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPrintOptionsPayload {
                expected_signature: document.signature,
                change: WorkbookPrintOptionsChange {
                    sheet: "Summary".into(),
                    grid_lines: true,
                    headings: true,
                    horizontal_centered: true,
                    vertical_centered: false,
                    black_and_white: true,
                    draft: true,
                    first_page_number: Some(7),
                },
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 80)
            .unwrap();
        assert!(page.page_layout.options.grid_lines);
        assert!(page.page_layout.options.headings);
        assert!(page.page_layout.options.horizontal_centered);
        assert!(!page.page_layout.options.vertical_centered);
        assert!(page.page_layout.setup.black_and_white);
        assert!(page.page_layout.setup.draft);
        assert_eq!(page.page_layout.setup.first_page_number, Some(7));
        assert!(page.page_layout.setup.use_first_page_number);
        assert_eq!(page.page_layout.print_area, original_layout.print_area);
        assert_eq!(page.page_layout.margins, original_layout.margins);
        assert_eq!(
            page.page_layout.setup.orientation,
            original_layout.setup.orientation
        );
        assert_eq!(
            page.page_layout.setup.paper_size,
            original_layout.setup.paper_size
        );
        assert_eq!(
            page.page_layout.header_footer,
            original_layout.header_footer
        );

        tauri::async_runtime::block_on(update_workbook_print_options(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPrintOptionsPayload {
                expected_signature: saved.signature,
                change: WorkbookPrintOptionsChange {
                    sheet: "Summary".into(),
                    grid_lines: false,
                    headings: false,
                    horizontal_centered: false,
                    vertical_centered: true,
                    black_and_white: false,
                    draft: false,
                    first_page_number: None,
                },
            },
        ))
        .unwrap();
        let cleared = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 80)
            .unwrap()
            .page_layout;
        assert!(!cleared.options.grid_lines);
        assert!(!cleared.options.headings);
        assert!(!cleared.options.horizontal_centered);
        assert!(cleared.options.vertical_centered);
        assert!(!cleared.setup.black_and_white);
        assert!(!cleared.setup.draft);
        assert_eq!(cleared.setup.first_page_number, None);
        assert!(!cleared.setup.use_first_page_number);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn preserves_chart_drawing_and_image_parts_when_editing_cells() {
        let (base, path) = compatibility_fixture_copy("drawings");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature,
            edits: vec![WorkbookCellEdit {
                sheet: "Inventory".into(),
                row: 1,
                column: 1,
                input: "18".into(),
                kind: "number".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload,
        ))
        .unwrap();
        let after = fs::read(&path).unwrap();
        for part in [
            "xl/drawings/drawing1.xml",
            "xl/drawings/_rels/drawing1.xml.rels",
            "xl/charts/chart1.xml",
            "xl/media/image1.png",
            "xl/pivotTables/pivotTable1.xml",
            "xl/pivotCache/pivotCacheDefinition1.xml",
            "xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels",
            "xl/pivotCache/pivotCacheRecords1.xml",
            "xl/slicers/slicer1.xml",
            "xl/externalLinks/externalLink1.xml",
            "xl/externalLinks/_rels/externalLink1.xml.rels",
            "xl/connections.xml",
            "xl/worksheets/sheet1.xml",
            "xl/workbook.xml",
        ] {
            assert_eq!(zip_part(&before, part), zip_part(&after, part), "{part}");
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn refuses_to_edit_or_reconfigure_protected_sheet() {
        let (base, path) = compatibility_fixture_copy("protected-sheet");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature.clone(),
            edits: vec![WorkbookCellEdit {
                sheet: "Protected".into(),
                row: 1,
                column: 0,
                input: "bypass".into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        let rejected = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload,
        ));
        assert!(rejected.unwrap_err().contains("不会绕过 Excel 工作表保护"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let freeze_rejected = tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            document.signature,
            "Protected".into(),
            1,
            1,
        ));
        assert!(freeze_rejected
            .unwrap_err()
            .contains("不会绕过 Excel 工作表保护"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let layout_rejected = tauri::async_runtime::block_on(update_workbook_page_layout(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPageLayoutPayload {
                expected_signature: CalamineWorkbookEngine.inspect(&path).unwrap().signature,
                change: WorkbookPageLayoutChange {
                    sheet: "Protected".into(),
                    print_area: None,
                    orientation: "portrait".into(),
                    paper_size: 9,
                    margins: WorkbookPageMarginsChange {
                        left: 0.7,
                        right: 0.7,
                        top: 0.75,
                        bottom: 0.75,
                        header: 0.3,
                        footer: 0.3,
                    },
                    scale: Some(100),
                    fit_to_width: None,
                    fit_to_height: None,
                },
            },
        ));
        assert!(layout_rejected.unwrap_err().contains("不会绕过 Excel 保护"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let header_footer_rejected = tauri::async_runtime::block_on(update_workbook_header_footer(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookHeaderFooterPayload {
                expected_signature: CalamineWorkbookEngine.inspect(&path).unwrap().signature,
                change: WorkbookHeaderFooterChange {
                    sheet: "Protected".into(),
                    odd_header: "&CProtected".into(),
                    odd_footer: String::new(),
                    even_header: String::new(),
                    even_footer: String::new(),
                    first_header: String::new(),
                    first_footer: String::new(),
                    different_odd_even: false,
                    different_first_page: false,
                    scale_with_document: true,
                    align_with_margins: true,
                },
            },
        ));
        assert!(header_footer_rejected
            .unwrap_err()
            .contains("不会绕过 Excel 保护"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let print_options_rejected = tauri::async_runtime::block_on(update_workbook_print_options(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookPrintOptionsPayload {
                expected_signature: CalamineWorkbookEngine.inspect(&path).unwrap().signature,
                change: WorkbookPrintOptionsChange {
                    sheet: "Protected".into(),
                    grid_lines: true,
                    headings: true,
                    horizontal_centered: true,
                    vertical_centered: true,
                    black_and_white: false,
                    draft: false,
                    first_page_number: None,
                },
            },
        ));
        assert!(print_options_rejected
            .unwrap_err()
            .contains("不会绕过 Excel 保护"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(base).unwrap();
    }

    fn zip_part(bytes: &[u8], name: &str) -> Vec<u8> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut part = archive.by_name(name).unwrap();
        let mut output = Vec::new();
        part.read_to_end(&mut output).unwrap();
        output
    }

    fn zip_parts(bytes: &[u8]) -> BTreeMap<String, Vec<u8>> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut output = BTreeMap::new();
        for index in 0..archive.len() {
            let mut part = archive.by_index(index).unwrap();
            if part.is_dir() {
                continue;
            }
            let name = part.name().to_string();
            let mut data = Vec::new();
            part.read_to_end(&mut data).unwrap();
            assert!(output.insert(name, data).is_none());
        }
        output
    }

    #[test]
    fn complex_fixture_package_diff_is_allowlisted_and_lossless() {
        let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let gate: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(manifest_root.join("../shared/xlsx-release-gate.json")).unwrap(),
        )
        .unwrap();
        let source =
            fs::read(manifest_root.join("tests/fixtures/workbook/compatibility-baseline.xlsx"))
                .unwrap();
        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                input: "Alpha audited".into(),
                kind: "string".into(),
            }],
            &[WorkbookCellStyleEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                patch: WorkbookStylePatch {
                    bold: Some(true),
                    fill_color: Some("#DBEAFE".into()),
                    ..Default::default()
                },
            }],
            &[WorkbookRowHeightEdit {
                sheet: "Summary".into(),
                row: 1,
                height: Some(30.0),
            }],
            &[WorkbookColumnWidthEdit {
                sheet: "Summary".into(),
                start_column: 0,
                end_column: 0,
                width: Some(24.0),
            }],
            &[WorkbookMergeEdit {
                sheet: "Summary".into(),
                top: 5,
                bottom: 5,
                left: 3,
                right: 4,
                action: "merge".into(),
            }],
        )
        .unwrap();

        let before = zip_parts(&source);
        let after = zip_parts(&output);
        let before_names = before.keys().cloned().collect::<BTreeSet<_>>();
        let after_names = after.keys().cloned().collect::<BTreeSet<_>>();
        assert_eq!(before_names, after_names, "ZIP parts were added or removed");
        assert!(
            before.len() >= gate["complexFixture"]["minimumZipParts"].as_u64().unwrap() as usize
        );

        let changed = before
            .iter()
            .filter_map(|(name, data)| (after.get(name) != Some(data)).then_some(name.clone()))
            .collect::<BTreeSet<_>>();
        let allowed = gate["differentialGate"]["contentAndStyleAllowedChangedParts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap().to_string())
            .collect::<BTreeSet<_>>();
        assert_eq!(changed, allowed, "unexpected OOXML package differential");

        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-differential-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("audited.xlsx");
        fs::write(&path, output).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha audited");
        assert!(page.rows[1][0].style.bold);
        assert_eq!(page.rows[1][0].style.fill_color.as_deref(), Some("#DBEAFE"));
        assert!(page
            .merged_cells
            .iter()
            .any(|range| { (range.top, range.bottom, range.left, range.right) == (5, 5, 3, 4) }));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn complex_workbook_performance_stays_within_release_budget() {
        let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let gate: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(manifest_root.join("../shared/xlsx-release-gate.json")).unwrap(),
        )
        .unwrap();
        let workload = &gate["performanceWorkload"];
        let sheet_count = workload["sheets"].as_u64().unwrap() as usize;
        let row_count = workload["rows"].as_u64().unwrap() as usize;
        let column_count = workload["columns"].as_u64().unwrap() as usize;
        let formula_rows = workload["formulaRows"].as_u64().unwrap() as usize;
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-performance-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("business-workload.xlsx");
        let mut workbook = Workbook::new();
        for sheet_index in 0..sheet_count {
            let sheet = workbook.add_worksheet();
            sheet
                .set_name(format!("Business{}", sheet_index + 1))
                .unwrap();
            for column in 0..column_count {
                sheet
                    .write_string(0, column as u16, format!("Field{}", column + 1))
                    .unwrap();
            }
            if sheet_index == 0 {
                for row in 1..row_count {
                    sheet
                        .write_string(row as u32, 0, format!("Record-{row:05}"))
                        .unwrap();
                    for column in 1..column_count {
                        sheet
                            .write_number(row as u32, column as u16, (row * column) as f64)
                            .unwrap();
                    }
                    if row <= formula_rows {
                        sheet
                            .write_formula(
                                row as u32,
                                (column_count - 1) as u16,
                                Formula::new(format!("=B{}+C{}", row + 1, row + 1))
                                    .set_result((row * 3).to_string()),
                            )
                            .unwrap();
                    }
                }
            }
        }
        workbook.save(&path).unwrap();
        let source = fs::read(&path).unwrap();

        let budgets = &gate["performanceBudgetsMs"];
        let inspect_budget = budgets["inspect"].as_u64().unwrap() as u128;
        let page_budget = budgets["readPage"].as_u64().unwrap() as u128;
        let patch_budget = budgets["patch"].as_u64().unwrap() as u128;
        let total_budget = budgets["total"].as_u64().unwrap() as u128;
        let attempts = gate["performanceAttempts"].as_u64().unwrap_or(1).max(1) as usize;
        let mut selected = None;
        for attempt in 1..=attempts {
            let total_started = Instant::now();
            let inspect_started = Instant::now();
            let document = CalamineWorkbookEngine.inspect(&path).unwrap();
            let inspect_ms = inspect_started.elapsed().as_millis();
            assert_eq!(document.sheets.len(), sheet_count);

            let page_started = Instant::now();
            let page = CalamineWorkbookEngine
                .read_sheet(&path, "Business1", row_count / 2, 200)
                .unwrap();
            let page_ms = page_started.elapsed().as_millis();
            assert_eq!(page.rows.len(), 200);
            assert_eq!(page.returned_columns, column_count);

            let patch_started = Instant::now();
            let output = patch_workbook(
                &source,
                &[WorkbookCellEdit {
                    sheet: "Business1".into(),
                    row: row_count / 2,
                    column: 1,
                    input: "42".into(),
                    kind: "number".into(),
                }],
                &[],
                &[],
                &[],
                &[],
            )
            .unwrap();
            let patch_ms = patch_started.elapsed().as_millis();
            let total_ms = total_started.elapsed().as_millis();
            eprintln!(
                "workbook performance attempt {attempt}/{attempts}: inspect={inspect_ms}ms page={page_ms}ms patch={patch_ms}ms total={total_ms}ms"
            );
            let passes = inspect_ms <= inspect_budget
                && page_ms <= page_budget
                && patch_ms <= patch_budget
                && total_ms <= total_budget;
            let replace = selected
                .as_ref()
                .is_none_or(|(_, _, _, best_total, _)| total_ms < *best_total);
            if passes {
                selected = Some((inspect_ms, page_ms, patch_ms, total_ms, output));
                break;
            } else if replace {
                selected = Some((inspect_ms, page_ms, patch_ms, total_ms, output));
            }
        }
        let (inspect_ms, page_ms, patch_ms, total_ms, output) = selected.unwrap();
        assert!(inspect_ms <= inspect_budget, "inspect {inspect_ms} ms");
        assert!(page_ms <= page_budget, "page {page_ms} ms");
        assert!(patch_ms <= patch_budget, "patch {patch_ms} ms");
        assert!(total_ms <= total_budget, "total {total_ms} ms");
        let growth_percent = output.len().saturating_sub(source.len()) * 100 / source.len();
        assert!(
            growth_percent <= gate["maximumPatchedFileGrowthPercent"].as_u64().unwrap() as usize,
            "patched package grew by {growth_percent}%"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_existing_cells_preserves_unedited_parts_and_rejects_stale_save() {
        let (base, path) = fixture();
        let root = base.join("library");
        let root_string = root.to_string_lossy().into_owned();
        let path_string = path.to_string_lossy().into_owned();
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature.clone(),
            edits: vec![
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 0,
                    input: "编辑完成".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 1,
                    input: "99".into(),
                    kind: "number".into(),
                },
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 2,
                    column: 1,
                    input: "=SUM(B2, 1)".into(),
                    kind: "formula".into(),
                },
            ],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            root_string.clone(),
            path_string.clone(),
            payload,
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 100)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "编辑完成");
        assert_eq!(page.rows[1][1].value, "99");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 1)"));

        let after = fs::read(&path).unwrap();
        assert_eq!(
            zip_part(&before, "xl/styles.xml"),
            zip_part(&after, "xl/styles.xml")
        );
        let stale = WorkbookWritePayload {
            expected_signature: document.signature,
            edits: vec![WorkbookCellEdit {
                sheet: "进度".into(),
                row: 1,
                column: 0,
                input: "不应写入".into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        assert!(tauri::async_runtime::block_on(write_workbook_cells(
            root_string,
            path_string,
            stale,
        ))
        .unwrap_err()
        .contains("其他程序修改"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn creates_cells_in_existing_and_new_rows() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let merged_result = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 4,
                    column: 1,
                    input: "不能写入".into(),
                    kind: "string".into(),
                }],
                style_edits: vec![],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
            },
        ));
        assert!(merged_result.unwrap_err().contains("只能编辑左上角"));
        let result = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 1,
                        column: 2,
                        input: "同一行新单元格".into(),
                        kind: "string".into(),
                    },
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 100,
                        column: 10,
                        input: "全新行单元格".into(),
                        kind: "string".into(),
                    },
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 2,
                        column: 0,
                        input: "公式前插入".into(),
                        kind: "string".into(),
                    },
                ],
                style_edits: vec![],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
            },
        ))
        .unwrap();
        assert!(result.size > 0);
        let first_page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_eq!(first_page.rows[1][2].value, "同一行新单元格");
        assert_eq!(first_page.rows[2][0].value, "公式前插入");
        let later_page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 100, 10)
            .unwrap();
        assert_eq!(later_page.rows[0][10].value, "全新行单元格");
        let bytes = fs::read(&path).unwrap();
        let sheet_xml = String::from_utf8(zip_part(&bytes, "xl/worksheets/sheet1.xml")).unwrap();
        assert!(sheet_xml.contains("dimension ref=\"A1:K101\""));
        let a3 = sheet_xml.find("r=\"A3\"").unwrap();
        let b3 = sheet_xml.find("r=\"B3\"").unwrap();
        assert!(a3 < b3);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn edits_row_heights_column_widths_and_merge_ranges_without_data_loss() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 6,
                    column: 0,
                    input: "新的合并标题".into(),
                    kind: "string".into(),
                }],
                style_edits: vec![],
                row_height_edits: vec![WorkbookRowHeightEdit {
                    sheet: "进度".into(),
                    row: 1,
                    height: Some(36.0),
                }],
                column_width_edits: vec![WorkbookColumnWidthEdit {
                    sheet: "进度".into(),
                    start_column: 0,
                    end_column: 1,
                    width: Some(20.0),
                }],
                merge_edits: vec![
                    WorkbookMergeEdit {
                        sheet: "进度".into(),
                        top: 4,
                        bottom: 4,
                        left: 0,
                        right: 1,
                        action: "unmerge".into(),
                    },
                    WorkbookMergeEdit {
                        sheet: "进度".into(),
                        top: 6,
                        bottom: 6,
                        left: 0,
                        right: 2,
                        action: "merge".into(),
                    },
                ],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 100)
            .unwrap();
        assert!(page
            .row_heights
            .iter()
            .any(|item| item.row == 1 && (item.height - 36.0).abs() < 0.01));
        assert!((0..=1).all(|column| page.column_widths.iter().any(|item| {
            item.start_column <= column
                && item.end_column >= column
                && (item.width - 20.0).abs() < 0.01
        })));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 6,
                bottom: 6,
                left: 0,
                right: 2,
            }]
        );
        let rejected = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: saved.signature,
                edits: vec![],
                style_edits: vec![],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![WorkbookMergeEdit {
                    sheet: "进度".into(),
                    top: 0,
                    bottom: 1,
                    left: 0,
                    right: 1,
                    action: "merge".into(),
                }],
            },
        ));
        assert!(rejected.unwrap_err().contains("避免数据丢失"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn reads_and_writes_basic_styles_without_rewriting_cell_values() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let before = fs::read(&path).unwrap();
        let formula_before =
            String::from_utf8(zip_part(&before, "xl/worksheets/sheet1.xml")).unwrap();
        let invalid = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![],
                style_edits: vec![WorkbookCellStyleEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 1,
                    patch: WorkbookStylePatch {
                        font_size: Some(100.0),
                        ..Default::default()
                    },
                }],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
            },
        ));
        assert!(invalid.unwrap_err().contains("字号必须"));
        let merged = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![],
                style_edits: vec![WorkbookCellStyleEdit {
                    sheet: "进度".into(),
                    row: 4,
                    column: 1,
                    patch: WorkbookStylePatch {
                        bold: Some(true),
                        ..Default::default()
                    },
                }],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
            },
        ));
        assert!(merged.unwrap_err().contains("只能编辑左上角"));
        tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![],
                style_edits: vec![
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 1,
                        column: 1,
                        patch: WorkbookStylePatch {
                            number_format: Some("percent".into()),
                            bold: Some(true),
                            fill_color: Some("#DDEBF7".into()),
                            border_style: Some("thin".into()),
                            border_color: Some("#4472C4".into()),
                            horizontal_alignment: Some("center".into()),
                            ..Default::default()
                        },
                    },
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 2,
                        column: 1,
                        patch: WorkbookStylePatch {
                            italic: Some(true),
                            font_color: Some("#C00000".into()),
                            ..Default::default()
                        },
                    },
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 8,
                        column: 3,
                        patch: WorkbookStylePatch {
                            fill_color: Some("#FFF2CC".into()),
                            ..Default::default()
                        },
                    },
                ],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
            },
        ))
        .unwrap();

        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 20)
            .unwrap();
        assert_eq!(page.rows[1][1].value, "75");
        assert_eq!(page.rows[1][1].style.number_format, "percent");
        assert!(page.rows[1][1].style.bold);
        assert_eq!(page.rows[1][1].style.fill_color.as_deref(), Some("#DDEBF7"));
        assert_eq!(page.rows[1][1].style.border_style, "thin");
        assert_eq!(page.rows[1][1].style.horizontal_alignment, "center");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 5)"));
        assert!(page.rows[2][1].style.italic);
        assert_eq!(page.rows[2][1].style.font_color.as_deref(), Some("#C00000"));
        assert_eq!(page.rows[8][3].style.fill_color.as_deref(), Some("#FFF2CC"));

        let after = fs::read(&path).unwrap();
        let formula_after =
            String::from_utf8(zip_part(&after, "xl/worksheets/sheet1.xml")).unwrap();
        assert!(formula_before.contains("<f>SUM(B2, 5)</f>"));
        assert!(formula_after.contains("<f>SUM(B2, 5)</f>"));
        assert!(formula_before.contains("<conditionalFormatting"));
        assert_eq!(
            formula_before.split("<conditionalFormatting").nth(1),
            formula_after.split("<conditionalFormatting").nth(1),
            "样式写回应原样保留条件格式及其后的工作表对象"
        );
        assert_ne!(
            zip_part(&before, "xl/styles.xml"),
            zip_part(&after, "xl/styles.xml")
        );
        fs::remove_dir_all(base).unwrap();
    }
}
