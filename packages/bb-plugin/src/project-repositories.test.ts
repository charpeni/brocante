import { expect, it } from 'vitest';
import { githubRepository, projectRepositories } from './project-repositories';

it.each([
  'git@github.com:team/repo.git',
  'https://github.com/team/repo.git',
  'ssh://git@github.com/team/repo.git',
  'git://github.com/team/repo.git',
  'https://user:password@github.com/team/repo.git/',
])('extracts a GitHub repository from %s without retaining credentials', (remote) => {
  expect(githubRepository(remote)).toBe('team/repo');
});

it('omits local paths and other hosts, while preserving bb’s project order', () => {
  expect(
    projectRepositories([
      { id: 'first', name: 'API', gitRemoteUrl: 'git@github.com:team/api.git' },
      { id: 'local', name: 'Local', gitRemoteUrl: null },
      { id: 'gitlab', name: 'GitLab', gitRemoteUrl: 'https://gitlab.com/team/repo.git' },
      { id: 'spoof', name: 'Spoof', gitRemoteUrl: 'https://github.com.example/team/repo.git' },
      { id: 'second', name: 'Website', gitRemoteUrl: 'https://github.com/team/web.git' },
    ]),
  ).toEqual([
    { projectId: 'first', projectName: 'API', repository: 'team/api' },
    { projectId: 'second', projectName: 'Website', repository: 'team/web' },
  ]);
  expect(githubRepository('/home/team/repo')).toBeNull();
  expect(githubRepository('https://github.com/team/repo/tree/main')).toBeNull();
});
