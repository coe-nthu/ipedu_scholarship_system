import { createHmac, randomBytes } from "node:crypto";

const accounts = [
  { username: "college", displayName: "學院端", role: "admin", scope: "all" },
  {
    username: "ipedu-phd",
    displayName: "竹師教育學院博士班",
    role: "teacher",
    scope: ["竹師教育學院博士班", "竹師教育學院博士生班"],
  },
  {
    username: "edtech",
    displayName: "教育與學習科技學系",
    role: "teacher",
    scope: ["教育與學習科技學系", "教育與學習科技系", "教科系"],
  },
  {
    username: "psy",
    displayName: "教育心理與諮商學系",
    role: "teacher",
    scope: ["教育心理與諮商學系", "心諮系", "教育心理與諮商系"],
  },
  {
    username: "taiwanese",
    displayName: "臺灣語言研究與教學研究所",
    role: "teacher",
    scope: [
      "臺灣語言研究與教學研究所",
      "台灣語言研究與教學研究所",
      "臺語所",
      "台語所",
    ],
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
const accountRows = [];

for (const account of accounts) {
  const password = createPassword();
  const passwordHash = createHash(secret, password);
  credentials[account.username] = password;
  accountRows.push({ ...account, passwordHash });
}

console.log("DASHBOARD_SESSION_SECRET=");
console.log(secret);
console.log("");
console.log("Initial passwords:");
for (const account of accounts) {
console.log(`${account.username}: ${credentials[account.username]}`);
}
console.log("");
console.log("SQL updates for public.profiles=");
console.log("-- Password accounts are stored independently from Google emails.");
for (const account of accountRows) {
  const scopeSql =
    account.scope === "all"
      ? `'"all"'::jsonb`
      : `'${JSON.stringify(account.scope).replace(/'/g, "''")}'::jsonb`;
  console.log(`
insert into public.dashboard_accounts (
  username,
  display_name,
  password_hash,
  role,
  department_scope,
  is_active
) values (
  '${account.username}',
  '${account.displayName.replace(/'/g, "''")}',
  '${account.passwordHash}',
  '${account.role}',
  ${scopeSql},
  true
)
on conflict (username) do update
set
  display_name = excluded.display_name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  department_scope = excluded.department_scope,
  is_active = excluded.is_active;
`);
}
