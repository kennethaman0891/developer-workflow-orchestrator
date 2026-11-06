//! Security: Encrypted Storage (Backend Support)
//!
//! Provides encryption utilities for frontend localStorage encryption.
//! Uses ChaCha20-Poly1305 (AEAD) via `chacha20poly1305` crate.

use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce,
};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Encrypted payload structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub nonce: String,      // base64 encoded
    pub ciphertext: String, // base64 encoded
}

/// Encryption key derived from user password + salt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionKey {
    pub salt: String,  // base64 encoded
    pub key: String,   // base64 encoded (ChaCha20Poly1305 key)
}

static MASTER_KEY: OnceLock<[u8; 32]> = OnceLock::new();

/// Initialize the master encryption key from environment or generate
pub fn init_master_key(key: Option<&[u8; 32]>) -> Result<(), String> {
    if let Some(k) = key {
        MASTER_KEY.set(*k).map_err(|_| "Master key already initialized".to_string())
    } else {
        // Generate a random master key
        let mut key = [0u8; 32];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut key);
        MASTER_KEY.set(key).map_err(|_| "Master key already initialized".to_string())
    }
}

/// Get or generate the master key
fn master_key() -> [u8; 32] {
    *MASTER_KEY.get_or_init(|| {
        let mut key = [0u8; 32];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut key);
        key
    })
}

/// Encrypt data with ChaCha20-Poly1305
pub fn encrypt(plaintext: &[u8]) -> Result<EncryptedData, String> {
    let key = master_key();
    let cipher = ChaCha20Poly1305::new((&key).into());
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    Ok(EncryptedData {
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    })
}

/// Decrypt data
pub fn decrypt(data: &EncryptedData) -> Result<Vec<u8>, String> {
    let key = master_key();
    let cipher = ChaCha20Poly1305::new((&key).into());

    let nonce = BASE64
        .decode(&data.nonce)
        .map_err(|e| format!("Invalid nonce: {}", e))?;
    let nonce = Nonce::from_slice(&nonce);

    let ciphertext = BASE64
        .decode(&data.ciphertext)
        .map_err(|e| format!("Invalid ciphertext: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("Decryption failed: {}", e))?;

    Ok(plaintext)
}

/// Encrypt a JSON-serializable value
pub fn encrypt_json<T: Serialize>(value: &T) -> Result<EncryptedData, String> {
    let json = serde_json::to_vec(value).map_err(|e| format!("Serialization failed: {}", e))?;
    encrypt(&json)
}

/// Decrypt to a JSON-deserializable value
pub fn decrypt_json<T: for<'de> Deserialize<'de>>(data: &EncryptedData) -> Result<T, String> {
    let plaintext = decrypt(data)?;
    serde_json::from_slice(&plaintext).map_err(|e| format!("Deserialization failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        init_master_key(None).unwrap();
        let data = b"Hello, World!";
        let encrypted = encrypt(data).unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(data, &decrypted[..]);
    }

    #[test]
    fn test_encrypt_decrypt_json() {
        init_master_key(None).unwrap();
        let data = serde_json::json!({"user": "test", "role": "admin"});
        let encrypted = encrypt_json(&data).unwrap();
        let decrypted: serde_json::Value = decrypt_json(&encrypted).unwrap();
        assert_eq!(data, decrypted);
    }
}
