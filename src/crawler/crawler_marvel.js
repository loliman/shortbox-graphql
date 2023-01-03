import cheerio from 'cheerio';
import request from 'request-promise';

const BASE_URI = 'https://marvel.fandom.com';
const INDEX_URI =
    BASE_URI + '/index.php';
const API_URI = BASE_URI + '/api.php';

export async function crawlIssue(number, title, volume) {
    let issue = {};
    issue.format = 'Heft';
    issue.currency = 'USD';
    issue.number = number;
    issue.releasedate = new Date()
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');

    issue.series = {};
    issue.series.title = title;
    issue.series.volume = volume;

    issue.series.publisher = {};

    issue.cover = {};
    issue.cover.number = 0;
    issue.cover.individuals = [];
    issue.variants = [];
    issue.stories = [];
    issue.individuals = [];
    issue.arcs = [];

    await crawlInfobox(issue);
    await crawlSeries(issue);
    await fixVariants(issue);
    await crawlCovers(issue);
    await fixStories(issue);
    fixPublisher(issue);

    await finalizeStories(issue);

    return issue;
}

async function finalizeStories(issue) {
    await asyncForEach(
        issue.stories,
        async (story, idx) => {
            story.number = idx + 1;

            story.appearances = story.appearances.filter(
                (thing, index, self) =>
                    index === self.findIndex(t => t.name === thing.name)
            );

            if (story.reprintOf) {
                await crawlReprint(story);
            }
        }
    );
}

async function crawlReprint(story) {
    let issue = await crawlIssue(
        story.reprintOf.issue.number,
        story.reprintOf.issue.series.title,
        story.reprintOf.issue.series.volume
    );

    let originalStoryIndex = story.reprintOf.number;

    if (originalStoryIndex) {
        originalStoryIndex--;
    } else if (story.title) {
        let storyParts = story.title.split(' ');
        issue.stories.forEach((s, i) => {
            if (!s.title) return;

            let found = 0;
            let originalStoryParts = s.title.split(' ');

            storyParts.forEach(part => {
                if (originalStoryParts.includes(part)) {
                    found++;
                }
            });

            if (found === storyParts.length || found >= 3) {
                originalStoryIndex = i;
            }
        });
    } else {
        originalStoryIndex = 0;
    }

    if (!originalStoryIndex || originalStoryIndex - 1 > issue.stories.length)
        originalStoryIndex = 0;

    story.reprintOf = JSON.parse(
        JSON.stringify(issue.stories[originalStoryIndex])
    );
    story.reprintOf.issue = issue;
}

function fixPublisher(issue) {
    if (!issue.series.publisher) {
        let publisher = {};
        publisher.name = 'Marvel Comics';

        issue.series.publisher = publisher;
    }
}

async function fixStories(issue) {
    let stories = [];
    let storyIdx = 1;

    //We do have some issues, that are missing stories in between, so we have to create dummies
    issue.stories.forEach(story => {
        while (story.number > storyIdx) {
            let story = {};
            story.individuals = [];
            story.appearances = [];
            story.number = storyIdx++;
            issue.stories.push(story);
        }

        stories.push(story);
        storyIdx++;
    });

    issue.stories = stories;
}

