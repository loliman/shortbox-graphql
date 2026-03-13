import * as cheerio from "cheerio";
import { __testables } from "../src/services/MarvelCrawlerService";

describe("MarvelCrawlerService contained issue caption parsing", () => {
  it("extracts the trailing story title text after the link", () => {
    const $ = cheerio.load(
      `<div class="lightbox-caption"><a href="/wiki/Strange_Tales_Vol_1_110"><span style="font-style:italic">Strange Tales</span> #110</a><br>"The Human Torch Vs. the Wizard and Paste-Pot Pete!"</div>`,
    );

    expect(
      __testables.extractContainedIssueStoryTitleFromCaption(
        $,
        $(".lightbox-caption"),
      ),
    ).toBe("The Human Torch Vs. the Wizard and Paste-Pot Pete!");
  });

  it("keeps multiline captions using the final line as story title", () => {
    const $ = cheerio.load(
      `<div class="lightbox-caption"><a href="/wiki/Strange_Tales_Vol_1_110">Strange Tales #110</a><br>The Human Torch Vs. the Wizard and Paste-Pot Pete!</div>`,
    );

    expect(
      __testables.extractContainedIssueStoryTitleFromCaption(
        $,
        $(".lightbox-caption"),
      ),
    ).toBe("The Human Torch Vs. the Wizard and Paste-Pot Pete!");
  });
});
