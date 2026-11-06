//! Security: Input Validation
//!
//! Validation and sanitization for all Tauri command inputs.
//! Prevents injection attacks, XSS, and malformed data.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use validator::{Validate, ValidationError};

/// Trait for types that can validate themselves
pub trait ValidatedInput {
    fn validate(&self) -> Result<(), ValidationError>;
}

/// Validation error with field context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationErrorDetail {
    pub field: String,
    pub message: String,
    pub code: String,
}

/// Validate a string is not empty and within length bounds
pub fn validate_string(
    value: &str,
    field: &str,
    min_len: usize,
    max_len: usize,
) -> Result<(), ValidationErrorDetail> {
    if value.len() < min_len {
        return Err(ValidationErrorDetail {
            field: field.to_string(),
            message: format!("{} must be at least {} characters", field, min_len),
            code: "too_short".to_string(),
        });
    }
    if value.len() > max_len {
        return Err(ValidationErrorDetail {
            field: field.to_string(),
            message: format!("{} must be at most {} characters", field, max_len),
            code: "too_long".to_string(),
        });
    }
    Ok(())
}

/// Validate email format
pub fn validate_email(email: &str) -> Result<(), ValidationErrorDetail> {
    let email_regex = regex::Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap();
    if !email_regex.is_match(email) {
        return Err(ValidationErrorDetail {
            field: "email".to_string(),
            message: "Invalid email format".to_string(),
            code: "invalid_format".to_string(),
        });
    }
    Ok(())
}

/// Validate path is safe (no traversal, within allowed roots)
pub fn validate_path(path: &str) -> Result<(), ValidationErrorDetail> {
    use crate::security::path::{validate_path, is_path_safe};
    
    if !is_path_safe(path) {
        return Err(ValidationErrorDetail {
            field: "path".to_string(),
            message: "Path contains suspicious traversal sequences".to_string(),
            code: "path_traversal".to_string(),
        });
    }
    
    validate_path(path).map_err(|e| ValidationErrorDetail {
        field: "path".to_string(),
        message: e,
        code: "path_invalid".to_string(),
    })?;
    
    Ok(())
}

/// Validate URL is safe (https only, no localhost in production)
pub fn validate_url(url: &str) -> Result<(), ValidationErrorDetail> {
    let parsed = url::Url::parse(url).map_err(|_| ValidationErrorDetail {
        field: "url".to_string(),
        message: "Invalid URL format".to_string(),
        code: "invalid_format".to_string(),
    })?;
    
    // Only allow HTTPS in production
    #[cfg(not(debug_assertions))]
    {
        if parsed.scheme() != "https" {
            return Err(ValidationErrorDetail {
                field: "url".to_string(),
                message: "Only HTTPS URLs allowed in production".to_string(),
                code: "insecure_scheme".to_string(),
            });
        }
    }
    
    // Block localhost/internal IPs in production
    #[cfg(not(debug_assertions))]
    {
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host == "127.0.0.1" || host.starts_with("192.168.") || host.starts_with("10.") {
                return Err(ValidationErrorDetail {
                    field: "url".to_string(),
                    message: "Internal URLs not allowed in production".to_string(),
                    code: "internal_url".to_string(),
                });
            }
        }
    }
    
    Ok(())
}

