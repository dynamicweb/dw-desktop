import { describe, expect, it } from 'vitest'
import { parseHost } from './host'

describe('parseHost', () => {
  it.each([
    ['site.dk', 'https', 'site.dk'],
    ['https://site.dk/', 'https', 'site.dk'],
    ['https://site.dk/admin/', 'https', 'site.dk'],
    ['http://localhost:5000', 'http', 'localhost:5000'],
    ['  https://site.dk/  ', 'https', 'site.dk'],
    [' http://localhost:5000/', 'http', 'localhost:5000'],
    ['HTTPS://Site.dk', 'https', 'Site.dk'],
    ['Http://localhost', 'http', 'localhost'],
    ['site.dk?x=1', 'https', 'site.dk'],
    ['https://site.dk#top', 'https', 'site.dk']
  ])('reads %j', (raw, protocol, host) => {
    expect(parseHost(raw)).toEqual({ protocol, host })
  })

  it('finds no host in an empty or scheme-only address', () => {
    expect(parseHost('   ').host).toBe('')
    expect(parseHost('https://').host).toBe('')
  })
})
