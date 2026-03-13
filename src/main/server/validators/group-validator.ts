import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const createGroupWorkspaceSchema = z.object({
  name: nonEmptyString,
  rootPath: nonEmptyString
})

export const updateGroupWorkspaceSchema = z
  .object({
    name: nonEmptyString.optional(),
    rootPath: nonEmptyString.optional(),
    groupDescription: z.string().optional(),
    maxAutoTurns: z.number().int().min(1).max(12).optional()
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.rootPath !== undefined ||
      input.groupDescription !== undefined ||
      input.maxAutoTurns !== undefined,
    {
      message: 'At least one group workspace field must be provided'
    }
  )

export const createGroupThreadSchema = z.object({
  workspaceId: nonEmptyString,
  resourceId: nonEmptyString,
  title: z.string().optional()
})

export const updateGroupThreadSchema = z
  .object({
    title: z.string().optional()
  })
  .refine((input) => input.title !== undefined, {
    message: 'At least one group thread field must be provided'
  })

export const replaceGroupWorkspaceMembersSchema = z.object({
  assistantIds: z.array(nonEmptyString)
})
