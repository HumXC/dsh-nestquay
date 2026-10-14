import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const executable = process.env.NESTQUAY_CHROMIUM;
if (!executable) throw new Error('NESTQUAY_CHROMIUM is required');
const base = ['--yes', 'agent-browser', '--session', 'nestquay-dev', '--executable-path', executable];
function browser(...args) {
    try {
        return execFileSync('npx', [...base, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000, maxBuffer: 1024 * 1024 }).trim();
    } catch (error) {
        throw new Error(error.stderr?.toString() || 'Browser command failed');
    }
}
function evaluate(code) {
    let result = JSON.parse(browser('eval', code));
    if (typeof result === 'string') result = JSON.parse(result);
    return result;
}
const original = evaluate(`(async () => JSON.stringify(await (await fetch('/api/nestquay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })).json()))()`);
const defaultGroup = original.groups.find(group => group.id === original.defaultGroupId);
let dialogOpen = false;
try {
    if (original.mode !== 'groups') browser('find', 'role', 'button', 'click', '--name', '切换到工作区组');
    browser('wait', '--fn', 'document.querySelector(".nq-footer") !== null');
    evaluate(`document.querySelectorAll('.nq-group').forEach(button => { if (button.getAttribute('aria-label').startsWith(${JSON.stringify(defaultGroup.name + ' · ')})) button.click(); }); JSON.stringify(true)`);
    browser('wait', '--fn', 'document.querySelector(".nq-heading span")?.textContent === ' + JSON.stringify(defaultGroup.name));
    const footer = evaluate(`JSON.stringify((() => { const button = document.querySelector('.hHd-Xa_settingsArea button'); const icon = button.querySelector('svg'); const label = button.querySelector('[data-slot="settings.trigger"]>span'); const rect = icon.getBoundingClientRect(); return { iconWidth: rect.width, iconHeight: rect.height, labelDisplay: getComputedStyle(label).display, accessibleName: button.getAttribute('aria-label'), rows: document.querySelectorAll('.nq-root [role="treeitem"]').length }; })())`);
    assert.equal(footer.iconWidth, 20);
    assert.equal(footer.iconHeight, 20);
    assert.equal(footer.labelDisplay, 'none');
    assert.ok(footer.accessibleName);
    const defaultHasMembers = Object.values(original.workspaceGroups).some(ids => ids.includes(original.defaultGroupId));
    if (!defaultHasMembers) assert.equal(footer.rows, 0, 'unassigned workspaces must not appear in default group');
    browser('find', 'role', 'button', 'click', '--name', '新建组');
    dialogOpen = true;
    browser('wait', '--fn', 'document.querySelector(".nq-form input") !== null');
    const input = evaluate(`JSON.stringify((() => { const input = document.querySelector('.nq-form input'); const wrapper = input.parentElement; return { innerBorderWidth: getComputedStyle(input).borderTopWidth, wrapperBorderWidth: getComputedStyle(wrapper).borderTopWidth, focused: document.activeElement === input }; })())`);
    assert.equal(input.innerBorderWidth, '0px');
    assert.equal(input.wrapperBorderWidth, '1px');
    assert.equal(input.focused, true);
    browser('screenshot', '/tmp/nestquay-sidebar-new-group.png');
    console.log(JSON.stringify({ footer, input, defaultGroupExplicitOnly: !defaultHasMembers, screenshot: '/tmp/nestquay-sidebar-new-group.png' }));
} finally {
    if (dialogOpen) browser('press', 'Escape');
    evaluate(`(async () => { const response = await fetch('/api/nestquay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preferences', mode: ${JSON.stringify(original.mode)}, activeGroupId: ${JSON.stringify(original.activeGroupId)} }) }); if (!response.ok) throw new Error('Could not restore view preferences'); return JSON.stringify({ restored: true }); })()`);
    browser('open', 'http://127.0.0.1:3080');
    console.log('Original view preferences restored; no groups or memberships were created or removed.');
}
