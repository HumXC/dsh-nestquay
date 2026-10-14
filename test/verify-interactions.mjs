import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const executable = process.env.NESTQUAY_CHROMIUM;
if (!executable) throw new Error('NESTQUAY_CHROMIUM is required');
function browser(...args) {
    try { return execFileSync('npx', ['--yes', 'agent-browser', '--session', 'nestquay-dev', '--executable-path', executable, ...args], { encoding: 'utf8', timeout: 40000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch (error) { throw new Error(error.stderr?.toString() || 'Browser command failed'); }
}
function evaluate(code) {
    const result = JSON.parse(browser('eval', code));
    if (typeof result !== 'string') return result;
    try { return JSON.parse(result); } catch { return result; }
}
const key = 'dsh-nestquay:group-order:v1';
const original = evaluate(`(async()=>({data:await(await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})).json(),order:localStorage.getItem(${JSON.stringify(key)}),sidebarStyle:document.querySelector('[data-slot="sidebar.resize"]')?.getAttribute('style')}))()`);
const ids = () => evaluate(`Array.from(document.querySelectorAll('.nq-cell'),e=>e.dataset.groupId)`);
let dialogOpen = false;
try {
    if (original.data.mode !== 'groups') browser('find', 'role', 'button', 'click', '--name', '切换到工作区组');
    browser('wait', '.nq-footer');
    const initial = ids();
    assert.ok(initial.length > 1);
    const first = '.nq-cell:first-child .nq-group';
    evaluate(`document.querySelector(${JSON.stringify(first)}).focus()`);
    browser('press', 'Alt+ArrowRight');
    const keyboard = ids();
    assert.deepEqual(keyboard, [initial[1], initial[0], ...initial.slice(2)]);
    evaluate(`(()=>{const target=document.createElement('span');target.id='nq-pointer-insertion-target';Object.assign(target.style,{position:'absolute',left:'0',top:'5px',width:'6px',height:'28px',zIndex:'5'});document.querySelector('.nq-cell:first-child').appendChild(target);})()`);
    try { browser('drag', '.nq-cell:nth-child(2) .nq-group', '#nq-pointer-insertion-target'); }
    finally { evaluate(`document.querySelector('#nq-pointer-insertion-target')?.remove()`); }
    assert.deepEqual(ids(), initial, 'native pointer drag moves the group back');
    browser('open', 'http://127.0.0.1:3080');
    browser('wait', '.nq-footer');
    assert.deepEqual(ids(), initial, 'display order survives refreshing the existing GUI');
    browser('find', 'role', 'button', 'click', '--name', '新建组'); dialogOpen = true;
    browser('wait', '.nq-form input');
    assert.equal(evaluate(`document.querySelector('.nq-preview .nq-emoji')?.textContent`), '📁');
    browser('find', 'role', 'button', 'click', '--name', '更换图标…');
    browser('wait', '.nq-picker');
    const picker = evaluate(`(()=>{const tabs=Array.from(document.querySelectorAll('.nq-picker>.nq-tabs:first-child button'),e=>e.textContent);const unselected=document.querySelector('.nq-choice[aria-pressed=false] .nq-emoji');const selected=document.querySelector('.nq-choice[aria-pressed=true] .nq-emoji');return{tabs,unselected:getComputedStyle(unselected).filter,selected:getComputedStyle(selected).filter}})()`);
    assert.deepEqual(picker.tabs, ['Emoji', '图标']);
    assert.equal(picker.unselected, 'none');
    assert.equal(picker.selected, 'none');
    const colorPixels = evaluate(`(async()=>{await document.fonts.load('42px NestquayEmoji');const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d');context.font='42px NestquayEmoji';context.fillText('😀',4,46);const pixels=context.getImageData(0,0,64,64).data;let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>60&&Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>25)colored++;return colored;})()`);
    assert.ok(colorPixels > 100, 'the selected font actually renders colored Emoji pixels');
    browser('screenshot', '/tmp/nestquay-emoji-picker.png');
    browser('press', 'Escape'); browser('press', 'Escape'); dialogOpen = false;
    const animation = evaluate(`(async()=>{const button=document.querySelector('.nq-group[data-busy=true]');if(!button)return{running:false};button.focus();const ring=button.querySelector('.nq-running-ring');const circles=Array.from(ring.querySelectorAll('circle'));const arc=circles.find(e=>getComputedStyle(e).animationName.includes('dash'));const start=getComputedStyle(arc).strokeDasharray;await new Promise(resolve=>setTimeout(resolve,400));const end=getComputedStyle(arc).strokeDasharray;const r=ring.getBoundingClientRect(),b=button.getBoundingClientRect();return{running:true,width:r.width,height:r.height,centerX:r.x+r.width/2-(b.x+b.width/2),centerY:r.y+r.height/2-(b.y+b.height/2),linecap:getComputedStyle(arc).strokeLinecap,stroke:getComputedStyle(arc).strokeWidth,animation:getComputedStyle(arc).animationName,dashChanges:start!==end,breathing:getComputedStyle(button.querySelector('.nq-dot-pulse')).animationName}})()`);
    if (animation.running) {
        assert.equal(animation.width, 30); assert.equal(animation.height, 30);
        assert.ok(Math.abs(animation.centerX) < .1 && Math.abs(animation.centerY) < .1);
        assert.equal(animation.linecap, 'round'); assert.equal(animation.stroke, '2px');
        assert.equal(animation.dashChanges, true); assert.equal(animation.breathing, 'nq-breathe');
    }
    browser('screenshot', '/tmp/nestquay-sidebar.png');
    const after = evaluate(`(async()=>await(await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})).json())()`);
    assert.deepEqual(after.groups, original.data.groups);
    assert.deepEqual(after.workspaceGroups, original.data.workspaceGroups);
    console.log(JSON.stringify({keyboardOrder:true,pointerDrag:true,refreshPersistence:true,picker,colorPixels,animation,metadataUnchanged:true}));
} catch (error) { console.error('Interaction check:', error.message); throw error; } finally {
    if (dialogOpen) { browser('press', 'Escape'); browser('press', 'Escape'); }
    evaluate(`(async()=>{
        const key=${JSON.stringify(key)},value=${JSON.stringify(original.order)};
        if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
        if(${JSON.stringify(original.data.mode)}!=='groups')await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preferences',mode:${JSON.stringify(original.data.mode)}})});
        return true;
    })()`);
    browser('open', 'http://127.0.0.1:3080');
    console.log('View and display order restored; existing groups and memberships were not modified.');
}
