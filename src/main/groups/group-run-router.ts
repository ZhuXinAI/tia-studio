import { randomUUID } from 'node:crypto'
import type { MessageListInput } from '@mastra/core/agent/message-list'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import {
  extractMentionedAssistantIds,
  selectNextGroupSpeaker,
  type GroupSpeaker
} from './group-turn-selector'
import type { GroupEventBus } from './group-event-bus'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type {
  AppGroupThread,
  AppGroupThreadMessage,
  GroupThreadsRepository
} from '../persistence/repos/group-threads-repo'
import type {
  AppGroupWorkspace,
  GroupWorkspacesRepository
} from '../persistence/repos/group-workspaces-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { GroupRunStatusStore } from '../server/chat/group-run-status-store'
import type { GroupThreadEventsStore } from '../server/chat/group-thread-events-store'
import { logger } from '../utils/logger'

type GroupRunRouterOptions = {
  bus: GroupEventBus
  assistantsRepo: Pick<AssistantsRepository, 'getById'>
  groupThreadsRepo: GroupThreadsRepository
  groupWorkspacesRepo: GroupWorkspacesRepository
  threadsRepo: ThreadsRepository
  assistantRuntime: Pick<AssistantRuntime, 'runGroupTurn'>
  statusStore: GroupRunStatusStore
  threadEventsStore: GroupThreadEventsStore
}

type ExecutedTurnResult = {
  messagePosted: boolean
  passed: boolean
  latestMessage: AppGroupThreadMessage | null
}

function formatRoomMessageForPrompt(
  message: AppGroupThreadMessage,
  members: GroupSpeaker[]
): string {
  const mentionLabels = message.mentions
    .map((assistantId) => members.find((member) => member.assistantId === assistantId)?.name ?? assistantId)
    .map((name) => `@${name}`)
  const mentionSuffix = mentionLabels.length > 0 ? ` [mentions: ${mentionLabels.join(', ')}]` : ''
  return `${message.authorName}: ${message.content}${mentionSuffix}`
}

