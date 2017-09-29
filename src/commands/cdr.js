/**
 * /cdr_N
 * @module bot/commands/cdr
 */
const path = require('path');
const NError = require('nerror');
const { Markup } = require('telegraf');

/**
 * CDR command class
 */
class CdrCommand {
    /**
     * Create the module
     * @param {App} app                                     The application
     * @param {object} config                               Configuration
     * @param {Logger} logger                               Logger service
     * @param {Filer} filer                                 Filer service
     * @param {CdrRepository} cdrRepo                       CDR repository
     */
    constructor(app, config, logger, filer, cdrRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._filer = filer;
        this._cdrRepo = cdrRepo;
    }

    /**
     * Service name is 'bot.commands.cdr'
     * @type {string}
     */
    static get provides() {
        return 'bot.commands.cdr';
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
            'filer',
            'repositories.cdr',
        ];
    }

    /**
     * Command name
     * @type {string}
     */
    get name() {
        return 'cdr';
    }

    /**
     * Syntax getter
     * @type {Array}
     */
    get syntax() {
        return [
            [/^\/cdr_([0-9_]+)$/i],
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

            let id = match[0][0][1].replace('_', '.');
            let calls = await this._cdrRepo.find(id);
            let call = calls.length && calls[0];
            if (!call)
                return false;

            let buffer = null;
            await this._filer.process(
                this._config.get('servers.bot.records_path'),
                async filename => {
                    if (path.basename(filename) === call.recordingfile)
                        buffer = await this._filer.lockReadBuffer(filename);
                    return !buffer;
                },
                async () => {
                    return !buffer;
                }
            );
            if (!buffer) {
                await ctx.reply('Файл не найден');
            } else {
                await ctx.replyWithAudio(
                    {
                        source: buffer,
                    },
                    {
                        performer: call.src,
                        title: call.calldate.format('YYYY-MM-DD HH:mm:ss'),
                    }
                );
            }
        } catch (error) {
            await this.onError(ctx, 'CdrCommand.process()', error);
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

module.exports = CdrCommand;
