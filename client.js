/**
 * Browser half of the conversation-retry bundle.
 *
 * Three actions, all built on the shipped fork primitive
 * (`ctx.sessions.fork` cuts an exact inclusive event-sequence prefix) plus
 * `SessionBinding.session.prompt` into the child:
 *
 *   Edit (on your own message)
 *       Rewrite a prompt you already sent and re-run from there. The child
 *       keeps everything before that message, so the old answer and everything
 *       after it are gone from its history — a branch, not an append.
 *   Retry (on a completed turn)
 *       Re-send that turn's prompt unchanged and let the model answer again.
 *   Branch (on a completed turn)
 *       Fork a new session that keeps the turn, for any turn — including older
 *       ones the shipped footer branch icon disables once later turns exist.
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

    /** Client root context, captured by `apply`. */
    let client = null

    const en = {
      'edit.action': 'Edit',
      'edit.actionTitle': 'Edit this message and re-run from here',
      'edit.title': 'Edit your message',
      'edit.hint': 'Sending forks a new session that keeps everything before this message. The original conversation is untouched.',
      'edit.send': 'Fork and send',
      'edit.cancel': 'Cancel',
      'retry.action': 'Retry',
      'retry.actionTitle': 'Ask this turn again on a history without it',
      'branch.action': 'Branch',
      'branch.actionTitle': 'Fork a new session that keeps this turn',
      'error.noPrompt': 'This turn has no prompt to retry',
      'error.noTurn': 'This turn is not in the loaded history',
      'error.empty': 'Write something first',
    }

    const zh = {
      'edit.action': '编辑',
      'edit.actionTitle': '编辑这条消息，从这里重新开始',
      'edit.title': '编辑你的消息',
      'edit.hint': '发送后会分叉出一个新会话，保留这条消息之前的全部内容；原来的对话不受影响。',
      'edit.send': '分叉并发送',
      'edit.cancel': '取消',
      'retry.action': '重试',
      'retry.actionTitle': '在一个不含这一轮的历史上重新提问',
      'branch.action': '分支',
      'branch.actionTitle': '分叉出一个保留这一轮的新会话',
      'error.noPrompt': '这一轮没有可以重试的提问',
      'error.noTurn': '这一轮不在已加载的历史里',
      'error.empty': '先写点内容',
    }

    const ICON_PATHS = {
      edit: ['M10.6 2.6 13.4 5.4 6.2 12.6 2.9 13.1 3.4 9.8z'],
      retry: ['M13.5 8a5.5 5.5 0 1 1-1.9-4.16', 'M13.6 2.2v3.1h-3.1'],
      branch: ['M4 2.6v10.8', 'M4 6.4h3.9a3 3 0 0 1 3 3v4', 'M4 2.6a1.3 1.3 0 1 1 0 .01'],
    }

    const styles = {
      row: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
      },
      button: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '26px',
        padding: '0 8px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '8px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: '18px',
        cursor: 'pointer',
      },
      buttonBusy: { cursor: 'default', opacity: 0.55 },
      iconOnly: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '26px',
        height: '26px',
        padding: 0,
        border: '0.5px solid transparent',
        borderRadius: '8px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, inherit))',
        cursor: 'pointer',
      },
      icon: { width: '13px', height: '13px', flex: 'none', display: 'block' },
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
      primary: {
        borderColor: 'transparent',
        background: 'var(--dsw-alias-brand-primary, #247bbf)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      },
      error: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    }

    /** One 13px stroked glyph, inheriting the button color. */
    function glyph(paths) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 13,
          height: 13,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: styles.icon,
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )
    }

    const ICONS = {
      edit: glyph(ICON_PATHS.edit),
      retry: glyph(ICON_PATHS.retry),
      branch: glyph(ICON_PATHS.branch),
    }

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

    /** The `turn/start` event of one turn, when the loaded window contains it. */
    function turnStartOf(events, turnNumber) {
      for (const event of events) {
        if (event.type === 'turn/start' && event.data !== undefined && event.data.turn === turnNumber) return event
      }
      return undefined
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
     * carries, so an edit affordance can act on the exact message it decorates.
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
     * The prompt a turn was opened with: the first `user/message` after its
     * `turn/start`, before the first step or the turn's close.
     */
    function promptTextFor(sessionId, turnNumber) {
      const events = eventsOf(sessionId)
      const start = turnStartOf(events, turnNumber)
      if (start === undefined) return ''
      const index = events.indexOf(start)
      for (let cursor = index + 1; cursor < events.length; cursor += 1) {
        const event = events[cursor]
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
     * Fork `sessionId` at an exact inclusive boundary and open the child.
     * @param sessionId - source session.
     * @param atSeq - last event sequence the child keeps.
     * @returns the catalogued child identity.
     */
    async function forkChild(sessionId, atSeq) {
      const childId = await client.sessions.fork({
        sessionId,
        ...(atSeq === undefined ? {} : { atSeq }),
        increaseTitle: true,
      })
      // Retains the child as the main view, so it outlives this call.
      client.uiWorkspace.openSession(childId)
      return childId
    }

    /**
     * Fork before an event and send a prompt into the child, so the answer is
     * produced on a history that does not contain the replaced turn.
     * @param sessionId - source session.
     * @param atSeq - last event sequence the child keeps.
     * @param text - prompt text to send.
     */
    async function forkAndPrompt(sessionId, atSeq, text) {
      const childId = await forkChild(sessionId, atSeq)
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

    // --- components ----------------------------------------------------------

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

      const open = () => {
        publishEdit({ sessionId, seq: target.seq, draft: target.text, busy: false, error: null })
      }

      return h(
        'button',
        {
          type: 'button',
          title: translate('edit.actionTitle'),
          'aria-label': translate('edit.actionTitle'),
          onClick: open,
          style: styles.iconOnly,
        },
        ICONS.edit,
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
        } catch (failure) {
          patch({ busy: false, error: describeError(failure) })
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
              { type: 'button', onClick: close, disabled: state.busy === true, style: styles.button },
              translate('edit.cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: submit,
                disabled: state.busy === true || state.draft.trim() === '',
                style: { ...styles.button, ...styles.primary, ...(state.busy === true ? styles.buttonBusy : {}) },
              },
              translate('edit.send'),
            ),
          ),
        ),
      )
    }

    /**
     * Retry and branch actions for one completed turn.
     * @param props - turn owner props and the standard `sessionId`.
     */
    function TurnActions(props) {
      const translate = translatorOf(props)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      const sessionId = props.sessionId
      const turn = props.turn
      const seq = props.seq
      const turnNumber = turn !== undefined && turn !== null && typeof turn.turn === 'number' ? turn.turn : undefined
      const startSeq = turn !== undefined && turn !== null && turn.start !== undefined ? turn.start.seq : undefined
      const canRetry = sessionId !== undefined && turnNumber !== undefined && typeof startSeq === 'number' && startSeq > 1
      const canBranch = sessionId !== undefined && typeof seq === 'number' && seq > 0

      if (!canRetry && !canBranch) return null

      const run = async (operation) => {
        setBusy(true)
        setError(null)
        try {
          await operation()
        } catch (failure) {
          setError(describeError(failure))
        } finally {
          setBusy(false)
        }
      }

      const onRetry = () => {
        const text = promptTextFor(sessionId, turnNumber)
        if (text === '') {
          setError(translate('error.noPrompt'))
          return
        }
        run(() => forkAndPrompt(sessionId, Math.max(1, startSeq - 1), text))
      }

      const onBranch = () => run(() => forkChild(sessionId, seq))

      const button = (key, label, title, icon, onClick) =>
        h(
          'button',
          {
            key,
            type: 'button',
            title,
            'aria-label': title,
            onClick,
            disabled: busy,
            style: busy ? { ...styles.button, ...styles.buttonBusy } : styles.button,
          },
          icon,
          h('span', null, label),
        )

      const buttons = []
      if (canRetry) buttons.push(button('retry', translate('retry.action'), translate('retry.actionTitle'), ICONS.retry, onRetry))
      if (canBranch) buttons.push(button('branch', translate('branch.action'), translate('branch.actionTitle'), ICONS.branch, onBranch))

      return h(
        React.Fragment,
        null,
        h('div', { style: { ...styles.row, margin: '2px 0 6px' } }, buttons),
        error === null ? null : h('div', { style: { ...styles.error, marginBottom: '6px' }, role: 'status' }, error),
      )
    }

    // --- plugin --------------------------------------------------------------

    /**
     * Client plugin body: dictionaries, the message edit affordance, the edit
     * dialog, and the per-turn retry/branch actions.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      client = ctx
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'conversation-retry: dictionaries')

      // Presence marker: lets an operator confirm this module is live in the
      // page without touching the UI. Guarded because a hot-replaced generation
      // may still hold the name.
      try {
        ctx.provide('conversationRetry', {
          version: '0.2.0',
          openEdit: (sessionId, seq, draft) => publishEdit({ sessionId, seq, draft, busy: false, error: null }),
        })
      } catch (conflict) {
        /* an earlier generation of this plugin still owns the name */
      }

      // Edit affordance on your own messages: the chain elects it only for user
      // rows whose source carries a browser prompt identity.
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
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'conversation-retry-dialog',
            order: 60,
            locale: NS,
          },
          EditDialog,
        ),
      )

      // Retry and branch on every completed turn.
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'conversation-retry',
            order: 20,
            locale: NS,
          },
          TurnActions,
        ),
      )
    }

    return { inject: ['slots', 'locale', 'sessions', 'uiWorkspace'], apply }
  },
})
