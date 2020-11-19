process.stdin.setEncoding('utf8');
process.title = 'VideoSream_server';

import * as child_process from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { parse as parseUrl } from 'url';
import * as path from 'path';
import * as fs from 'fs';

import { TorrentVideo } from './torrent/torrent-video';
import { Logger } from './services/logger';
const rimraf = require('rimraf');


const cheerio = require('cheerio');
const struct = require('python-struct');

const logFile = fs.createWriteStream('./access.log');
const torrent = new TorrentVideo(new Logger('Torrent'));

export class ChromeHost {
    protected ums: child_process.ChildProcess;
    protected WebAddr: string;
    protected nameTrack: string;
    protected oldNameTrack: string;
    protected pathTrack: string;
    protected userAgent: string;
    protected umsLog: Logger;
    protected statusRestart: boolean;

    constructor(protected log: Logger) {
        this.WebAddr = '';
        this.oldNameTrack = null;
        this.umsLog = new Logger('ums');
        this.statusRestart = false;
        this.run();
    }

    protected run() {
        logFile.write('=== Start VideoStream_server ===');
        process.stdin.on('readable', () => {
            const chunk = process.stdin.read();
            if (chunk !== null) {
                const message = JSON.parse(chunk.slice(4).toString());
                this.getMessage(message);
            }
        });
        this.sendMessage('started', '');
    }

    // get massege from chrome app
    protected async getMessage(message: any) {

        switch (message.action) {
            case 'runUms':
                this.startUMS();
                this.userAgent = message.params;
                break;

            case 'play':
                this.log.info('Play start : ' + message.params.url);
                this.play(message.params.url, message.params.renderer, message.params.resource);
                break;

            case 'restart':
                this.restart();
                break;

            case 'exit':
                this.exit();
                break;

            default:
                this.log.warn('unknown action : ' + message.action);
        }
    }

    // send message to chrome app
    public sendMessage(action: string, message: string) {
        const mess = `{"action":"${action}","params":"${this.convertStrToHex(message)}"}`;
        process.stdout.write(struct.pack('I', mess.length));
        process.stdout.write(mess);
    }

    public exit() {
        this.log.info('=== EXIT ===');
        process.kill(process.pid);
    }

    // stop UMS server
    public stopUms() {
        this.ums.kill();
        this.sendMessage('umsIsRun', 'false');
        this.log.info('UMS server is stoped');
    }

    protected restart() {
        this.statusRestart = true;
        this.stopUms();
        this.oldNameTrack = null;
    }

    // star UMS server
    protected startUMS() {
        this.log.info('=== Start UMS server ===');
        logFile.write('=== Start UMS server ===');
        const spawn = child_process.spawn;
        const args = [
            '-Xmx768M',
            '-Djava.net.preferIPv4Stack=true',
            '-Dfile.encoding=UTF-8',
            '-Dums.profile.path=conf/UMS.conf',
            '-classpath', 'update.jar;ums.jar',
            'net.pms.PMS', 'console'
        ];

        this.ums = spawn('jre7\\bin\\javaw', args, { cwd: __dirname + '/ums', detached: true, env: process.env });
        this.ums.on('error', (err) => {
            this.log.error('Failed to start subprocess. == ' + err);
        });

        this.ums.stdout.on('data', (data) => {
            const dataString = data.toString();
            this.umsLog.info(dataString);
            logFile.write(dataString);

            if (dataString.indexOf('Starting services') + 1) {
                this.sendMessage('umsIsRun', 'true')
            }

            if (dataString.indexOf('close all other connection') + 1) {
                this.stopUms();
                this.sendMessage('umsIsRun', 'false');
                setTimeout(() => {
                    this.startUMS();
                }, 2000);
            }

            if (dataString.indexOf('WEB interface is available at:') + 1) {
                this.WebAddr = dataString.split(' ').pop().trim();
                this.log.sendMessage('addWebAddress', this.WebAddr);
            }
            // if (dataString.indexOf('End of analysis for WebToTV') + 1) {
            //     this.checkedWebToTv = true;
            // }
            if (dataString.indexOf('Reading RendererIcon:') + 1) {
                dataString.slice(66, 84).trim();
            }

        });

        this.ums.stderr.on('data', (data) => {
            const dataString = data.toString();
            this.umsLog.info(dataString);
            logFile.write(dataString);

        });

        this.ums.on('close', (code) => {
            this.log.error(`child process ums exited with code : ${code}`);
            if (this.statusRestart) {
                this.startUMS(); this.statusRestart = false;
            } else {
                this.sendMessage('umsIsRun', 'false');
                this.exit();
            }
            // this.log.sendMessage('umsClouse', 'true');
            // process.exit();
        });

    }

