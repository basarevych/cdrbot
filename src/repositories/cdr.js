/**
 * CDR repository
 * @module repositories/cdr
 */
const path = require('path');
const BaseRepository = require('arpen/src/repositories/mysql');

/**
 * CDR repository class
 */
class CdrRepository extends BaseRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {MySQL} mysql                         MySQL service
     * @param {Util} util                           Util service
     */
    constructor(app, mysql, util) {
        super(app, mysql, util);
        this._loadMethods(path.join(__dirname, 'cdr'));
    }

    /**
     * Service name is 'repositories.cdr'
     * @type {string}
     */
    static get provides() {
        return 'repositories.cdr';
    }

    /**
     * DB table name
     * @type {string}
     */
    static get table() {
        return 'cdr';
    }

    /**
     * Model name
     * @type {string}
     */
    static get model() {
        return 'cdr';
    }
}

module.exports = CdrRepository;
