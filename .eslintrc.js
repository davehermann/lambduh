module.exports = {
    "env": {
        "commonjs": true,
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "sourceType": "module",
        "ecmaVersion": 8,
    },
    "rules": {
        "indent": ["error", 4, { "SwitchCase": 1 }],
        "linebreak-style": ["error", "unix"],
        "no-console": ["warn"],
        "no-extra-boolean-cast": ["off"],
        "no-unused-vars": ["warn"],
        "quotes": ["warn", "backtick"],
        "semi": ["error", "always"]
    }
};
