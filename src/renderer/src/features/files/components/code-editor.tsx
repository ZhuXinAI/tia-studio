import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'

function languageExtension(relativePath: string): Extension | null {
  const extension = relativePath.split('.').pop()?.toLowerCase()
  if (extension === 'css' || extension === 'scss') return css()
  if (extension === 'html' || extension === 'htm') return html()
  if (extension === 'js' || extension === 'jsx' || extension === 'ts' || extension === 'tsx') {
    return javascript({
      typescript: extension === 'ts' || extension === 'tsx',
      jsx: extension === 'jsx' || extension === 'tsx'
    })
  }
  if (extension === 'json') return json()
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return markdown()
  if (extension === 'py') return python()
  return null
}

export function CodeEditor({
  relativePath,
  value,
  ariaLabel,
  onChange
}: {
  relativePath: string
  value: string
  ariaLabel: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const language = languageExtension(relativePath)
    const view = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          ...(language ? [language] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'transparent',
              color: 'var(--foreground)'
            },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '11px'
            },
            '.cm-content': {
              minHeight: '100%',
              padding: '12px'
            },
            '.cm-gutters': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)'
            },
            '.cm-activeLine, .cm-activeLineGutter': {
              backgroundColor: 'color-mix(in srgb, var(--muted) 48%, transparent)'
            },
            '&.cm-focused': {
              outline: 'none'
            }
          })
        ]
      }),
      parent: container
    })
    view.dom.setAttribute('aria-label', ariaLabel)
    viewRef.current = view

    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [ariaLabel, relativePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    })
  }, [value])

  return <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden bg-muted/20" />
}