function buildGroupTurnMessages(input: {
  workspace: AppGroupWorkspace
  speaker: GroupSpeaker
  members: GroupSpeaker[]
  recentMessages: AppGroupThreadMessage[]
  triggerMessageId: string
}): MessageListInput {
  const triggerMessage =
    input.recentMessages.find((message) => message.id === input.triggerMessageId) ??
    input.recentMessages.at(-1) ??
    null
  const transcript = input.recentMessages
    .slice(-12)
    .map((message) => formatRoomMessageForPrompt(message, input.members))
    .join('\n')
  const roster = input.members
    .map((member) =>
      `- ${member.name} (${member.assistantId})${member.assistantId === input.speaker.assistantId ? ' [you]' : ''}`
    )
    .join('\n')
  const prompt = [
    `You are ${input.speaker.name} (${input.speaker.assistantId}) in a shared group room.`,
    `Group goal: ${input.workspace.groupDescription || 'Coordinate helpfully on the latest watcher request.'}`,
    'Room roster:',
    roster,
    triggerMessage ? `Latest trigger: ${formatRoomMessageForPrompt(triggerMessage, input.members)}` : null,
    'Recent room transcript:',
    transcript || '(no prior room messages)',
    'Instructions:',
    '- Use the postToGroup tool to add one concise message to the room.',
    '- Mention a teammate only if you want them to respond next.',
    '- Use passGroupTurn if you have nothing useful to add right now.',
    '- Ask the watcher for input only when human guidance is required to continue.'
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n')

  return [
    {
      id: `group-turn:${input.speaker.assistantId}:${randomUUID()}`,
      role: 'user',
      content: prompt,
      parts: [
        {
          type: 'text',
          text: prompt
        }
      ]
    }
  ]
}

function asksWatcherForInput(message: AppGroupThreadMessage): boolean {
  if (message.authorType !== 'assistant' || message.mentions.length > 0) {
    return false
  }

  const content = message.content.trim()
  if (!content.includes('?')) {
    return false
  }

  return /\b(can you|could you|would you|please share|let me know|what|which|when|where|who|why|how)\b/i.test(
    content
  )
}

export class GroupRunRouter {
  private unsubscribeRequested: (() => void) | null = null
  private readonly chainsByThread = new Map<string, Promise<void>>()

  constructor(private readonly options: GroupRunRouterOptions) {}

  async start(): Promise<void> {
    if (this.unsubscribeRequested) {
      return
    }

    this.unsubscribeRequested = this.options.bus.subscribe('group.run.requested', (event) => {
      logger.info('[GroupFlow] Enqueued group run', {
        runId: event.runId,
        groupThreadId: event.groupThreadId,
        profileId: event.profileId,
        triggerMessageId: event.triggerMessageId,
        waitingForExistingRun: this.chainsByThread.has(event.groupThreadId)
      })
      void this.enqueueRun(event.groupThreadId, async () => {
        await this.processRun(event)
      })
    })
  }

  async stop(): Promise<void> {
    if (this.unsubscribeRequested) {
      this.unsubscribeRequested()
      this.unsubscribeRequested = null
    }

    await Promise.allSettled(this.chainsByThread.values())
    this.chainsByThread.clear()
  }

  private enqueueRun(groupThreadId: string, work: () => Promise<void>): Promise<void> {
    const previousChain = this.chainsByThread.get(groupThreadId) ?? Promise.resolve()
    const nextChain = previousChain.catch(() => undefined).then(work)

    this.chainsByThread.set(groupThreadId, nextChain)

    return nextChain.finally(() => {
      if (this.chainsByThread.get(groupThreadId) === nextChain) {
        this.chainsByThread.delete(groupThreadId)
      }
    })
  }

  private async processRun(event: {
    runId: string
    groupThreadId: string
    profileId: string
    triggerMessageId: string
  }): Promise<void> {
    try {
      logger.info('[GroupFlow] Starting group run', {
        runId: event.runId,
        groupThreadId: event.groupThreadId,
        profileId: event.profileId,
        triggerMessageId: event.triggerMessageId
      })

      const thread = await this.options.groupThreadsRepo.getById(event.groupThreadId)
      if (!thread || thread.resourceId !== event.profileId) {
        throw new Error('Group thread not found')
      }

      const workspace = await this.options.groupWorkspacesRepo.getById(thread.workspaceId)
      if (!workspace) {
        throw new Error('Group workspace not found')
      }

      const members = await this.loadRunnableMembers(workspace.id)
      if (members.length === 0) {
        throw new Error('Group has no runnable assistants')
      }

      logger.info('[GroupFlow] Loaded runnable group members', {
        runId: event.runId,
        groupThreadId: event.groupThreadId,
        workspaceId: workspace.id,
        maxAutoTurns: workspace.maxAutoTurns,
        memberIds: members.map((member) => member.assistantId)
      })

      const usedSpeakerIds: string[] = []
      let consecutivePasses = 0

      for (let turnIndex = 0; turnIndex < workspace.maxAutoTurns; turnIndex += 1) {
        const recentMessages = await this.options.groupThreadsRepo.listMessages(thread.id)
        const speaker = selectNextGroupSpeaker({
          members,
          recentMessages,
          speakersUsedInRun: usedSpeakerIds
        })

        if (!speaker) {
          logger.info('[GroupFlow] No speaker available, ending group run', {
            runId: event.runId,
            groupThreadId: thread.id,
            turn: turnIndex + 1
          })
          break
        }

        usedSpeakerIds.push(speaker.assistantId)
        logger.info('[GroupFlow] Selected group speaker', {
          runId: event.runId,
          groupThreadId: thread.id,
          turn: turnIndex + 1,
          assistantId: speaker.assistantId,
          assistantName: speaker.name
        })
        this.options.statusStore.append(event.runId, {
          type: 'speaker-selected',
          data: {
            assistantId: speaker.assistantId,
            assistantName: speaker.name,
            turn: turnIndex + 1
          }
        })

        const assistantThreadId = await this.ensureAssistantThread(thread, workspace, speaker)
        logger.info('[GroupFlow] Ready to invoke assistant for group turn', {
          runId: event.runId,
          groupThreadId: thread.id,
          turn: turnIndex + 1,
          assistantId: speaker.assistantId,
          assistantThreadId
        })
        this.options.statusStore.append(event.runId, {
          type: 'turn-started',
          data: {
            assistantId: speaker.assistantId,
            assistantName: speaker.name,
            turn: turnIndex + 1
          }
        })

        const turnResult = await this.executeAssistantTurn({
          runId: event.runId,
          profileId: event.profileId,
          thread,
          workspace,
          speaker,
          members,
          assistantThreadId,
          triggerMessageId: event.triggerMessageId
        })

        if (turnResult.messagePosted && turnResult.latestMessage) {
          consecutivePasses = 0
          const effectiveMentions =
            turnResult.latestMessage.mentions.length > 0
              ? turnResult.latestMessage.mentions
              : extractMentionedAssistantIds(turnResult.latestMessage.content, members)

          logger.info('[GroupFlow] Assistant posted group message', {
            runId: event.runId,
            groupThreadId: thread.id,
            assistantId: speaker.assistantId,
            messageId: turnResult.latestMessage.id,
            mentionIds: effectiveMentions
          })

          if (
            effectiveMentions.length === 0 &&
            asksWatcherForInput(turnResult.latestMessage)
          ) {
            logger.info('[GroupFlow] Ending group run after assistant asked watcher for input', {
              runId: event.runId,
              groupThreadId: thread.id,
              assistantId: speaker.assistantId,
              messageId: turnResult.latestMessage.id
            })
            break
          }

          const uniqueSpeakersUsed = new Set(usedSpeakerIds)
          if (effectiveMentions.length === 0 && uniqueSpeakersUsed.size >= members.length) {
            logger.info('[GroupFlow] Ending group run after all assistants responded without further mentions', {
              runId: event.runId,
              groupThreadId: thread.id,
              speakersUsed: [...uniqueSpeakersUsed]
            })
            break
          }

          continue
        }

        consecutivePasses += 1
        if (consecutivePasses >= members.length) {
          logger.info('[GroupFlow] Ending group run after consecutive passes', {
            runId: event.runId,
            groupThreadId: thread.id,
            consecutivePasses,
            memberCount: members.length
          })
          break
        }

        if (!turnResult.passed) {
          logger.warn('[GroupFlow] Assistant turn ended without any room action', {
            runId: event.runId,
            groupThreadId: thread.id,
            assistantId: speaker.assistantId,
            turn: turnIndex + 1
          })
          this.options.statusStore.append(event.runId, {
            type: 'turn-passed',
            data: {
              assistantId: speaker.assistantId,
              assistantName: speaker.name,
              reason: 'No room action emitted'
            }
          })
        }
      }

      this.options.statusStore.finishRun(event.runId)
      logger.info('[GroupFlow] Group run finished', {
        runId: event.runId,
        groupThreadId: event.groupThreadId,
        turnsExecuted: usedSpeakerIds.length
      })
    } catch (error) {
      logger.error('[GroupFlow] Group run failed', {
        runId: event.runId,
        groupThreadId: event.groupThreadId,
        error
      })
      this.options.statusStore.failRun(
        event.runId,
        error instanceof Error ? error.message : 'Failed to execute group run'
      )
    }
  }

  private async loadRunnableMembers(workspaceId: string): Promise<GroupSpeaker[]> {
    const workspaceMembers = await this.options.groupWorkspacesRepo.listMembers(workspaceId)
    const liveMembers = await Promise.all(
      workspaceMembers.map(async (member) => {
        const assistant = await this.options.assistantsRepo.getById(member.assistantId)
        if (!assistant) {
          return null
        }

        return {
          assistantId: assistant.id,
          name: assistant.name
        }
      })
    )

    return liveMembers.filter((member): member is GroupSpeaker => member !== null)
  }

  private async ensureAssistantThread(
    thread: AppGroupThread,
    workspace: AppGroupWorkspace,
    speaker: GroupSpeaker
  ): Promise<string> {
    const existingBinding = await this.options.groupThreadsRepo.getAssistantThreadBinding(
      thread.id,
      speaker.assistantId
    )
    if (existingBinding) {
      logger.info('[GroupFlow] Reusing assistant thread binding', {
        groupThreadId: thread.id,
        assistantId: speaker.assistantId,
        assistantThreadId: existingBinding.assistantThreadId
      })
      return existingBinding.assistantThreadId
    }

    const assistantThread = await this.options.threadsRepo.create({
      assistantId: speaker.assistantId,
      resourceId: thread.resourceId,
      title: thread.title || workspace.name,
      metadata: {
        system: true,
        systemType: 'group',
        groupThreadId: thread.id,
        groupWorkspaceId: workspace.id
      }
    })

    await this.options.groupThreadsRepo.upsertAssistantThreadBinding({
      groupThreadId: thread.id,
      assistantId: speaker.assistantId,
      assistantThreadId: assistantThread.id
    })

    logger.info('[GroupFlow] Created assistant thread binding', {
      groupThreadId: thread.id,
      assistantId: speaker.assistantId,
      assistantThreadId: assistantThread.id
    })

    return assistantThread.id
  }

  private async executeAssistantTurn(input: {
    runId: string
    profileId: string
    thread: AppGroupThread
    workspace: AppGroupWorkspace
    speaker: GroupSpeaker
    members: GroupSpeaker[]
    assistantThreadId: string
    triggerMessageId: string
  }): Promise<ExecutedTurnResult> {
    let messagePosted = false
    let passed = false
    let latestMessage: AppGroupThreadMessage | null = null

    const unsubscribeMessage = this.options.bus.subscribe('group.message.requested', async (event) => {
      if (
        event.runId !== input.runId ||
        event.groupThreadId !== input.thread.id ||
        event.assistantId !== input.speaker.assistantId
      ) {
        return
      }

      const message = await this.options.groupThreadsRepo.appendMessage({
        threadId: input.thread.id,
        role: 'assistant',
        authorType: 'assistant',
        authorId: input.speaker.assistantId,
        authorName: input.speaker.name,
        content: event.content,
        mentions: event.mentions,
        replyToMessageId: event.replyToMessageId ?? null
      })

      this.options.threadEventsStore.appendMessageCreated({
        threadId: input.thread.id,
        profileId: input.profileId,
        messageId: message.id
      })
      logger.info('[GroupFlow] Appended assistant room message', {
        runId: input.runId,
        groupThreadId: input.thread.id,
        assistantId: input.speaker.assistantId,
        assistantThreadId: input.assistantThreadId,
        messageId: message.id,
        mentionIds: event.mentions,
        replyToMessageId: event.replyToMessageId ?? null
      })
      this.options.statusStore.append(input.runId, {
        type: 'message-posted',
        data: {
          assistantId: input.speaker.assistantId,
          assistantName: input.speaker.name,
          messageId: message.id,
          mentions: event.mentions
        }
      })

      messagePosted = true
      latestMessage = message
    })

    const unsubscribePass = this.options.bus.subscribe('group.turn.passed', async (event) => {
      if (
        event.runId !== input.runId ||
        event.groupThreadId !== input.thread.id ||
        event.assistantId !== input.speaker.assistantId
      ) {
        return
      }

      this.options.statusStore.append(input.runId, {
        type: 'turn-passed',
        data: {
          assistantId: input.speaker.assistantId,
          assistantName: input.speaker.name,
          ...(event.reason ? { reason: event.reason } : {})
        }
      })
      logger.info('[GroupFlow] Recorded passed group turn', {
        runId: input.runId,
        groupThreadId: input.thread.id,
        assistantId: input.speaker.assistantId,
        reason: event.reason ?? null
      })
      passed = true
    })

    try {
      const recentMessages = await this.options.groupThreadsRepo.listMessages(input.thread.id)
      const replyToMessageId = recentMessages.at(-1)?.id
      const turnResult = await this.options.assistantRuntime.runGroupTurn({
        assistantId: input.speaker.assistantId,
        threadId: input.assistantThreadId,
        profileId: input.profileId,
        messages: buildGroupTurnMessages({
          workspace: input.workspace,
          speaker: input.speaker,
          members: input.members,
          recentMessages,
          triggerMessageId: input.triggerMessageId
        }),
        groupContext: {
          runId: input.runId,
          groupThreadId: input.thread.id,
          allowedMentions: input.members
            .filter((member) => member.assistantId !== input.speaker.assistantId)
            .map((member) => ({
              assistantId: member.assistantId,
              name: member.name
            })),
          ...(replyToMessageId ? { replyToMessageId } : {})
        }
      })

      logger.info('[GroupFlow] Assistant runtime finished group turn', {
        runId: input.runId,
        groupThreadId: input.thread.id,
        assistantId: input.speaker.assistantId,
        assistantThreadId: input.assistantThreadId,
        outputTextLength: turnResult.outputText.length,
        messagePosted,
        passed
      })
    } finally {
      unsubscribeMessage()
      unsubscribePass()
    }

    return {
      messagePosted,
      passed,
      latestMessage
    }
  }
}
