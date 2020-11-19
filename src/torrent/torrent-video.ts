import { WebTorrent, Instance, Torrent, TorrentFile } from 'webtorrent';
import { Server } from 'http';
import { Logger } from '../services/logger';
import * as path from 'path';
import fs from 'fs';
import { setInterval } from 'timers';
import { rejects } from 'assert';
const WebTorrent = require('webtorrent');

export class TorrentVideo {
    protected client: Instance;
    protected server: Server;
    protected torrent: Torrent;
    protected indexTorrentFile: any;
    protected intervalWaitDownload: NodeJS.Timer | undefined;
    protected torrentId: string | undefined;

    constructor(protected log: Logger) {
        this.client = new WebTorrent();
        this.server = undefined;
        this.torrentId = undefined;
        this.intervalWaitDownload = undefined;
    }

    public async addTorrent(torrentId: string): Promise<TorrentFile | null> {
        try {
            if (this.torrentId !== torrentId) {
                this.log.info('=========== Add new torrent ==========');
                this.log.info('=========== New torrent id : ' + torrentId);
                this.log.info('=========== Current torrent id : ' + this.torrentId);

                if (this.torrentId !== undefined) {
                    this.destroyTorrent();
                }

                this.torrentId = torrentId;
            } else {
                const file = this.getFile();
                this.log.info(' Torrent replay : ' + file.name);
                try {
                    this.log.info('================ Start torrent dowmload ======================');
                    const wait = await this.waitDownload(file)
                    if (wait) {
                        return file;
                    }
                } catch (error) {
                    this.log.error('Error client add : ' + JSON.stringify(error));
                    return null;
                }

            }

            return await new Promise<TorrentFile | null>((resolve, reject) => {
                this.client.add(torrentId, { path: __dirname + '/../video' }, async (torrent) => {
                    this.log.info(' Torrent is ready >>> Name\'s torrent : ' + torrent.name);

                    this.torrent = torrent;
                    const file = await this.onReady();
                    try {
                        this.log.info('================ Start torrent dowmload ======================');
                        const wait = await this.waitDownload(file)
                        if (wait) {
                            resolve(file);
                        }
                    } catch (error) {
                        this.log.error('Error client add : ' + JSON.stringify(error));
                        reject(null);
                    }
                });
            });
        } catch (error) {
            this.log.error('Error addTorrent : ' + JSON.stringify(error));
            return null;
        }
    }

    protected waitDownload(file: TorrentFile) {

        return new Promise<boolean>((resolve, reject) => {
            try {
                this.intervalWaitDownload = setInterval(() => {
                    const progress = (this.torrent.progress * 100).toFixed(1);
                    if (Number(progress) > 5) {
                        this.log.sendMessage('downloaded', progress);
                        clearInterval(this.intervalWaitDownload);
                        this.intervalWaitDownload = undefined;
                        resolve(true);
                    }
                    this.log.info('Download speed : ' + this.torrent.downloadSpeed / 1024 + ' Kb/s')
                    this.log.info('File was downloaded : ' + file.downloaded / 1024 / 1024 + ' Mb');
                    this.log.info('Torrent is downloaded : ' + progress + ' %');

                    this.log.sendMessage('downloaded', progress);
                }, 2000);

            } catch (error) {
                clearInterval(this.intervalWaitDownload);
                this.intervalWaitDownload = undefined
                this.log.info('============= Download torrent error =================');
                this.log.error(JSON.stringify(error));
                reject(false);
            }
        });
    }

    protected async onReady() {
        this.log.info('============= onReady start =============== ');
        const file = this.getFile();
        this.log.info('File was got with name : ' + file.name);
        try {
            this.log.info('Greate Full file : ' + path.join(__dirname, '..', 'video', file.name) + 'file size : ' + file.length);
            await this.createEmptyFileOfSize(path.join(__dirname, '..', 'video', file.name), file.length);
        } catch (e) {
            this.log.error('onReady error : ' + JSON.stringify(e));
        }
        this.log.info('onReady end');
        return file;
    }

    protected getFile(): TorrentFile {
        this.log.info(' Get file of torrent ');
        const index = this.torrent.files.indexOf(this.torrent.files.reduce((a, b) => {
            return a.length > b.length ? a : b;
        }));
        this.indexTorrentFile = index;
        return this.torrent.files[index];
    }

    protected destroyTorrent() {
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

    protected createEmptyFileOfSize = (fileName: string, size: number) => {
        return new Promise((resolve, reject) => {
            // Check size
            if (size < 0) {
                reject("Error: a negative size doesn't make any sense")
                return;
            }

            // Will do the processing asynchronously
            setTimeout(() => {
                try {
                    // Open the file for writing; 'w' creates the file 
                    // (if it doesn't exist) or truncates it (if it exists)
                    const fd = fs.openSync(fileName, 'w');
                    if (size > 0) {
                        // Write one byte (with code 0) at the desired offset
                        // This forces the expanding of the file and fills the gap
                        // with characters with code 0
                        fs.writeSync(fd, Buffer.alloc(1), 0, 1, size - 1);
                    }
                    // Close the file to commit the changes to the file system
                    fs.closeSync(fd);

                    // Promise fulfilled
                    resolve(true);

                } catch (error) {
                    // Promise rejected
                    reject(error);
                }
                // Create the file after the processing of the current JavaScript event loop
            }, 0)
        });
    };
}
