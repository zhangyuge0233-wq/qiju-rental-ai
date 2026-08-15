export const createJpegFixture = (width = 800, height = 600): Buffer => Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11, 0x08,
  (height >>> 8) & 0xff, height & 0xff,
  (width >>> 8) & 0xff, width & 0xff,
  0x03,
  0x01, 0x11, 0x00,
  0x02, 0x11, 0x00,
  0x03, 0x11, 0x00,
  0xff, 0xd9,
]);

export const createPngFixture = (
  width = 800,
  height = 600,
  colorType = 2,
): Buffer => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
};

type WebpFormat = 'VP8' | 'VP8L' | 'VP8X';

export const createWebpFixture = (
  width = 800,
  height = 600,
  format: WebpFormat = 'VP8X',
): Buffer => {
  const payloadLength = format === 'VP8L' ? 5 : 10;
  const paddedPayloadLength = payloadLength + (payloadLength % 2);
  const bytes = Buffer.alloc(20 + paddedPayloadLength);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write(format === 'VP8' ? 'VP8 ' : format, 12, 'ascii');
  bytes.writeUInt32LE(payloadLength, 16);

  if (format === 'VP8') {
    bytes[23] = 0x9d;
    bytes[24] = 0x01;
    bytes[25] = 0x2a;
    bytes.writeUInt16LE(width, 26);
    bytes.writeUInt16LE(height, 28);
  } else if (format === 'VP8L') {
    bytes[20] = 0x2f;
    const packedDimensions = ((width - 1) | ((height - 1) << 14)) >>> 0;
    bytes.writeUInt32LE(packedDimensions, 21);
  } else {
    bytes.writeUIntLE(width - 1, 24, 3);
    bytes.writeUIntLE(height - 1, 27, 3);
  }

  return bytes;
};
