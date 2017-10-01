/**
 * All calls
 * @module bot/commands/all-calls
 */
const moment = require('moment-timezone');
const NError = require('nerror');
const { Markup } = require('telegraf');

/**
 * All calls command class
 */
class AllCallsCommand {
    /**
     * Create the module
     * @param {App} app                                     The application
     * @param {object} config                               Configuration
     * @param {Logger} logger                               Logger service
     * @param {CdrRepository} cdrRepo                       CDR repository
     */
    constructor(app, config, logger, cdrRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._cdrRepo = cdrRepo;
    }

    /**
     * Service name is 'bot.commands.allCalls'
     * @type {string}
     */
    static get provides() {
        return 'bot.commands.allCalls';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
            'logger',
            'repositories.cdr',
        ];
    }

    /**
     * Command name
     * @type {string}
     */
    get name() {
        return 'all_calls';
    }

    /**
     * Syntax getter
     * @type {Array}
     */
    get syntax() {
        return [
            [/^\/all_calls(.*)$/i],
            [/все/i, /звонки/i, /за +сегодня/i],
            [/все/i, /звонки/i, /за +вчера/i],
            [/все/i, /звонки/i, /за +дату/i]
        ];
    }

    /**
     * Process command
     * @param {Commander} commander
     * @param {object} ctx
     * @param {Array} match
     * @param {object} scene
     * @return {Promise}
     */
    async process(commander, ctx, match, scene) {
        try {
            this._logger.debug(this.name, 'Processing');

            if (!ctx.user.authorized)
                return false;

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                await ctx.reply('В доступе отказано');
                await scene.sendMenu(ctx);
                return true;
            }

            if ((match[0] && !match[0][0][1].trim()) || match[3]) {
                ctx.reply('Выберите дату', this._getCalendar());
            } else {
                let date;
                if (match[0]) {
                    date = moment(match[0][0][1].trim());
                    if (!moment.isMoment(date))
                        return false;
                } else if (match[1]) {
                    date = moment();
                } else if (match[2]) {
                    date = moment().subtract(1, 'days');
                }
                date = date.format('YYYY-MM-DD');
                await this.sendPage(ctx, 1, date);
            }
        } catch (error) {
            await this.onError(ctx, 'AllCallsCommand.process()', error);
        }
        return true;
    }

    /**
     * Register with the bot server
     * @param {Telegram} server                             Telegram server
     * @return {Promise}
     */
    async register(server) {
        server.commander.add(this);
    }

    /**
     * Log error
     * @param {object} ctx                                  Context object
     * @param {string} where                                Error location
     * @param {Error} error                                 The error
     * @return {Promise}
     */
    async onError(ctx, where, error) {
        try {
            this._logger.error(new NError(error, where));
            await ctx.replyWithHTML(
                `<i>Произошла ошибка. Пожалуйста, попробуйте повторить позднее.</i>`,
                Markup.removeKeyboard().extra()
            );
        } catch (error) {
            // do nothing
        }
    }

    /**
     * Send page
     * @return {object}
     */
    async sendPage(ctx, page, date) {
        if (this._pager)
            return this._pager.sendPage(ctx, page, date);

        this._pager = this._app.get('allCallsPager');
        this._pager.search = async (ctx, page, extra) => {
            try {
                if (!ctx.user.authorized || !ctx.user.isAllowed(this._app.get('acl').get('cdr')))
                    return { enablePager: false };

                let date = moment(extra);

                let infoOnly = !page;
                let calls = await this._cdrRepo.getAllCalls(date, infoOnly, page, 20);
                if (infoOnly) {
                    calls.enablePager = true;
                    return calls;
                }

                if (calls.data.length) {
                    let result = `${extra} (страница ${page}):\n\n`;
                    for (let i = 0; i < calls.data.length; i++) {
                        result += calls.data[i].calldate.format('DD.MM HH:mm');
                        result += ' ';
                        result += calls.data[i].src;
                        result += ' → ';
                        result += calls.data[i].dst;
                        result += ', ';
                        result += calls.data[i].disposition === 'ANSWERED'
                            ? `${calls.data[i].duration} сек.`
                            : calls.data[i].disposition.toLowerCase();
                        result += ' ';
                        if (calls.data[i].disposition === 'ANSWERED' && calls.data[i].recordingfile)
                            result += `/cdr_${calls.data[i].id.replace('.', '_')}`;
                        result += '\n';
                    }
                    calls.message = result.trim();
                    calls.enablePager = true;
                    return calls;
                } else {
                    calls.message = date.format('YYYY-MM-DD') + ' звонков не было';
                    calls.enablePager = false;
                    return calls;
                }
            } catch (error) {
                await this.onError(ctx, 'AllCallsCommand.print()', error);
            }
        };

        return this._pager.sendPage(ctx, page, date);
    }

    /**
     * Retrieve all calls calendar
     * @return {object}
     */
    _getCalendar() {
        if (this._calendar)
            return this._calendar.getCalendar();

        this._calendar = this._app.get('allCallsCalendar');
        this._calendar.handler = async (ctx, date) => {
            if (!ctx.user.authorized || !ctx.user.isAllowed(this._app.get('acl').get('cdr')))
                return;

            await this.sendPage(ctx, 1, date);
        };
        return this._calendar.getCalendar();
    }
}

module.exports = AllCallsCommand;