/// Validate JSON value against a schema
pub fn validate_json_schema(
    value: &serde_json::Value,
    schema: &serde_json::Value,
) -> Result<(), Vec<ValidationErrorDetail>> {
    // Simple schema validation - in production use jsonschema crate
    let mut errors = Vec::new();
    
    if let Some(required) = schema.get("required").and_then(|v| v.as_array()) {
        for field in required {
            if let Some(field_name) = field.as_str() {
                if value.get(field_name).is_none() {
                    errors.push(ValidationErrorDetail {
                        field: field_name.to_string(),
                        message: format!("Required field '{}' is missing", field_name),
                        code: "required".to_string(),
                    });
                }
            }
        }
    }
    
    if let Some(properties) = schema.get("properties").and_then(|v| v.as_object()) {
        for (field_name, field_schema) in properties {
            if let Some(field_value) = value.get(field_name) {
                // Type validation
                if let Some(expected_type) = field_schema.get("type").and_then(|v| v.as_str()) {
                    let matches = match expected_type {
                        "string" => field_value.is_string(),
                        "number" => field_value.is_number(),
                        "integer" => field_value.is_i64() || field_value.is_u64(),
                        "boolean" => field_value.is_boolean(),
                        "array" => field_value.is_array(),
                        "object" => field_value.is_object(),
                        _ => true,
                    };
                    if !matches {
                        errors.push(ValidationErrorDetail {
                            field: field_name.clone(),
                            message: format!("Field '{}' must be of type '{}'", field_name, expected_type),
                            code: "type_mismatch".to_string(),
                        });
                    }
                }
                
                // String length validation
                if let Some(min_len) = field_schema.get("minLength").and_then(|v| v.as_u64()) {
                    if let Some(s) = field_value.as_str() {
                        if s.len() < min_len as usize {
                            errors.push(ValidationErrorDetail {
                                field: field_name.clone(),
                                message: format!("Field '{}' must be at least {} characters", field_name, min_len),
                                code: "too_short".to_string(),
                            });
                        }
                    }
                }
                
                if let Some(max_len) = field_schema.get("maxLength").and_then(|v| v.as_u64()) {
                    if let Some(s) = field_value.as_str() {
                        if s.len() > max_len as usize {
                            errors.push(ValidationErrorDetail {
                                field: field_name.clone(),
                                message: format!("Field '{}' must be at most {} characters", field_name, max_len),
                                code: "too_long".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Sanitize string for safe display (prevent XSS)
pub fn sanitize_html(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '<' => output.push_str("<"),
            '>' => output.push_str(">"),
            '&' => output.push_str("&"),
            '"' => output.push_str("\""),
            '\'' => output.push_str("\'"),
            '/' => output.push_str("&#x2F;"),
            _ => output.push(ch),
        }
    }
    output
}

/// Sanitize for shell command (prevent injection)
pub fn sanitize_shell_arg(input: &str) -> String {
    // Only allow alphanumeric, dash, underscore, dot, slash
    input.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == '/')
        .collect()
}

/// Validate command input for shell execution
pub fn validate_command_input(args: &[String]) -> Result<(), ValidationErrorDetail> {
    for (i, arg) in args.iter().enumerate() {
        // Check for shell metacharacters
        if arg.chars().any(|c| matches!(c, ';' | '&' | '|' | '>' | '<' | '$' | '`' | '(' | ')' | '\'' | '"' | '\n')) {
            return Err(ValidationErrorDetail {
                field: format!("args[{}]", i),
                message: "Command argument contains shell metacharacters".to_string(),
                code: "shell_injection".to_string(),
            });
        }
        
        // Length limit
        if arg.len() > 4096 {
            return Err(ValidationErrorDetail {
                field: format!("args[{}]", i),
                message: "Command argument too long".to_string(),
                code: "too_long".to_string(),
            });
        }
    }
    Ok(())
}

/// Macro for validating Tauri command inputs
#[macro_export]
macro_rules! validate_command {
    ($input:expr, $validator:expr) => {
        if let Err(e) = $validator($input) {
            return Err(tauri::Error::Anyhow(anyhow::anyhow!(
                "Validation failed: {} - {}",
                e.field,
                e.message
            )));
        }
    };
    ($input:expr, $validator:expr, $($arg:tt)*) => {
        if let Err(e) = $validator($input) {
            return Err(tauri::Error::Anyhow(anyhow::anyhow!(
                "Validation failed: {} - {}",
                e.field,
                e.message
            )));
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_string() {
        assert!(validate_string("hello", "test", 1, 10).is_ok());
        assert!(validate_string("", "test", 1, 10).is_err());
        assert!(validate_string("toolongstring", "test", 1, 10).is_err());
    }

    #[test]
    fn test_validate_email() {
        assert!(validate_email("test@example.com").is_ok());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("@example.com").is_err());
    }

    #[test]
    fn test_sanitize_html() {
        assert_eq!(sanitize_html("<script>alert(1)</script>"), "<script>alert(1)</script>");
        assert_eq!(sanitize_html("hello & goodbye"), "hello & goodbye");
    }

    #[test]
    fn test_validate_command_input() {
        assert!(validate_command_input(&["ls".to_string(), "-la".to_string()]).is_ok());
        assert!(validate_command_input(&["ls; rm -rf /".to_string()]).is_err());
        assert!(validate_command_input(&["echo `whoami`".to_string()]).is_err());
    }
}
