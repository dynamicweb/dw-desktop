import { Dialog } from './Dialog'

interface UploadConflictModalProps {
  conflictCount: number
  totalCount: number
  targetPath: string
  production: boolean
  onReplace: () => void
  onSkip: () => void
  onCancel: () => void
}

/**
 * Asked before an upload whose target already contains some of the files:
 * replace the existing ones, upload only the missing ones, or cancel.
 */
export default function UploadConflictModal({
  conflictCount,
  totalCount,
  targetPath,
  production,
  onReplace,
  onSkip,
  onCancel
}: UploadConflictModalProps): React.JSX.Element {
  const allConflict = conflictCount === totalCount
  const summary =
    totalCount === 1
      ? 'The file already exists in'
      : allConflict
        ? `All ${totalCount} files already exist in`
        : `${conflictCount} of ${totalCount} files already exist in`

  return (
    <Dialog
      title="Files already exist"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          {!allConflict && (
            <button type="button" className="btn btn-secondary" onClick={onSkip}>
              Upload missing only
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onReplace}>
            Replace existing
          </button>
        </>
      }
    >
      {summary}{' '}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          wordBreak: 'break-all',
          color: 'var(--text)'
        }}
      >
        {targetPath}
      </span>
      . What should happen with the existing {conflictCount === 1 ? 'file' : 'files'}?
      {production && (
        <p
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--notice-danger-bg)',
            color: 'var(--notice-danger-fg)',
            fontSize: 13
          }}
        >
          This is a <b style={{ fontWeight: 600 }}>production</b> site.
        </p>
      )}
    </Dialog>
  )
}
