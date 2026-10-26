use super::*;

fn field(s: &str, path: &str) -> TomlField {
    analyze_toml_source(s)
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .unwrap()
        .field
        .unwrap()
}
fn copy(s: &str, path: &str, name: &str) -> Result<TomlKeyChange, String> {
    let f = field(s, path);
    copy_toml_field_source(s, f.start, f.end, name)
}
fn moved(s: &str, path: &str, direction: &str) -> Result<TomlKeyChange, String> {
    let f = field(s, path);
    move_toml_field_source(s, f.start, f.end, direction)
}

#[test]
fn copy_raw_literal_basic_escapes_and_closing_comment_without_serializing() {
    for raw in [
        "'''第一行😀\n第二行'''",
        "\"\"\"转义\\n\\u4E2D\\\\路径\n段落\"\"\"",
        "\"\"\"末尾\n\"\"\"\"\"",
    ] {
        let s = format!("label='原稿'\ntext = {raw} # attached\nother = 8_080\n");
        let c = copy(&s, "text", "next").unwrap();
        assert_eq!(
            c.content,
            s.replacen("other =", &format!("next = {raw} # attached\nother ="), 1)
        );
        assert_eq!(&c.content[c.start..c.end], "next");
    }
}

#[test]
fn move_literal_basic_and_scalar_siblings_carries_owned_comment_and_reverses() {
    let a = "a = '''first\nline''' # first";
    let b = "b = \"\"\"second\\nline\"\"\" # second";
    let s = format!("label=1\n{a}\n\n# independent\n\n{b}\nc = 0xFF # number\n");
    let c = moved(&s, "a", "down").unwrap();
    assert_eq!(
        c.content,
        format!("label=1\n{b}\n\n# independent\n\n{a}\nc = 0xFF # number\n")
    );
    assert_eq!(&c.content[c.start..c.end], "a");
    assert_eq!(moved(&c.content, "a", "up").unwrap().content, s);
    let c = moved(&s, "c", "up").unwrap();
    assert_eq!(
        c.content,
        s.replace(
            &format!("{b}\nc = 0xFF # number"),
            &format!("c = 0xFF # number\n{b}")
        )
    );
}

#[test]
fn nested_table_bom_crlf_indent_and_literal_dotted_key_stay_exact() {
    let s = "\u{feff}# 中文😀\r\n[root.child]\r\n \t'a.b' = '''first\r\nline''' # first\r\n  next = 0xFF # next\r\n[other]\r\nx = 8_080\r\n";
    let c = copy(s, "root.child[\"a.b\"]", "新.名😀").unwrap();
    assert_eq!(
        c.content,
        s.replace(
            "  next =",
            " \t'新.名😀' = '''first\r\nline''' # first\r\n  next ="
        )
    );
    assert_eq!(&c.content[c.start..c.end], "'新.名😀'");
    let c = moved(s, "root.child.next", "up").unwrap();
    assert_eq!(
        moved(&c.content, "root.child.next", "down")
            .unwrap()
            .content,
        s
    );
}

#[test]
fn opening_newline_hash_body_empty_and_missing_final_newline_are_preserved() {
    for raw in [
        "'''\n# body\n\ntext\n'''",
        "\"\"\"\n\"\"\"",
        "''''''",
        "\"\"\"text\\\n   continued\n\"\"\"",
    ] {
        let s = format!("label=1\ntext = {raw} # keep");
        let c = copy(&s, "text", "new").unwrap();
        assert_eq!(c.content, format!("{s}\nnew = {raw} # keep"));
        assert_eq!(&c.content[c.start..c.end], "new");
    }
}

#[test]
fn independent_comments_remain_in_place_after_copy_and_sort() {
    let s = "[a]\nx='''a\nb''' # x\n\n# independent\n\ny=0xFF # y\n\n# trailing\n\n";
    let c = copy(s, "a.x", "copy").unwrap();
    assert_eq!(
        c.content,
        s.replace(
            "\n\n# independent",
            "\ncopy='''a\nb''' # x\n\n# independent"
        )
    );
    let c = moved(s, "a.x", "down").unwrap();
    assert_eq!(
        c.content,
        s.replace("x='''a\nb''' # x", "y=0xFF # y")
            .replace("\n\ny=0xFF # y", "\n\nx='''a\nb''' # x")
    );
}

