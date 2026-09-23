import { auth } from '../src/auth.js'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin')
}

await auth.api.createUser({
  body: { email, password, name: 'Admin', role: 'admin' },
})

console.log(`Seeded admin: ${email}`)
