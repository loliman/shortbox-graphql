import crypto from "crypto";
import fs from "fs";
import {coverDir, wwwDir} from "../config/config";

export const storeFile = ({stream, filename}) => {
    let hash = crypto.createHash('sha256').update(filename).digest('hex');
    let path = wwwDir + '/' + coverDir + '/' + hash;

    return new Promise((resolve, reject) =>
        stream
            .on('error', error => {
                if (stream.truncated)
                    fs.unlinkSync(path);
                reject(error)
            })
            .pipe(fs.createWriteStream(path))
            .on('error', error => reject(error))
            .on('finish', () => resolve({hash}))
    )
};

export const deleteFile = (filename) => {
    fs.unlinkSync(wwwDir + filename);
};

export async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}