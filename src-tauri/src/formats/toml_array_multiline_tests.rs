use super::*;

fn array(source: &str, path: &str) -> TomlOutlineEntry {
    let analysis = analyze_toml_source(source);
    assert!(analysis.valid, "{source:?}: {:?}", analysis.diagnostics);
    analysis
        .outline
        .into_iter()
        .find(|e| e.path == path && e.array)
        .unwrap()
}
fn item(source: &str, path: &str, index: usize) -> TomlArrayItem {
    let e = array(source, path);
    inspect_toml_array_items_source(source, e.start, e.end)
        .unwrap()
        .remove(index)
}
fn text(source: &str, path: &str, index: usize) -> String {
    let e = item(source, path, index);
    inspect_toml_literal_source(source, e.start, e.end).unwrap()
}
fn edit(source: &str, path: &str, index: usize, value: &str) -> String {
    let e = item(source, path, index);
    assert!(e.editable && (e.literal || e.multiline_basic));
    replace_toml_literal_source(source, e.start, e.end, value)
        .unwrap_or_else(|error| panic!("{source:?} => {value:?}: {error}"))
}
#[test]
fn flags_and_decoded_prefill_identify_only_multiline_strings() {
    let s = "items = [\"\"\"转义\\n中\\u4E2D\\\\目录\"\"\", '''字面\\n文字''', 0xFF, 2026-10-26]\n";
    let a = item(s, "items", 0);
    assert!(a.multiline_basic && !a.literal && a.editable);
    let b = item(s, "items", 1);
    assert!(b.literal && !b.multiline_basic && b.editable);
    for i in [2, 3] {
        let e = item(s, "items", i);
        assert!(e.editable && !e.literal && !e.multiline_basic);
    }
    assert_eq!(text(s, "items", 0), "转义\n中中\\目录");
    assert_eq!(text(s, "items", 1), "字面\\n文字");
}
#[test]
fn only_selected_token_changes_with_comments_commas_and_numeric_spellings() {
    let s = "# 中文😀\nitems = [\n  \"\"\"first\nline\"\"\", # attached\n  '''same''', # keep\n  0xFF, 9007199254740993,\n]\nother = true\n";
    let r = edit(s, "items", 0, "新的😀\n第二行");
    assert_eq!(r, s.replace("first\nline", "新的😀\n第二行"));
    assert_eq!(text(&r, "items", 1), "same");
    let r = edit(&r, "items", 1, "new\nsecond");
    assert!(r.contains("'''new\nsecond''', # keep\n  0xFF, 9007199254740993,"));
}
#[test]
fn no_op_keeps_raw_escapes_opening_newlines_and_continuation_spelling() {
    for s in [
        "items = [\"\"\"a\\u4E2D\\nline\"\"\", 1]\n",
        "items = [\"\"\"\na\\\n   b\"\"\"]",
        "items = ['''\nfirst\nsecond''', true]\n",
    ] {
        let original = text(s, "items", 0);
        assert_eq!(edit(s, "items", 0, &original), s);
    }
}
#[test]
fn basic_quotes_backslashes_controls_and_fake_toml_remain_text() {
    let s = "items = [\"\"\"old\"\"\", 0xFF]\nother = true\n";
    for value in [
        "引号\"\"\"与\\目录\n下一行",
        "\\\n下一行",
        "控制\0\u{7f}\r\t",
        "\n\n开头\n\n",
        "\"\"\"], injected = true\n[evil]\na = 1",
        "末尾\"\"",
    ] {
        let r = edit(s, "items", 0, value);
        assert_eq!(text(&r, "items", 0), value);
        assert!(r.ends_with(", 0xFF]\nother = true\n"));
    }
}
#[test]
fn literal_invalid_delimiters_and_controls_reject_without_losing_original() {
    let s = "items = ['''old''', 1]\n";
    let e = item(s, "items", 0);
    for value in ["invalid'''delimiter", "invalid\0text", "invalid\rtext"] {
        assert!(replace_toml_literal_source(s, e.start, e.end, value).is_err());
    }
    assert_eq!(text(s, "items", 0), "old");
}
#[test]
fn bom_crlf_and_missing_final_newline_survive_repeated_edits() {
    for delimiter in ["\"\"\"", "'''"] {
        let s = format!(
            "\u{feff}# 中文😀\r\nitems = [{delimiter}\r\n原稿\r\n第二行{delimiter}, 1] # keep"
        );
        let r = edit(&s, "items", 0, "新😀\r\n第二行\r\n");
        assert_eq!(text(&r, "items", 0), "新😀\n第二行\n");
        assert!(r.starts_with("\u{feff}# 中文😀\r\n"));
        assert!(!r.replace("\r\n", "").contains('\n'));
        assert!(!r.ends_with('\n'));
        let r = edit(&r, "items", 0, "");
        let r = edit(&r, "items", 0, "\nnew\n");
        assert_eq!(text(&r, "items", 0), "\nnew\n");
    }
}
#[test]
fn nested_tables_and_quoted_keys_select_one_array_and_one_item() {
    let s = "'a.b' = ['''same''', '''same''']\n[section]\nitems = [\"\"\"same\"\"\"]\n";
    let r = edit(s, "[\"a.b\"]", 1, "新\n文");
    assert_eq!(text(&r, "[\"a.b\"]", 0), "same");
    assert_eq!(text(&r, "section.items", 0), "same");
    let r = edit(&r, "section.items", 0, "other");
    assert_eq!(text(&r, "[\"a.b\"]", 1), "新\n文");
    assert_eq!(text(&r, "section.items", 0), "other");
}
#[test]
fn complex_nested_inline_dotted_and_array_table_ownership_stays_source_only() {
    for (s, path) in [
        ("items = ['''old''', [1]]\n", "items"),
        ("items = [\"\"\"old\"\"\", {a=1}]\n", "items"),
        ("a.items = ['''old''']\n", "a.items"),
    ] {
        let e = array(s, path);
        if let Ok(items) = inspect_toml_array_items_source(s, e.start, e.end) {
            let i = &items[0];
            assert!(!i.literal && !i.multiline_basic && !i.editable);
            assert!(inspect_toml_literal_source(s, i.start, i.end).is_err());
            assert!(replace_toml_literal_source(s, i.start, i.end, "new").is_err());
        }
    }
    let s = "items = [[\"\"\"old\"\"\"]]\n";
    let start = s.find("\"\"\"").unwrap();
    let end = start + 9;
    assert!(inspect_toml_literal_source(s, start, end).is_err());
    assert!(replace_toml_literal_source(s, start, end, "new").is_err());
}
#[test]
fn primitive_siblings_still_edit_with_multiline_neighbors() {
    let s = "items = ['''keep\ntext''', 0xFF, true] # comment\n";
    let a = array(s, "items");
    let i = item(s, "items", 1);
    let r = replace_toml_array_item_source(s, a.start, a.end, i.start, i.end, "42").unwrap();
    assert_eq!(r.content, s.replace("0xFF", "42"));
    let i = item(s, "items", 0);
    assert!(replace_toml_array_item_source(s, a.start, a.end, i.start, i.end, "'short'").is_err());
}
#[test]
fn stale_ranges_invalid_source_and_source_budget_keep_source_unchanged() {
    let s = "items = [\"\"\"old\"\"\", true]\n";
    let e = item(s, "items", 0);
    assert!(inspect_toml_literal_source(s, e.start + 1, e.end).is_err());
    assert!(replace_toml_literal_source(s, e.start, e.end - 1, "new").is_err());
    assert!(replace_toml_literal_source("items = [broken", 0, 4, "new").is_err());
    assert!(
        replace_toml_literal_source(s, e.start, e.end, &"x".repeat(MAX_TOML_SOURCE_BYTES + 1))
            .is_err()
    );
}
#[test]
fn mixed_body_corpus_roundtrips_both_string_forms() {
    let parts = [
        "plain",
        "中文😀",
        "  code",
        "\tcode",
        "# text",
        "\\path",
        "",
        "  ",
    ];
    for delimiter in ["\"\"\"", "'''"] {
        let s = format!("items = [{delimiter}old{delimiter}, 0xFF] # keep\n");
        for a in parts {
            for b in parts {
                for ending in ["", "\n", "\n\n", "\n\n\n"] {
                    let v = format!("{a}\n{b}{ending}");
                    let r = edit(&s, "items", 0, &v);
                    assert_eq!(text(&r, "items", 0), v);
                    assert!(r.ends_with(", 0xFF] # keep\n"));
                }
            }
        }
    }
}
