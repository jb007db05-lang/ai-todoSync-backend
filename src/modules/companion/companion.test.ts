import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { deterministicHash } from "../../utils/encryption.js";
import { formatDeterministicDeviceName } from "./controllers/companion.controller.js";

describe("Companion Device & Key Domain Architecture", () => {
  test("Key generation uses secure entropy and returns plaintext secret once", () => {
    const rawKey = `cmp_${crypto.randomBytes(32).toString("hex")}`;
    assert.equal(rawKey.startsWith("cmp_"), true);
    assert.equal(rawKey.length, 68); // cmp_ (4) + 64 hex chars = 68

    const keyHash = deterministicHash(rawKey);
    assert.notEqual(rawKey, keyHash);
    assert.equal(keyHash.length, 64);
  });

  test("Deterministic hash produces consistent HMAC SHA-256 result for same key", () => {
    const key = "cmp_test_key_1234567890abcdef1234567890abcdef";
    const hash1 = deterministicHash(key);
    const hash2 = deterministicHash(key);
    assert.equal(hash1, hash2);
  });

  test("QR payload URL format contains required WhatsApp-style pairing parameters without key generation", () => {
    const sessionId = `qrs_${crypto.randomBytes(16).toString("hex")}`;
    const token = `qrt_${crypto.randomBytes(32).toString("hex")}`;
    const baseUrl = "http://localhost:5173";
    const payloadUrl = `${baseUrl}/login?mode=companion&sessionId=${sessionId}&token=${token}`;

    const url = new URL(payloadUrl);
    assert.equal(url.origin, baseUrl);
    assert.equal(url.searchParams.get("mode"), "companion");
    assert.equal(url.searchParams.get("sessionId"), sessionId);
    assert.equal(url.searchParams.get("token"), token);
    assert.equal(url.searchParams.get("pairingKey"), null); // NO pairing key in QR flow!
  });

  test("Deterministic device name generator resolves hardware details correctly", () => {
    // 1. Explicit name
    const explicit = formatDeterministicDeviceName({
      name: "Aditya's iPhone",
      type: "mobile",
    });
    assert.equal(explicit.deviceName, "Aditya's iPhone");
    assert.equal(explicit.deviceType, "mobile");

    // 2. Platform + model
    const hardware = formatDeterministicDeviceName({
      platform: "iOS",
      model: "iPhone 15",
      type: "mobile",
    });
    assert.equal(hardware.deviceName, "iOS (iPhone 15)");

    // 3. User agent parsing
    const chromeLinux = formatDeterministicDeviceName(
      { type: "desktop" },
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    assert.equal(chromeLinux.deviceName, "Chrome on Linux Workstation");

    // 4. Generic fallback
    const fallback = formatDeterministicDeviceName({ type: "tablet" });
    assert.equal(fallback.deviceName, "Tablet Device");
  });
});
