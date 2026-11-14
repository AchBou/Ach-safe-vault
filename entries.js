// Vault entry rules. The data is an object shaped like { platform: { id, pwd } }.
// This file has no Electron code, so it can be unit tested directly.
//
// Every function returns a NEW object and never changes the one passed in:
//   { data }   on success
//   { error }  with a message the user can read
const MAX_FIELD_LENGTH = 500;
// Platform names that would change an object's prototype instead of adding a key.
const FORBIDDEN_PLATFORMS = ['__proto__', 'constructor', 'prototype'];

// Returns the trimmed, validated entry, or null if the input is not acceptable.
function validate(platform, id, pwd) {
    const allStrings = [platform, id, pwd].every((value) => typeof value === 'string');
    if (!allStrings) return null;

    const name = platform.trim();
    if (name === '' || FORBIDDEN_PLATFORMS.includes(name)) return null;
    if ([name, id, pwd].some((value) => value.length > MAX_FIELD_LENGTH)) return null;

    return { name, entry: { id, pwd } };
}

function add(data, platform, id, pwd) {
    const valid = validate(platform, id, pwd);
    if (!valid) return { error: 'Invalid entry' };
    if (Object.hasOwn(data, valid.name)) return { error: 'That platform already exists' };

    return { data: { ...data, [valid.name]: valid.entry } };
}

// Edits an entry (and optionally renames it) while keeping its position in the list.
function update(data, oldPlatform, platform, id, pwd) {
    const valid = validate(platform, id, pwd);
    if (!valid || typeof oldPlatform !== 'string') return { error: 'Invalid entry' };
    if (!Object.hasOwn(data, oldPlatform)) return { error: 'Entry not found' };

    const isRename = valid.name !== oldPlatform;
    if (isRename && Object.hasOwn(data, valid.name)) return { error: 'That platform already exists' };

    const updated = {};
    for (const [name, entry] of Object.entries(data)) {
        if (name === oldPlatform) updated[valid.name] = valid.entry;
        else updated[name] = entry;
    }
    return { data: updated };
}

function remove(data, platform) {
    if (typeof platform !== 'string') return { error: 'Invalid entry' };
    if (!Object.hasOwn(data, platform)) return { error: 'Entry not found' };

    const remaining = { ...data };
    delete remaining[platform];
    return { data: remaining };
}

module.exports = { add, update, remove };
