/**
 * Repo-saved module configuration
 */
module.exports = {
    // Load module classes and services, path names
    autoload: [
        'src/module.js',
        'src/models',
        'src/repositories',
        'src/commands',
    ],

    // Translation directories
    i18n: [
        'src/i18n',
    ],
};
