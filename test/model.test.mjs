import assert from 'node:assert/strict';
import test from 'node:test';
import {
    groupsForWorkspace,
    initialMetadata,
    NestquayStore,
    parseMetadata,
    parseRequest,
    reduceMetadata,
    validateIcon,
} from '../src/model.ts';

function fixture(initial = initialMetadata(), save = async () => {}) {
    let durable = structuredClone(initial);
    let sequence = 0;
    const writes = [];
    const store = new NestquayStore({
        get: () => durable,
        async set(value) {
            writes.push(structuredClone(value));
            await save(value);
            durable = structuredClone(value);
        },
    }, () => `group-${++sequence}`);
    return { store, writes, durable: () => structuredClone(durable) };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

const hasCode = (code) => (error) => error.code === code;

async function create(store, name = '项目', icon = '🌿') {
    const snapshot = await store.execute({ action: 'create', name, icon });
    return snapshot.activeGroupId;
}

test('initial metadata has one empty default group and unknown workspaces belong to no group', () => {
    const initial = initialMetadata();
    assert.equal(initial.groups.length, 1);
    assert.equal(initial.activeGroupId, initial.defaultGroupId);
    assert.deepEqual(initial.workspaceGroups, {});
    assert.deepEqual(groupsForWorkspace(initial, 'new-workspace'), []);
    assert.deepEqual(groupsForWorkspace(initial, '__proto__'), []);
    initial.groups[0].name = 'changed';
    assert.equal(initialMetadata().groups[0].name, '默认组');
});

test('last group cannot be deleted and rejected actions make no durable write', async () => {
    const { store, writes } = fixture();
    await assert.rejects(store.execute({ action: 'delete', groupId: 'default' }), hasCode('LAST_GROUP'));
    assert.equal(writes.length, 0);
    assert.deepEqual(store.snapshot(), initialMetadata());
});

test('create trims the name, preserves the emoji and selects the new group', async () => {
    const { store, durable } = fixture();
    await store.execute({ action: 'preferences', mode: 'workspaces' });
    const id = await create(store, '  音乐  ', '👩🏽‍💻');
    const metadata = store.snapshot();
    assert.equal(id, 'group-1');
    assert.equal(metadata.mode, 'groups');
    assert.deepEqual(metadata.groups[1], { id, name: '音乐', icon: '👩🏽‍💻' });
    assert.deepEqual(metadata.workspaceGroups, {});
    assert.deepEqual(groupsForWorkspace(metadata, 'unassigned'), []);
    assert.deepEqual(durable(), metadata);
});

test('updates preserve IDs, support same names and avoid writes for identical values', async () => {
    const { store, writes } = fixture();
    const id = await create(store);
    await store.execute({ action: 'update', groupId: id, name: ' 默认组 ', icon: 'lucide:music' });
    const metadata = store.snapshot();
    assert.equal(metadata.groups[1].id, id);
    assert.equal(metadata.groups[1].name, metadata.groups[0].name);
    assert.equal(metadata.groups[1].icon, 'lucide:music');
    await store.execute({ action: 'update', groupId: id, name: '默认组', icon: 'lucide:music' });
    assert.equal(writes.length, 2);
    assert.equal(store.snapshot().revision, metadata.revision);
});

test('a workspace can belong to multiple explicit groups and adding twice is idempotent', async () => {
    const { store, writes } = fixture();
    const first = await create(store, '第一组');
    const second = await create(store, '第二组');
    await store.execute({ action: 'add', workspaceId: 'workspace-1', groupId: first });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'workspace-1'), [first]);
    await store.execute({ action: 'add', workspaceId: 'workspace-1', groupId: second });
    await store.execute({ action: 'add', workspaceId: 'workspace-1', groupId: first });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'workspace-1'), [first, second]);
    assert.equal(writes.length, 4);
});

