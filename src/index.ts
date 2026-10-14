import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { CommandDefinition, CommandResult } from '@deepseek-ai/dsh-commands';
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import { initialMetadata, NestquayError, NestquayStore, parseMetadata } from './model.ts';
import type { NestquayMetadata } from './model.ts';

export const name = 'nestquay';
export const inject = ['commands', 'storageDomain'];

const metadataSchema = z.custom<NestquayMetadata>((value) => {
    try {
        parseMetadata(value);
        return true;
    } catch {
        return false;
    }
}, { message: 'Invalid Nestquay metadata.' });

export const nestquayDomain = {
    name: 'nestquay',
    version: 1,
    global: { schema: metadataSchema, initial: initialMetadata() },
    tables: {},
} satisfies DomainSpec;

function errorText(error: unknown): string {
    if (error instanceof NestquayError) {
        return JSON.stringify({ code: error.code, message: error.message });
    }
    return JSON.stringify({
        code: 'SAVE_FAILED',
        message: error instanceof Error ? error.message : String(error),
    });
}

/** The command and agent tool both execute the same store operation. */
export function nestquayCommand(store: NestquayStore): CommandDefinition {
    return {
        name: 'nestquay',
        description: 'Manage Nestquay workspace groups and retrieve their metadata snapshot.',
        input: { hint: 'JSON: {"action":"list"} or create/update/delete/add/remove/preferences' },
        async handler(invocation): Promise<CommandResult> {
            let input: unknown;
            try {
                input = JSON.parse(invocation.rawInput.trim() || '{"action":"list"}');
            } catch {
                return { kind: 'error', text: errorText(new NestquayError('INVALID_INPUT', 'Expected a JSON Nestquay request.')) };
            }
            try {
                const snapshot = await store.execute(input, invocation.signal);
                return { kind: 'success', text: JSON.stringify(snapshot) };
            } catch (error) {
                return { kind: 'error', text: errorText(error) };
            }
        },
    };
}

export function nestquayTool(store: NestquayStore): ToolDefinition {
    return {
        name: 'nestquay_groups',
        description: 'List and manage Nestquay group metadata. Returns the complete saved snapshot. Deleting a group preserves workspaces and falls orphaned memberships back to the default group.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'add', 'remove', 'preferences'] },
                name: { type: 'string', description: 'Non-empty group name; required for create, optional for update.' },
                icon: { type: 'string', description: 'Builtin icon ID or one complete emoji; required for create, optional for update.' },
                groupId: { type: 'string', description: 'Existing group ID; required for update/delete/add/remove.' },
                workspaceId: { type: 'string', description: 'Workspace ID; required for add/remove. Multiple explicit group memberships are allowed.' },
                activeGroupId: { type: 'string', description: 'Existing group ID to select; preferences only.' },
                mode: { type: 'string', enum: ['groups', 'workspaces'], description: 'Sidebar view to save; preferences only.' },
            },
            required: ['action'],
            additionalProperties: false,
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    version: { type: 'integer', const: 1 },
                    revision: { type: 'integer' },
                    groups: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { id: { type: 'string' }, name: { type: 'string' }, icon: { type: 'string' } },
                            required: ['id', 'name', 'icon'],
                            additionalProperties: false,
                        },
                    },
                    defaultGroupId: { type: 'string' },
                    workspaceGroups: { type: 'object', additionalProperties: true },
                    activeGroupId: { type: 'string' },
                    mode: { type: 'string', enum: ['groups', 'workspaces'] },
                },
                required: ['version', 'revision', 'groups', 'defaultGroupId', 'workspaceGroups', 'activeGroupId', 'mode'],
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute: (args, exec) => store.execute(args, exec.signal),
    };
}

export async function apply(ctx: Context): Promise<void> {
    await ctx.effect(async function* () {
        const domain = await ctx.storageDomain.open(nestquayDomain);
        // Register cleanup before starting consumers, including if later registration fails.
        yield () => domain.close();
        const store = new NestquayStore(domain.global, randomUUID);
        yield () => store.close();
        ctx.effect(() => ctx.commands.register(nestquayCommand(store)));
        ctx.inject(['tools'], (toolCtx) => {
            toolCtx.effect(() => toolCtx.tools.register(nestquayTool(store)));
        });
    });
}
