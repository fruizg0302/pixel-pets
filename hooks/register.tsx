import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Pet } from '../types'

const frame = atom({ plugin: 'pixel-pets', key: 'frame' } as const, 0)
const pets = atom({ plugin: 'pixel-pets', key: 'pets' } as const, [] as Pet[])
const celebrateUntil = atom({ plugin: 'pixel-pets', key: 'celebrateUntil' } as const, -1)

const TICK_MS = 200
const STALE_MS = 2 * 60 * 60 * 1000
const PET_COLORS = ['#6A9BCC', '#7FB069', '#A78BFA', '#E879A6', '#2DD4BF', '#E5C07B', '#E06C75', '#61AFEF']

const CELEBRATION_FRAMES = 14
const SPARKLES = ['✦', '·', '*', '+', '✧']

const BIG_WIDTH = 9
const LABEL_WIDTH = 14

function bigPet(n: number, isWorking: boolean): string[] {
  if (!isWorking) {
    return ['  ▐▀▀▀▀▀▌ z', ' ▝▜█████▛▘', '   ▀▀ ▀▀  ']
  }
  const isBlinking = n % 18 === 0
  const step = Math.floor(n / 2) % 2 === 0
  return [
    isBlinking ? ' ▐█████▌ ' : ' ▐▛███▜▌ ',
    step ? '▝▜█████▛▘' : '▗▟█████▙▖',
    step ? '  ▘▘ ▝▝  ' : '  ▝▝ ▘▘  ',
  ]
}

function partyPet(n: number): string[] {
  const isUp = n % 2 === 0
  return [
    isUp ? '▝▖▐▛███▜▌▗▘' : '  ▐▛███▜▌  ',
    isUp ? '  ▜█████▛  ' : ' ▗▟█████▙▖ ',
    '   ▘▘ ▝▝   ',
  ]
}

type Sparkle = { glyph: string; color: string }

function sparkleRow(n: number, width: number): Sparkle[] {
  return Array.from({ length: width }, (_, column) => {
    const seed = (column * 7 + n * 13) % 11
    const glyph = seed < 2 ? (SPARKLES[(column + n) % SPARKLES.length] ?? '·') : ' '
    return { glyph, color: PET_COLORS[(column + n) % PET_COLORS.length] ?? '#E5C07B' }
  })
}

function miniPet(n: number): string[] {
  const isBlinking = n % 23 === 0
  return [isBlinking ? '▐███▌' : '▐▛█▜▌', n % 2 === 0 ? ' ▘ ▘ ' : ' ▝ ▝ ']
}

function freeColor(current: Pet[]): string {
  const taken = new Set(current.map(pet => pet.color))
  const free = PET_COLORS.find(color => !taken.has(color))
  return free ?? PET_COLORS[current.length % PET_COLORS.length] ?? '#6A9BCC'
}

function walkOffset(n: number, track: number): number {
  if (track <= 0) return 0
  const period = track * 2
  const position = n % period
  return position <= track ? position : period - position
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

const ticking: { timer: Timer | null; isWorking: boolean; offset: number } = {
  timer: null,
  isWorking: false,
  offset: 0,
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const isFresh = (pet: Pet) => now - pet.startedAt < STALE_MS
  const running = (await read($, pets)).filter(isFresh)
  const isCelebrating = (await read($, frame)) < (await read($, celebrateUntil))
  if (!ticking.isWorking && running.length === 0 && !isCelebrating) {
    ticking.timer?.cancel()
    ticking.timer = null
  }
  await update($, pets, current => current.filter(isFresh))
  await update($, frame, n => (n + 1) % 100_000)
}

function ensureTicking($: EngineInterface) {
  if (ticking.timer !== null) return
  ticking.timer = $.clock.every(TICK_MS, () => {
    tick($).catch(() => undefined)
  })
}

/**
 * Draws an animated Claude above the prompt while a turn runs, and a small
 * pet in its own color for each subagent until that subagent finishes.
 */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if ((await read($, pets)).length > 0) ensureTicking($)
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    ticking.isWorking = true
    ensureTicking($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const { agentId } = result
    if (result.deny === undefined && agentId !== undefined) {
      const startedAt = await $.clock.now()
      const label = e.description || e.subagentType
      await update($, pets, current => [
        ...current,
        { id: agentId, label, color: freeColor(current), startedAt },
      ])
      ensureTicking($)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const { agentId } = e
    if (agentId !== undefined) {
      await update($, pets, current => current.filter(pet => pet.id !== agentId))
    } else if (e.reason === 'answer') {
      const n = await read($, frame)
      await update($, celebrateUntil, () => n + CELEBRATION_FRAMES)
      ensureTicking($)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await update($, pets, () => [])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, frame)
    const running = await read($, pets)
    const isWorking = e.props.isWorking
    const isCelebrating = !isWorking && n < (await read($, celebrateUntil))
    ticking.isWorking = isWorking

    if (e.props.hasSurvey || (!isWorking && !isCelebrating && running.length === 0)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const track = Math.max(0, Math.min(e.props.bodyColumns, 60) - BIG_WIDTH - 2)
    if (isWorking) ticking.offset = walkOffset(n, track)
    const indent = ' '.repeat(isWorking || isCelebrating ? ticking.offset : 0)

    const sparkles = (key: string) => (
      <Box key={key} flexDirection="row">
        <Text>{indent}</Text>
        {sparkleRow(n, 11).map((sparkle, column) => (
          <Text key={`${key}-${column}`} color={sparkle.color}>
            {sparkle.glyph}
          </Text>
        ))}
      </Box>
    )
    const isAirborne = n % 4 < 2
    const pet = isCelebrating ? partyPet(n) : bigPet(n, isWorking)
    const petRows = pet.map((line, row) => (
      <Text key={`big-${row}`} color="claude" wrap="truncate">
        {indent}
        {line}
        {isCelebrating && row === 1 ? <Text color="success"> Ta-da!</Text> : null}
      </Text>
    ))

    return (
      <Box flexDirection="column">
        {isCelebrating && !isAirborne && sparkles('sparkles-top')}
        {petRows}
        {isCelebrating && isAirborne && sparkles('sparkles-bottom')}
        {running.length > 0 && (
          <Box flexDirection="row" gap={2}>
            {running.map((pet, index) => {
              const hop = n + index * 3
              return (
                <Box key={pet.id} flexDirection="column" width={LABEL_WIDTH}>
                  {miniPet(hop).map((line, row) => (
                    <Text key={`${pet.id}-${row}`} color={pet.color}>
                      {hop % 4 < 2 ? ' ' : '  '}
                      {line}
                    </Text>
                  ))}
                  <Text dimColor wrap="truncate">
                    {truncate(pet.label, LABEL_WIDTH)}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
