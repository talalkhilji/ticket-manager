import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CreateUserForm } from './CreateUserForm'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The dialog unmounts its content when closed, so the form starts empty on every open.
export function CreateUserDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>Add a new agent account.</DialogDescription>
        </DialogHeader>
        <CreateUserForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
