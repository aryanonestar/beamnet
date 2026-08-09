/**
 * lib/crypto.ts
 * Low-RAM Client-Side AES-256-GCM Streaming Encryption & Decryption Engine
 */

// Generate a 256-bit AES-GCM symmetric key inside browser RAM
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Export raw key bytes as a URL-safe Base64 string for anchor fragment storage (#key=...)
export async function exportKeyToHash(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const bytes = new Uint8Array(exported);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Import raw key bytes from a URL-safe Base64 string back into a functional CryptoKey
export async function importKeyFromHash(hashKey: string): Promise<CryptoKey> {
  const base64 = hashKey.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    "raw",
    bytes.buffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt an individual ArrayBuffer slice using a unique 12-byte IV
export async function encryptChunk(chunk: ArrayBuffer, key: CryptoKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    chunk
  );
  return { iv, encrypted };
}

// Decrypt an individual encrypted ArrayBuffer slice using its prepended IV
export async function decryptChunk(encrypted: ArrayBuffer, iv: Uint8Array, key: CryptoKey) {
  return await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encrypted
  );
}

const CRYPTO_CHUNK_SIZE = 1024 * 1024; // Strict 1 MB RAM limit per chunk loop

/**
 * Encrypt a File in 1MB streaming slices. Returns encrypted File & URL-safe key hash.
 */
export async function encryptFileStream(file: File): Promise<{ securedPackage: File; b64KeyHash: string }> {
  const cryptoKey = await generateEncryptionKey();
  const b64KeyHash = await exportKeyToHash(cryptoKey);

  const totalSlices = Math.ceil(file.size / CRYPTO_CHUNK_SIZE);
  const compiledBlobSegments: Blob[] = [];

  for (let i = 0; i < totalSlices; i++) {
    const byteStart = i * CRYPTO_CHUNK_SIZE;
    const byteEnd = Math.min(file.size, byteStart + CRYPTO_CHUNK_SIZE);
    const fileSlice = file.slice(byteStart, byteEnd);

    const arrayBuffer = await fileSlice.arrayBuffer();
    const { iv, encrypted } = await encryptChunk(arrayBuffer, cryptoKey);

    const packageBuffer = new Uint8Array(iv.length + encrypted.byteLength);
    packageBuffer.set(iv, 0);
    packageBuffer.set(new Uint8Array(encrypted), iv.length);

    compiledBlobSegments.push(new Blob([packageBuffer]));
  }

  const finalEncryptedBlob = new Blob(compiledBlobSegments, { type: "application/octet-stream" });
  const securedPackage = new File([finalEncryptedBlob], `${file.name}.enc`, { type: "application/octet-stream" });

  return { securedPackage, b64KeyHash };
}

const RAW_CHUNK_SIZE = 1024 * 1024; // 1 MB plaintext chunk
const ENCRYPTED_CHUNK_SIZE = RAW_CHUNK_SIZE + 12 + 16; // 1MB + 12B IV + 16B GCM Auth Tag

/**
 * Stream-decrypt an encrypted file URL using exact ENCRYPTED_CHUNK_SIZE boundaries.
 */
export async function handleDecryptAndDownload(cloudBlobUrl: string, targetFileName: string, keyStr?: string): Promise<string> {
  let extractedKeyStr = keyStr;

  if (!extractedKeyStr && typeof window !== "undefined") {
    const urlHash = window.location.hash;
    const keyParam = urlHash.match(/key=([^&]*)/);
    if (keyParam) {
      extractedKeyStr = keyParam[1];
    }
  }

  if (!extractedKeyStr) {
    // Return standard un-encrypted direct URL if no key present
    return cloudBlobUrl;
  }

  // CRITICAL FIX: Ensure URL points to raw binary endpoint (/api/d), not HTML landing page (/d)
  let rawBinaryFetchUrl = cloudBlobUrl.split("#")[0];
  if (rawBinaryFetchUrl.includes("/d?")) {
    rawBinaryFetchUrl = rawBinaryFetchUrl.replace("/d?", "/api/d?");
  }

  const decryptionKey = await importKeyFromHash(extractedKeyStr);
  const response = await fetch(rawBinaryFetchUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch encrypted payload from cloud.");
  }

  const encryptedArrayBuffer = await response.arrayBuffer();
  const encryptedBytes = new Uint8Array(encryptedArrayBuffer);

  const totalLength = encryptedBytes.byteLength;
  const decryptedSegments: Uint8Array[] = [];

  let offset = 0;

  while (offset < totalLength) {
    const chunkEnd = Math.min(offset + ENCRYPTED_CHUNK_SIZE, totalLength);
    const chunkBytes = encryptedBytes.slice(offset, chunkEnd);

    if (chunkBytes.byteLength < 28) {
      // Skip corrupted trailing bytes less than 28B header tag
      break;
    }

    const iv = chunkBytes.slice(0, 12);
    const ciphertext = chunkBytes.slice(12);

    const ciphertextBuffer = ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength
    );

    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength
    );

    const decryptedBuffer = await decryptChunk(
      ciphertextBuffer,
      new Uint8Array(ivBuffer),
      decryptionKey
    );

    decryptedSegments.push(new Uint8Array(decryptedBuffer));
    offset += ENCRYPTED_CHUNK_SIZE;
  }

  const outputBlob = new Blob(decryptedSegments as unknown as Uint8Array<ArrayBuffer>[], { type: "application/octet-stream" });
  return URL.createObjectURL(outputBlob);
}
