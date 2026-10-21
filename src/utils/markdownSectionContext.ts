import type { SectionDocument } from './markdownSections'
export interface MarkdownSectionContext { path: string; libraryRoot?: string; model: SectionDocument; id: string; owner: unknown; readOnlyReason?:string; heading?:{id:string;text:string;level:number;slug:string} }
