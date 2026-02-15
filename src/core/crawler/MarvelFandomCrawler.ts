import {Crawler} from './Crawler';
import cheerio from 'cheerio';
import request from 'request-promise';
import {Issue} from '../../database/Issue';
import {Story} from '../../database/Story';
import {Publisher} from '../../database/Publisher';
import {Appearance} from '../../database/Appearance';
import {Series} from '../../database/Series';
import {Individual} from '../../database/Individual';
import {Arc} from '../../database/Arc';
import {Cover} from '../../database/Cover';

export class MarvelFandomCrawler implements Crawler {
  private static BASE_URI: string = 'https://marvel.fandom.com';
  private static INDEX_URI: string =
    MarvelFandomCrawler.BASE_URI + '/index.php';
  private static API_URI: string = MarvelFandomCrawler.BASE_URI + '/api.php';

  async crawl(number: string, title: string, volume: number): Promise<Issue> {
    let issue: Issue = new Issue();
    issue.format = 'Heft';
    issue.currency = 'USD';
    issue.number = number;
    issue.releasedate = new Date()
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');

    issue.series = new Series();
    issue.series.title = title;
    issue.series.volume = volume;

    issue.series.publisher = new Publisher();

    issue.cover = new Cover();
    issue.cover.number = 0;
    issue.cover.individuals = [];
    issue.variants = [];
    issue.stories = [];
    issue.individuals = [];
    issue.arcs = [];

    await this.crawlInfobox(issue);
    await MarvelFandomCrawler.crawlSeries(issue);
    await this.fixVariants(issue);
    await this.crawlCovers(issue);
    await this.fixStories(issue);
    MarvelFandomCrawler.fixPublisher(issue);

    await this.finalizeStories(issue);

    return issue;
  }

  private async finalizeStories(issue: Issue) {
    await MarvelFandomCrawler.asyncForEach(
      issue.stories,
      async (story: Story, idx: number) => {
        story.number = idx + 1;

        story.appearances = story.appearances.filter(
          (thing, index, self) =>
            index === self.findIndex(t => t.name === thing.name)
        );

        if (story.reprintOf) {
          await this.crawlReprint(story);
        }
      }
    );
  }

