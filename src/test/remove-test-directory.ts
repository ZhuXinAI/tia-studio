import { rm } from 'node:fs/promises'

export async function removeTestDirectory(directory: string): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform === 'win32' && (code === 'EBUSY' || code === 'EPERM')) {
      return
    }
    throw error
  }
}
