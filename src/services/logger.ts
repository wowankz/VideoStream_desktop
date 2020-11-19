const struct = require('python-struct');
process.stdin.setEncoding('utf8');
export class Logger {
    private nameModuel: string;
    constructor(name: string) {
        this.nameModuel = name;
    }

    public info(message: string) {
        try {
            const data = JSON.stringify({ 'message': message.replace(/\'/g, '\"'), 'type': 'info', 'modul': this.nameModuel });
            this.sendMessage('log', data);
        } catch (err) {
            this.error(err);
        }
    }

    public warn(message: string) {
        try {
            const data = JSON.stringify({ 'message': message.replace(/\'/g, '\"'), 'type': 'warn', 'modul': this.nameModuel });
            this.sendMessage('log', data);
        } catch (err) {
            this.error(err);
        }
    }

    public error(message: string) {
        try {
            const data = JSON.stringify({ 'message': message.replace(/\'/g, '\"'), 'type': 'error', 'modul': this.nameModuel });
            this.sendMessage('log', data);
        } catch (err) {
            this.error(err);
        }
    }

    // send message to chrome app
    public sendMessage(action: string, message: string) {
        const mess = `{"action":"${action}","params":"${this.convertStrToHex(message)}"}`;
        process.stdout.write(struct.pack('I', mess.length));
        process.stdout.write(mess);
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
