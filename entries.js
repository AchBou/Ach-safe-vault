// Pure vault-entry logic (no Electron), so it can be unit tested.
// Every function returns { data } with a new object, or { error }.
const MAX_FIELD = 500;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

function clean(platform, id, pwd) {
    if (typeof platform !== 'string' || typeof id !== 'string' || typeof pwd !== 'string') return null;
    platform = platform.trim();
    if (!platform || RESERVED.has(platform)) return null;
    if ([platform, id, pwd].some((v) => v.length > MAX_FIELD)) return null;
    return { platform, entry: { id, pwd } };
}

const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);

function add(data, platform, id, pwd) {
    const c = clean(platform, id, pwd);
    if (!c) return { error: 'Invalid entry' };
    if (has(data, c.platform)) return { error: 'That platform already exists' };
    return { data: { ...data, [c.platform]: c.entry } };
}

// keeps the edited entry in its original position
function update(data, oldPlatform, platform, id, pwd) {
    const c = clean(platform, id, pwd);
    if (!c || typeof oldPlatform !== 'string') return { error: 'Invalid entry' };
    if (!has(data, oldPlatform)) return { error: 'Entry not found' };
    if (c.platform !== oldPlatform && has(data, c.platform)) return { error: 'That platform already exists' };
    const next = {};
    for (const [k, v] of Object.entries(data)) {
        if (k === oldPlatform) next[c.platform] = c.entry;
        else next[k] = v;
    }
    return { data: next };
}

function remove(data, platform) {
    if (typeof platform !== 'string') return { error: 'Invalid entry' };
    if (!has(data, platform)) return { error: 'Entry not found' };
    const { [platform]: _removed, ...rest } = data;
    return { data: rest };
}

module.exports = { add, update, remove };
