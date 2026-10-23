import { expect, test } from 'claude-code/testing'

import { quadrantPixels, spriteSvg } from '../hooks/sprites'

test('each glyph becomes a two by two block of pixels', () => {
  expect(quadrantPixels(['▐▛', ' ▘'])).toEqual([
    [false, true, true, true],
    [false, true, true, false],
    [false, false, true, false],
    [false, false, false, false],
  ])
})

test('characters outside the quadrant set stay empty', () => {
  expect(quadrantPixels(['z'])).toEqual([
    [false, false],
    [false, false],
  ])
})

test('a sprite merges each run of lit pixels into one rect', () => {
  const svg = spriteSvg([{ pixels: quadrantPixels(['█']), color: '#D97757', x: 0, y: 0 }], {
    columns: 2,
    rows: 2,
    pixelWidth: 4,
    pixelHeight: 7,
  })
  expect(svg.width).toBe(8)
  expect(svg.height).toBe(14)
  expect(svg.source.match(/<rect/g)).toHaveLength(2)
  expect(svg.source).toContain('<rect x="0" y="7" width="8" height="7" fill="#D97757"/>')
})
