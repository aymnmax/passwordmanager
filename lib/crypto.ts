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
    true, // <--- THIS MUST BE TRUE (extractable)
    ["encrypt", "decrypt"]
  );
}

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

export async function decryptData(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const dec = new TextDecoder();
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, 'base64') },
    key,
    Buffer.from(ciphertext, 'base64')
  );

  return dec.decode(decrypted);
}

export function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}