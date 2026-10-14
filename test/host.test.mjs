import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDshRoot } from '../scripts/dsh-root.mjs';

// Run with Node >= 22.15; native TypeScript support must be enabled.
// No installation/build is needed. Override the official installation location
// with NESTQUAY_DSH_ROOT when running on another machine.
const dshRoot = resolveDshRoot();
const officialRequire = createRequire(join(dshRoot, 'package.json'));
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.startsWith(pathToFileURL(sourceRoot).href)
            && /^\.\/(model|index)\.js$/.test(specifier)) {
            return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
        }
        try { return nextResolve(specifier, context); }
        catch (error) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND'
                || (!specifier.startsWith('@deepseek-ai/') && specifier !== 'zod')) throw error;
            return nextResolve(pathToFileURL(officialRequire.resolve(specifier)).href, context);
        }
    },
});
const [cordis, storage, storageJson, storageDomain, commands, webServer, connection, host, definitions]
    = await Promise.all([
        import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-storage'),
        import('@deepseek-ai/dsh-storage-json'), import('@deepseek-ai/dsh-storage-domain'),
        import('@deepseek-ai/dsh-commands'), import('@deepseek-ai/dsh-host-webserver'),
        import('@deepseek-ai/dsh-client-connection'), import('../src/host.ts'), import('../src/index.ts'),
    ]);
hooks.deregister();
const { Context, Service } = cordis;
const signal = () => new AbortController().signal;
const agent = { id: 'nestquay-host-test-agent' };

// The optional Tools registry needs an Agent/LLM in production. Keep this one
// narrow test service while exercising real Cordis injection and disposal.
class TestTools extends Service {
    definitions = new Map();
    constructor(ctx) { super(ctx, 'tools'); }
    register(definition) {
        assert.equal(this.definitions.has(definition.name), false);
        this.definitions.set(definition.name, definition);
        return () => this.definitions.delete(definition.name);
    }
}
async function settleUntil(predicate) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (predicate()) return;
        await new Promise((done) => setImmediate(done));
    }
    assert.fail('Cordis optional injection did not settle');
}

