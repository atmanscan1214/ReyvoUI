import { useRef } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

/**
 * Confirmation dialog for destructive or irreversible actions. Focus starts on
 * Cancel so an accidental Enter does not confirm the action.
 */
export function ConfirmDialog({
  open = true,
  title = 'Are you sure?',
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size="sm"
      onClose={loading ? undefined : onCancel}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
