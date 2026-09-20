import { CachedMetadata } from 'obsidian';

export const VALID_ELEMENTS = ['List', 'Task', 'Heading', 'Paragraph', 'Blockquote'] as const;
export type ElementType = typeof VALID_ELEMENTS[number];

/** A block of lines found in a single note, before it is tied to a file. */
export interface RawBlock {
    element: ElementType;
    startLine: number;
    endLine: number;
    lines: string[];
    tags: string[];
}

/** Filter and tag helpers injected by the caller to keep extractors free of circular imports. */
export interface ExtractContext {
    fileCache: CachedMetadata;
    lines: string[];
    matches: (text: string, isCompletedTask?: boolean) => boolean;
    tagsOf: (text: string) => string[];
}