async function fixVariants(issue) {
    if (!issue.variants) return;

    issue.variants = issue.variants.filter(
        value => Object.keys(value).length !== 0
    );

    issue.variants.forEach((v, i) => {
        let title = v.variant;
        if (
            issue.variants &&
            issue.variants.map(o => o.variant).includes(title)
        ) {
            title =
                title +
                ' ' +
                issue.variants.map(o => o.variant).filter(o => o === title).length +
                1;
        }

        let cover = {};
        cover.number = 0;
        cover.url = v.cover.url;

        let variant = {};
        variant.number = issue.number;
        variant.variant = v.variant ? v.variant : getFromAlphabet(i);
        variant.format = 'Heft';
        variant.currency = 'USD';
        variant.series = JSON.parse(JSON.stringify(issue.series));
        variant.cover = cover;
        variant.releasedate = issue.releasedate;
        variant.variants = [];
        variant.individuals = [];
        variant.stories = [];
        variant.arcs = [];

        if (issue.variants) issue.variants[i] = variant;
    });

    issue.variants.forEach((v, i) => {
        let duplicateCount = 0;

        if (!issue.variants) return;

        for (let j = i + 1; j < issue.variants.length; j++) {
            if (issue.variants[j].variant === v.variant) {
                issue.variants[j].variant +=
                    ' ' + getFromAlphabet(duplicateCount + 1);
                duplicateCount++;
            }
        }

        if (duplicateCount > 0) v.variant += ' ' + getFromAlphabet(0);
    });
}

async function crawlCovers(issue) {
    await crawlCover(issue.cover, issue);

    await asyncForEach(
        issue.variants,
        async (issue) => {
            await crawlCover(issue.cover, issue);
        }
    );
}

async function crawlCover(cover, issue) {
    if (!cover) return;

    if (!cover.url || cover.url.trim() === '')
        cover.url = generateIssueUrl(issue) + '.jpg';

    while (cover.url.indexOf('%3A') !== -1)
        cover.url = cover.url.replace('%3A', '');

    try {
        let $ = await request({
            uri:
                API_URI +
                '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                encodeURI(cover.url),
            transform: (body) => JSON.parse(body),
        });

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    decodeURI(cover.url),
                transform: (body) => JSON.parse(body),
            });
        }

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    encodeURI(cover.url.replace('.jpg', '.png')),
                transform: (body) => JSON.parse(body),
            });
        }

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    decodeURI(cover.url.replace('.jpg', '.png')),
                transform: (body) => JSON.parse(body),
            });
        }

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    encodeURI(cover.url.replace('.jpg', '.gif')),
                transform: (body) => JSON.parse(body),
            });
        }

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    decodeURI(cover.url.replace('.jpg', '.gif')),
                transform: (body) => JSON.parse(body),
            });
        }

        if (Object.keys($.query.pages)[0] === '-1') {
            $ = await request({
                uri:
                    API_URI +
                    '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
                    decodeURI(cover.url.replace(':', '')),
                transform: (body) => JSON.parse(body),
            });
        }

        cover.url = $.query.pages[Object.keys($.query.pages)[0]].imageinfo[0].url;
        cover.url = cover.url.substring(0, cover.url.indexOf('/revision/'));
    } catch (e) {
        cover.url = '';
    }
}

async function crawlInfobox(issue) {
    let $;

    try {
        $ = await request({
            uri:
                API_URI +
                '?action=parse&format=json&prop=wikitext&page=' +
                generateIssueUrl(issue),
            transform: function (body) {
                return JSON.parse(body);
            },
        });
    } catch (e) {
        throw new Error("Cannot find issue " + generateIssueUrl(issue));
    }

    if (!$.parse) {
        throw new Error("Cannot find issue " + generateIssueUrl(issue));
    }

    $ = $.parse.wikitext['*'].split('\n');

    if ($[0].trim().startsWith('#REDIRECT')) {
        let redirect = $[0].trim().replace('#REDIRECT [[', '');
        redirect = redirect.replace(']]', '');

        issue.series.title = redirect.substring(0, redirect.indexOf('Vol')).trim();
        redirect = redirect.substring(redirect.indexOf('Vol') + 3).trim();
        issue.series.volume = Number.parseInt(
            redirect.substring(0, redirect.indexOf(' ')).trim()
        );
        issue.number = redirect.substring(redirect.indexOf(' ')).trim();

        await crawlInfobox(issue);
    } else {
        $.forEach((line, i) => {
            line = line.trim();

            if (line.startsWith('|') && line.indexOf('=') > -1) {
                line
                    .split('|')
                    .slice(1)
                    .forEach(l => crawlInfoboxLine(l, i, issue, $));
            }
        });
    }
}

