import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('client.js', code, ts.ScriptTarget.Latest, true);
const names = new Set(['Root', 'createWorkspaceInGroup', 'request', 'dispatch', 'membership', 'groupVisibility', 'WorkspaceBrowser', 'WorkspacePickFlow']);
const functions = new Map();
function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.set(node.name.text, node.getText(parsed));
    ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(functions.size, names.size, 'exercise the built Root, helper and native browser/picker');
const fixtureCode = [...functions.values()].join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(setImmediate);
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function metadata(mode = 'groups', activeGroupId = 'team') {
    return { revision: 1, mode, activeGroupId, defaultGroupId: 'default', groups: [{ id: 'default', name: '默认' }, { id: 'team', name: '项目组' }, { id: 'other', name: '其他组' }], workspaceGroups: {} };
}
function findElement(tree, type) {
    if (!tree || typeof tree !== 'object') return;
    if (tree.type === type) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const found = findElement(child, type);
        if (found) return found;
    }
}

// Render the actual built functions with a small hook host. Unrelated ordering,
// effects, primitives and transport are stubbed; native callback/error logic runs.
function fixture({ data = metadata(), create = async input => ({ workspaceId: 'workspace', ...input }), add = async () => {} } = {}) {
    const states = new Map();
    let frame, bridge, flowOwner;
    const element = (type, props) => ({ type, props });
    const hooks = {
        useState(initial) {
            const slot = frame.index++;
            const slots = frame.slots;
            if (!(slot in slots)) slots[slot] = { value: typeof initial === 'function' ? initial() : initial };
            return [slots[slot].value, value => { slots[slot].value = typeof value === 'function' ? value(slots[slot].value) : value; }];
        },
        useMemo(callback, deps) {
            const slot = frame.index++;
            const cached = frame.slots[slot];
            if (!cached || deps.some((value, index) => !Object.is(value, cached.deps[index]))) frame.slots[slot] = { value: callback(), deps };
            return frame.slots[slot].value;
        },
        useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
        useRef(value) { return hooks.useMemo(() => ({ current: value }), []); },
        useEffect() {},
        useContext: () => bridge,
    };
    const operations = [], createInputs = [], picked = [], deleted = [];
    const workspaceState = { phase: 'ready', state: 'ready', items: [], archivedSessionIds: [], pinnedSessionIds: [] };
    const primitives = new Proxy({}, { get: (_, name) => name });
    const context = {
        Error, React: { ...hooks, createElement: (type, props, ...children) => element(type, { ...props, children }) },
        react: hooks, react_jsx_runtime: { jsx: element, jsxs: element, Fragment: 'Fragment' },
        ...hooks, BridgeContext: { Provider: 'BridgeProvider' },
        Heading: () => null, GroupDialogs: () => null, Icon: () => null,
        snapshot: data, failure: '', emit() {}, useData: () => context.snapshot,
        _deepseek_ai_dsh_client_ui_primitives: primitives,
        WorkspaceBrowser_module_css_default: {}, WorkspacePicker_module_css_default: {},
        clsx: () => '', FLAT_SESSION_ORDER_KEY: 'flat', ADD_WORKSPACE: 'add', SEARCH_QUERY_MAX_CODE_UNITS: 2048,
        sessionMemberIds: list => list.ids, pinCurrentBlank: ids => ids,
        reconcileManualOrder: ids => ids, orderByRecency: ids => ids, sanitizeSearchQuery: query => query,
        workspaceDisplayTitle: title => title,
        async fetch(url, options) {
            assert.equal(url, '/api/nestquay');
            assert.equal(options.method, 'POST');
            const operation = JSON.parse(options.body);
            operations.push(operation);
            await add(operation);
            return { ok: true, json: async () => ({ snapshot: { ...context.snapshot, revision: (context.snapshot?.revision || 0) + 1 } }) };
        },
    };
    vm.runInNewContext(fixtureCode, context);
    context.Browser = context.WorkspaceBrowser;
    const props = {
        wide: false, t: key => key,
        useWorkspaces: selector => selector(workspaceState),
        useSessions: selector => selector({ ids: [], byId: {}, phase: 'ready' }),
        useStore: selector => selector({ groupBy: 'workspace', orderBy: 'manual', groupExpansion: {}, sessionOrderByAccount: {} }),
        useHostInfo: selector => selector({ home: '/home' }),
        useShortcuts: selector => selector([]),
        useWorkspaceShortcuts: selector => selector({ addRequested: true, forkError: null }),
        useDirectoryFlow: selector => selector(true), actions: {},
        createWorkspace(input) { createInputs.push(input); return create(input); },
        startSession: workspaceId => picked.push(workspaceId),
        deleteWorkspace: workspaceId => deleted.push(workspaceId), closeAddWorkspace() {}, setDirectoryBusy() {},
        renderSlot(key, owner) { assert.equal(key, 'nestquay.sidebar.workspaces.directoryFlow'); flowOwner = owner; return null; },
    };
    function render(component, input) {
        if (!states.has(component)) states.set(component, []);
        frame = { slots: states.get(component), index: 0 };
        return component(input);
    }
    function renderRoot() {
        const tree = render(context.Root, props);
        bridge = findElement(tree, 'BridgeProvider').props.value;
        const browser = findElement(tree, context.WorkspaceBrowser);
        assert.ok(browser, 'Root renders the built native WorkspaceBrowser');
        assert.notEqual(browser.props.createWorkspace, props.createWorkspace, 'only this Browser receives the wrapper');
        return browser;
    }
    function renderFlow() {
        const browser = renderRoot();
        const browserTree = render(browser.type, browser.props);
        const picker = findElement(browserTree, context.WorkspacePickFlow);
        assert.ok(picker, 'native Browser renders WorkspacePickFlow');
        assert.equal(picker.props.createWorkspace, browser.props.createWorkspace, 'native Browser forwards the wrapper');
        return render(picker.type, picker.props);
    }
    return { context, props, operations, createInputs, picked, deleted, workspaceState, renderRoot, renderFlow,
        choose(path = '/project') { renderFlow(); flowOwner.onPicked(path); },
        get owner() { return flowOwner; },
        modal() { return findElement(renderFlow(), 'Modal'); },
        setData(next) { context.snapshot = next; },
    };
}

