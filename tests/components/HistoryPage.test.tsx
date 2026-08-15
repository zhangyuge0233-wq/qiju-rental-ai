/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationController } from '../../src/hooks/use-generation';
import { useGeneration } from '../../src/hooks/use-generation';
import { listHistoryRecords, type HistoryRecord } from '../../src/lib/history-db';
import App from '../../src/App';
import { HistoryPage } from '../../src/pages/HistoryPage';

vi.mock('../../src/hooks/use-generation', () => ({ useGeneration: vi.fn() }));
vi.mock('../../src/lib/history-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/history-db')>();
  return { ...actual, listHistoryRecords: vi.fn(), getHistoryRecord: vi.fn(), deleteHistoryRecord: vi.fn() };
});

const mockedListHistoryRecords = vi.mocked(listHistoryRecords);
const mockedUseGeneration = vi.mocked(useGeneration);
const firstResult = new Blob(['first-result'], { type: 'image/webp' });
const secondResult = new Blob(['second-result'], { type: 'image/webp' });

function historyRecord(
  id: string,
  createdAt: number,
  presetStyle: string,
  resultImage: Blob,
): HistoryRecord {
  return {
    id,
    roomImage: new Blob([`${id}-room`], { type: 'image/jpeg' }),
    presetStyle,
    resultImage,
    createdAt,
    inputSnapshot: { presetStyle, hasReferenceImage: false },
  };
}

function controller(overrides: Partial<GenerationController> = {}): GenerationController {
  return {
    status: 'editing',
    setRoomImage: vi.fn(),
    setReferenceImage: vi.fn(),
    setPresetStyle: vi.fn(),
    generate: vi.fn().mockResolvedValue(undefined),
    resetToEditing: vi.fn(),
    restoreFromHistory: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  let urlIndex = 0;
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:history-${++urlIndex}`),
    revokeObjectURL: vi.fn(),
  });
  mockedUseGeneration.mockReturnValue(controller());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HistoryPage', () => {
  it('按时间倒序展示且所有历史详情入口使用相同浅橙样式和中文标签', async () => {
    // Dropping the page-level ordering or diverging one card action must fail this test.
    mockedListHistoryRecords.mockResolvedValue([
      historyRecord('older', 1, '原木风', firstResult),
      historyRecord('newer', 2, '奶油风', secondResult),
    ]);

    render(<HistoryPage />);

    const links = await screen.findAllByRole('button', { name: '查看设计详情' });
    expect(links).toHaveLength(2);
    expect(links[0].className).toBe(links[1].className);
    expect(links[0].classList.contains('history-card__entry')).toBe(true);
    const cards = screen.getAllByRole('article');
    expect(within(cards[0]).getByText('奶油风')).toBeTruthy();
    expect(within(cards[1]).getByText('原木风')).toBeTruthy();
  });

  it('选择卡片时只打开对应历史详情', async () => {
    const user = userEvent.setup();
    const onSelectRecord = vi.fn();
    mockedListHistoryRecords.mockResolvedValue([
      historyRecord('one', 1, '奶油风', firstResult),
    ]);

    render(<HistoryPage onSelectRecord={onSelectRecord} />);
    await user.click(await screen.findByRole('button', { name: '查看设计详情' }));

    expect(onSelectRecord).toHaveBeenCalledWith('one');
  });

  it('空历史显示可返回首页的空状态', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockedListHistoryRecords.mockResolvedValue([]);

    render(<HistoryPage onBack={onBack} />);

    expect(await screen.findByText('还没有设计记录')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回首页开始设计' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('读取失败显示明确中文错误且仍可返回首页', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockedListHistoryRecords.mockRejectedValue(new Error('IndexedDB unavailable'));

    render(<HistoryPage onBack={onBack} />);

    expect((await screen.findByRole('alert')).textContent).toBe('历史记录读取失败，请刷新重试');
    await user.click(screen.getByRole('button', { name: '返回首页' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('卸载时释放所有历史缩略图 Blob URL', async () => {
    mockedListHistoryRecords.mockResolvedValue([
      historyRecord('one', 1, '原木风', firstResult),
      historyRecord('two', 2, '奶油风', secondResult),
    ]);

    const { unmount } = render(<HistoryPage />);
    await screen.findAllByRole('img');
    unmount();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:history-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:history-2');
  });
});

describe('App history navigation', () => {
  it('首页进入列表和详情后可返回，并从详情恢复输入回首页编辑态', async () => {
    // Losing the shared generation controller during navigation must fail this test.
    const user = userEvent.setup();
    const record = historyRecord('one', 1, '奶油风', firstResult);
    const restoreFromHistory = vi.fn();
    mockedUseGeneration.mockReturnValue(controller({ restoreFromHistory }));
    mockedListHistoryRecords.mockResolvedValue([record]);
    const historyDb = await import('../../src/lib/history-db');
    vi.mocked(historyDb.getHistoryRecord).mockResolvedValue(record);

    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看历史记录' }));
    expect(await screen.findByRole('heading', { name: '你的设计记录' })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: '查看设计详情' }));
    expect(await screen.findByRole('button', { name: '用此方案再生成' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '用此方案再生成' }));

    expect(restoreFromHistory).toHaveBeenCalledWith(record);
    await waitFor(() => expect(screen.getByRole('button', { name: '生成我的房间' })).toBeTruthy());
  });
});
