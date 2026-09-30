import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createReplySchema,
  type CreateReplyInput,
  type PolishedReply,
  type PolishReplyInput,
} from 'core'
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
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: { body: '' },
  })
  const draft = useWatch({ control, name: 'body' })

  const mutation = useMutation({
    mutationFn: (values: CreateReplyInput) => api.post(`/tickets/${ticketId}/messages`, values),
    onSuccess: () => {
      reset()
      void queryClient.invalidateQueries({ queryKey: ['ticket', String(ticketId)] })
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  // Rewrites the draft with AI and puts it back in the box; the agent still reviews and sends.
  const polish = useMutation({
    mutationFn: (values: PolishReplyInput) =>
      api.post<PolishedReply>(`/tickets/${ticketId}/polish`, values).then((res) => res.data),
    onSuccess: (data) => setValue('body', data.body, { shouldValidate: true }),
  })

  const errorText = (err: unknown, fallback: string) =>
    isAxiosError<{ error?: string }>(err) && err.response?.data?.error
      ? err.response.data.error
      : fallback

  const serverError = mutation.error ? errorText(mutation.error, 'Could not send the reply.') : null
  const polishError = polish.error ? errorText(polish.error, 'Could not polish the reply.') : null
  const draftEmpty = !draft?.trim()

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
      {polishError && (
        <span role="alert" className="text-sm text-destructive">
          {polishError}
        </span>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={draftEmpty || polish.isPending || mutation.isPending}
          onClick={() => polish.mutate({ body: getValues('body') })}
        >
          {polish.isPending ? 'Polishing…' : 'Polish'}
        </Button>
        <Button type="submit" disabled={mutation.isPending || polish.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