for (const groupId of ['default', 'team']) test('native creation waits for explicit membership in ' + groupId + ' before onPick', async () => {
    const created = deferred(), saved = deferred();
    const workspace = { workspaceId: 'workspace', path: '/project', title: 'Official title', sessionIds: [], extra: { retained: true } };
    const f = fixture({ data: metadata('groups', groupId), create: () => created.promise, add: () => saved.promise });
    f.choose();
    assert.deepEqual(plain(f.createInputs), [{ path: '/project' }], 'native create arguments are preserved');
    assert.deepEqual(f.operations, []);
    created.resolve(workspace);
    await settle();
    assert.deepEqual(f.operations, [{ action: 'add', groupId, workspaceId: 'workspace' }]);
    assert.deepEqual(f.picked, [], 'native onPick cannot run before membership is saved');
    f.renderFlow();
    assert.equal(f.owner.busy, true);
    saved.resolve();
    await settle();
    assert.deepEqual(f.picked, ['workspace']);
    assert.equal(f.modal().props.open, false);
    assert.equal(f.owner.busy, false);
    assert.equal(f.deleted.length, 0);
});

test('Root wrapper preserves input and original workspace identity and fields', async () => {
    const input = { path: '/project', title: 'Custom title', futureOption: true };
    const workspace = Object.freeze({ workspaceId: 'workspace', title: 'Created', extra: input });
    const f = fixture({ create: value => { assert.equal(value, input); return Promise.resolve(workspace); } });
    const original = f.props.createWorkspace;
    const wrapper = f.renderRoot().props.createWorkspace;
    assert.equal(await wrapper(input), workspace);
    assert.equal(f.props.createWorkspace, original, 'official callback remains available unchanged elsewhere');
    assert.equal(await original(input), workspace);
    assert.equal(f.operations.length, 1, 'calling the official callback elsewhere does not autoassign');
});

for (const data of [null, metadata('workspaces')]) test('native creation skips membership with ' + (data ? 'workspaces mode' : 'missing metadata'), async () => {
    const created = deferred();
    const f = fixture({ data, create: () => created.promise });
    f.choose();
    f.setData(metadata('groups', 'other'));
    created.resolve({ workspaceId: 'workspace' });
    await settle();
    assert.deepEqual(f.operations, [], 'later groups mode cannot change a request that started outside groups');
    assert.deepEqual(f.picked, ['workspace']);
});

