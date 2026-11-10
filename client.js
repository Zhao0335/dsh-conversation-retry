/**
 * Browser half of the conversation-retry bundle.
 *
 * Adds three per-turn actions to every completed turn of the Chat view:
 *
 *   Retry            fork the session just before the turn, then send the
 *                    turn's own prompt again — a real regeneration instead of
 *                    appending another message to the same history.
 *   Edit & resend    the same fork, but send an edited prompt.
 *   Branch           fork a new session that keeps this turn and everything
 *                    before it, so both endings stay explorable.
 *
 * Every action is built on the shipped primitives: `ctx.sessions.fork` cuts an
 * exact inclusive event-sequence prefix, and `SessionBinding.session.prompt`
 * sends the prompt into the child. No Host half is involved.
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

    const en = {
      'action.retry': 'Retry',
      'action.retryTitle': 'Fork this session before the turn and ask the same prompt again',
      'action.edit': 'Edit & resend',
      'action.editTitle': 'Fork this session before the turn and send an edited prompt',
      'action.branch': 'Branch',
      'action.branchTitle': 'Fork a new session that keeps this turn',
      'edit.title': 'Edit the prompt',
      'edit.send': 'Fork and send',
      'edit.cancel': 'Cancel',
      'edit.hint': 'The new session keeps everything before this turn.',
      'error.generic': 'Could not fork this session',
      'error.noPrompt': 'This turn has no prompt to retry',
      'error.noTurn': 'This turn is not in the loaded history',
      'error.rejected': 'The prompt was not accepted',
    }

    const zh = {
      'action.retry': '重试',
      'action.retryTitle': '在这一轮之前分叉出新会话，重新发送同样的提问',
      'action.edit': '编辑重发',
      'action.editTitle': '在这一轮之前分叉出新会话，发送修改后的提问',
      'action.branch': '分支',
      'action.branchTitle': '分叉出一个保留这一轮的新会话',
      'edit.title': '编辑提问',
      'edit.send': '分叉并发送',
      'edit.cancel': '取消',
      'edit.hint': '新会话会保留这一轮之前的全部内容。',
      'error.generic': '分叉这个会话失败',
      'error.noPrompt': '这一轮没有可以重试的提问',
      'error.noTurn': '这一轮不在已加载的历史里',
      'error.rejected': '提问没有被接受',
    }

    const styles = {
      row: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
        margin: '2px 0 6px',
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
        transition: 'background-color .12s, color .12s, border-color .12s',
      },
      buttonBusy: {
        cursor: 'default',
        opacity: 0.55,
      },
      icon: {
        width: '13px',
        height: '13px',
        flex: 'none',
        display: 'block',
      },
      panel: {
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        margin: '2px 0 8px',
        padding: '10px 12px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1, transparent)',
      },
      panelTitle: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary, inherit))',
      },
      textarea: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '72px',
        maxHeight: '240px',
        padding: '8px 10px',
        border: '0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-base, transparent)',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        resize: 'vertical',
      },
      panelActions: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '6px',
      },
      primary: {
        borderColor: 'transparent',
        background: 'var(--dsw-alias-brand-primary, #247bbf)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      },
      error: {
        width: '100%',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-state-error-primary, #c0392b)',
      },
    }

    /** One 13px stroked glyph, inheriting the button color. */
    function icon(paths) {
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
      retry: icon(['M13.5 8a5.5 5.5 0 1 1-1.9-4.16', 'M13.6 2.2v3.1h-3.1']),
      edit: icon(['M10.6 2.6 13.4 5.4 6.2 12.6 2.9 13.1 3.4 9.8z']),
      branch: icon(['M4 2.2v11.6', 'M4 6.2h4.2a3 3 0 0 1 3 3v4.6', 'M4 2.2a1.4 1.4 0 1 1 0 0.01']),
    }

    // --- session log readers -------------------------------------------------

    /** Durable events of one retained Session, in sequence order. */
    function eventsOf(ctx, sessionId) {
      const binding = ctx.sessions.binding(sessionId)
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
     * The prompt this turn was opened with: the first `user/message` event after
     * its `turn/start`, before the first step or the turn's close.
     */
    function promptTextFor(events, turnNumber) {
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
     * @param ctx - client root context.
     * @param sessionId - source session.
     * @param atSeq - last event sequence the child keeps.
     * @returns the catalogued child identity.
     */
    async function forkChild(ctx, sessionId, atSeq) {
      const childId = await ctx.sessions.fork({
        sessionId,
        ...(atSeq === undefined ? {} : { atSeq }),
        increaseTitle: true,
      })
      // Retains the child as the main view, so it outlives this call.
      ctx.uiWorkspace.openSession(childId)
      return childId
    }

    /**
     * Fork before a turn and send a prompt into the child, so the answer is
     * regenerated on a history that does not contain the old turn.
     * @param ctx - client root context.
     * @param sessionId - source session.
     * @param turnNumber - turn to re-ask.
     * @param text - prompt text to send.
     */
    async function forkAndPrompt(ctx, sessionId, turnNumber, text) {
      const start = turnStartOf(eventsOf(ctx, sessionId), turnNumber)
      if (start === undefined) throw new Error('turn-not-loaded')
      const atSeq = Math.max(1, start.seq - 1)
      const childId = await forkChild(ctx, sessionId, atSeq)
      await ctx.sessions.using(childId, { source: SOURCE }, async (reference) => {
        await reference.ready
        const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
        if (result !== null && typeof result === 'object' && result.ok === false) {
          throw new Error(describeError(result.error))
        }
      })
      return childId
    }

    // --- component -----------------------------------------------------------

    /**
     * The per-turn action row, rendered before a completed turn's own actions.
     * @param props - turn owner props, injected actions and the locale translator.
     */
    function TurnActions(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => (en[key] !== undefined ? en[key] : key)
      const turn = props.turn
      const seq = props.seq
      const [busy, setBusy] = React.useState(false)
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [error, setError] = React.useState(null)

      const turnNumber = turn !== undefined && turn !== null && typeof turn.turn === 'number' ? turn.turn : undefined
      const startSeq = turn !== undefined && turn !== null && turn.start !== undefined ? turn.start.seq : undefined
      const canRetry =
        turnNumber !== undefined &&
        typeof startSeq === 'number' &&
        startSeq > 1 &&
        typeof props.promptOf === 'function' &&
        typeof props.retry === 'function'
      const canBranch = typeof seq === 'number' && seq > 0 && typeof props.branch === 'function'

      if (!canRetry && !canBranch) return null

      const run = async (operation) => {
        setBusy(true)
        setError(null)
        try {
          await operation()
          setEditing(false)
        } catch (failure) {
          setError(describeError(failure))
        } finally {
          setBusy(false)
        }
      }

      const onRetry = () => {
        const text = props.promptOf(turnNumber)
        if (text === '') {
          setError(t('error.noPrompt'))
          return
        }
        run(() => props.retry(turnNumber, text))
      }

      const onStartEdit = () => {
        setError(null)
        setDraft(props.promptOf(turnNumber))
        setEditing(true)
      }

      const onSubmitEdit = () => {
        const text = draft.trim()
        if (text === '') return
        run(() => props.retry(turnNumber, text))
      }

      const onBranch = () => run(() => props.branch(seq))

      const button = (key, label, title, glyph, onClick, disabled) =>
        h(
          'button',
          {
            key,
            type: 'button',
            title,
            'aria-label': title,
            onClick,
            disabled: disabled === true,
            style: disabled === true ? { ...styles.button, ...styles.buttonBusy } : styles.button,
          },
          glyph,
          h('span', null, label),
        )

      const children = []
      if (canRetry) {
        children.push(button('retry', t('action.retry'), t('action.retryTitle'), ICONS.retry, onRetry, busy))
        children.push(button('edit', t('action.edit'), t('action.editTitle'), ICONS.edit, onStartEdit, busy))
      }
      if (canBranch) {
        children.push(button('branch', t('action.branch'), t('action.branchTitle'), ICONS.branch, onBranch, busy))
      }

      const rows = [h('div', { key: 'row', style: styles.row }, children)]

      if (editing) {
        rows.push(
          h(
            'div',
            { key: 'panel', style: styles.panel },
            h('div', { style: styles.panelTitle }, t('edit.title')),
            h('textarea', {
              style: styles.textarea,
              value: draft,
              rows: 3,
              'aria-label': t('edit.title'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  onSubmitEdit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditing(false)
                }
              },
            }),
            h('div', { style: styles.panelTitle }, t('edit.hint')),
            h(
              'div',
              { style: styles.panelActions },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setEditing(false),
                  disabled: busy,
                  style: styles.button,
                },
                t('edit.cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: onSubmitEdit,
                  disabled: busy || draft.trim() === '',
                  style: { ...styles.button, ...styles.primary, ...(busy ? styles.buttonBusy : {}) },
                },
                t('edit.send'),
              ),
            ),
          ),
        )
      }

      if (error !== null) {
        rows.push(h('div', { key: 'error', style: styles.error, role: 'status' }, error))
      }

      return h(React.Fragment, null, rows)
    }

    // --- plugin --------------------------------------------------------------

    /**
     * Client plugin body: dictionaries plus the per-turn action entry.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'conversation-retry: dictionaries')

      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'conversation-retry',
            order: 20,
            locale: NS,
            inject: (sessionId) => ({
              promptOf: (turnNumber) => promptTextFor(eventsOf(ctx, sessionId), turnNumber),
              retry: (turnNumber, text) => forkAndPrompt(ctx, sessionId, turnNumber, text),
              branch: (atSeq) => forkChild(ctx, sessionId, atSeq),
            }),
          },
          TurnActions,
        ),
      )
    }

    return { inject: ['slots', 'locale', 'sessions', 'uiWorkspace'], apply }
  },
})
