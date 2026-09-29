import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserSchema, updateUserSchema, type UpdateUserInput } from 'core'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type EditableUser = { id: string; name: string; email: string }

type Props = {
  /** When given, the form edits this user; otherwise it creates a new one. */
  user?: EditableUser
  onDone: () => void
}

export function UserForm({ user, onDone }: Props) {
  const isEdit = !!user
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    // Create requires a password, edit does not; both schemas live in `core`.
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema) as Resolver<UpdateUserInput>,
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: ({ name, email, password }: UpdateUserInput) =>
      user
        ? api.patch(`/users/${user.id}`, { name, email, ...(password ? { password } : {}) })
        : api.post('/users', { name, email, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onDone()
    },
  })

  const serverError = mutation.error
    ? isAxiosError<{ error?: string }>(mutation.error) && mutation.error.response?.data?.error
      ? mutation.error.response.data.error
      : isEdit
        ? 'Could not save the user.'
        : 'Could not create the user.'
    : null

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="user-name">Name</Label>
        <Input id="user-name" autoComplete="off" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <span className="text-sm text-destructive">{errors.name.message}</span>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="user-email">Email</Label>
        <Input
          id="user-email"
          type="email"
          autoComplete="off"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && <span className="text-sm text-destructive">{errors.email.message}</span>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="user-password">Password</Label>
        <Input
          id="user-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={isEdit ? 'user-password-hint' : undefined}
          {...register('password')}
        />
        {isEdit && (
          <span id="user-password-hint" className="text-sm text-muted-foreground">
            Leave blank to keep the current password.
          </span>
        )}
        {errors.password && (
          <span className="text-sm text-destructive">{errors.password.message}</span>
        )}
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending
          ? isEdit
            ? 'Saving...'
            : 'Creating...'
          : isEdit
            ? 'Save changes'
            : 'Create user'}
      </Button>
    </form>
  )
}
