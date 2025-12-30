export interface Publisher {
  id?: number;
  name: string;
  original: boolean;
  addinfo?: string;
}

export interface Series {
  id?: number;
  title: string;
  startyear: number;
  endyear?: number;
  volume: number;
  addinfo?: string;
  fk_publisher?: number;
  publisher?: Publisher;
}

export interface Issue {
  id?: number;
  title: string;
  number: string;
  format: string;
  variant: string;
  releasedate?: Date | string;
  pages?: number;
  price?: number;
  currency?: string;
  fk_series?: number;
  series?: Series;
}
