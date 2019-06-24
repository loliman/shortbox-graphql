const dateFormat = require('dateformat');
const cheerio = require('cheerio');
const rp = require('request-promise');

export async function crawlSeries(series) {
    return new Promise(async (resolve, reject) => {
        let url = generateMarvelDbSeriesUrl(series);
        try {
            const seriesOptions = {
                uri: url,
                transform: function (body) {
                    return cheerio.load(body);
                }
            };

            let $ = await rp(seriesOptions);

            let messageBox = $('#messageBox').children()
                .first().children()
                .first().children()
                .first().children()
                .first();

            let text = messageBox.text().substring();
            text = text.substring(text.indexOf('('), text.lastIndexOf('.')).trim().replace('published by ', '');
            text = text.substring(1, text.length - 1);
            let splitted = text.split(')');
            let startyear = 0;
            let endyear = 0;
            let publisher = 'Marvel Comics';

            if (splitted.length > 0) {
                let years = splitted[0].split('-');

                try {
                    startyear = years[0] === '' || isNaN(years[0]) ? 0 : parseInt(years[0]);
                } catch (e) {
                    startyear = 0;
                }

                if (years.length === 2)
                    try {
                        endyear = years[1] === '' || isNaN(years[1]) ? 0 : parseInt((years[1]));
                    } catch (e) {
                        endyear = 0;
                    }
                else
                    endyear = startyear;
            }

            if (splitted.length > 1 && splitted[1].indexOf("something that is not") === -1)
                publisher = splitted[1].substring(2).trim();

            resolve({
                title: series.title,
                volume: series.volume,
                startyear: startyear,
                endyear: endyear,
                addinfo: '',
                publisher: {
                    name: publisher,
                    original: 1,
                    addinfo: ''
                }
            });
        } catch (e) {
            reject(new Error("Serie " + series.title + " (Vol." + series.volume + ") nicht gefunden [" + url + "]"));
        }
    });
}

