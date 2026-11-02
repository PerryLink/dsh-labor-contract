import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { LaborError } from './labor.js'

/** A single export filename component: no separators, no whitespace, max 120 chars. */
export const SAFE_EXPORT_FILENAME = /^[A-Za-z0-9._-]{1,120}$/

/**
 * Resolve a caller-supplied export filename inside a base directory.
 *
 * 1. the filename must be one safe component (`[A-Za-z0-9._-]{1,120}`);
 * 2. the resolved path must stay below `resolve(baseDir) + sep`;
 * 3. the directory is created with `mkdir -p` and the path is re-anchored on
 *    `realpath(baseDir)` so a symlinked directory cannot redirect the write
 *    outside the canonical base.
 *
 * Every rejection is `E_LABOR_PATH_INVALID`; the tool surface deliberately
 * exposes one stable code for "the export path is not allowed".
 */
export async function safeExportPath(baseDir: string, filename: string): Promise<string> {
  if (typeof filename !== 'string' || !SAFE_EXPORT_FILENAME.test(filename)) {
    throw new LaborError('E_LABOR_PATH_INVALID', `unsafe export filename: ${JSON.stringify(filename)}`)
  }
  const base = path.resolve(baseDir)
  const candidate = path.resolve(base, filename)
  if (!candidate.startsWith(base + path.sep)) {
    throw new LaborError('E_LABOR_PATH_INVALID', `export path escapes base directory: ${JSON.stringify(filename)}`)
  }
  try {
    await mkdir(base, { recursive: true })
    const realBase = await realpath(base)
    const realCandidate = path.resolve(realBase, filename)
    if (!realCandidate.startsWith(realBase + path.sep)) {
      throw new LaborError('E_LABOR_PATH_INVALID', `export path escapes base directory after realpath: ${JSON.stringify(filename)}`)
    }
    return realCandidate
  } catch (error) {
    if (error instanceof LaborError) throw error
    throw new LaborError('E_LABOR_PATH_INVALID', String(error))
  }
}
