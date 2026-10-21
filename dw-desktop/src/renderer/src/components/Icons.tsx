// Outline icons (24-unit grid, stroke = currentColor) shared across the app.
interface IconProps {
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
}

function Svg({
  size = 16,
  strokeWidth = 1.8,
  style,
  children
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

const folderPath = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'

export const FolderIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d={folderPath} />
  </Svg>
)
export const FolderPlusIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d={folderPath} />
    <path d="M12 10v6M9 13h6" />
  </Svg>
)
export const FolderMoveIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d={folderPath} />
    <path d="M10 13h6M13 10l3 3-3 3" />
  </Svg>
)
export const FileIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
)
export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const ChevronUpIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
)
export const ChevronRightIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)
export const ChevronsUpDownIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </Svg>
)
export const SearchIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const RefreshIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Svg>
)
export const ArrowUpIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Svg>
)
export const ArrowRightIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Svg>
)
export const ArrowLeftIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
)
export const MoreIcon = (p: IconProps): React.JSX.Element => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Svg>
)
export const BrowseIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </Svg>
)
export const SyncIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
    <path d="M20 4v5h-5" />
    <path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
    <path d="M4 20v-5h5" />
  </Svg>
)
export const ActivityIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Svg>
)
export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
)
export const SidebarIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Svg>
)
export const LinkIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
)
export const UnlinkIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M14.5 6.5 16 5a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
    <path d="M9.5 17.5 8 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    <path d="M4 4l16 16" />
  </Svg>
)
export const DownloadIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 20h14" />
  </Svg>
)
export const UploadIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 20V9" />
    <path d="m7 14 5-5 5 5" />
    <path d="M5 4h14" />
  </Svg>
)
export const PencilIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
)
export const CopyIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
)
export const TrashIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </Svg>
)
export const MonitorIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
)
export const GlobeIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
  </Svg>
)
export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
)
export const PlusIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const AlertIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
)
export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const PinIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 17v5" />
    <path d="M8 3h8l-1 6 3 4H6l3-4z" />
  </Svg>
)
export const RevealIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d={folderPath} />
    <path d="M12 10v5M9.5 12.5 12 10l2.5 2.5" />
  </Svg>
)
export const ClockIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

/** The DW Desktop mark: a "D" on a rounded square. */
export function LogoMark({ size = 24 }: { size?: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: 'var(--accent)',
        color: 'var(--accent-contrast)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 0
      }}
    >
      D
    </span>
  )
}
