This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Auth backend (Supabase vs mock)

The app picks its auth backend from the environment (`lib/auth/index.ts`):

- **No `.env.local`** → in-memory mock auth with the demo accounts shown on the
  login page. Works out of the box, no external services.
- **With `.env.local`** → the real Supabase backend (`lims-supabase/`).

`.env.local` is committed (team decision, 5 Jul 2026) so a fresh clone connects
to the shared Supabase project straight away — it holds only the publishable
anon key. Never add the `service_role` key, database password or access tokens
to it; those stay in ignored env files. To run against your own project
instead, replace the values (Supabase dashboard → Project Settings → API; see
`.env.local.example`).

Restart the dev server after changing env vars. Note: domain data (labs, jobs,
batches) is still the in-memory mock — the Supabase organisation must be named
exactly like a mock organisation (`Demo Lab`) for logins to resolve a context.

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
