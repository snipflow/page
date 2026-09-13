import {
  attachmentBytesToText,
  convertTextToAttachment,
  detectRawCandidate,
  estimateRawOutputSize,
  RawConversionError,
} from './raw-conversion.ts'

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
])

function parameters(
  overrides: Partial<Parameters<typeof convertTextToAttachment>[1]> = {},
) {
  return {
    customMimeType: '',
    fileTypeId: 'txt' as const,
    filename: 'snippet.txt',
    interpretation: 'utf8' as const,
    ...overrides,
  }
}

describe('raw conversion', () => {
  it('preserves exact UTF-8 source while validating structured targets', async () => {
    const source = '  {"enabled": true}\n'
    const result = await convertTextToAttachment(
      source,
      parameters({ fileTypeId: 'json', filename: 'settings.json' }),
      1024,
    )

    expect(new TextDecoder().decode(result.bytes)).toBe(source)
    expect(result.contentType).toBe('application/json; charset=utf-8')
    expect(result.bytes.byteLength).toBe(
      new TextEncoder().encode(source).byteLength,
    )
  })

  it.each([
    {
      interpretation: 'base64' as const,
      source: btoa(String.fromCharCode(...pngBytes)),
    },
    {
      interpretation: 'data-url' as const,
      source: `data:image/jpeg;base64,${btoa(String.fromCharCode(...pngBytes))}`,
    },
    {
      interpretation: 'hex' as const,
      source: [...pngBytes]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' '),
    },
  ])(
    'decodes strict $interpretation bytes once',
    async ({ interpretation, source }) => {
      const result = await convertTextToAttachment(
        source,
        parameters({
          fileTypeId: 'png',
          filename: 'pixel.png',
          interpretation,
        }),
        1024,
      )

      expect(new Uint8Array(result.bytes)).toEqual(pngBytes)
      expect(result.contentType).toBe('image/png')
    },
  )

  it('rejects relaxed encodings, fake types, and conflicting extensions', async () => {
    expect(() => estimateRawOutputSize('SGVsbG8_', 'base64')).toThrow(
      RawConversionError,
    )
    expect(() => estimateRawOutputSize('0x00 0x01', 'hex')).toThrow(
      RawConversionError,
    )
    await expect(
      convertTextToAttachment(
        'plain text',
        parameters({ fileTypeId: 'pdf', filename: 'claim.pdf' }),
        1024,
      ),
    ).rejects.toMatchObject({ code: 'type-mismatch' })
    await expect(
      convertTextToAttachment(
        '{}',
        parameters({ fileTypeId: 'json', filename: 'claim.txt' }),
        1024,
      ),
    ).rejects.toMatchObject({ code: 'invalid-filename' })
  })

  it('recommends only clear structures or decoded binary signatures', async () => {
    await expect(detectRawCandidate('{"value":1}')).resolves.toMatchObject({
      fileTypeId: 'json',
      interpretation: 'utf8',
    })
    await expect(
      detectRawCandidate(btoa(String.fromCharCode(...pngBytes))),
    ).resolves.toMatchObject({
      fileTypeId: 'png',
      interpretation: 'base64',
    })
    await expect(
      detectRawCandidate('ordinary ambiguous text'),
    ).resolves.toBeNull()
    await expect(
      detectRawCandidate('<?xml version="1.0"?><!DOCTYPE x><x/>'),
    ).resolves.toBeNull()
  })

  it('accepts ASCII whitespace in Base64 and one whole hex prefix only', async () => {
    const encoded = btoa(String.fromCharCode(...pngBytes))
    const spacedBase64 = `${encoded.slice(0, 16)}\n${encoded.slice(16)}`
    expect(estimateRawOutputSize(spacedBase64, 'base64')).toBe(
      pngBytes.byteLength,
    )

    const prefixedHex = `0x${[...pngBytes]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`
    const result = await convertTextToAttachment(
      prefixedHex,
      parameters({
        fileTypeId: 'png',
        filename: 'prefixed.png',
        interpretation: 'hex',
      }),
      1024,
    )
    expect(new Uint8Array(result.bytes)).toEqual(pngBytes)
    expect(() =>
      estimateRawOutputSize('data:text/plain,percent%20data', 'data-url'),
    ).toThrow(RawConversionError)
    expect(() =>
      estimateRawOutputSize('data:not-a-mime;base64,AA==', 'data-url'),
    ).toThrow(RawConversionError)
  })

  it('recognizes SVG and declared XML but not scalars or unsafe XML', async () => {
    await expect(
      detectRawCandidate('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    ).resolves.toMatchObject({ fileTypeId: 'svg', interpretation: 'utf8' })
    await expect(
      detectRawCandidate('<?xml version="1.0"?><root/>'),
    ).resolves.toMatchObject({ fileTypeId: 'xml', interpretation: 'utf8' })
    await expect(detectRawCandidate('42')).resolves.toBeNull()
    await expect(
      convertTextToAttachment(
        '<?xml version="1.0"?><!DOCTYPE root><root/>',
        parameters({ fileTypeId: 'xml', filename: 'unsafe.xml' }),
        1024,
      ),
    ).rejects.toMatchObject({ code: 'type-mismatch' })
  })

  it('allows explicit custom bytes and enforces output limits', async () => {
    const custom = await convertTextToAttachment(
      '00 ff',
      parameters({
        customMimeType: 'application/octet-stream',
        fileTypeId: 'custom',
        filename: 'payload.dat',
        interpretation: 'hex',
      }),
      2,
    )
    expect(new Uint8Array(custom.bytes)).toEqual(new Uint8Array([0, 255]))
    expect(custom.contentType).toBe('application/octet-stream')

    await expect(
      convertTextToAttachment('too large', parameters(), 2),
    ).rejects.toMatchObject({ code: 'size-limit' })
    await expect(
      convertTextToAttachment('', parameters(), 2),
    ).rejects.toMatchObject({ code: 'empty-output' })
  })

  it('restores conversion source, decodes text, and preserves binary as Base64', async () => {
    const binary = new Blob([new Uint8Array([0xff, 0x61])])
    await expect(
      attachmentBytesToText(binary, 'original base64', 'base64'),
    ).resolves.toBe('original base64')
    await expect(attachmentBytesToText(binary, null, 'base64')).resolves.toBe(
      '/2E=',
    )
    await expect(
      attachmentBytesToText(new Blob(['UTF-8 雪']), null, 'utf8'),
    ).resolves.toBe('UTF-8 雪')
    await expect(
      attachmentBytesToText(
        new Blob([new Uint8Array([0xff, 0x61])]),
        null,
        'utf8',
      ),
    ).rejects.toMatchObject({
      code: 'type-mismatch',
      message: '附件不是有效的 UTF-8 文本，原附件已保留。',
    })
  })
})
