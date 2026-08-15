/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generationErrorMessage } from '../../shared/generation';
import type { HistoryRecord } from '../../src/lib/history-db';
import { GenerationApiError, generateRoom } from '../../src/services/generation-api';
import { saveHistoryRecord } from '../../src/lib/history-db';
import { useGeneration } from '../../src/hooks/use-generation';

vi.mock('../../src/services/generation-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/generation-api')>();
  return { ...actual, generateRoom: vi.fn() };
});

vi.mock('../../src/lib/history-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/history-db')>();
  return { ...actual, saveHistoryRecord: vi.fn() };
});

const mockedGenerateRoom = vi.mocked(generateRoom);
const mockedSaveHistoryRecord = vi.mocked(saveHistoryRecord);
const roomBlob = new Blob(['room'], { type: 'image/jpeg' });
const referenceBlob = new Blob(['reference'], { type: 'image/png' });
const resultBlob = new Blob(['result'], { type: 'image/webp' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGeneration', () => {
  it('接口失败后保留输入并进入 error 状态', async () => {
    // Clearing the form on a rejected API call would force users to upload again.
    mockedGenerateRoom.mockRejectedValue(new GenerationApiError(
      'AI_NOT_CONFIGURED',
      generationErrorMessage('AI_NOT_CONFIGURED'),
    ));
    const { result } = renderHook(() => useGeneration());

    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setReferenceImage(referenceBlob);
      result.current.setPresetStyle('奶油风');
    });
    await act(async () => result.current.generate());

    expect(result.current.status).toBe('error');
    expect(result.current.roomImage).toBe(roomBlob);
    expect(result.current.referenceImage).toBe(referenceBlob);
    expect(result.current.presetStyle).toBe('奶油风');
    expect(result.current.error).toBe('AI 服务尚未配置，请稍后再试');
  });

  it('成功后只保存一次完整历史且生成中不重复提交', async () => {
    // Removing the in-flight guard or history write should break the observable result below.
    let resolveGeneration: ((value: Blob) => void) | undefined;
    mockedGenerateRoom.mockImplementation(() => new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    mockedSaveHistoryRecord.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setReferenceImage(referenceBlob);
      result.current.setPresetStyle('奶油风');
    });

    let firstGeneration: Promise<void>;
    act(() => {
      firstGeneration = result.current.generate();
      void result.current.generate();
    });
    expect(result.current.status).toBe('generating');
    expect(mockedGenerateRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveGeneration?.(resultBlob);
      await firstGeneration!;
    });

    expect(result.current.status).toBe('result');
    expect(result.current.resultImage).toBe(resultBlob);
    expect(mockedSaveHistoryRecord).toHaveBeenCalledTimes(1);
    expect(mockedSaveHistoryRecord).toHaveBeenCalledWith(expect.objectContaining({
      roomImage: roomBlob,
      referenceImage: referenceBlob,
      presetStyle: '奶油风',
      resultImage: resultBlob,
      inputSnapshot: { presetStyle: '奶油风', hasReferenceImage: true },
    }));
  });

  it('历史保存失败时保留生成结果并给出中文提示', async () => {
    mockedGenerateRoom.mockResolvedValue(resultBlob);
    mockedSaveHistoryRecord.mockRejectedValue(new Error('IndexedDB unavailable'));
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setPresetStyle('奶油风');
    });

    await act(async () => result.current.generate());

    expect(result.current.status).toBe('result');
    expect(result.current.resultImage).toBe(resultBlob);
    expect(result.current.error).toBe('效果图已生成，但未能保存到历史记录');
  });

  it('重新调整回到 editing 并保留输入', () => {
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setReferenceImage(referenceBlob);
      result.current.setPresetStyle('奶油风');
      result.current.resetToEditing();
    });

    expect(result.current.status).toBe('editing');
    expect(result.current.roomImage).toBe(roomBlob);
    expect(result.current.referenceImage).toBe(referenceBlob);
    expect(result.current.presetStyle).toBe('奶油风');
  });

  it('从历史完整恢复再次生成输入', () => {
    const record: HistoryRecord = {
      id: 'history-1',
      roomImage: roomBlob,
      referenceImage: referenceBlob,
      presetStyle: '中古风',
      resultImage: resultBlob,
      createdAt: 1,
      inputSnapshot: { presetStyle: '中古风', hasReferenceImage: true },
    };
    const { result } = renderHook(() => useGeneration());

    act(() => result.current.restoreFromHistory(record));

    expect(result.current.status).toBe('editing');
    expect(result.current.roomImage).toBe(roomBlob);
    expect(result.current.referenceImage).toBe(referenceBlob);
    expect(result.current.presetStyle).toBe('中古风');
    expect(result.current.resultImage).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('输入变更后忽略旧请求结果且不保存旧历史', async () => {
    // Without request invalidation, the first request overwrites the newly selected room.
    let resolveGeneration: ((value: Blob) => void) | undefined;
    let signal: AbortSignal | undefined;
    mockedGenerateRoom.mockImplementation((_input, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        resolveGeneration = resolve;
      });
    });
    const replacementRoom = new Blob(['replacement'], { type: 'image/jpeg' });
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setPresetStyle('奶油风');
    });

    let generation: Promise<void>;
    act(() => {
      generation = result.current.generate();
      result.current.setRoomImage(replacementRoom);
    });
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      resolveGeneration?.(resultBlob);
      await generation!;
    });

    expect(result.current.status).toBe('editing');
    expect(result.current.roomImage).toBe(replacementRoom);
    expect(result.current.resultImage).toBeUndefined();
    expect(mockedSaveHistoryRecord).not.toHaveBeenCalled();
  });

  it('重新调整后忽略旧请求结果', async () => {
    // A reset must not be undone when an already-started request resolves.
    let resolveGeneration: ((value: Blob) => void) | undefined;
    mockedGenerateRoom.mockImplementation(() => new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setPresetStyle('奶油风');
    });

    let generation: Promise<void>;
    act(() => {
      generation = result.current.generate();
      result.current.resetToEditing();
    });
    await act(async () => {
      resolveGeneration?.(resultBlob);
      await generation!;
    });

    expect(result.current.status).toBe('editing');
    expect(result.current.resultImage).toBeUndefined();
    expect(mockedSaveHistoryRecord).not.toHaveBeenCalled();
  });

  it('恢复历史后忽略旧请求结果', async () => {
    // A late completion must not replace the inputs restored from history.
    let resolveGeneration: ((value: Blob) => void) | undefined;
    mockedGenerateRoom.mockImplementation(() => new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    const restoredRoom = new Blob(['restored-room'], { type: 'image/jpeg' });
    const record: HistoryRecord = {
      id: 'history-2',
      roomImage: restoredRoom,
      referenceImage: referenceBlob,
      presetStyle: '中古风',
      resultImage: resultBlob,
      createdAt: 2,
      inputSnapshot: { presetStyle: '中古风', hasReferenceImage: true },
    };
    const { result } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setPresetStyle('奶油风');
    });

    let generation: Promise<void>;
    act(() => {
      generation = result.current.generate();
      result.current.restoreFromHistory(record);
    });
    await act(async () => {
      resolveGeneration?.(resultBlob);
      await generation!;
    });

    expect(result.current.status).toBe('editing');
    expect(result.current.roomImage).toBe(restoredRoom);
    expect(result.current.referenceImage).toBe(referenceBlob);
    expect(result.current.presetStyle).toBe('中古风');
    expect(mockedSaveHistoryRecord).not.toHaveBeenCalled();
  });

  it('卸载后取消并忽略旧请求回调，不写历史', async () => {
    // A completion after unmount must neither update React state nor persist a stale result.
    let resolveGeneration: ((value: Blob) => void) | undefined;
    let signal: AbortSignal | undefined;
    mockedGenerateRoom.mockImplementation((_input, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        resolveGeneration = resolve;
      });
    });
    const { result, unmount } = renderHook(() => useGeneration());
    act(() => {
      result.current.setRoomImage(roomBlob);
      result.current.setPresetStyle('奶油风');
    });

    let generation: Promise<void>;
    act(() => {
      generation = result.current.generate();
    });
    unmount();
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      resolveGeneration?.(resultBlob);
      await generation!;
    });

    expect(mockedSaveHistoryRecord).not.toHaveBeenCalled();
  });
});
