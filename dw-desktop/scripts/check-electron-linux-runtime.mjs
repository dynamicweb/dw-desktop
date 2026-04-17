#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(dirname, '..')
const electronBinary = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron')
const nativeModuleRoot = path.join(rootDir, 'node_modules')

if (process.platform !== 'linux' || !existsSync(electronBinary)) {
  process.exit(0)
}

const findResult = spawnSync(
  'find',
  [
    nativeModuleRoot,
    '(',
    '-path',
    '*/build/Release/*.node',
    '-o',
    '-path',
    '*/prebuilds/*/*.node',
    ')'
  ],
  {
    encoding: 'utf8'
  }
)

if (findResult.error) {
  console.warn('Skipping native module discovery because `find` is unavailable.')
}

const binariesToCheck = [
  { name: 'Electron', file: electronBinary },
  ...`${findResult.stdout ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => ({ name: path.relative(rootDir, file), file }))
]

/** @type {Map<string, string[]>} */
const missingLibrarySources = new Map()

for (const binary of binariesToCheck) {
  const lddResult = spawnSync('ldd', [binary.file], { encoding: 'utf8' })

  if (lddResult.error) {
    console.warn('Skipping Electron runtime dependency check because `ldd` is unavailable.')
    process.exit(0)
  }

  const missingLibrariesForBinary = `${lddResult.stdout}\n${lddResult.stderr}`
    .split('\n')
    .filter((line) => line.includes('=> not found'))
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean)

  for (const library of missingLibrariesForBinary) {
    const sources = missingLibrarySources.get(library) ?? []
    sources.push(binary.name)
    missingLibrarySources.set(library, sources)
  }
}

const missingLibraries = Array.from(missingLibrarySources.keys())

if (missingLibraries.length === 0) {
  process.exit(0)
}

if (binariesToCheck.length === 0) {
  console.warn('Skipping Electron runtime dependency check because `ldd` is unavailable.')
  process.exit(0)
}

// This helper stays in plain Node ESM so it can run before the TS toolchain is involved.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const readOsRelease = () => {
  try {
    const content = readFileSync('/etc/os-release', 'utf8')
    return Object.fromEntries(
      content
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('='))
        .filter(([key, value]) => key && value)
        .map(([key, value]) => [key, value.replace(/^"/, '').replace(/"$/, '')])
    )
  } catch {
    return {}
  }
}

const osRelease = readOsRelease()
const isUbuntuOrDebian = ['ubuntu', 'debian'].includes((osRelease.ID || '').toLowerCase())
const usesT64Asound = /^24\./.test(osRelease.VERSION_ID || '')

const libraryToPackage = {
  'libasound.so.2': usesT64Asound ? 'libasound2t64' : 'libasound2',
  'libsecret-1.so.0': 'libsecret-1-0',
  'libnspr4.so': 'libnspr4',
  'libnss3.so': 'libnss3',
  'libnssutil3.so': 'libnss3',
  'libsmime3.so': 'libnss3'
}

const suggestedPackages = Array.from(
  new Set(missingLibraries.map((library) => libraryToPackage[library]).filter(Boolean))
)

console.error('\nElectron is installed, but Linux runtime libraries are missing.')
console.error('Missing shared libraries:')
for (const library of missingLibraries) {
  const sources = Array.from(new Set(missingLibrarySources.get(library) ?? []))
  const sourceSuffix = sources.length > 0 ? ` (${sources.join(', ')})` : ''
  console.error(`- ${library}${sourceSuffix}`)
}

if (isUbuntuOrDebian && suggestedPackages.length > 0) {
  console.error('\nInstall them with:')
  console.error(`sudo apt install -y ${suggestedPackages.join(' ')}`)

  if (usesT64Asound && suggestedPackages.includes('libasound2t64')) {
    console.error('If your distro does not provide `libasound2t64`, try `libasound2` instead.')
  }
}

console.error('\nRe-run the same npm command after installing the packages.')
process.exit(1)
