import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createReplySchema, type CreateReplyInput } from 'core'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function ReplyForm({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: { body: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: CreateReplyInput) => api.post(`/tickets/${ticketId}/messages`, values),
    onSuccess: () => {
      reset()
      void queryClient.invalidateQueries({ queryKey: ['ticket', String(ticketId)] })
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const serverError = mutation.error
    ? isAxiosError<{ error?: string }>(mutation.error) && mutation.error.response?.data?.error
      ? mutation.error.response.data.error
      : 'Could not send the reply.'
    : null

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="mt-6 flex flex-col gap-2"
    >
      <Label htmlFor="reply-body">Reply</Label>
      <Textarea id="reply-body" rows={5} aria-invalid={!!errors.body} {...register('body')} />
      {errors.body && (
        <span role="alert" className="text-sm text-destructive">
          {errors.body.message}
        </span>
      )}
      {serverError && (
        <span role="alert" className="text-sm text-destructive">
          {serverError}
        </span>
      )}
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
