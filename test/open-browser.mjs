import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

// Reuse the existing application's printed login URL. Never print or save it.
let guiPid;
for (const id of await readdir('/proc')) {
    if (!/^\d+$/.test(id)) continue;
    try {
        const argv = (await readFile(`/proc/${id}/cmdline`, 'utf8')).split('\0');
        if (argv.includes('web') && argv.some((value) => /dsh/.test(value)) && !argv.some((value) => /agent-browser/.test(value))) guiPid = id;
    } catch {}
}
if (!guiPid) throw new Error('Existing GUI process was not found');
let loginUrl;
for (const user of [true, false]) {
    let log;
    try {
        log = execFileSync('journalctl', [...(user ? ['--user'] : []), `_PID=${guiPid}`, '--no-pager', '-o', 'cat'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    } catch { continue; }
    const urls = log.match(/https?:\/\/[^\s\u001b]+/g) || [];
    for (const text of urls) {
        try {
            const value = new URL(text);
            if (value.hostname === '127.0.0.1' && value.port === '3080' && value.search) loginUrl = value.href;
        } catch {}
    }
    if (loginUrl) break;
}
if (!loginUrl) throw new Error('Existing GUI login URL was not found in its journal');
const base = ['--yes', 'agent-browser', '--session', 'nestquay-dev', '--executable-path', process.env.NESTQUAY_CHROMIUM];
if (!base.at(-1)) throw new Error('Chromium executable is required');
try {
    execFileSync('npx', [...base, 'open', loginUrl], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 });
} catch { throw new Error('Browser could not open the existing GUI login link'); }
console.log('Opened the existing GUI through its original login link; credentials were not logged.');
