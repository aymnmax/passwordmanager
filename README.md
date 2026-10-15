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

## Secnura Vault security notes

- Vault entries are encrypted client-side with AES-GCM before storage; password-based key derivation uses PBKDF2-SHA-256 with 600,000 iterations.
- Password generation uses the browser cryptographic random generator.
- Password health checks use Have I Been Pwned's Pwned Passwords range API with k-anonymity. Only the first five characters of the SHA-1 hash are sent. A failed/unavailable API response is not proof that a password is safe.
- The dashboard shows a 0–100 *advisory* score that deducts for breached, short, and 30-day-old entries. The age check currently uses `updated_at` / `created_at`; it is not a server-enforced password-expiry control.
- Apply `supabase/migrations/20261015_vault_security.sql` in the Supabase SQL Editor to enable per-user row-level security. Review existing policies first and test with separate accounts.
- Never expose a Supabase service-role key in client-side environment variables. Configure a restrictive Content Security Policy and rate limits before production use.

**Important limitation to fix before storing real secrets:** the existing app exports its encryption key into `sessionStorage` to survive refreshes. Any successful same-origin XSS could read it. For a stronger zero-knowledge design, remove persisted raw/JWK keys and require the master password to derive/unwrap the vault key after refresh. This project has not had an independent security audit; do not market it as audited or guarantee that operators/infrastructure can never access data until the full design and deployment are reviewed.
