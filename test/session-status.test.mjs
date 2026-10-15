import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { resolveDshRoot } from '../scripts/dsh-root.mjs';

const ts = createRequire(import.meta.url)('typescript');
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('client.js', bundle, ts.ScriptTarget.Latest, true);
const names = new Set(['selectGroupActivity', 'sameGroupActivity', 'selectGroupCounts', 'sameGroupCounts', 'sameMap', 'groupIndicator']);
const functions = [];
function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(parsed));
    ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(functions.length, names.size);
const helpers = vm.runInNewContext(functions.join(';') + ';({ selectGroupActivity, sameGroupActivity, selectGroupCounts, sameGroupCounts, groupIndicator })');

let UiSession;
vm.runInNewContext(await readFile(resolve(resolveDshRoot(), 'node_modules/@deepseek-ai/dsh-client-ui-session/lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load({ factory }) {
        UiSession = factory(name => {
            if (name === '@deepseek-ai/cordis') return { Service: class {} };
            if (name === '@deepseek-ai/dsh-client-store') return { notifySubscribers: listeners => { for (const notify of listeners) notify(); } };
            if (name === '@deepseek-ai/dsh-client-ui-slots' || name === 'react/jsx-runtime') return {};
            throw new Error('Unexpected native dependency: ' + name);
        }).UiSession;
    } } },
});
assert.equal(typeof UiSession, 'function');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
    const state = {
        phase: 'ready', ids: ['parent', 'child', 'second'],
        byId: Object.fromEntries(['parent', 'child', 'second'].map(id => [id, { running: false, retainedBy: {} }])),
        projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child' }] } } },
    };
    // Run the actual native completion and read transitions, without mounting UI.
    const ui = Object.assign(Object.create(UiSession.prototype), {
        sessions: { list: { getSnapshot: () => state } },
        running: new Map(), completionUnread: new Set(), statusSnapshot: new Map(), pendingSnapshot: new Map(), statusListeners: new Set(),
    });
    ui.reconcileStatus();
    const roots = new Map([['group', ['parent', 'second']]]);
    const activity = helpers.selectGroupActivity(roots, state);
    let counts = helpers.selectGroupCounts(activity, ui.statusSnapshot, roots);
    ui.statusListeners.add(() => { counts = helpers.selectGroupCounts(activity, ui.statusSnapshot, roots); });
    const complete = id => { state.byId[id].running = true; ui.observeRunning(id, true); state.byId[id].running = false; ui.observeRunning(id, false); };
    const view = (id, open) => { state.byId[id].retainedBy = open ? { mainView: 1 } : {}; ui.reconcileStatus(); };
    return { state, ui, roots, activity, complete, view, counts: () => counts.get('group') };
}

test('reading parent clears group green dot despite native child completion remaining unread', () => {
    const f = fixture();
    f.complete('child');
    f.complete('parent');
    assert.equal(f.ui.statusSnapshot.get('child').completionUnread, true);
    f.view('parent', true);
    assert.equal(f.ui.statusSnapshot.get('parent').completionUnread, false);
    assert.equal(f.ui.statusSnapshot.get('child').completionUnread, true, 'native read only clears the viewed session');
    assert.deepEqual(plain(f.counts()), { running: 0, pending: 0, unread: 0 });
    assert.deepEqual(plain(helpers.groupIndicator(f.counts())), { state: 'idle', showBadge: false });
    f.view('parent', false);
    assert.equal(f.counts().unread, 0, 'child reminder must not relight the dot when leaving parent');
    f.complete('parent');
    assert.equal(f.counts().unread, 1, 'a later unseen root completion must relight the dot');
});

test('another unread root keeps reminder; child running and pending still reach the group', () => {
    const f = fixture();
    f.complete('parent'); f.complete('child'); f.complete('second');
    f.view('parent', true);
    assert.equal(f.counts().unread, 1);
    f.view('second', true);
    assert.equal(f.counts().unread, 0);
    f.ui.observeRunning('child', true);
    assert.equal(f.counts().running, 1);
    assert.equal(helpers.groupIndicator(f.counts()).state, 'busy');
    f.ui.pendingSnapshot.set('child', { key: 'permission' }); f.ui.publishStatus();
    assert.equal(f.counts().pending, 1);
    assert.equal(helpers.groupIndicator(f.counts()).state, 'wait');
});

test('child explicitly listed as workspace session still gets its own unread reminder', () => {
    const f = fixture(); f.complete('child');
    const roots = new Map([['group', ['parent', 'child', 'second']]]);
    const activity = helpers.selectGroupActivity(roots, f.state);
    assert.equal(helpers.sameGroupActivity(f.activity, activity), true, 'flat activity does not encode root membership');
    const before = helpers.selectGroupCounts(f.activity, f.ui.statusSnapshot, f.roots);
    const after = helpers.selectGroupCounts(activity, f.ui.statusSnapshot, roots);
    assert.equal(before.get('group').unread, 0);
    assert.equal(after.get('group').unread, 1);
    assert.equal(helpers.sameGroupCounts(before, after), false);
});
