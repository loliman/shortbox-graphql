const dateFormat = require('dateformat');
const cheerio = require('cheerio');
const rp = require('request-promise');

export async function crawlSeries(series) {
    return new Promise(async (resolve, reject) => {
        try {
            const seriesOptions = {
                uri: generateMarvelDbSeriesUrl(series),
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
            text = text.substring(text.indexOf('('), text.indexOf('.')).trim().replace('published by ', '');
            text = text.substring(1, text.length - 1);
            let splitted = text.split(')');

            let startyear = 0;
            let endyear = 0;
            let publisher = 'Unknown';

            if (splitted.length > 0) {
                let years = splitted[0].split('-');
                startyear = parseInt(years[0]);
                if (years.length === 2)
                    endyear = parseInt((years[1]));
                else
                    endyear = startyear;
            }

            if (splitted.length > 1)
                publisher = splitted[1].substring(2).trim();

            resolve({
                title: series.title,
                volume: series.volume,
                startyear: startyear,
                endyear: endyear,
                addinfo: '',
                publisher: {
                    name: publisher,
                    original: true,
                    addinfo: ''
                }
            });
        } catch (e) {
            reject(new Error("Series not found"));
        }
    });
}

export async function crawlIssue(issue) {
    return new Promise(async (resolve, reject) => {
        try {
            const issueOptions = {
                uri: generateMarvelDbIssueUrl(issue),
                transform: function (body) {
                    return cheerio.load(body);
                }
            };

            let res = {stories: []};
            let $ = await rp(issueOptions);

            let infoBoxContent = $('.infobox').children();
            let noPrice = $(infoBoxContent).eq(2).text().indexOf("Issue DetailsOriginal Price") === -1;
            infoBoxContent.each((i, c) => {
                let s = i;
                if (noPrice && i > 1)
                    s += 1;

                switch (s) {
                    case 0:
                        let coverChildren = $(c).children()
                            .last().children();

                        let coverUrl = $(c).children()
                            .last().children()
                            .first().children()
                            .first().children().attr("href").trim();

                        res.cover = {url: coverUrl};
                        res.variants = [];

                        let variantCoverChildren = coverChildren.last().children()
                            .first().children()
                            .last().children()
                            .first().children();

                        if (variantCoverChildren.length !== 0) {
                            variantCoverChildren.each((i, cover) => {
                                let variantChildren = $(cover).children().last();
                                let variantName = variantChildren.text().replace(variantChildren.children().text(), '').trim();

                                if (variantName !== '' && variantName.indexOf("Textless") === -1) {
                                    let variantUrl = variantChildren.first().children().first().attr("href").trim();
                                    res.variants.push({variant: variantName, cover: {url: variantUrl}});
                                }
                            });
                        }
                        break;
                    case 1:
                        let dateChildren = $(c).children()
                            .last().children();

                        let releaseDate = '';
                        if (dateChildren.length === 2) {
                            releaseDate = dateChildren.eq(0).text().trim() + ', ' + dateChildren.eq(1).text().trim();
                        } else {
                            releaseDate = dateChildren.eq(3).text().trim();
                        }

                        res.releasedate = dateFormat(Date.parse(releaseDate), "yyyy-mm-dd");
                        break;
                    case 2:
                        break;
                    case 3:
                        res.editors = [];
                        res.cover.artists = [];

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

                                if (editorInChief !== '')
                                    res.editors.push({name: editorInChief});
                            });
                        }

                        if (artistElement) {
                            let coverArtists = $(artistElement).children().last().children();
                            coverArtists.each((i, e) => {
                                let coverArtist = $(e).text().trim();

                                if (coverArtist !== '')
                                    res.cover.artists.push({name: coverArtist});
                            });
                        }
                        break;
                    default:
                        let story = {};
                        let storyChildren = $(c).children();

                        if (storyChildren.first().html().indexOf('<tbody') === 0)
                            storyChildren = storyChildren.first().children();

                        storyChildren = storyChildren.first().children();

                        if (i !== infoBoxContent.length - 1) {
                            let storyName = storyChildren.first().children()
                                .last().children()
                                .first().children()
                                .first().children().text().trim();

                            if(storyName.indexOf('"') === 0)
                                storyName = storyName.substring(1, storyName.length-1);

                            story.title = storyName;
                            story.individuals = [];

                            let storyDetailsChildren = storyChildren.last().children()
                                .first().children();

                            storyDetailsChildren.each((i, c) => {
                                let type = $(c).children().first().children().last().text().trim();
                                let individuals = $(c).children().last().children();
                                individuals.each((i, e) => {
                                    let individual = $(e).text().trim();

                                    if (individual !== '')
                                        story.individuals.push({name: individual, type: type.toUpperCase().substring(0, type.length-1)});
                                });
                            });

                            story.number = res.stories.length + 1;
                            res.stories.push(story);
                        }
                }
            });

            resolve(res);
        } catch (e) {
            reject(new Error("Issue not found"));
        }
    });
}

function generateMarvelDbSeriesUrl(series) {
    let url = "https://marvel.fandom.com/wiki/" + series.title + "_Vol_" + series.volume;
    return url.replace(new RegExp(" ", 'g'), "_");
}

function generateMarvelDbIssueUrl(issue) {
    let url = "https://marvel.fandom.com/wiki/" + issue.series.title + "_Vol_" + issue.series.volume + "_" + issue.number;
    return url.replace(new RegExp(" ", 'g'), "_");
}