    protected httpGet(url: string): Promise<any> {
        const options: http.RequestOptions = parseUrl(url);
        options.method = 'GET';
        options.headers = {
            'Cookie': 'UMS=',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0',
            'User-Agent': this.userAgent,
            'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
            'Connection': 'keep-alive'
        };
        const httpTipes: { [name: string]: any } = { 'http:': http, 'https:': https };
        const httpTipe = httpTipes[options.protocol];
        this.log.info('httpGet >>> ' + url);
        return new Promise((resolve, reject) => {
            httpTipe.get(options, (res: http.IncomingMessage) => {
                const { statusCode } = res;
                const contentType = res.headers['content-type'];

                if (statusCode === 301 || statusCode === 302) {
                    this.log.info('redirect statusCode : ' + statusCode.toString());
                    this.httpGet(res.headers.location);
                    res.resume();
                    return;
                }

                let error;
                if (statusCode !== 200) {
                    error = new Error(`Request Failed from >>> ${url} : Status Code: ${statusCode}`);
                } else if (!/^text\/html/.test(contentType)) {
                    error = new Error('Invalid content-type >>> ' + `Expected application/json but received ${contentType}`);
                }

                if (error) {
                    this.log.warn('ERROR  : ' + error.message);
                    // consume response data to free up memory
                    res.resume();
                    reject(statusCode);
                }

                res.setEncoding('utf8');
                let Data = '';
                res.on('data', (chunk) => { Data += chunk; });
                res.on('end', () => {
                    try {
                        const dom = cheerio.load(Data);
                        resolve(dom);
                    } catch (e) {
                        this.log.warn('ERROR cheerio.load : ' + e);
                    }
                });
            }).on('error', (e: any) => {
                this.log.warn(`Got error httpGet : ${e} URL : ${url}`);
            });
        });
    }

    protected async play(url: string, renderer: string, resource: string) {
        const self = this;
        switch (resource) {
            case 'LostFilm':
                try {
                    this.log.info('Play LostFilm');
                    const file: any = await torrent.addTorrent(url);
                    if (!file) throw 'File is null';
                    this.nameTrack = path.parse(file.name).name;
                    // get path video
                    if (this.oldNameTrack !== path.parse(file.name).base) {
                        let pathTrack: string = null;
                        let i = 0;
                        do {
                            this.log.info('Get ID Video : ' + i + ' loop');
                            pathTrack = await this.getIdVideo();
                            this.pathTrack = pathTrack;
                            i++;

                        } while (!pathTrack && (i < 10));
                    }
                    // play or pause
                    if (this.oldNameTrack && this.oldNameTrack === path.parse(file.name).base) {
                        this.log.info('Play/Pause track  >>> resource : ' +
                            resource + 'URL : ' + this.WebAddr + '/bump/play/' + renderer +
                            '?uri=' + encodeURIComponent(this.pathTrack) +
                            '&title=' + encodeURIComponent(this.nameTrack));

                        this.httpGet(this.WebAddr + '/bump/play/' +
                            renderer +
                            '?uri=' + encodeURIComponent(this.pathTrack) +
                            '&title=' + encodeURIComponent(this.nameTrack)).then((res) => { this.log.info('Res http play : ' + JSON.stringify(res)) });

                        this.oldNameTrack = path.parse(file.name).base;
                        return;
                    }

                    await this.httpGet(this.WebAddr + '/bump/stop/' + renderer);
                    // wait stop renderer
                    setTimeout(() => {
                        this.log.info('Play track  >>> resource : ' +
                            resource + 'URL : ' + this.WebAddr + '/bump/play/' + renderer +
                            '?uri=' + encodeURIComponent(this.pathTrack) +
                            '&title=' + encodeURIComponent(this.nameTrack));

                        this.httpGet(this.WebAddr + '/bump/play/' +
                            renderer +
                            '?uri=' + encodeURIComponent(this.pathTrack) +
                            '&title=' + encodeURIComponent(this.nameTrack));
                    }, 2000);


                    setTimeout(() => {
                        fs.readdirSync(path.join(__dirname, 'video')).forEach(file => {
                            if (path.parse(file).name !== this.nameTrack) {
                                const name = path.parse(file).base;
                                rimraf(path.join(__dirname, 'video', name), (e: any) => {
                                    if (e) {
                                        self.log.info('Error delete file : ' + path.join(__dirname, 'video', name) + 'error : ' + e);
                                    } else {
                                        self.log.info('File was deleted : ' + path.join(__dirname, 'video', name));
                                    }
                                });
                            }

                        })

                    }, 6500);


                    this.oldNameTrack = path.parse(file.name).base;

                } catch (e) {
                    this.log.warn(' ADD TORRENT  ERROR : ' + e);
                }
                break;
            default:
                this.log.info('Can\'t play unknown resource : ' + resource);
        }
    }

    public async getIdVideo(): Promise<string> {
        const self = this;
        self.log.info('Get page from url : ' + self.WebAddr + '/browse/0?str=VideoStream');
        let dom: any = await self.httpGet(self.WebAddr + '/browse/0?str=VideoStream');

        return new Promise<string>((resolve, reject) => {
            dom('#Folders a').each(async function (i: number, elem: any) {
                const a = cheerio.load(this)('a');

                if (a.attr('title') === 'VideoStream') {
                    self.log.info('Get page from url : ' + self.WebAddr + a.attr('href'));
                    dom = await self.httpGet(self.WebAddr + a.attr('href'));
                    resolve(self.parseIdVideo(dom));
                }

            });
        });
    }

    protected parseIdVideo(dom: any): string {
        const self = this;
        let id = null;
        dom('#Media a').each(function () {
            const a = cheerio.load(this)('a');
            const href = a.attr('href');
            if (a.attr('title') === self.nameTrack) {
                self.log.info('Fined href  : [ Title : ' + a.attr('title') + ' URL : ' + a.attr('href') + ']');
                id = a.attr('href');
            }
        });
        self.log.info('Return Id video : ' + id);
        return id;
    }

    protected convertStrToHex(str: string): string {
        const txt = str;
        const del = ' ';
        const len = txt.length;
        if (len === 0) { return; }
        let hex = '';
        for (let i = 0; i < len; i++) {
            const a = txt.charCodeAt(i);
            let h = a.toString(16);
            if (h.length === 1) { h = '0' + h; }
            hex += h;
            if (i < len - 1) { hex += del; }
        }
        return hex;
    }
}



