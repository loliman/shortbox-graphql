const Jetty = require("jetty");
import * as tty from "tty";

export class Logger {
    static jetty = new Jetty(process.stdout);
    static stickyLines = [];
    static loggedLines = 0;
    static MESSAGE_LIMIT = 200;

    static initialize() {
        Logger.jetty = new Jetty(process.stdout);
        Logger.jetty.reset().clear();
        Logger.jetty.moveTo([0,0]);
    }

    static async log(msg, stickyLine) {
        await Logger.logSync(msg, stickyLine);
    }

    static logSync(msg, stickyLine) {
        return new Promise(resolve => {
            let index = Logger.loggedLines;

            if(stickyLine) {
                if(!Logger.stickyLines.includes(stickyLine)) {
                    Logger.stickyLines.push(stickyLine);
                    Logger.jetty.text("\n");
                }

                index = Logger.loggedLines + Logger.stickyLines.indexOf(stickyLine);

                msg = "[" + stickyLine.toUpperCase() + "] " + msg
            } else {
                Logger.loggedLines++;
            }

            if(msg.length > Logger.MESSAGE_LIMIT) {
                msg = msg.substr(0, Logger.MESSAGE_LIMIT-3) + "...";
            }

            Logger.jetty.clearLine(index);
            Logger.jetty.moveTo([index, 0]).text(msg);

            resolve(true);
        });
    }
}