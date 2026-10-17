//! One grammar for sidebar counts, exact tag lookup, collections and edits.
use regex::Regex;
use std::{collections::BTreeSet, sync::LazyLock};
pub(crate) static TAGS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:^|[\s\u{feff}])#([^\s\u{feff}#`\[\](){}.,;:!?，。；：！？、\"'<>]+)"#).unwrap()
});
pub(crate) fn names(content: &str) -> BTreeSet<String> {
    TAGS.captures_iter(content.trim_start_matches('\u{feff}'))
        .map(|capture| capture[1].to_owned())
        .collect()
}
pub(crate) fn validate(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.chars().count() > 500
        || names(&format!("#{name}")).iter().next().map(String::as_str) != Some(name)
    {
        return Err("标签名不能包含空白、#、反引号或句子标点".into());
    }
    Ok(())
}
pub(crate) fn pattern(name: &str) -> Result<Regex, String> {
    validate(name)?;
    // Exactly the complement of the extraction grammar, including # and `.
    Regex::new(&format!(
        r#"(?:^|[\s\u{{feff}}])#{}(?:$|[\s\u{{feff}}#`\[\](){{}}.,;:!?，。；：！？、\"'<>])"#,
        regex::escape(name)
    ))
    .map_err(|error| error.to_string())
}
pub(crate) fn contains_all(content: &str, wanted: &[&String]) -> bool {
    let mut remaining = wanted
        .iter()
        .map(|tag| tag.as_str())
        .collect::<BTreeSet<_>>();
    for capture in TAGS.captures_iter(content) {
        remaining.remove(capture.get(1).unwrap().as_str());
        if remaining.is_empty() {
            return true;
        }
    }
    remaining.is_empty()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extraction_and_exact_lookup_share_all_boundaries_without_prefix_matches() {
        for delimiter in [
            " ", "\n", "#", "`", "[", "]", "(", ")", "{", "}", ".", ",", ";", ":", "!", "?", "，",
            "。", "；", "：", "！", "？", "、", "\"", "'", "<", ">",
        ] {
            let text = format!("正文 #项目{delimiter}下一段");
            assert!(names(&text).contains("项目"), "{text}");
            assert!(pattern("项目").unwrap().is_match(&text), "{text}");
        }
        assert!(!pattern("项目").unwrap().is_match("#项目扩展"));
        assert!(pattern("项目").unwrap().is_match("\u{feff}#项目"));
        assert!(names("\u{feff}#项目").contains("项目"));
        assert!(validate("a#b").is_err());
        assert!(validate("a`b").is_err());
    }
}
