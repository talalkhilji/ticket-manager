import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserForm, type EditableUser } from './UserForm'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When given, the dialog edits this user; otherwise it creates a new one. */
  user?: EditableUser
}

// The dialog unmounts its content when closed, so the form starts fresh on every open.
export function UserDialog({ open, onOpenChange, user }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Edit user' : 'Create user'}</DialogTitle>
          <DialogDescription>
            {user ? `Update ${user.name}'s details.` : 'Add a new agent account.'}
          </DialogDescription>
        </DialogHeader>
        <UserForm key={user?.id} user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
