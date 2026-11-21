/**
 * Browser half of the DevTeam model allow-list page (Plugins → Subagent model).
 *
 * It edits the `subagent-model-selection` namespace that
 * `@deepseek-ai/dsh-tool-subagent/model-selection-settings` owns, through
 * `ctx.configForms`, and carries the usage notes on the same page — the page is
 * where the value is set, so that is where people look when they forget how to
 * call it.
 */

window.__ModuleLoader__.load({
  id: 'dsh-wishcoder-devteam',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useSyncExternalStore } = React;

    /** Host settings namespace owned by the delegation settings plugin. */
    const NS = 'subagent-model-selection';
    /** Locale namespace for this page's own copy. */
    const TEXT_NS = 'devteam.routePolicy';

    const COPY = {
      zh: {
        title: '子代理模型白名单',
        summary: '允许子代理使用哪些模型路由',
        intro: '默认情况下子代理只能继承主会话的模型。这里登记的路由，可以让 subagent 调用显式换一个模型。',
        howTitle: '怎么用',
        how: [
          '主会话判愿、写 SPEC 和验收脚本，再派一个指定模型的子代理去实现。',
          '在 subagent 调用里同时传 provider 与 model（例如 provider: dsh-opencode-go、model: deepseek-v4.1-flash）；三个都不传表示继承主会话。',
          '三次不绿就收回主会话自己改 —— 换模型不改变"验收脚本说了算"。',
          '保存后对之后新建的会话生效；已建立的会话保留它创建时拿到的白名单。',
        ],
        enabled: '启用模型选择',
        routes: '允许的路由',
        provider: 'provider',
        model: 'model',
        add: '添加',
        remove: '删除',
        save: '保存',
        saving: '正在保存…',
        reset: '还原',
        saved: '已保存，新会话生效。',
        refused: 'Host 拒绝了这次写入（值不合法，或被更高层配置锁定）。',
        unavailable: 'Host 没有提供这个命名空间（未装配 model-selection-settings 行）。',
        loading: '读取中…',
        readonly: '当前 profile 不接受写入。',
        empty: '还没有登记任何路由。',
        needOne: '启用时至少要有一条路由。',
        badRoute: 'provider 和 model 都不能为空。',
        duplicate: '这条路由已经在列表里了。',
      },
      en: {
        title: 'Subagent model allow-list',
        summary: 'Which model routes a subagent may use',
        intro: 'By default a subagent inherits the main session model. Routes listed here let a subagent call name a different model explicitly.',
        howTitle: 'How to use it',
        how: [
          'The main session judges the wish, writes the SPEC and the acceptance script, then delegates to a subagent on a chosen model.',
          'Pass provider and model together in the subagent call (e.g. provider: dsh-opencode-go, model: deepseek-v4.1-flash); passing none inherits the main session.',
          'After three failed rounds, take the work back — a different model never overrules the acceptance script.',
          'A save applies to sessions created afterwards; existing sessions keep the allow-list they were created with.',
        ],
        enabled: 'Enable model selection',
        routes: 'Allowed routes',
        provider: 'provider',
        model: 'model',
        add: 'Add',
        remove: 'Remove',
        save: 'Save',
        saving: 'Saving…',
        reset: 'Revert',
        saved: 'Saved. Applies to new sessions.',
        refused: 'The Host refused this write (invalid value, or overridden by a higher configuration layer).',
        unavailable: 'The Host does not serve this namespace (the model-selection-settings row is not composed).',
        loading: 'Loading…',
        readonly: 'This profile does not accept writes.',
        empty: 'No route registered yet.',
        needOne: 'Enable needs at least one route.',
        badRoute: 'Provider and model are both required.',
        duplicate: 'That route is already listed.',
      },
    };

    /** Shared control styles; every colour inherits the host theme. */
    const S = {
      section: { display: 'flex', flexDirection: 'column', gap: '12px' },
      note: {
        margin: 0, fontSize: '13px', lineHeight: '1.6',
        color: 'var(--dsw-alias-text-secondary, #57606a)',
      },
      heading: { margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-text-primary, #1f2328)' },
      row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
      th: {
        textAlign: 'left', padding: '6px 8px', fontWeight: 600,
        color: 'var(--dsw-alias-text-secondary, #57606a)',
        borderBottom: '1px solid var(--dsw-alias-border-subtle, #d0d7de)',
      },
      td: {
        padding: '6px 8px', color: 'var(--dsw-alias-text-primary, #1f2328)',
        borderBottom: '1px solid var(--dsw-alias-border-subtle, #d0d7de)',
      },
      input: {
        padding: '4px 8px', fontSize: '13px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-default, #d0d7de)',
        background: 'var(--dsw-alias-bg-default, #ffffff)',
        color: 'var(--dsw-alias-text-primary, #1f2328)',
        minWidth: '180px',
      },
      button: {
        padding: '4px 12px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-default, #d0d7de)',
        background: 'var(--dsw-alias-bg-subtle, #f6f8fa)',
        color: 'var(--dsw-alias-text-primary, #1f2328)',
      },
      primary: {
        padding: '4px 14px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-accent-emphasis, #1f6feb)',
        background: 'var(--dsw-alias-accent-emphasis, #1f6feb)',
        color: '#ffffff',
      },
      ok: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-success-fg, #1a7f37)' },
      bad: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-danger-fg, #cf222e)' },
    };

    /**
     * Normalise a namespace value into the draft shape this page edits.
     * @param value - the resolved `subagent-model-selection` section.
     */
    function fromValue(value) {
      const enabled = !!(value && value.enabled);
      const list = value && Array.isArray(value.allowedModels) ? value.allowedModels : [];
      const routes = list
        .filter(route => route && typeof route.provider === 'string' && typeof route.model === 'string')
        .map(route => ({ provider: route.provider, model: route.model }));
      return { enabled, routes };
    }

    /**
     * Build the page component for one config form.
     * @param form - the `subagent-model-selection` config form.
     * @param t - bound locale function.
     */
    function makePage(form, t) {
      function ModelAllowListPage(props) {
        const snapshot = useSyncExternalStore(
          listener => form.subscribe(listener),
          () => form.getSnapshot(),
        );
        const [draft, setDraft] = useState(() => fromValue(snapshot.value));
        const [pending, setPending] = useState('');
        const [outcome, setOutcome] = useState('');
        const [dirty, setDirty] = useState(false);
        const [newRoute, setNewRoute] = useState({ provider: 'dsh-opencode-go', model: '' });

        // A revision change (someone else wrote, or our own write landed) re-reads
        // the Host value; an unsaved draft is dropped rather than silently kept
        // against a value it was never fenced to.
        useEffect(() => {
          setDraft(fromValue(snapshot.value));
          setDirty(false);
        }, [snapshot.revision, snapshot.status]);

        if (props && props.view === 'summary') return t('summary');

        const editable = snapshot.status === 'ready' && snapshot.writable && !pending;

        function edit(mutator) {
          setDraft(current => mutator(current));
          setDirty(true);
          setOutcome('');
        }

        function addRoute() {
          const provider = newRoute.provider.trim();
          const model = newRoute.model.trim();
          if (!provider || !model) { setOutcome(t('badRoute')); return; }
          if (draft.routes.some(route => route.provider === provider && route.model === model)) {
            setOutcome(t('duplicate'));
            return;
          }
          edit(current => ({ ...current, routes: [...current.routes, { provider, model }] }));
          setNewRoute({ provider, model: '' });
        }

        function removeRoute(index) {
          edit(current => ({ ...current, routes: current.routes.filter((_, i) => i !== index) }));
        }

        async function save() {
          if (draft.enabled && draft.routes.length === 0) { setOutcome(t('needOne')); return; }
          setPending('1');
          setOutcome('');
          try {
            const accepted = await form.mutate([
              { op: 'set', path: ['enabled'], value: draft.enabled },
              { op: 'set', path: ['allowedModels'], value: draft.routes },
            ], snapshot.revision);
            setOutcome(accepted ? 'saved' : 'refused');
            if (accepted) setDirty(false);
          } catch (error) {
            setOutcome('refused');
          } finally {
            setPending('');
          }
        }

        function revert() {
          setDraft(fromValue(snapshot.value));
          setDirty(false);
          setOutcome('');
        }

        const status = snapshot.status;
        const notes = t('how');

        return h('div', { style: S.section },
          h('p', { style: S.note }, t('intro')),

          h('div', { style: S.section },
            h('h3', { style: S.heading }, t('howTitle')),
            h('ol', { style: { ...S.note, paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' } },
              (Array.isArray(notes) ? notes : []).map((line, index) => h('li', { key: index }, line))),
          ),

          status === 'unavailable'
            ? h('p', { style: S.bad }, t('unavailable'))
            : status === 'loading'
              ? h('p', { style: S.note }, t('loading'))
              : null,

          h('label', { style: { ...S.row, cursor: editable ? 'pointer' : 'default' } },
            h('input', {
              type: 'checkbox',
              checked: draft.enabled,
              disabled: !editable,
              onChange: event => edit(current => ({ ...current, enabled: event.target.checked })),
            }),
            h('span', { style: S.heading }, t('enabled')),
          ),

          h('h3', { style: S.heading }, t('routes')),
          draft.routes.length === 0
            ? h('p', { style: S.note }, t('empty'))
            : h('table', { style: S.table },
              h('thead', null,
                h('tr', null,
                  h('th', { style: S.th }, t('provider')),
                  h('th', { style: S.th }, t('model')),
                  h('th', { style: S.th }, ''))),
              h('tbody', null,
                draft.routes.map((route, index) => h('tr', { key: `${route.provider}/${route.model}/${index}` },
                  h('td', { style: S.td }, route.provider),
                  h('td', { style: S.td }, route.model),
                  h('td', { style: { ...S.td, textAlign: 'right' } },
                    h('button', {
                      type: 'button', style: S.button, disabled: !editable,
                      onClick: () => removeRoute(index),
                    }, t('remove'))))))),

          h('div', { style: S.row },
            h('input', {
              style: S.input, value: newRoute.provider, disabled: !editable,
              placeholder: t('provider'), 'aria-label': t('provider'),
              onChange: event => setNewRoute(current => ({ ...current, provider: event.target.value })),
            }),
            h('input', {
              style: S.input, value: newRoute.model, disabled: !editable,
              placeholder: t('model'), 'aria-label': t('model'),
              onChange: event => setNewRoute(current => ({ ...current, model: event.target.value })),
              onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); addRoute() } },
            }),
            h('button', { type: 'button', style: S.button, disabled: !editable, onClick: addRoute }, t('add')),
          ),

          !snapshot.writable && status === 'ready'
            ? h('p', { style: S.note }, t('readonly'))
            : null,

          outcome === 'saved' ? h('p', { style: S.ok }, t('saved')) : null,
          outcome === 'refused' ? h('p', { style: S.bad }, t('refused')) : null,
          outcome === 'needOne' ? h('p', { style: S.bad }, t('needOne')) : null,
          outcome === 'badRoute' ? h('p', { style: S.bad }, t('badRoute')) : null,
          outcome === 'duplicate' ? h('p', { style: S.bad }, t('duplicate')) : null,

          h('div', { style: S.row },
            h('button', {
              type: 'button', style: S.primary, disabled: !editable || !dirty, onClick: save,
            }, pending ? t('saving') : t('save')),
            h('button', {
              type: 'button', style: S.button, disabled: !dirty || !!pending, onClick: revert,
            }, t('reset')),
          ),
        );
      }
      return ModelAllowListPage;
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        let bound = key => (COPY.zh[key] !== undefined ? COPY.zh[key] : key);
        try {
          ctx.effect(() => ctx.locale.register(TEXT_NS, COPY), 'devteam-route-policy: dictionaries');
          bound = ctx.locale.bind(TEXT_NS);
        } catch (error) {
          // Locale service absent: the Chinese copy above stays in use.
        }
        const t = key => bound(key);
        const form = ctx.configForms.get(NS);
        const Page = makePage(form, t);
        // `plugins.bundle.config` is the slot for a bundle's own configuration,
        // keyed by the bundle's package name; `plugins.item` belongs to the
        // official per-namespace settings pages and is not ours to occupy.
        // `plugins.row.config` is the second door: the row's configure control on
        // the same bundle page, keyed `<package name>#<row id>`.
        ctx.effect(
          () => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
            name: 'plugins.bundle.config',
            key: 'dsh-wishcoder-devteam',
          }, Page))),
          'devteam-model-allow-list: bundle page',
        );
        ctx.effect(
          () => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: 'dsh-wishcoder-devteam#devteam-settings',
          }, Page))),
          'devteam-model-allow-list: row page',
        );
      },
    };
  },
});
