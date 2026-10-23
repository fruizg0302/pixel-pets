/** A block of lit pixels, placed at a pixel column and row of a drawing. */
export type Layer = { pixels: boolean[][]; color: string; x: number; y: number }

export type Grid = { columns: number; rows: number; pixelWidth: number; pixelHeight: number }

export type Sprite = { source: string; width: number; height: number }

const QUADRANTS: Record<string, readonly [number, number, number, number]> = {
  ' ': [0, 0, 0, 0],
  '▀': [1, 1, 0, 0],
  '▄': [0, 0, 1, 1],
  '█': [1, 1, 1, 1],
  '▌': [1, 0, 1, 0],
  '▐': [0, 1, 0, 1],
  '▘': [1, 0, 0, 0],
  '▝': [0, 1, 0, 0],
  '▖': [0, 0, 1, 0],
  '▗': [0, 0, 0, 1],
  '▛': [1, 1, 1, 0],
  '▜': [1, 1, 0, 1],
  '▙': [1, 0, 1, 1],
  '▟': [0, 1, 1, 1],
  '▚': [1, 0, 0, 1],
  '▞': [0, 1, 1, 0],
}

/**
 * Decodes quadrant block glyphs into pixels, two columns and two rows per
 * character, so a frame drawn for the terminal can be drawn anywhere else.
 * Characters outside the quadrant set (the nap's `z`) come out empty.
 */
export function quadrantPixels(lines: readonly string[]): boolean[][] {
  const glyphs = lines.map(line => Array.from(line))
  const width = Math.max(0, ...glyphs.map(line => line.length)) * 2
  return glyphs.flatMap(line => {
    const top = Array.from({ length: width }, () => false)
    const bottom = Array.from({ length: width }, () => false)
    line.forEach((glyph, column) => {
      const [topLeft, topRight, bottomLeft, bottomRight] = QUADRANTS[glyph] ?? QUADRANTS[' ']!
      top[column * 2] = topLeft === 1
      top[column * 2 + 1] = topRight === 1
      bottom[column * 2] = bottomLeft === 1
      bottom[column * 2 + 1] = bottomRight === 1
    })
    return [top, bottom]
  })
}

/** A three by three sparkle: a single dot for `·`, a plus for every other glyph. */
export function sparklePixels(glyph: string): boolean[][] {
  const isDot = glyph === '·'
  return [
    [false, !isDot, false],
    [!isDot, true, !isDot],
    [false, !isDot, false],
  ]
}

/** The column count spanned by every layer, the width a drawing needs. */
export function layersWidth(layers: readonly Layer[]): number {
  return Math.max(0, ...layers.map(layer => layer.x + (layer.pixels[0]?.length ?? 0)))
}

/**
 * Draws layers as one SVG of crisp rects, one per horizontal run of lit
 * pixels, clipped to the grid. Later layers paint over earlier ones.
 */
export function spriteSvg(layers: readonly Layer[], grid: Grid): Sprite {
  const width = grid.columns * grid.pixelWidth
  const height = grid.rows * grid.pixelHeight
  const rects = layers.flatMap(layer =>
    layer.pixels.flatMap((row, rowIndex) => {
      const y = layer.y + rowIndex
      if (y < 0 || y >= grid.rows) return []
      return runs(row).flatMap(([start, length]) => {
        const left = Math.max(0, layer.x + start)
        const right = Math.min(grid.columns, layer.x + start + length)
        if (right <= left) return []
        return [
          `<rect x="${left * grid.pixelWidth}" y="${y * grid.pixelHeight}" width="${(right - left) * grid.pixelWidth}" height="${grid.pixelHeight}" fill="${layer.color}"/>`,
        ]
      })
    }),
  )
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`
  return { source, width, height }
}

function runs(row: readonly boolean[]): Array<[number, number]> {
  const found: Array<[number, number]> = []
  let start = -1
  row.forEach((isLit, column) => {
    if (isLit && start < 0) start = column
    if (!isLit && start >= 0) {
      found.push([start, column - start])
      start = -1
    }
  })
  if (start >= 0) found.push([start, row.length - start])
  return found
}
