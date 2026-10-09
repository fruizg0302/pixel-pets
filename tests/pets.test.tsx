import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'pixel-pets',
  component: 'AbovePrompt',
  requestId: 'band',
} as const

function engineBand(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
}

function bandProps(isWorking: boolean) {
  return {
    hasSurvey: false,
    isWorking,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { bodyRows: 19, offset: 0 },
  } as never
}

test('a subagent gets a pet until its turn completes', async ($, on) => {
  mock.clock(on)
  engineBand(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'look around',
    description: 'Scout files',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: /Scout files/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: 'turn-a1',
    agentId: 'a1',
    reason: 'answer',
  } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(false) })
  expect(await ui.find({ type: 'Text', text: /Scout files/ })).toBeUndefined()
  await ui.unmount()
})

test('the big pet shows while a turn runs', async ($, on) => {
  mock.clock(on)
  engineBand(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'hi', turnId: 't' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(true) })
  expect(await ui.find({ type: 'Text', text: /▐/ })).toBeDefined()
  await ui.unmount()
})

function mainTurnComplete(reason: 'answer' | 'aborted') {
  return {
    answer: 'done',
    durationMs: 10,
    isAborted: reason === 'aborted',
    turnId: 'main-turn',
    reason,
  } as never
}

test('a finished turn gets a celebration', async ($, on) => {
  mock.clock(on)
  engineBand(on)
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete(mainTurnComplete('answer'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: /Ta-da/ })).toBeDefined()
    await ui.unmount()
  }
})

test('an interrupted turn gets no celebration', async ($, on) => {
  mock.clock(on)
  engineBand(on)
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete(mainTurnComplete('aborted'))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(false) })
  expect(await ui.find({ type: 'Text', text: /Ta-da/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
  await ui.unmount()
})

test('agents spawned together get different colors', async ($, on) => {
  mock.clock(on)
  engineBand(on)
  let next = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `a${(next += 1)}` }))

  const spawn = (description: string) =>
    $.agent.spawn({
      tool_use_id: description,
      prompt: 'wait',
      description,
      subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5-5',
    } as never)
  await Promise.all([spawn('one'), spawn('two'), spawn('three')])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(false) })
  const minis = await ui.findAll({ type: 'Text', text: /▐/ })
  const colors = new Set(minis.map(mini => mini.props.color).filter(color => color !== 'claude'))
  expect(colors.size).toBe(3)
  await ui.unmount()
})
