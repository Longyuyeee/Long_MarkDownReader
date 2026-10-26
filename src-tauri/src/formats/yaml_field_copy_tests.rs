use super::*;

fn copy(source: &str, path: &str, name: &str) -> Result<YamlKeyChange, String> {
    let field = analyze_yaml_source(source)
        .outline
        .into_iter()
        .find(|e| e.path == path)
        .and_then(|e| e.field)
        .unwrap();
    copy_yaml_field_source(source, field.start, field.end, name)
}

#[test]
fn duplicates_raw_scalar_and_selects_new_key_only() {
    for value in [
        "'中文😀'",
        "\"a\\nb\"",
        "0xFF",
        "1_000",
        "true",
        "null",
        "2026-10-25",
        "1.20e3",
    ] {
        let source =
            format!("# intro\nfirst: {value} # attached\n\n# independent\nlast: untouched\n");
        let r = copy(&source, "$.first", "new field").unwrap();
        assert_eq!(r.content,format!("# intro\nfirst: {value} # attached\nnew field: {value} # attached\n\n# independent\nlast: untouched\n"));
        assert_eq!(&r.content[r.start..r.end], "new field");
    }
}

#[test]
fn preserves_nested_parent_indentation_bom_crlf_and_eof() {
    for eol in ["\n", "\r\n"] {
        for ending in ["", eol] {
            let source =
                format!("\u{feff}other: 9{eol}parent:{eol}  value :   '草稿😀' # note{ending}");
            let r = copy(&source, "$.parent.value", "value_copy").unwrap();
            assert_eq!(r.content,format!("\u{feff}other: 9{eol}parent:{eol}  value :   '草稿😀' # note{eol}  value_copy :   '草稿😀' # note{ending}"));
        }
    }
    let r = copy(
        "list:\n  - first: 0xFF\n    other: true\n",
        "$.list[0].first",
        "copied",
    )
    .unwrap();
    assert_eq!(
        r.content,
        "list:\n  - first: 0xFF\n    copied: 0xFF\n    other: true\n"
    );
}

#[test]
fn flow_mapping_retains_separators_trailing_comma_and_other_scopes() {
    for source in [
        "{first: 0xFF, other: 2}",
        "{other: 2, first: 0xFF,}",
        "{first: 0xFF}",
    ] {
        let r = copy(source, "$.first", "next").unwrap();
        assert_eq!(
            r.content,
            source.replacen("first: 0xFF", "first: 0xFF, next: 0xFF", 1)
        );
    }
    let r = copy("a: {first: 'x'}\nb: {first: 'y'}\n", "$.a.first", "second").unwrap();
    assert_eq!(r.content, "a: {first: 'x', second: 'x'}\nb: {first: 'y'}\n");
}

#[test]
fn validates_new_names_and_preserves_string_key_types() {
    let source = "first: 'value'\nother: 2\n";
    for name in ["first", "other", "", "<<", "a\nb", "a\rb"] {
        assert!(copy(source, "$.first", name).is_err(), "{name:?}");
    }
    assert!(copy(source, "$.first", &"x".repeat(4097)).is_err());
    for name in ["true", "null", "1", "a: b", "a#b", "a\"b", "😀"] {
        let r = copy(source, "$.first", name).unwrap();
        assert!(analyze_yaml_source(&r.content)
            .outline
            .iter()
            .any(|e| e.field.as_ref().is_some_and(|f| f.name == name)));
    }
    let r = copy("'first': 'x'\n", "$.first", "a'b").unwrap();
    assert!(r.content.contains("'a''b': 'x'"));
}

#[test]
fn rejects_complex_references_multiline_keys_values_and_ambiguous_comments() {
    for (source, path) in [
        ("first: [1, 2]\n", "$.first"),
        ("first: {a: 1}\n", "$.first"),
        ("first: 'a\n  b'\n", "$.first"),
        ("first: &a value\nother: *a\n", "$.first"),
        ("first: &a value\nother: *a\n", "$.other"),
        ("first: !!str value\n", "$.first"),
        ("parent: &p {first: x}\n", "$.parent.first"),
        ("parent: {<<: {base: 1}, first: x}\n", "$.parent.first"),
        ("{first: 1, # ambiguous\n other: 2}\n", "$.first"),
        ("first: 1\n---\nother: 2\n", "$.first"),
        ("first: 1\nfirst: 2\n", "$.first"),
    ] {
        assert!(copy(source, path, "copy").is_err(), "{source}");
    }
}

#[test]
fn refuses_value_stale_partial_utf8_and_wrong_parent_ranges() {
    let source = "first: '中文😀'\nother: 2\n";
    assert!(copy_yaml_field_source(source, 7, 18, "copy").is_err());
    assert!(copy_yaml_field_source(source, 0, 4, "copy").is_err());
    assert!(copy_yaml_field_source(source, 8, 9, "copy").is_err());
    assert!(copy_yaml_field_source(source, usize::MAX, usize::MAX, "copy").is_err());
    assert!(copy_yaml_field_source("broken: [", 0, 6, "copy").is_err());
}

#[test]
fn repeated_copy_and_edit_use_fresh_ranges_without_touching_other_fields() {
    let source = "first: '草稿' # comment\nother: false\n";
    let one = copy(source, "$.first", "first_copy").unwrap();
    let two = copy(&one.content, "$.first_copy", "first_copy2").unwrap();
    assert_eq!(two.content,"first: '草稿' # comment\nfirst_copy: '草稿' # comment\nfirst_copy2: '草稿' # comment\nother: false\n");
    let entry = analyze_yaml_source(&two.content)
        .outline
        .into_iter()
        .find(|e| e.field.as_ref().is_some_and(|f| f.name == "first_copy2"))
        .unwrap();
    let edited =
        replace_yaml_value_source(&two.content, entry.start, entry.end, "'继续修改'").unwrap();
    assert!(edited.contains("first_copy2: '继续修改' # comment"));
    assert!(edited.starts_with(source.split("other:").next().unwrap()));
}

#[test]
fn enforces_source_budget_without_panicking_or_truncating() {
    let source = format!("first: x\n#{}", "x".repeat(MAX_YAML_SOURCE_BYTES - 11));
    assert_eq!(source.len(), MAX_YAML_SOURCE_BYTES - 1);
    assert!(copy(&source, "$.first", "copy").is_err());
    assert!(copy_yaml_field_source(&"x".repeat(MAX_YAML_SOURCE_BYTES + 1), 0, 1, "copy").is_err());
}
