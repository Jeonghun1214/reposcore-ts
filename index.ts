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
import {setVerbose, logVerbose} from './src/logger';
import {
  findDuplicateParsedRepos,
  parseRepoPath,
  type ParsedRepo,
} from './src/repo-input';

const cli = cac('reposcore-ts');
cli.version(pkg.version);

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
    '--cache',
    '기존 캐시를 사용하여 데이터를 수집합니다 (캐시 무시: --no-cache)',
    {
      default: true,
    },
  )
  .option('--since <since>', '캐시 이후 증분 수집 기준 시점 ISO8601')
  .option('--sort-by <field>', '정렬 기준 (score, id)', {
    default: 'score',
  })
  .option('--sort-order <order>', '정렬 방식 (asc, desc)', {
    default: 'desc',
  })
  .option('--claims [issue|user]', '최근 이슈 선점 현황 조회 (기본 issue)')
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
  .option('--verbose', '진단 및 진행 로그를 출력합니다')
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
        claims?: boolean | string;
        keywords?: string | string[];
        pageSize?: number | string;
        verbose?: boolean;
      },
    ) => {
      setVerbose(!!options.verbose);

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

      const isClaimsMode = options.claims !== undefined;
      const claimsMode =
        typeof options.claims === 'string'
          ? options.claims.toLowerCase()
          : 'issue';

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

      if (isClaimsMode && claimsMode !== 'issue' && claimsMode !== 'user') {
        errors.push(
          `오류: 지원하지 않는 --claims 모드 '${options.claims}'입니다. issue 또는 user를 입력하세요.`,
        );
      }

      const parsedRepos: ParsedRepo[] = [];

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

      // [수정 포인트] --since 입력값이 존재할 때 ISO8601 날짜 규격 포맷 유효성 검증 예외 필터링 추가
      if (since && Number.isNaN(Date.parse(since))) {
        errors.push(
          '오류: --since 값은 ISO8601 형식의 유효한 날짜 문자열이어야 합니다.',
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

      const duplicateRepos = findDuplicateParsedRepos(parsedRepos);
      for (const repo of duplicateRepos) {
        errors.push(
          `오류: 중복 저장소 '${repo.repoPath}'가 입력되었습니다. 같은 저장소는 한 번만 입력하세요.`,
        );
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

      // --claims 옵션이 있으면 점수 계산 대신 이슈 선점 현황만 조회합니다.
      if (isClaimsMode) {
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
            printClaims(claims, claimsMode as 'issue' | 'user');
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

      logVerbose(`형식: ${formats.join(', ')}`);
      logVerbose(`저장소: ${repos.join(', ')}`);

      // 일반 기여도 점수 산정 모드 병렬 처리 (Promise.allSettled)
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

      results.forEach((result, i) => {
        const {repoPath} = parsedRepos[i]!;

        if (result.status === 'fulfilled') {
          const {repoData, repoSummary, written} = result.value;
          repoDataList.push(repoData);
          repoSummaries.push(repoSummary);

          logVerbose(`[${repoPath}] CSV 저장: ${written.csv}`);
          if (written.txt) logVerbose(`[${repoPath}] TXT 저장: ${written.txt}`);
          if (written.html)
            logVerbose(`[${repoPath}] HTML 저장: ${written.html}`);
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

      if (hasFailure) {
        process.exit(1);
      }

      const userScores = sortUserScores(
        ScoreCalculator.calculateUserScores(repoDataList),
        sortBy as SupportedSortBy,
        sortOrder as SupportedSortOrder,
      );

      const written = await writeOutputFiles(
        formats as SupportedFormat[],
        {
          userScores,
          repoSummaries,
        },
        outputDir,
      );
      console.error(`[합산] CSV 저장: ${written.csv}`);
      if (written.txt) {
        console.error(`[합산] TXT 저장: ${written.txt}`);
      }
      if (written.html) {
        console.error(`[합산] HTML 저장: ${written.html}`);
      }
    },
  );

cli.help();
cli.parse();
