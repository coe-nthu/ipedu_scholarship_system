import { createHmac, randomBytes } from "node:crypto";

const accounts = [
  { username: "college", displayName: "學院端", role: "admin", scope: "all" },
  {
    username: "edtech",
    displayName: "教育與學習科技學系",
    role: "teacher",
    scope: ["教育與學習科技學系", "教育與學習科技系", "教科系"],
  },
  {
    username: "ece",
    displayName: "幼兒教育學系",
    role: "teacher",
    scope: ["幼兒教育學系", "幼教系"],
  },
  {
    username: "spe",
    displayName: "特殊教育學系",
    role: "teacher",
    scope: ["特殊教育學系", "特教系"],
  },
  {
    username: "psy",
    displayName: "教育心理與諮商學系",
    role: "teacher",
    scope: ["教育心理與諮商學系", "心諮系", "教育心理與諮商系"],
  },
  {
    username: "pe",
    displayName: "體育學系",
    role: "teacher",
    scope: ["體育學系", "體育系"],
  },
  {
    username: "sports",
    displayName: "運動科學系",
    role: "teacher",
    scope: ["運動科學系", "運科系"],
  },
  {
    username: "lst",
    displayName: "學習科學與科技研究所",
    role: "teacher",
    scope: ["學習科學與科技研究所", "學科所"],
  },
  {
    username: "math",
    displayName: "數理教育研究所",
    role: "teacher",
    scope: ["數理教育研究所", "數理所"],
  },
  {
    username: "ipedu-ms",
    displayName: "竹師教育學院學士班",
    role: "teacher",
    scope: ["竹師教育學院學士班"],
  },
];

function createPassword() {
  return randomBytes(9).toString("base64url");
}

function createHash(secret, password) {
  const hash = createHmac("sha256", secret).update(password).digest("hex");
  return `sha256:${hash}`;
}

const secret = process.env.DASHBOARD_SESSION_SECRET || randomBytes(32).toString("base64url");
const credentials = {};
const accountsJson = {};

for (const account of accounts) {
  const password = createPassword();
  credentials[account.username] = password;
  accountsJson[account.username] = {
    displayName: account.displayName,
    role: account.role,
    scope: account.scope,
    passwordHash: createHash(secret, password),
  };
}

console.log("DASHBOARD_SESSION_SECRET=");
console.log(secret);
console.log("");
console.log("Initial passwords:");
for (const account of accounts) {
  console.log(`${account.username}: ${credentials[account.username]}`);
}
console.log("");
console.log("DASHBOARD_ACCOUNTS_JSON=");
console.log(JSON.stringify(accountsJson));
