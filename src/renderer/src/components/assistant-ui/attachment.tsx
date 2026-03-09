'use client'

import { PropsWithChildren, useEffect, useState, type FC } from 'react'
import { XIcon, PlusIcon, FileText } from 'lucide-react'
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui
} from '@assistant-ui/react'
import { useShallow } from 'zustand/shallow'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import { Dialog, DialogTitle, DialogContent, DialogTrigger } from '../../components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '../../components/ui/avatar'
import { TooltipIconButton } from '../../components/assistant-ui/tooltip-icon-button'
import { useTranslation } from '../../i18n/use-app-translation'
import { cn } from '../../lib/utils'

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!file) {
      setSrc(undefined)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setSrc(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return src
}

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== 'image') return {}
      if (s.attachment.file) return { file: s.attachment.file }
      const src = s.attachment.content?.filter((c) => c.type === 'image')[0]?.image
      if (!src) return {}
      return { src }
    })
  )

  return useFileSrc(file) ?? src
}

type AttachmentPreviewProps = {
  src: string
}

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const { t } = useTranslation()
  const [isLoaded, setIsLoaded] = useState(false)
  return (
    <img
      src={src}
      alt={t('assistantUi.attachment.imagePreviewAlt')}
      className={cn(
        'block h-auto max-h-[80vh] w-auto max-w-full object-contain',
        isLoaded
          ? 'aui-attachment-preview-image-loaded'
          : 'aui-attachment-preview-image-loading invisible'
      )}
      onLoad={() => setIsLoaded(true)}
    />
  )
}

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation()
  const src = useAttachmentSrc()

  if (!src) return children

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger cursor-pointer transition-colors hover:bg-accent/50"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="aui-sr-only sr-only">
          {t('assistantUi.attachment.dialogTitle')}
        </DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AttachmentThumb: FC = () => {
  const { t } = useTranslation()
  const isImage = useAuiState((s) => s.attachment.type === 'image')
  const src = useAttachmentSrc()

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt={t('assistantUi.attachment.previewAlt')}
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback delayMs={isImage ? 200 : 0}>
        <FileText className="aui-attachment-tile-fallback-icon size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  )
}

const AttachmentUI: FC = () => {
  const { t } = useTranslation()
  const aui = useAui()
  const isComposer = aui.attachment.source === 'composer'

  const attachmentType = useAuiState((s) => s.attachment.type)
  const isImage = attachmentType === 'image'
  const typeLabel =
    attachmentType === 'image'
      ? t('assistantUi.attachment.typeLabels.image')
      : attachmentType === 'document'
        ? t('assistantUi.attachment.typeLabels.document')
        : attachmentType === 'file'
          ? t('assistantUi.attachment.typeLabels.file')
          : attachmentType

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          'aui-attachment-root relative',
          isImage && 'aui-attachment-root-composer only:[&>#attachment-tile]:size-24'
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'aui-attachment-tile size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75',
                isComposer && 'aui-attachment-tile-composer border-foreground/20'
              )}
              role="button"
              id="attachment-tile"
              aria-label={t('assistantUi.attachment.attachmentAriaLabel', {
                type: typeLabel
              })}
            >
              <AttachmentThumb />
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer && <AttachmentRemove />}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  )
}

const AttachmentRemove: FC = () => {
  const { t } = useTranslation()
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip={t('assistantUi.attachment.removeFile')}
        className="aui-attachment-tile-remove absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  )
}

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  )
}

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments mb-2 flex w-full flex-row items-center gap-2 overflow-x-auto px-1.5 pt-0.5 pb-1 empty:hidden">
      <ComposerPrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  )
}

export const ComposerAddAttachment: FC = () => {
  const { t } = useTranslation()
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip={t('assistantUi.attachment.addAttachment')}
        side="bottom"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment size-8.5 rounded-full p-1 font-semibold text-xs hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        aria-label={t('assistantUi.attachment.addAttachment')}
      >
        <PlusIcon className="aui-attachment-add-icon size-5 stroke-[1.5px]" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  )
}
