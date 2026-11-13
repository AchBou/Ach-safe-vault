// Encrypted vault storage.
// File format (JSON): { v, salt, iv, tag, ct } — all hex.
// Key = scrypt(masterPassword, salt); cipher = AES-256-GCM.
// There is no separate password hash: a wrong password fails GCM authentication,
// so "unlock succeeds" == "password is correct".
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password, salt) {
    return crypto.scryptSync(password, salt, 32, SCRYPT);
}

function encrypt(key, salt, data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return {
        v: 1,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        ct: ct.toString('hex'),
    };
}

function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
}

function exists(file) {
    return fs.existsSync(file);
}

// Creates a new vault file. Returns the derived key (keep in memory while unlocked).
function create(file, password, data = {}) {
    const salt = crypto.randomBytes(16);
    const key = deriveKey(password, salt);
    writeAtomic(file, JSON.stringify(encrypt(key, salt, data)));
    return key;
}

// Returns { key, data } or null if the password is wrong / file is corrupt.
function unlock(file, password) {
    try {
        const f = JSON.parse(fs.readFileSync(file, 'utf8'));
        const salt = Buffer.from(f.salt, 'hex');
        const key = deriveKey(password, salt);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(f.tag, 'hex'));
        const pt = Buffer.concat([decipher.update(Buffer.from(f.ct, 'hex')), decipher.final()]);
        return { key, data: JSON.parse(pt.toString('utf8')) };
    } catch {
        return null;
    }
}

// Re-encrypts with an already-derived key (same salt, fresh IV).
function save(file, key, data) {
    const f = JSON.parse(fs.readFileSync(file, 'utf8'));
    writeAtomic(file, JSON.stringify(encrypt(key, Buffer.from(f.salt, 'hex'), data)));
}

// Structural check only (can't verify the password): is this a vault file we wrote?
const MAX_FILE_BYTES = 10 * 1024 * 1024;
function isValidFile(buffer) {
    try {
        if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) return false;
        const f = JSON.parse(buffer.toString('utf8'));
        const hex = (v, len) => typeof v === 'string' && /^[0-9a-f]*$/i.test(v) && (len === undefined || v.length === len);
        return f.v === 1 && hex(f.salt, 32) && hex(f.iv, 24) && hex(f.tag, 32) && hex(f.ct) && f.ct.length > 0;
    } catch {
        return false;
    }
}

module.exports = { exists, create, unlock, save, isValidFile };
