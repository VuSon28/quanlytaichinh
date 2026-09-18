import type { Config } from 'drizzle-kit'

/**
 * drizzle-kit chay o tien trinh rieng, khong tu doc .env.local nhu Next.
 * Node 20.6+ co san loadEnvFile nen khong can them thu vien dotenv.
 */
try {
  process.loadEnvFile('.env.local')
} catch {
  // Tren Vercel, bien moi truong da co san - khong co file de doc la binh thuong
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
