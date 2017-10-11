/**
 * Cdrbot module
 * @module cdrbot/module
 */

/**
 * Module main class
 */
class CdrBotModule {
    /**
     * Create the module
     * @param {App} app                                     The application
     * @param {object} config                               Configuration
     */
    constructor(app, config) {
        this._app = app;
        this._config = config;
    }

    /**
     * Service name is 'modules.cdrbot'
     * @type {string}
     */
    static get provides() {
        return 'modules.cdrbot';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
        ];
    }
}

module.exports = CdrBotModule;