function parseInt(string) {
    return Number.parseInt(string.replace(/\D/g, ''));
}

function crawlInfoboxLine(
    line,
    indexOfLine,
    issue,
    $
) {
    let type = line.substring(0, line.indexOf('=')).trim();
    let content = line.substring(line.indexOf('=') + 1).trim();
    let count = extractNumberOfInfoboxLine(type);

    if (type.indexOf('Artist') !== -1) {
        extractCover(content, issue);
    } else if (type.startsWith('Image') && content.indexOf('from') === -1) {
        extractVariant(type, content, count, issue);
    } else if (type.startsWith('Month')) {
        let month = isNaN(Number.parseInt(content))
            ? 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(content.substring(0, 3)) /
            3 +
            1
            : Number.parseInt(content);

        month = Math.ceil(month);
        month = month < 1 || month > 12 ? 1 : month;
        issue.releasedate =
            issue.releasedate.substring(0, 5) + month + issue.releasedate.substring(7);
    } else if (type.startsWith('Year')) {
        issue.releasedate =
            Number.parseInt(content) + issue.releasedate.substring(4);
    } else if (type.startsWith('Editor-in-Chief')) {
        extractEditorInChief(content, issue);
    } else if (type.startsWith('Editor')) {
        extractEditor(content, count, issue);
    } else if (type.startsWith('StoryTitle')) {
        extractStory(content, count, issue);
    } else if (type.startsWith('Writer')) {
        extractWriter(content, count, issue);
    } else if (type.startsWith('Penciler')) {
        extractPenciler(content, count, issue);
    } else if (type.startsWith('Inker')) {
        extractInker(content, count, issue);
    } else if (type.startsWith('Letterer')) {
        extractLetterer(content, count, issue);
    } else if (type.startsWith('Colorist')) {
        extractColourist(content, count, issue);
    } else if (type.startsWith('AdaptedFrom')) {
        extractAdaptedFrom(content, count, issue);
    } else if (type.startsWith('ReprintOf')) {
        extractReprint(content, count, type, issue);
    } else if (type.startsWith('Event')) {
        addArc(content.trim(), 'EVENT', issue.arcs);
    } else if (type.startsWith('StoryArc')) {
        addArc(content.trim(), 'STORYARC', issue.arcs);
    } else if (type.startsWith('StoryLine')) {
        addArc(content.trim(), 'STORYLINE', issue.arcs);
    } else if (type.startsWith('OriginalPrice')) {
        issue.price = Number.parseFloat(content.substring(1));
        if (isNaN(issue.price)) {
            issue.price = 0;
        }
    } else if (type.startsWith('Appearing')) {
        extractAppearances(count, issue, indexOfLine, $);
    } else {
        //console.log(type + ' (#' + count + '): ' + content);
    }
}

