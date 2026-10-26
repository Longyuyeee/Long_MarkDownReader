use super::*;

fn range(s: &str, path: &str) -> (usize, usize) {
    let a = analyze_toml_source(s);
    assert!(a.valid, "{s:?}: {:?}", a.diagnostics);
    let e = a.outline.iter().find(|e| e.path == path).unwrap();
    assert!(e.literal && e.editable);
    (e.start, e.end)
}
fn inspect(s: &str, path: &str) -> String {
    let (a, b) = range(s, path);
    inspect_toml_literal_source(s, a, b).unwrap()
}
fn edit(s: &str, path: &str, value: &str) -> String {
    let (a, b) = range(s, path);
    replace_toml_literal_source(s, a, b, value).unwrap()
}

#[test]
fn readable_prefill_uses_parser_text_and_not_quotes_or_trimmed_spaces() {
    let s = "text = '''\n  中文😀\nC:\\folder # 内容\n尾部  \n''' # 保留\n";
    assert_eq!(inspect(s, "text"), "  中文😀\nC:\\folder # 内容\n尾部  \n");
}
#[test]
fn no_op_preserves_exact_source_with_bom_crlf_quotes_and_no_eof_newline() {
    for s in [
        "x='''inline'''",
        "x='''\n原文\n''' # 注释\n",
        "x='''两个引号'''''",
        "\u{feff}x='''\r\n中文😀\r\n'''\r\n",
    ] {
        assert_eq!(edit(s, "x", &inspect(s, "x")), s);
    }
}
#[test]
fn only_selected_string_changes_preserving_comments_dates_nan_and_number_spellings() {
    let s="# before\nx = '''原文''' # after\nhex = 0xFF\nnan = nan\ndate = 2026-10-26\nother = '保留'\n";
    assert_eq!(
        edit(s, "x", "正文\n第二行"),
        s.replace("'''原文'''", "'''正文\n第二行'''")
    );
}
#[test]
fn leading_trailing_blank_lines_spaces_and_one_or_two_quotes_roundtrip_exactly() {
    for source in ["x='''原文'''\n", "x='''\n原文\n'''\n"] {
        for value in [
            "",
            "\n",
            "\n\n",
            " 第一行\n第二行  \n\n",
            "'开头",
            "''开头",
            "末尾'",
            "末尾''",
            "\t正文\n",
        ] {
            let changed = edit(source, "x", value);
            assert_eq!(inspect(&changed, "x"), value);
        }
    }
}
#[test]
fn existing_opening_newline_and_document_line_endings_are_kept() {
    for eol in ["\n", "\r\n"] {
        let s = format!("\u{feff}# 注释{eol}x = '''{eol}原文{eol}''' # 头尾{eol}n=1{eol}");
        let expected = s.replace(&format!("原文{eol}"), &format!("修改{eol}第二行{eol}"));
        assert_eq!(edit(&s, "x", "修改\r\n第二行\r\n"), expected);
    }
}
#[test]
fn nested_dotted_quoted_and_array_table_fields_have_unambiguous_ownership() {
    for (s, path) in [
        ("[nested]\nx='''原文'''\nnext=2\n", "nested.x"),
        ("a.b='''原文'''\nnext=2\n", "a.b"),
        ("'中文'='''原文'''\nnext=2\n", "[\"中文\"]"),
        ("[[rows]]\nx='''原文'''\nnext=2\n", "rows[0].x"),
    ] {
        let changed = edit(s, path, "第一行😀\n第二行");
        assert_eq!(changed, s.replace("'''原文'''", "'''第一行😀\n第二行'''"));
        assert_eq!(inspect(&changed, path), "第一行😀\n第二行");
    }
}
#[test]
fn text_that_looks_like_toml_remains_one_string() {
    let s = "x='''原文'''\nkeep=1\n";
    let value = "[table]\nkey = 1\n# 注释只是文字\n'''不是分隔符".replace("'''", "''");
    let changed = edit(s, "x", &value);
    assert_eq!(inspect(&changed, "x"), value);
    assert_eq!(analyze_toml_source(&changed).value_count, 2);
}
#[test]
fn invalid_delimiters_and_controls_are_local_rejections_with_source_unchanged() {
    let s = "x='''原文'''\n";
    let (a, b) = range(s, "x");
    for value in [
        "中'''文",
        "\u{0}",
        "\u{b}",
        "\u{c}",
        "\u{d}",
        "\u{1f}",
        "\u{7f}",
    ] {
        assert!(replace_toml_literal_source(s, a, b, value).is_err());
    }
    assert_eq!(inspect(s, "x"), "原文");
}
#[test]
fn stale_partial_and_nonliteral_ranges_never_edit_other_values() {
    let s = "x='''中文😀'''\ny=\"普通\"\nz=[ '''数组''' ]\n";
    let (a, b) = range(s, "x");
    for (start, end) in [(a + 1, b), (a, b - 1), (usize::MAX, b), (a, b + 1)] {
        assert!(replace_toml_literal_source(s, start, end, "新").is_err());
        assert!(inspect_toml_literal_source(s, start, end).is_err());
    }
    for e in analyze_toml_source(s).outline.iter().filter(|e| !e.literal) {
        assert!(inspect_toml_literal_source(s, e.start, e.end).is_err());
    }
    assert!(replace_toml_literal_source("x = [", a, b, "新").is_err());
}
#[test]
fn budgets_and_installed_fixture_are_verified_for_lf_and_crlf() {
    let fixture = include_str!("../../tests/fixtures/formats/toml-literal-edit.toml")
        .replace("\r\n", "\n")
        .replace("原稿", "我的草稿");
    for eol in ["\n", "\r\n"] {
        let s = fixture.replace('\n', eol);
        assert_eq!(
            edit(&s, "text", "第一行😀\n修改后的第二行"),
            s.replace("第二行", "修改后的第二行")
        );
    }
    let s = "x='''原文'''\n";
    let (a, b) = range(s, "x");
    assert!(replace_toml_literal_source(s, a, b, &"a".repeat(MAX_TOML_SOURCE_BYTES + 1)).is_err());
    assert!(!analyze_toml_source(&"a".repeat(MAX_TOML_SOURCE_BYTES + 1)).valid);
}
