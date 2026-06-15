import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
} from 'bun:test';
import {rm} from 'node:fs/promises';
import {loadCache, saveCache} from '../src/cache';

const TEST_OWNER = 'test-owner';
const TEST_REPO = 'test-repo';
const TEST_CACHE_DIR = `.cache/${TEST_OWNER}_${TEST_REPO}`;

describe('cache 모듈 단위 테스트', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // 테스트 간 독립성을 보장하기 위해 캐시 디렉터리를 초기화합니다.
    await rm(TEST_CACHE_DIR, {recursive: true, force: true});
    // 테스트 실행 중 발생하는 의도된 console.error 출력을 숨깁니다.
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 모킹을 해제합니다.
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    // 모든 테스트 종료 후 캐시 디렉터리를 정리합니다.
    await rm(TEST_CACHE_DIR, {recursive: true, force: true});
  });

  describe('saveCache()', () => {
    test('정상적으로 캐시 데이터를 파일로 저장해야 한다', async () => {
      const data = {foo: 'bar'};
      await saveCache(TEST_OWNER, TEST_REPO, data);

      const file = Bun.file(`${TEST_CACHE_DIR}/cache.json`);
      expect(await file.exists()).toBe(true);

      const json = await file.json();
      expect(json.repository).toBe(`${TEST_OWNER}/${TEST_REPO}`);
      expect(json.data).toEqual(data);
    });
  });

  describe('loadCache()', () => {
    test('noCache 옵션이 true일 경우 캐시를 무시하고 null을 반환해야 한다', async () => {
      const result = await loadCache(TEST_OWNER, TEST_REPO, true);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '캐시를 무시하고 전체 데이터를 다시 수집합니다.',
      );
    });

    test('캐시 파일이 존재하지 않을 경우 null을 반환해야 한다', async () => {
      const result = await loadCache(TEST_OWNER, TEST_REPO);
      expect(result).toBeNull();
    });

    test('정상적인 캐시 파일이 존재할 경우 데이터를 파싱하여 반환해야 한다', async () => {
      const data = {hello: 'world'};
      await saveCache(TEST_OWNER, TEST_REPO, data);

      const result = await loadCache(TEST_OWNER, TEST_REPO);
      expect(result).not.toBeNull();
      expect(result?.data).toEqual(data);
      expect(result?.repository).toBe(`${TEST_OWNER}/${TEST_REPO}`);
    });

    test('캐시 파일 내 repository 정보가 불일치할 경우 null을 반환해야 한다', async () => {
      const badCache = {
        repository: 'another-owner/another-repo',
        lastAnalyzedAt: new Date().toISOString(),
        data: {},
      };
      await Bun.write(`${TEST_CACHE_DIR}/cache.json`, JSON.stringify(badCache));

      const result = await loadCache(TEST_OWNER, TEST_REPO);
      expect(result).toBeNull();
    });

    test('캐시 파일이 손상된 JSON 형식일 경우 파싱 실패를 감지하고 null을 반환해야 한다', async () => {
      await Bun.write(`${TEST_CACHE_DIR}/cache.json`, '{ bad json ');

      const result = await loadCache(TEST_OWNER, TEST_REPO);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '기존 캐시 파일이 손상되어 새로 수집을 시작합니다.',
      );
    });
  });
});
