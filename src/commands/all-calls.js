/**
 * All calls
 * @module bot/commands/all-calls
 */
const moment = require('moment-timezone');
const NError = require('nerror');

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
     * @type {object}
     */
    get syntax() {
        return {
            all: {
                main: /^\/all_calls(.*)$/i,
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

            if (!ctx.user.authorized || commander.hasAll(ctx.session.locale, ctx.message.text, 'пропущенные'))
                return false;

            let match = commander.match(ctx.message.text, this.syntax);
            let today = commander.hasAll(ctx.session.locale, ctx.message.text, 'звонки за сегодня');
            let yesterday = commander.hasAll(ctx.session.locale, ctx.message.text, 'звонки за вчера');
            let when = commander.hasAll(ctx.session.locale, ctx.message.text, 'звонки за дату');
            if (!match && !today && !yesterday && !when)
                return false;

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                await ctx.reply(ctx.i18n('acl_denied'));
                await scene.sendMenu(ctx);
                return true;
            }

            if ((match && !match.all.main[1].trim()) || when) {
                ctx.reply(ctx.i18n('choose_date'), this._getCalendar(ctx));
            } else {
                let date;
                if (match) {
                    date = moment(match.all.main[1].trim());
                    if (!moment.isMoment(date))
                        return false;
                } else if (today) {
                    date = moment();
                } else if (yesterday) {
                    date = moment().subtract(1, 'days');
                }
                date = date.format('YYYY-MM-DD');
                await this.sendPage(ctx, 1, date);
            }
            return true;
        } catch (error) {
            this._logger.error(new NError(error, { ctx }, 'AllCallsCommand.process()'));
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
                    let result = `${extra} (${ctx.i18n('page_number', { num: page })}):\n\n`;
                    for (let i = 0; i < calls.data.length; i++) {
                        result += calls.data[i].calldate.format('DD.MM HH:mm');
                        result += ' ';
                        result += calls.data[i].src;
                        result += ' → ';
                        result += calls.data[i].dst;
                        result += ', ';
                        result += calls.data[i].disposition === 'ANSWERED'
                            ? `${calls.data[i].duration} ${ctx.i18n('seconds_short')}`
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
                    calls.message = ctx.i18n('no_calls', { date: date.format('YYYY-MM-DD') });
                    calls.enablePager = false;
                    return calls;
                }
            } catch (error) {
                this._logger.error(new NError(error, { ctx }, 'AllCallsCommand.sendPage()'));
            }
        };

        return this._pager.sendPage(ctx, page, date);
    }

    /**
     * Retrieve all calls calendar
     * @return {object}
     */
    _getCalendar(ctx) {
        if (this._calendar)
            return this._calendar.getCalendar(ctx);

        this._calendar = this._app.get('allCallsCalendar');
        this._calendar.handler = async (ctx, date) => {
            if (!ctx.user.authorized || !ctx.user.isAllowed(this._app.get('acl').get('cdr')))
                return;

            await this.sendPage(ctx, 1, date);
        };
        return this._calendar.getCalendar(ctx);
    }
}

module.exports = AllCallsCommand;
