/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteHistoryRecord, getHistoryRecord, type HistoryRecord } from '../../src/lib/history-db';
import { downloadBlob } from '../../src/lib/images';
import { HistoryDetailPage } from '../../src/pages/HistoryDetailPage';

vi.mock('../../src/lib/history-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/history-db')>();
  return { ...actual, getHistoryRecord: vi.fn(), deleteHistoryRecord: vi.fn() };
});
vi.mock('../../src/lib/images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/images')>();
  return { ...actual, downloadBlob: vi.fn() };
});

const mockedGetHistoryRecord = vi.mocked(getHistoryRecord);
const mockedDeleteHistoryRecord = vi.mocked(deleteHistoryRecord);
const mockedDownloadBlob = vi.mocked(downloadBlob);
const roomImage = new Blob(['room'], { type: 'image/jpeg' });
const resultImage = new Blob(['result'], { type: 'image/webp' });
const record: HistoryRecord = {
  id: 'one',
  roomImage,
  referenceImage: new Blob(['reference'], { type: 'image/png' }),
  presetStyle: '奶油风',
  resultImage,
  createdAt: new Date(2026, 7, 15, 15, 42).getTime(),
  inputSnapshot: { presetStyle: '奶油风', hasReferenceImage: true },
};

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => blob === roomImage ? 'blob:room' : 'blob:result'),
    revokeObjectURL: vi.fn(),
  });
  mockedGetHistoryRecord.mockResolvedValue(record);
  mockedDeleteHistoryRecord.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HistoryDetailPage', () => {
  it('展示真实前后对比，右上直接提供删除图标且默认不显示确认弹窗', async () => {
    render(<HistoryDetailPage recordId="one" />);

    expect((await screen.findByAltText('改造后的房间')).getAttribute('src')).toBe('blob:result');
    expect(screen.getByAltText('改造前的房间').getAttribute('src')).toBe('blob:room');
    expect(screen.getByRole('button', { name: '删除这条记录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('确认前和取消后都不删除记录', async () => {
    const user = userEvent.setup();
    render(<HistoryDetailPage recordId="one" />);

    await user.click(await screen.findByRole('button', { name: '删除这条记录' }));
    expect(mockedDeleteHistoryRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(mockedDeleteHistoryRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('确认后只删除目标记录并返回历史列表', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<HistoryDetailPage recordId="one" onBack={onBack} />);

    await user.click(await screen.findByRole('button', { name: '删除这条记录' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(mockedDeleteHistoryRecord).toHaveBeenCalledWith('one'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('删除失败保留弹窗并展示中文错误', async () => {
    const user = userEvent.setup();
    mockedDeleteHistoryRecord.mockRejectedValue(new Error('delete failed'));
    render(<HistoryDetailPage recordId="one" />);

    await user.click(await screen.findByRole('button', { name: '删除这条记录' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    expect((await screen.findByRole('alert')).textContent).toBe('删除失败，请稍后重试');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('再次生成恢复完整记录，且操作顺序为左次要右深色下载', async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    render(<HistoryDetailPage recordId="one" onRegenerate={onRegenerate} />);
    await screen.findByAltText('改造后的房间');
    const actions = screen.getByRole('group', { name: '历史方案操作' });
    const buttons = actions.querySelectorAll('button');

    expect(buttons[0].textContent).toContain('用此方案再生成');
    expect(buttons[0].classList.contains('button--secondary')).toBe(true);
    expect(buttons[1].textContent).toContain('下载效果图');
    expect(buttons[1].classList.contains('button--primary')).toBe(true);
    await user.click(buttons[0]);
    expect(onRegenerate).toHaveBeenCalledWith(record);
  });

  it('下载效果图并在失败时保留详情显示中文错误', async () => {
    const user = userEvent.setup();
    mockedDownloadBlob.mockImplementation(() => {
      throw new Error('download blocked');
    });
    render(<HistoryDetailPage recordId="one" />);

    await user.click(await screen.findByRole('button', { name: '下载效果图' }));

    expect(mockedDownloadBlob).toHaveBeenCalledWith(resultImage, '栖居-奶油风-效果图.webp');
    expect(screen.getByRole('alert').textContent).toBe('下载失败，请再次尝试');
    expect(screen.getByAltText('改造后的房间')).toBeTruthy();
  });

  it('记录不存在时显示可返回的空状态', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockedGetHistoryRecord.mockResolvedValue(undefined);
    render(<HistoryDetailPage recordId="missing" onBack={onBack} />);

    expect(await screen.findByText('未找到这条历史记录')).toBeTruthy();
    await user.click(screen.getByText('返回历史列表'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('读取失败时显示中文错误且不渲染残缺详情', async () => {
    mockedGetHistoryRecord.mockRejectedValue(new Error('read failed'));
    render(<HistoryDetailPage recordId="one" />);

    expect((await screen.findByRole('alert')).textContent).toBe('历史记录读取失败，请返回重试');
    expect(screen.queryByRole('button', { name: '删除这条记录' })).toBeNull();
  });

  it('卸载时释放详情中的原图和效果图 Blob URL', async () => {
    const { unmount } = render(<HistoryDetailPage recordId="one" />);
    await screen.findByAltText('改造后的房间');
    unmount();

    expect(URL.createObjectURL).toHaveBeenCalledWith(roomImage);
    expect(URL.createObjectURL).toHaveBeenCalledWith(resultImage);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:room');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
  });
});
