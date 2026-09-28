import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '../lib/auth-client'

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async ({ email, password }: LoginValues) => {
    setError(null)

    const { error } = await authClient.signIn.email({ email, password })
    if (error) {
      setError(error.message ?? 'Could not sign in.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-medium text-[var(--text-h)]">Sign in</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            className="rounded-md border border-[var(--border)] px-3 py-2"
            {...register('email')}
          />
          {errors.email && <span className="text-red-500">{errors.email.message}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            className="rounded-md border border-[var(--border)] px-3 py-2"
            {...register('password')}
          />
          {errors.password && <span className="text-red-500">{errors.password.message}</span>}
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