export async function crawlIssue(issue) {
    return new Promise(async (resolve, reject) => {
        let url = generateMarvelDbIssueUrl(issue);
        try {
            const issueOptions = {
                uri: url,
                transform: function (body) {
                    return cheerio.load(body);
                }
            };

            let res = {stories: [], editors: [], cover: {artists: []}, variants: []};
            let $ = await rp(issueOptions);

            let infoBoxContent = $('.infobox').children();
            infoBoxContent.each((i, c) => {
                let html = $(c).html().trim();

                if (html.indexOf('templateimage') !== -1) {
                    let children = $(c).children();

                    res.arcs = [];
                    children.each((i, c) => {
                        let text = $(c).text();
                        if(text.trim() !== '' && i !== children.length-1) {
                            text = text.replace("Part of the '", "");
                            text = text.replace("Part of the \"", "");
                            text = text.replace("', and '", "###");
                            text = text.replace("', '", "###");
                            text = text.replace("(Event)", "");
                            text = text.replace("(event)", "");
                            text = text.replace("(story arc)", "");
                            text = text.replace("(Story arc)", "");
                            text = text.replace("(story Arc)", "");
                            text = text.replace("(Story Arc)", "");
                            text = text.replace("(story line)", "");
                            text = text.replace("(Story line)", "");
                            text = text.replace("(story Line)", "");
                            text = text.replace("(Story Line)", "");
                            text = text.replace("(Story)", "");
                            text = text.replace("(story)", "");
                            text = text.trim();

                            let titles;
                            if(text.lastIndexOf("'") !== -1)
                                titles = text.substring(0, text.lastIndexOf("'")).split("###");
                            else
                                titles = text.substring(0, text.lastIndexOf("\"")).split("###");

                            let type;
                            if(text.lastIndexOf("'") !== -1)
                                type = text.substring(text.lastIndexOf("'") + 1);
                            else
                                type = text.substring(text.lastIndexOf("\"") + 1);

                            type = type.replace(/ /g, "");
                            type = type.toUpperCase();
                            if (titles.length > 1)
                                type = type.substr(0, type.length - 1);

                            titles.forEach(title => res.arcs.push({title: title.trim(), type: type.trim()}));
                        }
                    });

                    let coverChildren = children
                        .last().children();

                    let coverUrl = children
                        .last().children()
                        .first().children()
                        .first().children().attr("href").trim();

                    res.cover.url = coverUrl;

                    let variantCoverChildren = coverChildren.last().children()
                        .first().children()
                        .last().children()
                        .first().children();

                    if (variantCoverChildren && variantCoverChildren.length !== 0) {
                        variantCoverChildren.each((i, cover) => {
                            let variantName = $(cover).text().substring($(cover).text().indexOf('>') + 1).trim();

                            if (variantName !== '' && variantName.indexOf("Textless") === -1) {
                                let exists = res.variants.find(v => v.variant == variantName);
                                if(!exists) {
                                    let variantUrl = $(cover).children().first().attr("href").trim();

                                    if(variantUrl) {
                                        variantUrl = variantUrl.trim();
                                        res.variants.push({variant: variantName, cover: {url: variantUrl}});
                                    }
                                }
                            }
                        });
                    }
                } else if (html.indexOf('<div style="font-size:12px;text-align:center;line-height:2em;"><') === 0) {
                    let dateChildren = $(c).children()
                        .last().children();

                    let releaseDate = '';
                    if (dateChildren && dateChildren.length === 2) {
                        releaseDate = dateChildren.eq(0).text().trim() + ', ' + dateChildren.eq(1).text().trim();
                    } else {
                        releaseDate = dateChildren.eq(3).text().trim();
                    }

                    res.releasedate = dateFormat(Date.parse(releaseDate), "yyyy-mm-dd");
                } else if (html.indexOf('Editor-in-Chief') !== -1 || html.indexOf('Cover Artists') !== -1) {
                    let editorElement;
                    let artistElement;
                    $(c).children().each((i, e) => {
                        if ($(e).text().indexOf("Editor-in-Chief") !== -1)
                            editorElement = e;
                        else if ($(e).text().indexOf("Cover Artist") !== -1)
                            artistElement = e;
                    });

                    if (editorElement) {
                        let editorsInChief = $(editorElement).children().last().children();
                        editorsInChief.each((i, e) => {

                            let editorInChief = $(e).text().trim();

                            if (editorInChief !== '') {
                                let exists = res.editors.find(v => v.name === editorInChief);
                                if(!exists)
                                    res.editors.push({name: editorInChief});
                            }
                        });
                    }

                    if (artistElement) {
                        let coverArtists = $(artistElement).children().last().children();
                        coverArtists.each((i, e) => {
                            let coverArtist = $(e).text().trim();

                            if (coverArtist !== '') {
                                let exists = res.cover.artists.find(v => v.name === coverArtist);
                                if (!exists)
                                    res.cover.artists.push({name: coverArtist});
                            }
                        });
                    }
                } else if ((html.indexOf('<table ') === 0 || html.indexOf('<tbody>') === 0) && html.indexOf('Issue Details') === -1) {
                    let story = {};
                    story.appearing = [];

                    let storyChildren = $(c).children();

                    if (storyChildren.first().html().indexOf('<tbody') === 0)
                        storyChildren = storyChildren.first().children();

                    storyChildren = storyChildren.first().children();

                    if (i !== infoBoxContent.length - 1) {
                        let storyName = storyChildren.first().children()
                            .last().children()
                            .first().children()
                            .first().children().text().trim();

                        if (storyName.indexOf('"') === 0)
                            storyName = storyName.substring(1, storyName.length - 1);

                        story.title = storyName;
                        story.individuals = [];

                        let storyDetailsChildren = storyChildren.last().children()
                            .first().children();

                        storyDetailsChildren.each((i, c) => {
                            let type = $(c).children().first().children().last().text().trim();
                            let individuals = $(c).children().last().children();
                            individuals.each((i, e) => {
                                let individual = $(e).text().trim();

                                if (individual !== '') {
                                    let exists = story.individuals.find(v => (v.name === individual && v.type === type.toUpperCase()));

                                    if(!exists) {
                                        story.individuals.push({
                                            name: individual,
                                            type: type.toUpperCase()
                                        });
                                    }
                                }
                            });
                        });

                        story.number = res.stories.length + 1;
                        res.stories.push(story);
                    }


                }
            });

            let headers = $('[id^=AppearingHeader]');
            let currentType = '';
            let currentSubType = '';

            headers.each((i, e) => {
                let first = $(e);
                let story = first.text().trim();

                if(story.indexOf("Appearing in") === -1)
                    return;

                story = story.replace("Appearing in ", "");
                if(story.indexOf("\"") === 0 || story.indexOf("'") === 0)
                    story = story.substring(1, story.length-1);

                let currentStory;
                res.stories.forEach(s => {
                    if(s.title === story)
                        currentStory = s;
                });

                while(true) {
                    let next = first.next();

                    if(next) {
                        if (next.attr('id') && next.attr('id').indexOf('StoryTitle') !== -1)
                            break;

                        if(next.is('p')) {
                            let text = $(next).text().trim();
                            text = text.replace(/ /g, "");
                            text = text.substring(0, text.length - 2);
                            if(text.indexOf("Races") !== -1)
                                text = "Races";

                            currentType = text.toUpperCase();

                            switch (currentType) {
                                case "FEATUREDCHARACTER":
                                    currentSubType = "FEATURED";
                                    currentType = "CHARACTER";
                                    break;
                                case "SUPPORTINGCHARACTER":
                                    currentSubType = "SUPPORTING";
                                    currentType = "CHARACTER";
                                    break;
                                case "ANTAGONIST":
                                    currentSubType = "ANTAGONIST";
                                    currentType = "CHARACTER";
                                    break;
                                case "OTHERCHARACTER":
                                    currentSubType = "OTHER";
                                    currentType = "CHARACTER";
                                    break;
                                default:
                                    currentSubType = "";
                            }
                        } else {
                            if(next.is('ul'))
                                crawlApps(next, $, currentType, currentSubType, currentStory)
                        }

                        first = next;
                    } else {
                        break;
                    }
                }
            });

            resolve(res);
        } catch (e) {
            reject(new Error("Ausgabe " + issue.series.title + " (Vol." + issue.series.volume + ") " + issue.number + " nicht gefunden [" + url + "]"));
        }
    });
}

