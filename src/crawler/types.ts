export interface CrawlerIndividual {
  name: string;
  type: string;
}

export interface CrawlerAppearance {
  name: string;
  type: string;
  role?: string;
  firstapp?: boolean;
}

export interface CrawlerArc {
  title: string;
  type: string;
}

export interface CrawlerStory {
  number?: number;
  title: string;
  addinfo?: string;
  onlyapp?: boolean;
  firstapp?: boolean;
  onlytb?: boolean;
  otheronlytb?: boolean;
  onlyoneprint?: boolean;
  collected?: boolean;
  part?: string;
  reprintOf?: any; // To avoid circular dependency issues for now
  individuals: CrawlerIndividual[];
  appearances: CrawlerAppearance[];
}

export interface CrawlerCover {
  number: number;
  url?: string;
  addinfo?: string;
  individuals: CrawlerIndividual[];
}

export interface CrawlerIssue {
  format: string;
  currency: string;
  number: string;
  releasedate: string;
  title?: string;
  pages?: number;
  price?: number;
  isbn?: string;
  limitation?: string;
  addinfo?: string;
  series: {
    title: string;
    volume: number;
    publisher: {
      name?: string;
      original?: boolean;
    };
  };
  variant?: string;
  cover: CrawlerCover;
  variants: any[];
  stories: CrawlerStory[];
  individuals: CrawlerIndividual[];
  arcs: CrawlerArc[];
}
