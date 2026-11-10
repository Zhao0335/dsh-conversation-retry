# dsh-conversation-retry

Retry, edit-and-resend, and branch — from any completed turn in the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

The stock Harness only lets you append another message when an answer goes
wrong, so the bad answer stays in the history and keeps costing context. This
plugin adds the three actions you actually want, right next to the turn:

| Action | What it does |
| --- | --- |
| **Retry** | Forks the session *before* the turn, then sends that turn's own prompt again. The regenerated answer starts from a history that never contained the old one. |
| **Edit & resend** | The same fork, but with a prompt you rewrite first. |
| **Branch** | Forks a new session that keeps this turn and everything before it, so both endings stay explorable. |

Every action produces a real, separate session: nothing is rewritten in place
and nothing is lost. The original conversation is untouched, and the new branch
appears in the sidebar like any other session.

## Why forks instead of in-place regeneration

A Harness session is an append-only event log — that is what makes replay,
inspection, and export trustworthy. Deleting the tail of a log would break that
guarantee, so "regenerate" is expressed as a fork of an exact event-sequence
prefix: the child is a complete, self-contained session whose history ends
before the turn you are replacing. This is the same primitive the sidebar's
*Fork session* action uses, cut at message granularity instead of at the
session's end.

## Install

The plugin is a local Harness bundle. From a checkout of this repository:

```
plugin_manager install_bundle  target: <absolute path to this directory>
```

or, with the Harness CLI, add the directory to the profile the same way. After
installing, reload the Web UI once so the browser picks up the new client
module.

Requirements: a Harness build that exposes `ctx.sessions.fork` with an `atSeq`
boundary and the `conversation.chat.turnTail` slot (0.2.x and later).

## Usage

Open any conversation. Under each completed turn you will see:

```
⟳ Retry   ✎ Edit & resend   ⑂ Branch
```

* **Retry** — instantly forks and re-asks.
* **Edit & resend** — opens an inline editor pre-filled with the original
  prompt. `Ctrl`/`Cmd`+`Enter` sends, `Esc` cancels. The editor states plainly
  what the child keeps.
* **Branch** — forks without sending anything, and opens the child ready for
  your next message.

The child session inherits the title with an incremented suffix, so branches of
the same conversation stay recognisable in the sidebar.

## How it works

* `conversation.chat.turnTail` — the per-turn extension point, rendered before a
  completed turn's action row. It receives the turn location (including the
  `turn/start` event and its sequence) and the turn's closing sequence.
* `ctx.sessions.fork({ sessionId, atSeq })` — cuts an exact inclusive prefix.
  Retry and edit fork at `turnStart.seq - 1`; branch forks at the turn's closing
  `seq`.
* `ctx.sessions.using(childId, …)` → `SessionBinding.session.prompt([…], 'queue')`
  — sends the prompt into the child once its initial open settles.
* `ctx.uiWorkspace.openSession(childId)` — retains the child as the main view
  (so it outlives the plugin's own reference) and navigates to it.
* The turn's original prompt is read from the session's live event window: the
  first `user/message` after that turn's `turn/start`.

The Host half is an empty `apply()`; the whole feature is browser-side.

## Limitations

* Retry re-sends the turn's **first** user message. A turn opened by a synthetic
  context injection (goal continuation, file-change notice) will re-send that
  injected text rather than a human prompt.
* Turns whose `turn/start` has scrolled out of the loaded history cannot be
  retried; the buttons are hidden for them.
* Attachments are not carried over — the prompt is re-sent as text.

## License

MIT — see [LICENSE](LICENSE).
