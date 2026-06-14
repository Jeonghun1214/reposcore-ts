import {describe, expect, test} from 'bun:test';
import {
  buildUserScoresTxt,
  printClaims,
  type ScoreOutputData,
} from '../src/output';
import type {RepoClaims} from '../src/types';

const analyzedAt = new Date(2026, 5, 4, 9, 30);

describe('TXT 리포트 출력', () => {
  test('reposcore-cs와 같은 제목, 분석 일시, ASCII 표 형식으로 출력해야 한다', () => {
    const data: ScoreOutputData = {
      repoSummaries: [
        {
          repoPath: 'oss2026hnu/reposcore-ts',
          mergedPrFeatureBug: 0,
          mergedPrDocs: 0,
          mergedPrTypo: 0,
          closedIssueFeatureBug: 0,
          closedIssueDocs: 0,
        },
      ],
      userScores: [
        {
          userId: 'alpha',
          totalScore: 16,
          repoScores: [
            {
              owner: 'oss2026hnu',
              repo: 'reposcore-ts',
              scoreData: [
                {
                  userId: 'alpha',
                  prFeatureBug: 2,
                  prDocs: 1,
                  prTypo: 1,
                  issueFeatureBug: 2,
                  issueDocs: 1,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = buildUserScoresTxt(data, analyzedAt);

    expect(result).toContain(
      '=== oss2026hnu/reposcore-ts 오픈소스 기여도 분석 리포트 ===',
    );
    expect(result).toContain('분석 일시: 2026-06-04 09:30');
    expect(result).toContain(
      '+-------+-------+-------------------+--------------------+',
    );
    expect(result).toContain(
      '| User  | Score | Issues (Doc/Feat) | PR (Doc/Feat/Typo) |',
    );
    expect(result).toContain(
      '| alpha | 16    | 3 (1/2)           | 4 (1/2/1)          |',
    );
    expect(result).not.toContain('[oss2026hnu/reposcore-ts]');
  });

  test('미인정 항목이 있으면 추가 제안 섹션을 출력해야 한다', () => {
    const data: ScoreOutputData = {
      repoSummaries: [
        {
          repoPath: 'oss2026hnu/reposcore-ts',
          mergedPrFeatureBug: 0,
          mergedPrDocs: 0,
          mergedPrTypo: 0,
          closedIssueFeatureBug: 0,
          closedIssueDocs: 0,
        },
      ],
      userScores: [
        {
          userId: 'beta',
          totalScore: 6,
          repoScores: [
            {
              owner: 'oss2026hnu',
              repo: 'reposcore-ts',
              scoreData: [
                {
                  userId: 'beta',
                  prFeatureBug: 0,
                  prDocs: 5,
                  prTypo: 0,
                  issueFeatureBug: 0,
                  issueDocs: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = buildUserScoresTxt(data, analyzedAt);

    expect(result).toContain('=== 미인정 항목 및 추가 제안 ===');
    expect(result).toContain('beta:');
    expect(result).toContain(
      '[미인정 항목] 문서/오타 PR 2개 초과(한도 3개) / 이슈 0개 초과(한도 12개)',
    );
    expect(result).toContain(
      '[추가 제안] 기능/버그 PR 1개 추가 시 문서PR 인정 한도 +3',
    );
  });
});

describe('선점 기한 판정', () => {
  test('이슈 제목이 아닌 라벨 기준으로 문서/코드 기한을 출력해야 한다', () => {
    const claims: RepoClaims = {
      repoPath: 'oss2026hnu/reposcore-ts',
      claimed: [
        {
          issueNumber: 101,
          title: 'Refactor parser module',
          url: 'https://example.com/issues/101',
          labels: {
            nodes: [{name: 'documentation'}],
          },
          claimedBy: 'alpha',
          matchedKeyword: '/claim',
          claimedAt: '2026-06-12T00:00:00.000Z',
          linkedPrNumber: 55,
          linkedPrUrl: 'https://example.com/pull/55',
        },
        {
          issueNumber: 102,
          title: '문서 개선 요청',
          url: 'https://example.com/issues/102',
          labels: {
            nodes: [],
          },
          claimedBy: 'beta',
          matchedKeyword: '/claim',
          claimedAt: '2026-06-12T00:00:00.000Z',
          linkedPrNumber: 56,
          linkedPrUrl: 'https://example.com/pull/56',
        },
      ],
      unclaimed: [],
    };

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(value => String(value)).join(' '));
    };

    try {
      printClaims(claims);
    } finally {
      console.log = originalLog;
    }

    const joined = logs.join('\n');
    expect(joined).toContain('상태: 문서 [24시간 기한]');
    expect(joined).toContain('상태: 코드 [48시간 기한]');
  });

  test('사용자별로 묶어 선점 현황을 출력해야 한다 (user 모드)', () => {
    const claims: RepoClaims = {
      repoPath: 'oss2026hnu/reposcore-ts',
      claimed: [
        {
          issueNumber: 101,
          title: 'Issue 101',
          url: 'https://example.com/issues/101',
          labels: {nodes: []},
          claimedBy: 'alpha',
          matchedKeyword: '/claim',
          claimedAt: '2026-06-12T00:00:00.000Z',
          linkedPrNumber: null,
          linkedPrUrl: null,
        },
        {
          issueNumber: 103,
          title: 'Issue 103',
          url: 'https://example.com/issues/103',
          labels: {nodes: []},
          claimedBy: 'alpha',
          matchedKeyword: '/claim',
          claimedAt: '2026-06-12T00:00:00.000Z',
          linkedPrNumber: null,
          linkedPrUrl: null,
        },
        {
          issueNumber: 102,
          title: 'Issue 102',
          url: 'https://example.com/issues/102',
          labels: {nodes: []},
          claimedBy: 'beta',
          matchedKeyword: '/claim',
          claimedAt: null,
          linkedPrNumber: null,
          linkedPrUrl: null,
        },
      ],
      unclaimed: [],
    };

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(value => String(value)).join(' '));
    };

    try {
      printClaims(claims, 'user');
    } finally {
      console.log = originalLog;
    }

    const joined = logs.join('\n');
    expect(joined).toContain('[alpha]');
    expect(joined).toContain('- #101 Issue 101');
    expect(joined).toContain('- #103 Issue 103');
    expect(joined).toContain('[beta]');
    expect(joined).toContain('- #102 Issue 102');
  });
});
