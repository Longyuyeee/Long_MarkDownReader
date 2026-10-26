use super::*;

fn range(s: &str, path: &str) -> (usize, usize) {
    let a = analyze_toml_source(s);
    assert!(a.valid, "{s:?}: {:?}", a.diagnostics);
    let e = a.outline.iter().find(|e| e.path == path).unwrap();
    assert!(e.multiline_basic && !e.literal && e.editable);
    (e.start, e.end)
}
fn inspect(s: &str, path: &str) -> String {
    let (a, b) = range(s, path);
    inspect_toml_literal_source(s, a, b).unwrap()
}
fn edit(s: &str, path: &str, text: &str) -> String {
    let (a, b) = range(s, path);
    replace_toml_literal_source(s, a, b, text).unwrap()
}

#[test]
fn parser_prefill_decodes_escapes_unicode_and_line_continuation() {
    let s = "x=\"\"\"\n第一行\\n\\u4E2D\\U0001F600\\t\\\"\\\\\n接续\\\n   不换行\"\"\"\n";
    assert_eq!(inspect(s, "x"), "第一行\n中😀\t\"\\\n接续不换行");
}
#[test]
fn no_op_keeps_original_escape_spelling_bom_crlf_and_closing_quotes() {
    for s in [
        "x=\"\"\"\\u4e2d\\n原文\"\"\"",
        "x=\"\"\"\n文字\"\"\"\"\" # two trailing quotes\n",
        "\u{feff}x=\"\"\"\r\n接续\\\r\n  文字\r\n\"\"\"\r\n",
    ] {
        assert_eq!(edit(s, "x", &inspect(s, "x")), s);
    }
}
#[test]
fn quote_delimiters_backslashes_and_literal_escape_text_are_roundtripped() {
    let s = "x=\"\"\"原文\"\"\" # 保留\nkeep='其他'\n";
    for body in [
        "\"",
        "\"\"",
        "\"\"\"",
        "末尾\"\"\"\"",
        "\\",
        "\\n\\u4E2D",
        "C:\\new\\资料",
        "\\\n第二行",
        "'''",
        "[table]\nx=1\n# 只是正文",
    ] {
        let result = edit(s, "x", body);
        assert_eq!(inspect(&result, "x"), body);
        assert!(result.ends_with(" # 保留\nkeep='其他'\n"));
    }
}
#[test]
fn leading_and_trailing_blank_lines_spaces_and_unicode_are_preserved() {
    for s in ["x=\"\"\"原文\"\"\"\n", "x=\"\"\"\n原文\n\"\"\"\n"] {
        for body in [
            "",
            "\n",
            "\n\n",
            " 第一行😀\n第二行  \n\n",
            "\t缩进\n",
            "中文💡é\u{301}",
        ] {
            assert_eq!(inspect(&edit(s, "x", body), "x"), body);
        }
    }
}
#[test]
fn all_control_characters_except_lf_remain_exact_text_via_escapes() {
    let s = "x=\"\"\"原文\"\"\"\n";
    for c in (0..=31).chain([127]) {
        let body = format!("前{}后", char::from_u32(c).unwrap());
        assert_eq!(inspect(&edit(s, "x", &body), "x"), body);
    }
}
#[test]
fn opening_form_and_lf_crlf_are_kept_without_touching_neighbor_bytes() {
    for eol in ["\n", "\r\n"] {
        for opening in ["", eol] {
            let s = format!(
                "\u{feff}# 保留{eol}x = \"\"\"{opening}原文\"\"\" # 尾注{eol}hex=0xFF{eol}"
            );
            let changed = edit(&s, "x", "修改\n第二行");
            assert_eq!(changed, s.replace("原文", &format!("修改{eol}第二行")));
        }
    }
}
#[test]
fn nested_dotted_quoted_and_array_table_fields_have_exact_ownership() {
    for (s, p) in [
        ("[nested]\nx=\"\"\"旧\"\"\"\n", "nested.x"),
        ("a.b=\"\"\"旧\"\"\"\n", "a.b"),
        ("'中文'=\"\"\"旧\"\"\"\n", "[\"中文\"]"),
        (
            "[[rows]]\nx=\"\"\"旧\"\"\"\n[[rows]]\nx=\"\"\"其他\"\"\"\n",
            "rows[0].x",
        ),
    ] {
        assert_eq!(edit(s, p, "新😀\n正文"), s.replacen("旧", "新😀\n正文", 1));
    }
}
#[test]
fn untouched_scalars_dates_comments_and_literal_blocks_keep_exact_bytes() {
    let s = "# before\nx=\"\"\"原文\"\"\" # after\nnan=nan\nhex=0xFF\ndate=2026-10-26\nliteral='''原文'''\na=[1, 0x02]\n";
    assert_eq!(edit(s, "x", "修改"), s.replacen("原文", "修改", 1));
}
#[test]
fn stale_partial_nonstring_and_array_item_ranges_are_local_rejections() {
    let s = "x=\"\"\"中文😀\"\"\"\ny=\"普通\"\nz=[\"\"\"数组\"\"\"]\n";
    let (a, b) = range(s, "x");
    for (start, end) in [(a + 1, b), (a, b - 1), (usize::MAX, b), (a, b + 1)] {
        assert!(inspect_toml_literal_source(s, start, end).is_err());
        assert!(replace_toml_literal_source(s, start, end, "新").is_err());
    }
    for e in analyze_toml_source(s)
        .outline
        .iter()
        .filter(|e| !e.multiline_basic)
    {
        assert!(inspect_toml_literal_source(s, e.start, e.end).is_err());
    }
    assert!(replace_toml_literal_source("x=[", a, b, "新").is_err());
}
#[test]
fn readable_body_corpus_is_exact_after_parse() {
    let pieces = ["", "\n", "\"", "\\", "😀", "\t", "尾 ", "\u{0}"];
    for a in pieces {
        for b in pieces {
            for c in pieces {
                let body = format!("{a}{b}{c}");
                assert_eq!(inspect(&edit("x=\"\"\"旧\"\"\"\n", "x", &body), "x"), body);
            }
        }
    }
}
#[test]
fn budgets_reject_expanded_escaped_output_without_changing_source() {
    let s = "x=\"\"\"旧\"\"\"\n";
    let (a, b) = range(s, "x");
    assert!(replace_toml_literal_source(s, a, b, &"a".repeat(MAX_TOML_SOURCE_BYTES + 1)).is_err());
    assert!(
        replace_toml_literal_source(s, a, b, &"\u{0}".repeat(MAX_TOML_SOURCE_BYTES / 6)).is_err()
    );
    assert_eq!(inspect(s, "x"), "旧");
}
#[test]
fn installed_fixture_roundtrips_with_existing_draft_in_lf_and_crlf() {
    let fixture = include_str!("../../tests/fixtures/formats/toml-basic-edit.toml")
        .replace("\r\n", "\n")
        .replace("原稿", "我的草稿");
    for eol in ["\n", "\r\n"] {
        let s = fixture.replace('\n', eol);
        assert_eq!(inspect(&s, "text"), "第一行😀\n第二行");
        assert_eq!(
            edit(&s, "text", "第一行😀\n修改后的第二行"),
            s.replace("第二行", "修改后的第二行")
        );
    }
}
