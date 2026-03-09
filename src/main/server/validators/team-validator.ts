import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const createTeamWorkspaceSchema = z.object({
  name: nonEmptyString,
  rootPath: nonEmptyString
})

export const updateTeamWorkspaceSchema = z
  .object({
    name: nonEmptyString.optional(),
    rootPath: nonEmptyString.optional(),
    teamDescription: z.string().optional(),
    supervisorProviderId: nonEmptyString.nullable().optional(),
    supervisorModel: z.string().optional()
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.rootPath !== undefined ||
      input.teamDescription !== undefined ||
      input.supervisorProviderId !== undefined ||
      input.supervisorModel !== undefined,
    {
      message: 'At least one team workspace field must be provided'
    }
  )
  .superRefine((input, context) => {
    const hasProviderId =
      input.supervisorProviderId !== undefined && input.supervisorProviderId !== null
    const hasModel = input.supervisorModel !== undefined && input.supervisorModel.trim().length > 0
    const isClearingConfig =
      input.supervisorProviderId === null &&
      (input.supervisorModel === undefined || input.supervisorModel === '')

    if (isClearingConfig) {
      return
    }

    if (hasProviderId && !hasModel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'supervisorModel is required when supervisorProviderId is set',
        path: ['supervisorModel']
      })
    }

    if (hasModel && !hasProviderId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'supervisorProviderId is required when supervisorModel is set',
        path: ['supervisorProviderId']
      })
    }
  })

export const createTeamThreadSchema = z.object({
  workspaceId: nonEmptyString,
  resourceId: nonEmptyString,
  title: z.string().optional()
})

export const updateTeamThreadSchema = z
  .object({
    title: z.string().optional(),
    teamDescription: z.string().optional(),
    supervisorProviderId: nonEmptyString.nullable().optional(),
    supervisorModel: z.string().optional()
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.teamDescription !== undefined ||
      input.supervisorProviderId !== undefined ||
      input.supervisorModel !== undefined,
    {
      message: 'At least one team thread field must be provided'
    }
  )
  .superRefine((input, context) => {
    const hasProviderId =
      input.supervisorProviderId !== undefined && input.supervisorProviderId !== null
    const hasModel = input.supervisorModel !== undefined && input.supervisorModel.trim().length > 0
    const isClearingConfig =
      input.supervisorProviderId === null &&
      (input.supervisorModel === undefined || input.supervisorModel === '')

    if (isClearingConfig) {
      return
    }

    if (hasProviderId && !hasModel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'supervisorModel is required when supervisorProviderId is set',
        path: ['supervisorModel']
      })
    }

    if (hasModel && !hasProviderId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'supervisorProviderId is required when supervisorModel is set',
        path: ['supervisorProviderId']
      })
    }
  })

export const replaceTeamThreadMembersSchema = z.object({
  assistantIds: z.array(nonEmptyString)
})

export const replaceTeamWorkspaceMembersSchema = z.object({
  assistantIds: z.array(nonEmptyString)
})
