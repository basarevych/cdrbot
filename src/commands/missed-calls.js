/**
 * /missed
 * @module bot/commands/missed-calls
 */
const NError = require('nerror');
const { Markup } = require('telegraf');

/**
 * Missed calls command class
 */
class MissedCallsCommand {
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
     * Service name is 'bot.commands.missedCalls'
     * @type {string}
     */
    static get provides() {
        return 'bot.commands.missedCalls';
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
        return 'missed_calls';
    }

    /**
     * Syntax getter
     * @type {Array}
     */
    get syntax() {
        return [
            [/^\/missed_calls$/i],
            [/пропущенные/i, /звонки/i],
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

            await this.sendPage(ctx, 1);
        } catch (error) {
            await this.onError(ctx, 'MissedCallsCommand.process()', error);
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
    async sendPage(ctx, page) {
        if (this._pager)
            return this._pager.sendPage(ctx, page);

        this._pager = this._app.get('missedCallsPager');
        this._pager.search = async page => {
            try {
                let infoOnly = !page;
                let calls = await this._cdrRepo.getMissedCalls(infoOnly, page, 20);
                if (infoOnly) {
                    calls.enablePager = true;
                    return calls;
                }

                let result;
                if (calls.data.length) {
                    result = `Пропущенные сегодня (страница ${page}):\n\n`;
                    for (let i = 0; i < calls.data.length; i++) {
                        result += '<pre>';
                        result += calls.data[i].calldate.format('HH:mm:ss');
                        result += ', ';
                        result += calls.data[i].src;
                        result += ' → ';
                        result += calls.data[i].dst;
                        result += ', ';
                        result += calls.data[i].disposition.toLowerCase();
                        result += '</pre>';
                        result += '\n';
                    }
                    calls.message = result.trim();
                    calls.enablePager = true;
                } else {
                    calls.message = 'Сегодня еще не было пропущенных звонков';
                    calls.enablePager = false;
                }
                return calls;
            } catch (error) {
                await this.onError(ctx, 'MissedCallsCommand.sendPage()', error);
            }
        };

        return this._pager.sendPage(ctx, page);
    }
}

module.exports = MissedCallsCommand;