test('removing one membership keeps the others; removing the last leaves the workspace unassigned', async () => {
    const { store } = fixture();
    const first = await create(store);
    const second = await create(store);
    await store.execute({ action: 'add', workspaceId: 'w', groupId: first });
    await store.execute({ action: 'add', workspaceId: 'w', groupId: second });
    await store.execute({ action: 'remove', workspaceId: 'w', groupId: first });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), [second]);
    await store.execute({ action: 'remove', workspaceId: 'w', groupId: second });
    assert.equal(Object.hasOwn(store.snapshot().workspaceGroups, 'w'), false);
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), []);
    const revision = store.snapshot().revision;
    await store.execute({ action: 'remove', workspaceId: 'w', groupId: 'default' });
    assert.equal(store.snapshot().revision, revision);
});

test('default membership requires explicit addition, can coexist with other groups, and can be removed', async () => {
    const { store } = fixture();
    const id = await create(store);
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), []);
    await store.execute({ action: 'add', workspaceId: 'w', groupId: 'default' });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), ['default']);
    await store.execute({ action: 'add', workspaceId: 'w', groupId: id });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), ['default', id]);
    await store.execute({ action: 'remove', workspaceId: 'w', groupId: id });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), ['default']);
    await store.execute({ action: 'remove', workspaceId: 'w', groupId: 'default' });
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), []);
    assert.equal(Object.hasOwn(store.snapshot().workspaceGroups, 'w'), false);
});

test('deleting a group keeps surviving memberships and leaves orphaned workspaces unassigned', async () => {
    const { store } = fixture();
    const first = await create(store);
    const second = await create(store);
    await store.execute({ action: 'add', workspaceId: 'orphan', groupId: second });
    await store.execute({ action: 'add', workspaceId: 'shared', groupId: first });
    await store.execute({ action: 'add', workspaceId: 'shared', groupId: second });
    await store.execute({ action: 'delete', groupId: second });
    const metadata = store.snapshot();
    assert.equal(metadata.activeGroupId, 'default');
    assert.deepEqual(groupsForWorkspace(metadata, 'orphan'), []);
    assert.deepEqual(groupsForWorkspace(metadata, 'shared'), [first]);
    assert.deepEqual(Object.keys(metadata.workspaceGroups), ['shared']);
});

test('deleting default picks a surviving default, repairs active selection and rejects the new last group', async () => {
    const { store } = fixture();
    const first = await create(store);
    await store.execute({ action: 'preferences', activeGroupId: 'default', mode: 'workspaces' });
    await store.execute({ action: 'add', workspaceId: 'w', groupId: 'default' });
    const metadata = await store.execute({ action: 'delete', groupId: 'default' });
    assert.equal(metadata.defaultGroupId, first);
    assert.equal(metadata.activeGroupId, first);
    assert.equal(metadata.mode, 'workspaces');
    assert.deepEqual(groupsForWorkspace(metadata, 'w'), []);
    assert.deepEqual(groupsForWorkspace(metadata, 'unassigned'), []);
    assert.deepEqual(metadata.workspaceGroups, {});
    await assert.rejects(store.execute({ action: 'delete', groupId: first }), hasCode('LAST_GROUP'));
});

test('saved explicit memberships and preferences survive reconstructing a store without migration writes', async () => {
    const { store, durable } = fixture();
    const id = await create(store);
    await store.execute({ action: 'add', workspaceId: 'shared', groupId: 'default' });
    await store.execute({ action: 'add', workspaceId: 'shared', groupId: id });
    await store.execute({ action: 'add', workspaceId: 'grouped', groupId: id });
    await store.execute({ action: 'preferences', activeGroupId: 'default', mode: 'workspaces' });
    const saved = durable();
    const { store: restored, writes } = fixture(saved);
    assert.deepEqual(restored.snapshot(), saved);
    assert.deepEqual(groupsForWorkspace(restored.snapshot(), 'shared'), ['default', id]);
    assert.deepEqual(groupsForWorkspace(restored.snapshot(), 'grouped'), [id]);
    assert.deepEqual(groupsForWorkspace(restored.snapshot(), 'unassigned'), []);
    await restored.execute({ action: 'list' });
    assert.deepEqual(writes, []);
    assert.equal(restored.snapshot().activeGroupId, 'default');
    assert.equal(restored.snapshot().mode, 'workspaces');
    assert.equal(restored.snapshot().groups[1].id, id);
});

