/**
 * Host half of the conversation-retry bundle.
 *
 * The feature is entirely browser-side: the Client module (`./client`) adds the
 * per-turn actions and drives `ctx.sessions` / `ctx.uiWorkspace`. This empty
 * `apply` exists so the bundle has a Host row in the Loader composition.
 */
export function apply() {}
