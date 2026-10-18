import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM envelope encryption for stored credentials (ARCHITECTURE §6).
 * Format: v1:<kid>:<iv b64url>:<tag b64url>:<ciphertext b64url>. The key id allows rotation:
 * decrypt with any configured key, encrypt with the active one.
 */
export interface KeyRing {
  readonly keys: Readonly<Record<string, string>>; // kid -> base64(32 bytes)
  readonly activeKid: string;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

const b64url = (b: Buffer) => b.toString("base64url");

function keyFor(ring: KeyRing, kid: string): Buffer {
  const raw = ring.keys[kid];
  if (!raw) throw new CryptoError(`unknown encryption key id: ${kid}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new CryptoError(`encryption key ${kid} must be 32 bytes`);
  return key;
}

export function encryptSecret(ring: KeyRing, plaintext: string, associatedData = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(ring, ring.activeKid), iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", ring.activeKid, b64url(iv), b64url(cipher.getAuthTag()), b64url(ct)].join(":");
}

/** `associatedData` binds a ciphertext to its context (e.g. the store id) so it can't be swapped between rows. */
export function decryptSecret(ring: KeyRing, envelope: string, associatedData = ""): string {
  const parts = envelope.split(":");
  if (parts.length !== 5 || parts[0] !== "v1") throw new CryptoError("malformed ciphertext envelope");
  const [, kid, iv, tag, ct] = parts as [string, string, string, string, string];
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(ring, kid), Buffer.from(iv, "base64url"));
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError("decryption failed (wrong key, tampered data or wrong context)");
  }
}

/** True when the envelope was encrypted with a key other than the active one (needs re-encryption). */
export function needsRotation(ring: KeyRing, envelope: string): boolean {
  return envelope.split(":")[1] !== ring.activeKid;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time string comparison (equal-length check first, as required by timingSafeEqual). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
