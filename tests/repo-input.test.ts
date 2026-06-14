import {describe, expect, test} from 'bun:test';
import {
  findDuplicateParsedRepos,
  getRepoKey,
  parseRepoPath,
} from '../src/repo-input';

describe('repo input helpers', () => {
  test('parseRepoPath() accepts owner/repo format', () => {
    expect(parseRepoPath('oss2026hnu/reposcore-ts')).toEqual({
      owner: 'oss2026hnu',
      repoName: 'reposcore-ts',
    });
  });

  test('parseRepoPath() rejects malformed repo paths', () => {
    expect(parseRepoPath('oss2026hnu')).toBeNull();
    expect(parseRepoPath('oss2026hnu/reposcore-ts/extra')).toBeNull();
    expect(parseRepoPath('/reposcore-ts')).toBeNull();
    expect(parseRepoPath('oss2026hnu/')).toBeNull();
  });

  test('getRepoKey() normalizes owner and repo name casing', () => {
    expect(getRepoKey({owner: 'OSS2026HNU', repoName: 'RepoScore-TS'})).toBe(
      'oss2026hnu/reposcore-ts',
    );
  });

  test('findDuplicateParsedRepos() reports duplicate repository inputs', () => {
    const repos = [
      {
        repoPath: 'oss2026hnu/reposcore-ts',
        owner: 'oss2026hnu',
        repoName: 'reposcore-ts',
      },
      {
        repoPath: 'OSS2026HNU/RepoScore-TS',
        owner: 'OSS2026HNU',
        repoName: 'RepoScore-TS',
      },
      {
        repoPath: 'oss2026hnu/reposcore-cs',
        owner: 'oss2026hnu',
        repoName: 'reposcore-cs',
      },
    ];

    const result = findDuplicateParsedRepos(repos);

    expect(result).toEqual([repos[1]!]);
  });
});
