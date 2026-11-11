import { useEffect, useState } from 'react'
import { TextareaField, TextField } from '../../../components/Field'
import { Button, Modal } from '../../../components/ui'

const NAME_LENGTH = 255

/**
 * Creates a static list. The API has no rename/update route, so the name and
 * description are set once here and shown read-only afterwards.
 */
export function ListFormModal({ open, running = false, error = null, onClose, onSave }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setErrors({})
  }, [open])

  const serverMessage = typeof error === 'string' ? error : error?.message
  const nameError = errors.name || error?.fieldErrors?.name

  function handleSubmit(event) {
    event.preventDefault()
    const next = {}

    if (!name.trim()) next.name = 'Enter a list name.'
    else if (name.trim().length > NAME_LENGTH) {
      next.name = `Use ${NAME_LENGTH} characters or fewer.`
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSave({ name: name.trim(), description: description.trim() })
  }

  return (
    <Modal
      open={open}
      title="New list"
      description="Static lists are fixed collections of contacts. Use one for an import or a one-off campaign."
      size="md"
      onClose={running ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="list-create-form"
            variant="primary"
            loading={running}
          >
            Create list
          </Button>
        </>
      }
    >
      <form className="lists__form" id="list-create-form" onSubmit={handleSubmit}>
        <TextField
          id="list-name"
          label="List name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Q1 Northwind outreach"
          maxLength={NAME_LENGTH}
          error={nameError}
          disabled={running}
          autoFocus
        />

        <TextareaField
          id="list-description"
          label="Description"
          optional
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this list is for, or where it came from."
          rows={3}
          disabled={running}
        />

        {serverMessage ? (
          <p className="lists__error-banner" role="alert">
            {serverMessage}
          </p>
        ) : null}

        <p className="lists__hint">
          Create the list, then add contacts from its detail view. This API build has no
          list-rename endpoint, so the name cannot be changed later.
        </p>
      </form>
    </Modal>
  )
}
