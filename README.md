# pixel-pets

A [Claude Code](https://claude.com/claude-code) mod that keeps you company while Claude works.

- **While a turn runs**, Claude's pixel mascot walks back and forth above the prompt, swinging its arms and blinking.
- **Each subagent** gets a small pet of its own color (8 colors, assigned in turn), hopping under the big one with the agent's task beside it. A pet leaves when its agent finishes.
- **Idle with background agents still running**, the big Claude naps (`z`) while the small pets keep hopping.
- **Fully idle**, the band disappears and the animation timer stops.

```
 ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
 ▐▛█▜▌           ▐▛█▜▌
 ▘ ▘             ▝ ▝
Scout files      Run tests
```

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install pixel-pets --marketplace fruizg0302/pixel-pets
```

Answer `y` to add the marketplace, then pick the user scope with Enter. The pets show up right away in that session, and in every session after.

## How it works

`hooks/register.tsx` is a function-hooks module:

| Hook | What it does |
| --- | --- |
| `ui.render` on `AbovePrompt` | Draws the big pet and the subagent pets in the band above the prompt |
| `turn.start` | Starts a 200 ms animation timer |
| `agent.spawn` | Adds a pet for the new subagent |
| `turn.complete` | Removes a subagent's pet when its turn ends |
| `session.end` | Clears the pets |

The timer stops on its own once no turn is running and no subagent is alive.

## Develop

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .   # run a session with your working copy loaded
```

## License

MIT
