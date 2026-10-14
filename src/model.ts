export type NestquayMode = 'groups' | 'workspaces';

export interface NestquayGroup {
    id: string;
    name: string;
    /** Builtin icon ID or one complete emoji grapheme. */
    icon: string;
}

export interface NestquayMetadata {
    version: 1;
    revision: number;
    groups: NestquayGroup[];
    defaultGroupId: string;
    /** Only explicit assignments are stored; absent workspaces belong to no group. */
    workspaceGroups: Record<string, string[]>;
    activeGroupId: string;
    mode: NestquayMode;
}

export type NestquayRequest =
    | { action: 'list' }
    | { action: 'create'; name: string; icon: string }
    | { action: 'update'; groupId: string; name?: string; icon?: string }
    | { action: 'delete'; groupId: string }
    | { action: 'add' | 'remove'; groupId: string; workspaceId: string }
    | { action: 'preferences'; activeGroupId?: string; mode?: NestquayMode };

export interface NestquayStorage {
    get(): unknown;
    set(value: NestquayMetadata): Promise<void>;
}

export class NestquayError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'NestquayError';
        this.code = code;
    }
}

function reject(code: string, message: string): never {
    throw new NestquayError(code, message);
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        reject('INVALID_INPUT', `${label} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
        reject('INVALID_INPUT', `${label} must be a non-empty string.`);
    }
    return value;
}

function groupName(value: unknown): string {
    return text(value, 'name').trim();
}

const emojiSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function validateIcon(value: unknown): string {
    const icon = text(value, 'icon');
    if (/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(icon)) {
        return icon;
    }
    const segments = Array.from(emojiSegmenter.segment(icon));
    if (segments.length !== 1 || !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(icon)) {
        reject('INVALID_INPUT', 'icon must be a builtin icon ID or one complete emoji.');
    }
    return icon;
}

function mode(value: unknown): NestquayMode {
    if (value !== 'groups' && value !== 'workspaces') {
        reject('INVALID_INPUT', 'mode must be groups or workspaces.');
    }
    return value;
}

function knownFields(value: Record<string, unknown>, allowed: string[]): void {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            reject('INVALID_INPUT', `Unexpected field: ${key}.`);
        }
    }
}

export function parseRequest(value: unknown): NestquayRequest {
    const input = record(value, 'request');
    switch (input.action) {
        case 'list':
            knownFields(input, ['action']);
            return { action: 'list' };
        case 'create':
            knownFields(input, ['action', 'name', 'icon']);
            return { action: 'create', name: groupName(input.name), icon: validateIcon(input.icon) };
        case 'update': {
            knownFields(input, ['action', 'groupId', 'name', 'icon']);
            if (input.name === undefined && input.icon === undefined) {
                reject('INVALID_INPUT', 'update requires name or icon.');
            }
            return {
                action: 'update',
                groupId: text(input.groupId, 'groupId'),
                ...(input.name !== undefined ? { name: groupName(input.name) } : {}),
                ...(input.icon !== undefined ? { icon: validateIcon(input.icon) } : {}),
            };
        }
        case 'delete':
            knownFields(input, ['action', 'groupId']);
            return { action: 'delete', groupId: text(input.groupId, 'groupId') };
        case 'add':
        case 'remove':
            knownFields(input, ['action', 'groupId', 'workspaceId']);
            return {
                action: input.action,
                groupId: text(input.groupId, 'groupId'),
                workspaceId: text(input.workspaceId, 'workspaceId'),
            };
        case 'preferences': {
            knownFields(input, ['action', 'activeGroupId', 'mode']);
            if (input.activeGroupId === undefined && input.mode === undefined) {
                reject('INVALID_INPUT', 'preferences requires activeGroupId or mode.');
            }
            return {
                action: 'preferences',
                ...(input.activeGroupId !== undefined ? { activeGroupId: text(input.activeGroupId, 'activeGroupId') } : {}),
                ...(input.mode !== undefined ? { mode: mode(input.mode) } : {}),
            };
        }
        default:
            return reject('INVALID_INPUT', 'Unknown Nestquay action.');
    }
}

export function initialMetadata(): NestquayMetadata {
    return {
        version: 1,
        revision: 0,
        groups: [{ id: 'default', name: '默认组', icon: 'folder' }],
        defaultGroupId: 'default',
        workspaceGroups: {},
        activeGroupId: 'default',
        mode: 'workspaces',
    };
}

/** Validate durable data without silently discarding invalid user metadata. */
export function parseMetadata(value: unknown): NestquayMetadata {
    const input = record(value, 'metadata');
    knownFields(input, ['version', 'revision', 'groups', 'defaultGroupId', 'workspaceGroups', 'activeGroupId', 'mode']);
    if (input.version !== 1 || !Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
        reject('INVALID_INPUT', 'Unsupported metadata version or revision.');
    }
    if (!Array.isArray(input.groups) || input.groups.length === 0) {
        reject('INVALID_INPUT', 'Metadata must contain at least one group.');
    }
    const groups = input.groups.map((value): NestquayGroup => {
        const group = record(value, 'group');
        knownFields(group, ['id', 'name', 'icon']);
        return { id: text(group.id, 'group.id'), name: groupName(group.name), icon: validateIcon(group.icon) };
    });
    const groupIds = new Set(groups.map((group) => group.id));
    if (groupIds.size !== groups.length) {
        reject('INVALID_INPUT', 'Group IDs must be unique.');
    }
    const defaultGroupId = text(input.defaultGroupId, 'defaultGroupId');
    const activeGroupId = text(input.activeGroupId, 'activeGroupId');
    if (!groupIds.has(defaultGroupId) || !groupIds.has(activeGroupId)) {
        reject('INVALID_INPUT', 'Default and active group IDs must reference existing groups.');
    }
    const entries = Object.entries(record(input.workspaceGroups, 'workspaceGroups')).map(([workspaceId, value]) => {
        text(workspaceId, 'workspaceId');
        if (!Array.isArray(value) || value.length === 0) {
            reject('INVALID_INPUT', 'Explicit workspace assignments must contain at least one group.');
        }
        const ids = value.map((id) => text(id, 'groupId'));
        if (new Set(ids).size !== ids.length || ids.some((id) => !groupIds.has(id))) {
            reject('INVALID_INPUT', 'Workspace assignments must reference unique existing groups.');
        }
        return [workspaceId, ids] as const;
    });
    return {
        version: 1,
        revision: input.revision as number,
        groups,
        defaultGroupId,
        workspaceGroups: Object.fromEntries(entries),
        activeGroupId,
        mode: mode(input.mode),
    };
}

/** Return explicit memberships without touching official workspace management. */
export function groupsForWorkspace(metadata: NestquayMetadata, workspaceId: string): string[] {
    const explicit = Object.hasOwn(metadata.workspaceGroups, workspaceId) ? metadata.workspaceGroups[workspaceId] : undefined;
    return explicit ? [...explicit] : [];
}

function requireGroup(metadata: NestquayMetadata, groupId: string): NestquayGroup {
    const group = metadata.groups.find((entry) => entry.id === groupId);
    if (!group) {
        reject('GROUP_NOT_FOUND', `Group not found: ${groupId}.`);
    }
    return group;
}

/** Pure immutable transition. Same-reference results are idempotent no-ops. */
export function reduceMetadata(metadata: NestquayMetadata, request: NestquayRequest, createId: () => string): NestquayMetadata {
    if (request.action === 'list') {
        return metadata;
    }
    const next = structuredClone(metadata);
    switch (request.action) {
        case 'create': {
            const id = text(createId(), 'generated groupId');
            if (next.groups.some((group) => group.id === id)) {
                reject('DUPLICATE_GROUP_ID', 'Generated group ID already exists.');
            }
            next.groups.push({ id, name: request.name, icon: request.icon });
            next.activeGroupId = id;
            next.mode = 'groups';
            break;
        }
        case 'update': {
            const group = requireGroup(next, request.groupId);
            if (request.name !== undefined) group.name = request.name;
            if (request.icon !== undefined) group.icon = request.icon;
            break;
        }
        case 'delete': {
            requireGroup(next, request.groupId);
            if (next.groups.length === 1) {
                reject('LAST_GROUP', 'Cannot delete the last group.');
            }
            next.groups = next.groups.filter((group) => group.id !== request.groupId);
            if (next.defaultGroupId === request.groupId) next.defaultGroupId = next.groups[0]!.id;
            if (next.activeGroupId === request.groupId) next.activeGroupId = next.defaultGroupId;
            next.workspaceGroups = Object.fromEntries(Object.entries(next.workspaceGroups).flatMap(([workspaceId, ids]) => {
                const remaining = ids.filter((id) => id !== request.groupId);
                return remaining.length > 0 ? [[workspaceId, remaining]] : [];
            }));
            break;
        }
        case 'add': {
            requireGroup(next, request.groupId);
            // All groups, including the default group, require explicit membership.
            const ids = Object.hasOwn(next.workspaceGroups, request.workspaceId) ? next.workspaceGroups[request.workspaceId]! : [];
            if (ids.includes(request.groupId)) return metadata;
            next.workspaceGroups = Object.fromEntries([
                ...Object.entries(next.workspaceGroups).filter(([workspaceId]) => workspaceId !== request.workspaceId),
                [request.workspaceId, [...ids, request.groupId]],
            ]);
            break;
        }
        case 'remove': {
            requireGroup(next, request.groupId);
            const ids = Object.hasOwn(next.workspaceGroups, request.workspaceId) ? next.workspaceGroups[request.workspaceId]! : [];
            if (!ids.includes(request.groupId)) return metadata;
            const remaining = ids.filter((id) => id !== request.groupId);
            next.workspaceGroups = Object.fromEntries([
                ...Object.entries(next.workspaceGroups).filter(([workspaceId]) => workspaceId !== request.workspaceId),
                ...(remaining.length > 0 ? [[request.workspaceId, remaining]] : []),
            ]);
            break;
        }
        case 'preferences':
            if (request.activeGroupId !== undefined) {
                requireGroup(next, request.activeGroupId);
                next.activeGroupId = request.activeGroupId;
            }
            if (request.mode !== undefined) next.mode = request.mode;
            break;
    }
    if (JSON.stringify(next) === JSON.stringify(metadata)) {
        return metadata;
    }
    if (metadata.revision === Number.MAX_SAFE_INTEGER) {
        reject('REVISION_EXHAUSTED', 'Metadata revision cannot be incremented.');
    }
    next.revision = metadata.revision + 1;
    return next;
}

/** All callers share this queue; publication follows a successful durable write. */
export class NestquayStore {
    private metadata: NestquayMetadata;
    private tail: Promise<void> = Promise.resolve();
    private closed = false;
    private readonly storage: NestquayStorage;
    private readonly createId: () => string;

    constructor(storage: NestquayStorage, createId: () => string) {
        this.storage = storage;
        this.createId = createId;
        this.metadata = parseMetadata(storage.get());
    }

    snapshot(): NestquayMetadata {
        return structuredClone(this.metadata);
    }

    async execute(input: unknown, signal?: AbortSignal): Promise<NestquayMetadata> {
        const request = parseRequest(input);
        if (this.closed) return Promise.reject(new NestquayError('CLOSED', 'Nestquay is closing.'));
        const task = this.tail.then(async () => {
            if (signal?.aborted) reject('ABORTED', 'Nestquay operation was cancelled before saving.');
            const next = reduceMetadata(this.metadata, request, this.createId);
            if (next !== this.metadata) {
                await this.storage.set(structuredClone(next));
                this.metadata = next;
            }
            return this.snapshot();
        });
        // A failed transaction must not poison later callers.
        this.tail = task.then(() => undefined, () => undefined);
        return task;
    }

    async close(): Promise<void> {
        this.closed = true;
        await this.tail;
    }
}