function extractAppearances(
    count,
    issue,
    indexOfLine,
    $
) {
    //Sooooometimes (again...) there are no individuals defined, so we have to create the story during the
    //appearing block :(
    count -= 1;
    if (!issue.stories[count])
        createStory(count + 1, issue);

    if (!issue.stories[count].title) {
        issue.stories[count].title = 'Untitled';
    }

    if (issue.stories[count].reprintOf) {
        count++;
        return;
    }

    let currentAppIdx = indexOfLine + 1;
    let currentLine = $[currentAppIdx++].trim();
    let currentType = '';
    while (!currentLine.startsWith('|') && currentLine.indexOf('=') === -1) {
        let firstApp = currentLine.indexOf('1st') > -1;

        if (currentLine.indexOf('<!--') !== -1) {
            currentLine = currentLine.replace('<!--', '');
        }

        if (currentLine.startsWith("'''")) {
            currentLine = currentLine.replace(/'''/g, '');
            currentLine = currentLine.replace(/:/g, '');
            currentLine = currentLine.trim();

            if (currentLine.indexOf(' ') > -1)
                currentType = currentLine.substring(0, currentLine.indexOf(' '));
            else currentType = currentLine.substring(0, currentLine.length - 1);

            currentType = currentType.trim().toUpperCase();
        } else if (currentLine.startsWith('*')) {
            let apps = currentLine.match(/(?<=\[.)(.*?)(?=])/g);

            if (!apps) {
                //currentLine = currentLine.replace(/\*/g, "");
                currentLine = currentLine.trim();

                if (
                    currentLine.indexOf('<br') !== -1 ||
                    currentLine.indexOf('-->') !== -1
                ) {
                    currentLine = $[currentAppIdx++];
                    if (currentLine) currentLine = currentLine.trim();
                }
                apps = [];
                apps.push(currentLine);
            } else {
                apps.forEach((app, i) => {
                    if (app.indexOf('|') > -1) {
                        app = app.substring(0, app.indexOf('|'));

                        if (app.indexOf('Character Index') > -1) {
                            app = app.substring(app.indexOf('#') + 1);
                        }

                        if (app.indexOf('-->') === -1) apps[i] = app;
                    }
                });
            }

            apps.forEach((app) => {
                if (app.indexOf("'''") > -1 || app.indexOf('<!--') > -1) return;
                if (app.indexOf('{') > -1) app = app.substring(0, app.indexOf('{'));

                if (app.indexOf('#') > -1) app = app.substring(app.indexOf('#') + 1);

                if (app.indexOf('<small>') > -1)
                    app = app.substring(0, app.indexOf('<'));

                if (app.startsWith('"') && app.endsWith('"'))
                    app = app.substring(1, app.length - 1);

                if (app.startsWith("'") && app.endsWith("'"))
                    app = app.substring(1, app.length - 1);

                if (app.indexOf('<ref>') !== -1) {
                    app = app.substring(0, app.indexOf('<ref>'));
                }

                app = app.trim();
                while (app.startsWith('*')) app = app.replace('*', '');
                if (app.startsWith("w:c")) {
                    app = app.replace("w:c:", "");
                    app = app.substring(app.indexOf(":") + 1);
                }
                app = app.trim();

                getAppearances(issue.stories[count], currentType, app, firstApp);
            });
        }

        currentLine = $[currentAppIdx++];
        if (currentLine) currentLine = currentLine.trim();
        else break;
    }
}

function extractReprint(
    content,
    count,
    type,
    issue
) {
    createStory(count, issue);

    if (type.indexOf('Story') > 0) {
        issue.stories[count - 1].reprintOf.number = Number.parseInt(content);
    } else {
        let original = {};
        original.series = {};

        if (content.indexOf('Vol') === -1) {
            original.series.title = content
                .substring(0, content.indexOf('#'))
                .trim();
            original.series.volume = 1;
            original.number = content
                .substring(content.lastIndexOf('#') + 1)
                .trim();
        } else if (content.indexOf('#') !== -1) {
            original.series.title = content
                .substring(0, content.indexOf('Vol'))
                .trim();
            original.series.volume = Number.parseInt(
                content.substring(
                    content.indexOf('Vol') + 3,
                    content.lastIndexOf(' ')
                )
            );
            original.number = content
                .substring(content.lastIndexOf('#') + 1)
                .trim();
        } else {
            original.series.title = content
                .substring(0, content.indexOf('Vol'))
                .trim();
            original.series.volume = Number.parseInt(
                content.substring(
                    content.indexOf('Vol') + 3,
                    content.lastIndexOf(' ')
                )
            );
            original.number = content.substring(content.lastIndexOf(' ')).trim();
        }

        createStory(count, issue);

        if (!issue.stories[count - 1].reprintOf) {
            issue.stories[count - 1].reprintOf = {};
        }
        issue.stories[count - 1].reprintOf.individuals = [];
        issue.stories[count - 1].reprintOf.appearances = [];
        issue.stories[count - 1].reprintOf.issue = original;
    }
}

