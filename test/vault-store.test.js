const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../vault-store');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vault-')), 'v.enc');

test('create then unlock round-trips data', () => {
    const f = tmp();
    V.create(f, 'correct horse', { a: { id: 'x', pwd: 'y' } });
    assert.deepStrictEqual(V.unlock(f, 'correct horse').data, { a: { id: 'x', pwd: 'y' } });
});

test('wrong password returns null', () => {
    const f = tmp();
    V.create(f, 'right-password');
    assert.strictEqual(V.unlock(f, 'wrong-password'), null);
});

test('file does not contain plaintext', () => {
    const f = tmp();
    V.create(f, 'right-password', { site: { id: 'alice', pwd: 'hunter2' } });
    const raw = fs.readFileSync(f, 'utf8');
    assert.ok(!raw.includes('alice') && !raw.includes('hunter2') && !raw.includes('site'));
});

test('tampered ciphertext is rejected', () => {
    const f = tmp();
    V.create(f, 'right-password', { a: 1 });
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.ct = (j.ct[0] === '0' ? '1' : '0') + j.ct.slice(1);
    fs.writeFileSync(f, JSON.stringify(j));
    assert.strictEqual(V.unlock(f, 'right-password'), null);
});

test('save re-encrypts with a fresh IV and keeps the same salt', () => {
    const f = tmp();
    const key = V.create(f, 'right-password', { a: 1 });
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    V.save(f, key, { b: 2 });
    const after = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.strictEqual(before.salt, after.salt);
    assert.notStrictEqual(before.iv, after.iv);
    assert.deepStrictEqual(V.unlock(f, 'right-password').data, { b: 2 });
});

test('unlock on a missing or corrupt file returns null', () => {
    assert.strictEqual(V.unlock(tmp(), 'x'), null);
    const f = tmp();
    fs.writeFileSync(f, 'not json');
    assert.strictEqual(V.unlock(f, 'x'), null);
});

test('isValidFile accepts our own files and rejects junk', () => {
    const f = tmp();
    V.create(f, 'right-password', { a: 1 });
    assert.strictEqual(V.isValidFile(fs.readFileSync(f)), true);
    assert.strictEqual(V.isValidFile(Buffer.from('not json')), false);
    assert.strictEqual(V.isValidFile(Buffer.from('{}')), false);
    assert.strictEqual(V.isValidFile(Buffer.from(JSON.stringify({ v: 2, salt: '', iv: '', tag: '', ct: '' }))), false);
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.salt = 'zz'.repeat(16);
    assert.strictEqual(V.isValidFile(Buffer.from(JSON.stringify(j))), false);
    assert.strictEqual(V.isValidFile('string'), false);
});

test('create over an existing file re-keys it (old password stops working)', () => {
    const f = tmp();
    V.create(f, 'old-password', { a: 1 });
    V.create(f, 'new-password', { a: 1 });
    assert.strictEqual(V.unlock(f, 'old-password'), null);
    assert.deepStrictEqual(V.unlock(f, 'new-password').data, { a: 1 });
});
