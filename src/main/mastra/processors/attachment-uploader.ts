import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors'
import type { MastraDBMessage } from '@mastra/core/memory'
import { logger } from '../../utils/logger'

export class AttachmentUploader implements Processor {
  readonly id = 'attachment-uploader'
  private attachmentsDir: string

  constructor() {
    this.attachmentsDir = path.join(app.getPath('userData'), 'attachments')
  }

  async processInput(args: ProcessInputArgs): Promise<ProcessInputResult> {
    await this.ensureAttachmentsDir()
    const processedMessages = await Promise.all(
      args.messages.map((msg) => this.processMessage(msg))
    )
    return processedMessages
  }

  private async ensureAttachmentsDir(): Promise<void> {
    try {
      await fs.mkdir(this.attachmentsDir, { recursive: true })
    } catch (error) {
      logger.error('Failed to create attachments directory:', error)
    }
  }

  private async processMessage(msg: MastraDBMessage): Promise<MastraDBMessage> {
    const attachments = msg.content.experimental_attachments
    if (!attachments?.length) return msg

    const uploaded = await Promise.all(
      attachments.map(async (att) => {
        // Skip if already a file:// URL
        if (att.url?.startsWith('file://')) return att

        // Skip if not a data URI
        if (!att.url?.startsWith('data:')) return att

        // Upload base64 data and replace with file:// URL
        const url = await this.upload(att.url, att.contentType, att.name)
        return { ...att, url }
      })
    )

    return { ...msg, content: { ...msg.content, experimental_attachments: uploaded } }
  }

  private async upload(dataUri: string, contentType?: string, fileName?: string): Promise<string> {
    try {
      const base64 = dataUri.split(',')[1]
      const buffer = Buffer.from(base64, 'base64')

      // Generate unique filename
      const timestamp = Date.now()
      const ext = this.getExtensionFromContentType(contentType)
      const name = fileName ? this.sanitizeFileName(fileName) : `attachment-${timestamp}${ext}`
      const filePath = path.join(this.attachmentsDir, name)

      // Write file to disk
      await fs.writeFile(filePath, buffer)

      // Return file:// URL
      return `file://${filePath}`
    } catch (error) {
      logger.error('Failed to upload attachment:', error)
      // Return original data URI if upload fails
      return dataUri
    }
  }

  private getExtensionFromContentType(contentType?: string): string {
    if (!contentType) return ''

    const mimeToExt: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf'
    }

    return mimeToExt[contentType] || ''
  }

  private sanitizeFileName(fileName: string): string {
    // Remove path separators and other unsafe characters
    return fileName.replace(/[/\\?%*:|"<>]/g, '-')
  }
}