test('blank names, malformed requests, nonexistent groups and unknown fields reject without writes', async () => {
    const { store, writes } = fixture();
    for (const input of [
        null,
        { action: 'create', name: '  ', icon: 'folder' },
        { action: 'create', name: 'valid', icon: '🌿🎵' },
        { action: 'update', groupId: 'default' },
        { action: 'preferences' },
        { action: 'preferences', mode: 'invalid' },
        { action: 'list', typo: true },
        { action: 'add', groupId: 'default', workspaceId: '' },
        { action: 'unknown' },
    ]) {
        await assert.rejects(store.execute(input), hasCode('INVALID_INPUT'));
    }
    for (const action of ['update', 'delete', 'add', 'remove']) {
        const input = action === 'update'
            ? { action, groupId: 'missing', name: 'new' }
            : action === 'delete' ? { action, groupId: 'missing' } : { action, groupId: 'missing', workspaceId: 'w' };
        await assert.rejects(store.execute(input), hasCode('GROUP_NOT_FOUND'));
    }
    await assert.rejects(store.execute({ action: 'preferences', activeGroupId: 'missing' }), hasCode('GROUP_NOT_FOUND'));
    assert.equal(writes.length, 0);
});

test('emoji validator preserves joined sequences, flags, keycaps, variation selectors and skin tones', () => {
    for (const icon of ['folder', 'lucide:music', '👩🏽‍💻', '👨‍👩‍👧‍👦', '🇨🇳', '1️⃣', '❤️', '👍🏽']) {
        assert.equal(validateIcon(icon), icon);
    }
    for (const icon of ['', ' ', 'two words', '🌿🎵', '<svg>', '汉字']) {
        assert.throws(() => validateIcon(icon), hasCode('INVALID_INPUT'));
    }
});

test('durable snapshot validation rejects invalid references, duplicates and empty assignments', () => {
    const invalid = [
        { ...initialMetadata(), groups: [] },
        { ...initialMetadata(), groups: [initialMetadata().groups[0], initialMetadata().groups[0]] },
        { ...initialMetadata(), defaultGroupId: 'missing' },
        { ...initialMetadata(), activeGroupId: 'missing' },
        { ...initialMetadata(), workspaceGroups: { w: [] } },
        { ...initialMetadata(), workspaceGroups: { w: ['missing'] } },
        { ...initialMetadata(), workspaceGroups: { w: ['default', 'default'] } },
        { ...initialMetadata(), version: 2 },
        { ...initialMetadata(), revision: -1 },
    ];
    for (const value of invalid) assert.throws(() => parseMetadata(value), hasCode('INVALID_INPUT'));
});

test('pure reducer preserves input metadata and rejects ID collisions', () => {
    const initial = initialMetadata();
    const before = structuredClone(initial);
    const next = reduceMetadata(initial, parseRequest({ action: 'create', name: '组', icon: '🌿' }), () => 'new');
    assert.deepEqual(initial, before);
    assert.equal(next.groups.length, 2);
    assert.throws(() => reduceMetadata(initial, { action: 'create', name: '组', icon: '🌿' }, () => 'default'), hasCode('DUPLICATE_GROUP_ID'));
});

