import type { TiaBrowserToolSnapshotCommand } from './tia-browser-tool-contract'

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem'
])

const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation'
])

type SendCommand = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

export type SnapshotRef = {
  backendNodeId: number | null
  role: string
  name: string
}

type AXNodeLike = {
  nodeId: string
  ignored?: boolean
  role?: {
    value?: unknown
  }
  name?: {
    value?: unknown
  }
  value?: {
    value?: unknown
  }
  properties?: Array<{
    name: string
    value: {
      value?: unknown
    }
  }>
  childIds?: string[]
  backendDOMNodeId?: number
}

type TreeNode = {
  role: string
  name: string
  valueText: string | null
  level: number | null
  checked: string | null
  expanded: boolean | null
  selected: boolean | null
  disabled: boolean | null
  required: boolean | null
  backendNodeId: number | null
  children: number[]
  parentIndex: number | null
  depth: number
  refId: string | null
}

function getStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function getOptionalStringValue(value: unknown): string | null {
  const text = getStringValue(value)
  return text.length > 0 ? text : null
}

function extractProperties(node: AXNodeLike) {
  let level: number | null = null
  let checked: string | null = null
  let expanded: boolean | null = null
  let selected: boolean | null = null
  let disabled: boolean | null = null
  let required: boolean | null = null

  for (const property of node.properties ?? []) {
    switch (property.name) {
      case 'level':
        level = typeof property.value.value === 'number' ? property.value.value : null
        break
      case 'checked':
        checked = getOptionalStringValue(property.value.value)
        break
      case 'expanded':
        expanded = typeof property.value.value === 'boolean' ? property.value.value : null
        break
      case 'selected':
        selected = typeof property.value.value === 'boolean' ? property.value.value : null
        break
      case 'disabled':
        disabled = typeof property.value.value === 'boolean' ? property.value.value : null
        break
      case 'required':
        required = typeof property.value.value === 'boolean' ? property.value.value : null
        break
    }
  }

  return {
    level,
    checked,
    expanded,
    selected,
    disabled,
    required
  }
}

function buildTree(nodes: AXNodeLike[]): { treeNodes: TreeNode[]; rootIndices: number[] } {
  const idToIndex = new Map<string, number>()
  const treeNodes: TreeNode[] = nodes.map((node, index): TreeNode => {
    idToIndex.set(node.nodeId, index)

    if (node.ignored && getStringValue(node.role?.value) !== 'RootWebArea') {
      return {
        role: '',
        name: '',
        valueText: null,
        level: null,
        checked: null,
        expanded: null,
        selected: null,
        disabled: null,
        required: null,
        backendNodeId: null,
        children: [],
        parentIndex: null,
        depth: 0,
        refId: null
      }
    }

    const properties = extractProperties(node)
    return {
      role: getStringValue(node.role?.value),
      name: getStringValue(node.name?.value),
      valueText: getOptionalStringValue(node.value?.value),
      level: properties.level,
      checked: properties.checked,
      expanded: properties.expanded,
      selected: properties.selected,
      disabled: properties.disabled,
      required: properties.required,
      backendNodeId: typeof node.backendDOMNodeId === 'number' ? node.backendDOMNodeId : null,
      children: [],
      parentIndex: null,
      depth: 0,
      refId: null
    }
  })

  for (let index = 0; index < nodes.length; index += 1) {
    for (const childId of nodes[index]?.childIds ?? []) {
      const childIndex = idToIndex.get(childId)
      if (childIndex === undefined) {
        continue
      }

      treeNodes[index]?.children.push(childIndex)
      if (treeNodes[childIndex]) {
        treeNodes[childIndex].parentIndex = index
      }
    }
  }

  const rootIndices: number[] = []
  for (let index = 0; index < treeNodes.length; index += 1) {
    if (treeNodes[index]?.parentIndex === null) {
      rootIndices.push(index)
    }
  }

  const setDepth = (index: number, depth: number) => {
    const node = treeNodes[index]
    if (!node) {
      return
    }

    node.depth = depth
    for (const childIndex of node.children) {
      setDepth(childIndex, depth + 1)
    }
  }

  for (const rootIndex of rootIndices) {
    setDepth(rootIndex, 0)
  }

  return { treeNodes, rootIndices }
}

function collectBackendNodeIds(node: unknown, ids: Set<number>): void {
  if (!node || typeof node !== 'object') {
    return
  }

  const record = node as Record<string, unknown>
  if (typeof record.backendNodeId === 'number') {
    ids.add(record.backendNodeId)
  }

  for (const key of ['children', 'shadowRoots']) {
    const children = record[key]
    if (!Array.isArray(children)) {
      continue
    }

    for (const child of children) {
      collectBackendNodeIds(child, ids)
    }
  }

  collectBackendNodeIds(record.contentDocument, ids)
}

