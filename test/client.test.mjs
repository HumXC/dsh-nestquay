import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { resolveDshRoot } from '../scripts/dsh-root.mjs';

const dshRoot = resolveDshRoot();
const installed = createRequire(`${dshRoot}/package.json`);
const { SlotCore } = await import(pathToFileURL(installed.resolve('@deepseek-ai/dsh-client-ui-slots')));
const project = createRequire(new URL('../package.json', import.meta.url));
const ts = project('typescript');
const source = await readFile(new URL('../src/client.tsx', import.meta.url), 'utf8');

// Exercise our registration against the exact native SlotCore. Rendering and
// business controllers are intentionally outside this narrow lifecycle fixture.
for (const delayed of [false, true]) test(`native SlotCore activation, status/search filtering and disposal (${delayed ? 'late official registration' : 'ready official registration'})`, async () => {
    const core = new SlotCore();
    const component = () => null;
    const slot = (kind) => ({ kind, scope: 'root' });
    const declareShell = core.register({ name: 'root', children: {
        'sidebar.workspaces': slot('single'), 'sidebar.footer.action': slot('list'),
    } }, component);
    const childName = 'sidebar.workspaces.session.menu.item';
    const officialStore = () => ({});
    const officialInject = () => ({});
    const mountOfficial = () => core.register({ name: 'sidebar.workspaces', priority: 0, children: {
        [childName]: slot('list'), 'sidebar.workspaces.directoryFlow': slot('single'),
    }, store: officialStore, inject: officialInject, locale: 'workspace' }, component);
    let declareOfficial;
    if (!delayed) declareOfficial = mountOfficial();
    const externalAction = () => null;
    const mountAction = () => core.register({ name: childName, id: 'external', order: 123, inject: officialInject, locale: 'external-action' }, externalAction);
    let removeAction;
    if (!delayed) removeAction = mountAction();
    const exports = {};
    const cleanups = [];
    const context = {
        exports,
        require(name) {
            if (name === 'react') return { createContext: () => ({ Provider: component }) };
            if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
            if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
            throw new Error(`Unexpected fixture dependency: ${name}`);
        },
        makeWorkspaceBrowser: () => component,
        document: { createElement: () => ({ dataset: {}, remove() {} }), head: { append() {}, appendChild() {} } },
        window: { addEventListener() {}, removeEventListener() {} },
        setInterval: () => 1, clearInterval() {},
        fetch: async () => ({ ok: true, json: async () => ({ revision: 0, mode: 'groups', selectedGroupId: 'default', groups: [{ id: 'default', name: '默认', icon: 'folder', workspaceIds: [] }] }) }),
    };
    vm.runInNewContext(ts.transpileModule(`${source}\nexport const inspectPure = { selectGroupRoots, selectGroupActivity, selectGroupCounts, filterSearchSources, membership, groupVisibility };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
    const ctx = {
        effect(callback) { const dispose = callback(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose; },
        slots: {
            entries: (name) => core.entries(name),
            entriesOfSlot: (name) => core.entriesOfSlot(name),
            register: (options, view) => core.register(options, view),
            subscribe: (name, listener) => core.subscribe(name, listener),
            inject(name, callback) { assert.ok(core.spec(name)); const dispose = callback(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose; },
        },
    };
    exports.apply(ctx);
    if (delayed) {
        assert.equal(core.entriesOfSlot('sidebar.workspaces').length, 0);
        declareOfficial = mountOfficial();
        removeAction = mountAction();
    }
    await Promise.resolve(); await Promise.resolve();
    const winner = core.entriesOfSlot('sidebar.workspaces')[0];
    assert.notEqual(winner.component, component, 'native selection must actually shadow priority-0 official view');
    assert.equal(winner.store, officialStore);
    assert.equal(winner.inject, officialInject);
    assert.equal(winner.locale, 'workspace');
    const mirrored = core.entriesOfSlot(`nestquay.${childName}`)[0];
    assert.equal(mirrored.component, externalAction);
    assert.equal(mirrored.options.id, 'external');
    assert.equal(mirrored.options.order, 123);
    assert.equal(mirrored.inject, officialInject);
    assert.equal(mirrored.locale, 'external-action');
    const targetSlot = `nestquay.${childName}`;
    const sibling = () => null;
    const removeSibling = core.register({ name: childName, id: 'sibling', order: 50 }, sibling);
    await new Promise(setImmediate);
    assert.equal(core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'external'), mirrored, 'adding another entry must not recreate an unchanged mirrored entry');
    const siblingMirror = core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'sibling');
    const replacement = () => null;
    const removeReplacement = core.register({ name: childName, id: 'external', priority: -10, order: 42, locale: 'replacement' }, replacement);
    await new Promise(setImmediate);
    assert.equal(core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'sibling'), siblingMirror, 'replacing a contribution preserves unrelated entry identity');
    const updated = core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'external');
    assert.notEqual(updated, mirrored);
    assert.equal(updated.component, replacement);
    assert.equal(updated.options.order, 42);
    assert.equal(updated.locale, 'replacement');
    removeReplacement();
    await new Promise(setImmediate);
    assert.equal(core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'external').component, externalAction);
    assert.equal(core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'sibling'), siblingMirror);
    const restored = core.entriesOfSlot(targetSlot).find(entry => entry.options.id === 'external');
    removeSibling();
    await new Promise(setImmediate);
    assert.equal(core.entriesOfSlot(targetSlot)[0], restored, 'removing another entry must not recreate the surviving entry');
    const sessions = { byId: { parent: { running: true }, child: { running: true } }, projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child' }] } } } };
    const data = { groups: [{ id: 'default' }], workspaceGroups: { workspace: ['default'] }, defaultGroupId: 'default', activeGroupId: 'default', mode: 'groups' };
    const workspaces = [{ workspaceId: 'workspace', sessionIds: ['parent'] }, { workspaceId: 'unassigned', sessionIds: ['other'] }];
    const aggregate = (metadata, statuses) => exports.inspectPure.selectGroupCounts(exports.inspectPure.selectGroupActivity(exports.inspectPure.selectGroupRoots(metadata, workspaces), sessions), statuses).get('default');
    const counts = aggregate(data, new Map([['child', { running: undefined, pendingInteraction: { kind: 'question' }, completionUnread: true }]]));
    assert.deepEqual(JSON.parse(JSON.stringify(counts)), { running: 2, pending: 1, unread: 1 });
    const empty = { ...data, workspaceGroups: {} };
    assert.deepEqual([...exports.inspectPure.membership(empty, '__proto__')], []);
    assert.deepEqual(JSON.parse(JSON.stringify(aggregate(empty, new Map()))), { running: 0, pending: 0, unread: 0 }, 'unassigned workspace activity must not appear on default-group icon');
    const emptyVisibility = exports.inspectPure.groupVisibility(empty, workspaces);
    assert.equal(workspaces.some(emptyVisibility.workspaceVisible), false, 'default group starts empty');
    assert.equal(emptyVisibility.sessionVisible('parent'), false);
    assert.equal(emptyVisibility.sessionVisible('free-session'), false, 'ungrouped sessions stay outside every group');
    assert.equal(emptyVisibility.showUngrouped, false);
    const grouped = exports.inspectPure.groupVisibility(data, workspaces);
    assert.equal(grouped.workspaceVisible(workspaces[0]), true);
    assert.equal(grouped.workspaceVisible(workspaces[1]), false);
    assert.equal(grouped.sessionVisible('parent'), true);
    assert.equal(grouped.sessionVisible('other'), false);
    const official = exports.inspectPure.groupVisibility({ ...empty, mode: 'workspaces' }, workspaces);
    assert.equal(workspaces.every(official.workspaceVisible), true);
    assert.equal(official.sessionVisible('free-session'), true);
    assert.equal(official.showUngrouped, true);
    const ids = [...Array.from({ length: 50 }, (_, index) => `outside-${index}`), 'target'];
    const list = { ids, byId: { target: {}, child: {} } };
    const remote = { items: ids.map((sessionId) => ({ sessionId })), hasMore: false };
    const filtered = exports.inspectPure.filterSearchSources(list, remote, (id) => id === 'target');
    assert.deepEqual([...filtered.list.ids], ['target'], 'selected-group metadata survives the global first-page positions');
    assert.deepEqual(filtered.remote.items.map((item) => item.sessionId), ['target']);
    assert.equal(filtered.list.byId, list.byId, 'child metadata needed by official status derivation is retained');
    assert.equal(list.ids.length, 51, 'source session state is not mutated');
    const noHits = exports.inspectPure.filterSearchSources(list, remote, () => false);
    assert.equal(noHits.list.ids.length + noHits.remote.items.length, 0, 'outside-group hits must not suppress the official empty state');
    for (const cleanup of cleanups.reverse()) cleanup();
    assert.equal(core.entriesOfSlot('sidebar.workspaces')[0].component, component);
    assert.equal(core.spec(`nestquay.${childName}`), undefined);
    assert.equal(core.entriesOfSlot(childName)[0].component, externalAction);
    removeAction(); declareOfficial(); declareShell();
});
