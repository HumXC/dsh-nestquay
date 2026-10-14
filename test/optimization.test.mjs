import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const source = await readFile(new URL('../src/client.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(`${source}\nexport const probe = { dispatch, subscribeView, selectGroupRoots, sameGroupRoots, selectGroupActivity, sameGroupActivity, selectGroupCounts, sameGroupCounts, Footer, GroupDialogs, read: () => ({ snapshot, failure, viewRevision }), setData: (value) => { snapshot = value; } };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture() {
    const replies = [], cleanups = [];
    const element = (type, props) => ({ type, props });
    const react = {
        createContext: () => ({ Provider: 'Provider' }),
        useSyncExternalStore(subscribe, getSnapshot) { cleanups.push(subscribe(() => {})); return getSnapshot(); },
        useState: value => [value, () => {}],
        useEffect(callback) { const dispose = callback(); if (dispose) cleanups.push(dispose); },
    };
    const context = {
        exports: {}, makeWorkspaceBrowser: () => 'Browser',
        require(name) {
            if (name === 'react') return react;
            if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
            if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
            throw new Error(`Unexpected dependency: ${name}`);
        },
        async fetch() {
            assert.ok(replies.length, 'fixture must provide every response');
            const reply = replies.shift();
            return { ok: !reply.error, json: async () => structuredClone(reply) };
        },
    };
    vm.runInNewContext(code, context);
    return { probe: context.exports.probe, replies, cleanups };
}
const metadata = () => ({ revision: 0, mode: 'groups', groups: [{ id: 'a' }, { id: 'b' }], workspaceGroups: { w: ['a', 'b'] } });

test('unchanged and stale replies preserve snapshot identity; error recovery still notifies', async () => {
    const { probe, replies } = fixture();
    let updates = 0;
    const unsubscribe = probe.subscribeView(() => updates++);
    const call = async reply => { replies.push(reply); return probe.dispatch({ action: 'list' }); };
    await call(metadata());
    assert.equal(updates, 1);
    const initial = probe.read().snapshot;
    await call(metadata());
    assert.equal(updates, 1);
    assert.equal(probe.read().snapshot, initial);
    await call({ ...metadata(), revision: 1 });
    assert.equal(updates, 2);
    const latest = probe.read().snapshot;
    await call(metadata());
    assert.equal(updates, 2);
    assert.equal(probe.read().snapshot, latest);
    replies.push({ error: 'Network fixture failure' });
    await assert.rejects(probe.dispatch({ action: 'list' }), /Network fixture failure/);
    assert.equal(updates, 3);
    assert.equal(probe.read().failure, 'Network fixture failure');
    await call({ ...metadata(), revision: 1 });
    assert.equal(updates, 4, 'unchanged successful data must clear a visible error');
    assert.equal(probe.read().snapshot, latest);
    assert.equal(probe.read().failure, '');
    await call({ ...metadata(), revision: 1 });
    assert.equal(updates, 4);
    unsubscribe();
    await call({ ...metadata(), revision: 2 });
    assert.equal(updates, 4);
});

test('workspace selector ignores unrelated rows, names and ordering but tracks explicit membership', () => {
    const { probe } = fixture();
    const data = metadata();
    const rows = [{ workspaceId: 'w', name: 'Original', sessionIds: ['parent', 'parent'] }, { workspaceId: 'outside', sessionIds: ['other'] }];
    const roots = probe.selectGroupRoots(data, rows);
    assert.deepEqual([...roots.get('a')], ['parent']);
    assert.deepEqual([...roots.get('b')], ['parent']);
    const unrelated = probe.selectGroupRoots(data, [{ workspaceId: 'outside', sessionIds: ['other', 'new'] }, { ...rows[0], name: 'Renamed' }]);
    assert.equal(probe.sameGroupRoots(roots, unrelated), true);
    assert.equal(probe.sameGroupRoots(roots, probe.selectGroupRoots(data, [{ ...rows[0], sessionIds: ['parent', 'second'] }])), false);
    const removed = probe.selectGroupRoots({ ...data, workspaceGroups: { w: ['b'] } }, rows);
    assert.equal(probe.sameGroupRoots(roots, removed), false);
    assert.equal(removed.get('a').length, 0);
});

test('session selector tracks running fallbacks and lineage, ignoring unrelated sessions and projection content', () => {
    const { probe } = fixture();
    const roots = probe.selectGroupRoots(metadata(), [{ workspaceId: 'w', sessionIds: ['parent', 'child'] }]);
    const sessions = { byId: { parent: { running: true }, child: { running: false }, other: { running: false } }, projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child', name: 'Initial' }], unrelated: 'first' } } } };
    const selected = probe.selectGroupActivity(roots, sessions);
    assert.equal(selected.get('a').size, 2, 'a child also present in the workspace must not be double-counted');
    const irrelevant = probe.selectGroupActivity(roots, { ...sessions, ids: ['other'], byId: { ...sessions.byId, other: { running: true } }, projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child', name: 'Renamed' }], unrelated: 'next' } } } });
    assert.equal(probe.sameGroupActivity(selected, irrelevant), true);
    const running = probe.selectGroupActivity(roots, { ...sessions, byId: { ...sessions.byId, child: { running: true } } });
    assert.equal(probe.sameGroupActivity(selected, running), false);
    const lineage = probe.selectGroupActivity(roots, { ...sessions, projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child' }, { id: 'new-child' }] } } } });
    assert.equal(probe.sameGroupActivity(selected, lineage), false);
    assert.equal(lineage.get('b').has('new-child'), true);
});

test('status selector ignores unrelated updates and equivalent requests; running, waiting and unread counts remain live', () => {
    const { probe } = fixture();
    const roots = probe.selectGroupRoots(metadata(), [{ workspaceId: 'w', sessionIds: ['parent'] }]);
    const activity = probe.selectGroupActivity(roots, { byId: { parent: { running: true }, child: { running: true } }, projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child' }] } } } });
    const statuses = new Map([['parent', { running: false }], ['child', { running: undefined, pendingInteraction: { key: 'first' }, completionUnread: true }]]);
    const selected = probe.selectGroupCounts(activity, statuses);
    assert.deepEqual(JSON.parse(JSON.stringify(selected.get('a'))), { running: 1, pending: 1, unread: 1 });
    const irrelevant = probe.selectGroupCounts(activity, new Map([...statuses, ['outside', { running: true, pendingInteraction: {}, completionUnread: true }], ['child', { running: undefined, pendingInteraction: { key: 'replacement' }, completionUnread: true }]]));
    assert.equal(probe.sameGroupCounts(selected, irrelevant), true);
    for (const next of [
        { running: false, pendingInteraction: {}, completionUnread: true },
        { running: undefined, completionUnread: true },
        { running: undefined, pendingInteraction: {}, completionUnread: false },
    ]) assert.equal(probe.sameGroupCounts(selected, probe.selectGroupCounts(activity, new Map([...statuses, ['child', next]]))), false);
});

test('inactive footer never invokes workspace/session hooks; active footer mounts its child', () => {
    const { probe } = fixture();
    const forbidden = () => { throw new Error('Inactive footer subscribed'); };
    const props = { wide: true, useWorkspaces: forbidden, useSessions: forbidden, useSessionStatus: forbidden };
    assert.equal(probe.Footer(props), null);
    probe.setData({ ...metadata(), mode: 'workspaces' });
    assert.equal(probe.Footer(props), null);
    probe.setData(metadata());
    assert.equal(probe.Footer({ ...props, wide: false }), null);
    const rendered = probe.Footer(props);
    assert.equal(rendered.type.name, 'GroupFooter');
    assert.equal(rendered.props.data, probe.read().snapshot);
});

test('group dialogs use one metadata subscription and release it on unmount', () => {
    const { probe, cleanups } = fixture();
    probe.GroupDialogs();
    assert.equal(cleanups.length, 1, 'one uSES subscription, without a duplicate effect listener');
    cleanups.forEach(dispose => dispose());
});
