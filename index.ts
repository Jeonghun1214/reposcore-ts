import {cac} from 'cac';
import pkg from './package.json' with {type: 'json'};

import {createGitHubService} from './src/github-service';
import {ScoreCalculator, type RepoData} from './src/score-calculator';
import {
  summarizeRepo,
  writeOutputFiles,
  supportedFormats,
  type SupportedFormat,
  type RepoSummary,
  printClaims,
} from './src/output';
import {
  sortUserScores,
  supportedSortBys,
  supportedSortOrders,
  type SupportedSortBy,
  type SupportedSortOrder,
} from './src/sort';
import {type FullGitHubService} from './src/types';

const cli = cac('reposcore-ts');
cli.version(pkg.version);

/**
 * 저장소 경로 문자열을 소유자와 저장소 이름으로 분리합니다.
 * @param repoPath owner/repo 형식의 저장소 경로
 * @returns 저장소 소유자와 이름 정보, 형식이 올바르지 않으면 null
 */
function parseRepoPath(repoPath: string) {
  const parts = repoPath.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    owner: parts[0],
    repoName: parts[1],
  };
}

cli
  .command('[...repos]', '대상 저장소 목록 (예: owner/repo1 owner/repo2)')
  .option('-t, --token <token>', 'GitHub Personal Access Token', {
    default: '$GITHUB_TOKEN',
  })
  .option('-f, --format <format>', '출력 형식 (csv, txt, html)', {
    default: 'csv',
  })
  .option('--output-dir <path>', '결과 파일을 저장할 디렉터리', {
    default: 'output',
  })
  .option(
    '--no-cache',
    '설정 시 기존 캐시를 무시하고 전체 데이터를 새로 수집합니다',
  )
  .option('--since <since>', '캐시 이후 증분 수집 기준 시점 ISO8601')
  .option('--sort-by <field>', '정렬 기준 (score, id)', {
    default: 'score',
  })
  .option('--sort-order <order>', '정렬 방식 (asc, desc)', {
    default: 'desc',
  })
  .option('--claims', '최근 이슈 선점 현황을 조회합니다')
  .option(
    '--keywords [items]',
    "이슈 선점 키워드 목록(쉼표 구분, 기본값: 제가 하겠습니다,진행하겠습니다,할게요,I'll take this)",
    {
      type: [String],
    },
  )
  .option('--page-size <number>', '한 번에 가져올 항목 수 (1~100)', {
    default: '$PAGE_SIZE',
  })
  .action(
    async (
      repos: string[],
      options: {
        token?: string;
        format: string;
        cache: boolean;
        outputDir?: string;
        since?: string;
        sortBy: string;
        sortOrder: string;
        claims?: boolean;
        keywords?: string | string[];
        pageSize?: number | string;
      },
    ) => {
      // CLI 옵션값을 내부에서 사용할 형태로 정규화합니다.
      const token =
        options.token === '$GITHUB_TOKEN'
          ? Bun.env.GITHUB_TOKEN || ''
          : options.token || '';
      const formats = String(options.format || 'csv')
        .toLowerCase()
        .split(',')
        .map(format => format.trim())
        .filter(Boolean);
      const useCache = options.cache;
      const outputDir = options.outputDir || 'output';
      const since = options.since;
      const sortBy = String(options.sortBy || 'score').toLowerCase();
      const sortOrder = String(options.sortOrder || 'desc').toLowerCase();

      const rawPageSize =
        options.pageSize === '$PAGE_SIZE'
          ? (Bun.env.PAGE_SIZE ?? 100)
          : options.pageSize;
      const pageSize = Number(rawPageSize);

      const errors: string[] = [];

      const isClaimsMode = !!options.claims;
      // 이슈 선점 여부를 판단하기 위한 기본 키워드 목록입니다.
      const DEFAULT_KEYWORDS = [
        '제가 하겠습니다',
        '진행하겠습니다',
        '할게요',
        "I'll take this",
      ];

      const rawKeywords =
        Array.isArray(options.keywords) &&
        options.keywords.length === 1 &&
        options.keywords[0] === 'undefined'
          ? DEFAULT_KEYWORDS.join(',')
          : Array.isArray(options.keywords)
            ? options.keywords.join(',')
            : typeof options.keywords === 'string'
              ? options.keywords
              : DEFAULT_KEYWORDS.join(',');

      const claimKeywords = rawKeywords
        .split(',')
        .map(k => k.trim())
        .filter(keyword => keyword && keyword !== '0');

      if (isClaimsMode && claimKeywords.length === 0) {
        errors.push(
          '오류: --keywords에는 하나 이상의 선점 키워드를 입력해야 합니다.',
        );
      }

      const parsedRepos: {
        repoPath: string;
        owner: string;
        repoName: string;
      }[] = [];

      // CLI 실행에 필요한 옵션과 입력값을 검증합니다.
      if (!token) {
        errors.push(
          '오류: GitHub 토큰이 필요합니다. --token 옵션 또는 GITHUB_TOKEN 환경 변수를 설정하세요.',
        );
      }

      if (formats.length === 0) {
        errors.push(
          '오류: --format에는 csv, txt, html 중 하나 이상의 출력 형식을 입력하세요.',
        );
      }

      const invalidFormats = formats.filter(
        format => !supportedFormats.includes(format as SupportedFormat),
      );

      if (invalidFormats.length > 0) {
        errors.push(
          `오류: 지원하지 않는 출력 형식 '${invalidFormats.join(', ')}'입니다. csv, txt 또는 html을 입력하세요.`,
        );
      }

      if (!supportedSortBys.includes(sortBy as SupportedSortBy)) {
        errors.push(
          `오류: 지원하지 않는 정렬 기준 '${options.sortBy}'입니다. score 또는 id를 입력하세요.`,
        );
      }

      if (!supportedSortOrders.includes(sortOrder as SupportedSortOrder)) {
        errors.push(
          `오류: 지원하지 않는 정렬 방식 '${options.sortOrder}'입니다. asc 또는 desc를 입력하세요.`,
        );
      }

      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        errors.push(
          `오류: --page-size 값은 1 이상 100 이하의 정수여야 합니다. (입력값: ${rawPageSize})`,
        );
      }

      if (repos.length === 0) {
        errors.push(
          '오류: 최소 하나 이상의 저장소(owner/repo)를 입력해야 합니다.',
        );
      }

      // 입력받은 저장소 경로를 owner/repo 형식으로 파싱합니다.
      for (const repoPath of repos) {
        const parsedRepo = parseRepoPath(repoPath);

        if (!parsedRepo) {
          errors.push(`오류: '${repoPath}'는 'owner/repo' 형식이 아닙니다.`);
          continue;
        }

        parsedRepos.push({
          repoPath,
          owner: parsedRepo.owner,
          repoName: parsedRepo.repoName,
        });
      }

      // 검증 중 발견된 오류를 출력하고 실행을 중단합니다.
      if (errors.length > 0) {
        for (const error of errors) {
          console.error(error);
        }

        cli.outputHelp();
        process.exit(1);
      }

      const githubService = createGitHubService(
        token,
        pageSize,
      ) as FullGitHubService;

      // 실제 데이터 수집 전에 모든 저장소가 GitHub에 존재하는지 한 번에 검증합니다.
      const missingRepos =
        await githubService.validateRepositoriesExist(parsedRepos);

      if (missingRepos.length > 0) {
        for (const repoPath of missingRepos) {
          console.error(
            `오류: 저장소 '${repoPath}'를 찾을 수 없거나 접근할 수 없습니다.`,
          );
        }
        process.exit(1);
      }

      // ── [개선] --claims 모드 병렬 처리 ──────────────────────────────────

      // --claims 옵션이 있으면 점수 계산 대신 이슈 선점 현황만 조회합니다.
      if (isClaimsMode) {
        // 조회 실패 여부를 추적하는 플래그입니다.
        // 루프 도중에 즉시 종료하지 않고 모든 저장소를 끝까지 처리한 뒤,
        // 루프가 완전히 끝난 후 이 플래그를 확인하여 종료 코드를 결정합니다.
        let hasClaimFailure = false;

        for (const {repoPath, owner, repoName} of parsedRepos) {
          try {
            const claims = await githubService.getRecentClaimsData(
              owner,
              repoName,
              claimKeywords,
              repoPath,
              useCache,
            );
            printClaims(claims);
          } catch (err) {
            hasClaimFailure = true;
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
              `오류: '${repoPath}'의 선점 현황을 조회할 수 없습니다. (${msg})`,
            );
          }
        }

        if (hasClaimFailure) {
          process.exit(1);
        }
        return;
      }

      console.log(`형식: ${formats.join(', ')}`);
      console.log(`저장소: ${repos.join(', ')}`);

      // ── [개선] 일반 기여도 점수 산정 모드 병렬 처리 (Promise.allSettled) ──────
      const tasks = parsedRepos.map(async ({repoPath, owner, repoName}) => {
        const detailed = await githubService.getDetailedRepoData(
          owner,
          repoName,
          useCache,
          {since},
        );

        const repoData = ScoreCalculator.calculateRepoData(
          detailed,
          owner,
          repoName,
        );
        const repoSummary = summarizeRepo(repoPath, detailed);

        const singleUserScores = sortUserScores(
          ScoreCalculator.calculateUserScores([repoData]),
          sortBy as SupportedSortBy,
          sortOrder as SupportedSortOrder,
        );

        const subDir = `${owner}-${repoName}`;
        const written = await writeOutputFiles(
          formats as SupportedFormat[],
          {userScores: singleUserScores, repoSummaries: [repoSummary]},
          outputDir,
          subDir,
        );

        return {repoData, repoSummary, written};
      });

      const results = await Promise.allSettled(tasks);

      const repoDataList: RepoData[] = [];
      const repoSummaries: RepoSummary[] = [];
      let hasFailure = false;

      // 입력된 순서를 완벽하게 보장하며 순회 및 안전 분기 결합
      results.forEach((result, i) => {
        const {repoPath} = parsedRepos[i]!;

        if (result.status === 'fulfilled') {
          const {repoData, repoSummary, written} = result.value;
          repoDataList.push(repoData);
          repoSummaries.push(repoSummary);

          console.log(`[${repoPath}] CSV 저장: ${written.csv}`);
          if (written.txt)
            console.log(`[${repoPath}] TXT 저장: ${written.txt}`);
          if (written.html)
            console.log(`[${repoPath}] HTML 저장: ${written.html}`);
        } else {
          hasFailure = true;
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          console.error(`오류: '${repoPath}'의 데이터를 가져올 수 없습니다.`);
          console.error(`상세 원인: ${reason}`);
        }
      });

      // 단 하나의 저장소라도 통신에 실패했다면 수집 작업 안내 후 종료 코드로 즉시 반영
      if (hasFailure) {
        process.exit(1);
      }

      // 모든 저장소 데이터를 합산하여 최종 사용자 점수를 계산합니다. (입력 순서가 보장된 리스트 활용)
      const userScores = sortUserScores(
        ScoreCalculator.calculateUserScores(repoDataList),
        sortBy as SupportedSortBy,
        sortOrder as SupportedSortOrder,
      );

      // 합산된 사용자 점수와 저장소 요약 정보를 파일로 출력합니다.
      const written = await writeOutputFiles(
        formats as SupportedFormat[],
        {
          userScores,
          repoSummaries,
        },
        outputDir,
      );
      console.log(`[합산] CSV 저장: ${written.csv}`);
      if (written.txt) {
        console.log(`[합산] TXT 저장: ${written.txt}`);
      }
      if (written.html) {
        console.log(`[합산] HTML 저장: ${written.html}`);
      }
    },
  );

cli.help(sections => {
  const optionsSection = sections.find(s => s.title === 'Options');
  if (optionsSection && optionsSection.body) {
    optionsSection.body = optionsSection.body.replace(
      /(--no-cache.*?)\s*\(default:\s*true\)/,
      '$1',
    );
  }
});
cli.parse();
