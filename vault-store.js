// Encrypted vault storage.
// File format (JSON): { v, salt, iv, tag, ct }, every value hex encoded.
// Key = scrypt(masterPassword, salt); cipher = AES-256-GCM.
// There is no separate password hash: a wrong password fails GCM authentication,
// so "unlock succeeds" means "the password is correct".
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32; // AES-256
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function deriveKey(password, salt) {
    return crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
}

function encrypt(key, salt, data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return {
        v: 1,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        ct: ciphertext.toString('hex'),
    };
}

// Writes to a temporary file first, then renames it over the target,
// so a crash can never leave a half-written vault behind.
function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tempFile = file + '.tmp';
    fs.writeFileSync(tempFile, content);
    fs.renameSync(tempFile, file);
}

function exists(file) {
    return fs.existsSync(file);
}

// Creates (or replaces) a vault file with a fresh salt.
// Returns the derived key, which the caller keeps in memory while unlocked.
function create(file, password, data = {}) {
    const salt = crypto.randomBytes(16);
    const key = deriveKey(password, salt);
    writeAtomic(file, JSON.stringify(encrypt(key, salt, data)));
    return key;
}

// Returns { key, data }, or null if the password is wrong or the file is corrupt.
function unlock(file, password) {
    try {
        const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
        const key = deriveKey(password, Buffer.from(stored.salt, 'hex'));
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(stored.ct, 'hex')), decipher.final()]);
        return { key, data: JSON.parse(plaintext.toString('utf8')) };
    } catch {
        return null;
    }
}

// Re-encrypts with an already-derived key (same salt, fresh IV).
function save(file, key, data) {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    writeAtomic(file, JSON.stringify(encrypt(key, Buffer.from(stored.salt, 'hex'), data)));
}

const isHex = (value, length) =>
    typeof value === 'string' && /^[0-9a-f]+$/i.test(value) && (length === undefined || value.length === length);

// Structure check only (it cannot check the password): does this look like a vault file we wrote?
function isValidFile(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) return false;
    try {
        const file = JSON.parse(buffer.toString('utf8'));
        return file.v === 1
            && isHex(file.salt, 32)
            && isHex(file.iv, 24)
            && isHex(file.tag, 32)
            && isHex(file.ct);
    } catch {
        return false; // not JSON
    }
}

module.exports = { exists, create, unlock, save, writeAtomic, isValidFile };
