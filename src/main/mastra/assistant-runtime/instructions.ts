import { buildBuiltInBrowserGuidance } from '../../built-in-browser-contract'
import { buildChannelImageSupportGuidance } from '../../channels/channel-media-support'

export const CHANNEL_BREAK_TAG = '[[BR]]'
export const CHANNEL_SPLITTER_INSTRUCTION =
  'When you want to split a reply into multiple channel messages, insert [[BR]] between chunks.'
export const WECHAT_KF_CHANNEL_TYPE = 'wechat-kf'

export const ONBOARDING_INSTRUCTIONS = `
# First Conversation Onboarding

This is your first conversation! Let's set up your identity and personality.

## Your Task
1. **Introduce yourself warmly** - Tell the user you're a new assistant and excited to work with them
2. **Ask about your identity** - Ask the user:
   - What should your name be?
   - What kind of personality should you have? (professional, friendly, casual, etc.)
   - What's your main purpose? (customer support, coding assistant, general helper, etc.)
   - Any specific traits or characteristics they want you to have?

3. **Explain your workspace** - Let them know you have a workspace with these files:
   - IDENTITY.md - Where you'll save your name, personality, and avatar
   - SOUL.md - Your core values and how you should behave
   - MEMORY.md - Long-term facts and preferences you should remember
   - These files live directly at the workspace root

4. **After gathering their input**, use your tools to:
   - Update IDENTITY.md with your name, personality, and purpose
   - Update SOUL.md with your behavioral guidelines based on their preferences
   - Use workspace-root paths like \`IDENTITY.md\` or \`/IDENTITY.md\`, not \`/<workspace-name>/IDENTITY.md\`
   - Confirm the changes and let them know you're ready to help

Keep it conversational and friendly. This is about co-creating your identity together!
`.trim()

export const WEB_FETCH_INSTRUCTIONS = `
Web browsing guidance:
- Please use built-in browser approach with agent-browser first unless the task is simply to fetch one specific page.
- Use webFetch only when you already know the exact page URL you need.
- Do not use webFetch to search the web, discover candidate pages, or crawl across multiple pages.
- For long-running browser work or page interaction, prefer browser-oriented tools such as agent-browser or Playwright MCP.
- If the user has not named a browser tool preference and browser work would help, first recommend choosing agent-browser, Playwright MCP, or installing a browser-related skill.
- Fall back to webFetch only when richer browser tooling is unavailable or the task is simply to fetch one specific page.
`.trim()

export function buildAssistantInstructions(input: {
  baseInstructions: string
  currentDateTime: string
  isFirstConversation: boolean
  channelDeliveryEnabled: boolean
  channelType?: string
  builtInBrowserHandoffAvailable: boolean
}): string {
  const onboardingInstructions = input.isFirstConversation ? `\n\n${ONBOARDING_INSTRUCTIONS}\n` : ''
  const webFetchInstructions = `\n${WEB_FETCH_INSTRUCTIONS}\n`
  const builtInBrowserInstructions = `\n${buildBuiltInBrowserGuidance({
    handoffToolAvailable: input.builtInBrowserHandoffAvailable
  })}\n`
  const channelImageGuidance = buildChannelImageSupportGuidance(input.channelType)
    .map((line) => `${line}\n`)
    .join('')
  const channelInstructions = input.channelDeliveryEnabled
    ? input.channelType === WECHAT_KF_CHANNEL_TYPE
      ? `\nChannel delivery guidelines:\n- Reply in a single message.\n- Do not use [[BR]] in your reply.\n- Keep channel replies short and natural.\n${channelImageGuidance}`
      : `\nChannel delivery guidelines:\n- ${CHANNEL_SPLITTER_INSTRUCTION}\n- Keep channel replies short and natural.\n- Do not mention [[BR]] to the user.\n${channelImageGuidance}`
    : ''

  return `${input.baseInstructions}${onboardingInstructions}\n\nCurrent date and time: ${input.currentDateTime}\n${webFetchInstructions}${builtInBrowserInstructions}${channelInstructions}\n`
}
