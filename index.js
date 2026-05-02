/**
 * Hiero Workflow Hub (V2 Prototype)
 * Demonstrates centralized orchestration and per-repo configuration.
 */
export default (app) => {
  // Helper for structured audit logging
  const createAuditLog = (context, event, actor, decision, reason) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      repo: context.payload.repository.full_name,
      event: event,
      actor: actor,
      decision: decision,
      reason: reason,
      config_snapshot: context.config_snapshot || {}
    };
    app.log.info({ audit: logEntry }, "AUDIT_LOG_ENTRY");
    return logEntry;
  };

  app.on(["issues.opened", "pull_request.opened"], async (context) => {
    const config = await context.config("hiero-workflow.yml");
    context.config_snapshot = config; // Store for audit log
    
    if (!config) return;

    if (config.autoLabel) {
      const labels = context.payload.issue ? config.autoLabel.onNewIssue : config.autoLabel.onNewPR;
      await context.octokit.issues.addLabels(context.issue({ labels }));
      createAuditLog(context, "auto_label", "system", "applied", `Labels: ${labels.join(", ")}`);
    }
  });

  // ITEM #3: End-to-End Workflow (/assign comment)
  app.on("issue_comment.created", async (context) => {
    const { comment, issue } = context.payload;
    
    if (comment.body.trim().toLowerCase() === "/assign") {
      const config = await context.config("hiero-workflow.yml");
      context.config_snapshot = config;

      const user = comment.user.login;
      app.log.info(`Processing /assign for user: ${user}`);

      // Simulated Check: min_commits (Stateless approach)
      const minCommits = config.contributor_check?.min_commits || 0;
      
      // In V2, we'd fetch this from Octokit. For prototype, we show the decision logic.
      const userCommits = 5; // Mocked value

      if (userCommits >= minCommits) {
        await context.octokit.issues.addAssignees(context.issue({ assignees: [user] }));
        await context.octokit.issues.createComment(context.issue({ 
          body: `Happy to have you, @${user}! You've been assigned to this issue. Let us know if you need any help.` 
        }));
        createAuditLog(context, "contributor_check", user, "approved", `userCommits (${userCommits}) >= minCommits (${minCommits})`);
      } else {
        await context.octokit.issues.createComment(context.issue({ 
          body: `Hi @${user}! To maintain quality, this issue requires ${minCommits} signed commits in Hiero repos. Check out our [Onboarding Guide](link) to get started!` 
        }));
        createAuditLog(context, "contributor_check", user, "denied", `userCommits (${userCommits}) < minCommits (${minCommits})`);
      }
    }

    // NEW: /help command
    if (comment.body.trim().toLowerCase() === "/help") {
      await context.octokit.issues.createComment(context.issue({
        body: `### 🤖 Hiero Workflow Hub Help
I am the V2 Orchestrator for Hiero Ledger. Here is how I can help:
- \`/assign\`: Request assignment to this issue (requires 3 signed commits).
- \`/check\`: See your current contributor progression status.
- \`/help\`: Show this help menu.

*I also automatically label issues and recommend reviewers on PRs!*`
      }));
    }

    // NEW: /check command (Progression Tracking)
    if (comment.body.trim().toLowerCase() === "/check") {
      const config = await context.config("hiero-workflow.yml");
      const user = comment.user.login;
      const target = config.progression?.minMergedPRs || 3;
      
      // Mocked progression data (Stateless derivation from GitHub API in production)
      const current = 1; 

      await context.octokit.issues.createComment(context.issue({
        body: `### 📊 Contributor Status: @${user}
- **Current Merged PRs**: ${current}
- **Target for Junior Committer**: ${target}
- **Status**: ${target - current} more PRs needed to qualify. Keep up the great work!`
      }));
      createAuditLog(context, "progression_check", user, "neutral", `Checked progression: ${current}/${target}`);
    }
  });

  // ADVANCED: Reviewer Recommendation Logic
  app.on("pull_request.opened", async (context) => {
    const config = await context.config("hiero-workflow.yml");
    if (!config || !config.reviewer_recommendation?.enabled) return;

    const { pull_request } = context.payload;
    app.log.info(`Analyzing PR #${pull_request.number} for reviewer recommendations...`);

    // In production, we'd use context.octokit.pulls.listFiles()
    // Mocking changed files for the prototype demonstration
    const changedFiles = ["src/python/main.py", "docs/readme.md"]; 
    
    const recommendations = new Set();
    const expertMap = config.reviewer_recommendation.expert_map;

    // Simple path matching logic
    changedFiles.forEach(file => {
      if (file.startsWith("src/python/")) expertMap["src/python/**"]?.forEach(e => recommendations.add(e));
      if (file.startsWith("src/js/")) expertMap["src/js/**"]?.forEach(e => recommendations.add(e));
      if (file.startsWith("docs/")) expertMap["docs/**"]?.forEach(e => recommendations.add(e));
    });

    if (recommendations.size > 0) {
      const reviewerList = Array.from(recommendations).join(", ");
      await context.octokit.issues.createComment(context.issue({
        body: `🔍 **Reviewer Recommendation**: Based on the files changed, I recommend the following experts for review: ${reviewerList}`
      }));
      createAuditLog(context, "reviewer_recommendation", "system", "recommended", `Reviewers: ${reviewerList}`);
    }
  });
};
