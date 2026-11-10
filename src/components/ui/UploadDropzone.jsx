import { useId, useRef, useState } from 'react'
import { FileText, Upload } from '../icons'

function matchesAccept(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()

  return accept
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => {
      if (part.startsWith('.')) return name.endsWith(part)
      if (part.endsWith('/*')) return type.startsWith(part.slice(0, -1))
      return type === part
    })
}

/**
 * Drag-and-drop file picker used by CSV import and attachment flows.
 *
 * Validates type and size before calling `onFiles(accepted, rejected)`, where
 * rejected items are `{ file, reason: 'type' | 'size' }`. The parent owns the
 * upload and progress state; `busy` only disables the picker.
 */
export function UploadDropzone({
  id,
  accept = '.csv,text/csv',
  multiple = false,
  maxSizeMB = 10,
  onFiles,
  label = 'Drop a file here',
  hint,
  browseLabel = 'Browse files',
  disabled = false,
  busy = false,
  busyLabel = 'Working…',
  className = '',
}) {
  const generatedId = useId()
  const inputId = id || generatedId
  const hintId = `${inputId}-hint`
  const inputRef = useRef(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const inactive = disabled || busy

  function processFiles(fileList) {
    const all = Array.from(fileList || [])
    const files = multiple ? all : all.slice(0, 1)
    const accepted = []
    const rejected = []

    for (const file of files) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        rejected.push({ file, reason: 'size' })
      } else if (!matchesAccept(file, accept)) {
        rejected.push({ file, reason: 'type' })
      } else {
        accepted.push(file)
      }
    }

    onFiles?.(accepted, rejected)
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (inactive) return
    processFiles(event.dataTransfer?.files)
  }

  function handleDragEnter(event) {
    event.preventDefault()
    if (inactive) return
    dragDepth.current += 1
    setDragging(true)
  }

  function handleDragLeave(event) {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const classes = [
    'ui-dropzone',
    dragging ? 'is-dragging' : '',
    inactive ? 'is-disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const hintText =
    hint ??
    `${accept
      ? accept
          .split(',')
          .map((part) => part.trim().replace(/^\./, '').toUpperCase())
          .filter(Boolean)
          .join(' / ')
      : 'Files'} up to ${maxSizeMB} MB`

  return (
    <div
      className={classes}
      role="group"
      aria-labelledby={`${inputId}-label`}
      aria-describedby={hintText ? hintId : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="ui-dropzone__icon" aria-hidden="true">
        {busy ? <span className="btn__spinner" /> : <Upload size={22} />}
      </span>

      <p className="ui-dropzone__title" id={`${inputId}-label`}>
        {busy ? busyLabel : label}
      </p>

      {hintText ? (
        <p className="ui-dropzone__hint" id={hintId}>
          {hintText}
        </p>
      ) : null}

      <div className="ui-dropzone__actions">
        <button
          type="button"
          className="ui-dropzone__browse"
          onClick={() => inputRef.current?.click()}
          disabled={inactive}
        >
          <FileText size={14} aria-hidden="true" />
          {browseLabel}
        </button>
        {multiple ? <span className="ui-dropzone__multiple">Multiple files allowed</span> : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        disabled={inactive}
        onChange={(event) => {
          processFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