function extractAdaptedFrom(content, count, issue) {
    createStory(count, issue);
    addIndividual(
        content,
        'ORIGINAL',
        issue.stories[count - 1].individuals
    );
}

function extractColourist(content, count, issue) {
    createStory(count, issue);
    addIndividual(
        content,
        'COLORIST',
        issue.stories[count - 1].individuals
    );
}

function extractLetterer(content, count, issue) {
    createStory(count, issue);
    addIndividual(
        content,
        'LETTERER',
        issue.stories[count - 1].individuals
    );
}

function extractInker(content, count, issue) {
    createStory(count, issue);
    addIndividual(content, 'INKER', issue.stories[count - 1].individuals);
}

function extractPenciler(content, count, issue) {
    createStory(count, issue);
    addIndividual(
        content,
        'PENCILER',
        issue.stories[count - 1].individuals
    );
}

function extractWriter(content, count, issue) {
    createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf)
        addIndividual(
            content,
            'WRITER',
            issue.stories[count - 1].individuals
        );
}

function extractStory(content, count, issue) {
    createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf) {
        if (content.endsWith('}}')) content = content.replace('}}', '');

        while (content.startsWith('"')) content = content.substring(1);

        while (content.endsWith('"'))
            content = content.substring(0, content.length - 1);

        issue.stories[count - 1].title =
            !content || content.trim() === '' ? 'Untitled' : content;
    }
}

function extractCover(content, issue) {
    addIndividual(content, 'ARTIST', issue.cover.individuals);
}

function extractEditorInChief(content, issue) {
    addIndividual(content, 'EDITOR', issue.individuals);
}

function extractEditor(content, count, issue) {
    createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf)
        addIndividual(
            content,
            'EDITOR',
            issue.stories[count - 1].individuals
        );
}

function extractVariant(
    type,
    content,
    count,
    issue
) {
    if (count === 1) {
        return;
    }

    if (
        issue.variants &&
        type.indexOf('Text') === -1 &&
        !content.startsWith('<!--')
    ) {
        createCover(count, issue);
        issue.variants[count - 1].cover = {};
        issue.variants[count - 1].cover.number = 0;
        issue.variants[count - 1].cover.url = content;
    } else {
        if (issue.variants && issue.variants[count - 1] && content !== '') {
            while (content.indexOf('[[') !== -1)
                content = content.replace('[[', '');
            while (content.indexOf(']]') !== -1)
                content = content.replace(']]', '');
            content = content.substring(content.indexOf('|') + 1).trim();

            while (content.startsWith('"')) content = content.replace('"', '');
            while (content.endsWith('"')) content = content.replace('"', '');
            while (content.startsWith("'")) content = content.replace("'", '');
            while (content.endsWith("'")) content = content.replace("'", '');
            while (content.startsWith('*')) content = content.replace('*', '');

            content = content.replace('Variant', '').trim();
            content = content.replace('<small>', '').trim();
            content = content.replace('</small>', '').trim();
            content = content.trim();

            issue.variants[count - 1].variant = content;
        }
    }
}

function extractNumberOfInfoboxLine(type) {
    if (type.indexOf('_') > -1)
        return parseInt(type.substring(0, type.indexOf('_')));
    else if (type.indexOf(' ') > -1)
        return parseInt(type.substring(0, type.indexOf(' ')));
    else if (type !== 'Image' && type.indexOf('Image') > -1)
        return parseInt(type.replace('Image', ''));
    else {
        let temp = type.replace(/\D/g, '');
        if (temp.trim() === '') return 1;
        else return parseInt(temp);
    }
}

