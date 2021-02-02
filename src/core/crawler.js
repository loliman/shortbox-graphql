import {notfound, notFoundLog, printError} from "../migration/core/migration";

const request = require("request-promise");
const cheerio = require('cheerio');

export async function crawl(issueToCrawl) {
    return new Promise(async resolve => {
        let issue = JSON.parse(JSON.stringify(issueToCrawl));
        issue.variants = [];
        issue.individuals = [];
        issue.stories = [];
        issue.arcs = [];
        issue.releasedate = new Date(0);
        issue.edited = false;
        issue.format = "Heft";

        let options = {
            uri: "https://marvel.fandom.com/index.php?action=render&title=" + generateSeriesUrl(issue.series),
            transform: body => cheerio.load(body)
        };

        let $;

        try{
            $ = await request(options);
        } catch (e) {
            notfound.increment();
            notfound.update(notfound.getTotal()+1, {name: "NF", filename: generateIssueUrl(issue)});
            notfound.setTotal(notfound.getTotal()+1);

            printError("NF", issue, issue, "Issue not found", notFoundLog);
            resolve(null);
            return;
        }

        let publisher = $("span:contains('Publisher: ')");
        if(publisher.length > 0)
            issue.series.publisher = { name: $(publisher.get(0).nextSibling).text().trim(), original: 1 };

        let genre = $("span:contains('Genre: ')");
        if(genre.length > 0)
            issue.series.genre = $(genre.get(0).nextSibling).text().trim();

        let publicationDate = $("span:contains('Publication Date: ')");
        if(publicationDate.length > 0) {
            let date = $(publicationDate.get(0).parent).text().replace(/[a-zA-Z :,]/g, "");

            if(date.startsWith("—")) {
                issue.series.startyear = Number.parseInt(date.substring(1));
                issue.series.endyear = Number.parseInt(issue.series.startyear);
            } else {
                issue.series.startyear = Number.parseInt(date.substring(0, 4));

                if(date.substring(5).length === 4)
                    issue.series.endyear = Number.parseInt(date.substring(5));
            }
        }

        options = {
            uri: 'https://marvel.fandom.com/api.php?action=parse&format=json&prop=wikitext&page=' + generateIssueUrl(issue),
            transform: function (body) {
                return JSON.parse(body);
            }
        };

        let infobox = await request(options);

        if(infobox.error) {
            notfound.increment();
            notfound.update(notfound.getTotal()+1, {name: "NF", filename: generateIssueUrl(issue)});
            notfound.setTotal(notfound.getTotal()+1);

            printError("NF", issue, issue, "Issue not found", notFoundLog);
            resolve(null);
            return;
        }

        infobox = infobox.parse.wikitext['*'].split('\n');
        let indexOfEqual = 0;

        infobox.forEach((line, i) => {
            line = line.trim();
            if(indexOfEqual <= 0) indexOfEqual = line.indexOf("=");

            //console.log(line);

            if(line.startsWith("|") && (line.indexOf("=") > -1)) {
                let type = line.substr(1, line.indexOf("=")-1).trim();
                let content = line.substr(line.indexOf("=")+1).trim();

                let count;
                if(type.indexOf("_") > -1)
                    count = type.substring(0, type.indexOf("_"));
                else if(type.indexOf(" ") > -1)
                    count = type.substring(0, type.indexOf(" "));
                else
                    count = type;
                count = Number.parseInt(count.replace(/\D/g, ""));

                if(type.startsWith("Image") && content.indexOf("Textless") === -1 && content.indexOf('from') === -1) {
                    count = !isNaN(count) ? count : 1;

                    if(type.indexOf("Text") === -1) {
                        issue.variants[count-1] = {
                            url: content,
                            individuals: []
                        };

                        if(count === 1)
                            issue.variants[0].individuals = []
                    } else {
                        if(issue.variants[count-1] && content !== "") {
                            while(content.indexOf("[[") !== -1)
                                content = content.replace("[[", "");
                            while(content.indexOf("]]") !== -1)
                                content = content.replace("]]", "");
                            content = content.substring(content.indexOf("|")+1).trim();

                            while(content.startsWith("\""))
                                content = content.replace("\"", "");
                            while(content.endsWith("\""))
                                content = content.replace("\"", "");
                            while(content.startsWith("\'"))
                                content = content.replace("\'", "");
                            while(content.endsWith("\'"))
                                content = content.replace("\'", "");
                            while(content.startsWith("*"))
                                content = content.replace("\*", "");

                            content = content.replace("Variant", "").trim();

                            issue.variants[count - 1].variant = content;
                        }
                    }
                } else if(type.startsWith("Month")) {
                    issue.releasedate.setMonth(content-1);
                } else if(type.startsWith("Year")) {
                    issue.releasedate.setFullYear(content);
                } else if(type.startsWith("Editor")) {
                    if(count > 0) {
                        createStory(issue, count);
                        if(!issue.stories[count-1].reprintOf)
                            addIndividual(issue.stories[count-1].individuals, content, "EDITOR");
                    } else {
                        addIndividual(issue.individuals, content, "EDITOR");
                    }
                }  else if(type.startsWith("CoverArtist")) {
                    createCover(issue, 1);
                    addIndividual(issue.variants[0].individuals, content, "ARTIST");
                } else if(type.startsWith("StoryTitle")) {
                    createStory(issue, count);
                    if(!issue.stories[count-1].reprintOf) {
                            while(content.startsWith("\""))
                                content = content.substring(1);

                            while(content.endsWith("\""))
                                content = content.substring(0, content.length-1);

                        issue.stories[count-1].title = content;
                    }
                } else if (type.startsWith("Writer")) {
                    createStory(issue, count);
                    if(!issue.stories[count-1].reprintOf)
                        addIndividual(issue.stories[count-1].individuals, content, "WRITER");
                } else if (type.startsWith("Penciler")) {
                    createStory(issue, count);
                    addIndividual(issue.stories[count-1].individuals, content, "PENCILER");
                } else if (type.startsWith("Inker")) {
                    createStory(issue, count);
                    addIndividual(issue.stories[count-1].individuals, content, "INKER");
                } else if (type.startsWith("Letterer")) {
                    createStory(issue, count);
                    addIndividual(issue.stories[count-1].individuals, content, "LETTERER");
                } else if (type.startsWith("Colourist")) {
                    createStory(issue, count);
                    addIndividual(issue.stories[count-1].individuals, content, "COLOURIST");
                } else if (type.startsWith("AdaptedFrom")) {
                    createStory(issue, count);
                    addIndividual(issue.stories[count-1].individuals, content, "ORIGINAL");
                } else if (type.startsWith("ReprintOf")) {
                    createStory(issue, count);

                    if(type.indexOf("Story") > 0) {
                        issue.stories[count-1].reprintOf.story = content
                    } else {
                        let original = {
                            series: {}
                        };

                        if(content.indexOf("Vol") === -1) {
                            original.series.title = content.substring(0, content.indexOf("#")).trim();
                            original.series.volume = 1;
                            original.number = content.substring(content.lastIndexOf("#")+1).trim();
                        } else if(content.indexOf("#") !== -1) {
                            original.series.title = content.substring(0, content.indexOf("Vol")).trim();
                            original.series.volume = Number.parseInt(content.substring(content.indexOf("Vol")+3, content.lastIndexOf(" ")));
                            original.number = content.substring(content.lastIndexOf("#")+1).trim();
                        } else {
                            original.series.title = content.substring(0, content.indexOf("Vol")).trim();
                            original.series.volume = Number.parseInt(content.substring(content.indexOf("Vol")+3, content.lastIndexOf(" ")));
                            original.number = content.substring(content.lastIndexOf(" ")).trim();
                        }

                        createStory(issue, count);

                        issue.stories[count-1].reprintOf = original;
                        issue.stories[count-1].reprintOf.story = type.replace("ReprintOf", "");
                    }
                } else if (type.startsWith("Event")) {
                    addArc(issue.arcs, {
                        type: "EVENT",
                        title: content.trim()
                    });
                } else if (type.startsWith("StoryArc")) {
                    addArc(issue.arcs, {
                        type: "STORYARC",
                        title: content.trim()
                    });
                } else if (type.startsWith("StoryLine")) {
                    addArc(issue.arcs, {
                        type: "STORYLINE",
                        title: content.trim()
                    });
                } else if (type.startsWith("OriginalPrice")) {
                    issue.price = Number.parseFloat(content.substring(1));
                } else if (type.startsWith("Appearing")) {
                    //Sooooometimes (again...) there are no individuals defined, so we have to create the story during the
                    //appearing block :(
                    count -= 1;
                    if(!issue.stories[count])
                        createStory(issue, count+1);

                    if(!issue.stories[count].title) {
                        issue.stories[count].title = "";
                    }

                    if(issue.stories[count].reprintOf) {
                        count++;
                        return;
                    }

                    issue.stories[count].appearances = [];

                    let  currentAppIdx = i+1;
                    let currentLine = infobox[currentAppIdx++].trim();
                    let currentType = "";
                    while(!currentLine.startsWith('|') && currentLine.indexOf("=") === -1) {
                        let firstApp = currentLine.indexOf("1st") > -1;

                        if(currentLine.startsWith('\'\'\'')) {
                            currentLine = currentLine.replace(/'''/g, "");
                            currentLine = currentLine.replace(/:/g, "");
                            currentLine = currentLine.trim();

                            if(currentLine.indexOf(" ") > -1)
                                currentType = currentLine.substring(0, currentLine.indexOf(" "));
                            else
                                currentType = currentLine.substring(0, currentLine.length-1);

                            currentType = currentType.trim().toUpperCase();
                        } else if (currentLine.startsWith("*")) {
                            let apps = currentLine.match(/(?<=\[.)(.*?)(?=\])/g);

                            if(!apps) {
                                currentLine = currentLine.replace(/\*/g, "");
                                currentLine = currentLine.trim();
                                if(currentLine.indexOf("<br") !== -1 || currentLine.indexOf("-->") !== -1)
                                    continue;
                                apps = [];
                                apps.push(currentLine);
                            }
                            else {
                                apps.forEach((app, i) => {
                                    if(app.indexOf("|") > -1) {
                                        app = app.substr(0, app.indexOf("|"));

                                        if(app.indexOf("Character Index") > -1) {
                                            app = app.substr(app.indexOf("#") + 1);
                                        }

                                        if(app.indexOf("-->") === -1)
                                            apps[i] = app;
                                    }
                                });
                            }

                            apps.forEach(app => {
                                if(app.indexOf("{") > -1)
                                    app = app.substr(0, app.indexOf("{"));

                                if(app.indexOf("#") > -1)
                                    app = app.substr(app.indexOf("#") + 1);

                                if(app.indexOf("<small>") > -1)
                                    app = app.substr(0, app.indexOf("<"));

                                if(app.startsWith("\"") && app.endsWith("\""))
                                    app = app.substr(1, app.length-1);

                                if(app.startsWith("\'") && app.endsWith("\'"))
                                    app = app.substr(1, app.length-1);

                                getAppearances(issue.stories[count], currentType, app, firstApp);
                            });
                        }

                        currentLine = infobox[currentAppIdx++];
                        if(currentLine)
                            currentLine = currentLine.trim();
                        else
                            break;
                    }
                } else {
                    //console.log(type + " (#" + count + "): " + content)
                }
            }
        });

        //get covers
        await asyncForEach(issue.variants, async (cover) => {
            if(!cover)
                return;

            if(!cover.url || cover.url.trim() === "")
                cover.url = generateIssueUrl(issue) + ".jpg";

            options = {
                uri: 'https://marvel.fandom.com/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' + encodeURI(cover.url),
                transform: function (body) {
                    return JSON.parse(body);
                }
            };

            let url = await request(options);
            if(Object.keys(url.query.pages)[0] === "-1")
                return;

            cover.url = url.query.pages[Object.keys(url.query.pages)[0]].imageinfo[0].url;
            cover.url = cover.url.substr(0, cover.url.indexOf("/revision/"))
        });

        issue.variants = issue.variants.filter(value => Object.keys(value).length !== 0);
        if(issue.variants.length > 0) {
            issue.cover = issue.variants[0];
            issue.cover.number = 0;
            issue.variants = issue.variants.splice(1);
            issue.variants.forEach((v, i) => v.number = i+1);
        }

        issue.variants.forEach((v, i) => {
            let title = v.variant;
            if(issue.variants.map(o => o.variant).includes(title)) {
                title = title + " " + issue.variants.map(o => o.variant).filter(o => o === title).length+1;
            }

            issue.variants[i]= {
               number: issue.number,
               variant: v.variant ? v.variant : getFromAlphabet(i),
               format: "Heft",
               series: issue.series,
               cover: {
                   number: 0,
                   url: v.url
               },
                releasedate: issue.releasedate,
                variants: [],
                individuals: [],
                stories: [],
            arcs: [],
            edited: false
           }
        });

        issue.variants.forEach((v, i) => {
            let duplicateCount = 0;

            for(let j = i+1; j < issue.variants.length; j++) {
                if(issue.variants[j].variant === v.variant) {
                    issue.variants[j].variant += " " + getFromAlphabet(duplicateCount + 1);
                    duplicateCount++;
                }
            }

            if(duplicateCount > 0)
                v.variant  += " " + getFromAlphabet(0);
        });


        let stories = [];
        let storyIdx = 1;

        //We do have some issues, that are missing stories in between, so we have to create dummies
        issue.stories.forEach((story, idx) => {
           while(story.number > storyIdx) {
               issue.stories.push({
                   number: storyIdx++,
                   individuals: [],
                   appearances: []
               });
           }

           stories.push(story);
           storyIdx++;
        });

        issue.stories = stories;

        await asyncForEach(issue.stories, async (story, idx) => {
            story.number = idx + 1;

            story.appearances = story.appearances.filter((thing, index, self) =>
                index === self.findIndex((t) => (
                    t.name === thing.name
                ))
            );

            if(story.reprintOf)
                story.reprintOf = await crawl(story.reprintOf);
        });

        if (!issue.series.publisher)
            issue.series.publisher = {
                name: "Marvel Comics"
            };

        resolve(issue);
    });
}

function getAppearances(story, currentType, name, firstApp) {
    let role = "";

    if(currentType.indexOf('FEATUREDCHARACTER') !== -1 ||
        currentType.indexOf('WEDDINGGUEST') !== -1 ||
        currentType.indexOf('FEATURED') !== -1 ||
        currentType.indexOf('VISION') !== -1 ||
        currentType.indexOf('FEATUREDCHARACTER') !== -1) {
        role = "FEATURED";
        currentType = "CHARACTER";
    } else if(currentType.indexOf('ANTAGONIST') !== -1 ||
        currentType.indexOf('ANAGONIST') !== -1 ||
        currentType.indexOf('ANGATONIST') !== -1 ||
        currentType.indexOf('ANTAGONGIST') !== -1 ||
        currentType.indexOf('ANTAGONIS') !== -1 ||
        currentType.indexOf('ANTAGONIT') !== -1 ||
        currentType.indexOf('ANTAGONSIST') !== -1 ||
        currentType.indexOf('ANTAGONSIT') !== -1 ||
        currentType.indexOf('MAINCHARACTER') !== -1 ||
        currentType.indexOf('ANTAOGNIST') !== -1 ||
        currentType.indexOf('ANTAONIST') !== -1 ||
        currentType.indexOf('VILLAI') !== -1 ||
        currentType.indexOf('VILLAIN') !== -1 ||
        currentType.indexOf('VILLIA') !== -1 ||
        currentType.indexOf('VILLIAN') !== -1 ||
        currentType.indexOf('ANTAGONOIST') !== -1) {
        role = "ANTAGONIST";
        currentType = "CHARACTER";
    } else if(currentType.indexOf('SUPPORITINGCHARACTER') !== -1 ||
        currentType.indexOf('SUPPORTIN') !== -1) {
        role = "SUPPORTING";
        currentType = "CHARACTER";
    } else if(currentType.indexOf('GROUP') !== -1 ||
        currentType.indexOf('TEAM') !== -1) {
        currentType = "GROUP";
    } else if(currentType.indexOf('VEHICLE') !== -1 ||
        currentType.indexOf('VECHILE') !== -1 ||
        currentType.indexOf('VEHICE') !== -1 ||
        currentType.indexOf('VEHICL') !== -1 ||
        currentType.indexOf('VEHICLE') !== -1) {
        currentType = 'VEHICLE';
    } else if(currentType.indexOf('RACE') !== -1) {
        currentType = 'RACE';
    } else if(currentType.indexOf('LOCATI') !== -1) {
        currentType = 'LOCATION';
    } else if (currentType.indexOf('ANIMAL') !== -1) {
        currentType = 'ANIMAL';
    } else if (currentType.indexOf('ITE') !== -1) {
        currentType = 'ITEM';
    } else /*FLASHBACK AND OTHER*/ {
        role = "OTHER";
        currentType = "CHARACTER";
    }

    let app = {
        type: currentType,
        role: role,
        name: name.trim()
    };

    if(firstApp)
        app.firstApp = firstApp;

    if(app.name && app.name.length > 0)
        addAppearance(story.appearances, app);
}

export function generateIssueUrl(issue) {
    return generateSeriesUrl(issue.series) + encodeURIComponent("_" + issue.number.trim());
}

function generateSeriesUrl(series) {
    return encodeURIComponent(series.title.trim().replace(/\s/g, "_") + "_Vol_" + series.volume);
}

export function generateIssueName(issue) {
    return generateSeriesName(issue.series) + " " + issue.number.trim();
}

function generateSeriesName(series) {
    return series.title.trim() + " Vol " + series.volume;
}

function removeBraces(string) {
    if(string.endsWith(")"))
        return removeBraces(string.substring(0, string.lastIndexOf("(")).trim());

    return string;
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function createStory(issue, count) {
    if(!issue.stories[count-1]) {
        issue.stories[count-1] = {
            individuals: [],
            appearances: [],
            number: count,
        };
    }
}

function createCover(issue, count) {
    if(!issue.variants[count-1]) {
        issue.variants[count-1] = {
            individuals: []
        };
    }
}

function addArc(arcs, arc) {
    if(arc.title.trim() === "")
        return;

    let contains = arcs.find(i => i.title.toLowerCase() === arc.title.toLowerCase() && i.type === arc.type);

    if(!contains)
        arcs.push(arc)
}

function addAppearance(apps, app) {
    if(app.name.trim() === "")
        return;

    let contains = apps.find(i => i.name.toLowerCase() === app.name.toLowerCase() && i.type === app.type);

    if(!contains)
        apps.push(app)
}

function addIndividual(individuals, name, type) {
    if(name.trim() === "")
        return;

    let contains = individuals.find(i => i.name.toLowerCase() === name.toLowerCase());

    if(contains) {
        if(!contains.type.includes(type))
            contains.type.push(type);
    } else {
        individuals.push({
            name: name,
            type: [type]
        })
    }
}

const alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

function getFromAlphabet(idx) {
    let a = "";

    if(idx > 25) {
        idx -= 25;
        return alphabet[idx % idx] + getFromAlphabet(idx) + a;
    }

    return alphabet[idx];
}