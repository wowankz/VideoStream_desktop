// import {ServerStream} from './server-stream/server-stream'
import { ChromeHost } from './chrome-host';
import { Logger } from './services/logger';
// process.env.DEBUG = '*';
const log = new Logger('SVTSTV');

const chromeHost = new ChromeHost(new Logger('ChromeHost'));

// setTimeout(() => { process.exit(); }, 6000000);

process.on('exit', (code) => {
    chromeHost.stopUms();
});



