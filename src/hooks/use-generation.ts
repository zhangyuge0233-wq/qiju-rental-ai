import { useCallback, useRef, useState } from 'react';

import { generationErrorMessage } from '../../shared/generation';
import { saveHistoryRecord, type HistoryRecord } from '../lib/history-db';
import { GenerationApiError, generateRoom } from '../services/generation-api';

type GenerationStatus = 'editing' | 'generating' | 'result' | 'error';

export interface GenerationController {
  status: GenerationStatus;
  roomImage?: Blob;
  referenceImage?: Blob;
  presetStyle?: string;
  resultImage?: Blob;
  error?: string;
  setRoomImage: (image: Blob) => void;
  setReferenceImage: (image?: Blob) => void;
  setPresetStyle: (style?: string) => void;
  generate: () => Promise<void>;
  resetToEditing: () => void;
  restoreFromHistory: (record: HistoryRecord) => void;
}

type GenerationState = Pick<
  GenerationController,
  'status' | 'roomImage' | 'referenceImage' | 'presetStyle' | 'resultImage' | 'error'
>;

const initialState: GenerationState = { status: 'editing' };

function createHistoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useGeneration(): GenerationController {
  const [state, setState] = useState<GenerationState>(initialState);
  const stateRef = useRef(state);
  const generationInFlightRef = useRef(false);

  const replaceState = useCallback((nextState: GenerationState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const setRoomImage = useCallback((roomImage: Blob) => {
    const current = stateRef.current;
    replaceState({
      status: 'editing',
      roomImage,
      referenceImage: current.referenceImage,
      presetStyle: current.presetStyle,
    });
  }, [replaceState]);

  const setReferenceImage = useCallback((referenceImage?: Blob) => {
    const current = stateRef.current;
    replaceState({
      status: 'editing',
      roomImage: current.roomImage,
      referenceImage,
      presetStyle: current.presetStyle,
    });
  }, [replaceState]);

  const setPresetStyle = useCallback((presetStyle?: string) => {
    const current = stateRef.current;
    replaceState({
      status: 'editing',
      roomImage: current.roomImage,
      referenceImage: current.referenceImage,
      presetStyle,
    });
  }, [replaceState]);

  const generate = useCallback(async () => {
    const input = stateRef.current;
    if (generationInFlightRef.current || input.status === 'generating' || input.status === 'result') {
      return;
    }

    if (!input.roomImage || (!input.referenceImage && !input.presetStyle)) {
      replaceState({ ...input, status: 'error', error: generationErrorMessage('INVALID_INPUT') });
      return;
    }

    generationInFlightRef.current = true;
    replaceState({ ...input, status: 'generating', error: undefined });

    try {
      const resultImage = await generateRoom({
        roomImage: input.roomImage,
        referenceImage: input.referenceImage,
        presetStyle: input.presetStyle,
      });
      const completedState: GenerationState = {
        status: 'result',
        roomImage: input.roomImage,
        referenceImage: input.referenceImage,
        presetStyle: input.presetStyle,
        resultImage,
      };
      replaceState(completedState);

      const record: HistoryRecord = {
        id: createHistoryId(),
        roomImage: input.roomImage,
        referenceImage: input.referenceImage,
        presetStyle: input.presetStyle,
        resultImage,
        createdAt: Date.now(),
        inputSnapshot: {
          presetStyle: input.presetStyle,
          hasReferenceImage: Boolean(input.referenceImage),
        },
      };

      try {
        await saveHistoryRecord(record);
      } catch {
        replaceState({
          ...completedState,
          error: '效果图已生成，但未能保存到历史记录',
        });
      }
    } catch (error) {
      replaceState({
        ...input,
        status: 'error',
        error: error instanceof GenerationApiError
          ? error.message
          : generationErrorMessage('UNKNOWN_ERROR'),
      });
    } finally {
      generationInFlightRef.current = false;
    }
  }, [replaceState]);

  const resetToEditing = useCallback(() => {
    const current = stateRef.current;
    replaceState({
      status: 'editing',
      roomImage: current.roomImage,
      referenceImage: current.referenceImage,
      presetStyle: current.presetStyle,
    });
  }, [replaceState]);

  const restoreFromHistory = useCallback((record: HistoryRecord) => {
    replaceState({
      status: 'editing',
      roomImage: record.roomImage,
      referenceImage: record.referenceImage,
      presetStyle: record.presetStyle,
    });
  }, [replaceState]);

  return {
    ...state,
    setRoomImage,
    setReferenceImage,
    setPresetStyle,
    generate,
    resetToEditing,
    restoreFromHistory,
  };
}