async function fixture(t, root) {
    const ownsRoot = root === undefined;
    root ??= await mkdtemp(join(tmpdir(), 'nestquay-host-'));
    const ctx = new Context();
    let hostFiber;
    let toolsFiber;
    const auth = {
        // Native Connection.requestRejection owns Host/Origin fencing. Only its
        // browser-session oracle is faked, avoiding writes to real credentials.
        isAuthenticated: (request) => request.headers.cookie === 'nestquay-test=admitted',
    };
    let cleaned = false;
    async function cleanup() {
        if (cleaned) return;
        cleaned = true;
        await hostFiber?.dispose();
        await ctx.fiber.dispose();
        if (ownsRoot) {
            const target = await realpath(root);
            assert.equal(dirname(target), await realpath(tmpdir()));
            assert.match(target.slice(dirname(target).length + 1), /^nestquay-host-/);
            await rm(target, { recursive: true, force: true });
        }
    }
    t.after(cleanup);
    // Register consumers first: Domain must await the native backend marker,
    // and Host must wait for all four declared services before opening its unit.
    hostFiber = ctx.plugin(host);
    assert.equal(hostFiber.state, 0);
    await ctx.plugin(storage.Storage).await();
    const domainFiber = ctx.plugin(storageDomain, { backend: 'json' });
    await domainFiber.await();
    assert.equal(domainFiber.state, 2); // Its backend-injected child is still waiting.
    assert.equal(ctx.get('storageDomain'), undefined);
    const webFiber = ctx.plugin(webServer.WebServer, { host: '127.0.0.1', port: 0, compression: 'none' });
    const commandFiber = ctx.plugin(commands.CommandRuntime);
    const connectionFiber = ctx.plugin((connectionCtx) => {
        new connection.HostConnectionService(connectionCtx, [], auth);
    });
    await Promise.all([webFiber.await(), commandFiber.await(), connectionFiber.await()]);
    await ctx.plugin(storageJson, { root }).await();
    await domainFiber.await();
    await hostFiber.await();
    assert.equal(hostFiber.state, 2);
    assert.equal(ctx.storage.backend.get('json') instanceof storageJson.JsonStorageBackend, true);
    assert.equal(ctx.storageDomain instanceof storageDomain.DomainFacility, true);
    assert.ok(ctx.storageDomain.get('nestquay'));
    assert.ok(ctx.commands.find(agent, 'nestquay'));
    assert.equal(ctx.webServer.match('/api/nestquay')?.kind, 'exact');
    const baseUrl = `http://127.0.0.1:${ctx.webServer.port}`;
    const headers = {
        'content-type': 'application/json; charset=utf-8', origin: baseUrl,
        cookie: 'nestquay-test=admitted',
    };
    async function http(input = { action: 'list' }, options = {}) {
        const response = await fetch(`${baseUrl}/api/nestquay`, {
            method: options.method ?? 'POST', headers: { ...headers, ...options.headers },
            ...(options.method === 'GET' || options.method === 'HEAD' ? {} : {
                body: options.raw ?? JSON.stringify(input),
            }),
        });
        return { status: response.status, headers: response.headers, body: await response.json() };
    }
    async function command(input = { action: 'list' }, rawInput) {
        const definition = ctx.commands.find(agent, 'nestquay');
        assert.ok(definition, 'native command registration is present');
        return definition.handler({ rawInput: rawInput ?? JSON.stringify(input), agent,
            commandId: 'nestquay-host-test-command', attachments: [], signal: signal() });
    }
    async function commandSnapshot(input) {
        const result = await command(input);
        assert.equal(result.kind, 'success', result.text);
        return JSON.parse(result.text);
    }
    async function mountTools() {
        toolsFiber = ctx.plugin(TestTools);
        await toolsFiber.await();
        await settleUntil(() => ctx.tools.definitions.has('nestquay_groups'));
        return ctx.tools.definitions.get('nestquay_groups');
    }
    async function disposeHost() { await hostFiber.dispose(); }
    async function reopenHost() {
        hostFiber = ctx.plugin(host);
        await hostFiber.await();
        if (toolsFiber) await settleUntil(() => ctx.tools.definitions.has('nestquay_groups'));
    }
    return { ctx, root, http, command, commandSnapshot, mountTools, disposeHost, reopenHost, cleanup, headers, baseUrl };
}

// TCP may coalesce writes; an explicit iterator guarantees that UTF-8 code points
// cross input chunk borders while invoking the actual registered Host handler.
async function invokeChunks(f, chunks, overrides = {}) {
    let consumed = 0;
    const request = {
        method: 'POST', headers: { ...f.headers, host: new URL(f.baseUrl).host, ...overrides },
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) { consumed++; yield chunk; }
        },
    };
    const headers = {};
    const response = {
        statusCode: 200,
        setHeader(name, value) { headers[name.toLowerCase()] = value; },
        end(body) { this.body = JSON.parse(body); },
    };
    await f.ctx.webServer.match('/api/nestquay').handler(request, response);
    return { status: response.statusCode, body: response.body, headers, consumed };
}

