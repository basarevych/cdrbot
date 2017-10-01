/**
 * /cdr_N
 * @module bot/commands/cdr
 */
const path = require('path');
const NError = require('nerror');
const { Markup } = require('telegraf');
const { Client } = require('ssh2');

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
     * @param {Util} util                                   Util service
     * @param {CdrRepository} cdrRepo                       CDR repository
     */
    constructor(app, config, logger, filer, util, cdrRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._filer = filer;
        this._util = util;
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
            'util',
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
            if (call.recordingfile) {
                let recordsPath = this._config.get('servers.bot.cdr.records_path');
                let remoteHost = this._config.get('servers.bot.cdr.remote_host');
                let remoteSftp = this._config.get('servers.bot.cdr.remote_sftp');
                if (remoteHost && remoteSftp) {
                    buffer = await this._download(
                        remoteHost,
                        remoteSftp,
                        recordsPath,
                        call.recordingfile
                    );
                } else {
                    await this._filer.process(
                        recordsPath,
                        async filename => {
                            if (path.basename(filename) === call.recordingfile)
                                buffer = await this._filer.lockReadBuffer(filename);
                            return !buffer;
                        },
                        async () => {
                            return !buffer;
                        }
                    );
                }
            }
            if (!buffer) {
                await ctx.reply('Файл не найден');
            } else {
                await ctx.replyWithAudio(
                    {
                        source: buffer,
                    },
                    {
                        performer: `${call.src} → ${call.dst}`,
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

    async _download(remoteHost, remoteSftp, recordsPath, name) {
        let tmpFile = '/tmp/' + this._util.getRandomString(32);
        let downloaded = await new Promise((resolve, reject) => {
            let conn1 = new Client();
            let conn2 = new Client();

            conn1.on('ready', () => {
                this._logger.debug(this.name, 'FIRST :: connection ready');
                conn1.exec(`nc ${remoteSftp.host} ${remoteSftp.port}`, (error, stream) => {
                    if (error) {
                        reject(new NError(error, 'CdrCommand._download()'));
                        return conn1.end();
                    }
                    conn2.connect({
                        sock: stream,
                        username: remoteSftp.username,
                        password: remoteSftp.password,
                    });
                });
            }).connect({
                host: remoteHost.host,
                port: remoteHost.port,
                username: remoteHost.username,
                password: remoteHost.password,
            });

            conn2.on('ready', () => {
                this._logger.debug(this.name, 'SECOND :: connection ready');
                conn2.exec(
                    'find',
                    [
                        recordsPath,
                        '-name', name
                    ],
                    (error, stream) => {
                        if (error) {
                            reject(new NError(error, 'CdrCommand._download()'));
                            conn2.end();
                            return conn1.end();
                        }
                        let result = '';
                        stream.on('end', () => {
                            if (!result.trim().length) {
                                conn2.end();
                                conn1.end();
                                return resolve(false);
                            }

                            this._logger.debug(this.name, `DOWNLOAD ${result}`);
                            conn2.sftp((error, sftp) => {
                                if (error) {
                                    reject(new NError(error, 'CdrCommand._download()'));
                                    conn2.end();
                                    return conn1.end();
                                }
                                sftp.fastGet(result, tmpFile, error => {
                                    if (error) {
                                        reject(new NError(error, 'CdrCommand._download()'));
                                        conn2.end();
                                        return conn1.end();
                                    }
                                    conn2.end();
                                    conn1.end();
                                    resolve(true);
                                });
                            });
                        }).on('data', data => {
                            result = data.toString();
                        });
                    }
                );
            });
        });

        let buffer = null;
        if (downloaded) {
            buffer = await this._filer.lockReadBuffer(tmpFile);
            await this._filer.remove(tmpFile);
        }
        return buffer;
    }
}

module.exports = CdrCommand;
