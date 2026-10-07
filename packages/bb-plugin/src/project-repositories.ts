import { parseRepository } from '../../core/src/market';

export interface ProjectRepository {
  projectId: string;
  projectName: string;
  repository: string;
}

export function githubRepository(remote: string | null): string | null {
  if (!remote) return null;
  const value = remote.trim();
  const ssh = /^(?:[^@/\s]+@)?github\.com:([^?#]+)$/i.exec(value);
  let path: string;
  if (ssh) path = ssh[1];
  else {
    try {
      const url = new URL(value);
      if (
        url.hostname.toLowerCase() !== 'github.com' ||
        !['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) ||
        url.search ||
        url.hash
      )
        return null;
      path = url.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }
  const parsed = parseRepository(path.replace(/\/$/, '').replace(/\.git$/i, ''));
  return parsed ? `${parsed.owner}/${parsed.repo}` : null;
}

export function projectRepositories(
  projects: { id: string; name: string; gitRemoteUrl: string | null }[],
): ProjectRepository[] {
  return projects.flatMap((project) => {
    const repository = githubRepository(project.gitRemoteUrl);
    return repository ? [{ projectId: project.id, projectName: project.name, repository }] : [];
  });
}
