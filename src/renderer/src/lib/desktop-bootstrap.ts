import {
  desktopBootstrapQueryParam,
  type DesktopBootstrap
} from '../../../shared/desktop-bootstrap'

const fallbackDesktopBootstrap: DesktopBootstrap = {
  apiBaseUrl: 'http://127.0.0.1:4769',
  authMode: 'none',
  app: {
    name: 'TIA Studio',
    version: '0.0.0',
    platform: 'darwin'
  },
  capabilities: {
    autoUpdate: false,
    managedRuntimes: false,
    nativeDirectoryPicker: false,
    runtimeOnboarding: false
  }
}

const desktopBootstrapStorageKey = 'tia.desktopBootstrap'

let cachedDesktopBootstrapPromise: Promise<DesktopBootstrap> | null = null
let cachedDesktopBootstrapValue: DesktopBootstrap | null = null

function encodeBase64(input: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(input)
  }

  const bufferConstructor = (globalThis as { Buffer?: typeof Buffer }).Buffer
  if (bufferConstructor) {
    return bufferConstructor.from(input, 'binary').toString('base64')
  }

  throw new Error('Base64 encoding is unavailable')
}

function decodeBase64(input: string): string {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(input)
  }

  const bufferConstructor = (globalThis as { Buffer?: typeof Buffer }).Buffer
  if (bufferConstructor) {
    return bufferConstructor.from(input, 'base64').toString('binary')
  }

  throw new Error('Base64 decoding is unavailable')
}

function encodeUtf8Base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return encodeBase64(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeUtf8Base64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = decodeBase64(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function stripBootstrapQueryParam(): void {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has(desktopBootstrapQueryParam)) {
    return
  }

  url.searchParams.delete(desktopBootstrapQueryParam)
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
}

function parseDesktopBootstrapQueryValue(value: string): DesktopBootstrap | null {
  try {
    return JSON.parse(decodeUtf8Base64Url(value)) as DesktopBootstrap
  } catch {
    return null
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function persistDesktopBootstrap(bootstrap: DesktopBootstrap): void {
  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(desktopBootstrapStorageKey, JSON.stringify(bootstrap))
  } catch {
    // Ignore storage write failures and continue with the in-memory cache.
  }
}

function readPersistedDesktopBootstrap(): DesktopBootstrap | null {
  const storage = getSessionStorage()
  if (!storage) {
    return null
  }

  try {
    const rawValue = storage.getItem(desktopBootstrapStorageKey)
    if (!rawValue) {
      return null
    }

    return JSON.parse(rawValue) as DesktopBootstrap
  } catch {
    return null
  }
}

async function loadDesktopBootstrapFromLocalApi(): Promise<DesktopBootstrap | null> {
  try {
    const response = await fetch(`${fallbackDesktopBootstrap.apiBaseUrl}/v1/desktop/bootstrap`, {
      method: 'GET'
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as DesktopBootstrap
  } catch {
    return null
  }
}

export function createDesktopBootstrapQueryValue(bootstrap: DesktopBootstrap): string {
  return encodeUtf8Base64Url(JSON.stringify(bootstrap))
}

export function resetDesktopBootstrapCache(): void {
  cachedDesktopBootstrapPromise = null
  cachedDesktopBootstrapValue = null
}

export function getDesktopBootstrapSnapshot(): DesktopBootstrap {
  if (!cachedDesktopBootstrapValue && typeof window !== 'undefined') {
    const queryValue = new URLSearchParams(window.location.search).get(desktopBootstrapQueryParam)
    if (queryValue) {
      const parsedBootstrap = parseDesktopBootstrapQueryValue(queryValue)
      if (parsedBootstrap) {
        cachedDesktopBootstrapValue = parsedBootstrap
        persistDesktopBootstrap(parsedBootstrap)
        stripBootstrapQueryParam()
      }
    } else {
      cachedDesktopBootstrapValue = readPersistedDesktopBootstrap()
    }
  }

  return cachedDesktopBootstrapValue ?? fallbackDesktopBootstrap
}

export function isDesktopWindowsPlatform(): boolean {
  return getDesktopBootstrapSnapshot().app.platform === 'win32'
}

export async function getDesktopBootstrap(): Promise<DesktopBootstrap> {
  if (!cachedDesktopBootstrapPromise) {
    cachedDesktopBootstrapPromise = (async () => {
      if (typeof window !== 'undefined') {
        const queryValue = new URLSearchParams(window.location.search).get(desktopBootstrapQueryParam)
        if (queryValue) {
          const parsedBootstrap = parseDesktopBootstrapQueryValue(queryValue)
          stripBootstrapQueryParam()
          if (parsedBootstrap) {
            cachedDesktopBootstrapValue = parsedBootstrap
            persistDesktopBootstrap(parsedBootstrap)
            return parsedBootstrap
          }
        }

        const persistedBootstrap = readPersistedDesktopBootstrap()
        if (persistedBootstrap) {
          cachedDesktopBootstrapValue = persistedBootstrap
          return persistedBootstrap
        }
      }

      const apiBootstrap = await loadDesktopBootstrapFromLocalApi()
      if (apiBootstrap) {
        persistDesktopBootstrap(apiBootstrap)
      }
      cachedDesktopBootstrapValue = apiBootstrap ?? fallbackDesktopBootstrap
      return cachedDesktopBootstrapValue
    })()
  }

  return cachedDesktopBootstrapPromise
}
