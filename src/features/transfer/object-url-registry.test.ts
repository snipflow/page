import {
  ObjectUrlRegistry,
  triggerBlobDownload,
} from './object-url-registry.ts'

describe('ObjectUrlRegistry', () => {
  it('revokes individual URLs and all remaining session resources', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const registry = new ObjectUrlRegistry()

    const first = registry.create(new Blob(['first']))
    registry.create(new Blob(['second']))
    registry.revoke(first)
    registry.revokeAll()

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first')
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second')
  })

  it('uses an explicit safe filename and delays download URL revocation', () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const registry = new ObjectUrlRegistry()

    triggerBlobDownload(registry, new Blob(['body']), '../report.txt')

    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
    vi.useRealTimers()
  })
})
