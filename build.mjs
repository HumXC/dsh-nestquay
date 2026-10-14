import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { resolveDshRoot } from './scripts/dsh-root.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const upstream = resolveDshRoot();
const packageRoot = resolve(upstream, 'node_modules/@deepseek-ai/dsh-client-ui-workspace');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
if (manifest.version !== '0.2.0-rc.2') throw new Error(`Nestquay workspace adapter needs review for ${manifest.version}`);
let original = await readFile(resolve(packageRoot, 'lib/client.js'), 'utf8');
let body = original.slice(original.indexOf('\n', original.indexOf('factory: (require) => {')) + 1, original.lastIndexOf('\n\t}'));
function patch(from, to) {
    if (body.split(from).length !== 2) throw new Error(`Upstream adapter anchor changed: ${from.slice(0, 90)}`);
    body = body.replace(from, to);
}
patch('const row = group;', 'const bridge = react.useContext(BridgeContext);\n            const row = group;');
patch('items: workspaceMenuItems,', 'items: [...workspaceMenuItems, ...bridge.workspaceMenu(group.workspaceId)],');
patch('if (id !== "rename" && id !== "delete") return;', 'if (bridge.selectWorkspaceMenu(id, group.workspaceId)) return;\n                                if (id !== "rename" && id !== "delete") return;');
patch('const home = useHostInfo((info) => info.home);', 'const bridge = react.useContext(BridgeContext);\n            const home = useHostInfo((info) => info.home);');
patch('children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces")', 'children: react_jsx_runtime.jsx(bridge.Heading, { title: groupBy === "flat" ? t("section.sessions") : t("section.workspaces") })');
patch('workspaces: orderedWorkspaces,', 'workspaces: orderedWorkspaces.filter(bridge.workspaceVisible),');
patch('ungroupedSessionIds: orderedUngroupedSessionIds,', 'ungroupedSessionIds: bridge.showUngrouped ? orderedUngroupedSessionIds : [],');
patch('sessionIds: orderedFlatSessionIds,', 'sessionIds: orderedFlatSessionIds.filter(bridge.sessionVisible),');
// The native derivation appends every session outside the projected workspaces.
// Filter display IDs too; keep byId intact for status and lineage lookups.
patch('const groups = (0, react.useMemo)(() => deriveGroups(list, workspaces, rowState, statuses, {\n\t\t\t\texpandedGroups,\n\t\t\t\tungroupedOrder: ungroupedSessionIds\n\t\t\t}), [\n\t\t\t\tlist,', 'const treeBridge = react.useContext(BridgeContext);\n\t\t\tconst groups = (0, react.useMemo)(() => deriveGroups({ ...list, ids: list.ids.filter(treeBridge.sessionVisible) }, workspaces, rowState, statuses, {\n\t\t\t\texpandedGroups,\n\t\t\t\tungroupedOrder: ungroupedSessionIds\n\t\t\t}), [\n\t\t\t\ttreeBridge,\n\t\t\t\tlist,');
// Filter metadata and content sources before the official derivation applies its
// row limit, so rows, the empty state and result counts share one result set.
patch('const results = (0, react.useMemo)(() => deriveSearchResults(list, workspaces, query, archivedSessionIds, archivedFilter, statuses, currentRemote, resultLimit), [', 'const searchBridge = react.useContext(BridgeContext);\n            const results = (0, react.useMemo)(() => { const filtered = searchBridge.searchSources(list, currentRemote); return deriveSearchResults(filtered.list, workspaces, query, archivedSessionIds, archivedFilter, statuses, filtered.remote, resultLimit); }, [\n                searchBridge,');
patch('return module.exports;', 'return WorkspaceBrowser;');
const emojiFont = await readFile(new URL('./assets/Twemoji.Mozilla.woff2', import.meta.url));
if (emojiFont.subarray(0, 4).toString() !== 'wOF2' || createHash('sha256').update(emojiFont).digest('hex') !== 'de10ef1cca0407b83048536b9e27294099df00bf8deb6e429f30aae6011629c4') throw new Error('Bundled Twemoji font integrity check failed');
let client = await readFile(new URL('./src/client.tsx', import.meta.url), 'utf8');
if (client.split('__NESTQUAY_EMOJI_FONT_URL__').length !== 2) throw new Error('Emoji font build anchor changed');
client = client.replace('__NESTQUAY_EMOJI_FONT_URL__', `data:font/woff2;base64,${emojiFont.toString('base64')}`);
const compiled = ts.transpileModule(client, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false } }).outputText;
await mkdir(new URL('./lib/', import.meta.url), { recursive: true });
await writeFile(new URL('./lib/client.js', import.meta.url), `// Nestquay adapter: official workspace UI ${manifest.version}; upstream MIT license.\nwindow.__ModuleLoader__.load({id:'dsh-nestquay',factory(require){\nconst module={exports:{}};const exports=module.exports;\nfunction makeWorkspaceBrowser(BridgeContext){\n${body}\n}\n${compiled}\nreturn module.exports;\n}});\n`);
for (const file of ['model.ts', 'index.ts', 'host.ts']) {
    try {
        const source = await readFile(new URL(`./src/${file}`, import.meta.url), 'utf8');
        const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from '\.\/(model|index)\.ts'/g, "from './$1.js'");
        await writeFile(new URL(`./lib/${file.replace('.ts', '.js')}`, import.meta.url), output);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log('Built Nestquay and version-checked official workspace adapter.');