  private async crawlReprint(story: Story) {
    let issue = await this.crawl(
      story.reprintOf.issue.number,
      story.reprintOf.issue.series.title,
      story.reprintOf.issue.series.volume
    );

    let originalStoryIndex: number = story.reprintOf.number;

    if (originalStoryIndex) {
      originalStoryIndex--;
    } else if (story.title) {
      let storyParts: string[] = story.title.split(' ');
      issue.stories.forEach((s, i) => {
        if (!s.title) return;

        let found = 0;
        let originalStoryParts: string[] = s.title.split(' ');

        storyParts.forEach(part => {
          if (originalStoryParts.includes(part)) {
            found++;
          }
        });

        if (found === storyParts.length || found >= 3) {
          originalStoryIndex = i;
          return;
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

  private static fixPublisher(issue: Issue) {
    if (!issue.series.publisher) {
      let publisher = new Publisher();
      publisher.name = 'Marvel Comics';

      issue.series.publisher = publisher;
    }
  }

  private async fixStories<T>(issue: Issue) {
    let stories: Story[] = [];
    let storyIdx = 1;

    //We do have some issues, that are missing stories in between, so we have to create dummies
    issue.stories.forEach(story => {
      while (story.number > storyIdx) {
        let story = new Story();
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

  private async fixVariants(issue: Issue) {
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

      let cover = new Cover();
      cover.number = 0;
      cover.url = v.cover.url;

      let variant = new Issue();
      variant.number = issue.number;
      variant.variant = v.variant ? v.variant : this.getFromAlphabet(i);
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
            ' ' + this.getFromAlphabet(duplicateCount + 1);
          duplicateCount++;
        }
      }

      if (duplicateCount > 0) v.variant += ' ' + this.getFromAlphabet(0);
    });
  }

  private async crawlCovers(issue: Issue) {
    await this.crawlCover(issue.cover, issue);

    await MarvelFandomCrawler.asyncForEach(
      issue.variants,
      async (issue: Issue) => {
        await this.crawlCover(issue.cover, issue);
      }
    );
  }

  private async crawlCover(cover: Cover, issue: Issue) {
    if (!cover) return;

    if (!cover.url || cover.url.trim() === '')
      cover.url = MarvelFandomCrawler.generateIssueUrl(issue) + '.jpg';

    while (cover.url.indexOf('%3A') !== -1)
      cover.url = cover.url.replace('%3A', '');

    try {
      let $ = await request({
        uri:
          MarvelFandomCrawler.API_URI +
          '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
          encodeURI(cover.url),
        transform: (body: any) => JSON.parse(body),
      });

      if (Object.keys($.query.pages)[0] === '-1') {
        $ = await request({
          uri:
            MarvelFandomCrawler.API_URI +
            '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
            decodeURI(cover.url),
          transform: (body: any) => JSON.parse(body),
        });
      }

      if (Object.keys($.query.pages)[0] === '-1') {
        $ = await request({
          uri:
            MarvelFandomCrawler.API_URI +
            '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
            encodeURI(cover.url.replace('.jpg', '.png')),
          transform: (body: any) => JSON.parse(body),
        });
      }

      if (Object.keys($.query.pages)[0] === '-1') {
        $ = await request({
          uri:
            MarvelFandomCrawler.API_URI +
            '?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:' +
            decodeURI(cover.url.replace('.jpg', '.png')),
          transform: (body: any) => JSON.parse(body),
        });
      }

      cover.url = $.query.pages[Object.keys($.query.pages)[0]].imageinfo[0].url;
      cover.url = cover.url.substr(0, cover.url.indexOf('/revision/'));
    } catch (e) {
      cover.url = '';
    }
  }

  private async crawlInfobox(issue: Issue) {
    let $ = await request({
      uri:
        MarvelFandomCrawler.API_URI +
        '?action=parse&format=json&prop=wikitext&page=' +
        MarvelFandomCrawler.generateIssueUrl(issue),
      transform: function(body: any) {
        return JSON.parse(body);
      },
    });

    if (!$.parse) {
      throw new Error(
        '[CRAWLER] ' +
          MarvelFandomCrawler.generateIssueName(issue) +
          ' - Not found'
      );
    }

    $ = $.parse.wikitext['*'].split('\n');

    if ($[0].trim().startsWith('#REDIRECT')) {
      console.log(
        MarvelFandomCrawler.generateIssueName(issue) + ' - ' + $[0].trim()
      );

      let redirect = $[0].trim().replace('#REDIRECT [[', '');
      redirect = redirect.replace(']]', '');

      issue.series.title = redirect.substr(0, redirect.indexOf('Vol')).trim();
      redirect = redirect.substr(redirect.indexOf('Vol') + 3).trim();
      issue.series.volume = Number.parseInt(
        redirect.substr(0, redirect.indexOf(' ')).trim()
      );
      issue.number = redirect.substr(redirect.indexOf(' ')).trim();

      await this.crawlInfobox(issue);
    } else {
      $.forEach((line: string, i: number) => {
        line = line.trim();

        if (line.startsWith('|') && line.indexOf('=') > -1) {
          line
            .split('|')
            .slice(1)
            .forEach(l => this.crawlInfoboxLine(l, i, issue, $));
        }
      });
    }
  }

  private static parseInt(string: string): number {
    return Number.parseInt(string.replace(/\D/g, ''));
  }

  private crawlInfoboxLine(
    line: string,
    indexOfLine: number,
    issue: Issue,
    $: any
  ) {
    let type = line.substr(0, line.indexOf('=')).trim();
    let content = line.substr(line.indexOf('=') + 1).trim();
    let count = MarvelFandomCrawler.extractNumberOfInfoboxLine(type);

    if (type.indexOf('Artist') !== -1) {
      this.extractCover(content, issue);
    } else if (type.startsWith('Image') && content.indexOf('from') === -1) {
      MarvelFandomCrawler.extractVariant(type, content, count, issue);
    } else if (type.startsWith('Month')) {
      let month: number = isNaN(Number.parseInt(content))
        ? 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(content.substr(0, 3)) /
            3 +
          1
        : Number.parseInt(content);

      month = Math.ceil(month);
      month = month < 1 || month > 12 ? 1 : month;
      issue.releasedate =
        issue.releasedate.substr(0, 5) + month + issue.releasedate.substr(7);
    } else if (type.startsWith('Year')) {
      issue.releasedate =
        Number.parseInt(content) + issue.releasedate.substr(4);
    } else if (type.startsWith('Editor-in-Chief')) {
      this.extractEditorInChief(content, issue);
    } else if (type.startsWith('Editor')) {
      this.extractEditor(content, count, issue);
    } else if (type.startsWith('StoryTitle')) {
      MarvelFandomCrawler.extractStory(content, count, issue);
    } else if (type.startsWith('Writer')) {
      this.extractWriter(content, count, issue);
    } else if (type.startsWith('Penciler')) {
      this.extractPenciler(content, count, issue);
    } else if (type.startsWith('Inker')) {
      this.extractInker(content, count, issue);
    } else if (type.startsWith('Letterer')) {
      this.extractLetterer(content, count, issue);
    } else if (type.startsWith('Colorist')) {
      this.extractColourist(content, count, issue);
    } else if (type.startsWith('AdaptedFrom')) {
      this.extractAdaptedFrom(content, count, issue);
    } else if (type.startsWith('ReprintOf')) {
      MarvelFandomCrawler.extractReprint(content, count, type, issue);
    } else if (type.startsWith('Event')) {
      this.addArc(content.trim(), 'EVENT', issue.arcs);
    } else if (type.startsWith('StoryArc')) {
      this.addArc(content.trim(), 'STORYARC', issue.arcs);
    } else if (type.startsWith('StoryLine')) {
      this.addArc(content.trim(), 'STORYLINE', issue.arcs);
    } else if (type.startsWith('OriginalPrice')) {
      issue.price = Number.parseFloat(content.substring(1));
      if (isNaN(issue.price)) {
        issue.price = 0;
      }
    } else if (type.startsWith('Appearing')) {
      this.extractAppearances(count, issue, indexOfLine, $);
    } else {
      //console.log(type + ' (#' + count + '): ' + content);
    }
  }

  private extractAppearances(
    count: number,
    issue: Issue,
    indexOfLine: number,
    $: any
  ) {
    //Sooooometimes (again...) there are no individuals defined, so we have to create the story during the
    //appearing block :(
    count -= 1;
    if (!issue.stories[count])
      MarvelFandomCrawler.createStory(count + 1, issue);

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
          apps.forEach((app: string, i: number) => {
            if (app.indexOf('|') > -1) {
              app = app.substr(0, app.indexOf('|'));

              if (app.indexOf('Character Index') > -1) {
                app = app.substr(app.indexOf('#') + 1);
              }

              if (app.indexOf('-->') === -1) apps[i] = app;
            }
          });
        }

        apps.forEach((app: string) => {
          if (app.indexOf("'''") > -1 || app.indexOf('<!--') > -1) return;
          if (app.indexOf('{') > -1) app = app.substr(0, app.indexOf('{'));

          if (app.indexOf('#') > -1) app = app.substr(app.indexOf('#') + 1);

          if (app.indexOf('<small>') > -1)
            app = app.substr(0, app.indexOf('<'));

          if (app.startsWith('"') && app.endsWith('"'))
            app = app.substr(1, app.length - 1);

          if (app.startsWith("'") && app.endsWith("'"))
            app = app.substr(1, app.length - 1);

          if (app.indexOf('<ref>') !== -1) {
            app = app.substr(0, app.indexOf('<ref>'));
          }

          app = app.trim();
          while (app.startsWith('*')) app = app.replace('*', '');
          app = app.trim();

          this.getAppearances(issue.stories[count], currentType, app, firstApp);
        });
      }

      currentLine = $[currentAppIdx++];
      if (currentLine) currentLine = currentLine.trim();
      else break;
    }
  }

  private static extractReprint(
    content: string,
    count: number,
    type: string,
    issue: Issue
  ) {
    MarvelFandomCrawler.createStory(count, issue);

    if (type.indexOf('Story') > 0) {
      issue.stories[count - 1].reprintOf.number = Number.parseInt(content);
    } else {
      let original: Issue = new Issue();
      original.series = new Series();

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

      MarvelFandomCrawler.createStory(count, issue);

      if (!issue.stories[count - 1].reprintOf) {
        issue.stories[count - 1].reprintOf = new Story();
      }
      issue.stories[count - 1].reprintOf.individuals = [];
      issue.stories[count - 1].reprintOf.appearances = [];
      issue.stories[count - 1].reprintOf.issue = original;
    }
  }

  private extractAdaptedFrom(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    this.addIndividual(
      content,
      'ORIGINAL',
      issue.stories[count - 1].individuals
    );
  }

  private extractColourist(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    this.addIndividual(
      content,
      'COLORIST',
      issue.stories[count - 1].individuals
    );
  }

  private extractLetterer(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    this.addIndividual(
      content,
      'LETTERER',
      issue.stories[count - 1].individuals
    );
  }

  private extractInker(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    this.addIndividual(content, 'INKER', issue.stories[count - 1].individuals);
  }

  private extractPenciler(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    this.addIndividual(
      content,
      'PENCILER',
      issue.stories[count - 1].individuals
    );
  }

  private extractWriter(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf)
      this.addIndividual(
        content,
        'WRITER',
        issue.stories[count - 1].individuals
      );
  }

  private static extractStory(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf) {
      if (content.endsWith('}}')) content = content.replace('}}', '');

      while (content.startsWith('"')) content = content.substring(1);

      while (content.endsWith('"'))
        content = content.substring(0, content.length - 1);

      issue.stories[count - 1].title =
        !content || content.trim() === '' ? 'Untitled' : content;
    }
  }

