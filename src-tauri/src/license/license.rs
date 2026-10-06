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

    /// The base64-encoded Ed25519 public key the vendor ships with the app.
    ///
    /// License key layout: `base64( public_key(32 bytes) || signature(64 bytes) )`,
    /// where the signature covers `"<machine_id>:pro"`.
    ///
    /// * **Empty (default):** the key *self-verifies* — the embedded public key
    ///   is used to check the signature. This preserves the demo/test flow
    ///   ([`LicenseManager::generate_keypair`] → sign → activate) but is **not**
    ///   cryptographically enforced: anyone who can run this binary can mint
    ///   valid keys. A warning is logged on every activation in this mode.
    /// * **Set to your vendor key:** every activation verifies the signature
    ///   against this fixed key and the embedded key is ignored; keys minted
    ///   by anyone else are rejected.
    pub const VENDOR_PUBLIC_KEY: &str = "";

    /// Activate a license with a signed key
    pub fn activate(&mut self, signed_key: &str, machine_id: &str) -> Result<Tier, String> {
        // Decode the key. Layout: public key (32) || signature (64) in raw
        // bytes, base64-encoded. Reject anything short of the minimum
        // instead of panicking on a slice.
        let key_bytes = general_purpose::STANDARD.decode(signed_key.trim())
            .map_err(|e| format!("Invalid key: {}", e))?;
        if key_bytes.len() < 96 {
            return Err("Invalid license key: too short".to_string());
        }

        let signature = ed25519_dalek::Signature::from_slice(&key_bytes[32..96])
            .map_err(|e| format!("Invalid signature: {}", e))?;

        let verifying_key = if Self::VENDOR_PUBLIC_KEY.is_empty() {
            log::warn!(
                "[license] VENDOR_PUBLIC_KEY not configured — license self-verifies against the key embedded in the license (demo mode, not cryptographically enforced)"
            );
            let embedded: &[u8; 32] = key_bytes
                .get(..32)
                .ok_or("Invalid license key: too short")?
                .try_into()
                .map_err(|_| "Invalid license key: bad key size")?;
            VerifyingKey::from_bytes(embedded).map_err(|e| format!("Invalid key format: {}", e))?
        } else {
            // Enforce against the fixed vendor key; the embedded key is ignored.
            let vendor = general_purpose::STANDARD.decode(Self::VENDOR_PUBLIC_KEY)
                .map_err(|e| format!("Misconfigured VENDOR_PUBLIC_KEY: {}", e))?;
            if vendor.len() != 32 {
                return Err("Misconfigured VENDOR_PUBLIC_KEY: expected 32 bytes".to_string());
            }
            let vendor_key: &[u8; 32] = (&vendor[..32])
                .try_into()
                .map_err(|_| "Misconfigured VENDOR_PUBLIC_KEY: bad key size")?;
            VerifyingKey::from_bytes(vendor_key)
                .map_err(|e| format!("Misconfigured VENDOR_PUBLIC_KEY: {}", e))?
        };

        // The signature binds the license to this machine.
        let message = format!("{}:{}", machine_id, Tier::Pro.as_str());
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

#[cfg(test)]
mod tests {
    use ed25519_dalek::Signer;
    use super::*;

    /// Build a valid demo key: base64(pub || sig) signing "<machine>:pro"
    fn sign_key_for(machine_id: &str) -> (String, String) {
        let (priv_b64, _pub_b64) = LicenseManager::generate_keypair();
        let priv_bytes = general_purpose::STANDARD.decode(&priv_b64).unwrap();
        let signing_key = SigningKey::from_bytes(&priv_bytes[..32].try_into().unwrap());
        let verifying_key = signing_key.verifying_key();
        let message = format!("{}:pro", machine_id);
        let sig = signing_key.sign(message.as_bytes());

        let mut packed = Vec::new();
        packed.extend_from_slice(verifying_key.as_bytes());
        packed.extend_from_slice(&sig.to_bytes());
        (general_purpose::STANDARD.encode(&packed), priv_b64)
    }

    #[test]
    fn valid_demo_key_activates() {
        let mut lm = LicenseManager::new();
        let (key, _) = sign_key_for("machine-a");
        assert_eq!(lm.activate(&key, "machine-a").unwrap(), Tier::Pro);
    }

    #[test]
    fn wrong_machine_is_rejected() {
        let mut lm = LicenseManager::new();
        let (key, _) = sign_key_for("machine-a");
        assert!(lm.activate(&key, "machine-b").is_err());
    }

    #[test]
    fn short_and_garbage_keys_err_instead_of_panicking() {
        let mut lm = LicenseManager::new();
        assert!(lm.activate("", "machine-a").is_err());
        assert!(lm.activate("not-base64!!!", "machine-a").is_err());
        // 50 bytes of valid base64 — decodes fine, but too short
        assert!(lm.activate(&general_purpose::STANDARD.encode(vec![0u8; 50]), "machine-a").is_err());
        // 96 valid bytes but the "public key" is all zeros (not a valid
        // Ed25519 key) — must be an Err, not a panic
        let mut packed = vec![0u8; 96];
        let (key, _) = sign_key_for("machine-a");
        let kbytes = general_purpose::STANDARD.decode(&key).unwrap();
        packed[32..96].copy_from_slice(&kbytes[32..96]);
        assert!(lm.activate(&general_purpose::STANDARD.encode(packed), "machine-a").is_err());
    }
}
