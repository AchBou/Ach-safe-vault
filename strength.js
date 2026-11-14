// Rough password strength hint based on length and character variety. It is a guide, not a guarantee.
// Loaded with a <script> tag in the pages (the function becomes global) and with require() in the tests.
function passwordStrength(password) {
    if (typeof password !== 'string' || password.length === 0) return { level: -1, label: '' };
    if (password.length < 8) return { level: 0, label: 'Too short' };

    const characterTypes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
        .filter((pattern) => pattern.test(password)).length;
    const lengthBonus = (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0);
    const score = characterTypes + lengthBonus;

    if (score <= 2) return { level: 1, label: 'Weak' };
    if (score === 3) return { level: 2, label: 'Okay' };
    return { level: 3, label: 'Strong' };
}

if (typeof module !== 'undefined') module.exports = { passwordStrength };
