/**
 * Record a durable subagent model-selection policy on every new Session.
 *
 * `@deepseek-ai/dsh-tool-subagent` reads the policy from a session projection
 * (`subagentModelSelectionPolicy`, stateVersion 1, init `null`) folded from the
 * `subagent/model-selection-policy` event. Nothing in the shipped Harness
 * appends that event, so without this row a child LLM route must equal the
 * parent's:
 *
 *   child LLM route "…" is not allowed for this Session;
 *   without a recorded model-selection policy, explicit selection is limited
 *   to the parent route
 *
 * The event type is registered (persistence schema, `surface: false`), so
 * appending it is not a new event type and cannot break reopening the Session.
 *
 * @module dsh-wishcoder-devteam/route-policy
 */
import z from '@deepseek-ai/schemastery'

/** Route allowlist recorded on every Session. */
export const Config = z.object({
  provider: z.string().default('dsh-opencode-go'),
  models: z.array(z.string()).default(['deepseek-v4-pro', 'deepseek-v4.1-flash']),
})

export const inject = ['sessions']

/** Registered event type that carries the durable allowlist. */
const POLICY_EVENT = 'subagent/model-selection-policy'

/**
 * @param ctx - Host plugin context.
 * @param config - Resolved row configuration.
 */
export function apply(ctx, config) {
  const provider = String(config?.provider ?? '').trim()
  const models = [...new Set((config?.models ?? []).map((model) => String(model).trim()).filter(Boolean))]
  if (provider.length === 0 || models.length === 0) {
    ctx.logger.warn('subagent-route-policy: empty provider or model list; no policy recorded')
    return
  }
  const allowedModels = Object.freeze(models.map((model) => ({ provider, model })))

  ctx.on('session/created', (session) => {
    // A Session stays read-only throughout the synchronous creation dispatch;
    // its appends only open after the announcement completes, so defer by one
    // microtask instead of writing inside the listener.
    queueMicrotask(() => record(ctx, session, allowedModels))
  })

  // A Session that already existed when this row loaded never sees
  // `session/created` again, so load-time Sessions are backfilled once here.
  for (const session of ctx.sessions.list()) queueMicrotask(() => record(ctx, session, allowedModels))
}

/**
 * Append the policy once per Session that does not already carry one.
 * @param ctx - Host plugin context, used only for diagnostics.
 * @param session - Session announced by `session/created`.
 * @param allowedModels - Validated routes from the row configuration.
 */
function record(ctx, session, allowedModels) {
  try {
    // The synchronous full-log read is deprecated for new code, but it is the
    // only way to tell a resumed Session (policy already logged) from a fresh
    // one before appending a second, ignored event.
    if (session.snapshotEvents().some((event) => event.type === POLICY_EVENT)) return
    session.append(POLICY_EVENT, { allowedModels })
  } catch (error) {
    // A Session disposed before the microtask, or a rejected payload, must not
    // break the turn that created it.
    ctx.logger.warn(`subagent-route-policy: session ${String(session.id)}: ${String(error)}`)
  }
}
