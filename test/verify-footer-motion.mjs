import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const executable = process.env.NESTQUAY_CHROMIUM;
if (!executable) throw new Error('NESTQUAY_CHROMIUM is required');
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', 'nestquay-dev', '--executable-path', executable, ...args], { encoding: 'utf8', timeout: 40000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function evaluate(code) {
    const value = JSON.parse(run('eval', code));
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
}
const key = 'dsh-nestquay:group-order:v1';
const original = evaluate(`(async()=>({metadata:await(await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})).json(),order:localStorage.getItem(${JSON.stringify(key)}),dark:matchMedia('(prefers-color-scheme: dark)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}))()`);
try {
    if (original.metadata.mode !== 'groups') run('find', 'role', 'button', 'click', '--name', '切换到工作区组');
    run('wait', '.nq-footer');
    run('set', 'media', original.dark ? 'dark' : 'light');
    const transition = evaluate(`(async()=>{
        const viewport=document.querySelector('.nq-viewport');window.__nqMotionStyle=viewport.getAttribute('style');viewport.style.maxWidth='130px';
        await new Promise(r=>setTimeout(r,60));
        const button=document.querySelector('.nq-cell:not([data-selected=true]) .nq-group');
        document.activeElement?.blur();
        button.parentElement.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));
        await new Promise(r=>setTimeout(r,240));
        const glyph=button.querySelector(':scope>.nq-glyph'),dot=button.querySelector('.nq-dot');
        const read=()=>({opacity:Number(getComputedStyle(glyph).opacity),scale:new DOMMatrixReadOnly(getComputedStyle(glyph).transform).a,dotOpacity:Number(getComputedStyle(dot).opacity),display:getComputedStyle(glyph).display});
        const before=read();button.focus();await new Promise(r=>setTimeout(r,55));const middle=read();await new Promise(r=>setTimeout(r,230));const after=read();
        button.blur();await new Promise(r=>setTimeout(r,250));
        const busy=document.querySelector('.nq-group[data-busy=true] .nq-dot-pulse');
        const breath=busy?{duration:getComputedStyle(busy).animationDuration,timing:getComputedStyle(busy).animationTimingFunction,transform:getComputedStyle(busy).transform}:null;
        return{before,middle,after,breath};
    })()`);
    assert.equal(transition.before.opacity, 0);
    assert.notEqual(transition.before.display, 'none');
    assert.ok(transition.middle.opacity > 0 && transition.middle.opacity < 1, 'glyph fades through an intermediate state');
    assert.ok(transition.middle.scale > transition.before.scale && transition.middle.scale < 1, 'glyph scales continuously around its center');
    assert.equal(transition.after.opacity, 1);
    assert.equal(transition.after.scale, 1);
    if (transition.breath) { assert.equal(transition.breath.duration, '2.8s'); assert.equal(transition.breath.transform, 'none'); }

    const drag = evaluate(`(async()=>{
        const viewport=document.querySelector('.nq-viewport');const cells=()=>Array.from(viewport.querySelectorAll('.nq-cell'));const ids=()=>cells().map(e=>e.dataset.groupId);const initial=ids();
        const source=cells()[0].querySelector('button'),sourceId=initial[0],target=cells()[2],rect=target.getBoundingClientRect();const pointer={clientX:rect.left+rect.width*.75,clientY:rect.top+rect.height/2};
        const transfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
        viewport.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,...pointer}));await new Promise(r=>setTimeout(r,40));
        const preview=ids(),savedBefore=localStorage.getItem(${JSON.stringify(key)});
        viewport.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,...pointer}));await new Promise(r=>setTimeout(r,40));
        const committed=ids(),saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));
        source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
        const nextSource=cells()[cells().length-1].querySelector('button'),nextRect=cells()[0].getBoundingClientRect();const cancelTransfer=new DataTransfer();
        nextSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:cancelTransfer}));
        viewport.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:cancelTransfer,clientX:nextRect.left+2,clientY:nextRect.top+10}));await new Promise(r=>setTimeout(r,30));
        const cancelPreview=ids();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));nextSource.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:cancelTransfer}));await new Promise(r=>setTimeout(r,30));
        return{initial,sourceId,preview,committed,savedBefore,saved,cancelPreview,cancelled:ids()};
    })()`);
    const expected = [drag.initial[1], drag.initial[2], drag.initial[0], ...drag.initial.slice(3)];
    assert.deepEqual(drag.preview, expected, 'siblings make space before drop');
    assert.equal(drag.savedBefore, original.order, 'preview must not persist');
    assert.deepEqual(drag.committed, expected);
    assert.deepEqual(drag.saved, expected);
    assert.notDeepEqual(drag.cancelPreview, expected);
    assert.deepEqual(drag.cancelled, expected, 'Escape restores last committed order');
    run('open', 'http://127.0.0.1:3080');run('wait', '.nq-footer');
    assert.deepEqual(evaluate(`Array.from(document.querySelectorAll('.nq-cell'),e=>e.dataset.groupId)`), expected);
    run('set', 'media', original.dark ? 'dark' : 'light', 'reduced-motion');
    const reduced = evaluate(`({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transition:getComputedStyle(document.querySelector('.nq-group>.nq-glyph')).transitionDuration,breathing:Array.from(document.querySelectorAll('.nq-dot-pulse'),e=>getComputedStyle(e).animationName)})`);
    assert.equal(reduced.reduced, true);
    assert.equal(reduced.transition, '0s');
    assert.ok(reduced.breathing.every(name => name === 'none'));
    const metadata = evaluate(`(async()=>await(await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})).json())()`);
    assert.deepEqual(metadata.groups, original.metadata.groups);
    assert.deepEqual(metadata.workspaceGroups, original.metadata.workspaceGroups);
    assert.equal(metadata.activeGroupId, original.metadata.activeGroupId, 'drag does not select another group');
    console.log(JSON.stringify({transition,dragPreview:true,dragCommit:true,dragCancel:true,refresh:true,reducedMotion:reduced,metadataUnchanged:true}));
} finally {
    run('set', 'media', original.dark ? 'dark' : 'light', ...(original.reduced ? ['reduced-motion'] : []));
    evaluate(`(async()=>{const value=${JSON.stringify(original.order)};if(value===null)localStorage.removeItem(${JSON.stringify(key)});else localStorage.setItem(${JSON.stringify(key)},value);if(${JSON.stringify(original.metadata.mode)}!=='groups')await fetch('/api/nestquay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preferences',mode:${JSON.stringify(original.metadata.mode)}})});return true;})()`);
    run('open', 'http://127.0.0.1:3080');
    console.log('Original display order and test browser preferences restored.');
}
