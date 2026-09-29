import { z } from 'zod'

const name = z.string().trim().min(3, 'Name must be at least 3 characters').max(100)
const email = z.email('Enter a valid email address')
const password = z.string().min(8, 'Password must be at least 8 characters').max(128)

export const createUserSchema = z.object({ name, email, password })

export type CreateUserInput = z.infer<typeof createUserSchema>

// On edit the password is optional: an empty string (or no value) means "keep the current one".
export const updateUserSchema = z.object({
  name,
  email,
  password: z.union([z.literal(''), password]).optional(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>
