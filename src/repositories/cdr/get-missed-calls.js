/**
 * CdrRepository.getMissedCalls()
 */
'use strict';

const moment = require('moment-timezone');
const NError = require('nerror');

/**
 * Find missed calls
 * @instance
 * @method getMissedCalls
 * @memberOf module:repositories/cdr~CdrRepository
 * @param {boolean} infoOnly                Retrieve data rows or not
 * @param {number} pageNumber               Page number
 * @param {number} pageSize                 Page size
 * @param {MySQLClient|string} [mysql]      Will reuse the MySQL client provided, or if it is a string then will
 *                                          connect to this instance of MySQL.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (infoOnly, pageNumber, pageSize, mysql) {
    try {
        let date = moment();
        let start = moment(date.format('YYYY-MM-DD') + ' 00:00:00.000');
        let end = moment(date.format('YYYY-MM-DD') + ' 23:59:59.999');

        let where = [
            'calldate >= ?',
            'calldate <= ?',
            'disposition != ?',
        ];
        let params = [
            start.tz('UTC').format(this._mysql.constructor.datetimeFormat),
            end.tz('UTC').format(this._mysql.constructor.datetimeFormat),
            'ANSWERED',
        ];
        let dstLimit = this._app.get('config').get('servers.bot.cdr.dst_limit');
        if (dstLimit && dstLimit.length) {
            where.push('dst IN ?');
            params.push(dstLimit);
        }

        let result = await this.search(
            {
                where: where,
                params: params,
                sort: ['calldate asc'],
                pageSize: pageSize,
                pageNumber: pageNumber,
                infoOnly: infoOnly,
            },
            mysql || 'cdr'
        );
        result.data = this.getModel(result.data);
        return result;
    } catch (error) {
        throw new NError(error, 'CdrRepository.getMissedCalls()');
    }
};
