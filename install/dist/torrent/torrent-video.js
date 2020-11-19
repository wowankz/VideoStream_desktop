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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs_1 = __importDefault(require("fs"));
const timers_1 = require("timers");
const WebTorrent = require('webtorrent');
class TorrentVideo {
    constructor(log) {
        this.log = log;
        this.createEmptyFileOfSize = (fileName, size) => {
            return new Promise((resolve, reject) => {
                // Check size
                if (size < 0) {
                    reject("Error: a negative size doesn't make any sense");
                    return;
                }
                // Will do the processing asynchronously
                setTimeout(() => {
                    try {
                        // Open the file for writing; 'w' creates the file 
                        // (if it doesn't exist) or truncates it (if it exists)
                        const fd = fs_1.default.openSync(fileName, 'w');
                        if (size > 0) {
                            // Write one byte (with code 0) at the desired offset
                            // This forces the expanding of the file and fills the gap
                            // with characters with code 0
                            fs_1.default.writeSync(fd, Buffer.alloc(1), 0, 1, size - 1);
                        }
                        // Close the file to commit the changes to the file system
                        fs_1.default.closeSync(fd);
                        // Promise fulfilled
                        resolve(true);
                    }
                    catch (error) {
                        // Promise rejected
                        reject(error);
                    }
                    // Create the file after the processing of the current JavaScript event loop
                }, 0);
            });
        };
        this.client = new WebTorrent();
        this.server = undefined;
        this.torrentId = undefined;
        this.intervalWaitDownload = undefined;
    }
    addTorrent(torrentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.torrentId !== torrentId) {
                    this.log.info('=========== Add new torrent ==========');
                    this.log.info('=========== New torrent id : ' + torrentId);
                    this.log.info('=========== Current torrent id : ' + this.torrentId);
                    if (this.torrentId !== undefined) {
                        this.destroyTorrent();
                    }
                    this.torrentId = torrentId;
                }
                else {
                    const file = this.getFile();
                    this.log.info(' Torrent replay : ' + file.name);
                    try {
                        this.log.info('================ Start torrent dowmload ======================');
                        const wait = yield this.waitDownload(file);
                        if (wait) {
                            return file;
                        }
                    }
                    catch (error) {
                        this.log.error('Error client add : ' + JSON.stringify(error));
                        return null;
                    }
                }
                return yield new Promise((resolve, reject) => {
                    this.client.add(torrentId, { path: __dirname + '/../video' }, (torrent) => __awaiter(this, void 0, void 0, function* () {
                        this.log.info(' Torrent is ready >>> Name\'s torrent : ' + torrent.name);
                        this.torrent = torrent;
                        const file = yield this.onReady();
                        try {
                            this.log.info('================ Start torrent dowmload ======================');
                            const wait = yield this.waitDownload(file);
                            if (wait) {
                                resolve(file);
                            }
                        }
                        catch (error) {
                            this.log.error('Error client add : ' + JSON.stringify(error));
                            reject(null);
                        }
                    }));
                });
            }
            catch (error) {
                this.log.error('Error addTorrent : ' + JSON.stringify(error));
                return null;
            }
        });
    }
    waitDownload(file) {
        return new Promise((resolve, reject) => {
            try {
                this.intervalWaitDownload = timers_1.setInterval(() => {
                    const progress = (this.torrent.progress * 100).toFixed(1);
                    if (Number(progress) > 5) {
                        this.log.sendMessage('downloaded', progress);
                        clearInterval(this.intervalWaitDownload);
                        this.intervalWaitDownload = undefined;
                        resolve(true);
                    }
                    this.log.info('Download speed : ' + this.torrent.downloadSpeed / 1024 + ' Kb/s');
                    this.log.info('File was downloaded : ' + file.downloaded / 1024 / 1024 + ' Mb');
                    this.log.info('Torrent is downloaded : ' + progress + ' %');
                    this.log.sendMessage('downloaded', progress);
                }, 2000);
            }
            catch (error) {
                clearInterval(this.intervalWaitDownload);
                this.intervalWaitDownload = undefined;
                this.log.info('============= Download torrent error =================');
                this.log.error(JSON.stringify(error));
                reject(false);
            }
        });
    }
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.info('============= onReady start =============== ');
            const file = this.getFile();
            this.log.info('File was got with name : ' + file.name);
            try {
                this.log.info('Greate Full file : ' + path.join(__dirname, '..', 'video', file.name) + 'file size : ' + file.length);
                yield this.createEmptyFileOfSize(path.join(__dirname, '..', 'video', file.name), file.length);
            }
            catch (e) {
                this.log.error('onReady error : ' + JSON.stringify(e));
            }
            this.log.info('onReady end');
            return file;
        });
    }
    getFile() {
        this.log.info(' Get file of torrent ');
        const index = this.torrent.files.indexOf(this.torrent.files.reduce((a, b) => {
            return a.length > b.length ? a : b;
        }));
        this.indexTorrentFile = index;
        return this.torrent.files[index];
    }
    destroyTorrent() {
        this.torrent.destroy((error) => {
            this.log.info('========= Torrent start destroy ===========');
            if (error) {
                this.log.warn('ERROR destroy Torrent : ' + error);
                return;
            }
            if (this.intervalWaitDownload !== undefined) {
                clearInterval(this.intervalWaitDownload);
                this.intervalWaitDownload = undefined;
            }
            this.log.info('========= Torrent was destroyed ===========');
        });
    }
}
exports.TorrentVideo = TorrentVideo;
