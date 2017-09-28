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

    get syntax() {
        return [
            [/^\/missed_calls$/i],
            [/пропущенные/i, /звонки/i],
        ];
    }

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

            let calls = await this._cdrRepo.getMissedCalls();
            let result;
            if (calls.length) {
                result = 'Пропущенные сегодня:\n\n';
                for (let i = 0; i < calls.length; i++) {
                    result += '<pre>';
                    result += String(i + 1).padStart(3, ' ');
                    result += ': ';
                    result += calls[i].calldate.format('HH:mm:ss');
                    result += ', ';
                    result += calls[i].src;
                    result += ' → ';
                    result += calls[i].dst;
                    result += ', ';
                    result += calls[i].disposition.toLowerCase();
                    result += '</pre>';
                    if (result.split('\n').length >= 30 && i < calls.length - 1) {
                        await ctx.replyWithHTML(result.trim());
                        result = '';
                    }
                    result += '\n';
                }
            } else {
                result = 'Сегодня еще не было пропущенных звонков';
            }
            await ctx.replyWithHTML(result.trim());
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
}

module.exports = MissedCallsCommand;
