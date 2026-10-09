import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import fr from '../locales/fr.json'

const SRC = new URL('..', import.meta.url).pathname

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path)
    return /\.(vue|js)$/.test(name) ? [path] : []
  })
}

const messageOf = key => key.split('.').reduce((node, part) => node?.[part], fr)

describe('plural translations', () => {
  // t(key, count, {…}) treats the object as options: only {count} reaches the
  // message. Any other value has to be passed as t(key, {…}, count), or the
  // reader sees "von verfügbar" with the numbers gone.
  it('receive their named values where vue-i18n reads them', () => {
    const wrong = []
    for (const file of sources(SRC)) {
      const code = readFileSync(file, 'utf-8')
      for (const [, key] of code.matchAll(/\bt\('([\w.]+)',\s*[^,{)'"]+,\s*\{/g)) {
        const named = [...(messageOf(key) ?? '').matchAll(/\{(\w+)\}/g)].map(match => match[1])
        if (named.some(name => name !== 'count' && name !== 'n')) wrong.push(`${file.replace(SRC, '')}: ${key}`)
      }
    }
    expect(wrong).toEqual([])
  })
})
