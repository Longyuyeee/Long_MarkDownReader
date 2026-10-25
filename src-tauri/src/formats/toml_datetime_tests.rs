use super::*;

fn edit(source: &str, path: &str, value: &str) -> Result<String, String> {
    let analysis = analyze_toml_source(source);
    assert!(analysis.valid, "{:?}", analysis.diagnostics);
    let entry = analysis.outline.iter().find(|e| e.path == path).unwrap();
    assert!(entry.editable);
    replace_toml_value_source(source, entry.start, entry.end, value)
}

#[test]
fn all_four_datetime_kinds_are_editable_with_exact_raw_ranges() {
    for value in ["2024-02-29", "01:02", "07:32:00.123456789", "1979-05-27T07:32:00", "1979-05-27T07:32:00.123456789-07:00"] {
        let s = format!("# 中文😀\nwhen = {value} # 保留\nother=0xFF\n");
        let a = analyze_toml_source(&s);
        assert!(a.valid);
        let e = a.outline.iter().find(|e| e.path == "when").unwrap();
        assert!(e.editable);
        assert_eq!(&s[e.start..e.end], value);
        assert_eq!(e.preview, value);
        assert_eq!(e.edit_unavailable_reason, None);
        assert_eq!(edit(&s, "when", value).unwrap(), s);
    }
}

#[test]
fn preserves_precision_separator_offset_and_unrelated_bytes() {
    let s = "\u{feff}# 未保存 中文😀\r\n\"a.b\"  =  1979-05-27T07:32:00.123456789Z # 时区\r\nnext = '原稿'\r\n";
    for value in ["2026-10-25t15:04:05.123456789+08:00", "2026-10-25 15:04:05.000001-00:00", "2026-10-25T15:04:05z", "2024-02-29", "15:04:05.000000001", "2026-10-25T15:04:05.100000000"] {
        assert_eq!(edit(s, "[\"a.b\"]", value).unwrap(), s.replace("1979-05-27T07:32:00.123456789Z", value));
    }
}

#[test]
fn changes_only_owned_value_in_tables_dotted_and_array_table_fields() {
    let s = "same=1979-05-27\n[a]\nsame=1979-05-27\n[b]\nsame=1979-05-27\n[[servers]]\nsame=1979-05-27\n[[servers]]\nsame=1979-05-27";
    let a = analyze_toml_source(s);
    for e in a.outline.iter().filter(|e| e.kind == "value") {
        assert_eq!(edit(s, &e.path, "2024-02-29").unwrap(), format!("{}2024-02-29{}", &s[..e.start], &s[e.end..]));
    }
    assert_eq!(edit("a.b = 07:32:00\n", "a.b", "08:01:02.000001").unwrap(), "a.b = 08:01:02.000001\n");
}

#[test]
fn invalid_calendar_and_time_stay_local_and_leave_original_unchanged() {
    let s = "when = 1979-05-27T07:32:00Z # unchanged\n";
    for value in ["2024-13-01", "2024-00-01", "2024-02-30", "2023-02-29", "25:01:02", "01:60:00", "2024-01-01T24:00:00", "2024-01-01T01:02:03+25:00", "2024-01-01T01:02:03+08:60", "not a date"] {
        let error = edit(s, "when", value).expect_err(value);
        assert!(error.contains("输入与草稿已保留"), "{value}: {error}");
    }
    assert_eq!(edit(s, "when", "2024-02-29T07:32:00+08:00").unwrap(), s.replace("1979-05-27T07:32:00Z", "2024-02-29T07:32:00+08:00"));
}

#[test]
fn cannot_inject_fields_comments_or_complex_structures() {
    for v in ["2024-02-29\nx=2", "2024-02-29 # hide", "2024-02-29\n[t]\nx=2", "[2024-02-29]", "{day=2024-02-29}", ""] {
        assert!(edit("when=1979-05-27\n", "when", v).is_err(), "{v}");
    }
}

#[test]
fn primitives_and_type_changes_still_use_literal_source_without_serialization() {
    let s = "when=1979-05-27\nnumber=0xFF\ntext='内容😀'\nflag=true\n";
    for v in ["'2024-02-29'", "42", "true", "2024-02-29", "07:32:00", "1979-05-27 07:32:00", "1979-05-27T07:32:00-07:00"] {
        assert_eq!(edit(s, "when", v).unwrap(), s.replacen("1979-05-27", v, 1));
        assert_eq!(edit(s, "number", v).unwrap(), s.replace("0xFF", v));
    }
}

#[test]
fn rejects_stale_partial_utf8_ranges_and_over_budget_input() {
    let s = "name='中文😀'\nwhen=2024-02-29\n";
    let e = analyze_toml_source(s).outline.into_iter().find(|e| e.path == "when").unwrap();
    for (start,end) in [(e.start+1,e.end),(e.start,e.end-1),(8,10),(usize::MAX,usize::MAX)] {
        assert!(replace_toml_value_source(s,start,end,"2026-10-25").is_err());
    }
    assert!(replace_toml_value_source(s,e.start,e.end,&"1".repeat(MAX_TOML_SOURCE_BYTES+1)).unwrap_err().contains("大小上限"));
    assert!(replace_toml_value_source("when=\n",5,6,"2024-02-29").is_err());
}

#[test]
fn consecutive_edits_and_inverse_keep_full_current_draft() {
    let s = "# 我的草稿😀\nwhen=1979-05-27T07:32:00Z # retain\nnext=0xFF";
    let first = edit(s,"when","2026-10-25T15:04:05.123456789+08:00").unwrap();
    let second = edit(&first,"when","2024-02-29").unwrap();
    assert_eq!(second,s.replace("1979-05-27T07:32:00Z","2024-02-29"));
    assert_eq!(edit(&second,"when","1979-05-27T07:32:00Z").unwrap(),s);
}
