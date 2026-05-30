import { createHmac } from "node:crypto";

const secret = process.env.DASHBOARD_SESSION_SECRET;

if (!secret) {
  console.error("DASHBOARD_SESSION_SECRET is required.");
  process.exit(1);
}

const accounts = [
  {
    displayName: "學院端",
    password: "okayama",
    role: "admin",
    scope: "all",
    username: "college",
  },
  {
    displayName: "竹師教育學院博士班",
    password: "wakayama",
    role: "teacher",
    scope: ["竹師教育學院博士班", "竹師教育學院博士生班"],
    username: "ipedu-phd",
  },
  {
    displayName: "教育與學習科技學系",
    password: "nakayama",
    role: "teacher",
    scope: ["教育與學習科技學系", "教育與學習科技系", "教科系"],
    username: "edtech",
  },
  {
    displayName: "教育心理與諮商學系",
    password: "yokohama",
    role: "teacher",
    scope: ["教育心理與諮商學系", "心諮系", "教育心理與諮商系"],
    username: "psy",
  },
  {
    displayName: "臺灣語言研究與教學研究所",
    password: "nagoya",
    role: "teacher",
    scope: [
      "臺灣語言研究與教學研究所",
      "台灣語言研究與教學研究所",
      "臺語所",
      "台語所",
    ],
    username: "taiwanese",
  },
];

function hashPassword(password) {
  return `sha256:${createHmac("sha256", secret)
    .update(password)
    .digest("hex")}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function scopeSql(scope) {
  if (scope === "all") {
    return `'"all"'::jsonb`;
  }

  return `${sqlString(JSON.stringify(scope))}::jsonb`;
}

console.log("-- Passwords are not included in this SQL, only HMAC hashes.");

for (const account of accounts) {
  console.log(`
insert into public.dashboard_accounts (
  username,
  display_name,
  password_hash,
  role,
  department_scope,
  is_active
) values (
  ${sqlString(account.username)},
  ${sqlString(account.displayName)},
  ${sqlString(hashPassword(account.password))},
  ${sqlString(account.role)},
  ${scopeSql(account.scope)},
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
