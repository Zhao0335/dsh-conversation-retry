# dsh-conversation-retry

Edit a message you already sent and re-run from there — plus retry a turn, and
branch from any turn — in the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

The stock Harness only lets you append another message when something goes
wrong. A prompt you already sent is frozen: the bad answer stays in the history
and keeps costing context. This plugin makes the conversation editable.

| Action | Where | What it does |
| --- | --- | --- |
| **Edit** | on your own message | Rewrite a prompt you already sent and re-run from that point. |
| **Retry** | on a completed turn | Re-send the turn's prompt unchanged and let the model answer again. |
| **Branch** | on a completed turn | Fork a new session that keeps the turn — for *any* turn, including older ones. |

Every action produces a real, separate session: nothing is rewritten in place
and nothing is lost. The original conversation is untouched, and the new branch
appears in the sidebar like any other session.

## Why forks instead of in-place rewriting

A Harness session is an append-only event log — that is what makes replay,
inspection, and export trustworthy. Deleting the tail of a log would break that
guarantee, so "edit and re-run" is expressed as a fork of an exact
event-sequence prefix: the child is a complete, self-contained session whose
history ends just before the message you edited. This is the same primitive the
sidebar's *Fork session* action uses, cut at message granularity instead of at
the session's end.

That also means an edit is non-destructive: the branch you abandoned is still
there if you want it back.

## Install

The plugin is a local Harness bundle. From a checkout of this repository:

```
plugin_manager install_bundle  target: <absolute path to this directory>
```

After installing, reload the Web UI once so the browser picks up the new client
module.

Requirements: a Harness build that exposes `ctx.sessions.fork` with an `atSeq`
boundary, the `conversation.chat.user.before` chain slot, and the
`conversation.chat.turnTail` slot (0.2.x and later).

## Usage

**Edit a message.** Hover one of your own messages; a pencil button appears
beside it. Click it and the message opens in a dialog, pre-filled. Change it and
press *Fork and send* (`Ctrl`/`Cmd`+`Enter`). A new session opens with the
edited prompt already running; everything before that message is carried over,
and the old answer and everything after it are gone from the new history.

**Retry a turn.** Under each completed turn, *Retry* re-asks the turn's own
prompt on a history without that turn.

**Branch a turn.** *Branch* forks a session that keeps the turn. The shipped
footer branch icon disables itself once later turns exist; this one does not, so
you can branch from the middle of a long conversation.

The child session inherits the title with an incremented suffix, so branches of
the same conversation stay recognisable in the sidebar.

## How it works

* `conversation.chat.user.before` — a chain slot rendered inside the user row.
  Its selector elects the entry only for rows whose durable message source
  carries a browser prompt identity (`source.rpcId`), so only messages you
  actually typed get the pencil; synthetic context injections do not.
* `shell.overlay` — the frame-wide layer that hosts the single edit dialog. The
  open edit target lives in a small module-level store shared by both entries.
* `conversation.chat.turnTail` — the per-turn extension point, rendered before a
  completed turn's action row. It receives the turn location (including the
  `turn/start` event and its sequence) and the turn's closing sequence.
* `ctx.sessions.fork({ sessionId, atSeq })` — cuts an exact inclusive prefix.
  Edit forks at `userMessage.seq - 1`; retry forks at `turnStart.seq - 1`;
  branch forks at the turn's closing `seq`.
* `ctx.sessions.using(childId, …)` → `SessionBinding.session.prompt([…], 'queue')`
  — sends the prompt into the child once its initial open settles.
* `ctx.uiWorkspace.openSession(childId)` — retains the child as the main view
  (so it outlives the plugin's own reference) and navigates to it.

The Host half is an empty `apply()`; the whole feature is browser-side.

## Limitations

* Retry re-sends the turn's **first** user message. A turn opened by a synthetic
  context injection (goal continuation, file-change notice) will re-send that
  injected text rather than a human prompt.
* Edit is offered only for messages whose source carries an `rpcId` — prompts
  submitted from this browser. Messages restored from an older log format
  without that identity are not editable.
* Messages whose events have scrolled out of the loaded history are skipped; the
  buttons are hidden for them.
* Attachments are not carried over — the prompt is re-sent as text.

## License

MIT — see [LICENSE](LICENSE).
