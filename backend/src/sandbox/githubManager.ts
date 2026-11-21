import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitHubPrResponse, GitHubRepoSummary, WorkspaceRepoInfo } from '../../../shared/types.js';
import { BACKEND_ROOT, ENV, REPO_ROOT } from '../config/env.js';
import { snapshotManager } from './snapshotManager.js';
import { viteManager } from './viteManager.js';

const execFileAsync = promisify(execFile);

const WORKSPACES_ROOT = path.join(BACKEND_ROOT, '.workspaces');
const DEFAULT_BUILTIN_PR_REPO = 'REDFOX1899/antislop';

interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  cleanHttpsUrl: string;
  slug: string;
}

function scrubSecrets(message: string): string {
  let scrubbed = message;
  if (ENV.GITHUB_TOKEN) {
    scrubbed = scrubbed.split(ENV.GITHUB_TOKEN).join('[REDACTED]');
  }
  scrubbed = scrubbed.replace(/x-access-token:[^@\s]+@/gi, 'x-access-token:[REDACTED]@');
  scrubbed = scrubbed.replace(/https:\/\/[^:\s/]+:[^@\s/]+@github\.com/gi, 'https://[REDACTED]@github.com');
  return scrubbed;
}

function parseGitHubRepoUrl(input: string): ParsedGitHubRepo {
  const trimmed = input.trim().replace(/\/+$/, '');

  // Support shorthand "owner/repo"
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) {
    const [, owner, repo] = shortMatch;
    return {
      owner,
      repo,
      cleanHttpsUrl: `https://github.com/${owner}/${repo}`,
      slug: `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    };
  }

  // Support SSH "git@github.com:owner/repo.git"
  const sshMatch = trimmed.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return {
      owner,
      repo,
      cleanHttpsUrl: `https://github.com/${owner}/${repo}`,
      slug: `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    };
  }

  // Support HTTPS "https://github.com/owner/repo(.git)(/tree/...)"
  const httpsMatch = trimmed.match(
    /^https?:\/\/(?:[^@]+@)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return {
      owner,
      repo,
      cleanHttpsUrl: `https://github.com/${owner}/${repo}`,
      slug: `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    };
  }

  throw new Error(`Invalid GitHub repository URL or slug: "${input}"`);
}

async function runGit(args: string[], cwd?: string, timeout = 90_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return stdout.trim();
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const stderr =
      typeof err === 'object' && err !== null && 'stderr' in err ? String((err as { stderr?: unknown }).stderr || '') : '';
    throw new Error(scrubSecrets(`git command failed: ${stderr || rawMsg}`));
  }
}

async function githubApiFetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
  if (!ENV.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured in env/.env');
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${ENV.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AntiSlop-Studio-Backend',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(scrubSecrets(`GitHub API ${res.status} (${endpoint}): ${text.slice(0, 400)}`));
  }

  return (await res.json()) as T;
}

async function detectFramework(workspacePath: string): Promise<'vite' | 'next' | 'static'> {
  const pkgPath = path.join(workspacePath, 'package.json');
  try {
    const raw = await fsPromises.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if ('vite' in deps) return 'vite';
    if ('next' in deps) return 'next';
    if (pkg.scripts?.dev?.includes('vite')) return 'vite';
    if (pkg.scripts?.dev?.includes('next')) return 'next';
  } catch {
    // No package.json or invalid JSON
  }

  const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'];
  for (const cfg of viteConfigs) {
    if (fs.existsSync(path.join(workspacePath, cfg))) return 'vite';
  }

  const nextConfigs = ['next.config.ts', 'next.config.js', 'next.config.mjs'];
  for (const cfg of nextConfigs) {
    if (fs.existsSync(path.join(workspacePath, cfg))) return 'next';
  }

  return 'static';
}

export class GitHubManager {
  async listUserRepos(): Promise<GitHubRepoSummary[]> {
    interface RawGitHubRepo {
      full_name: string;
      name: string;
      html_url: string;
      description: string | null;
      default_branch?: string;
      private: boolean;
      language: string | null;
      updated_at: string;
    }

    const repos = await githubApiFetch<RawGitHubRepo[]>(
      '/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator,organization_member'
    );

    return repos.map((r) => ({
      fullName: r.full_name,
      name: r.name,
      htmlUrl: r.html_url,
      description: r.description ?? null,
      defaultBranch: r.default_branch || 'main',
      private: Boolean(r.private),
      language: r.language ?? null,
      updatedAt: r.updated_at,
    }));
  }

  async connectGitHubRepo(repoUrl: string, branch?: string): Promise<WorkspaceRepoInfo> {
    const parsed = parseGitHubRepoUrl(repoUrl);
    await fsPromises.mkdir(WORKSPACES_ROOT, { recursive: true });

    const localPath = path.join(WORKSPACES_ROOT, parsed.slug);
    const authCloneUrl = ENV.GITHUB_TOKEN
      ? `https://x-access-token:${ENV.GITHUB_TOKEN}@github.com/${parsed.owner}/${parsed.repo}.git`
      : `https://github.com/${parsed.owner}/${parsed.repo}.git`;

    let clonedFresh = false;
    const gitDirExists = fs.existsSync(path.join(localPath, '.git'));

    if (gitDirExists) {
      try {
        console.log(`[GitHubManager] Updating existing workspace clone for ${parsed.owner}/${parsed.repo}...`);
        const fetchArgs = branch
          ? ['fetch', '--depth', '1', authCloneUrl, branch]
          : ['fetch', '--depth', '1', authCloneUrl];
        await runGit(fetchArgs, localPath);
        await runGit(['checkout', '-f', 'FETCH_HEAD'], localPath);
        if (branch) {
          await runGit(['checkout', '-B', branch, 'FETCH_HEAD'], localPath);
        }
        await runGit(['clean', '-fd', '-e', 'node_modules'], localPath);
      } catch (err) {
        console.warn('[GitHubManager] Incremental refresh failed, doing clean re-clone:', err);
        await fsPromises.rm(localPath, { recursive: true, force: true });
        clonedFresh = true;
      }
    } else {
      if (fs.existsSync(localPath)) {
        await fsPromises.rm(localPath, { recursive: true, force: true });
      }
      clonedFresh = true;
    }

    if (clonedFresh) {
      console.log(`[GitHubManager] Shallow-cloning ${parsed.owner}/${parsed.repo} into ${localPath}...`);
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) {
        cloneArgs.push('--branch', branch);
      }
      cloneArgs.push(authCloneUrl, localPath);
      await runGit(cloneArgs);
    }

    // Immediately scrub token from .git/config so credentials are never persisted on disk
    await runGit(['remote', 'set-url', 'origin', `${parsed.cleanHttpsUrl}.git`], localPath).catch(() => undefined);

    let resolvedBranch = branch;
    if (!resolvedBranch) {
      try {
        const currentHead = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], localPath);
        resolvedBranch = currentHead && currentHead !== 'HEAD' ? currentHead : 'main';
      } catch {
        resolvedBranch = 'main';
      }
    }

    const framework = await detectFramework(localPath);

    // Install dependencies if package.json exists and node_modules is missing
    const pkgPath = path.join(localPath, 'package.json');
    const nodeModulesPath = path.join(localPath, 'node_modules');
    if (fs.existsSync(pkgPath) && !fs.existsSync(nodeModulesPath)) {
      console.log(`[GitHubManager] Installing npm dependencies for ${parsed.owner}/${parsed.repo}...`);
      try {
        await execFileAsync('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps'], {
          cwd: localPath,
          timeout: 180_000,
          env: { ...process.env, CI: 'true' },
        });
      } catch {
        await execFileAsync('npm', ['install', '--no-audit', '--no-fund'], {
          cwd: localPath,
          timeout: 180_000,
          env: { ...process.env, CI: 'true' },
        });
      }
    }

    // Identify up to 6 key editable frontend files and capture fresh baseline
    const editableFiles = await snapshotManager.discoverEditableFiles(localPath, 6);
    await snapshotManager.captureBaseline(localPath, true, 6);

    const workspaceId = `gh-${parsed.slug}`;
    viteManager.registerWorkspace({
      id: workspaceId,
      name: `${parsed.owner}/${parsed.repo}`,
      source: 'github',
      repoUrl: parsed.cleanHttpsUrl,
      branch: resolvedBranch,
      localPath,
      framework,
      previewUrl: '/preview/',
      editableFiles,
    });

    // Boot preview server for the newly connected repo
    const activeInfo = await viteManager.switchWorkspace(workspaceId);
    return activeInfo;
  }

  async createPullRequestForActiveWorkspace(title?: string, description?: string): Promise<GitHubPrResponse> {
    if (!ENV.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not configured — cannot push branch or create Pull Request.');
    }

    const active = viteManager.getActiveWorkspace();
    if (!active) {
      throw new Error('No active workspace is currently loaded.');
    }

    const prTitle = title?.trim() || `AntiSlop: Multimodal taste redesign (${active.name})`;
    const prBody =
      description?.trim() ||
      [
        '## AntiSlop Taste Transformation',
        '',
        `Generated autonomously by **AntiSlop** (Gemini 4 Design Director + \`gemini-decision-1\` calibrated visual critic).`,
        '',
        `- **Workspace:** \`${active.name}\``,
        `- **Framework:** \`${active.framework}\``,
        `- **Timestamp:** ${new Date().toISOString()}`,
      ].join('\n');

    if (active.source === 'github' && active.repoUrl) {
      return this.createPrForClonedWorkspace(active, prTitle, prBody);
    }

    // Built-in workspace: safely push changed files via GitHub Git Data API against REDFOX1899/antislop
    return this.createPrForBuiltinWorkspace(active, prTitle, prBody);
  }

  private async createPrForClonedWorkspace(
    active: WorkspaceRepoInfo,
    prTitle: string,
    prBody: string
  ): Promise<GitHubPrResponse> {
    const parsed = parseGitHubRepoUrl(active.repoUrl!);
    const cwd = active.localPath;
    const baseBranch = active.branch || 'main';
    const branchName = `antislop/taste-${Date.now()}`;

    // Configure local commit identity inside this workspace clone only
    await runGit(['config', 'user.name', 'AntiSlop Studio'], cwd);
    await runGit(['config', 'user.email', 'antislop@antislop.live'], cwd);

    // Create feature branch from current HEAD without losing uncommitted edits
    await runGit(['checkout', '-B', branchName], cwd);

    // Stage modified frontend files + any bespoke generated assets
    const diff = await snapshotManager.computeSimpleDiff(cwd);
    const filesToStage = new Set<string>(diff.filesChanged);

    // Also include any generated assets under public/generated
    const generatedDir = path.join(cwd, 'public', 'generated');
    if (fs.existsSync(generatedDir)) {
      const genEntries = await fsPromises.readdir(generatedDir).catch(() => []);
      for (const entry of genEntries) {
        filesToStage.add(path.posix.join('public', 'generated', entry));
      }
    }

    if (filesToStage.size > 0) {
      await runGit(['add', '--', ...filesToStage], cwd);
    } else {
      // Fallback: check git status for any tracked modified files
      await runGit(['add', '-u'], cwd);
    }

    const stagedOutput = await runGit(['diff', '--cached', '--name-only'], cwd);
    const filesChanged = stagedOutput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (filesChanged.length === 0) {
      throw new Error('No modified frontend files found to commit. Run a transformation first before creating a PR.');
    }

    await runGit(['commit', '-m', prTitle], cwd);
    const commitSha = await runGit(['rev-parse', 'HEAD'], cwd);

    const authPushUrl = `https://x-access-token:${ENV.GITHUB_TOKEN}@github.com/${parsed.owner}/${parsed.repo}.git`;
    await runGit(['push', authPushUrl, `HEAD:refs/heads/${branchName}`], cwd);

    interface GitHubPrApiRes {
      html_url: string;
      number: number;
    }

    const pr = await githubApiFetch<GitHubPrApiRes>(`/repos/${parsed.owner}/${parsed.repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: prTitle,
        head: branchName,
        base: baseBranch,
        body: prBody,
      }),
    });

    return {
      branchName,
      commitSha,
      prUrl: pr.html_url,
      prNumber: pr.number,
      filesChanged,
    };
  }

  private async createPrForBuiltinWorkspace(
    active: WorkspaceRepoInfo,
    prTitle: string,
    prBody: string
  ): Promise<GitHubPrResponse> {
    const diff = await snapshotManager.computeSimpleDiff(active.localPath);
    if (diff.filesChanged.length === 0) {
      throw new Error(
        `No modified files in built-in workspace "${active.name}". Run a transformation first, or connect your own GitHub repo via /api/github/connect.`
      );
    }

    const parsed = parseGitHubRepoUrl(DEFAULT_BUILTIN_PR_REPO);
    const repoPrefix = path.relative(REPO_ROOT, active.localPath).replace(/\\/g, '/');
    const branchName = `antislop/taste-${Date.now()}`;

    try {
      // 1. Discover default branch & HEAD sha on REDFOX1899/antislop
      const repoInfo = await githubApiFetch<{ default_branch: string }>(
        `/repos/${parsed.owner}/${parsed.repo}`
      );
      const baseBranch = repoInfo.default_branch || 'main';

      const refInfo = await githubApiFetch<{ object: { sha: string } }>(
        `/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${baseBranch}`
      );
      const baseCommitSha = refInfo.object.sha;

      const baseCommit = await githubApiFetch<{ tree: { sha: string } }>(
        `/repos/${parsed.owner}/${parsed.repo}/git/commits/${baseCommitSha}`
      );

      // 2. Create blobs for each changed file in the built-in workspace
      const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
      const currentFiles = await snapshotManager.readEditableFiles(active.localPath);

      for (const relFile of diff.filesChanged) {
        const content = currentFiles[relFile];
        if (typeof content !== 'string') continue;
        const blob = await githubApiFetch<{ sha: string }>(`/repos/${parsed.owner}/${parsed.repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content, encoding: 'utf-8' }),
        });
        treeEntries.push({
          path: path.posix.join(repoPrefix, relFile),
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }

      if (treeEntries.length === 0) {
        throw new Error('No readable changed files to include in PR.');
      }

      // 3. Create tree, commit, branch ref, and PR via GitHub REST API (zero mutations to local .git!)
      const newTree = await githubApiFetch<{ sha: string }>(`/repos/${parsed.owner}/${parsed.repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: treeEntries,
        }),
      });

      const newCommit = await githubApiFetch<{ sha: string }>(`/repos/${parsed.owner}/${parsed.repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
          message: prTitle,
          tree: newTree.sha,
          parents: [baseCommitSha],
        }),
      });

      await githubApiFetch(`/repos/${parsed.owner}/${parsed.repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: newCommit.sha,
        }),
      });

      const pr = await githubApiFetch<{ html_url: string; number: number }>(
        `/repos/${parsed.owner}/${parsed.repo}/pulls`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: prTitle,
            head: branchName,
            base: baseBranch,
            body: prBody,
          }),
        }
      );

      return {
        branchName,
        commitSha: newCommit.sha,
        prUrl: pr.html_url,
        prNumber: pr.number,
        filesChanged: treeEntries.map((t) => t.path),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Active workspace "${active.name}" is a built-in sandbox and PR creation against ${DEFAULT_BUILTIN_PR_REPO} failed (${msg}). Connect a GitHub repository via "Connect Repo" to open a PR directly on your repository.`
      );
    }
  }
}

export const githubManager = new GitHubManager();
