import { z } from 'zod'
import { auth } from '../src/auth.js'

const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = z
  .object({
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(12),
  })
  .parse(process.env)

await auth.api.createUser({
  body: { email, password, name: 'Admin', role: 'admin' },
})

console.log(`Seeded admin: ${email}`)
console.log('Remove ADMIN_PASSWORD from server/.env now that the admin exists.')
