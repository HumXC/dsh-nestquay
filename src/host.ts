import { randomUUID } from 'node:crypto';
import { NestquayStore } from './model.js';
import { nestquayDomain, nestquayCommand, nestquayTool } from './index.js';

export const name = 'nestquay';
export const inject = ['storageDomain', 'webServer', 'commands', 'connection'];

/** Browser actions work even before any session/Agent exists. */
export async function apply(ctx: any): Promise<void> {
    await ctx.effect(async function* () {
        const domain = await ctx.storageDomain.open(nestquayDomain);
        yield () => domain.close();
        const store = new NestquayStore(domain.global, randomUUID);
        yield () => store.close();
        yield ctx.commands.register(nestquayCommand(store));
        ctx.inject(['tools'], (toolCtx: any) => {
            toolCtx.effect(() => toolCtx.tools.register(nestquayTool(store)));
        });
        yield ctx.webServer.register({
            kind: 'exact',
            path: '/api/nestquay',
            async handler(req: any, res: any) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                const reply = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
                const rejection = ctx.connection.requestRejection(req);
                if (rejection) { reply(rejection, { error: 'Authentication required' }); return; }
                if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); reply(405, { error: 'Method not allowed' }); return; }
                const origin = req.headers.origin;
                if (origin) {
                    try { if (new URL(origin).host !== req.headers.host) { reply(403, { error: 'Origin not allowed' }); return; } }
                    catch { reply(403, { error: 'Invalid origin' }); return; }
                }
                if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { reply(415, { error: 'JSON required' }); return; }
                try {
                    const chunks: Buffer[] = [];
                    let bytes = 0;
                    for await (const chunk of req) {
                        bytes += chunk.length;
                        if (bytes > 32768) { reply(413, { error: 'Request too large' }); return; }
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    }
                    const metadata = await store.execute(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                    reply(200, metadata);
                } catch (error: any) {
                    const code = error.code || (error instanceof SyntaxError ? 'INVALID_INPUT' : 'SAVE_FAILED');
                    reply(code === 'SAVE_FAILED' ? 500 : 400, { error: error.message || 'Group operation failed', code });
                }
            },
        });
    });
}
