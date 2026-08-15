const minimumDimension = 240;
const maximumDimension = 8000;
const maximumAspectRatio = 8;

interface ImageMetadata {
  width: number;
  height: number;
  hasAlpha: boolean;
}

const jpegSofMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

const parseJpegMetadata = (bytes: Buffer): ImageMetadata | undefined => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return undefined;
    }

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      return undefined;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      return undefined;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return undefined;
    }
    if (jpegSofMarkers.has(marker)) {
      if (segmentLength < 8) {
        return undefined;
      }
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
        hasAlpha: false,
      };
    }

    offset += segmentLength;
  }

  return undefined;
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const allowedPngBitDepths = new Map<number, readonly number[]>([
  [0, [1, 2, 4, 8, 16]],
  [2, [8, 16]],
  [3, [1, 2, 4, 8]],
  [4, [8, 16]],
  [6, [8, 16]],
]);

const parsePngMetadata = (bytes: Buffer): ImageMetadata | undefined => {
  if (bytes.length < 33
    || !bytes.subarray(0, pngSignature.length).equals(pngSignature)
    || bytes.readUInt32BE(8) !== 13
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    return undefined;
  }

  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const allowedBitDepths = allowedPngBitDepths.get(colorType);
  if (!allowedBitDepths?.includes(bitDepth)
    || bytes[26] !== 0
    || bytes[27] !== 0
    || bytes[28] > 1) {
    return undefined;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
  };
};

const parseWebpMetadata = (bytes: Buffer): ImageMetadata | undefined => {
  if (bytes.length < 20
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    return undefined;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.subarray(offset, offset + 4).toString('ascii');
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    if (dataEnd > bytes.length) {
      return undefined;
    }

    if (chunkType === 'VP8 ') {
      if (chunkLength < 10
        || (bytes[dataOffset] & 1) !== 0
        || bytes[dataOffset + 3] !== 0x9d
        || bytes[dataOffset + 4] !== 0x01
        || bytes[dataOffset + 5] !== 0x2a) {
        return undefined;
      }
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
        hasAlpha: false,
      };
    }

    if (chunkType === 'VP8L') {
      if (chunkLength < 5 || bytes[dataOffset] !== 0x2f) {
        return undefined;
      }
      const packedDimensions = bytes.readUInt32LE(dataOffset + 1);
      if ((packedDimensions >>> 29) !== 0) {
        return undefined;
      }
      return {
        width: (packedDimensions & 0x3fff) + 1,
        height: ((packedDimensions >>> 14) & 0x3fff) + 1,
        hasAlpha: false,
      };
    }

    if (chunkType === 'VP8X') {
      if (chunkLength !== 10
        || bytes[dataOffset + 1] !== 0
        || bytes[dataOffset + 2] !== 0
        || bytes[dataOffset + 3] !== 0) {
        return undefined;
      }
      return {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
        hasAlpha: false,
      };
    }

    offset = dataEnd + (chunkLength % 2);
  }

  return undefined;
};

export const isValidWanInputImage = (bytes: Buffer, mimeType: string): boolean => {
  if (!bytes.length) {
    return false;
  }

  const metadata = mimeType === 'image/jpeg'
    ? parseJpegMetadata(bytes)
    : mimeType === 'image/png'
      ? parsePngMetadata(bytes)
      : mimeType === 'image/webp'
        ? parseWebpMetadata(bytes)
        : undefined;

  if (!metadata || metadata.hasAlpha) {
    return false;
  }

  const { width, height } = metadata;
  return width >= minimumDimension
    && width <= maximumDimension
    && height >= minimumDimension
    && height <= maximumDimension
    && width / height <= maximumAspectRatio
    && height / width <= maximumAspectRatio;
};