#[test]
fn ambiguous_before_between_and_after_comments_keep_local_source_fallback() {
    for s in [
        "# header\nx='''a\nb'''\ny=2\n",
        "x='''a\nb'''\n# attached?\ny=2\n",
        "x='''a\nb'''\ny=2\n# attached?\n",
    ] {
        assert!(moved(s, "x", "down").is_err(), "{s}");
    }
    for s in [
        "# header\nx='''a\nb'''\ny=2\n",
        "x='''a\nb'''\n# attached?\ny=2\n",
    ] {
        assert!(copy(s, "x", "new").is_err(), "{s}");
    }
}

#[test]
fn duplicate_invalid_names_stale_utf8_and_cross_table_ranges_remain_local() {
    let s = "[a]\nx='''中文😀\nbody'''\ny=1\n[b]\nx='keep'\n";
    for name in ["y", "", "bad\nname", "bad\u{0}name"] {
        assert!(copy(s, "a.x", name).is_err());
    }
    let f = field(s, "a.x");
    for (a, b) in [
        (usize::MAX, 0),
        (f.start, f.end + 1),
        (f.start + 1, f.end),
        (15, 17),
    ] {
        assert!(copy_toml_field_source(s, a, b, "new").is_err());
        assert!(move_toml_field_source(s, a, b, "down").is_err());
    }
    assert!(moved(s, "a.y", "down").is_err());
}

#[test]
fn arrays_inline_tables_dotted_keys_and_array_tables_keep_existing_fallback() {
    for (s, p) in [
        ("x=[1]\ny='''text\nbody'''", "x"),
        ("x={a=1}\ny='''text\nbody'''", "x"),
        ("a.x='''text\nbody'''\na.y=1", "a.x"),
        ("[[a]]\nx='''text\nbody'''\ny=1", "a[0].x"),
    ] {
        assert!(copy(s, p, "new").is_err(), "{s}");
        assert!(moved(s, p, "down").is_err(), "{s}");
    }
}

#[test]
fn consecutive_copy_move_and_rename_use_new_key_ranges_and_current_draft() {
    let s = "label='我的草稿'\nx='''a\nb'''\ny=0xFF\nother=8_080\n";
    let c = copy(s, "x", "copy").unwrap();
    let c = moved(&c.content, "copy", "down").unwrap();
    let c = rename_toml_key_source(&c.content, c.start, c.end, "新.名😀").unwrap();
    let c = copy(&c.content, "[\"新.名😀\"]", "copy2").unwrap();
    assert!(c
        .content
        .contains("y=0xFF\n\"新.名😀\"='''a\nb'''\ncopy2='''a\nb'''\nother=8_080"));
    assert_eq!(&c.content[c.start..c.end], "copy2");
}

#[test]
fn boundaries_invalid_source_and_copy_budget_do_not_change_source() {
    let s = "x='''a\nb'''\ny=1";
    assert!(moved(s, "x", "up").is_err());
    assert!(moved(s, "y", "down").is_err());
    assert!(moved(s, "x", "sideways").is_err());
    assert!(copy_toml_field_source("x='''unfinished", 0, 1, "new").is_err());
    let s = format!("x='''{}\nbody'''", "a".repeat(MAX_TOML_SOURCE_BYTES / 2));
    assert!(copy(&s, "x", "new").is_err());
}

#[test]
fn physical_form_corpus_keeps_unrelated_bytes_and_exact_inverse() {
    for eol in ["\n", "\r\n"] {
        for bom in ["", "\u{feff}"] {
            for final_eol in ["", "\n"] {
                for raw in [
                    "'''a\nb'''",
                    "\"\"\"a\\n中\n末尾\"\"\"",
                    "'''# text\n\n'''",
                    "\"\"\"\nopening\n\"\"\"",
                ] {
                    let a = format!("  text = {raw} # selected");
                    let s = format!(
                        "{bom}[root]\n{a}\n\n# independent\n\n next = 0xFF # next{final_eol}"
                    )
                    .replace('\n', eol);
                    let c = copy(&s, "root.text", "new").unwrap();
                    assert_eq!(
                        c.content,
                        s.replacen(
                            &a.replace('\n', eol),
                            &format!("{a}\n{}", a.replacen("text =", "new =", 1))
                                .replace('\n', eol),
                            1
                        )
                    );
                    let c = moved(&s, "root.text", "down").unwrap();
                    assert_eq!(moved(&c.content, "root.text", "up").unwrap().content, s);
                }
            }
        }
    }
}
