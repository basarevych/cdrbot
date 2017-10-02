/**
 * /missed
 * @module bot/commands/missed-calls
 */
const NError = require('nerror');

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
     * @type {object}
     */
    get syntax() {
        return {
            missed: {
                main: /^\/missed_calls$/i
            },
        };
    }

    /**
     * Process command
     * @param {Commander} commander
     * @param {object} ctx
     * @param {object} scene
     * @return {Promise}
     */
    async process(commander, ctx, scene) {
        try {
            this._logger.debug(this.name, 'Processing');

            if (!ctx.user.authorized)
                return false;

            let match = commander.match(ctx.message.text, this.syntax);
            if (!match && !commander.hasAll(ctx.session.locale, ctx.message.text, 'пропущенные звонки'))
                return false;

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                await ctx.reply(ctx.i18n('acl_denied'));
                await scene.sendMenu(ctx);
                return true;
            }

            await this.sendPage(ctx, 1);
            return true;
        } catch (error) {
            this._logger.error(new NError(error, { ctx }, 'MissedCallsCommand.process()'));
        }
        return false;
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
                    result = `${ctx.i18n('missed_calls_title')} (${ctx.i18n('page_number', { num: page })}):\n\n`;
                    for (let i = 0; i < calls.data.length; i++) {
                        result += calls.data[i].calldate.format('DD.MM HH:mm');
                        result += ' ';
                        result += calls.data[i].src;
                        result += ' → ';
                        result += calls.data[i].dst;
                        result += ', ';
                        result += calls.data[i].disposition.toLowerCase();
                        result += '\n';
                    }
                    calls.message = result.trim();
                    calls.enablePager = true;
                } else {
                    calls.message = ctx.i18n('no_missed_calls');
                    calls.enablePager = false;
                }
                return calls;
            } catch (error) {
                this._logger.error(new NError(error, { ctx }, 'MissedCallsCommand.sendPage()'));
            }
        };

        return this._pager.sendPage(ctx, page);
    }
}

module.exports = MissedCallsCommand;