test('caller mutations cannot alter snapshots, memberships, or saved state', async () => {
    const { store, durable } = fixture();
    const id = await create(store);
    await store.execute({ action: 'add', workspaceId: 'w', groupId: id });
    const snapshot = await store.execute({ action: 'list' });
    snapshot.groups[0].name = 'corrupted';
    snapshot.workspaceGroups.w.push('missing');
    groupsForWorkspace(store.snapshot(), 'w').push('missing');
    assert.equal(store.snapshot().groups[0].name, '默认组');
    assert.deepEqual(groupsForWorkspace(store.snapshot(), 'w'), [id]);
    assert.deepEqual(durable(), store.snapshot());
});

test('workspace IDs colliding with Object properties are stored safely', async () => {
    const { store } = fixture();
    const id = await create(store);
    for (const workspaceId of ['__proto__', 'constructor', 'toString']) {
        await store.execute({ action: 'add', workspaceId, groupId: id });
        assert.deepEqual(groupsForWorkspace(store.snapshot(), workspaceId), [id]);
    }
    assert.equal(Object.getPrototypeOf(store.snapshot().workspaceGroups), Object.prototype);
    assert.equal(parseMetadata(store.snapshot()).workspaceGroups.__proto__[0], id);
});

test('concurrent writes serialize, reads wait, and snapshots publish only after saving', async () => {
    const gate = deferred();
    const started = deferred();
    const { store, writes } = fixture(initialMetadata(), async () => {
        if (writes.length === 1) {
            started.resolve();
            await gate.promise;
        }
    });
    const first = store.execute({ action: 'create', name: 'first', icon: 'folder' });
    const second = store.execute({ action: 'create', name: 'second', icon: 'folder' });
    const read = store.execute({ action: 'list' });
    await started.promise;
    assert.equal(writes.length, 1);
    assert.equal(store.snapshot().groups.length, 1);
    gate.resolve();
    const [firstResult, secondResult, readResult] = await Promise.all([first, second, read]);
    assert.equal(firstResult.groups.length, 2);
    assert.equal(secondResult.groups.length, 3);
    assert.deepEqual(readResult, secondResult);
    assert.deepEqual(writes.map((value) => value.revision), [1, 2]);
});

test('a failed save leaves no published state and later queued transactions recover', async () => {
    let attempts = 0;
    const { store, durable } = fixture(initialMetadata(), async () => {
        if (++attempts === 1) throw new Error('disk unavailable');
    });
    const failing = store.execute({ action: 'create', name: 'not saved', icon: 'folder' });
    const succeeding = store.execute({ action: 'create', name: 'saved', icon: 'folder' });
    await assert.rejects(failing, /disk unavailable/);
    const metadata = await succeeding;
    assert.equal(metadata.groups.length, 2);
    assert.equal(metadata.groups[1].name, 'saved');
    assert.equal(metadata.revision, 1);
    assert.deepEqual(metadata, durable());
});

test('concurrent deletes cannot delete the final group', async () => {
    const { store } = fixture();
    const id = await create(store);
    const results = await Promise.allSettled([
        store.execute({ action: 'delete', groupId: 'default' }),
        store.execute({ action: 'delete', groupId: id }),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.code, 'LAST_GROUP');
    assert.equal(store.snapshot().groups.length, 1);
});

test('cancelled queued operation never saves; closing drains admitted writes and rejects new calls', async () => {
    const gate = deferred();
    const started = deferred();
    const { store, writes } = fixture(initialMetadata(), async () => {
        started.resolve();
        await gate.promise;
    });
    const first = store.execute({ action: 'create', name: 'saved', icon: 'folder' });
    const controller = new AbortController();
    const queued = store.execute({ action: 'create', name: 'cancelled', icon: 'folder' }, controller.signal);
    const rejection = assert.rejects(queued, hasCode('ABORTED'));
    await started.promise;
    controller.abort();
    const close = store.close();
    await assert.rejects(store.execute({ action: 'list' }), hasCode('CLOSED'));
    gate.resolve();
    await Promise.all([first, rejection, close]);
    assert.equal(writes.length, 1);
    assert.equal(store.snapshot().groups[1].name, 'saved');
});