test('native Cordis/storage activation checks unit names and shares command, HTTP and tool state', async (t) => {
    const f = await fixture(t);
    assert.equal(definitions.nestquayDomain.name, 'nestquay');
    assert.equal(storage.UNIT_NAME_RE.test(definitions.nestquayDomain.name), true);
    // Negative control: native storage must catch the original hyphenated name.
    await assert.rejects(f.ctx.storageDomain.open({ ...definitions.nestquayDomain, name: 'dsh-nestquay' }),
        (error) => error instanceof storage.StorageError && error.code === 'malformed-medium'
            && /invalid unit name/.test(error.message));
    assert.equal(f.ctx.get('tools'), undefined);
    const initial = await f.http();
    assert.equal(initial.status, 200);
    assert.equal(initial.body.revision, 0);
    const created = await f.commandSnapshot({ action: 'create', name: '  项目  ', icon: '🌿' });
    const id = created.activeGroupId;
    assert.deepEqual(created.groups[1], { id, name: '项目', icon: '🌿' });
    assert.deepEqual((await f.http()).body, created);
    const membership = await f.http({ action: 'add', groupId: id, workspaceId: 'native-workspace' });
    assert.equal(membership.status, 200);
    assert.deepEqual(await f.commandSnapshot(), membership.body);
    const tool = await f.mountTools();
    assert.deepEqual(await tool.execute({ action: 'list' }, { signal: signal() }), membership.body);
    const preferences = await tool.execute({ action: 'preferences', activeGroupId: id, mode: 'workspaces' }, { signal: signal() });
    assert.deepEqual((await f.http()).body, preferences);
    assert.deepEqual(await f.commandSnapshot(), preferences);
    const onDisk = JSON.parse(await readFile(join(f.root, 'nestquay.json'), 'utf8'));
    assert.deepEqual(onDisk.unit, { name: 'nestquay', version: 1 });
    assert.deepEqual(onDisk.global, preferences);
    assert.deepEqual(onDisk.tables, {});
});

test('JSON, MIME, method, native Connection authentication and origin rejections leave metadata unchanged', async (t) => {
    const f = await fixture(t);
    const before = await f.commandSnapshot();
    for (const [options, status, code] of [
        [{ raw: '{' }, 400, 'INVALID_INPUT'], [{ raw: '' }, 400, 'INVALID_INPUT'],
        [{ headers: { 'content-type': 'text/plain' } }, 415],
        [{ headers: { 'content-type': '' } }, 415],
        [{ headers: { 'content-type': 'application/jsonp' } }, 415],
        [{ method: 'GET' }, 405], [{ headers: { cookie: '' } }, 401],
        [{ headers: { origin: 'https://attacker.example' } }, 403],
        [{ headers: { origin: 'not-a-url' } }, 403],
    ]) {
        const result = await f.http({ action: 'create', name: 'must not persist', icon: 'folder' }, options);
        assert.equal(result.status, status, JSON.stringify(options));
        assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.match(result.headers.get('content-type'), /^application\/json/);
        if (code) assert.equal(result.body.code, code);
        if (status === 405) assert.equal(result.headers.get('allow'), 'POST');
    }
    const malformedCommand = await f.command(undefined, '{');
    assert.equal(malformedCommand.kind, 'error');
    assert.equal(JSON.parse(malformedCommand.text).code, 'INVALID_INPUT');
    const badIcon = { action: 'create', name: 'invalid', icon: '🌿🌿' };
    const commandError = await f.command(badIcon);
    const httpError = await f.http(badIcon);
    assert.equal(commandError.kind, 'error');
    assert.equal(httpError.status, 400);
    assert.equal(JSON.parse(commandError.text).code, httpError.body.code);
    assert.deepEqual(await f.commandSnapshot(), before);
    const foreignHost = await invokeChunks(f, [Buffer.from('{"action":"list"}')], { host: 'attacker.example' });
    assert.equal(foreignHost.status, 403);
    assert.equal(foreignHost.consumed, 0);
    const unread = await invokeChunks(f, [Buffer.from('{')], { cookie: '' });
    assert.equal(unread.status, 401);
    assert.equal(unread.consumed, 0, 'authentication rejects before consuming a body');
});

