# Haha-deck

A personal Claude Code mod: one pane docked beside the transcript, with three tabs.

| Tab | What it shows |
| --- | --- |
| **Live** (`l`) | Clawd in pixel art, who naps, works, waits on you, trips and celebrates; model, effort, context, cost (with your alert) and 5h / 7d limits with reset countdowns; quick actions (Compact, Haiku / Sonnet / Opus, effort − / +, Copy answer); the plan from Claude's to-do list; an activity strip of every tool call; permission gate; subagent cards; files touched (click to copy the path); notes; last-turn receipt and "Explain last turn"; the prompt upgrade (`/better`) |
| **Report** (`r`) | Tasks finished, hours saved and what they are worth, by kind, by project and by model, for Today / Week / Month / Year (`t` `w` `m` `y`). Every session on this machine counts. Hours and dollars are estimates. |
| **Fun** (`b`) | Open a page or search YouTube in the terminal-browser pane beside your session; bookmarks and recent pages |

Built on [Flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella (MIT).

## Commands

- `/haha [live|report|fun|close|reset|layout auto|compact|wide|mini]`, `/haha alert 5` (say once when a session passes $5), `/haha alert off`
- `/report [today|week|month|year]`, `/report settings`, `/report settings rate 75`, `/report settings emails 15`
- `/better <prompt>`, `/better` (type one in the deck), `/better on|off` (automatic mode), `/better history`

In automatic mode a typed prompt goes to the deck first. Slash commands, prompts with attachments, prompts typed while Claude works, short replies and anything starting with `>` go straight through.

## Install

Haha-deck needs Claude Code 2.1.287 or later.

At the prompt of a terminal session:

```
/plugin install haha-deck --marketplace hoang09011996/haha-deck
```

Answer `y` to add the marketplace, pick the user scope, then `/reload-plugins`.

From a shell:

```sh
claude plugin marketplace add hoang09011996/haha-deck
claude plugin install haha-deck@haha-deck
```

If Flightdeck is installed too, turn it off so two decks don't dock at once: `claude plugin disable flightdeck@claude-flightdeck`.

The Fun tab is optional. It needs the terminal-browser app (`brew install --cask terminal-browser`) and its plugin (`claude plugin marketplace add zenbu-labs/terminal-browser`, then `claude plugin install terminal-browser@terminal-browser`), in a terminal with kitty graphics; in Orca the deck opens it in a split beside the session. Without them the other tabs work and Fun says the browser is missing.

### Update

```sh
claude plugin marketplace update haha-deck
claude plugin update haha-deck@haha-deck
```

Then `/reload-plugins`.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