function renderTree(
  nodes: TreeNode[],
  index: number,
  indent: number,
  output: string[],
  options: TiaBrowserToolSnapshotCommand
): void {
  const node = nodes[index]
  if (!node) {
    return
  }

  if (node.role.length === 0) {
    for (const childIndex of node.children) {
      renderTree(nodes, childIndex, indent, output, options)
    }
    return
  }

  if (typeof options.depth === 'number' && indent > options.depth) {
    return
  }

  if (node.role === 'RootWebArea' || node.role === 'WebArea') {
    for (const childIndex of node.children) {
      renderTree(nodes, childIndex, indent, output, options)
    }
    return
  }

  if (options.interactive && !node.refId) {
    for (const childIndex of node.children) {
      renderTree(nodes, childIndex, indent, output, options)
    }
    return
  }

  const prefix = '  '.repeat(indent)
  let line = `${prefix}- ${node.role}`

  if (node.name.length > 0) {
    line += ` "${node.name.replaceAll('"', '\\"')}"`
  }

  const attributes: string[] = []
  if (typeof node.level === 'number') {
    attributes.push(`level=${node.level}`)
  }
  if (node.checked) {
    attributes.push(`checked=${node.checked}`)
  }
  if (typeof node.expanded === 'boolean') {
    attributes.push(`expanded=${String(node.expanded)}`)
  }
  if (node.selected) {
    attributes.push('selected')
  }
  if (node.disabled) {
    attributes.push('disabled')
  }
  if (node.required) {
    attributes.push('required')
  }
  if (node.refId) {
    attributes.push(`ref=${node.refId}`)
  }

  if (attributes.length > 0) {
    line += ` [${attributes.join(', ')}]`
  }

  if (node.valueText && node.valueText !== node.name) {
    line += `: ${node.valueText}`
  }

  output.push(line)

  for (const childIndex of node.children) {
    renderTree(nodes, childIndex, indent + 1, output, options)
  }
}

function compactTree(tree: string, interactive: boolean): string {
  const lines = tree.split('\n').filter((line) => line.length > 0)
  if (lines.length === 0) {
    return interactive ? '(no interactive elements)' : '(empty page)'
  }

  const keep = new Array(lines.length).fill(false)
  const countIndent = (line: string) => (line.length - line.trimStart().length) / 2

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!line.includes('[ref=') && !line.includes(': ')) {
      continue
    }

    keep[index] = true
    const indent = countIndent(line)
    for (let ancestor = index - 1; ancestor >= 0; ancestor -= 1) {
      const ancestorIndent = countIndent(lines[ancestor] ?? '')
      if (ancestorIndent < indent) {
        keep[ancestor] = true
        if (ancestorIndent === 0) {
          break
        }
      }
    }
  }

  const compacted = lines
    .filter((_, index) => keep[index])
    .join('\n')
    .trim()
  if (compacted.length === 0) {
    return interactive ? '(no interactive elements)' : '(empty page)'
  }

  return compacted
}

export async function takeTiaBrowserToolSnapshot(input: {
  options: TiaBrowserToolSnapshotCommand
  refMap: Map<string, SnapshotRef>
  sendCommand: SendCommand
}): Promise<string> {
  await input.sendCommand('DOM.enable')
  await input.sendCommand('Accessibility.enable')

  let selectorBackendIds: Set<number> | null = null
  if (input.options.selector) {
    const evaluateResult = (await input.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(input.options.selector)})`,
      returnByValue: false,
      awaitPromise: false
    })) as {
      result?: {
        objectId?: string
      }
    }

    const objectId = evaluateResult.result?.objectId
    if (!objectId) {
      throw new Error(`Selector "${input.options.selector}" did not match any element.`)
    }

    const describeNodeResult = (await input.sendCommand('DOM.describeNode', {
      objectId,
      depth: -1
    })) as {
      node?: unknown
    }

    const backendIds = new Set<number>()
    collectBackendNodeIds(describeNodeResult.node, backendIds)
    if (backendIds.size === 0) {
      throw new Error(`Could not resolve selector "${input.options.selector}".`)
    }

    selectorBackendIds = backendIds
  }

  const accessibilityResult = (await input.sendCommand('Accessibility.getFullAXTree')) as {
    nodes?: AXNodeLike[]
  }
  const { treeNodes, rootIndices } = buildTree(accessibilityResult.nodes ?? [])

  input.refMap.clear()
  let nextRefNumber = 1
  for (const node of treeNodes) {
    const shouldRef =
      INTERACTIVE_ROLES.has(node.role) || (CONTENT_ROLES.has(node.role) && node.name.length > 0)
    if (!shouldRef) {
      continue
    }

    const refId = `e${nextRefNumber}`
    nextRefNumber += 1
    node.refId = refId
    input.refMap.set(refId, {
      backendNodeId: node.backendNodeId,
      role: node.role,
      name: node.name
    })
  }

  const effectiveRoots =
    selectorBackendIds === null
      ? rootIndices
      : treeNodes
          .map((node, index) => ({
            index,
            node
          }))
          .filter(({ node }) =>
            typeof node.backendNodeId === 'number'
              ? selectorBackendIds.has(node.backendNodeId)
              : false
          )
          .filter(({ node }) =>
            node.parentIndex === null
              ? true
              : !selectorBackendIds.has(treeNodes[node.parentIndex]?.backendNodeId ?? -1)
          )
          .map(({ index }) => index)

  if (selectorBackendIds !== null && effectiveRoots.length === 0) {
    throw new Error(`No accessibility nodes found for selector "${input.options.selector}".`)
  }

  const renderedLines: string[] = []
  for (const rootIndex of effectiveRoots) {
    renderTree(treeNodes, rootIndex, 0, renderedLines, input.options)
  }

  let output = renderedLines.join('\n').trim()
  if (input.options.compact) {
    output = compactTree(output, input.options.interactive === true)
  }

  if (output.length === 0) {
    return input.options.interactive ? '(no interactive elements)' : '(empty page)'
  }

  return output
}
