/**
 * Missed calls
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
     * Service name is 'cdrbot.commands.missedCalls'
     * @type {string}
     */
    static get provides() {
        return 'cdrbot.commands.missedCalls';
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
     * Command name [_a-z0-9]
     * @type {string}
     */
    get name() {
        return 'missed_calls';
    }

    /**
     * Command priority
     * @type {number}
     */
    get priority() {
        return 110;
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
     * Menu action
     * @param {Commander} commander
     * @param {object} ctx
     * @param {object} scene
     * @return {Promise}
     */
    async action(commander, ctx, scene) {
        try {
            this._logger.debug(this.name, `Action ${ctx.from.id}`);

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr')))
                return;

            let extra = ctx.match[2];
            switch (extra) {
                case 'today':
                    await this.sendPage(ctx, scene, 1);
                    break;
            }
        } catch (error) {
            this._logger.error(new NError(error, { ctx }, 'MissedCallsCommand.action()'));
        }
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
            this._logger.debug(this.name, `Processing ${ctx.from.id}`);

            let match = commander.match(ctx.message.text, this.syntax);
            if (!match &&
                !commander.hasAll(ctx.session.locale, ctx.message.text, 'пропущенные') &&
                !commander.hasAny(ctx.session.locale, ctx.message.text, 'сегодня звонки'))
                return false;

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                await ctx.reply(ctx.i18n('acl_denied'), await scene.getBottomKeyboard(ctx));
                return true;
            }

            await this.sendPage(ctx, scene, 1);
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
        server.commander.addCommand(this);
    }

    /**
     * Send page
     * @param {object} ctx
     * @param {object} scene
     * @param {number} page
     * @return {object}
     */
    async sendPage(ctx, scene, page) {
        if (this._pager)
            return this._pager.sendPage(ctx, scene, page);

        this._pager = this._app.get('telegram.services.pager');
        this._pager.prefix = 'missed-calls-pager';

        this._pager.search = async (ctx, scene, page, extra) => {
            try {
                if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                    return {
                        message: ctx.i18n('acl_denied'),
                        keyboard: await scene.getBottomKeyboard(ctx),
                    };
                }

                let infoOnly = !page;
                let calls = await this._cdrRepo.getMissedCalls(infoOnly, page, 20);
                if (infoOnly)
                    return calls;

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
                    if (calls.totalPages === 1)
                        calls.keyboard = await scene.getBottomKeyboard(ctx);
                } else {
                    calls.message = ctx.i18n('no_missed_calls');
                    calls.keyboard = await scene.getBottomKeyboard(ctx);
                }
                return calls;
            } catch (error) {
                this._logger.error(new NError(error, { ctx }, 'MissedCallsCommand.sendPage()'));
            }
        };

        return this._pager.sendPage(ctx, scene, page);
    }
}

module.exports = MissedCallsCommand;