  private extractCover(content: string, issue: Issue) {
    this.addIndividual(content, 'ARTIST', issue.cover.individuals);
  }

  private extractEditorInChief(content: string, issue: Issue) {
    this.addIndividual(content, 'EDITOR', issue.individuals);
  }

  private extractEditor(content: string, count: number, issue: Issue) {
    MarvelFandomCrawler.createStory(count, issue);
    if (!issue.stories[count - 1].reprintOf)
      this.addIndividual(
        content,
        'EDITOR',
        issue.stories[count - 1].individuals
      );
  }

  private static extractVariant(
    type: string,
    content: string,
    count: number,
    issue: Issue
  ) {
    if (count === 1) {
      return;
    }

    if (
      issue.variants &&
      type.indexOf('Text') === -1 &&
      !content.startsWith('<!--')
    ) {
      this.createCover(count, issue);
      issue.variants[count - 1].cover = new Cover();
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

  private static extractNumberOfInfoboxLine(type: string) {
    if (type.indexOf('_') > -1)
      return MarvelFandomCrawler.parseInt(type.substring(0, type.indexOf('_')));
    else if (type.indexOf(' ') > -1)
      return MarvelFandomCrawler.parseInt(type.substring(0, type.indexOf(' ')));
    else if (type !== 'Image' && type.indexOf('Image') > -1)
      return MarvelFandomCrawler.parseInt(type.replace('Image', ''));
    else {
      let temp = type.replace(/\D/g, '');
      if (temp.trim() === '') return 1;
      else return MarvelFandomCrawler.parseInt(temp);
    }
  }

  private static async crawlSeries(issue: Issue) {
    try {
      let $ = await request({
        uri:
          MarvelFandomCrawler.INDEX_URI +
          '?action=render&title=' +
          MarvelFandomCrawler.generateSeriesUrl(issue.series),
        transform: (body: any) => cheerio.load(body),
      });

      MarvelFandomCrawler.extractPublisher($, issue);
      MarvelFandomCrawler.extractGenre($, issue);
      MarvelFandomCrawler.extractDates($, issue);
    } catch (e) {
      //Nothing
    }
  }

  private static extractDates($: any, issue: Issue) {
    let publicationDate = $("span:contains('Publication Date: ')");
    if (publicationDate.length > 0) {
      let date = $(publicationDate.get(0).parent)
        .text()
        .replace(/[a-zA-Z :,]/g, '');

      if (date.startsWith('—')) {
        issue.series.startyear = Number.parseInt(date.substring(1));
        issue.series.endyear = issue.series.startyear;
      } else {
        issue.series.startyear = Number.parseInt(date.substring(0, 4));

        if (date.substring(5).length === 4)
          issue.series.endyear = Number.parseInt(date.substring(5));
      }
    }
  }

  private static extractGenre($: any, issue: Issue) {
    let genre = $("span:contains('Genre: ')");
    if (genre.length > 0)
      issue.series.genre = $(genre.get(0).nextSibling)
        .text()
        .trim();
  }

  private static extractPublisher($: any, issue: Issue) {
    let publisher = $("span:contains('Publisher: ')");
    if (publisher.length > 0) {
      issue.series.publisher.name = $(publisher.get(0).nextSibling)
        .text()
        .trim();
    } else {
      issue.series.publisher.name = 'Marvel Comics';
    }
    issue.series.publisher.us = 1;
  }

  private getAppearances(
    story: Story,
    currentType: string,
    name: string,
    firstApp: boolean
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

    let app: Appearance = new Appearance();
    app.name = name;
    app.type = currentType.trim();
    app.role = role.trim();
    if (firstApp) app.firstapp = firstApp;

    if (app.name && app.name.indexOf('-->') === -1 && app.name.length > 0)
      this.addAppearance(story.appearances, app);
  }

  private static generateIssueUrl(issue: Issue) {
    return (
      MarvelFandomCrawler.generateSeriesUrl(issue.series) +
      encodeURIComponent('_' + issue.number.trim())
    );
  }

  private static generateSeriesUrl(series: Series) {
    return encodeURIComponent(
      series.title.trim().replace(/\s/g, '_') + '_Vol_' + series.volume
    );
  }

  private static generateIssueName(issue: Issue) {
    return (
      MarvelFandomCrawler.generateSeriesName(issue.series) +
      ' ' +
      issue.number.trim()
    );
  }

  private static generateSeriesName(series: Series) {
    return series.title.trim() + ' Vol ' + series.volume;
  }

  private removeBraces(string: string): string {
    if (string.endsWith(')'))
      return this.removeBraces(
        string.substring(0, string.lastIndexOf('(')).trim()
      );

    return string;
  }

  private static async asyncForEach(array: any, callback: any) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  private static createStory(count: number, issue: Issue) {
    if (!issue.stories[count - 1]) {
      issue.stories[count - 1] = new Story();
      issue.stories[count - 1].individuals = [];
      issue.stories[count - 1].appearances = [];
      issue.stories[count - 1].number = count;
    }
  }

  private static createCover(count: number, issue: Issue) {
    if (issue.variants && !issue.variants[count - 1]) {
      issue.variants[count - 1] = new Issue();
    }
  }

  private addArc(title: string, type: string, arcs: Arc[]) {
    let arc = new Arc();
    arc.title = title;
    arc.type = type;

    if (arc.title.trim() === '') return;

    if (arc.title.indexOf('|') !== -1) {
      arc.title = arc.title.substr(0, arc.title.indexOf('|'));
    }

    arc.title = arc.title.replace('[[', '');
    arc.title = arc.title.replace(']]', '');
    arc.title = arc.title.replace('{{', '');
    arc.title = arc.title.replace('}}', '');

    if (arc.title.endsWith(')')) {
      arc.title = arc.title.substr(0, arc.title.lastIndexOf('('));
    }

    arc.title = arc.title.trim();

    let contains = arcs.find(
      i =>
        i.title.toLowerCase() === arc.title.toLowerCase() && i.type === arc.type
    );

    if (!contains) arcs.push(arc);
  }

  private addAppearance(apps: Appearance[], app: Appearance) {
    if (app.name.trim() === '' || app.name.trim().indexOf('|') === 0) return;

    if (app.name.indexOf('|') !== -1) {
      app.name = app.name.substr(0, app.name.indexOf('|'));
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

  private addIndividual(name: string, type: string, individuals: Individual[]) {
    if (name.indexOf('<!--') > -1) {
      name = name.substr(0, name.indexOf('<!--'));
      name = name.trim();
    }

    if (name.trim() === '') return;

    if (name.indexOf('|') !== -1) {
      name = name.substr(0, name.indexOf('|'));
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
      let i = new Individual();
      i.name = name;
      i.type = type;

      individuals.push(i);
    }
  }

  private alphabet: string[] = [
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

  private getFromAlphabet(idx: number): string {
    let a = '';

    if (idx > 25) {
      idx -= 25;
      return this.alphabet[idx % idx] + this.getFromAlphabet(idx) + a;
    }

    return this.alphabet[idx];
  }
}
