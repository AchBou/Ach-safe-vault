const test = require('node:test');
const assert = require('node:assert');
const E = require('../entries');

const base = { fb: { id: 'a', pwd: '1' }, gg: { id: 'b', pwd: '2' } };

test('add inserts and does not mutate the input', () => {
    const r = E.add(base, ' gh ', 'me', 'pw');
    assert.deepStrictEqual(Object.keys(r.data), ['fb', 'gg', 'gh']);
    assert.strictEqual(Object.keys(base).length, 2);
});

test('add rejects duplicates, blanks, reserved names, bad types and oversize', () => {
    assert.ok(E.add(base, 'fb', 'x', 'y').error);
    assert.ok(E.add(base, '   ', 'x', 'y').error);
    assert.ok(E.add(base, '__proto__', 'x', 'y').error);
    assert.ok(E.add(base, 'n', 1, 'y').error);
    assert.ok(E.add(base, 'n', 'x', 'y'.repeat(501)).error);
});

test('update edits in place and keeps position when renaming', () => {
    const r = E.update(base, 'fb', 'fb2', 'new', 'p');
    assert.deepStrictEqual(Object.keys(r.data), ['fb2', 'gg']);
    assert.deepStrictEqual(r.data.fb2, { id: 'new', pwd: 'p' });
});

test('update errors: missing entry and rename collision', () => {
    assert.strictEqual(E.update(base, 'nope', 'a', 'b', 'c').error, 'Entry not found');
    assert.strictEqual(E.update(base, 'fb', 'gg', 'b', 'c').error, 'That platform already exists');
});

test('update can keep the same platform name', () => {
    assert.deepStrictEqual(E.update(base, 'fb', 'fb', 'z', 'z').data.fb, { id: 'z', pwd: 'z' });
});

test('remove deletes and reports missing entries', () => {
    assert.deepStrictEqual(Object.keys(E.remove(base, 'fb').data), ['gg']);
    assert.strictEqual(E.remove(base, 'nope').error, 'Entry not found');
});

test('inherited property names are not treated as existing entries', () => {
    assert.strictEqual(E.remove(base, 'toString').error, 'Entry not found');
    assert.ok(E.add(base, 'hasOwnProperty', 'x', 'y').data);
});
