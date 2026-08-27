import registry from '../../shared/graph-semantics.json'

export type GraphNodeShape = 'circle' | 'square' | 'diamond' | 'hexagon'
export type GraphLineStyle = 'solid' | 'dashed' | 'dotted'
export interface GraphObjectSemantic { id: string; order: number; label: string; shortLabel: string; glyph: string; shape: GraphNodeShape; color: { light: string; dark: string } }
export interface GraphRelationSemantic { id: string; order: number; label: string; directed: boolean; line: GraphLineStyle; color: string }

export const graphObjectSemantics = registry.objectTypes as GraphObjectSemantic[]
export const graphRelationSemantics = registry.relationTypes as GraphRelationSemantic[]
const objectById = new Map(graphObjectSemantics.map(item => [item.id, item]))
const relationById = new Map(graphRelationSemantics.map(item => [item.id, item]))
const fallbackObject = { id: 'unknown', order: 999, ...registry.fallback.object } as GraphObjectSemantic
const fallbackRelation = { id: 'unknown', order: 999, ...registry.fallback.relation } as GraphRelationSemantic

export const graphObjectSemantic = (id: string) => objectById.get(id) || { ...fallbackObject, id: id || 'unknown' }
export const graphRelationSemantic = (id: string) => relationById.get(id) || { ...fallbackRelation, id: id || 'unknown' }
export const graphSemanticColor = (id: string, dark: boolean) => {
  const color = graphObjectSemantic(id).color
  return dark ? color.dark : color.light
}
export const graphLineDash = (style: GraphLineStyle, zoom = 1) => style === 'dashed' ? [6 / zoom, 4 / zoom] : style === 'dotted' ? [2 / zoom, 4 / zoom] : []
