/**
 * Play CDR file
 * @module bot/commands/cdr
 */
const path = require('path');
const NError = require('nerror');
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
     * Service name is 'cdrbot.commands.cdr'
     * @type {string}
     */
    static get provides() {
        return 'cdrbot.commands.cdr';
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
     * Command name [_a-z0-9]
     * @type {string}
     */
    get name() {
        return 'cdr';
    }

    /**
     * Command priority
     * @type {number}
     */
    get priority() {
        return 100;
    }

    /**
     * Syntax getter
     * @type {object}
     */
    get syntax() {
        return {
            cdr: {
                main: /^\/cdr_([0-9_]+)$/i,
            }
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

            let match = commander.match(ctx.message.text, this.syntax);
            if (!match)
                return false;

            if (!ctx.user.isAllowed(this._app.get('acl').get('cdr'))) {
                await ctx.reply(ctx.i18n('acl_denied'), scene.getBottomKeyboard(ctx));
                return true;
            }

            let id = match.cdr.main[1].replace('_', '.');
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
                await ctx.reply(ctx.i18n('file_not_found'), scene.getBottomKeyboard(ctx));
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
            return true;
        } catch (error) {
            this._logger.error(new NError(error, { ctx }, 'CdrCommand.process()'));
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
                                        conn2.end();
                                        conn1.end();
                                        return resolve(false);
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
