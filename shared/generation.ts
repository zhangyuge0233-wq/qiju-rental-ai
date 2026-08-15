export type GenerationErrorCode =
  | 'MINIMAX_NOT_CONFIGURED'
  | 'INVALID_INPUT'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface GenerateRequestMeta {
  presetStyle?: string;
  hasReferenceImage: boolean;
  preserveStructure: true;
}

export interface GenerateSuccess {
  ok: true;
  imageMimeType: string;
  imageBase64: string;
}

export interface GenerateFailure {
  ok: false;
  code: GenerationErrorCode;
  message: string;
}

export const generationErrorMessage = (code: GenerationErrorCode): string => ({
  MINIMAX_NOT_CONFIGURED: 'AI 服务尚未配置，请稍后再试',
  INVALID_INPUT: '请检查房间照片和设计方向',
  UPSTREAM_ERROR: 'AI 生成失败，请再次尝试',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  UNKNOWN_ERROR: '发生未知错误，请再次尝试',
})[code];
