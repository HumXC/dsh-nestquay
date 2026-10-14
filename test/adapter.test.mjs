import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('client.js', code, ts.ScriptTarget.Latest, true);
function nativeFunction(name) {
    let found;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(parsed);
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    assert.ok(found, `Missing native function ${name}`);
    return found;
}
const nativeSource = `${nativeFunction('groupByWorkspace')}\n${nativeFunction('SessionTree')}`;

for (const mode of ['empty', 'assigned', 'official']) test(`built native workspace derivation respects display membership (${mode})`, () => {
    const stop = new Error('captured native derivation');
    const list = { ids: ['selected', 'outside', 'free'], byId: Object.fromEntries(['selected', 'outside', 'free'].map(id => [id, { id, title: id, retainedBy: {} }])) };
    const workspace = { workspaceId: 'workspace', path: '/example', title: 'Workspace', sessionIds: ['selected'], createdAt: '2026-01-01' };
    const bridge = { sessionVisible: id => mode === 'official' || mode === 'assigned' && id === 'selected' };
    let derivedInput, sections;
    const context = {
        BridgeContext: {},
        react: { useContext: () => bridge, useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {}, useMemo: callback => callback() },
        useNativeDragAcceptance() {}, owningGroupKey: () => undefined, owningParentFolder: () => undefined,
        mainSessionId: () => undefined, sessionVisible: () => true,
        buildGroup: (key, workspaceId, cwd, createdAt, label, sessions) => ({ key, workspaceId, sessions }),
        orderedUngrouped: members => members,
        deriveGroups(input, workspaces, rowState, statuses, view) {
            derivedInput = input;
            sections = context.groupByWorkspace(input, workspaces, new Set(), 'hide', view.ungroupedOrder);
            throw stop;
        },
        props: { list, workspaces: mode === 'empty' ? [] : [workspace], ungroupedSessionIds: [], groupExpansion: {}, rowState: {}, usePanelInfo: callback => callback({ activePanelId: null }), useSessionStatus: () => new Map() },
    };
    assert.throws(() => vm.runInNewContext(`${nativeSource}\nSessionTree(props)`, context), error => error === stop);
    assert.deepEqual([...derivedInput.ids], mode === 'empty' ? [] : mode === 'assigned' ? ['selected'] : list.ids);
    assert.equal(derivedInput.byId, list.byId, 'status and lineage data remain available');
    assert.deepEqual(list.ids, ['selected', 'outside', 'free'], 'source session snapshot is preserved');
    assert.deepEqual([...sections.flatMap(section => section.sessions.map(session => session.id))], mode === 'empty' ? [] : mode === 'assigned' ? ['selected'] : list.ids, 'native fallback cannot append sessions outside the group');
});
