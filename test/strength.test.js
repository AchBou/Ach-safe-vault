const test = require('node:test');
const assert = require('node:assert');
const { passwordStrength } = require('../strength');

test('strength levels', () => {
    assert.strictEqual(passwordStrength('').level, -1);
    assert.strictEqual(passwordStrength('abc').label, 'Too short');
    assert.strictEqual(passwordStrength('aaaaaaaa').label, 'Weak');
    assert.strictEqual(passwordStrength('Abcdefg1').label, 'Okay');
    assert.strictEqual(passwordStrength('Correct-Horse-Battery-9').label, 'Strong');
    assert.strictEqual(passwordStrength(undefined).level, -1);
});
