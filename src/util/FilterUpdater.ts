import {asyncForEach} from './util';

/*export async function update(stories, covers) {
    await asyncForEach(stories, async story => {
        let parent = await story.getParent();

        if(!parent || parent.length === 0)
            return;

        let children = await parent.getChildren();

        if(children.length > 0) {
            await updateOnlyApp(parent, children);
            await updateFirstApp(parent, children);
            await updateFirstPartly(parent, children);
            await updateFirstComplete(parent, children);
            await updateFirstMonochrome(parent, children);
            await updateFirstColoured(parent, children);
        }

        await updateOnlyTb(parent, children);
        await updateOnlyOnePrint(parent, children);
        await updateOnlyPartly(parent, children);
        await updateOnlyMonochrome(parent, children);

        await asyncForEach(children, async child => {
            await child.save();
        });
        await parent.save();
    });

    await asyncForEach(covers, async cover => {
        let parent = await cover.getParent();

        if(!parent || parent.length === 0)
            return;

        let children = await parent.getChildren();


        if(children.length === 0)
            return;

        await updateOnlyApp(parent, children);
        await updateFirstApp(parent, children);
        await updateFirstPartly(parent, children);
        await updateFirstComplete(parent, children);
        await updateFirstMonochrome(parent, children);
        await updateFirstColoured(parent, children);
        await updateFirstSmall(parent, children);
        await updateFirstFullsize(parent, children);
        await updateOnlyTb(parent, children);
        await updateOnlyOnePrint(parent, children);
        await updateOnlyPartly(parent, children);
        await updateOnlyMonochrome(parent, children);
        await updateOnlySmall(parent, children);

        await asyncForEach(children, async child => {
            await child.save();
        });
        await parent.save();
    })
}

async function updateOnlyApp(parent, children) {
    return new Promise(resolve => {
        children.forEach(child => {
            child.onlyapp = false;
        });

        if(children.length === 1)
            children[0].onlyapp = true;

        resolve(true);
    });
}

async function updateFirstApp(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstapp = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = 0;
        issues.forEach((issue, idx) => {
            if(issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                latestIdx = idx;
            }
        });

        children[latestIdx].firstapp = true;

        resolve(true);
    })
}

async function updateFirstPartly(parent, children) {
    return new Promise(async resolve => {
        await asyncForEach(children, async child => {
            if(child.pages) {
                let pages = pagesStringToArray(child.pages);

                await asyncForEach(pages, async page => {
                    let issues = [];

                    await asyncForEach(children, async child => {
                        child.firstpartly = false;
                        issues.push(await child.getIssue());
                    });

                    let latestIdx = -1;
                    issues.forEach((issue, idx) => {
                        if(children[idx].pages && children[idx].pages.indexOf("#" + page + "#")  > -1) {
                            if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                                latestIdx = idx;
                            }
                        }
                    });

                    if(latestIdx > -1)
                        children[latestIdx].firstpartly = true;
                })
            }
        });

        resolve(true);
    })
}

async function updateFirstComplete(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstcomplete = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = -1;
        issues.forEach((issue, idx) => {
            if(children[idx].pages === null) {
                if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                    latestIdx = idx;
                }
            }
        });

        if(latestIdx > -1)
            children[latestIdx].firstcomplete = true;

        resolve(true);
    })
}

async function updateFirstMonochrome(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstmonochrome = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = -1;
        issues.forEach((issue, idx) => {
            if(!children[idx].coloured) {
                if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                    latestIdx = idx;
                }
            }
        });

        if(latestIdx > -1)
            children[latestIdx].firstmonochrome = true;

        resolve(true);
    })
}

async function updateFirstColoured(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstcoloured = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = -1;
        issues.forEach((issue, idx) => {
            if(children[idx].coloured) {
                if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                    latestIdx = idx;
                }
            }
        });

        if(latestIdx > -1)
            children[latestIdx].firstcoloured = true;

        resolve(true);
    })
}

async function updateFirstSmall(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstsmall = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = -1;
        issues.forEach((issue, idx) => {
            if(!children[idx].fullsize) {
                if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                    latestIdx = idx;
                }
            }
        });

        if(latestIdx > -1)
            children[latestIdx].firstsmall = true;

        resolve(true);
    })
}

async function updateFirstFullsize(parent, children) {
    return new Promise(async resolve => {
        let issues = [];

        await asyncForEach(children, async child => {
            child.firstfullsize = false;
            issues.push(await child.getIssue());
        });

        let latestIdx = -1;
        issues.forEach((issue, idx) => {
            if(children[idx].fullsize) {
                if(latestIdx === -1 || issue.releasedate.getTime() <= issues[latestIdx].releasedate.getTime()) {
                    latestIdx = idx;
                }
            }
        });

        if(latestIdx > -1)
            children[latestIdx].firstfullsize = true;

        resolve(true);
    })
}

async function updateOnlyTb(parent, children) {
    return new Promise(async resolve => {
        let notTbCount = 0;
        let tbCount = 0;

        if(children.length > 0) {
            await asyncForEach(children, async child => {
                child.onlyTb = false;

                let issue = await child.getIssue();
                if (issue.format === "Taschenbuch")
                    tbCount++;
                else
                    notTbCount++;
            });
        }

        parent.onlytb = tbCount > 0 && notTbCount === 0;

        if(tbCount > 0 && notTbCount === 1) {
            await asyncForEach(children, async child => {
                let issue = await child.getIssue();
                if(issue.format !== "Taschenbuch")
                    child.onlytb = true;
            })
        }

        resolve(true)
    })
}

async function updateOnlyOnePrint(parent, children) {
    return new Promise(async resolve => {
        parent.onlyoneprint = children.length === 1;

        resolve(true)
    })
}

async function updateOnlyPartly(parent, children) {
    return new Promise(async resolve => {
        let partlyCount = 0;
        let completeCount = 0;
        await asyncForEach(children, async child => {
            if(child.pages)
                partlyCount++;
            else
                completeCount++;
        });

        parent.onlypartly = partlyCount > 0 && completeCount === 0;

        resolve(true)
    })
}

async function updateOnlyMonochrome(parent, children) {
    return new Promise(async resolve => {
        let monochromeCount = 0;
        let colouredCount = 0;
        await asyncForEach(children, async child => {
            if(!child.coloured)
                monochromeCount++;
            else
                colouredCount++;
        });

        parent.onlymonochrome = monochromeCount > 0 && colouredCount === 0;

        resolve(true)
    })
}

async function updateOnlySmall(parent, children) {
    return new Promise(async resolve => {
        let smallCount = 0;
        let fullsizeCount = 0;
        await asyncForEach(children, async child => {
            if(!child.fullsize)
                smallCount++;
            else
                fullsizeCount++;
        });

        parent.onlysmall = smallCount > 0 && fullsizeCount === 0;

        resolve(true)
    })
}

function pagesStringToArray(pages) {
    return pages ? pages.split('#').filter(x => x !== '').map(x => +x) : [];
}*/
