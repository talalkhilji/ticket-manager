import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'

// Playwright does not load server/.env.e2e into process.env, so parse it here once.
const e2eEnv = parse(readFileSync(path.resolve(import.meta.dirname, '../../server/.env.e2e')))

function required(key: string): string {
  const value = e2eEnv[key]
  if (!value) throw new Error(`${key} is missing from server/.env.e2e`)
  return value
}

export const ADMIN_EMAIL = required('ADMIN_EMAIL')
export const ADMIN_PASSWORD = required('ADMIN_PASSWORD')
export const CLIENT_URL = e2eEnv.CLIENT_URL ?? 'http://localhost:5174'
export const API_URL = `http://localhost:${e2eEnv.PORT ?? '3001'}`
