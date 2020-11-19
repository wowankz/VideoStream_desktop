"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import {ServerStream} from './server-stream/server-stream'
const chrome_host_1 = require("./chrome-host");
const logger_1 = require("./services/logger");
// process.env.DEBUG = '*';
const log = new logger_1.Logger('SVTSTV');
const chromeHost = new chrome_host_1.ChromeHost(new logger_1.Logger('ChromeHost'));
// setTimeout(() => { process.exit(); }, 6000000);
process.on('exit', (code) => {
    chromeHost.stopUms();
});
