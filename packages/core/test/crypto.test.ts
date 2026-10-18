import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CryptoError, decryptSecret, encryptSecret, needsRotation, safeEqual } from "../src/security/crypto";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

describe("credential encryption", () => {
  const ring = { keys: { k1 }, activeKid: "k1" };

  it("round-trips and never repeats ciphertext for the same plaintext", () => {
    const a = encryptSecret(ring, "shpss_secret", "store:1");
    const b = encryptSecret(ring, "shpss_secret", "store:1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("shpss_secret");
    expect(decryptSecret(ring, a, "store:1")).toBe("shpss_secret");
  });

  it("rejects tampering and wrong context", () => {
    const env = encryptSecret(ring, "token", "store:1");
    const parts = env.split(":");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(ring, parts.join(":"), "store:1")).toThrow(CryptoError);
    expect(() => decryptSecret(ring, env, "store:2")).toThrow(CryptoError);
  });

  it("supports key rotation: old ciphertexts decrypt, new ones use the active key", () => {
    const old = encryptSecret(ring, "token");
    const rotated = { keys: { k1, k2 }, activeKid: "k2" };
    expect(decryptSecret(rotated, old)).toBe("token");
    expect(needsRotation(rotated, old)).toBe(true);
    expect(needsRotation(rotated, encryptSecret(rotated, "token"))).toBe(false);
    expect(() => decryptSecret({ keys: { k2 }, activeKid: "k2" }, old)).toThrow(/unknown encryption key/);
  });

  it("compares secrets in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
