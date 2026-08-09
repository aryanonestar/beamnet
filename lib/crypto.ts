/**
 * lib/crypto.ts
 * Bypassed / Reverted Direct File Transfer Mode
 */

export async function generateEncryptionKey(): Promise<null> {
  return null;
}

export async function exportKeyToHash(): Promise<string> {
  return "";
}

export async function importKeyFromHash(): Promise<null> {
  return null;
}

export async function encryptFileStream(file: File): Promise<{ securedPackage: File; b64KeyHash: string }> {
  return { securedPackage: file, b64KeyHash: "" };
}

export async function handleDecryptAndDownload(cloudBlobUrl: string): Promise<string> {
  return cloudBlobUrl;
}