function crawlApps(e, $, currentType, currentSubType, currentStory) {
    let l = $(e).children();

    l.each((i, e) => {
        let a = $(e).children('a');
        a.each((i, e) => {
            let text = $(e).attr('title').trim();
            text = text.replace("wikipedia:", "");
            text = text.replace("(page does not exist)", "");

            if (text !== '' && text.indexOf("Appearance of") === -1 && text.indexOf("Index/") === -1) {
                let exists = currentStory.appearing.find(v => v.name === text.trim() && v.type === currentType && v.role === currentSubType);
                if(!exists)
                    currentStory.appearing.push({name: text.trim(), type: currentType, role: currentSubType});
            }
        });

        let ul = $(e).children('ul');
        ul.each((i, e) => {
            crawlApps(e, $, currentType, currentSubType, currentStory);
        });
    });
}

function generateMarvelDbSeriesUrl(series) {
    let url = "https://marvel.fandom.com/wiki/" + encodeURIComponent(series.title) + "_Vol_" + series.volume;
    return url.replace(new RegExp(" ", 'g'), "_");
}

function generateMarvelDbIssueUrl(issue) {
    let url = "https://marvel.fandom.com/wiki/" + encodeURIComponent(issue.series.title) + "_Vol_" + issue.series.volume + "_" + issue.number;
    return url.replace(new RegExp(" ", 'g'), "_");
}