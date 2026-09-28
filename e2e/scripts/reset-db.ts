import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'
import { Client } from 'pg'

const serverDir = path.resolve(import.meta.dirname, '../../server')
const e2eEnvPath = path.join(serverDir, '.env.e2e')
const devEnvPath = path.join(serverDir, '.env')

if (!existsSync(e2eEnvPath)) {
  throw new Error('server/.env.e2e not found. Copy server/.env.e2e.example to server/.env.e2e first.')
}

const e2eEnv = parse(readFileSync(e2eEnvPath))
const testUrl = new URL(e2eEnv.DATABASE_URL ?? '')
const testDb = decodeURIComponent(testUrl.pathname.slice(1))

// This script DROPS the database, so refuse anything that is not clearly a test database.
if (!/^[a-z0-9_]+_test$/i.test(testDb)) {
  throw new Error(`Refusing to reset "${testDb}": the e2e database name must end in "_test".`)
}
if (existsSync(devEnvPath)) {
  const devUrl = parse(readFileSync(devEnvPath)).DATABASE_URL
  if (devUrl && new URL(devUrl).pathname === testUrl.pathname && new URL(devUrl).host === testUrl.host) {
    throw new Error('Refusing to reset: the e2e DATABASE_URL points at the same database as server/.env.')
  }
}

const adminUrl = new URL(testUrl)
adminUrl.pathname = '/postgres'
adminUrl.search = ''

const client = new Client({ connectionString: adminUrl.toString() })
await client.connect()
try {
  await client.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`)
  await client.query(`CREATE DATABASE "${testDb}"`)
} finally {
  await client.end()
}
console.log(`Recreated database ${testDb}`)

const childEnv = { ...process.env, ...e2eEnv }
execSync('npx prisma migrate deploy', { cwd: serverDir, env: childEnv, stdio: 'inherit' })
execSync('npx tsx prisma/seed.ts', { cwd: serverDir, env: childEnv, stdio: 'inherit' })
