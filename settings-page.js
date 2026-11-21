/**
 * Host half of the DevTeam model-allow-list settings page.
 *
 * The page itself lives in `client.js`; the browser half is discovered from the
 * `dsh.client` declaration in this package's `package.json`. The namespace it
 * edits — `subagent-model-selection` — is owned by
 * `@deepseek-ai/dsh-tool-subagent/model-selection-settings` (the `subagent-model-selection-settings`
 * row in `cordis.patch.yml`), so this package registers no namespace of its own
 * and holds no host-side state.
 */

/** Host plugin body — present so the Loader holds a row the client bundle rides on. */
export function apply() {}
