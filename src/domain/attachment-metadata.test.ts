import { deriveContentType } from './file-types/index.ts'
import type { AttachmentDraftContent } from './models.ts'
import { applyAttachmentMetadataUpdate } from './attachment-metadata.ts'

function attachment(
  fileType: 'markdown' | 'unknown' = 'unknown',
): AttachmentDraftContent {
  const body = new Blob([new Uint8Array([0, 255, 16])])
  const contentType =
    fileType === 'markdown' ? 'text/markdown' : 'application/octet-stream'
  const filename = fileType === 'markdown' ? 'notes.md' : 'payload.bin'
  return {
    kind: 'attachment',
    body,
    contentType,
    filename,
    inspection: {
      ...deriveContentType({
        contentType,
        disposition: 'attachment',
        filename,
      }),
      imageDimensions: null,
      previewIssue: null,
    },
    previewVersion: 1,
    sourceText: null,
  }
}

describe('attachment metadata updates', () => {
  it('renames a known attachment without changing bytes, type, or MIME', () => {
    const current = attachment('markdown')
    const updated = applyAttachmentMetadataUpdate(current, {
      filename: 'renamed.markdown',
    })

    expect(updated).toMatchObject({
      contentType: 'text/markdown',
      filename: 'renamed.markdown',
      inspection: { fileType: { id: 'markdown' } },
    })
    expect(updated.body).toBe(current.body)
  })

  it('rejects a filename that would disguise a known attachment type', () => {
    expect(() =>
      applyAttachmentMetadataUpdate(attachment('markdown'), {
        filename: 'notes.txt',
      }),
    ).toThrow('Filename extension must match MD')
  })

  it('lets an unknown attachment select a known reference type conservatively', () => {
    const current = attachment()
    const updated = applyAttachmentMetadataUpdate(current, {
      contentType: 'image/png',
      filename: 'payload.png',
    })

    expect(updated).toMatchObject({
      contentType: 'image/png',
      filename: 'payload.png',
      inspection: {
        evidence: 'override',
        fileType: { id: 'png' },
        previewKind: 'metadata-only',
      },
    })
    expect(updated.body).toBe(current.body)
  })

  it('accepts a valid custom MIME while retaining unknown conflict evidence', () => {
    const current = attachment()
    current.inspection.conflicts = ['json', 'zip']
    const updated = applyAttachmentMetadataUpdate(current, {
      contentType: 'application/x-snipflow-test',
      filename: 'payload.custom',
    })

    expect(updated).toMatchObject({
      contentType: 'application/x-snipflow-test',
      filename: 'payload.custom',
      inspection: {
        conflicts: ['json', 'zip'],
        evidence: 'override',
        fileType: { id: 'custom' },
      },
    })
    expect(updated.body).toBe(current.body)
  })

  it('does not allow a reliably identified attachment to change type', () => {
    expect(() =>
      applyAttachmentMetadataUpdate(attachment('markdown'), {
        contentType: 'application/json',
        filename: 'notes.json',
      }),
    ).toThrow('Only unknown attachments can change type')
  })
})
