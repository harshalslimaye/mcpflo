import { safeStorage } from 'electron'

// Encrypted values are tagged so we can tell them apart from legacy plaintext
// (written before this feature) and from values left plaintext when no OS
// keyring is available. The version segment lets the format evolve later.
const PREFIX = 'enc:v1:'

// True when the OS keyring can back encryption (macOS Keychain, Windows DPAPI,
// Linux libsecret). On Linux without a keyring, safeStorage falls back to a
// hardcoded-key "basic_text" backend — still reported available here, but the
// guarantee is weaker (obfuscation, not secrecy). Callers that need real
// secrecy should treat that case accordingly.
export function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    // safeStorage throws if the app isn't ready yet; treat as unavailable.
    return false
  }
}

// True when `value` was produced by `encrypt` (vs. legacy/fallback plaintext).
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

// Encrypts a plaintext secret to a tagged, base64 string safe to persist as
// JSON. Caller must check `isAvailable()` first; calling when unavailable lets
// the underlying safeStorage error propagate.
export function encrypt(plain: string): string {
  return PREFIX + safeStorage.encryptString(plain).toString('base64')
}

// Reverses `encrypt`. A value without the tag is returned unchanged — it's
// legacy or fallback plaintext, not ciphertext — so reads tolerate a mix of
// encrypted and plaintext values during/after migration.
export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value
  const b64 = value.slice(PREFIX.length)
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}
