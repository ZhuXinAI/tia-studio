export const DEFAULT_GROUP_REQUIRE_MENTION = true

export function resolveGroupRequireMention(config: Record<string, unknown> | null | undefined): boolean {
  if (!config) {
    return DEFAULT_GROUP_REQUIRE_MENTION
  }

  return typeof config.groupRequireMention === 'boolean'
    ? config.groupRequireMention
    : DEFAULT_GROUP_REQUIRE_MENTION
}
