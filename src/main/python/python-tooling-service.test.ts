import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTestDirectory } from '../../test/remove-test-directory'
import { PythonToolingService } from './python-tooling-service'

let directory: string | undefined

afterEach(async () => {
  if (directory) await removeTestDirectory(directory)
  directory = undefined
})

describe('PythonToolingService', () => {
  it('detects project signals and a local interpreter when available', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-python-'))
    await writeFile(join(directory, 'pyproject.toml'), '[project]\nname = "sample"\n')
    await writeFile(join(directory, 'main.py'), 'print("ok")\n')

    const project = await new PythonToolingService().inspect(directory)

    expect(project.projectFiles).toContain('pyproject.toml')
    expect(project.recommendedChecks).toEqual(['compile', 'pytest'])
    expect(project.interpreter?.version).toMatch(/^\d+\.\d+/)
  })

  it('runs the compile check in the selected workspace', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-python-'))
    await writeFile(join(directory, 'main.py'), 'value = 1\n')

    const result = await new PythonToolingService().runCheck(directory, 'compile')

    expect(result.kind).toBe('compile')
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
  })
})
