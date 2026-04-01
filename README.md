This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## structure
```
academic-system/
├── app/                      # Next.js App Router 核心 (所有的頁面與 API 都在這)
│   ├── api/                  # 後端 API 路由
│   │   ├── auth/
│   │   │   └── [...nextauth]/route.ts  # (模組三) NextAuth 登入驗證邏輯
│   │   └── publications/
│   │       └── fetch/route.ts          # (模組五) Crossref 論文抓取 API
│   │
│   ├── admin/                # 後台管理員介面 (需要登入才能看)
│   │   ├── dashboard/page.tsx          # 大報表總覽列表
│   │   └── layout.tsx                  # 後台共用的導覽列
│   │
│   ├── apply/                # 學生申請介面
│   │   └── page.tsx                    # 把原本的 test.html 轉成 React 元件放在這裡
│   │
│   ├── globals.css           # 全域 CSS (Tailwind 設定檔)
│   ├── layout.tsx            # 全網站共用的根佈局 (Root Layout)
│   └── page.tsx              # 網站首頁 (可能是登入頁或身分選擇頁)
│
├── components/               # 共用的小元件 (UI 組件)
│   ├── ui/                   # 放按鈕、輸入框等基礎元件 (可搭配 shadcn/ui)
│   └── forms/
│       ├── PublicationTable.tsx        # 動態新增著作目錄的表單元件
│       └── ExperienceTable.tsx         # 研究經歷表單元件
│
├── prisma/                   # (模組一) 資料庫設定區
│   └── schema.prisma         # 定義資料表結構的地方
│
├── public/                   # 存放靜態檔案 (如學校 Logo、說明 PDF)
├── .env                      # 存放環境變數 (如資料庫密碼 DATABASE_URL，不可上傳至 Git)
├── package.json              # 專案依賴套件清單
└── tailwind.config.ts        # Tailwind CSS 設定檔
```