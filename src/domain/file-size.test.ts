import { formatBytes } from './file-size.ts'

describe('file size labels', () => {
  it.each([
    [0, '0 B'],
    [1_023, '1023 B'],
    [1_024, '1.0 KB'],
    [1_536, '1.5 KB'],
    [1_048_576, '1.0 MB'],
    [3_678_660, '3.5 MB'],
    [1_073_741_824, '1.0 GB'],
  ])('formats %i bytes as %s', (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label)
  })
})
