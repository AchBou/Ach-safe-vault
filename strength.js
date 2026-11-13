// Rough password strength hint (length + character variety). Not a guarantee.
// Loaded as a plain script in the pages and as a module in tests.
(function (root) {
    function passwordStrength(p) {
        if (typeof p !== 'string' || p.length === 0) return { level: -1, label: '' };
        if (p.length < 8) return { level: 0, label: 'Too short' };
        const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
        const score = classes + (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0);
        if (score <= 2) return { level: 1, label: 'Weak' };
        if (score <= 3) return { level: 2, label: 'Okay' };
        return { level: 3, label: 'Strong' };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { passwordStrength };
    else root.passwordStrength = passwordStrength;
})(typeof window !== 'undefined' ? window : globalThis);
