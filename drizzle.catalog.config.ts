import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Второй проект Neon — общий каталог продуктов, свои миграции.
export default defineConfig({
  schema: './db/catalogSchema.ts',
  out: './db/catalog-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CATALOG_DATABASE_URL ?? '',
  },
})
