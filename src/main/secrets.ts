import { safeStorage } from 'electron'

// Encrypts/decrypts the secret-bearing parts of a server config (stdio `env`,
// http `headers`) using Electron's safeStorage, which is backed by the OS secret
// store — Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux. The
// encryption key lives in the OS, never in the app or on disk, so the ciphertext
// we persist in config.json is useless to anything that merely reads the file.

const UNAVAILABLE =
  'OS secure storage is unavailable, so server credentials cannot be encrypted. ' +
  'On Linux this usually means no keyring (gnome-keyring / kwallet) is running.'

export function isSecretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

// Encrypts a plaintext secret to a base64 string safe to store as JSON.
export function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(UNAVAILABLE)
  return safeStorage.encryptString(plain).toString('base64')
}

// Reverses encryptSecret. Throws if storage is unavailable or the blob is not
// decryptable (e.g. copied from another machine / OS user).
export function decryptSecret(b64: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(UNAVAILABLE)
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}
