import {graphql} from '@octokit/graphql';

export interface RepoStats {
  issues: number;
  pullRequests: number;
}

interface RepositoryStatsResponse {
  repository: {
    issues: {
      totalCount: number;
    };
    pullRequests: {
      totalCount: number;
    };
  };
}

export function createGitHubService(token: string) {
  const githubGraphQL = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  return {
    async getRepoStats(owner: string, repo: string): Promise<RepoStats> {
      const result = await githubGraphQL<RepositoryStatsResponse>(
        `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues { totalCount }
            pullRequests { totalCount }
          }
        }
        `,
        {owner, repo},
      );

      return {
        issues: result.repository.issues.totalCount,
        pullRequests: result.repository.pullRequests.totalCount,
      };
    },
  };
}
