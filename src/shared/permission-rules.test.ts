import { describe, expect, it } from 'vitest'
import {
  analyzePermissionCommand,
  evaluatePermissionRules,
  permissionRuleMatches,
  type PermissionRule
} from './permission-rules'

function rule(
  input: Partial<PermissionRule> & Pick<PermissionRule, 'id' | 'argvPrefix'>
): PermissionRule {
  return {
    workspacePath: '/repo',
    tool: 'bash',
    decision: 'allow',
    rationale: 'test',
    origin: 'user-approval',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...input
  }
}

describe('permission command analysis', () => {
  it('parses quoted argv and provably simple command chains', () => {
    const analysis = analyzePermissionCommand("git status --short && ls 'two words'")
    expect(analysis.reusable).toBe(true)
    expect(analysis.segments).toEqual([
      ['git', 'status', '--short'],
      ['ls', 'two words']
    ])
    expect(analysis.proposals.map((item) => item.display)).toEqual([
      'git status --short',
      "ls 'two words'"
    ])
  })

  it('preserves empty quoted arguments', () => {
    expect(analyzePermissionCommand("printf '%s' ''").segments).toEqual([['printf', '%s', '']])
  })

  it.each(['echo $HOME', 'cat file > out', 'find . | xargs rm', 'echo *.ts', 'cat <<EOF'])(
    'does not derive a reusable rule for complex shell command %s',
    (command) => expect(analyzePermissionCommand(command).reusable).toBe(false)
  )

  it.each(['npm install zod', 'python script.py', 'sudo ls', 'rm -rf build', 'git reset --hard'])(
    'does not derive broad rules for powerful command %s',
    (command) => expect(analyzePermissionCommand(command).reusable).toBe(false)
  )
})

describe('permission rule matching', () => {
  it('uses argv-prefix matching without treating values as regexes', () => {
    const candidate = rule({ id: 'allow-status', argvPrefix: ['git', 'status'] })
    expect(permissionRuleMatches(candidate, ['git', 'status', '--short'])).toBe(true)
    expect(permissionRuleMatches(candidate, ['git', 'status.*'])).toBe(false)
  })

  it('requires every simple segment to be allowed', () => {
    const analysis = analyzePermissionCommand('git status && ls')
    expect(
      evaluatePermissionRules(analysis, [
        rule({ id: 'allow-status', argvPrefix: ['git', 'status'] })
      ]).decision
    ).toBe('ask')
  })

  it('applies the strictest matching decision', () => {
    const analysis = analyzePermissionCommand('git status --short')
    const rules = [
      rule({ id: 'allow-git', argvPrefix: ['git'], decision: 'allow' }),
      rule({ id: 'ask-status', argvPrefix: ['git', 'status'], decision: 'ask' }),
      rule({ id: 'deny-short', argvPrefix: ['git', 'status', '--short'], decision: 'deny' })
    ]
    expect(evaluatePermissionRules(analysis, rules)).toEqual({
      decision: 'deny',
      matchedRuleIds: ['allow-git', 'ask-status', 'deny-short']
    })
  })
})
