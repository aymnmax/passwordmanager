// 1. Derive a Key from a Password (Used for Master Password OR Emergency Key)
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true, // Must be true
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"] // Added wrap/unwrap permissions
  );
}

// 2. NEW: Generate the Master Encryption Key (MEK) - The actual vault key
export async function generateMEK(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // Must be extractable so we can wrap it
    ["encrypt", "decrypt"]
  );
}

// 3. NEW: Wrap (Encrypt) the MEK to create a "Locked Box"
export async function wrapMEK(mek: CryptoKey, wrappingKey: CryptoKey): Promise<{ encryptedKey: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await window.crypto.subtle.wrapKey(
    "raw",
    mek,
    wrappingKey,
    { name: "AES-GCM", iv: iv }
  );
  return {
    encryptedKey: Buffer.from(wrapped).toString('base64'),
    iv: Buffer.from(iv).toString('base64')
  };
}

// 4. NEW: Unwrap (Decrypt) the MEK from a "Locked Box"
export async function unwrapMEK(encryptedKeyBase64: string, ivBase64: string, unwrappingKey: CryptoKey): Promise<CryptoKey> {
  const encryptedKey = Buffer.from(encryptedKeyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  return await window.crypto.subtle.unwrapKey(
    "raw",
    encryptedKey,
    unwrappingKey,
    { name: "AES-GCM", iv: iv },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// 5. Encrypt actual vault data (Passwords, Notes) using the MEK
export async function encryptData(key: CryptoKey, data: string): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(data)
  );

  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    iv: Buffer.from(iv).toString('base64')
  };
}

// 6. Decrypt actual vault data using the MEK
export async function decryptData(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const dec = new TextDecoder();
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, 'base64') },
    key,
    Buffer.from(ciphertext, 'base64')
  );

  return dec.decode(decrypted);
}

// 7. Generate random passwords for the Vault
export function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

// 8. NEW: Generate a high-entropy Emergency Kit Key
export function generateEmergencyKey(): string {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    // Formats it nicely like: ABCD-1234-EFGH-5678
    return `${hex.slice(0,8)}-${hex.slice(8,16)}-${hex.slice(16,24)}-${hex.slice(24,32)}`;
}