test('split UTF-8 emoji survives Host parsing, broken emoji rejects, and 32 KiB counts bytes', async (t) => {
    const f = await fixture(t);
    const emoji = '👩🏽‍💻';
    const payload = Buffer.from(JSON.stringify({ action: 'create', name: '分块', icon: emoji }));
    const emojiOffset = payload.indexOf(Buffer.from(emoji));
    const chunks = [payload.subarray(0, emojiOffset + 1),
        ...Array.from(payload.subarray(emojiOffset + 1), (byte) => Buffer.from([byte]))];
    const result = await invokeChunks(f, chunks);
    assert.equal(result.status, 200);
    assert.equal(result.body.groups[1].icon, emoji);
    assert.deepEqual((await f.http()).body, result.body);
    const rejected = await invokeChunks(f, [Buffer.from(JSON.stringify({ action: 'create', name: 'broken', icon: '�' }))]);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'INVALID_INPUT');
    assert.deepEqual(await f.commandSnapshot(), result.body);
    const list = Buffer.from('{"action":"list"}');
    const exact = Buffer.concat([list, Buffer.alloc(32768 - list.length, 0x20)]);
    assert.equal((await invokeChunks(f, [exact])).status, 200);
    const tooLarge = await invokeChunks(f, [exact, Buffer.from(' ')]);
    assert.equal(tooLarge.status, 413);
    const unicodeLarge = JSON.stringify({ action: 'create', name: '中'.repeat(11000), icon: 'folder' });
    assert.ok(unicodeLarge.length < 32768);
    assert.ok(Buffer.byteLength(unicodeLarge) > 32768);
    assert.equal((await f.http(undefined, { raw: unicodeLarge })).status, 413);
    assert.deepEqual(await f.commandSnapshot(), result.body);
});

test('disposal removes routes/commands/tools and closes domains; new native services reopen durable state', async (t) => {
    const f = await fixture(t);
    const tool = await f.mountTools();
    const created = await f.commandSnapshot({ action: 'create', name: '保留', icon: '📚' });
    const saved = await f.http({ action: 'add', groupId: created.activeGroupId, workspaceId: 'persisted-workspace' });
    const domain = f.ctx.storageDomain.get('nestquay');
    const command = f.ctx.commands.find(agent, 'nestquay');
    await f.disposeHost();
    assert.equal(f.ctx.commands.find(agent, 'nestquay'), undefined);
    assert.equal(f.ctx.webServer.match('/api/nestquay'), undefined);
    assert.equal(f.ctx.tools.definitions.has('nestquay_groups'), false);
    assert.equal(f.ctx.storageDomain.get('nestquay'), undefined);
    assert.throws(() => domain.global.get(), (error) => error.code === 'closed');
    await assert.rejects(tool.execute({ action: 'list' }, { signal: signal() }), (error) => error.code === 'CLOSED');
    const closedCommand = await command.handler({ rawInput: '{"action":"list"}', signal: signal() });
    assert.equal(closedCommand.kind, 'error');
    assert.equal(JSON.parse(closedCommand.text).code, 'CLOSED');
    const routeResponse = await fetch(`${f.baseUrl}/api/nestquay`, { method: 'POST', headers: f.headers, body: '{"action":"list"}' });
    assert.equal(routeResponse.status, 404);
    await f.reopenHost();
    assert.deepEqual(await f.commandSnapshot(), saved.body);
    await f.disposeHost();
    await f.ctx.fiber.dispose();
    const reopened = await fixture(t, f.root);
    assert.deepEqual((await reopened.http()).body, saved.body);
    assert.deepEqual(await reopened.commandSnapshot(), saved.body);
    await reopened.cleanup();
});

test('concurrent command, HTTP and tool mutations use one native domain write queue', async (t) => {
    const f = await fixture(t);
    const tool = await f.mountTools();
    const [fromCommand, fromHttp, fromTool] = await Promise.all([
        f.commandSnapshot({ action: 'create', name: 'command', icon: 'folder' }),
        f.http({ action: 'create', name: 'HTTP', icon: '🌐' }),
        tool.execute({ action: 'create', name: 'tool', icon: '🛠️' }, { signal: signal() }),
    ]);
    assert.equal(fromHttp.status, 200);
    assert.deepEqual([fromCommand.revision, fromHttp.body.revision, fromTool.revision].sort(), [1, 2, 3]);
    const final = await f.commandSnapshot();
    assert.equal(final.revision, 3);
    assert.deepEqual(final.groups.map((group) => group.name).sort(), ['HTTP', 'command', 'tool', '默认组'].sort());
    assert.equal(new Set(final.groups.map((group) => group.id)).size, 4);
    assert.deepEqual((await f.http()).body, final);
    assert.deepEqual(await tool.execute({ action: 'list' }, { signal: signal() }), final);
    assert.deepEqual(JSON.parse(await readFile(join(f.root, 'nestquay.json'), 'utf8')).global, final);
});
