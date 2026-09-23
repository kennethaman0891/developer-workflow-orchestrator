//! License Module (Phase 3)
//!
//! Ed25519-based license signing and verification.

use ed25519_dalek::{SigningKey, VerifyingKey, Verifier};
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use base64::engine::{Engine, general_purpose};

/// License tier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Tier {
    Free,
    Pro,
}

impl Default for Tier {
    fn default() -> Self {
        Self::Free
    }
}

impl Tier {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Free => "free",
            Self::Pro => "pro",
        }
    }
}

/// License information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct License {
    pub tier: Tier,
    pub activated_at: String,
    pub expires_at: Option<String>,
    pub machine_id: String,
    pub signature: String,
}

impl License {
    /// Create a new license
    pub fn new(tier: Tier, machine_id: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let expires_at = match tier {
            Tier::Pro => Some(
                chrono::Utc::now()
                    .checked_add_signed(chrono::Duration::days(365))
                    .unwrap_or_default()
                    .to_rfc3339(),
            ),
            Tier::Free => None,
        };

        Self {
            tier,
            activated_at: now,
            expires_at,
            machine_id: machine_id.to_string(),
            signature: String::new(), // Will be set by signer
        }
    }
}

/// License manager
#[derive(Clone)]
pub struct LicenseManager {
    signing_key: SigningKey,
    licenses: std::collections::HashMap<String, License>, // machine_id -> License
}

impl LicenseManager {
    /// Create a new license manager with a random keypair
    pub fn new() -> Self {
        let mut csprng = thread_rng();
        let signing_key = SigningKey::generate(&mut csprng);
        Self {
            signing_key,
            licenses: std::collections::HashMap::new(),
        }
    }

    /// Get the public key for distribution
    pub fn public_key(&self) -> String {
        general_purpose::STANDARD.encode(self.signing_key.verifying_key().as_bytes())
    }

    /// Activate a license with a signed key
    pub fn activate(&mut self, signed_key: &str, machine_id: &str) -> Result<Tier, String> {
        // Decode and verify signature
        let key_bytes = general_purpose::STANDARD.decode(signed_key)
            .map_err(|e| format!("Invalid key: {}", e))?;

        let verifying_key = VerifyingKey::from_bytes(&key_bytes[..32].try_into().map_err(|e| format!("Invalid key size: {}", e))?)
            .map_err(|e| format!("Invalid key format: {}", e))?;

        // Verify the machine ID is bound to this key
        // For simplicity, we'll just check the signature matches
        let message = format!("{}:{}", machine_id, Tier::Pro.as_str());
        let signature = ed25519_dalek::Signature::from_slice(&signed_key.as_bytes()[64..])
            .map_err(|e| format!("Invalid signature: {}", e))?;

        if !verifying_key.verify(message.as_bytes(), &signature).is_ok() {
            return Err("Invalid license signature".to_string());
        }

        // Store the license
        let license = License::new(Tier::Pro, machine_id);
        self.licenses.insert(machine_id.to_string(), license);

        Ok(Tier::Pro)
    }

    /// Check current tier for a machine
    pub fn get_tier(&self, machine_id: &str) -> Tier {
        match self.licenses.get(machine_id) {
            Some(license) => license.tier.clone(),
            None => Tier::Free,
        }
    }

    /// Deactivate a license
    pub fn deactivate(&mut self, machine_id: &str) -> bool {
        self.licenses.remove(machine_id).is_some()
    }

    /// Generate a new signing keypair (for testing/demo)
    pub fn generate_keypair() -> (String, String) {
        let mut csprng = thread_rng();
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        (
            general_purpose::STANDARD.encode(signing_key.to_bytes()),
            general_purpose::STANDARD.encode(verifying_key.as_bytes()),
        )
    }
}

impl Default for LicenseManager {
    fn default() -> Self {
        Self::new()
    }
}
