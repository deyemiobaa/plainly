export type SourceReference = {
  pages: string;
  section?: string;
};

export type Topic = {
  title: string;
  plain_summary: string;
  why_it_matters?: string;
  who_is_affected?: string[];
  key_changes?: string[];
  what_is_not_changing?: string[];
  effective_date?: string | null;
  source_references?: SourceReference[];
};

export type DigestSection = {
  title: string;
  heading: string;
  pages: string;
  startPage: number;
  endPage: number;
  topics: Topic[];
};

export type DocumentDigest = {
  document: {
    slug: string;
    title: string;
    source_file: string;
    processed_at: string;
    model: string;
  };
  sections: DigestSection[];
};

export type Bill = {
  slug: string;
  title: string;
  filename: string;
  file: string;
  date?: string;
  teaser?: string;
  hasDigest: boolean;
  processedAt?: string;
  topicCount?: number;
};
