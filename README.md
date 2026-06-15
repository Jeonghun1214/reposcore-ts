# reposcore-ts

`reposcore-ts`는 GraphQL을 사용하여 오픈소스 수업 저장소의 학생 참여 점수를 계산하는 **TypeScript 기반 CLI**입니다.


## Usage

### 의존성 설치

```bash
bun install
```

### CLI 실행

여러 개의 저장소를 한 번에 분석할 수 있습니다.
여러 개의 저장소를 한 번에 분석할 수 있습니다. (**최소 1개 이상의 저장소 인자가 필수입니다.**)

```bash
# 기본 실행 예시
bun run index.ts <owner/repo...> [options]

# 저장소 3개 실행 예시
bun run index.ts oss2026hnu/reposcore-cs oss2026hnu/reposcore-ts oss2026hnu/reposcore-py

# GitHub 개인 액세스 토큰(PAT) 사용 예시
bun run index.ts oss2026hnu/reposcore-ts --token YOUR_GITHUB_TOKEN
```

### CLI 옵션 사용 예시

```bash
# TXT 형식으로 결과 저장
bun run index.ts oss2026hnu/reposcore-ts --format txt --output-dir output/reports

# 사용자 ID 기준 오름차순 정렬
bun run index.ts oss2026hnu/reposcore-ts --sort-by id --sort-order asc

# 최근 이슈 선점 현황 조회
bun run index.ts oss2026hnu/reposcore-ts --claims

# 선점 키워드를 직접 지정하여 조회
bun run index.ts oss2026hnu/reposcore-ts --claims --keywords "제가 하겠습니다,진행하겠습니다,할게요"

# 캐시를 사용하지 않고 GitHub API를 새로 호출
bun run index.ts oss2026hnu/reposcore-ts --no-cache
```

### 사용 시 주의사항

- 저장소는 `owner/repo` 형식으로 입력해야 합니다.
- 저장소 인자는 최소 1개 이상 입력해야 합니다.
- 여러 저장소를 분석할 때는 공백으로 구분하여 입력합니다.
- `--token`을 생략하면 `GITHUB_TOKEN` 환경변수를 사용합니다.
- `--format`은 `csv`, `txt`, `html` 값을 사용할 수 있습니다.
- `--sort-by`는 `score`, `id` 값을 사용할 수 있습니다.
- `--sort-order`는 `asc`, `desc` 값을 사용할 수 있습니다.
- `--keywords`는 쉼표로 구분된 문자열을 입력해야 하며, 빈 값은 사용할 수 없습니다.
- `--since`는 ISO8601 형식의 날짜 문자열을 입력해야 합니다.

## Synopsis

> 💡 저장소 인자는 최소 1개 이상 입력해야 합니다.

```text
reposcore-ts/1.0.0

Usage:
  $ reposcore-ts [...repos]

Commands:
  [...repos]  대상 저장소 목록 (예: owner/repo1 owner/repo2)

For more info, run any command with the `--help` flag:
  $ reposcore-ts --help

Options:
  -t, --token <token>    GitHub Personal Access Token (default: $GITHUB_TOKEN)
  -f, --format <format>  출력 형식 (csv, txt, html) (default: csv)
  --output-dir <path>    결과 파일을 저장할 디렉터리 (default: output)
  --no-cache             캐시를 무시하고 GitHub API를 새로 호출합니다 (default: true)
  --since <since>        캐시 이후 증분 수집 기준 시점 ISO8601 
  --sort-by <field>      정렬 기준 (score, id) (default: score)
  --sort-order <order>   정렬 방식 (asc, desc) (default: desc)
  --claims [issue|user]  최근 이슈 선점 현황 조회 (기본 issue) 
  --keywords [items]     이슈 선점 키워드 목록(쉼표 구분, 기본값: 제가 하겠습니다,진행하겠습니다,할게요,I'll take this) 
  --page-size <number>   한 번에 가져올 항목 수 (1~100) (default: $PAGE_SIZE)
  --verbose              진단 및 진행 로그를 출력합니다 
  -v, --version          Display version number 
  -h, --help             Display this message
```

## Synopsis 업데이트

Synopsis 섹션은 CLI 도움말을 자동으로 반영합니다. 프로그램 옵션 또는 실행 방식이 변경되면 다음 명령어로 업데이트하세요:

```bash
make synopsis
```

> ⚠️ `README.md`를 직접 수정하지 마세요.
> 수동 편집 내용은 `README-template.md`에서 관리하며, `README.md`는 `make synopsis`를 통해 자동 생성됩니다.
> 프로그램 옵션, 인수, 또는 도움말 출력이 변경된 경우 반드시 위 명령어를 실행하여 `README.md`를 다시 생성하세요.
