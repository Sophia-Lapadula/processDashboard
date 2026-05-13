import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CURRENT_KEY_VERSION = 1;

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY não configurado (gere com: openssl rand -base64 32)",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY tem ${key.length} bytes — precisa ter 32 (256 bits) em base64`,
    );
  }
  return key;
}

export interface EncryptedSecret {
  encryptedPayload: Buffer;
  keyVersion: number;
}

/**
 * Criptografa um payload JSON-serializável com AES-256-GCM.
 * Formato do bytea: [iv (12 bytes)][authTag (16 bytes)][ciphertext]
 */
export function encryptSecret(payload: unknown): EncryptedSecret {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedPayload: Buffer.concat([iv, authTag, ciphertext]),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptSecret<T = unknown>(
  encryptedPayload: Buffer,
  keyVersion: number,
): T {
  if (keyVersion !== CURRENT_KEY_VERSION) {
    throw new Error(
      `key_version ${keyVersion} não é suportada (atual: ${CURRENT_KEY_VERSION})`,
    );
  }
  if (encryptedPayload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("payload criptografado muito curto");
  }
  const iv = encryptedPayload.subarray(0, IV_LENGTH);
  const authTag = encryptedPayload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedPayload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/**
 * Supabase devolve bytea como string "\x..." ou Buffer dependendo do client.
 * Normaliza para Buffer.
 */
export function bytesToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      return Buffer.from(value.slice(2), "hex");
    }
    // assume base64
    return Buffer.from(value, "base64");
  }
  throw new Error(`tipo inesperado para bytea: ${typeof value}`);
}
