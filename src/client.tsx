declare const require: (id: string) => any;
declare const makeWorkspaceBrowser: (context: any) => any;
const React = require('react');
const P = require('@deepseek-ai/dsh-client-ui-primitives');
const { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, useContext, useSyncExternalStore } = React;
const BridgeContext = React.createContext(null);
const Browser = makeWorkspaceBrowser(BridgeContext);
const icons = [
    ['folder', '文件夹', 'IconFolderCloseRegular', '文件'],
    ['code', '代码', 'IconCodeOutlineRegular', '技术'],
    ['terminal', '终端', 'IconTerminalOutlineRegular', '技术'],
    ['branch', '分支', 'IconBranchOutlineRegular', '技术'],
    ['globe', '网络', 'IconGlobeOutlineRegular', '技术'],
    ['settings', '系统', 'IconSettingsOutlineRegular', '技术'],
    ['search', '研究', 'IconSearchOutlineRegular', '技术'],
    ['chat', '对话', 'IconNewChatOutlineRegular', '通信'],
    ['book', '文档', 'IconFileOutlineRegular', '文件'],
    ['star', '收藏', 'IconStarOutlineRegular', '生活'],
    ['image', '图片', 'IconImageOutlineRegular', '媒体'],
    ['link', '链接', 'IconLinkOutlineRegular', '文件'],
    ['shield', '安全', 'IconShieldOutlineRegular', '技术'],
    ['download', '下载', 'IconDownloadOutlineRegular', '文件'],
    ['clock', '时间', 'IconClockOutlineRegular', '生活'],
    ['light', '灵感', 'IconLightbulbOutlineRegular', '生活'],
];
// Only exports actually available in the mounted official primitive library are shown.
const availableIcon = (name: string) => typeof P[name] === 'function' || P[name] && typeof P[name] === 'object' && '$$typeof' in P[name];
const builtinIcons = icons.filter((entry) => availableIcon(entry[2]));
const knownIconExports = new Set(builtinIcons.map((entry) => entry[2]));
for (const name of Object.keys(P).filter((name) => /^Icon.*Regular$/.test(name) && availableIcon(name) && !knownIconExports.has(name)).sort()) {
    const label = name.replace(/^Icon/, '').replace(/(Outline|Fill|Close)?Regular$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    builtinIcons.push([name, label, name, '更多']);
}
const emoji = [
    ['😀', '笑脸 smile', '表情'], ['😊', '微笑 happy', '表情'], ['😎', '酷 cool', '表情'], ['🤔', '思考 think', '表情'], ['🥳', '庆祝 party', '表情'], ['🧠', '大脑 brain', '人物'], ['👩‍💻', '开发者 developer', '人物'], ['🧑‍🎨', '艺术家 artist', '人物'], ['👋', '挥手 hello', '人物'], ['🐱', '猫 cat', '动植物'], ['🐶', '狗 dog', '动植物'], ['🌱', '植物 plant', '动植物'], ['🌳', '树 tree', '动植物'], ['🌸', '花 flower', '动植物'], ['🍀', '幸运 clover', '动植物'], ['🍎', '苹果 apple', '饮食'], ['🍵', '茶 tea', '饮食'], ['☕', '咖啡 coffee', '饮食'], ['🍰', '蛋糕 cake', '饮食'], ['🏠', '家 home', '地点'], ['🏢', '办公室 office', '地点'], ['🏔️', '山 mountain', '地点'], ['🚀', '火箭 rocket', '地点'], ['🌍', '地球 earth', '地点'], ['🎵', '音乐 music', '活动'], ['🎮', '游戏 game', '活动'], ['🎨', '绘画 art', '活动'], ['📚', '读书 books', '活动'], ['⚽', '足球 football', '活动'], ['🏆', '奖杯 trophy', '活动'], ['💻', '电脑 computer', '物品'], ['🛠️', '工具 tools', '物品'], ['🔬', '科学 science', '物品'], ['📷', '相机 camera', '物品'], ['💡', '灵感 idea', '物品'], ['📁', '文件夹 folder', '物品'], ['⭐', '星 star', '符号'], ['❤️', '爱 heart', '符号'], ['✅', '完成 done', '符号'], ['🔥', '火 fire', '符号'], ['💎', '宝石 diamond', '符号'], ['🎯', '目标 target', '符号'], ['🌈', '彩虹 rainbow', '符号'], ['✨', '闪亮 sparkles', '符号'],
];
const css = `
.nq-root{height:100%;min-height:0;display:flex;flex-direction:column;position:relative}.nq-root>div:not(.nq-error){min-height:0}.nq-heading{display:flex;align-items:center;gap:4px;min-width:0}.nq-heading>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:120px}.nq-icon-button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;width:28px;height:28px;flex-shrink:0}.nq-icon-button:hover{color:var(--dsw-alias-label-primary)}.nq-icon-button:focus-visible,.nq-group:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:50%}.nq-error{color:var(--dsw-alias-state-error-primary);font-size:12px;padding:4px 8px;display:flex;align-items:center;gap:8px}
.nq-footer{display:flex;align-items:center;gap:4px;width:100%;min-width:0}.nq-viewport{flex:1;min-width:0;overflow:auto;scrollbar-width:none;position:relative}.nq-viewport::-webkit-scrollbar{display:none}.nq-track{display:flex;width:max-content;min-width:100%;justify-content:center;align-items:center;padding:4px 0}.nq-cell{flex:0 0 30px;width:30px;height:38px;position:relative;display:flex;justify-content:center;align-items:center}.nq-compact .nq-cell{width:20px;flex-basis:20px}.nq-compact .nq-cell[data-selected=true]{width:30px;flex-basis:30px}.nq-group{position:relative;border:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1}.nq-group[aria-pressed=true]{color:var(--dsw-alias-brand-primary)}.nq-group[aria-pressed=true]:after{content:'';position:absolute;bottom:-3px;left:10px;width:8px;height:2px;background:currentColor;border-radius:2px}.nq-glyph{font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center}.nq-group>.nq-glyph,.nq-dot{position:absolute;left:50%;top:50%;transform-origin:center;pointer-events:none;transition:opacity 200ms ease,transform 200ms ease}.nq-group>.nq-glyph{font-size:16px;width:16px;height:16px;z-index:1;opacity:1;transform:translate(-50%,-50%) scale(1)}.nq-dot{display:block;width:6px;height:6px;opacity:0;transform:translate(-50%,-50%) scale(.4)}.nq-dot-pulse{display:block;width:100%;height:100%;border-radius:50%;background:currentColor}
.nq-compact .nq-cell:not([data-selected=true]):not(:hover):not(:focus-within) .nq-group>.nq-glyph{opacity:0;transform:translate(-50%,-50%) scale(.4)}.nq-compact .nq-cell:not([data-selected=true]):not(:hover):not(:focus-within) .nq-dot{opacity:1;transform:translate(-50%,-50%) scale(1)}.nq-compact .nq-cell:hover,.nq-compact .nq-cell:focus-within{z-index:2}
.nq-glyph-base,.nq-running-sweep{display:flex;align-items:center;justify-content:center;width:16px;height:16px}.nq-running-sweep{position:absolute;inset:0;color:var(--dsw-alias-brand-primary);mask-image:linear-gradient(to right,transparent 30%,rgba(0,0,0,.4) 42%,#000 50%,rgba(0,0,0,.4) 58%,transparent 70%);-webkit-mask-image:linear-gradient(to right,transparent 30%,rgba(0,0,0,.4) 42%,#000 50%,rgba(0,0,0,.4) 58%,transparent 70%);mask-size:200% 100%;-webkit-mask-size:200% 100%;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-position:200% 0;-webkit-mask-position:200% 0;animation:nq-color-sweep 3.2s ease-in-out infinite;animation-play-state:paused}.nq-glyph[data-in-viewport=true]>.nq-running-sweep{animation-play-state:running}.nq-group[aria-pressed=true][data-busy=true] .nq-glyph-base{opacity:.82}.nq-compact .nq-cell:not([data-selected=true]):not(:hover):not(:focus-within) .nq-running-sweep,.nq-viewport[data-document-hidden=true] .nq-running-sweep{animation-play-state:paused}
.nq-group[data-wait=true],.nq-group[data-state=wait]{--nq-status:var(--dsw-alias-state-warn-primary)}.nq-group[data-state=done]{--nq-status:var(--dsw-alias-state-success-primary)}.nq-group[data-state=busy]{--nq-status:var(--dsw-alias-brand-primary)}.nq-group[data-state]:not([data-state=idle]) .nq-dot-pulse{background:var(--nq-status)}.nq-group[data-busy=true] .nq-dot-pulse{animation:nq-breathe 2.8s ease-in-out infinite}.nq-badge{position:absolute;right:2px;top:2px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 2px var(--dsw-specific-sidebar-fill);pointer-events:none;transition:opacity 200ms ease}.nq-group[data-wait=true] .nq-badge{background:var(--dsw-alias-state-warn-primary);border-radius:1px;transform:rotate(45deg)}.nq-compact .nq-cell:not([data-selected=true]):not(:hover):not(:focus-within) .nq-badge{opacity:0}.nq-cell[data-dragging=true]{opacity:.45}
@font-face{font-family:NestquayEmoji;src:url("__NESTQUAY_EMOJI_FONT_URL__") format("woff2");font-display:swap}.nq-emoji,.nq-emoji-input input{font-family:NestquayEmoji,"Apple Color Emoji","Segoe UI Emoji",emoji;font-variant-emoji:emoji}.nq-form{display:grid;gap:16px;min-width:280px}.nq-form label,.nq-picker label{display:grid;gap:8px}.nq-preview{display:flex;align-items:center;gap:12px}.nq-picker-modal{width:min(720px,85vw)!important;max-width:720px!important}.nq-picker{display:grid;gap:12px;width:100%;min-width:280px}.nq-tabs{display:flex;gap:8px;flex-wrap:wrap}.nq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:6px;max-height:360px;min-height:180px;overflow:auto;padding:4px}.nq-choice{width:100%;height:46px;border:1px solid transparent;background:transparent;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:6px}.nq-choice:hover{background:var(--dsw-alias-bg-layer-2)}.nq-choice[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)}.nq-choice:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}.nq-group[aria-pressed=false] .nq-glyph-base{filter:grayscale(1);opacity:.6}.nq-menu-icon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none}.nq-menu-icon svg{width:16px!important;height:16px!important}.nq-empty{color:var(--dsw-alias-label-secondary);font-size:13px;margin:8px}
.hHd-Xa_footArea:has(.nq-footer){display:flex;flex-direction:row-reverse;align-items:center;gap:4px}.hHd-Xa_footerActions:has(.nq-footer){display:flex;flex:1;min-width:0}.hHd-Xa_footerActions:has(.nq-footer)>*{min-width:0}.hHd-Xa_footArea:has(.nq-footer) .hHd-Xa_settingsArea{width:auto;flex:0 0 auto;overflow:visible}.hHd-Xa_footArea:has(.nq-footer) .hHd-Xa_settingsArea button{min-width:34px;width:34px;height:34px;padding:0;gap:0;justify-content:center;background:transparent;border:0;border-radius:50%;box-shadow:none}.hHd-Xa_footArea:has(.nq-footer) .hHd-Xa_settingsArea [data-slot="settings.trigger"]>span{display:none}.hHd-Xa_footArea:has(.nq-footer) .hHd-Xa_settingsArea button svg{width:20px;height:20px;flex:0 0 20px}
@keyframes nq-color-sweep{0%{mask-position:200% 0;-webkit-mask-position:200% 0}72%,100%{mask-position:-100% 0;-webkit-mask-position:-100% 0}}@keyframes nq-breathe{0%,100%{opacity:.65}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.nq-footer *,.nq-footer *:before,.nq-footer *:after{animation:none!important;transition:none!important}.nq-running-sweep{mask-image:none;-webkit-mask-image:none}}
`;
let snapshot: any = null;
let failure = '';
let editor: any = null;
let removal: any = null;
const listeners = new Set<() => void>();
let viewRevision = 0;
const groupOrderKey = 'dsh-nestquay:group-order:v1';
let groupOrder = readGroupOrder();
function readGroupOrder(): string[] {
    try { const value = JSON.parse(window.localStorage.getItem(groupOrderKey) || '[]'); return Array.isArray(value) ? [...new Set(value.filter((id: unknown) => typeof id === 'string'))] as string[] : []; } catch { return []; }
}
function arrangeGroups<T extends { id: string }>(groups: T[], order: string[] = groupOrder): T[] {
    const remaining = new Map(groups.map((group) => [group.id, group]));
    const sorted: T[] = [];
    for (const id of order) { const group = remaining.get(id); if (group) { sorted.push(group); remaining.delete(id); } }
    return [...sorted, ...remaining.values()];
}
function moveGroup(ids: string[], sourceId: string, targetId: string, placement: 'before' | 'after' = 'before'): string[] {
    if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids.slice();
    const next = ids.filter((id) => id !== sourceId);
    const target = next.indexOf(targetId);
    next.splice(target + (placement === 'after' ? 1 : 0), 0, sourceId);
    return next;
}
function groupDropTarget(cells: { id: string; left: number; width: number }[], sourceId: string, clientX: number): { targetId: string; placement: 'before' | 'after' } | null {
    if (!Number.isFinite(clientX) || !cells.some((cell) => cell.id === sourceId) || cells.some((cell) => !Number.isFinite(cell.left) || !Number.isFinite(cell.width) || cell.width <= 0)) return null;
    const others = cells.filter((cell) => cell.id !== sourceId).sort((a, b) => a.left - b.left);
    if (!others.length) return null;
    for (const cell of others) {
        if (clientX < cell.left + cell.width / 2) return { targetId: cell.id, placement: 'before' };
    }
    return { targetId: others[others.length - 1].id, placement: 'after' };
}
function persistGroupOrder(ids: string[]) {
    groupOrder = ids.slice();
    try { window.localStorage.setItem(groupOrderKey, JSON.stringify(groupOrder)); } catch { /* Retain this page's order when browser persistence is unavailable. */ }
    emit();
}
function emit() { viewRevision++; listeners.forEach((fn) => fn()); }
function subscribeView(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function useData() { useSyncExternalStore(subscribeView, () => viewRevision); return snapshot; }
async function request(operation: any) {
    const response = await fetch('/api/nestquay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || '分组操作失败');
    const next = data.snapshot || data;
    const changed = !snapshot || next.revision > snapshot.revision;
    if (changed) snapshot = next;
    const recovered = failure !== '';
    failure = '';
    if (changed || recovered) emit();
    return snapshot;
}
function dispatch(operation: any) { return request(operation).catch((error) => { failure = error.message; emit(); throw error; }); }
function fire(operation: any) { void dispatch(operation).catch(() => {}); }
function showEditor(group: any = null) { editor = group || { name: '', icon: '📁' }; emit(); }
function showRemoval(group: any) { if (!group || !snapshot || snapshot.groups.length === 1) return; removal = { ...group }; emit(); }
function Icon({ value, size = 20 }: any) {
    const found = builtinIcons.find((item) => item[0] === value);
    if (found) return React.createElement(P[found[2]], { size });
    if (/^[a-z][a-z-]*$/i.test(value)) return <P.IconFolderCloseRegular size={size} />;
    return <span className="nq-glyph nq-emoji" style={{ fontSize: size, width: size, height: size, flexShrink: 0 }} aria-hidden="true">{value}</span>;
}
function membership(data: any, workspaceId: string) { return Object.hasOwn(data.workspaceGroups, workspaceId) ? data.workspaceGroups[workspaceId] : []; }
function groupVisibility(data: any, workspaces: any[]) {
    const grouped = data?.mode === 'groups';
    const workspaceVisible = (workspace: any) => !grouped || membership(data, workspace.workspaceId).includes(data.activeGroupId);
    const sessionIds = new Set(workspaces.filter(workspaceVisible).flatMap((workspace: any) => workspace.sessionIds));
    return { workspaceVisible, sessionVisible: (id: string) => !grouped || sessionIds.has(id), showUngrouped: !grouped };
}
function filterSearchSources(list: any, remote: any, visible: (id: string) => boolean) {
    return { list: { ...list, ids: list.ids.filter(visible) }, remote: { ...remote, items: remote.items.filter((item: any) => visible(item.sessionId)) } };
}
function Heading({ title }: any) {
    const data = useData();
    const [menu, setMenu] = useState(false);
    if (!data) return <span>{title}</span>;
    const grouped = data.mode === 'groups';
    const current = data.groups.find((g: any) => g.id === data.activeGroupId) || data.groups[0];
    return <div className="nq-heading"><span title={grouped ? current.name : title}>{grouped ? current.name : title}</span>
        <P.Tooltip label={grouped ? '切换到工作区' : '切换到工作区组'}><button type="button" className="nq-icon-button" aria-label={grouped ? '切换到工作区' : '切换到工作区组'} onClick={() => fire({ action: 'preferences', mode: grouped ? 'workspaces' : 'groups' })}><P.IconPanelLeftOutlineRegular size={14} /></button></P.Tooltip>
        {grouped && <P.Menu open={menu} onClose={() => setMenu(false)} portal items={[{ id: 'edit', label: '编辑组' }, { id: 'remove', label: '删除组', danger: true, disabled: data.groups.length === 1 }]} onSelect={(id: string) => { setMenu(false); if (id === 'remove') showRemoval(current); else if (id === 'edit') showEditor(current); }} anchor={<button type="button" className="nq-icon-button" aria-label="组更多选项" onClick={() => setMenu(!menu)}><P.IconEllipsisOutlineRegular size={14} /></button>} />}
    </div>;
}
function GroupDialogs() {
    useData();
    const [draft, setDraft] = useState(null as any);
    const [pick, setPick] = useState(false);
    const [tab, setTab] = useState('emoji');
    const [category, setCategory] = useState('全部');
    const [query, setQuery] = useState('');
    const [choice, setChoice] = useState('📁');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [recent, setRecent] = useState([] as string[]);
    useEffect(() => { if (editor) { setDraft({ ...editor }); setError(''); } else setDraft(null); }, [editor]);
    const close = () => { if (busy) return; editor = null; emit(); };
    const save = async () => {
        setBusy(true); setError('');
        try { await dispatch({ action: draft.id ? 'update' : 'create', groupId: draft.id, name: draft.name.trim(), icon: draft.icon }); editor = null; emit(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    useEffect(() => { setDeleteError(''); }, [removal?.id]);
    const cancelRemoval = () => { if (!deleting) { removal = null; emit(); } };
    const confirmRemoval = async () => {
        if (!removal || deleting) return;
        const groupId = removal.id;
        setDeleting(true); setDeleteError('');
        try {
            await dispatch({ action: 'delete', groupId });
            if (editor?.id === groupId) editor = null;
            removal = null; emit();
        } catch (e: any) { setDeleteError(e.message); } finally { setDeleting(false); }
    };
    const entries = tab === 'icons' ? builtinIcons.map(([value, label, , cat]) => [value, label, cat]) : emoji;
    const categories = ['全部', '最近', ...new Set(entries.map((entry) => entry[2]))];
    const filtered = entries.filter((entry) => (category === '全部' || category === '最近' && recent.includes(entry[0]) || category === entry[2]) && `${entry[0]} ${entry[1]}`.toLowerCase().includes(query.toLowerCase()));
    return <>
        <P.Modal open={draft !== null} onClose={close} closeLabel="关闭" title={draft?.id ? '编辑组' : '新建组'} footer={<>{draft?.id && <P.Button variant="outline" disabled={busy || snapshot.groups.length === 1} onClick={() => showRemoval(draft)}>删除组</P.Button>}<P.Button variant="outline" disabled={busy} onClick={close}>取消</P.Button><P.Button variant="primary" disabled={busy || !draft?.name.trim()} onClick={() => void save()}>{busy ? '保存中…' : draft?.id ? '保存' : '创建'}</P.Button></>}>
            {draft && <div className="nq-form"><label>名称<P.Input data-modal-autofocus aria-label="组名称" maxLength={60} value={draft.name} onChange={(e: any) => setDraft({ ...draft, name: e.target.value })} /></label><div className="nq-preview"><Icon value={draft.icon} size={28} /><P.Button variant="outline" onClick={() => { setChoice(draft.icon); setTab('emoji'); setCategory('全部'); setPick(true); setQuery(''); }}>更换图标…</P.Button></div>{draft.id && snapshot.groups.length === 1 && <div className="nq-empty">至少保留一个组，最后一个组不能删除。</div>}{error && <div role="alert" className="nq-error">{error}</div>}</div>}
        </P.Modal>
        <P.Modal open={removal !== null} onClose={cancelRemoval} closeLabel="关闭" title="删除组" footer={<><P.Button data-modal-autofocus variant="outline" disabled={deleting} onClick={cancelRemoval}>取消</P.Button><P.Button variant="primary" disabled={deleting || !removal || (snapshot?.groups.length ?? 0) < 2} onClick={() => void confirmRemoval()}>{deleting ? '删除中…' : '确认删除'}</P.Button></>}>
            <div className="nq-form"><p>确认删除“{removal?.name}”？</p><p>只删除分组及其成员关系，工作区和会话会保留。</p>{snapshot?.groups.length === 1 && <div role="status">至少保留一个组，最后一个组不能删除。</div>}{deleteError && <div role="alert" className="nq-error">{deleteError}</div>}</div>
        </P.Modal>
        <P.Modal open={pick} onClose={() => setPick(false)} closeLabel="关闭" title="选择组图标" className="nq-picker-modal" footer={<><Icon value={choice} /><P.Button variant="outline" onClick={() => setPick(false)}>取消</P.Button><P.Button variant="primary" onClick={() => { setDraft({ ...draft, icon: choice }); setRecent([choice, ...recent.filter((v) => v !== choice)].slice(0, 16)); setPick(false); }}>使用图标</P.Button></>}>
            <div className="nq-picker">
                <div className="nq-tabs">{[['emoji', 'Emoji'], ['icons', '图标']].map(([id, label]) => <P.Button key={id} variant={tab === id ? 'primary' : 'outline'} onClick={() => { setTab(id); setCategory('全部'); }}>{label}</P.Button>)}</div>
                <P.Input data-modal-autofocus aria-label="搜索图标" placeholder="搜索图标或 Emoji" value={query} onChange={(e: any) => setQuery(e.target.value)} />
                <div className="nq-tabs">{categories.map((name: any) => <P.Button key={name} variant={category === name ? 'primary' : 'outline'} onClick={() => setCategory(name)}>{name}</P.Button>)}</div>
                <div className="nq-grid">{filtered.map(([value, label]) => <P.Tooltip key={value} label={label}><button type="button" className="nq-choice" aria-label={label} aria-pressed={choice === value} onClick={() => setChoice(value)}><Icon value={value} size={24} /></button></P.Tooltip>)}</div>
                {filtered.length === 0 && <div role="status">没有匹配结果 <P.Button variant="outline" onClick={() => { setQuery(''); setCategory('全部'); }}>清空搜索</P.Button></div>}
                {tab === 'emoji' && <label>自定义 Emoji<P.Input className="nq-emoji-input" aria-label="自定义 Emoji" placeholder="可粘贴完整 Emoji，例如 👩🏽‍💻" value={/^Icon|^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(choice) ? '' : choice} onChange={(e: any) => { const values = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(e.target.value.trim())]; if (values.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|^[0-9#*]\ufe0f?\u20e3$/u.test(values[0].segment)) setChoice(values[0].segment); }} /></label>}
            </div>
        </P.Modal>
    </>;
}
type GroupRoots = Map<string, string[]>;
type GroupActivity = Map<string, Map<string, boolean>>;
type GroupCounts = Map<string, { running: number; pending: number; unread: number }>;
function sameMap<T>(left: Map<string, T>, right: Map<string, T>, equal: (a: T, b: T) => boolean = Object.is): boolean {
    if (left === right) return true;
    if (left.size !== right.size) return false;
    for (const [id, value] of left) if (!right.has(id) || !equal(value, right.get(id)!)) return false;
    return true;
}
function selectGroupRoots(data: any, workspaces: any[]): GroupRoots {
    const roots = new Map<string, Set<string>>(data.groups.map((group: any) => [group.id, new Set<string>()]));
    for (const workspace of workspaces) {
        for (const groupId of membership(data, workspace.workspaceId)) {
            const ids = roots.get(groupId);
            if (ids) for (const id of workspace.sessionIds) ids.add(id);
        }
    }
    return new Map([...roots].map(([id, sessions]) => [id, [...sessions].sort()]));
}
function sameGroupRoots(left: GroupRoots, right: GroupRoots): boolean {
    return sameMap(left, right, (a, b) => a.length === b.length && a.every((id, index) => id === b[index]));
}
function selectGroupActivity(roots: GroupRoots, sessions: any): GroupActivity {
    return new Map([...roots].map(([groupId, parents]) => {
        const ids = new Set(parents);
        for (const id of parents) {
            const catalog = sessions.projectionsBySession?.[id]?.values?.subagentCatalog;
            if (catalog) for (const item of Object.values(catalog) as any[]) if (item?.id) ids.add(item.id);
        }
        return [groupId, new Map([...ids].map((id) => [id, sessions.byId?.[id]?.running === true]))];
    }));
}
function sameGroupActivity(left: GroupActivity, right: GroupActivity): boolean {
    return sameMap(left, right, (a, b) => sameMap(a, b));
}
function selectGroupCounts(activity: GroupActivity, statuses: Map<string, any>): GroupCounts {
    return new Map([...activity].map(([groupId, sessions]) => {
        let running = 0, pending = 0, unread = 0;
        for (const [id, fallbackRunning] of sessions) {
            const status = statuses.get(id);
            if ((status?.running ?? fallbackRunning) === true) running++;
            if (status?.pendingInteraction) pending++;
            if (status?.completionUnread) unread++;
        }
        return [groupId, { running, pending, unread }];
    }));
}
function sameGroupCounts(left: GroupCounts, right: GroupCounts): boolean {
    return sameMap(left, right, (a, b) => a.running === b.running && a.pending === b.pending && a.unread === b.unread);
}
function groupIndicator(counts: { running: number; pending: number; unread: number }) {
    const state = counts.pending ? 'wait' : counts.running ? 'busy' : counts.unread ? 'done' : 'idle';
    return { state, showBadge: state === 'wait' || state === 'done' };
}
function observeViewport(element: HTMLDivElement, onWidth: (width: number) => void) {
    let active = true;
    const measure = () => { if (active) onWidth(element.getBoundingClientRect().width); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => { active = false; observer.disconnect(); };
}
// Share one observer across the footer glyphs; visibility changes never drive React frames.
function observeGlyphMotion(element: HTMLDivElement) {
    const glyphs = element.querySelectorAll<HTMLElement>(".nq-group>.nq-glyph");
    const syncVisibility = () => { element.dataset.documentHidden = String(document.hidden); };
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) (entry.target as HTMLElement).dataset.inViewport = String(entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0);
    }, { root: element });
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    glyphs.forEach((glyph) => observer.observe(glyph));
    return () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", syncVisibility);
        delete element.dataset.documentHidden;
        glyphs.forEach((glyph) => { delete glyph.dataset.inViewport; });
    };
}
function Footer(props: any) {
    const data = useData();
    if (!data || data.mode !== 'groups' || !props.wide) return null;
    return <GroupFooter {...props} data={data} />;
}
function GroupFooter({ data, ...props }: any) {
    const roots = props.useWorkspaces(useCallback((s: any) => selectGroupRoots(data, s.items), [data]), sameGroupRoots);
    const activity = props.useSessions(useCallback((s: any) => selectGroupActivity(roots, s), [roots]), sameGroupActivity);
    const countsByGroup = props.useSessionStatus(useCallback((s: Map<string, any>) => selectGroupCounts(activity, s), [activity]), sameGroupCounts);
    const viewport = useRef(null as HTMLDivElement | null);
    const [width, setWidth] = useState(0);
    const dragged = useRef(null as string | null);
    const originalOrder = useRef([] as string[]);
    const previewOrder = useRef(null as string[] | null);
    const dragPointer = useRef(null as number | null);
    const dropTarget = useRef(null as { targetId: string; placement: 'before' | 'after' } | null);
    const suppressClickUntil = useRef(0);
    const scrollFrame = useRef(0);
    const scrollDirection = useRef(0);
    const scrollTime = useRef(0);
    const positions = useRef(new Map<string, { left: number; top: number }>());
    const animations = useRef(new Set<Animation>());
    const reducedMotion = useRef(false);
    const [dragId, setDragId] = useState(null as string | null);
    const [previewIds, setPreviewIds] = useState(null as string[] | null);
    const [drop, setDrop] = useState(null as { targetId: string; placement: 'before' | 'after' } | null);
    const [viewportElement, setViewportElement] = useState(null as HTMLDivElement | null);
    const cancelAnimations = useCallback(() => {
        animations.current.forEach((animation: Animation) => animation.cancel());
        animations.current.clear();
    }, []);
    const capturePositions = useCallback(() => {
        const next = new Map<string, { left: number; top: number }>();
        if (!reducedMotion.current) viewport.current?.querySelectorAll<HTMLElement>('.nq-cell').forEach((cell) => {
            const id = cell.dataset.groupId!;
            if (id !== dragged.current) {
                const rect = cell.getBoundingClientRect();
                next.set(id, { left: rect.left, top: rect.top });
            }
        });
        positions.current = next;
        cancelAnimations();
    }, [cancelAnimations]);
    const updatePreview = useCallback((clientX: number) => {
        const sourceId = dragged.current;
        const element = viewport.current;
        if (!sourceId || !element) return;
        const cells = [...element.querySelectorAll<HTMLElement>('.nq-cell')].map((cell) => {
            const rect = cell.getBoundingClientRect();
            return { id: cell.dataset.groupId!, left: rect.left, width: rect.width };
        });
        const target = groupDropTarget(cells, sourceId, clientX);
        const next = target ? moveGroup(originalOrder.current, sourceId, target.targetId, target.placement) : originalOrder.current.slice();
        const previous = previewOrder.current;
        if (!previous || next.length !== previous.length || next.some((id, index) => id !== previous[index])) {
            capturePositions();
            previewOrder.current = next;
            setPreviewIds(next);
        }
        if (target?.targetId !== dropTarget.current?.targetId || target?.placement !== dropTarget.current?.placement) {
            dropTarget.current = target;
            setDrop(target);
        }
    }, [capturePositions]);
    const stopScroll = useCallback(() => {
        if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = 0;
        scrollDirection.current = 0;
        scrollTime.current = 0;
    }, []);
    const scrollStep = useCallback((time: number) => {
        const element = viewport.current;
        if (!element || !scrollDirection.current) { stopScroll(); return; }
        if (scrollTime.current) element.scrollLeft += scrollDirection.current * Math.min(time - scrollTime.current, 50) * 0.14;
        scrollTime.current = time;
        if (dragPointer.current !== null) updatePreview(dragPointer.current);
        scrollFrame.current = requestAnimationFrame(scrollStep);
    }, [stopScroll, updatePreview]);
    const steer = useCallback((e: any) => {
        const element = viewport.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const direction = element.scrollWidth > rect.width ? e.clientX < rect.left + 14 ? -1 : e.clientX > rect.right - 14 ? 1 : 0 : 0;
        if (!direction) { stopScroll(); return; }
        scrollDirection.current = direction;
        if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(scrollStep);
    }, [stopScroll, scrollStep]);
    const finishDrag = useCallback(() => {
        if (dragged.current) {
            suppressClickUntil.current = performance.now() + 200;
            capturePositions();
        }
        dragged.current = null;
        originalOrder.current = [];
        previewOrder.current = null;
        dragPointer.current = null;
        dropTarget.current = null;
        setDragId(null);
        setPreviewIds(null);
        setDrop(null);
        stopScroll();
    }, [capturePositions, stopScroll]);
    const insideViewport = useCallback((clientX: number, clientY: number) => {
        const rect = viewport.current?.getBoundingClientRect();
        return !!rect && rect.width > 0 && rect.height > 0 && Number.isFinite(clientX) && Number.isFinite(clientY) && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }, []);
    const attachViewport = useCallback((element: HTMLDivElement | null) => {
        viewport.current = element;
        setViewportElement(element);
        if (!element) { finishDrag(); cancelAnimations(); positions.current.clear(); setWidth(0); }
    }, [finishDrag, cancelAnimations]);
    // Bind to the actual node, including after the sidebar or group view reopens.
    useLayoutEffect(() => {
        if (viewportElement) return observeViewport(viewportElement, setWidth);
    }, [viewportElement]);
    useLayoutEffect(() => {
        if (viewportElement) return observeGlyphMotion(viewportElement);
    }, [viewportElement, data.groups]);
    useLayoutEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncMotion = () => {
            reducedMotion.current = media.matches;
            if (media.matches) { cancelAnimations(); positions.current.clear(); }
        };
        syncMotion();
        media.addEventListener('change', syncMotion);
        return () => { media.removeEventListener('change', syncMotion); cancelAnimations(); };
    }, [cancelAnimations]);
    useLayoutEffect(() => {
        const previous = positions.current;
        positions.current = new Map();
        if (!reducedMotion.current) viewport.current?.querySelectorAll<HTMLElement>('.nq-cell').forEach((cell) => {
            const from = previous.get(cell.dataset.groupId!);
            if (!from) return;
            const rect = cell.getBoundingClientRect();
            const x = from.left - rect.left, y = from.top - rect.top;
            if ((!x && !y) || typeof cell.animate !== 'function') return;
            const animation = cell.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
            animations.current.add(animation);
            animation.onfinish = () => { animations.current.delete(animation); };
        });
        return cancelAnimations;
    }, [previewIds, viewportElement, cancelAnimations]);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && dragged.current) { event.preventDefault(); finishDrag(); } };
        const outsideDrop = (event: DragEvent) => {
            if (dragged.current && (!viewport.current?.contains(event.target as Node) || !insideViewport(event.clientX, event.clientY))) finishDrag();
        };
        document.addEventListener('keydown', escape, true);
        document.addEventListener('drop', outsideDrop, true);
        document.addEventListener('dragend', finishDrag, true);
        return () => {
            document.removeEventListener('keydown', escape, true);
            document.removeEventListener('drop', outsideDrop, true);
            document.removeEventListener('dragend', finishDrag, true);
            dragged.current = null;
            originalOrder.current = [];
            previewOrder.current = null;
            dragPointer.current = null;
            dropTarget.current = null;
            positions.current.clear();
            stopScroll();
            cancelAnimations();
        };
    }, [finishDrag, insideViewport, stopScroll, cancelAnimations]);
    useEffect(() => { viewport.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [data?.activeGroupId]);
    const groups = arrangeGroups(data.groups, previewIds || groupOrder) as any[];
    const compact = width < groups.length * 30;
    return <div className="nq-footer"><div ref={attachViewport} className={`nq-viewport ${compact ? 'nq-compact' : ''}`} onPointerMove={steer} onPointerLeave={stopScroll}
        onDragLeave={(e: any) => { if (!e.currentTarget.contains(e.relatedTarget)) stopScroll(); }}
        onDragOver={(e: any) => {
            if (!dragged.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            dragPointer.current = e.clientX;
            updatePreview(e.clientX);
            steer(e);
        }}
        onDrop={(e: any) => {
            if (!dragged.current) return;
            e.preventDefault();
            e.stopPropagation();
            if (insideViewport(e.clientX, e.clientY)) {
                updatePreview(e.clientX);
                if (dropTarget.current && previewOrder.current) persistGroupOrder(previewOrder.current);
            }
            finishDrag();
        }}><div className="nq-track">{groups.map((group: any, index: number) => {
        const counts = countsByGroup.get(group.id)!;
        const { state, showBadge } = groupIndicator(counts);
        const label = `${group.name} · ${counts.running} 个处理中，${counts.pending} 个等待操作，${counts.unread} 个完成未读`;
        return <div key={group.id} className="nq-cell" data-group-id={group.id} data-selected={group.id === data.activeGroupId} data-dragging={dragId === group.id} data-drop={drop?.targetId === group.id ? drop.placement : undefined}>
            <P.Tooltip portal label={label} side="top"><button type="button" className="nq-group" draggable aria-label={label} aria-description="拖动或按 Alt 加左右方向键调整组顺序" aria-pressed={group.id === data.activeGroupId} data-state={state} data-busy={counts.running > 0} data-wait={counts.pending > 0}
                onDragStart={(e: any) => {
                    stopScroll();
                    cancelAnimations();
                    originalOrder.current = arrangeGroups(data.groups).map((item: any) => item.id);
                    dragged.current = group.id;
                    previewOrder.current = originalOrder.current.slice();
                    dragPointer.current = e.clientX;
                    dropTarget.current = null;
                    setPreviewIds(previewOrder.current);
                    setDragId(group.id);
                    setDrop(null);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-nestquay-group', group.id);
                    e.stopPropagation();
                }} onDragEnd={finishDrag}
                onClick={(e: any) => {
                    if (dragged.current || performance.now() < suppressClickUntil.current) { e.preventDefault(); e.stopPropagation(); return; }
                    fire({ action: 'preferences', activeGroupId: group.id });
                }} onFocus={(e: any) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
                onKeyDown={(e: any) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                    e.preventDefault();
                    if (dragged.current) return;
                    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                        const target = groups[index + (e.key === 'ArrowRight' ? 1 : -1)];
                        if (target) persistGroupOrder(moveGroup(groups.map((item: any) => item.id), group.id, target.id, e.key === 'ArrowRight' ? 'after' : 'before'));
                        return;
                    }
                    const buttons = [...viewport.current!.querySelectorAll('button')] as HTMLButtonElement[];
                    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].focus();
                }}>
                <span className="nq-glyph" aria-hidden="true"><span className="nq-glyph-base"><Icon value={group.icon} size={16} /></span>{counts.running > 0 && <span className="nq-running-sweep"><Icon value={group.icon} size={16} /></span>}</span><span className="nq-dot" aria-hidden="true"><span className="nq-dot-pulse" /></span>{showBadge && <span className="nq-badge" aria-hidden="true" />}
            </button></P.Tooltip></div>;
    })}</div></div><P.Tooltip label="新建组"><button type="button" className="nq-icon-button" aria-label="新建组" onClick={() => showEditor()}><P.IconPlusOutlineRegular size={18} /></button></P.Tooltip></div>;
}
function Root(props: any) {
    const data = useData();
    const workspaces = props.useWorkspaces((s: any) => s.items);
    const bridge = useMemo(() => {
        const { workspaceVisible, sessionVisible, showUngrouped } = groupVisibility(data, workspaces);
        return { Heading, workspaceVisible, sessionVisible, searchSources: (list: any, remote: any) => filterSearchSources(list, remote, sessionVisible), showUngrouped,
            workspaceMenu: (workspaceId: string) => !data || !workspaceId ? [] : [{ id: 'nestquay-add', label: '添加到组', submenu: data.groups.map((g: any) => ({ id: `nestquay-add:${g.id}`, label: g.name, icon: <span className="nq-menu-icon"><Icon value={g.icon} size={16} /></span>, disabled: membership(data, workspaceId).includes(g.id) })) }, ...(data.mode === 'groups' ? [{ id: `nestquay-remove:${data.activeGroupId}`, label: '从当前组移除' }] : [])],
            selectWorkspaceMenu: (id: string, workspaceId: string) => { if (!id.startsWith('nestquay-')) return false; const [action, groupId] = id.split(':'); if (groupId) fire({ action: action === 'nestquay-add' ? 'add' : 'remove', groupId, workspaceId }); return true; },
        };
    }, [data, workspaces]);
    const renderSlot = useCallback((key: string, owner: any, options: any) => props.renderSlot(`nestquay.${key}`, owner, options), [props.renderSlot]);
    return <div className="nq-root"><BridgeContext.Provider value={bridge}><Browser {...props} renderSlot={renderSlot} /></BridgeContext.Provider>{failure && <div role="alert" className="nq-error">{failure}<button className="nq-icon-button" aria-label="重试加载分组" onClick={() => fire({ action: 'list' })}>↻</button></div>}<GroupDialogs /></div>;
}
function mirrorSlotEntries(slots: any, key: string): () => void {
    const mirrored = new Map<any, () => void>();
    const sync = () => {
        const entries = slots.entriesOfSlot(key);
        const live = new Set(entries);
        for (const [entry, dispose] of mirrored) {
            if (!live.has(entry)) { dispose(); mirrored.delete(entry); }
        }
        for (const entry of entries) {
            if (!mirrored.has(entry)) mirrored.set(entry, slots.register({ name: `nestquay.${key}`, ...entry.options, store: entry.store, inject: entry.inject, locale: entry.locale, select: entry.select }, entry.component));
        }
    };
    sync();
    const unsubscribe = slots.subscribe(key, sync);
    return () => { unsubscribe(); mirrored.forEach((dispose) => dispose()); mirrored.clear(); };
}
export const inject = ['slots', 'locale', 'uiWorkspace'];
export function apply(ctx: any) {
    ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'dsh-nestquay'; style.textContent = css; document.head.appendChild(style); return () => style.remove(); });
    ctx.effect(() => { let stopped = false; const reload = () => { if (!stopped) fire({ action: 'list' }); }; reload(); window.addEventListener('focus', reload); const timer = setInterval(reload, 15000); const reorder = (event: StorageEvent) => { if (event.key === groupOrderKey || event.key === null) { groupOrder = readGroupOrder(); emit(); } }; window.addEventListener('storage', reorder); return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener('storage', reorder); }; });
    ctx.slots.inject('sidebar.workspaces', () => {
        let release: (() => void) | undefined;
        const disposers: (() => void)[] = [];
        const install = () => {
            if (release) return;
            const upstream = ctx.slots.entries('sidebar.workspaces').find((entry: any) => entry.children?.['sidebar.workspaces.directoryFlow'] && (entry.options.priority || 0) === 0);
            if (!upstream?.children || !upstream.inject || !upstream.store) return;
            const children: any = {};
            for (const [key, spec] of Object.entries(upstream.children)) children[`nestquay.${key}`] = spec;
            release = ctx.slots.register({ name: 'sidebar.workspaces', priority: -100, children, store: upstream.store, inject: upstream.inject, locale: upstream.locale }, Root);
            for (const key of Object.keys(upstream.children)) disposers.push(mirrorSlotEntries(ctx.slots, key));
        };
        const stopWatching = ctx.slots.subscribe('sidebar.workspaces', install);
        install();
        return () => { stopWatching(); disposers.reverse().forEach((dispose) => dispose()); release?.(); };
    });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'nestquay.groups', order: 900 }, Footer));
}
