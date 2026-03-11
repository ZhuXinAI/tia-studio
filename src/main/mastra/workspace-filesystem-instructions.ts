import path from 'node:path'

export function createContainedLocalFilesystemInstructions(basePath: string): string {
  const identityPath = path.join(basePath, 'IDENTITY.md')
  const nestedPath = path.join(basePath, 'docs', 'guide.md')

  return [
    `Local filesystem at "${basePath}".`,
    'Paths passed to workspace file tools are workspace-relative, not raw disk paths.',
    `A file at the workspace root such as "IDENTITY.md" can be accessed as "IDENTITY.md" or "/IDENTITY.md", and resolves to "${identityPath}" on disk.`,
    `A nested file such as "docs/guide.md" can be accessed as "docs/guide.md" or "/docs/guide.md", and resolves to "${nestedPath}" on disk.`,
    'Do not prefix paths with the workspace name or repeat the base path.',
    'For example, do not use "/foo/IDENTITY.md" unless "foo" is a real subdirectory inside the workspace.'
  ].join(' ')
}