export async function crawlSeries(issue) {
    try {
        let $ = await request({
            uri:
                INDEX_URI +
                '?action=render&title=' +
                generateSeriesUrl(issue.series),
            transform: (body) => cheerio.load(body),
        });

        extractPublisher($, issue);
        extractGenre($, issue);
        extractDates($, issue);
    } catch (e) {
        throw new Error("Cannot find series " + generateSeriesUrl(issue.series));
    }
}

function extractDates($, issue) {
    let publicationDate = $("span:contains('Publication Date: ')");
    if (publicationDate.length > 0) {
        let text = $(publicationDate.get(0).parent)
            .text();

        let date = text;
        if (text.indexOf("Next Release") !== -1) {
            date = date.substring(0, text.indexOf("Next Release: "))
        }
        if (text.indexOf("Relaunched in") !== -1) {
            date = date.substring(0, text.indexOf("Relaunched in: "))
        }

        date = date.replace(/[a-zA-Z :,—]/g, '');

        let finished = text.substring(0, text.indexOf("Publication Date: "))
            .replace("Status: ", "") === "Finished";

        issue.series.startyear = date.substring(0, 4);

        if (date.length === 8) {
            issue.series.endyear = date.substring(4, 8);
        } else if (finished) {
            issue.series.endyear = issue.series.startyear;
        } else {
            issue.series.endyear = 0;
        }
    }
}

function extractGenre($, issue) {
    let genre = $("span:contains('Genre: ')");
    if (genre.length > 0)
        issue.series.genre = $(genre.get(0).nextSibling)
            .text()
            .trim();
}

function extractPublisher($, issue) {
    let publisher = $("span:contains('Publisher: ')");
    if (!issue.series.publisher) {
        issue.series.publisher = {};
    }
    if (publisher.length > 0) {
        issue.series.publisher.name = $(publisher.get(0).nextSibling)
            .text()
            .trim();
    } else {
        issue.series.publisher.name = 'Marvel Comics';
    }
    issue.series.publisher.us = 1;
}

function getAppearances(
    story,
    currentType,
    name,
    firstApp
) {
    let role = '';

    if (
        currentType.indexOf('FEATUREDCHARACTER') !== -1 ||
        currentType.indexOf('WEDDINGGUEST') !== -1 ||
        currentType.indexOf('FEATURED') !== -1 ||
        currentType.indexOf('VISION') !== -1 ||
        currentType.indexOf('FEATUREDCHARACTER') !== -1
    ) {
        role = 'FEATURED';
        currentType = 'CHARACTER';
    } else if (
        currentType.indexOf('ANTAGONIST') !== -1 ||
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
        currentType.indexOf('ANTAGONOIST') !== -1
    ) {
        role = 'ANTAGONIST';
        currentType = 'CHARACTER';
    } else if (
        currentType.indexOf('SUPPORITINGCHARACTER') !== -1 ||
        currentType.indexOf('SUPPORTIN') !== -1
    ) {
        role = 'SUPPORTING';
        currentType = 'CHARACTER';
    } else if (
        currentType.indexOf('GROUP') !== -1 ||
        currentType.indexOf('TEAM') !== -1
    ) {
        currentType = 'GROUP';
    } else if (
        currentType.indexOf('VEHICLE') !== -1 ||
        currentType.indexOf('VECHILE') !== -1 ||
        currentType.indexOf('VEHICE') !== -1 ||
        currentType.indexOf('VEHICL') !== -1 ||
        currentType.indexOf('VEHICLE') !== -1
    ) {
        currentType = 'VEHICLE';
    } else if (currentType.indexOf('RACE') !== -1) {
        currentType = 'RACE';
    } else if (currentType.indexOf('LOCATI') !== -1) {
        currentType = 'LOCATION';
    } else if (currentType.indexOf('ANIMAL') !== -1) {
        currentType = 'ANIMAL';
    } else if (currentType.indexOf('ITE') !== -1) {
        currentType = 'ITEM';
    } else {
        //FLASHBACK AND OTHER
        role = 'OTHER';
        currentType = 'CHARACTER';
    }

    let app = {};
    app.name = name;
    app.type = currentType.trim();
    app.role = role.trim();
    if (firstApp) app.firstapp = firstApp;

    if (app.name && app.name.indexOf('-->') === -1 && app.name.length > 0)
        addAppearance(story.appearances, app);
}

