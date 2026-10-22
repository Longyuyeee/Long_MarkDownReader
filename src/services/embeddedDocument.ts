import type { InjectionKey } from 'vue'

// A document mounted inside the library already has the library's tab strip.
export const embeddedDocumentKey: InjectionKey<boolean> = Symbol('embedded-document')
