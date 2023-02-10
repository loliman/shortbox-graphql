import server from "./core/server";
import {boot} from "./boot";

boot(async () => {
    let {url} = await server.listen();

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Server is up and running at " + url);
})