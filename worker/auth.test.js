import { describe, expect, it } from 'vitest'
import { isAuthPath, missingSettings, open, readCookie, readIdToken, redirectUri, sign, verify } from './auth.js'

const SECRET = 'un secreto de prueba'

describe('signed values', () => {
  it('reads back what was signed', async () => {
    const signed = await sign('hola', SECRET)
    expect(await open(signed, SECRET)).toBe('hola')
    expect(await verify('hola', signed, SECRET)).toBe(true)
  })

  it('refuses a value that was changed', async () => {
    const signed = await sign(JSON.stringify({ email: 'xavi@example.com' }), SECRET)
    const tampered = signed.replace(/^[^.]+/, btoa(JSON.stringify({ email: 'otro@example.com' })).replace(/=+$/, ''))
    expect(await open(tampered, SECRET)).toBeNull()
  })

  it('refuses a value signed with another secret', async () => {
    expect(await open(await sign('hola', 'otro secreto'), SECRET)).toBeNull()
  })

  it('keeps accents and names beyond Latin-1', async () => {
    for (const name of ['Xavi Ramírez', 'Begoña', '李雷', 'Ünal Şahin']) {
      const signed = await sign(JSON.stringify({ name }), SECRET)
      expect(JSON.parse(await open(signed, SECRET)).name).toBe(name)
    }
  })

  it('refuses nonsense', async () => {
    expect(await open('', SECRET)).toBeNull()
    expect(await open('sin-punto', SECRET)).toBeNull()
    expect(await open('$$$.abc', SECRET)).toBeNull()
  })
})

describe('readCookie', () => {
  const request = (header) => new Request('https://bocados.org/', { headers: header ? { Cookie: header } : {} })

  it('finds one cookie among others', () => {
    expect(readCookie(request('otra=1; bocados_sesion=abc; mas=2'), 'bocados_sesion')).toBe('abc')
  })

  it('is null when it is not there', () => {
    expect(readCookie(request('otra=1'), 'bocados_sesion')).toBeNull()
    expect(readCookie(request(), 'bocados_sesion')).toBeNull()
  })

  it('does not match a cookie whose name ends the same', () => {
    expect(readCookie(request('mi_bocados_sesion=abc'), 'bocados_sesion')).toBeNull()
  })
})

describe('readIdToken', () => {
  it('reads the claims', () => {
    const payload = btoa(JSON.stringify({ sub: '123', email: 'xavi@example.com', name: 'Xavi' }))
    expect(readIdToken(`cabecera.${payload}.firma`)).toEqual({ sub: '123', email: 'xavi@example.com', name: 'Xavi' })
  })

  it('reads accents as Google sends them', () => {
    // Google base64-encodes the UTF-8 bytes of the claims.
    const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ sub: '1', email: 'x@y.z', name: 'Xavi Ramírez' }))))
    expect(readIdToken(`cabecera.${payload}.firma`).name).toBe('Xavi Ramírez')
  })

  it('is null for anything else', () => {
    expect(readIdToken('')).toBeNull()
    expect(readIdToken(undefined)).toBeNull()
    expect(readIdToken('sin.partes')).toBeNull()
  })
})

describe('routes', () => {
  it('claims only its own paths', () => {
    expect(isAuthPath('/auth/google')).toBe(true)
    expect(isAuthPath('/auth/callback')).toBe(true)
    expect(isAuthPath('/auth/yo')).toBe(true)
    expect(isAuthPath('/api/buscar')).toBe(false)
    expect(isAuthPath('/')).toBe(false)
    expect(isAuthPath('/auth/otra')).toBe(false)
  })

  it('sends Google back to the same site it started from', () => {
    expect(redirectUri(new URL('https://bocados.org/auth/google'))).toBe('https://bocados.org/auth/callback')
    expect(redirectUri(new URL('http://localhost:8788/auth/google'))).toBe('http://localhost:8788/auth/callback')
  })
})

describe('missingSettings', () => {
  const full = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secreto', SESSION_SECRET: 'sesion' }

  it('says nothing is missing when all three are there', () => {
    expect(missingSettings(full)).toEqual([])
  })

  it('names the ones the server cannot see', () => {
    expect(missingSettings({ ...full, GOOGLE_CLIENT_SECRET: undefined })).toEqual(['GOOGLE_CLIENT_SECRET'])
    expect(missingSettings({})).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'])
  })

  it('counts blank as missing', () => {
    expect(missingSettings({ ...full, SESSION_SECRET: '   ' })).toEqual(['SESSION_SECRET'])
  })
})
