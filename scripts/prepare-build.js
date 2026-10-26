import { mkdirSync, rmSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'dist')
const inside = relative(root, output)
if (!inside || inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) {
  throw new Error('Invalid build directory')
}
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
