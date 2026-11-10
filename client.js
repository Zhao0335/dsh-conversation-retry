/**
 * Browser half of the conversation-retry bundle.
 *
 * Two actions, both built on the shipped fork primitive (`ctx.sessions.fork`
 * cuts an exact inclusive event-sequence prefix) plus
 * `SessionBinding.session.prompt` into the child:
 *
 *   Edit (on your own message)
 *       Rewrite a prompt you already sent and re-run from there. The child
 *       keeps everything before that message, so the old answer and everything
 *       after it are gone from its history — a branch, not an append.
 *   Retry (in the assistant message's action strip)
 *       Re-send that turn's prompt unchanged and let the model answer again.
 *
 * Branching already ships in the Chat footer, so this plugin does not duplicate
 * it.
 *
 * @module dsh-conversation-retry/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-conversation-retry',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'conversation-retry'

    /** Reference source counted while this plugin drives a freshly forked child. */
    const SOURCE = 'conversationRetry'

    /** Action-strip button class, mirroring the shipped message action geometry. */
    const ACTION_CLASS = 'dsh-conversation-retry-action'

    /** Client root context, captured by `apply`. */
    let client = null

    const en = {
      'edit.action': 'Edit this message',
      'edit.title': 'Edit your message',
      'edit.hint': 'Sending forks a new session that keeps everything before this message. The original conversation is untouched.',
      'edit.send': 'Fork and send',
      'edit.cancel': 'Cancel',
      'retry.action': 'Retry',
      'error.noPrompt': 'This turn has no prompt to retry',
      'error.empty': 'Write something first',
    }

    const zh = {
      'edit.action': '编辑这条消息',
      'edit.title': '编辑你的消息',
      'edit.hint': '发送后会分叉出一个新会话，保留这条消息之前的全部内容；原来的对话不受影响。',
      'edit.send': '分叉并发送',
      'edit.cancel': '取消',
      'retry.action': '重试',
      'error.noPrompt': '这一轮没有可以重试的提问',
      'error.empty': '先写点内容',
    }

    /**
     * Action-strip styling copied from the shipped message action rule, so the
     * added control is indistinguishable from the copy and branch buttons.
     */
    const CSS = `
.${ACTION_CLASS}{
  width:calc(28px + var(--dsh-content-font-delta,0px));
  height:calc(28px + var(--dsh-content-font-delta,0px));
  border-radius:var(--dsw-radius-sm);
  color:var(--dsw-alias-label-tertiary);
  cursor:pointer;background:0 0;border:none;
  justify-content:center;align-items:center;padding:6px;display:inline-flex;
}
.${ACTION_CLASS} svg{
  width:calc(17px + var(--dsh-content-font-delta,0px));
  height:calc(17px + var(--dsh-content-font-delta,0px));
}
@media (hover:hover){
  .${ACTION_CLASS}:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
}
.${ACTION_CLASS}:disabled{cursor:default;opacity:.4}
.${ACTION_CLASS}:focus-visible{
  outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));
  outline-offset:2px;
}
.dsh-conversation-retry-failure{
  font-size:12px;line-height:18px;max-width:220px;
  color:var(--dsw-alias-state-error-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
/**
 * The user row stacks its children in a column: the message-source seat, the
 * bubble, then the shipped action row. The chain slot only offers the first
 * seat, so the control is taken out of flow and the action row reserves the
 * space it occupies — the pencil then shares the copy icon's line instead of
 * becoming another stacked row.
 */
:has(> .dsh-conversation-retry-edit){position:relative}
:has(> .dsh-conversation-retry-edit) > :last-child{
  padding-right:calc(28px + var(--dsh-content-font-delta,0px) + 8px);
}
.dsh-conversation-retry-edit{
  position:absolute;
  right:0;
  bottom:0;
}
`

    const styles = {
      scrim: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(0, 0, 0, 0.32)',
      },
      dialog: {
        boxSizing: 'border-box',
        width: 'min(560px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '14px',
        background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff))',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.24)',
      },
      title: {
        fontSize: '14px',
        lineHeight: '22px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      caption: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary, inherit))',
      },
      textarea: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '132px',
        maxHeight: '46vh',
        padding: '10px 12px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-base, transparent)',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '14px',
        lineHeight: '22px',
        resize: 'vertical',
      },
      actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' },
      dialogButton: {
        display: 'inline-flex',
        alignItems: 'center',
        height: '30px',
        padding: '0 12px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '8px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        font: 'inherit',
        fontSize: '13px',
        cursor: 'pointer',
      },
      primary: {
        borderColor: 'transparent',
        background: 'var(--dsw-alias-brand-primary, #247bbf)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      },
      error: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    }

    /** One stroked glyph matching the action strip's icon weight. */
    function glyph(paths) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 17,
          height: 17,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )
    }

    const ICON_EDIT = glyph(['M10.9 2.4 13.6 5.1 6.3 12.4 3 12.9 3.5 9.6z'])
    const ICON_RETRY = glyph(['M13.5 8.3A5.6 5.6 0 1 1 11.6 3.8', 'M13.4 1.9v3.4h-3.4'])

    // --- session log readers -------------------------------------------------

    /** Durable events of one retained Session, in sequence order. */
    function eventsOf(sessionId) {
      if (client === null) return []
      const binding = client.sessions.binding(sessionId)
      if (binding === undefined) return []
      const window = binding.eventSource.getSnapshot()
      const events = []
      for (const entry of window.entries) {
        if (entry !== null && typeof entry === 'object' && entry.type === 'event' && entry.event !== undefined) {
          events.push(entry.event)
        }
      }
      return events
    }

    /** Text blocks of one model-facing message, joined for display. */
    function textOfMessage(message) {
      if (message === undefined || message === null || !Array.isArray(message.content)) return ''
      const parts = []
      for (const block of message.content) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text)
        }
      }
      return parts.join('\n').trim()
    }

    /**
     * Locate one durable user message by the browser prompt identity its source
     * carries, so an edit affordance acts on the exact message it decorates.
     * @param sessionId - viewed session.
     * @param rpcId - prompt identity from the message source.
     * @returns the message sequence and text, when present in the loaded window.
     */
    function userMessageOf(sessionId, rpcId) {
      for (const event of eventsOf(sessionId)) {
        if (event.type !== 'user/message') continue
        const data = event.data
        if (data === undefined || data === null) continue
        const source = data.source
        if (source === undefined || source === null || typeof source !== 'object') continue
        if (source.rpcId !== rpcId) continue
        return { seq: event.seq, text: textOfMessage(data) }
      }
      return undefined
    }

    /**
     * The prompt a turn opened with: the first `user/message` after its
     * `turn/start`, before the first step or the turn's close.
     * @param sessionId - viewed session.
     * @param startSeq - sequence of the turn's `turn/start` event.
     */
    function promptTextAfterStart(sessionId, startSeq) {
      const events = eventsOf(sessionId)
      let seen = false
      for (const event of events) {
        if (!seen) {
          if (event.type === 'turn/start' && event.seq === startSeq) seen = true
          continue
        }
        if (event.type === 'turn/end' || event.type === 'turn/start') break
        if (event.type === 'user/message') {
          const text = textOfMessage(event.data)
          if (text !== '') return text
        }
      }
      return ''
    }

    // --- fork helpers --------------------------------------------------------

    /** Message of a thrown failure, preferring the Host's own wording. */
    function describeError(error) {
      if (error !== null && typeof error === 'object') {
        if (error.rpcError !== undefined && typeof error.rpcError.message === 'string' && error.rpcError.message !== '') {
          return error.rpcError.message
        }
        if (typeof error.message === 'string' && error.message !== '') return error.message
      }
      return String(error)
    }

    /**
     * Fork `sessionId` at an exact inclusive boundary and send a prompt into the
     * child, so the answer is produced on a history without the replaced turn.
     * @param sessionId - source session.
     * @param atSeq - last event sequence the child keeps.
     * @param text - prompt text to send.
     */
    async function forkAndPrompt(sessionId, atSeq, text) {
      const childId = await client.sessions.fork({
        sessionId,
        ...(atSeq === undefined ? {} : { atSeq }),
        increaseTitle: true,
      })
      // Retains the child as the main view, so it outlives this call.
      client.uiWorkspace.openSession(childId)
      await client.sessions.using(childId, { source: SOURCE }, async (reference) => {
        await reference.ready
        const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
        if (result !== null && typeof result === 'object' && result.ok === false) {
          throw new Error(describeError(result.error))
        }
      })
      return childId
    }

    // --- shared edit state ---------------------------------------------------

    /** Open edit target, or null. */
    let editState = null
    const editListeners = new Set()

    /** Replace the open edit target and notify every mounted reader. */
    function publishEdit(next) {
      editState = next
      for (const listener of editListeners) listener()
    }

    /** Subscribe to the shared edit target. */
    function subscribeEdit(listener) {
      editListeners.add(listener)
      return () => {
        editListeners.delete(listener)
      }
    }

    /** Read the shared edit target, re-rendering on change. */
    function useEditState() {
      const [state, setState] = React.useState(editState)
      React.useEffect(() => subscribeEdit(() => setState(editState)), [])
      return state
    }

    /** Locale lookup with a bundled English fallback. */
    function translatorOf(props) {
      return (key) => {
        if (typeof props.t === 'function') {
          try {
            const value = props.t(key)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch (failure) {
            /* fall through to the bundled copy */
          }
        }
        return en[key] !== undefined ? en[key] : key
      }
    }

    // --- components ----------------------------------------------------------

    /**
     * The edit affordance pinned to one of your own messages.
     * @param props - chain owner props plus the elected `matched` value.
     */
    function UserMessageEdit(props) {
      const translate = translatorOf(props)
      const sessionId = props.sessionId
      const matched = props.matched
      const rpcId = matched !== null && matched !== undefined ? matched.rpcId : undefined
      if (sessionId === undefined || rpcId === undefined) return null

      const target = userMessageOf(sessionId, rpcId)
      if (target === undefined) return null

      const label = translate('edit.action')
      return h(
        'button',
        {
          type: 'button',
          className: `${ACTION_CLASS} dsh-conversation-retry-edit`,
          title: label,
          'aria-label': label,
          onClick: () => publishEdit({ sessionId, seq: target.seq, draft: target.text, busy: false, error: null }),
        },
        ICON_EDIT,
      )
    }

    /**
     * Retry for one finalized assistant message, rendered inside the shipped
     * action strip beside copy and branch.
     * @param props - owner `messageId` plus the standard `sessionId` and `useChat`.
     */
    function RetryAction(props) {
      const translate = translatorOf(props)
      const messageId = props.messageId
      const sessionId = props.sessionId
      const [busy, setBusy] = React.useState(false)
      const [failure, setFailure] = React.useState(null)

      // The turn whose closing assistant message this is, addressed by the
      // sequence of its own `turn/start`.
      const startSeq = props.useChat((snapshot) => {
        const timeline = snapshot === undefined || snapshot === null ? undefined : snapshot.timeline
        const turns = timeline === undefined || timeline === null ? undefined : timeline.turns
        if (turns === undefined || turns === null) return undefined
        for (const turn of turns.values()) {
          if (turn === undefined || turn === null) continue
          const data = turn.data
          const tail = data === undefined || data === null ? undefined : data.get('turn-tail')
          const closing = tail === undefined || tail === null ? undefined : tail.closing
          const finalNode = closing === undefined || closing === null ? undefined : closing.finalNode
          if (finalNode === undefined || finalNode === null || finalNode.messageId !== messageId) continue
          return turn.start === undefined || turn.start === null ? undefined : turn.start.seq
        }
        return undefined
      })

      if (sessionId === undefined || typeof startSeq !== 'number' || startSeq <= 1) return null

      const label = translate('retry.action')
      const onRetry = async () => {
        const text = promptTextAfterStart(sessionId, startSeq)
        if (text === '') {
          setFailure(translate('error.noPrompt'))
          return
        }
        setBusy(true)
        setFailure(null)
        try {
          await forkAndPrompt(sessionId, Math.max(1, startSeq - 1), text)
        } catch (error) {
          setFailure(describeError(error))
        } finally {
          setBusy(false)
        }
      }

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            className: ACTION_CLASS,
            title: label,
            'aria-label': label,
            disabled: busy,
            onClick: onRetry,
          },
          ICON_RETRY,
        ),
        failure === null
          ? null
          : h('span', { className: 'dsh-conversation-retry-failure', role: 'status', title: failure }, failure),
      )
    }

    /**
     * The edit dialog, rendered once in the frame-wide overlay layer.
     * @param props - locale translator.
     */
    function EditDialog(props) {
      const translate = translatorOf(props)
      const state = useEditState()
      if (state === null) return null

      const close = () => {
        if (state.busy) return
        publishEdit(null)
      }

      const patch = (next) => publishEdit({ ...state, ...next })

      const submit = async () => {
        const text = state.draft.trim()
        if (text === '') {
          patch({ error: translate('error.empty') })
          return
        }
        patch({ busy: true, error: null })
        try {
          await forkAndPrompt(state.sessionId, Math.max(1, state.seq - 1), text)
          publishEdit(null)
        } catch (error) {
          patch({ busy: false, error: describeError(error) })
        }
      }

      return h(
        'div',
        {
          style: styles.scrim,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) close()
          },
        },
        h(
          'div',
          { style: styles.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-label': translate('edit.title') },
          h('div', { style: styles.title }, translate('edit.title')),
          h('textarea', {
            style: styles.textarea,
            value: state.draft,
            autoFocus: true,
            'aria-label': translate('edit.title'),
            onChange: (event) => patch({ draft: event.target.value, error: null }),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
            },
          }),
          h('div', { style: styles.caption }, translate('edit.hint')),
          state.error === null ? null : h('div', { style: styles.error, role: 'status' }, state.error),
          h(
            'div',
            { style: styles.actions },
            h(
              'button',
              { type: 'button', onClick: close, disabled: state.busy === true, style: styles.dialogButton },
              translate('edit.cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: submit,
                disabled: state.busy === true || state.draft.trim() === '',
                style: { ...styles.dialogButton, ...styles.primary, ...(state.busy === true ? { opacity: 0.55 } : {}) },
              },
              translate('edit.send'),
            ),
          ),
        ),
      )
    }

    // --- plugin --------------------------------------------------------------

    /**
     * Client plugin body: stylesheet, dictionaries, the message edit affordance,
     * the edit dialog, and the retry action.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      client = ctx

      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-conversation-retry'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'conversation-retry: stylesheet')

      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'conversation-retry: dictionaries')

      // Edit affordance on your own messages: the chain elects it only for user
      // rows whose durable source carries a browser prompt identity.
      ctx.slots.inject('conversation.chat.user.before', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.user.before',
            id: 'conversation-retry-edit',
            order: 10,
            locale: NS,
            select: (owner) => {
              if (owner === undefined || owner === null || owner.kind !== 'user') return null
              const source = owner.source
              if (source === null || typeof source !== 'object') return null
              const rpcId = source.rpcId
              return typeof rpcId === 'string' && rpcId !== '' ? { rpcId } : null
            },
          },
          UserMessageEdit,
        ),
      )

      // One frame-wide dialog; the edit target lives in the shared store above.
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'conversation-retry-dialog', order: 60, locale: NS }, EditDialog),
      )

      // Retry sits in the native assistant action strip, beside copy and branch.
      ctx.slots.inject('conversation.chat.assistant-actions', () =>
        ctx.slots.register(
          { name: 'conversation.chat.assistant-actions', id: 'conversation-retry', order: 20, locale: NS },
          RetryAction,
        ),
      )
    }

    return { inject: ['slots', 'locale', 'sessions', 'uiWorkspace'], apply }
  },
})
