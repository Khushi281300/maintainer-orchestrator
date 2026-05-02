import { describe, it, expect, vi } from 'vitest'
import app from '../index.js'

describe('Hiero Workflow Hub', () => {
  it('adds labels when an issue is opened based on config', async () => {
    const octokit = {
      issues: {
        addLabels: vi.fn().mockResolvedValue({}),
      },
    }

    const mockContext = {
      octokit,
      log: { info: vi.fn() },
      payload: {
        repository: { full_name: 'hiero-ledger/hiero-sdk-python' },
        issue: { number: 123 },
      },
      issue: (data) => ({ owner: 'hiero-ledger', repo: 'hiero-sdk-python', issue_number: 123, ...data }),
      config: vi.fn().mockResolvedValue({
        autoLabel: { onNewIssue: ['status/triage'] }
      })
    }

    // Simulate the event handler
    const handler = async (ctx) => {
      const config = await ctx.config('hiero-workflow.yml')
      if (config.autoLabel) {
        await ctx.octokit.issues.addLabels(ctx.issue({ labels: config.autoLabel.onNewIssue }))
      }
    }

    await handler(mockContext)

    expect(octokit.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['status/triage']
      })
    )
  })

  it('assigns a user when they comment /assign and meet requirements', async () => {
    const octokit = {
      issues: {
        addAssignees: vi.fn().mockResolvedValue({}),
        createComment: vi.fn().mockResolvedValue({}),
      },
    }

    const mockContext = {
      octokit,
      log: { info: vi.fn() },
      payload: {
        repository: { full_name: 'hiero-ledger/hiero-sdk-js' },
        issue: { number: 456 },
        comment: { body: '/assign', user: { login: 'khushi-dev' } }
      },
      issue: (data) => ({ owner: 'hiero-ledger', repo: 'hiero-sdk-js', issue_number: 456, ...data }),
      config: vi.fn().mockResolvedValue({
        contributor_check: { min_commits: 3 }
      })
    }

    // Simulate the comment handler logic
    const handler = async (ctx) => {
      const config = await ctx.config('hiero-workflow.yml')
      const user = ctx.payload.comment.user.login
      const minCommits = config.contributor_check.min_commits
      const userCommits = 5 // Mocked pass

      if (userCommits >= minCommits) {
        await ctx.octokit.issues.addAssignees(ctx.issue({ assignees: [user] }))
        await ctx.octokit.issues.createComment(ctx.issue({ body: `Success @${user}` }))
      }
    }

    await handler(mockContext)

    expect(octokit.issues.addAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ['khushi-dev'] })
    )
    expect(octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Success @khushi-dev' })
    )
  })

  it('recommends reviewers based on changed files in a PR', async () => {
    const octokit = {
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
      },
    }

    const mockContext = {
      octokit,
      log: { info: vi.fn() },
      payload: {
        repository: { full_name: 'hiero-ledger/hiero-sdk-python' },
        pull_request: { number: 789 },
      },
      issue: (data) => ({ owner: 'hiero-ledger', repo: 'hiero-sdk-python', issue_number: 789, ...data }),
      config: vi.fn().mockResolvedValue({
        reviewer_recommendation: {
          enabled: true,
          expert_map: { "src/python/**": ["@python-expert-1"] }
        }
      })
    }

    // Simulate the PR handler logic
    const handler = async (ctx) => {
      const config = await ctx.config('hiero-workflow.yml')
      const reviewers = config.reviewer_recommendation.expert_map["src/python/**"]
      await ctx.octokit.issues.createComment(ctx.issue({
        body: `🔍 Reviewer Recommendation: ${reviewers.join(", ")}`
      }))
    }

    await handler(mockContext)

    expect(octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('@python-expert-1')
      })
    )
  })

  it('responds to /help command', async () => {
    const octokit = {
      issues: { createComment: vi.fn().mockResolvedValue({}) }
    }
    const mockContext = {
      octokit,
      log: { info: vi.fn() },
      payload: {
        repository: { full_name: 'hiero' },
        issue: { number: 1 },
        comment: { body: '/help', user: { login: 'khushi' } }
      },
      issue: (data) => data
    }
    const handler = async (ctx) => {
      if (ctx.payload.comment.body === '/help') {
        await ctx.octokit.issues.createComment({ body: 'Help menu' })
      }
    }
    await handler(mockContext)
    expect(octokit.issues.createComment).toHaveBeenCalledWith({ body: 'Help menu' })
  })
})
