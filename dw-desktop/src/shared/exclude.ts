/**
 * Files that never belong on a server: version control and dependency folders, OS
 * and editor junk, and DW Desktop's own partial downloads. Skipped by Sync (unless
 * turned off for that sync) and inside folders uploaded from Browse.
 */
export const DEFAULT_EXCLUDES = [
  '.git/',
  '.svn/',
  '.hg/',
  'node_modules/',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.tmp',
  '~$*',
  '*.swp',
  '*.dwpart'
]

/** Exclude patterns typed one per line. Blank lines are dropped; # comments are kept for the user. */
export function patternLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** How many lines are patterns rather than comments. */
export function countPatterns(lines: string[]): number {
  return lines.filter((line) => !line.startsWith('#')).length
}
