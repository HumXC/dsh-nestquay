import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const source = await readFile(new URL('../src/client.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['groupIndicator', 'observeViewport', 'Icon', 'GroupDialogs', 'readGroupOrder', 'arrangeGroups', 'moveGroup', 'groupDropTarget']);
const functions = [];
function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(parsed));
    ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(functions.length, names.size);
const compiled = ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture() {
    const observers = [];
    const element = (type, props) => ({ type, props });
    const context = {
        exports: {},
        require: () => ({ jsx: element, jsxs: element, Fragment: 'Fragment' }),
        React: { createElement: element },
        P: { IconFolderCloseRegular: 'Folder', Modal: 'Modal', Button: 'Button', Input: 'Input' },
        builtinIcons: [['folder', '文件夹', 'IconFolderCloseRegular', '文件']], emoji: [],
        snapshot: null, editor: null, removal: null, listeners: new Set(), groupOrder: [], groupOrderKey: 'order',
        useData() {}, useState: value => [value, () => {}], useEffect() {},
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(element) { this.element = element; }
            disconnect() { this.disconnected = true; }
        },
    };
    vm.runInNewContext(compiled, context);
    return { context, observers };
}

test('group badge follows wait, running, unread and idle transitions', () => {
    const { context } = fixture();
    const cases = [
        [{ running: 0, pending: 0, unread: 0 }, 'idle', false],
        [{ running: 0, pending: 0, unread: 2 }, 'done', true],
        [{ running: 1, pending: 0, unread: 2 }, 'busy', false],
        [{ running: 1, pending: 1, unread: 2 }, 'wait', true],
        [{ running: 1, pending: 0, unread: 2 }, 'busy', false],
        [{ running: 0, pending: 0, unread: 2 }, 'done', true],
        [{ running: 0, pending: 0, unread: 0 }, 'idle', false],
    ];
    for (const [counts, state, showBadge] of cases) assert.deepEqual(JSON.parse(JSON.stringify(context.groupIndicator(counts))), { state, showBadge });
});

test('viewport measures on attach, resizes, ignores retired callbacks and reattaches', () => {
    const { context, observers } = fixture();
    const widths = [];
    let width = 420;
    const element = { getBoundingClientRect: () => ({ width }) };
    const release = context.observeViewport(element, value => widths.push(value));
    assert.deepEqual(widths, [420], 'initial width does not depend on a future resize event');
    width = 180; observers[0].callback();
    width = 520; observers[0].callback();
    assert.deepEqual(widths, [420, 180, 520]);
    release();
    assert.equal(observers[0].disconnected, true);
    width = 0; observers[0].callback();
    assert.deepEqual(widths, [420, 180, 520], 'old detached nodes cannot overwrite current width');
    width = 460;
    const releaseNext = context.observeViewport(element, value => widths.push(value));
    assert.deepEqual(widths, [420, 180, 520, 460], 'reopened sidebar measures immediately');
    releaseNext();
});

test('Emoji and SVG honor the same requested icon size', () => {
    const { context } = fixture();
    for (const size of [16, 24, 28]) {
        assert.equal(context.Icon({ value: 'folder', size }).props.size, size);
        assert.equal(context.Icon({ value: '👩🏽‍💻', size }).props.style.fontSize, size);
    }
});

test('closed group dialogs render safely before metadata arrives', () => {
    const { context } = fixture();
    const result = context.GroupDialogs();
    const dialogs = result.props.children;
    assert.equal(dialogs.length, 3);
    assert.equal(dialogs.every(dialog => dialog.props.open === false), true);
    const confirm = dialogs.find(dialog => dialog.props.title === '删除组').props.footer.props.children.find(button => button.props.children === '确认删除');
    assert.equal(confirm.props.disabled, true);
});

test('saved display order ignores deleted groups, keeps new groups and does not mutate metadata', () => {
    const { context } = fixture();
    const groups = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const ordered = context.arrangeGroups(groups, ['b', 'deleted', 'b', 'a']);
    assert.deepEqual([...ordered].map(group => group.id), ['b', 'a', 'c']);
    assert.equal(ordered[0], groups[1]);
    assert.deepEqual(groups.map(group => group.id), ['a', 'b', 'c']);
    context.window = { localStorage: { getItem: () => '["b",null,3,"b","a"]' } };
    assert.deepEqual([...context.readGroupOrder()], ['b', 'a']);
    context.window.localStorage.getItem = () => '{broken';
    assert.deepEqual([...context.readGroupOrder()], []);
    context.window.localStorage.getItem = () => { throw new Error('Storage unavailable'); };
    assert.deepEqual([...context.readGroupOrder()], []);
});

test('drag inserts before or after the target consistently in both directions', () => {
    const { context } = fixture();
    const ids = ['a', 'b', 'c'];
    assert.deepEqual([...context.moveGroup(ids, 'a', 'c', 'before')], ['b', 'a', 'c']);
    assert.deepEqual([...context.moveGroup(ids, 'a', 'c', 'after')], ['b', 'c', 'a']);
    assert.deepEqual([...context.moveGroup(ids, 'c', 'a', 'before')], ['c', 'a', 'b']);
    assert.deepEqual([...context.moveGroup(ids, 'c', 'a', 'after')], ['a', 'c', 'b']);
    assert.deepEqual([...context.moveGroup(ids, 'a', 'b', 'before')], ids);
    assert.deepEqual([...context.moveGroup(ids, 'unknown', 'b')], ids);
    assert.deepEqual([...context.moveGroup(ids, 'b', 'b')], ids);
    assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('drag pointer chooses insertion gaps using live cell midpoints and ignores the source', () => {
    const { context } = fixture();
    const cells = [{ id: 'a', left: 0, width: 30 }, { id: 'b', left: 30, width: 20 }, { id: 'c', left: 50, width: 20 }];
    const target = x => JSON.parse(JSON.stringify(context.groupDropTarget(cells, 'b', x)));
    assert.deepEqual(target(-10), { targetId: 'a', placement: 'before' });
    assert.deepEqual(target(14), { targetId: 'a', placement: 'before' });
    assert.deepEqual(target(15), { targetId: 'c', placement: 'before' });
    assert.deepEqual(target(40), { targetId: 'c', placement: 'before' });
    assert.deepEqual(target(60), { targetId: 'c', placement: 'after' });
    assert.deepEqual(target(200), { targetId: 'c', placement: 'after' });
    assert.deepEqual(cells.map(cell => cell.id), ['a', 'b', 'c']);
});

test('drag cannot choose a gap without a sibling or finite pointer position', () => {
    const { context } = fixture();
    assert.equal(context.groupDropTarget([], 'a', 0), null);
    assert.equal(context.groupDropTarget([{ id: 'a', left: 0, width: 30 }], 'a', 20), null);
    assert.equal(context.groupDropTarget([{ id: 'b', left: 0, width: 30 }], 'a', NaN), null);
    assert.equal(context.groupDropTarget([{ id: 'b', left: 0, width: 30 }], 'a', Infinity), null);
});
