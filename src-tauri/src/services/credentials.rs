use keyring::{Entry, Error};

const SERVICE: &str = "LongEdit Knowledge Workspace";
const AI_ACCOUNT: &str = "ai-api-key";
const MAX_SECRET_CHARS: usize = 8192;

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, AI_ACCOUNT).map_err(|error| format!("无法访问系统凭据存储: {error}"))
}

fn normalize_secret(secret: &str) -> Result<String, String> {
    let secret = secret.trim();
    if secret.is_empty() {
        return Err("API Key 不能为空；如需移除请使用删除凭据".into());
    }
    if secret.chars().count() > MAX_SECRET_CHARS || secret.contains('\0') {
        return Err("API Key 格式无效或超过 8192 个字符".into());
    }
    Ok(secret.to_string())
}

pub(crate) fn store_ai_secret(secret: &str) -> Result<(), String> {
    let secret = normalize_secret(secret)?;
    entry()?
        .set_password(&secret)
        .map_err(|error| format!("保存 API Key 到系统凭据存储失败: {error}"))
}

pub(crate) fn read_ai_secret() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(secret) if !secret.is_empty() => Ok(Some(secret)),
        Ok(_) | Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("读取系统凭据失败: {error}")),
    }
}

pub(crate) fn delete_ai_secret() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除系统凭据失败: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_secret_without_exposing_it() {
        assert!(normalize_secret("  sk-example  ").is_ok());
        assert!(normalize_secret("  ").is_err());
        assert!(normalize_secret("bad\0secret").is_err());
        assert!(normalize_secret(&"x".repeat(MAX_SECRET_CHARS + 1)).is_err());
    }
}
