import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const groupAssistantIdsSchema = z.array(nonEmptyString).min(1)

export const createGroupSchema = z.object({
  name: nonEmptyString,
  assistantIds: groupAssistantIdsSchema
})

export const updateGroupSchema = z
  .object({
    name: nonEmptyString.optional(),
    groupDescription: z.string().optional(),
    maxAutoTurns: z.number().int().min(1).max(12).optional()
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.groupDescription !== undefined ||
      input.maxAutoTurns !== undefined,
    {
      message: 'At least one group field must be provided'
    }
  )

export const createGroupThreadSchema = z.object({
  groupId: nonEmptyString,
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

export const replaceGroupMembersSchema = z.object({
  assistantIds: groupAssistantIdsSchema
})
