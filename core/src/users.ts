import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(100),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
