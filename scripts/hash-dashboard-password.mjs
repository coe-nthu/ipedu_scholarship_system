import { createHmac } from "node:crypto";

const password = process.argv[2];
const secret = process.env.DASHBOARD_SESSION_SECRET;

if (!password) {
  console.error("Usage: pnpm dashboard:hash-password <password>");
  process.exit(1);
}

if (!secret) {
  console.error("DASHBOARD_SESSION_SECRET is required.");
  process.exit(1);
}

const hash = createHmac("sha256", secret).update(password).digest("hex");
console.log(`sha256:${hash}`);
