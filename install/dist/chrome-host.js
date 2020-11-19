"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
process.stdin.setEncoding('utf8');
process.title = 'VideoSream_server';
const child_process = __importStar(require("child_process"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const torrent_video_1 = require("./torrent/torrent-video");
const logger_1 = require("./services/logger");
const rimraf = require('rimraf');
const cheerio = require('cheerio');
const struct = require('python-struct');
const logFile = fs.createWriteStream('./access.log');
const torrent = new torrent_video_1.TorrentVideo(new logger_1.Logger('Torrent'));
class ChromeHost {
    constructor(log) {
        this.log = log;
        this.WebAddr = '';
        this.oldNameTrack = null;
        this.umsLog = new logger_1.Logger('ums');
        this.statusRestart = false;
        this.run();
    }
    run() {
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
    getMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    // send message to chrome app
    sendMessage(action, message) {
        const mess = `{"action":"${action}","params":"${this.convertStrToHex(message)}"}`;
        process.stdout.write(struct.pack('I', mess.length));
        process.stdout.write(mess);
    }
    exit() {
        this.log.info('=== EXIT ===');
        process.kill(process.pid);
    }
    // stop UMS server
    stopUms() {
        this.ums.kill();
        this.sendMessage('umsIsRun', 'false');
        this.log.info('UMS server is stoped');
    }
    restart() {
        this.statusRestart = true;
        this.stopUms();
        this.oldNameTrack = null;
    }
    // star UMS server
    startUMS() {
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
                this.sendMessage('umsIsRun', 'true');
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
                this.startUMS();
                this.statusRestart = false;
            }
            else {
                this.sendMessage('umsIsRun', 'false');
                this.exit();
            }
            // this.log.sendMessage('umsClouse', 'true');
            // process.exit();
        });
    }
    httpGet(url) {
        const options = url_1.parse(url);
        options.method = 'GET';
        options.headers = {
            'Cookie': 'UMS=',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0',
            'User-Agent': this.userAgent,
            'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
            'Connection': 'keep-alive'
        };
        const httpTipes = { 'http:': http, 'https:': https };
        const httpTipe = httpTipes[options.protocol];
        this.log.info('httpGet >>> ' + url);
        return new Promise((resolve, reject) => {
            httpTipe.get(options, (res) => {
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
                }
                else if (!/^text\/html/.test(contentType)) {
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
                    }
                    catch (e) {
                        this.log.warn('ERROR cheerio.load : ' + e);
                    }
                });
            }).on('error', (e) => {
                this.log.warn(`Got error httpGet : ${e} URL : ${url}`);
            });
        });
    }
    play(url, renderer, resource) {
        return __awaiter(this, void 0, void 0, function* () {
            const self = this;
            switch (resource) {
                case 'LostFilm':
                    try {
                        this.log.info('Play LostFilm');
                        const file = yield torrent.addTorrent(url);
                        if (!file)
                            throw 'File is null';
                        this.nameTrack = path.parse(file.name).name;
                        // get path video
                        if (this.oldNameTrack !== path.parse(file.name).base) {
                            let pathTrack = null;
                            let i = 0;
                            do {
                                this.log.info('Get ID Video : ' + i + ' loop');
                                pathTrack = yield this.getIdVideo();
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
                                '&title=' + encodeURIComponent(this.nameTrack)).then((res) => { this.log.info('Res http play : ' + JSON.stringify(res)); });
                            this.oldNameTrack = path.parse(file.name).base;
                            return;
                        }
                        yield this.httpGet(this.WebAddr + '/bump/stop/' + renderer);
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
                                    rimraf(path.join(__dirname, 'video', name), (e) => {
                                        if (e) {
                                            self.log.info('Error delete file : ' + path.join(__dirname, 'video', name) + 'error : ' + e);
                                        }
                                        else {
                                            self.log.info('File was deleted : ' + path.join(__dirname, 'video', name));
                                        }
                                    });
                                }
                            });
                        }, 6500);
                        this.oldNameTrack = path.parse(file.name).base;
                    }
                    catch (e) {
                        this.log.warn(' ADD TORRENT  ERROR : ' + e);
                    }
                    break;
                default:
                    this.log.info('Can\'t play unknown resource : ' + resource);
            }
        });
    }
    getIdVideo() {
        return __awaiter(this, void 0, void 0, function* () {
            const self = this;
            self.log.info('Get page from url : ' + self.WebAddr + '/browse/0?str=VideoStream');
            let dom = yield self.httpGet(self.WebAddr + '/browse/0?str=VideoStream');
            return new Promise((resolve, reject) => {
                dom('#Folders a').each(function (i, elem) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const a = cheerio.load(this)('a');
                        if (a.attr('title') === 'VideoStream') {
                            self.log.info('Get page from url : ' + self.WebAddr + a.attr('href'));
                            dom = yield self.httpGet(self.WebAddr + a.attr('href'));
                            resolve(self.parseIdVideo(dom));
                        }
                    });
                });
            });
        });
    }
    parseIdVideo(dom) {
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
    convertStrToHex(str) {
        const txt = str;
        const del = ' ';
        const len = txt.length;
        if (len === 0) {
            return;
        }
        let hex = '';
        for (let i = 0; i < len; i++) {
            const a = txt.charCodeAt(i);
            let h = a.toString(16);
            if (h.length === 1) {
                h = '0' + h;
            }
            hex += h;
            if (i < len - 1) {
                hex += del;
            }
        }
        return hex;
    }
}
exports.ChromeHost = ChromeHost;
