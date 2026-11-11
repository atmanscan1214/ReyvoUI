import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash,
} from '../../../components/icons'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Modal,
  useToast,
} from '../../../components/ui'
import { TextField } from '../../../components/Field'
import { TAG_STORAGE_AVAILABLE } from '../../../lib/contacts'
import {
  applyContactTag,
  collectContactTags,
  deleteContactTag,
  renameContactTag,
} from '../../../lib/tags'
import { ContactSelectionModal } from './ContactSelectionModal'

/**
 * Tag management for T16. Tags are a per-browser store because the API has no
 * tags endpoint; this screen aggregates them, renames or deletes them across
 * contacts, and applies a tag in bulk.
 */
export function TagManager({
  tagsByContact = {},
  contacts = [],
  contactsStatus = 'ready',
  canWrite = false,
  onChanged,
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyRunning, setApplyRunning] = useState(false)
  const [applyError, setApplyError] = useState(null)
  const [applyTagValue, setApplyTagValue] = useState('')
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteRunning, setDeleteRunning] = useState(false)

  const contactMap = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  )
  const tags = useMemo(() => collectContactTags(tagsByContact), [tagsByContact])
  const tagNames = tags.map((entry) => entry.tag)
  const query = search.trim().toLowerCase()
  const visible = query
    ? tags.filter((entry) => entry.tag.toLowerCase().includes(query))
    : tags

  const taggedContacts = tags.reduce(
    (total, entry) => total + entry.contactIds.length,
    0,
  )

  function openApply() {
    setApplyError(null)
    setApplyTagValue('')
    setApplyOpen(true)
  }

  async function handleApply(contactIds) {
    setApplyError(null)
    setApplyRunning(true)

    try {
      const result = applyContactTag({
        tag: applyTagValue,
        contactIds,
        tagsByContact,
      })
      toast.success(
        result.changed === 0
          ? `Those contacts already had the “${result.tag}” tag.`
          : `Tagged ${result.changed} ${
              result.changed === 1 ? 'contact' : 'contacts'
            } with “${result.tag}”.`,
      )
      setApplyOpen(false)
      onChanged?.()
    } catch (caught) {
      setApplyError(caught)
    } finally {
      setApplyRunning(false)
    }
  }

  function openRename(tag) {
    setRenameTarget(tag)
    setRenameValue(tag)
    setRenameError(null)
  }

  function handleRename() {
    try {
      const result = renameContactTag({
        oldTag: renameTarget,
        newTag: renameValue,
        tagsByContact,
      })
      toast.success(
        `Renamed “${renameTarget}” to “${result.tag}” on ${result.changed} ${
          result.changed === 1 ? 'contact' : 'contacts'
        }.`,
      )
      setRenameTarget(null)
      onChanged?.()
    } catch (caught) {
      setRenameError(caught.message || 'The tag could not be renamed.')
    }
  }

  function handleDelete() {
    setDeleteRunning(true)
    try {
      const result = deleteContactTag({ tag: deleteTarget, tagsByContact })
      toast.success(
        `Removed “${deleteTarget}” from ${result.changed} ${
          result.changed === 1 ? 'contact' : 'contacts'
        }.`,
      )
      setDeleteTarget(null)
      onChanged?.()
    } catch (caught) {
      toast.error(caught?.message || 'The tag could not be removed.')
    } finally {
      setDeleteRunning(false)
    }
  }

  if (!TAG_STORAGE_AVAILABLE) {
    return (
      <section className="lists__tags-unavailable">
        <span className="lists__tags-unavailable-icon" aria-hidden="true">
          <TagIcon size={22} />
        </span>
        <h2>Tags need a tags endpoint</h2>
        <p>
          The design lists tags as a lightweight label, but this API build has no tags
          endpoint or contact field. Development builds keep tags in this browser only;
          production builds report them as unavailable rather than pretending they
          persisted.
        </p>
      </section>
    )
  }

  return (
    <section className="lists__tags" aria-labelledby="tags-title">
      <header className="lists__tags-head">
        <div>
          <h2 id="tags-title">Tags</h2>
          <p>
            {tags.length === 0
              ? 'No tags yet.'
              : `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'} across ${taggedContacts.toLocaleString()} contact assignments.`}
          </p>
        </div>
        {canWrite ? (
          <Button variant="primary" leadingIcon={Plus} onClick={openApply}>
            Apply tag
          </Button>
        ) : null}
      </header>

      <div className="lists__tags-toolbar">
        <input
          type="search"
          className="ui-input ui-input--search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tags…"
          aria-label="Search tags"
        />
        <p className="lists__tags-store-note">
          Development only: tags live in this browser under <code>reyvo.contactTags.v1</code>.
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title={query ? 'No tags match this search' : 'No tags yet'}
          description={
            query
              ? 'Try a shorter search or clear the field.'
              : 'Add tags from a contact, or use Apply tag to label several contacts at once.'
          }
          actions={
            !query && canWrite ? (
              <Button variant="primary" size="sm" leadingIcon={Plus} onClick={openApply}>
                Apply tag
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="lists__tag-list">
          {visible.map((entry) => (
            <li className="lists__tag-card" key={entry.tag.toLowerCase()}>
              <div className="lists__tag-main">
                <div className="lists__tag-heading">
                  <span className="lists__tag-name">
                    <TagIcon size={14} aria-hidden="true" />
                    {entry.tag}
                  </span>
                  <span className="lists__tag-count">
                    {entry.contactIds.length}{' '}
                    {entry.contactIds.length === 1 ? 'contact' : 'contacts'}
                  </span>
                </div>

                <details className="lists__tag-details">
                  <summary>Show tagged contacts</summary>
                  {contactsStatus === 'loading' || contactsStatus === 'idle' ? (
                    <p className="lists__tag-contacts-note" role="status">
                      Loading contact names…
                    </p>
                  ) : contactsStatus === 'error' ? (
                    <p className="lists__tag-contacts-note">
                      Contact names are unavailable, but the tag counts above are
                      stored in this browser.
                    </p>
                  ) : (
                    <ul className="lists__tag-contacts">
                      {entry.contactIds.map((contactId) => {
                        const contact = contactMap.get(contactId)
                        return (
                          <li key={contactId}>
                            {contact ? (
                              <Link to={`/app/contacts/${contact.id}`}>
                                <span>{contact.fullName}</span>
                                <span>{contact.email}</span>
                              </Link>
                            ) : (
                              <span className="lists__tag-missing-contact">
                                Contact no longer in the preview scan
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </details>
              </div>

              {canWrite ? (
                <div className="lists__tag-actions">
                  <button
                    type="button"
                    className="lists__icon-button"
                    onClick={() => openRename(entry.tag)}
                    aria-label={`Rename ${entry.tag}`}
                    title="Rename tag"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="lists__icon-button lists__icon-button--danger"
                    onClick={() => setDeleteTarget(entry.tag)}
                    aria-label={`Delete ${entry.tag}`}
                    title="Delete tag"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ContactSelectionModal
        open={applyOpen}
        title="Apply a tag"
        description="Choose contacts and a tag. Applying a tag that a contact already has leaves it unchanged."
        confirmLabel="Apply tag"
        running={applyRunning}
        error={applyError}
        extraValid={Boolean(applyTagValue.trim())}
        onClose={() => {
          if (applyRunning) return
          setApplyOpen(false)
          setApplyError(null)
        }}
        onConfirm={handleApply}
      >
        <TextField
          id="apply-tag-name"
          label="Tag"
          value={applyTagValue}
          onChange={(event) => setApplyTagValue(event.target.value)}
          placeholder="e.g. Priority"
          maxLength={24}
          list="existing-tags"
          disabled={applyRunning}
          hint="Up to 24 characters. Tags are case-insensitive when matched."
        />
        <datalist id="existing-tags">
          {tagNames.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </ContactSelectionModal>

      <Modal
        open={Boolean(renameTarget)}
        title={`Rename “${renameTarget ?? ''}”`}
        description="The new name is applied to every contact that carries this tag."
        size="sm"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRename} disabled={!renameValue.trim()}>
              Rename tag
            </Button>
          </>
        }
      >
        <div className="lists__form">
          <TextField
            id="rename-tag-name"
            label="New tag name"
            value={renameValue}
            onChange={(event) => {
              setRenameValue(event.target.value)
              setRenameError(null)
            }}
            maxLength={24}
            error={renameError}
            autoFocus
            hint="Renaming to an existing tag merges the two labels on that contact."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete the “${deleteTarget ?? ''}” tag?`}
        description={`This removes the tag from every contact. The contacts themselves are not changed.`}
        confirmLabel={deleteRunning ? 'Removing…' : 'Delete tag'}
        loading={deleteRunning}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleteRunning) setDeleteTarget(null)
        }}
      >
        <p className="lists__muted">
          <AlertTriangle size={15} aria-hidden="true" />
          Tags cannot be restored in this build. Re-apply the tag if this was a mistake.
        </p>
      </ConfirmDialog>
    </section>
  )
}