function generateIssueUrl(issue) {
    return (
        generateSeriesUrl(issue.series) +
        encodeURIComponent('_') + issue.number.trim());
}

function generateSeriesUrl(series) {
    return encodeURIComponent(
        series.title.trim().replace(/\s/g, '_') + '_Vol_' + series.volume
    );
}

function generateIssueName(issue) {
    return (
        generateSeriesName(issue.series) +
        ' ' +
        issue.number.trim()
    );
}

function generateSeriesName(series) {
    return series.title.trim() + ' Vol ' + series.volume;
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function createStory(count, issue) {
    if (!issue.stories[count - 1]) {
        issue.stories[count - 1] = {};
        issue.stories[count - 1].individuals = [];
        issue.stories[count - 1].appearances = [];
        issue.stories[count - 1].number = count;
    }
}

function createCover(count, issue) {
    if (issue.variants && !issue.variants[count - 1]) {
        issue.variants[count - 1] = {};
    }
}

function addArc(title, type, arcs) {
    let arc = {};
    arc.title = title;
    arc.type = type;

    if (arc.title.trim() === '') return;

    if (arc.title.indexOf('|') !== -1) {
        arc.title = arc.title.substring(0, arc.title.indexOf('|'));
    }

    arc.title = arc.title.replace('[[', '');
    arc.title = arc.title.replace(']]', '');
    arc.title = arc.title.replace('{{', '');
    arc.title = arc.title.replace('}}', '');

    if (arc.title.endsWith(')')) {
        arc.title = arc.title.substring(0, arc.title.lastIndexOf('('));
    }

    arc.title = arc.title.trim();

    let contains = arcs.find(
        i =>
            i.title.toLowerCase() === arc.title.toLowerCase() && i.type === arc.type
    );

    if (!contains) arcs.push(arc);
}

function addAppearance(apps, app) {
    if (app.name.trim() === '' || app.name.trim().indexOf('|') === 0) return;

    if (app.name.indexOf('|') !== -1) {
        app.name = app.name.substring(0, app.name.indexOf('|'));
    }

    app.name = app.name.replace('[[', '');
    app.name = app.name.replace(']]', '');
    app.name = app.name.replace('{{', '');
    app.name = app.name.replace('}}', '');
    app.name = app.name.trim();

    if (app.name === '' || app.name.indexOf('|') === 0) return;

    let contains = apps.find(
        i =>
            i.name.toLowerCase() === app.name.toLowerCase() && i.type === app.type
    );

    if (!contains) apps.push(app);
}

function addIndividual(name, type, individuals) {
    if (name.indexOf('<!--') > -1) {
        name = name.substring(0, name.indexOf('<!--'));
        name = name.trim();
    }

    if (name.trim() === '') return;

    if (name.indexOf('|') !== -1) {
        name = name.substring(0, name.indexOf('|'));
    }

    name = name.replace('[[', '');
    name = name.replace(']]', '');
    name = name.replace('{{', '');
    name = name.replace('}}', '');
    name = name.trim();

    let contains = individuals.find(
        i => i.name.toLowerCase() === name.toLowerCase() && i.type === type
    );

    if (!contains) {
        let i = {};
        i.name = name;
        i.type = type;

        individuals.push(i);
    }
}

const alphabet = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
];

function getFromAlphabet(idx) {
    let a = '';

    if (idx > 25) {
        idx -= 25;
        return alphabet[idx % idx] + getFromAlphabet(idx) + a;
    }

    return alphabet[idx];
}