test('group switches during create and membership keep the captured target', async () => {
    const created = deferred(), saved = deferred();
    const data = metadata('groups', 'team');
    const f = fixture({ data, create: () => created.promise, add: () => saved.promise });
    f.choose();
    data.activeGroupId = 'other';
    f.setData(metadata('workspaces', 'default'));
    f.renderFlow();
    created.resolve({ workspaceId: 'workspace' });
    await settle();
    assert.deepEqual(f.operations, [{ action: 'add', groupId: 'team', workspaceId: 'workspace' }]);
    f.setData(metadata('groups', 'other'));
    f.renderFlow();
    assert.deepEqual(f.picked, []);
    saved.resolve();
    await settle();
    assert.deepEqual(f.picked, ['workspace']);
    assert.equal(f.operations.length, 1);
});

test('official create rejection stays identical, skips add and reaches native error modal', async () => {
    const error = new Error('Directory is unavailable');
    const f = fixture({ create: () => Promise.reject(error) });
    await assert.rejects(f.renderRoot().props.createWorkspace({ path: '/project' }), reason => reason === error);
    f.choose();
    await settle();
    assert.deepEqual(f.operations, []);
    assert.deepEqual(f.picked, []);
    const modal = f.modal();
    assert.equal(modal.props.open, true);
    assert.equal(modal.props.children.props.children, error.message);
});

test('membership failure is visible and native retry reuses workspace without deleting other memberships', async () => {
    const directoryWorkspaces = new Map();
    const memberships = new Set(['other']);
    let attempts = 0;
    const f = fixture({
        create: async ({ path }) => {
            if (!directoryWorkspaces.has(path)) directoryWorkspaces.set(path, { workspaceId: 'workspace', path });
            return directoryWorkspaces.get(path);
        },
        add: async ({ groupId }) => {
            if (++attempts === 1) throw new Error('Membership persistence unavailable');
            memberships.add(groupId);
        },
    });
    f.choose();
    await settle();
    const modal = f.modal();
    assert.equal(modal.props.open, true);
    assert.match(modal.props.children.props.children, /工作区已创建.*无法加入分组.*项目组.*Membership persistence unavailable/);
    assert.deepEqual(f.picked, []);
    assert.equal(directoryWorkspaces.size, 1, 'the original workspace survives membership failure');
    assert.deepEqual(f.deleted, []);
    const retry = modal.props.footer.props.children.find(button => button.props.children === 'folderError.retry');
    retry.props.onClick();
    f.choose();
    await settle();
    assert.equal(directoryWorkspaces.size, 1, 'official idempotent creation reuses the same directory workspace');
    assert.deepEqual(plain(f.createInputs), [{ path: '/project' }, { path: '/project' }]);
    assert.deepEqual(f.operations, Array.from({ length: 2 }, () => ({ action: 'add', groupId: 'team', workspaceId: 'workspace' })));
    assert.deepEqual([...memberships], ['other', 'team']);
    assert.deepEqual(f.picked, ['workspace']);
    assert.equal(f.modal().props.open, false);
});

test('deleted captured group rejects with membership cause and never assigns an alternative', async () => {
    const created = deferred();
    const error = new Error('分组不存在');
    const f = fixture({ create: () => created.promise, add: async () => { throw error; } });
    const result = f.renderRoot().props.createWorkspace({ path: '/project' });
    const rejected = assert.rejects(result, reason => reason.cause === error && /工作区已创建.*项目组.*分组不存在/.test(reason.message));
    f.setData({ ...metadata('groups', 'default'), groups: [{ id: 'default', name: '默认' }] });
    created.resolve({ workspaceId: 'workspace' });
    await rejected;
    assert.deepEqual(f.operations, [{ action: 'add', groupId: 'team', workspaceId: 'workspace' }]);
    assert.deepEqual(f.deleted, []);
});

test('observing an arbitrary new workspace does not create group membership', () => {
    const f = fixture();
    f.renderRoot();
    f.workspaceState.items.push({ workspaceId: 'external', title: 'Elsewhere', sessionIds: [] });
    f.renderRoot();
    assert.deepEqual(f.operations, []);
    assert.deepEqual(f.createInputs, []);
});
