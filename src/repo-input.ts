export interface ParsedRepo {
  repoPath: string;
  owner: string;
  repoName: string;
}

export const getRepoKey = (
  repo: Pick<ParsedRepo, 'owner' | 'repoName'>,
): string => `${repo.owner.toLowerCase()}/${repo.repoName.toLowerCase()}`;

export const parseRepoPath = (
  repoPath: string,
): Pick<ParsedRepo, 'owner' | 'repoName'> | null => {
  const parts = repoPath.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    owner: parts[0],
    repoName: parts[1],
  };
};

export const findDuplicateParsedRepos = (
  repos: readonly ParsedRepo[],
): ParsedRepo[] => {
  const seen = new Set<string>();
  const duplicateRepos: ParsedRepo[] = [];

  for (const repo of repos) {
    const key = getRepoKey(repo);
    if (seen.has(key)) {
      duplicateRepos.push(repo);
      continue;
    }

    seen.add(key);
  }

  return duplicateRepos;
};
