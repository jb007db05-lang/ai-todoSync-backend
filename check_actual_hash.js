import { deterministicHash } from "./src/utils/encryption.js";
import env from "./src/config/env.js";

const key = "sdk_58d1976a4bc2c8e0018f3a97:e822a10dfa6cbb8a3d52d9b213695df1:293bc0c14c51480f2d8c39e14bc08dcf284ee90fca7a39ba9db42a17cb2a9bf8c187bc9e14a0f44e138a08d2";
console.log("Encryption Key:", env.ENCRYPTION_KEY);
console.log("Calculated hash:", deterministicHash(key));
