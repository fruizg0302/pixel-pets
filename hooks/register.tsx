import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Pet } from '../types'

const frame = atom({ plugin: 'pixel-pets', key: 'frame' } as const, 0)
const pets = atom({ plugin: 'pixel-pets', key: 'pets' } as const, [] as Pet[])

const TICK_MS = 200
const STALE_MS = 2 * 60 * 60 * 1000
const PET_COLORS = ['#6A9BCC', '#7FB069', '#A78BFA', '#E879A6', '#2DD4BF', '#E5C07B', '#E06C75', '#61AFEF']

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

function miniPet(n: number): string[] {
  const isBlinking = n % 23 === 0
  return [isBlinking ? '▐███▌' : '▐▛█▜▌', n % 2 === 0 ? ' ▘ ▘ ' : ' ▝ ▝ ']
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

const ticking: { timer: Timer | null; isWorking: boolean; spawned: number } = {
  timer: null,
  isWorking: false,
  spawned: 0,
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const isFresh = (pet: Pet) => now - pet.startedAt < STALE_MS
  const running = (await read($, pets)).filter(isFresh)
  if (!ticking.isWorking && running.length === 0) {
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
    if (result.deny === undefined && result.agentId !== undefined) {
      const pet: Pet = {
        id: result.agentId,
        label: e.description || e.subagentType,
        color: PET_COLORS[ticking.spawned % PET_COLORS.length] ?? '#6A9BCC',
        startedAt: await $.clock.now(),
      }
      ticking.spawned += 1
      await update($, pets, current => [...current, pet])
      ensureTicking($)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const { agentId } = e
    if (agentId !== undefined) {
      await update($, pets, current => current.filter(pet => pet.id !== agentId))
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
    ticking.isWorking = isWorking

    if (e.props.hasSurvey || (!isWorking && running.length === 0)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const track = Math.max(0, Math.min(e.props.bodyColumns, 60) - BIG_WIDTH - 2)
    const indent = ' '.repeat(isWorking ? walkOffset(n, track) : 0)

    return (
      <Box flexDirection="column">
        {bigPet(n, isWorking).map((line, row) => (
          <Text key={`big-${row}`} color="claude" wrap="truncate">
            {indent}
            {line}
          </Text>
        ))}
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
