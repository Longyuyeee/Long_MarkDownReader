export interface GraphObjectLocator {
  kind: string
  objectId: string
  page?: number | null
}

export interface GraphNode {
  id: string
  title: string
  path: string
  size: number
  tags: string[]
  directory: string
  modifiedAt: number
  objectType: string
  searchText: string
  contentSignature?: string | null
  parentId?: string | null
  locator?: GraphObjectLocator | null
  locationLabel?: string | null
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export interface RelationMention {
  target: string
  alias?: string | null
  syntax: string
  context: string
  line: number
  relationType: string
}

export interface GraphEdge {
  source: string
  target: string
  relationType: string
  directed: boolean
  mentions: RelationMention[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
