import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

export function resolveDshRoot() {
    if (process.env.NESTQUAY_DSH_ROOT) return resolve(process.env.NESTQUAY_DSH_ROOT);

    try {
        let directory = dirname(require.resolve('@deepseek-ai/dsh'));
        while (dirname(directory) !== directory) {
            const manifest = join(directory, 'package.json');
            if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@deepseek-ai/dsh') return directory;
            directory = dirname(directory);
        }
    } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
    }

    const globalModules = execFileSync('npm', ['root', '--global'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const globalRoot = join(globalModules, '@deepseek-ai/dsh');
    if (existsSync(join(globalRoot, 'package.json'))) return globalRoot;
    throw new Error('DSH installation not found. Install @deepseek-ai/dsh or set NESTQUAY_DSH_ROOT to its package directory.');
}
